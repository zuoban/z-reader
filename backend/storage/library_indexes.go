package storage

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"strings"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

var (
	BookCategorySortIndex = []byte("book_category_sort_index")
	BookSearchGramCounts  = []byte("book_search_gram_counts")
	BookMissingHashIndex  = []byte("book_missing_hash_index")
)

func bookCategorySortPrefix(userID, category, sortKey string) []byte {
	category = base64.RawURLEncoding.EncodeToString([]byte(strings.TrimSpace(category)))
	return []byte(sortKey + bookSortSeparator + userID + bookSortSeparator + category + bookSortSeparator)
}

func bookCategorySortIndexKey(book *models.Book, sortKey string) []byte {
	prefix := bookCategorySortPrefix(book.UserID, categoryForBook(book), sortKey)
	return append(prefix, []byte(bookSortValue(book, sortKey)+bookSortSeparator+book.ID)...)
}

// Membership entries share the content bucket with its O(1) canonical lookup.
// They let deletion promote a pre-existing duplicate without scanning books.
func bookContentMembershipKey(book *models.Book) []byte {
	key := append(bookContentIndexKey(book.UserID, book.ContentHash), 0)
	return append(key, []byte(book.ID)...)
}

func adjustBookSearchGramCount(tx *bbolt.Tx, userID, gram string, delta int) error {
	bucket := tx.Bucket(BookSearchGramCounts)
	if bucket == nil {
		return nil
	} // Migrations 6–9 predate the counts bucket.
	key := bookSearchGramIndexPrefix(userID, gram)
	count := bookSearchGramCount(bucket, userID, gram) + delta
	if count <= 0 {
		return bucket.Delete(key)
	}
	var data [8]byte
	binary.BigEndian.PutUint64(data[:], uint64(count))
	return bucket.Put(key, data[:])
}

func bookSearchGramCount(bucket *bbolt.Bucket, userID, gram string) int {
	data := bucket.Get(bookSearchGramIndexPrefix(userID, gram))
	if len(data) != 8 {
		return 0
	}
	return int(binary.BigEndian.Uint64(data))
}

func trackMissingBookHash(tx *bbolt.Tx, book *models.Book) error {
	bucket := tx.Bucket(BookMissingHashIndex)
	if bucket == nil || book.ID == "" {
		return nil
	}
	key := bookSearchIndexKey(book.UserID, book.ID)
	if book.ContentHash != "" {
		return bucket.Delete(key)
	}
	return bucket.Put(key, []byte(book.ID))
}

func rebuildMissingBookHashIndex(tx *bbolt.Tx) error {
	if err := tx.DeleteBucket(BookMissingHashIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(BookMissingHashIndex); err != nil {
		return err
	}
	return tx.Bucket(BooksBucket).ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		return trackMissingBookHash(tx, &book)
	})
}

func rebuildLibraryQueryIndexes(tx *bbolt.Tx) error {
	for _, name := range [][]byte{BookCategorySortIndex, BookSearchGramCounts} {
		if _, err := tx.CreateBucketIfNotExists(name); err != nil {
			return err
		}
	}
	// Rebuild also repairs derived data left stale by older category bulk updates.
	for _, rebuild := range []func(*bbolt.Tx) error{
		rebuildBookSortIndex, rebuildBookSearchIndex, rebuildBookSearchGramIndex,
		rebuildLibrarySummaryIndex, rebuildBookContentIndex, rebuildMissingBookHashIndex,
	} {
		if err := rebuild(tx); err != nil {
			return err
		}
	}
	return nil
}

// ListBooksMissingHash reads a bounded durable backlog page. A nil user selects
// all owners for startup backfill; an empty owner is a valid legacy owner.
func (db *DB) ListBooksMissingHash(userID *string, cursor string, limit int) ([]models.Book, string, error) {
	books := make([]models.Book, 0, max(0, limit))
	if limit <= 0 {
		return books, "", nil
	}
	var next string
	err := db.View(func(tx *bbolt.Tx) error {
		var prefix []byte
		if userID != nil {
			prefix = []byte(*userID + bookSortSeparator)
		}
		start := prefix
		if cursor != "" {
			start = []byte(cursor)
		}
		c := tx.Bucket(BookMissingHashIndex).Cursor()
		for key, id := c.Seek(start); key != nil && (prefix == nil || bytes.HasPrefix(key, prefix)); key, id = c.Next() {
			if string(key) == cursor {
				continue
			}
			if len(books) == limit {
				return nil
			}
			next = string(key)
			data := tx.Bucket(BooksBucket).Get(id)
			if data == nil {
				continue
			}
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			if book.ContentHash == "" {
				books = append(books, book)
			}
		}
		next = ""
		return nil
	})
	return books, next, err
}

// BackfillBookContentHash changes only the hash of the current record. Metadata
// edits, ownership transfers and deletions during file I/O must never be lost.
func (db *DB) BackfillBookContentHash(id, userID, filename, hash string) error {
	return db.BackfillBookContentHashes([]models.Book{{
		ID: id, UserID: userID, Filename: filename, ContentHash: hash,
	}})
}

// BackfillBookContentHashes commits one bounded worker batch with a single
// durable sync, refreshing each record to preserve concurrent metadata edits.
func (db *DB) BackfillBookContentHashes(hashes []models.Book) error {
	if len(hashes) == 0 {
		return nil
	}
	return db.Update(func(tx *bbolt.Tx) error {
		books := tx.Bucket(BooksBucket)
		for _, snapshot := range hashes {
			if snapshot.ContentHash == "" {
				continue
			}
			data := books.Get([]byte(snapshot.ID))
			if data == nil {
				continue
			}
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			if book.UserID != snapshot.UserID || book.Filename != snapshot.Filename || book.ContentHash != "" {
				continue
			}
			book.ContentHash = snapshot.ContentHash
			updated, err := book.MarshalDB()
			if err != nil {
				return err
			}
			if err := books.Put([]byte(book.ID), updated); err != nil {
				return err
			}
			if err := addBookToContentIndex(tx, &book); err != nil {
				return err
			}
		}
		return nil
	})
}

// ListBooksForIDs returns only owned records in request order in one transaction.
func (db *DB) ListBooksForIDs(userID string, ids []string) ([]models.Book, error) {
	books := make([]models.Book, 0, len(ids))
	err := db.View(func(tx *bbolt.Tx) error {
		for _, id := range uniqueNonEmptyStrings(ids) {
			if tx.Bucket(UserBooksIndex).Get([]byte(userID+":"+id)) == nil {
				continue
			}
			data := tx.Bucket(BooksBucket).Get([]byte(id))
			if data == nil {
				continue
			}
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			if book.UserID == userID {
				books = append(books, book)
			}
		}
		return nil
	})
	return books, err
}

func updateBookSortKey(tx *bbolt.Tx, oldBook, book *models.Book, sortKey string) error {
	oldKey, newKey := bookSortIndexKey(oldBook, sortKey), bookSortIndexKey(book, sortKey)
	if !bytes.Equal(oldKey, newKey) {
		bucket := tx.Bucket(BookSortIndex)
		if err := bucket.Delete(oldKey); err != nil {
			return err
		}
		if err := bucket.Put(newKey, []byte(book.ID)); err != nil {
			return err
		}
	}
	oldKey, newKey = bookCategorySortIndexKey(oldBook, sortKey), bookCategorySortIndexKey(book, sortKey)
	if !bytes.Equal(oldKey, newKey) {
		bucket := tx.Bucket(BookCategorySortIndex)
		if err := bucket.Delete(oldKey); err != nil {
			return err
		}
		if err := bucket.Put(newKey, []byte(book.ID)); err != nil {
			return err
		}
	}
	return nil
}

func updateBooksCategoryInTx(
	tx *bbolt.Tx, ids []string, userID string, category *string, includeBooks bool,
) ([]models.Book, error) {
	updatedBooks := []models.Book{}

	booksBucket := tx.Bucket(BooksBucket)
	normalizedCategory := normalizeCategoryName(category)
	for _, id := range uniqueNonEmptyStrings(ids) {
		bookData := booksBucket.Get([]byte(id))
		if bookData == nil {
			return nil, ErrNotFound
		}
		var book models.Book
		if err := book.UnmarshalDB(bookData); err != nil {
			return nil, err
		}
		if book.UserID != userID {
			return nil, ErrNotFound
		}
		if err := adjustLibrarySummary(tx, &book, -1); err != nil {
			return nil, err
		}
		if err := removeBookFromSortIndex(tx, &book); err != nil {
			return nil, err
		}
		if err := removeBookFromSearchGramIndex(tx, &book); err != nil {
			return nil, err
		}
		book.Category = normalizedCategory
		data, err := book.MarshalDB()
		if err != nil {
			return nil, err
		}
		if err := booksBucket.Put([]byte(book.ID), data); err != nil {
			return nil, err
		}
		if err := addBookToSearchIndex(tx, &book); err != nil {
			return nil, err
		}
		if err := addBookToSortIndex(tx, &book); err != nil {
			return nil, err
		}
		if err := addBookToSearchGramIndex(tx, &book); err != nil {
			return nil, err
		}
		if err := adjustLibrarySummary(tx, &book, 1); err != nil {
			return nil, err
		}
		if includeBooks {
			updatedBooks = append(updatedBooks, book)
		}
	}
	return updatedBooks, nil
}

// RenameBookCategory operates on every owned book in the indexed source
// category. All book records, search indexes and summary changes commit together.
func (db *DB) RenameBookCategory(userID, from string, to *string) ([]string, error) {
	ids := []string{}
	from = strings.TrimSpace(from)
	if userID == "" || from == "" {
		return ids, nil
	}
	err := db.Update(func(tx *bbolt.Tx) error {
		prefix := bookCategorySortPrefix(userID, from, "title")
		cursor := tx.Bucket(BookCategorySortIndex).Cursor()
		for key, id := cursor.Seek(prefix); key != nil && bytes.HasPrefix(key, prefix); key, id = cursor.Next() {
			ids = append(ids, string(id))
		}
		_, err := updateBooksCategoryInTx(tx, ids, userID, to, false)
		return err
	})
	return ids, err
}
