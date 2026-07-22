package handlers

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

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
	cfg *config.Config
	db  *storage.DB
}

type bookCursorPageResponse struct {
	Books      []models.Book `json:"books"`
	NextCursor string        `json:"next_cursor,omitempty"`
}

func NewBooksHandler(cfg *config.Config, db *storage.DB) *BooksHandler {
	return &BooksHandler{cfg: cfg, db: db}
}

func (h *BooksHandler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	_, hasCursor := c.GetQuery("cursor")
	limitValue, hasLimit := c.GetQuery("limit")
	sortValue, hasSort := c.GetQuery("sort")
	if hasCursor || hasLimit || hasSort {
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

		books, nextCursor, err := h.db.ListBooksBySortedCursor(userID, c.Query("cursor"), limit, sortValue)
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

	books, err := h.db.ListBooksPaginated(userID, page, pageSize)
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
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	summary, err := h.db.GetBookLibrarySummary(userID)
	if err != nil {
		response.InternalError(c, "获取书架汇总失败")
		return
	}

	c.JSON(http.StatusOK, summary)
}

func (h *BooksHandler) Search(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

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
		userID,
		query,
		c.Query("cursor"),
		limit,
		c.Query("sort"),
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
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
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

func (h *BooksHandler) Upload(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	limitUploadBody(c, h.cfg.MaxUploadBytes)
	file, err := c.FormFile("file")
	if err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "文件超过上传大小限制"})
			return
		}
		response.BadRequest(c, "请选择文件")
		return
	}

	if file.Size <= 0 {
		response.BadRequest(c, "文件为空")
		return
	}
	if h.cfg.MaxUploadBytes > 0 && file.Size > h.cfg.MaxUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "文件超过上传大小限制"})
		return
	}

	maxExpandedBytes := maxEPUBExpansionLimit(h.cfg.MaxUploadBytes)
	format, ext, ok := inferUploadedBookFormat(file, maxExpandedBytes)
	if !ok {
		response.BadRequest(c, "支持的格式：EPUB、MOBI、AZW3、PDF")
		return
	}
	if err := validateUploadedBook(file, format, maxExpandedBytes); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	bookID := uuid.New().String()
	filename := bookID + ext
	filepath := filepath.Join(h.cfg.UploadDir, filename)

	if err := saveUploadedBookFile(file, format, filepath, maxExpandedBytes); err != nil {
		response.InternalError(c, "保存文件失败")
		return
	}

	contentHash, err := hashFile(filepath)
	if err != nil {
		removeFileIfExists(filepath)
		response.InternalError(c, "读取上传文件失败")
		return
	}
	existing, err := h.findDuplicateBook(userID, contentHash)
	if err != nil {
		removeFileIfExists(filepath)
		response.InternalError(c, "检查重复图书失败")
		return
	}
	if existing != nil {
		removeFileIfExists(filepath)
		respondDuplicateBook(c, existing)
		return
	}

	book := &models.Book{
		ID:          bookID,
		UserID:      userID,
		Filename:    filename,
		Format:      format,
		Size:        file.Size,
		ContentHash: contentHash,
		CreatedAt:   time.Now(),
	}

	var coverData []byte
	var coverContentType string
	meta, extractedCover, extractedCoverContentType, err := extractBookPreview(filepath, format)
	if err == nil {
		book.Title = meta.Title
		book.Author = meta.Author
		coverData = extractedCover
		coverContentType = extractedCoverContentType
	} else {
		logger.Warn("Failed to extract book metadata",
			slog.String("path", filepath),
			slog.String("format", format),
			slog.Any("error", err),
		)
	}

	if book.Title == "" {
		book.Title = strings.TrimSuffix(file.Filename, ext)
	}
	if len(coverData) > 0 {
		coverFilename, coverErr := h.writeExtractedCover(book.ID, coverData, coverContentType)
		if coverErr != nil {
			logger.Warn("Failed to cache EPUB cover during upload",
				slog.String("book_id", book.ID),
				slog.Any("error", coverErr),
			)
		} else {
			book.CoverPath = coverFilename
			h.attachCoverThumbnail(book)
		}
	}

	if err := h.db.CreateBook(book); err != nil {
		os.Remove(filepath)
		if book.CoverPath != "" {
			if coverPath, pathErr := resolveUploadPath(h.cfg.UploadDir, book.CoverPath); pathErr == nil {
				removeFileIfExists(coverPath)
			}
		}
		if book.CoverThumbPath != "" {
			if thumbnailPath, pathErr := resolveUploadPath(h.cfg.UploadDir, book.CoverThumbPath); pathErr == nil {
				removeFileIfExists(thumbnailPath)
			}
		}
		if err == storage.ErrDuplicateBookContent {
			existing, findErr := h.findDuplicateBook(userID, contentHash)
			if findErr == nil && existing != nil {
				respondDuplicateBook(c, existing)
				return
			}
			response.Conflict(c, "这本书已在书架中，请勿重复上传")
			return
		}
		response.InternalError(c, "保存书籍失败")
		return
	}

	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}

	if err := h.db.DeleteBookData(id, userID); err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "书籍不存在")
			return
		}
		response.InternalError(c, "删除书籍失败")
		return
	}

	if path, err := resolveUploadPath(h.cfg.UploadDir, book.Filename); err == nil {
		removeFileIfExists(path)
	}
	if book.CoverPath != "" {
		if path, err := resolveUploadPath(h.cfg.UploadDir, book.CoverPath); err == nil {
			removeFileIfExists(path)
		}
	}
	if book.CoverThumbPath != "" {
		if path, err := resolveUploadPath(h.cfg.UploadDir, book.CoverThumbPath); err == nil {
			removeFileIfExists(path)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *BooksHandler) BatchDelete(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

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

	deletedBooks, err := h.db.DeleteBooksData(req.IDs, userID)
	if err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "部分图书不存在")
			return
		}
		response.InternalError(c, "删除图书失败")
		return
	}

	for _, book := range deletedBooks {
		if path, err := resolveUploadPath(h.cfg.UploadDir, book.Filename); err == nil {
			removeFileIfExists(path)
		}
		if book.CoverPath != "" {
			if path, err := resolveUploadPath(h.cfg.UploadDir, book.CoverPath); err == nil {
				removeFileIfExists(path)
			}
		}
		if book.CoverThumbPath != "" {
			if path, err := resolveUploadPath(h.cfg.UploadDir, book.CoverThumbPath); err == nil {
				removeFileIfExists(path)
			}
		}
	}

	deletedIDs := make([]string, 0, len(deletedBooks))
	for _, book := range deletedBooks {
		deletedIDs = append(deletedIDs, book.ID)
	}

	c.JSON(http.StatusOK, gin.H{"deleted_ids": deletedIDs})
}

func (h *BooksHandler) GetFile(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
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
	c.File(filePath)
}

type epubMetadata struct {
	Title  string `xml:"title"`
	Author string `xml:"creator"`
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

func normalizeBookCategory(value *string) *string {
	if value == nil {
		return nil
	}

	category := strings.TrimSpace(*value)
	if category == "" {
		return nil
	}
	return &category
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

func inferUploadedBookFormat(file *multipart.FileHeader, maxExpandedBytes int64) (string, string, bool) {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if format, ok := supportedBookFormats[ext]; ok {
		return format, ext, true
	}

	if format, ext, ok := inferBookFormatFromContentType(file.Header.Get("Content-Type")); ok {
		return format, ext, true
	}

	header, err := readUploadedFileHeader(file, 512)
	if err != nil {
		return "", "", false
	}
	if bytes.HasPrefix(header, []byte("%PDF-")) {
		return "pdf", ".pdf", true
	}
	if hasMobiSignature(header) {
		return "mobi", ".mobi", true
	}
	if isValidEPUBFile(file, maxExpandedBytes) {
		return "epub", ".epub", true
	}

	return "", "", false
}

func inferBookFormatFromContentType(contentType string) (string, string, bool) {
	switch strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0])) {
	case "application/epub+zip":
		return "epub", ".epub", true
	case "application/pdf":
		return "pdf", ".pdf", true
	case "application/x-mobipocket-ebook":
		return "mobi", ".mobi", true
	default:
		return "", "", false
	}
}

func validateUploadedBook(file *multipart.FileHeader, format string, maxExpandedBytes int64) error {
	header, err := readUploadedFileHeader(file, 512)
	if err != nil {
		return fmt.Errorf("读取上传文件失败")
	}

	switch format {
	case "pdf":
		if !bytes.HasPrefix(header, []byte("%PDF-")) {
			return fmt.Errorf("上传文件与 PDF 格式不匹配")
		}
	case "epub":
		if err := validateEPUBFile(file, maxExpandedBytes); err != nil {
			return err
		}
	case "mobi", "azw3":
		if !hasMobiSignature(header) {
			return fmt.Errorf("上传文件与 %s 格式不匹配", strings.ToUpper(format))
		}
	}

	return nil
}

func validateUploadedCover(file *multipart.FileHeader, ext string) error {
	header, err := readUploadedFileHeader(file, 512)
	if err != nil {
		return fmt.Errorf("读取上传文件失败")
	}

	contentType := http.DetectContentType(header)
	switch ext {
	case ".jpg", ".jpeg":
		if contentType != "image/jpeg" {
			return fmt.Errorf("上传封面与 JPEG 格式不匹配")
		}
	case ".png":
		if contentType != "image/png" {
			return fmt.Errorf("上传封面与 PNG 格式不匹配")
		}
	case ".webp":
		if contentType != "image/webp" {
			return fmt.Errorf("上传封面与 WEBP 格式不匹配")
		}
	}

	return nil
}

func readUploadedFileHeader(file *multipart.FileHeader, maxBytes int) ([]byte, error) {
	src, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()

	buf := make([]byte, maxBytes)
	n, err := src.Read(buf)
	if err != nil && err != io.EOF {
		return nil, err
	}

	return buf[:n], nil
}

func hashUploadedFile(file *multipart.FileHeader) (string, error) {
	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, src); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func hashFile(path string) (string, error) {
	src, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer src.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, src); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func saveUploadedBookFile(file *multipart.FileHeader, format string, path string, maxExpandedBytes int64) error {
	if format == "epub" {
		if ok, err := saveNormalizedEPUBFile(file, path, maxExpandedBytes); ok || err != nil {
			return err
		}
	}

	src, err := file.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.Create(path)
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

func saveNormalizedEPUBFile(file *multipart.FileHeader, path string, maxExpandedBytes int64) (bool, error) {
	src, err := file.Open()
	if err != nil {
		return false, err
	}
	defer src.Close()

	reader, err := zip.NewReader(src, file.Size)
	if err != nil {
		return false, nil
	}

	root, ok := epubPackageRoot(reader)
	if !ok {
		return false, nil
	}
	if err := validateEPUBArchive(reader, maxExpandedBytes); err != nil {
		return true, err
	}

	if err := writeNormalizedEPUBZip(reader, root, path, maxExpandedBytes); err != nil {
		removeFileIfExists(path)
		return true, err
	}

	return true, nil
}

func normalizeStoredEPUBFile(path string) (bool, error) {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return false, nil
	}
	defer reader.Close()

	root, ok := epubPackageRoot(&reader.Reader)
	if !ok {
		return false, nil
	}
	if err := validateEPUBArchive(&reader.Reader, maxEPUBExpandedBytes); err != nil {
		return false, err
	}

	tmpPath := path + ".normalized"
	if err := writeNormalizedEPUBZip(&reader.Reader, root, tmpPath, maxEPUBExpandedBytes); err != nil {
		removeFileIfExists(tmpPath)
		return false, err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		removeFileIfExists(tmpPath)
		return false, err
	}

	return true, nil
}

func writeNormalizedEPUBZip(reader *zip.Reader, root string, path string, maxExpandedBytes int64) error {
	dst, err := os.Create(path)
	if err != nil {
		return err
	}
	defer dst.Close()

	writer := zip.NewWriter(dst)
	var copiedBytes int64
	for _, entry := range reader.File {
		normalizedName, ok := stripEPUBPackageRoot(entry.Name, root)
		if !ok || normalizedName == "" || strings.HasSuffix(normalizedName, "/") {
			continue
		}
		if strings.HasPrefix(normalizedName, "../") || strings.Contains(normalizedName, "/../") {
			continue
		}

		header := entry.FileHeader
		header.Name = normalizedName
		if header.Name == "mimetype" {
			header.Method = zip.Store
		}

		entryReader, err := entry.Open()
		if err != nil {
			return err
		}
		target, err := writer.CreateHeader(&header)
		if err != nil {
			entryReader.Close()
			return err
		}
		remaining := maxExpandedBytes - copiedBytes
		if remaining < 0 {
			entryReader.Close()
			return fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		copied, err := io.Copy(target, io.LimitReader(entryReader, remaining+1))
		if err != nil {
			entryReader.Close()
			return err
		}
		if copied > remaining {
			entryReader.Close()
			return fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		copiedBytes += copied
		if err := entryReader.Close(); err != nil {
			return err
		}
	}

	return writer.Close()
}

func (h *BooksHandler) findDuplicateBook(userID string, contentHash string) (*models.Book, error) {
	existing, err := h.db.FindBookByContentHash(userID, contentHash)
	if err != nil || existing != nil {
		return existing, err
	}

	books, err := h.db.ListBooks(userID)
	if err != nil {
		return nil, err
	}

	for i := range books {
		if books[i].ContentHash != "" {
			continue
		}

		path, pathErr := resolveUploadPath(h.cfg.UploadDir, books[i].Filename)
		if pathErr != nil {
			logger.Warn("Skipped invalid stored book path during duplicate check",
				slog.String("book_id", books[i].ID),
				slog.Any("error", pathErr),
			)
			continue
		}

		storedHash, err := hashFile(path)
		if err != nil {
			logger.Warn("Failed to hash existing book during duplicate check",
				slog.String("book_id", books[i].ID),
				slog.Any("error", err),
			)
			continue
		}

		books[i].ContentHash = storedHash
		if err := h.db.SaveBook(&books[i]); err != nil {
			return nil, err
		}
		if storedHash == contentHash {
			return &books[i], nil
		}
	}

	return nil, nil
}

func duplicateBookMessage(book *models.Book) string {
	if strings.TrimSpace(book.Title) == "" {
		return "这本书已在书架中，请勿重复上传"
	}
	return fmt.Sprintf("《%s》已在书架中，请勿重复上传", book.Title)
}

func respondDuplicateBook(c *gin.Context, book *models.Book) {
	c.JSON(http.StatusConflict, gin.H{
		"code":    "conflict",
		"message": duplicateBookMessage(book),
		"book":    book,
	})
}

func isValidEPUBFile(file *multipart.FileHeader, maxExpandedBytes int64) bool {
	return validateEPUBFile(file, maxExpandedBytes) == nil
}

func validateEPUBFile(file *multipart.FileHeader, maxExpandedBytes int64) error {
	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("读取 EPUB 文件失败")
	}
	defer src.Close()

	reader, err := zip.NewReader(src, file.Size)
	if err != nil {
		return fmt.Errorf("上传文件与 EPUB 格式不匹配")
	}
	if err := validateEPUBArchive(reader, maxExpandedBytes); err != nil {
		return err
	}

	hasMimetype := false
	hasContainer := false
	for _, entry := range reader.File {
		name := normalizeEPUBZipEntryName(entry.Name)
		switch name {
		case "mimetype":
			data, err := readZipFileWithLimit(entry, 128)
			if err != nil {
				return fmt.Errorf("上传文件与 EPUB 格式不匹配")
			}
			hasMimetype = strings.TrimSpace(string(data)) == "application/epub+zip"
		case "meta-inf/container.xml":
			hasContainer = true
		}
	}

	if !hasMimetype && !hasContainer {
		return fmt.Errorf("上传文件与 EPUB 格式不匹配")
	}
	return nil
}

func validateEPUBArchive(reader *zip.Reader, maxExpandedBytes int64) error {
	if maxExpandedBytes <= 0 {
		maxExpandedBytes = maxEPUBExpandedBytes
	}
	if len(reader.File) > maxEPUBArchiveEntries {
		return fmt.Errorf("EPUB 包含过多文件")
	}

	var total uint64
	limit := uint64(maxExpandedBytes)
	for _, entry := range reader.File {
		if strings.HasSuffix(entry.Name, "/") {
			continue
		}
		if entry.UncompressedSize64 > limit || total > limit-entry.UncompressedSize64 {
			return fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		total += entry.UncompressedSize64
	}
	return nil
}

func maxEPUBExpansionLimit(uploadLimit int64) int64 {
	if uploadLimit > 0 && uploadLimit < maxEPUBExpandedBytes/4 {
		return uploadLimit * 4
	}
	return maxEPUBExpandedBytes
}

func normalizeEPUBZipEntryName(name string) string {
	normalized := strings.ToLower(strings.TrimLeft(name, "/"))
	parts := strings.Split(normalized, "/")
	if len(parts) > 1 && strings.HasSuffix(parts[0], ".epub") {
		return strings.Join(parts[1:], "/")
	}
	return normalized
}

func epubPackageRoot(reader *zip.Reader) (string, bool) {
	roots := make(map[string]bool)
	for _, entry := range reader.File {
		name := strings.ToLower(strings.TrimLeft(entry.Name, "/"))
		parts := strings.Split(name, "/")
		if len(parts) <= 1 || !strings.HasSuffix(parts[0], ".epub") {
			continue
		}
		stripped := strings.Join(parts[1:], "/")
		if stripped == "mimetype" || stripped == "meta-inf/container.xml" {
			roots[parts[0]+"/"] = true
		}
	}

	if len(roots) != 1 {
		return "", false
	}
	for root := range roots {
		return root, true
	}
	return "", false
}

func stripEPUBPackageRoot(name string, root string) (string, bool) {
	trimmed := strings.TrimLeft(name, "/")
	if len(trimmed) < len(root) || !strings.EqualFold(trimmed[:len(root)], root) {
		return "", false
	}
	return strings.TrimLeft(trimmed[len(root):], "/"), true
}

func hasMobiSignature(header []byte) bool {
	return len(header) >= 68 && string(header[60:68]) == "BOOKMOBI"
}

func removeFileIfExists(path string) {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		logger.Warn("Failed to remove file during cleanup",
			slog.String("path", path),
			slog.Any("error", err),
		)
	}
}

func extractBookPreview(path string, format string) (*epubMetadata, []byte, string, error) {
	switch format {
	case "epub":
		return extractEPUBPreview(path)
	default:
		return nil, nil, "", fmt.Errorf("metadata extraction not implemented for %s", format)
	}
}

func (h *BooksHandler) Update(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
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
		book.Title = title
	}
	if req.Author.Set && req.Author.Value != nil {
		author := strings.TrimSpace(*req.Author.Value)
		if len([]rune(author)) > maxBookAuthorRunes {
			response.BadRequest(c, "作者不能超过 500 个字符")
			return
		}
		book.Author = author
	}
	if req.Category.Set {
		category := normalizeBookCategory(req.Category.Value)
		if category != nil && len([]rune(*category)) > 50 {
			response.BadRequest(c, "分类不能超过 50 个字符")
			return
		}
		book.Category = category
	}

	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if err := h.db.SaveBook(book); err != nil {
		response.InternalError(c, "保存书籍失败")
		return
	}

	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) BatchUpdateCategory(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	var req batchBookCategoryRequest
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
		response.BadRequest(c, "请选择要设置分类的图书")
		return
	}
	if len(req.IDs) > maxBatchBookIDs {
		response.BadRequest(c, "单次最多操作 500 本图书")
		return
	}
	if !req.Category.Set {
		response.BadRequest(c, "缺少分类字段")
		return
	}

	category := normalizeBookCategory(req.Category.Value)
	if category != nil && len([]rune(*category)) > 50 {
		response.BadRequest(c, "分类不能超过 50 个字符")
		return
	}

	books, err := h.db.UpdateBooksCategory(req.IDs, userID, category)
	if err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "部分图书不存在")
			return
		}
		response.InternalError(c, "设置分类失败")
		return
	}

	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}

	c.JSON(http.StatusOK, gin.H{"books": books})
}

func (h *BooksHandler) RemoveCategory(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}

	book.Category = nil
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if err := h.db.SaveBook(book); err != nil {
		response.InternalError(c, "保存书籍失败")
		return
	}

	c.JSON(http.StatusOK, book)
}

func extractEPUBPreview(path string) (*epubMetadata, []byte, string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, nil, "", err
	}
	defer r.Close()
	meta := &epubMetadata{}
	if extractedMeta, err := extractEPUBMetadataFromReader(&r.Reader); err == nil {
		meta = extractedMeta
	}
	coverData, contentType, coverErr := extractEPUBCoverFromReader(&r.Reader)
	if coverErr != nil {
		// A cover is optional and should not make an otherwise valid upload fail.
		return meta, nil, "", nil
	}
	return meta, coverData, contentType, nil
}

func extractEPUBMetadataFromReader(reader *zip.Reader) (*epubMetadata, error) {
	var meta epubMetadata
	for _, f := range reader.File {
		if strings.HasSuffix(f.Name, ".opf") || f.Name == "OEBPS/content.opf" {
			data, err := readZipFileWithLimit(f, maxEPUBMetadataBytes)
			if err != nil {
				return nil, err
			}

			var pkg struct {
				Metadata epubMetadata `xml:"metadata"`
			}
			if err := xml.Unmarshal(data, &pkg); err != nil {
				return nil, err
			}
			meta = pkg.Metadata
			break
		}
	}

	return &meta, nil
}

func (h *BooksHandler) GetCover(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	thumbnailRequested := c.Query("size") == "thumb"
	if thumbnailRequested && book.CoverThumbPath == "" && book.CoverPath != "" {
		h.attachCoverThumbnail(book)
		if book.CoverThumbPath != "" {
			if err := h.db.SaveBook(book); err != nil {
				logger.Warn("Failed to persist cover thumbnail path",
					slog.String("book_id", book.ID),
					slog.Any("error", err),
				)
			}
		}
	}
	if thumbnailRequested && book.CoverThumbPath != "" {
		thumbnailPath, err := resolveUploadPath(h.cfg.UploadDir, book.CoverThumbPath)
		if err != nil {
			response.Forbidden(c, "封面访问被拒绝")
			return
		}
		setPrivateCache(c, bookCoverCacheMaxAge)
		c.File(thumbnailPath)
		return
	}

	if book.CoverPath != "" {
		coverPath, err := resolveUploadPath(h.cfg.UploadDir, book.CoverPath)
		if err != nil {
			response.Forbidden(c, "封面访问被拒绝")
			return
		}
		setPrivateCache(c, bookCoverCacheMaxAge)
		c.File(coverPath)
		return
	}

	if book.Format != "epub" {
		response.NotFound(c, "封面不存在")
		return
	}

	bookPath, err := resolveUploadPath(h.cfg.UploadDir, book.Filename)
	if err != nil {
		response.Forbidden(c, "文件访问被拒绝")
		return
	}

	// Try to extract and cache the cover to disk on first request
	coverData, contentType, err := extractEPUBCover(bookPath)
	if err != nil {
		response.NotFound(c, "封面不存在")
		return
	}

	// Cache the extracted cover to disk for future requests
	go h.cacheExtractedCover(book, coverData, contentType)

	setPrivateCache(c, bookCoverCacheMaxAge)
	if writeNotModifiedIfETagMatches(c, hashBytes(coverData)) {
		return
	}
	c.Header("Content-Type", contentType)
	c.Data(http.StatusOK, contentType, coverData)
}

func (h *BooksHandler) UploadCover(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}

	coverUploadLimit := h.cfg.MaxUploadBytes
	if coverUploadLimit <= 0 || coverUploadLimit > maxCoverUploadBytes {
		coverUploadLimit = maxCoverUploadBytes
	}
	limitUploadBody(c, coverUploadLimit)
	file, err := c.FormFile("file")
	if err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "文件超过上传大小限制"})
			return
		}
		response.BadRequest(c, "请选择文件")
		return
	}
	if file.Size <= 0 {
		response.BadRequest(c, "文件为空")
		return
	}
	if file.Size > coverUploadLimit {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "文件超过上传大小限制"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		switch strings.ToLower(file.Header.Get("Content-Type")) {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "image/webp":
			ext = ".webp"
		default:
			ext = ".png"
		}
	}
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		response.BadRequest(c, "不支持的封面格式")
		return
	}
	if err := validateUploadedCover(file, ext); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	coverFilename := id + ".cover" + ext
	coverPath, err := resolveUploadPath(h.cfg.UploadDir, coverFilename)
	if err != nil {
		response.Forbidden(c, "封面保存被拒绝")
		return
	}
	previousCoverPath := book.CoverPath
	previousCoverThumbPath := book.CoverThumbPath
	if err := c.SaveUploadedFile(file, coverPath); err != nil {
		response.InternalError(c, "保存封面失败")
		return
	}

	book.CoverPath = coverFilename
	book.CoverThumbPath = ""
	h.attachCoverThumbnail(book)
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	if err := h.db.SaveBook(book); err != nil {
		os.Remove(coverPath)
		if book.CoverThumbPath != "" {
			if thumbnailPath, pathErr := resolveUploadPath(h.cfg.UploadDir, book.CoverThumbPath); pathErr == nil {
				removeFileIfExists(thumbnailPath)
			}
		}
		response.InternalError(c, "保存书籍失败")
		return
	}
	if previousCoverPath != "" && previousCoverPath != coverFilename {
		if path, err := resolveUploadPath(h.cfg.UploadDir, previousCoverPath); err == nil {
			os.Remove(path)
		}
	}
	if previousCoverThumbPath != "" && previousCoverThumbPath != book.CoverThumbPath {
		if path, err := resolveUploadPath(h.cfg.UploadDir, previousCoverThumbPath); err == nil {
			removeFileIfExists(path)
		}
	}

	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) cacheExtractedCover(book *models.Book, coverData []byte, contentType string) {
	coverFilename, err := h.writeExtractedCover(book.ID, coverData, contentType)
	if err != nil {
		logger.Warn("Failed to cache EPUB cover to disk",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
		return
	}

	book.CoverPath = coverFilename
	book.CoverThumbPath = ""
	h.attachCoverThumbnail(book)
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	if err := h.db.SaveBook(book); err != nil {
		logger.Warn("Failed to update book cover path",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
		if coverPath, pathErr := resolveUploadPath(h.cfg.UploadDir, coverFilename); pathErr == nil {
			removeFileIfExists(coverPath)
		}
	}
}

func (h *BooksHandler) writeExtractedCover(bookID string, coverData []byte, contentType string) (string, error) {
	ext := ".jpg"
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	}

	coverFilename := bookID + ".cover" + ext
	coverPath, err := resolveUploadPath(h.cfg.UploadDir, coverFilename)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(coverPath, coverData, 0644); err != nil {
		return "", err
	}
	return coverFilename, nil
}

func (h *BooksHandler) createCoverThumbnail(bookID, coverFilename string) (string, error) {
	coverPath, err := resolveUploadPath(h.cfg.UploadDir, coverFilename)
	if err != nil {
		return "", err
	}
	source, err := os.Open(coverPath)
	if err != nil {
		return "", err
	}
	config, _, err := image.DecodeConfig(source)
	source.Close()
	if err != nil {
		// WebP is intentionally served as-is until a thumbnail encoder is
		// configured; a failed optimization must not reject a valid cover.
		return "", nil
	}
	if config.Width <= coverThumbnailMaxWidth || config.Width <= 0 || config.Height <= 0 {
		return "", nil
	}
	if int64(config.Width)*int64(config.Height) > coverThumbnailMaxPixels {
		return "", nil
	}

	source, err = os.Open(coverPath)
	if err != nil {
		return "", err
	}
	defer source.Close()
	decoded, _, err := image.Decode(source)
	if err != nil {
		return "", nil
	}
	bounds := decoded.Bounds()
	thumbnailHeight := max(1, bounds.Dy()*coverThumbnailMaxWidth/bounds.Dx())
	thumbnail := image.NewRGBA(image.Rect(0, 0, coverThumbnailMaxWidth, thumbnailHeight))
	for y := 0; y < thumbnailHeight; y++ {
		sourceY := bounds.Min.Y + y*bounds.Dy()/thumbnailHeight
		for x := 0; x < coverThumbnailMaxWidth; x++ {
			sourceX := bounds.Min.X + x*bounds.Dx()/coverThumbnailMaxWidth
			thumbnail.Set(x, y, decoded.At(sourceX, sourceY))
		}
	}

	thumbnailFilename := bookID + ".cover.thumb.jpg"
	thumbnailPath, err := resolveUploadPath(h.cfg.UploadDir, thumbnailFilename)
	if err != nil {
		return "", err
	}
	tempPath := thumbnailPath + ".tmp"
	target, err := os.Create(tempPath)
	if err != nil {
		return "", err
	}
	encodeErr := jpeg.Encode(target, thumbnail, &jpeg.Options{Quality: 82})
	closeErr := target.Close()
	if encodeErr != nil || closeErr != nil {
		removeFileIfExists(tempPath)
		if encodeErr != nil {
			return "", encodeErr
		}
		return "", closeErr
	}
	if err := os.Rename(tempPath, thumbnailPath); err != nil {
		removeFileIfExists(tempPath)
		return "", err
	}
	return thumbnailFilename, nil
}

func (h *BooksHandler) attachCoverThumbnail(book *models.Book) {
	if book == nil || book.CoverPath == "" {
		return
	}
	thumbnailPath, err := h.createCoverThumbnail(book.ID, book.CoverPath)
	if err != nil {
		logger.Warn("Failed to create cover thumbnail",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
		return
	}
	if thumbnailPath != "" {
		book.CoverThumbPath = thumbnailPath
	}
}

func extractEPUBCover(path string) ([]byte, string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()
	return extractEPUBCoverFromReader(&r.Reader)
}

func extractEPUBCoverFromReader(reader *zip.Reader) ([]byte, string, error) {
	coverNames := []string{
		"OEBPS/cover.jpg", "OEBPS/cover.jpeg", "OEBPS/cover.png", "OEBPS/cover.webp",
		"cover.jpg", "cover.jpeg", "cover.png",
		"OEBPS/Images/cover.jpg", "OEBPS/Images/cover.jpeg",
	}

	for _, f := range reader.File {
		name := strings.ToLower(f.Name)
		for _, coverName := range coverNames {
			if strings.ToLower(coverName) == name || strings.Contains(name, "cover") {
				data, err := readZipFileWithLimit(f, maxEPUBCoverBytes)
				if err != nil {
					return nil, "", err
				}
				contentType := http.DetectContentType(data)
				if !strings.HasPrefix(contentType, "image/") {
					return nil, "", fmt.Errorf("封面格式无效")
				}
				return data, contentType, nil
			}
		}
	}

	return nil, "", fmt.Errorf("封面不存在")
}

func readZipFileWithLimit(file *zip.File, maxBytes int64) ([]byte, error) {
	if file.UncompressedSize64 > uint64(maxBytes) {
		return nil, fmt.Errorf("zip 条目超过读取限制")
	}

	rc, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	limited := io.LimitReader(rc, maxBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("zip 条目超过读取限制")
	}
	return data, nil
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
