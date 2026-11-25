package storage

import (
	"encoding/json"
	"strings"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

// BookLibrarySummary contains the small amount of aggregate data needed to
// render filters without transferring every book in a large library.
type BookLibrarySummary struct {
	Total         int            `json:"total"`
	Uncategorized int            `json:"uncategorized"`
	Categories    map[string]int `json:"categories"`
}

func (db *DB) GetBookLibrarySummary(userID string) (BookLibrarySummary, error) {
	summary := BookLibrarySummary{Categories: make(map[string]int)}
	err := db.View(func(tx *bbolt.Tx) error {
		var err error
		summary, err = loadLibrarySummary(tx, userID)
		return err
	})
	return summary, err
}

func (db *DB) UpdateBooksCategory(ids []string, userID string, category *string) ([]models.Book, error) {
	var books []models.Book
	err := db.Update(func(tx *bbolt.Tx) error {
		var err error
		books, err = updateBooksCategoryInTx(tx, ids, userID, category, true)
		return err
	})
	return books, err
}

func categoryForBook(book *models.Book) string {
	if book == nil || book.Category == nil {
		return ""
	}
	return strings.TrimSpace(*book.Category)
}

func loadLibrarySummary(tx *bbolt.Tx, userID string) (BookLibrarySummary, error) {
	summary := BookLibrarySummary{Categories: make(map[string]int)}
	if userID == "" {
		return summary, nil
	}
	data := tx.Bucket(LibrarySummaryIndex).Get([]byte(userID))
	if data == nil {
		return summary, nil
	}
	if err := json.Unmarshal(data, &summary); err != nil {
		return BookLibrarySummary{}, err
	}
	if summary.Categories == nil {
		summary.Categories = make(map[string]int)
	}
	return summary, nil
}

func saveLibrarySummary(tx *bbolt.Tx, userID string, summary BookLibrarySummary) error {
	if userID == "" {
		return nil
	}
	data, err := json.Marshal(summary)
	if err != nil {
		return err
	}
	return tx.Bucket(LibrarySummaryIndex).Put([]byte(userID), data)
}

func adjustLibrarySummary(tx *bbolt.Tx, book *models.Book, delta int) error {
	if book == nil || book.UserID == "" || delta == 0 {
		return nil
	}
	summary, err := loadLibrarySummary(tx, book.UserID)
	if err != nil {
		return err
	}
	summary.adjustCount(categoryForBook(book), delta)
	return saveLibrarySummary(tx, book.UserID, summary)
}

func updateBookLibrarySummary(tx *bbolt.Tx, book, oldBook *models.Book) error {
	if oldBook == nil || oldBook.UserID != book.UserID {
		if err := adjustLibrarySummary(tx, oldBook, -1); err != nil {
			return err
		}
		return adjustLibrarySummary(tx, book, 1)
	}
	if book.UserID == "" {
		return nil
	}
	summary, err := loadLibrarySummary(tx, book.UserID)
	if err != nil {
		return err
	}
	summary.adjustCount(categoryForBook(oldBook), -1)
	summary.adjustCount(categoryForBook(book), 1)
	return saveLibrarySummary(tx, book.UserID, summary)
}

func (summary *BookLibrarySummary) adjustCount(category string, delta int) {
	summary.Total = max(0, summary.Total+delta)
	if category == "" {
		summary.Uncategorized = max(0, summary.Uncategorized+delta)
		return
	}
	summary.Categories[category] += delta
	if summary.Categories[category] <= 0 {
		delete(summary.Categories, category)
	}
}

func rebuildLibrarySummaryIndex(tx *bbolt.Tx) error {
	if err := tx.DeleteBucket(LibrarySummaryIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(LibrarySummaryIndex); err != nil {
		return err
	}
	summaries := make(map[string]*BookLibrarySummary)
	if err := tx.Bucket(BooksBucket).ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		if book.UserID == "" {
			return nil
		}
		summary := summaries[book.UserID]
		if summary == nil {
			summary = &BookLibrarySummary{Categories: make(map[string]int)}
			summaries[book.UserID] = summary
		}
		summary.adjustCount(categoryForBook(&book), 1)
		return nil
	}); err != nil {
		return err
	}
	for userID, summary := range summaries {
		if err := saveLibrarySummary(tx, userID, *summary); err != nil {
			return err
		}
	}
	return nil
}
