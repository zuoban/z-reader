package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
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
	maxEPUBMetadataBytes          = 2 * 1024 * 1024
	maxEPUBCoverBytes             = 10 * 1024 * 1024
	maxCoverUploadBytes           = 10 * 1024 * 1024
	maxEPUBArchiveEntries         = 10000
	maxEPUBExpandedBytes    int64 = 512 * 1024 * 1024
	multipartOverhead             = 1 * 1024 * 1024
	bookFileCacheMaxAge           = 60 * 60
	bookCoverCacheMaxAge          = 24 * 60 * 60
	coverThumbnailMaxWidth        = 320
	coverThumbnailMaxPixels       = 40 * 1024 * 1024
	maxBookTitleRunes             = 500
	maxBookAuthorRunes            = 500
	maxBatchBookIDs               = 500
	maxBookSearchQueryRunes       = 200
)

type BooksHandler struct {
	cfg          *config.Config
	db           *storage.DB
	processor    *bookProcessor
	legacyHashes *legacyHashBackfill
}

type bookCursorPageResponse struct {
	Books      []models.Book `json:"books"`
	NextCursor string        `json:"next_cursor,omitempty"`
}

func NewBooksHandler(cfg *config.Config, db *storage.DB) *BooksHandler {
	handler := &BooksHandler{cfg: cfg, db: db}
	handler.legacyHashes = newLegacyHashBackfill(handler)
	handler.processor = newBookProcessor(handler)
	return handler
}

func (h *BooksHandler) List(c *gin.Context) {
	_, hasCursor := c.GetQuery("cursor")
	limitValue, hasLimit := c.GetQuery("limit")
	sortValue, hasSort := c.GetQuery("sort")
	category := requestedBookCategory(c)
	if hasCursor || hasLimit || hasSort || category != nil {
		limit := 20
		if hasLimit {
			parsed, err := strconv.Atoi(limitValue)
			if err != nil || parsed <= 0 {
				response.BadRequest(c, "limit 必须是正整数")
				return
			}
			limit = parsed
		}
		if limit > 100 {
			limit = 100
		}

		books, nextCursor, err := h.db.ListBooksBySortedCursor(storage.PersonalLibrary, c.Query("cursor"), limit, sortValue, category)
		if err != nil {
			response.InternalError(c, "获取书籍列表失败")
			return
		}
		for i := range books {
			books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
		}
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

	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}

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
	if len([]rune(query)) > maxBookSearchQueryRunes {
		response.BadRequest(c, "搜索关键词过长")
		return
	}

	limit := 20
	if value, ok := c.GetQuery("limit"); ok {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			response.BadRequest(c, "limit 必须是正整数")
			return
		}
		limit = parsed
	}
	if limit > 100 {
		limit = 100
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
	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}
	c.JSON(http.StatusOK, bookCursorPageResponse{Books: books, NextCursor: nextCursor})
}

func (h *BooksHandler) Get(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBookForUser(id, storage.PersonalLibrary)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}

	book.Format = normalizeBookFormat(book.Format, book.Filename)
	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Update(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBookForUser(id, storage.PersonalLibrary)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}

	var req bookUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请求内容无效")
		return
	}

	if req.Title.Set && req.Title.Value != nil {
		title := strings.TrimSpace(*req.Title.Value)
		if len([]rune(title)) > maxBookTitleRunes {
			response.BadRequest(c, "书名不能超过 500 个字符")
			return
		}
		req.Title.Value = &title
	}
	if req.Author.Set && req.Author.Value != nil {
		author := strings.TrimSpace(*req.Author.Value)
		if len([]rune(author)) > maxBookAuthorRunes {
			response.BadRequest(c, "作者不能超过 500 个字符")
			return
		}
		req.Author.Value = &author
	}
	if req.Category.Set {
		category := normalizeBookCategory(req.Category.Value)
		if category != nil && len([]rune(*category)) > 50 {
			response.BadRequest(c, "分类不能超过 50 个字符")
			return
		}
		req.Category.Value = category
	}

	book, err = h.db.UpdateBook(id, storage.PersonalLibrary, func(book *models.Book) bool {
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
	if err == storage.ErrNotFound {
		response.NotFound(c, "书籍不存在")
		return
	}
	if err != nil {
		response.InternalError(c, "保存书籍失败")
		return
	}
	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Delete(c *gin.Context) {
	book, err := h.db.DeleteBook(c.Param("id"), storage.PersonalLibrary)
	if err == storage.ErrNotFound {
		response.NotFound(c, "书籍不存在")
		return
	}
	if err != nil {
		response.InternalError(c, "删除书籍失败")
		return
	}

	h.removeUploadFiles(book.Filename, book.CoverPath, book.CoverThumbPath)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *BooksHandler) BatchDelete(c *gin.Context) {
	var req batchBookIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请求内容无效")
		return
	}
	req.IDs = normalizeBookIDs(req.IDs)
	if len(req.IDs) == 0 {
		response.BadRequest(c, "请选择要删除的图书")
		return
	}
	if len(req.IDs) > maxBatchBookIDs {
		response.BadRequest(c, "单次最多操作 500 本图书")
		return
	}

	deletedBooks, err := h.db.DeleteBooksData(req.IDs, storage.PersonalLibrary)
	if err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "部分图书不存在")
			return
		}
		response.InternalError(c, "删除图书失败")
		return
	}

	deletedIDs := make([]string, 0, len(deletedBooks))
	for _, book := range deletedBooks {
		h.removeUploadFiles(book.Filename, book.CoverPath, book.CoverThumbPath)
		deletedIDs = append(deletedIDs, book.ID)
	}

	c.JSON(http.StatusOK, gin.H{"deleted_ids": deletedIDs})
}

func (h *BooksHandler) GetFile(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBookForUser(id, storage.PersonalLibrary)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	filePath, err := resolveUploadPath(h.cfg.UploadDir, book.Filename)
	if err != nil {
		response.Forbidden(c, "文件访问被拒绝")
		return
	}
	setPrivateCache(c, bookFileCacheMaxAge)
	if book.ContentHash != "" && writeNotModifiedIfETagMatches(c, book.ContentHash) {
		return
	}
	c.Header("Accept-Ranges", "bytes")
	c.File(filePath)
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

func (h *BooksHandler) removeUploadFiles(names ...string) {
	for _, name := range names {
		if path, err := resolveUploadPath(h.cfg.UploadDir, name); err == nil {
			removeFileIfExists(path)
		}
	}
}

func removeFileIfExists(path string) {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		logger.Warn("Failed to remove file during cleanup",
			slog.String("path", path),
			slog.Any("error", err),
		)
	}
}

func limitUploadBody(c *gin.Context, maxBytes int64) {
	if maxBytes <= 0 || c.Request == nil || c.Request.Body == nil {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes+multipartOverhead)
}

func isRequestBodyTooLarge(err error) bool {
	return err != nil && strings.Contains(err.Error(), "request body too large")
}

func setPrivateCache(c *gin.Context, maxAgeSeconds int) {
	c.Header("Cache-Control", fmt.Sprintf("private, max-age=%d", maxAgeSeconds))
}

func writeNotModifiedIfETagMatches(c *gin.Context, rawETag string) bool {
	etag := `"` + rawETag + `"`
	c.Header("ETag", etag)
	if c.GetHeader("If-None-Match") != etag {
		return false
	}
	c.Status(http.StatusNotModified)
	c.Writer.WriteHeaderNow()
	return true
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func resolveUploadPath(uploadDir string, name string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("empty upload path")
	}

	uploadDirAbs, err := filepath.Abs(uploadDir)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.Abs(filepath.Join(uploadDirAbs, name))
	if err != nil {
		return "", err
	}

	rel, err := filepath.Rel(uploadDirAbs, resolved)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("upload path escapes base directory")
	}
	return resolved, nil
}
