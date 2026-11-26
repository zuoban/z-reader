package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/internal/singleflight"
	"z-reader/backend/logger"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

var supportedBookFormats = map[string]string{
	".epub": "epub",
	".mobi": "mobi",
	".azw3": "azw3",
	".pdf":  "pdf",
}

const (
	maxEPUBMetadataBytes           = 2 * 1024 * 1024
	maxEPUBCoverBytes              = 10 * 1024 * 1024
	maxCoverUploadBytes            = 10 * 1024 * 1024
	maxEPUBArchiveEntries          = 10000
	maxEPUBExpandedBytes     int64 = 512 * 1024 * 1024
	multipartOverhead              = 1 * 1024 * 1024
	bookFileCacheMaxAge            = 60 * 60
	bookCoverCacheMaxAge           = 24 * 60 * 60
	coverThumbnailMaxWidth         = 320
	coverThumbnailMaxPixels        = 40 * 1024 * 1024
	coverCacheMaxConcurrency       = 4
	maxBookTitleRunes              = 500
	maxBookAuthorRunes             = 500
	maxBatchBookIDs                = 500
	maxBookSearchQueryRunes        = 200
)

type BooksHandler struct {
	cfg                  *config.Config
	db                   *storage.DB
	processor            *bookProcessor
	legacyHashes         *legacyHashBackfill
	coverThumbFlights    singleflight.Group[*models.Book]
	coverExtractFlights  singleflight.Group[extractedCoverResult]
	coverCacheMu         sync.Mutex
	coverCacheClosed     bool
	coverCacheSem        chan struct{}
	coverCacheStop       chan struct{}
	coverCacheDone       chan struct{}
	coverCacheWG         sync.WaitGroup
	extractBookPreviewFn func(*os.File, string) (*epubMetadata, []byte, string, error)
}

type bookCursorPageResponse struct {
	Books      []models.Book `json:"books"`
	NextCursor string        `json:"next_cursor,omitempty"`
}

func NewBooksHandler(cfg *config.Config, db *storage.DB) *BooksHandler {
	handler := &BooksHandler{
		cfg:            cfg,
		db:             db,
		coverCacheSem:  make(chan struct{}, coverCacheMaxConcurrency),
		coverCacheStop: make(chan struct{}),
	}
	handler.legacyHashes = newLegacyHashBackfill(handler)
	handler.processor = newBookProcessor(handler)
	return handler
}

func (h *BooksHandler) List(c *gin.Context) {
	_, hasCursor := c.GetQuery("cursor")
	_, hasLimit := c.GetQuery("limit")
	sortValue, hasSort := c.GetQuery("sort")
	category := requestedBookCategory(c)
	if hasCursor || hasLimit || hasSort || category != nil {
		limit, ok := parseBookPageLimit(c)
		if !ok {
			return
		}

		books, nextCursor, err := h.db.ListBooksBySortedCursor(storage.PersonalLibrary, c.Query("cursor"), limit, sortValue, category)
		if err != nil {
			response.InternalError(c, "获取书籍列表失败")
			return
		}
		normalizeBookFormats(books)
		c.JSON(http.StatusOK, bookCursorPageResponse{Books: books, NextCursor: nextCursor})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "0"))

	if page < 0 {
		page = 0
	}
	if pageSize < 0 {
		pageSize = 0
	}
	if pageSize > 100 {
		pageSize = 100
	}

	if page > 0 && pageSize == 0 {
		pageSize = 20
	}

	books, err := h.db.ListBooksPaginated(storage.PersonalLibrary, page, pageSize)
	if err != nil {
		response.InternalError(c, "获取书籍列表失败")
		return
	}

	normalizeBookFormats(books)

	c.JSON(http.StatusOK, books)
}

func (h *BooksHandler) Summary(c *gin.Context) {
	summary, err := h.db.GetBookLibrarySummary(storage.PersonalLibrary)
	if err != nil {
		response.InternalError(c, "获取书架汇总失败")
		return
	}

	c.JSON(http.StatusOK, summary)
}

func (h *BooksHandler) Search(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		response.BadRequest(c, "搜索关键词不能为空")
		return
	}
	if utf8.RuneCountInString(query) > maxBookSearchQueryRunes {
		response.BadRequest(c, "搜索关键词过长")
		return
	}

	limit, ok := parseBookPageLimit(c)
	if !ok {
		return
	}

	books, nextCursor, err := h.db.SearchBooks(
		storage.PersonalLibrary,
		query,
		c.Query("cursor"),
		limit,
		c.Query("sort"),
		requestedBookCategory(c),
	)
	if err != nil {
		response.InternalError(c, "搜索图书失败")
		return
	}
	normalizeBookFormats(books)
	c.JSON(http.StatusOK, bookCursorPageResponse{Books: books, NextCursor: nextCursor})
}

func (h *BooksHandler) Get(c *gin.Context) {
	book, ok := h.loadBook(c, c.Param("id"))
	if !ok {
		return
	}

	book.Format = normalizeBookFormat(book.Format, book.Filename)
	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var req bookUpdateRequest
	if !bindJSON(c, &req, "请求内容无效") {
		return
	}

	if req.Title.Set && req.Title.Value != nil {
		title := strings.TrimSpace(*req.Title.Value)
		if utf8.RuneCountInString(title) > maxBookTitleRunes {
			response.BadRequest(c, "书名不能超过 500 个字符")
			return
		}
		req.Title.Value = &title
	}
	if req.Author.Set && req.Author.Value != nil {
		author := strings.TrimSpace(*req.Author.Value)
		if utf8.RuneCountInString(author) > maxBookAuthorRunes {
			response.BadRequest(c, "作者不能超过 500 个字符")
			return
		}
		req.Author.Value = &author
	}
	if req.Category.Set {
		category := normalizeBookCategory(req.Category.Value)
		if category != nil && utf8.RuneCountInString(*category) > 50 {
			response.BadRequest(c, "分类不能超过 50 个字符")
			return
		}
		req.Category.Value = category
	}

	book, err := h.db.UpdateBook(id, storage.PersonalLibrary, func(book *models.Book) bool {
		pending := book.ProcessingState == models.BookProcessingPending
		if req.Title.Value != nil {
			book.Title = *req.Title.Value
			book.PendingTitleEdited = pending
		}
		if req.Author.Value != nil {
			book.Author = *req.Author.Value
			book.PendingAuthorEdited = pending
		}
		if req.Category.Set {
			book.Category = req.Category.Value
		}
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if respondStorageError(c, err, "书籍不存在", "保存书籍失败") {
		return
	}
	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Delete(c *gin.Context) {
	book, err := h.db.DeleteBook(c.Param("id"), storage.PersonalLibrary)
	if respondStorageError(c, err, "书籍不存在", "删除书籍失败") {
		return
	}

	h.removePublishedUploadFiles(book.Filename, book.CoverPath, book.CoverThumbPath)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *BooksHandler) BatchDelete(c *gin.Context) {
	var req batchBookIDsRequest
	if !bindJSON(c, &req, "请求内容无效") {
		return
	}
	ids, ok := validateBatchBookIDs(c, req.IDs, "请选择要删除的图书")
	if !ok {
		return
	}

	deletedBooks, err := h.db.DeleteBooksData(ids, storage.PersonalLibrary)
	if respondStorageError(c, err, "部分图书不存在", "删除图书失败") {
		return
	}

	deletedIDs := make([]string, 0, len(deletedBooks))
	for _, book := range deletedBooks {
		h.removePublishedUploadFiles(book.Filename, book.CoverPath, book.CoverThumbPath)
		deletedIDs = append(deletedIDs, book.ID)
	}

	c.JSON(http.StatusOK, gin.H{"deleted_ids": deletedIDs})
}

func (h *BooksHandler) GetFile(c *gin.Context) {
	book, ok := h.loadBook(c, c.Param("id"))
	if !ok {
		return
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	file, info, err := openUploadFile(h.cfg.UploadDir, book.Filename)
	if os.IsNotExist(err) {
		response.NotFound(c, "文件不存在")
		return
	}
	if err != nil {
		response.Forbidden(c, "文件访问被拒绝")
		return
	}
	defer file.Close()
	h.setBookCache(c, bookFileCacheMaxAge)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("Content-Type", bookFormatContentType(book.Format))
	c.Header("Accept-Ranges", "bytes")
	serveContentWithETag(c, info.Name(), info.ModTime(), book.ContentHash, file)
}

func bookFormatContentType(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "epub":
		return "application/epub+zip"
	case "pdf":
		return "application/pdf"
	case "mobi":
		return "application/x-mobipocket-ebook"
	case "azw3":
		return "application/vnd.amazon.ebook"
	default:
		return "application/octet-stream"
	}
}

type optionalString struct {
	Set   bool
	Value *string
}

func (o *optionalString) UnmarshalJSON(data []byte) error {
	o.Set = true

	if string(data) == "null" {
		o.Value = nil
		return nil
	}

	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}

	o.Value = &value
	return nil
}

type bookUpdateRequest struct {
	Title    optionalString `json:"title"`
	Author   optionalString `json:"author"`
	Category optionalString `json:"category"`
}

type batchBookIDsRequest struct {
	IDs []string `json:"ids"`
}

type batchBookCategoryRequest struct {
	IDs      []string       `json:"ids"`
	Category optionalString `json:"category"`
}

func parseBookPageLimit(c *gin.Context) (int, bool) {
	limit := 20
	if value, ok := c.GetQuery("limit"); ok {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			response.BadRequest(c, "limit 必须是正整数")
			return 0, false
		}
		limit = parsed
	}
	return min(limit, 100), true
}

func validateBatchBookIDs(c *gin.Context, rawIDs []string, emptyMessage string) ([]string, bool) {
	ids := normalizeBookIDs(rawIDs)
	if len(ids) == 0 {
		response.BadRequest(c, emptyMessage)
		return nil, false
	}
	if len(ids) > maxBatchBookIDs {
		response.BadRequest(c, "单次最多操作 500 本图书")
		return nil, false
	}
	return ids, true
}

func respondStorageError(c *gin.Context, err error, notFoundMsg, internalMsg string) bool {
	if err == nil {
		return false
	}
	if err == storage.ErrNotFound {
		response.NotFound(c, notFoundMsg)
	} else {
		response.InternalError(c, internalMsg)
	}
	return true
}

func (h *BooksHandler) loadBook(c *gin.Context, id string) (*models.Book, bool) {
	book, err := h.db.GetBookForUser(id, storage.PersonalLibrary)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return nil, false
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return nil, false
	}
	return book, true
}

func normalizeBookFormats(books []models.Book) {
	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}
}

func normalizeBookIDs(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	normalized := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}
	return normalized
}

func normalizeBookFormat(format string, filename string) string {
	if format != "" {
		return format
	}
	return supportedBookFormats[strings.ToLower(filepath.Ext(filename))]
}

func (h *BooksHandler) removePublishedUploadFiles(names ...string) {
	h.db.CleanupUnreferencedUploads(func() { h.removeUploadFiles(names...) })
}

func (h *BooksHandler) removeUploadFiles(names ...string) {
	root, err := os.OpenRoot(h.cfg.UploadDir)
	if err != nil {
		logger.Warn("Failed to open upload directory during cleanup", slog.Any("error", err))
		return
	}
	defer root.Close()
	for _, name := range names {
		if validUploadName(name) {
			if err := root.Remove(filepath.Clean(name)); err != nil && !os.IsNotExist(err) {
				logger.Warn("Failed to remove upload during cleanup", slog.Any("error", err))
			}
		}
	}
}

func limitUploadBody(c *gin.Context, maxBytes int64) {
	if maxBytes <= 0 || c.Request == nil || c.Request.Body == nil {
		return
	}
	limit := min(maxBytes, math.MaxInt64-multipartOverhead) + multipartOverhead
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
}

func isRequestBodyTooLarge(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}

func bindRequest(c *gin.Context, binder func() error, invalidMsg string) bool {
	if err := binder(); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return false
		}
		response.BadRequest(c, invalidMsg)
		return false
	}
	return true
}

func bindJSON(c *gin.Context, dst any, invalidMsg string) bool {
	return bindRequest(c, func() error { return c.ShouldBindJSON(dst) }, invalidMsg)
}

func (h *BooksHandler) setBookCache(c *gin.Context, maxAgeSeconds int) {
	if h.cfg.AccessPassword != "" {
		c.Header("Cache-Control", "private, no-cache")
		return
	}
	c.Header("Cache-Control", fmt.Sprintf("private, max-age=%d", maxAgeSeconds))
}

func serveContentWithETag(c *gin.Context, name string, modTime time.Time, rawETag string, content io.ReadSeeker) {
	if rawETag != "" {
		c.Header("ETag", `"`+rawETag+`"`)
	}
	req := c.Request
	if req != nil {
		if values := req.Header.Values("If-None-Match"); len(values) > 1 {
			cloned := req.Clone(req.Context())
			cloned.Header.Set("If-None-Match", strings.Join(values, ", "))
			req = cloned
		}
	}
	http.ServeContent(c.Writer, req, name, modTime, content)
	if c.Writer.Status() == http.StatusNotModified {
		c.Writer.WriteHeaderNow()
	}
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func validUploadName(name string) bool {
	return strings.TrimSpace(name) != "" && filepath.IsLocal(name) && filepath.Clean(name) != "."
}

func openUploadFile(uploadDir, name string) (*os.File, os.FileInfo, error) {
	if !validUploadName(name) {
		return nil, nil, fmt.Errorf("invalid upload path")
	}
	root, err := os.OpenRoot(uploadDir)
	if err != nil {
		return nil, nil, err
	}
	defer root.Close()
	name = filepath.Clean(name)
	info, err := root.Lstat(name)
	if err != nil {
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, nil, fmt.Errorf("upload is not a regular file")
	}
	file, err := root.Open(name)
	if err != nil {
		return nil, nil, err
	}
	current, err := file.Stat()
	if err != nil || !os.SameFile(info, current) {
		file.Close()
		return nil, nil, fmt.Errorf("upload changed while opening file")
	}
	return file, current, nil
}
