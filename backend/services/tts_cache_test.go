package services

import (
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestTTSAudioCacheCopiesData(t *testing.T) {
	cache := newTTSAudioCache(ttsCacheConfig{})

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

func TestAcquireTTSSlotTimesOutWhenConcurrencyIsFull(t *testing.T) {
	runtime := newTTSRuntimeState(ttsCacheConfig{
		MaxConcurrent: 1,
		MaxQueued:     1,
		QueueWait:     10 * time.Millisecond,
	})
	release, err := acquireTTSSlot(runtime)
	if err != nil {
		t.Fatalf("failed to acquire initial TTS slot: %v", err)
	}
	defer release()

	_, err = acquireTTSSlot(runtime)
	if !errors.Is(err, ErrTTSBusy) {
		t.Fatalf("expected busy error after queue timeout, got %v", err)
	}
}

func TestTTSAudioCacheExpiresEntries(t *testing.T) {
	cache := newTTSAudioCache(ttsCacheConfig{})

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

func TestTTSQueueMetricsSnapshotAndPrometheusOutput(t *testing.T) {
	runtime := newTTSRuntimeState(ttsCacheConfig{
		MaxConcurrent: 2,
		MaxQueued:     3,
	})
	runtime.semaphore <- struct{}{}
	runtime.queue <- struct{}{}
	runtime.queue <- struct{}{}

	previous := ttsRuntime.state.Load()
	ttsRuntime.state.Store(runtime)
	t.Cleanup(func() { ttsRuntime.state.Store(previous) })

	metrics, ok := TTSQueueMetricsSnapshot()
	if !ok {
		t.Fatal("expected initialized TTS queue metrics")
	}
	if metrics.Active != 1 || metrics.Queued != 1 ||
		metrics.QueueCapacity != 3 || metrics.ConcurrencyLimit != 2 {
		t.Fatalf("unexpected TTS queue metrics: %#v", metrics)
	}

	var output strings.Builder
	AppendTTSPrometheus(&output)
	body := output.String()
	for _, expected := range []string{
		"z_reader_tts_active_syntheses 1",
		"z_reader_tts_queue_depth 1",
		"z_reader_tts_queue_capacity 3",
		"z_reader_tts_concurrency_limit 2",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected metric %q in output: %s", expected, body)
		}
	}
}

func TestConcurrentDiskCacheWritesPublishCompleteAudio(t *testing.T) {
	config := ttsCacheConfig{Dir: t.TempDir(), MaxBytes: 4096, MaxItems: 8, TTL: time.Hour}
	const key = "audio"
	first := strings.Repeat("a", 512)
	second := strings.Repeat("b", 1024)
	var group sync.WaitGroup
	for _, audio := range []string{first, second} {
		group.Go(func() {
			if err := writeDiskTTSCache(config, key, []byte(audio)); err != nil {
				t.Error(err)
			}
		})
	}
	group.Wait()
	if audio, ok := readDiskTTSCache(config, key); !ok || (string(audio) != first && string(audio) != second) {
		t.Fatal("expected a complete cached audio response")
	}
	entries, err := os.ReadDir(config.Dir)
	if err != nil || len(entries) != 1 || entries[0].Name() != "audio.audio" {
		t.Fatal("expected only the published audio file in the cache")
	}
}

func TestSharedHTTPClientStopsAtProviderRedirect(t *testing.T) {
	client := *sharedHTTPClient
	calls := 0
	client.Transport = ttsRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		response := ttsResponse(http.StatusTemporaryRedirect, "")
		response.Header = http.Header{"Location": {"https://speech.example/v2"}}
		return response, nil
	})
	response, err := client.Get("https://speech.example/v1")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusTemporaryRedirect || calls != 1 {
		t.Fatal("expected the original provider response without a second request")
	}
}

func TestReadDiskTTSCacheSkipsFreshChtimesAndUpdatesStaleFile(t *testing.T) {
	config := ttsCacheConfig{Dir: t.TempDir(), MaxBytes: 4096, MaxItems: 8, TTL: time.Hour}
	const key = "fresh-touch"
	payload := []byte("cached-audio-bytes")
	if err := writeDiskTTSCacheFile(config, key, payload); err != nil {
		t.Fatalf("write disk cache failed: %v", err)
	}

	path := diskTTSCachePath(config, key)
	freshTime := time.Now().Add(-30 * time.Second).Truncate(time.Second)
	if err := os.Chtimes(path, freshTime, freshTime); err != nil {
		t.Fatalf("set fresh mtime failed: %v", err)
	}
	if got, ok := readDiskTTSCache(config, key); !ok || string(got) != string(payload) {
		t.Fatalf("expected fresh disk cache hit, got %q ok=%v", got, ok)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat fresh file failed: %v", err)
	}
	if !info.ModTime().Equal(freshTime) {
		t.Fatalf("expected fresh file mtime to stay %v, got %v", freshTime, info.ModTime())
	}

	staleTime := time.Now().Add(-15 * time.Minute).Truncate(time.Second)
	if err := os.Chtimes(path, staleTime, staleTime); err != nil {
		t.Fatalf("set stale mtime failed: %v", err)
	}
	if got, ok := readDiskTTSCache(config, key); !ok || string(got) != string(payload) {
		t.Fatalf("expected stale disk cache hit, got %q ok=%v", got, ok)
	}
	info, err = os.Stat(path)
	if err != nil {
		t.Fatalf("stat stale file failed: %v", err)
	}
	if !info.ModTime().After(staleTime) {
		t.Fatalf("expected stale file mtime to refresh beyond %v, got %v", staleTime, info.ModTime())
	}
}
