package backup_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/backup"
	"z-reader/backend/handlers"
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
	if err := os.WriteFile(filepath.Join(sourceUploads, "nested", "book.epub"), []byte("book"), 0600); err != nil {
		t.Fatal(err)
	}

	sourceDB, err := storage.Open(filepath.Join(root, "source.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := sourceDB.CreateBook(&models.Book{
		ID:        "book-1",
		UserID:    "user-1",
		Title:     "Restored book",
		Filename:  "book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		sourceDB.Close()
		t.Fatal(err)
	}
	if err := sourceDB.SaveSession(&models.Session{
		Token:     "restored-session",
		UserID:    "user-1",
		Username:  "reader",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}); err != nil {
		sourceDB.Close()
		t.Fatal(err)
	}

	backupDir, err := backup.Create(sourceDB, backup.Config{
		Dir:       filepath.Join(root, "backups"),
		UploadDir: sourceUploads,
	})
	if err != nil {
		sourceDB.Close()
		t.Fatal(err)
	}
	if err := sourceDB.Close(); err != nil {
		t.Fatal(err)
	}
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
	books, err := restoredDB.ListBooks("user-1")
	if err != nil || len(books) != 1 || books[0].Title != "Restored book" {
		t.Fatalf("restored books = %+v, err = %v", books, err)
	}
	if session, err := restoredDB.GetSession("restored-session"); err != nil || session == nil {
		t.Fatalf("restored session = %+v, err = %v", session, err)
	}
	content, err := os.ReadFile(filepath.Join(restoredUploads, "nested", "book.epub"))
	if err != nil || string(content) != "book" {
		t.Fatalf("restored upload = %q, err = %v", content, err)
	}

	router := gin.New()
	router.GET("/readyz", handlers.Ready(restoredDB, restoredUploads))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("expected restored service to be ready, got %d: %s", response.Code, response.Body.String())
	}
}
