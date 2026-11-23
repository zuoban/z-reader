package storage

import (
	"bytes"
	"encoding/json"
	"sort"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func bookmarkKey(userID string, bookID string, bookmarkID string) []byte {
	return []byte(userID + ":" + bookID + ":" + bookmarkID)
}

func bookmarkBookPrefix(userID string, bookID string) []byte {
	return []byte(userID + ":" + bookID + ":")
}

func (db *DB) ListBookmarks(bookID string, userID string) ([]models.Bookmark, error) {
	items := []models.Bookmark{}
	err := db.View(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
		bookData := booksBucket.Get([]byte(bookID))
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

		b := tx.Bucket(BookmarksBucket)
		prefix := bookmarkBookPrefix(userID, bookID)
		c := b.Cursor()
		for k, v := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, v = c.Next() {
			var bookmark models.Bookmark
			if err := json.Unmarshal(v, &bookmark); err != nil {
				return err
			}
			if bookmark.UserID == userID && bookmark.BookID == bookID {
				items = append(items, bookmark)
			}
		}
		return nil
	})
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	return items, err
}

func (db *DB) SaveBookmark(bookmark *models.Bookmark, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		bookmark.UserID = userID

		booksBucket := tx.Bucket(BooksBucket)
		bookData := booksBucket.Get([]byte(bookmark.BookID))
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

		data, err := json.Marshal(bookmark)
		if err != nil {
			return err
		}
		b := tx.Bucket(BookmarksBucket)
		return b.Put(bookmarkKey(userID, bookmark.BookID, bookmark.ID), data)
	})
}

func (db *DB) DeleteBookmark(bookID string, bookmarkID string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
		bookData := booksBucket.Get([]byte(bookID))
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

		b := tx.Bucket(BookmarksBucket)
		key := bookmarkKey(userID, bookID, bookmarkID)
		if b.Get(key) == nil {
			return ErrNotFound
		}
		return b.Delete(key)
	})
}
