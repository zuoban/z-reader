package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

const defaultMaxVisitors = 10_000

const (
	rateLimitScopeClientIP = "client_ip"
)

var rateLimitRejections struct {
	clientIP atomic.Uint64
}

// RateLimiter 基于固定时间窗口的速率限制器
type RateLimiter struct {
	visitors          map[string]*visitor
	mu                sync.Mutex
	maxReqs           int           // 窗口内最大请求数
	window            time.Duration // 窗口大小
	cleanupInterval   time.Duration
	lastCleanup       time.Time
	oldestWindowStart time.Time
	now               func() time.Time
	maxVisitors       int
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
		maxVisitors:     defaultMaxVisitors,
	}
}

func (rl *RateLimiter) evictExpired(now time.Time) {
	var oldest time.Time
	for ip, v := range rl.visitors {
		if now.Sub(v.windowStart) >= rl.window {
			delete(rl.visitors, ip)
			continue
		}
		if oldest.IsZero() || v.windowStart.Before(oldest) {
			oldest = v.windowStart
		}
	}
	rl.oldestWindowStart = oldest
	rl.lastCleanup = now
}

func (rl *RateLimiter) cleanupExpired(now time.Time) {
	if rl.lastCleanup.IsZero() {
		rl.lastCleanup = now
		return
	}
	if now.Sub(rl.lastCleanup) < rl.cleanupInterval {
		return
	}
	rl.evictExpired(now)
}

func (rl *RateLimiter) Allow(ip string) bool {
	allowed, _ := rl.allow(ip)
	return allowed
}

func (rl *RateLimiter) allow(ip string) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := rl.now()
	rl.cleanupExpired(now)

	v, exists := rl.visitors[ip]
	if !exists && rl.maxVisitors > 0 && len(rl.visitors) >= rl.maxVisitors {
		if rl.oldestWindowStart.IsZero() || now.Sub(rl.oldestWindowStart) >= rl.window {
			rl.evictExpired(now)
		}
		if len(rl.visitors) >= rl.maxVisitors {
			return false, rl.window - now.Sub(rl.oldestWindowStart)
		}
	}
	if !exists || now.Sub(v.windowStart) >= rl.window {
		rl.visitors[ip] = &visitor{count: 1, windowStart: now}
		if rl.oldestWindowStart.IsZero() || now.Before(rl.oldestWindowStart) {
			rl.oldestWindowStart = now
		}
		return true, 0
	}

	if v.count >= rl.maxReqs {
		return false, rl.window - now.Sub(v.windowStart)
	}
	v.count++
	return true, 0
}

// RateLimit 返回速率限制中间件
func RateLimit(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if allowed, retryAfter := rl.allow(c.ClientIP()); !allowed {
			recordRateLimitRejection()
			c.Header("Retry-After", strconv.FormatInt(retryAfterSeconds(retryAfter), 10))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "请求过于频繁，请稍后再试",
			})
			return
		}
		c.Next()
	}
}

func retryAfterSeconds(retryAfter time.Duration) int64 {
	if retryAfter <= 0 {
		return 1
	}
	return int64(1 + (retryAfter-time.Nanosecond)/time.Second)
}

func recordRateLimitRejection() {
	rateLimitRejections.clientIP.Add(1)
}

func appendRateLimitPrometheus(output *strings.Builder) {
	output.WriteString("# HELP z_reader_rate_limit_rejections_total Requests rejected by rate limiters.\n")
	output.WriteString("# TYPE z_reader_rate_limit_rejections_total counter\n")
	fmt.Fprintf(
		output,
		"z_reader_rate_limit_rejections_total{scope=%q} %d\n",
		rateLimitScopeClientIP,
		rateLimitRejections.clientIP.Load(),
	)
}
