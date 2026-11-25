package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

func setupBookmarksTestDB(t *testing.T) (*storage.DB, string) {
	t.Helper()

	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary
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

	db, _ := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	body := bytes.NewBufferString(`{"cfi":"  epubcfi(/6/2!/4/2/6)  ","percentage":42.5,"chapter":"  第一章  ","note":"  初始备注  "}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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
	if created.ID == "" || created.CFI != "epubcfi(/6/2!/4/2/6)" || created.Chapter != "第一章" || created.Note != "初始备注" {
		t.Fatalf("unexpected bookmark: %+v", created)
	}

	listRecorder := httptest.NewRecorder()
	listCtx, _ := gin.CreateTestContext(listRecorder)

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
	if len(bookmarks) != 1 || bookmarks[0].ID != created.ID || bookmarks[0].Note != "初始备注" {
		t.Fatalf("expected created bookmark in list, got %+v", bookmarks)
	}
}

func TestBookmarksListMissingBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "missing-book"}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/missing-book/bookmarks", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	var errResp response.ErrorResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if errResp.Message != "书籍不存在" {
		t.Fatalf("expected error message 书籍不存在, got %q", errResp.Message)
	}
}

func TestBookmarksCreateValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	tests := []struct {
		name           string
		body           string
		maxBytes       int64
		expectedStatus int
		expectedMsg    string
	}{
		{
			name:           "invalid JSON",
			body:           `{"cfi":`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "请求内容无效",
		},
		{
			name:           "body too large",
			body:           `{"cfi":"epubcfi(/6/2)","percentage":10,"note":"1234567890"}`,
			maxBytes:       16,
			expectedStatus: http.StatusRequestEntityTooLarge,
			expectedMsg:    "请求体过大",
		},
		{
			name:           "missing CFI",
			body:           `{"cfi":"   ","percentage":10}`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "缺少书签位置",
		},
		{
			name:           "CFI too long",
			body:           `{"cfi":"` + strings.Repeat("a", maxBookmarkCFIRunes+1) + `","percentage":10}`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "书签位置过长",
		},
		{
			name:           "chapter too long",
			body:           `{"cfi":"epubcfi(/6/2)","chapter":"` + strings.Repeat("章", maxBookmarkChapterRunes+1) + `","percentage":10}`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "章节名称过长",
		},
		{
			name:           "note too long",
			body:           `{"cfi":"epubcfi(/6/2)","note":"` + strings.Repeat("注", maxBookmarkNoteRunes+1) + `","percentage":10}`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "书签备注过长",
		},
		{
			name:           "percentage below zero",
			body:           `{"cfi":"epubcfi(/6/2)","percentage":-0.1}`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "书签进度必须在 0 到 100 之间",
		},
		{
			name:           "percentage above hundred",
			body:           `{"cfi":"epubcfi(/6/2)","percentage":100.1}`,
			expectedStatus: http.StatusBadRequest,
			expectedMsg:    "书签进度必须在 0 到 100 之间",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Params = gin.Params{{Key: "id", Value: "book-bookmark"}}

			req := httptest.NewRequest(http.MethodPost, "/api/books/book-bookmark/bookmarks", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			if tc.maxBytes > 0 {
				req.Body = http.MaxBytesReader(recorder, req.Body, tc.maxBytes)
			}
			ctx.Request = req

			handler.Create(ctx)

			if recorder.Code != tc.expectedStatus {
				t.Fatalf("expected status %d, got %d body=%s", tc.expectedStatus, recorder.Code, recorder.Body.String())
			}
			if tc.expectedStatus == http.StatusRequestEntityTooLarge {
				var payload map[string]string
				if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
					t.Fatalf("failed to decode 413 response: %v", err)
				}
				if payload["error"] != tc.expectedMsg {
					t.Fatalf("expected error %q, got %q", tc.expectedMsg, payload["error"])
				}
				return
			}
			var errResp response.ErrorResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
				t.Fatalf("failed to decode error response: %v", err)
			}
			if errResp.Message != tc.expectedMsg {
				t.Fatalf("expected message %q, got %q", tc.expectedMsg, errResp.Message)
			}
		})
	}
}

func TestBookmarksUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupBookmarksTestDB(t)
	createdAt := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	initial := &models.Bookmark{
		ID:         "bookmark-edit",
		BookID:     "book-bookmark",
		CFI:        "epubcfi(/6/4!/4/2)",
		Percentage: 55.5,
		Chapter:    "第二章",
		Note:       "旧备注",
		CreatedAt:  createdAt,
	}
	if err := db.SaveBookmark(initial, userID); err != nil {
		t.Fatalf("failed to save bookmark: %v", err)
	}

	handler := NewBookmarksHandler(db)

	t.Run("success trims note and persists", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "book-bookmark"},
			{Key: "bookmarkID", Value: "bookmark-edit"},
		}
		ctx.Request = httptest.NewRequest(
			http.MethodPatch,
			"/api/books/book-bookmark/bookmarks/bookmark-edit",
			strings.NewReader(`{"note":"  更新后的备注  "}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		handler.Update(ctx)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
		}

		var updated models.Bookmark
		if err := json.Unmarshal(recorder.Body.Bytes(), &updated); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if updated.ID != initial.ID || updated.BookID != initial.BookID || updated.CFI != initial.CFI ||
			updated.Percentage != initial.Percentage || updated.Chapter != initial.Chapter ||
			!updated.CreatedAt.Equal(createdAt) {
			t.Fatalf("unexpected non-note fields after update: %+v", updated)
		}
		if updated.Note != "更新后的备注" {
			t.Fatalf("expected trimmed note 更新后的备注, got %q", updated.Note)
		}

		list, err := db.ListBookmarks("book-bookmark", userID)
		if err != nil {
			t.Fatalf("ListBookmarks failed: %v", err)
		}
		if len(list) != 1 || list[0].Note != "更新后的备注" {
			t.Fatalf("expected persisted updated note, got %+v", list)
		}
	})

	t.Run("clear note with whitespace", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "book-bookmark"},
			{Key: "bookmarkID", Value: "bookmark-edit"},
		}
		ctx.Request = httptest.NewRequest(
			http.MethodPatch,
			"/api/books/book-bookmark/bookmarks/bookmark-edit",
			strings.NewReader(`{"note":"   "}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		handler.Update(ctx)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
		}

		var updated models.Bookmark
		if err := json.Unmarshal(recorder.Body.Bytes(), &updated); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if updated.Note != "" {
			t.Fatalf("expected cleared note, got %q", updated.Note)
		}

		list, err := db.ListBookmarks("book-bookmark", userID)
		if err != nil {
			t.Fatalf("ListBookmarks failed: %v", err)
		}
		if len(list) != 1 || list[0].Note != "" {
			t.Fatalf("expected persisted cleared note, got %+v", list)
		}
	})

	t.Run("note too long", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "book-bookmark"},
			{Key: "bookmarkID", Value: "bookmark-edit"},
		}
		tooLongNote := strings.Repeat("评", maxBookmarkNoteRunes+1)
		ctx.Request = httptest.NewRequest(
			http.MethodPatch,
			"/api/books/book-bookmark/bookmarks/bookmark-edit",
			strings.NewReader(`{"note":"`+tooLongNote+`"}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		handler.Update(ctx)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
		}
		var errResp response.ErrorResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("failed to decode error response: %v", err)
		}
		if errResp.Message != "书签备注过长" {
			t.Fatalf("expected message 书签备注过长, got %q", errResp.Message)
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "book-bookmark"},
			{Key: "bookmarkID", Value: "bookmark-edit"},
		}
		ctx.Request = httptest.NewRequest(
			http.MethodPatch,
			"/api/books/book-bookmark/bookmarks/bookmark-edit",
			strings.NewReader(`{"note":`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		handler.Update(ctx)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
		}
		var errResp response.ErrorResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("failed to decode error response: %v", err)
		}
		if errResp.Message != "请求内容无效" {
			t.Fatalf("expected message 请求内容无效, got %q", errResp.Message)
		}
	})

	t.Run("body too large", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "book-bookmark"},
			{Key: "bookmarkID", Value: "bookmark-edit"},
		}
		req := httptest.NewRequest(
			http.MethodPatch,
			"/api/books/book-bookmark/bookmarks/bookmark-edit",
			strings.NewReader(`{"note":"0123456789abcdef0123456789"}`),
		)
		req.Header.Set("Content-Type", "application/json")
		req.Body = http.MaxBytesReader(recorder, req.Body, 12)
		ctx.Request = req

		handler.Update(ctx)

		if recorder.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("expected status 413, got %d body=%s", recorder.Code, recorder.Body.String())
		}
		var payload map[string]string
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatalf("failed to decode 413 response: %v", err)
		}
		if payload["error"] != "请求体过大" {
			t.Fatalf("expected error 请求体过大, got %q", payload["error"])
		}
	})

	t.Run("missing book", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "missing-book"},
			{Key: "bookmarkID", Value: "bookmark-edit"},
		}
		ctx.Request = httptest.NewRequest(
			http.MethodPatch,
			"/api/books/missing-book/bookmarks/bookmark-edit",
			strings.NewReader(`{"note":"test"}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		handler.Update(ctx)

		if recorder.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
		}
		var errResp response.ErrorResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("failed to decode error response: %v", err)
		}
		if errResp.Message != "书签不存在" {
			t.Fatalf("expected message 书签不存在, got %q", errResp.Message)
		}
	})

	t.Run("missing bookmark", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = gin.Params{
			{Key: "id", Value: "book-bookmark"},
			{Key: "bookmarkID", Value: "missing-bookmark"},
		}
		ctx.Request = httptest.NewRequest(
			http.MethodPatch,
			"/api/books/book-bookmark/bookmarks/missing-bookmark",
			strings.NewReader(`{"note":"test"}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		handler.Update(ctx)

		if recorder.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
		}
		var errResp response.ErrorResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("failed to decode error response: %v", err)
		}
		if errResp.Message != "书签不存在" {
			t.Fatalf("expected message 书签不存在, got %q", errResp.Message)
		}
	})
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

func TestBookmarksDeleteNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	cases := []struct {
		name       string
		bookID     string
		bookmarkID string
	}{
		{name: "missing book", bookID: "missing-book", bookmarkID: "bm-1"},
		{name: "missing bookmark", bookID: "book-bookmark", bookmarkID: "missing-bm"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Params = gin.Params{
				{Key: "id", Value: tc.bookID},
				{Key: "bookmarkID", Value: tc.bookmarkID},
			}
			ctx.Request = httptest.NewRequest(
				http.MethodDelete,
				"/api/books/"+tc.bookID+"/bookmarks/"+tc.bookmarkID,
				nil,
			)

			handler.Delete(ctx)

			if recorder.Code != http.StatusNotFound {
				t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
			}
			var errResp response.ErrorResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &errResp); err != nil {
				t.Fatalf("failed to decode error response: %v", err)
			}
			if errResp.Message != "书签不存在" {
				t.Fatalf("expected message 书签不存在, got %q", errResp.Message)
			}
		})
	}
}

func TestBookmarksRejectMissingBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupBookmarksTestDB(t)
	handler := NewBookmarksHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2)","percentage":10}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Params = gin.Params{{Key: "id", Value: "missing"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/books/missing/bookmarks", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}
