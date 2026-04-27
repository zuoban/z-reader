package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestTTSRejectsLongText(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewTTSHandler()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	text := strings.Repeat("你", maxTTSTextRunes+1)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tts?t="+url.QueryEscape(text), nil)

	handler.TTS(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestSSMLRejectsLargeRequestBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewTTSHandler()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := bytes.NewBufferString(`{"ssml":"` + strings.Repeat("x", maxSSMLRequestBody) + `"}`)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ssml", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.SSML(ctx)

	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestSSMLRejectsLongContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewTTSHandler()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := bytes.NewBufferString(`{"ssml":"` + strings.Repeat("x", maxSSMLBytes+1) + `"}`)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ssml", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.SSML(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}
