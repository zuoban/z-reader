package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func TestBooksUploadRejectsDamagedEPUBWithoutPersistingData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = newMultipartUploadRequest(t, "damaged.epub", []byte("not an EPUB archive"))
	handler.Upload(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	books, err := db.ListBooks(storage.PersonalLibrary)
	if err != nil || len(books) != 0 {
		t.Fatalf("books after damaged upload = %+v, err = %v", books, err)
	}
	entries, err := os.ReadDir(uploadDir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("upload directory after damaged upload = %+v, err = %v", entries, err)
	}
}

func TestFallbackBookTitleStripsUppercaseExtTrimsAndClamps(t *testing.T) {
	longTitle := strings.Repeat("书", maxBookTitleRunes+25)
	cases := []struct {
		name     string
		filename string
		want     string
	}{
		{name: "uppercase EPUB", filename: "My Novel.EPUB", want: "My Novel"},
		{name: "uppercase PDF", filename: "  Report 2026  .PDF ", want: "Report 2026"},
		{name: "uppercase MOBI", filename: "Kindle Book.MOBI", want: "Kindle Book"},
		{name: "mixed case AZW3", filename: "Edition.AzW3", want: "Edition"},
		{name: "no extension", filename: "  Plain Title  ", want: "Plain Title"},
		{name: "clamps long title", filename: longTitle + ".EPUB", want: strings.Repeat("书", maxBookTitleRunes)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := fallbackBookTitle(tc.filename)
			if got != tc.want {
				t.Fatalf("fallbackBookTitle(%q) = %q (len=%d runes), want %q (len=%d runes)",
					tc.filename, got, len([]rune(got)), tc.want, len([]rune(tc.want)))
			}
		})
	}
}

func TestBooksUploadFallbackTitleStripsUppercaseExtension(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	// Minimal valid PDF without metadata so fallback title is preserved.
	ctx.Request = newMultipartUploadRequest(t, "  Sample Book  .PDF", []byte("%PDF-1.4\n%%EOF\n"))
	handler.Upload(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var uploaded models.Book
	if err := json.Unmarshal(recorder.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("unmarshal upload response: %v", err)
	}
	if uploaded.Title != "Sample Book" {
		t.Fatalf("uploaded.Title = %q, want %q", uploaded.Title, "Sample Book")
	}
}

type chunkedReader struct {
	data      []byte
	chunkSize int
	errAtEnd  error
}

func (r *chunkedReader) Read(p []byte) (int, error) {
	if len(r.data) == 0 {
		if r.errAtEnd != nil {
			return 0, r.errAtEnd
		}
		return 0, io.EOF
	}
	n := len(r.data)
	if n > r.chunkSize {
		n = r.chunkSize
	}
	if n > len(p) {
		n = len(p)
	}
	copy(p, r.data[:n])
	r.data = r.data[n:]
	return n, nil
}

func TestReadStreamHeaderHandlesChunkedPartialAndErrorReads(t *testing.T) {
	t.Run("reads full header across small chunks", func(t *testing.T) {
		payload := make([]byte, 80)
		copy(payload[60:68], "BOOKMOBI")
		got, err := readStreamHeader(&chunkedReader{data: payload, chunkSize: 7}, 512)
		if err != nil {
			t.Fatalf("readStreamHeader error: %v", err)
		}
		if !bytes.Equal(got, payload) {
			t.Fatalf("got %d bytes, want %d bytes", len(got), len(payload))
		}
		if !hasMobiSignature(got) {
			t.Fatal("expected MOBI signature to be detected across chunked reads")
		}
	})

	t.Run("truncates to maxBytes across small chunks", func(t *testing.T) {
		payload := bytes.Repeat([]byte("A"), 100)
		got, err := readStreamHeader(&chunkedReader{data: payload, chunkSize: 9}, 32)
		if err != nil {
			t.Fatalf("readStreamHeader error: %v", err)
		}
		if len(got) != 32 {
			t.Fatalf("got %d bytes, want 32", len(got))
		}
	})

	t.Run("treats empty stream EOF as empty slice without error", func(t *testing.T) {
		got, err := readStreamHeader(&chunkedReader{data: nil, chunkSize: 4}, 64)
		if err != nil || len(got) != 0 {
			t.Fatalf("readStreamHeader(empty) = (%q, %v), want empty nil", got, err)
		}
	})

	t.Run("propagates non-EOF read errors", func(t *testing.T) {
		readErr := errors.New("broken pipe")
		if _, err := readStreamHeader(&chunkedReader{data: []byte("abc"), chunkSize: 2, errAtEnd: readErr}, 64); !errors.Is(err, readErr) {
			t.Fatalf("readStreamHeader error = %v, want %v", err, readErr)
		}
	})
}

func TestBooksUploadNormalizedEPUBRecordsActualStoredSize(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	// Build a packaged macOS-style EPUB with extra sibling junk outside the package root
	// so the normalized EPUB stored on disk has a strictly different size from the uploaded zip.
	var raw bytes.Buffer
	zw := zip.NewWriter(&raw)
	entries := []struct {
		name string
		data []byte
	}{
		{name: "__MACOSX/junk.bin", data: bytes.Repeat([]byte("extra-macos-metadata"), 200)},
		{name: "wrapped.epub/META-INF/container.xml", data: []byte(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)},
		{name: "wrapped.epub/OEBPS/content.opf", data: []byte(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Wrapped</dc:title></metadata></package>`)},
		{name: "wrapped.epub/mimetype", data: []byte("application/epub+zip")},
	}
	for _, entry := range entries {
		w, err := zw.Create(entry.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	uploadedBytes := raw.Bytes()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = newMultipartUploadRequest(t, "WRAPPED.EPUB.ZIP", uploadedBytes)
	handler.Upload(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var uploaded models.Book
	if err := json.Unmarshal(recorder.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("unmarshal upload response: %v", err)
	}

	info, err := os.Stat(filepath.Join(uploadDir, uploaded.Filename))
	if err != nil {
		t.Fatalf("stat stored file: %v", err)
	}
	if uploaded.Size != info.Size() {
		t.Fatalf("book.Size = %d, want actual stored file size %d (uploaded size was %d)",
			uploaded.Size, info.Size(), len(uploadedBytes))
	}
	if uploaded.Size == int64(len(uploadedBytes)) {
		t.Fatalf("expected normalized stored size (%d) to differ from pre-normalization upload size (%d)",
			uploaded.Size, len(uploadedBytes))
	}

	zr, err := zip.OpenReader(filepath.Join(uploadDir, uploaded.Filename))
	if err != nil {
		t.Fatalf("open normalized epub: %v", err)
	}
	defer zr.Close()
	if len(zr.File) == 0 || zr.File[0].Name != "mimetype" || zr.File[0].Method != zip.Store {
		t.Fatalf("expected first normalized entry to be stored mimetype, got %+v", zr.File)
	}
}
