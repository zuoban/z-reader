package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
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
