package handlers

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestClientErrorReportLogsOnlyKnownCategories(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var logs bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })
	handler := NewClientErrorHandler()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/client-errors",
		bytes.NewBufferString(`{"message":"book title","stack":"local details","component":"ErrorBoundary","path":"/read/book-id"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Report(ctx)
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	got := logs.String()
	for _, category := range []string{`"component":"ErrorBoundary"`, `"page":"/read/:id"`} {
		if !strings.Contains(got, category) {
			t.Errorf("expected category %s in log", category)
		}
	}
	for _, details := range []string{"book title", "local details", "book-id"} {
		if strings.Contains(got, details) {
			t.Errorf("client details should be excluded from the log")
		}
	}
}
