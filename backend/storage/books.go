package storage

import (
	"bytes"
	"encoding/json"
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
		lastReadAt := book.CreatedAt
		if book.LastReadAt != nil {
			lastReadAt = *book.LastReadAt
		}
		return invertedBookTimestamp(lastReadAt)
	}
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
	return []byte(strings.Join([]string{sortKey, book.UserID, bookSortValue(book, sortKey), book.ID}, bookSortSeparator))
}

func addBookToSortIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	bucket := tx.Bucket(BookSortIndex)
	for _, sortKey := range supportedBookSorts {
		if err := bucket.Put(bookSortIndexKey(book, sortKey), []byte(book.ID)); err != nil {
			return err
		}
		if categoryBucket := tx.Bucket(BookCategorySortIndex); categoryBucket != nil {
			if err := categoryBucket.Put(bookCategorySortIndexKey(book, sortKey), []byte(book.ID)); err != nil {
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
	bucket := tx.Bucket(BookSortIndex)
	for _, sortKey := range supportedBookSorts {
		if err := bucket.Delete(bookSortIndexKey(book, sortKey)); err != nil {
			return err
		}
		if categoryBucket := tx.Bucket(BookCategorySortIndex); categoryBucket != nil {
			if err := categoryBucket.Delete(bookCategorySortIndexKey(book, sortKey)); err != nil {
				return err
			}
		}
	}
	return nil
}

func normalizeBookSearchText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, bookSortSeparator, "")
	return strings.Join(strings.Fields(value), " ")
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
	runes := []rune(normalized)
	if len(runes) < 2 {
		return nil
	}
	grams := make([]string, 0, len(runes)-1)
	seen := make(map[string]struct{}, len(runes)-1)
	for i := 0; i < len(runes)-1; i++ {
		gram := string(runes[i : i+2])
		if _, ok := seen[gram]; ok {
			continue
		}
		seen[gram] = struct{}{}
		grams = append(grams, gram)
	}
	return grams
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

func bookSearchValue(book *models.Book) []byte {
	category := ""
	if book.Category != nil {
		category = *book.Category
	}
	return []byte(normalizeBookSearchText(strings.Join([]string{
		book.Title,
		book.Author,
		book.Filename,
		book.Format,
		category,
	}, " ")))
}

func addBookToSearchIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	return tx.Bucket(BookSearchIndex).Put(bookSearchIndexKey(book.UserID, book.ID), bookSearchValue(book))
}

func addBookToSearchGramIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	bucket := tx.Bucket(BookSearchGramIndex)
	// bbolt copies keys on Put, so the buffer can be reused for the next gram.
	var key []byte
	for _, gram := range bookSearchGrams(string(bookSearchValue(book))) {
		key = appendBookSearchGramIndexKey(key[:0], book.UserID, gram, book.ID)
		if bucket.Get(key) == nil {
			if err := bucket.Put(key, []byte{}); err != nil {
				return err
			}
			if err := adjustBookSearchGramCount(tx, key[:len(key)-len(book.ID)], 1); err != nil {
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

func removeBookFromSearchGramIndex(tx *bbolt.Tx, book *models.Book) error {
	if book.UserID == "" || book.ID == "" {
		return nil
	}
	bucket := tx.Bucket(BookSearchGramIndex)
	var key []byte
	for _, gram := range bookSearchGrams(string(bookSearchValue(book))) {
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
		return addBookToSearchIndex(tx, &book)
	})
}

func rebuildBookSearchGramIndex(tx *bbolt.Tx) error {
	if tx.Bucket(BookSearchGramCounts) != nil {
		if err := tx.DeleteBucket(BookSearchGramCounts); err != nil {
			return err
		}
		if _, err := tx.CreateBucket(BookSearchGramCounts); err != nil {
			return err
		}
	}
	if err := tx.DeleteBucket(BookSearchGramIndex); err != nil && err != bbolt.ErrBucketNotFound {
		return err
	}
	if _, err := tx.CreateBucket(BookSearchGramIndex); err != nil {
		return err
	}
	booksBucket := tx.Bucket(BooksBucket)
	return booksBucket.ForEach(func(_, data []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(data); err != nil {
			return err
		}
		return addBookToSearchGramIndex(tx, &book)
	})
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

func (db *DB) SaveBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		var oldBook *models.Book
		if data := tx.Bucket(BooksBucket).Get([]byte(book.ID)); data != nil {
			var previous models.Book
			if err := previous.UnmarshalDB(data); err == nil {
				oldBook = &previous
			}
		}
		return saveBookInTx(tx, book, oldBook)
	})
}

func getOwnedBookInTx(tx *bbolt.Tx, id, userID string) (*models.Book, error) {
	data := tx.Bucket(BooksBucket).Get([]byte(id))
	if data == nil {
		return nil, ErrNotFound
	}
	var book models.Book
	if err := book.UnmarshalDB(data); err != nil {
		return nil, err
	}
	if book.UserID != userID {
		return nil, ErrNotFound
	}
	return &book, nil
}

// UpdateBook merges changes into an existing owned book in a write transaction.
// The callback may edit the supplied book fields, except its ID and owner.
// It must do no I/O.
// Returning false leaves the record unchanged and returns the current book.
func (db *DB) UpdateBook(id, userID string, merge func(*models.Book) bool) (*models.Book, error) {
	var book models.Book
	err := db.Update(func(tx *bbolt.Tx) error {
		previous, err := getOwnedBookInTx(tx, id, userID)
		if err != nil {
			return err
		}
		book = *previous
		if !merge(&book) {
			book = *previous
			return nil
		}
		return saveBookInTx(tx, &book, previous)
	})
	if err != nil {
		return nil, err
	}
	return &book, nil
}

func saveBookInTx(tx *bbolt.Tx, book, oldBook *models.Book) error {
	b := tx.Bucket(BooksBucket)
	idxB := tx.Bucket(UserBooksIndex)
	var oldUserID string
	if oldBook != nil {
		oldUserID = oldBook.UserID
	}

	book.Category = normalizeCategoryName(book.Category)
	// Cover and processing-state updates can leave both search indexes intact.
	searchUnchanged := false
	if oldBook != nil && oldUserID == book.UserID && oldBook.ID == book.ID {
		indexedText := tx.Bucket(BookSearchIndex).Get(bookSearchIndexKey(book.UserID, book.ID))
		if indexedText != nil {
			text := bookSearchValue(book)
			searchUnchanged = bytes.Equal(indexedText, text) && bytes.Equal(bookSearchValue(oldBook), text)
		}
	}
	data, err := book.MarshalDB()
	if err != nil {
		return err
	}
	if err := b.Put([]byte(book.ID), data); err != nil {
		return err
	}

	// Update user_books index
	if oldUserID != book.UserID {
		if oldUserID != "" {
			if err := removeBookFromUserIndex(idxB, book.ID, oldUserID); err != nil {
				return err
			}
		}
		if err := addBookToUserIndex(idxB, book.ID, book.UserID); err != nil {
			return err
		}
	}
	if oldBook != nil {
		if err := adjustLibrarySummary(tx, oldBook, -1); err != nil {
			return err
		}
		if err := removeBookFromContentIndex(tx, oldBook); err != nil {
			return err
		}
		if err := removeBookFromSortIndex(tx, oldBook); err != nil {
			return err
		}
	}
	if !searchUnchanged && oldBook != nil {
		if err := removeBookFromSearchIndex(tx, oldBook); err != nil {
			return err
		}
		if err := removeBookFromSearchGramIndex(tx, oldBook); err != nil {
			return err
		}
	}
	if err := addBookToSortIndex(tx, book); err != nil {
		return err
	}
	if !searchUnchanged {
		if err := addBookToSearchIndex(tx, book); err != nil {
			return err
		}
		if err := addBookToSearchGramIndex(tx, book); err != nil {
			return err
		}
	}
	if err := addBookToContentIndex(tx, book); err != nil {
		return err
	}
	return adjustLibrarySummary(tx, book, 1)
}

func (db *DB) CreateBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		idxB := tx.Bucket(UserBooksIndex)

		book.Category = normalizeCategoryName(book.Category)
		if book.ContentHash != "" {
			contentIndex := tx.Bucket(BookContentIndex)
			if existingID := contentIndex.Get(bookContentIndexKey(book.UserID, book.ContentHash)); existingID != nil && string(existingID) != book.ID {
				return ErrDuplicateBookContent
			}
		}

		data, err := book.MarshalDB()
		if err != nil {
			return err
		}
		if err := b.Put([]byte(book.ID), data); err != nil {
			return err
		}

		if err := addBookToUserIndex(idxB, book.ID, book.UserID); err != nil {
			return err
		}
		if err := addBookToSortIndex(tx, book); err != nil {
			return err
		}
		if err := addBookToSearchIndex(tx, book); err != nil {
			return err
		}
		if err := addBookToSearchGramIndex(tx, book); err != nil {
			return err
		}
		if err := addBookToContentIndex(tx, book); err != nil {
			return err
		}
		return adjustLibrarySummary(tx, book, 1)
	})
}

func (db *DB) FindBookByContentHash(userID string, contentHash string) (*models.Book, error) {
	if contentHash == "" {
		return nil, nil
	}

	var book *models.Book
	err := db.View(func(tx *bbolt.Tx) error {
		bookID := tx.Bucket(BookContentIndex).Get(bookContentIndexKey(userID, contentHash))
		if bookID == nil {
			return nil
		}
		data := tx.Bucket(BooksBucket).Get(bookID)
		if data == nil {
			return nil
		}
		var candidate models.Book
		if err := candidate.UnmarshalDB(data); err != nil {
			return err
		}
		if candidate.UserID == userID && candidate.ContentHash == contentHash {
			book = &candidate
		}
		return nil
	})
	return book, err
}

func (db *DB) GetBook(id string) (*models.Book, error) {
	var book models.Book
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		data := b.Get([]byte(id))
		if data == nil {
			return ErrNotFound
		}
		return book.UnmarshalDB(data)
	})
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &book, nil
}

func (db *DB) GetBookForUser(id string, userID string) (*models.Book, error) {
	var book *models.Book
	err := db.View(func(tx *bbolt.Tx) error {
		// First check ownership via index (O(1) lookup)
		idxB := tx.Bucket(UserBooksIndex)
		indexKey := []byte(userID + ":" + id)
		if idxB.Get(indexKey) == nil {
			return nil // not owned by this user
		}

		// Then fetch the book
		booksB := tx.Bucket(BooksBucket)
		data := booksB.Get([]byte(id))
		if data == nil {
			return nil // book not found
		}
		var b models.Book
		if err := b.UnmarshalDB(data); err != nil {
			return err
		}
		book = &b
		return nil
	})
	if err != nil {
		return nil, err
	}
	return book, nil
}

func (db *DB) ListBooks(userID string) ([]models.Book, error) {
	return db.ListBooksPaginated(userID, 0, 0)
}

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

// ListBooksByCursor reads only one page of a user's books. The cursor is the
// last returned book ID and follows the stable order of UserBooksIndex keys.
func (db *DB) ListBooksByCursor(userID, cursor string, limit int) ([]models.Book, string, error) {
	if userID == "" || limit <= 0 {
		return []models.Book{}, "", nil
	}

	books := make([]models.Book, 0, limit+1)
	prefix := []byte(userID + ":")
	start := prefix
	if cursor != "" {
		start = []byte(userID + ":" + cursor)
	}

	err := db.View(func(tx *bbolt.Tx) error {
		idxB := tx.Bucket(UserBooksIndex)
		booksB := tx.Bucket(BooksBucket)
		indexCursor := idxB.Cursor()

		for k, _ := indexCursor.Seek(start); k != nil && bytes.HasPrefix(k, prefix); k, _ = indexCursor.Next() {
			bookID := strings.TrimPrefix(string(k), string(prefix))
			if bookID == cursor {
				continue
			}

			data := booksB.Get([]byte(bookID))
			if data == nil {
				continue
			}
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			books = append(books, book)
			if len(books) > limit {
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, "", err
	}

	if len(books) <= limit {
		return books, "", nil
	}
	nextCursor := books[limit-1].ID
	return books[:limit], nextCursor, nil
}

func (db *DB) ListBooksPaginated(userID string, page int, pageSize int) ([]models.Book, error) {
	books := []models.Book{}
	err := db.View(func(tx *bbolt.Tx) error {
		idxB := tx.Bucket(UserBooksIndex)
		booksB := tx.Bucket(BooksBucket)

		bookIDs, err := getBookIDsForUser(idxB, userID)
		if err != nil {
			return err
		}
		for _, id := range bookIDs {
			data := booksB.Get([]byte(id))
			if data == nil {
				continue
			}
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			books = append(books, book)
		}
		return nil
	})

	if page > 0 && pageSize > 0 {
		start := (page - 1) * pageSize
		if start >= len(books) {
			return []models.Book{}, err
		}
		end := start + pageSize
		if end > len(books) {
			end = len(books)
		}
		return books[start:end], err
	}

	return books, err
}

func deleteBookDataInTx(tx *bbolt.Tx, id string, book *models.Book) error {
	userID := book.UserID
	if err := removeBookFromContentIndex(tx, book); err != nil {
		return err
	}
	if err := removeBookFromSortIndex(tx, book); err != nil {
		return err
	}
	if err := tx.Bucket(BooksBucket).Delete([]byte(id)); err != nil {
		return err
	}

	idxB := tx.Bucket(UserBooksIndex)
	if err := removeBookFromUserIndex(idxB, id, userID); err != nil {
		return err
	}

	progressBucket := tx.Bucket(ProgressBucket)
	if progressData := progressBucket.Get(progressKey(userID, id)); progressData != nil {
		var progress models.Progress
		if err := json.Unmarshal(progressData, &progress); err != nil {
			return err
		}
		if err := removeProgressFromTimeIndex(tx, &progress); err != nil {
			return err
		}
	}
	if err := progressBucket.Delete(progressKey(userID, id)); err != nil {
		return err
	}

	if err := deleteBookBookmarks(tx, userID, id); err != nil {
		return err
	}
	if err := removeBookFromSearchIndex(tx, book); err != nil {
		return err
	}
	return removeBookFromSearchGramIndex(tx, book)
}

func (db *DB) DeleteBookData(id string, userID string) error {
	_, err := db.DeleteBook(id, userID)
	return err
}

// DeleteBook returns the committed deletion's row for file cleanup.
func (db *DB) DeleteBook(id, userID string) (*models.Book, error) {
	books, err := db.deleteBooksData([]string{id}, userID)
	if err != nil {
		return nil, err
	}
	return &books[0], nil
}

func (db *DB) DeleteBooksData(ids []string, userID string) ([]models.Book, error) {
	return db.deleteBooksData(uniqueNonEmptyStrings(ids), userID)
}

func (db *DB) deleteBooksData(ids []string, userID string) ([]models.Book, error) {
	deletedBooks := make([]models.Book, 0, len(ids))
	err := db.Update(func(tx *bbolt.Tx) error {
		var summary BookLibrarySummary
		for _, id := range ids {
			book, err := getOwnedBookInTx(tx, id, userID)
			if err != nil {
				return err
			}
			if userID != "" {
				if summary.Categories == nil {
					summary, err = loadLibrarySummary(tx, userID)
					if err != nil {
						return err
					}
				}
				summary.adjustCount(categoryForBook(book), -1)
			}
			if err := deleteBookDataInTx(tx, id, book); err != nil {
				return err
			}
			deletedBooks = append(deletedBooks, *book)
		}
		if summary.Categories != nil {
			return saveLibrarySummary(tx, userID, summary)
		}
		return nil
	})
	return deletedBooks, err
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

func getBookIDsForUser(idxB *bbolt.Bucket, userID string) ([]string, error) {
	if userID == "" {
		return nil, nil
	}
	prefix := []byte(userID + ":")
	var ids []string
	c := idxB.Cursor()
	for k, _ := c.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, _ = c.Next() {
		keyStr := string(k)
		parts := strings.Split(keyStr, ":")
		if len(parts) >= 2 {
			bookID := strings.Join(parts[1:], ":")
			ids = append(ids, bookID)
		}
	}
	return ids, nil
}

func addBookToUserIndex(idxB *bbolt.Bucket, bookID string, userID string) error {
	if userID == "" || bookID == "" {
		return nil
	}
	key := []byte(userID + ":" + bookID)
	return idxB.Put(key, []byte{})
}

func removeBookFromUserIndex(idxB *bbolt.Bucket, bookID string, userID string) error {
	if userID == "" || bookID == "" {
		return nil
	}
	key := []byte(userID + ":" + bookID)
	return idxB.Delete(key)
}
