package services

import (
	"errors"
	"strings"
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
