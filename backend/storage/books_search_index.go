package storage

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func normalizeBookSearchText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if stripped := strings.ReplaceAll(value, bookSortSeparator, ""); len(stripped) != len(value) {
		// Removing separators can expose whitespace at either end.
		value = strings.TrimSpace(stripped)
	}

	// Copy only when an internal whitespace run needs to change.
	var normalized strings.Builder
	start, spaceStart := 0, -1
	for i, char := range value {
		if unicode.IsSpace(char) {
			if spaceStart < 0 {
				spaceStart = i
			}
			continue
		}
		if spaceStart >= 0 && (i-spaceStart != 1 || value[spaceStart] != ' ') {
			if start == 0 {
				normalized.Grow(len(value))
			}
			normalized.WriteString(value[start:spaceStart])
			normalized.WriteByte(' ')
			start = i
		}
		spaceStart = -1
	}
	if start == 0 {
		return value
	}
	normalized.WriteString(value[start:])
	return normalized.String()
}

func bookSearchIndexKey(userID, bookID string) []byte {
	return []byte(userID + bookSortSeparator + bookID)
}

func bookSearchGramIndexPrefix(userID, gram string) []byte {
	return []byte(userID + bookSortSeparator + gram + bookSortSeparator)
}

func appendBookSearchGramIndexKey(key []byte, userID, gram, bookID string) []byte {
	key = append(key, userID...)
	key = append(key, bookSortSeparator...)
	key = append(key, gram...)
	key = append(key, bookSortSeparator...)
	return append(key, bookID...)
}

// bookSearchGrams produces deduplicated adjacent-rune grams from normalized text.
// It works for space-separated languages and CJK text without a dictionary.
// One-rune queries intentionally use the existing bounded scan fallback: an
// index for common single characters would be larger and rarely selective.
func bookSearchGrams(normalized string) []string {
	pairs := utf8.RuneCountInString(normalized) - 1
	if pairs < 1 {
		return nil
	}
	return collectBookSearchGrams(normalized, pairs, make(map[string]struct{}, pairs))
}

func collectBookSearchGrams(normalized string, pairs int, seen map[string]struct{}) []string {
	grams := make([]string, 0, pairs)
	// Normalization produces valid UTF-8, so each gram can share the input bytes.
	start := 0
	_, middle := utf8.DecodeRuneInString(normalized)
	for middle < len(normalized) {
		_, size := utf8.DecodeRuneInString(normalized[middle:])
		end := middle + size
		gram := normalized[start:end]
		if _, ok := seen[gram]; !ok {
			seen[gram] = struct{}{}
			grams = append(grams, gram)
		}
		start, middle = middle, end
	}
	return grams
}

func bookSearchText(book *models.Book) string {
	category := ""
	if book.Category != nil {
		category = *book.Category
	}
	return normalizeBookSearchText(strings.Join([]string{
		book.Title,
		book.Author,
		book.Filename,
		book.Format,
		category,
	}, " "))
}

func addBookToSearchIndex(tx *bbolt.Tx, book *models.Book, text string) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	return tx.Bucket(BookSearchIndex).Put(bookSearchIndexKey(book.UserID, book.ID), []byte(text))
}

func addBookToSearchGramIndex(tx *bbolt.Tx, book *models.Book, grams []string) error {
	return addBookSearchGramPostings(tx.Bucket(BookSearchGramIndex), book, grams, func(countKey []byte) error {
		return adjustBookSearchGramCount(tx, countKey, 1)
	})
}

func addBookSearchGramPostings(
	bucket *bbolt.Bucket, book *models.Book, grams []string, onInsert func([]byte) error,
) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	// bbolt copies keys on Put, so the buffer can be reused for the next gram.
	var key []byte
	for _, gram := range grams {
		key = appendBookSearchGramIndexKey(key[:0], book.UserID, gram, book.ID)
		if bucket.Get(key) != nil {
			continue
		}
		if err := bucket.Put(key, []byte{}); err != nil {
			return err
		}
		if onInsert != nil {
			if err := onInsert(key[:len(key)-len(book.ID)]); err != nil {
				return err
			}
		}
	}
	return nil
}

func removeBookFromSearchIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	return tx.Bucket(BookSearchIndex).Delete(bookSearchIndexKey(book.UserID, book.ID))
}

func replaceBookSearchGrams(tx *bbolt.Tx, book *models.Book, oldText, newText string) error {
	if oldText == newText {
		return addBookToSearchGramIndex(tx, book, bookSearchGrams(newText))
	}
	// Reuse the deduplication set to identify old grams that should remain.
	pairs := max(0, utf8.RuneCountInString(newText)-1)
	keep := make(map[string]struct{}, pairs)
	grams := collectBookSearchGrams(newText, pairs, keep)
	if err := removeBookSearchGrams(tx, book, oldText, keep); err != nil {
		return err
	}
	// Check all desired grams so a missing posting is still restored.
	return addBookToSearchGramIndex(tx, book, grams)
}

func removeBookFromSearchGramIndex(tx *bbolt.Tx, book *models.Book, text string) error {
	return removeBookSearchGrams(tx, book, text, nil)
}

func removeBookSearchGrams(tx *bbolt.Tx, book *models.Book, text string, keep map[string]struct{}) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	bucket := tx.Bucket(BookSearchGramIndex)
	var key []byte
	for _, gram := range bookSearchGrams(text) {
		if _, retained := keep[gram]; retained {
			continue
		}
		key = appendBookSearchGramIndexKey(key[:0], book.UserID, gram, book.ID)
		if bucket.Get(key) != nil {
			if err := bucket.Delete(key); err != nil {
				return err
			}
			if err := adjustBookSearchGramCount(tx, key[:len(key)-len(book.ID)], -1); err != nil {
				return err
			}
		}
	}
	return nil
}

func rebuildBookSearchIndex(tx *bbolt.Tx) error {
	if err := tx.DeleteBucket(BookSearchIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(BookSearchIndex); err != nil {
		return err
	}
	booksBucket := tx.Bucket(BooksBucket)
	return booksBucket.ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		return addBookToSearchIndex(tx, &book, bookSearchText(&book))
	})
}

func rebuildBookSearchGramIndex(tx *bbolt.Tx) error {
	var countBucket *bbolt.Bucket
	var counts map[string]int
	var onInsert func([]byte) error
	// Older migrations rebuild postings before the counts bucket exists.
	if tx.Bucket(BookSearchGramCounts) != nil {
		if err := tx.DeleteBucket(BookSearchGramCounts); err != nil {
			return err
		}
		var err error
		countBucket, err = tx.CreateBucket(BookSearchGramCounts)
		if err != nil {
			return err
		}
		counts = make(map[string]int)
		onInsert = func(countKey []byte) error {
			counts[string(countKey)]++
			return nil
		}
	}
	if err := tx.DeleteBucket(BookSearchGramIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	postingBucket, err := tx.CreateBucket(BookSearchGramIndex)
	if err != nil {
		return err
	}
	if err := tx.Bucket(BooksBucket).ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		return addBookSearchGramPostings(postingBucket, &book, bookSearchGrams(bookSearchText(&book)), onInsert)
	}); err != nil {
		return err
	}
	for key, count := range counts {
		if err := putBookSearchGramCount(countBucket, []byte(key), count); err != nil {
			return err
		}
	}
	return nil
}
