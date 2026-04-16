package handlers

import (
	"archive/zip"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
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
	books, err := h.db.ListBooks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list books"})
		return
	}

	bookIDs := make([]string, 0, len(books))
	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
		bookIDs = append(bookIDs, books[i].ID)
	}

	progressMap, err := h.db.ListProgressByBookIDs(bookIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list reading progress"})
		return
	}

	for i := range books {
		if progress, ok := progressMap[books[i].ID]; ok {
			lastReadAt := progress.UpdatedAt
			books[i].LastReadAt = &lastReadAt
		}
	}

	c.JSON(http.StatusOK, books)
}

func (h *BooksHandler) Get(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}

	book.Format = normalizeBookFormat(book.Format, book.Filename)
	h.hydrateLastReadAt(book)
	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	format, ok := supportedBookFormats[ext]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "supported formats: EPUB, MOBI, AZW3, PDF"})
		return
	}

	bookID := uuid.New().String()
	filename := bookID + ext
	filepath := filepath.Join(h.cfg.UploadDir, filename)

	if err := c.SaveUploadedFile(file, filepath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	book := &models.Book{
		ID:        bookID,
		Filename:  filename,
		Format:    format,
		Size:      file.Size,
		CreatedAt: time.Now(),
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

	if err := h.db.SaveBook(book); err != nil {
		os.Remove(filepath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save book"})
		return
	}

	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}

	filepath := filepath.Join(h.cfg.UploadDir, book.Filename)
	os.Remove(filepath)

	if err := h.db.DeleteBook(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete book"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *BooksHandler) GetFile(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	filepath := filepath.Join(h.cfg.UploadDir, book.Filename)
	c.File(filepath)
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

func (h *BooksHandler) hydrateLastReadAt(book *models.Book) {
	progress, err := h.db.GetProgress(book.ID)
	if err != nil {
		logger.Debug("Failed to get reading progress",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
		book.LastReadAt = nil
		return
	}
	if progress != nil {
		book.LastReadAt = &progress.UpdatedAt
	} else {
		book.LastReadAt = nil
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

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}

	var req bookUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.Title.Set && req.Title.Value != nil {
		book.Title = *req.Title.Value
	}
	if req.Author.Set && req.Author.Value != nil {
		book.Author = *req.Author.Value
	}
	if req.CategoryID.Set {
		book.CategoryID = req.CategoryID.Value
	}

	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if err := h.db.SaveBook(book); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save book"})
		return
	}

	h.hydrateLastReadAt(book)

	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) RemoveCategory(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}

	book.CategoryID = nil
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if err := h.db.SaveBook(book); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save book"})
		return
	}

	h.hydrateLastReadAt(book)

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

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)

	if book.CoverPath != "" {
		c.File(filepath.Join(h.cfg.UploadDir, book.CoverPath))
		return
	}

	if book.Format != "epub" {
		c.JSON(http.StatusNotFound, gin.H{"error": "cover not found"})
		return
	}

	filepath := filepath.Join(h.cfg.UploadDir, book.Filename)
	coverData, err := extractEPUBCover(filepath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "cover not found"})
		return
	}

	c.Header("Content-Type", "image/jpeg")
	c.Data(http.StatusOK, "image/jpeg", coverData)
}

func (h *BooksHandler) UploadCover(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.GetBook(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
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

	coverFilename := id + ".cover" + ext
	coverPath := filepath.Join(h.cfg.UploadDir, coverFilename)
	if err := c.SaveUploadedFile(file, coverPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save cover"})
		return
	}

	book.CoverPath = coverFilename
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	if err := h.db.SaveBook(book); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save book"})
		return
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

	return nil, fmt.Errorf("cover not found")
}
