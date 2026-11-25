package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newGzipTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Gzip())
	router.GET("/large-json", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"payload": strings.Repeat("book-title-", 200)})
	})
	router.GET("/small-json", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	router.GET("/binary", func(c *gin.Context) {
		c.Data(http.StatusOK, "image/webp", []byte(strings.Repeat("x", 4096)))
	})
	router.GET("/no-content", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	router.HEAD("/large-json", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return router
}

func TestGzipCompressesLargeJSONResponse(t *testing.T) {
	router := newGzipTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/large-json", nil)
	req.Header.Set("Accept-Encoding", "br, gzip")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("expected Content-Encoding gzip, got %q", got)
	}
	if got := rec.Header().Get("Vary"); !strings.Contains(got, "Accept-Encoding") {
		t.Fatalf("expected Vary Accept-Encoding, got %q", got)
	}
	if rec.Body.Len() >= 500 {
		t.Fatalf("expected compressed body to shrink substantially, got %d bytes", rec.Body.Len())
	}

	reader, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatalf("failed to open gzip reader: %v", err)
	}
	defer reader.Close()
	decoded, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("failed to read gzip body: %v", err)
	}
	if !strings.Contains(string(decoded), strings.Repeat("book-title-", 200)) {
		t.Fatalf("decoded payload mismatch")
	}
}

func TestGzipSkipsSmallBinaryRangeHeadAndZeroQuality(t *testing.T) {
	router := newGzipTestRouter()
	cases := []struct {
		name   string
		method string
		path   string
		header map[string]string
		status int
	}{
		{
			name:   "small json",
			method: http.MethodGet,
			path:   "/small-json",
			header: map[string]string{"Accept-Encoding": "gzip"},
			status: http.StatusOK,
		},
		{
			name:   "binary image",
			method: http.MethodGet,
			path:   "/binary",
			header: map[string]string{"Accept-Encoding": "gzip"},
			status: http.StatusOK,
		},
		{
			name:   "range request",
			method: http.MethodGet,
			path:   "/large-json",
			header: map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-100"},
			status: http.StatusOK,
		},
		{
			name:   "head request",
			method: http.MethodHead,
			path:   "/large-json",
			header: map[string]string{"Accept-Encoding": "gzip"},
			status: http.StatusOK,
		},
		{
			name:   "zero quality gzip",
			method: http.MethodGet,
			path:   "/large-json",
			header: map[string]string{"Accept-Encoding": "gzip;q=0.0"},
			status: http.StatusOK,
		},
		{
			name:   "no content",
			method: http.MethodGet,
			path:   "/no-content",
			header: map[string]string{"Accept-Encoding": "gzip"},
			status: http.StatusNoContent,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			for key, value := range tc.header {
				req.Header.Set(key, value)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("expected status %d, got %d", tc.status, rec.Code)
			}
			if got := rec.Header().Get("Content-Encoding"); got != "" {
				t.Fatalf("expected uncompressed response, got Content-Encoding=%q", got)
			}
		})
	}
}
