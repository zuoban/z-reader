package storage

import (
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
	BooksBucket      = []byte("books")
	ProgressBucket   = []byte("progress")
	SessionsBucket   = []byte("sessions")
	CategoriesBucket = []byte("categories")
	UsersBucket      = []byte("users")
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
			CategoriesBucket,
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

	if err := (&DB{db}).NormalizeCategorySortOrders(); err != nil {
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
		if err := assignUnownedCategories(tx, adminID); err != nil {
			return err
		}
		return assignUnownedProgress(tx, adminID)
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

func assignUnownedCategories(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(CategoriesBucket)
	return b.ForEach(func(k, v []byte) error {
		var category models.Category
		if err := json.Unmarshal(v, &category); err != nil {
			return err
		}
		if category.UserID != "" {
			return nil
		}
		category.UserID = userID
		data, err := json.Marshal(category)
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
		if err := deleteCategoriesByUser(tx, userID); err != nil {
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

func deleteCategoriesByUser(tx *bbolt.Tx, userID string) error {
	b := tx.Bucket(CategoriesBucket)
	var keysToDelete [][]byte
	if err := b.ForEach(func(k, v []byte) error {
		var category models.Category
		if err := json.Unmarshal(v, &category); err != nil {
			return err
		}
		if category.UserID == userID {
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
		data, err := json.Marshal(book)
		if err != nil {
			return err
		}
		return b.Put([]byte(book.ID), data)
	})
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

func (db *DB) SaveCategory(category *models.Category) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(CategoriesBucket)
		data, err := json.Marshal(category)
		if err != nil {
			return err
		}
		return b.Put([]byte(category.ID), data)
	})
}

func (db *DB) GetCategory(id string) (*models.Category, error) {
	var category models.Category
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(CategoriesBucket)
		data := b.Get([]byte(id))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &category)
	})
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &category, nil
}

func (db *DB) GetCategoryForUser(id string, userID string) (*models.Category, error) {
	category, err := db.GetCategory(id)
	if err != nil || category == nil {
		return category, err
	}
	if category.UserID != userID {
		return nil, nil
	}
	return category, nil
}

func (db *DB) ListCategories(userID string) ([]models.Category, error) {
	categories := []models.Category{}
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(CategoriesBucket)
		return b.ForEach(func(k, v []byte) error {
			var category models.Category
			if err := json.Unmarshal(v, &category); err != nil {
				return err
			}
			if category.UserID != userID {
				return nil
			}
			categories = append(categories, category)
			return nil
		})
	})
	sort.Slice(categories, func(i, j int) bool {
		if categories[i].SortOrder != categories[j].SortOrder {
			return categories[i].SortOrder < categories[j].SortOrder
		}
		if !categories[i].CreatedAt.Equal(categories[j].CreatedAt) {
			return categories[i].CreatedAt.Before(categories[j].CreatedAt)
		}
		return categories[i].Name < categories[j].Name
	})
	return categories, err
}

func (db *DB) NormalizeCategorySortOrders() error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(CategoriesBucket)
		categoriesByUser := map[string][]models.Category{}

		if err := b.ForEach(func(_, v []byte) error {
			var category models.Category
			if err := json.Unmarshal(v, &category); err != nil {
				return err
			}
			categoriesByUser[category.UserID] = append(categoriesByUser[category.UserID], category)
			return nil
		}); err != nil {
			return err
		}

		for _, categories := range categoriesByUser {
			if len(categories) == 0 {
				continue
			}

			sort.Slice(categories, func(i, j int) bool {
				leftOrder := categories[i].SortOrder
				rightOrder := categories[j].SortOrder

				if leftOrder <= 0 {
					leftOrder = int(^uint(0) >> 1)
				}
				if rightOrder <= 0 {
					rightOrder = int(^uint(0) >> 1)
				}
				if leftOrder != rightOrder {
					return leftOrder < rightOrder
				}
				if !categories[i].CreatedAt.Equal(categories[j].CreatedAt) {
					return categories[i].CreatedAt.Before(categories[j].CreatedAt)
				}
				return categories[i].Name < categories[j].Name
			})

			for index := range categories {
				categories[index].SortOrder = index + 1
				data, err := json.Marshal(categories[index])
				if err != nil {
					return err
				}
				if err := b.Put([]byte(categories[index].ID), data); err != nil {
					return err
				}
			}
		}

		return nil
	})
}

func (db *DB) DeleteCategory(id string, userID string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		categoriesB := tx.Bucket(CategoriesBucket)
		categoryData := categoriesB.Get([]byte(id))
		if categoryData == nil {
			return ErrNotFound
		}
		var category models.Category
		if err := json.Unmarshal(categoryData, &category); err != nil {
			return err
		}
		if category.UserID != userID {
			return ErrNotFound
		}

		booksB := tx.Bucket(BooksBucket)
		var booksToUpdate [][]byte

		err := booksB.ForEach(func(k, v []byte) error {
			var book models.Book
			if err := json.Unmarshal(v, &book); err != nil {
				return err
			}
			if book.UserID == userID && book.CategoryID != nil && *book.CategoryID == id {
				booksToUpdate = append(booksToUpdate, append([]byte(nil), k...))
			}
			return nil
		})
		if err != nil {
			return err
		}

		for _, key := range booksToUpdate {
			data := booksB.Get(key)
			var book models.Book
			if err := json.Unmarshal(data, &book); err != nil {
				return err
			}
			book.CategoryID = nil
			updatedData, err := json.Marshal(book)
			if err != nil {
				return err
			}
			if err := booksB.Put(key, updatedData); err != nil {
				return err
			}
		}

		return categoriesB.Delete([]byte(id))
	})
}
