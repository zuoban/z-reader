package middleware

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"net"
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

func TestAcceptsGzipEncodingEdgeCases(t *testing.T) {
	cases := []struct {
		header string
		want   bool
	}{
		{"", false},
		{"   ", false},
		{", , ", false},
		{"br, deflate", false},
		{"gzip", true},
		{", , GZIP ; level=5 ; q=0.8", true},
		{"gzip;q=0", false},
		{"gzip; q = 0.000", false},
		{"br, gzip;q=-0.5", false},
		{"gzip;q=not-a-number", true},
		{"gzip;foo", true},
	}
	for _, tc := range cases {
		if got := acceptsGzipEncoding(tc.header); got != tc.want {
			t.Errorf("acceptsGzipEncoding(%q) = %v, want %v", tc.header, got, tc.want)
		}
	}
}

func TestShouldAcceptGzipSkipsUpgrade(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Upgrade", "websocket")
	if shouldAcceptGzip(req) {
		t.Fatal("expected Upgrade request to skip gzip")
	}
}

func TestAppendVaryHeaderDeduplicatesCaseInsensitively(t *testing.T) {
	headers := make(http.Header)
	headers.Add("Vary", "Origin, accept-encoding")
	appendVaryHeader(headers, "Accept-Encoding")
	if got := headers.Values("Vary"); len(got) != 1 || got[0] != "Origin, accept-encoding" {
		t.Fatalf("unexpected Vary headers after duplicate append: %v", got)
	}

	headers2 := make(http.Header)
	headers2.Add("Vary", "Origin")
	appendVaryHeader(headers2, "Accept-Encoding")
	if got := headers2.Values("Vary"); len(got) != 2 || got[1] != "Accept-Encoding" {
		t.Fatalf("unexpected Vary headers after distinct append: %v", got)
	}
}

func TestIsCompressibleContentType(t *testing.T) {
	cases := []struct {
		contentType string
		want        bool
	}{
		{"", false},
		{"text/event-stream", false},
		{"text/event-stream; charset=utf-8", false},
		{"text/plain; charset=utf-8", true},
		{"text/html", true},
		{"application/json", true},
		{"application/problem+json; charset=utf-8", true},
		{"application/javascript", true},
		{"application/xml", true},
		{"application/atom+xml; charset=utf-8", true},
		{"image/png", false},
		{"application/octet-stream", false},
	}
	for _, tc := range cases {
		if got := isCompressibleContentType(tc.contentType); got != tc.want {
			t.Errorf("isCompressibleContentType(%q) = %v, want %v", tc.contentType, got, tc.want)
		}
	}
}

func TestCanCompressHeaderEdgeCases(t *testing.T) {
	newWriter := func(status int, headers map[string]string) *gzipResponseWriter {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		for k, v := range headers {
			ctx.Writer.Header().Set(k, v)
		}
		return &gzipResponseWriter{
			ResponseWriter: ctx.Writer,
			statusCode:     status,
		}
	}

	if newWriter(http.StatusContinue, map[string]string{"Content-Type": "text/plain"}).canCompressHeader([]byte("hi")) {
		t.Fatal("expected 1xx response not to compress")
	}
	if newWriter(http.StatusNoContent, map[string]string{"Content-Type": "text/plain"}).canCompressHeader([]byte("hi")) {
		t.Fatal("expected 204 response not to compress")
	}
	if newWriter(http.StatusNotModified, map[string]string{"Content-Type": "text/plain"}).canCompressHeader([]byte("hi")) {
		t.Fatal("expected 304 response not to compress")
	}
	if newWriter(http.StatusOK, map[string]string{"Content-Type": "text/plain", "Content-Encoding": "br"}).canCompressHeader([]byte("hi")) {
		t.Fatal("expected pre-encoded response not to compress")
	}
	if !newWriter(http.StatusOK, nil).canCompressHeader([]byte("<html><body>hello world</body></html>")) {
		t.Fatal("expected sniffed HTML content to be compressible")
	}
	if newWriter(http.StatusOK, nil).canCompressHeader([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")) {
		t.Fatal("expected sniffed PNG content not to compress")
	}
	if newWriter(http.StatusOK, nil).canCompressHeader(nil) {
		t.Fatal("expected empty Content-Type with no sample not to compress")
	}
}

type stubHijackResponseWriter struct {
	gin.ResponseWriter
	hijackCalls int
	hijackErr   error
	forceSize   *int
}

func (s *stubHijackResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	s.hijackCalls++
	return nil, nil, s.hijackErr
}

func (s *stubHijackResponseWriter) Size() int {
	if s.forceSize != nil {
		return *s.forceSize
	}
	return s.ResponseWriter.Size()
}

func TestGzipResponseWriterMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("buffered plain WriteString Flush Status Size Written and decided WriteHeader", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		w := &gzipResponseWriter{ResponseWriter: ctx.Writer, statusCode: http.StatusOK}
		defer w.finish()

		if w.Written() {
			t.Fatal("expected Written() to be false before any header/body write")
		}
		if w.Status() != http.StatusOK || w.Size() != 0 {
			t.Fatalf("initial Status=%d Size=%d, want 200 and 0", w.Status(), w.Size())
		}

		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusCreated)
		if !w.Written() {
			t.Fatal("expected Written() to be true after WriteHeader")
		}
		if w.Status() != http.StatusCreated {
			t.Fatalf("undecided Status() = %d, want 201", w.Status())
		}

		n, err := w.WriteString("hello")
		if err != nil || n != 5 {
			t.Fatalf("undecided WriteString = (%d, %v), want (5, nil)", n, err)
		}
		if w.Size() != 5 {
			t.Fatalf("buffered Size() = %d, want 5", w.Size())
		}

		w.Flush()
		if !w.decided || w.compress {
			t.Fatalf("expected Flush on small buffer to decide plain, decided=%v compress=%v", w.decided, w.compress)
		}
		if !rec.Flushed {
			t.Fatal("expected underlying ResponseRecorder to be flushed")
		}
		if w.Status() != http.StatusCreated {
			t.Fatalf("decided Status() = %d, want 201", w.Status())
		}

		n, err = w.WriteString(" world")
		if err != nil || n != 6 {
			t.Fatalf("decided plain WriteString = (%d, %v), want (6, nil)", n, err)
		}
		n, err = w.Write([]byte("!"))
		if err != nil || n != 1 {
			t.Fatalf("decided plain Write = (%d, %v), want (1, nil)", n, err)
		}
		w.WriteHeader(http.StatusAccepted) // covers decided WriteHeader delegation
		if w.Size() != 12 {
			t.Fatalf("plain Size() = %d, want 12", w.Size())
		}
		if rec.Body.String() != "hello world!" {
			t.Fatalf("body = %q, want %q", rec.Body.String(), "hello world!")
		}
	})

	t.Run("WriteHeaderNow decides plain and writes header immediately", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		w := &gzipResponseWriter{ResponseWriter: ctx.Writer, statusCode: http.StatusOK}
		defer w.finish()

		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("abc"))
		w.WriteHeaderNow()
		if !w.decided || w.compress || !w.Written() {
			t.Fatalf("unexpected state after WriteHeaderNow: decided=%v compress=%v written=%v", w.decided, w.compress, w.Written())
		}
		if rec.Code != http.StatusAccepted || rec.Body.String() != "abc" {
			t.Fatalf("got status=%d body=%q, want 202 and abc", rec.Code, rec.Body.String())
		}
		// Calling WriteHeaderNow when already decided should remain safe.
		w.WriteHeaderNow()
	})

	t.Run("compressed WriteString Flush Size and finish", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		w := &gzipResponseWriter{ResponseWriter: ctx.Writer, statusCode: http.StatusOK}

		w.Header().Set("Content-Type", "application/xml")
		part1 := strings.Repeat("<item>value</item>", 100)
		part2 := "<tail/>"
		if n, err := w.WriteString(part1); err != nil || n != len(part1) {
			t.Fatalf("first WriteString = (%d, %v)", n, err)
		}
		if !w.decided || !w.compress {
			t.Fatal("expected gzip compression to be enabled")
		}
		if n, err := w.WriteString(part2); err != nil || n != len(part2) {
			t.Fatalf("second WriteString = (%d, %v)", n, err)
		}
		w.Flush()
		if !rec.Flushed {
			t.Fatal("expected underlying writer to be flushed after compressed Flush")
		}
		if sz := w.Size(); sz <= 0 {
			t.Fatalf("expected compressed Size() > 0 after Flush, got %d", sz)
		}
		w.finish()

		gzReader, err := gzip.NewReader(bytes.NewReader(rec.Body.Bytes()))
		if err != nil {
			t.Fatalf("gzip.NewReader failed: %v", err)
		}
		defer gzReader.Close()
		decoded, err := io.ReadAll(gzReader)
		if err != nil {
			t.Fatalf("io.ReadAll failed: %v", err)
		}
		if string(decoded) != part1+part2 {
			t.Fatalf("decoded compressed payload mismatch: got %d bytes, want %d", len(decoded), len(part1+part2))
		}
	})

	t.Run("decide with buffered large payload and idempotency", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		w := &gzipResponseWriter{
			ResponseWriter: ctx.Writer,
			statusCode:     http.StatusOK,
			wroteHeader:    true,
			buf:            []byte(strings.Repeat("data-", 300)),
		}
		w.Header().Set("Content-Type", "application/problem+json")
		w.decide(true)
		w.decide(false) // already decided -> no-op
		w.finish()
		if !w.compress || rec.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("expected decide(true) to start gzip, compress=%v encoding=%q", w.compress, rec.Header().Get("Content-Encoding"))
		}
	})

	t.Run("Size falls back to tracked size and Hijack delegates", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		zero := 0
		sentinelErr := errors.New("hijack sentinel")
		stub := &stubHijackResponseWriter{
			ResponseWriter: ctx.Writer,
			hijackErr:      sentinelErr,
			forceSize:      &zero,
		}
		w := &gzipResponseWriter{ResponseWriter: stub, statusCode: http.StatusOK}
		defer w.finish()

		w.Header().Set("Content-Type", "image/png")
		if _, err := w.Write([]byte("png-bytes")); err != nil {
			t.Fatalf("Write failed: %v", err)
		}
		if got := w.Size(); got != len("png-bytes") {
			t.Fatalf("Size() fallback = %d, want %d", got, len("png-bytes"))
		}

		_, _, err := w.Hijack()
		if !errors.Is(err, sentinelErr) || stub.hijackCalls != 1 {
			t.Fatalf("Hijack() err=%v calls=%d, want sentinelErr and 1 call", err, stub.hijackCalls)
		}
	})
}

type unwrapResponseWriter struct {
	http.ResponseWriter
}

func (u *unwrapResponseWriter) Unwrap() http.ResponseWriter {
	return u.ResponseWriter
}

func TestGzipReadFromFallbackWithoutReaderFromAndUnwrap(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("fallback when underlying writer does not implement ReaderFrom", func(t *testing.T) {
		router := gin.New()
		router.Use(Gzip())
		var recordedSize int
		router.GET("/plain-binary", func(c *gin.Context) {
			c.Header("Content-Type", "application/octet-stream")
			payload := strings.Repeat("z", 2048)
			n, err := io.Copy(c.Writer, io.LimitReader(strings.NewReader(payload), int64(len(payload))))
			if err != nil || n != int64(len(payload)) {
				t.Errorf("io.Copy = (%d, %v), want (%d, nil)", n, err, len(payload))
			}
			recordedSize = c.Writer.Size()
		})

		// Plain httptest.ResponseRecorder does not implement io.ReaderFrom.
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/plain-binary", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK || rec.Body.Len() != 2048 || recordedSize != 2048 {
			t.Fatalf("status=%d body=%d size=%d, want 200 and 2048", rec.Code, rec.Body.Len(), recordedSize)
		}
		if got := rec.Header().Get("Content-Encoding"); got != "" {
			t.Fatalf("expected no Content-Encoding, got %q", got)
		}
	})

	t.Run("unwrapReaderFrom traverses nested Unwrap wrappers", func(t *testing.T) {
		inner := &readerFromRecorder{ResponseRecorder: httptest.NewRecorder()}
		wrapped := &unwrapResponseWriter{ResponseWriter: inner}
		if rf := unwrapReaderFrom(wrapped); rf != inner {
			t.Fatalf("unwrapReaderFrom returned %T, want *readerFromRecorder", rf)
		}
		plainWrapped := &unwrapResponseWriter{ResponseWriter: httptest.NewRecorder()}
		if rf := unwrapReaderFrom(plainWrapped); rf != nil {
			t.Fatalf("unwrapReaderFrom on non-ReaderFrom chain = %v, want nil", rf)
		}
	})

	t.Run("middleware skips 304 and pre-encoded responses and sniffs untyped text", func(t *testing.T) {
		router := gin.New()
		router.Use(Gzip())
		router.GET("/not-modified", func(c *gin.Context) {
			c.Status(http.StatusNotModified)
		})
		router.GET("/pre-encoded", func(c *gin.Context) {
			c.Header("Content-Type", "text/plain")
			c.Header("Content-Encoding", "br")
			_, _ = c.Writer.WriteString(strings.Repeat("already-compressed-", 100))
		})
		router.GET("/sniff-text", func(c *gin.Context) {
			_, _ = c.Writer.WriteString(strings.Repeat("plain-sniffed-body-", 100))
		})

		for _, tc := range []struct {
			path     string
			status   int
			encoding string
		}{
			{"/not-modified", http.StatusNotModified, ""},
			{"/pre-encoded", http.StatusOK, "br"},
			{"/sniff-text", http.StatusOK, "gzip"},
		} {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set("Accept-Encoding", "gzip")
			router.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Errorf("%s: status = %d, want %d", tc.path, rec.Code, tc.status)
			}
			if got := rec.Header().Get("Content-Encoding"); got != tc.encoding {
				t.Errorf("%s: Content-Encoding = %q, want %q", tc.path, got, tc.encoding)
			}
		}
	})
}

func TestGzipPanicSafetyWithRecovery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("panic after buffering less than threshold returns clean 500 without partial body", func(t *testing.T) {
		router := gin.New()
		router.Use(
			gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, _ any) {
				c.AbortWithStatus(http.StatusInternalServerError)
			}),
			Gzip(),
		)
		router.GET("/panic-buffered", func(c *gin.Context) {
			c.Header("Content-Type", "application/json; charset=utf-8")
			_, _ = c.Writer.WriteString(`{"partial":`)
			panic("downstream boom")
		})

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/panic-buffered", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, want 500", rec.Code)
		}
		if rec.Body.Len() != 0 {
			t.Fatalf("expected empty body on recovered panic, got %q", rec.Body.String())
		}
		if got := rec.Header().Get("Content-Encoding"); got != "" {
			t.Fatalf("expected no Content-Encoding on recovered panic, got %q", got)
		}
	})

	t.Run("panic after starting gzip releases pooled writer safely", func(t *testing.T) {
		router := gin.New()
		router.Use(
			gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, _ any) {
				c.AbortWithStatus(http.StatusInternalServerError)
			}),
			Gzip(),
		)
		router.GET("/panic-streaming", func(c *gin.Context) {
			c.Header("Content-Type", "text/plain")
			_, _ = c.Writer.WriteString(strings.Repeat("chunk-", 300))
			panic("streaming boom")
		})
		router.GET("/healthy", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"payload": strings.Repeat("ok-", 500)})
		})

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/panic-streaming", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		router.ServeHTTP(rec, req)

		// Follow-up gzipped request verifies pool integrity.
		okRec := httptest.NewRecorder()
		okReq := httptest.NewRequest(http.MethodGet, "/healthy", nil)
		okReq.Header.Set("Accept-Encoding", "gzip")
		router.ServeHTTP(okRec, okReq)
		if okRec.Code != http.StatusOK || okRec.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("follow-up request failed: status=%d encoding=%q", okRec.Code, okRec.Header().Get("Content-Encoding"))
		}
		gz, err := gzip.NewReader(okRec.Body)
		if err != nil {
			t.Fatalf("gzip.NewReader failed: %v", err)
		}
		defer gz.Close()
		decoded, err := io.ReadAll(gz)
		if err != nil || !strings.Contains(string(decoded), strings.Repeat("ok-", 500)) {
			t.Fatalf("follow-up decoded payload invalid: err=%v len=%d", err, len(decoded))
		}
	})
}

func TestGzipWeakensStrongETagOnlyWhenCompressed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Gzip())
	router.GET("/strong-large", func(c *gin.Context) {
		c.Header("ETag", `"abc123"`)
		c.JSON(http.StatusOK, gin.H{"payload": strings.Repeat("etag-body-", 200)})
	})
	router.GET("/strong-small", func(c *gin.Context) {
		c.Header("ETag", `"small123"`)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	router.GET("/weak-large", func(c *gin.Context) {
		c.Header("ETag", `W/"already-weak"`)
		c.JSON(http.StatusOK, gin.H{"payload": strings.Repeat("etag-body-", 200)})
	})

	cases := []struct {
		name           string
		path           string
		acceptEncoding string
		wantEncoding   string
		wantETag       string
	}{
		{
			name:           "strong ETag weakened when gzipped",
			path:           "/strong-large",
			acceptEncoding: "gzip",
			wantEncoding:   "gzip",
			wantETag:       `W/"abc123"`,
		},
		{
			name:           "strong ETag preserved when client does not accept gzip",
			path:           "/strong-large",
			acceptEncoding: "",
			wantEncoding:   "",
			wantETag:       `"abc123"`,
		},
		{
			name:           "strong ETag preserved when payload below gzip threshold",
			path:           "/strong-small",
			acceptEncoding: "gzip",
			wantEncoding:   "",
			wantETag:       `"small123"`,
		},
		{
			name:           "already-weak ETag not double-prefixed when gzipped",
			path:           "/weak-large",
			acceptEncoding: "gzip",
			wantEncoding:   "gzip",
			wantETag:       `W/"already-weak"`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tc.acceptEncoding)
			}
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			if got := rec.Header().Get("Content-Encoding"); got != tc.wantEncoding {
				t.Fatalf("Content-Encoding = %q, want %q", got, tc.wantEncoding)
			}
			if got := rec.Header().Get("ETag"); got != tc.wantETag {
				t.Fatalf("ETag = %q, want %q", got, tc.wantETag)
			}
		})
	}
}

func TestGzipWriteSniffsInitialPrefixAcrossChunks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Gzip())

	chunk1 := []byte("plain text initial prefix that sniffs as text/plain\n")
	chunk2 := bytes.Repeat([]byte{0x00, 0x01, 0x02, 0x03}, 400)
	want := append(append([]byte(nil), chunk1...), chunk2...)

	router.GET("/mixed-chunks", func(c *gin.Context) {
		if _, err := c.Writer.Write(chunk1); err != nil {
			t.Errorf("first write failed: %v", err)
		}
		if _, err := c.Writer.Write(chunk2); err != nil {
			t.Errorf("second write failed: %v", err)
		}
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/mixed-chunks", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}

	gz, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatalf("gzip.NewReader failed: %v", err)
	}
	defer gz.Close()
	decoded, err := io.ReadAll(gz)
	if err != nil {
		t.Fatalf("io.ReadAll failed: %v", err)
	}
	if !bytes.Equal(decoded, want) {
		t.Fatalf("decoded body length = %d, want %d (prefix/body mismatch)", len(decoded), len(want))
	}
}

func TestGzipWriteFlushesBufferedBytesWhenHeadersBecomeNonCompressible(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name   string
		mutate func(c *gin.Context)
	}{
		{
			name: "Content-Type changed to application/octet-stream",
			mutate: func(c *gin.Context) {
				c.Header("Content-Type", "application/octet-stream")
			},
		},
		{
			name: "Content-Encoding set between writes",
			mutate: func(c *gin.Context) {
				c.Header("Content-Encoding", "br")
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.Use(Gzip())
			router.GET("/mutate-headers", func(c *gin.Context) {
				c.Header("Content-Type", "text/plain; charset=utf-8")
				if _, err := c.Writer.Write([]byte("buffered-first-chunk-")); err != nil {
					t.Errorf("first write failed: %v", err)
				}
				tc.mutate(c)
				if _, err := c.Writer.Write([]byte("second-chunk")); err != nil {
					t.Errorf("second write failed: %v", err)
				}
			})

			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/mutate-headers", nil)
			req.Header.Set("Accept-Encoding", "gzip")
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			if got := rec.Body.String(); got != "buffered-first-chunk-second-chunk" {
				t.Fatalf("body = %q, want %q", got, "buffered-first-chunk-second-chunk")
			}
		})
	}
}
