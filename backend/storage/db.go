package storage

import (
	"encoding/json"
	"sort"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

var (
	BooksBucket      = []byte("books")
	ProgressBucket   = []byte("progress")
	SessionsBucket   = []byte("sessions")
	CategoriesBucket = []byte("categories")
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
		for _, bucket := range [][]byte{BooksBucket, ProgressBucket, SessionsBucket, CategoriesBucket} {
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

func (db *DB) ListBooks() ([]models.Book, error) {
	books := []models.Book{}
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		return b.ForEach(func(k, v []byte) error {
			var book models.Book
			if err := json.Unmarshal(v, &book); err != nil {
				return err
			}
			books = append(books, book)
			return nil
		})
	})
	return books, err
}

func (db *DB) DeleteBook(id string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BooksBucket)
		return b.Delete([]byte(id))
	})
}

func (db *DB) SaveProgress(progress *models.Progress) error {
	return db.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		data, err := json.Marshal(progress)
		if err != nil {
			return err
		}
		return b.Put([]byte(progress.BookID), data)
	})
}

func (db *DB) GetProgress(bookID string) (*models.Progress, error) {
	var progress models.Progress
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(ProgressBucket)
		data := b.Get([]byte(bookID))
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

func (db *DB) ListCategories() ([]models.Category, error) {
	categories := []models.Category{}
	err := db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(CategoriesBucket)
		return b.ForEach(func(k, v []byte) error {
			var category models.Category
			if err := json.Unmarshal(v, &category); err != nil {
				return err
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
		categories := []models.Category{}

		if err := b.ForEach(func(_, v []byte) error {
			var category models.Category
			if err := json.Unmarshal(v, &category); err != nil {
				return err
			}
			categories = append(categories, category)
			return nil
		}); err != nil {
			return err
		}

		if len(categories) == 0 {
			return nil
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

		return nil
	})
}

func (db *DB) DeleteCategory(id string) error {
	return db.Update(func(tx *bbolt.Tx) error {
		booksB := tx.Bucket(BooksBucket)
		var booksToUpdate [][]byte

		err := booksB.ForEach(func(k, v []byte) error {
			var book models.Book
			if err := json.Unmarshal(v, &book); err != nil {
				return err
			}
			if book.CategoryID != nil && *book.CategoryID == id {
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

		categoriesB := tx.Bucket(CategoriesBucket)
		return categoriesB.Delete([]byte(id))
	})
}
