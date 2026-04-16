package storage

import (
	"path/filepath"
	"testing"
	"time"

	"z-reader/backend/models"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("failed to close test db: %v", err)
		}
	})

	return db
}

func TestListProgressByBookIDs(t *testing.T) {
	db := openTestDB(t)

	progressA := &models.Progress{
		BookID:     "book-a",
		CFI:        "epubcfi(/6/2[chapter1]!/4/2/6)",
		Percentage: 12.5,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}
	progressB := &models.Progress{
		BookID:     "book-b",
		CFI:        "epubcfi(/6/4[chapter2]!/4/2/8)",
		Percentage: 66.6,
		UpdatedAt:  time.Now().UTC().Add(time.Minute).Truncate(time.Second),
	}

	if err := db.SaveProgress(progressA); err != nil {
		t.Fatalf("failed to save progress A: %v", err)
	}
	if err := db.SaveProgress(progressB); err != nil {
		t.Fatalf("failed to save progress B: %v", err)
	}

	progressMap, err := db.ListProgressByBookIDs([]string{"book-a", "missing", "book-b"})
	if err != nil {
		t.Fatalf("ListProgressByBookIDs returned error: %v", err)
	}

	if len(progressMap) != 2 {
		t.Fatalf("expected 2 progress records, got %d", len(progressMap))
	}
	if got := progressMap["book-a"]; got.CFI != progressA.CFI || got.UpdatedAt != progressA.UpdatedAt {
		t.Fatalf("unexpected progress for book-a: %+v", got)
	}
	if got := progressMap["book-b"]; got.CFI != progressB.CFI || got.UpdatedAt != progressB.UpdatedAt {
		t.Fatalf("unexpected progress for book-b: %+v", got)
	}
}

func TestGetSessionReturnsNilForExpiredSession(t *testing.T) {
	db := openTestDB(t)

	session := &models.Session{
		Token:     "expired-token",
		CreatedAt: time.Now().UTC().Add(-48 * time.Hour),
		ExpiresAt: time.Now().UTC().Add(-24 * time.Hour),
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected expired session to be treated as nil, got %+v", got)
	}
}
