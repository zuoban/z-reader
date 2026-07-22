package middleware

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter 简单的基于 IP 的滑动窗口速率限制器
type RateLimiter struct {
	visitors        map[string]*visitor
	mu              sync.Mutex
	maxReqs         int           // 窗口内最大请求数
	window          time.Duration // 窗口大小
	cleanupInterval time.Duration
	lastCleanup     time.Time
	now             func() time.Time
}

type visitor struct {
	count       int
	windowStart time.Time
}

// NewRateLimiter 创建一个新的速率限制器
func NewRateLimiter(maxReqs int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		visitors:        make(map[string]*visitor),
		maxReqs:         maxReqs,
		window:          window,
		cleanupInterval: time.Minute,
		now:             time.Now,
	}
}

func (rl *RateLimiter) cleanupExpired(now time.Time) {
	if rl.lastCleanup.IsZero() {
		rl.lastCleanup = now
		return
	}
	if now.Sub(rl.lastCleanup) < rl.cleanupInterval {
		return
	}

	for ip, v := range rl.visitors {
		if now.Sub(v.windowStart) > rl.window {
			delete(rl.visitors, ip)
		}
	}
	rl.lastCleanup = now
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := rl.now()
	rl.cleanupExpired(now)

	v, exists := rl.visitors[ip]
	if !exists || now.Sub(v.windowStart) > rl.window {
		rl.visitors[ip] = &visitor{count: 1, windowStart: now}
		return true
	}

	v.count++
	if v.count > rl.maxReqs {
		return false
	}
	return true
}

// RateLimit 返回速率限制中间件
func RateLimit(rl *RateLimiter) gin.HandlerFunc {
	return RateLimitByKey(rl, func(c *gin.Context) string {
		return c.ClientIP()
	})
}

// RateLimitByUser applies a shared limit to an authenticated user. Falling
// back to the client IP keeps the middleware safe if it is reused before auth.
func RateLimitByUser(rl *RateLimiter) gin.HandlerFunc {
	return RateLimitByKey(rl, func(c *gin.Context) string {
		if userID := c.GetString("userID"); userID != "" {
			return "user:" + userID
		}
		return "ip:" + c.ClientIP()
	})
}

// RateLimitByKey applies a rate limit using a caller-provided stable key.
func RateLimitByKey(rl *RateLimiter, keyFunc func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := keyFunc(c)
		if key == "" {
			key = c.ClientIP()
		}
		if !rl.Allow(key) {
			c.Header("Retry-After", strconv.Itoa(int(math.Ceil(rl.window.Seconds()))))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "请求过于频繁，请稍后再试",
			})
			return
		}
		c.Next()
	}
}
