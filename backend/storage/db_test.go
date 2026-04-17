package storage

import (
	"path/filepath"
	"testing"
	"time"

	"z-reader/backend/models"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")
	db, err := Open(dbPath)
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

func TestSaveProgressUpdatesBookLastReadAt(t *testing.T) {
	db := openTestDB(t)

	book := &models.Book{
		ID:        "book-a",
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	progress := &models.Progress{
		BookID:     "book-a",
		CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
		Percentage: 12.5,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}
	if err := db.SaveProgress(progress); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	gotBook, err := db.GetBook(book.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if gotBook == nil || gotBook.LastReadAt == nil || !gotBook.LastReadAt.Equal(progress.UpdatedAt) {
		t.Fatalf("expected last_read_at %s, got %+v", progress.UpdatedAt, gotBook)
	}

	gotProgress, err := db.GetProgress(book.ID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress == nil || gotProgress.CFI != progress.CFI || !gotProgress.UpdatedAt.Equal(progress.UpdatedAt) {
		t.Fatalf("unexpected progress record: %+v", gotProgress)
	}
}

func TestGetSessionReturnsNilForExpiredSession(t *testing.T) {
	db := openTestDB(t)

	session := &models.Session{
		Token:     "expired-token",
		CreatedAt: time.Now().UTC().Add(-48 * time.Hour),
		ExpiresAt: time.Now().UTC().Add(-24 * time.Hour),
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected expired session to be treated as nil, got %+v", got)
	}
}

func TestDeleteProgressRemovesSavedProgress(t *testing.T) {
	db := openTestDB(t)

	book := &models.Book{
		ID:        "book-a",
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	progress := &models.Progress{
		BookID:     "book-a",
		CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
		Percentage: 12.5,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}
	if err := db.SaveProgress(progress); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	if err := db.DeleteProgress(progress.BookID); err != nil {
		t.Fatalf("DeleteProgress returned error: %v", err)
	}

	got, err := db.GetProgress(progress.BookID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected progress to be deleted, got %+v", got)
	}
}

func TestSaveProgressReturnsNotFoundForMissingBook(t *testing.T) {
	db := openTestDB(t)

	err := db.SaveProgress(&models.Progress{
		BookID:     "missing-book",
		CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
		Percentage: 12.5,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	})
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteBookDataRemovesBookAndProgress(t *testing.T) {
	db := openTestDB(t)

	book := &models.Book{
		ID:        "book-a",
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	progress := &models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
		Percentage: 12.5,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}

	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}
	if err := db.SaveProgress(progress); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	if err := db.DeleteBookData(book.ID); err != nil {
		t.Fatalf("DeleteBookData returned error: %v", err)
	}

	gotBook, err := db.GetBook(book.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if gotBook != nil {
		t.Fatalf("expected book to be deleted, got %+v", gotBook)
	}

	gotProgress, err := db.GetProgress(book.ID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress != nil {
		t.Fatalf("expected progress to be deleted, got %+v", gotProgress)
	}
}
