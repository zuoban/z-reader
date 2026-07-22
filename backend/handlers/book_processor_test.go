package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
)

func TestBooksUploadReturnsBeforeEPUBPreviewCompletes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	content := zipBytes(t, map[string][]byte{
		"mimetype":               []byte("application/epub+zip"),
		"META-INF/container.xml": []byte("<container/>"),
		"OEBPS/content.opf": []byte(`<?xml version="1.0"?>
			<package><metadata><title>Background title</title><creator>Background author</creator></metadata></package>`),
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "user-a")
	ctx.Request = newMultipartUploadRequest(t, "queued.epub", content)
	handler.Upload(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected upload status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var uploaded models.Book
	if err := json.Unmarshal(recorder.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("failed to decode upload response: %v", err)
	}
	if uploaded.ProcessingState != models.BookProcessingPending {
		t.Fatalf("expected pending upload response, got %+v", uploaded)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		book, err := db.GetBookForUser(uploaded.ID, uploaded.UserID)
		if err != nil {
			t.Fatalf("failed to load queued book: %v", err)
		}
		if book != nil && book.ProcessingState == models.BookProcessingReady {
			if book.Title != "Background title" || book.Author != "Background author" {
				t.Fatalf("background preview did not update metadata: %+v", book)
			}
			if _, err := os.Stat(filepath.Join(uploadDir, book.Filename)); err != nil {
				t.Fatalf("expected uploaded file to remain available: %v", err)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for EPUB preview processing")
}

func TestSaveUploadedBookFileHashesWrittenBytes(t *testing.T) {
	content := []byte("book bytes written only once")
	path := filepath.Join(t.TempDir(), "book.pdf")

	contentHash, err := saveUploadedBookFile(
		newMultipartFileHeader(t, "book.pdf", content),
		"pdf",
		path,
		maxEPUBExpandedBytes,
	)
	if err != nil {
		t.Fatalf("saveUploadedBookFile returned error: %v", err)
	}

	storedHash, err := hashFile(path)
	if err != nil {
		t.Fatalf("failed to hash saved book: %v", err)
	}
	if contentHash != storedHash {
		t.Fatalf("expected write-time hash %q to match stored bytes %q", contentHash, storedHash)
	}
}
