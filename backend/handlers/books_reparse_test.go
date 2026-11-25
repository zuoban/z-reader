package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func buildReparseTestEPUB(t *testing.T, title, author string, cover []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	manifestCover := ""
	metaCover := ""
	if len(cover) > 0 {
		manifestCover = `<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>`
		metaCover = `<meta name="cover" content="cover-image"/>`
	}

	entries := []struct {
		name string
		data []byte
	}{
		{name: "mimetype", data: []byte("application/epub+zip")},
		{
			name: "META-INF/container.xml",
			data: []byte(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
		},
		{
			name: "OEBPS/content.opf",
			data: []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>%s</dc:title>
    <dc:creator>%s</dc:creator>
    %s
  </metadata>
  <manifest>
    %s
  </manifest>
  <spine></spine>
</package>`, title, author, metaCover, manifestCover)),
		},
	}
	if len(cover) > 0 {
		entries = append(entries, struct {
			name string
			data []byte
		}{name: "OEBPS/images/cover.jpg", data: cover})
	}

	for _, entry := range entries {
		w, err := zw.Create(entry.name)
		if err != nil {
			t.Fatalf("create zip entry %s: %v", entry.name, err)
		}
		if _, err := w.Write(entry.data); err != nil {
			t.Fatalf("write zip entry %s: %v", entry.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return buf.Bytes()
}

func newReparseTestHandler(t *testing.T) (*BooksHandler, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	h := newBooksHandler(t, &config.Config{UploadDir: uploadDir, MaxUploadBytes: 10 << 20}, db)
	return h, uploadDir
}

func performSingleReparse(h *BooksHandler, bookID string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Params = gin.Params{{Key: "id", Value: bookID}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/books/"+bookID+"/reparse", nil)
	h.ReparseMetadata(ctx)
	return rec
}

func performBatchReparse(h *BooksHandler, body []byte, maxBodyBytes int64) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	req := httptest.NewRequest(http.MethodPost, "/api/books/batch/reparse", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if maxBodyBytes > 0 {
		req.Body = http.MaxBytesReader(rec, req.Body, maxBodyBytes)
	}
	ctx.Request = req
	h.BatchReparseMetadata(ctx)
	return rec
}

func encodeSizedTestJPEG(t *testing.T, width, height int, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func TestReparseMetadataEPUBReplacesCoverAndCleansUpOldFiles(t *testing.T) {
	h, uploadDir := newReparseTestHandler(t)

	newCoverBytes := encodeSizedTestJPEG(t, 400, 600, color.RGBA{R: 30, G: 140, B: 220, A: 255})
	epubBytes := buildReparseTestEPUB(t, "  Reparsed EPUB Title  ", "  Ada Lovelace  ", newCoverBytes)
	if err := os.WriteFile(filepath.Join(uploadDir, "book-epub.epub"), epubBytes, 0644); err != nil {
		t.Fatal(err)
	}

	oldCoverName := "book-epub.old.cover.jpg"
	oldThumbName := "book-epub.old.cover.thumb.jpg"
	if err := os.WriteFile(filepath.Join(uploadDir, oldCoverName), encodeTestJPEG(t, color.RGBA{R: 255, G: 0, B: 0, A: 255}), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, oldThumbName), encodeTestJPEG(t, color.RGBA{R: 255, G: 0, B: 0, A: 255}), 0644); err != nil {
		t.Fatal(err)
	}

	book := &models.Book{
		ID:                  "book-epub",
		UserID:              storage.PersonalLibrary,
		Title:               "Old Filename Title",
		Author:              "Old Author",
		Filename:            "book-epub.epub",
		Format:              "",
		CoverPath:           oldCoverName,
		CoverThumbPath:      oldThumbName,
		CoverMissing:        true,
		ProcessingState:     models.BookProcessingFailed,
		PendingTitleEdited:  true,
		PendingAuthorEdited: true,
		CreatedAt:           time.Now(),
	}
	if err := h.db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	rec := performSingleReparse(h, book.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}

	var updated models.Book
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if updated.Title != "Reparsed EPUB Title" {
		t.Fatalf("Title = %q, want %q", updated.Title, "Reparsed EPUB Title")
	}
	if updated.Author != "Ada Lovelace" {
		t.Fatalf("Author = %q, want %q", updated.Author, "Ada Lovelace")
	}
	if updated.Format != "epub" {
		t.Fatalf("Format = %q, want epub", updated.Format)
	}
	if updated.ProcessingState != models.BookProcessingReady {
		t.Fatalf("ProcessingState = %q, want ready", updated.ProcessingState)
	}
	if updated.CoverMissing {
		t.Fatal("expected CoverMissing=false after cover extracted")
	}
	if updated.CoverPath == "" || updated.CoverPath == oldCoverName {
		t.Fatalf("CoverPath = %q, expected new filename different from %q", updated.CoverPath, oldCoverName)
	}
	if updated.CoverThumbPath == "" || updated.CoverThumbPath == oldThumbName {
		t.Fatalf("CoverThumbPath = %q, expected new thumbnail different from %q", updated.CoverThumbPath, oldThumbName)
	}

	// Verify new cover and thumbnail exist on disk.
	if _, err := os.Stat(filepath.Join(uploadDir, updated.CoverPath)); err != nil {
		t.Fatalf("new cover file missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, updated.CoverThumbPath)); err != nil {
		t.Fatalf("new thumb file missing: %v", err)
	}

	// Verify old cover and thumbnail were cleaned up.
	if _, err := os.Stat(filepath.Join(uploadDir, oldCoverName)); !os.IsNotExist(err) {
		t.Fatalf("expected old cover %q to be removed, stat err=%v", oldCoverName, err)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, oldThumbName)); !os.IsNotExist(err) {
		t.Fatalf("expected old thumb %q to be removed, stat err=%v", oldThumbName, err)
	}

	// Verify internal DB flags were cleared.
	stored, err := h.db.GetBookForUser(book.ID, storage.PersonalLibrary)
	if err != nil || stored == nil {
		t.Fatalf("reload book: stored=%v err=%v", stored, err)
	}
	if stored.PendingTitleEdited || stored.PendingAuthorEdited {
		t.Fatalf("expected pending edited flags cleared, got %+v", stored)
	}
	if !stored.CoverThumbChecked {
		t.Fatal("expected CoverThumbChecked=true")
	}
}

func TestReparseMetadataPDFUpdatesFromXMPAndInfo(t *testing.T) {
	h, uploadDir := newReparseTestHandler(t)

	t.Run("PDF with XMP metadata", func(t *testing.T) {
		xmp := `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">XMP Book Title</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>XMP Author One</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
		pdfBytes := buildSyntheticPDFWithXref([]string{
			`<< /Type /Catalog /Metadata 2 0 R >>`,
			fmt.Sprintf("<< /Type /Metadata /Subtype /XML /Length %d >>\nstream\n%s\nendstream", len(xmp), xmp),
		}, "/Root 1 0 R")

		if err := os.WriteFile(filepath.Join(uploadDir, "xmp-book.pdf"), pdfBytes, 0644); err != nil {
			t.Fatal(err)
		}
		book := &models.Book{
			ID:        "book-pdf-xmp",
			UserID:    storage.PersonalLibrary,
			Title:     "xmp-book",
			Filename:  "xmp-book.pdf",
			Format:    "pdf",
			CreatedAt: time.Now(),
		}
		if err := h.db.CreateBook(book); err != nil {
			t.Fatal(err)
		}

		rec := performSingleReparse(h, book.ID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
		var updated models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if updated.Title != "XMP Book Title" || updated.Author != "XMP Author One" {
			t.Fatalf("unexpected PDF XMP metadata: %+v", updated)
		}
		if updated.ProcessingState != models.BookProcessingReady {
			t.Fatalf("ProcessingState = %q, want ready", updated.ProcessingState)
		}
	})

	t.Run("PDF with /Info dictionary metadata", func(t *testing.T) {
		pdfBytes := buildSyntheticPDFWithXref([]string{
			`<< /Type /Catalog >>`,
			fmt.Sprintf("<< /Title <%s> /Author (Martin Kleppmann) >>", encodeUTF16BEHex("数据密集型应用系统设计")),
		}, "/Root 1 0 R /Info 2 0 R")

		if err := os.WriteFile(filepath.Join(uploadDir, "info-book.pdf"), pdfBytes, 0644); err != nil {
			t.Fatal(err)
		}
		book := &models.Book{
			ID:        "book-pdf-info",
			UserID:    storage.PersonalLibrary,
			Title:     "info-book",
			Filename:  "info-book.pdf",
			Format:    "",
			CreatedAt: time.Now(),
		}
		if err := h.db.CreateBook(book); err != nil {
			t.Fatal(err)
		}

		rec := performSingleReparse(h, book.ID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
		var updated models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if updated.Title != "数据密集型应用系统设计" || updated.Author != "Martin Kleppmann" {
			t.Fatalf("unexpected PDF Info metadata: %+v", updated)
		}
		if updated.Format != "pdf" {
			t.Fatalf("Format = %q, want pdf", updated.Format)
		}
	})
}

func TestReparseMetadataMOBIAndAZW3(t *testing.T) {
	h, uploadDir := newReparseTestHandler(t)

	for _, tc := range []struct {
		id       string
		filename string
		format   string
		title    string
		author   string
	}{
		{id: "book-mobi", filename: "book-mobi.mobi", format: "mobi", title: "三体", author: "刘慈欣"},
		{id: "book-azw3", filename: "book-azw3.azw3", format: "azw3", title: "流浪地球", author: "刘慈欣"},
	} {
		t.Run(tc.format, func(t *testing.T) {
			coverJPEG := encodeSizedTestJPEG(t, 400, 600, color.RGBA{R: 50, G: 180, B: 90, A: 255})
			mobiBytes := buildSyntheticMOBI(syntheticMOBIOptions{
				palmName:        "Fallback_Name",
				encoding:        mobiEncodingUTF8,
				fullName:        []byte("Old Full Name"),
				firstImageIndex: 2,
				exthRecords: []syntheticEXTHRecord{
					{recType: exthTypeUpdatedTitle, data: []byte(tc.title)},
					{recType: exthTypeAuthor, data: []byte(tc.author)},
					{recType: exthTypeCoverOffset, data: uint32Bytes(0)},
				},
				extraRecords: [][]byte{
					[]byte("text content"),
					coverJPEG,
				},
			})
			if err := os.WriteFile(filepath.Join(uploadDir, tc.filename), mobiBytes, 0644); err != nil {
				t.Fatal(err)
			}

			book := &models.Book{
				ID:        tc.id,
				UserID:    storage.PersonalLibrary,
				Title:     "Raw Filename",
				Filename:  tc.filename,
				Format:    tc.format,
				CreatedAt: time.Now(),
			}
			if err := h.db.CreateBook(book); err != nil {
				t.Fatal(err)
			}

			rec := performSingleReparse(h, book.ID)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
			}

			var updated models.Book
			if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
				t.Fatal(err)
			}
			if updated.Title != tc.title || updated.Author != tc.author {
				t.Fatalf("metadata = (%q, %q), want (%q, %q)", updated.Title, updated.Author, tc.title, tc.author)
			}
			if updated.CoverPath == "" || updated.CoverThumbPath == "" {
				t.Fatalf("expected cover and thumb paths to be populated, got %+v", updated)
			}
			if _, err := os.Stat(filepath.Join(uploadDir, updated.CoverPath)); err != nil {
				t.Fatalf("cover file missing: %v", err)
			}
			if _, err := os.Stat(filepath.Join(uploadDir, updated.CoverThumbPath)); err != nil {
				t.Fatalf("thumb file missing: %v", err)
			}
		})
	}
}

func TestReparseMetadataNotFoundErrors(t *testing.T) {
	h, _ := newReparseTestHandler(t)

	t.Run("book not found returns 404", func(t *testing.T) {
		rec := performSingleReparse(h, "non-existent-id")
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "书籍不存在") {
			t.Fatalf("body = %s, want message 书籍不存在", rec.Body.String())
		}
	})

	t.Run("missing file on disk returns 404", func(t *testing.T) {
		book := &models.Book{
			ID:        "book-missing-file",
			UserID:    storage.PersonalLibrary,
			Title:     "Ghost Book",
			Filename:  "does-not-exist.epub",
			Format:    "epub",
			CreatedAt: time.Now(),
		}
		if err := h.db.CreateBook(book); err != nil {
			t.Fatal(err)
		}

		rec := performSingleReparse(h, book.ID)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "书籍文件不存在") {
			t.Fatalf("body = %s, want message 书籍文件不存在", rec.Body.String())
		}
	})
}

func TestBatchReparseMetadataMixedAndOrderPreservation(t *testing.T) {
	h, uploadDir := newReparseTestHandler(t)

	// 1. Valid EPUB
	epubCover := encodeTestJPEG(t, color.RGBA{R: 10, G: 20, B: 30, A: 255})
	if err := os.WriteFile(filepath.Join(uploadDir, "b1.epub"), buildReparseTestEPUB(t, "Book One", "Author One", epubCover), 0644); err != nil {
		t.Fatal(err)
	}
	if err := h.db.CreateBook(&models.Book{
		ID: "b1", UserID: storage.PersonalLibrary, Title: "raw1", Filename: "b1.epub", Format: "epub", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	// 2. Missing file on disk
	if err := h.db.CreateBook(&models.Book{
		ID: "b2-missing-file", UserID: storage.PersonalLibrary, Title: "raw2", Filename: "gone.epub", Format: "epub", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	// 3. Corrupt EPUB
	if err := os.WriteFile(filepath.Join(uploadDir, "b3.epub"), []byte("not a valid zip archive"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := h.db.CreateBook(&models.Book{
		ID: "b3-corrupt", UserID: storage.PersonalLibrary, Title: "raw3", Filename: "b3.epub", Format: "epub", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	// 4. Valid PDF
	pdfBytes := buildSyntheticPDFWithXref([]string{
		`<< /Type /Catalog >>`,
		`<< /Title (Book Four PDF) /Author (Author Four) >>`,
	}, "/Root 1 0 R /Info 2 0 R")
	if err := os.WriteFile(filepath.Join(uploadDir, "b4.pdf"), pdfBytes, 0644); err != nil {
		t.Fatal(err)
	}
	if err := h.db.CreateBook(&models.Book{
		ID: "b4", UserID: storage.PersonalLibrary, Title: "raw4", Filename: "b4.pdf", Format: "pdf", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	// 5. Valid MOBI
	mobiBytes := buildSyntheticMOBI(syntheticMOBIOptions{
		palmName: "Fallback",
		encoding: mobiEncodingUTF8,
		exthRecords: []syntheticEXTHRecord{
			{recType: exthTypeUpdatedTitle, data: []byte("Book Five MOBI")},
			{recType: exthTypeAuthor, data: []byte("Author Five")},
		},
	})
	if err := os.WriteFile(filepath.Join(uploadDir, "b5.mobi"), mobiBytes, 0644); err != nil {
		t.Fatal(err)
	}
	if err := h.db.CreateBook(&models.Book{
		ID: "b5", UserID: storage.PersonalLibrary, Title: "raw5", Filename: "b5.mobi", Format: "mobi", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	t.Run("mixed valid missing corrupt preserves order", func(t *testing.T) {
		payload, _ := json.Marshal(batchBookIDsRequest{
			IDs: []string{"b5", "b2-missing-file", "b1", "b-unknown", "b3-corrupt", "b4", "b1"},
		})
		rec := performBatchReparse(h, payload, 0)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}

		var resp batchReparseResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}

		wantUpdated := []string{"b5", "b1", "b4"}
		wantFailed := []string{"b2-missing-file", "b-unknown", "b3-corrupt"}
		if strings.Join(resp.UpdatedIDs, ",") != strings.Join(wantUpdated, ",") {
			t.Fatalf("updated_ids = %v, want %v", resp.UpdatedIDs, wantUpdated)
		}
		if strings.Join(resp.FailedIDs, ",") != strings.Join(wantFailed, ",") {
			t.Fatalf("failed_ids = %v, want %v", resp.FailedIDs, wantFailed)
		}
		if len(resp.Books) != 3 {
			t.Fatalf("len(books) = %d, want 3", len(resp.Books))
		}
		if resp.Books[0].ID != "b5" || resp.Books[0].Title != "Book Five MOBI" {
			t.Fatalf("books[0] = %+v", resp.Books[0])
		}
		if resp.Books[1].ID != "b1" || resp.Books[1].Title != "Book One" || resp.Books[1].CoverPath == "" {
			t.Fatalf("books[1] = %+v", resp.Books[1])
		}
		if resp.Books[2].ID != "b4" || resp.Books[2].Title != "Book Four PDF" {
			t.Fatalf("books[2] = %+v", resp.Books[2])
		}
	})

	t.Run("all succeed returns non-nil empty failed_ids slice", func(t *testing.T) {
		payload, _ := json.Marshal(batchBookIDsRequest{IDs: []string{"b1"}})
		rec := performBatchReparse(h, payload, 0)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), `"failed_ids":[]`) {
			t.Fatalf("expected non-null empty failed_ids slice, got %s", rec.Body.String())
		}
	})

	t.Run("all fail returns non-nil empty updated_ids and books slices", func(t *testing.T) {
		payload, _ := json.Marshal(batchBookIDsRequest{IDs: []string{"missing-1", "missing-2"}})
		rec := performBatchReparse(h, payload, 0)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, `"updated_ids":[]`) || !strings.Contains(body, `"books":[]`) {
			t.Fatalf("expected non-null empty updated_ids and books slices, got %s", body)
		}
	})
}

func TestBatchReparseMetadataValidation(t *testing.T) {
	h, _ := newReparseTestHandler(t)

	t.Run("empty ids", func(t *testing.T) {
		rec := performBatchReparse(h, []byte(`{"ids":[]}`), 0)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "请选择要重新解析的图书") {
			t.Fatalf("unexpected body: %s", rec.Body.String())
		}
	})

	t.Run("whitespace only ids", func(t *testing.T) {
		rec := performBatchReparse(h, []byte(`{"ids":["  ", ""]}`), 0)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		rec := performBatchReparse(h, []byte(`{bad json`), 0)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("request body too large", func(t *testing.T) {
		rec := performBatchReparse(h, []byte(`{"ids":["book-1","book-2","book-3"]}`), 10)
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("status = %d, want 413; body=%s", rec.Code, rec.Body.String())
		}
	})

	t.Run("exceeds 500 ids", func(t *testing.T) {
		ids := make([]string, maxBatchBookIDs+1)
		for i := range ids {
			ids[i] = fmt.Sprintf("book-%d", i)
		}
		payload, _ := json.Marshal(batchBookIDsRequest{IDs: ids})
		rec := performBatchReparse(h, payload, 0)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "单次最多操作 500 本图书") {
			t.Fatalf("unexpected body: %s", rec.Body.String())
		}
	})
}

func TestReparseMetadataBoundsRunesAndPreservesExistingOnEmpty(t *testing.T) {
	h, uploadDir := newReparseTestHandler(t)

	t.Run("bounds extracted title and author by max runes", func(t *testing.T) {
		longTitle := strings.Repeat("书", maxBookTitleRunes+50)
		longAuthor := strings.Repeat("作", maxBookAuthorRunes+50)
		epubBytes := buildReparseTestEPUB(t, longTitle, longAuthor, nil)
		if err := os.WriteFile(filepath.Join(uploadDir, "long.epub"), epubBytes, 0644); err != nil {
			t.Fatal(err)
		}
		if err := h.db.CreateBook(&models.Book{
			ID: "book-long", UserID: storage.PersonalLibrary, Title: "raw", Filename: "long.epub", Format: "epub", CreatedAt: time.Now(),
		}); err != nil {
			t.Fatal(err)
		}

		rec := performSingleReparse(h, "book-long")
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
		var updated models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if len([]rune(updated.Title)) != maxBookTitleRunes {
			t.Fatalf("len(Title runes) = %d, want %d", len([]rune(updated.Title)), maxBookTitleRunes)
		}
		if len([]rune(updated.Author)) != maxBookAuthorRunes {
			t.Fatalf("len(Author runes) = %d, want %d", len([]rune(updated.Author)), maxBookAuthorRunes)
		}
	})

	t.Run("empty extracted metadata preserves existing fields and manual cover", func(t *testing.T) {
		epubBytes := buildReparseTestEPUB(t, "   ", "   ", nil)
		if err := os.WriteFile(filepath.Join(uploadDir, "empty-meta.epub"), epubBytes, 0644); err != nil {
			t.Fatal(err)
		}
		manualCover := "book-preserve.manual.cover.jpg"
		if err := os.WriteFile(filepath.Join(uploadDir, manualCover), encodeTestJPEG(t, color.RGBA{R: 1, G: 2, B: 3, A: 255}), 0644); err != nil {
			t.Fatal(err)
		}
		if err := h.db.CreateBook(&models.Book{
			ID:        "book-preserve",
			UserID:    storage.PersonalLibrary,
			Title:     "Existing Title",
			Author:    "Existing Author",
			Filename:  "empty-meta.epub",
			Format:    "epub",
			CoverPath: manualCover,
			CreatedAt: time.Now(),
		}); err != nil {
			t.Fatal(err)
		}

		rec := performSingleReparse(h, "book-preserve")
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
		var updated models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if updated.Title != "Existing Title" || updated.Author != "Existing Author" || updated.CoverPath != manualCover {
			t.Fatalf("expected existing fields preserved, got %+v", updated)
		}
	})
}

func TestBatchReparseMetadataRespectsContextCancellation(t *testing.T) {
	t.Run("already canceled context skips all books", func(t *testing.T) {
		h, uploadDir := newReparseTestHandler(t)
		ids := make([]string, 0, 3)
		for i := range 3 {
			id := fmt.Sprintf("cancel-pre-%d", i)
			filename := id + ".epub"
			epubBytes := buildReparseTestEPUB(t, fmt.Sprintf("New Title %d", i), "New Author", encodeTestJPEG(t, color.RGBA{R: 10, G: 20, B: 30, A: 255}))
			if err := os.WriteFile(filepath.Join(uploadDir, filename), epubBytes, 0644); err != nil {
				t.Fatal(err)
			}
			if err := h.db.CreateBook(&models.Book{
				ID:        id,
				UserID:    storage.PersonalLibrary,
				Title:     fmt.Sprintf("Original %d", i),
				Filename:  filename,
				Format:    "epub",
				CreatedAt: time.Now(),
			}); err != nil {
				t.Fatal(err)
			}
			ids = append(ids, id)
		}

		var extractCalls atomic.Int32
		h.extractBookPreviewFn = func(file *os.File, format string) (*epubMetadata, []byte, string, error) {
			extractCalls.Add(1)
			return extractBookPreview(file, format)
		}

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		payload, _ := json.Marshal(batchBookIDsRequest{IDs: ids})
		rec := httptest.NewRecorder()
		ginCtx, _ := gin.CreateTestContext(rec)
		req := httptest.NewRequest(http.MethodPost, "/api/books/batch/reparse", bytes.NewReader(payload)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		ginCtx.Request = req
		h.BatchReparseMetadata(ginCtx)

		if rec.Body.Len() != 0 {
			t.Fatalf("expected empty body on canceled context, got %s", rec.Body.String())
		}
		if got := extractCalls.Load(); got != 0 {
			t.Fatalf("extractCalls = %d, want 0", got)
		}
		for i, id := range ids {
			stored, err := h.db.GetBook(id)
			if err != nil || stored == nil {
				t.Fatalf("get book %s: %v", id, err)
			}
			if stored.Title != fmt.Sprintf("Original %d", i) || stored.CoverPath != "" {
				t.Fatalf("book %s was modified despite canceled context: %+v", id, stored)
			}
		}

		// Single ReparseMetadata also respects canceled request context.
		recSingle := httptest.NewRecorder()
		ginSingle, _ := gin.CreateTestContext(recSingle)
		ginSingle.Params = gin.Params{{Key: "id", Value: ids[0]}}
		ginSingle.Request = httptest.NewRequest(http.MethodPost, "/api/books/"+ids[0]+"/reparse", nil).WithContext(ctx)
		h.ReparseMetadata(ginSingle)
		if recSingle.Body.Len() != 0 {
			t.Fatalf("expected empty body on canceled single reparse, got %s", recSingle.Body.String())
		}
		if got := extractCalls.Load(); got != 0 {
			t.Fatalf("extractCalls after single canceled reparse = %d, want 0", got)
		}
	})

	t.Run("mid-batch cancellation stops remaining books and skips writes", func(t *testing.T) {
		h, uploadDir := newReparseTestHandler(t)
		const totalBooks = 12
		ids := make([]string, 0, totalBooks)
		coverBytes := encodeTestJPEG(t, color.RGBA{R: 50, G: 100, B: 150, A: 255})
		for i := range totalBooks {
			id := fmt.Sprintf("cancel-mid-%02d", i)
			filename := id + ".epub"
			epubBytes := buildReparseTestEPUB(t, fmt.Sprintf("Reparsed %02d", i), "Author", coverBytes)
			if err := os.WriteFile(filepath.Join(uploadDir, filename), epubBytes, 0644); err != nil {
				t.Fatal(err)
			}
			if err := h.db.CreateBook(&models.Book{
				ID:        id,
				UserID:    storage.PersonalLibrary,
				Title:     fmt.Sprintf("Initial %02d", i),
				Filename:  filename,
				Format:    "epub",
				CreatedAt: time.Now(),
			}); err != nil {
				t.Fatal(err)
			}
			ids = append(ids, id)
		}

		ctx, cancel := context.WithCancel(context.Background())
		var extractCalls atomic.Int32
		h.extractBookPreviewFn = func(file *os.File, format string) (*epubMetadata, []byte, string, error) {
			extractCalls.Add(1)
			cancel()
			return &epubMetadata{Title: "Should Not Persist", Author: "Canceled"}, coverBytes, "image/jpeg", nil
		}

		payload, _ := json.Marshal(batchBookIDsRequest{IDs: ids})
		rec := httptest.NewRecorder()
		ginCtx, _ := gin.CreateTestContext(rec)
		req := httptest.NewRequest(http.MethodPost, "/api/books/batch/reparse", bytes.NewReader(payload)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		ginCtx.Request = req
		h.BatchReparseMetadata(ginCtx)

		if rec.Body.Len() != 0 {
			t.Fatalf("expected empty body on mid-batch canceled context, got %s", rec.Body.String())
		}
		if got := int(extractCalls.Load()); got == 0 || got > batchReparseMaxWorkers {
			t.Fatalf("extractCalls = %d, want between 1 and %d", got, batchReparseMaxWorkers)
		}
		for i, id := range ids {
			stored, err := h.db.GetBook(id)
			if err != nil || stored == nil {
				t.Fatalf("get book %s: %v", id, err)
			}
			if stored.Title != fmt.Sprintf("Initial %02d", i) || stored.CoverPath != "" {
				t.Fatalf("book %s was updated after cancellation: %+v", id, stored)
			}
		}

		// Ensure no cover files were written/left behind after cancellation.
		entries, err := os.ReadDir(uploadDir)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != totalBooks {
			t.Fatalf("expected only %d original book files in uploadDir, found %d", totalBooks, len(entries))
		}
	})
}
