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

func setupProgressTestDB(t *testing.T) (*storage.DB, string) {
	t.Helper()

	db := openHandlerTestDB(t)
	userID := "progress-user"

	book := &models.Book{
		ID:        "book-progress",
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

func TestProgressSaveCreatesNewRecord(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2!/4/2/6)","percentage":25.5}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp models.Progress
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.CFI != "epubcfi(/6/2!/4/2/6)" || resp.Percentage != 25.5 {
		t.Fatalf("unexpected progress: %+v", resp)
	}
}

func TestProgressSaveUpdatesExistingRecord(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)

	// First save
	initial := &models.Progress{
		BookID:     "book-progress",
		CFI:        "epubcfi(/6/2!/4/2/6)",
		Percentage: 10,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}
	if err := db.SaveProgress(initial, userID); err != nil {
		t.Fatalf("failed to save initial progress: %v", err)
	}

	handler := NewProgressHandler(db)

	// Update
	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/4!/4/2/8)","percentage":50}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	// Verify in DB
	got, err := db.GetProgress("book-progress", userID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if got == nil || got.CFI != "epubcfi(/6/4!/4/2/8)" || got.Percentage != 50 {
		t.Fatalf("expected updated progress, got %+v", got)
	}
}

func TestProgressSaveRejectsMissingCFI(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"","percentage":25}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestProgressSaveRejectsInvalidPercentage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	tests := []struct {
		name       string
		percentage float64
	}{
		{"negative", -1},
		{"over 100", 101},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2)","percentage":` + string(rune('0'+int(tt.percentage))) + `}`)
			// Use JSON for precise float values
			payload, _ := json.Marshal(map[string]interface{}{
				"cfi":        "epubcfi(/6/2)",
				"percentage": tt.percentage,
			})
			body = bytes.NewBuffer(payload)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("userID", userID)
			ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
			ctx.Request.Header.Set("Content-Type", "application/json")

			handler.Save(ctx)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("expected status 400 for percentage=%f, got %d body=%s", tt.percentage, recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestProgressSaveRejectsMissingBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2)","percentage":25}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "nonexistent-book"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/nonexistent-book", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

// NOTE: The handler comment says it supports form-encoded data for sendBeacon,
// but ProgressRequest struct lacks `form` tags, so form binding does not work.
// This is a known limitation of the current implementation.

func TestProgressSaveAcceptsBoundaryPercentages(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	tests := []struct {
		percentage float64
	}{
		{0},
		{100},
	}

	for _, tt := range tests {
		t.Run(string(rune(int(tt.percentage))), func(t *testing.T) {
			payload, _ := json.Marshal(map[string]interface{}{
				"cfi":        "epubcfi(/6/2)",
				"percentage": tt.percentage,
			})
			body := bytes.NewBuffer(payload)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("userID", userID)
			ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
			ctx.Request.Header.Set("Content-Type", "application/json")

			handler.Save(ctx)

			if recorder.Code != http.StatusOK {
				t.Fatalf("expected status 200 for percentage=%f, got %d body=%s", tt.percentage, recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestProgressGetReturnsExistingProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)

	progress := &models.Progress{
		BookID:     "book-progress",
		CFI:        "epubcfi(/6/4!/4/2/8)",
		Percentage: 42.5,
		UpdatedAt:  time.Now().UTC().Truncate(time.Second),
	}
	if err := db.SaveProgress(progress, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	handler := NewProgressHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/progress/book-progress", nil)

	handler.Get(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["cfi"] != "epubcfi(/6/4!/4/2/8)" {
		t.Fatalf("expected cfi epubcfi(/6/4!/4/2/8), got %v", resp["cfi"])
	}
}

func TestProgressGetReturnsEmptyForNoProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/progress/book-progress", nil)

	handler.Get(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["cfi"] != "" || resp["percentage"] != float64(0) {
		t.Fatalf("expected empty progress, got %+v", resp)
	}
}

func TestProgressGetReturnsNotFoundForMissingBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "nonexistent"}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/progress/nonexistent", nil)

	handler.Get(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestProgressListReturnsAllForUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)

	// Create books for user-a
	for i := 0; i < 3; i++ {
		book := &models.Book{
			ID:        "list-book",
			UserID:    "user-a",
			Title:     "Book",
			Filename:  "book.epub",
			Format:    "epub",
			Size:      128,
			CreatedAt: time.Now().UTC(),
		}
		book.ID = "book-list" + string(rune('0'+i))
		if err := db.SaveBook(book); err != nil {
			t.Fatalf("failed to save book: %v", err)
		}
		if err := db.SaveProgress(&models.Progress{
			BookID:     book.ID,
			CFI:        "epubcfi(/6/2)",
			Percentage: float64(i * 25),
			UpdatedAt:  time.Now().UTC().Truncate(time.Second),
		}, "user-a"); err != nil {
			t.Fatalf("failed to save progress: %v", err)
		}
	}

	handler := NewProgressHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "user-a")
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/progress", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var items []models.Progress
	if err := json.Unmarshal(recorder.Body.Bytes(), &items); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 progress records, got %d", len(items))
	}
}

func TestProgressSaveRejectsMissingUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2)","percentage":25}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	// No userID set
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestProgressSaveRejectsInvalidRequestBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	// Invalid JSON
	body := bytes.NewBufferString(`{invalid json}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestProgressSaveOwnBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewProgressHandler(db)

	// Create a book for user-a
	book := &models.Book{
		ID:        "my-book",
		UserID:    "user-a",
		Title:     "My Book",
		Filename:  "my.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	// user-b tries to save progress on user-a's book
	payload, _ := json.Marshal(map[string]interface{}{
		"cfi":        "epubcfi(/6/2)",
		"percentage": 25,
	})
	body := bytes.NewBuffer(payload)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "user-b")
	ctx.Params = gin.Params{{Key: "id", Value: "my-book"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/my-book", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	// Should fail because the book doesn't belong to user-b
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestProgressGetOwnBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)

	// Create book for user-a
	book := &models.Book{
		ID:        "own-book",
		UserID:    "user-a",
		Title:     "Own Book",
		Filename:  "own.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	handler := NewProgressHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "user-a")
	ctx.Params = gin.Params{{Key: "id", Value: "own-book"}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/progress/own-book", nil)

	handler.Get(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["book_id"] != "own-book" {
		t.Fatalf("expected book_id own-book, got %v", resp["book_id"])
	}
}

func TestProgressListReturnsEmptyForUserWithNoProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewProgressHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "new-user")
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/progress", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var items []models.Progress
	if err := json.Unmarshal(recorder.Body.Bytes(), &items); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected 0 progress records, got %d", len(items))
	}
}

func TestProgressSaveUsesCurrentUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)

	// Book for current-user
	book := &models.Book{
		ID:        "current-book",
		UserID:    "current-user",
		Title:     "Current Book",
		Filename:  "current.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	handler := NewProgressHandler(db)
	payload, _ := json.Marshal(map[string]interface{}{
		"cfi":        "epubcfi(/6/2)",
		"percentage": 50,
	})
	body := bytes.NewBuffer(payload)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "current-user")
	ctx.Params = gin.Params{{Key: "id", Value: "current-book"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/current-book", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	// Verify the progress was saved with correct user ID
	got, err := db.GetProgress("current-book", "current-user")
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if got == nil {
		t.Fatal("expected progress to be saved")
	}
	if got.UserID != "current-user" {
		t.Fatalf("expected user ID current-user, got %s", got.UserID)
	}
}

func TestProgressSaveWithZeroPercentage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	payload, _ := json.Marshal(map[string]interface{}{
		"cfi":        "epubcfi(/6/2)",
		"percentage": 0,
	})
	body := bytes.NewBuffer(payload)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp models.Progress
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Percentage != 0 {
		t.Fatalf("expected percentage 0, got %f", resp.Percentage)
	}
}
