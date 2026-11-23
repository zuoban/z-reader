package services

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func waitForEndpointWaiters(t *testing.T, count int) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		endpointRefresh.mutex.Lock()
		call := endpointRefresh.call
		joined := call != nil && call.waiters == count
		endpointRefresh.mutex.Unlock()
		if joined {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("expected %d endpoint waiters", count)
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func TestEndpointRefreshDoesNotBorrowFirstCallerCancellation(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		close(started)
		select {
		case <-release:
			return ttsResponse(http.StatusOK, `{"r":"test","t":"x.eyJleHAiOjQxMDI0NDQ4MDB9.x"}`), nil
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	})
	clearEndpointCache()
	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() { _, err := GetEndpointContext(ctx); first <- err }()
	<-started
	second := make(chan error, 1)
	go func() { _, err := GetEndpointContext(context.Background()); second <- err }()
	waitForEndpointWaiters(t, 2)
	cancel()
	if !errors.Is(<-first, context.Canceled) {
		t.Fatal("first caller did not cancel")
	}
	close(release)
	if err := <-second; err != nil {
		t.Fatalf("first caller cancelled shared refresh: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("refresh was not shared: %d requests", requests.Load())
	}
}

func TestEndpointRefreshLastWaiterCancelsAndRetryStartsFresh(t *testing.T) {
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
		return ttsResponse(http.StatusOK, `{"r":"fresh","t":"x.eyJleHAiOjQxMDI0NDQ4MDB9.x"}`), nil
	})
	clearEndpointCache()
	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() { _, err := GetEndpointContext(ctx); first <- err }()
	<-firstStarted
	cancel()
	if !errors.Is(<-first, context.Canceled) {
		t.Fatal("expected cancellation")
	}
	select {
	case <-firstCancelled:
	case <-time.After(time.Second):
		t.Fatal("last waiter did not cancel upstream endpoint")
	}
	endpoint, err := GetEndpointContext(context.Background())
	close(releaseFirst)
	<-firstFinished
	if err != nil || endpoint.Endpoint != "fresh" {
		t.Fatalf("retry reused cancelled endpoint refresh: endpoint=%v err=%v", endpoint, err)
	}
	if requests.Load() != 2 {
		t.Fatalf("expected fresh retry, got %d calls", requests.Load())
	}
}

func TestEndpointFailureIsNotClassifiedAsInvalidSSML(t *testing.T) {
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		return ttsResponse(http.StatusBadRequest, "secret endpoint failure"), nil
	})
	clearEndpointCache()
	_, err := GetEndpointContext(context.Background())
	failure := TTSHTTPError(err)
	if failure.StatusCode != http.StatusBadGateway || failure.Kind != "unavailable" {
		t.Fatalf("endpoint failure classified as SSML input: %#v", failure)
	}
}

func TestParseJWTExp(t *testing.T) {
	paddedPayload := base64.StdEncoding.EncodeToString([]byte(`{"exp":1893456000}`))
	rawPayload := base64.RawStdEncoding.EncodeToString([]byte(`{"exp":1893456001}`))

	exp, err := parseJWTExp("header." + paddedPayload + ".sig")
	if err != nil || exp != 1893456000 {
		t.Fatalf("padded JWT parse = (%d, %v), want (1893456000, nil)", exp, err)
	}
	exp, err = parseJWTExp("header." + rawPayload + ".sig")
	if err != nil || exp != 1893456001 {
		t.Fatalf("raw JWT parse = (%d, %v), want (1893456001, nil)", exp, err)
	}

	for _, bad := range []string{
		"not-a-jwt",
		"a.!!!invalid-base64!!!.c",
		"a." + base64.StdEncoding.EncodeToString([]byte(`{bad json`)) + ".c",
	} {
		if _, err := parseJWTExp(bad); err == nil {
			t.Fatalf("expected error for malformed JWT %q", bad)
		}
	}
}

func TestBuildSignatureAndEnvOverride(t *testing.T) {
	t.Setenv("MICROSOFT_TTS_SIGNATURE_KEY", base64.StdEncoding.EncodeToString([]byte("test-signing-key-32bytes-1234567")))
	sig, err := buildSignature("https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0")
	if err != nil {
		t.Fatalf("buildSignature error: %v", err)
	}
	parts := strings.Split(sig, "::")
	if len(parts) != 4 || parts[0] != "MSTranslatorAndroidApp" || parts[1] == "" {
		t.Fatalf("unexpected signature format: %q", sig)
	}

	t.Setenv("MICROSOFT_TTS_SIGNATURE_KEY", "not-valid-base64!!!")
	if _, err := buildSignature("https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0"); err == nil {
		t.Fatal("expected error for invalid base64 signature key")
	}
}

func TestGetEndpointCachedHitAndStaleFallback(t *testing.T) {
	var requests atomic.Int32
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		return ttsResponse(http.StatusInternalServerError, "upstream down"), nil
	})

	// Fresh cached endpoint should not hit upstream.
	cached, err := GetEndpoint()
	if err != nil || cached == nil || cached.Endpoint != "test" {
		t.Fatalf("expected cached endpoint, got (%+v, %v)", cached, err)
	}
	if requests.Load() != 0 {
		t.Fatalf("expected 0 upstream calls for fresh cache, got %d", requests.Load())
	}

	// Expiring soon -> refresh attempted, upstream fails -> falls back to previous cache.
	stale := &EndpointCache{Endpoint: "stale-region", Token: "old-tok", ExpiredAt: time.Now().Unix() + 10}
	endpointCache.mutex.Lock()
	endpointCache.data = stale
	endpointCache.mutex.Unlock()

	fallback, err := GetEndpointContext(context.Background())
	if err != nil || fallback != stale {
		t.Fatalf("expected stale fallback, got (%+v, %v)", fallback, err)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected 1 refresh attempt, got %d", requests.Load())
	}
}

func TestGetEndpointInvalidJWTFallbackAndPreCancelledContext(t *testing.T) {
	installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
		return ttsResponse(http.StatusOK, `{"r":"eastus","t":"invalid-jwt"}`), nil
	})
	clearEndpointCache()

	_, err := GetEndpointContext(context.Background())
	if err == nil {
		t.Fatal("expected error for invalid JWT with empty cache")
	}

	// Pre-cancelled context must fail immediately.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := GetEndpointContext(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestEndpointAPIStatusErrorMapping(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests} {
		installTTSTestRuntime(t, func(r *http.Request) (*http.Response, error) {
			resp := ttsResponse(status, "err")
			resp.Header.Set("Retry-After", "12")
			return resp, nil
		})
		clearEndpointCache()
		_, err := GetEndpointContext(context.Background())
		failure := TTSHTTPError(err)
		if status == http.StatusTooManyRequests {
			if failure.Kind != "rate_limited" || failure.RetryAfter != "12" {
				t.Fatalf("status %d mapped to %#v", status, failure)
			}
		} else {
			if failure.Kind != "authentication" || failure.StatusCode != http.StatusServiceUnavailable {
				t.Fatalf("status %d mapped to %#v", status, failure)
			}
		}
	}
}
