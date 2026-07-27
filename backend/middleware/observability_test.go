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
