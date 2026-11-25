package storage

import (
	"encoding/json"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

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
		// Preserve the old values for index removal and for a rejected merge.
		if previous.Category != nil {
			category := *previous.Category
			book.Category = &category
		}
		if previous.LastReadAt != nil {
			lastReadAt := *previous.LastReadAt
			book.LastReadAt = &lastReadAt
		}
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
	var oldUserID, oldSearchText string
	if oldBook != nil {
		oldUserID = oldBook.UserID
		oldSearchText = bookSearchText(oldBook)
	}

	book.Category = normalizeCategoryName(book.Category)
	searchText := bookSearchText(book)
	sameBookKey := oldBook != nil && oldUserID == book.UserID && oldBook.ID == book.ID
	sameSortInputs := sameBookKey && sameBookSortInputs(oldBook, book)
	sameContentHash := sameBookKey && oldBook.ContentHash == book.ContentHash
	// Cover and processing-state updates can leave both search indexes intact.
	searchUnchanged := false
	if sameBookKey && oldSearchText == searchText {
		indexedText := tx.Bucket(BookSearchIndex).Get(bookSearchIndexKey(book.UserID, book.ID))
		searchUnchanged = indexedText != nil && string(indexedText) == searchText
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
		if !sameContentHash {
			if err := removeBookFromContentIndex(tx, oldBook); err != nil {
				return err
			}
		}
		if !sameSortInputs {
			if err := removeBookFromSortIndex(tx, oldBook); err != nil {
				return err
			}
		}
	}
	if oldBook != nil && !sameBookKey {
		if err := removeBookFromSearchIndex(tx, oldBook); err != nil {
			return err
		}
		if err := removeBookFromSearchGramIndex(tx, oldBook, oldSearchText); err != nil {
			return err
		}
	}
	if sameSortInputs {
		if err := updateBookCategorySortKeys(tx, book, categoryForBook(oldBook), categoryForBook(book)); err != nil {
			return err
		}
	} else if err := addBookToSortIndex(tx, book); err != nil {
		return err
	}
	if !searchUnchanged {
		if err := addBookToSearchIndex(tx, book, searchText); err != nil {
			return err
		}
		if sameBookKey {
			if err := replaceBookSearchGrams(tx, book, oldSearchText, searchText); err != nil {
				return err
			}
		} else if err := addBookToSearchGramIndex(tx, book, bookSearchGrams(searchText)); err != nil {
			return err
		}
	}
	if sameContentHash {
		if err := ensureBookContentIndex(tx, book); err != nil {
			return err
		}
	} else if err := addBookToContentIndex(tx, book); err != nil {
		return err
	}
	return updateBookLibrarySummary(tx, book, oldBook)
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
		searchText := bookSearchText(book)
		if err := addBookToSearchIndex(tx, book, searchText); err != nil {
			return err
		}
		if err := addBookToSearchGramIndex(tx, book, bookSearchGrams(searchText)); err != nil {
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
	return removeBookFromSearchGramIndex(tx, book, bookSearchText(book))
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
