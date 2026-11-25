package storage

import (
	"fmt"
	"path/filepath"
	"sync"
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

func TestSessionDBGetSessionDoesNotResurrectRevokedSessionInCache(t *testing.T) {
	tests := []struct {
		name   string
		revoke func(t *testing.T, sdb *SessionDB, token string)
	}{
		{
			name: "DeleteSessions",
			revoke: func(t *testing.T, sdb *SessionDB, token string) {
				t.Helper()
				if err := sdb.DeleteSession(token); err != nil {
					t.Fatalf("DeleteSession failed: %v", err)
				}
			},
		},
		{
			name: "ClearSessions",
			revoke: func(t *testing.T, sdb *SessionDB, _ string) {
				t.Helper()
				if err := sdb.ClearSessions(); err != nil {
					t.Fatalf("ClearSessions failed: %v", err)
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			sdb, err := OpenSession(filepath.Join(t.TempDir(), "sessions.db"))
			if err != nil {
				t.Fatalf("OpenSession failed: %v", err)
			}
			defer sdb.Close()

			const token = "revoked-mid-read-token"
			if err := sdb.SaveSession(&models.Session{
				Token:     token,
				CreatedAt: time.Now().UTC(),
				ExpiresAt: time.Now().UTC().Add(time.Hour),
			}); err != nil {
				t.Fatalf("SaveSession failed: %v", err)
			}

			// Drop only the in-memory cache entry so GetSession must fall back to bbolt.
			sdb.cacheMu.Lock()
			delete(sdb.cache, hashToken(token))
			sdb.beforeCacheFillHook = func() {
				tc.revoke(t, sdb, token)
			}
			sdb.cacheMu.Unlock()

			// The in-flight GetSession read the session from bbolt before revocation,
			// so it may return the snapshot it read, but it must NOT re-populate sdb.cache.
			if _, err := sdb.GetSession(token); err != nil {
				t.Fatalf("in-flight GetSession failed: %v", err)
			}

			sdb.cacheMu.Lock()
			sdb.beforeCacheFillHook = nil
			_, resurrected := sdb.cache[hashToken(token)]
			sdb.cacheMu.Unlock()
			if resurrected {
				t.Fatalf("revoked session was resurrected into sdb.cache after %s", tc.name)
			}

			got, err := sdb.GetSession(token)
			if err != nil || got != nil {
				t.Fatalf("subsequent GetSession = (%+v, %v), want (nil, nil)", got, err)
			}
		})
	}
}

func TestSessionDBCleanExpiredSessionsBumpsCacheEpoch(t *testing.T) {
	sdb, err := OpenSession(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("OpenSession failed: %v", err)
	}
	defer sdb.Close()

	if err := sdb.SaveSession(&models.Session{
		Token:     "expired-token",
		CreatedAt: time.Now().UTC().Add(-2 * time.Hour),
		ExpiresAt: time.Now().UTC().Add(-time.Hour),
	}); err != nil {
		t.Fatalf("SaveSession(expired) failed: %v", err)
	}
	if err := sdb.SaveSession(&models.Session{
		Token:     "live-token",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}); err != nil {
		t.Fatalf("SaveSession(live) failed: %v", err)
	}

	sdb.cacheMu.Lock()
	epochBefore := sdb.cacheEpoch
	delete(sdb.cache, hashToken("live-token"))
	sdb.beforeCacheFillHook = func() {
		if err := sdb.CleanExpiredSessions(); err != nil {
			t.Errorf("CleanExpiredSessions failed: %v", err)
		}
	}
	sdb.cacheMu.Unlock()

	got, err := sdb.GetSession("live-token")
	if err != nil || got == nil {
		t.Fatalf("GetSession(live-token) = (%+v, %v), want active session", got, err)
	}

	sdb.cacheMu.Lock()
	sdb.beforeCacheFillHook = nil
	epochAfter := sdb.cacheEpoch
	_, cached := sdb.cache[hashToken("live-token")]
	sdb.cacheMu.Unlock()

	if epochAfter <= epochBefore {
		t.Fatalf("expected cacheEpoch to increment after CleanExpiredSessions: before=%d after=%d", epochBefore, epochAfter)
	}
	if cached {
		t.Fatal("expected GetSession not to populate cache across CleanExpiredSessions epoch bump")
	}

	// Next read succeeds and populates cache cleanly.
	got, err = sdb.GetSession("live-token")
	if err != nil || got == nil {
		t.Fatalf("second GetSession(live-token) = (%+v, %v), want active session", got, err)
	}
	sdb.cacheMu.RLock()
	_, cached = sdb.cache[hashToken("live-token")]
	sdb.cacheMu.RUnlock()
	if !cached {
		t.Fatal("expected subsequent GetSession to populate cache")
	}
}

func TestSessionDBConcurrentReadAndRevocationNoResurrection(t *testing.T) {
	sdb, err := OpenSession(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("OpenSession failed: %v", err)
	}
	defer sdb.Close()

	for round := 0; round < 30; round++ {
		token := fmt.Sprintf("concurrent-token-%d", round)
		if err := sdb.SaveSession(&models.Session{
			Token:     token,
			CreatedAt: time.Now().UTC(),
			ExpiresAt: time.Now().UTC().Add(time.Hour),
		}); err != nil {
			t.Fatalf("SaveSession failed: %v", err)
		}
		// Force bbolt reads from concurrent readers.
		sdb.cacheMu.Lock()
		delete(sdb.cache, hashToken(token))
		sdb.cacheMu.Unlock()

		start := make(chan struct{})
		var wg sync.WaitGroup
		const readers = 8
		for i := 0; i < readers; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				_, err := sdb.GetSession(token)
				if err != nil {
					t.Errorf("GetSession failed: %v", err)
				}
			}()
		}

		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if round%2 == 0 {
				if err := sdb.DeleteSession(token); err != nil {
					t.Errorf("DeleteSession failed: %v", err)
				}
			} else {
				if err := sdb.ClearSessions(); err != nil {
					t.Errorf("ClearSessions failed: %v", err)
				}
			}
		}()

		close(start)
		wg.Wait()

		got, err := sdb.GetSession(token)
		if err != nil || got != nil {
			t.Fatalf("round %d: revoked session resurrected: got (%+v, %v), want (nil, nil)", round, got, err)
		}
	}
}
