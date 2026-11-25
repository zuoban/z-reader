package storage

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"z-reader/backend/models"
)

func TestSessionDBCacheConsistencyAndEviction(t *testing.T) {
	sdb, err := OpenSession(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("OpenSession failed: %v", err)
	}
	defer sdb.Close()

	active := &models.Session{
		Token:     "active-token",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}
	if err := sdb.SaveSession(active); err != nil {
		t.Fatalf("SaveSession failed: %v", err)
	}

	got, err := sdb.GetSession("active-token")
	if err != nil || got == nil {
		t.Fatalf("expected active session from cache, got (%v, %v)", got, err)
	}
	// Mutating the returned copy must not corrupt cached state.
	got.ExpiresAt = time.Now().UTC().Add(-time.Hour)
	gotAgain, err := sdb.GetSession("active-token")
	if err != nil || gotAgain == nil {
		t.Fatalf("expected cached session to remain valid after caller mutation, got (%v, %v)", gotAgain, err)
	}

	if err := sdb.DeleteSession("active-token"); err != nil {
		t.Fatalf("DeleteSession failed: %v", err)
	}
	if deleted, err := sdb.GetSession("active-token"); err != nil || deleted != nil {
		t.Fatalf("expected deleted session to be evicted from cache, got (%v, %v)", deleted, err)
	}

	shortLived := &models.Session{
		Token:     "short-lived",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(20 * time.Millisecond),
	}
	if err := sdb.SaveSession(shortLived); err != nil {
		t.Fatalf("SaveSession(shortLived) failed: %v", err)
	}
	time.Sleep(30 * time.Millisecond)
	if expired, err := sdb.GetSession("short-lived"); err != nil || expired != nil {
		t.Fatalf("expected expired cached session to return nil, got (%v, %v)", expired, err)
	}

	for i := 0; i < maxSessionCacheEntries+20; i++ {
		token := fmt.Sprintf("bulk-token-%d", i)
		if err := sdb.SaveSession(&models.Session{
			Token:     token,
			CreatedAt: time.Now().UTC(),
			ExpiresAt: time.Now().UTC().Add(time.Hour),
		}); err != nil {
			t.Fatalf("SaveSession(%s) failed: %v", token, err)
		}
	}
	sdb.cacheMu.RLock()
	cacheSize := len(sdb.cache)
	sdb.cacheMu.RUnlock()
	if cacheSize > maxSessionCacheEntries {
		t.Fatalf("expected cache size <= %d, got %d", maxSessionCacheEntries, cacheSize)
	}

	if err := sdb.ClearSessions(); err != nil {
		t.Fatalf("ClearSessions failed: %v", err)
	}
	if cleared, err := sdb.GetSession("bulk-token-0"); err != nil || cleared != nil {
		t.Fatalf("expected ClearSessions to purge cache and db, got (%v, %v)", cleared, err)
	}
}
