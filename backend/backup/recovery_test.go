package backup_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/backup"
	"z-reader/backend/config"
	"z-reader/backend/handlers"
	"z-reader/backend/middleware"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func TestCreateVerifyRestoreAndReady(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	sourceUploads := filepath.Join(root, "source-uploads")
	if err := os.MkdirAll(filepath.Join(sourceUploads, "nested"), 0700); err != nil {
		t.Fatal(err)
	}
	const bookFile = "nested/book.epub"
	bookContent, err := os.ReadFile("../../frontend/tests/e2e/fixtures/sample.epub")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceUploads, bookFile), bookContent, 0600); err != nil {
		t.Fatal(err)
	}

	sourceDB, err := storage.Open(filepath.Join(root, "source.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sourceDB != nil {
			_ = sourceDB.Close()
		}
	})
	if err := sourceDB.CreateBook(&models.Book{
		ID:        "book-1",
		UserID:    storage.PersonalLibrary,
		Title:     "Restored book",
		Filename:  bookFile,
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}
	const testPassword = "restore-test-password"
	sourceRouter := gin.New()
	sourceRouter.POST("/api/auth/login", handlers.NewAuthHandler(&config.Config{AccessPassword: testPassword}, sourceDB).Login)
	login := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"password":"restore-test-password"}`))
	login.Header.Set("Content-Type", "application/json")
	loginResponse := httptest.NewRecorder()
	sourceRouter.ServeHTTP(loginResponse, login)
	cookies := loginResponse.Result().Cookies()
	if loginResponse.Code != http.StatusOK || len(cookies) != 1 {
		t.Fatalf("source login failed with status %d, cookie count %d", loginResponse.Code, len(cookies))
	}

	backupDir, err := backup.Create(sourceDB, backup.Config{
		Dir:       filepath.Join(root, "backups"),
		UploadDir: sourceUploads,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := sourceDB.Close(); err != nil {
		t.Fatal(err)
	}
	sourceDB = nil
	if err := backup.Verify(backupDir); err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}

	restoredDBPath := filepath.Join(root, "restored", "data.db")
	restoredUploads := filepath.Join(root, "restored-uploads")
	if err := backup.Restore(backupDir, backup.RestoreConfig{
		DBPath:    restoredDBPath,
		UploadDir: restoredUploads,
	}); err != nil {
		t.Fatalf("Restore returned error: %v", err)
	}
	if err := backup.Restore(backupDir, backup.RestoreConfig{
		DBPath:    restoredDBPath,
		UploadDir: restoredUploads,
	}); err == nil {
		t.Fatal("expected Restore to refuse existing targets")
	}

	restoredDB, err := storage.Open(restoredDBPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = restoredDB.Close() })
	if err := restoredDB.Check(); err != nil {
		t.Fatalf("restored database failed readiness check: %v", err)
	}
	books, err := restoredDB.ListBooks(storage.PersonalLibrary)
	if err != nil || len(books) != 1 || books[0].Title != "Restored book" {
		t.Fatalf("restored books = %+v, err = %v", books, err)
	}

	bookHandler := handlers.NewBooksHandler(&config.Config{UploadDir: restoredUploads}, restoredDB)
	t.Cleanup(bookHandler.Close)
	router := gin.New()
	router.GET("/readyz", handlers.Ready(restoredDB, restoredUploads))
	router.GET("/api/books/:id/file", middleware.AuthRequired(restoredDB, testPassword), bookHandler.GetFile)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("expected restored service to be ready, got %d: %s", response.Code, response.Body.String())
	}

	download := httptest.NewRequest(http.MethodGet, "/api/books/"+books[0].ID+"/file", nil)
	download.AddCookie(cookies[0])
	response = httptest.NewRecorder()
	router.ServeHTTP(response, download)
	if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), bookContent) {
		t.Fatalf("restored download status=%d size=%d, want status 200 and the original %d bytes", response.Code, response.Body.Len(), len(bookContent))
	}
}
