package services

import (
	"container/list"
	"testing"
	"time"
)

func TestTTSAudioCacheCopiesData(t *testing.T) {
	cache := &ttsAudioCache{
		items: make(map[string]*list.Element),
		order: list.New(),
	}

	original := []byte{1, 2, 3}
	cache.set("a", original)
	original[0] = 9

	got, ok := cache.get("a")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got[0] != 1 {
		t.Fatalf("cache stored mutable caller slice, got %d", got[0])
	}

	got[1] = 9
	gotAgain, ok := cache.get("a")
	if !ok {
		t.Fatal("expected second cache hit")
	}
	if gotAgain[1] != 2 {
		t.Fatalf("cache returned mutable internal slice, got %d", gotAgain[1])
	}
}

func TestTTSAudioCacheExpiresEntries(t *testing.T) {
	cache := &ttsAudioCache{
		items: make(map[string]*list.Element),
		order: list.New(),
	}

	cache.set("a", []byte{1})
	el := cache.items["a"]
	el.Value.(*ttsCacheEntry).expiresAt = time.Now().Add(-time.Second)

	if _, ok := cache.get("a"); ok {
		t.Fatal("expected expired cache miss")
	}
	if cache.bytes != 0 || len(cache.items) != 0 {
		t.Fatal("expected expired entry to be removed")
	}
}
