package storage

import (
	"bytes"
	"encoding/json"
	"slices"
	"strings"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func bookmarkKey(userID string, bookID string, bookmarkID string) []byte {
	return []byte(userID + ":" + bookID + ":" + bookmarkID)
}

func bookmarkBookPrefix(userID string, bookID string) []byte {
	return []byte(userID + ":" + bookID + ":")
}

func deleteBookBookmarks(tx *bbolt.Tx, userID, bookID string) error {
	prefix := bookmarkBookPrefix(userID, bookID)
	ambiguousPrefix := strings.ContainsRune(userID, ':') || strings.ContainsRune(bookID, ':')
	cursor := tx.Bucket(BookmarksBucket).Cursor()
	key, value := cursor.Seek(prefix)
	for bytes.HasPrefix(key, prefix) {
		// When a key can match more than one book, delete only verified matches.
		if ambiguousPrefix || bytes.IndexByte(key[len(prefix):], ':') >= 0 {
			var bookmark models.Bookmark
			if err := json.Unmarshal(value, &bookmark); err != nil ||
				bookmark.UserID != userID || bookmark.BookID != bookID {
				key, value = cursor.Next()
				continue
			}
		}
		if err := cursor.Delete(); err != nil {
			return err
		}
		// Deleting from a writable node can shift the next key into this slot.
		key, value = cursor.Seek(key)
	}
	return nil
}

func (db *DB) ListBookmarks(bookID string, userID string) ([]models.Bookmark, error) {
	items := []models.Bookmark{}
	err := db.View(func(tx *bbolt.Tx) error {
		if _, err := getOwnedBookInTx(tx, bookID, userID); err != nil {
			return err
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
	slices.SortFunc(items, func(a, b models.Bookmark) int {
		return a.CreatedAt.Compare(b.CreatedAt)
	})
	return items, err
}

func (db *DB) SaveBookmark(bookmark *models.Bookmark, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		bookmark.UserID = userID
		if _, err := getOwnedBookInTx(tx, bookmark.BookID, userID); err != nil {
			return err
		}

		data, err := json.Marshal(bookmark)
		if err != nil {
			return err
		}
		b := tx.Bucket(BookmarksBucket)
		return b.Put(bookmarkKey(userID, bookmark.BookID, bookmark.ID), data)
	})
}

func (db *DB) UpdateBookmarkNote(bookID, bookmarkID, userID, note string) (*models.Bookmark, error) {
	var updated models.Bookmark
	err := db.Update(func(tx *bbolt.Tx) error {
		if _, err := getOwnedBookInTx(tx, bookID, userID); err != nil {
			return err
		}

		b := tx.Bucket(BookmarksBucket)
		key := bookmarkKey(userID, bookID, bookmarkID)
		data := b.Get(key)
		if data == nil {
			return ErrNotFound
		}
		if err := json.Unmarshal(data, &updated); err != nil {
			return err
		}
		updated.Note = note
		encoded, err := json.Marshal(&updated)
		if err != nil {
			return err
		}
		return b.Put(key, encoded)
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (db *DB) DeleteBookmark(bookID string, bookmarkID string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		if _, err := getOwnedBookInTx(tx, bookID, userID); err != nil {
			return err
		}

		b := tx.Bucket(BookmarksBucket)
		key := bookmarkKey(userID, bookID, bookmarkID)
		if b.Get(key) == nil {
			return ErrNotFound
		}
		return b.Delete(key)
	})
}
