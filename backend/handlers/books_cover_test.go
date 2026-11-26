package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
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
	"z-reader/backend/internal/singleflight"
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
	t.Cleanup(func() {
		if err := h.Close(context.Background()); err != nil {
			t.Errorf("BooksHandler.Close failed: %v", err)
		}
	})
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
	var group singleflight.Group[string]
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
		_ = h.Close(context.Background())
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
	if err := h.Close(context.Background()); err != nil {
		t.Fatalf("repeated Close returned error: %v", err)
	}
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

	if err := h.Close(context.Background()); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	stored, err := h.db.GetBook(book.ID)
	if err != nil || stored == nil || stored.CoverPath == "" {
		t.Fatalf("expected extracted cover to be persisted before Close() returned, got %+v, err=%v", stored, err)
	}
}

func encodeLargeTestCoverJPEG(t *testing.T, width, height int, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatalf("encode large jpeg: %v", err)
	}
	return buf.Bytes()
}

func TestCoverThumbnailRespectsCoverCacheSemAndFallsBackWhenBusyOrCanceled(t *testing.T) {
	largeJPEG := encodeLargeTestCoverJPEG(t, 640, 480, color.RGBA{R: 40, G: 120, B: 200, A: 255})

	t.Run("busy semaphore times out and falls back to original without marking checked", func(t *testing.T) {
		h, uploadDir := newCoverTestHandler(t)
		coverName := "book-busy.cover.jpg"
		if err := os.WriteFile(filepath.Join(uploadDir, coverName), largeJPEG, 0644); err != nil {
			t.Fatal(err)
		}
		book := &models.Book{
			ID:        "book-busy",
			UserID:    storage.PersonalLibrary,
			Title:     "Busy Cover",
			Filename:  "busy.epub",
			Format:    "epub",
			CoverPath: coverName,
			CreatedAt: time.Now().UTC(),
		}
		if err := h.db.CreateBook(book); err != nil {
			t.Fatal(err)
		}

		// Saturate all semaphore slots.
		for range coverCacheMaxConcurrency {
			h.coverCacheSem <- struct{}{}
		}

		reqCtx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
		defer cancel()

		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil).WithContext(reqCtx)
		h.GetCover(ctx)

		if rec.Code != http.StatusOK {
			t.Fatalf("GetCover while busy = %d, want 200", rec.Code)
		}
		if !bytes.Equal(rec.Body.Bytes(), largeJPEG) {
			t.Fatalf("expected original cover bytes on fallback, got %d bytes (want %d)", rec.Body.Len(), len(largeJPEG))
		}
		if got := len(h.coverCacheSem); got != coverCacheMaxConcurrency {
			t.Fatalf("semaphore occupancy = %d, want %d (no leak)", got, coverCacheMaxConcurrency)
		}

		stored, err := h.db.GetBook(book.ID)
		if err != nil || stored == nil {
			t.Fatalf("GetBook = %+v, err = %v", stored, err)
		}
		if stored.CoverThumbPath != "" || stored.CoverThumbChecked {
			t.Fatalf("expected CoverThumbChecked=false and empty thumb after timeout fallback, got %+v", stored)
		}

		// Release all slots and verify a subsequent request generates the thumbnail.
		for range coverCacheMaxConcurrency {
			<-h.coverCacheSem
		}

		rec2 := httptest.NewRecorder()
		ctx2, _ := gin.CreateTestContext(rec2)
		ctx2.Params = gin.Params{{Key: "id", Value: book.ID}}
		ctx2.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil)
		h.GetCover(ctx2)
		if rec2.Code != http.StatusOK {
			t.Fatalf("GetCover after release = %d, want 200", rec2.Code)
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(rec2.Body.Bytes()))
		if err != nil {
			t.Fatalf("decode served thumbnail: %v", err)
		}
		if cfg.Width != coverThumbnailMaxWidth {
			t.Fatalf("served thumbnail width = %d, want %d", cfg.Width, coverThumbnailMaxWidth)
		}
		if got := len(h.coverCacheSem); got != 0 {
			t.Fatalf("semaphore occupancy after thumb = %d, want 0", got)
		}
	})

	t.Run("canceling one caller in shared flight does not fail sibling caller", func(t *testing.T) {
		h, uploadDir := newCoverTestHandler(t)
		coverName := "book-shared.cover.jpg"
		if err := os.WriteFile(filepath.Join(uploadDir, coverName), largeJPEG, 0644); err != nil {
			t.Fatal(err)
		}
		book := &models.Book{
			ID:        "book-shared",
			UserID:    storage.PersonalLibrary,
			Title:     "Shared Flight",
			Filename:  "shared.epub",
			Format:    "epub",
			CoverPath: coverName,
			CreatedAt: time.Now().UTC(),
		}
		if err := h.db.CreateBook(book); err != nil {
			t.Fatal(err)
		}

		for range coverCacheMaxConcurrency {
			h.coverCacheSem <- struct{}{}
		}

		ctx1, cancel1 := context.WithCancel(context.Background())
		rec1 := httptest.NewRecorder()
		done1 := make(chan struct{})
		go func() {
			defer close(done1)
			c, _ := gin.CreateTestContext(rec1)
			c.Params = gin.Params{{Key: "id", Value: book.ID}}
			c.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil).WithContext(ctx1)
			h.GetCover(c)
		}()

		rec2 := httptest.NewRecorder()
		done2 := make(chan struct{})
		go func() {
			defer close(done2)
			c, _ := gin.CreateTestContext(rec2)
			c.Params = gin.Params{{Key: "id", Value: book.ID}}
			c.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover?size=thumb", nil)
			h.GetCover(c)
		}()

		// Wait until both callers have joined the singleflight entry.
		deadline := time.Now().Add(2 * time.Second)
		for {
			waiters := h.coverThumbFlights.Waiters(book.ID + ":" + book.CoverPath)
			if waiters == 2 {
				break
			}
			if time.Now().After(deadline) {
				t.Fatalf("timed out waiting for both callers to join flight (waiters=%d)", waiters)
			}
			time.Sleep(5 * time.Millisecond)
		}

		// Cancel caller 1; it should fall back to original cover while caller 2 continues waiting.
		cancel1()
		select {
		case <-done1:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for canceled caller 1 to return")
		}
		if rec1.Code != http.StatusOK || !bytes.Equal(rec1.Body.Bytes(), largeJPEG) {
			t.Fatalf("canceled caller 1 = status %d len %d, want 200 with original cover (%d bytes)", rec1.Code, rec1.Body.Len(), len(largeJPEG))
		}
		select {
		case <-done2:
			t.Fatal("caller 2 completed before any semaphore slot was released")
		case <-time.After(25 * time.Millisecond):
		}

		// Free one slot; caller 2 should finish and receive the generated thumbnail.
		<-h.coverCacheSem
		select {
		case <-done2:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for caller 2 to complete")
		}
		if rec2.Code != http.StatusOK {
			t.Fatalf("caller 2 status = %d, want 200", rec2.Code)
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(rec2.Body.Bytes()))
		if err != nil {
			t.Fatalf("decode caller 2 thumbnail: %v", err)
		}
		if cfg.Width != coverThumbnailMaxWidth {
			t.Fatalf("caller 2 thumbnail width = %d, want %d", cfg.Width, coverThumbnailMaxWidth)
		}

		// Release remaining test slots.
		for range coverCacheMaxConcurrency - 1 {
			<-h.coverCacheSem
		}
		if got := len(h.coverCacheSem); got != 0 {
			t.Fatalf("semaphore occupancy = %d, want 0", got)
		}
	})

	t.Run("concurrent requests across books respect bounded semaphore and closed handler", func(t *testing.T) {
		h, uploadDir := newCoverTestHandler(t)
		h.coverCacheSem = nil // verify lazy initialization under coverCacheMu

		const totalBooks = 6
		for i := range totalBooks {
			coverName := fmt.Sprintf("book-conc-%d.cover.jpg", i)
			if err := os.WriteFile(filepath.Join(uploadDir, coverName), largeJPEG, 0644); err != nil {
				t.Fatal(err)
			}
			book := &models.Book{
				ID:        fmt.Sprintf("book-conc-%d", i),
				UserID:    storage.PersonalLibrary,
				Title:     fmt.Sprintf("Conc %d", i),
				Filename:  fmt.Sprintf("conc-%d.epub", i),
				Format:    "epub",
				CoverPath: coverName,
				CreatedAt: time.Now().UTC(),
			}
			if err := h.db.CreateBook(book); err != nil {
				t.Fatal(err)
			}
		}

		var wg sync.WaitGroup
		errs := make(chan error, totalBooks)
		for i := range totalBooks {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				rec := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(rec)
				bookID := fmt.Sprintf("book-conc-%d", idx)
				c.Params = gin.Params{{Key: "id", Value: bookID}}
				c.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+bookID+"/cover?size=thumb", nil)
				h.GetCover(c)
				if rec.Code != http.StatusOK {
					errs <- fmt.Errorf("book %s status = %d", bookID, rec.Code)
					return
				}
				cfg, _, err := image.DecodeConfig(bytes.NewReader(rec.Body.Bytes()))
				if err != nil {
					errs <- fmt.Errorf("book %s decode: %w", bookID, err)
					return
				}
				if cfg.Width != coverThumbnailMaxWidth {
					errs <- fmt.Errorf("book %s width = %d, want %d", bookID, cfg.Width, coverThumbnailMaxWidth)
				}
			}(i)
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			t.Fatal(err)
		}
		if h.coverCacheSem == nil || len(h.coverCacheSem) != 0 {
			t.Fatalf("expected lazily initialized empty coverCacheSem, got %v len=%d", h.coverCacheSem, len(h.coverCacheSem))
		}

		// After Close(), synchronous thumbnail generation falls back cleanly.
		closedBook := &models.Book{
			ID:        "book-closed-thumb",
			UserID:    storage.PersonalLibrary,
			Title:     "Closed",
			Filename:  "closed.epub",
			Format:    "epub",
			CoverPath: "book-conc-0.cover.jpg",
			CreatedAt: time.Now().UTC(),
		}
		if err := h.db.CreateBook(closedBook); err != nil {
			t.Fatal(err)
		}
		if err := h.Close(context.Background()); err != nil {
			t.Fatalf("Close returned error: %v", err)
		}

		got, err := h.cacheCoverThumbnail(context.Background(), closedBook)
		if err != nil || got != closedBook || got.CoverThumbChecked || got.CoverThumbPath != "" {
			t.Fatalf("cacheCoverThumbnail after Close = (%+v, %v), want fallback snapshot", got, err)
		}
	})
}

func TestCoverDeletePreventsBackgroundCacheResurrection(t *testing.T) {
	h, uploadDir := newCoverTestHandler(t)
	jpegData := writebackCoverJPEG(t)

	book := &models.Book{
		ID:        "book-del-cover",
		UserID:    storage.PersonalLibrary,
		Title:     "Deleted Cover Book",
		Filename:  "deleted-cover.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	// Upload an initial cover, then explicitly delete it.
	recUpload := httptest.NewRecorder()
	ctxUpload, _ := gin.CreateTestContext(recUpload)
	ctxUpload.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctxUpload.Request = newMultipartUploadRequest(t, "cover.jpg", jpegData)
	h.UploadCover(ctxUpload)
	if recUpload.Code != http.StatusOK {
		t.Fatalf("UploadCover = %d %s", recUpload.Code, recUpload.Body.String())
	}

	recDelete := httptest.NewRecorder()
	ctxDelete, _ := gin.CreateTestContext(recDelete)
	ctxDelete.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctxDelete.Request = httptest.NewRequest(http.MethodDelete, "/api/books/"+book.ID+"/cover", nil)
	h.DeleteCover(ctxDelete)
	if recDelete.Code != http.StatusOK {
		t.Fatalf("DeleteCover = %d %s", recDelete.Code, recDelete.Body.String())
	}

	// Prepare a candidate cover as if background extraction finished after DeleteCover.
	candidate, err := h.prepareExtractedCover(book.ID, jpegData, "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if candidate.path == "" {
		t.Fatal("expected prepared candidate cover path")
	}

	updated, err := h.commitCover(book, candidate, false)
	if err != nil {
		t.Fatalf("commitCover returned error: %v", err)
	}
	if updated.CoverPath != "" || updated.CoverThumbPath != "" || !updated.CoverMissing {
		t.Fatalf("deleted cover was resurrected by background commit: %+v", updated)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, candidate.path)); !os.IsNotExist(err) {
		t.Fatalf("expected rejected candidate cover %q to be removed, stat err=%v", candidate.path, err)
	}
	if candidate.thumb != "" {
		if _, err := os.Stat(filepath.Join(uploadDir, candidate.thumb)); !os.IsNotExist(err) {
			t.Fatalf("expected rejected candidate thumb %q to be removed, stat err=%v", candidate.thumb, err)
		}
	}

	// Also verify cacheExtractedCover respects CoverMissing and leaves no files behind.
	h.cacheExtractedCover(book, jpegData, "image/jpeg")
	stored, err := h.db.GetBook(book.ID)
	if err != nil || stored == nil || stored.CoverPath != "" || !stored.CoverMissing {
		t.Fatalf("deleted cover was resurrected by cacheExtractedCover: %+v, err=%v", stored, err)
	}
	entries, err := os.ReadDir(uploadDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected uploadDir to have no orphan cover files, got %d entries", len(entries))
	}
}

func TestWriteNotModifiedIfETagMatches(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const rawETag = "deadbeef1234"
	tests := []struct {
		name    string
		headers []string
		want304 bool
	}{
		{name: "exact match", headers: []string{`"deadbeef1234"`}, want304: true},
		{name: "weak ETag match", headers: []string{`W/"deadbeef1234"`}, want304: true},
		{name: "comma-separated list with weak match", headers: []string{`"other", W/"deadbeef1234", "third"`}, want304: true},
		{name: "quoted tag containing comma before match", headers: []string{`"a,b", "deadbeef1234"`}, want304: true},
		{name: "wildcard star", headers: []string{`*`}, want304: true},
		{name: "wildcard star with whitespace", headers: []string{`  *  `}, want304: true},
		{name: "multiple header lines", headers: []string{`"first"`, `W/"deadbeef1234"`}, want304: true},
		{name: "empty header", headers: nil, want304: false},
		{name: "non-matching single tag", headers: []string{`"other"`}, want304: false},
		{name: "non-matching multi-tag list", headers: []string{`"first", W/"second", "third"`}, want304: false},
		{name: "lowercase weak prefix rejected per RFC 9110", headers: []string{`w/"deadbeef1234"`}, want304: false},
		{name: "unquoted token rejected", headers: []string{`deadbeef1234`}, want304: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			req := httptest.NewRequest(http.MethodGet, "/api/books/1/cover", nil)
			for _, h := range tc.headers {
				req.Header.Add("If-None-Match", h)
			}
			ctx.Request = req

			serveContentWithETag(ctx, "cover.jpg", time.Time{}, rawETag, bytes.NewReader([]byte("cover-bytes")))
			if gotETag := rec.Header().Get("ETag"); gotETag != `"`+rawETag+`"` {
				t.Fatalf("ETag header = %q, want %q", gotETag, `"`+rawETag+`"`)
			}
			if tc.want304 && rec.Code != http.StatusNotModified {
				t.Fatalf("status = %d, want 304", rec.Code)
			}
			if !tc.want304 && rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200 for non-matching header %v", rec.Code, tc.headers)
			}
		})
	}
}
