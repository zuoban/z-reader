package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
