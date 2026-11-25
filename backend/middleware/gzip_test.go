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

type readerFromRecorder struct {
	*httptest.ResponseRecorder
	readFromCalls int
}

func (r *readerFromRecorder) ReadFrom(src io.Reader) (int64, error) {
	r.readFromCalls++
	return io.Copy(r.ResponseRecorder, src)
}

func TestGzipReadFromDelegatesBinaryAndCompressesText(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Gzip())

	var binaryLoggedSize int
	router.GET("/binary-stream", func(c *gin.Context) {
		c.Header("Content-Type", "application/epub+zip")
		_, err := io.Copy(c.Writer, io.LimitReader(strings.NewReader(strings.Repeat("b", 4096)), 4096))
		if err != nil {
			t.Errorf("binary io.Copy failed: %v", err)
		}
		binaryLoggedSize = c.Writer.Size()
	})
	router.GET("/text-stream", func(c *gin.Context) {
		c.Header("Content-Type", "text/plain; charset=utf-8")
		payload := strings.Repeat("hello-world-", 300)
		_, err := io.Copy(c.Writer, io.LimitReader(strings.NewReader(payload), int64(len(payload))))
		if err != nil {
			t.Errorf("text io.Copy failed: %v", err)
		}
	})

	binRec := &readerFromRecorder{ResponseRecorder: httptest.NewRecorder()}
	binReq := httptest.NewRequest(http.MethodGet, "/binary-stream", nil)
	binReq.Header.Set("Accept-Encoding", "gzip")
	router.ServeHTTP(binRec, binReq)
	if binRec.Code != http.StatusOK {
		t.Fatalf("binary status = %d, want 200", binRec.Code)
	}
	if binRec.readFromCalls != 1 {
		t.Fatalf("expected underlying ReadFrom to be called once, got %d", binRec.readFromCalls)
	}
	if binRec.Body.Len() != 4096 || binaryLoggedSize != 4096 {
		t.Fatalf("binary len=%d size=%d, want 4096", binRec.Body.Len(), binaryLoggedSize)
	}
	if got := binRec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("expected no Content-Encoding for binary stream, got %q", got)
	}

	txtRec := &readerFromRecorder{ResponseRecorder: httptest.NewRecorder()}
	txtReq := httptest.NewRequest(http.MethodGet, "/text-stream", nil)
	txtReq.Header.Set("Accept-Encoding", "gzip")
	router.ServeHTTP(txtRec, txtReq)
	if txtRec.Code != http.StatusOK {
		t.Fatalf("text status = %d, want 200", txtRec.Code)
	}
	if txtRec.readFromCalls != 0 {
		t.Fatalf("expected compressible stream to bypass direct ReadFrom, got %d", txtRec.readFromCalls)
	}
	if got := txtRec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("expected gzip Content-Encoding for text stream, got %q", got)
	}
}
