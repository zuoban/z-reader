package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func setupBookmarksTestDB(t *testing.T) (*storage.DB, string) {
	t.Helper()

	db := openHandlerTestDB(t)
	userID := "bookmark-user"
	book := &models.Book{
		ID:        "book-bookmark",
		UserID:    userID,
		Title:     "Test Book",
		Filename:  "test.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	return db, userID
}

func TestBookmarksCreateAndList(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2!/4/2/6)","percentage":42.5,"chapter":"第一章"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-bookmark"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/books/book-bookmark/bookmarks", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var created models.Bookmark
	if err := json.Unmarshal(recorder.Body.Bytes(), &created); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if created.ID == "" || created.CFI != "epubcfi(/6/2!/4/2/6)" || created.Chapter != "第一章" {
		t.Fatalf("unexpected bookmark: %+v", created)
	}

	listRecorder := httptest.NewRecorder()
	listCtx, _ := gin.CreateTestContext(listRecorder)
	listCtx.Set("userID", userID)
	listCtx.Params = gin.Params{{Key: "id", Value: "book-bookmark"}}
	listCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/book-bookmark/bookmarks", nil)

	handler.List(listCtx)

	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", listRecorder.Code, listRecorder.Body.String())
	}

	var bookmarks []models.Bookmark
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &bookmarks); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}
	if len(bookmarks) != 1 || bookmarks[0].ID != created.ID {
		t.Fatalf("expected created bookmark in list, got %+v", bookmarks)
	}
}

func TestBookmarksDelete(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupBookmarksTestDB(t)
	bookmark := &models.Bookmark{
		ID:         "bookmark-delete",
		BookID:     "book-bookmark",
		CFI:        "epubcfi(/6/2)",
		Percentage: 12,
		CreatedAt:  time.Now().UTC(),
	}
	if err := db.SaveBookmark(bookmark, userID); err != nil {
		t.Fatalf("failed to save bookmark: %v", err)
	}

	handler := NewBookmarksHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{
		{Key: "id", Value: "book-bookmark"},
		{Key: "bookmarkID", Value: "bookmark-delete"},
	}
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/books/book-bookmark/bookmarks/bookmark-delete", nil)

	handler.Delete(ctx)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	bookmarks, err := db.ListBookmarks("book-bookmark", userID)
	if err != nil {
		t.Fatalf("ListBookmarks returned error: %v", err)
	}
	if len(bookmarks) != 0 {
		t.Fatalf("expected bookmark to be deleted, got %+v", bookmarks)
	}
}

func TestBookmarksRejectOtherUsersBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2)","percentage":10}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "other-user")
	ctx.Params = gin.Params{{Key: "id", Value: "book-bookmark"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/books/book-bookmark/bookmarks", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}
