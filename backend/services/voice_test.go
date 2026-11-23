package services

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func waitForVoiceWaiters(t *testing.T, count int) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		voiceRefresh.mutex.Lock()
		call := voiceRefresh.call
		joined := call != nil && call.waiters == count
		voiceRefresh.mutex.Unlock()
		if joined {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("expected %d voice waiters", count)
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func resetVoiceState(t *testing.T) {
	t.Helper()
	clearVoiceCache()
	t.Cleanup(clearVoiceCache)
}

func TestGetVoiceListFetchesCachesAndClones(t *testing.T) {
	resetVoiceState(t)
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		if r.URL.String() != "https://eastus.api.speech.microsoft.com/cognitiveservices/voices/list" {
			t.Errorf("unexpected voice list URL: %s", r.URL.String())
		}
		return ttsResponse(http.StatusOK, `[{"Name":"v1","DisplayName":"V1","ShortName":"v1","Locale":"zh-CN","StyleList":["chat"]}]`), nil
	})

	voices, err := GetVoiceList()
	if err != nil {
		t.Fatalf("GetVoiceList error: %v", err)
	}
	if len(voices) != 1 || voices[0].ShortName != "v1" {
		t.Fatalf("unexpected voices: %+v", voices)
	}
	// Mutating returned slice must not corrupt cache.
	voices[0].ShortName = "mutated"
	voices[0].StyleList[0] = "mutated"

	cached, err := GetVoiceListContext(context.Background())
	if err != nil {
		t.Fatalf("cached GetVoiceListContext error: %v", err)
	}
	if cached[0].ShortName != "v1" || cached[0].StyleList[0] != "chat" {
		t.Fatalf("cache was mutated by caller: %+v", cached)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected 1 upstream request, got %d", requests.Load())
	}
}

func TestGetVoiceListSingleflightDeduplication(t *testing.T) {
	resetVoiceState(t)
	started := make(chan struct{})
	release := make(chan struct{})
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		if requests.Add(1) == 1 {
			close(started)
		}
		<-release
		return ttsResponse(http.StatusOK, `[{"ShortName":"shared-voice","Locale":"en-US"}]`), nil
	})

	const callers = 6
	var wg sync.WaitGroup
	errs := make(chan error, callers)
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			voices, err := GetVoiceListContext(context.Background())
			if err != nil {
				errs <- err
				return
			}
			if len(voices) != 1 || voices[0].ShortName != "shared-voice" {
				errs <- errors.New("unexpected voice payload")
			}
		}()
	}

	<-started
	waitForVoiceWaiters(t, callers)
	close(release)
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("caller failed: %v", err)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("expected 1 deduplicated upstream call, got %d", got)
	}
}

func TestGetVoiceListCancellationPreservesOtherWaiters(t *testing.T) {
	resetVoiceState(t)
	started := make(chan struct{})
	release := make(chan struct{})
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		close(started)
		select {
		case <-release:
			return ttsResponse(http.StatusOK, `[{"ShortName":"kept","Locale":"zh-CN"}]`), nil
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	})

	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() {
		_, err := GetVoiceListContext(ctx)
		first <- err
	}()
	<-started

	second := make(chan error, 1)
	go func() {
		voices, err := GetVoiceListContext(context.Background())
		if err == nil && (len(voices) != 1 || voices[0].ShortName != "kept") {
			err = errors.New("unexpected voices")
		}
		second <- err
	}()

	waitForVoiceWaiters(t, 2)
	cancel()
	if !errors.Is(<-first, context.Canceled) {
		t.Fatal("first caller did not cancel")
	}
	close(release)
	if err := <-second; err != nil {
		t.Fatalf("second caller failed after first cancelled: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected 1 shared request, got %d", requests.Load())
	}
}

func TestGetVoiceListLastWaiterCancelsUpstreamAndRetryStartsFresh(t *testing.T) {
	resetVoiceState(t)
	firstStarted := make(chan struct{})
	firstCancelled := make(chan struct{})
	releaseFirst := make(chan struct{})
	firstFinished := make(chan struct{})
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		if requests.Add(1) == 1 {
			close(firstStarted)
			<-r.Context().Done()
			close(firstCancelled)
			<-releaseFirst
			close(firstFinished)
			return nil, r.Context().Err()
		}
		return ttsResponse(http.StatusOK, `[{"ShortName":"fresh-voice","Locale":"zh-CN"}]`), nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() {
		_, err := GetVoiceListContext(ctx)
		first <- err
	}()
	<-firstStarted
	cancel()
	if !errors.Is(<-first, context.Canceled) {
		t.Fatal("expected context.Canceled")
	}
	select {
	case <-firstCancelled:
	case <-time.After(time.Second):
		t.Fatal("last waiter did not cancel upstream voice request")
	}

	voices, err := GetVoiceListContext(context.Background())
	close(releaseFirst)
	<-firstFinished
	if err != nil || len(voices) != 1 || voices[0].ShortName != "fresh-voice" {
		t.Fatalf("retry failed: voices=%+v err=%v", voices, err)
	}
	if requests.Load() != 2 {
		t.Fatalf("expected 2 requests, got %d", requests.Load())
	}
}

func TestGetVoiceListPreCancelledContextDoesNotCallUpstream(t *testing.T) {
	resetVoiceState(t)
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		return ttsResponse(http.StatusOK, `[]`), nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := GetVoiceListContext(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if requests.Load() != 0 {
		t.Fatalf("expected 0 requests, got %d", requests.Load())
	}
}

func TestGetVoiceListFallsBackToStaleCacheOrFallbackVoices(t *testing.T) {
	resetVoiceState(t)
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		return ttsResponse(http.StatusBadGateway, "upstream error"), nil
	})

	// Empty cache -> fallbackVoices
	voices, err := GetVoiceListContext(context.Background())
	if err != nil {
		t.Fatalf("unexpected error with fallback: %v", err)
	}
	if len(voices) != len(fallbackVoices) || voices[0].ShortName != fallbackVoices[0].ShortName {
		t.Fatalf("expected fallbackVoices, got %+v", voices)
	}

	// Expired stale cache -> return stale cache instead of fallback
	voiceCache.mutex.Lock()
	voiceCache.data = []Voice{{ShortName: "stale-voice", Locale: "ja-JP"}}
	voiceCache.cacheTime = time.Now().Unix() - VoiceCacheDuration - 60
	voiceCache.provider = ActiveTTSProvider().Name()
	voiceCache.mutex.Unlock()

	voices, err = GetVoiceListContext(context.Background())
	if err != nil {
		t.Fatalf("unexpected error with stale cache: %v", err)
	}
	if len(voices) != 1 || voices[0].ShortName != "stale-voice" {
		t.Fatalf("expected stale cache voices, got %+v", voices)
	}
}

func TestGetVoiceListAzureAndCustomProviders(t *testing.T) {
	t.Run("azure provider voices", func(t *testing.T) {
		resetVoiceState(t)
		t.Setenv("AZURE_TTS_KEY", "az-secret-key")
		t.Setenv("AZURE_TTS_REGION", "japaneast")
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")

		var gotURL, gotKey string
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			gotURL = r.URL.String()
			gotKey = r.Header.Get("Ocp-Apim-Subscription-Key")
			return ttsResponse(http.StatusOK, `[{"ShortName":"ja-JP-NanamiNeural","Locale":"ja-JP"}]`), nil
		})

		voices, err := GetVoiceListContext(context.Background())
		if err != nil {
			t.Fatalf("azure GetVoiceListContext error: %v", err)
		}
		if gotURL != "https://japaneast.tts.speech.microsoft.com/cognitiveservices/voices/list" {
			t.Fatalf("unexpected azure voices URL: %q", gotURL)
		}
		if gotKey != "az-secret-key" {
			t.Fatalf("unexpected azure subscription key header: %q", gotKey)
		}
		if len(voices) != 1 || voices[0].ShortName != "ja-JP-NanamiNeural" {
			t.Fatalf("unexpected azure voices: %+v", voices)
		}
	})

	t.Run("custom provider default fallback voices", func(t *testing.T) {
		resetVoiceState(t)
		t.Setenv("TTS_CUSTOM_ENDPOINT", "https://custom.example/tts")
		t.Setenv("TTS_CUSTOM_VOICES_ENDPOINT", "")

		var requests atomic.Int32
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			requests.Add(1)
			return ttsResponse(http.StatusInternalServerError, "should not be called"), nil
		})

		voices, err := GetVoiceListContext(context.Background())
		if err != nil {
			t.Fatalf("custom GetVoiceListContext error: %v", err)
		}
		if len(voices) != len(fallbackVoices) {
			t.Fatalf("expected fallback voices, got %+v", voices)
		}
		if requests.Load() != 0 {
			t.Fatalf("expected 0 HTTP requests without custom voices endpoint, got %d", requests.Load())
		}
	})

	t.Run("custom provider explicit voices endpoint", func(t *testing.T) {
		resetVoiceState(t)
		t.Setenv("TTS_CUSTOM_ENDPOINT", "https://custom.example/tts")
		t.Setenv("TTS_CUSTOM_VOICES_ENDPOINT", "https://custom.example/voices")
		t.Setenv("TTS_CUSTOM_API_KEY", "custom-tok")

		var gotURL, gotAuth string
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			gotURL = r.URL.String()
			gotAuth = r.Header.Get("Authorization")
			return ttsResponse(http.StatusOK, `[{"ShortName":"custom-v1","Locale":"en-US"}]`), nil
		})

		voices, err := GetVoiceListContext(context.Background())
		if err != nil {
			t.Fatalf("custom voices endpoint error: %v", err)
		}
		if gotURL != "https://custom.example/voices" || gotAuth != "Bearer custom-tok" {
			t.Fatalf("unexpected custom voices request: url=%q auth=%q", gotURL, gotAuth)
		}
		if len(voices) != 1 || voices[0].ShortName != "custom-v1" {
			t.Fatalf("unexpected custom voices: %+v", voices)
		}
	})

	t.Run("empty upstream voice list is not cached for 4 hours", func(t *testing.T) {
		resetVoiceState(t)
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "")
		t.Setenv("AZURE_TTS_REGION", "")

		var requests atomic.Int32
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			if requests.Add(1) == 1 {
				return ttsResponse(http.StatusOK, `[]`), nil
			}
			return ttsResponse(http.StatusOK, `[{"ShortName":"recovered-v1","Locale":"zh-CN"}]`), nil
		})

		first, err := GetVoiceListContext(context.Background())
		if err != nil {
			t.Fatalf("unexpected error on empty list: %v", err)
		}
		if len(first) != len(fallbackVoices) {
			t.Fatalf("expected fallback voices on empty upstream list, got %+v", first)
		}

		second, err := GetVoiceListContext(context.Background())
		if err != nil {
			t.Fatalf("unexpected error on retry: %v", err)
		}
		if len(second) != 1 || second[0].ShortName != "recovered-v1" {
			t.Fatalf("expected fresh fetch after empty list, got %+v", second)
		}
		if requests.Load() != 2 {
			t.Fatalf("expected 2 upstream requests, got %d", requests.Load())
		}
	})
}
