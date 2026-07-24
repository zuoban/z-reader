package storage

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"z-reader/backend/models"
)

func TestSaveProgressIfCurrentAllowsOnlyOneConcurrentWriter(t *testing.T) {
	db := openTestDB(t)
	const userID = "concurrent-user"
	const bookID = "concurrent-book"
	initialUpdatedAt := time.Now().UTC().Truncate(time.Second)

	if err := db.SaveBook(&models.Book{
		ID:        bookID,
		UserID:    userID,
		Title:     "Concurrent book",
		Filename:  "concurrent.epub",
		Format:    "epub",
		CreatedAt: initialUpdatedAt,
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveProgress(&models.Progress{
		BookID:     bookID,
		CFI:        "epubcfi(/6/2)",
		Percentage: 1,
		UpdatedAt:  initialUpdatedAt,
	}, userID); err != nil {
		t.Fatal(err)
	}

	const writers = 16
	start := make(chan struct{})
	results := make(chan error, writers)
	var ready sync.WaitGroup
	ready.Add(writers)
	for i := range writers {
		go func(index int) {
			ready.Done()
			<-start
			results <- db.SaveProgressIfCurrent(&models.Progress{
				BookID:     bookID,
				CFI:        fmt.Sprintf("epubcfi(/6/%d)", index+4),
				Percentage: float64(index + 2),
				UpdatedAt:  initialUpdatedAt.Add(time.Duration(index+1) * time.Nanosecond),
			}, userID, &initialUpdatedAt)
		}(i)
	}
	ready.Wait()
	close(start)

	successes := 0
	for range writers {
		err := <-results
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrProgressConflict):
			continue
		default:
			t.Fatalf("unexpected concurrent save error: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("expected exactly one concurrent save to succeed, got %d", successes)
	}

	progress, err := db.GetProgress(bookID, userID)
	if err != nil || progress == nil {
		t.Fatalf("GetProgress = %+v, err = %v", progress, err)
	}
	if !progress.UpdatedAt.After(initialUpdatedAt) {
		t.Fatalf("progress was not updated: %+v", progress)
	}
	book, err := db.GetBook(bookID)
	if err != nil || book == nil || book.LastReadAt == nil || !book.LastReadAt.Equal(progress.UpdatedAt) {
		t.Fatalf("book last_read_at = %+v, progress = %+v, err = %v", book, progress, err)
	}
}
