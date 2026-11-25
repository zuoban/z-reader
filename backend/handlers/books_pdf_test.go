package handlers

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unicode/utf16"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
)

func encodeUTF16BEHex(s string) string {
	units := utf16.Encode([]rune(s))
	buf := make([]byte, 2+len(units)*2)
	buf[0] = 0xFE
	buf[1] = 0xFF
	for i, u := range units {
		buf[2+i*2] = byte(u >> 8)
		buf[2+i*2+1] = byte(u)
	}
	return strings.ToUpper(hex.EncodeToString(buf))
}

func buildSyntheticPDFWithXref(objects []string, trailerEntries string) []byte {
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")
	offsets := make([]int, len(objects))
	for i, body := range objects {
		offsets[i] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, body)
	}
	xrefOffset := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, off := range offsets {
		fmt.Fprintf(&buf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d %s >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, trailerEntries, xrefOffset)
	return buf.Bytes()
}

func TestExtractPDFInfoLiteralStrings(t *testing.T) {
	pdf := buildSyntheticPDFWithXref([]string{
		`<< /Type /Catalog /Pages 2 0 R >>`,
		`<< /Type /Pages /Kids [] /Count 0 >>`,
		// Includes nested parens, escaped parens, backslash, octal \351 (é), line continuation, PDFDocEncoding \240 (€) and \204 (—).
		"<< /Title (The Art of \\(Go\\) (Vol. 1) \\\\\n  Caf\\351 \\24010 \\204 Guide) /Author (Grace\\tHopper) >>",
	}, "/Root 1 0 R /Info 3 0 R")

	meta := extractPDFMetadataFromReaderAt(bytes.NewReader(pdf), int64(len(pdf)))
	wantTitle := `The Art of (Go) (Vol. 1) \ Café €10 — Guide`
	if meta.Title != wantTitle {
		t.Fatalf("Title = %q, want %q", meta.Title, wantTitle)
	}
	if meta.Author != "Grace Hopper" {
		t.Fatalf("Author = %q, want %q", meta.Author, "Grace Hopper")
	}
}

func TestExtractPDFInfoUTF16BEHexStrings(t *testing.T) {
	titleHex := encodeUTF16BEHex("深入理解计算机系统")
	// Insert whitespace inside hex string to verify whitespace skipping.
	spacedTitleHex := titleHex[:4] + " \n " + titleHex[4:]
	authorHex := encodeUTF16BEHex("Randal E. Bryant")

	pdf := buildSyntheticPDFWithXref([]string{
		`<< /Type /Catalog /Pages 2 0 R >>`,
		`<< /Type /Pages /Kids [] /Count 0 >>`,
		fmt.Sprintf("<< /Title <%s> /Author <%s> >>", spacedTitleHex, authorHex),
	}, "/Root 1 0 R /Info 3 0 R")

	meta := extractPDFMetadataFromReaderAt(bytes.NewReader(pdf), int64(len(pdf)))
	if meta.Title != "深入理解计算机系统" {
		t.Fatalf("Title = %q, want %q", meta.Title, "深入理解计算机系统")
	}
	if meta.Author != "Randal E. Bryant" {
		t.Fatalf("Author = %q, want %q", meta.Author, "Randal E. Bryant")
	}
}

func TestExtractPDFXMPMetadata(t *testing.T) {
	xmp := `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="fr">Le Petit Prince</rdf:li>
          <rdf:li xml:lang="x-default">The Little Prince</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>Antoine de Saint-Exupéry</rdf:li>
          <rdf:li>Richard Howard</rdf:li>
        </rdf:Seq>
      </dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

	pdf := buildSyntheticPDFWithXref([]string{
		`<< /Type /Catalog /Metadata 2 0 R >>`,
		fmt.Sprintf("<< /Type /Metadata /Subtype /XML /Length %d >>\nstream\n%s\nendstream", len(xmp), xmp),
		`<< /Title (Legacy Info Title) /Author (Legacy Author) >>`,
	}, "/Root 1 0 R /Info 3 0 R")

	meta := extractPDFMetadataFromReaderAt(bytes.NewReader(pdf), int64(len(pdf)))
	if meta.Title != "The Little Prince" {
		t.Fatalf("Title = %q, want %q", meta.Title, "The Little Prince")
	}
	if meta.Author != "Antoine de Saint-Exupéry, Richard Howard" {
		t.Fatalf("Author = %q, want %q", meta.Author, "Antoine de Saint-Exupéry, Richard Howard")
	}
}

func TestExtractPDFXMPMetadataSkipsUnclosedStartMarker(t *testing.T) {
	validXMP := `<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Recovered XMP Title</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>Recovered XMP Author</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`

	padding := bytes.Repeat([]byte(" "), pdfMaxXMPPacketBytes+1024)

	t.Run("stray unclosed xmpmeta before valid xmpmeta packet", func(t *testing.T) {
		var window bytes.Buffer
		window.WriteString("<x:xmpmeta stray unclosed marker")
		window.Write(padding)
		window.WriteString(validXMP)

		title, author := extractPDFXMPMetadata(window.Bytes())
		if title != "Recovered XMP Title" || author != "Recovered XMP Author" {
			t.Fatalf("extractPDFXMPMetadata() = (%q, %q), want (%q, %q)", title, author, "Recovered XMP Title", "Recovered XMP Author")
		}
	})

	t.Run("stray unclosed xmpmeta before standalone rdf:RDF packet", func(t *testing.T) {
		standaloneRDF := `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Standalone RDF Title</dc:title>
    <dc:creator>Standalone RDF Author</dc:creator>
  </rdf:Description>
</rdf:RDF>`
		var window bytes.Buffer
		window.WriteString("<x:xmpmeta stray unclosed marker")
		window.Write(padding)
		window.WriteString(standaloneRDF)

		title, author := extractPDFXMPMetadata(window.Bytes())
		if title != "Standalone RDF Title" || author != "Standalone RDF Author" {
			t.Fatalf("extractPDFXMPMetadata() = (%q, %q), want (%q, %q)", title, author, "Standalone RDF Title", "Standalone RDF Author")
		}
	})
}

func TestExtractPDFSkipsEncryptedInfoAndOutlineTitles(t *testing.T) {
	t.Run("encrypted trailer skips /Info garbage", func(t *testing.T) {
		pdf := buildSyntheticPDFWithXref([]string{
			`<< /Type /Catalog >>`,
			`<< /Title (EncryptedGarbageBytes) /Author (MoreGarbage) >>`,
		}, "/Root 1 0 R /Info 2 0 R /Encrypt 3 0 R")

		meta := extractPDFMetadataFromReaderAt(bytes.NewReader(pdf), int64(len(pdf)))
		if meta.Title != "" || meta.Author != "" {
			t.Fatalf("expected encrypted PDF /Info to be skipped, got %+v", meta)
		}
	})

	t.Run("outline bookmark /Title is ignored when no /Info exists", func(t *testing.T) {
		pdf := []byte("%PDF-1.4\n1 0 obj\n<< /Title (Chapter 1: Intro) /Parent 2 0 R /Dest [3 0 R /Fit] >>\nendobj\n%%EOF\n")
		meta := extractPDFMetadataFromReaderAt(bytes.NewReader(pdf), int64(len(pdf)))
		if meta.Title != "" || meta.Author != "" {
			t.Fatalf("expected outline item not to be treated as /Info, got %+v", meta)
		}
	})

	t.Run("dictionary value matching /Title name is not confused with key", func(t *testing.T) {
		pdf := buildSyntheticPDFWithXref([]string{
			`<< /Type /Catalog >>`,
			`<< /Marker /Title /List [/Author /Title] /Title (Real Book Title) /Author (Real Author) >>`,
		}, "/Root 1 0 R /Info 2 0 R")
		meta := extractPDFMetadataFromReaderAt(bytes.NewReader(pdf), int64(len(pdf)))
		if meta.Title != "Real Book Title" || meta.Author != "Real Author" {
			t.Fatalf("unexpected metadata: %+v", meta)
		}
	})
}

func TestExtractPDFLargeFileUsesBoundedReadsViaXref(t *testing.T) {
	// Place /Info object in the middle of a >2MB PDF so neither head (512KB) nor tail (512KB) contains it directly.
	padding := strings.Repeat("A", 700*1024)
	pdf := buildSyntheticPDFWithXref([]string{
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(padding), padding),
		`<< /Title (Middle Object Title) /Author (Bounded Reader Author) >>`,
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(padding), padding),
	}, "/Info 2 0 R")

	if len(pdf) <= pdfHeadWindowBytes+pdfTailWindowBytes {
		t.Fatalf("test PDF too small (%d bytes) to exercise bounded window reads", len(pdf))
	}

	reader := &countingReaderAt{ReaderAt: bytes.NewReader(pdf)}
	meta := extractPDFMetadataFromReaderAt(reader, int64(len(pdf)))
	if meta.Title != "Middle Object Title" || meta.Author != "Bounded Reader Author" {
		t.Fatalf("unexpected metadata: %+v", meta)
	}
	if reader.bytesRead >= len(pdf) {
		t.Fatalf("expected bounded reads less than full file size (%d), read %d bytes", len(pdf), reader.bytesRead)
	}
}

func TestExtractPDFMalformedInputsDoNotPanic(t *testing.T) {
	cases := map[string][]byte{
		"empty":              nil,
		"not_pdf":            []byte("plain text document"),
		"header_only":        []byte("%PDF-1.7\n"),
		"unclosed_literal":   []byte("%PDF-1.7\n1 0 obj << /Title (unterminated >> endobj"),
		"bad_hex":            []byte("%PDF-1.7\n1 0 obj << /Title <ZZZZ> >> endobj"),
		"truncated_xmp":      []byte("%PDF-1.7\n<x:xmpmeta><rdf:RDF><dc:title>Broken"),
		"bad_xref_offset":    []byte("%PDF-1.7\ntrailer << /Info 99 0 R >>\nstartxref\n999999999\n%%EOF"),
		"deep_nested_parens": append([]byte("%PDF-1.7\n1 0 obj << /Title "), append(bytes.Repeat([]byte("("), 512), []byte(" >> endobj")...)...),
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			meta := extractPDFMetadataFromReaderAt(bytes.NewReader(payload), int64(len(payload)))
			if meta == nil {
				t.Fatal("expected non-nil metadata")
			}
		})
	}
}

func TestBooksUploadProcessesPDFMetadataAndHandlesMalformedGracefully(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("valid PDF updates title and author asynchronously", func(t *testing.T) {
		db := openHandlerTestDB(t)
		handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)

		pdf := buildSyntheticPDFWithXref([]string{
			`<< /Type /Catalog >>`,
			fmt.Sprintf("<< /Title <%s> /Author (Martin Kleppmann) >>", encodeUTF16BEHex("Designing Data-Intensive Applications")),
		}, "/Root 1 0 R /Info 2 0 R")

		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = newMultipartUploadRequest(t, "ddia-raw.pdf", pdf)
		handler.Upload(ctx)

		if rec.Code != http.StatusOK {
			t.Fatalf("Upload status = %d body=%s", rec.Code, rec.Body.String())
		}
		var uploaded models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &uploaded); err != nil {
			t.Fatal(err)
		}
		if uploaded.ProcessingState != models.BookProcessingPending {
			t.Fatalf("ProcessingState = %q, want pending", uploaded.ProcessingState)
		}

		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			b, err := db.GetBookForUser(uploaded.ID, uploaded.UserID)
			if err != nil {
				t.Fatal(err)
			}
			if b != nil && b.ProcessingState == models.BookProcessingReady {
				if b.Title != "Designing Data-Intensive Applications" || b.Author != "Martin Kleppmann" {
					t.Fatalf("unexpected processed PDF metadata: %+v", b)
				}
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatal("timed out waiting for PDF metadata processing")
	})

	t.Run("malformed PDF keeps filename title and transitions to ready", func(t *testing.T) {
		db := openHandlerTestDB(t)
		handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)

		malformedPDF := []byte("%PDF-1.4\n1 0 obj << /Title (unclosed string without end >>\n%%EOF\n")
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = newMultipartUploadRequest(t, "fallback-title.pdf", malformedPDF)
		handler.Upload(ctx)

		if rec.Code != http.StatusOK {
			t.Fatalf("Upload status = %d body=%s", rec.Code, rec.Body.String())
		}
		var uploaded models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &uploaded); err != nil {
			t.Fatal(err)
		}

		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			b, err := db.GetBookForUser(uploaded.ID, uploaded.UserID)
			if err != nil {
				t.Fatal(err)
			}
			if b != nil && b.ProcessingState == models.BookProcessingReady {
				if b.Title != "fallback-title" || b.Author != "" {
					t.Fatalf("expected filename title fallback, got %+v", b)
				}
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatal("timed out waiting for malformed PDF processing")
	})
}
