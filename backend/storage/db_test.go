package storage

import (
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

func TestMostSelectiveBookSearchGramPrefersSmallestPostingList(t *testing.T) {
	db := openTestDB(t)
	const userID = "search-user"
	for index, title := range []string{
		"公共词 独特标题",
		"公共词 普通标题一",
		"公共词 普通标题二",
	} {
		if err := db.SaveBook(&models.Book{
			ID:        "search-book-" + string(rune('a'+index)),
			UserID:    userID,
			Title:     title,
			Filename:  "search.epub",
			Format:    "epub",
			CreatedAt: time.Now().UTC(),
		}); err != nil {
			t.Fatal(err)
		}
	}

	var selected string
	var count int
	if err := db.View(func(tx *bbolt.Tx) error {
		selected, count = mostSelectiveBookSearchGram(
			tx.Bucket(BookSearchGramIndex),
			userID,
			[]string{"公共", "独特"},
		)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if selected != "独特" || count != 1 {
		t.Fatalf("selected gram = %q with %d postings, want 独特 with 1", selected, count)
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

func TestProgressTimeIndexKeyPreservesStoredFormat(t *testing.T) {
	for _, tc := range []struct {
		name   string
		time   time.Time
		bookID string
		want   string
	}{
		{"before epoch", time.Unix(0, -1), "book-a", "user-a\x000000000000000000000\x00book-a"},
		{"epoch", time.Unix(0, 0), "book-a", "user-a\x000000000000000000000\x00book-a"},
		{"padded", time.Unix(0, 42), "book-a", "user-a\x000000000000000000042\x00book-a"},
		{"seek at update", time.Unix(1_700_000_000, 123), "", "user-a\x001700000000000000123\x00"},
		{"max nanoseconds", time.Unix(0, 1<<63-1), "book-a", "user-a\x009223372036854775807\x00book-a"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			progress := models.Progress{UserID: "user-a", BookID: tc.bookID, UpdatedAt: tc.time}
			if got := string(progressTimeIndexKey(&progress)); got != tc.want {
				t.Fatalf("key = %q, want %q", got, tc.want)
			}
		})
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

func TestSearchBooksUsesGramIndexForCJKQueries(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	book := &models.Book{
		ID: "book-cjk", UserID: userID, Title: "三体　ÄBC", Author: "刘慈欣",
		Filename: "three-body.epub", Format: "epub", CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}

	assertIndex := func(exists bool) {
		t.Helper()
		wantCount := ""
		if exists {
			wantCount = "\x00\x00\x00\x00\x00\x00\x00\x01"
		}
		err := db.View(func(tx *bbolt.Tx) error {
			for _, gram := range []string{"三体", "体 ", " ä", "äb"} {
				countKey := userID + "\x00" + gram + "\x00"
				posting := tx.Bucket(BookSearchGramIndex).Get([]byte(countKey + book.ID))
				if (posting != nil) != exists {
					t.Errorf("posting for %q exists = %t, want %t", gram, posting != nil, exists)
				}
				count := tx.Bucket(BookSearchGramCounts).Get([]byte(countKey))
				if string(count) != wantCount || (count != nil) != exists {
					t.Errorf("unexpected count for %q: %x (exists = %t)", gram, count, exists)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	assertIndex(true)
	got, _, err := db.SearchBooks(userID, " \t三\x00体　 ÄBC\n", "", 10, "title")
	if err != nil || len(got) != 1 || got[0].ID != book.ID {
		t.Fatalf("unexpected CJK search response: books=%+v err=%v", got, err)
	}
	if _, err := db.DeleteBook(book.ID, userID); err != nil {
		t.Fatal(err)
	}
	assertIndex(false)
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

func TestBookTimeSortKeysPreserveStoredFormat(t *testing.T) {
	for _, tc := range []struct {
		name string
		at   time.Time
		want string
	}{
		{"before epoch", time.Unix(0, -1), "9223372036854775807"},
		{"epoch", time.Unix(0, 0), "9223372036854775807"},
		{"after epoch", time.Unix(0, 1), "9223372036854775806"},
		{"padded", time.Unix(0, 1<<63-2), "0000000000000000001"},
		{"max nanoseconds", time.Unix(0, 1<<63-1), "0000000000000000000"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			category := " Fiction "
			book := &models.Book{UserID: "user-a", ID: "book-a", CreatedAt: tc.at, Category: &category}
			want := "recent_added\x00user-a\x00" + tc.want + "\x00book-a"
			if got := string(bookSortIndexKey(book, "recent_added")); got != want {
				t.Fatalf("recent_added key = %q, want %q", got, want)
			}
			want = "recent_read\x00user-a\x00RmljdGlvbg\x00" + tc.want + "\x00book-a"
			if got := string(bookCategorySortIndexKey(book, "recent_read")); got != want {
				t.Fatalf("recent_read fallback key = %q, want %q", got, want)
			}
			lastRead := time.Unix(0, 100)
			book.LastReadAt = &lastRead
			want = "recent_read\x00user-a\x00RmljdGlvbg\x009223372036854775707\x00book-a"
			if got := string(bookCategorySortIndexKey(book, "recent_read")); got != want {
				t.Fatalf("recent_read key = %q, want %q", got, want)
			}
		})
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

func TestBookContentAndLibrarySummaryIndexesStayCurrent(t *testing.T) {
	db := openTestDB(t)
	userID := "user-a"
	category := "科幻"
	book := &models.Book{
		ID:          "book-a",
		UserID:      userID,
		Title:       "Alpha",
		Filename:    "book-a.epub",
		Format:      "epub",
		ContentHash: "hash-a",
		Category:    &category,
		CreatedAt:   time.Now().UTC(),
	}
	if err := db.CreateBook(book); err != nil {
		t.Fatalf("CreateBook returned error: %v", err)
	}

	found, err := db.FindBookByContentHash(userID, "hash-a")
	if err != nil || found == nil || found.ID != book.ID {
		t.Fatalf("content index lookup returned book=%+v err=%v", found, err)
	}
	if err := db.CreateBook(&models.Book{
		ID: "book-b", UserID: userID, Filename: "book-b.epub", Format: "epub", ContentHash: "hash-a", CreatedAt: time.Now().UTC(),
	}); err != ErrDuplicateBookContent {
		t.Fatalf("expected duplicate content error, got %v", err)
	}

	updatedCategory := "历史"
	book.Category = &updatedCategory
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("SaveBook returned error: %v", err)
	}
	summary, err := db.GetBookLibrarySummary(userID)
	if err != nil {
		t.Fatalf("GetBookLibrarySummary returned error: %v", err)
	}
	if summary.Total != 1 || summary.Categories[updatedCategory] != 1 || summary.Categories[category] != 0 {
		t.Fatalf("unexpected updated summary: %+v", summary)
	}

	if err := db.DeleteBookData(book.ID, userID); err != nil {
		t.Fatalf("DeleteBookData returned error: %v", err)
	}
	if found, err := db.FindBookByContentHash(userID, "hash-a"); err != nil || found != nil {
		t.Fatalf("deleted book still found through content index: book=%+v err=%v", found, err)
	}
	summary, err = db.GetBookLibrarySummary(userID)
	if err != nil || summary.Total != 0 || len(summary.Categories) != 0 {
		t.Fatalf("unexpected summary after delete: %+v err=%v", summary, err)
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
