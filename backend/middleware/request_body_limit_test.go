package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestBodyLimitRejectsDeclaredOversizedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestBodyLimit(8))
	router.POST("/", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"value":1}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413, got %d", resp.Code)
	}
}

func TestRequestBodyLimitAllowsMultipartUploads(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestBodyLimit(8, "/books", "/books/:id/cover"))
	accept := func(c *gin.Context) { c.Status(http.StatusNoContent) }
	router.POST("/books", accept)
	router.POST("/books/:id/cover", accept)
	router.PATCH("/books/:id/cover", accept)
	router.POST("/reports", accept)

	for _, tc := range []struct {
		method      string
		path        string
		contentType string
		want        int
	}{
		{http.MethodPost, "/books", "multipart/form-data; boundary=test", http.StatusNoContent},
		{http.MethodPost, "/books/id/cover", "Multipart/Form-Data; boundary=\"test\"", http.StatusNoContent},
		{http.MethodPost, "/books", "multipart/form-data", http.StatusRequestEntityTooLarge},
		{http.MethodPost, "/books", "multipart/form-data-example; boundary=test", http.StatusRequestEntityTooLarge},
		{http.MethodPost, "/reports", "multipart/form-data; boundary=test", http.StatusRequestEntityTooLarge},
		{http.MethodPatch, "/books/id/cover", "multipart/form-data; boundary=test", http.StatusRequestEntityTooLarge},
	} {
		t.Run(tc.method+" "+tc.path+" "+tc.contentType, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(strings.Repeat("x", 32)))
			req.Header.Set("Content-Type", tc.contentType)
			resp := httptest.NewRecorder()
			router.ServeHTTP(resp, req)
			if resp.Code != tc.want {
				t.Fatalf("status = %d, want %d", resp.Code, tc.want)
			}
		})
	}
}
