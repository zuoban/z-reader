package handlers

import (
	"bytes"
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
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/logger"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
	"z-reader/backend/telemetry"
)

func (h *BooksHandler) GetCover(c *gin.Context) {
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
	thumbnailRequested := c.Query("size") == "thumb"
	if thumbnailRequested && book.CoverThumbPath == "" && book.CoverPath != "" {
		latest, err := h.cacheCoverThumbnail(book)
		if err == storage.ErrNotFound {
			response.NotFound(c, "书籍不存在")
			return
		}
		if err != nil {
			logger.Warn("Failed to persist cover thumbnail path",
				slog.String("book_id", book.ID),
				slog.Any("error", err),
			)
		} else {
			book = latest
		}
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)
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

	book, err := h.db.GetBookForUser(id, storage.PersonalLibrary)
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

	source, err := file.Open()
	if err != nil {
		response.InternalError(c, "保存封面失败")
		return
	}
	defer source.Close()
	cover, err := h.prepareCover(id, ext, source)
	if err != nil {
		response.InternalError(c, "保存封面失败")
		return
	}

	book, err = h.commitCover(book, cover, true)
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

type bookCover struct {
	path  string
	thumb string
}

func (cover bookCover) apply(book *models.Book) {
	book.CoverPath = cover.path
	book.CoverThumbPath = cover.thumb
}

func (h *BooksHandler) cacheExtractedCover(book *models.Book, coverData []byte, contentType string) {
	cover, err := h.prepareExtractedCover(book.ID, coverData, contentType)
	if err == nil {
		_, err = h.commitCover(book, cover, false)
	}
	if err != nil && err != storage.ErrNotFound {
		logger.Warn("Failed to cache EPUB cover",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
	}
}

func (h *BooksHandler) commitCover(snapshot *models.Book, cover bookCover, replace bool) (*models.Book, error) {
	var previous bookCover
	book, err := h.db.UpdateBook(snapshot.ID, snapshot.UserID, func(book *models.Book) bool {
		if !replace && (book.CoverPath != "" || book.Filename != snapshot.Filename) {
			return false
		}
		previous = bookCover{path: book.CoverPath, thumb: book.CoverThumbPath}
		cover.apply(book)
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if err != nil || book.CoverPath != cover.path {
		h.removeUploadFiles(cover.path, cover.thumb)
	} else {
		h.removePublishedUploadFiles(previous.path, previous.thumb)
	}
	return book, err
}

func (h *BooksHandler) cacheCoverThumbnail(snapshot *models.Book) (*models.Book, error) {
	thumb := h.prepareCoverThumbnail(snapshot.ID, snapshot.CoverPath)
	if thumb == "" {
		return snapshot, nil
	}
	return h.commitCoverThumbnail(snapshot, thumb)
}

func (h *BooksHandler) commitCoverThumbnail(snapshot *models.Book, thumb string) (*models.Book, error) {
	book, err := h.db.UpdateBook(snapshot.ID, snapshot.UserID, func(book *models.Book) bool {
		if book.CoverPath != snapshot.CoverPath || book.CoverThumbPath != "" {
			return false
		}
		book.CoverThumbPath = thumb
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if err != nil || book.CoverThumbPath != thumb {
		h.removeUploadFiles(thumb)
	}
	return book, err
}

func (h *BooksHandler) prepareExtractedCover(bookID string, data []byte, contentType string) (bookCover, error) {
	ext := ".jpg"
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	}
	return h.prepareCover(bookID, ext, bytes.NewReader(data))
}

func (h *BooksHandler) prepareCover(bookID, ext string, source io.Reader) (bookCover, error) {
	filename, err := h.writeCoverFile(bookID, ext, func(target io.Writer) error {
		_, err := io.Copy(target, source)
		return err
	})
	if err != nil {
		return bookCover{}, err
	}
	return bookCover{path: filename, thumb: h.prepareCoverThumbnail(bookID, filename)}, nil
}

// Each candidate owns its files until a transaction publishes their paths.
// Other requests can safely remove replaced files without reusing those paths.
func (h *BooksHandler) writeCoverFile(bookID, suffix string, write func(io.Writer) error) (string, error) {
	filename := bookID + "." + uuid.NewString() + ".cover" + suffix
	path, err := resolveUploadPath(h.cfg.UploadDir, filename)
	if err != nil {
		return "", err
	}
	target, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return "", err
	}
	writeErr := write(target)
	closeErr := target.Close()
	if writeErr != nil || closeErr != nil {
		removeFileIfExists(path)
		if writeErr != nil {
			return "", writeErr
		}
		return "", closeErr
	}
	return filename, nil
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

	return h.writeCoverFile(bookID, ".thumb.jpg", func(target io.Writer) error {
		return jpeg.Encode(target, thumbnail, &jpeg.Options{Quality: 82})
	})
}

func (h *BooksHandler) prepareCoverThumbnail(bookID, coverPath string) string {
	startedAt := time.Now()
	thumbnailPath, err := h.createCoverThumbnail(bookID, coverPath)
	telemetry.Observe("cover_thumbnail", time.Since(startedAt), 1)
	if err != nil {
		logger.Warn("Failed to create cover thumbnail",
			slog.String("book_id", bookID),
			slog.Any("error", err),
		)
	}
	return thumbnailPath
}
