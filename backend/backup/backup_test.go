package backup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
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

	// Keep the size unchanged so only the digest can detect the corruption.
	secondBook := filepath.Join(secondDir, "uploads", "book.epub")
	if err := os.Chmod(secondBook, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secondBook, []byte("corrupted-book-content"), 0600); err != nil {
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

type cancelAfterFirstRead struct {
	data   []byte
	offset int
	cancel context.CancelFunc
	calls  int
}

func (r *cancelAfterFirstRead) Read(p []byte) (int, error) {
	if r.offset >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.offset:])
	r.offset += n
	r.calls++
	if r.calls == 1 {
		r.cancel()
	}
	return n, nil
}

func TestCreateContextAbortsOnCancellationAndCleansUp(t *testing.T) {
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
		Title:     "Cancelable book",
		Filename:  "book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	cfg := Config{Dir: backupRoot, UploadDir: uploadDir, RetentionDays: 7}

	t.Run("already canceled context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		path, err := CreateContext(ctx, db, cfg)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("CreateContext(canceled) err = %v, want context.Canceled", err)
		}
		if path != "" {
			t.Fatalf("CreateContext(canceled) path = %q, want empty", path)
		}
		entries, readErr := os.ReadDir(backupRoot)
		if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
			t.Fatalf("ReadDir(%q) failed: %v", backupRoot, readErr)
		}
		if len(entries) != 0 {
			t.Fatalf("expected no partial backup directories, found %d", len(entries))
		}
	})

	t.Run("canceled mid-backup during upload copy cleans temporary dir", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		path, err := createWithDigests(ctx, db, cfg, nil, func(copyCtx context.Context, snapshot, source, destination string) error {
			cancel()
			return copySnapshotUploadsWithDedup(copyCtx, snapshot, source, destination, "", Manifest{}, nil)
		})
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("mid-backup cancel err = %v, want context.Canceled", err)
		}
		if path != "" {
			t.Fatalf("mid-backup cancel path = %q, want empty", path)
		}
		entries, readErr := os.ReadDir(backupRoot)
		if readErr != nil {
			t.Fatalf("ReadDir(%q) failed: %v", backupRoot, readErr)
		}
		if len(entries) != 0 {
			names := make([]string, 0, len(entries))
			for _, e := range entries {
				names = append(names, e.Name())
			}
			t.Fatalf("expected no leftover backup directories in %q, found %v", backupRoot, names)
		}
	})

	t.Run("streaming copy aborts mid-file when context cancels", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		reader := &cancelAfterFirstRead{
			data:   []byte(strings.Repeat("chunk-data-", 4096)),
			cancel: cancel,
		}
		dest := filepath.Join(t.TempDir(), "streamed.epub")
		buf := make([]byte, 1024)
		if _, err := writeCopiedFile(ctx, reader, dest, 0400, buf, true); !errors.Is(err, context.Canceled) {
			t.Fatalf("writeCopiedFile err = %v, want context.Canceled", err)
		}
		if reader.calls != 1 {
			t.Fatalf("expected streaming copy to stop after first chunk on cancellation, got %d reads", reader.calls)
		}
	})

	t.Run("buildManifestWithDigests aborts on canceled context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "data.db"), []byte("db"), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := buildManifestWithDigests(ctx, dir, time.Now().UTC(), nil); !errors.Is(err, context.Canceled) {
			t.Fatalf("buildManifestWithDigests(canceled) err = %v, want context.Canceled", err)
		}
	})
}

type failingReader struct {
	err error
}

func (r failingReader) Read(_ []byte) (int, error) {
	return 0, r.err
}

func TestCreateAndLatestVerifiedErrorBranches(t *testing.T) {
	root := t.TempDir()
	db, err := storage.Open(filepath.Join(root, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// CreateContext with nil ctx + missing Dir / missing UploadDir / Dir is a file.
	if _, err := CreateContext(nil, db, Config{UploadDir: root}); err == nil || !strings.Contains(err.Error(), "backup directory") {
		t.Fatalf("expected backup directory error, got %v", err)
	}
	if _, err := CreateContext(nil, db, Config{Dir: filepath.Join(root, "b")}); err == nil || !strings.Contains(err.Error(), "upload directory") {
		t.Fatalf("expected upload directory error, got %v", err)
	}
	fileAsDir := filepath.Join(root, "not-a-dir")
	if err := os.WriteFile(fileAsDir, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Create(db, Config{Dir: fileAsDir, UploadDir: root}); err == nil {
		t.Fatal("expected error when backup Dir is a file")
	}

	// LatestVerifiedTime edge cases: empty dir, missing dir, corrupt/zero manifest.
	if _, ok := LatestVerifiedTime(""); ok {
		t.Fatal("expected false for empty dir")
	}
	if _, ok := LatestVerifiedTime(filepath.Join(root, "does-not-exist")); ok {
		t.Fatal("expected false for nonexistent dir")
	}
	if _, _, ok := latestManifest(""); ok {
		t.Fatal("expected latestManifest(\"\") == false")
	}
	if _, ok := readManifest(filepath.Join(root, "missing")); ok {
		t.Fatal("expected readManifest on missing dir == false")
	}

	badBackups := filepath.Join(root, "bad-backups")
	badJSONDir := filepath.Join(badBackups, "backup-20260101T000000.000000000Z")
	zeroTimeDir := filepath.Join(badBackups, "backup-20260102T000000.000000000Z")
	for _, d := range []string{badJSONDir, zeroTimeDir} {
		if err := os.MkdirAll(d, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(badJSONDir, manifestName), []byte("{invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(zeroTimeDir, manifestName), []byte(`{"files":{"data.db":"a","data.db.sessions":"b"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, ok := LatestVerifiedTime(badBackups); ok {
		t.Fatal("expected LatestVerifiedTime to skip invalid/zero-time manifests")
	}
}

func TestVerifyErrorBranches(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	if err := os.MkdirAll(uploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, "b.epub"), []byte("epub"), 0600); err != nil {
		t.Fatal(err)
	}
	db, err := storage.Open(filepath.Join(root, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.CreateBook(&models.Book{
		ID:        "b1",
		UserID:    "u1",
		Title:     "T",
		Filename:  "b.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	t.Run("nonexistent backup dir", func(t *testing.T) {
		if err := Verify(filepath.Join(root, "missing-backup")); err == nil {
			t.Fatal("expected Verify error for nonexistent dir")
		}
	})

	t.Run("missing and invalid manifest", func(t *testing.T) {
		emptyDir := t.TempDir()
		if err := Verify(emptyDir); err == nil {
			t.Fatal("expected error when manifest.json is missing")
		}
		if err := os.WriteFile(filepath.Join(emptyDir, manifestName), []byte("not-json"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := Verify(emptyDir); err == nil {
			t.Fatal("expected error for invalid JSON manifest")
		}
		if err := os.WriteFile(filepath.Join(emptyDir, manifestName), []byte(`{"files":{"data.db":"x","data.db.sessions":"y"}}`), 0600); err != nil {
			t.Fatal(err)
		}
		if err := Verify(emptyDir); err == nil || !strings.Contains(err.Error(), "invalid backup manifest") {
			t.Fatalf("expected invalid backup manifest error, got %v", err)
		}
	})

	t.Run("unsafe manifest path", func(t *testing.T) {
		dir := t.TempDir()
		dbHash, err := writeCopiedFile(context.Background(), strings.NewReader("db"), filepath.Join(dir, "data.db"), 0400, make([]byte, 1024), true)
		if err != nil {
			t.Fatal(err)
		}
		sessHash, err := writeCopiedFile(context.Background(), strings.NewReader("sess"), filepath.Join(dir, "data.db.sessions"), 0400, make([]byte, 1024), true)
		if err != nil {
			t.Fatal(err)
		}
		m := Manifest{
			CreatedAt: time.Now().UTC(),
			Files: map[string]string{
				"data.db":          dbHash,
				"data.db.sessions": sessHash,
				"../escape.epub":   "ghi",
			},
		}
		raw, _ := json.Marshal(m)
		if err := os.WriteFile(filepath.Join(dir, manifestName), raw, 0600); err != nil {
			t.Fatal(err)
		}
		if err := Verify(dir); err == nil || !strings.Contains(err.Error(), "unsafe manifest path") {
			t.Fatalf("expected unsafe manifest path error, got %v", err)
		}
	})

	t.Run("uploads missing or not a directory or has extra unlisted file", func(t *testing.T) {
		backupDir, err := Create(db, Config{Dir: filepath.Join(root, "bk1"), UploadDir: uploadDir})
		if err != nil {
			t.Fatal(err)
		}
		// Add an extra file in uploads/ not listed in manifest.
		extraPath := filepath.Join(backupDir, "uploads", "extra.epub")
		if err := os.WriteFile(extraPath, []byte("extra"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := Verify(backupDir); err == nil || !strings.Contains(err.Error(), "missing from the manifest") {
			t.Fatalf("expected unlisted upload error, got %v", err)
		}
		if err := os.Remove(extraPath); err != nil {
			t.Fatal(err)
		}

		// Replace uploads dir with a regular file.
		if err := os.RemoveAll(filepath.Join(backupDir, "uploads")); err != nil {
			t.Fatal(err)
		}
		// Also test missing uploads dir when manifest has no upload entries.
		emptyDB, err := storage.Open(filepath.Join(root, "empty.db"))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = emptyDB.Close() })
		emptyBk, err := Create(emptyDB, Config{Dir: filepath.Join(root, "bk2"), UploadDir: uploadDir})
		if err != nil {
			t.Fatal(err)
		}
		if err := os.RemoveAll(filepath.Join(emptyBk, "uploads")); err != nil {
			t.Fatal(err)
		}
		if err := Verify(emptyBk); err == nil || !strings.Contains(err.Error(), "open snapshot uploads") {
			t.Fatalf("expected missing uploads dir error, got %v", err)
		}
		if err := os.WriteFile(filepath.Join(emptyBk, "uploads"), []byte("file"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := Verify(emptyBk); err == nil || !strings.Contains(err.Error(), "not a directory") {
			t.Fatalf("expected uploads not a directory error, got %v", err)
		}
	})
}

func TestRestoreErrorBranches(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	if err := os.MkdirAll(uploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, "book.epub"), []byte("book-data"), 0600); err != nil {
		t.Fatal(err)
	}
	db, err := storage.Open(filepath.Join(root, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.CreateBook(&models.Book{
		ID:        "r1",
		UserID:    "u1",
		Title:     "Restore Test",
		Filename:  "book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	backupDir, err := Create(db, Config{Dir: filepath.Join(root, "backups"), UploadDir: uploadDir})
	if err != nil {
		t.Fatal(err)
	}

	// Required RestoreConfig fields and invalid source dirs.
	if err := Restore(backupDir, RestoreConfig{UploadDir: filepath.Join(root, "u")}); err == nil || !strings.Contains(err.Error(), "database path") {
		t.Fatalf("expected database path required error, got %v", err)
	}
	if err := Restore(backupDir, RestoreConfig{DBPath: filepath.Join(root, "d.db")}); err == nil || !strings.Contains(err.Error(), "upload directory") {
		t.Fatalf("expected upload directory required error, got %v", err)
	}
	if err := Restore(filepath.Join(root, "nonexistent"), RestoreConfig{
		DBPath:    filepath.Join(root, "r-none.db"),
		UploadDir: filepath.Join(root, "r-none-u"),
	}); err == nil {
		t.Fatal("expected error restoring from nonexistent backup")
	}

	// Missing manifest -> read backup before restore.
	noManifestDir := t.TempDir()
	if err := Restore(noManifestDir, RestoreConfig{
		DBPath:    filepath.Join(root, "r-nom.db"),
		UploadDir: filepath.Join(root, "r-nom-u"),
	}); err == nil || !strings.Contains(err.Error(), "read backup before restore") {
		t.Fatalf("expected read backup before restore error, got %v", err)
	}

	// Existing target refusal for each target path individually (DBPath, DBPath.sessions, UploadDir).
	existingDB := filepath.Join(root, "exists.db")
	if err := os.WriteFile(existingDB, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Restore(backupDir, RestoreConfig{
		DBPath:    existingDB,
		UploadDir: filepath.Join(root, "fresh-u1"),
	}); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected existing DB refusal, got %v", err)
	}

	existingSessionsDB := filepath.Join(root, "exists-sess.db")
	if err := os.WriteFile(existingSessionsDB+".sessions", []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Restore(backupDir, RestoreConfig{
		DBPath:    existingSessionsDB,
		UploadDir: filepath.Join(root, "fresh-u2"),
	}); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected existing sessions DB refusal, got %v", err)
	}

	existingUploadDir := filepath.Join(root, "existing-uploads")
	if err := os.MkdirAll(existingUploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := Restore(backupDir, RestoreConfig{
		DBPath:    filepath.Join(root, "fresh-d3.db"),
		UploadDir: existingUploadDir,
	}); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected existing uploadDir refusal, got %v", err)
	}

	// publishRestore cleans up on collision at mainPath or sessionPath.
	stageDir := t.TempDir()
	mainTmp := filepath.Join(stageDir, "main.tmp")
	sessTmp := filepath.Join(stageDir, "sess.tmp")
	upTmp := filepath.Join(stageDir, "up.tmp")
	if err := os.WriteFile(mainTmp, []byte("m"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sessTmp, []byte("s"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(upTmp, 0700); err != nil {
		t.Fatal(err)
	}

	if err := publishRestore(upTmp, filepath.Join(stageDir, "up1"), mainTmp, existingDB, sessTmp, filepath.Join(stageDir, "sess1")); err == nil {
		t.Fatal("expected publishRestore error when mainPath already exists")
	}

	mainTarget := filepath.Join(stageDir, "main2.db")
	sessExisting := filepath.Join(stageDir, "sess2.db")
	if err := os.WriteFile(sessExisting, []byte("exists"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := publishRestore(upTmp, filepath.Join(stageDir, "up2"), mainTmp, mainTarget, sessTmp, sessExisting); err == nil {
		t.Fatal("expected publishRestore error when sessionPath already exists")
	}
	if _, err := os.Lstat(mainTarget); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected mainTarget rolled back after session link failure, err=%v", err)
	}

	// Tampered backup fails verify before restore.
	tamperedBook := filepath.Join(backupDir, "uploads", "book.epub")
	if err := os.Chmod(tamperedBook, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(tamperedBook, []byte("tampered!"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Restore(backupDir, RestoreConfig{
		DBPath:    filepath.Join(root, "r-tampered.db"),
		UploadDir: filepath.Join(root, "r-tampered-u"),
	}); err == nil || !strings.Contains(err.Error(), "verify backup before restore") {
		t.Fatalf("expected verify backup before restore error, got %v", err)
	}
}

func TestCopyVerifiedFileAndManifestHelpers(t *testing.T) {
	srcDir := t.TempDir()
	dstDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(srcDir, "file.bin"), []byte("hello-backup"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(srcDir, "file.bin"), filepath.Join(srcDir, "link.bin")); err != nil {
		t.Fatal(err)
	}

	root, err := os.OpenRoot(srcDir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	buf := make([]byte, 1024)

	// copyVerifiedFile: missing file, symlink (non-regular), unwritable target, digest mismatch.
	if err := copyVerifiedFile(root, "missing.bin", filepath.Join(dstDir, "out1"), "abc", buf); err == nil {
		t.Fatal("expected error for missing source file")
	}
	if err := copyVerifiedFile(root, "link.bin", filepath.Join(dstDir, "out2"), "abc", buf); err == nil || !strings.Contains(err.Error(), "not a regular backup file") {
		t.Fatalf("expected non-regular file error, got %v", err)
	}
	if err := copyVerifiedFile(root, "file.bin", filepath.Join(dstDir, "no-such-dir", "out3"), "abc", buf); err == nil {
		t.Fatal("expected error copying to nonexistent target directory")
	}
	if err := copyVerifiedFile(root, "file.bin", filepath.Join(dstDir, "out4"), "0000mismatch", buf); err == nil || !strings.Contains(err.Error(), "checksum changed during restore") {
		t.Fatalf("expected checksum mismatch error, got %v", err)
	}

	// copyToFile read error.
	if err := copyToFile(failingReader{err: errors.New("boom")}, filepath.Join(dstDir, "fail.bin"), buf); err == nil {
		t.Fatal("expected copyToFile error from failing reader")
	}

	// writeCopiedFile with digest: nil ctx, canceled ctx, unwritable destination.
	digest, err := writeCopiedFile(nil, strings.NewReader("payload"), filepath.Join(dstDir, "ro.bin"), 0400, buf, true)
	if err != nil || digest == "" {
		t.Fatalf("writeCopiedFile(nil) = %q, %v", digest, err)
	}
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := writeCopiedFile(canceledCtx, strings.NewReader("x"), filepath.Join(dstDir, "ro2.bin"), 0400, buf, true); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if _, err := writeCopiedFile(context.Background(), strings.NewReader("x"), filepath.Join(dstDir, "missing-dir", "ro3.bin"), 0400, buf, true); err == nil {
		t.Fatal("expected error for unwritable destination")
	}

	// hashBackupReaderWithBuffer read error.
	if _, err := hashBackupReaderWithBuffer(context.Background(), failingReader{err: errors.New("read-fail")}, buf); err == nil {
		t.Fatal("expected error from failing reader in hashBackupReaderWithBuffer")
	}

	// buildManifestWithDigests: nil ctx, precomputed hit, nonexistent root, symlink error.
	manifestDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(manifestDir, "a.txt"), []byte("aaa"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(manifestDir, "b.txt"), []byte("bbb"), 0600); err != nil {
		t.Fatal(err)
	}
	m, err := buildManifestWithDigests(nil, manifestDir, time.Now().UTC(), map[string]string{"a.txt": "precomputed-digest"})
	if err != nil {
		t.Fatalf("buildManifestWithDigests(nil) error: %v", err)
	}
	if m.Files["a.txt"] != "precomputed-digest" || m.Files["b.txt"] == "" {
		t.Fatalf("unexpected manifest files: %+v", m.Files)
	}
	if _, err := buildManifestWithDigests(context.Background(), filepath.Join(manifestDir, "missing"), time.Now().UTC(), nil); err == nil {
		t.Fatal("expected error walking nonexistent directory")
	}
	if err := os.Symlink(filepath.Join(manifestDir, "a.txt"), filepath.Join(manifestDir, "sym.txt")); err != nil {
		t.Fatal(err)
	}
	if _, err := buildManifestWithDigests(context.Background(), manifestDir, time.Now().UTC(), nil); err == nil || !strings.Contains(err.Error(), "not a regular backup file") {
		t.Fatalf("expected symlink error in buildManifestWithDigests, got %v", err)
	}

	// safeRelativePath edge cases.
	for _, unsafe := range []string{"", "/abs/path", ".", "..", "../escape"} {
		if safeRelativePath(unsafe) {
			t.Fatalf("expected safeRelativePath(%q) == false", unsafe)
		}
	}
	if !safeRelativePath("uploads/book.epub") {
		t.Fatal("expected safeRelativePath(\"uploads/book.epub\") == true")
	}

	// removeExpired: retentionDays<=0, nonexistent dir, expires old backup while preserving recent & unrelated entries.
	if err := removeExpired(filepath.Join(dstDir, "does-not-exist"), 0); err != nil {
		t.Fatalf("expected nil when retentionDays<=0, got %v", err)
	}
	if err := removeExpired(filepath.Join(dstDir, "does-not-exist"), 7); err == nil {
		t.Fatal("expected error removing expired in nonexistent dir")
	}
	retDir := t.TempDir()
	oldBk := filepath.Join(retDir, "backup-20200101T000000.000000000Z")
	newBk := filepath.Join(retDir, "backup-20990101T000000.000000000Z")
	otherDir := filepath.Join(retDir, "keep-me")
	for _, d := range []string{oldBk, newBk, otherDir} {
		if err := os.MkdirAll(d, 0700); err != nil {
			t.Fatal(err)
		}
	}
	oldTime := time.Now().AddDate(0, 0, -30)
	if err := os.Chtimes(oldBk, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}
	if err := removeExpired(retDir, 7); err != nil {
		t.Fatalf("removeExpired failed: %v", err)
	}
	if _, err := os.Stat(oldBk); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected expired backup removed, stat err=%v", err)
	}
	if _, err := os.Stat(newBk); err != nil {
		t.Fatalf("expected recent backup preserved, stat err=%v", err)
	}
	if _, err := os.Stat(otherDir); err != nil {
		t.Fatalf("expected non-backup dir preserved, stat err=%v", err)
	}
}

func TestRemoveExpiredUsesManifestAndDirTimestampAndContinuesOnError(t *testing.T) {
	retDir := t.TempDir()
	now := time.Now().UTC()
	expiredAt := now.AddDate(0, 0, -30)
	recentAt := now.Add(-time.Hour)

	writeManifest := func(dir string, createdAt time.Time) {
		t.Helper()
		m := Manifest{
			CreatedAt: createdAt,
			Files: map[string]string{
				"data.db":          "abc",
				"data.db.sessions": "def",
			},
		}
		raw, err := json.Marshal(m)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, manifestName), raw, 0600); err != nil {
			t.Fatal(err)
		}
	}

	// 1. Expired by manifest.CreatedAt even though ModTime was touched to "now"
	//    and the directory name itself looks recent.
	touchedManifestBk := filepath.Join(retDir, "backup-20990101T000000.000000000Z")
	if err := os.MkdirAll(touchedManifestBk, 0700); err != nil {
		t.Fatal(err)
	}
	writeManifest(touchedManifestBk, expiredAt)
	if err := os.Chtimes(touchedManifestBk, now, now); err != nil {
		t.Fatal(err)
	}

	// 2. Recent manifest.CreatedAt is preserved even if ModTime is old.
	recentManifestBk := filepath.Join(retDir, "backup-recent-manifest")
	if err := os.MkdirAll(recentManifestBk, 0700); err != nil {
		t.Fatal(err)
	}
	writeManifest(recentManifestBk, recentAt)
	if err := os.Chtimes(recentManifestBk, expiredAt, expiredAt); err != nil {
		t.Fatal(err)
	}

	// 3. No manifest, ModTime touched to "now", still expired by parsed directory timestamp.
	parsedNameBk := filepath.Join(retDir, "backup-20200101T000000.000000000Z")
	if err := os.MkdirAll(parsedNameBk, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(parsedNameBk, now, now); err != nil {
		t.Fatal(err)
	}

	// 4. No manifest and unparseable dir name falls back to ModTime.
	modTimeFallbackBk := filepath.Join(retDir, "backup-legacy-modtime")
	if err := os.MkdirAll(modTimeFallbackBk, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(modTimeFallbackBk, expiredAt, expiredAt); err != nil {
		t.Fatal(err)
	}

	if err := removeExpired(retDir, 7); err != nil {
		t.Fatalf("removeExpired failed: %v", err)
	}

	for _, removed := range []string{touchedManifestBk, parsedNameBk, modTimeFallbackBk} {
		if _, err := os.Stat(removed); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("expected expired backup %s to be removed, stat err=%v", filepath.Base(removed), err)
		}
	}
	if _, err := os.Stat(recentManifestBk); err != nil {
		t.Fatalf("expected recent backup to be preserved, stat err=%v", err)
	}

	t.Run("continues pruning remaining expired backups when one RemoveAll fails", func(t *testing.T) {
		if os.Geteuid() == 0 {
			t.Skip("root ignores directory permission restrictions")
		}
		errDir := t.TempDir()
		// Sorted first: locked expired backup that fails os.RemoveAll.
		lockedBk := filepath.Join(errDir, "backup-20200101T000000.000000000Z")
		lockedSub := filepath.Join(lockedBk, "locked")
		if err := os.MkdirAll(lockedSub, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(lockedSub, "file.bin"), []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(lockedSub, 0500); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(lockedSub, 0700) })

		// Sorted second: another expired backup that must still be pruned.
		removableBk := filepath.Join(errDir, "backup-20200102T000000.000000000Z")
		if err := os.MkdirAll(removableBk, 0700); err != nil {
			t.Fatal(err)
		}

		err := removeExpired(errDir, 7)
		if err == nil {
			t.Fatal("expected error from locked expired backup")
		}
		if _, statErr := os.Stat(removableBk); !errors.Is(statErr, os.ErrNotExist) {
			t.Fatalf("expected sibling expired backup to still be removed, stat err=%v", statErr)
		}
	})
}

func TestDedupSinglePassAndSameSizeFallbackCopy(t *testing.T) {
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	backupRoot := filepath.Join(root, "backups")
	if err := os.MkdirAll(uploadDir, 0700); err != nil {
		t.Fatal(err)
	}

	unchangedPath := filepath.Join(uploadDir, "unchanged.epub")
	changedPath := filepath.Join(uploadDir, "changed.epub")
	if err := os.WriteFile(unchangedPath, []byte("same-content-forever"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(changedPath, []byte("version-1-exact-size"), 0600); err != nil {
		t.Fatal(err)
	}

	db, err := storage.Open(filepath.Join(root, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	now := time.Now().UTC()
	for _, b := range []*models.Book{
		{ID: "b1", UserID: "u1", Title: "Unchanged", Filename: "unchanged.epub", Format: "epub", CreatedAt: now},
		{ID: "b2", UserID: "u1", Title: "Changed", Filename: "changed.epub", Format: "epub", CreatedAt: now},
	} {
		if err := db.CreateBook(b); err != nil {
			t.Fatal(err)
		}
	}

	cfg := Config{Dir: backupRoot, UploadDir: uploadDir, RetentionDays: 7}
	firstDir, err := Create(db, cfg)
	if err != nil {
		t.Fatalf("first Create error: %v", err)
	}

	// Modify live changed.epub to different bytes of the EXACT same length, and add a new book.
	updatedContent := []byte("version-2-exact-size")
	if len(updatedContent) != len("version-1-exact-size") {
		t.Fatal("test setup error: content lengths must match")
	}
	if err := os.WriteFile(changedPath, updatedContent, 0600); err != nil {
		t.Fatal(err)
	}
	newPath := filepath.Join(uploadDir, "new.epub")
	if err := os.WriteFile(newPath, []byte("brand-new-upload"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := db.CreateBook(&models.Book{
		ID:        "b3",
		UserID:    "u1",
		Title:     "New",
		Filename:  "new.epub",
		Format:    "epub",
		CreatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}

	time.Sleep(2 * time.Millisecond)
	secondDir, err := Create(db, cfg)
	if err != nil {
		t.Fatalf("second Create error: %v", err)
	}
	if err := Verify(secondDir); err != nil {
		t.Fatalf("second Verify error: %v", err)
	}

	// Unchanged file must be hard-linked from firstDir.
	firstUnchanged, err := os.Stat(filepath.Join(firstDir, "uploads", "unchanged.epub"))
	if err != nil {
		t.Fatal(err)
	}
	secondUnchanged, err := os.Stat(filepath.Join(secondDir, "uploads", "unchanged.epub"))
	if err != nil {
		t.Fatal(err)
	}
	if !os.SameFile(firstUnchanged, secondUnchanged) {
		t.Fatal("expected unchanged.epub to be hard-linked from previous backup")
	}

	// Same-size modified file must NOT be hard-linked, must have mode 0400, updated bytes, and accurate manifest digest.
	firstChanged, err := os.Stat(filepath.Join(firstDir, "uploads", "changed.epub"))
	if err != nil {
		t.Fatal(err)
	}
	secondChangedPath := filepath.Join(secondDir, "uploads", "changed.epub")
	secondChanged, err := os.Stat(secondChangedPath)
	if err != nil {
		t.Fatal(err)
	}
	if os.SameFile(firstChanged, secondChanged) {
		t.Fatal("expected modified same-size upload not to be hard-linked")
	}
	if secondChanged.Mode().Perm() != 0400 {
		t.Fatalf("fallback copy mode = %o, want 0400", secondChanged.Mode().Perm())
	}
	gotChanged, err := os.ReadFile(secondChangedPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(gotChanged) != string(updatedContent) {
		t.Fatalf("changed.epub content = %q, want %q", gotChanged, updatedContent)
	}

	manifest, ok := readManifest(secondDir)
	if !ok {
		t.Fatal("expected valid manifest in secondDir")
	}
	for _, rel := range []string{"uploads/unchanged.epub", "uploads/changed.epub", "uploads/new.epub"} {
		wantDigest, err := fileSHA256(context.Background(), filepath.Join(secondDir, filepath.FromSlash(rel)))
		if err != nil {
			t.Fatal(err)
		}
		if manifest.Files[rel] != wantDigest {
			t.Fatalf("manifest digest for %s = %q, want %q", rel, manifest.Files[rel], wantDigest)
		}
	}

	// Direct writeCopiedFile without digest edge cases: nil ctx, canceled ctx, unwritable destination.
	buf := make([]byte, 1024)
	dstDir := t.TempDir()
	if _, err := writeCopiedFile(nil, strings.NewReader("payload"), filepath.Join(dstDir, "ok.bin"), 0400, buf, false); err != nil {
		t.Fatalf("writeCopiedFile(nil) error: %v", err)
	}
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := writeCopiedFile(canceledCtx, strings.NewReader("x"), filepath.Join(dstDir, "cancel.bin"), 0400, buf, false); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if _, err := writeCopiedFile(context.Background(), strings.NewReader("x"), filepath.Join(dstDir, "missing-dir", "fail.bin"), 0400, buf, false); err == nil {
		t.Fatal("expected error for unwritable destination")
	}
}
