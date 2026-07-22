package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.etcd.io/bbolt"
	"golang.org/x/crypto/bcrypt"

	"z-reader/backend/models"
)

var (
	BooksBucket      = []byte("books")
	ProgressBucket   = []byte("progress")
	BookmarksBucket  = []byte("bookmarks")
	UsersBucket      = []byte("users")
	UserBooksIndex   = []byte("user_books_index") // userId:bookId -> Empty
	UsernameIndex    = []byte("username_index")   // normalizedUsername -> userId
	BookSortIndex    = []byte("book_sort_index")  // sort:user:sortValue:bookId -> bookId
	SystemMetaBucket = []byte("system_meta")
)

// DB 封装主数据库操作（图书、进度、书签、用户）。
// Session 数据存储在独立数据库 SessionDB 中以避免锁竞争。
type DB struct {
	*bbolt.DB
	sessionDB *SessionDB
}

// Open 打开主数据库和独立 session 数据库。
// session 数据库文件路径为 path + ".sessions"。
func Open(path string) (*DB, error) {
	db, err := bbolt.Open(path, 0600, &bbolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		return nil, err
	}

	sessionPath := sessionDBPath(path)
	sessionDB, err := OpenSession(sessionPath)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("open session database: %w", err)
	}

	resDB := &DB{DB: db, sessionDB: sessionDB}
	if err := resDB.runMigrations(); err != nil {
		db.Close()
		sessionDB.Close()
		return nil, err
	}

	return resDB, nil
}

// sessionDBPath 返回与主数据库路径对应的 session 数据库文件路径。
func sessionDBPath(mainPath string) string {
	return mainPath + ".sessions"
}

// Close 关闭主数据库和 session 数据库。
func (db *DB) Close() error {
	var firstErr error
	if db.sessionDB != nil {
		if err := db.sessionDB.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if db.DB != nil {
		if err := db.DB.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (db *DB) runMigrations() error {
	migrations := []struct {
		version int
		name    string
		run     func(tx *bbolt.Tx) error
	}{
		{
			version: 1,
			name:    "InitializeBuckets",
			run: func(tx *bbolt.Tx) error {
				for _, bucket := range [][]byte{
					BooksBucket,
					ProgressBucket,
					BookmarksBucket,
					UsersBucket,
					UserBooksIndex,
					UsernameIndex,
					BookSortIndex,
				} {
					if _, err := tx.CreateBucketIfNotExists(bucket); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			version: 2,
			name:    "MigrateIndexes",
			run: func(tx *bbolt.Tx) error {
				if err := migrateUsernameIndex(tx); err != nil {
					return err
				}
				return migrateUserBooksIndex(tx)
			},
		},
		{
			version: 3,
			name:    "NormalizeBookCategories",
			run: func(tx *bbolt.Tx) error {
				return migrateBookCategories(tx)
			},
		},
		{
			version: 4,
			name:    "FlattenUserBooksIndex",
			run: func(tx *bbolt.Tx) error {
				idxB := tx.Bucket(UserBooksIndex)
				if idxB == nil {
					return nil
				}

				type oldIndexEntry struct {
					userID  string
					bookIDs []string
				}

				var entries []oldIndexEntry

				// Read all old JSON entries first to avoid mutating during iteration
				err := idxB.ForEach(func(k, v []byte) error {
					if strings.Contains(string(k), ":") {
						return nil
					}
					var ids []string
					if err := json.Unmarshal(v, &ids); err == nil {
						entries = append(entries, oldIndexEntry{
							userID:  string(k),
							bookIDs: ids,
						})
					}
					return nil
				})
				if err != nil {
					return err
				}

				// Re-insert as flat keys and delete old ones
				for _, entry := range entries {
					for _, bookID := range entry.bookIDs {
						newKey := entry.userID + ":" + bookID
						if err := idxB.Put([]byte(newKey), []byte{}); err != nil {
							return err
						}
					}
					if err := idxB.Delete([]byte(entry.userID)); err != nil {
						return err
					}
				}

				return nil
			},
		},
		{
			version: 5,
			name:    "BuildBookSortIndex",
			run:     rebuildBookSortIndex,
		},
	}

	return db.Update(func(tx *bbolt.Tx) error {
		metaB, err := tx.CreateBucketIfNotExists(SystemMetaBucket)
		if err != nil {
			return err
		}

		currentVersion := 0
		if vBytes := metaB.Get([]byte("schema_version")); vBytes != nil {
			var err error
			currentVersion, err = strconv.Atoi(string(vBytes))
			if err != nil {
				currentVersion = 0
			}
		}

		for _, m := range migrations {
			if m.version > currentVersion {
				if err := m.run(tx); err != nil {
					return err
				}
				if err := metaB.Put([]byte("schema_version"), []byte(strconv.Itoa(m.version))); err != nil {
					return err
				}
				currentVersion = m.version
			}
		}
		return nil
	})
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

func (db *DB) AssignUnownedDataToUser(userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil
	}

	return db.Update(func(tx *bbolt.Tx) error {
		if err := assignUnownedBooks(tx, userID); err != nil {
			return err
		}
		if err := assignUnownedProgress(tx, userID); err != nil {
			return err
		}
		return migrateBookCategories(tx)
	})
}

func assignUnownedBooks(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(BooksBucket)
	idxB := tx.Bucket(UserBooksIndex)
	return b.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(v); err != nil {
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
		if err := b.Put(k, data); err != nil {
			return err
		}
		if err := addBookToUserIndex(idxB, book.ID, userID); err != nil {
			return err
		}
		return addBookToSortIndex(tx, &book)
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
			if err := oldUser.UnmarshalDB(existing); err == nil {
				oldNorm := normalizeUsername(oldUser.Username)
				if oldNorm != normalizeUsername(user.Username) {
					idxB.Delete([]byte(oldNorm))
				}
			}
		}

		data, err := user.MarshalDB()
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
		return user.UnmarshalDB(data)
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
		if err := u.UnmarshalDB(data); err != nil {
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
			if err := user.UnmarshalDB(v); err != nil {
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
		if err := user.UnmarshalDB(existing); err != nil {
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

func (db *DB) PurgeUser(id string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		usersB := tx.Bucket(UsersBucket)
		existing := usersB.Get([]byte(id))
		if existing == nil {
			return ErrNotFound
		}
		var user models.User
		if err := user.UnmarshalDB(existing); err != nil {
			return err
		}

		if err := deleteBooksByUser(tx, id); err != nil {
			return err
		}
		if err := deleteProgressByUser(tx, id); err != nil {
			return err
		}
		if err := deleteBookmarksByUser(tx, id); err != nil {
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
		if data := b.Get([]byte(id)); data != nil {
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			if err := removeBookFromSortIndex(tx, &book); err != nil {
				return err
			}
		}
		if err := b.Delete([]byte(id)); err != nil {
			return err
		}
		if err := removeBookFromUserIndex(idxB, id, userID); err != nil {
			return err
		}
	}
	return nil
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
	const maxTimestamp = int64(^uint64(0) >> 1)
	timestamp := value.UnixNano()
	if timestamp < 0 {
		timestamp = 0
	}
	return fmt.Sprintf("%019d", maxTimestamp-timestamp)
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
	}
	return nil
}

func rebuildBookSortIndex(tx *bbolt.Tx) error {
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

func (db *DB) SaveBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		idxB := tx.Bucket(UserBooksIndex)

		// If updating existing book, check if UserID changed
		existing := b.Get([]byte(book.ID))
		var oldBook *models.Book
		var oldUserID string
		if existing != nil {
			var previous models.Book
			if err := previous.UnmarshalDB(existing); err == nil {
				oldUserID = previous.UserID
				oldBook = &previous
			}
		}

		book.Category = normalizeCategoryName(book.Category)
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
			if err := removeBookFromSortIndex(tx, oldBook); err != nil {
				return err
			}
		}
		return addBookToSortIndex(tx, book)
	})
}

func (db *DB) CreateBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		idxB := tx.Bucket(UserBooksIndex)

		book.Category = normalizeCategoryName(book.Category)
		if book.ContentHash != "" {
			bookIDs, err := getBookIDsForUser(idxB, book.UserID)
			if err != nil {
				return err
			}
			for _, id := range bookIDs {
				if id == book.ID {
					continue
				}
				v := b.Get([]byte(id))
				if v == nil {
					continue
				}
				var existing models.Book
				if err := existing.UnmarshalDB(v); err != nil {
					return err
				}
				if existing.ContentHash == book.ContentHash {
					return ErrDuplicateBookContent
				}
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
		return addBookToSortIndex(tx, book)
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
			if err := candidate.UnmarshalDB(data); err != nil {
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

type BookListResult struct {
	Books      []models.Book `json:"books"`
	TotalCount int           `json:"total_count"`
	Page       int           `json:"page"`
	PageSize   int           `json:"page_size"`
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
	prefix := []byte(userID + ":")

	err := db.View(func(tx *bbolt.Tx) error {
		idxB := tx.Bucket(UserBooksIndex)
		booksB := tx.Bucket(BooksBucket)
		cursor := idxB.Cursor()
		for key, _ := cursor.Seek(prefix); key != nil && bytes.HasPrefix(key, prefix); key, _ = cursor.Next() {
			bookID := strings.TrimPrefix(string(key), string(prefix))
			data := booksB.Get([]byte(bookID))
			if data == nil {
				continue
			}

			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return err
			}
			summary.Total++
			category := ""
			if book.Category != nil {
				category = strings.TrimSpace(*book.Category)
			}
			if category == "" {
				summary.Uncategorized++
				continue
			}
			summary.Categories[category]++
		}
		return nil
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

// ListBooksBySortedCursor reads a page in a persisted sort order.
func (db *DB) ListBooksBySortedCursor(userID, cursor string, limit int, sortKey string) ([]models.Book, string, error) {
	if userID == "" || limit <= 0 {
		return []models.Book{}, "", nil
	}
	sortKey = NormalizeBookSort(sortKey)
	books := make([]models.Book, 0, limit+1)
	prefix := []byte(sortKey + bookSortSeparator + userID + bookSortSeparator)

	err := db.View(func(tx *bbolt.Tx) error {
		indexBucket := tx.Bucket(BookSortIndex)
		booksBucket := tx.Bucket(BooksBucket)
		start := prefix
		if cursor != "" {
			data := booksBucket.Get([]byte(cursor))
			if data != nil {
				var cursorBook models.Book
				if err := cursorBook.UnmarshalDB(data); err != nil {
					return err
				}
				if cursorBook.UserID == userID {
					start = bookSortIndexKey(&cursorBook, sortKey)
				}
			}
		}

		indexCursor := indexBucket.Cursor()
		for key, bookID := indexCursor.Seek(start); key != nil && bytes.HasPrefix(key, prefix); key, bookID = indexCursor.Next() {
			if string(bookID) == cursor {
				continue
			}
			data := booksBucket.Get(bookID)
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
	return books[:limit], books[limit-1].ID, nil
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

func deleteBookDataInTx(tx *bbolt.Tx, id string, userID string) (*models.Book, error) {
	booksBucket := tx.Bucket(BooksBucket)
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
	if err := removeBookFromSortIndex(tx, &book); err != nil {
		return nil, err
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
			if err := book.UnmarshalDB(bookData); err != nil {
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

// SaveProgressIfCurrent 保存阅读进度，仅在期望的上次更新时间匹配时写入（乐观锁）。
// 读验证阶段使用 db.View（不阻塞其他读事务），实际写入使用 db.Update。
func (db *DB) SaveProgressIfCurrent(progress *models.Progress, userID string, expectedUpdatedAt *time.Time) error {
	// --- 阶段 1：只读验证 — 使用 db.View，不阻塞其他读事务 ---
	type verifyResult struct {
		bookExists  bool
		conflict    bool
		progressKey []byte
	}
	var verify verifyResult

	err := db.View(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
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
		verify.bookExists = true

		if expectedUpdatedAt != nil {
			progressBucket := tx.Bucket(ProgressBucket)
			verify.progressKey = progressKey(userID, progress.BookID)
			currentData := progressBucket.Get(verify.progressKey)
			if currentData == nil {
				return ErrProgressConflict
			}
			var current models.Progress
			if err := json.Unmarshal(currentData, &current); err != nil {
				return err
			}
			if !current.UpdatedAt.Equal(*expectedUpdatedAt) {
				verify.conflict = true
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if !verify.bookExists {
		return ErrNotFound
	}
	if verify.conflict {
		return ErrProgressConflict
	}

	// --- 阶段 2：纯写操作 — db.Update 仅做写入，持有写锁时间最短 ---
	return db.Update(func(tx *bbolt.Tx) error {
		progress.UserID = userID
		progressBucket := tx.Bucket(ProgressBucket)
		booksBucket := tx.Bucket(BooksBucket)

		// 验证书籍仍存在（View→Update 间可能被删除）
		bookData := booksBucket.Get([]byte(progress.BookID))
		if bookData == nil {
			return ErrNotFound
		}

		// 双重检查：防止在 View 和 Update 之间被其他写入者修改
		if expectedUpdatedAt != nil {
			currentData := progressBucket.Get(verify.progressKey)
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

		// 更新 Book 的 LastReadAt
		var book models.Book
		if err := book.UnmarshalDB(bookData); err != nil {
			return err
		}
		previousBook := book
		book.LastReadAt = &progress.UpdatedAt
		updatedBookData, err := json.Marshal(&book)
		if err != nil {
			return err
		}
		if err := booksBucket.Put([]byte(book.ID), updatedBookData); err != nil {
			return err
		}
		if err := removeBookFromSortIndex(tx, &previousBook); err != nil {
			return err
		}
		if err := addBookToSortIndex(tx, &book); err != nil {
			return err
		}

		data, err := json.Marshal(progress)
		if err != nil {
			return err
		}
		return progressBucket.Put(progressKey(userID, progress.BookID), data)
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

// SessionDB 返回专用的 session 数据库实例。
func (db *DB) SessionDB() *SessionDB {
	return db.sessionDB
}

// SaveSession 保存 session 到独立 session 数据库（与主 DB 锁隔离）。
func (db *DB) SaveSession(session *models.Session) error {
	return db.sessionDB.SaveSession(session)
}

// GetUserBySessionToken 通过 session token 查找用户。
// Session 数据从独立 session 数据库读取，不阻塞主 DB 的读写。
func (db *DB) GetUserBySessionToken(token string) (*models.User, error) {
	session, err := db.sessionDB.GetSession(token)
	if err != nil {
		return nil, err
	}
	if session == nil || session.UserID == "" {
		return nil, nil
	}

	var user *models.User
	err = db.View(func(tx *bbolt.Tx) error {
		usersB := tx.Bucket(UsersBucket)
		userData := usersB.Get([]byte(session.UserID))
		if userData == nil {
			return nil
		}
		var u models.User
		if err := u.UnmarshalDB(userData); err != nil {
			return err
		}
		user = &u
		return nil
	})
	if err != nil {
		return nil, err
	}
	return user, nil
}

// GetSession 从独立 session 数据库读取 session。
func (db *DB) GetSession(token string) (*models.Session, error) {
	return db.sessionDB.GetSession(token)
}

// DeleteSession 从独立 session 数据库删除 session。
func (db *DB) DeleteSession(token string) error {
	return db.sessionDB.DeleteSession(token)
}

// CleanExpiredSessions 清理独立 session 数据库中过期的 session。
func (db *DB) CleanExpiredSessions() error {
	return db.sessionDB.CleanExpiredSessions()
}

// --- user_books index helpers ---

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
		if err := user.UnmarshalDB(v); err != nil {
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

	return booksB.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(v); err != nil {
			return err
		}
		if book.UserID != "" {
			key := []byte(book.UserID + ":" + book.ID)
			if idxB.Get(key) == nil {
				if err := idxB.Put(key, []byte{}); err != nil {
					return err
				}
			}
		}
		return nil
	})
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
		if err := book.UnmarshalDB(v); err != nil {
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
