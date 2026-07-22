package storage

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"go.etcd.io/bbolt"

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

func TestListProgressFiltersByUser(t *testing.T) {
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
			UserID:    "user-a",
			Title:     "Beta",
			Filename:  "book-b.epub",
			Format:    "epub",
			Size:      128,
			CreatedAt: time.Now().UTC(),
		},
		{
			ID:        "book-c",
			UserID:    "user-b",
			Title:     "Gamma",
			Filename:  "book-c.epub",
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

	progressItems := []struct {
		userID   string
		progress *models.Progress
	}{
		{
			userID: "user-a",
			progress: &models.Progress{
				BookID:     "book-a",
				CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
				Percentage: 12.5,
				UpdatedAt:  time.Now().UTC().Truncate(time.Second),
			},
		},
		{
			userID: "user-a",
			progress: &models.Progress{
				BookID:     "book-b",
				CFI:        "epubcfi(/6/4[chapter2]!/4/2/6)",
				Percentage: 42,
				UpdatedAt:  time.Now().UTC().Truncate(time.Second),
			},
		},
		{
			userID: "user-b",
			progress: &models.Progress{
				BookID:     "book-c",
				CFI:        "epubcfi(/6/6[chapter3]!/4/2/6)",
				Percentage: 88,
				UpdatedAt:  time.Now().UTC().Truncate(time.Second),
			},
		},
	}
	for _, item := range progressItems {
		if err := db.SaveProgress(item.progress, item.userID); err != nil {
			t.Fatalf("failed to save progress: %v", err)
		}
	}

	got, err := db.ListProgress("user-a")
	if err != nil {
		t.Fatalf("ListProgress returned error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected two progress records, got %+v", got)
	}

	seen := map[string]bool{}
	for _, progress := range got {
		if progress.UserID != "user-a" {
			t.Fatalf("expected only user-a progress, got %+v", progress)
		}
		seen[progress.BookID] = true
	}
	if !seen["book-a"] || !seen["book-b"] {
		t.Fatalf("expected book-a and book-b progress, got %+v", got)
	}
}

func TestListProgressForBooksAndSince(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	for _, id := range []string{"book-a", "book-b"} {
		if err := db.SaveBook(&models.Book{
			ID: id, UserID: userID, Title: id, Filename: id + ".epub", Format: "epub", CreatedAt: time.Now().UTC(),
		}); err != nil {
			t.Fatal(err)
		}
	}
	firstUpdatedAt := time.Now().UTC().Add(-time.Minute)
	secondUpdatedAt := time.Now().UTC()
	if err := db.SaveProgress(&models.Progress{BookID: "book-a", CFI: "a", Percentage: 10, UpdatedAt: firstUpdatedAt}, userID); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveProgress(&models.Progress{BookID: "book-b", CFI: "b", Percentage: 20, UpdatedAt: secondUpdatedAt}, userID); err != nil {
		t.Fatal(err)
	}

	pageProgress, err := db.ListProgressForBooks(userID, []string{"book-b", "missing"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pageProgress) != 1 || pageProgress[0].BookID != "book-b" {
		t.Fatalf("unexpected page progress: %+v", pageProgress)
	}

	changed, err := db.ListProgressUpdatedSince(userID, secondUpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if len(changed) != 1 || changed[0].BookID != "book-b" {
		t.Fatalf("unexpected incremental progress: %+v", changed)
	}
}

func TestSearchBooksUsesFullUserLibrary(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	books := []*models.Book{
		{ID: "book-a", UserID: userID, Title: "Dune", Author: "Frank Herbert", Filename: "dune.epub", Format: "epub", CreatedAt: time.Now().UTC()},
		{ID: "book-b", UserID: userID, Title: "Foundation", Author: "Isaac Asimov", Filename: "foundation.epub", Format: "epub", CreatedAt: time.Now().UTC()},
		{ID: "book-c", UserID: "user-b", Title: "Dune Messiah", Filename: "dune-messiah.epub", Format: "epub", CreatedAt: time.Now().UTC()},
	}
	for _, book := range books {
		if err := db.SaveBook(book); err != nil {
			t.Fatal(err)
		}
	}

	got, nextCursor, err := db.SearchBooks(userID, "HERBERT", "", 10, "title")
	if err != nil {
		t.Fatal(err)
	}
	if nextCursor != "" || len(got) != 1 || got[0].ID != "book-a" {
		t.Fatalf("unexpected search response: books=%+v next=%q", got, nextCursor)
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

func TestAssignUnownedDataToUserAssignsBooksAndProgress(t *testing.T) {
	db := openTestDB(t)

	if err := db.SaveBook(&models.Book{
		ID:        "legacy-book",
		Title:     "Legacy Book",
		Filename:  "legacy.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("failed to save legacy book: %v", err)
	}

	progress := &models.Progress{
		BookID:     "legacy-book",
		CFI:        "epubcfi(/6/2)",
		Percentage: 42,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}
	progressData, err := json.Marshal(progress)
	if err != nil {
		t.Fatalf("failed to marshal progress: %v", err)
	}
	if err := db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(ProgressBucket).Put([]byte("legacy-book"), progressData)
	}); err != nil {
		t.Fatalf("failed to save legacy progress: %v", err)
	}

	if err := db.AssignUnownedDataToUser("first-user"); err != nil {
		t.Fatalf("AssignUnownedDataToUser returned error: %v", err)
	}

	book, err := db.GetBook("legacy-book")
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if book == nil || book.UserID != "first-user" {
		t.Fatalf("expected legacy book to belong to first-user, got %+v", book)
	}
	books, err := db.ListBooks("first-user")
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(books) != 1 || books[0].ID != "legacy-book" {
		t.Fatalf("expected legacy book in first user's index, got %+v", books)
	}
	gotProgress, err := db.GetProgress("legacy-book", "first-user")
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress == nil || gotProgress.UserID != "first-user" || gotProgress.CFI != progress.CFI {
		t.Fatalf("expected reassigned legacy progress, got %+v", gotProgress)
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

func TestDeleteBookDataRemovesBookProgressAndBookmarks(t *testing.T) {
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
	if err := db.SaveBookmark(&models.Bookmark{
		ID:         "bookmark-a",
		BookID:     book.ID,
		CFI:        "epubcfi(/6/4[chapter2]!/4/2/6)",
		Percentage: 45,
		CreatedAt:  time.Now().UTC(),
	}, userID); err != nil {
		t.Fatalf("failed to save bookmark: %v", err)
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

	gotBookmarks, err := db.ListBookmarks(book.ID, userID)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got bookmarks=%+v err=%v", gotBookmarks, err)
	}

	if err := db.View(func(tx *bbolt.Tx) error {
		if data := tx.Bucket(BookmarksBucket).Get(bookmarkKey(userID, book.ID, "bookmark-a")); data != nil {
			t.Fatalf("expected bookmark data to be deleted, got %s", string(data))
		}
		return nil
	}); err != nil {
		t.Fatalf("failed to inspect bookmark bucket: %v", err)
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

func TestListBooksByCursorReturnsOnlyRequestedPage(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	for _, id := range []string{"book-a", "book-b", "book-c"} {
		if err := db.SaveBook(&models.Book{
			ID:        id,
			UserID:    userID,
			Title:     id,
			Filename:  id + ".epub",
			Format:    "epub",
			Size:      128,
			CreatedAt: time.Now().UTC(),
		}); err != nil {
			t.Fatalf("failed to save %s: %v", id, err)
		}
	}
	if err := db.SaveBook(&models.Book{
		ID:        "book-d",
		UserID:    "user-b",
		Title:     "book-d",
		Filename:  "book-d.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("failed to save other user's book: %v", err)
	}

	firstPage, nextCursor, err := db.ListBooksByCursor(userID, "", 2)
	if err != nil {
		t.Fatalf("ListBooksByCursor returned error: %v", err)
	}
	if len(firstPage) != 2 || firstPage[0].ID != "book-a" || firstPage[1].ID != "book-b" {
		t.Fatalf("unexpected first page: %+v", firstPage)
	}
	if nextCursor != "book-b" {
		t.Fatalf("expected next cursor book-b, got %q", nextCursor)
	}

	secondPage, nextCursor, err := db.ListBooksByCursor(userID, nextCursor, 2)
	if err != nil {
		t.Fatalf("ListBooksByCursor returned error: %v", err)
	}
	if len(secondPage) != 1 || secondPage[0].ID != "book-c" {
		t.Fatalf("unexpected second page: %+v", secondPage)
	}
	if nextCursor != "" {
		t.Fatalf("expected no next cursor, got %q", nextCursor)
	}
}

func TestListBooksBySortedCursorUsesPersistentTitleIndex(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	for _, book := range []*models.Book{
		{ID: "book-b", UserID: userID, Title: "Beta", Filename: "book-b.epub", Format: "epub", Size: 128, CreatedAt: time.Now().UTC()},
		{ID: "book-a", UserID: userID, Title: "Alpha", Filename: "book-a.epub", Format: "epub", Size: 128, CreatedAt: time.Now().UTC()},
	} {
		if err := db.SaveBook(book); err != nil {
			t.Fatalf("failed to save %s: %v", book.ID, err)
		}
	}

	firstPage, nextCursor, err := db.ListBooksBySortedCursor(userID, "", 1, "title")
	if err != nil {
		t.Fatalf("ListBooksBySortedCursor returned error: %v", err)
	}
	if len(firstPage) != 1 || firstPage[0].ID != "book-a" || nextCursor != "book-a" {
		t.Fatalf("unexpected first title page: %+v next=%q", firstPage, nextCursor)
	}

	secondPage, nextCursor, err := db.ListBooksBySortedCursor(userID, nextCursor, 1, "title")
	if err != nil {
		t.Fatalf("ListBooksBySortedCursor returned error: %v", err)
	}
	if len(secondPage) != 1 || secondPage[0].ID != "book-b" || nextCursor != "" {
		t.Fatalf("unexpected second title page: %+v next=%q", secondPage, nextCursor)
	}
}

func TestGetBookLibrarySummaryReturnsOnlyRequestedUsersCounts(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	category := "科幻"
	for _, book := range []*models.Book{
		{ID: "book-a", UserID: userID, Title: "Alpha", Filename: "book-a.epub", Format: "epub", Size: 128, Category: &category, CreatedAt: time.Now().UTC()},
		{ID: "book-b", UserID: userID, Title: "Beta", Filename: "book-b.epub", Format: "epub", Size: 128, CreatedAt: time.Now().UTC()},
		{ID: "book-c", UserID: "user-b", Title: "Gamma", Filename: "book-c.epub", Format: "epub", Size: 128, Category: &category, CreatedAt: time.Now().UTC()},
	} {
		if err := db.SaveBook(book); err != nil {
			t.Fatalf("failed to save %s: %v", book.ID, err)
		}
	}

	summary, err := db.GetBookLibrarySummary(userID)
	if err != nil {
		t.Fatalf("GetBookLibrarySummary returned error: %v", err)
	}
	if summary.Total != 2 || summary.Uncategorized != 1 || summary.Categories[category] != 1 {
		t.Fatalf("unexpected library summary: %+v", summary)
	}
}

func TestNormalizeBookCategoriesTrimsNames(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	category := " 科幻 "

	if err := db.SaveBook(&models.Book{
		ID:        "book-a",
		UserID:    userID,
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		Category:  &category,
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	if err := db.NormalizeBookCategories(); err != nil {
		t.Fatalf("NormalizeBookCategories returned error: %v", err)
	}

	got, err := db.GetBook("book-a")
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if got == nil || got.Category == nil || *got.Category != "科幻" {
		t.Fatalf("expected normalized category 科幻, got %+v", got)
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
