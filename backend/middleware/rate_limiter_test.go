package middleware

import (
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

func TestRateLimiterMiddlewareReturns429(t *testing.T) {
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
}
