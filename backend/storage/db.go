package storage

import (
	"encoding/json"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

var (
	BooksBucket    = []byte("books")
	ProgressBucket = []byte("progress")
	SessionsBucket = []byte("sessions")
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
		for _, bucket := range [][]byte{BooksBucket, ProgressBucket, SessionsBucket} {
			if _, err := tx.CreateBucketIfNotExists(bucket); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
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
			return nil
		}
		return json.Unmarshal(data, &book)
	})
	if err != nil {
		return nil, err
	}
	if book.ID == "" {
		return nil, nil
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
			return nil
		}
		return json.Unmarshal(data, &progress)
	})
	if err != nil {
		return nil, err
	}
	if progress.BookID == "" {
		return nil, nil
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
			return nil
		}
		return json.Unmarshal(data, &session)
	})
	if err != nil {
		return nil, err
	}
	if session.Token == "" {
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
