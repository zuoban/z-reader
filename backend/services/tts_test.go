package services

import (
	"context"
	"errors"
	"io"
	"net/http"
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
	key := ttsCacheKey("shared", "mp3")
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
	_, err := callTTSAPI(ctx, "endpoint deadline", "mp3", false)
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
