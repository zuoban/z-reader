package backup

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func TestCreateAndVerifyBackup(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	if err := os.MkdirAll(uploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, "book.epub"), []byte("book-content"), 0600); err != nil {
		t.Fatal(err)
	}

	db, err := storage.Open(filepath.Join(root, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.CreateBook(&models.Book{
		ID:        "book-1",
		UserID:    "user-1",
		Title:     "Backup book",
		Filename:  "book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	backupDir, err := Create(db, Config{
		Dir:           filepath.Join(root, "backups"),
		UploadDir:     uploadDir,
		RetentionDays: 7,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if err := Verify(backupDir); err != nil {
		t.Fatalf("Verify returned error: %v", err)
	}

	if err := os.WriteFile(filepath.Join(backupDir, "uploads", "book.epub"), []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Verify(backupDir); err == nil {
		t.Fatal("expected Verify to reject a changed backup file")
	}
}
