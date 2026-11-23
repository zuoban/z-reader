package handlers

import (
	"bytes"
	"image"
	"image/jpeg"
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
	"z-reader/backend/storage"
)

func newWritebackTestBook(t *testing.T) (*BooksHandler, *models.Book, bookProcessingJob) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &BooksHandler{db: openHandlerTestDB(t), cfg: &config.Config{UploadDir: t.TempDir()}}
	book := &models.Book{
		ID: "book", UserID: storage.PersonalLibrary, Filename: "book.epub",
		Title: "Original title", Format: "epub", ContentHash: "book-hash",
		ProcessingState: models.BookProcessingPending,
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(h.cfg.UploadDir, book.Filename), []byte("book"), 0600); err != nil {
		t.Fatal(err)
	}
	return h, book, bookProcessingJob{bookID: book.ID, userID: book.UserID, initialTitle: book.Title}
}

func writebackCoverJPEG(t *testing.T) []byte {
	t.Helper()
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewGray(image.Rect(0, 0, 640, 32)), nil); err != nil {
		t.Fatal(err)
	}
	return data.Bytes()
}

func prepareWritebackCover(t *testing.T, h *BooksHandler, id string, data []byte) bookCover {
	t.Helper()
	cover, err := h.prepareExtractedCover(id, data, "image/jpeg")
	if err != nil || cover.thumb == "" {
		t.Fatalf("expected a full cover and thumbnail, got %+v, %v", cover, err)
	}
	return cover
}

func assertWritebackFiles(t *testing.T, h *BooksHandler, want ...string) {
	t.Helper()
	entries, err := os.ReadDir(h.cfg.UploadDir)
	if err != nil {
		t.Fatal(err)
	}
	names := make(map[string]bool, len(entries))
	for _, entry := range entries {
		names[entry.Name()] = true
	}
	if len(names) != len(want) {
		t.Fatalf("files = %v, want %v", names, want)
	}
	for _, name := range want {
		if !names[name] {
			t.Fatalf("files = %v, want %v", names, want)
		}
	}
}

func TestPreviewWritebackPreservesConcurrentChanges(t *testing.T) {
	h, book, job := newWritebackTestBook(t)
	jpegData := writebackCoverJPEG(t)
	candidate := prepareWritebackCover(t, h, book.ID, jpegData)

	router := gin.New()
	router.PATCH("/books/:id", h.Update)
	recorder := httptest.NewRecorder()
	// Explicitly retaining the filename title and clearing the author are user edits.
	req := httptest.NewRequest(http.MethodPatch, "/books/"+book.ID,
		strings.NewReader(`{"title":"Original title","author":"","category":"Fiction"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PATCH = %d %s", recorder.Code, recorder.Body)
	}

	recorder = httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = newMultipartUploadRequest(t, "cover.jpg", jpegData)
	h.UploadCover(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("UploadCover = %d %s", recorder.Code, recorder.Body)
	}
	manual, err := h.db.GetBook(book.ID)
	if err != nil || manual == nil || manual.CoverPath == "" || manual.CoverThumbPath == "" {
		t.Fatalf("missing manual cover: %+v, %v", manual, err)
	}
	lastRead := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := h.db.SaveProgress(&models.Progress{BookID: book.ID, UpdatedAt: lastRead}, book.UserID); err != nil {
		t.Fatal(err)
	}

	h.completeBookPreview(job, book.Filename, epubMetadata{Title: "Extracted title", Author: "Extracted author"}, candidate)
	h.markBookProcessingFailed(job, os.ErrNotExist)
	got, err := h.db.GetBookForUser(book.ID, book.UserID)
	if err != nil || got == nil || got.ProcessingState != models.BookProcessingReady ||
		got.Title != book.Title || got.Author != "" || got.CoverPath != manual.CoverPath ||
		got.CoverThumbPath != manual.CoverThumbPath || got.Category == nil || *got.Category != "Fiction" ||
		got.LastReadAt == nil || !got.LastReadAt.Equal(lastRead) {
		t.Fatalf("preview overwrote concurrent fields: %+v, %v", got, err)
	}
	assertWritebackFiles(t, h, book.Filename, manual.CoverPath, manual.CoverThumbPath)
	matches, _, err := h.db.SearchBooks(book.UserID, "Fiction", "", 10, "recent_read", got.Category)
	if err != nil || len(matches) != 1 || matches[0].ID != book.ID {
		t.Fatalf("category/search/order index = %+v, %v", matches, err)
	}
	summary, err := h.db.GetBookLibrarySummary(book.UserID)
	if err != nil || summary.Total != 1 || summary.Categories["Fiction"] != 1 || summary.Uncategorized != 0 {
		t.Fatalf("library summary = %+v, %v", summary, err)
	}
}

func TestPreviewWritebackUpdatesSearchAndKeepsContentIndex(t *testing.T) {
	h, book, job := newWritebackTestBook(t)
	metadata := epubMetadata{Title: "Extracted title", Author: "Extracted author"}
	candidate := prepareWritebackCover(t, h, book.ID, writebackCoverJPEG(t))
	h.completeBookPreview(job, book.Filename, metadata, candidate)

	for query, want := range map[string]int{"Original title": 0, metadata.Title: 1, metadata.Author: 1} {
		matches, _, err := h.db.SearchBooks(book.UserID, query, "", 10, "title")
		if err != nil || len(matches) != want {
			t.Fatalf("search %q = %+v, %v", query, matches, err)
		}
	}
	got, err := h.db.FindBookByContentHash(book.UserID, book.ContentHash)
	if err != nil || got == nil || got.ID != book.ID || got.ProcessingState != models.BookProcessingReady ||
		got.CoverPath != candidate.path || got.CoverThumbPath != candidate.thumb {
		t.Fatalf("content index book = %+v, %v", got, err)
	}
	assertWritebackFiles(t, h, book.Filename, candidate.path, candidate.thumb)
}

func TestBookDeletionDiscardsInFlightCoverWrites(t *testing.T) {
	for _, endpoint := range []string{"single", "batch"} {
		t.Run(endpoint, func(t *testing.T) {
			h, book, job := newWritebackTestBook(t)
			data := writebackCoverJPEG(t)
			live := prepareWritebackCover(t, h, book.ID, data)
			if _, err := h.commitCover(book, live, true); err != nil {
				t.Fatal(err)
			}
			preview := prepareWritebackCover(t, h, book.ID, data)
			upload := prepareWritebackCover(t, h, book.ID, data)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			if endpoint == "single" {
				ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
				h.Delete(ctx)
			} else {
				ctx.Request = httptest.NewRequest(http.MethodPost, "/books/batch-delete",
					strings.NewReader(`{"ids":["book","missing"]}`))
				h.BatchDelete(ctx)
				if recorder.Code != http.StatusNotFound {
					t.Fatalf("batch delete with missing book = %d %s", recorder.Code, recorder.Body)
				}
				assertWritebackFiles(t, h, book.Filename, live.path, live.thumb,
					preview.path, preview.thumb, upload.path, upload.thumb)
				recorder = httptest.NewRecorder()
				ctx, _ = gin.CreateTestContext(recorder)
				ctx.Request = httptest.NewRequest(http.MethodPost, "/books/batch-delete",
					strings.NewReader(`{"ids":["book"]}`))
				h.BatchDelete(ctx)
			}
			if recorder.Code != http.StatusOK {
				t.Fatalf("delete = %d %s", recorder.Code, recorder.Body)
			}
			assertWritebackFiles(t, h, preview.path, preview.thumb, upload.path, upload.thumb)

			h.completeBookPreview(job, book.Filename, epubMetadata{Title: "Extracted title"}, preview)
			h.markBookProcessingFailed(job, os.ErrNotExist)
			h.cacheExtractedCover(book, data, "image/jpeg")
			if _, err := h.commitCover(book, upload, true); err != storage.ErrNotFound {
				t.Fatalf("late upload error = %v, want ErrNotFound", err)
			}
			got, err := h.db.GetBook(book.ID)
			if err != nil || got != nil {
				t.Fatalf("deleted book = %+v, %v", got, err)
			}
			assertWritebackFiles(t, h)
		})
	}
}

func TestCoverReplacementDiscardsStaleThumbnailAndExtractedCover(t *testing.T) {
	h, book, _ := newWritebackTestBook(t)
	data := writebackCoverJPEG(t)
	first := prepareWritebackCover(t, h, book.ID, data)
	// Simulate a legacy cover that had no thumbnail at the start of the read.
	thumb := first.thumb
	first.thumb = ""
	snapshot, err := h.commitCover(book, first, true)
	if err != nil {
		t.Fatal(err)
	}
	replacement := prepareWritebackCover(t, h, book.ID, data)
	if _, err := h.commitCover(book, replacement, true); err != nil {
		t.Fatal(err)
	}
	got, err := h.commitCoverThumbnail(snapshot, thumb)
	if err != nil || got.CoverPath != replacement.path || got.CoverThumbPath != replacement.thumb {
		t.Fatalf("late thumbnail republished old cover: %+v, %v", got, err)
	}
	h.cacheExtractedCover(book, data, "image/jpeg")
	got, err = h.db.GetBook(book.ID)
	if err != nil || got == nil || got.CoverPath != replacement.path || got.CoverThumbPath != replacement.thumb {
		t.Fatalf("late extraction replaced manual cover: %+v, %v", got, err)
	}
	assertWritebackFiles(t, h, book.Filename, replacement.path, replacement.thumb)
}
