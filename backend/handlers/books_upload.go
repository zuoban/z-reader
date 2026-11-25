package handlers

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
	"z-reader/backend/telemetry"
)

func (h *BooksHandler) Upload(c *gin.Context) {
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
	src, err := file.Open()
	if err != nil {
		response.BadRequest(c, "读取上传文件失败")
		return
	}
	defer src.Close()

	epubArchive, epubRoot, err := validateUploadedBookStream(src, file.Size, format, maxExpandedBytes)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	bookID := uuid.New().String()
	filename := bookID + ext
	root, err := os.OpenRoot(h.cfg.UploadDir)
	if err != nil {
		response.InternalError(c, "保存文件失败")
		return
	}
	defer root.Close()

	writeStartedAt := time.Now()
	contentHash, writtenSize, err := saveUploadedBookStream(src, epubArchive, epubRoot, root, filename, maxExpandedBytes)
	telemetry.Observe("book_upload_write", time.Since(writeStartedAt), 1)
	if err != nil {
		response.InternalError(c, "保存文件失败")
		return
	}

	existing, err := h.findDuplicateBook(storage.PersonalLibrary, contentHash)
	if err != nil {
		h.removeUploadFiles(filename)
		response.InternalError(c, "检查重复图书失败")
		return
	}
	if existing != nil {
		h.removeUploadFiles(filename)
		respondDuplicateBook(c, existing)
		return
	}

	book := &models.Book{
		ID:          bookID,
		UserID:      storage.PersonalLibrary,
		Filename:    filename,
		Format:      format,
		Size:        writtenSize,
		ContentHash: contentHash,
		CreatedAt:   time.Now(),
	}
	book.Title = fallbackBookTitle(file.Filename)
	if supportsBookPreviewProcessing(format) {
		book.ProcessingState = models.BookProcessingPending
	} else {
		book.ProcessingState = models.BookProcessingReady
	}

	if err := h.db.CreateBook(book); err != nil {
		h.removeUploadFiles(filename)
		if err == storage.ErrDuplicateBookContent {
			existing, findErr := h.findDuplicateBook(storage.PersonalLibrary, contentHash)
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
	if book.ProcessingState == models.BookProcessingPending {
		h.enqueueBookProcessing(book)
	}
}

func supportsBookPreviewProcessing(format string) bool {
	switch format {
	case "epub", "mobi", "azw3", "pdf":
		return true
	default:
		return false
	}
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
	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("读取上传文件失败")
	}
	defer src.Close()
	_, _, err = validateUploadedBookStream(src, file.Size, format, maxExpandedBytes)
	return err
}

func validateUploadedBookStream(
	src multipart.File, size int64, format string, maxExpandedBytes int64,
) (*zip.Reader, string, error) {
	if format == "epub" {
		return openValidatedEPUB(src, size, maxExpandedBytes)
	}

	header, err := readStreamHeader(src, 512)
	if err != nil {
		return nil, "", fmt.Errorf("读取上传文件失败")
	}

	switch format {
	case "pdf":
		if !bytes.HasPrefix(header, []byte("%PDF-")) {
			return nil, "", fmt.Errorf("上传文件与 PDF 格式不匹配")
		}
	case "mobi", "azw3":
		if !hasMobiSignature(header) {
			return nil, "", fmt.Errorf("上传文件与 %s 格式不匹配", strings.ToUpper(format))
		}
	}

	return nil, "", nil
}

func readUploadedFileHeader(file *multipart.FileHeader, maxBytes int) ([]byte, error) {
	src, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()

	return readStreamHeader(src, maxBytes)
}

func fallbackBookTitle(filename string) string {
	trimmed := strings.TrimSpace(filename)
	title := strings.TrimSpace(strings.TrimSuffix(trimmed, filepath.Ext(trimmed)))
	runes := []rune(title)
	if len(runes) > maxBookTitleRunes {
		return strings.TrimSpace(string(runes[:maxBookTitleRunes]))
	}
	return title
}

func readStreamHeader(src io.Reader, maxBytes int) ([]byte, error) {
	buf := make([]byte, maxBytes)
	n, err := io.ReadFull(src, buf)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return nil, err
	}

	return buf[:n], nil
}

func hashBook(src io.Reader) (string, error) {
	hash := sha256.New()
	if _, err := io.Copy(hash, src); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

type countingWriter struct {
	n int64
}

func (w *countingWriter) Write(p []byte) (int, error) {
	w.n += int64(len(p))
	return len(p), nil
}

func saveUploadedBookFile(
	file *multipart.FileHeader, format string, root *os.Root, name string, expandedLimit int64,
) (string, int64, error) {
	src, err := file.Open()
	if err != nil {
		return "", 0, err
	}
	defer src.Close()

	var archive *zip.Reader
	var packageRoot string
	if format == "epub" {
		archive, err = zip.NewReader(src, file.Size)
		if err != nil {
			return "", 0, err
		}
		packageRoot, _ = epubPackageRoot(archive)
	}
	return saveUploadedBookStream(src, archive, packageRoot, root, name, expandedLimit)
}

func saveUploadedBookStream(
	src multipart.File, archive *zip.Reader, packageRoot string, root *os.Root, name string, expandedLimit int64,
) (string, int64, error) {
	dst, err := root.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", 0, err
	}
	hash := sha256.New()
	var written countingWriter
	output := io.MultiWriter(dst, hash, &written)
	if packageRoot != "" {
		err = writeNormalizedEPUBZip(archive, packageRoot, output, expandedLimit)
	} else {
		if _, seekErr := src.Seek(0, io.SeekStart); seekErr != nil {
			err = seekErr
		} else {
			_, err = io.Copy(output, src)
		}
	}
	if err := errors.Join(err, dst.Close()); err != nil {
		return "", 0, errors.Join(err, root.Remove(name))
	}
	return hex.EncodeToString(hash.Sum(nil)), written.n, nil
}

func (h *BooksHandler) findDuplicateBook(userID string, contentHash string) (*models.Book, error) {
	existing, err := h.db.FindBookByContentHash(userID, contentHash)
	if err != nil || existing != nil {
		return existing, err
	}
	// A legacy backlog must be checked before accepting new content. File I/O
	// belongs to the bounded worker; indexed libraries require no legacy scan.
	if err := h.legacyHashes.catchUp(userID); err != nil {
		return nil, err
	}
	return h.db.FindBookByContentHash(userID, contentHash)
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

func hasMobiSignature(header []byte) bool {
	return len(header) >= 68 && string(header[60:68]) == "BOOKMOBI"
}
