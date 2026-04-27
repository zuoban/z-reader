package middleware

import (
	"net/http"
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
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		if !rl.Allow(clientIP) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "请求过于频繁，请稍后再试",
			})
			return
		}
		c.Next()
	}
}
