package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type ttsRoundTripFunc func(*http.Request) (*http.Response, error)

func (f ttsRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func installTTSTestRuntime(t *testing.T, transport ttsRoundTripFunc) *ttsRuntimeState {
	t.Helper()
	previousClient := sharedHTTPClient
	sharedHTTPClient = &http.Client{Transport: transport}
	previousRuntime := getTTSRuntime()
	runtime := newTTSRuntimeState(ttsCacheConfig{MaxConcurrent: 1, MaxQueued: 2, MaxBytes: 1024, MaxItems: 8, TTL: time.Hour})
	ttsRuntime.state.Store(runtime)
	endpointCache.mutex.Lock()
	previousEndpoint := endpointCache.data
	endpointCache.data = &EndpointCache{Endpoint: "test", Token: "secret", ExpiredAt: time.Now().Add(time.Hour).Unix()}
	endpointCache.mutex.Unlock()
	t.Cleanup(func() {
		runtime.waitDiskWrites()
		sharedHTTPClient = previousClient
		ttsRuntime.state.Store(previousRuntime)
		endpointCache.mutex.Lock()
		endpointCache.data = previousEndpoint
		endpointCache.mutex.Unlock()
	})
	return runtime
}

func ttsResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func TestTTSMalformedSSMLDoesNotRefreshCredentials(t *testing.T) {
	var calls atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		return ttsResponse(http.StatusBadRequest, "private provider body secret"), nil
	})
	_, err := GenerateAudioFromSsmlContext(context.Background(), "<speak>bad</speak>", "mp3")
	if err == nil {
		t.Fatal("expected invalid SSML error")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("malformed SSML must not refresh credentials: got %d provider requests", got)
	}
	if strings.Contains(err.Error(), "private provider body") {
		t.Fatalf("provider body leaked: %v", err)
	}
}

func TestTTSSynthesisBudgetIncludesQueueWait(t *testing.T) {
	deadlineRemaining := make(chan time.Duration, 1)
	runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		deadline, ok := r.Context().Deadline()
		if !ok {
			return nil, errors.New("missing synthesis deadline")
		}
		deadlineRemaining <- time.Until(deadline)
		return ttsResponse(http.StatusOK, "audio"), nil
	})
	release, err := acquireTTSSlot(runtime)
	if err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { _, err := GenerateAudioFromSsmlContext(context.Background(), "budget", "mp3"); result <- err }()
	time.Sleep(50 * time.Millisecond)
	release()
	if err := <-result; err != nil {
		t.Fatal(err)
	}
	if remaining := <-deadlineRemaining; remaining > 55*time.Second-40*time.Millisecond {
		t.Fatalf("queue wait did not consume 55s synthesis budget: %v remains", remaining)
	}
}

func TestTTSRecoverySynthesizesDespiteMemoryAndDiskHits(t *testing.T) {
	var calls atomic.Int32
	runtime := installTTSTestRuntime(t, func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return ttsResponse(http.StatusOK, "fresh audio"), nil
	})
	runtime.config.Dir = t.TempDir()
	const ssml, format = "<speak>same passage</speak>", "mp3"
	key := ttsCacheKey(ActiveTTSProvider().Name(), ssml, format)
	runtime.cache.set(key, []byte("memory audio"))
	if err := writeDiskTTSCache(runtime.config, key, []byte("disk audio")); err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	data, err := RefreshAudioFromSsmlContext(ctx, ssml, format)
	if err != nil || string(data) != "fresh audio" || calls.Load() != 1 {
		t.Fatalf("refresh: got %q, %v after %d provider calls", data, err, calls.Load())
	}
	data, err = GenerateAudioFromSsmlContext(ctx, ssml, format)
	if err != nil || string(data) != "memory audio" || calls.Load() != 1 {
		t.Fatalf("normal request: got %q, %v after %d provider calls", data, err, calls.Load())
	}
	if data, ok := readDiskTTSCache(runtime.config, key); !ok || string(data) != "disk audio" {
		t.Fatalf("disk cache after refresh: got %q, found %v", data, ok)
	}
}

func TestTTSCancelledInflightIsNotReusedByImmediateRetry(t *testing.T) {
	var calls atomic.Int32
	firstStarted := make(chan struct{})
	cancelled := make(chan struct{})
	releaseFirst := make(chan struct{})
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		if calls.Add(1) == 1 {
			close(firstStarted)
			<-r.Context().Done()
			close(cancelled)
			<-releaseFirst
			return nil, r.Context().Err()
		}
		return ttsResponse(http.StatusOK, "retry audio"), nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	firstDone := make(chan error, 1)
	go func() { _, err := GenerateAudioFromSsmlContext(ctx, "cancelled", "mp3"); firstDone <- err }()
	<-firstStarted
	cancel()
	if !errors.Is(<-firstDone, context.Canceled) {
		t.Fatal("expected waiter cancellation")
	}
	<-cancelled
	retryDone := make(chan error, 1)
	go func() {
		data, err := GenerateAudioFromSsmlContext(context.Background(), "cancelled", "mp3")
		if err == nil && string(data) != "retry audio" {
			err = errors.New("wrong retry audio")
		}
		retryDone <- err
	}()
	time.Sleep(10 * time.Millisecond)
	close(releaseFirst)
	if err := <-retryDone; err != nil {
		t.Fatalf("immediate retry reused cancelled work: %v", err)
	}
}

func TestTTSOneCancelledWaiterDoesNotCancelOthers(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		close(started)
		select {
		case <-release:
			return ttsResponse(http.StatusOK, "audio"), nil
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	})
	ctx, cancel := context.WithCancel(context.Background())
	firstDone := make(chan error, 1)
	go func() { _, err := GenerateAudioFromSsmlContext(ctx, "shared", "mp3"); firstDone <- err }()
	<-started
	secondDone := make(chan error, 1)
	go func() {
		_, err := GenerateAudioFromSsmlContext(context.Background(), "shared", "mp3")
		secondDone <- err
	}()
	key := ttsCacheKey(ActiveTTSProvider().Name(), "shared", "mp3")
	timeout := time.After(time.Second)
	for {
		ttsInflight.mutex.Lock()
		waiters := ttsInflight.calls[key].waiters.Load()
		ttsInflight.mutex.Unlock()
		if waiters == 2 {
			break
		}
		select {
		case <-timeout:
			t.Fatal("second waiter did not join")
		default:
			time.Sleep(time.Millisecond)
		}
	}
	cancel()
	if !errors.Is(<-firstDone, context.Canceled) {
		t.Fatal("expected cancellation")
	}
	close(release)
	if err := <-secondDone; err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected shared synthesis, got %d calls", calls.Load())
	}
}

func TestTTSEndpointWaitRespectsCallerDeadline(t *testing.T) {
	endpointFinished := make(chan struct{})
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		select {
		case <-r.Context().Done():
			close(endpointFinished)
			return nil, r.Context().Err()
		case <-time.After(200 * time.Millisecond):
			close(endpointFinished)
			return ttsResponse(http.StatusServiceUnavailable, "private endpoint response"), nil
		}
	})
	clearEndpointCache()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := callTTSAPI(ctx, "endpoint deadline", "mp3")
	if elapsed := time.Since(start); elapsed > 100*time.Millisecond {
		t.Errorf("caller waited %v for an endpoint after its deadline", elapsed)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected deadline, got %v", err)
	}
	<-endpointFinished
}

func TestTTSAuthenticationRefreshIsBounded(t *testing.T) {
	var synthesisCalls, refreshCalls atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == "dev.microsofttranslator.com" {
			refreshCalls.Add(1)
			return ttsResponse(http.StatusOK, `{"r":"test","t":"x.eyJleHAiOjQxMDI0NDQ4MDB9.x"}`), nil
		}
		synthesisCalls.Add(1)
		return ttsResponse(http.StatusForbidden, "credential secret response"), nil
	})
	_, err := GenerateAudioFromSsmlContext(context.Background(), "auth", "mp3")
	if err == nil {
		t.Fatal("expected authentication failure")
	}
	if synthesisCalls.Load() != 2 || refreshCalls.Load() != 1 {
		t.Fatalf("expected one bounded credential refresh, synthesis=%d refresh=%d", synthesisCalls.Load(), refreshCalls.Load())
	}
	if strings.Contains(err.Error(), "credential secret") {
		t.Fatalf("provider body leaked: %v", err)
	}
}

func TestTTSPrometheusReportsCacheHitsAndDurations(t *testing.T) {
	runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		return ttsResponse(http.StatusOK, "audio"), nil
	})
	runtime.config.Dir = t.TempDir()
	for i := 0; i < 3; i++ {
		if i == 2 {
			runtime.waitDiskWrites()
			runtime.cache = newTTSAudioCache(runtime.config)
		}
		if _, err := GenerateAudioFromSsmlContext(context.Background(), "metric cache", "mp3"); err != nil {
			t.Fatal(err)
		}
	}
	var output strings.Builder
	AppendTTSPrometheus(&output)
	for _, expected := range []string{
		`z_reader_tts_cache_requests_total{layer="memory",result="hit"} 1`,
		`z_reader_tts_cache_requests_total{layer="memory",result="miss"} 2`,
		`z_reader_tts_cache_requests_total{layer="disk",result="hit"} 1`,
		`z_reader_tts_cache_requests_total{layer="disk",result="miss"} 1`,
		`z_reader_tts_requests_total{result="success"} 3`,
		`z_reader_tts_queue_wait_seconds_count 1`,
		`z_reader_tts_synthesis_duration_seconds_count 1`,
		`z_reader_tts_synthesis_duration_seconds_bucket{le="+Inf"} 1`,
	} {
		if !strings.Contains(output.String(), expected) {
			t.Errorf("missing %q in metrics:\n%s", expected, output.String())
		}
	}
	if strings.Contains(output.String(), "metric cache") || strings.Contains(output.String(), "secret") {
		t.Fatal("private request data in metrics")
	}
}

func TestTTSPrometheusReportsFailureCancellationAndBusy(t *testing.T) {
	cancelStarted := make(chan struct{})
	cancelFinished := make(chan struct{})
	runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		if string(body) == "metric cancel" {
			close(cancelStarted)
			<-r.Context().Done()
			close(cancelFinished)
			return nil, r.Context().Err()
		}
		return ttsResponse(http.StatusInternalServerError, "private"), nil
	})
	if _, err := GenerateAudioFromSsmlContext(context.Background(), "metric failure", "mp3"); err == nil {
		t.Fatal("expected failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := GenerateAudioFromSsmlContext(ctx, "metric cancel", "mp3"); done <- err }()
	<-cancelStarted
	cancel()
	<-done
	<-cancelFinished
	// Wait for the cancelled synthesis to release its semaphore before occupying it.
	deadline := time.After(time.Second)
	for len(runtime.semaphore) != 0 {
		select {
		case <-deadline:
			t.Fatal("synthesis did not release slot")
		default:
			time.Sleep(time.Millisecond)
		}
	}
	runtime.config.QueueWait = time.Millisecond
	release, err := acquireTTSSlot(runtime)
	if err != nil {
		t.Fatal(err)
	}
	_, err = GenerateAudioFromSsmlContext(context.Background(), "metric busy", "mp3")
	release()
	if !IsTTSBusy(err) {
		t.Fatalf("expected busy, got %v", err)
	}
	var output strings.Builder
	AppendTTSPrometheus(&output)
	for _, result := range []string{"failure", "cancelled", "busy"} {
		expected := `z_reader_tts_requests_total{result="` + result + `"} 1`
		if !strings.Contains(output.String(), expected) {
			t.Errorf("missing %q in metrics:\n%s", expected, output.String())
		}
	}
}

func TestTTSPrometheusDoesNotInitializeRuntime(t *testing.T) {
	previous := ttsRuntime.state.Load()
	ttsRuntime.state.Store(nil)
	defer ttsRuntime.state.Store(previous)
	var output strings.Builder
	AppendTTSPrometheus(&output)
	if output.Len() != 0 || ttsRuntime.state.Load() != nil {
		t.Fatal("metrics initialized unused TTS runtime")
	}
}

func TestTTSFailureStatusesAndRetryAfter(t *testing.T) {
	cases := []struct {
		name                string
		provider            int
		retry               string
		status              int
		code, expectedRetry string
	}{
		{"invalid SSML", 400, "", 400, "invalid_ssml", ""},
		{"invalid SSML 422", 422, "", 422, "invalid_ssml", ""},
		{"rate limited", 429, "7", 429, "rate_limited", "7"},
		{"rate limit untrusted header", 429, "private arbitrary text", 429, "rate_limited", "30"},
		{"rate limit clamp", 429, "99999", 429, "rate_limited", "300"},
		{"provider unavailable", 503, "4", 503, "unavailable", "4"},
		{"provider bad gateway", 500, "", 502, "unavailable", ""},
		{"provider timeout", 504, "", 504, "unavailable", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
				resp := ttsResponse(tc.provider, "secret provider response")
				resp.Header.Set("Retry-After", tc.retry)
				return resp, nil
			})
			_, err := GenerateAudioFromSsmlContext(context.Background(), tc.name, "mp3")
			failure := TTSHTTPError(err)
			if failure.StatusCode != tc.status || failure.Kind != tc.code || failure.RetryAfter != tc.expectedRetry {
				t.Fatalf("unexpected failure %#v", failure)
			}
			if strings.Contains(failure.Error(), "secret") {
				t.Fatal("private response exposed")
			}
		})
	}
}

func TestTTSPrometheusIsSafeDuringConcurrentRequests(t *testing.T) {
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) { return ttsResponse(http.StatusOK, "audio"), nil })
	var workers sync.WaitGroup
	for i := 0; i < 20; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			if _, err := GenerateAudioFromSsmlContext(context.Background(), "concurrent metric", "mp3"); err != nil {
				t.Errorf("synthesis: %v", err)
			}
		}()
	}
	done := make(chan struct{})
	go func() { workers.Wait(); close(done) }()
	for {
		var output strings.Builder
		AppendTTSPrometheus(&output)
		select {
		case <-done:
			output.Reset()
			AppendTTSPrometheus(&output)
			if !strings.Contains(output.String(), `z_reader_tts_requests_total{result="success"} 20`) {
				t.Fatalf("lost concurrent results: %s", output.String())
			}
			return
		default:
		}
	}
}

type ttsTestTimeoutError struct{}

func (ttsTestTimeoutError) Error() string { return "private provider timeout" }
func (ttsTestTimeoutError) Timeout() bool { return true }

func TestTTSNetworkTimeoutIsClassifiedAsDeadline(t *testing.T) {
	failure := TTSHTTPError(ttsTestTimeoutError{})
	if failure.StatusCode != http.StatusGatewayTimeout || failure.Kind != "deadline" {
		t.Fatalf("network timeout is not actionable deadline: %#v", failure)
	}
}

func TestActiveTTSProviderSelection(t *testing.T) {
	t.Run("default microsoft translator", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "")
		t.Setenv("AZURE_TTS_REGION", "")
		p := ActiveTTSProvider()
		if p.Name() != "microsoft_translator" {
			t.Fatalf("expected default provider, got %q", p.Name())
		}
	})

	t.Run("partial azure env falls back to default", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "only-key")
		t.Setenv("AZURE_TTS_REGION", "")
		if p := ActiveTTSProvider(); p.Name() != "microsoft_translator" {
			t.Fatalf("expected default provider when region missing, got %q", p.Name())
		}
	})

	t.Run("azure provider when key and region set", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "az-key")
		t.Setenv("AZURE_TTS_REGION", "eastus")
		if p := ActiveTTSProvider(); p.Name() != "azure:eastus" {
			t.Fatalf("expected azure provider, got %q", p.Name())
		}
	})

	t.Run("custom provider overrides azure", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "https://tts.local/v1")
		t.Setenv("AZURE_TTS_KEY", "az-key")
		t.Setenv("AZURE_TTS_REGION", "eastus")
		if p := ActiveTTSProvider(); p.Name() != "custom:https://tts.local/v1" {
			t.Fatalf("expected custom provider, got %q", p.Name())
		}
	})
}

func TestDefaultProviderRetriesOnceOnAuthErrors(t *testing.T) {
	t.Setenv("TTS_CUSTOM_ENDPOINT", "")
	t.Setenv("AZURE_TTS_KEY", "")
	t.Setenv("AZURE_TTS_REGION", "")

	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var synthCalls, endpointCalls atomic.Int32
			installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
				if strings.Contains(r.URL.Host, "dev.microsofttranslator.com") {
					endpointCalls.Add(1)
					return ttsResponse(http.StatusOK, `{"r":"refreshed","t":"x.eyJleHAiOjQxMDI0NDQ4MDB9.x"}`), nil
				}
				if synthCalls.Add(1) == 1 {
					return ttsResponse(status, "expired token"), nil
				}
				if r.Header.Get("Authorization") != "x.eyJleHAiOjQxMDI0NDQ4MDB9.x" {
					t.Errorf("retry did not use refreshed token: %q", r.Header.Get("Authorization"))
				}
				return ttsResponse(http.StatusOK, "refreshed-audio"), nil
			})

			audio, err := GenerateAudioFromSsml("<speak>retry-"+http.StatusText(status)+"</speak>", "mp3")
			if err != nil {
				t.Fatalf("expected retry to succeed, got %v", err)
			}
			if string(audio) != "refreshed-audio" {
				t.Fatalf("unexpected audio %q", string(audio))
			}
			if synthCalls.Load() != 2 || endpointCalls.Load() != 1 {
				t.Fatalf("expected 2 synthesis calls and 1 endpoint refresh, got synth=%d endpoint=%d",
					synthCalls.Load(), endpointCalls.Load())
			}
		})
	}

	t.Run("stops after single retry on persistent 401", func(t *testing.T) {
		var synthCalls atomic.Int32
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			if strings.Contains(r.URL.Host, "dev.microsofttranslator.com") {
				return ttsResponse(http.StatusOK, `{"r":"refreshed","t":"x.eyJleHAiOjQxMDI0NDQ4MDB9.x"}`), nil
			}
			synthCalls.Add(1)
			return ttsResponse(http.StatusUnauthorized, "still unauthorized"), nil
		})
		_, err := GenerateAudioFromSsmlContext(context.Background(), "<speak>always-401</speak>", "mp3")
		failure := TTSHTTPError(err)
		if failure.Kind != "authentication" || failure.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("unexpected error mapping: %#v", failure)
		}
		if synthCalls.Load() != 2 {
			t.Fatalf("expected exactly 2 attempts (initial + 1 retry), got %d", synthCalls.Load())
		}
	})
}

func TestAzureAndCustomProviderSynthesis(t *testing.T) {
	t.Run("azure synthesis", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "my-azure-key")
		t.Setenv("AZURE_TTS_REGION", "westus2")

		var gotURL, gotKey, gotFormat, gotBody string
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			gotURL = r.URL.String()
			gotKey = r.Header.Get("Ocp-Apim-Subscription-Key")
			gotFormat = r.Header.Get("X-Microsoft-OutputFormat")
			b, _ := io.ReadAll(r.Body)
			gotBody = string(b)
			return ttsResponse(http.StatusOK, "azure-mp3-bytes"), nil
		})

		audio, err := GenerateAudioFromText("你好世界", "zh-CN-XiaoxiaoNeural", "0", "0", "general", "audio-24khz-48kbitrate-mono-mp3")
		if err != nil {
			t.Fatalf("azure GenerateAudioFromText error: %v", err)
		}
		if string(audio) != "azure-mp3-bytes" {
			t.Fatalf("unexpected audio: %q", string(audio))
		}
		if gotURL != "https://westus2.tts.speech.microsoft.com/cognitiveservices/v1" {
			t.Fatalf("unexpected azure URL: %q", gotURL)
		}
		if gotKey != "my-azure-key" || gotFormat != "audio-24khz-48kbitrate-mono-mp3" || !strings.Contains(gotBody, "你好世界") {
			t.Fatalf("unexpected azure request: key=%q format=%q body=%q", gotKey, gotFormat, gotBody)
		}
	})

	t.Run("custom synthesis with bearer auth", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "https://tts.custom.internal/synthesize")
		t.Setenv("TTS_CUSTOM_API_KEY", "secret-api-key")

		var gotURL, gotAuth, gotFormat string
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			gotURL = r.URL.String()
			gotAuth = r.Header.Get("Authorization")
			gotFormat = r.Header.Get("X-Microsoft-OutputFormat")
			return ttsResponse(http.StatusOK, "custom-audio"), nil
		})

		audio, err := GenerateAudioFromSsmlContext(context.Background(), "<speak>hello custom</speak>", "audio-16khz-32kbitrate-mono-mp3")
		if err != nil {
			t.Fatalf("custom synthesis error: %v", err)
		}
		if string(audio) != "custom-audio" {
			t.Fatalf("unexpected audio: %q", string(audio))
		}
		if gotURL != "https://tts.custom.internal/synthesize" || gotAuth != "Bearer secret-api-key" || gotFormat != "audio-16khz-32kbitrate-mono-mp3" {
			t.Fatalf("unexpected custom request: url=%q auth=%q format=%q", gotURL, gotAuth, gotFormat)
		}
	})

	t.Run("custom synthesis without api key maps errors", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "https://tts.custom.internal/synthesize")
		t.Setenv("TTS_CUSTOM_API_KEY", "")

		var gotAuth string
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			gotAuth = r.Header.Get("Authorization")
			return ttsResponse(http.StatusTooManyRequests, "slow down"), nil
		})

		_, err := GenerateAudioFromSsmlContext(context.Background(), "<speak>rate-limited</speak>", "mp3")
		failure := TTSHTTPError(err)
		if gotAuth != "" {
			t.Fatalf("expected empty Authorization header, got %q", gotAuth)
		}
		if failure.Kind != "rate_limited" || failure.StatusCode != http.StatusTooManyRequests || failure.RetryAfter != "30" {
			t.Fatalf("unexpected error mapping: %#v", failure)
		}
	})
}

func TestTTSErrorMessagesUnwrapAndRetryAfterDates(t *testing.T) {
	rootCause := errors.New("root cause")
	for _, kind := range []string{"invalid_ssml", "authentication", "rate_limited", "busy", "deadline", "cancelled", "unavailable"} {
		err := &TTSError{Kind: kind, cause: rootCause}
		if err.Error() == "" {
			t.Fatalf("empty Error() message for kind %q", kind)
		}
		if !errors.Is(err, rootCause) {
			t.Fatalf("Unwrap failed for kind %q", kind)
		}
	}

	if got := TTSHTTPError(context.Canceled); got.Kind != "cancelled" || got.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("unexpected canceled mapping: %#v", got)
	}
	if got := TTSHTTPError(context.DeadlineExceeded); got.Kind != "deadline" || got.StatusCode != http.StatusGatewayTimeout {
		t.Fatalf("unexpected deadline mapping: %#v", got)
	}

	futureDate := time.Now().UTC().Add(15 * time.Second).Format(http.TimeFormat)
	if got := sanitizeTTSRetryAfter(futureDate); got == "" {
		t.Fatalf("expected positive delta seconds for future HTTP-date %q", futureDate)
	}
	pastDate := time.Now().UTC().Add(-15 * time.Second).Format(http.TimeFormat)
	if got := sanitizeTTSRetryAfter(pastDate); got != "" {
		t.Fatalf("expected empty string for past HTTP-date, got %q", got)
	}
	if got := sanitizeTTSRetryAfter("-5"); got != "" {
		t.Fatalf("expected empty string for negative delta, got %q", got)
	}
}

func TestTTSRejectsNonAudioSuccessBeforeCaching(t *testing.T) {
	const ssml, format = "<speak>cache validation</speak>", "raw-24khz-16bit-mono-pcm"
	const pcm = "\x00\x00\xff\x7f\x00\x80\x20\x20"
	for _, tc := range []struct {
		name, contentType, body string
	}{
		{name: "empty", contentType: "audio/pcm"},
		{name: "declared JSON", contentType: "Application/Problem+JSON; charset=utf-8", body: "upstream error"},
		{name: "declared HTML", contentType: "text/html; charset=utf-8", body: "upstream error"},
		{name: "JSON as binary", contentType: "application/octet-stream", body: "\xef\xbb\xbf \n{\"error\":\"upstream error\"}"},
		{name: "HTML without content type", body: "\n<!DOCTYPE html><html><body>upstream error</body></html>"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, provider := range []string{"translator", "custom"} {
				t.Run(provider, func(t *testing.T) {
					t.Setenv("TTS_CUSTOM_ENDPOINT", "")
					t.Setenv("AZURE_TTS_KEY", "")
					t.Setenv("AZURE_TTS_REGION", "")
					if provider == "custom" {
						t.Setenv("TTS_CUSTOM_ENDPOINT", "https://tts.example.test/synthesize")
					}
					var calls atomic.Int32
					runtime := installTTSTestRuntime(t, func(*http.Request) (*http.Response, error) {
						contentType, body := "application/octet-stream", pcm
						if calls.Add(1) == 1 {
							contentType, body = tc.contentType, tc.body
						}
						resp := ttsResponse(http.StatusOK, body)
						if contentType != "" {
							resp.Header.Set("Content-Type", contentType)
						}
						return resp, nil
					})
					runtime.config.Dir = t.TempDir()
					key := ttsCacheKey(ActiveTTSProvider().Name(), ssml, format)

					data, err := GenerateAudioFromSsml(ssml, format)
					var failure *TTSError
					if data != nil || !errors.As(err, &failure) || failure.StatusCode != http.StatusBadGateway || failure.Kind != "unavailable" {
						t.Fatalf("invalid audio: got %q, %v; want unavailable (502)", data, err)
					}
					if _, ok := runtime.cache.get(key); ok {
						t.Fatal("invalid audio entered the memory cache")
					}
					if _, ok := readDiskTTSCache(runtime.config, key); ok {
						t.Fatal("invalid audio entered the disk cache")
					}

					for range 2 {
						data, err = GenerateAudioFromSsml(ssml, format)
						if err != nil || string(data) != pcm {
							t.Fatalf("binary PCM: got %q, %v; want %q", data, err, pcm)
						}
					}
					if got := calls.Load(); got != 2 {
						t.Fatalf("provider calls = %d, want 2", got)
					}
					runtime.waitDiskWrites()
					if data, ok := readDiskTTSCache(runtime.config, key); !ok || string(data) != pcm {
						t.Fatalf("binary PCM disk cache: got %q, found %v", data, ok)
					}
				})
			}
		})
	}
}

func TestTTSCacheSeparatesProvidersAndBoundsResponseSize(t *testing.T) {
	t.Run("switching provider does not reuse audio cached by previous provider", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "")
		t.Setenv("AZURE_TTS_REGION", "")

		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			if r.Header.Get("Ocp-Apim-Subscription-Key") == "azure-key" {
				return ttsResponse(http.StatusOK, "azure-audio"), nil
			}
			return ttsResponse(http.StatusOK, "default-audio"), nil
		})

		first, err := GenerateAudioFromSsmlContext(context.Background(), "<speak>same text</speak>", "mp3")
		if err != nil || string(first) != "default-audio" {
			t.Fatalf("unexpected default provider audio: %q err=%v", string(first), err)
		}

		t.Setenv("AZURE_TTS_KEY", "azure-key")
		t.Setenv("AZURE_TTS_REGION", "eastus")
		second, err := GenerateAudioFromSsmlContext(context.Background(), "<speak>same text</speak>", "mp3")
		if err != nil || string(second) != "azure-audio" {
			t.Fatalf("expected azure provider audio after switch, got %q err=%v", string(second), err)
		}
	})

	t.Run("partial azure config falls back to default provider", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "only-key")
		t.Setenv("AZURE_TTS_REGION", "")

		if got := ActiveTTSProvider().Name(); got != "microsoft_translator" {
			t.Fatalf("expected fallback provider, got %q", got)
		}
	})

	t.Run("readBoundedBody rejects oversized upstream payload", func(t *testing.T) {
		if _, err := readBoundedBody(strings.NewReader("123456"), 5); err == nil {
			t.Fatal("expected error for oversized body")
		}
		data, err := readBoundedBody(strings.NewReader("12345"), 5)
		if err != nil || string(data) != "12345" {
			t.Fatalf("unexpected bounded read result: %q err=%v", string(data), err)
		}
	})
}

func TestWaitTTSDiskWrites(t *testing.T) {
	t.Run("returns nil when runtime is not initialized", func(t *testing.T) {
		previous := ttsRuntime.state.Swap(nil)
		t.Cleanup(func() { ttsRuntime.state.Store(previous) })

		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := WaitTTSDiskWrites(ctx); err != nil {
			t.Fatalf("WaitTTSDiskWrites(nil runtime) = %v, want nil", err)
		}
		if ttsRuntime.state.Load() != nil {
			t.Fatal("WaitTTSDiskWrites should not initialize ttsRuntime")
		}
	})

	t.Run("waits for pending disk writes to complete", func(t *testing.T) {
		runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusOK, "audio"), nil
		})

		var finished atomic.Bool
		runtime.diskWG.Add(1)
		go func() {
			time.Sleep(30 * time.Millisecond)
			finished.Store(true)
			runtime.diskWG.Done()
		}()

		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := WaitTTSDiskWrites(ctx); err != nil {
			t.Fatalf("WaitTTSDiskWrites() = %v, want nil", err)
		}
		if !finished.Load() {
			t.Fatal("WaitTTSDiskWrites returned before pending disk write finished")
		}
	})

	t.Run("returns context error on timeout", func(t *testing.T) {
		runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusOK, "audio"), nil
		})

		unblock := make(chan struct{})
		runtime.diskWG.Add(1)
		go func() {
			defer runtime.diskWG.Done()
			<-unblock
		}()
		t.Cleanup(func() { close(unblock) })

		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
		defer cancel()
		err := WaitTTSDiskWrites(ctx)
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("WaitTTSDiskWrites(timeout) = %v, want context.DeadlineExceeded", err)
		}
	})

	t.Run("rejects new disk writes safely while shutting down under concurrency", func(t *testing.T) {
		runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusOK, "audio-bytes"), nil
		})
		runtime.config.Dir = t.TempDir()
		runtime.config.MaxConcurrent = 8
		runtime.config.MaxQueued = 32
		runtime.semaphore = make(chan struct{}, runtime.config.MaxConcurrent)
		runtime.queue = make(chan struct{}, runtime.config.MaxConcurrent+runtime.config.MaxQueued)

		start := make(chan struct{})
		var writers sync.WaitGroup
		for i := 0; i < 16; i++ {
			writers.Add(1)
			go func(idx int) {
				defer writers.Done()
				<-start
				for j := 0; j < 20; j++ {
					if runtime.tryStartDiskWrite() {
						runtime.diskWG.Done()
					}
					ssml := fmt.Sprintf("<speak>race-%d-%d</speak>", idx, j)
					_, _ = GenerateAudioFromSsmlContext(context.Background(), ssml, "mp3")
				}
			}(i)
		}

		waitErr := make(chan error, 1)
		go func() {
			<-start
			time.Sleep(time.Millisecond)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			waitErr <- WaitTTSDiskWrites(ctx)
		}()

		close(start)
		writers.Wait()
		if err := <-waitErr; err != nil {
			t.Fatalf("WaitTTSDiskWrites() during concurrent writes = %v, want nil", err)
		}
		if runtime.tryStartDiskWrite() {
			runtime.diskWG.Done()
			t.Fatal("tryStartDiskWrite() succeeded after WaitTTSDiskWrites shutdown")
		}
	})

	t.Run("waitDiskWrites test barrier remains reusable across writes", func(t *testing.T) {
		runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusOK, "audio-bytes"), nil
		})
		runtime.config.Dir = t.TempDir()

		if !runtime.tryStartDiskWrite() {
			t.Fatal("first tryStartDiskWrite() failed")
		}
		runtime.diskWG.Done()
		runtime.waitDiskWrites()

		if !runtime.tryStartDiskWrite() {
			t.Fatal("second tryStartDiskWrite() after waitDiskWrites() failed")
		}
		runtime.diskWG.Done()
		runtime.waitDiskWrites()
	})
}

type trackingReadCloser struct {
	reader           io.Reader
	bytesRead        int
	bytesReadAtClose int
	eofReached       bool
	closed           bool
}

func newTrackingBody(body string) *trackingReadCloser {
	return &trackingReadCloser{reader: strings.NewReader(body)}
}

func (b *trackingReadCloser) Read(p []byte) (int, error) {
	n, err := b.reader.Read(p)
	b.bytesRead += n
	if errors.Is(err, io.EOF) {
		b.eofReached = true
	}
	return n, err
}

func (b *trackingReadCloser) Close() error {
	if !b.closed {
		b.closed = true
		b.bytesReadAtClose = b.bytesRead
	}
	return nil
}

func TestTTSServicesDrainErrorResponseBodies(t *testing.T) {
	t.Run("callMicrosoftTranslatorTTS drains 401 retry and non-200 bodies before close", func(t *testing.T) {
		t.Setenv("TTS_CUSTOM_ENDPOINT", "")
		t.Setenv("AZURE_TTS_KEY", "")
		t.Setenv("AZURE_TTS_REGION", "")

		first401Body := newTrackingBody("unauthorized error details")
		retry500Body := newTrackingBody("upstream server failure")
		var synthCalls atomic.Int32
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			if strings.Contains(r.URL.Host, "dev.microsofttranslator.com") {
				return ttsResponse(http.StatusOK, `{"r":"eastus","t":"eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.sig"}`), nil
			}
			if synthCalls.Add(1) == 1 {
				return &http.Response{
					StatusCode: http.StatusUnauthorized,
					Header:     make(http.Header),
					Body:       first401Body,
				}, nil
			}
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Header:     make(http.Header),
				Body:       retry500Body,
			}, nil
		})

		_, err := callMicrosoftTranslatorTTS(context.Background(), "<speak>hi</speak>", "mp3", false)
		if err == nil {
			t.Fatal("expected error from callMicrosoftTranslatorTTS")
		}
		if !first401Body.closed || !first401Body.eofReached || first401Body.bytesReadAtClose != len("unauthorized error details") {
			t.Fatalf("first 401 body not drained before close: closed=%v eof=%v readAtClose=%d",
				first401Body.closed, first401Body.eofReached, first401Body.bytesReadAtClose)
		}
		if !retry500Body.closed || !retry500Body.eofReached || retry500Body.bytesReadAtClose != len("upstream server failure") {
			t.Fatalf("retry 500 body not drained before close: closed=%v eof=%v readAtClose=%d",
				retry500Body.closed, retry500Body.eofReached, retry500Body.bytesReadAtClose)
		}
	})

	t.Run("doSynthesisRequest drains bounded error body before close", func(t *testing.T) {
		largeBody := newTrackingBody(strings.Repeat("x", int(maxDrainErrorBodyBytes)+1024))
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusBadGateway,
				Header:     make(http.Header),
				Body:       largeBody,
			}, nil
		})

		req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://tts.example.test/synth", strings.NewReader("<speak>hi</speak>"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := doSynthesisRequest(req); err == nil {
			t.Fatal("expected error from doSynthesisRequest")
		}
		if !largeBody.closed || largeBody.bytesReadAtClose != int(maxDrainErrorBodyBytes) {
			t.Fatalf("expected bounded drain of %d bytes before close, got closed=%v readAtClose=%d",
				maxDrainErrorBodyBytes, largeBody.closed, largeBody.bytesReadAtClose)
		}
	})

	t.Run("doVoiceListRequest drains non-200 error body before close", func(t *testing.T) {
		errBody := newTrackingBody("voice service temporarily unavailable")
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusServiceUnavailable,
				Header:     make(http.Header),
				Body:       errBody,
			}, nil
		})

		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://tts.example.test/voices", nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := doVoiceListRequest(req); err == nil {
			t.Fatal("expected error from doVoiceListRequest")
		}
		if !errBody.closed || !errBody.eofReached || errBody.bytesReadAtClose != len("voice service temporarily unavailable") {
			t.Fatalf("voice list error body not drained before close: closed=%v eof=%v readAtClose=%d",
				errBody.closed, errBody.eofReached, errBody.bytesReadAtClose)
		}
	})

	t.Run("callEndpointAPIContext drains non-200 error body before close", func(t *testing.T) {
		errBody := newTrackingBody("endpoint auth failure")
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusForbidden,
				Header:     make(http.Header),
				Body:       errBody,
			}, nil
		})

		if _, err := callEndpointAPIContext(context.Background()); err == nil {
			t.Fatal("expected error from callEndpointAPIContext")
		}
		if !errBody.closed || !errBody.eofReached || errBody.bytesReadAtClose != len("endpoint auth failure") {
			t.Fatalf("endpoint error body not drained before close: closed=%v eof=%v readAtClose=%d",
				errBody.closed, errBody.eofReached, errBody.bytesReadAtClose)
		}
	})

	t.Run("draining non-200 body allows HTTP keep-alive connection reuse", func(t *testing.T) {
		var reqNum atomic.Int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if reqNum.Add(1) == 1 {
				w.WriteHeader(http.StatusBadGateway)
				_, _ = w.Write([]byte("upstream error payload"))
				return
			}
			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ID3-audio-payload"))
		}))
		defer srv.Close()

		previousClient := sharedHTTPClient
		sharedHTTPClient = &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        4,
				MaxIdleConnsPerHost: 4,
			},
		}
		t.Cleanup(func() {
			sharedHTTPClient.CloseIdleConnections()
			sharedHTTPClient = previousClient
		})

		req1, err := http.NewRequestWithContext(context.Background(), http.MethodPost, srv.URL, strings.NewReader("<speak>1</speak>"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := doSynthesisRequest(req1); err == nil {
			t.Fatal("expected error on first request")
		}

		var reused atomic.Bool
		traceCtx := httptrace.WithClientTrace(context.Background(), &httptrace.ClientTrace{
			GotConn: func(info httptrace.GotConnInfo) {
				if info.Reused {
					reused.Store(true)
				}
			},
		})
		req2, err := http.NewRequestWithContext(traceCtx, http.MethodPost, srv.URL, strings.NewReader("<speak>2</speak>"))
		if err != nil {
			t.Fatal(err)
		}
		data, err := doSynthesisRequest(req2)
		if err != nil || string(data) != "ID3-audio-payload" {
			t.Fatalf("second request = (%q, %v), want audio payload", string(data), err)
		}
		if !reused.Load() {
			t.Fatal("expected HTTP keep-alive connection to be reused after drained non-200 error response")
		}
	})
}

func TestRefreshEndpointCacheDoesNotReturnExpiredFallback(t *testing.T) {
	t.Run("upstream error does not return expired cached endpoint", func(t *testing.T) {
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusInternalServerError, "upstream down"), nil
		})
		expired := &EndpointCache{
			Endpoint:  "expired-region",
			Token:     "expired-token",
			ExpiredAt: time.Now().Unix() - 1,
		}
		endpointCache.mutex.Lock()
		endpointCache.data = expired
		endpointCache.mutex.Unlock()

		got, err := refreshEndpointCacheContext(context.Background())
		if err == nil || got != nil {
			t.Fatalf("refreshEndpointCacheContext() = (%+v, %v), want (nil, error)", got, err)
		}
	})

	t.Run("invalid JWT response does not return expired cached endpoint", func(t *testing.T) {
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusOK, `{"r":"eastus","t":"invalid-jwt"}`), nil
		})
		expired := &EndpointCache{
			Endpoint:  "expired-region",
			Token:     "expired-token",
			ExpiredAt: time.Now().Unix(),
		}
		endpointCache.mutex.Lock()
		endpointCache.data = expired
		endpointCache.mutex.Unlock()

		got, err := refreshEndpointCacheContext(context.Background())
		if err == nil || got != nil {
			t.Fatalf("refreshEndpointCacheContext() = (%+v, %v), want (nil, error)", got, err)
		}
	})

	t.Run("unexpired cached endpoint is still used as fallback on refresh error", func(t *testing.T) {
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			return ttsResponse(http.StatusInternalServerError, "upstream down"), nil
		})
		unexpired := &EndpointCache{
			Endpoint:  "valid-region",
			Token:     "valid-token",
			ExpiredAt: time.Now().Unix() + 60,
		}
		endpointCache.mutex.Lock()
		endpointCache.data = unexpired
		endpointCache.mutex.Unlock()

		got, err := refreshEndpointCacheContext(context.Background())
		if err != nil || got != unexpired {
			t.Fatalf("refreshEndpointCacheContext() = (%+v, %v), want (%+v, nil)", got, err, unexpired)
		}
	})
}

func TestWaitDiskWritesDoesNotHoldDiskMutexWhileWaiting(t *testing.T) {
	runtime := installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		return ttsResponse(http.StatusOK, "audio-bytes"), nil
	})
	runtime.config.Dir = t.TempDir()

	if !runtime.tryStartDiskWrite() {
		t.Fatal("initial tryStartDiskWrite() failed")
	}
	firstReleased := false
	defer func() {
		if !firstReleased {
			runtime.diskWG.Done()
		}
	}()

	waitStarted := make(chan struct{})
	waitDone := make(chan struct{})
	go func() {
		close(waitStarted)
		runtime.waitDiskWrites()
		close(waitDone)
	}()
	<-waitStarted
	time.Sleep(10 * time.Millisecond)

	secondResult := make(chan bool, 1)
	go func() {
		ok := runtime.tryStartDiskWrite()
		if ok {
			runtime.diskWG.Done()
		}
		secondResult <- ok
	}()

	select {
	case ok := <-secondResult:
		if !ok {
			t.Fatal("concurrent tryStartDiskWrite() returned false while waitDiskWrites() waited")
		}
	case <-time.After(time.Second):
		t.Fatal("tryStartDiskWrite() blocked on diskMu while waitDiskWrites() was waiting")
	}

	firstReleased = true
	runtime.diskWG.Done()

	select {
	case <-waitDone:
	case <-time.After(time.Second):
		t.Fatal("waitDiskWrites() did not return after in-flight disk writes completed")
	}
}
