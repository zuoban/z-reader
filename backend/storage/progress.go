package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func progressKey(userID string, bookID string) []byte {
	return []byte(userID + ":" + bookID)
}

func progressTimeIndexPrefix(userID string) []byte {
	return []byte(userID + bookSortSeparator)
}

func progressTimeIndexKey(progress *models.Progress) []byte {
	timestamp := progress.UpdatedAt.UnixNano()
	if timestamp < 0 {
		timestamp = 0
	}
	return []byte(fmt.Sprintf("%s%019d%s%s", progressTimeIndexPrefix(progress.UserID), timestamp, bookSortSeparator, progress.BookID))
}

func addProgressToTimeIndex(tx *bbolt.Tx, progress *models.Progress) error {
	if progress.UserID == "" || progress.BookID == "" {
		return nil
	}
	return tx.Bucket(ProgressTimeIndex).Put(progressTimeIndexKey(progress), []byte(progress.BookID))
}

func removeProgressFromTimeIndex(tx *bbolt.Tx, progress *models.Progress) error {
	if progress.UserID == "" || progress.BookID == "" {
		return nil
	}
	return tx.Bucket(ProgressTimeIndex).Delete(progressTimeIndexKey(progress))
}

func rebuildProgressTimeIndex(tx *bbolt.Tx) error {
	if err := tx.DeleteBucket(ProgressTimeIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(ProgressTimeIndex); err != nil {
		return err
	}
	progressBucket := tx.Bucket(ProgressBucket)
	return progressBucket.ForEach(func(_, data []byte) error {
		var progress models.Progress
		if err := json.Unmarshal(data, &progress); err != nil {
			return err
		}
		return addProgressToTimeIndex(tx, &progress)
	})
}

func (db *DB) DeleteProgress(bookID string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		if data := b.Get(progressKey(userID, bookID)); data != nil {
			var progress models.Progress
			if err := json.Unmarshal(data, &progress); err != nil {
				return err
			}
			if err := removeProgressFromTimeIndex(tx, &progress); err != nil {
				return err
			}
		}
		return b.Delete(progressKey(userID, bookID))
	})
}

func (db *DB) SaveProgress(progress *models.Progress, userID string) error {
	return db.SaveProgressIfCurrent(progress, userID, nil)
}

// SaveProgressIfCurrent validates and writes in one transaction so ownership,
// optimistic concurrency, the book timestamp and progress indexes stay atomic.
func (db *DB) SaveProgressIfCurrent(progress *models.Progress, userID string, expectedUpdatedAt *time.Time) error {
	return db.saveProgress(progress, userID, expectedUpdatedAt, false)
}

// CreateProgress saves the first progress record, or returns ErrProgressConflict.
func (db *DB) CreateProgress(progress *models.Progress, userID string) error {
	return db.saveProgress(progress, userID, nil, true)
}

func (db *DB) saveProgress(progress *models.Progress, userID string, expectedUpdatedAt *time.Time, createOnly bool) error {
	progress.UserID = userID
	key := progressKey(userID, progress.BookID)
	data, err := json.Marshal(progress)
	if err != nil {
		return err
	}
	return db.Update(func(tx *bbolt.Tx) error {
		booksBucket, progressBucket := tx.Bucket(BooksBucket), tx.Bucket(ProgressBucket)
		bookData := booksBucket.Get([]byte(progress.BookID))
		if bookData == nil {
			return ErrNotFound
		}
		var book models.Book
		if err := book.UnmarshalDB(bookData); err != nil {
			return err
		}
		if book.UserID != userID {
			return ErrNotFound
		}

		var previous *models.Progress
		if previousData := progressBucket.Get(key); previousData != nil {
			var value models.Progress
			if err := json.Unmarshal(previousData, &value); err != nil {
				return err
			}
			previous = &value
		}
		if createOnly && previous != nil {
			return ErrProgressConflict
		}
		if expectedUpdatedAt != nil && (previous == nil || !previous.UpdatedAt.Equal(*expectedUpdatedAt)) {
			return ErrProgressConflict
		}

		if book.LastReadAt == nil || !book.LastReadAt.Equal(progress.UpdatedAt) {
			oldBook := book
			lastReadAt := progress.UpdatedAt
			book.LastReadAt = &lastReadAt
			updatedBook, err := book.MarshalDB()
			if err != nil {
				return err
			}
			if err := booksBucket.Put([]byte(book.ID), updatedBook); err != nil {
				return err
			}
			if err := updateBookSortKey(tx, &oldBook, &book, "recent_read"); err != nil {
				return err
			}
		}
		if previous != nil && !previous.UpdatedAt.Equal(progress.UpdatedAt) {
			if err := removeProgressFromTimeIndex(tx, previous); err != nil {
				return err
			}
		}
		if err := progressBucket.Put(key, data); err != nil {
			return err
		}
		return addProgressToTimeIndex(tx, progress)
	})
}

func (db *DB) GetProgress(bookID string, userID string) (*models.Progress, error) {
	var progress models.Progress
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		data := b.Get(progressKey(userID, bookID))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &progress)
	})
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &progress, nil
}

func (db *DB) ListProgress(userID string) ([]models.Progress, error) {
	items := []models.Progress{}
	prefix := []byte(userID + ":")
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		c := b.Cursor()
		for k, v := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, v = c.Next() {
			var progress models.Progress
			if err := json.Unmarshal(v, &progress); err != nil {
				return err
			}
			if progress.UserID == userID {
				items = append(items, progress)
			}
		}
		return nil
	})
	return items, err
}

// ListProgressForBooks reads progress only for the requested shelf page. It
// keeps initial rendering bounded even when a user has a large library.
func (db *DB) ListProgressForBooks(userID string, bookIDs []string) ([]models.Progress, error) {
	items := make([]models.Progress, 0, len(bookIDs))
	ids := uniqueNonEmptyStrings(bookIDs)
	if userID == "" || len(ids) == 0 {
		return items, nil
	}

	err := db.View(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(ProgressBucket)
		for _, bookID := range ids {
			data := bucket.Get(progressKey(userID, bookID))
			if data == nil {
				continue
			}
			var progress models.Progress
			if err := json.Unmarshal(data, &progress); err != nil {
				return err
			}
			if progress.UserID == userID && progress.BookID == bookID {
				items = append(items, progress)
			}
		}
		return nil
	})
	return items, err
}

// ListProgressUpdatedSince returns changes at or after the supplied time. The
// inclusive boundary deliberately permits a duplicate record on the next sync
// rather than losing concurrent writes sharing a timestamp.
func (db *DB) ListProgressUpdatedSince(userID string, since time.Time) ([]models.Progress, error) {
	if since.IsZero() {
		return db.ListProgress(userID)
	}

	items := []models.Progress{}
	prefix := progressTimeIndexPrefix(userID)
	probe := &models.Progress{UserID: userID, UpdatedAt: since}
	start := progressTimeIndexKey(probe)
	err := db.View(func(tx *bbolt.Tx) error {
		indexBucket := tx.Bucket(ProgressTimeIndex)
		progressBucket := tx.Bucket(ProgressBucket)
		cursor := indexBucket.Cursor()
		for key, bookID := cursor.Seek(start); key != nil && bytes.HasPrefix(key, prefix); key, bookID = cursor.Next() {
			data := progressBucket.Get(progressKey(userID, string(bookID)))
			if data == nil {
				continue
			}
			var progress models.Progress
			if err := json.Unmarshal(data, &progress); err != nil {
				return err
			}
			if progress.UserID == userID && !progress.UpdatedAt.Before(since) {
				items = append(items, progress)
			}
		}
		return nil
	})
	return items, err
}
