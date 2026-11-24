package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

func openHandlerTestDB(t *testing.T) *storage.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "handlers.db")
	db, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("failed to close test db: %v", err)
		}
	})

	return db
}

func newBooksHandler(t *testing.T, cfg *config.Config, db *storage.DB) *BooksHandler {
	t.Helper()

	handler := NewBooksHandler(cfg, db)
	t.Cleanup(handler.Close)
	return handler
}

func TestBooksListIncludesLastReadAt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary
	bookA := &models.Book{
		ID:        "book-a",
		UserID:    userID,
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC().Add(-2 * time.Hour),
	}
	bookB := &models.Book{
		ID:        "book-b",
		UserID:    userID,
		Title:     "Beta",
		Filename:  "book-b.pdf",
		Format:    "pdf",
		Size:      256,
		CreatedAt: time.Now().UTC().Add(-1 * time.Hour),
	}
	if err := db.SaveBook(bookA); err != nil {
		t.Fatalf("failed to save book A: %v", err)
	}
	if err := db.SaveBook(bookB); err != nil {
		t.Fatalf("failed to save book B: %v", err)
	}

	lastReadAt := time.Now().UTC().Truncate(time.Second)
	if err := db.SaveProgress(&models.Progress{
		BookID:     bookA.ID,
		CFI:        "epubcfi(/6/2[chapter]!/4/2/6)",
		Percentage: 30,
		UpdatedAt:  lastReadAt,
	}, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	handler := newBooksHandler(t, &config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var books []models.Book
	if err := json.Unmarshal(recorder.Body.Bytes(), &books); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(books) != 2 {
		t.Fatalf("expected 2 books, got %d", len(books))
	}

	var found bool
	for _, book := range books {
		if book.ID != bookA.ID {
			continue
		}
		found = true
		if book.LastReadAt == nil || !book.LastReadAt.Equal(lastReadAt) {
			t.Fatalf("expected last_read_at %s, got %+v", lastReadAt, book.LastReadAt)
		}
	}

	if !found {
		t.Fatalf("book %s not found in response", bookA.ID)
	}
}

func TestBooksListReturnsCursorPageWhenRequested(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary
	for _, id := range []string{"book-a", "book-b"} {
		if err := db.SaveBook(&models.Book{
			ID:        id,
			UserID:    userID,
			Title:     id,
			Filename:  id + ".epub",
			Format:    "epub",
			Size:      128,
			CreatedAt: time.Now().UTC(),
		}); err != nil {
			t.Fatalf("failed to save %s: %v", id, err)
		}
	}

	handler := newBooksHandler(t, &config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books?limit=1", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	var page bookCursorPageResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &page); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(page.Books) != 1 || page.Books[0].ID != "book-b" || page.NextCursor != "book-b" {
		t.Fatalf("unexpected cursor page: %+v", page)
	}
}

// pausedBookUpdateBody lets another write finish before PATCH can apply its title.
type pausedBookUpdateBody struct {
	io.Reader
	started chan struct{}
	resume  <-chan struct{}
}

func (body *pausedBookUpdateBody) Read(p []byte) (int, error) {
	if body.started != nil {
		close(body.started)
		body.started = nil
		<-body.resume
	}
	return body.Reader.Read(p)
}

func TestBooksUpdateAfterConcurrentChange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, deleted := range []bool{false, true} {
		name := "merges latest fields"
		if deleted {
			name = "does not recreate deleted book"
		}
		t.Run(name, func(t *testing.T) {
			db := openHandlerTestDB(t)
			userID := storage.PersonalLibrary
			book := &models.Book{
				ID: "book-patch", UserID: userID, Title: "Original",
				Filename: "book-patch.epub", ContentHash: "test-hash",
			}
			if err := db.CreateBook(book); err != nil {
				t.Fatal(err)
			}
			handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)
			router := gin.New()
			router.PATCH("/api/books/:id", handler.Update)
			started, resume, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
			body := &pausedBookUpdateBody{Reader: strings.NewReader(`{"title":"Renamed"}`), started: started, resume: resume}
			req := httptest.NewRequest(http.MethodPatch, "/api/books/"+book.ID, body)
			req.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			go func() {
				defer close(done)
				router.ServeHTTP(recorder, req)
			}()
			defer func() {
				if resume != nil {
					close(resume)
				}
				<-done
			}()

			select {
			case <-started:
			case <-done:
				t.Fatalf("PATCH finished before reading the body: %d %s", recorder.Code, recorder.Body.String())
			case <-time.After(5 * time.Second):
				t.Fatal("PATCH did not begin reading the body")
			}
			category := "Updated category"
			lastReadAt := time.Now().UTC()
			if deleted {
				if err := db.DeleteBookData(book.ID, userID); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := db.UpdateBooksCategory([]string{book.ID}, userID, &category); err != nil {
					t.Fatal(err)
				}
				if err := db.SaveProgress(&models.Progress{BookID: book.ID, CFI: "epubcfi(/6/4)", UpdatedAt: lastReadAt}, userID); err != nil {
					t.Fatal(err)
				}
			}
			close(resume)
			resume = nil
			<-done

			stored, err := db.GetBookForUser(book.ID, userID)
			if err != nil {
				t.Fatal(err)
			}
			if deleted {
				if recorder.Code != http.StatusNotFound || stored != nil {
					t.Fatalf("expected deleted book to stay absent: status=%d book=%+v", recorder.Code, stored)
				}
				return
			}
			if recorder.Code != http.StatusOK || stored == nil || stored.Title != "Renamed" ||
				stored.Category == nil || *stored.Category != category ||
				stored.LastReadAt == nil || !stored.LastReadAt.Equal(lastReadAt) {
				t.Fatalf("PATCH did not preserve the latest fields: status=%d book=%+v", recorder.Code, stored)
			}
			results, _, err := db.SearchBooks(userID, "Renamed", "", 10, "recent_read", &category)
			if err != nil || len(results) != 1 || results[0].ID != book.ID {
				t.Fatalf("updated title and category missing from search: books=%+v error=%v", results, err)
			}
			summary, err := db.GetBookLibrarySummary(userID)
			if err != nil || summary.Total != 1 || summary.Categories[category] != 1 {
				t.Fatalf("unexpected library summary after update: %+v error=%v", summary, err)
			}
		})
	}
}

func TestBooksDeleteRemovesCoverAndProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary

	book := &models.Book{
		ID:        "book-delete",
		UserID:    userID,
		Title:     "Delete Me",
		Filename:  "book-delete.epub",
		Format:    "epub",
		Size:      128,
		CoverPath: "book-delete.cover.png",
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}
	if err := db.SaveProgress(&models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2[chapter]!/4/2/6)",
		Percentage: 44,
		UpdatedAt:  time.Now().UTC(),
	}, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	bookPath := filepath.Join(uploadDir, book.Filename)
	coverPath := filepath.Join(uploadDir, book.CoverPath)
	if err := os.WriteFile(bookPath, []byte("book"), 0600); err != nil {
		t.Fatalf("failed to write book file: %v", err)
	}
	if err := os.WriteFile(coverPath, []byte("cover"), 0600); err != nil {
		t.Fatalf("failed to write cover file: %v", err)
	}

	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	req := httptest.NewRequest(http.MethodDelete, "/api/books/"+book.ID, nil)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = req

	handler.Delete(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	if _, err := os.Stat(bookPath); !os.IsNotExist(err) {
		t.Fatalf("expected book file to be removed, stat err=%v", err)
	}
	if _, err := os.Stat(coverPath); !os.IsNotExist(err) {
		t.Fatalf("expected cover file to be removed, stat err=%v", err)
	}

	gotBook, err := db.GetBook(book.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if gotBook != nil {
		t.Fatalf("expected book to be deleted, got %+v", gotBook)
	}

	gotProgress, err := db.GetProgress(book.ID, userID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress != nil {
		t.Fatalf("expected progress to be deleted, got %+v", gotProgress)
	}
}

func TestBooksGetFileReturnsNotModifiedForMatchingETag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary
	book := &models.Book{
		ID:          "book-cache",
		UserID:      userID,
		Title:       "Cached Book",
		Filename:    "book-cache.epub",
		Format:      "epub",
		Size:        8,
		ContentHash: "abc123",
		CreatedAt:   time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, book.Filename), []byte("book"), 0600); err != nil {
		t.Fatalf("failed to write book file: %v", err)
	}

	for _, tc := range []struct {
		name, password, cacheControl string
	}{
		{name: "open library", cacheControl: "private, max-age=3600"},
		{name: "password protected", password: "test-password", cacheControl: "private, no-cache"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir, AccessPassword: tc.password}, db)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/file", nil)
			ctx.Request.Header.Set("If-None-Match", `"abc123"`)

			handler.GetFile(ctx)

			if recorder.Code != http.StatusNotModified {
				t.Fatalf("expected status 304, got %d body=%s", recorder.Code, recorder.Body.String())
			}
			if got := recorder.Header().Get("ETag"); got != `"abc123"` {
				t.Fatalf("expected ETag header, got %q", got)
			}
			if got := recorder.Header().Get("Cache-Control"); got != tc.cacheControl {
				t.Fatalf("Cache-Control = %q, want %q", got, tc.cacheControl)
			}
		})
	}
}

func TestBooksGetFileServesRequestedByteRange(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary
	book := &models.Book{
		ID:        "book-range",
		UserID:    userID,
		Title:     "Range Book",
		Filename:  "book-range.epub",
		Format:    "epub",
		Size:      10,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, book.Filename), []byte("0123456789"), 0600); err != nil {
		t.Fatalf("failed to write book file: %v", err)
	}

	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/file", nil)
	ctx.Request.Header.Set("Range", "bytes=3-")

	handler.GetFile(ctx)

	if recorder.Code != http.StatusPartialContent {
		t.Fatalf("expected status 206, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Body.String(); got != "3456789" {
		t.Fatalf("expected requested range body, got %q", got)
	}
	if got := recorder.Header().Get("Content-Range"); got != "bytes 3-9/10" {
		t.Fatalf("expected Content-Range header, got %q", got)
	}
	if got := recorder.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("expected Accept-Ranges header, got %q", got)
	}
}

func TestValidUploadName(t *testing.T) {
	if validUploadName("../secret.epub") {
		t.Fatal("expected traversal path to be rejected")
	}
	if !validUploadName("book.epub") {
		t.Fatal("expected a regular upload name to be accepted")
	}
}

func TestValidateUploadedBook(t *testing.T) {
	tests := []struct {
		name    string
		format  string
		content []byte
		wantErr bool
	}{
		{name: "pdf ok", format: "pdf", content: []byte("%PDF-1.7 test")},
		{name: "pdf mismatch", format: "pdf", content: []byte("not-a-pdf"), wantErr: true},
		{name: "epub ok", format: "epub", content: zipBytes(t, map[string][]byte{
			"mimetype":               []byte("application/epub+zip"),
			"META-INF/container.xml": []byte("<container/>"),
		})},
		{name: "macos packaged epub ok", format: "epub", content: zipBytes(t, map[string][]byte{
			"笔记的方法.epub/mimetype":               []byte("application/epub+zip"),
			"笔记的方法.epub/META-INF/container.xml": []byte("<container/>"),
		})},
		{name: "epub rejects plain zip", format: "epub", content: zipBytes(t, map[string][]byte{
			"readme.txt": []byte("not an epub"),
		}), wantErr: true},
		{name: "mobi ok", format: "mobi", content: append(make([]byte, 60), []byte("BOOKMOBI")...)},
		{name: "azw3 mismatch", format: "azw3", content: []byte("plain-text"), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := newMultipartFileHeader(t, "book.bin", tt.content)
			err := validateUploadedBook(file, tt.format, maxEPUBExpandedBytes)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateUploadedBook() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestInferBookFormatFromContentType(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		wantFormat  string
		wantExt     string
		wantOK      bool
	}{
		{
			name:        "epub with charset",
			contentType: "application/epub+zip; charset=binary",
			wantFormat:  "epub",
			wantExt:     ".epub",
			wantOK:      true,
		},
		{
			name:        "pdf",
			contentType: "application/pdf",
			wantFormat:  "pdf",
			wantExt:     ".pdf",
			wantOK:      true,
		},
		{
			name:        "unsupported",
			contentType: "application/zip",
			wantOK:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFormat, gotExt, gotOK := inferBookFormatFromContentType(tt.contentType)
			if gotFormat != tt.wantFormat || gotExt != tt.wantExt || gotOK != tt.wantOK {
				t.Fatalf(
					"inferBookFormatFromContentType() = %q, %q, %v; want %q, %q, %v",
					gotFormat,
					gotExt,
					gotOK,
					tt.wantFormat,
					tt.wantExt,
					tt.wantOK,
				)
			}
		})
	}
}

func TestInferUploadedBookFormatFromContent(t *testing.T) {
	file := newMultipartFileHeader(t, "download", validEPUBBytes(t))

	gotFormat, gotExt, gotOK := inferUploadedBookFormat(file, maxEPUBExpandedBytes)

	if gotFormat != "epub" || gotExt != ".epub" || !gotOK {
		t.Fatalf(
			"inferUploadedBookFormat() = %q, %q, %v; want epub, .epub, true",
			gotFormat,
			gotExt,
			gotOK,
		)
	}
}

func TestValidateEPUBArchiveRejectsExpandedContent(t *testing.T) {
	content := zipBytes(t, map[string][]byte{
		"mimetype":               []byte("application/epub+zip"),
		"META-INF/container.xml": []byte("<container/>"),
		"OEBPS/chapter.xhtml":    []byte("12345"),
	})

	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("failed to open test EPUB: %v", err)
	}

	if err := validateEPUBArchive(reader, 4); err == nil {
		t.Fatal("expected expanded EPUB content to be rejected")
	}
}

func TestBooksUploadRejectsDuplicateContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	userID := storage.PersonalLibrary
	content := validEPUBBytes(t)

	firstRecorder := httptest.NewRecorder()
	firstCtx, _ := gin.CreateTestContext(firstRecorder)

	firstCtx.Request = newMultipartUploadRequest(t, "duplicate.epub", content)

	handler.Upload(firstCtx)

	if firstRecorder.Code != http.StatusOK {
		t.Fatalf("expected first upload status 200, got %d body=%s", firstRecorder.Code, firstRecorder.Body.String())
	}

	secondRecorder := httptest.NewRecorder()
	secondCtx, _ := gin.CreateTestContext(secondRecorder)

	secondCtx.Request = newMultipartUploadRequest(t, "renamed.epub", content)

	handler.Upload(secondCtx)

	if secondRecorder.Code != http.StatusConflict {
		t.Fatalf("expected duplicate upload status 409, got %d body=%s", secondRecorder.Code, secondRecorder.Body.String())
	}

	var resp response.ErrorResponse
	if err := json.Unmarshal(secondRecorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode duplicate response: %v", err)
	}
	if resp.Message == "" {
		t.Fatal("expected duplicate response message")
	}

	books, err := db.ListBooks(userID)
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(books) != 1 {
		t.Fatalf("expected 1 book after duplicate upload, got %d", len(books))
	}
	if books[0].ContentHash == "" {
		t.Fatal("expected uploaded book to store content hash")
	}
}

func TestBooksUploadRejectsLegacyDuplicateContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	userID := storage.PersonalLibrary
	content := validEPUBBytes(t)
	legacyBook := &models.Book{
		ID:        "legacy-book",
		UserID:    userID,
		Title:     "Legacy Book",
		Filename:  "legacy.epub",
		Format:    "epub",
		Size:      int64(len(content)),
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(legacyBook); err != nil {
		t.Fatalf("failed to save legacy book: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, legacyBook.Filename), content, 0600); err != nil {
		t.Fatalf("failed to write legacy book file: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = newMultipartUploadRequest(t, "legacy-copy.epub", content)

	handler.Upload(ctx)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected duplicate upload status 409, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	got, err := db.GetBook(legacyBook.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if got == nil || got.ContentHash == "" {
		t.Fatalf("expected legacy book hash to be backfilled, got %+v", got)
	}
}

func TestBooksUploadNormalizesMacOSPackagedEPUB(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	userID := storage.PersonalLibrary

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = newMultipartUploadRequest(t, "笔记的方法.epub.zip", macOSPackagedEPUBBytes(t))

	handler.Upload(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected upload status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	books, err := db.ListBooks(userID)
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(books) != 1 {
		t.Fatalf("expected 1 uploaded book, got %d", len(books))
	}
	if books[0].Format != "epub" || filepath.Ext(books[0].Filename) != ".epub" {
		t.Fatalf("expected normalized epub book, got %+v", books[0])
	}

	reader, err := zip.OpenReader(filepath.Join(uploadDir, books[0].Filename))
	if err != nil {
		t.Fatalf("failed to open saved epub: %v", err)
	}
	defer reader.Close()

	names := make(map[string]bool)
	for _, entry := range reader.File {
		names[entry.Name] = true
		if strings.HasPrefix(entry.Name, "笔记的方法.epub/") {
			t.Fatalf("expected packaged epub root to be stripped, got entry %q", entry.Name)
		}
	}
	if !names["mimetype"] || !names["META-INF/container.xml"] {
		t.Fatalf("expected saved epub root entries, got %#v", names)
	}
}

func TestBooksUploadRejectsOversizedRequestBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{
		UploadDir:      uploadDir,
		MaxUploadBytes: 8,
	}, db)

	content := append([]byte{'P', 'K', 3, 4}, bytes.Repeat([]byte("x"), int(multipartOverhead)+16)...)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = newMultipartUploadRequest(t, "too-large.epub", content)

	handler.Upload(ctx)

	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestValidateUploadedCover(t *testing.T) {
	pngHeader := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0, 0, 0, 0, 'I', 'H', 'D', 'R',
	}

	if err := validateUploadedCover(newMultipartFileHeader(t, "cover.png", pngHeader), ".png"); err != nil {
		t.Fatalf("expected PNG cover to validate, got %v", err)
	}

	err := validateUploadedCover(newMultipartFileHeader(t, "cover.png", []byte("not-an-image")), ".png")
	if err == nil {
		t.Fatalf("expected invalid PNG cover to fail validation")
	}
}

func TestExtractEPUBCoverDetectsContentType(t *testing.T) {
	epubPath := filepath.Join(t.TempDir(), "cover.epub")
	pngHeader := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0, 0, 0, 0, 'I', 'H', 'D', 'R',
	}
	writeZipFile(t, epubPath, map[string][]byte{
		"OEBPS/cover.png": pngHeader,
	})

	file, err := os.Open(epubPath)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	data, contentType, err := extractEPUBCover(file)
	if err != nil {
		t.Fatalf("extractEPUBCover returned error: %v", err)
	}
	if contentType != "image/png" {
		t.Fatalf("expected image/png content type, got %q", contentType)
	}
	if !bytes.Equal(data, pngHeader) {
		t.Fatal("expected extracted cover bytes to match input")
	}
}

func TestExtractEPUBPreviewReadsMetadataAndCoverTogether(t *testing.T) {
	epubPath := filepath.Join(t.TempDir(), "preview.epub")
	pngHeader := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0, 0, 0, 0, 'I', 'H', 'D', 'R',
	}
	writeZipFile(t, epubPath, map[string][]byte{
		"OEBPS/content.opf": []byte(`<?xml version="1.0"?><package><metadata><title>Preview title</title><creator>Preview author</creator></metadata></package>`),
		"OEBPS/cover.png":   pngHeader,
	})

	file, err := os.Open(epubPath)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	metadata, cover, contentType, err := extractBookPreview(file, "epub")
	if err != nil {
		t.Fatalf("extractBookPreview returned error: %v", err)
	}
	if metadata.Title != "Preview title" || metadata.Author != "Preview author" {
		t.Fatalf("unexpected metadata: %+v", metadata)
	}
	if contentType != "image/png" || !bytes.Equal(cover, pngHeader) {
		t.Fatalf("unexpected cover: content type=%q bytes=%v", contentType, cover)
	}
}

func TestCreateCoverThumbnailDownscalesJPEG(t *testing.T) {
	uploadDir := t.TempDir()
	coverPath := filepath.Join(uploadDir, "book-a.cover.jpg")
	imageFile, err := os.Create(coverPath)
	if err != nil {
		t.Fatal(err)
	}
	source := image.NewRGBA(image.Rect(0, 0, 640, 960))
	for y := 0; y < 960; y++ {
		for x := 0; x < 640; x++ {
			source.Set(x, y, color.RGBA{R: 70, G: 120, B: 180, A: 255})
		}
	}
	if err := jpeg.Encode(imageFile, source, nil); err != nil {
		t.Fatal(err)
	}
	if err := imageFile.Close(); err != nil {
		t.Fatal(err)
	}

	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, openHandlerTestDB(t))
	thumbnailFilename, err := handler.createCoverThumbnail("book-a", "book-a.cover.jpg")
	if err != nil {
		t.Fatalf("createCoverThumbnail returned error: %v", err)
	}
	if thumbnailFilename == "" {
		t.Fatal("expected a thumbnail filename")
	}
	thumbnailFile, err := os.Open(filepath.Join(uploadDir, thumbnailFilename))
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := image.DecodeConfig(thumbnailFile)
	thumbnailFile.Close()
	if err != nil {
		t.Fatal(err)
	}
	if config.Width != coverThumbnailMaxWidth || config.Height != 480 {
		t.Fatalf("unexpected thumbnail dimensions: %+v", config)
	}
}

func TestReadZipFileWithLimitRejectsOversizedEntry(t *testing.T) {
	zipPath := filepath.Join(t.TempDir(), "oversized.zip")
	writeZipFile(t, zipPath, map[string][]byte{
		"content.opf": []byte("12345"),
	})

	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatalf("failed to open zip: %v", err)
	}
	defer reader.Close()

	if len(reader.File) != 1 {
		t.Fatalf("expected 1 zip entry, got %d", len(reader.File))
	}
	if _, err := readZipFileWithLimit(reader.File[0], 4); err == nil {
		t.Fatal("expected oversized zip entry to be rejected")
	}
}

func writeZipFile(t *testing.T, path string, files map[string][]byte) {
	t.Helper()

	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("failed to create zip file: %v", err)
	}
	defer file.Close()

	writer := zip.NewWriter(file)
	for name, content := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("failed to create zip entry: %v", err)
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatalf("failed to write zip entry: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}
}

func zipBytes(t *testing.T, files map[string][]byte) []byte {
	t.Helper()

	var body bytes.Buffer
	writer := zip.NewWriter(&body)
	for name, content := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("failed to create zip entry: %v", err)
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatalf("failed to write zip entry: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}
	return body.Bytes()
}

func validEPUBBytes(t *testing.T) []byte {
	t.Helper()

	return zipBytes(t, map[string][]byte{
		"mimetype":               []byte("application/epub+zip"),
		"META-INF/container.xml": []byte("<container/>"),
	})
}

func macOSPackagedEPUBBytes(t *testing.T) []byte {
	t.Helper()

	return zipBytes(t, map[string][]byte{
		"笔记的方法.epub/mimetype":               []byte("application/epub+zip"),
		"笔记的方法.epub/META-INF/container.xml": []byte("<container/>"),
	})
}

func newMultipartUploadRequest(t *testing.T, filename string, content []byte) *http.Request {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("part.Write returned error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close returned error: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/books", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func newMultipartFileHeader(t *testing.T, filename string, content []byte) *multipart.FileHeader {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("part.Write returned error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close returned error: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(int64(len(body.Bytes()) + 1024)); err != nil {
		t.Fatalf("ParseMultipartForm returned error: %v", err)
	}

	file, header, err := req.FormFile("file")
	if err != nil {
		t.Fatalf("FormFile returned error: %v", err)
	}
	_ = file.Close()

	return header
}
