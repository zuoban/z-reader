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
	userID := "user-a"

	book := &models.Book{
		ID:        "book-a",
		UserID:    userID,
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
	if err := db.SaveProgress(progress, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	gotBook, err := db.GetBook(book.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if gotBook == nil || gotBook.LastReadAt == nil || !gotBook.LastReadAt.Equal(progress.UpdatedAt) {
		t.Fatalf("expected last_read_at %s, got %+v", progress.UpdatedAt, gotBook)
	}

	gotProgress, err := db.GetProgress(book.ID, userID)
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

func TestEnsureDefaultAdminCreatesAdminUser(t *testing.T) {
	db := openTestDB(t)

	if err := db.EnsureDefaultAdmin("secret-password"); err != nil {
		t.Fatalf("EnsureDefaultAdmin returned error: %v", err)
	}

	user, err := db.GetUserByUsername("admin")
	if err != nil {
		t.Fatalf("GetUserByUsername returned error: %v", err)
	}
	if user == nil {
		t.Fatal("expected default admin user to be created")
	}
	if user.Role != models.UserRoleAdmin {
		t.Fatalf("expected admin role, got %q", user.Role)
	}
	if !CheckPassword(user.PasswordHash, "secret-password") {
		t.Fatal("expected admin password to match")
	}
}

func TestDeleteProgressRemovesSavedProgress(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"

	book := &models.Book{
		ID:        "book-a",
		UserID:    userID,
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
	if err := db.SaveProgress(progress, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	if err := db.DeleteProgress(progress.BookID, userID); err != nil {
		t.Fatalf("DeleteProgress returned error: %v", err)
	}

	got, err := db.GetProgress(progress.BookID, userID)
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
	}, "user-a")
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteBookDataRemovesBookAndProgress(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"

	book := &models.Book{
		ID:        "book-a",
		UserID:    userID,
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
	if err := db.SaveProgress(progress, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	if err := db.DeleteBookData(book.ID, userID); err != nil {
		t.Fatalf("DeleteBookData returned error: %v", err)
	}

	gotBook, err := db.GetBook(book.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if gotBook != nil {
		t.Fatalf("expected book to be deleted, got %+v", gotBook)
	}

	gotProgress, err := db.GetProgress(book.ID, userID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress != nil {
		t.Fatalf("expected progress to be deleted, got %+v", gotProgress)
	}
}

func TestListBooksFiltersByUser(t *testing.T) {
	db := openTestDB(t)

	books := []*models.Book{
		{
			ID:        "book-a",
			UserID:    "user-a",
			Title:     "Alpha",
			Filename:  "book-a.epub",
			Format:    "epub",
			Size:      128,
			CreatedAt: time.Now().UTC(),
		},
		{
			ID:        "book-b",
			UserID:    "user-b",
			Title:     "Beta",
			Filename:  "book-b.epub",
			Format:    "epub",
			Size:      128,
			CreatedAt: time.Now().UTC(),
		},
	}
	for _, book := range books {
		if err := db.SaveBook(book); err != nil {
			t.Fatalf("failed to save book: %v", err)
		}
	}

	got, err := db.ListBooks("user-a")
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(got) != 1 || got[0].ID != "book-a" {
		t.Fatalf("expected only user-a book, got %+v", got)
	}
}

func TestSaveProgressRejectsOtherUsersBook(t *testing.T) {
	db := openTestDB(t)

	book := &models.Book{
		ID:        "book-a",
		UserID:    "user-a",
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	err := db.SaveProgress(&models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
		Percentage: 42,
		UpdatedAt:  time.Now().UTC(),
	}, "user-b")
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for other user's book, got %v", err)
	}
}
