package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
	"z-reader/backend/telemetry"
)

func TestRequestIDAddsResponseHeaderAndContextValue(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestID())
	router.GET("/check", func(c *gin.Context) {
		c.String(http.StatusOK, logger.RequestID(c.Request.Context()))
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/check", nil))

	id := recorder.Header().Get(requestIDHeader)
	if len(id) != 32 || recorder.Body.String() != id {
		t.Fatalf("unexpected request ID response header=%q body=%q", id, recorder.Body.String())
	}
}

func TestMetricsHandlerReportsCompletedRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(HTTPMetrics())
	router.GET("/books/:id", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.GET("/metrics", MetricsHandler)

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/books/book-1", nil))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `path="/books/:id"`) {
		t.Fatalf("expected route metrics, got status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestHTTPMetricsGroupsExtensionMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previous := httpMetrics
	httpMetrics = &httpMetricsRegistry{requests: make(map[string]*httpMetric)}
	t.Cleanup(func() { httpMetrics = previous })

	router := gin.New()
	router.Use(HTTPMetrics())
	router.GET("/metrics", MetricsHandler)
	for _, method := range []string{"PROPFIND", "MKCOL"} {
		req := httptest.NewRequest(method, "/", nil)
		router.ServeHTTP(httptest.NewRecorder(), req)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rec.Body.String()
	want := `z_reader_http_requests_total{method="OTHER",path="unmatched",status="404"} 2` + "\n"
	if rec.Code != http.StatusOK || !strings.Contains(body, want) {
		t.Fatalf("expected one series for extension methods, got status=%d body=%s", rec.Code, body)
	}
	if strings.Contains(body, "PROPFIND") || strings.Contains(body, "MKCOL") {
		t.Fatal("metrics contain raw extension method labels")
	}
}

func TestMetricsHandlerReportsOperationHistogram(t *testing.T) {
	gin.SetMode(gin.TestMode)
	telemetry.Observe("book_search", 20*time.Millisecond, 4)
	router := gin.New()
	router.GET("/metrics", MetricsHandler)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	body := recorder.Body.String()
	if recorder.Code != http.StatusOK ||
		!strings.Contains(body, `operation="book_search"`) ||
		!strings.Contains(body, "z_reader_operation_items_total") {
		t.Fatalf("expected operation metrics, got status=%d body=%s", recorder.Code, body)
	}
}

func TestMetricsHandlerDoesNotInitializeTTSRuntime(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/metrics", MetricsHandler)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if strings.Contains(recorder.Body.String(), "z_reader_tts_queue_depth") {
		t.Fatalf("expected inactive TTS metrics to be omitted, got %s", recorder.Body.String())
	}
}

func TestMetricsHandlerReportsRateLimitRejections(t *testing.T) {
	previousClientIP := rateLimitRejections.Load()
	rateLimitRejections.Store(0)
	t.Cleanup(func() {
		rateLimitRejections.Store(previousClientIP)
	})

	rateLimitRejections.Add(1)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/metrics", MetricsHandler)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	body := recorder.Body.String()
	want := `z_reader_rate_limit_rejections_total{scope="client_ip"} 1`
	if !strings.Contains(body, want) {
		t.Fatalf("expected %q in metrics body, got %s", want, body)
	}
}

func TestHTTPMetricsDecrementsInFlightOnUncaughtPanic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previous := httpMetrics
	httpMetrics = &httpMetricsRegistry{requests: make(map[string]*httpMetric)}
	t.Cleanup(func() { httpMetrics = previous })

	router := gin.New()
	router.Use(HTTPMetrics())
	router.GET("/panic", func(c *gin.Context) {
		panic("uncaught handler panic")
	})

	panicked := false
	func() {
		defer func() {
			if recover() != nil {
				panicked = true
			}
		}()
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/panic", nil))
	}()

	if !panicked {
		t.Fatal("expected uncaught panic to propagate")
	}
	httpMetrics.mu.Lock()
	inFlight := httpMetrics.inFlight
	httpMetrics.mu.Unlock()
	if inFlight != 0 {
		t.Fatalf("inFlight = %d after panic, want 0", inFlight)
	}
}

func TestRequestLoggerLogsMatchedAndUnmatchedRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestID(), RequestLogger())
	router.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})

	recMatched := httptest.NewRecorder()
	router.ServeHTTP(recMatched, httptest.NewRequest(http.MethodGet, "/ping", nil))
	if recMatched.Code != http.StatusOK || recMatched.Body.String() != "pong" {
		t.Fatalf("matched route got status=%d body=%q", recMatched.Code, recMatched.Body.String())
	}

	recUnmatched := httptest.NewRecorder()
	router.ServeHTTP(recUnmatched, httptest.NewRequest(http.MethodGet, "/missing", nil))
	if recUnmatched.Code != http.StatusNotFound {
		t.Fatalf("unmatched route got status=%d, want 404", recUnmatched.Code)
	}
}
