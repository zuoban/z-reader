package storage

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

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
	if err := db.DeleteUserData("v"); err != nil {
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
	books, _, err := db.ListBooksBySortedCursor("u", "", 10, "title", &category)
	if err != nil || len(books) != 1 {
		t.Fatalf("migrated category page = %+v, %v", books, err)
	}
	books, _, err = db.SearchBooks("u", "Migration", "", 10, "title", &category)
	if err != nil || len(books) != 1 {
		t.Fatalf("migrated search = %+v, %v", books, err)
	}
	owner := "u"
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
