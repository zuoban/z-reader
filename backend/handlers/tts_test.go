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
	respondTTSError(ctx, services.ErrTTSBusy)
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

func TestVoiceListRespectsRequestContextAndFiltersLocale(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("TTS_CUSTOM_ENDPOINT", "https://custom.local/tts")
	t.Setenv("TTS_CUSTOM_VOICES_ENDPOINT", "")

	handler := NewTTSHandler()

	// Normal request with locale filter
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/voices?l=zh-CN", nil)
	handler.VoiceList(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	var voices []services.Voice
	if err := json.Unmarshal(recorder.Body.Bytes(), &voices); err != nil {
		t.Fatalf("failed to decode voices: %v", err)
	}
	if len(voices) == 0 {
		t.Fatal("expected filtered fallback voices")
	}

	// Cancelled request context returns silently without writing 500
	cancelledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	recorder = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/voices", nil).WithContext(cancelledCtx)
	handler.VoiceList(ctx)

	if recorder.Body.Len() != 0 {
		t.Fatalf("expected empty response body on cancelled context, got %s", recorder.Body.String())
	}
}

func TestTTSAudioFormatInfo(t *testing.T) {
	cases := []struct {
		format      string
		contentType string
		ext         string
	}{
		{"audio-24khz-48kbitrate-mono-mp3", "audio/mpeg", ".mp3"},
		{"webm-24khz-16bit-mono-opus", "audio/webm", ".webm"},
		{"ogg-24khz-16bit-mono-opus", "audio/ogg", ".ogg"},
		{"audio-opus", "audio/opus", ".opus"},
		{"raw-24khz-16bit-mono-pcm", "audio/pcm", ".pcm"},
		{"riff-24khz-16bit-mono-pcm", "audio/wav", ".wav"},
		{"audio-24khz-16bit-mono-wav", "audio/wav", ".wav"},
		{"audio-ogg", "audio/ogg", ".ogg"},
	}
	for _, tc := range cases {
		ct, ext := ttsAudioFormatInfo(tc.format)
		if ct != tc.contentType || ext != tc.ext {
			t.Fatalf("ttsAudioFormatInfo(%q) = (%q, %q), want (%q, %q)", tc.format, ct, ext, tc.contentType, tc.ext)
		}
	}
}

func TestTTSAndSSMLDownloadHeadersMatchFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := &TTSHandler{
		generateTextAudio: func(_ context.Context, _, _, _, _, _, _ string) ([]byte, error) {
			return []byte("fake-audio-bytes"), nil
		},
		generateSSMLAudio: func(_ context.Context, _, _ string, _ bool) ([]byte, error) {
			return []byte("fake-audio-bytes"), nil
		},
	}

	// GET /api/tts with download=true and webm opus format
	ttsRecorder := httptest.NewRecorder()
	ttsCtx, _ := gin.CreateTestContext(ttsRecorder)
	ttsCtx.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/tts?t="+url.QueryEscape("download-header-test-tts")+"&o=webm-24khz-16bit-mono-opus&d=true",
		nil,
	)
	handler.TTS(ttsCtx)

	if ttsRecorder.Code != http.StatusOK {
		t.Fatalf("TTS status = %d, want 200, body=%s", ttsRecorder.Code, ttsRecorder.Body.String())
	}
	if ct := ttsRecorder.Header().Get("Content-Type"); ct != "audio/webm" {
		t.Fatalf("TTS Content-Type = %q, want audio/webm", ct)
	}
	if cd := ttsRecorder.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, `attachment; filename="`) || !strings.HasSuffix(cd, `.webm"`) {
		t.Fatalf("TTS Content-Disposition = %q, want .webm attachment", cd)
	}

	// POST /api/ssml with download=true and riff wav format
	ssmlRecorder := httptest.NewRecorder()
	ssmlCtx, _ := gin.CreateTestContext(ssmlRecorder)
	body := bytes.NewBufferString(`{"ssml":"<speak>download-header-test-ssml</speak>","output_format":"riff-24khz-16bit-mono-pcm","download":true}`)
	ssmlCtx.Request = httptest.NewRequest(http.MethodPost, "/api/ssml", body)
	ssmlCtx.Request.Header.Set("Content-Type", "application/json")
	handler.SSML(ssmlCtx)

	if ssmlRecorder.Code != http.StatusOK {
		t.Fatalf("SSML status = %d, want 200, body=%s", ssmlRecorder.Code, ssmlRecorder.Body.String())
	}
	if ct := ssmlRecorder.Header().Get("Content-Type"); ct != "audio/wav" {
		t.Fatalf("SSML Content-Type = %q, want audio/wav", ct)
	}
	if cd := ssmlRecorder.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, `attachment; filename="`) || !strings.HasSuffix(cd, `.wav"`) {
		t.Fatalf("SSML Content-Disposition = %q, want .wav attachment", cd)
	}
}

func TestVoiceListSanitizesUpstreamErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := &TTSHandler{
		listVoices: func(context.Context) ([]services.Voice, error) {
			return nil, errors.New("https://provider.internal/voices?token=secret-upstream-token-leak")
		},
	}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/voices", nil)

	handler.VoiceList(ctx)

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 status, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "secret-upstream-token-leak") || strings.Contains(recorder.Body.String(), "provider.internal") {
		t.Fatalf("VoiceList leaked raw upstream error: %s", recorder.Body.String())
	}
	var body map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "unavailable" || body["error"] == "" {
		t.Fatalf("expected structured TTS error response, got %v", body)
	}
}

func TestTTSQueryParameterValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var called int
	handler := &TTSHandler{
		generateTextAudio: func(_ context.Context, _, _, _, _, _, _ string) ([]byte, error) {
			called++
			return []byte("audio"), nil
		},
	}

	validQueries := []struct {
		name  string
		query string
	}{
		{
			name:  "defaults",
			query: "t=hello",
		},
		{
			name:  "valid prosody percent and units",
			query: "t=hello&v=zh-CN-Xiaoxiao:DragonHDFlashLatestNeural&r=" + url.QueryEscape("+10%") + "&p=" + url.QueryEscape("-2st") + "&s=narration-professional&o=audio-24khz-48kbitrate-mono-mp3",
		},
		{
			name:  "valid decimal rate and Hz pitch",
			query: "t=hello&v=custom_voice.v1&r=1.2&p=" + url.QueryEscape("+5Hz") + "&s=chat_casual.1&o=webm-24khz-16bit-mono-opus",
		},
		{
			name:  "negative percent rate and zero pitch",
			query: "t=hello&r=" + url.QueryEscape("-20%") + "&p=0&s=cheerful",
		},
	}

	for _, tc := range validQueries {
		t.Run("valid/"+tc.name, func(t *testing.T) {
			before := called
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tts?"+tc.query, nil)
			handler.TTS(ctx)
			if rec.Code != http.StatusOK || called != before+1 {
				t.Fatalf("expected 200 and synthesis call, got status=%d calledDelta=%d body=%s", rec.Code, called-before, rec.Body.String())
			}
		})
	}

	invalidQueries := []struct {
		name  string
		query string
	}{
		{"invalid voice chars", "t=hello&v=" + url.QueryEscape(`zh-CN" onclick="x`)},
		{"voice too long", "t=hello&v=" + strings.Repeat("a", maxTTSVoiceLen+1)},
		{"empty voice", "t=hello&v="},
		{"invalid rate chars", "t=hello&r=" + url.QueryEscape("+10%;drop")},
		{"rate slash rejected", "t=hello&r=" + url.QueryEscape("10/2")},
		{"rate too long", "t=hello&r=" + strings.Repeat("1", maxTTSProsodyLen+1)},
		{"invalid pitch chars", "t=hello&p=" + url.QueryEscape("+5Hz<bad>")},
		{"pitch too long", "t=hello&p=" + strings.Repeat("1", maxTTSProsodyLen+1)},
		{"invalid style chars", "t=hello&s=" + url.QueryEscape("cheerful space")},
		{"style too long", "t=hello&s=" + strings.Repeat("s", maxTTSStyleLen+1)},
		{"output format with CRLF", "t=hello&o=" + url.QueryEscape("mp3\r\nX-Injected: 1")},
		{"output format with spaces", "t=hello&o=" + url.QueryEscape("audio mp3")},
		{"output format with underscore", "t=hello&o=audio_mp3"},
		{"output format too long", "t=hello&o=" + strings.Repeat("a", maxTTSOutputFormatLen+1)},
	}

	for _, tc := range invalidQueries {
		t.Run("invalid/"+tc.name, func(t *testing.T) {
			before := called
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tts?"+tc.query, nil)
			handler.TTS(ctx)
			if rec.Code != http.StatusBadRequest || called != before {
				t.Fatalf("expected 400 without synthesis call, got status=%d calledDelta=%d body=%s", rec.Code, called-before, rec.Body.String())
			}
		})
	}
}

func TestSSMLParameterAndSanitizedSizeValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var called int
	handler := &TTSHandler{
		generateSSMLAudio: func(_ context.Context, _, _ string, _ bool) ([]byte, error) {
			called++
			return []byte("audio"), nil
		},
	}

	t.Run("rejects invalid output_format with header injection chars", func(t *testing.T) {
		for _, badFormat := range []string{
			"mp3\r\nX-Evil: 1",
			"audio mp3",
			"audio/mpeg",
			strings.Repeat("a", maxTTSOutputFormatLen+1),
		} {
			payload, err := json.Marshal(SSMLRequest{
				Ssml:         "<speak>hello</speak>",
				OutputFormat: badFormat,
			})
			if err != nil {
				t.Fatal(err)
			}
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ssml", bytes.NewReader(payload))
			ctx.Request.Header.Set("Content-Type", "application/json")
			handler.SSML(ctx)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("format %q: status = %d, want 400 body=%s", badFormat, rec.Code, rec.Body.String())
			}
		}
		if called != 0 {
			t.Fatalf("expected 0 synthesis calls for invalid output_format, got %d", called)
		}
	})

	t.Run("rejects SSML expanding beyond sanitized byte limit", func(t *testing.T) {
		// 15KB of `'` fits within maxSSMLBytes (32KB) and maxSSMLRequestBody (64KB),
		// but expands 6x to 90KB of `&apos;` (> maxSanitizedSSMLBytes = 64KB).
		raw := "<speak>" + strings.Repeat("'", 15*1024) + "</speak>"
		payload, err := json.Marshal(SSMLRequest{
			Ssml:         raw,
			OutputFormat: "audio-24khz-48kbitrate-mono-mp3",
		})
		if err != nil {
			t.Fatal(err)
		}
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ssml", bytes.NewReader(payload))
		ctx.Request.Header.Set("Content-Type", "application/json")
		handler.SSML(ctx)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400 body=%s", rec.Code, rec.Body.String())
		}
		if called != 0 {
			t.Fatalf("expected 0 synthesis calls for oversized sanitized SSML, got %d", called)
		}
	})

	t.Run("accepts valid near-limit SSML", func(t *testing.T) {
		raw := "<speak>" + strings.Repeat("a", maxSSMLBytes-20) + "</speak>"
		payload, err := json.Marshal(SSMLRequest{
			Ssml:         raw,
			OutputFormat: "audio-24khz-48kbitrate-mono-mp3",
		})
		if err != nil {
			t.Fatal(err)
		}
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ssml", bytes.NewReader(payload))
		ctx.Request.Header.Set("Content-Type", "application/json")
		handler.SSML(ctx)
		if rec.Code != http.StatusOK || called != 1 {
			t.Fatalf("status = %d called = %d, want 200 and 1 body=%s", rec.Code, called, rec.Body.String())
		}
	})
}
