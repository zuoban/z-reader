package services

import (
	"context"
	"errors"
	"net/http"
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
