package storage

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func openCoverageDB(t *testing.T) *DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "coverage.db")
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("failed to close db: %v", err)
		}
	})
	return db
}

func makeCoverageBook(id, userID, title string) *models.Book {
	return &models.Book{
		ID:        id,
		UserID:    userID,
		Title:     title,
		Author:    "Author",
		Filename:  id + ".epub",
		Format:    "epub",
		Size:      256,
		CreatedAt: time.Now().UTC().Truncate(time.Second),
	}
}

func TestBookmarksLifecycleAndCascade(t *testing.T) {
	db := openCoverageDB(t)
	owner := "user-a"
	other := "user-b"

	book := makeCoverageBook("book-1", owner, "Bookmark Book")
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("SaveBook failed: %v", err)
	}
	otherBook := makeCoverageBook("book-2", other, "Other User Book")
	if err := db.SaveBook(otherBook); err != nil {
		t.Fatalf("SaveBook failed: %v", err)
	}

	t1 := time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(time.Minute)

	// SaveBookmark not-found & ownership checks
	if err := db.SaveBookmark(&models.Bookmark{ID: "bm-missing", BookID: "no-such-book", CFI: "cfi"}, owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing book on SaveBookmark, got %v", err)
	}
	if err := db.SaveBookmark(&models.Bookmark{ID: "bm-wrong-owner", BookID: book.ID, CFI: "cfi"}, other); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for wrong owner on SaveBookmark, got %v", err)
	}

	// Save out of order to verify ListBookmarks sorts by CreatedAt
	bm2 := &models.Bookmark{
		ID:         "bm-2",
		BookID:     book.ID,
		CFI:        "epubcfi(/6/4)",
		Percentage: 50,
		Chapter:    "Ch 2",
		Note:       "second",
		CreatedAt:  t2,
	}
	bm1 := &models.Bookmark{
		ID:         "bm-1",
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2)",
		Percentage: 10,
		Chapter:    "Ch 1",
		Note:       "first",
		CreatedAt:  t1,
	}
	if err := db.SaveBookmark(bm2, owner); err != nil {
		t.Fatalf("SaveBookmark bm2 failed: %v", err)
	}
	if err := db.SaveBookmark(bm1, owner); err != nil {
		t.Fatalf("SaveBookmark bm1 failed: %v", err)
	}

	// ListBookmarks not-found & ownership checks
	if _, err := db.ListBookmarks("no-such-book", owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing book on ListBookmarks, got %v", err)
	}
	if _, err := db.ListBookmarks(book.ID, other); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for wrong owner on ListBookmarks, got %v", err)
	}

	list, err := db.ListBookmarks(book.ID, owner)
	if err != nil {
		t.Fatalf("ListBookmarks failed: %v", err)
	}
	if len(list) != 2 || list[0].ID != "bm-1" || list[1].ID != "bm-2" {
		t.Fatalf("expected sorted bookmarks [bm-1, bm-2], got %+v", list)
	}

	// UpdateBookmarkNote error paths
	if _, err := db.UpdateBookmarkNote("no-such-book", "bm-1", owner, "note"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing book on UpdateBookmarkNote, got %v", err)
	}
	if _, err := db.UpdateBookmarkNote(book.ID, "bm-1", other, "note"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for wrong owner on UpdateBookmarkNote, got %v", err)
	}
	if _, err := db.UpdateBookmarkNote(book.ID, "no-such-bm", owner, "note"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing bookmark on UpdateBookmarkNote, got %v", err)
	}

	// UpdateBookmarkNote success & clear
	updated, err := db.UpdateBookmarkNote(book.ID, "bm-1", owner, "updated note")
	if err != nil {
		t.Fatalf("UpdateBookmarkNote failed: %v", err)
	}
	if updated.Note != "updated note" || updated.CFI != bm1.CFI || updated.Chapter != bm1.Chapter {
		t.Fatalf("unexpected updated bookmark: %+v", updated)
	}
	cleared, err := db.UpdateBookmarkNote(book.ID, "bm-1", owner, "")
	if err != nil {
		t.Fatalf("UpdateBookmarkNote clear failed: %v", err)
	}
	if cleared.Note != "" {
		t.Fatalf("expected empty note after clear, got %q", cleared.Note)
	}

	// DeleteBookmark error paths
	if err := db.DeleteBookmark("no-such-book", "bm-1", owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing book on DeleteBookmark, got %v", err)
	}
	if err := db.DeleteBookmark(book.ID, "bm-1", other); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for wrong owner on DeleteBookmark, got %v", err)
	}
	if err := db.DeleteBookmark(book.ID, "no-such-bm", owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing bookmark on DeleteBookmark, got %v", err)
	}

	// DeleteBookmark success & repeat delete returns ErrNotFound
	if err := db.DeleteBookmark(book.ID, "bm-1", owner); err != nil {
		t.Fatalf("DeleteBookmark failed: %v", err)
	}
	if err := db.DeleteBookmark(book.ID, "bm-1", owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound on repeat DeleteBookmark, got %v", err)
	}

	// Add a bookmark with colon-containing IDs to exercise ambiguous prefix branch on cascade delete
	colonBook := makeCoverageBook("book-1:sub", owner, "Sub Book")
	if err := db.SaveBook(colonBook); err != nil {
		t.Fatalf("SaveBook colonBook failed: %v", err)
	}
	if err := db.SaveBookmark(&models.Bookmark{
		ID:        "bm-sub",
		BookID:    colonBook.ID,
		CFI:       "epubcfi(/6/8)",
		CreatedAt: t2,
	}, owner); err != nil {
		t.Fatalf("SaveBookmark colonBook failed: %v", err)
	}

	// Delete book-1 and verify bm-2 cascades while colonBook's bookmark survives
	if _, err := db.DeleteBook(book.ID, owner); err != nil {
		t.Fatalf("DeleteBook failed: %v", err)
	}
	err = db.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(BookmarksBucket)
		if b.Get(bookmarkKey(owner, book.ID, "bm-2")) != nil {
			t.Fatalf("expected bm-2 to be deleted with book")
		}
		if b.Get(bookmarkKey(owner, colonBook.ID, "bm-sub")) == nil {
			t.Fatalf("expected colonBook bookmark to survive book-1 deletion")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("verify cascade failed: %v", err)
	}
}

func TestGetBookForUserAndListBooksForIDs(t *testing.T) {
	db := openCoverageDB(t)
	owner := "user-a"
	other := "user-b"

	b1 := makeCoverageBook("b1", owner, "First")
	b2 := makeCoverageBook("b2", owner, "Second")
	b3 := makeCoverageBook("b3", owner, "Third")
	bOther := makeCoverageBook("b-other", other, "Other")

	for _, b := range []*models.Book{b1, b2, b3, bOther} {
		if err := db.SaveBook(b); err != nil {
			t.Fatalf("SaveBook %s failed: %v", b.ID, err)
		}
	}

	// GetBookForUser
	got, err := db.GetBookForUser("b1", owner)
	if err != nil || got == nil || got.Title != "First" {
		t.Fatalf("expected b1 for owner, got %+v, err=%v", got, err)
	}
	got, err = db.GetBookForUser("b1", other)
	if err != nil || got != nil {
		t.Fatalf("expected nil for non-owner, got %+v, err=%v", got, err)
	}
	got, err = db.GetBookForUser("missing", owner)
	if err != nil || got != nil {
		t.Fatalf("expected nil for missing book, got %+v, err=%v", got, err)
	}

	// Simulate dangling UserBooksIndex entry (indexed, but row deleted)
	if err := db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(UserBooksIndex).Put([]byte(owner+":dangling"), []byte{})
	}); err != nil {
		t.Fatalf("insert dangling index failed: %v", err)
	}
	got, err = db.GetBookForUser("dangling", owner)
	if err != nil || got != nil {
		t.Fatalf("expected nil for dangling index entry, got %+v, err=%v", got, err)
	}

	// ListBooksForIDs preserves request order, deduplicates, ignores empty/missing/other/dangling
	books, err := db.ListBooksForIDs(owner, []string{" ", "b3", "b-other", "missing", "dangling", "b1", "b3", "b2"})
	if err != nil {
		t.Fatalf("ListBooksForIDs failed: %v", err)
	}
	if len(books) != 3 || books[0].ID != "b3" || books[1].ID != "b1" || books[2].ID != "b2" {
		t.Fatalf("unexpected ListBooksForIDs result: %+v", books)
	}

	emptyBooks, err := db.ListBooksForIDs(owner, nil)
	if err != nil || len(emptyBooks) != 0 {
		t.Fatalf("expected empty slice for nil ids, got %+v, err=%v", emptyBooks, err)
	}
}

func TestDBCheckAndBackups(t *testing.T) {
	db := openCoverageDB(t)
	owner := "user-a"

	book := makeCoverageBook("backup-book", owner, "Backed Up")
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("SaveBook failed: %v", err)
	}
	session := &models.Session{
		Token:     "backup-session-token",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("SaveSession failed: %v", err)
	}

	// Healthy Check
	if err := db.Check(); err != nil {
		t.Fatalf("expected healthy Check, got %v", err)
	}

	// BackupTo and verify snapshot contains saved book
	backupDir := t.TempDir()
	mainBackupPath := filepath.Join(backupDir, "main.db")
	if err := db.BackupTo(mainBackupPath); err != nil {
		t.Fatalf("BackupTo failed: %v", err)
	}
	snapDB, err := bbolt.Open(mainBackupPath, 0600, &bbolt.Options{ReadOnly: true, Timeout: time.Second})
	if err != nil {
		t.Fatalf("failed to open main backup: %v", err)
	}
	err = snapDB.View(func(tx *bbolt.Tx) error {
		data := tx.Bucket(BooksBucket).Get([]byte(book.ID))
		if data == nil {
			t.Fatalf("expected book in main backup")
		}
		var restored models.Book
		if err := restored.UnmarshalDB(data); err != nil {
			return err
		}
		if restored.Title != book.Title {
			t.Fatalf("expected title %q, got %q", book.Title, restored.Title)
		}
		return nil
	})
	snapDB.Close()
	if err != nil {
		t.Fatalf("verify main backup failed: %v", err)
	}

	// SessionBackupTo and verify snapshot contains saved session
	sessionBackupPath := filepath.Join(backupDir, "sessions.db")
	if err := db.SessionBackupTo(sessionBackupPath); err != nil {
		t.Fatalf("SessionBackupTo failed: %v", err)
	}
	restoredSessions, err := OpenSession(sessionBackupPath)
	if err != nil {
		t.Fatalf("OpenSession on backup failed: %v", err)
	}
	gotSession, err := restoredSessions.GetSession(session.Token)
	restoredSessions.Close()
	if err != nil || gotSession == nil || !gotSession.ExpiresAt.Equal(session.ExpiresAt) {
		t.Fatalf("expected restored session, got %+v, err=%v", gotSession, err)
	}

	// Check & SessionBackupTo when sessionDB is nil
	noSessionDB := &DB{DB: db.DB, sessionDB: nil}
	if err := noSessionDB.Check(); err == nil {
		t.Fatalf("expected Check error when sessionDB is nil")
	}
	if err := noSessionDB.SessionBackupTo(filepath.Join(backupDir, "nil.db")); err == nil {
		t.Fatalf("expected SessionBackupTo error when sessionDB is nil")
	}

	// Check when SessionsBucket is missing
	brokenSessionsDB := openCoverageDB(t)
	if err := brokenSessionsDB.sessionDB.Update(func(tx *bbolt.Tx) error {
		return tx.DeleteBucket(SessionsBucket)
	}); err != nil {
		t.Fatalf("delete SessionsBucket failed: %v", err)
	}
	if err := brokenSessionsDB.Check(); err == nil {
		t.Fatalf("expected Check error when SessionsBucket is missing")
	}

	// Check when required main bucket is missing
	brokenMainDB := openCoverageDB(t)
	if err := brokenMainDB.Update(func(tx *bbolt.Tx) error {
		return tx.DeleteBucket(SystemMetaBucket)
	}); err != nil {
		t.Fatalf("delete SystemMetaBucket failed: %v", err)
	}
	if err := brokenMainDB.Check(); err == nil {
		t.Fatalf("expected Check error when SystemMetaBucket is missing")
	}
}

func TestCreateProgressAndGetProgressForBook(t *testing.T) {
	db := openCoverageDB(t)
	owner := "user-a"
	other := "user-b"

	book := makeCoverageBook("prog-book", owner, "Progress Book")
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("SaveBook failed: %v", err)
	}

	// GetProgressForBook error & empty states
	if _, err := db.GetProgressForBook("missing-book", owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing book, got %v", err)
	}
	if _, err := db.GetProgressForBook(book.ID, other); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for non-owner, got %v", err)
	}
	progress, err := db.GetProgressForBook(book.ID, owner)
	if err != nil || progress != nil {
		t.Fatalf("expected (nil, nil) when book has no progress yet, got (%+v, %v)", progress, err)
	}

	// CreateProgress error paths
	now := time.Now().UTC().Truncate(time.Second)
	if err := db.CreateProgress(&models.Progress{
		BookID:     "missing-book",
		CFI:        "epubcfi(/6/2)",
		Percentage: 5,
		UpdatedAt:  now,
	}, owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing book on CreateProgress, got %v", err)
	}
	if err := db.CreateProgress(&models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2)",
		Percentage: 5,
		UpdatedAt:  now,
	}, other); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for wrong owner on CreateProgress, got %v", err)
	}

	// First CreateProgress succeeds
	first := &models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2!/4/2)",
		Percentage: 25.5,
		DeviceID:   "dev-1",
		UpdatedAt:  now,
	}
	if err := db.CreateProgress(first, owner); err != nil {
		t.Fatalf("CreateProgress failed: %v", err)
	}

	// Second CreateProgress conflicts
	if err := db.CreateProgress(&models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/4!/4/2)",
		Percentage: 40,
		UpdatedAt:  now.Add(time.Minute),
	}, owner); err != ErrProgressConflict {
		t.Fatalf("expected ErrProgressConflict on duplicate CreateProgress, got %v", err)
	}

	// GetProgressForBook returns saved progress
	got, err := db.GetProgressForBook(book.ID, owner)
	if err != nil {
		t.Fatalf("GetProgressForBook failed: %v", err)
	}
	if got == nil || got.CFI != first.CFI || got.Percentage != first.Percentage || got.DeviceID != first.DeviceID {
		t.Fatalf("unexpected progress: %+v", got)
	}

	// Simulate dangling UserBooksIndex entry for GetProgressForBook
	if err := db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(UserBooksIndex).Put([]byte(owner+":dangling-prog"), []byte{})
	}); err != nil {
		t.Fatalf("insert dangling index failed: %v", err)
	}
	if _, err := db.GetProgressForBook("dangling-prog", owner); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for dangling book index, got %v", err)
	}
}

func TestDBSessionManagementAndCleanExpired(t *testing.T) {
	db := openCoverageDB(t)
	now := time.Now().UTC()

	active1 := &models.Session{
		Token:     "tok-active-1",
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}
	active2 := &models.Session{
		Token:     "tok-active-2",
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}
	active3 := &models.Session{
		Token:     "tok-active-3",
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}
	activeKeep := &models.Session{
		Token:     "tok-keep",
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}
	expired := &models.Session{
		Token:     "tok-expired",
		CreatedAt: now.Add(-2 * time.Hour),
		ExpiresAt: now.Add(-time.Minute),
	}

	for _, s := range []*models.Session{active1, active2, active3, activeKeep, expired} {
		if err := db.SaveSession(s); err != nil {
			t.Fatalf("SaveSession %s failed: %v", s.Token, err)
		}
	}

	// DeleteSession removes single session
	if err := db.DeleteSession(active1.Token); err != nil {
		t.Fatalf("DeleteSession failed: %v", err)
	}
	if got, err := db.GetSession(active1.Token); err != nil || got != nil {
		t.Fatalf("expected deleted session to be nil, got %+v, err=%v", got, err)
	}

	// DeleteSessions removes multiple sessions in one transaction
	if err := db.DeleteSessions(active2.Token, active3.Token); err != nil {
		t.Fatalf("DeleteSessions failed: %v", err)
	}
	for _, tok := range []string{active2.Token, active3.Token} {
		if got, err := db.GetSession(tok); err != nil || got != nil {
			t.Fatalf("expected %s to be deleted, got %+v, err=%v", tok, got, err)
		}
	}

	// Also plant a corrupt JSON entry and an expired cached entry to exercise all CleanExpiredSessions branches
	if err := db.SessionDB().Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(SessionsBucket).Put([]byte("corrupt-key"), []byte("{not-json"))
	}); err != nil {
		t.Fatalf("insert corrupt session failed: %v", err)
	}
	db.SessionDB().cacheMu.Lock()
	db.SessionDB().cache["cached-expired"] = models.Session{
		Token:     "cached-expired",
		ExpiresAt: now.Add(-time.Second),
	}
	db.SessionDB().cacheMu.Unlock()

	if err := db.CleanExpiredSessions(); err != nil {
		t.Fatalf("CleanExpiredSessions failed: %v", err)
	}

	// Verify expired and corrupt keys are gone from bucket and cache, while activeKeep remains
	err := db.SessionDB().View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		if b.Get([]byte(hashToken(expired.Token))) != nil {
			t.Fatalf("expected expired session to be cleaned from bucket")
		}
		if b.Get([]byte("corrupt-key")) != nil {
			t.Fatalf("expected corrupt session entry to be cleaned from bucket")
		}
		if b.Get([]byte(hashToken(activeKeep.Token))) == nil {
			t.Fatalf("expected unexpired session to remain in bucket")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("verify CleanExpiredSessions failed: %v", err)
	}
	db.SessionDB().cacheMu.RLock()
	_, stillCached := db.SessionDB().cache["cached-expired"]
	db.SessionDB().cacheMu.RUnlock()
	if stillCached {
		t.Fatalf("expected expired cached session to be evicted")
	}
	if got, err := db.GetSession(activeKeep.Token); err != nil || got == nil {
		t.Fatalf("expected activeKeep session to remain valid, got %+v, err=%v", got, err)
	}
}

func TestUploadSnapshotsRetentionAndCleanup(t *testing.T) {
	db := openCoverageDB(t)
	uploadDir := t.TempDir()

	writeUpload := func(name string) string {
		t.Helper()
		p := filepath.Join(uploadDir, name)
		if err := os.WriteFile(p, []byte("epub-bytes"), 0600); err != nil {
			t.Fatalf("write upload %s failed: %v", name, err)
		}
		return p
	}

	// 1. Without active snapshot, CleanupUnreferencedUploads removes immediately.
	immediateFile := writeUpload("immediate.epub")
	db.CleanupUnreferencedUploads(func() {
		_ = os.Remove(immediateFile)
	})
	if _, err := os.Stat(immediateFile); !os.IsNotExist(err) {
		t.Fatalf("expected immediateFile to be removed right away, stat err=%v", err)
	}

	// 2. During WithUploadFilesRetained, cleanup is deferred until snapshot finishes.
	retainedFile := writeUpload("retained.epub")
	nestedFile := writeUpload("nested.epub")
	var events []string

	err := db.WithUploadFilesRetained(func() error {
		db.CleanupUnreferencedUploads(func() {
			events = append(events, "outer-cleanup")
			_ = os.Remove(retainedFile)
		})
		if _, err := os.Stat(retainedFile); err != nil {
			t.Fatalf("expected retainedFile to stay on disk during outer snapshot: %v", err)
		}

		// Nested snapshot should keep active > 0 until outer exits too.
		if err := db.WithUploadFilesRetained(func() error {
			db.CleanupUnreferencedUploads(func() {
				events = append(events, "inner-cleanup")
				_ = os.Remove(nestedFile)
			})
			return nil
		}); err != nil {
			t.Fatalf("nested snapshot returned unexpected error: %v", err)
		}

		// Inner exited, but outer is still active so neither file should be removed yet.
		if _, err := os.Stat(retainedFile); err != nil {
			t.Fatalf("expected retainedFile to remain until outer snapshot exits: %v", err)
		}
		if _, err := os.Stat(nestedFile); err != nil {
			t.Fatalf("expected nestedFile to remain until outer snapshot exits: %v", err)
		}
		if len(events) != 0 {
			t.Fatalf("expected no cleanups yet while outer snapshot is active, got %v", events)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("WithUploadFilesRetained failed: %v", err)
	}

	if len(events) != 2 || events[0] != "outer-cleanup" || events[1] != "inner-cleanup" {
		t.Fatalf("expected deferred cleanups in FIFO order, got %v", events)
	}
	if _, err := os.Stat(retainedFile); !os.IsNotExist(err) {
		t.Fatalf("expected retainedFile to be removed after snapshot, stat err=%v", err)
	}
	if _, err := os.Stat(nestedFile); !os.IsNotExist(err) {
		t.Fatalf("expected nestedFile to be removed after snapshot, stat err=%v", err)
	}

	// 3. Error returned from capture callback still releases and runs deferred cleanups.
	errFile := writeUpload("on-error.epub")
	captureErr := errors.New("backup copy failed")
	gotErr := db.WithUploadFilesRetained(func() error {
		db.CleanupUnreferencedUploads(func() {
			_ = os.Remove(errFile)
		})
		if _, err := os.Stat(errFile); err != nil {
			t.Fatalf("expected errFile to remain during failing snapshot: %v", err)
		}
		return captureErr
	})
	if !errors.Is(gotErr, captureErr) {
		t.Fatalf("expected error %v, got %v", captureErr, gotErr)
	}
	if _, err := os.Stat(errFile); !os.IsNotExist(err) {
		t.Fatalf("expected errFile to be cleaned up after error return, stat err=%v", err)
	}
}
