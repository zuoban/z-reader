package storage

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"z-reader/backend/models"
)

const benchmarkLibrarySize = 1000

func openBenchmarkLibrary(b *testing.B, size int) *DB {
	b.Helper()
	db, err := Open(filepath.Join(b.TempDir(), "benchmark.db"))
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() { _ = db.Close() })
	userID := "benchmark-user"
	createdAt := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
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
		if err := db.SaveBook(book); err != nil {
			b.Fatal(err)
		}
	}
	return db
}

func BenchmarkLibrarySearch1000(b *testing.B) {
	benchmarkLibrarySearch(b, benchmarkLibrarySize)
}

func BenchmarkLibrarySearch10000(b *testing.B) {
	benchmarkLibrarySearch(b, 10000)
}

func benchmarkLibrarySearch(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, _, err := db.SearchBooks("benchmark-user", "测试书籍 0042", "", 50, "title"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLibraryFirstPage1000(b *testing.B) {
	benchmarkLibraryFirstPage(b, benchmarkLibrarySize)
}

func BenchmarkLibraryFirstPage10000(b *testing.B) {
	benchmarkLibraryFirstPage(b, 10000)
}

func benchmarkLibraryFirstPage(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, _, err := db.ListBooksBySortedCursor("benchmark-user", "", 50, "recent_added"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLibrarySummary1000(b *testing.B) {
	benchmarkLibrarySummary(b, benchmarkLibrarySize)
}

func BenchmarkLibrarySummary10000(b *testing.B) {
	benchmarkLibrarySummary(b, 10000)
}

func benchmarkLibrarySummary(b *testing.B, size int) {
	b.Helper()
	db := openBenchmarkLibrary(b, size)
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, err := db.GetBookLibrarySummary("benchmark-user"); err != nil {
			b.Fatal(err)
		}
	}
}
