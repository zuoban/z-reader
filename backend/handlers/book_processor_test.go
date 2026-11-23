package handlers

import (
	"encoding/json"
	"fmt"
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

func TestBookProcessorRecoversPersistedPendingBooksOnStartup(t *testing.T) {
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()

	content := zipBytes(t, map[string][]byte{
		"mimetype":               []byte("application/epub+zip"),
		"META-INF/container.xml": []byte("<container/>"),
		"OEBPS/content.opf": []byte(`<?xml version="1.0"?>
			<package><metadata><title>Recovered Title</title><creator>Recovered Author</creator></metadata></package>`),
	})
	if err := os.WriteFile(filepath.Join(uploadDir, "pending-1.epub"), content, 0644); err != nil {
		t.Fatal(err)
	}

	pendingBook := &models.Book{
		ID:              "pending-1",
		UserID:          storage.PersonalLibrary,
		Title:           "pending-1",
		Filename:        "pending-1.epub",
		Format:          "epub",
		ProcessingState: models.BookProcessingPending,
		ContentHash:     "hash-pending-1",
		CreatedAt:       time.Now().UTC(),
	}
	readyBook := &models.Book{
		ID:              "ready-1",
		UserID:          storage.PersonalLibrary,
		Title:           "Already Ready",
		Filename:        "ready-1.epub",
		Format:          "epub",
		ProcessingState: models.BookProcessingReady,
		ContentHash:     "hash-ready-1",
		CreatedAt:       time.Now().UTC(),
	}
	for _, b := range []*models.Book{pendingBook, readyBook} {
		if err := db.SaveBook(b); err != nil {
			t.Fatal(err)
		}
	}

	_ = newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		book, err := db.GetBookForUser(pendingBook.ID, storage.PersonalLibrary)
		if err != nil {
			t.Fatalf("failed to load recovered book: %v", err)
		}
		if book != nil && book.ProcessingState == models.BookProcessingReady {
			if book.Title != "Recovered Title" || book.Author != "Recovered Author" {
				t.Fatalf("recovered book metadata mismatch: %+v", book)
			}
			untouched, err := db.GetBookForUser(readyBook.ID, storage.PersonalLibrary)
			if err != nil || untouched == nil || untouched.Title != "Already Ready" {
				t.Fatalf("ready book should remain untouched: %+v, err=%v", untouched, err)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for startup recovery of pending book")
}

func TestBookProcessorNonBlockingOverflowEnqueueAndDrain(t *testing.T) {
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)

	const totalBooks = 48
	books := make([]*models.Book, 0, totalBooks)
	for i := 0; i < totalBooks; i++ {
		id := fmt.Sprintf("bulk-%02d", i)
		filename := id + ".epub"
		content := zipBytes(t, map[string][]byte{
			"mimetype":               []byte("application/epub+zip"),
			"META-INF/container.xml": []byte("<container/>"),
			"OEBPS/content.opf": []byte(fmt.Sprintf(`<?xml version="1.0"?>
				<package><metadata><title>Title %02d</title><creator>Author %02d</creator></metadata></package>`, i, i)),
		})
		if err := os.WriteFile(filepath.Join(uploadDir, filename), content, 0644); err != nil {
			t.Fatal(err)
		}
		book := &models.Book{
			ID:              id,
			UserID:          storage.PersonalLibrary,
			Title:           id,
			Filename:        filename,
			Format:          "epub",
			ProcessingState: models.BookProcessingPending,
			ContentHash:     fmt.Sprintf("hash-%02d", i),
			CreatedAt:       time.Now().UTC(),
		}
		if err := db.SaveBook(book); err != nil {
			t.Fatal(err)
		}
		books = append(books, book)
	}

	start := time.Now()
	for _, book := range books {
		handler.enqueueBookProcessing(book)
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Fatalf("enqueueing %d books blocked for %v", totalBooks, elapsed)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		readyCount := 0
		for _, b := range books {
			saved, err := db.GetBookForUser(b.ID, storage.PersonalLibrary)
			if err != nil {
				t.Fatalf("failed to load book %s: %v", b.ID, err)
			}
			if saved != nil && saved.ProcessingState == models.BookProcessingReady {
				readyCount++
			}
		}
		if readyCount == len(books) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for overflow books to process: %d/%d ready", readyCount, len(books))
		}
		time.Sleep(10 * time.Millisecond)
	}

	handler.Close()
	// Repeated Close and post-Close enqueue must be safe no-ops.
	handler.Close()
	handler.enqueueBookProcessing(books[0])

	for i, b := range books {
		saved, err := db.GetBookForUser(b.ID, storage.PersonalLibrary)
		if err != nil {
			t.Fatalf("failed to load book %s: %v", b.ID, err)
		}
		wantTitle := fmt.Sprintf("Title %02d", i)
		if saved.Title != wantTitle {
			t.Fatalf("book %s title = %q, want %q", b.ID, saved.Title, wantTitle)
		}
	}
}

func TestMarkBookProcessingFailedDoesNotResurrectDeletedOrOverwriteEdits(t *testing.T) {
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	deletedBook := &models.Book{
		ID:              "deleted-epub",
		UserID:          storage.PersonalLibrary,
		Title:           "Will Be Deleted",
		Filename:        "deleted-epub.epub",
		Format:          "epub",
		ProcessingState: models.BookProcessingPending,
		ContentHash:     "hash-deleted",
		CreatedAt:       time.Now().UTC(),
	}
	editedBook := &models.Book{
		ID:              "edited-epub",
		UserID:          storage.PersonalLibrary,
		Title:           "Initial Title",
		Filename:        "edited-epub.epub",
		Format:          "epub",
		ProcessingState: models.BookProcessingPending,
		ContentHash:     "hash-edited",
		CreatedAt:       time.Now().UTC(),
	}
	for _, b := range []*models.Book{deletedBook, editedBook} {
		if err := db.SaveBook(b); err != nil {
			t.Fatal(err)
		}
	}

	// Simulate user deleting the first book and renaming/categorizing the second
	// while background preview extraction fails.
	if err := db.DeleteBookData(deletedBook.ID, storage.PersonalLibrary); err != nil {
		t.Fatal(err)
	}
	category := "Sci-Fi"
	editedBook.Title = "User Renamed Title"
	editedBook.Category = &category
	if _, err := db.UpdateBook(editedBook.ID, editedBook.UserID, func(current *models.Book) bool {
		current.Title = editedBook.Title
		current.Category = editedBook.Category
		return true
	}); err != nil {
		t.Fatal(err)
	}

	lastRead := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := db.SaveProgress(&models.Progress{BookID: editedBook.ID, UpdatedAt: lastRead}, editedBook.UserID); err != nil {
		t.Fatal(err)
	}

	handler.markBookProcessingFailed(bookProcessingJob{
		bookID:       deletedBook.ID,
		userID:       deletedBook.UserID,
		initialTitle: deletedBook.Title,
	}, os.ErrNotExist)
	handler.markBookProcessingFailed(bookProcessingJob{
		bookID:       editedBook.ID,
		userID:       editedBook.UserID,
		initialTitle: "Initial Title",
	}, os.ErrInvalid)

	gotDeleted, err := db.GetBookForUser(deletedBook.ID, storage.PersonalLibrary)
	if err != nil {
		t.Fatal(err)
	}
	if gotDeleted != nil {
		t.Fatalf("expected deleted book not to be resurrected, got %+v", gotDeleted)
	}

	gotEdited, err := db.GetBookForUser(editedBook.ID, storage.PersonalLibrary)
	if err != nil {
		t.Fatal(err)
	}
	if gotEdited == nil {
		t.Fatal("expected edited book to exist")
	}
	if gotEdited.ProcessingState != models.BookProcessingFailed {
		t.Fatalf("expected failed processing state, got %q", gotEdited.ProcessingState)
	}
	if gotEdited.Title != "User Renamed Title" || gotEdited.Category == nil || *gotEdited.Category != "Sci-Fi" ||
		gotEdited.LastReadAt == nil || !gotEdited.LastReadAt.Equal(lastRead) {
		t.Fatalf("concurrent edits were overwritten on failure: %+v", gotEdited)
	}
	indexed, err := db.FindBookByContentHash(editedBook.UserID, editedBook.ContentHash)
	if err != nil || indexed == nil || indexed.ID != editedBook.ID {
		t.Fatalf("failed book content index = %+v, %v", indexed, err)
	}
}

func TestBookProcessorCloseStopsOverflowAndLeavesPendingForRecovery(t *testing.T) {
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)

	// Enqueue invalid EPUB files directly so processing stays fast, then verify
	// Close does not block on overflow and leaves unstarted books pending.
	processor := handler.processor
	processor.mu.Lock()
	processor.overflow = append(processor.overflow, bookProcessingJob{
		bookID:       "overflow-pending",
		userID:       storage.PersonalLibrary,
		initialTitle: "overflow-pending",
	})
	processor.pendingSet["overflow-pending"] = struct{}{}
	processor.mu.Unlock()

	content := zipBytes(t, map[string][]byte{
		"mimetype":               []byte("application/epub+zip"),
		"META-INF/container.xml": []byte("<container/>"),
		"OEBPS/content.opf": []byte(`<?xml version="1.0"?>
			<package><metadata><title>Recovered After Shutdown</title></metadata></package>`),
	})
	if err := os.WriteFile(filepath.Join(uploadDir, "overflow-pending.epub"), content, 0644); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveBook(&models.Book{
		ID:              "overflow-pending",
		UserID:          storage.PersonalLibrary,
		Title:           "overflow-pending",
		Filename:        "overflow-pending.epub",
		Format:          "epub",
		ProcessingState: models.BookProcessingPending,
		ContentHash:     "hash-overflow-pending",
		CreatedAt:       time.Now().UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	handler.Close()

	// Next startup recovers any book left pending during shutdown.
	restarted := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	_ = restarted

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		saved, err := db.GetBookForUser("overflow-pending", storage.PersonalLibrary)
		if err != nil {
			t.Fatal(err)
		}
		if saved != nil && saved.ProcessingState == models.BookProcessingReady && saved.Title == "Recovered After Shutdown" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for restarted handler to recover pending book")
}
