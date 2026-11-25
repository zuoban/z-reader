package middleware

import (
	"bufio"
	"compress/gzip"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

const gzipMinLength = 1024

var gzipWriterPool = sync.Pool{
	New: func() any {
		writer, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
		return writer
	},
}

// Gzip compresses eligible JSON and text responses when the client advertises
// gzip support, skipping already-compressed binary assets and small payloads.
func Gzip() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !shouldAcceptGzip(c.Request) {
			c.Next()
			return
		}

		origWriter := c.Writer
		appendVaryHeader(origWriter.Header(), "Accept-Encoding")
		writer := &gzipResponseWriter{
			ResponseWriter: origWriter,
			statusCode:     http.StatusOK,
		}
		c.Writer = writer
		completed := false
		defer func() {
			if !completed {
				writer.discard()
				c.Writer = origWriter
				return
			}
			writer.finish()
		}()

		c.Next()
		completed = true
	}
}

func shouldAcceptGzip(req *http.Request) bool {
	if req.Method == http.MethodHead {
		return false
	}
	if req.Header.Get("Range") != "" || req.Header.Get("Upgrade") != "" {
		return false
	}
	return acceptsGzipEncoding(req.Header.Get("Accept-Encoding"))
}

func acceptsGzipEncoding(header string) bool {
	for _, part := range strings.Split(header, ",") {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		encoding, params, _ := strings.Cut(item, ";")
		if !strings.EqualFold(strings.TrimSpace(encoding), "gzip") {
			continue
		}
		for _, param := range strings.Split(params, ";") {
			key, value, ok := strings.Cut(strings.TrimSpace(param), "=")
			if !ok || !strings.EqualFold(strings.TrimSpace(key), "q") {
				continue
			}
			weight, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
			if err == nil && weight <= 0 {
				return false
			}
		}
		return true
	}
	return false
}

func appendVaryHeader(headers http.Header, value string) {
	for _, existing := range headers.Values("Vary") {
		for _, token := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(token), value) {
				return
			}
		}
	}
	headers.Add("Vary", value)
}

func isCompressibleContentType(contentType string) bool {
	mediaType, _, _ := strings.Cut(contentType, ";")
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if mediaType == "" || mediaType == "text/event-stream" {
		return false
	}
	return strings.HasPrefix(mediaType, "text/") ||
		mediaType == "application/json" ||
		strings.HasSuffix(mediaType, "+json") ||
		mediaType == "application/javascript" ||
		mediaType == "application/xml" ||
		strings.HasSuffix(mediaType, "+xml")
}

type gzipResponseWriter struct {
	gin.ResponseWriter
	gz          *gzip.Writer
	buf         []byte
	statusCode  int
	wroteHeader bool
	decided     bool
	compress    bool
	size        int
}

func (w *gzipResponseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.wroteHeader = true
	if w.decided {
		w.ResponseWriter.WriteHeader(code)
		return
	}
	if code < 200 || code == http.StatusNoContent || code == http.StatusNotModified {
		w.decided = true
		w.compress = false
		w.ResponseWriter.WriteHeader(code)
	}
}

func (w *gzipResponseWriter) WriteHeaderNow() {
	if !w.decided {
		w.decide(false)
	}
	w.ResponseWriter.WriteHeaderNow()
}

func (w *gzipResponseWriter) Write(data []byte) (int, error) {
	if !w.wroteHeader {
		w.statusCode = http.StatusOK
		w.wroteHeader = true
	}
	if !w.decided {
		if !w.canCompressHeader(data) {
			w.decided = true
			w.compress = false
			w.ResponseWriter.WriteHeader(w.statusCode)
			return w.writePlain(data)
		}
		w.buf = append(w.buf, data...)
		if len(w.buf) < gzipMinLength {
			return len(data), nil
		}
		if err := w.startGzip(); err != nil {
			return 0, err
		}
		return len(data), nil
	}
	if w.compress {
		return w.gz.Write(data)
	}
	return w.writePlain(data)
}

type writerOnly struct {
	io.Writer
}

func unwrapReaderFrom(w http.ResponseWriter) io.ReaderFrom {
	for w != nil {
		if rf, ok := w.(io.ReaderFrom); ok {
			return rf
		}
		u, ok := w.(interface{ Unwrap() http.ResponseWriter })
		if !ok {
			return nil
		}
		w = u.Unwrap()
	}
	return nil
}

// ReadFrom lets http.ServeContent use the underlying writer's zero-copy path
// (e.g. sendfile) for binary responses such as EPUBs and cover images.
func (w *gzipResponseWriter) ReadFrom(r io.Reader) (int64, error) {
	if !w.wroteHeader {
		w.statusCode = http.StatusOK
		w.wroteHeader = true
	}
	if !w.decided && w.Header().Get("Content-Type") != "" && !w.canCompressHeader(nil) {
		w.decided = true
		w.compress = false
		w.ResponseWriter.WriteHeader(w.statusCode)
	}
	if w.decided && !w.compress {
		if rf := unwrapReaderFrom(w.ResponseWriter); rf != nil {
			w.ResponseWriter.WriteHeaderNow()
			n, err := rf.ReadFrom(r)
			w.size += int(n)
			return n, err
		}
	}
	return io.Copy(writerOnly{w}, r)
}

func (w *gzipResponseWriter) WriteString(text string) (int, error) {
	if w.decided && !w.compress {
		n, err := w.ResponseWriter.WriteString(text)
		w.size += n
		return n, err
	}
	return w.Write([]byte(text))
}

func (w *gzipResponseWriter) Flush() {
	if !w.decided {
		w.decide(len(w.buf) >= gzipMinLength)
	}
	if w.compress && w.gz != nil {
		_ = w.gz.Flush()
	}
	w.ResponseWriter.Flush()
}

func (w *gzipResponseWriter) Status() int {
	if w.decided {
		return w.ResponseWriter.Status()
	}
	return w.statusCode
}

func (w *gzipResponseWriter) Size() int {
	if w.compress {
		return w.ResponseWriter.Size()
	}
	if w.decided {
		if size := w.ResponseWriter.Size(); size > 0 {
			return size
		}
		return w.size
	}
	return len(w.buf)
}

func (w *gzipResponseWriter) Written() bool {
	return w.wroteHeader || w.decided || w.ResponseWriter.Written()
}

func (w *gzipResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return w.ResponseWriter.Hijack()
}

func (w *gzipResponseWriter) canCompressHeader(sample []byte) bool {
	if w.statusCode < 200 || w.statusCode == http.StatusNoContent || w.statusCode == http.StatusNotModified {
		return false
	}
	headers := w.Header()
	if headers.Get("Content-Encoding") != "" {
		return false
	}
	contentType := headers.Get("Content-Type")
	if contentType == "" && len(sample) > 0 {
		contentType = http.DetectContentType(sample)
	}
	return isCompressibleContentType(contentType)
}

func (w *gzipResponseWriter) startGzip() error {
	w.decided = true
	w.compress = true
	headers := w.Header()
	headers.Del("Content-Length")
	if etag := strings.TrimSpace(headers.Get("ETag")); etag != "" && !strings.HasPrefix(etag, "W/") {
		headers.Set("ETag", "W/"+etag)
	}
	headers.Set("Content-Encoding", "gzip")
	w.ResponseWriter.WriteHeader(w.statusCode)
	gz := gzipWriterPool.Get().(*gzip.Writer)
	gz.Reset(w.ResponseWriter)
	w.gz = gz
	if len(w.buf) > 0 {
		buffered := w.buf
		w.buf = nil
		_, err := w.gz.Write(buffered)
		return err
	}
	return nil
}

func (w *gzipResponseWriter) decide(enableGzip bool) {
	if w.decided {
		return
	}
	if enableGzip && w.canCompressHeader(w.buf) {
		_ = w.startGzip()
		return
	}
	w.decided = true
	w.compress = false
	if w.wroteHeader || len(w.buf) > 0 {
		w.ResponseWriter.WriteHeader(w.statusCode)
	}
	if len(w.buf) > 0 {
		buffered := w.buf
		w.buf = nil
		_, _ = w.writePlain(buffered)
	}
}

func (w *gzipResponseWriter) writePlain(data []byte) (int, error) {
	n, err := w.ResponseWriter.Write(data)
	w.size += n
	return n, err
}

func (w *gzipResponseWriter) discard() {
	w.buf = nil
	if w.gz != nil {
		_ = w.gz.Close()
		w.gz.Reset(io.Discard)
		gzipWriterPool.Put(w.gz)
		w.gz = nil
	}
}

func (w *gzipResponseWriter) finish() {
	if !w.decided {
		w.decide(len(w.buf) >= gzipMinLength)
	}
	if w.gz != nil {
		_ = w.gz.Close()
		w.gz.Reset(io.Discard)
		gzipWriterPool.Put(w.gz)
		w.gz = nil
	}
}
