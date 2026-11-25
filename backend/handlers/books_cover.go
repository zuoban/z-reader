package handlers

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
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
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/logger"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
	"z-reader/backend/telemetry"
)

type coverFlightCall[T any] struct {
	done  chan struct{}
	value T
	err   error
}

type coverFlightGroup[T any] struct {
	mu    sync.Mutex
	calls map[string]*coverFlightCall[T]
}

func (g *coverFlightGroup[T]) Do(key string, fn func() (T, error)) (T, error) {
	g.mu.Lock()
	if g.calls == nil {
		g.calls = make(map[string]*coverFlightCall[T])
	}
	if call, ok := g.calls[key]; ok {
		g.mu.Unlock()
		<-call.done
		return call.value, call.err
	}
	call := &coverFlightCall[T]{done: make(chan struct{})}
	g.calls[key] = call
	g.mu.Unlock()

	defer func() {
		g.mu.Lock()
		delete(g.calls, key)
		g.mu.Unlock()
		close(call.done)
	}()

	call.value, call.err = fn()
	return call.value, call.err
}

type extractedCoverResult struct {
	data        []byte
	contentType string
	status      int
	message     string
}

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
	if thumbnailRequested && book.CoverThumbPath == "" && !book.CoverThumbChecked && book.CoverPath != "" {
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
		} else if latest != nil {
			book = latest
		}
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	if thumbnailRequested && book.CoverThumbPath != "" {
		h.serveCover(c, book.CoverThumbPath)
		return
	}
	if book.CoverPath != "" {
		h.serveCover(c, book.CoverPath)
		return
	}

	if book.CoverMissing || !supportsExtractedCoverFormat(book.Format) {
		response.NotFound(c, "封面不存在")
		return
	}

	extracted, _ := h.coverExtractFlights.Do(book.ID+":"+book.Filename, func() (extractedCoverResult, error) {
		file, _, openErr := openUploadFile(h.cfg.UploadDir, book.Filename)
		if os.IsNotExist(openErr) {
			return extractedCoverResult{status: http.StatusNotFound, message: "封面不存在"}, nil
		}
		if openErr != nil {
			return extractedCoverResult{status: http.StatusForbidden, message: "文件访问被拒绝"}, nil
		}
		defer file.Close()

		coverData, contentType, extractErr := extractBookCover(file, book.Format)
		if extractErr != nil {
			h.markCoverMissing(book)
			return extractedCoverResult{status: http.StatusNotFound, message: "封面不存在"}, nil
		}

		h.enqueueCoverCache(book, coverData, contentType)
		return extractedCoverResult{
			data:        coverData,
			contentType: contentType,
			status:      http.StatusOK,
		}, nil
	})
	if extracted.status != http.StatusOK {
		if extracted.status == http.StatusForbidden {
			response.Forbidden(c, extracted.message)
			return
		}
		response.NotFound(c, extracted.message)
		return
	}

	h.setBookCache(c, bookCoverCacheMaxAge)
	if writeNotModifiedIfETagMatches(c, hashBytes(extracted.data)) {
		return
	}
	c.Header("Content-Type", extracted.contentType)
	c.Data(http.StatusOK, extracted.contentType, extracted.data)
}

func supportsExtractedCoverFormat(format string) bool {
	switch format {
	case "epub", "mobi", "azw3":
		return true
	default:
		return false
	}
}

func extractBookCover(file *os.File, format string) ([]byte, string, error) {
	switch format {
	case "epub":
		return extractEPUBCover(file)
	case "mobi", "azw3":
		return extractMOBICover(file)
	default:
		return nil, "", fmt.Errorf("封面不存在")
	}
}

func (h *BooksHandler) serveCover(c *gin.Context, name string) {
	file, info, err := openUploadFile(h.cfg.UploadDir, name)
	if os.IsNotExist(err) {
		response.NotFound(c, "封面不存在")
		return
	}
	if err != nil {
		response.Forbidden(c, "封面访问被拒绝")
		return
	}
	defer file.Close()
	h.setBookCache(c, bookCoverCacheMaxAge)
	etag := hashBytes([]byte(fmt.Sprintf("%s:%d:%d", name, info.Size(), info.ModTime().UnixNano())))
	if writeNotModifiedIfETagMatches(c, etag) {
		return
	}
	http.ServeContent(c.Writer, c.Request, info.Name(), info.ModTime(), file)
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

func (h *BooksHandler) DeleteCover(c *gin.Context) {
	id := c.Param("id")

	var previous bookCover
	book, err := h.db.UpdateBook(id, storage.PersonalLibrary, func(book *models.Book) bool {
		if book.CoverPath == "" && book.CoverThumbPath == "" && !book.CoverThumbChecked && book.CoverMissing {
			return false
		}
		previous = bookCover{path: book.CoverPath, thumb: book.CoverThumbPath}
		book.CoverPath = ""
		book.CoverThumbPath = ""
		book.CoverThumbChecked = false
		book.CoverMissing = true
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

	if previous.path != "" || previous.thumb != "" {
		h.removePublishedUploadFiles(previous.path, previous.thumb)
	}
	book.Format = normalizeBookFormat(book.Format, book.Filename)
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
	path         string
	thumb        string
	thumbChecked bool
	missing      bool
}

func (cover bookCover) apply(book *models.Book) {
	book.CoverPath = cover.path
	book.CoverThumbPath = cover.thumb
	book.CoverThumbChecked = cover.thumbChecked
	if cover.path != "" {
		book.CoverMissing = false
	}
}

func (h *BooksHandler) markCoverMissing(snapshot *models.Book) {
	_, err := h.db.UpdateBook(snapshot.ID, snapshot.UserID, func(book *models.Book) bool {
		if book.CoverPath != "" || book.Filename != snapshot.Filename || book.CoverMissing {
			return false
		}
		book.CoverMissing = true
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if err != nil && err != storage.ErrNotFound {
		logger.Warn("Failed to persist missing cover state",
			slog.String("book_id", snapshot.ID),
			slog.Any("error", err),
		)
	}
}

func (h *BooksHandler) enqueueCoverCache(book *models.Book, coverData []byte, contentType string) bool {
	if book == nil || len(coverData) == 0 {
		return false
	}
	return h.enqueueCoverCacheTask(func() {
		h.cacheExtractedCover(book, coverData, contentType)
	})
}

func (h *BooksHandler) enqueueCoverCacheTask(task func()) bool {
	if task == nil {
		return false
	}
	h.coverCacheMu.Lock()
	if h.coverCacheClosed {
		h.coverCacheMu.Unlock()
		return false
	}
	if h.coverCacheSem == nil {
		h.coverCacheSem = make(chan struct{}, coverCacheMaxConcurrency)
	}
	select {
	case h.coverCacheSem <- struct{}{}:
	default:
		h.coverCacheMu.Unlock()
		return false
	}
	h.coverCacheWG.Add(1)
	h.coverCacheMu.Unlock()

	go func() {
		defer func() {
			<-h.coverCacheSem
			h.coverCacheWG.Done()
		}()
		task()
	}()
	return true
}

func (h *BooksHandler) closeCoverCache() {
	h.coverCacheMu.Lock()
	h.coverCacheClosed = true
	h.coverCacheMu.Unlock()
	h.coverCacheWG.Wait()
}

func (h *BooksHandler) cacheExtractedCover(book *models.Book, coverData []byte, contentType string) {
	cover, err := h.prepareExtractedCover(book.ID, coverData, contentType)
	if err == nil {
		_, err = h.commitCover(book, cover, false)
	}
	if err != nil && err != storage.ErrNotFound {
		logger.Warn("Failed to cache extracted cover",
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
	return h.coverThumbFlights.Do(snapshot.ID+":"+snapshot.CoverPath, func() (*models.Book, error) {
		thumb, ok := h.prepareCoverThumbnailChecked(snapshot.ID, snapshot.CoverPath)
		if !ok {
			return snapshot, nil
		}
		return h.commitCoverThumbnail(snapshot, thumb)
	})
}

func (h *BooksHandler) commitCoverThumbnail(snapshot *models.Book, thumb string) (*models.Book, error) {
	book, err := h.db.UpdateBook(snapshot.ID, snapshot.UserID, func(book *models.Book) bool {
		if book.CoverPath != snapshot.CoverPath || book.CoverThumbPath != "" || (thumb == "" && book.CoverThumbChecked) {
			return false
		}
		book.CoverThumbPath = thumb
		book.CoverThumbChecked = true
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if thumb != "" && (err != nil || book == nil || book.CoverThumbPath != thumb) {
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
	thumb, thumbChecked := h.prepareCoverThumbnailChecked(bookID, filename)
	return bookCover{path: filename, thumb: thumb, thumbChecked: thumbChecked}, nil
}

// Each candidate owns its files until a transaction publishes their paths.
// Other requests can safely remove replaced files without reusing those paths.
func (h *BooksHandler) writeCoverFile(bookID, suffix string, write func(io.Writer) error) (string, error) {
	filename := bookID + "." + uuid.NewString() + ".cover" + suffix
	if !validUploadName(filename) {
		return "", fmt.Errorf("invalid cover path")
	}
	root, err := os.OpenRoot(h.cfg.UploadDir)
	if err != nil {
		return "", err
	}
	defer root.Close()
	target, err := root.OpenFile(filepath.Clean(filename), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return "", err
	}
	writeErr := write(target)
	closeErr := target.Close()
	if writeErr != nil || closeErr != nil {
		return "", errors.Join(writeErr, closeErr, root.Remove(filepath.Clean(filename)))
	}
	return filename, nil
}

func (h *BooksHandler) createCoverThumbnail(bookID, coverFilename string) (string, error) {
	source, _, err := openUploadFile(h.cfg.UploadDir, coverFilename)
	if err != nil {
		return "", err
	}
	defer source.Close()
	config, _, err := image.DecodeConfig(source)
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

	if _, err := source.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	decoded, _, err := image.Decode(source)
	if err != nil {
		return "", nil
	}
	bounds := decoded.Bounds()
	thumbnailHeight := max(1, bounds.Dy()*coverThumbnailMaxWidth/bounds.Dx())
	thumbnail := resizeCoverThumbnail(decoded, coverThumbnailMaxWidth, thumbnailHeight)

	return h.writeCoverFile(bookID, ".thumb.jpg", func(target io.Writer) error {
		return jpeg.Encode(target, thumbnail, &jpeg.Options{Quality: 82})
	})
}

func resizeCoverThumbnail(src image.Image, dstWidth, dstHeight int) *image.RGBA {
	bounds := src.Bounds()
	srcWidth := bounds.Dx()
	srcHeight := bounds.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, dstWidth, dstHeight))
	if srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0 {
		return dst
	}

	x0 := make([]int, dstWidth)
	x1 := make([]int, dstWidth)
	wx := make([]int, dstWidth)
	for x := 0; x < dstWidth; x++ {
		// Fixed-point 8-bit fractional coordinates mapping destination centers to source centers.
		pos := ((2*x+1)*srcWidth*256)/(2*dstWidth) - 128
		if pos < 0 {
			pos = 0
		}
		maxPos := (srcWidth - 1) * 256
		if pos > maxPos {
			pos = maxPos
		}
		ix := pos >> 8
		x0[x] = bounds.Min.X + ix
		if ix+1 < srcWidth {
			x1[x] = bounds.Min.X + ix + 1
		} else {
			x1[x] = bounds.Min.X + ix
		}
		wx[x] = pos & 0xff
	}

	blendChannel := func(c00, c10, c01, c11, fx, fy int) uint8 {
		invX := 256 - fx
		invY := 256 - fy
		top := c00*invX + c10*fx
		bot := c01*invX + c11*fx
		return uint8((top*invY + bot*fy + 32768) >> 16)
	}

	switch img := src.(type) {
	case *image.YCbCr:
		for y := 0; y < dstHeight; y++ {
			posY := ((2*y+1)*srcHeight*256)/(2*dstHeight) - 128
			if posY < 0 {
				posY = 0
			}
			if maxPosY := (srcHeight - 1) * 256; posY > maxPosY {
				posY = maxPosY
			}
			iy := posY >> 8
			sy0 := bounds.Min.Y + iy
			sy1 := sy0
			if iy+1 < srcHeight {
				sy1 = sy0 + 1
			}
			fy := posY & 0xff
			dstRow := dst.Pix[y*dst.Stride:]
			for x := 0; x < dstWidth; x++ {
				sx0, sx1, fx := x0[x], x1[x], wx[x]
				r00, g00, b00 := ycbcrPixel(img, sx0, sy0)
				r10, g10, b10 := ycbcrPixel(img, sx1, sy0)
				r01, g01, b01 := ycbcrPixel(img, sx0, sy1)
				r11, g11, b11 := ycbcrPixel(img, sx1, sy1)
				off := x * 4
				dstRow[off] = blendChannel(r00, r10, r01, r11, fx, fy)
				dstRow[off+1] = blendChannel(g00, g10, g01, g11, fx, fy)
				dstRow[off+2] = blendChannel(b00, b10, b01, b11, fx, fy)
				dstRow[off+3] = 255
			}
		}
	case *image.RGBA:
		for y := 0; y < dstHeight; y++ {
			posY := ((2*y+1)*srcHeight*256)/(2*dstHeight) - 128
			if posY < 0 {
				posY = 0
			}
			if maxPosY := (srcHeight - 1) * 256; posY > maxPosY {
				posY = maxPosY
			}
			iy := posY >> 8
			sy0 := bounds.Min.Y + iy
			sy1 := sy0
			if iy+1 < srcHeight {
				sy1 = sy0 + 1
			}
			fy := posY & 0xff
			dstRow := dst.Pix[y*dst.Stride:]
			for x := 0; x < dstWidth; x++ {
				o00 := img.PixOffset(x0[x], sy0)
				o10 := img.PixOffset(x1[x], sy0)
				o01 := img.PixOffset(x0[x], sy1)
				o11 := img.PixOffset(x1[x], sy1)
				fx := wx[x]
				off := x * 4
				dstRow[off] = blendChannel(int(img.Pix[o00]), int(img.Pix[o10]), int(img.Pix[o01]), int(img.Pix[o11]), fx, fy)
				dstRow[off+1] = blendChannel(int(img.Pix[o00+1]), int(img.Pix[o10+1]), int(img.Pix[o01+1]), int(img.Pix[o11+1]), fx, fy)
				dstRow[off+2] = blendChannel(int(img.Pix[o00+2]), int(img.Pix[o10+2]), int(img.Pix[o01+2]), int(img.Pix[o11+2]), fx, fy)
				dstRow[off+3] = blendChannel(int(img.Pix[o00+3]), int(img.Pix[o10+3]), int(img.Pix[o01+3]), int(img.Pix[o11+3]), fx, fy)
			}
		}
	case *image.NRGBA:
		for y := 0; y < dstHeight; y++ {
			posY := ((2*y+1)*srcHeight*256)/(2*dstHeight) - 128
			if posY < 0 {
				posY = 0
			}
			if maxPosY := (srcHeight - 1) * 256; posY > maxPosY {
				posY = maxPosY
			}
			iy := posY >> 8
			sy0 := bounds.Min.Y + iy
			sy1 := sy0
			if iy+1 < srcHeight {
				sy1 = sy0 + 1
			}
			fy := posY & 0xff
			dstRow := dst.Pix[y*dst.Stride:]
			for x := 0; x < dstWidth; x++ {
				o00 := img.PixOffset(x0[x], sy0)
				o10 := img.PixOffset(x1[x], sy0)
				o01 := img.PixOffset(x0[x], sy1)
				o11 := img.PixOffset(x1[x], sy1)
				fx := wx[x]
				off := x * 4
				dstRow[off] = blendChannel(int(img.Pix[o00]), int(img.Pix[o10]), int(img.Pix[o01]), int(img.Pix[o11]), fx, fy)
				dstRow[off+1] = blendChannel(int(img.Pix[o00+1]), int(img.Pix[o10+1]), int(img.Pix[o01+1]), int(img.Pix[o11+1]), fx, fy)
				dstRow[off+2] = blendChannel(int(img.Pix[o00+2]), int(img.Pix[o10+2]), int(img.Pix[o01+2]), int(img.Pix[o11+2]), fx, fy)
				dstRow[off+3] = blendChannel(int(img.Pix[o00+3]), int(img.Pix[o10+3]), int(img.Pix[o01+3]), int(img.Pix[o11+3]), fx, fy)
			}
		}
	default:
		for y := 0; y < dstHeight; y++ {
			sourceY := bounds.Min.Y + y*srcHeight/dstHeight
			dstRow := dst.Pix[y*dst.Stride:]
			for x := 0; x < dstWidth; x++ {
				sourceX := bounds.Min.X + x*srcWidth/dstWidth
				r, g, b, a := src.At(sourceX, sourceY).RGBA()
				off := x * 4
				dstRow[off] = uint8(r >> 8)
				dstRow[off+1] = uint8(g >> 8)
				dstRow[off+2] = uint8(b >> 8)
				dstRow[off+3] = uint8(a >> 8)
			}
		}
	}

	return dst
}

func ycbcrPixel(img *image.YCbCr, x, y int) (int, int, int) {
	yi := img.YOffset(x, y)
	ci := img.COffset(x, y)
	r, g, b := color.YCbCrToRGB(img.Y[yi], img.Cb[ci], img.Cr[ci])
	return int(r), int(g), int(b)
}

func (h *BooksHandler) prepareCoverThumbnailChecked(bookID, coverPath string) (string, bool) {
	startedAt := time.Now()
	thumbnailPath, err := h.createCoverThumbnail(bookID, coverPath)
	telemetry.Observe("cover_thumbnail", time.Since(startedAt), 1)
	if err != nil {
		logger.Warn("Failed to create cover thumbnail",
			slog.String("book_id", bookID),
			slog.Any("error", err),
		)
		return "", false
	}
	return thumbnailPath, true
}

func (h *BooksHandler) prepareCoverThumbnail(bookID, coverPath string) string {
	thumbnailPath, _ := h.prepareCoverThumbnailChecked(bookID, coverPath)
	return thumbnailPath
}
