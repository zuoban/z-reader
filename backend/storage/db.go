package storage

import (
	"fmt"
	"strings"
	"time"

	"go.etcd.io/bbolt"
)

var (
	BooksBucket         = []byte("books")
	ProgressBucket      = []byte("progress")
	BookmarksBucket     = []byte("bookmarks")
	UsersBucket         = []byte("users")
	UserBooksIndex      = []byte("user_books_index")       // userId:bookId -> Empty
	UsernameIndex       = []byte("username_index")         // normalizedUsername -> userId
	BookSortIndex       = []byte("book_sort_index")        // sort:user:sortValue:bookId -> bookId
	BookSearchIndex     = []byte("book_search_index")      // user\x00bookId -> normalized searchable fields
	BookSearchGramIndex = []byte("book_search_gram_index") // user\x00gram\x00bookId -> Empty
	ProgressTimeIndex   = []byte("progress_time_index")    // user\x00updatedAt\x00bookId -> bookId
	BookContentIndex    = []byte("book_content_index")     // user\x00contentHash -> bookId
	LibrarySummaryIndex = []byte("library_summary_index")  // user -> BookLibrarySummary JSON
	SystemMetaBucket    = []byte("system_meta")
)

// DB 封装主数据库操作（图书、进度、书签）。
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

// Check verifies that the main database can start a read transaction and that
// its essential buckets remain available. It is safe to call from readiness
// probes and does not mutate application data.
func (db *DB) Check() error {
	if err := db.View(func(tx *bbolt.Tx) error {
		for _, bucket := range [][]byte{BooksBucket, ProgressBucket, SystemMetaBucket} {
			if tx.Bucket(bucket) == nil {
				return fmt.Errorf("required bucket %q is missing", bucket)
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if db.sessionDB == nil {
		return fmt.Errorf("session database is unavailable")
	}
	return db.sessionDB.View(func(tx *bbolt.Tx) error {
		if tx.Bucket(SessionsBucket) == nil {
			return fmt.Errorf("required session bucket is missing")
		}
		return nil
	})
}

// BackupTo writes a consistent, online snapshot of the main database. bbolt
// creates the snapshot from a read transaction, so writers remain available.
func (db *DB) BackupTo(path string) error {
	return db.View(func(tx *bbolt.Tx) error {
		return tx.CopyFile(path, 0600)
	})
}

// SessionBackupTo snapshots the session database together with the main
// database. Keeping it separate avoids exposing the internal session store.
func (db *DB) SessionBackupTo(path string) error {
	if db.sessionDB == nil {
		return fmt.Errorf("session database is unavailable")
	}
	return db.sessionDB.BackupTo(path)
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
