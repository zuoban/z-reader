package handlers

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
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

func TestAuthLogoutAcceptsBearerToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	session := &models.Session{
		Token:     "session-token",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	handler := NewAuthHandler(&config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	req.Header.Set("Authorization", "Bearer "+session.Token)
	ctx.Request = req

	handler.Logout(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected session to be deleted, got %+v", got)
	}
}

func TestBooksListIncludesLastReadAt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	bookA := &models.Book{
		ID:        "book-a",
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC().Add(-2 * time.Hour),
	}
	bookB := &models.Book{
		ID:        "book-b",
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
	}); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	handler := NewBooksHandler(&config.Config{}, db)
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

func TestBooksDeleteRemovesCoverAndProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)

	book := &models.Book{
		ID:        "book-delete",
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
	}); err != nil {
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

	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
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

	gotProgress, err := db.GetProgress(book.ID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress != nil {
		t.Fatalf("expected progress to be deleted, got %+v", gotProgress)
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
		{name: "epub ok", format: "epub", content: []byte{'P', 'K', 3, 4, 0, 0}},
		{name: "mobi ok", format: "mobi", content: append(make([]byte, 60), []byte("BOOKMOBI")...)},
		{name: "azw3 mismatch", format: "azw3", content: []byte("plain-text"), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := newMultipartFileHeader(t, "book.bin", tt.content)
			err := validateUploadedBook(file, tt.format)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateUploadedBook() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
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
