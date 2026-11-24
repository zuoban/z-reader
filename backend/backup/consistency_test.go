package backup

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"io/fs"
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
	"z-reader/backend/handlers"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func TestSnapshotUploadsSurviveConcurrentLibraryChanges(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, cfg := newConsistencyFixture(t)
	h := handlers.NewBooksHandler(&config.Config{UploadDir: cfg.UploadDir}, db)
	t.Cleanup(h.Close)
	router := gin.New()
	router.DELETE("/books/:id", h.Delete)
	router.POST("/books/batch-delete", h.BatchDelete)
	router.POST("/books/:id/cover", h.UploadCover)
	router.POST("/books", h.Upload)
	router.GET("/books/:id/file", h.GetFile)

	originals := []models.Book{
		seedBackupBook(t, db, cfg.UploadDir, "single"),
		seedBackupBook(t, db, cfg.UploadDir, "batch-a"),
		seedBackupBook(t, db, cfg.UploadDir, "batch-b"),
		seedBackupBook(t, db, cfg.UploadDir, "replace"),
	}
	var cover bytes.Buffer
	if err := jpeg.Encode(&cover, image.NewGray(image.Rect(0, 0, 640, 32)), nil); err != nil {
		t.Fatal(err)
	}
	const newContent = "%PDF-1.7\nnew upload during backup"
	const unfinished = "unfinished.pdf"
	if err := os.WriteFile(filepath.Join(cfg.UploadDir, unfinished), []byte("partial"), 0600); err != nil {
		t.Fatal(err)
	}

	var uploaded, replaced models.Book
	path, err := create(db, cfg, func(snapshot, source, destination string) error {
		// The main snapshot is already on disk, and the actual file copy starts
		// only after all requests have committed and run their cleanup paths.
		serveBackupTestRequest(t, router, httptest.NewRequest(http.MethodDelete, "/books/single", nil))
		batch := httptest.NewRequest(http.MethodPost, "/books/batch-delete",
			strings.NewReader(`{"ids":["batch-a","batch-b"]}`))
		batch.Header.Set("Content-Type", "application/json")
		serveBackupTestRequest(t, router, batch)
		result := serveBackupTestRequest(t, router, backupMultipart(t, "/books/replace/cover", "new.jpg", cover.Bytes()))
		if err := json.Unmarshal(result, &replaced); err != nil || replaced.CoverThumbPath == "" {
			t.Fatalf("replacement cover = %+v, err = %v", replaced, err)
		}
		result = serveBackupTestRequest(t, router, backupMultipart(t, "/books", "new.pdf", []byte(newContent)))
		if err := json.Unmarshal(result, &uploaded); err != nil || uploaded.Filename == "" {
			t.Fatalf("uploaded book = %+v, err = %v", uploaded, err)
		}
		download := httptest.NewRequest(http.MethodGet, "/books/replace/file", nil)
		if content := serveBackupTestRequest(t, router, download); string(content) != originals[3].Filename {
			t.Fatalf("live download during capture = %q", content)
		}
		return copySnapshotUploads(snapshot, source, destination)
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, book := range originals {
		names := []string{book.CoverPath, book.CoverThumbPath}
		if book.ID != "replace" {
			names = append(names, book.Filename)
		}
		for _, name := range names {
			if _, err := os.Stat(filepath.Join(cfg.UploadDir, name)); !os.IsNotExist(err) {
				t.Fatalf("old live upload %q should have been cleaned up, stat error = %v", name, err)
			}
		}
	}
	for _, name := range []string{unfinished, uploaded.Filename, replaced.CoverPath, replaced.CoverThumbPath} {
		if _, err := os.Stat(filepath.Join(path, "uploads", name)); !os.IsNotExist(err) {
			t.Fatalf("non-snapshot upload %q entered the backup, stat error = %v", name, err)
		}
	}
	if err := Verify(path); err != nil {
		t.Fatal(err)
	}
	restored, restoredUploads := restoreConsistencyFixture(t, path)
	books, err := restored.ListBooks(storage.PersonalLibrary)
	if err != nil || len(books) != len(originals) {
		t.Fatalf("restored books = %+v, err = %v", books, err)
	}
	restoredHandler := handlers.NewBooksHandler(&config.Config{UploadDir: restoredUploads}, restored)
	t.Cleanup(restoredHandler.Close)
	restoredRouter := gin.New()
	restoredRouter.GET("/books/:id/file", restoredHandler.GetFile)
	for _, want := range originals {
		got, err := restored.GetBook(want.ID)
		if err != nil || got == nil || got.Filename != want.Filename ||
			got.CoverPath != want.CoverPath || got.CoverThumbPath != want.CoverThumbPath {
			t.Fatalf("restored book %q = %+v, err = %v", want.ID, got, err)
		}
		download := httptest.NewRequest(http.MethodGet, "/books/"+want.ID+"/file", nil)
		if content := serveBackupTestRequest(t, restoredRouter, download); string(content) != want.Filename {
			t.Fatalf("restored download %q = %q", want.ID, content)
		}
		for _, name := range []string{want.CoverPath, want.CoverThumbPath} {
			assertBackupFile(t, restoredUploads, name, name)
		}
	}

	latest, err := Create(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	assertBackupFile(t, filepath.Join(latest, "uploads"), uploaded.Filename, newContent)
	assertBackupFile(t, filepath.Join(latest, "uploads"), replaced.CoverPath, cover.String())
}

func TestLegacyBackupVerification(t *testing.T) {
	for _, missing := range []bool{false, true} {
		name := "complete"
		if missing {
			name = "missing_original"
		}
		t.Run(name, func(t *testing.T) {
			db, cfg := newConsistencyFixture(t)
			book := seedBackupBook(t, db, cfg.UploadDir, "legacy")
			path := t.TempDir()
			if err := db.BackupTo(filepath.Join(path, "data.db")); err != nil {
				t.Fatal(err)
			}
			if err := db.SessionBackupTo(filepath.Join(path, "data.db.sessions")); err != nil {
				t.Fatal(err)
			}
			if missing {
				// Reproduce the old ordering without relying on timing: delete
				// the live row and original after the old snapshot was taken.
				if _, err := db.DeleteBook(book.ID, book.UserID); err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(filepath.Join(cfg.UploadDir, book.Filename)); err != nil {
					t.Fatal(err)
				}
			}
			if err := copyTree(cfg.UploadDir, filepath.Join(path, "uploads")); err != nil {
				t.Fatal(err)
			}
			manifest, err := buildManifest(path, time.Now())
			if err != nil {
				t.Fatal(err)
			}
			data, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(path, manifestName), data, 0600); err != nil {
				t.Fatal(err)
			}
			err = Verify(path)
			if missing {
				if err == nil || !strings.Contains(err.Error(), book.Filename) {
					t.Fatalf("Verify missing original = %v, want error naming %s", err, book.Filename)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			_, uploads := restoreConsistencyFixture(t, path)
			assertBackupFile(t, uploads, book.Filename, book.Filename)
		})
	}
}

func TestFailedSnapshotUploadCopyReleasesCleanup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, cfg := newConsistencyFixture(t)
	deleted := seedBackupBook(t, db, cfg.UploadDir, "delete")
	missing := seedBackupBook(t, db, cfg.UploadDir, "missing")
	if err := os.Remove(filepath.Join(cfg.UploadDir, missing.Filename)); err != nil {
		t.Fatal(err)
	}
	h := handlers.NewBooksHandler(&config.Config{UploadDir: cfg.UploadDir}, db)
	t.Cleanup(h.Close)
	router := gin.New()
	router.DELETE("/books/:id", h.Delete)

	path, err := create(db, cfg, func(snapshot, source, destination string) error {
		serveBackupTestRequest(t, router, httptest.NewRequest(http.MethodDelete, "/books/delete", nil))
		return copySnapshotUploads(snapshot, source, destination)
	})
	if path != "" || err == nil || !strings.Contains(err.Error(), missing.Filename) {
		t.Fatalf("Create = %q, %v, want error naming %q", path, err, missing.Filename)
	}
	if _, err := os.Stat(filepath.Join(cfg.UploadDir, deleted.Filename)); !os.IsNotExist(err) {
		t.Fatalf("deferred cleanup after failed backup: %v", err)
	}
	if entries, err := os.ReadDir(cfg.Dir); err != nil || len(entries) != 0 {
		t.Fatalf("failed backup left entries = %+v, err = %v", entries, err)
	}
}

func TestCreateRestoreEmptyLibrary(t *testing.T) {
	db, cfg := newConsistencyFixture(t)
	path, err := Create(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	restored, uploads := restoreConsistencyFixture(t, path)
	if books, err := restored.ListBooks(storage.PersonalLibrary); err != nil || len(books) != 0 {
		t.Fatalf("restored empty library = %+v, err = %v", books, err)
	}
	if entries, err := os.ReadDir(uploads); err != nil || len(entries) != 0 {
		t.Fatalf("restored empty uploads = %+v, err = %v", entries, err)
	}
}

func TestPublishRestoreLeavesAnExistingUploadDirectoryIntact(t *testing.T) {
	root := t.TempDir()
	staged := filepath.Join(root, "staged")
	uploads := filepath.Join(root, "uploads")
	for _, dir := range []string{staged, uploads} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(staged, "book.epub"), []byte("book"), 0600); err != nil {
		t.Fatal(err)
	}
	mainTemp := filepath.Join(root, "staged.db")
	sessionTemp := mainTemp + ".sessions"
	for _, path := range []string{mainTemp, sessionTemp} {
		if err := os.WriteFile(path, nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	mainPath := filepath.Join(root, "data.db")
	sessionPath := mainPath + ".sessions"
	if err := publishRestore(staged, uploads, mainTemp, mainPath, sessionTemp, sessionPath); err == nil {
		t.Fatal("expected an existing upload directory to block publication")
	}
	for _, path := range []string{mainPath, sessionPath} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("database path remains after failed publication: %s (%v)", path, err)
		}
	}
	if entries, err := os.ReadDir(uploads); err != nil || len(entries) != 0 {
		t.Fatalf("existing upload directory changed: %v, %v", entries, err)
	}
	assertBackupFile(t, staged, "book.epub", "book")
}

func newConsistencyFixture(t *testing.T) (*storage.DB, Config) {
	t.Helper()
	root := t.TempDir()
	cfg := Config{Dir: filepath.Join(root, "backups"), UploadDir: filepath.Join(root, "uploads")}
	if err := os.Mkdir(cfg.UploadDir, 0700); err != nil {
		t.Fatal(err)
	}
	db, err := storage.Open(filepath.Join(root, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, cfg
}

func seedBackupBook(t *testing.T, db *storage.DB, uploads, id string) models.Book {
	t.Helper()
	book := models.Book{
		ID: id, UserID: storage.PersonalLibrary, Filename: id + ".pdf", Format: "pdf",
		CoverPath: id + ".jpg", CoverThumbPath: id + ".thumb.jpg",
	}
	for _, name := range []string{book.Filename, book.CoverPath, book.CoverThumbPath} {
		if err := os.WriteFile(filepath.Join(uploads, name), []byte(name), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.CreateBook(&book); err != nil {
		t.Fatal(err)
	}
	return book
}

func backupMultipart(t *testing.T, path, filename string, content []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func serveBackupTestRequest(t *testing.T, router http.Handler, req *http.Request) []byte {
	t.Helper()
	result := httptest.NewRecorder()
	router.ServeHTTP(result, req)
	if result.Code != http.StatusOK {
		t.Fatalf("%s %s = %d %s", req.Method, req.URL.Path, result.Code, result.Body)
	}
	return result.Body.Bytes()
}

func restoreConsistencyFixture(t *testing.T, path string) (*storage.DB, string) {
	t.Helper()
	root := t.TempDir()
	cfg := RestoreConfig{DBPath: filepath.Join(root, "data.db"), UploadDir: filepath.Join(root, "uploads")}
	if err := Restore(path, cfg); err != nil {
		t.Fatal(err)
	}
	db, err := storage.Open(cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, cfg.UploadDir
}

func assertBackupFile(t *testing.T, root, name, want string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(root, name))
	if err != nil || string(content) != want {
		t.Fatalf("file %q = %q, err = %v", name, content, err)
	}
}

func copyTree(source, destination string) error {
	if err := os.MkdirAll(destination, 0700); err != nil {
		return err
	}
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return nil
		}
		if !safeRelativePath(relativePath) {
			return fmt.Errorf("unsafe upload path %q", relativePath)
		}
		target := filepath.Join(destination, relativePath)
		if entry.IsDir() {
			return os.MkdirAll(target, 0700)
		}
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return fmt.Errorf("unsupported upload entry %q", path)
		}
		return copyFile(path, target)
	})
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	return copyToFile(input, destination, nil)
}
