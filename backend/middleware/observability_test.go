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
	previousClientIP := rateLimitRejections.clientIP.Load()
	previousUser := rateLimitRejections.user.Load()
	previousCustom := rateLimitRejections.custom.Load()
	rateLimitRejections.clientIP.Store(0)
	rateLimitRejections.user.Store(0)
	rateLimitRejections.custom.Store(0)
	t.Cleanup(func() {
		rateLimitRejections.clientIP.Store(previousClientIP)
		rateLimitRejections.user.Store(previousUser)
		rateLimitRejections.custom.Store(previousCustom)
	})

	recordRateLimitRejection(rateLimitScopeClientIP)
	recordRateLimitRejection(rateLimitScopeUser)
	recordRateLimitRejection(rateLimitScopeCustom)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/metrics", MetricsHandler)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	body := recorder.Body.String()
	for _, want := range []string{
		`z_reader_rate_limit_rejections_total{scope="client_ip"} 1`,
		`z_reader_rate_limit_rejections_total{scope="user"} 1`,
		`z_reader_rate_limit_rejections_total{scope="custom"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected %q in metrics body, got %s", want, body)
		}
	}
}
