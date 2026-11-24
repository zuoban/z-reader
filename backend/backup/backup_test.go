package backup

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
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

	manifestPath := filepath.Join(backupDir, manifestName)
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"data.db", "data.db.sessions", "uploads/book.epub"} {
		t.Run("manifest requires "+name, func(t *testing.T) {
			var manifest Manifest
			if err := json.Unmarshal(manifestData, &manifest); err != nil {
				t.Fatal(err)
			}
			delete(manifest.Files, name)
			data, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(manifestPath, data, 0600); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := os.WriteFile(manifestPath, manifestData, 0600); err != nil {
					t.Error(err)
				}
			})
			if err := Verify(backupDir); err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("Verify did not report the missing manifest entry for %s: %v", name, err)
			}
		})
	}

	backedUpBook := filepath.Join(backupDir, "uploads", "book.epub")
	if info, err := os.Stat(backedUpBook); err != nil {
		t.Fatal(err)
	} else if info.Mode().Perm() != 0400 {
		t.Fatalf("backup upload mode = %o, want 0400", info.Mode().Perm())
	}
	if err := os.Chmod(backedUpBook, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backedUpBook, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Verify(backupDir); err == nil {
		t.Fatal("expected Verify to reject a changed backup file")
	}
}

func TestBackupHardLinksUnchangedUploadsAndRecoversFromTamperedPrevious(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	backupRoot := filepath.Join(root, "backups")
	if err := os.MkdirAll(uploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	livePath := filepath.Join(uploadDir, "book.epub")
	if err := os.WriteFile(livePath, []byte("immutable-book-content"), 0600); err != nil {
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
		Title:     "Dedup book",
		Filename:  "book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	cfg := Config{Dir: backupRoot, UploadDir: uploadDir, RetentionDays: 7}
	firstDir, err := Create(db, cfg)
	if err != nil {
		t.Fatalf("first Create error: %v", err)
	}
	time.Sleep(2 * time.Millisecond)
	secondDir, err := Create(db, cfg)
	if err != nil {
		t.Fatalf("second Create error: %v", err)
	}

	liveInfo, err := os.Stat(livePath)
	if err != nil {
		t.Fatal(err)
	}
	firstInfo, err := os.Stat(filepath.Join(firstDir, "uploads", "book.epub"))
	if err != nil {
		t.Fatal(err)
	}
	secondInfo, err := os.Stat(filepath.Join(secondDir, "uploads", "book.epub"))
	if err != nil {
		t.Fatal(err)
	}

	if os.SameFile(liveInfo, firstInfo) {
		t.Fatal("backup upload must remain isolated from live upload file")
	}
	if !os.SameFile(firstInfo, secondInfo) {
		t.Fatal("expected second backup to hard-link unchanged upload from previous backup")
	}

	// Tamper with the latest backup's file; next backup must fall back to a fresh copy.
	secondBook := filepath.Join(secondDir, "uploads", "book.epub")
	if err := os.Chmod(secondBook, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secondBook, []byte("corrupted"), 0600); err != nil {
		t.Fatal(err)
	}
	time.Sleep(2 * time.Millisecond)
	thirdDir, err := Create(db, cfg)
	if err != nil {
		t.Fatalf("third Create error: %v", err)
	}
	if err := Verify(thirdDir); err != nil {
		t.Fatalf("third Verify error: %v", err)
	}
	thirdInfo, err := os.Stat(filepath.Join(thirdDir, "uploads", "book.epub"))
	if err != nil {
		t.Fatal(err)
	}
	if os.SameFile(secondInfo, thirdInfo) {
		t.Fatal("third backup must not hard-link a corrupted previous backup file")
	}
	gotContent, err := os.ReadFile(filepath.Join(thirdDir, "uploads", "book.epub"))
	if err != nil {
		t.Fatal(err)
	}
	if string(gotContent) != "immutable-book-content" {
		t.Fatalf("third backup content = %q, want immutable-book-content", string(gotContent))
	}
}

func TestLatestVerifiedTimeSkipsCorruptedBackup(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	backupRoot := filepath.Join(root, "backups")
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
		Title:     "Latest book",
		Filename:  "book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	if _, ok := LatestVerifiedTime(backupRoot); ok {
		t.Fatal("expected no verified backup in missing directory")
	}

	cfg := Config{Dir: backupRoot, UploadDir: uploadDir, RetentionDays: 7}
	firstDir, err := Create(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	firstManifest, ok := readManifest(firstDir)
	if !ok {
		t.Fatal("expected first manifest to be readable")
	}

	time.Sleep(2 * time.Millisecond)
	secondDir, err := Create(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	// Corrupt only the second backup's manifest file so first remains valid.
	if err := os.WriteFile(filepath.Join(secondDir, "data.db"), []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}

	got, ok := LatestVerifiedTime(backupRoot)
	if !ok {
		t.Fatal("expected fallback to first verified backup")
	}
	if !got.Equal(firstManifest.CreatedAt) {
		t.Fatalf("LatestVerifiedTime = %v, want %v", got, firstManifest.CreatedAt)
	}

	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := VerifyContext(canceledCtx, firstDir); !errors.Is(err, context.Canceled) {
		t.Fatalf("VerifyContext with canceled ctx = %v, want context.Canceled", err)
	}
	if _, ok := LatestVerifiedTimeContext(canceledCtx, backupRoot); ok {
		t.Fatal("expected LatestVerifiedTimeContext to stop immediately on canceled ctx")
	}
}
