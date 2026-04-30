package storage

import (
	"bytes"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.etcd.io/bbolt"
	"golang.org/x/crypto/bcrypt"

	"z-reader/backend/models"
)

var (
	BooksBucket     = []byte("books")
	ProgressBucket  = []byte("progress")
	BookmarksBucket = []byte("bookmarks")
	SessionsBucket  = []byte("sessions")
	UsersBucket     = []byte("users")
	UserBooksIndex  = []byte("user_books_index") // userId -> JSON []bookId
	UsernameIndex   = []byte("username_index")   // normalizedUsername -> userId
)

type DB struct {
	*bbolt.DB
}

func Open(path string) (*DB, error) {
	db, err := bbolt.Open(path, 0600, &bbolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		return nil, err
	}

	err = db.Update(func(tx *bbolt.Tx) error {
		for _, bucket := range [][]byte{
			BooksBucket,
			ProgressBucket,
			BookmarksBucket,
			SessionsBucket,
			UsersBucket,
			UserBooksIndex,
			UsernameIndex,
		} {
			if _, err := tx.CreateBucketIfNotExists(bucket); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if err := (&DB{db}).migrateIndexes(); err != nil {
		return nil, err
	}

	if err := (&DB{db}).NormalizeBookCategories(); err != nil {
		return nil, err
	}

	return &DB{db}, nil
}

// BcryptCost 是密码哈希的计算成本。12 在现代硬件上提供合理的安全性平衡。
const BcryptCost = 12

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	return string(hash), err
}

func CheckPassword(passwordHash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)) == nil
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func (db *DB) EnsureDefaultAdmin(password string) error {
	users, err := db.ListUsers()
	if err != nil {
		return err
	}
	if len(users) > 0 {
		return nil
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return err
	}

	now := time.Now()
	return db.SaveUser(&models.User{
		ID:           uuid.New().String(),
		Username:     "admin",
		PasswordHash: passwordHash,
		Role:         models.UserRoleAdmin,
		CreatedAt:    now,
		UpdatedAt:    now,
	})
}

func (db *DB) AssignUnownedDataToAdmin() error {
	users, err := db.ListUsers()
	if err != nil {
		return err
	}

	var adminID string
	for _, user := range users {
		if user.Role == models.UserRoleAdmin {
			adminID = user.ID
			break
		}
	}
	if adminID == "" {
		return nil
	}

	return db.Update(func(tx *bbolt.Tx) error {
		if err := assignUnownedBooks(tx, adminID); err != nil {
			return err
		}
		if err := assignUnownedProgress(tx, adminID); err != nil {
			return err
		}
		return migrateBookCategories(tx)
	})
}

func assignUnownedBooks(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(BooksBucket)
	return b.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := json.Unmarshal(v, &book); err != nil {
			return err
		}
		if book.UserID != "" {
			return nil
		}
		book.UserID = userID
		data, err := json.Marshal(book)
		if err != nil {
			return err
		}
		return b.Put(k, data)
	})
}

func assignUnownedProgress(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(ProgressBucket)
	type progressUpdate struct {
		oldKey   []byte
		progress models.Progress
	}
	var updates []progressUpdate

	if err := b.ForEach(func(k, v []byte) error {
		var progress models.Progress
		if err := json.Unmarshal(v, &progress); err != nil {
			return err
		}
		if progress.UserID != "" {
			return nil
		}
		progress.UserID = userID
		updates = append(updates, progressUpdate{
			oldKey:   append([]byte(nil), k...),
			progress: progress,
		})
		return nil
	}); err != nil {
		return err
	}

	for _, update := range updates {
		data, err := json.Marshal(update.progress)
		if err != nil {
			return err
		}
		if err := b.Delete(update.oldKey); err != nil {
			return err
		}
		if err := b.Put(progressKey(userID, update.progress.BookID), data); err != nil {
			return err
		}
	}
	return nil
}

func (db *DB) SaveUser(user *models.User) error {
	return db.Update(func(tx *bbolt.Tx) error {
		usersB := tx.Bucket(UsersBucket)
		idxB := tx.Bucket(UsernameIndex)

		// If updating an existing user, remove old username mapping
		existing := usersB.Get([]byte(user.ID))
		if existing != nil {
			var oldUser models.User
			if err := json.Unmarshal(existing, &oldUser); err == nil {
				oldNorm := normalizeUsername(oldUser.Username)
				if oldNorm != normalizeUsername(user.Username) {
					idxB.Delete([]byte(oldNorm))
				}
			}
		}

		data, err := json.Marshal(user)
		if err != nil {
			return err
		}
		if err := usersB.Put([]byte(user.ID), data); err != nil {
			return err
		}
		return idxB.Put([]byte(normalizeUsername(user.Username)), []byte(user.ID))
	})
}

func (db *DB) GetUser(id string) (*models.User, error) {
	var user models.User
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(UsersBucket)
		data := b.Get([]byte(id))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &user)
	})
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (db *DB) GetUserByUsername(username string) (*models.User, error) {
	normalized := normalizeUsername(username)
	var user *models.User
	err := db.View(func(tx *bbolt.Tx) error {
		idx := tx.Bucket(UsernameIndex)
		userIdBytes := idx.Get([]byte(normalized))
		if userIdBytes == nil {
			return nil
		}
		usersB := tx.Bucket(UsersBucket)
		data := usersB.Get(userIdBytes)
		if data == nil {
			return nil
		}
		var u models.User
		if err := json.Unmarshal(data, &u); err != nil {
			return err
		}
		user = &u
		return nil
	})
	return user, err
}

func (db *DB) ListUsers() ([]models.User, error) {
	users := []models.User{}
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(UsersBucket)
		return b.ForEach(func(k, v []byte) error {
			var user models.User
			if err := json.Unmarshal(v, &user); err != nil {
				return err
			}
			users = append(users, user)
			return nil
		})
	})
	sort.Slice(users, func(i, j int) bool {
		return users[i].CreatedAt.Before(users[j].CreatedAt)
	})
	return users, err
}

func (db *DB) DeleteUser(id string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		usersB := tx.Bucket(UsersBucket)
		existing := usersB.Get([]byte(id))
		if existing == nil {
			return ErrNotFound
		}
		var user models.User
		if err := json.Unmarshal(existing, &user); err != nil {
			return err
		}
		if err := usersB.Delete([]byte(id)); err != nil {
			return err
		}
		idxB := tx.Bucket(UsernameIndex)
		idxB.Delete([]byte(normalizeUsername(user.Username)))
		return nil
	})
}

func (db *DB) DeleteUserData(userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		if err := deleteBooksByUser(tx, userID); err != nil {
			return err
		}
		if err := deleteProgressByUser(tx, userID); err != nil {
			return err
		}
		return deleteBookmarksByUser(tx, userID)
	})
}

func deleteBooksByUser(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(BooksBucket)
	idxB := tx.Bucket(UserBooksIndex)

	bookIDs, err := getBookIDsForUser(idxB, userID)
	if err != nil {
		return err
	}
	for _, id := range bookIDs {
		if err := b.Delete([]byte(id)); err != nil {
			return err
		}
	}
	// Clear the entire user entry in the index
	return idxB.Delete([]byte(userID))
}

func deleteProgressByUser(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(ProgressBucket)
	prefix := userID + ":"
	var keysToDelete [][]byte
	if err := b.ForEach(func(k, v []byte) error {
		if strings.HasPrefix(string(k), prefix) {
			keysToDelete = append(keysToDelete, append([]byte(nil), k...))
		}
		return nil
	}); err != nil {
		return err
	}
	for _, key := range keysToDelete {
		if err := b.Delete(key); err != nil {
			return err
		}
	}
	return nil
}

func deleteBookmarksByUser(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(BookmarksBucket)
	prefix := userID + ":"
	var keysToDelete [][]byte
	if err := b.ForEach(func(k, v []byte) error {
		if strings.HasPrefix(string(k), prefix) {
			keysToDelete = append(keysToDelete, append([]byte(nil), k...))
		}
		return nil
	}); err != nil {
		return err
	}
	for _, key := range keysToDelete {
		if err := b.Delete(key); err != nil {
			return err
		}
	}
	return nil
}

func (db *DB) SaveBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		idxB := tx.Bucket(UserBooksIndex)

		// If updating existing book, check if UserID changed
		existing := b.Get([]byte(book.ID))
		var oldUserID string
		if existing != nil {
			var oldBook models.Book
			if err := json.Unmarshal(existing, &oldBook); err == nil {
				oldUserID = oldBook.UserID
			}
		}

		book.Category = normalizeCategoryName(book.Category)
		data, err := json.Marshal(book)
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
		return nil
	})
}

func (db *DB) CreateBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		idxB := tx.Bucket(UserBooksIndex)

		book.Category = normalizeCategoryName(book.Category)
		if book.ContentHash != "" {
			if err := b.ForEach(func(k, v []byte) error {
				var existing models.Book
				if err := json.Unmarshal(v, &existing); err != nil {
					return err
				}
				if existing.ID != book.ID &&
					existing.UserID == book.UserID &&
					existing.ContentHash == book.ContentHash {
					return ErrDuplicateBookContent
				}
				return nil
			}); err != nil {
				return err
			}
		}

		data, err := json.Marshal(book)
		if err != nil {
			return err
		}
		if err := b.Put([]byte(book.ID), data); err != nil {
			return err
		}

		if err := addBookToUserIndex(idxB, book.ID, book.UserID); err != nil {
			return err
		}
		return nil
	})
}

func (db *DB) FindBookByContentHash(userID string, contentHash string) (*models.Book, error) {
	if contentHash == "" {
		return nil, nil
	}

	var book *models.Book
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
			var candidate models.Book
			if err := json.Unmarshal(data, &candidate); err != nil {
				return err
			}
			if candidate.ContentHash == contentHash {
				book = &candidate
				return nil
			}
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
		return json.Unmarshal(data, &book)
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
	book, err := db.GetBook(id)
	if err != nil || book == nil {
		return book, err
	}
	// Verify ownership via index for O(1) check
	var owned bool
	if err := db.View(func(tx *bbolt.Tx) error {
		idxB := tx.Bucket(UserBooksIndex)
		bookIDs, err := getBookIDsForUser(idxB, userID)
		if err != nil {
			return err
		}
		for _, bid := range bookIDs {
			if bid == id {
				owned = true
				break
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if !owned {
		return nil, nil
	}
	return book, nil
}

func (db *DB) ListBooks(userID string) ([]models.Book, error) {
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
			if err := json.Unmarshal(data, &book); err != nil {
				return err
			}
			books = append(books, book)
		}
		return nil
	})
	return books, err
}

func deleteBookDataInTx(tx *bbolt.Tx, id string, userID string) (*models.Book, error) {
	booksBucket := tx.Bucket(BooksBucket)
	bookData := booksBucket.Get([]byte(id))
	if bookData == nil {
		return nil, ErrNotFound
	}
	var book models.Book
	if err := json.Unmarshal(bookData, &book); err != nil {
		return nil, err
	}
	if book.UserID != userID {
		return nil, ErrNotFound
	}
	if err := booksBucket.Delete([]byte(id)); err != nil {
		return nil, err
	}

	idxB := tx.Bucket(UserBooksIndex)
	if err := removeBookFromUserIndex(idxB, id, userID); err != nil {
		return nil, err
	}

	progressBucket := tx.Bucket(ProgressBucket)
	if err := progressBucket.Delete(progressKey(userID, id)); err != nil {
		return nil, err
	}

	bookmarksBucket := tx.Bucket(BookmarksBucket)
	prefix := bookmarkBookPrefix(userID, id)
	var bookmarkKeys [][]byte
	if err := bookmarksBucket.ForEach(func(k, v []byte) error {
		if bytes.HasPrefix(k, prefix) {
			bookmarkKeys = append(bookmarkKeys, append([]byte(nil), k...))
		}
		return nil
	}); err != nil {
		return nil, err
	}
	for _, key := range bookmarkKeys {
		if err := bookmarksBucket.Delete(key); err != nil {
			return nil, err
		}
	}
	return &book, nil
}

func (db *DB) DeleteBookData(id string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		_, err := deleteBookDataInTx(tx, id, userID)
		return err
	})
}

func (db *DB) DeleteBooksData(ids []string, userID string) ([]models.Book, error) {
	deletedBooks := []models.Book{}
	err := db.Update(func(tx *bbolt.Tx) error {
		for _, id := range uniqueNonEmptyStrings(ids) {
			book, err := deleteBookDataInTx(tx, id, userID)
			if err != nil {
				return err
			}
			deletedBooks = append(deletedBooks, *book)
		}
		return nil
	})
	return deletedBooks, err
}

func (db *DB) UpdateBooksCategory(ids []string, userID string, category *string) ([]models.Book, error) {
	updatedBooks := []models.Book{}
	err := db.Update(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
		normalizedCategory := normalizeCategoryName(category)
		for _, id := range uniqueNonEmptyStrings(ids) {
			bookData := booksBucket.Get([]byte(id))
			if bookData == nil {
				return ErrNotFound
			}
			var book models.Book
			if err := json.Unmarshal(bookData, &book); err != nil {
				return err
			}
			if book.UserID != userID {
				return ErrNotFound
			}
			book.Category = normalizedCategory
			data, err := json.Marshal(&book)
			if err != nil {
				return err
			}
			if err := booksBucket.Put([]byte(book.ID), data); err != nil {
				return err
			}
			updatedBooks = append(updatedBooks, book)
		}
		return nil
	})
	return updatedBooks, err
}

func progressKey(userID string, bookID string) []byte {
	return []byte(userID + ":" + bookID)
}

func bookmarkKey(userID string, bookID string, bookmarkID string) []byte {
	return []byte(userID + ":" + bookID + ":" + bookmarkID)
}

func bookmarkBookPrefix(userID string, bookID string) []byte {
	return []byte(userID + ":" + bookID + ":")
}

func (db *DB) DeleteProgress(bookID string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		return b.Delete(progressKey(userID, bookID))
	})
}

func (db *DB) SaveProgress(progress *models.Progress, userID string) error {
	return db.SaveProgressIfCurrent(progress, userID, nil)
}

func (db *DB) SaveProgressIfCurrent(progress *models.Progress, userID string, expectedUpdatedAt *time.Time) error {
	return db.Update(func(tx *bbolt.Tx) error {
		progress.UserID = userID

		progressBucket := tx.Bucket(ProgressBucket)
		booksBucket := tx.Bucket(BooksBucket)
		bookData := booksBucket.Get([]byte(progress.BookID))
		if bookData == nil {
			return ErrNotFound
		}

		var book models.Book
		if err := json.Unmarshal(bookData, &book); err != nil {
			return err
		}
		if book.UserID != userID {
			return ErrNotFound
		}

		key := progressKey(userID, progress.BookID)
		currentData := progressBucket.Get(key)
		if expectedUpdatedAt != nil {
			if currentData == nil {
				return ErrProgressConflict
			}

			var current models.Progress
			if err := json.Unmarshal(currentData, &current); err != nil {
				return err
			}
			if !current.UpdatedAt.Equal(*expectedUpdatedAt) {
				return ErrProgressConflict
			}
		}

		book.LastReadAt = &progress.UpdatedAt

		updatedBookData, err := json.Marshal(&book)
		if err != nil {
			return err
		}

		data, err := json.Marshal(progress)
		if err != nil {
			return err
		}

		if err := booksBucket.Put([]byte(book.ID), updatedBookData); err != nil {
			return err
		}

		return progressBucket.Put(key, data)
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

func (db *DB) ListBookmarks(bookID string, userID string) ([]models.Bookmark, error) {
	items := []models.Bookmark{}
	err := db.View(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
		bookData := booksBucket.Get([]byte(bookID))
		if bookData == nil {
			return ErrNotFound
		}
		var book models.Book
		if err := json.Unmarshal(bookData, &book); err != nil {
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
		if err := json.Unmarshal(bookData, &book); err != nil {
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
		if err := json.Unmarshal(bookData, &book); err != nil {
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

func (db *DB) SaveSession(session *models.Session) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		data, err := json.Marshal(session)
		if err != nil {
			return err
		}
		return b.Put([]byte(session.Token), data)
	})
}

func (db *DB) GetSession(token string) (*models.Session, error) {
	var session models.Session
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		data := b.Get([]byte(token))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &session)
	})
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	if time.Now().After(session.ExpiresAt) {
		return nil, nil
	}
	return &session, nil
}

func (db *DB) DeleteSession(token string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		return b.Delete([]byte(token))
	})
}

func (db *DB) CleanExpiredSessions() error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		var toDelete []string
		err := b.ForEach(func(k, v []byte) error {
			var session models.Session
			if err := json.Unmarshal(v, &session); err != nil {
				return err
			}
			if time.Now().After(session.ExpiresAt) {
				toDelete = append(toDelete, session.Token)
			}
			return nil
		})
		if err != nil {
			return err
		}
		for _, token := range toDelete {
			if err := b.Delete([]byte(token)); err != nil {
				return err
			}
		}
		return nil
	})
}

// --- user_books index helpers ---

func getBookIDsForUser(idxB *bbolt.Bucket, userID string) ([]string, error) {
	data := idxB.Get([]byte(userID))
	if data == nil {
		return nil, nil
	}
	var ids []string
	if err := json.Unmarshal(data, &ids); err != nil {
		return nil, err
	}
	return ids, nil
}

func setBookIDsForUser(idxB *bbolt.Bucket, userID string, ids []string) error {
	data, err := json.Marshal(ids)
	if err != nil {
		return err
	}
	return idxB.Put([]byte(userID), data)
}

func uniqueNonEmptyStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func addBookToUserIndex(idxB *bbolt.Bucket, bookID string, userID string) error {
	if userID == "" {
		return nil
	}
	ids, err := getBookIDsForUser(idxB, userID)
	if err != nil {
		return err
	}
	// Check if already present
	for _, id := range ids {
		if id == bookID {
			return nil
		}
	}
	ids = append(ids, bookID)
	return setBookIDsForUser(idxB, userID, ids)
}

func removeBookFromUserIndex(idxB *bbolt.Bucket, bookID string, userID string) error {
	if userID == "" {
		return nil
	}
	ids, err := getBookIDsForUser(idxB, userID)
	if err != nil {
		return err
	}
	newIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != bookID {
			newIDs = append(newIDs, id)
		}
	}
	if len(newIDs) == 0 {
		return idxB.Delete([]byte(userID))
	}
	return setBookIDsForUser(idxB, userID, newIDs)
}

func (db *DB) migrateIndexes() error {
	return db.Update(func(tx *bbolt.Tx) error {
		if err := migrateUsernameIndex(tx); err != nil {
			return err
		}
		if err := migrateUserBooksIndex(tx); err != nil {
			return err
		}
		return nil
	})
}

func migrateUsernameIndex(tx *bbolt.Tx) error {
	idxB := tx.Bucket(UsernameIndex)
	usersB := tx.Bucket(UsersBucket)

	return usersB.ForEach(func(k, v []byte) error {
		var user models.User
		if err := json.Unmarshal(v, &user); err != nil {
			return err
		}
		norm := normalizeUsername(user.Username)
		if norm != "" {
			existing := idxB.Get([]byte(norm))
			if existing == nil {
				if err := idxB.Put([]byte(norm), k); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func migrateUserBooksIndex(tx *bbolt.Tx) error {
	idxB := tx.Bucket(UserBooksIndex)
	booksB := tx.Bucket(BooksBucket)

	// Build a map of userId -> []bookId
	userBookMap := map[string][]string{}
	if err := booksB.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := json.Unmarshal(v, &book); err != nil {
			return err
		}
		if book.UserID != "" {
			userBookMap[book.UserID] = append(userBookMap[book.UserID], book.ID)
		}
		return nil
	}); err != nil {
		return err
	}

	for userID, ids := range userBookMap {
		existing := idxB.Get([]byte(userID))
		if existing == nil {
			data, err := json.Marshal(ids)
			if err != nil {
				return err
			}
			if err := idxB.Put([]byte(userID), data); err != nil {
				return err
			}
		}
	}
	return nil
}

func normalizeCategoryName(value *string) *string {
	if value == nil {
		return nil
	}
	category := strings.TrimSpace(*value)
	if category == "" {
		return nil
	}
	return &category
}

func migrateBookCategories(tx *bbolt.Tx) error {
	booksB := tx.Bucket(BooksBucket)

	return booksB.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := json.Unmarshal(v, &book); err != nil {
			return err
		}

		nextCategory := normalizeCategoryName(book.Category)
		changed := false
		if (book.Category == nil) != (nextCategory == nil) {
			changed = true
		} else if book.Category != nil && nextCategory != nil && *book.Category != *nextCategory {
			changed = true
		}
		if !changed {
			return nil
		}

		book.Category = nextCategory
		data, err := json.Marshal(book)
		if err != nil {
			return err
		}
		return booksB.Put(k, data)
	})
}

func (db *DB) NormalizeBookCategories() error {
	return db.Update(migrateBookCategories)
}
