package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"z-reader/backend/services"
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

func TestTTSBusyIncludesFiniteFailureCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	respondTTSBusy(ctx)
	var body map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusTooManyRequests || body["code"] != "busy" || recorder.Header().Get("Retry-After") != "30" {
		t.Fatalf("unexpected busy contract: status=%d headers=%v body=%v", recorder.Code, recorder.Header(), body)
	}
}

func TestTTSErrorResponsePreservesStatusAndHidesProviderData(t *testing.T) {
	cases := []struct {
		name        string
		err         error
		status      int
		code, retry string
	}{
		{"invalid SSML", &services.TTSError{Kind: "invalid_ssml", StatusCode: 422}, 422, "invalid_ssml", ""},
		{"rate limit", &services.TTSError{Kind: "rate_limited", StatusCode: 429, RetryAfter: "7"}, 429, "rate_limited", "7"},
		{"upstream auth", &services.TTSError{Kind: "authentication", StatusCode: 503}, 503, "authentication", ""},
		{"deadline", context.DeadlineExceeded, 504, "deadline", ""},
		{"private error", errors.New("https://provider.invalid/token=secret private body"), 502, "unavailable", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			respondTTSError(ctx, tc.err)
			var body map[string]string
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if recorder.Code != tc.status || body["code"] != tc.code || recorder.Header().Get("Retry-After") != tc.retry {
				t.Fatalf("unexpected TTS error contract: status=%d headers=%v body=%v", recorder.Code, recorder.Header(), body)
			}
			if strings.Contains(body["error"], "secret") || strings.Contains(body["error"], "private") {
				t.Fatalf("private provider data leaked: %v", body)
			}
		})
	}
}
