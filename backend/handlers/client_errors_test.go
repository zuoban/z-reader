package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestClientErrorReportAcceptsBoundedPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewClientErrorHandler()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "user-1")
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/client-errors",
		bytes.NewBufferString(`{"message":"render failed","component":"Reader"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Report(ctx)
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}
