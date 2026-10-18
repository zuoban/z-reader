package handlers

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"go.etcd.io/bbolt"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func TestBookCategoryCursorAndSearchFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)
	category := "Fiction"
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", Title: "Shared Alpha", Category: &category},
		{ID: "b", UserID: "u", Title: "Shared Beta"},
		{ID: "c", UserID: "v", Title: "Shared Another", Category: &category},
		{ID: "d", UserID: "u", Title: "Shared Delta", Category: &category},
	} {
		if err := db.SaveBook(&book); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct {
		url    string
		search bool
		want   string
		cursor string
	}{
		{"/books?limit=1&sort=title&category=Fiction", false, "a", "a"},
		{"/books?limit=1&sort=title&category=Fiction&cursor=a", false, "d", ""},
		{"/books?limit=10&sort=title&uncategorized=true", false, "b", ""},
		{"/books/search?q=Shared&limit=10&sort=title&uncategorized=true", true, "b", ""},
		{"/books/search?q=Shared&limit=1&sort=title&category=Fiction&cursor=a", true, "d", ""},
	}
	for _, tc := range cases {
		t.Run(tc.url, func(t *testing.T) {
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Set("userID", "u")
			ctx.Request = httptest.NewRequest("GET", tc.url, nil)
			if tc.search {
				handler.Search(ctx)
			} else {
				handler.List(ctx)
			}
			var page bookCursorPageResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
				t.Fatal(err)
			}
			if rec.Code != 200 || len(page.Books) != 1 || page.Books[0].ID != tc.want || page.NextCursor != tc.cursor {
				t.Fatalf("response = %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestBookStatusBatchesOnlyOwnedIDs(t *testing.T) {
	db := openHandlerTestDB(t)
	handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", ProcessingState: models.BookProcessingPending},
		{ID: "b", UserID: "v", ProcessingState: models.BookProcessingReady},
	} {
		if err := db.SaveBook(&book); err != nil {
			t.Fatal(err)
		}
	}
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Set("userID", "u")
	ctx.Request = httptest.NewRequest("GET", "/books/status?book_ids=a,b,a,missing", nil)
	handler.Status(ctx)
	var page bookCursorPageResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || len(page.Books) != 1 || page.Books[0].ID != "a" {
		t.Fatalf("status response = %d %s", rec.Code, rec.Body.String())
	}
}

func TestDuplicateMissDoesNotReadKnownHashLibraryRecords(t *testing.T) {
	db := openHandlerTestDB(t)
	handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)
	if err := db.SaveBook(&models.Book{ID: "known", UserID: "u", ContentHash: "known"}); err != nil {
		t.Fatal(err)
	}
	if err := db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(storage.BooksBucket).Put([]byte("known"), []byte("invalid"))
	}); err != nil {
		t.Fatal(err)
	}
	book, err := handler.findDuplicateBook("u", "new-hash")
	if err != nil || book != nil {
		t.Fatalf("duplicate miss = %+v, %v", book, err)
	}
}

func TestLegacyHashBackfillStartsFromDurableBacklogAndRetriesMissingFiles(t *testing.T) {
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(uploadDir, "legacy.epub"), []byte("legacy content"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, book := range []models.Book{
		{ID: "a", UserID: "u", Filename: "legacy.epub"},
		{ID: "b", UserID: "u", Filename: "restored.epub"},
	} {
		if err := db.SaveBook(&book); err != nil {
			t.Fatal(err)
		}
	}
	// The constructor resumes the durable backlog without an upload request.
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)
	deadline := time.Now().Add(3 * time.Second)
	for {
		book, err := db.GetBook("a")
		if err != nil {
			t.Fatal(err)
		}
		if book.ContentHash != "" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("startup backfill did not resume")
		}
		time.Sleep(10 * time.Millisecond)
	}
	owner := "u"
	pending, _, err := db.ListBooksMissingHash(&owner, "", 16)
	if err != nil || len(pending) != 1 || pending[0].ID != "b" {
		t.Fatalf("retry backlog = %+v, %v", pending, err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, "restored.epub"), []byte("restored content"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := handler.legacyHashes.catchUp("u"); err != nil {
		t.Fatal(err)
	}
	pending, _, err = db.ListBooksMissingHash(&owner, "", 16)
	if err != nil || len(pending) != 0 {
		t.Fatalf("restored backlog = %+v, %v", pending, err)
	}
}

func TestRenameCategoryUsesWholeOwnedCategoryBeyondFirstPage(t *testing.T) {
	db := openHandlerTestDB(t)
	source, other := "Source", "Other"
	for i := 0; i < 61; i++ {
		book := &models.Book{ID: fmt.Sprintf("owned-%03d", i), UserID: "u", Title: fmt.Sprintf("Book %03d", i), Category: &source, ContentHash: fmt.Sprintf("hash-%d", i)}
		if err := db.SaveBook(book); err != nil {
			t.Fatal(err)
		}
	}
	for _, book := range []models.Book{
		{ID: "foreign", UserID: "v", Title: "Foreign", Category: &source, ContentHash: "foreign"},
		{ID: "unrelated", UserID: "u", Title: "Unrelated", Category: &other, ContentHash: "other"},
	} {
		if err := db.SaveBook(&book); err != nil {
			t.Fatal(err)
		}
	}
	// A different category must not be decoded while renaming this one.
	if err := db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(storage.BooksBucket).Put([]byte("unrelated"), []byte("invalid"))
	}); err != nil {
		t.Fatal(err)
	}
	handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)
	call := func(body string) []string {
		t.Helper()
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Set("userID", "u")
		ctx.Request = httptest.NewRequest("PATCH", "/api/books/categories", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		handler.RenameCategory(ctx)
		var result struct {
			UpdatedIDs []string `json:"updated_ids"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if rec.Code != 200 || len(result.UpdatedIDs) != 61 {
			t.Fatalf("category response = %d %s", rec.Code, rec.Body.String())
		}
		for _, id := range result.UpdatedIDs {
			if !strings.HasPrefix(id, "owned-") {
				t.Fatalf("updated unowned or unrelated ID %q", id)
			}
		}
		return result.UpdatedIDs
	}
	call(`{"from":" Source ","to":" Destination "}`)
	summary, err := db.GetBookLibrarySummary("u")
	if err != nil || summary.Categories["Destination"] != 61 || summary.Categories["Source"] != 0 || summary.Categories[other] != 1 {
		t.Fatalf("renamed summary = %+v, %v", summary, err)
	}
	call(`{"from":"Destination","to":null}`)
	summary, err = db.GetBookLibrarySummary("u")
	if err != nil || summary.Uncategorized != 61 || summary.Categories["Destination"] != 0 {
		t.Fatalf("removed summary = %+v, %v", summary, err)
	}
	foreign, err := db.GetBook("foreign")
	if err != nil || foreign.Category == nil || *foreign.Category != source {
		t.Fatalf("foreign category changed: %+v, %v", foreign, err)
	}
}

func TestRenameCategoryValidatesSourceAndDestination(t *testing.T) {
	db := openHandlerTestDB(t)
	handler := newBooksHandler(t, &config.Config{UploadDir: t.TempDir()}, db)
	for _, body := range []string{
		`{"from":" ","to":null}`,
		`{"from":"Source"}`,
		fmt.Sprintf(`{"from":"%s","to":null}`, strings.Repeat("x", 51)),
		fmt.Sprintf(`{"from":"Source","to":"%s"}`, strings.Repeat("x", 51)),
	} {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Set("userID", "u")
		ctx.Request = httptest.NewRequest("PATCH", "/api/books/categories", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		handler.RenameCategory(ctx)
		if rec.Code != 400 {
			t.Fatalf("invalid request %s: %d %s", body, rec.Code, rec.Body.String())
		}
	}
}
