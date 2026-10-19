package storage

import (
	"bytes"
	"sort"
	"strings"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
	"z-reader/backend/telemetry"
)

// An omitted/nil category selects all books; a pointer to an empty string
// selects uncategorized books. Variadic filters preserve existing callers.
func selectedBookCategory(filters []*string) *string {
	if len(filters) == 0 || filters[0] == nil {
		return nil
	}
	normalized := strings.TrimSpace(*filters[0])
	return &normalized
}

func bookQueryIndex(tx *bbolt.Tx, userID, sortKey string, category *string) (*bbolt.Bucket, []byte) {
	if category != nil {
		return tx.Bucket(BookCategorySortIndex), bookCategorySortPrefix(userID, *category, sortKey)
	}
	return tx.Bucket(BookSortIndex), []byte(sortKey + bookSortSeparator + userID + bookSortSeparator)
}

func bookQuerySortKey(book *models.Book, sortKey string, category *string) []byte {
	if category != nil {
		return bookCategorySortIndexKey(book, sortKey)
	}
	return bookSortIndexKey(book, sortKey)
}

func bookQueryStart(tx *bbolt.Tx, userID, cursor, sortKey string, category *string, prefix []byte) ([]byte, error) {
	if cursor == "" {
		return prefix, nil
	}
	data := tx.Bucket(BooksBucket).Get([]byte(cursor))
	if data == nil {
		return prefix, nil
	}
	var book models.Book
	if err := book.UnmarshalDB(data); err != nil {
		return nil, err
	}
	if book.UserID != userID || (category != nil && categoryForBook(&book) != *category) {
		return prefix, nil
	}
	return bookQuerySortKey(&book, sortKey, category), nil
}

func bookCursorPage(books []models.Book, limit int) ([]models.Book, string, error) {
	if len(books) <= limit {
		return books, "", nil
	}
	return books[:limit], books[limit-1].ID, nil
}

// scanSortedBooks stops after one page plus its lookahead. Search checks small
// indexed text values before decoding a matching book record.
func scanSortedBooks(
	tx *bbolt.Tx, userID, query, cursor string, limit int, sortKey string,
	category *string, candidateCount *int,
) ([]models.Book, error) {
	books := make([]models.Book, 0, limit+1)
	index, prefix := bookQueryIndex(tx, userID, sortKey, category)
	start, err := bookQueryStart(tx, userID, cursor, sortKey, category, prefix)
	if err != nil {
		return nil, err
	}
	booksBucket, searchBucket := tx.Bucket(BooksBucket), tx.Bucket(BookSearchIndex)
	queryBytes := []byte(query)
	c := index.Cursor()
	for key, id := c.Seek(start); key != nil && bytes.HasPrefix(key, prefix); key, id = c.Next() {
		if string(id) == cursor {
			continue
		}
		if candidateCount != nil {
			(*candidateCount)++
		}
		if query != "" && !bytes.Contains(searchBucket.Get(bookSearchIndexKey(userID, string(id))), queryBytes) {
			continue
		}
		data := booksBucket.Get(id)
		if data == nil {
			continue
		}
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return nil, err
		}
		if book.UserID != userID || (category != nil && categoryForBook(&book) != *category) {
			continue
		}
		books = append(books, book)
		if len(books) > limit {
			break
		}
	}
	return books, nil
}

// ListBooksBySortedCursor seeks to a page in a persisted user/category sort order.
func (db *DB) ListBooksBySortedCursor(
	userID, cursor string, limit int, sortKey string, filters ...*string,
) ([]models.Book, string, error) {
	if userID == "" || limit <= 0 {
		return []models.Book{}, "", nil
	}
	sortKey = NormalizeBookSort(sortKey)
	var books []models.Book
	err := db.View(func(tx *bbolt.Tx) error {
		var err error
		books, err = scanSortedBooks(tx, userID, "", cursor, limit, sortKey, selectedBookCategory(filters), nil)
		return err
	})
	if err != nil {
		return nil, "", err
	}
	return bookCursorPage(books, limit)
}

func mostSelectiveBookSearchGram(gramBucket *bbolt.Bucket, userID string, grams []string) (string, int) {
	selected, count := "", -1
	bucket := gramBucket.Tx().Bucket(BookSearchGramCounts)
	for _, gram := range grams {
		n := bookSearchGramCount(bucket, userID, gram)
		if n == 0 {
			return gram, 0
		}
		if count < 0 || n < count {
			selected, count = gram, n
		}
	}
	return selected, count
}

// SearchBooks preserves exact substring semantics and the selected shelf order.
func (db *DB) SearchBooks(
	userID, query, cursor string, limit int, sortKey string, filters ...*string,
) ([]models.Book, string, error) {
	startedAt, candidateCount := time.Now(), 0
	defer func() { telemetry.Observe("book_search", time.Since(startedAt), candidateCount) }()
	query = normalizeBookSearchText(query)
	if userID == "" || query == "" || limit <= 0 {
		return []models.Book{}, "", nil
	}
	sortKey = NormalizeBookSort(sortKey)
	category := selectedBookCategory(filters)
	books := make([]models.Book, 0, limit+1)
	err := db.View(func(tx *bbolt.Tx) error {
		grams := bookSearchGrams(query)
		gram, count := mostSelectiveBookSearchGram(tx.Bucket(BookSearchGramIndex), userID, grams)
		if len(grams) > 0 && count == 0 {
			return nil
		}
		// Broad postings are faster in shelf order: seek directly to the cursor and
		// stop after the requested matches instead of sorting the entire library.
		broad := len(grams) == 0
		if len(grams) > 0 && count > max(64, limit*4) {
			summary, err := loadLibrarySummary(tx, userID)
			if err != nil {
				return err
			}
			population := summary.Total
			if category != nil {
				population = summary.Uncategorized
				if *category != "" {
					population = summary.Categories[*category]
				}
			}
			broad = count > population/4
		}
		if broad {
			var err error
			books, err = scanSortedBooks(tx, userID, query, cursor, limit, sortKey, category, &candidateCount)
			return err
		}
		_, sortPrefix := bookQueryIndex(tx, userID, sortKey, category)
		start, err := bookQueryStart(tx, userID, cursor, sortKey, category, sortPrefix)
		if err != nil {
			return err
		}
		type candidate struct {
			book models.Book
			key  []byte
		}
		candidates := make([]candidate, 0, count)
		gramBucket, searchBucket, booksBucket := tx.Bucket(BookSearchGramIndex), tx.Bucket(BookSearchIndex), tx.Bucket(BooksBucket)
		prefix := bookSearchGramIndexPrefix(userID, gram)
		c := gramBucket.Cursor()
		for key, _ := c.Seek(prefix); key != nil && bytes.HasPrefix(key, prefix); key, _ = c.Next() {
			candidateCount++
			id := string(key[len(prefix):])
			// The rarest posting list already bounds this scan. Checking the
			// compact exact text once is cheaper than probing every other gram.
			if !bytes.Contains(searchBucket.Get(bookSearchIndexKey(userID, id)), []byte(query)) {
				continue
			}
			data := booksBucket.Get([]byte(id))
			if data == nil {
				continue
			}
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			if book.UserID != userID || (category != nil && categoryForBook(&book) != *category) {
				continue
			}
			orderKey := bookQuerySortKey(&book, sortKey, category)
			if len(start) > len(sortPrefix) && bytes.Compare(orderKey, start) <= 0 {
				continue
			}
			candidates = append(candidates, candidate{book, orderKey})
		}
		sort.Slice(candidates, func(i, j int) bool { return bytes.Compare(candidates[i].key, candidates[j].key) < 0 })
		for i := 0; i < len(candidates) && i <= limit; i++ {
			books = append(books, candidates[i].book)
		}
		return nil
	})
	if err != nil {
		return nil, "", err
	}
	return bookCursorPage(books, limit)
}
