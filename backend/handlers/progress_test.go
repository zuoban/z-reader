package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/middleware"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func setupProgressTestDB(t *testing.T) (*storage.DB, string) {
	t.Helper()

	db := openHandlerTestDB(t)
	userID := storage.PersonalLibrary

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

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2!/4/2/6)","percentage":25.5}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

func TestProgressSaveCreateOnlyAllowsOneConcurrentFirstWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)
	router := gin.New()
	router.POST("/api/progress/:id", NewProgressHandler(db).Save)

	type result struct {
		recorder *httptest.ResponseRecorder
		cfi      string
	}
	firstWrites := make(chan result, 2)
	start := make(chan struct{})
	for _, cfi := range []string{"epubcfi(/6/4)", "epubcfi(/6/8)"} {
		go func() {
			<-start
			body := strings.NewReader(`{"cfi":"` + cfi + `","percentage":25,"create_only":true}`)
			req := httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
			req.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)
			firstWrites <- result{recorder: recorder, cfi: cfi}
		}()
	}
	close(start)

	var written models.Progress
	var conflict struct{ Progress models.Progress }
	for range 2 {
		result := <-firstWrites
		switch result.recorder.Code {
		case http.StatusOK:
			if err := json.Unmarshal(result.recorder.Body.Bytes(), &written); err != nil || written.CFI != result.cfi {
				t.Errorf("invalid successful write: %+v, error: %v", written, err)
			}
		case http.StatusConflict:
			if err := json.Unmarshal(result.recorder.Body.Bytes(), &conflict); err != nil {
				t.Errorf("invalid conflict response: %v", err)
			}
		default:
			t.Errorf("unexpected status: %d, body: %s", result.recorder.Code, result.recorder.Body.String())
		}
	}
	if written.CFI == "" || conflict.Progress.CFI != written.CFI || !conflict.Progress.UpdatedAt.Equal(written.UpdatedAt) {
		t.Fatalf("expected one write and one conflict reporting it, got %+v and %+v", written, conflict)
	}
	stored, err := db.GetProgress("book-progress", userID)
	if err != nil || stored == nil || stored.CFI != written.CFI || !stored.UpdatedAt.Equal(written.UpdatedAt) {
		t.Fatalf("stored progress changed after conflict: %+v, error: %v", stored, err)
	}
}

func TestProgressSaveRecordsOperationMetric(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/progress/book-progress",
		bytes.NewBufferString(`{"cfi":"epubcfi(/6/2!/4/2/6)","percentage":25.5}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	metricsRouter := gin.New()
	metricsRouter.GET("/metrics", middleware.MetricsHandler)
	metricsRecorder := httptest.NewRecorder()
	metricsRouter.ServeHTTP(metricsRecorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if metricsRecorder.Code != http.StatusOK ||
		!strings.Contains(metricsRecorder.Body.String(), `operation="progress_save"`) {
		t.Fatalf("expected progress metric, got status=%d body=%s", metricsRecorder.Code, metricsRecorder.Body.String())
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

func TestProgressSaveRejectsStaleExpectedUpdatedAt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, userID := setupProgressTestDB(t)

	initialUpdatedAt := time.Now().UTC().Truncate(time.Second)
	initial := &models.Progress{
		BookID:     "book-progress",
		CFI:        "epubcfi(/6/2!/4/2/6)",
		Percentage: 10,
		DeviceID:   "device-a",
		UpdatedAt:  initialUpdatedAt,
	}
	if err := db.SaveProgress(initial, userID); err != nil {
		t.Fatalf("failed to save initial progress: %v", err)
	}

	handler := NewProgressHandler(db)
	payload, _ := json.Marshal(map[string]interface{}{
		"cfi":                 "epubcfi(/6/4!/4/2/8)",
		"percentage":          50,
		"device_id":           "device-b",
		"expected_updated_at": initialUpdatedAt.Add(-time.Minute).Format(time.RFC3339),
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", bytes.NewBuffer(payload))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	got, err := db.GetProgress("book-progress", userID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if got == nil || got.CFI != initial.CFI || got.DeviceID != "device-a" {
		t.Fatalf("expected stale save to leave original progress, got %+v", got)
	}
}

func TestProgressSaveRejectsMissingCFI(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"","percentage":25}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

	db, _ := setupProgressTestDB(t)
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

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	body := bytes.NewBufferString(`{"cfi":"epubcfi(/6/2)","percentage":25}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

	db, _ := setupProgressTestDB(t)
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

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

	for i := 0; i < 3; i++ {
		book := &models.Book{
			ID:        "list-book",
			UserID:    storage.PersonalLibrary,
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
		}, storage.PersonalLibrary); err != nil {
			t.Fatalf("failed to save progress: %v", err)
		}
	}

	handler := NewProgressHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

func TestProgressSaveRejectsInvalidRequestBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	// Invalid JSON
	body := bytes.NewBufferString(`{invalid json}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestProgressGetOwnBook(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)

	book := &models.Book{
		ID:        "own-book",
		UserID:    storage.PersonalLibrary,
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

func TestProgressSaveUsesPersonalLibrary(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)

	book := &models.Book{
		ID:        "current-book",
		UserID:    storage.PersonalLibrary,
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

	ctx.Params = gin.Params{{Key: "id", Value: "current-book"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/current-book", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Save(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	// Verify the progress was saved with correct user ID
	got, err := db.GetProgress("current-book", storage.PersonalLibrary)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if got == nil {
		t.Fatal("expected progress to be saved")
	}
	if got.UserID != storage.PersonalLibrary {
		t.Fatalf("expected personal library, got %s", got.UserID)
	}
}

func TestProgressSaveWithZeroPercentage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, _ := setupProgressTestDB(t)
	handler := NewProgressHandler(db)

	payload, _ := json.Marshal(map[string]interface{}{
		"cfi":        "epubcfi(/6/2)",
		"percentage": 0,
	})
	body := bytes.NewBuffer(payload)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

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

func TestProgressSaveRejectsNaNAndInfFormPercentage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, rawPercentage := range []string{"NaN", "nan", "Inf", "+Inf", "-Inf"} {
		t.Run(rawPercentage, func(t *testing.T) {
			db, userID := setupProgressTestDB(t)
			handler := NewProgressHandler(db)

			form := url.Values{
				"cfi":        {"epubcfi(/6/2)"},
				"percentage": {rawPercentage},
			}
			body := strings.NewReader(form.Encode())
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Params = gin.Params{{Key: "id", Value: "book-progress"}}
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/progress/book-progress", body)
			ctx.Request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

			handler.Save(ctx)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("percentage=%q status = %d, want 400 body=%s", rawPercentage, recorder.Code, recorder.Body.String())
			}
			if !strings.Contains(recorder.Body.String(), "阅读进度必须在 0 到 100 之间") {
				t.Fatalf("percentage=%q unexpected error body: %s", rawPercentage, recorder.Body.String())
			}
			saved, err := db.GetProgress("book-progress", userID)
			if err != nil || saved != nil {
				t.Fatalf("percentage=%q should not persist progress, got %+v, err=%v", rawPercentage, saved, err)
			}
		})
	}
}
