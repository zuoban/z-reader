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
	BooksBucket    = []byte("books")
	ProgressBucket = []byte("progress")
	SessionsBucket = []byte("sessions")
	UsersBucket    = []byte("users")
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
			SessionsBucket,
			UsersBucket,
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
		b := tx.Bucket(UsersBucket)
		data, err := json.Marshal(user)
		if err != nil {
			return err
		}
		return b.Put([]byte(user.ID), data)
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
		b := tx.Bucket(UsersBucket)
		return b.ForEach(func(k, v []byte) error {
			var candidate models.User
			if err := json.Unmarshal(v, &candidate); err != nil {
				return err
			}
			if normalizeUsername(candidate.Username) == normalized {
				user = &candidate
				return nil
			}
			return nil
		})
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
		b := tx.Bucket(UsersBucket)
		if b.Get([]byte(id)) == nil {
			return ErrNotFound
		}
		return b.Delete([]byte(id))
	})
}

func (db *DB) DeleteUserData(userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		if err := deleteBooksByUser(tx, userID); err != nil {
			return err
		}
		return deleteProgressByUser(tx, userID)
	})
}

func deleteBooksByUser(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(BooksBucket)
	var keysToDelete [][]byte
	if err := b.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := json.Unmarshal(v, &book); err != nil {
			return err
		}
		if book.UserID == userID {
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

func (db *DB) SaveBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		book.Category = normalizeCategoryName(book.Category)
		data, err := json.Marshal(book)
		if err != nil {
			return err
		}
		if err := b.Put([]byte(book.ID), data); err != nil {
			return err
		}
		return nil
	})
}

func (db *DB) CreateBook(book *models.Book) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
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
		return nil
	})
}

func (db *DB) FindBookByContentHash(userID string, contentHash string) (*models.Book, error) {
	if contentHash == "" {
		return nil, nil
	}

	var book *models.Book
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		return b.ForEach(func(k, v []byte) error {
			var candidate models.Book
			if err := json.Unmarshal(v, &candidate); err != nil {
				return err
			}
			if candidate.UserID == userID && candidate.ContentHash == contentHash {
				book = &candidate
			}
			return nil
		})
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
	if book.UserID != userID {
		return nil, nil
	}
	return book, nil
}

func (db *DB) ListBooks(userID string) ([]models.Book, error) {
	books := []models.Book{}
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		return b.ForEach(func(k, v []byte) error {
			var book models.Book
			if err := json.Unmarshal(v, &book); err != nil {
				return err
			}
			if book.UserID != userID {
				return nil
			}
			books = append(books, book)
			return nil
		})
	})
	return books, err
}

func (db *DB) DeleteBookData(id string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		booksBucket := tx.Bucket(BooksBucket)
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
		if err := booksBucket.Delete([]byte(id)); err != nil {
			return err
		}

		progressBucket := tx.Bucket(ProgressBucket)
		return progressBucket.Delete(progressKey(userID, id))
	})
}

func progressKey(userID string, bookID string) []byte {
	return []byte(userID + ":" + bookID)
}

func (db *DB) DeleteProgress(bookID string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		return b.Delete(progressKey(userID, bookID))
	})
}

func (db *DB) SaveProgress(progress *models.Progress, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		progress.UserID = userID

		progressBucket := tx.Bucket(ProgressBucket)
		data, err := json.Marshal(progress)
		if err != nil {
			return err
		}

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
		book.LastReadAt = &progress.UpdatedAt

		updatedBookData, err := json.Marshal(&book)
		if err != nil {
			return err
		}

		if err := booksBucket.Put([]byte(book.ID), updatedBookData); err != nil {
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
