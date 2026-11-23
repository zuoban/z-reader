package handlers

import (
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

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
	startedAt := time.Now()
	thumbnailPath, err := h.createCoverThumbnail(book.ID, book.CoverPath)
	telemetry.Observe("cover_thumbnail", time.Since(startedAt), 1)
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
