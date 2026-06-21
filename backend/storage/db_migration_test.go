package storage

import (
	"encoding/json"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func TestDBMigrationsAndHashedSessions(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_migration.db")

	// 1. Open database to trigger migrations
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}

	// 2. Verify schema version in system_meta
	err = db.View(func(tx *bbolt.Tx) error {
		metaB := tx.Bucket(SystemMetaBucket)
		if metaB == nil {
			t.Fatal("system_meta bucket not found")
		}
		versionBytes := metaB.Get([]byte("schema_version"))
		if versionBytes == nil {
			t.Fatal("schema_version key not found")
		}
		version, err := strconv.Atoi(string(versionBytes))
		if err != nil {
			t.Fatalf("failed to parse schema version: %v", err)
		}
		if version < 4 {
			t.Fatalf("expected schema version >= 4, got %d", version)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// 3. Save a session via SessionDB and verify it is hashed
	token := "my-secret-session-token-12345"
	session := &models.Session{
		Token:     token,
		UserID:    "user-1",
		Username:  "testuser",
		Role:      "user",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}

	if err := db.SaveSession(session); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	// Verify plaintext token is NOT the key in session DB
	sdb := db.SessionDB()
	err = sdb.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		if b.Get([]byte(token)) != nil {
			t.Fatal("security breach: plaintext token was stored directly as key")
		}

		// Verify it is stored under the hashed key
		expectedHashed := hashToken(token)
		val := b.Get([]byte(expectedHashed))
		if val == nil {
			t.Fatal("session not found under hashed key")
		}

		// Verify token inside value is also hashed
		var savedSession models.Session
		if err := json.Unmarshal(val, &savedSession); err != nil {
			t.Fatalf("failed to unmarshal session: %v", err)
		}
		if savedSession.Token == token {
			t.Fatal("security breach: plaintext token was stored inside the value payload")
		}
		if savedSession.Token != expectedHashed {
			t.Fatalf("expected saved session Token to be hashed %q, got %q", expectedHashed, savedSession.Token)
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// Verify we can retrieve it correctly via GetSession with plaintext token
	retrieved, err := db.GetSession(token)
	if err != nil {
		t.Fatalf("GetSession failed: %v", err)
	}
	if retrieved == nil {
		t.Fatal("GetSession returned nil for valid active session")
	}
	if retrieved.UserID != session.UserID || retrieved.Username != session.Username {
		t.Fatalf("mismatched session details: %+v", retrieved)
	}

	// 4. Save a book and verify user_books_index uses flat keys (userID:bookID)
	userID := "user-abc"
	book1 := &models.Book{
		ID:        "book-1",
		UserID:    userID,
		Title:     "Book 1",
		Filename:  "b1.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}
	book2 := &models.Book{
		ID:        "book-2",
		UserID:    userID,
		Title:     "Book 2",
		Filename:  "b2.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}

	if err := db.SaveBook(book1); err != nil {
		t.Fatalf("failed to save book 1: %v", err)
	}
	if err := db.SaveBook(book2); err != nil {
		t.Fatalf("failed to save book 2: %v", err)
	}

	// Verify flat keys exist in UserBooksIndex in Bolt
	err = db.View(func(tx *bbolt.Tx) error {
		idxB := tx.Bucket(UserBooksIndex)
		if idxB == nil {
			t.Fatal("user_books_index bucket not found")
		}

		// Old style key check
		oldVal := idxB.Get([]byte(userID))
		if oldVal != nil {
			t.Fatal("user_books_index is still using old JSON array style mapping")
		}

		// New style flat keys check
		key1 := []byte(userID + ":book-1")
		key2 := []byte(userID + ":book-2")

		if idxB.Get(key1) == nil {
			t.Fatal("flat key userID:book-1 not found in index")
		}
		if idxB.Get(key2) == nil {
			t.Fatal("flat key userID:book-2 not found in index")
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// Verify ListBooks still returns correct records
	books, err := db.ListBooks(userID)
	if err != nil {
		t.Fatalf("failed to list books: %v", err)
	}
	if len(books) != 2 {
		t.Fatalf("expected 2 books, got %d", len(books))
	}
	if (books[0].ID == "book-1" && books[1].ID == "book-2") || (books[0].ID == "book-2" && books[1].ID == "book-1") {
		// Pass
	} else {
		t.Fatalf("unexpected books returned: %+v", books)
	}

	// 5. Delete a book and check flat key is removed
	if err := db.DeleteBookData("book-1", userID); err != nil {
		t.Fatalf("failed to delete book: %v", err)
	}

	err = db.View(func(tx *bbolt.Tx) error {
		idxB := tx.Bucket(UserBooksIndex)
		key1 := []byte(userID + ":book-1")
		key2 := []byte(userID + ":book-2")

		if idxB.Get(key1) != nil {
			t.Fatal("flat key userID:book-1 was not deleted from index")
		}
		if idxB.Get(key2) == nil {
			t.Fatal("flat key userID:book-2 was incorrectly deleted")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// Clean up db
	db.Close()
}
