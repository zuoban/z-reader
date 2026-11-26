package middleware

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRateLimiterAllowsWithinLimit(t *testing.T) {
	rl := NewRateLimiter(3, 5*time.Minute)

	for i := 0; i < 3; i++ {
		if !rl.Allow("127.0.0.1") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
}

func TestRateLimiterBlocksAfterLimit(t *testing.T) {
	rl := NewRateLimiter(2, 5*time.Minute)

	rl.Allow("127.0.0.1")
	rl.Allow("127.0.0.1")

	if rl.Allow("127.0.0.1") {
		t.Fatal("request should be blocked after limit")
	}
}

func TestRateLimiterDifferentIPsAreIndependent(t *testing.T) {
	rl := NewRateLimiter(1, 5*time.Minute)

	rl.Allow("10.0.0.1")

	// Different IP should still be allowed
	if !rl.Allow("10.0.0.2") {
		t.Fatal("different IP should not affect rate limit")
	}
}

func TestRateLimiterCleansExpiredVisitors(t *testing.T) {
	start := time.Date(2026, 4, 27, 10, 0, 0, 0, time.UTC)
	now := start
	rl := NewRateLimiter(1, time.Minute)
	rl.cleanupInterval = time.Second
	rl.now = func() time.Time { return now }

	if !rl.Allow("10.0.0.1") {
		t.Fatal("first request should be allowed")
	}
	now = now.Add(2 * time.Minute)
	if !rl.Allow("10.0.0.2") {
		t.Fatal("different IP should be allowed")
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()
	if _, ok := rl.visitors["10.0.0.1"]; ok {
		t.Fatal("expired visitor should be cleaned")
	}
}

func TestRateLimiterBoundsTrackedVisitors(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	rl.maxVisitors = 2

	if !rl.Allow("ip-1") || !rl.Allow("ip-2") {
		t.Fatal("expected first two visitors to be accepted")
	}
	if rl.Allow("ip-3") {
		t.Fatal("expected a new visitor to be rejected after the visitor cap")
	}
}

func TestRateLimiterEvictsExpiredVisitorsWhenAtCap(t *testing.T) {
	now := time.Date(2026, 4, 27, 10, 0, 0, 0, time.UTC)
	rl := NewRateLimiter(1, time.Minute)
	rl.maxVisitors = 2
	rl.cleanupInterval = time.Hour
	rl.now = func() time.Time { return now }

	if !rl.Allow("ip-1") {
		t.Fatal("expected first visitor to be accepted")
	}
	now = now.Add(10 * time.Second)
	if !rl.Allow("ip-2") {
		t.Fatal("expected second visitor to be accepted")
	}

	// While at cap and before the oldest visitor expires, rejecting unknown IPs
	// must not trigger a full-map eviction sweep on every request.
	initialCleanup := rl.lastCleanup
	now = now.Add(20 * time.Second)
	if rl.Allow("ip-3") {
		t.Fatal("expected unknown IP to be rejected while active visitors fill the cap")
	}
	if !rl.lastCleanup.Equal(initialCleanup) {
		t.Fatalf("lastCleanup advanced from %v to %v despite no expired visitors", initialCleanup, rl.lastCleanup)
	}

	// Once ip-1 expires (still within cleanupInterval and while ip-2 is active),
	// cap eviction runs and admits ip-3.
	now = now.Add(35 * time.Second)
	if !rl.Allow("ip-3") {
		t.Fatal("expected expired visitors to be evicted when visitor cap is reached")
	}
	// ip-2 is still active (windowStart=t+10s, now=t+65s), so a fourth IP is rejected without sweeping.
	cleanupAfterAdmit := rl.lastCleanup
	now = now.Add(2 * time.Second)
	if rl.Allow("ip-4") {
		t.Fatal("expected fourth IP to be rejected while ip-2 and ip-3 are active")
	}
	if !rl.lastCleanup.Equal(cleanupAfterAdmit) {
		t.Fatalf("lastCleanup advanced from %v to %v despite oldest remaining visitor not expired", cleanupAfterAdmit, rl.lastCleanup)
	}
}

func TestRateLimiterMiddlewareReturns429(t *testing.T) {
	previous := rateLimitRejections.Load()
	rateLimitRejections.Store(0)
	t.Cleanup(func() { rateLimitRejections.Store(previous) })

	rl := NewRateLimiter(1, 5*time.Minute)
	// First request allowed
	rl.Allow("10.0.0.99")
	// Second request would be blocked

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/test", nil)
	c.Request.RemoteAddr = "10.0.0.99:12345"

	handler := RateLimit(rl)
	handler(c)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected status 429, got %d", w.Code)
	}
	if got := w.Header().Get("Retry-After"); got != "300" {
		t.Fatalf("expected Retry-After 300, got %q", got)
	}
	if got := rateLimitRejections.Load(); got != 1 {
		t.Fatalf("client IP rejections = %d, want 1", got)
	}
}

func TestRateLimiterRetryAfterUsesWindowExpiry(t *testing.T) {
	previous := rateLimitRejections.Load()
	t.Cleanup(func() { rateLimitRejections.Store(previous) })

	start := time.Date(2026, 4, 27, 10, 0, 0, 0, time.UTC)
	now := start
	rl := NewRateLimiter(1, 10*time.Second)
	rl.now = func() time.Time { return now }
	rl.maxVisitors = 2
	gin.SetMode(gin.TestMode)
	handler := RateLimit(rl)

	for _, step := range []struct {
		elapsed    time.Duration
		ip         string
		status     int
		retryAfter string
	}{
		{0, "10.0.0.1", http.StatusOK, ""},
		{2250 * time.Millisecond, "10.0.0.2", http.StatusOK, ""},
		{7750 * time.Millisecond, "10.0.0.2", http.StatusTooManyRequests, "5"},
		{7750 * time.Millisecond, "10.0.0.1", http.StatusTooManyRequests, "3"},
		{7750 * time.Millisecond, "10.0.0.3", http.StatusTooManyRequests, "3"},
		{9900 * time.Millisecond, "10.0.0.3", http.StatusTooManyRequests, "1"},
		{10 * time.Second, "10.0.0.1", http.StatusOK, ""},
		{10 * time.Second, "10.0.0.3", http.StatusTooManyRequests, "3"},
		{12250 * time.Millisecond, "10.0.0.3", http.StatusOK, ""},
	} {
		now = start.Add(step.elapsed)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/limited", nil)
		c.Request.RemoteAddr = step.ip + ":12345"
		handler(c)
		if got := w.Header().Get("Retry-After"); w.Code != step.status || got != step.retryAfter {
			t.Fatalf("ip %q at %v: got status %d, Retry-After %q; want %d, %q",
				step.ip, step.elapsed, w.Code, got, step.status, step.retryAfter)
		}
	}
}

func TestRateLimiterRetryAfterFloor(t *testing.T) {
	for _, tc := range []struct {
		retryAfter time.Duration
		want       int64
	}{
		{-5 * time.Second, 1},
		{-time.Second, 1},
		{-time.Nanosecond, 1},
		{0, 1},
		{time.Nanosecond, 1},
		{time.Second, 1},
		{time.Second + time.Nanosecond, 2},
	} {
		if got := retryAfterSeconds(tc.retryAfter); got != tc.want {
			t.Fatalf("retryAfterSeconds(%v) = %d, want %d", tc.retryAfter, got, tc.want)
		}
	}

	previous := rateLimitRejections.Load()
	t.Cleanup(func() { rateLimitRejections.Store(previous) })

	start := time.Date(2026, 4, 27, 10, 0, 0, 0, time.UTC)
	rl := NewRateLimiter(1, time.Duration(math.MaxInt64))
	rl.now = func() time.Time { return start }
	rl.visitors["10.0.0.1"] = &visitor{count: 1, windowStart: start.Add(time.Second)}

	if allowed, retryAfter := rl.allow("10.0.0.1"); allowed || retryAfter > 0 {
		t.Fatalf("expected setup to produce non-positive retryAfter, got allowed=%v retryAfter=%v", allowed, retryAfter)
	}

	gin.SetMode(gin.TestMode)
	handler := RateLimit(rl)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/limited", nil)
	c.Request.RemoteAddr = "10.0.0.1:12345"
	handler(c)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", w.Code)
	}
	if got := w.Header().Get("Retry-After"); got != "1" {
		t.Fatalf("Retry-After = %q, want %q", got, "1")
	}
}
