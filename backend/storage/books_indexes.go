package storage

import (
	"bytes"
	"math"
	"strconv"
	"strings"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

const bookSortSeparator = "\x00"

var supportedBookSorts = []string{"recent_read", "recent_added", "title", "author"}

func NormalizeBookSort(sortKey string) string {
	switch sortKey {
	case "title", "author", "recent_added", "recent_read":
		return sortKey
	default:
		return "recent_read"
	}
}

func bookSortValue(book *models.Book, sortKey string) string {
	switch sortKey {
	case "title":
		return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(book.Title)), bookSortSeparator, "")
	case "author":
		return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(book.Author)), bookSortSeparator, "")
	case "recent_added":
		return invertedBookTimestamp(book.CreatedAt)
	default:
		return invertedBookTimestamp(bookRecentReadAt(book))
	}
}

func bookRecentReadAt(book *models.Book) time.Time {
	if book.LastReadAt != nil {
		return *book.LastReadAt
	}
	return book.CreatedAt
}

func sameBookSortInputs(a, b *models.Book) bool {
	return a.Title == b.Title && a.Author == b.Author &&
		a.CreatedAt.UnixNano() == b.CreatedAt.UnixNano() &&
		bookRecentReadAt(a).UnixNano() == bookRecentReadAt(b).UnixNano()
}

func invertedBookTimestamp(value time.Time) string {
	var buf [len(zeroIndexTimestamp)]byte
	return string(appendIndexTimestamp(buf[:0], math.MaxInt64-max(0, value.UnixNano())))
}

const zeroIndexTimestamp = "0000000000000000000"

// appendIndexTimestamp encodes a nonnegative int64 as 19 decimal digits.
// The fixed width preserves the bytewise ordering of existing index keys.
func appendIndexTimestamp(key []byte, timestamp int64) []byte {
	var digits [len(zeroIndexTimestamp)]byte
	encoded := strconv.AppendInt(digits[:0], timestamp, 10)
	key = append(key, zeroIndexTimestamp[:len(zeroIndexTimestamp)-len(encoded)]...)
	return append(key, encoded...)
}

func bookSortIndexKey(book *models.Book, sortKey string) []byte {
	return bookSortIndexKeyWithValue(book, sortKey, bookSortValue(book, sortKey))
}

func bookSortIndexKeyWithValue(book *models.Book, sortKey, value string) []byte {
	size := len(sortKey) + len(book.UserID) + len(value) + len(book.ID) + 3*len(bookSortSeparator)
	key := make([]byte, 0, size)
	key = append(key, sortKey...)
	key = append(key, bookSortSeparator...)
	key = append(key, book.UserID...)
	key = append(key, bookSortSeparator...)
	key = append(key, value...)
	key = append(key, bookSortSeparator...)
	return append(key, book.ID...)
}

func addBookToSortIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	bucket, categoryBucket := tx.Bucket(BookSortIndex), tx.Bucket(BookCategorySortIndex)
	category, id := categoryForBook(book), []byte(book.ID)
	for _, sortKey := range supportedBookSorts {
		value := bookSortValue(book, sortKey)
		if err := bucket.Put(bookSortIndexKeyWithValue(book, sortKey, value), id); err != nil {
			return err
		}
		if categoryBucket != nil {
			key := bookCategorySortIndexKeyWithValue(book, sortKey, category, value)
			if err := categoryBucket.Put(key, id); err != nil {
				return err
			}
		}
	}
	return nil
}

func removeBookFromSortIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	bucket, categoryBucket := tx.Bucket(BookSortIndex), tx.Bucket(BookCategorySortIndex)
	category := categoryForBook(book)
	for _, sortKey := range supportedBookSorts {
		value := bookSortValue(book, sortKey)
		if err := bucket.Delete(bookSortIndexKeyWithValue(book, sortKey, value)); err != nil {
			return err
		}
		if categoryBucket != nil {
			key := bookCategorySortIndexKeyWithValue(book, sortKey, category, value)
			if err := categoryBucket.Delete(key); err != nil {
				return err
			}
		}
	}
	return nil
}

func rebuildBookSortIndex(tx *bbolt.Tx) error {
	if tx.Bucket(BookCategorySortIndex) != nil {
		if err := tx.DeleteBucket(BookCategorySortIndex); err != nil {
			return err
		}
		if _, err := tx.CreateBucket(BookCategorySortIndex); err != nil {
			return err
		}
	}
	if err := tx.DeleteBucket(BookSortIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(BookSortIndex); err != nil {
		return err
	}
	booksBucket := tx.Bucket(BooksBucket)
	return booksBucket.ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		return addBookToSortIndex(tx, &book)
	})
}

func bookContentIndexKey(userID, contentHash string) []byte {
	return []byte(userID + bookSortSeparator + contentHash)
}

func addBookToContentIndex(tx *bbolt.Tx, book *models.Book) error {
	if err := trackMissingBookHash(tx, book); err != nil {
		return err
	}
	if book.UserID == "" || book.ID == "" || book.ContentHash == "" {
		return nil
	}
	bucket := tx.Bucket(BookContentIndex)
	key := bookContentIndexKey(book.UserID, book.ContentHash)
	if err := bucket.Put(bookContentMembershipKey(book), []byte(book.ID)); err != nil {
		return err
	}
	if bucket.Get(key) == nil {
		return bucket.Put(key, []byte(book.ID))
	}
	return nil
}

func ensureBookContentIndex(tx *bbolt.Tx, book *models.Book) error {
	id := []byte(book.ID)
	if bucket := tx.Bucket(BookMissingHashIndex); bucket != nil && book.ID != "" {
		missingKey := bookSearchIndexKey(book.UserID, book.ID)
		if book.ContentHash == "" {
			if !bytes.Equal(bucket.Get(missingKey), id) {
				if err := bucket.Put(missingKey, id); err != nil {
					return err
				}
			}
		} else if bucket.Get(missingKey) != nil {
			if err := bucket.Delete(missingKey); err != nil {
				return err
			}
		}
	}
	if book.UserID == "" || book.ID == "" || book.ContentHash == "" {
		return nil
	}
	bucket := tx.Bucket(BookContentIndex)
	membershipKey := bookContentMembershipKey(book)
	if !bytes.Equal(bucket.Get(membershipKey), id) {
		if err := bucket.Put(membershipKey, id); err != nil {
			return err
		}
	}
	canonicalLen := len(book.UserID) + len(bookSortSeparator) + len(book.ContentHash)
	key := membershipKey[:canonicalLen:canonicalLen]
	if len(bucket.Get(key)) == 0 {
		return bucket.Put(key, id)
	}
	return nil
}

func removeBookFromContentIndex(tx *bbolt.Tx, book *models.Book) error {
	if bucket := tx.Bucket(BookMissingHashIndex); bucket != nil {
		if err := bucket.Delete(bookSearchIndexKey(book.UserID, book.ID)); err != nil {
			return err
		}
	}
	if book.UserID == "" || book.ContentHash == "" {
		return nil
	}
	bucket := tx.Bucket(BookContentIndex)
	key := bookContentIndexKey(book.UserID, book.ContentHash)
	if err := bucket.Delete(bookContentMembershipKey(book)); err != nil {
		return err
	}
	if currentID := bucket.Get(key); currentID != nil && string(currentID) != book.ID {
		return nil
	}
	prefix := append(append([]byte(nil), key...), 0)
	if memberKey, id := bucket.Cursor().Seek(prefix); bytes.HasPrefix(memberKey, prefix) {
		return bucket.Put(key, id)
	}
	return bucket.Delete(key)
}

func rebuildBookContentIndex(tx *bbolt.Tx) error {
	if err := tx.DeleteBucket(BookContentIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(BookContentIndex); err != nil {
		return err
	}
	booksBucket := tx.Bucket(BooksBucket)
	return booksBucket.ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		// Older databases can contain duplicates. Preserve the first entry; new
		// writes enforce uniqueness through this index.
		if book.ContentHash == "" {
			return nil
		}
		return addBookToContentIndex(tx, &book)
	})
}
