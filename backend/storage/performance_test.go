package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

const (
	benchmarkLibrarySize1000  = 1_000
	benchmarkLibrarySize10000 = 10_000
)

type benchmarkFixture struct {
	once sync.Once
	path string
	err  error
}

var (
	benchmarkFixtureRoot     string
	benchmarkProgressStartAt = time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC)
	benchmarkFixtures        = map[int]*benchmarkFixture{
		benchmarkLibrarySize1000:  {},
		benchmarkLibrarySize10000: {},
	}
)

func TestMain(m *testing.M) {
	root, err := os.MkdirTemp("", "z-reader-storage-benchmark-*")
	if err != nil {
		fmt.Fprintln(os.Stderr, "create benchmark fixture directory:", err)
		os.Exit(1)
	}
	benchmarkFixtureRoot = root

	code := m.Run()
	if err := os.RemoveAll(root); err != nil {
		fmt.Fprintln(os.Stderr, "remove benchmark fixture directory:", err)
	}
	os.Exit(code)
}

func openBenchmarkLibrary(tb testing.TB, size int) *DB {
	tb.Helper()
	fixturePath, err := benchmarkFixturePath(size)
	if err != nil {
		tb.Fatal(err)
	}
	dbPath := filepath.Join(tb.TempDir(), "benchmark.db")
	if err := copyBenchmarkFixture(fixturePath, dbPath); err != nil {
		tb.Fatal(err)
	}
	db, err := Open(dbPath)
	if err != nil {
		tb.Fatal(err)
	}
	tb.Cleanup(func() { _ = db.Close() })
	return db
}

func benchmarkFixturePath(size int) (string, error) {
	fixture, ok := benchmarkFixtures[size]
	if !ok {
		return "", fmt.Errorf("unsupported benchmark library size: %d", size)
	}
	fixture.once.Do(func() {
		path := filepath.Join(benchmarkFixtureRoot, fmt.Sprintf("library-%d.db", size))
		db, err := Open(path)
		if err != nil {
			fixture.err = err
			return
		}
		if err := seedBenchmarkLibrary(db, size); err != nil {
			_ = db.Close()
			fixture.err = err
			return
		}
		if err := db.Close(); err != nil {
			fixture.err = err
			return
		}
		fixture.path = path
	})
	return fixture.path, fixture.err
}

func copyBenchmarkFixture(sourceDBPath, destinationDBPath string) error {
	for _, suffix := range []string{"", ".sessions"} {
		if err := copyBenchmarkFile(sourceDBPath+suffix, destinationDBPath+suffix); err != nil {
			return err
		}
	}
	return nil
}

func copyBenchmarkFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

// seedBenchmarkLibrary creates the same indexed shelf shape produced by normal
// writes, but uses one setup transaction. Each size is built once per test
// process and copied for each scenario, so setup does not dominate query timing.
func seedBenchmarkLibrary(db *DB, size int) error {
	userID := "benchmark-user"
	createdAt := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	return db.Update(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
		userBooksIndex := tx.Bucket(UserBooksIndex)
		for index := 0; index < size; index++ {
			category := fmt.Sprintf("分类-%02d", index%10)
			book := &models.Book{
				ID:        fmt.Sprintf("benchmark-%05d", index),
				UserID:    userID,
				Title:     fmt.Sprintf("性能测试书籍 %05d", index),
				Author:    fmt.Sprintf("作者 %02d", index%50),
				Filename:  fmt.Sprintf("benchmark-%05d.epub", index),
				Format:    "epub",
				Category:  &category,
				CreatedAt: createdAt.Add(time.Duration(index) * time.Second),
			}
			data, err := book.MarshalDB()
			if err != nil {
				return err
			}
			if err := booksBucket.Put([]byte(book.ID), data); err != nil {
				return err
			}
			if err := userBooksIndex.Put([]byte(userID+":"+book.ID), []byte{}); err != nil {
				return err
			}
		}
		for _, rebuild := range []func(*bbolt.Tx) error{
			rebuildBookSortIndex,
			rebuildBookSearchIndex,
			rebuildBookContentIndex,
			rebuildLibrarySummaryIndex,
			rebuildBookSearchGramIndex,
		} {
			if err := rebuild(tx); err != nil {
				return err
			}
		}
		return nil
	})
}

func BenchmarkLibrarySearch1000(b *testing.B) {
	benchmarkLibrarySearch(b, benchmarkLibrarySize1000)
}

func BenchmarkLibrarySearch10000(b *testing.B) {
	benchmarkLibrarySearch(b, benchmarkLibrarySize10000)
}

func benchmarkLibrarySearch(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ReportAllocs()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, _, err := db.SearchBooks("benchmark-user", "性能测试书籍 00042", "", 50, "title"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLibraryFirstPage1000(b *testing.B) {
	benchmarkLibraryFirstPage(b, benchmarkLibrarySize1000)
}

func BenchmarkLibraryFirstPage10000(b *testing.B) {
	benchmarkLibraryFirstPage(b, benchmarkLibrarySize10000)
}

func benchmarkLibraryFirstPage(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ReportAllocs()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, _, err := db.ListBooksBySortedCursor("benchmark-user", "", 50, "recent_added"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLibrarySummary1000(b *testing.B) {
	benchmarkLibrarySummary(b, benchmarkLibrarySize1000)
}

func BenchmarkLibrarySummary10000(b *testing.B) {
	benchmarkLibrarySummary(b, benchmarkLibrarySize10000)
}

func benchmarkLibrarySummary(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ReportAllocs()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, err := db.GetBookLibrarySummary("benchmark-user"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLibraryProgressSave1000(b *testing.B) {
	benchmarkLibraryProgressSave(b, benchmarkLibrarySize1000)
}

func BenchmarkLibraryProgressSave10000(b *testing.B) {
	benchmarkLibraryProgressSave(b, benchmarkLibrarySize10000)
}

func BenchmarkLibraryProgressSaveParallel1000(b *testing.B) {
	benchmarkLibraryProgressSaveParallel(b, benchmarkLibrarySize1000)
}

func BenchmarkLibraryProgressSaveParallel10000(b *testing.B) {
	benchmarkLibraryProgressSaveParallel(b, benchmarkLibrarySize10000)
}

// benchmarkLibraryProgressSaveParallel measures the contention caused by many
// devices saving progress across a small working set of books. bbolt has a
// single writer, so this scenario catches regressions in the write transaction.
func benchmarkLibraryProgressSaveParallel(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	bookIDs := make([]string, 100)
	for index := range bookIDs {
		bookIDs[index] = fmt.Sprintf("benchmark-%05d", index)
	}

	var sequence atomic.Uint64
	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			offset := sequence.Add(1)
			progress := &models.Progress{
				BookID:     bookIDs[int(offset%uint64(len(bookIDs)))],
				CFI:        "epubcfi(/6/2[chapter]!/4/1:123)",
				Percentage: float64(offset%10_000) / 100,
				DeviceID:   "benchmark-device",
				UpdatedAt:  benchmarkProgressStartAt.Add(time.Duration(offset) * time.Millisecond),
			}
			if err := db.SaveProgress(progress, "benchmark-user"); err != nil {
				b.Fatal(err)
			}
		}
	})
}

func benchmarkLibraryProgressSave(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ReportAllocs()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		progress := &models.Progress{
			BookID:     "benchmark-00042",
			CFI:        "epubcfi(/6/2[chapter]!/4/1:123)",
			Percentage: float64(index%10_000) / 100,
			DeviceID:   "benchmark-device",
			UpdatedAt:  benchmarkProgressStartAt.Add(time.Duration(index) * time.Millisecond),
		}
		if err := db.SaveProgress(progress, "benchmark-user"); err != nil {
			b.Fatal(err)
		}
	}
}

func TestBenchmarkLibraryFixtureSupportsShelfQueries(t *testing.T) {
	db := openBenchmarkLibrary(t, benchmarkLibrarySize1000)

	books, nextCursor, err := db.ListBooksBySortedCursor("benchmark-user", "", 50, "recent_added")
	if err != nil || len(books) != 50 || nextCursor == "" {
		t.Fatalf("first page = %d books, cursor = %q, err = %v", len(books), nextCursor, err)
	}
	matched, _, err := db.SearchBooks("benchmark-user", "性能测试书籍 00042", "", 50, "title")
	if err != nil || len(matched) != 1 || matched[0].ID != "benchmark-00042" {
		t.Fatalf("search results = %+v, err = %v", matched, err)
	}
	summary, err := db.GetBookLibrarySummary("benchmark-user")
	if err != nil || summary.Total != benchmarkLibrarySize1000 || len(summary.Categories) != 10 {
		t.Fatalf("summary = %+v, err = %v", summary, err)
	}
}
