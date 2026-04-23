package handlers

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
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

type BooksHandler struct {
	cfg *config.Config
	db  *storage.DB
}

func NewBooksHandler(cfg *config.Config, db *storage.DB) *BooksHandler {
	return &BooksHandler{cfg: cfg, db: db}
}

func (h *BooksHandler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	books, err := h.db.ListBooks(userID)
	if err != nil {
		response.InternalError(c, "获取书籍列表失败")
		return
	}

	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}

	c.JSON(http.StatusOK, books)
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

	file, err := c.FormFile("file")
	if err != nil {
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

	ext := strings.ToLower(filepath.Ext(file.Filename))
	format, ok := supportedBookFormats[ext]
	if !ok {
		response.BadRequest(c, "支持的格式：EPUB、MOBI、AZW3、PDF")
		return
	}
	if err := validateUploadedBook(file, format); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	contentHash, err := hashUploadedFile(file)
	if err != nil {
		response.InternalError(c, "读取上传文件失败")
		return
	}
	existing, err := h.findDuplicateBook(userID, contentHash)
	if err != nil {
		response.InternalError(c, "检查重复图书失败")
		return
	}
	if existing != nil {
		response.Conflict(c, duplicateBookMessage(existing))
		return
	}

	bookID := uuid.New().String()
	filename := bookID + ext
	filepath := filepath.Join(h.cfg.UploadDir, filename)

	if err := c.SaveUploadedFile(file, filepath); err != nil {
		response.InternalError(c, "保存文件失败")
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

	meta, err := extractBookMetadata(filepath, format)
	if err == nil {
		book.Title = meta.Title
		book.Author = meta.Author
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

	if err := h.db.CreateBook(book); err != nil {
		os.Remove(filepath)
		if err == storage.ErrDuplicateBookContent {
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

	removeFileIfExists(filepath.Join(h.cfg.UploadDir, book.Filename))
	if book.CoverPath != "" {
		removeFileIfExists(filepath.Join(h.cfg.UploadDir, book.CoverPath))
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
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

	filePath := filepath.Join(h.cfg.UploadDir, book.Filename)

	// 路径遍历保护：验证解析后的文件路径在 UploadDir 范围内
	uploadDirAbs, err := filepath.Abs(h.cfg.UploadDir)
	if err != nil {
		response.InternalError(c, "获取上传目录失败")
		return
	}
	resolved, err := filepath.Abs(filePath)
	if err != nil || !strings.HasPrefix(resolved, uploadDirAbs+string(filepath.Separator)) {
		response.Forbidden(c, "文件访问被拒绝")
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
	Title      optionalString `json:"title"`
	Author     optionalString `json:"author"`
	CategoryID optionalString `json:"category_id"`
}

func normalizeBookFormat(format string, filename string) string {
	if format != "" {
		return format
	}
	return supportedBookFormats[strings.ToLower(filepath.Ext(filename))]
}

func validateUploadedBook(file *multipart.FileHeader, format string) error {
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
		if !isZIPHeader(header) {
			return fmt.Errorf("上传文件与 EPUB 格式不匹配")
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

		storedHash, err := hashFile(filepath.Join(h.cfg.UploadDir, books[i].Filename))
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

func isZIPHeader(header []byte) bool {
	return len(header) >= 4 &&
		header[0] == 'P' &&
		header[1] == 'K' &&
		(header[2] == 3 || header[2] == 5 || header[2] == 7) &&
		(header[3] == 4 || header[3] == 6 || header[3] == 8)
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

func extractBookMetadata(path string, format string) (*epubMetadata, error) {
	switch format {
	case "epub":
		return extractEPUBMetadata(path)
	default:
		return nil, fmt.Errorf("metadata extraction not implemented for %s", format)
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
		response.BadRequest(c, "请求内容无效")
		return
	}

	if req.Title.Set && req.Title.Value != nil {
		book.Title = *req.Title.Value
	}
	if req.Author.Set && req.Author.Value != nil {
		book.Author = *req.Author.Value
	}
	if req.CategoryID.Set {
		if req.CategoryID.Value != nil {
			category, err := h.db.GetCategoryForUser(*req.CategoryID.Value, userID)
			if err != nil {
				response.InternalError(c, "获取分类失败")
				return
			}
			if category == nil {
				response.BadRequest(c, "分类不存在")
				return
			}
		}
		book.CategoryID = req.CategoryID.Value
	}

	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if err := h.db.SaveBook(book); err != nil {
		response.InternalError(c, "保存书籍失败")
		return
	}

	c.JSON(http.StatusOK, book)
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

	book.CategoryID = nil
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if err := h.db.SaveBook(book); err != nil {
		response.InternalError(c, "保存书籍失败")
		return
	}

	c.JSON(http.StatusOK, book)
}

func extractEPUBMetadata(path string) (*epubMetadata, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	var meta epubMetadata
	for _, f := range r.File {
		if strings.HasSuffix(f.Name, ".opf") || f.Name == "OEBPS/content.opf" {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()

			data, err := io.ReadAll(rc)
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

	if book.CoverPath != "" {
		c.File(filepath.Join(h.cfg.UploadDir, book.CoverPath))
		return
	}

	if book.Format != "epub" {
		response.NotFound(c, "封面不存在")
		return
	}

	filepath := filepath.Join(h.cfg.UploadDir, book.Filename)
	coverData, err := extractEPUBCover(filepath)
	if err != nil {
		response.NotFound(c, "封面不存在")
		return
	}

	c.Header("Content-Type", "image/jpeg")
	c.Data(http.StatusOK, "image/jpeg", coverData)
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

	file, err := c.FormFile("file")
	if err != nil {
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
	coverPath := filepath.Join(h.cfg.UploadDir, coverFilename)
	previousCoverPath := book.CoverPath
	if err := c.SaveUploadedFile(file, coverPath); err != nil {
		response.InternalError(c, "保存封面失败")
		return
	}

	book.CoverPath = coverFilename
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	if err := h.db.SaveBook(book); err != nil {
		os.Remove(coverPath)
		response.InternalError(c, "保存书籍失败")
		return
	}
	if previousCoverPath != "" && previousCoverPath != coverFilename {
		os.Remove(filepath.Join(h.cfg.UploadDir, previousCoverPath))
	}

	c.JSON(http.StatusOK, book)
}

func extractEPUBCover(path string) ([]byte, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	coverNames := []string{
		"OEBPS/cover.jpg", "OEBPS/cover.jpeg", "OEBPS/cover.png",
		"cover.jpg", "cover.jpeg", "cover.png",
		"OEBPS/Images/cover.jpg", "OEBPS/Images/cover.jpeg",
	}

	for _, f := range r.File {
		name := strings.ToLower(f.Name)
		for _, coverName := range coverNames {
			if strings.ToLower(coverName) == name || strings.Contains(name, "cover") {
				rc, err := f.Open()
				if err != nil {
					continue
				}
				data, err := io.ReadAll(rc)
				rc.Close()
				if err != nil {
					return nil, err
				}
				return data, nil
			}
		}
	}

	return nil, fmt.Errorf("封面不存在")
}
