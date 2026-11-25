package handlers

import (
	"archive/zip"
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func writeCoverlessEPUB(t *testing.T, dir, filename string) {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range map[string]string{
		"mimetype":               "application/epub+zip",
		"META-INF/container.xml": `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
		"content.opf":            `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>No Cover</dc:title></metadata><manifest></manifest><spine></spine></package>`,
	} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, filename), buf.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
}

func newCoverTestHandler(t *testing.T) (*BooksHandler, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	h := NewBooksHandler(&config.Config{UploadDir: uploadDir, MaxUploadBytes: 10 << 20}, db)
	t.Cleanup(h.Close)
	return h, uploadDir
}

func TestGetCoverPersistsCoverMissingAndAvoidsReopeningEPUB(t *testing.T) {
	h, uploadDir := newCoverTestHandler(t)
	writeCoverlessEPUB(t, uploadDir, "coverless.epub")
	book := &models.Book{
		ID:        "book-coverless",
		UserID:    storage.PersonalLibrary,
		Title:     "No Cover",
		Filename:  "coverless.epub",
		Format:    "epub",
		CreatedAt: time.Now(),
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil)
	h.GetCover(ctx)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("first GetCover = %d, want 404", rec.Code)
	}

	stored, err := h.db.GetBook(book.ID)
	if err != nil || stored == nil || !stored.CoverMissing {
		t.Fatalf("expected CoverMissing=true persisted, got %+v, err=%v", stored, err)
	}

	// Replace file with an unreadable directory path or remove it; GetCover should short-circuit on CoverMissing.
	if err := os.Remove(filepath.Join(uploadDir, book.Filename)); err != nil {
		t.Fatal(err)
	}
	rec2 := httptest.NewRecorder()
	ctx2, _ := gin.CreateTestContext(rec2)
	ctx2.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx2.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil)
	h.GetCover(ctx2)
	if rec2.Code != http.StatusNotFound {
		t.Fatalf("second GetCover = %d, want 404", rec2.Code)
	}

	// Uploading a manual cover clears CoverMissing.
	recUpload := httptest.NewRecorder()
	ctxUpload, _ := gin.CreateTestContext(recUpload)
	ctxUpload.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctxUpload.Request = newMultipartUploadRequest(t, "cover.jpg", writebackCoverJPEG(t))
	h.UploadCover(ctxUpload)
	if recUpload.Code != http.StatusOK {
		t.Fatalf("UploadCover = %d %s", recUpload.Code, recUpload.Body.String())
	}
	afterUpload, err := h.db.GetBook(book.ID)
	if err != nil || afterUpload == nil || afterUpload.CoverMissing || afterUpload.CoverPath == "" || !afterUpload.CoverThumbChecked {
		t.Fatalf("expected CoverMissing=false and CoverThumbChecked=true after upload, got %+v, err=%v", afterUpload, err)
	}
}

func TestGetCoverMarksNonThumbnailableCoverChecked(t *testing.T) {
	h, uploadDir := newCoverTestHandler(t)
	// Minimal valid RIFF WEBP header (not decoded by stdlib image.DecodeConfig).
	webpBytes := []byte("RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00")
	coverName := "book-webp.cover.webp"
	if err := os.WriteFile(filepath.Join(uploadDir, coverName), webpBytes, 0644); err != nil {
		t.Fatal(err)
	}
	book := &models.Book{
		ID:        "book-webp",
		UserID:    storage.PersonalLibrary,
		Title:     "WebP Cover",
		Filename:  "book.epub",
		Format:    "epub",
		CoverPath: coverName,
		CreatedAt: time.Now(),
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil)
	h.GetCover(ctx)
	if rec.Code != http.StatusOK {
		t.Fatalf("GetCover(webp thumb) = %d, want 200", rec.Code)
	}

	stored, err := h.db.GetBook(book.ID)
	if err != nil || stored == nil || !stored.CoverThumbChecked || stored.CoverThumbPath != "" {
		t.Fatalf("expected CoverThumbChecked=true and empty CoverThumbPath, got %+v, err=%v", stored, err)
	}
}

func TestCoverFlightGroupDeduplicatesConcurrentCalls(t *testing.T) {
	var group coverFlightGroup[string]
	var executions atomic.Int32
	gate := make(chan struct{})

	const callers = 6
	results := make([]string, callers)
	var wg sync.WaitGroup
	wg.Add(callers)
	for i := range callers {
		go func(idx int) {
			defer wg.Done()
			val, err := group.Do("same-key", func() (string, error) {
				executions.Add(1)
				<-gate
				return "thumb.jpg", nil
			})
			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
			results[idx] = val
		}(i)
	}

	time.Sleep(15 * time.Millisecond)
	close(gate)
	wg.Wait()

	if got := executions.Load(); got != 1 {
		t.Fatalf("singleflight executions = %d, want 1", got)
	}
	for i, val := range results {
		if val != "thumb.jpg" {
			t.Fatalf("caller %d got %q, want thumb.jpg", i, val)
		}
	}
}

func TestResizeCoverThumbnailHandlesJPEGAndRGBA(t *testing.T) {
	// Create a 640x960 JPEG so jpeg.Decode yields *image.YCbCr.
	src := image.NewRGBA(image.Rect(0, 0, 640, 960))
	for y := 0; y < 960; y++ {
		for x := 0; x < 640; x++ {
			src.SetRGBA(x, y, color.RGBA{R: 180, G: 90, B: 60, A: 255})
		}
	}
	var jpgBuf bytes.Buffer
	if err := jpeg.Encode(&jpgBuf, src, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	decodedYCbCr, err := jpeg.Decode(&jpgBuf)
	if err != nil {
		t.Fatal(err)
	}

	for name, img := range map[string]image.Image{
		"ycbcr": decodedYCbCr,
		"rgba":  src,
	} {
		t.Run(name, func(t *testing.T) {
			resized := resizeCoverThumbnail(img, 320, 480)
			if resized.Bounds().Dx() != 320 || resized.Bounds().Dy() != 480 {
				t.Fatalf("got bounds %v, want 320x480", resized.Bounds())
			}
			center := resized.RGBAAt(160, 240)
			if center.R < 165 || center.R > 195 || center.G < 75 || center.G > 105 || center.B < 45 || center.B > 75 || center.A != 255 {
				t.Fatalf("unexpected center pixel %+v", center)
			}
		})
	}
}

func TestGetCoverReturnsETagAndNotModified(t *testing.T) {
	h, uploadDir := newCoverTestHandler(t)
	coverName := "book-etag.cover.jpg"
	if err := os.WriteFile(filepath.Join(uploadDir, coverName), writebackCoverJPEG(t), 0644); err != nil {
		t.Fatal(err)
	}
	book := &models.Book{
		ID:                "book-etag",
		UserID:            storage.PersonalLibrary,
		Title:             "ETag Book",
		Filename:          "book-etag.epub",
		Format:            "epub",
		CoverPath:         coverName,
		CoverThumbChecked: true,
		CreatedAt:         time.Now(),
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	rec1 := httptest.NewRecorder()
	ctx1, _ := gin.CreateTestContext(rec1)
	ctx1.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx1.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover", nil)
	h.GetCover(ctx1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("first GetCover = %d, want 200", rec1.Code)
	}
	etag := rec1.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected non-empty ETag on served cover")
	}

	rec2 := httptest.NewRecorder()
	ctx2, _ := gin.CreateTestContext(rec2)
	ctx2.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx2.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover", nil)
	ctx2.Request.Header.Set("If-None-Match", etag)
	h.GetCover(ctx2)
	if rec2.Code != http.StatusNotModified {
		t.Fatalf("conditional GetCover = %d, want 304", rec2.Code)
	}
	if rec2.Body.Len() != 0 {
		t.Fatalf("expected empty body on 304, got %d bytes", rec2.Body.Len())
	}
}

func TestCloseDrainsInFlightCoverCacheAndRejectsNewJobs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	h := NewBooksHandler(&config.Config{UploadDir: uploadDir, MaxUploadBytes: 10 << 20}, db)

	started := make(chan struct{})
	release := make(chan struct{})
	var completed atomic.Bool

	if ok := h.enqueueCoverCacheTask(func() {
		close(started)
		<-release
		completed.Store(true)
	}); !ok {
		t.Fatal("expected initial cover cache task to be accepted")
	}

	<-started

	closeDone := make(chan struct{})
	go func() {
		h.Close()
		close(closeDone)
	}()

	select {
	case <-closeDone:
		t.Fatal("Close() returned while cover cache task was still in flight")
	case <-time.After(30 * time.Millisecond):
	}

	close(release)

	select {
	case <-closeDone:
	case <-time.After(2 * time.Second):
		t.Fatal("Close() timed out waiting for in-flight cover cache task")
	}
	if !completed.Load() {
		t.Fatal("expected in-flight cover cache task to finish before Close() returned")
	}

	// New jobs after Close() must be rejected/skipped and never run.
	var postCloseRan atomic.Bool
	if ok := h.enqueueCoverCacheTask(func() {
		postCloseRan.Store(true)
	}); ok {
		t.Fatal("expected enqueueCoverCacheTask to return false after Close()")
	}
	if ok := h.enqueueCoverCache(&models.Book{ID: "after-close"}, []byte("jpeg"), "image/jpeg"); ok {
		t.Fatal("expected enqueueCoverCache to return false after Close()")
	}
	if postCloseRan.Load() {
		t.Fatal("post-Close cover cache task unexpectedly executed")
	}

	// Repeated Close() must remain safe and idempotent.
	h.Close()
}

func TestEnqueueCoverCacheBoundsConcurrencyAndDrainsExtractedCover(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	h := NewBooksHandler(&config.Config{UploadDir: uploadDir, MaxUploadBytes: 10 << 20}, db)

	started := make(chan struct{}, coverCacheMaxConcurrency)
	release := make(chan struct{})
	var active atomic.Int32
	var maxActive atomic.Int32

	for range coverCacheMaxConcurrency {
		if ok := h.enqueueCoverCacheTask(func() {
			cur := active.Add(1)
			for {
				prev := maxActive.Load()
				if cur <= prev || maxActive.CompareAndSwap(prev, cur) {
					break
				}
			}
			started <- struct{}{}
			<-release
			active.Add(-1)
		}); !ok {
			t.Fatal("expected slot within coverCacheMaxConcurrency to be accepted")
		}
	}

	for range coverCacheMaxConcurrency {
		<-started
	}

	var overflowRan atomic.Bool
	if ok := h.enqueueCoverCacheTask(func() {
		overflowRan.Store(true)
	}); ok {
		t.Fatal("expected enqueueCoverCacheTask to drop job when semaphore is full")
	}
	if overflowRan.Load() {
		t.Fatal("overflow cover cache task unexpectedly executed")
	}

	close(release)
	h.coverCacheWG.Wait()
	if got := maxActive.Load(); got > coverCacheMaxConcurrency {
		t.Fatalf("max concurrent cover cache tasks = %d, want <= %d", got, coverCacheMaxConcurrency)
	}

	// End-to-end: GetCover extracts cover, enqueues background cache write,
	// and Close() drains it so CoverPath is persisted before db.Close().
	epubBytes := buildReparseTestEPUB(t, "With Cover", "Author", writebackCoverJPEG(t))
	if err := os.WriteFile(filepath.Join(uploadDir, "with-cover.epub"), epubBytes, 0644); err != nil {
		t.Fatal(err)
	}
	book := &models.Book{
		ID:        "book-with-cover",
		UserID:    storage.PersonalLibrary,
		Title:     "With Cover",
		Filename:  "with-cover.epub",
		Format:    "epub",
		CreatedAt: time.Now(),
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover", nil)
	h.GetCover(ctx)
	if rec.Code != http.StatusOK {
		t.Fatalf("GetCover = %d, want 200", rec.Code)
	}

	h.Close()

	stored, err := h.db.GetBook(book.ID)
	if err != nil || stored == nil || stored.CoverPath == "" {
		t.Fatalf("expected extracted cover to be persisted before Close() returned, got %+v, err=%v", stored, err)
	}
}
