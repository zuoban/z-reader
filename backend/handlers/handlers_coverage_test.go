package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func newCoverageBooksHandler(t *testing.T) (*BooksHandler, *storage.DB, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)
	cfg := &config.Config{
		UploadDir:      uploadDir,
		MaxUploadBytes: 10 * 1024 * 1024,
	}
	h := NewBooksHandler(cfg, db)
	t.Cleanup(func() {
		h.Close()
	})
	return h, db, uploadDir
}

func seedHandlerBook(t *testing.T, db *storage.DB, id, title, author, filename string, category *string) *models.Book {
	t.Helper()
	book := &models.Book{
		ID:        id,
		UserID:    storage.PersonalLibrary,
		Title:     title,
		Author:    author,
		Category:  category,
		Filename:  filename,
		Size:      256,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("SaveBook(%s) failed: %v", id, err)
	}
	return book
}

func makeEncodedPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 46, G: 82, B: 73, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png.Encode failed: %v", err)
	}
	return buf.Bytes()
}

func makeEncodedJPEG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 120, G: 75, B: 50, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatalf("jpeg.Encode failed: %v", err)
	}
	return buf.Bytes()
}

func makeMinimalWebP() []byte {
	// Valid RIFF/WEBP VP8X header recognized by http.DetectContentType as image/webp.
	data := make([]byte, 30)
	copy(data[0:4], "RIFF")
	data[4] = 22
	copy(data[8:12], "WEBP")
	copy(data[12:16], "VP8 ")
	return data
}

func newCoverUploadMultipartRequest(t *testing.T, target, fieldName, filename, contentType string, payload []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if fieldName != "" {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, filename))
		if contentType != "" {
			header.Set("Content-Type", contentType)
		}
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatalf("CreatePart failed: %v", err)
		}
		if _, err := part.Write(payload); err != nil {
			t.Fatalf("part.Write failed: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, target, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestBooksSummaryAndGet(t *testing.T) {
	h, db, _ := newCoverageBooksHandler(t)
	catFiction := "小说"
	seedHandlerBook(t, db, "b1", "三体", "刘慈欣", "b1.epub", &catFiction)
	seedHandlerBook(t, db, "b2", "人类简史", "尤瓦尔", "b2.pdf", nil)

	t.Run("summary returns totals and category counts", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/summary", nil)
		h.Summary(ctx)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
		}
		var summary storage.BookLibrarySummary
		if err := json.Unmarshal(rec.Body.Bytes(), &summary); err != nil {
			t.Fatalf("unmarshal summary failed: %v", err)
		}
		if summary.Total != 2 || summary.Uncategorized != 1 || summary.Categories["小说"] != 1 {
			t.Fatalf("unexpected summary: %+v", summary)
		}
	})

	t.Run("get returns book with normalized format and 404 when missing", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Params = gin.Params{{Key: "id", Value: "b2"}}
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/b2", nil)
		h.Get(ctx)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
		}
		var got models.Book
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("unmarshal book failed: %v", err)
		}
		if got.ID != "b2" || got.Format != "pdf" {
			t.Fatalf("unexpected book: %+v", got)
		}

		missingRec := httptest.NewRecorder()
		missingCtx, _ := gin.CreateTestContext(missingRec)
		missingCtx.Params = gin.Params{{Key: "id", Value: "missing-id"}}
		missingCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/missing-id", nil)
		h.Get(missingCtx)
		if missingRec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for missing book, got %d", missingRec.Code)
		}
	})
}

func TestBooksBatchUpdateAndRemoveCategory(t *testing.T) {
	h, db, _ := newCoverageBooksHandler(t)
	seedHandlerBook(t, db, "c1", "书一", "作者A", "c1.epub", nil)
	seedHandlerBook(t, db, "c2", "书二", "作者B", "c2.epub", nil)

	callBatchCategory := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/books/batch/category", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		h.BatchUpdateCategory(ctx)
		return rec
	}

	// Invalid inputs
	if rec := callBatchCategory(`{bad json`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid json, got %d", rec.Code)
	}
	if rec := callBatchCategory(`{"ids":[],"category":"文学"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on empty ids, got %d", rec.Code)
	}
	if rec := callBatchCategory(`{"ids":["c1"]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on missing category field, got %d", rec.Code)
	}
	if rec := callBatchCategory(fmt.Sprintf(`{"ids":["c1"],"category":"%s"}`, strings.Repeat("类", 51))); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on category >50 runes, got %d", rec.Code)
	}
	tooManyIDs := make([]string, maxBatchBookIDs+1)
	for i := range tooManyIDs {
		tooManyIDs[i] = fmt.Sprintf("id-%d", i)
	}
	tooManyBody, _ := json.Marshal(map[string]any{"ids": tooManyIDs, "category": "文学"})
	if rec := callBatchCategory(string(tooManyBody)); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on >maxBatchBookIDs, got %d", rec.Code)
	}
	if rec := callBatchCategory(`{"ids":["c1","not-exist"],"category":"文学"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when any book missing, got %d", rec.Code)
	}

	// Valid batch update (with duplicate IDs and whitespace category)
	rec := callBatchCategory(`{"ids":["c1"," c1 ","c2"],"category":"  科幻  "}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on batch category set, got %d body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Books []models.Book `json:"books"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || len(resp.Books) != 2 {
		t.Fatalf("unexpected batch category response: %s", rec.Body.String())
	}
	for _, b := range resp.Books {
		if b.Category == nil || *b.Category != "科幻" || b.Format != "epub" {
			t.Fatalf("expected category 科幻 and format epub, got %+v", b)
		}
	}

	// Clear category via null
	if rec := callBatchCategory(`{"ids":["c2"],"category":null}`); rec.Code != http.StatusOK {
		t.Fatalf("expected 200 clearing category via batch, got %d", rec.Code)
	}

	// Single RemoveCategory
	rmRec := httptest.NewRecorder()
	rmCtx, _ := gin.CreateTestContext(rmRec)
	rmCtx.Params = gin.Params{{Key: "id", Value: "c1"}}
	rmCtx.Request = httptest.NewRequest(http.MethodDelete, "/api/books/c1/category", nil)
	h.RemoveCategory(rmCtx)
	if rmRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on RemoveCategory, got %d body=%s", rmRec.Code, rmRec.Body.String())
	}
	var updated models.Book
	if err := json.Unmarshal(rmRec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("unmarshal RemoveCategory failed: %v", err)
	}
	if updated.Category != nil {
		t.Fatalf("expected nil category after RemoveCategory, got %v", *updated.Category)
	}

	// Missing book RemoveCategory -> 404
	rmMissRec := httptest.NewRecorder()
	rmMissCtx, _ := gin.CreateTestContext(rmMissRec)
	rmMissCtx.Params = gin.Params{{Key: "id", Value: "no-such-book"}}
	rmMissCtx.Request = httptest.NewRequest(http.MethodDelete, "/api/books/no-such-book/category", nil)
	h.RemoveCategory(rmMissCtx)
	if rmMissRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on missing RemoveCategory, got %d", rmMissRec.Code)
	}
}

func TestBooksUploadCoverValidationAndReplacement(t *testing.T) {
	h, db, uploadDir := newCoverageBooksHandler(t)
	seedHandlerBook(t, db, "cov-1", "封面测试", "作者", "cov-1.epub", nil)

	uploadCover := func(bookID, fieldName, filename, contentType string, payload []byte) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Params = gin.Params{{Key: "id", Value: bookID}}
		ctx.Request = newCoverUploadMultipartRequest(t, "/api/books/"+bookID+"/cover", fieldName, filename, contentType, payload)
		h.UploadCover(ctx)
		return rec
	}

	// Missing book -> 404
	if rec := uploadCover("missing", "file", "cover.png", "image/png", makeEncodedPNG(t, 40, 60)); rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing book, got %d", rec.Code)
	}
	// Missing file field -> 400
	if rec := uploadCover("cov-1", "", "", "", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing file, got %d", rec.Code)
	}
	// Empty file -> 400
	if rec := uploadCover("cov-1", "file", "empty.png", "image/png", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty cover, got %d", rec.Code)
	}
	// Unsupported ext -> 400
	if rec := uploadCover("cov-1", "file", "cover.gif", "image/gif", []byte("GIF89a123456")); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsupported format, got %d", rec.Code)
	}
	// Content mismatch (plain text named .png / .jpg / .webp) -> 400
	if rec := uploadCover("cov-1", "file", "fake.png", "image/png", []byte("not a png image")); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for mismatched png magic bytes, got %d", rec.Code)
	}
	if rec := uploadCover("cov-1", "file", "fake.jpg", "image/jpeg", []byte("not a jpeg image")); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for mismatched jpeg magic bytes, got %d", rec.Code)
	}
	if rec := uploadCover("cov-1", "file", "fake.webp", "image/webp", []byte("not a webp image")); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for mismatched webp magic bytes, got %d", rec.Code)
	}

	// Valid large JPEG triggers thumbnail generation (> coverThumbnailMaxWidth)
	largeJPEG := makeEncodedJPEG(t, 800, 1200)
	rec1 := uploadCover("cov-1", "file", "cover.jpg", "image/jpeg", largeJPEG)
	if rec1.Code != http.StatusOK {
		t.Fatalf("expected 200 uploading large JPEG cover, got %d body=%s", rec1.Code, rec1.Body.String())
	}
	var bookAfterJPEG models.Book
	if err := json.Unmarshal(rec1.Body.Bytes(), &bookAfterJPEG); err != nil {
		t.Fatalf("unmarshal cover response failed: %v", err)
	}
	if bookAfterJPEG.CoverPath == "" || bookAfterJPEG.CoverThumbPath == "" {
		t.Fatalf("expected both cover_path and cover_thumb_path, got %+v", bookAfterJPEG)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, bookAfterJPEG.CoverPath)); err != nil {
		t.Fatalf("expected cover file on disk: %v", err)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, bookAfterJPEG.CoverThumbPath)); err != nil {
		t.Fatalf("expected thumbnail file on disk: %v", err)
	}

	// Replace with small PNG (no filename extension -> inferred from Content-Type) and verify old files cleaned up
	smallPNG := makeEncodedPNG(t, 120, 180)
	rec2 := uploadCover("cov-1", "file", "cover", "image/png", smallPNG)
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 replacing with PNG, got %d body=%s", rec2.Code, rec2.Body.String())
	}
	var bookAfterPNG models.Book
	if err := json.Unmarshal(rec2.Body.Bytes(), &bookAfterPNG); err != nil {
		t.Fatalf("unmarshal PNG response failed: %v", err)
	}
	if bookAfterPNG.CoverPath == bookAfterJPEG.CoverPath || !strings.HasSuffix(bookAfterPNG.CoverPath, ".png") {
		t.Fatalf("expected new .png cover path, got %q", bookAfterPNG.CoverPath)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, bookAfterJPEG.CoverPath)); !os.IsNotExist(err) {
		t.Fatalf("expected previous cover file removed, stat err=%v", err)
	}

	// Replace with WebP
	rec3 := uploadCover("cov-1", "file", "cover", "image/webp", makeMinimalWebP())
	if rec3.Code != http.StatusOK {
		t.Fatalf("expected 200 replacing with WebP, got %d body=%s", rec3.Code, rec3.Body.String())
	}
	// Also test prepareCoverThumbnail helper directly
	if thumb := h.prepareCoverThumbnail("cov-1", bookAfterPNG.CoverPath); thumb != "" {
		t.Fatalf("expected empty thumb for already-removed file, got %q", thumb)
	}
}

func TestBooksSearchDeleteBatchDeleteGetFileAndStatus(t *testing.T) {
	h, db, uploadDir := newCoverageBooksHandler(t)
	book1 := seedHandlerBook(t, db, "s1", "红楼梦", "曹雪芹", "s1.epub", nil)
	book1.ContentHash = "hash-s1"
	if err := db.SaveBook(book1); err != nil {
		t.Fatalf("resave book1 failed: %v", err)
	}
	seedHandlerBook(t, db, "s2", "西游记", "吴承恩", "s2.epub", nil)
	seedHandlerBook(t, db, "s3", "水浒传", "施耐庵", "s3.epub", nil)

	if err := os.WriteFile(filepath.Join(uploadDir, "s1.epub"), []byte("epub-bytes-content"), 0644); err != nil {
		t.Fatalf("write s1.epub failed: %v", err)
	}

	// Search validation & query
	searchReq := func(rawQuery string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/search?"+rawQuery, nil)
		h.Search(ctx)
		return rec
	}
	if rec := searchReq("q="); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on empty query, got %d", rec.Code)
	}
	if rec := searchReq("q=" + strings.Repeat("a", maxBookSearchQueryRunes+1)); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on overly long query, got %d", rec.Code)
	}
	if rec := searchReq("q=红楼&limit=0"); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on non-positive limit, got %d", rec.Code)
	}
	if rec := searchReq("q=红楼&limit=999"); rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on valid search with capped limit, got %d body=%s", rec.Code, rec.Body.String())
	}

	// Status validation
	statusReq := func(rawQuery string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/status?"+rawQuery, nil)
		h.Status(ctx)
		return rec
	}
	if rec := statusReq(""); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on empty status ids, got %d", rec.Code)
	}
	if rec := statusReq("book_ids=s1,s2"); rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on status book_ids, got %d body=%s", rec.Code, rec.Body.String())
	}

	// GetFile: 200, 304 on ETag match, 404 on missing file, 404 on missing book
	fileRec := httptest.NewRecorder()
	fileCtx, _ := gin.CreateTestContext(fileRec)
	fileCtx.Params = gin.Params{{Key: "id", Value: "s1"}}
	fileCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/s1/file", nil)
	h.GetFile(fileCtx)
	if fileRec.Code != http.StatusOK || fileRec.Body.String() != "epub-bytes-content" {
		t.Fatalf("unexpected GetFile response: code=%d body=%q", fileRec.Code, fileRec.Body.String())
	}
	etag := fileRec.Header().Get("ETag")
	if etag == "" {
		t.Fatalf("expected ETag header on GetFile")
	}

	notModRec := httptest.NewRecorder()
	notModCtx, _ := gin.CreateTestContext(notModRec)
	notModCtx.Params = gin.Params{{Key: "id", Value: "s1"}}
	notModCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/s1/file", nil)
	notModCtx.Request.Header.Set("If-None-Match", etag)
	h.GetFile(notModCtx)
	if notModRec.Code != http.StatusNotModified {
		t.Fatalf("expected 304 on ETag match, got %d", notModRec.Code)
	}

	missingFileRec := httptest.NewRecorder()
	missingFileCtx, _ := gin.CreateTestContext(missingFileRec)
	missingFileCtx.Params = gin.Params{{Key: "id", Value: "s2"}}
	missingFileCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/s2/file", nil)
	h.GetFile(missingFileCtx)
	if missingFileRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when backing file missing, got %d", missingFileRec.Code)
	}

	missingBookRec := httptest.NewRecorder()
	missingBookCtx, _ := gin.CreateTestContext(missingBookRec)
	missingBookCtx.Params = gin.Params{{Key: "id", Value: "unknown"}}
	missingBookCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/unknown/file", nil)
	h.GetFile(missingBookCtx)
	if missingBookRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown book file, got %d", missingBookRec.Code)
	}

	// Single Delete (removes file) + 404
	delRec := httptest.NewRecorder()
	delCtx, _ := gin.CreateTestContext(delRec)
	delCtx.Params = gin.Params{{Key: "id", Value: "s1"}}
	delCtx.Request = httptest.NewRequest(http.MethodDelete, "/api/books/s1", nil)
	h.Delete(delCtx)
	if delRec.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting s1, got %d", delRec.Code)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, "s1.epub")); !os.IsNotExist(err) {
		t.Fatalf("expected s1.epub deleted from disk, err=%v", err)
	}
	delMissRec := httptest.NewRecorder()
	delMissCtx, _ := gin.CreateTestContext(delMissRec)
	delMissCtx.Params = gin.Params{{Key: "id", Value: "s1"}}
	delMissCtx.Request = httptest.NewRequest(http.MethodDelete, "/api/books/s1", nil)
	h.Delete(delMissCtx)
	if delMissRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 deleting already-deleted book, got %d", delMissRec.Code)
	}

	// BatchDelete validation + success
	batchDel := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/books/batch/delete", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		h.BatchDelete(ctx)
		return rec
	}
	if rec := batchDel(`{bad`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid json, got %d", rec.Code)
	}
	if rec := batchDel(`{"ids":[]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on empty ids, got %d", rec.Code)
	}
	if rec := batchDel(`{"ids":["s2","missing"]}`); rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on missing book in batch delete, got %d", rec.Code)
	}
	if rec := batchDel(`{"ids":["s2","s3","s2"]}`); rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on batch delete, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestProgressHandlerListFiltersAndValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	ph := NewProgressHandler(db)

	seedHandlerBook(t, db, "p1", "书1", "作者1", "p1.epub", nil)
	seedHandlerBook(t, db, "p2", "书2", "作者2", "p2.epub", nil)

	t1 := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	if err := db.SaveProgress(&models.Progress{UserID: storage.PersonalLibrary, BookID: "p1", CFI: "cfi-1", Percentage: 20, UpdatedAt: t1}, storage.PersonalLibrary); err != nil {
		t.Fatalf("SaveProgress p1 failed: %v", err)
	}
	if err := db.SaveProgress(&models.Progress{UserID: storage.PersonalLibrary, BookID: "p2", CFI: "cfi-2", Percentage: 80, UpdatedAt: t2}, storage.PersonalLibrary); err != nil {
		t.Fatalf("SaveProgress p2 failed: %v", err)
	}

	callList := func(rawQuery string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		target := "/api/progress"
		if rawQuery != "" {
			target += "?" + rawQuery
		}
		ctx.Request = httptest.NewRequest(http.MethodGet, target, nil)
		ph.List(ctx)
		return rec
	}

	// Both book_ids and updated_since -> 400
	if rec := callList("book_ids=p1&updated_since=2026-11-21T00:00:00Z"); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when both book_ids and updated_since set, got %d", rec.Code)
	}
	// Empty book_ids -> 400
	if rec := callList("book_ids="); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on empty book_ids, got %d", rec.Code)
	}
	// >100 book_ids -> 400
	many := make([]string, maxProgressBookIDs+1)
	for i := range many {
		many[i] = fmt.Sprintf("b%d", i)
	}
	if rec := callList("book_ids=" + strings.Join(many, ",")); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on >100 book_ids, got %d", rec.Code)
	}
	// Invalid RFC3339 updated_since -> 400
	if rec := callList("updated_since=not-a-timestamp"); rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid updated_since, got %d", rec.Code)
	}

	// Default list all
	allRec := callList("")
	if allRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on list all, got %d", allRec.Code)
	}
	var allItems []models.Progress
	if err := json.Unmarshal(allRec.Body.Bytes(), &allItems); err != nil || len(allItems) != 2 {
		t.Fatalf("expected 2 progress records, got len=%d body=%s", len(allItems), allRec.Body.String())
	}

	// Filter by book_ids
	byIDsRec := callList("book_ids=p1")
	if byIDsRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on book_ids filter, got %d", byIDsRec.Code)
	}
	var byIDs []models.Progress
	if err := json.Unmarshal(byIDsRec.Body.Bytes(), &byIDs); err != nil || len(byIDs) != 1 || byIDs[0].BookID != "p1" {
		t.Fatalf("unexpected book_ids response: %s", byIDsRec.Body.String())
	}

	// Filter by updated_since
	sinceRec := callList("updated_since=2026-11-22T00:00:00Z")
	if sinceRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on updated_since filter, got %d", sinceRec.Code)
	}
	var sinceItems []models.Progress
	if err := json.Unmarshal(sinceRec.Body.Bytes(), &sinceItems); err != nil || len(sinceItems) != 1 || sinceItems[0].BookID != "p2" {
		t.Fatalf("unexpected updated_since response: %s", sinceRec.Body.String())
	}
}

func TestTTSHandlerClose(t *testing.T) {
	h := NewTTSHandler()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := h.Close(ctx); err != nil {
		t.Fatalf("expected TTSHandler.Close to succeed, got %v", err)
	}
}
