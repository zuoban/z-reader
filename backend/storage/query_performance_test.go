package storage

import (
	"fmt"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func TestUpdateBookKeepsPreviousPointerFields(t *testing.T) {
	db := openTestDB(t)
	oldCategory, newCategory := "旧书目", "新目录"
	oldReadAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	newReadAt := oldReadAt.Add(time.Hour)
	original := &models.Book{ID: "a", UserID: "u", Category: &oldCategory, LastReadAt: &oldReadAt}
	if err := db.CreateBook(original); err != nil {
		t.Fatal(err)
	}
	update := func(commit bool) {
		t.Helper()
		book, err := db.UpdateBook(original.ID, original.UserID, func(book *models.Book) bool {
			*book.Category = newCategory
			*book.LastReadAt = newReadAt
			return commit
		})
		wantCategory, wantReadAt := oldCategory, oldReadAt
		if commit {
			wantCategory, wantReadAt = newCategory, newReadAt
		}
		if err != nil || book == nil || book.Category == nil || *book.Category != wantCategory ||
			book.LastReadAt == nil || !book.LastReadAt.Equal(wantReadAt) {
			t.Errorf("update(commit=%t) returned %+v, %v", commit, book, err)
		}
	}
	update(false)
	update(true)

	updated := *original
	updated.Category, updated.LastReadAt = &newCategory, &newReadAt
	books, _, err := db.SearchBooks(original.UserID, newCategory, "", 10, "recent_read")
	if err != nil || len(books) != 1 || books[0].ID != original.ID {
		t.Errorf("search after update returned %+v, %v", books, err)
	}

	summary, err := db.GetBookLibrarySummary(original.UserID)
	if err != nil || summary.Total != 1 || len(summary.Categories) != 1 || summary.Categories[newCategory] != 1 {
		t.Errorf("summary after update = %+v, %v", summary, err)
	}
	if err := db.View(func(tx *bbolt.Tx) error {
		for _, entry := range []struct{ bucket, key []byte }{
			{BookSortIndex, bookSortIndexKey(original, "recent_read")},
			{BookCategorySortIndex, bookCategorySortIndexKey(original, "recent_read")},
			{BookSearchGramIndex, []byte("u\x00旧书\x00a")},
			{BookSearchGramCounts, []byte("u\x00旧书\x00")},
		} {
			if tx.Bucket(entry.bucket).Get(entry.key) != nil {
				t.Errorf("old index entry survived in %s: %q", entry.bucket, entry.key)
			}
		}
		if string(tx.Bucket(BookSortIndex).Get(bookSortIndexKey(&updated, "recent_read"))) != original.ID ||
			string(tx.Bucket(BookCategorySortIndex).Get(bookCategorySortIndexKey(&updated, "recent_read"))) != original.ID {
			t.Error("new recent-read index entries are missing")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func TestCategoryMutationUpdatesSummaryAndSearch(t *testing.T) {
	db := openTestDB(t)
	oldCategory, newCategory := "Old unique category", "New distinct category"
	book := &models.Book{ID: "a", UserID: "u", Title: "Reading", Category: &oldCategory}
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	if _, err := db.UpdateBooksCategory([]string{"a"}, "u", &newCategory); err != nil {
		t.Fatal(err)
	}
	summary, err := db.GetBookLibrarySummary("u")
	if err != nil || summary.Categories[newCategory] != 1 || summary.Categories[oldCategory] != 0 {
		t.Fatalf("summary = %+v, %v", summary, err)
	}
	books, _, err := db.SearchBooks("u", newCategory, "", 10, "title")
	if err != nil || len(books) != 1 {
		t.Fatalf("new category search = %+v, %v", books, err)
	}
	if _, err := db.UpdateBooksCategory([]string{"a"}, "u", nil); err != nil {
		t.Fatal(err)
	}
	summary, err = db.GetBookLibrarySummary("u")
	if err != nil || summary.Uncategorized != 1 || len(summary.Categories) != 0 {
		t.Fatalf("uncategorized summary = %+v, %v", summary, err)
	}
}

func TestBatchCategoryUpdateCountsEachBookOnce(t *testing.T) {
	db := openTestDB(t)
	source, destination := "Source", "Destination"
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", Category: &source},
		{ID: "b", UserID: "u"},
		{ID: "c", UserID: "u", Category: &destination},
		{ID: "d", UserID: "other", Category: &source},
	} {
		if err := db.CreateBook(&book); err != nil {
			t.Fatal(err)
		}
	}
	books, err := db.UpdateBooksCategory([]string{"b", "a", "b", "", "c"}, "u", &destination)
	if err != nil || len(books) != 3 || books[0].ID != "b" || books[1].ID != "a" || books[2].ID != "c" {
		t.Fatalf("updated books = %+v, err = %v", books, err)
	}
	summary, err := db.GetBookLibrarySummary("u")
	if err != nil || summary.Total != 3 || summary.Uncategorized != 0 ||
		len(summary.Categories) != 1 || summary.Categories[destination] != 3 {
		t.Fatalf("updated summary = %+v, err = %v", summary, err)
	}
	other, err := db.GetBookLibrarySummary("other")
	if err != nil || other.Total != 1 || other.Categories[source] != 1 {
		t.Fatalf("other summary = %+v, err = %v", other, err)
	}
}

func TestBatchDeleteUpdatesSummaryOnlyOnCommit(t *testing.T) {
	db := openTestDB(t)
	source, remaining := "Source", "Remaining"
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", Category: &source},
		{ID: "b", UserID: "u"},
		{ID: "c", UserID: "u", Category: &remaining},
		{ID: "d", UserID: "other", Category: &source},
	} {
		if err := db.CreateBook(&book); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := db.DeleteBooksData([]string{"a", "d"}, "u"); err != ErrNotFound {
		t.Fatalf("cross-owner deletion error = %v, want ErrNotFound", err)
	}
	book, err := db.GetBook("a")
	if err != nil || book == nil {
		t.Fatalf("book disappeared after rollback: %+v, %v", book, err)
	}
	summary, err := db.GetBookLibrarySummary("u")
	if err != nil || summary.Total != 3 || summary.Uncategorized != 1 ||
		len(summary.Categories) != 2 || summary.Categories[source] != 1 || summary.Categories[remaining] != 1 {
		t.Fatalf("summary after rollback = %+v, err = %v", summary, err)
	}

	books, err := db.DeleteBooksData([]string{"b", "a", "b", ""}, "u")
	if err != nil || len(books) != 2 || books[0].ID != "b" || books[1].ID != "a" {
		t.Fatalf("deleted books = %+v, err = %v", books, err)
	}
	summary, err = db.GetBookLibrarySummary("u")
	if err != nil || summary.Total != 1 || summary.Uncategorized != 0 ||
		len(summary.Categories) != 1 || summary.Categories[remaining] != 1 {
		t.Fatalf("summary after deletion = %+v, err = %v", summary, err)
	}
	other, err := db.GetBookLibrarySummary("other")
	if err != nil || other.Total != 1 || other.Categories[source] != 1 {
		t.Fatalf("other summary = %+v, err = %v", other, err)
	}
}

func TestUpdateBookKeepsSearchConsistent(t *testing.T) {
	db := openTestDB(t)
	book := &models.Book{ID: "book", UserID: "reader", Title: "古典 Art"}
	if err := db.CreateBook(book); err != nil {
		t.Fatal(err)
	}
	assertMatches := func(query string, want bool) {
		t.Helper()
		books, _, err := db.SearchBooks(book.UserID, query, "", 10, "title")
		if err != nil || len(books) > 1 || (len(books) == 1) != want {
			t.Fatalf("query %q: got %d matches, want match %t, err %v", query, len(books), want, err)
		}
		if want && (books[0].ID != book.ID || books[0].CoverPath != "cover.png") {
			t.Fatalf("query %q returned %+v", query, books[0])
		}
	}
	if _, err := db.UpdateBook(book.ID, book.UserID, func(book *models.Book) bool {
		book.CoverPath = "cover.png"
		return true
	}); err != nil {
		t.Fatal(err)
	}
	assertMatches("古典 art", true)

	if _, err := db.UpdateBook(book.ID, book.UserID, func(book *models.Book) bool {
		book.Title = "当代 Design"
		return true
	}); err != nil {
		t.Fatal(err)
	}
	assertMatches("古典 art", false)
	assertMatches("当代 design", true)
	if err := db.View(func(tx *bbolt.Tx) error {
		text := tx.Bucket(BookSearchIndex).Get([]byte("reader\x00book"))
		if string(text) != "当代 design" {
			t.Errorf("stored search text = %q, want 当代 design", text)
		}
		postings := tx.Bucket(BookSearchGramIndex)
		counts := tx.Bucket(BookSearchGramCounts)
		if postings.Get([]byte("reader\x00古典\x00book")) != nil || counts.Get([]byte("reader\x00古典\x00")) != nil {
			t.Error("old title posting or count survived the update")
		}
		if postings.Get([]byte("reader\x00当代\x00book")) == nil ||
			string(counts.Get([]byte("reader\x00当代\x00"))) != "\x00\x00\x00\x00\x00\x00\x00\x01" {
			t.Error("new title posting or count is incorrect")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func TestBroadSearchStopsBeforeDeserializingLaterPages(t *testing.T) {
	db := openTestDB(t)
	for i := 0; i < 80; i++ {
		if err := db.SaveBook(&models.Book{ID: fmt.Sprintf("b%03d", i), UserID: "u", Title: fmt.Sprintf("Common title %03d", i), CreatedAt: time.Now()}); err != nil {
			t.Fatal(err)
		}
	}
	// A damaged record beyond the requested page must not break an earlier page.
	if err := db.Update(func(tx *bbolt.Tx) error { return tx.Bucket(BooksBucket).Put([]byte("b079"), []byte("invalid")) }); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{"Common", "o"} {
		books, cursor, err := db.SearchBooks("u", q, "", 10, "title")
		if err != nil || len(books) != 10 || cursor != "b009" {
			t.Fatalf("query %q page = %d, %q, %v", q, len(books), cursor, err)
		}
	}
}

func TestSearchBooksReturnsEmptySliceWithoutMatches(t *testing.T) {
	db := openTestDB(t)
	if err := db.CreateBook(&models.Book{ID: "a", UserID: "u", Title: "ab bc"}); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"absent", "星", "abc"} {
		books, cursor, err := db.SearchBooks("u", query, "", 50, "title")
		if err != nil || books == nil || len(books) != 0 || cursor != "" {
			t.Errorf("query %q = %#v, %q, %v; want an empty page", query, books, cursor, err)
		}
	}
}

func TestSelectiveSearchKeepsBestMatchesAcrossCandidateBatches(t *testing.T) {
	db := openTestDB(t)
	// The gram index yields IDs in ascending order, while titles sort in reverse.
	for i := range 9 {
		book := &models.Book{
			ID:     fmt.Sprintf("b%d", i),
			UserID: "u",
			Title:  fmt.Sprintf("Needle %d", 9-i),
		}
		if err := db.SaveBook(book); err != nil {
			t.Fatal(err)
		}
	}

	var cursor string
	for _, page := range []struct {
		ids  []string
		next string
	}{
		{[]string{"b8", "b7"}, "b7"},
		{[]string{"b6", "b5"}, "b5"},
		{[]string{"b4", "b3"}, "b3"},
		{[]string{"b2", "b1"}, "b1"},
		{[]string{"b0"}, ""},
	} {
		books, next, err := db.SearchBooks("u", "Needle", cursor, 2, "title")
		if err != nil {
			t.Fatal(err)
		}
		ids := make([]string, len(books))
		for i := range books {
			ids[i] = books[i].ID
		}
		if !slices.Equal(ids, page.ids) || next != page.next {
			t.Fatalf("page after %q = %v, next cursor = %q; want %v, %q", cursor, ids, next, page.ids, page.next)
		}
		cursor = next
	}
}

func TestMissingHashIndexTracksOnlyUnhashedBooks(t *testing.T) {
	db := openTestDB(t)
	book := &models.Book{ID: "legacy", UserID: "u", Title: "Legacy"}
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	assertEntry := func(want bool) {
		t.Helper()
		if err := db.View(func(tx *bbolt.Tx) error {
			b := tx.Bucket([]byte("book_missing_hash_index"))
			if b == nil {
				t.Fatal("missing durable hash backlog index")
			}
			got := b.Get([]byte("u\x00legacy")) != nil
			if got != want {
				t.Fatalf("pending hash = %v, want %v", got, want)
			}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	assertEntry(true)
	book.ContentHash = "hashed"
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	assertEntry(false)
}

func TestCategoryIndexesFollowOwnershipDeleteAndProgress(t *testing.T) {
	db := openTestDB(t)
	category := "Fiction"
	created := time.Now().UTC()
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", Title: "Alpha", Category: &category, CreatedAt: created},
		{ID: "b", UserID: "u", Title: "Beta", Category: &category, CreatedAt: created.Add(time.Hour)},
	} {
		if err := db.SaveBook(&book); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.SaveProgress(&models.Progress{BookID: "a", UpdatedAt: created.Add(2 * time.Hour)}, "u"); err != nil {
		t.Fatal(err)
	}
	books, _, err := db.ListBooksBySortedCursor("u", "", 10, "recent_read", &category)
	if err != nil || len(books) != 2 || books[0].ID != "a" {
		t.Fatalf("recent category page = %+v, %v", books, err)
	}
	book, err := db.GetBook("a")
	if err != nil {
		t.Fatal(err)
	}
	book.UserID = "v"
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	books, _, err = db.SearchBooks("u", "Alpha", "", 10, "title", &category)
	if err != nil || len(books) != 0 {
		t.Fatalf("old owner results = %+v, %v", books, err)
	}
	books, _, err = db.SearchBooks("v", "Alpha", "", 10, "title", &category)
	if err != nil || len(books) != 1 {
		t.Fatalf("new owner results = %+v, %v", books, err)
	}
	if err := db.DeleteBookData("a", "v"); err != nil {
		t.Fatal(err)
	}
	books, _, err = db.SearchBooks("v", "Alpha", "", 10, "title", &category)
	if err != nil || len(books) != 0 {
		t.Fatalf("deleted user results = %+v, %v", books, err)
	}
	summary, err := db.GetBookLibrarySummary("v")
	if err != nil || summary.Total != 0 {
		t.Fatalf("deleted user summary = %+v, %v", summary, err)
	}
}

func TestMissingHashBacklogSurvivesReopenAndPages(t *testing.T) {
	path := filepath.Join(t.TempDir(), "restart.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 35; i++ {
		if err := db.SaveBook(&models.Book{ID: fmt.Sprintf("a%02d", i), UserID: "u", Filename: "legacy.epub"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	owner := "u"
	cursor := ""
	total := 0
	for {
		books, next, err := db.ListBooksMissingHash(&owner, cursor, 16)
		if err != nil || len(books) > 16 {
			t.Fatalf("backlog page = %d, %v", len(books), err)
		}
		for _, book := range books {
			total++
			if err := db.BackfillBookContentHash(book.ID, owner, book.Filename, "hash-"+book.ID); err != nil {
				t.Fatal(err)
			}
		}
		if next == "" {
			break
		}
		cursor = next
	}
	if total != 35 {
		t.Fatalf("backfilled %d books, want 35", total)
	}
	books, _, err := db.ListBooksMissingHash(&owner, "", 1)
	if err != nil || len(books) != 0 {
		t.Fatalf("remaining backlog = %+v, %v", books, err)
	}
}

func TestBackfillDoesNotOverwriteConcurrentMetadata(t *testing.T) {
	db := openTestDB(t)
	book := &models.Book{ID: "a", UserID: "u", Title: "Original", Filename: "a.epub"}
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	book.Title = "Edited while hashing"
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	if err := db.BackfillBookContentHash("a", "u", "a.epub", "hash"); err != nil {
		t.Fatal(err)
	}
	got, err := db.GetBook("a")
	if err != nil || got.Title != book.Title || got.ContentHash != "hash" {
		t.Fatalf("backfilled book = %+v, %v", got, err)
	}
}

func TestMigrationTenRebuildsCategoryCountsAndMissingHashIndexes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "migration.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	category := "Fiction"
	book := &models.Book{ID: "legacy", UserID: "u", Title: "Migration title", Category: &category}
	if err := db.SaveBook(book); err != nil {
		t.Fatal(err)
	}
	if err := db.Update(func(tx *bbolt.Tx) error {
		for _, name := range [][]byte{BookCategorySortIndex, BookSearchGramCounts, BookMissingHashIndex} {
			if err := tx.DeleteBucket(name); err != nil {
				return err
			}
		}
		return tx.Bucket(SystemMetaBucket).Put([]byte("schema_version"), []byte("9"))
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	books, _, err := db.ListBooksBySortedCursor(PersonalLibrary, "", 10, "title", &category)
	if err != nil || len(books) != 1 {
		t.Fatalf("migrated category page = %+v, %v", books, err)
	}
	books, _, err = db.SearchBooks(PersonalLibrary, "Migration", "", 10, "title", &category)
	if err != nil || len(books) != 1 {
		t.Fatalf("migrated search = %+v, %v", books, err)
	}
	owner := PersonalLibrary
	books, _, err = db.ListBooksMissingHash(&owner, "", 10)
	if err != nil || len(books) != 1 {
		t.Fatalf("migrated hash backlog = %+v, %v", books, err)
	}
}

func TestHashBatchRollsBackAllUpdatesOnStoredRecordError(t *testing.T) {
	db := openTestDB(t)
	for _, id := range []string{"a", "b"} {
		if err := db.SaveBook(&models.Book{ID: id, UserID: "u", Filename: id + ".epub"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Update(func(tx *bbolt.Tx) error { return tx.Bucket(BooksBucket).Put([]byte("b"), []byte("invalid")) }); err != nil {
		t.Fatal(err)
	}
	err := db.BackfillBookContentHashes([]models.Book{
		{ID: "a", UserID: "u", Filename: "a.epub", ContentHash: "hash-a"},
		{ID: "b", UserID: "u", Filename: "b.epub", ContentHash: "hash-b"},
	})
	if err == nil {
		t.Fatal("expected invalid stored record to reject hash batch")
	}
	book, err := db.GetBook("a")
	if err != nil || book.ContentHash != "" {
		t.Fatalf("partial hash update escaped rollback: %+v, %v", book, err)
	}
}

func TestLegacyDuplicateHashSurvivesDeletingIndexedCopy(t *testing.T) {
	db := openTestDB(t)
	snapshots := []models.Book{
		{ID: "a", UserID: "u", Filename: "a.epub"},
		{ID: "b", UserID: "u", Filename: "b.epub"},
	}
	for i := range snapshots {
		if err := db.SaveBook(&snapshots[i]); err != nil {
			t.Fatal(err)
		}
		snapshots[i].ContentHash = "same-content"
	}
	if err := db.BackfillBookContentHashes(snapshots); err != nil {
		t.Fatal(err)
	}
	indexed, err := db.FindBookByContentHash("u", "same-content")
	if err != nil || indexed == nil {
		t.Fatalf("initial duplicate = %+v, %v", indexed, err)
	}
	if err := db.DeleteBookData(indexed.ID, "u"); err != nil {
		t.Fatal(err)
	}
	remaining, err := db.FindBookByContentHash("u", "same-content")
	if err != nil || remaining == nil || remaining.ID == indexed.ID {
		t.Fatalf("remaining legacy duplicate = %+v, %v", remaining, err)
	}
	if err := db.CreateBook(&models.Book{ID: "c", UserID: "u", ContentHash: "same-content"}); err != ErrDuplicateBookContent {
		t.Fatalf("new duplicate after deletion = %v", err)
	}
}

func TestMigrationTenRollsBackIndexesAndVersionOnInvalidRecord(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rollback.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Update(func(tx *bbolt.Tx) error {
		for _, name := range [][]byte{BookCategorySortIndex, BookSearchGramCounts, BookMissingHashIndex} {
			if err := tx.DeleteBucket(name); err != nil {
				return err
			}
		}
		if err := tx.Bucket(BookSortIndex).Put([]byte("rollback-marker"), []byte("kept")); err != nil {
			return err
		}
		if err := tx.Bucket(BooksBucket).Put([]byte("invalid"), []byte("invalid")); err != nil {
			return err
		}
		return tx.Bucket(SystemMetaBucket).Put([]byte("schema_version"), []byte("9"))
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	migrated, err := Open(path)
	if err == nil {
		migrated.Close()
		t.Fatal("expected migration failure")
	}
	raw, err := bbolt.Open(path, 0600, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	if err := raw.View(func(tx *bbolt.Tx) error {
		if version := string(tx.Bucket(SystemMetaBucket).Get([]byte("schema_version"))); version != "9" {
			t.Fatalf("partial schema version persisted: %s", version)
		}
		for _, name := range [][]byte{BookCategorySortIndex, BookSearchGramCounts, BookMissingHashIndex} {
			if tx.Bucket(name) != nil {
				t.Fatalf("partially created bucket persisted: %s", name)
			}
		}
		if marker := string(tx.Bucket(BookSortIndex).Get([]byte("rollback-marker"))); marker != "kept" {
			t.Fatalf("original index changed: %q", marker)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func TestContentHashBackfillAndDeletionAreOwnerIsolated(t *testing.T) {
	db := openTestDB(t)
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", Filename: "a.epub"},
		{ID: "b", UserID: "v", Filename: "b.epub"},
	} {
		if err := db.SaveBook(&book); err != nil {
			t.Fatal(err)
		}
		if err := db.BackfillBookContentHash(book.ID, book.UserID, book.Filename, "shared-hash"); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.DeleteBookData("a", "u"); err != nil {
		t.Fatal(err)
	}
	got, err := db.FindBookByContentHash("u", "shared-hash")
	if err != nil || got != nil {
		t.Fatalf("deleted owner's content = %+v, %v", got, err)
	}
	got, err = db.FindBookByContentHash("v", "shared-hash")
	if err != nil || got == nil || got.ID != "b" {
		t.Fatalf("other owner's content = %+v, %v", got, err)
	}
}

func TestRenameCategoryRollsBackAllBooksOnRecordError(t *testing.T) {
	db := openTestDB(t)
	source, destination := "Source", "Destination"
	for _, id := range []string{"a", "b"} {
		if err := db.SaveBook(&models.Book{ID: id, UserID: "u", Title: id, Category: &source, ContentHash: id}); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Update(func(tx *bbolt.Tx) error { return tx.Bucket(BooksBucket).Put([]byte("b"), []byte("invalid")) }); err != nil {
		t.Fatal(err)
	}
	if _, err := db.RenameBookCategory("u", source, &destination); err == nil {
		t.Fatal("expected invalid record to roll back category rename")
	}
	book, err := db.GetBook("a")
	if err != nil || book.Category == nil || *book.Category != source {
		t.Fatalf("partial category update escaped transaction: %+v, %v", book, err)
	}
	summary, err := db.GetBookLibrarySummary("u")
	if err != nil || summary.Categories[source] != 2 || summary.Categories[destination] != 0 {
		t.Fatalf("partial summary update escaped transaction: %+v, %v", summary, err)
	}
}
