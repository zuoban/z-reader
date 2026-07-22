package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
	"z-reader/backend/telemetry"
)

const requestIDHeader = "X-Request-ID"

// RequestID assigns a server-generated correlation ID to every request. Client
// supplied IDs are intentionally ignored to prevent log-forging and collisions.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := newRequestID()
		c.Set("request_id", id)
		c.Header(requestIDHeader, id)
		c.Request = c.Request.WithContext(logger.WithRequestID(c.Request.Context(), id))
		c.Next()
	}
}

func newRequestID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err == nil {
		return hex.EncodeToString(buffer)
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

// RequestLogger emits a single structured completion record for every request.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		c.Next()

		path := c.FullPath()
		if path == "" {
			path = "unmatched"
		}
		logger.Info(
			"HTTP request completed",
			"request_id", c.GetString("request_id"),
			"method", c.Request.Method,
			"path", path,
			"status", c.Writer.Status(),
			"latency_ms", time.Since(startedAt).Milliseconds(),
			"bytes", c.Writer.Size(),
			"client_ip", c.ClientIP(),
			"user_id", c.GetString("userID"),
		)
	}
}

type httpMetric struct {
	count       uint64
	durationSec float64
}

type httpMetricsRegistry struct {
	mu       sync.Mutex
	inFlight int64
	requests map[string]*httpMetric
}

var httpMetrics = &httpMetricsRegistry{requests: make(map[string]*httpMetric)}

// HTTPMetrics records low-cardinality Prometheus-compatible request metrics.
func HTTPMetrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		httpMetrics.mu.Lock()
		httpMetrics.inFlight++
		httpMetrics.mu.Unlock()

		c.Next()

		path := c.FullPath()
		if path == "" {
			path = "unmatched"
		}
		key := strings.Join([]string{c.Request.Method, path, strconv.Itoa(c.Writer.Status())}, "\x00")
		httpMetrics.mu.Lock()
		httpMetrics.inFlight--
		metric := httpMetrics.requests[key]
		if metric == nil {
			metric = &httpMetric{}
			httpMetrics.requests[key] = metric
		}
		metric.count++
		metric.durationSec += time.Since(startedAt).Seconds()
		httpMetrics.mu.Unlock()
	}
}

// MetricsHandler exposes an intentionally small, dependency-free Prometheus
// endpoint. It contains no user identifiers, paths with IDs, or request data.
func MetricsHandler(c *gin.Context) {
	type row struct {
		method string
		path   string
		status string
		metric httpMetric
	}

	httpMetrics.mu.Lock()
	inFlight := httpMetrics.inFlight
	rows := make([]row, 0, len(httpMetrics.requests))
	for key, metric := range httpMetrics.requests {
		parts := strings.Split(key, "\x00")
		rows = append(rows, row{
			method: parts[0],
			path:   parts[1],
			status: parts[2],
			metric: *metric,
		})
	}
	httpMetrics.mu.Unlock()

	sort.Slice(rows, func(i, j int) bool {
		return rows[i].method+rows[i].path+rows[i].status < rows[j].method+rows[j].path+rows[j].status
	})

	var output strings.Builder
	output.WriteString("# HELP z_reader_http_requests_in_flight Current in-flight HTTP requests.\n")
	output.WriteString("# TYPE z_reader_http_requests_in_flight gauge\n")
	fmt.Fprintf(&output, "z_reader_http_requests_in_flight %d\n", inFlight)
	output.WriteString("# HELP z_reader_http_requests_total Completed HTTP requests.\n")
	output.WriteString("# TYPE z_reader_http_requests_total counter\n")
	output.WriteString("# HELP z_reader_http_request_duration_seconds Total HTTP request duration.\n")
	output.WriteString("# TYPE z_reader_http_request_duration_seconds summary\n")
	for _, row := range rows {
		labels := fmt.Sprintf(`method=%q,path=%q,status=%q`, row.method, row.path, row.status)
		fmt.Fprintf(&output, "z_reader_http_requests_total{%s} %d\n", labels, row.metric.count)
		fmt.Fprintf(&output, "z_reader_http_request_duration_seconds_sum{%s} %.6f\n", labels, row.metric.durationSec)
		fmt.Fprintf(&output, "z_reader_http_request_duration_seconds_count{%s} %d\n", labels, row.metric.count)
	}
	telemetry.AppendPrometheus(&output)

	c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(output.String()))
}
