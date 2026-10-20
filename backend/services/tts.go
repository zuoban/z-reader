package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"z-reader/backend/utils"
)

// TTSError carries a finite, public failure code without retaining provider bodies or credentials.
type TTSError struct {
	Kind       string
	StatusCode int
	RetryAfter string
	cause      error
}

func (e *TTSError) Error() string {
	switch e.Kind {
	case "invalid_ssml":
		return "语音内容格式无效，请使用纯文本重试"
	case "authentication":
		return "语音服务认证暂时不可用，请稍后重试"
	case "rate_limited", "busy":
		return "语音服务繁忙，请稍后重试"
	case "deadline":
		return "语音合成超时，请稍后重试"
	case "cancelled":
		return "语音合成已取消"
	default:
		return "语音服务暂时不可用，请稍后重试"
	}
}

func (e *TTSError) Unwrap() error { return e.cause }

// TTSHTTPError maps all synthesis failures to a safe response for the public API.
func TTSHTTPError(err error) *TTSError {
	var failure *TTSError
	if errors.As(err, &failure) {
		return failure
	}
	var timeout interface{ Timeout() bool }
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
		return &TTSError{Kind: "deadline", StatusCode: http.StatusGatewayTimeout, cause: err}
	}
	if errors.Is(err, context.Canceled) {
		return &TTSError{Kind: "cancelled", StatusCode: http.StatusServiceUnavailable, cause: err}
	}
	if errors.Is(err, ErrTTSBusy) {
		return &TTSError{Kind: "busy", StatusCode: http.StatusTooManyRequests, RetryAfter: "30", cause: err}
	}
	return &TTSError{Kind: "unavailable", StatusCode: http.StatusBadGateway, cause: err}
}

func ttsProviderError(status int, retryAfter string, synthesis bool) *TTSError {
	failure := &TTSError{Kind: "unavailable", StatusCode: http.StatusBadGateway}
	switch status {
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		if synthesis {
			failure.Kind, failure.StatusCode = "invalid_ssml", status
		}
	case http.StatusUnauthorized, http.StatusForbidden:
		failure.Kind, failure.StatusCode = "authentication", http.StatusServiceUnavailable
	case http.StatusTooManyRequests:
		failure.Kind, failure.StatusCode = "rate_limited", http.StatusTooManyRequests
		failure.RetryAfter = "30"
	case http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		failure.StatusCode = status
	}
	if status == http.StatusTooManyRequests || status == http.StatusServiceUnavailable {
		if sanitized := sanitizeTTSRetryAfter(retryAfter); sanitized != "" {
			failure.RetryAfter = sanitized
		}
	}
	return failure
}

// Return delta seconds only, capped at five minutes; never echo an arbitrary header.
func sanitizeTTSRetryAfter(value string) string {
	value = strings.TrimSpace(value)
	seconds, err := strconv.Atoi(value)
	if err != nil {
		date, dateErr := http.ParseTime(value)
		if dateErr != nil {
			return ""
		}
		seconds = int(time.Until(date).Seconds()) + 1
	}
	if seconds < 0 {
		return ""
	}
	if seconds > 300 {
		seconds = 300
	}
	return strconv.Itoa(seconds)
}

func GenerateAudioFromText(text, voiceName, rate, pitch, style, outputFormat string) ([]byte, error) {
	return GenerateAudioFromTextContext(context.Background(), text, voiceName, rate, pitch, style, outputFormat)
}

func GenerateAudioFromTextContext(ctx context.Context, text, voiceName, rate, pitch, style, outputFormat string) ([]byte, error) {
	ssml := utils.BuildSsml(text, voiceName, rate, pitch, style)
	return callTTSAPIWithCacheContext(ctx, ssml, outputFormat)
}

func GenerateAudioFromSsml(ssml, outputFormat string) ([]byte, error) {
	return GenerateAudioFromSsmlContext(context.Background(), ssml, outputFormat)
}

func GenerateAudioFromSsmlContext(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	return callTTSAPIWithCacheContext(ctx, ssml, outputFormat)
}

func clearEndpointCache() {
	endpointCache.mutex.Lock()
	endpointCache.data = nil
	endpointCache.mutex.Unlock()
}

func callTTSAPI(ctx context.Context, ssml, outputFormat string, isRetry bool) ([]byte, error) {
	cache, err := GetEndpointContext(ctx)
	if err != nil {
		return nil, TTSHTTPError(err)
	}

	url := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", cache.Endpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBufferString(ssml))
	if err != nil {
		return nil, TTSHTTPError(err)
	}
	req.Header.Set("Authorization", cache.Token)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("User-Agent", "okhttp/4.5.0")
	req.Header.Set("X-Microsoft-OutputFormat", outputFormat)

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return nil, TTSHTTPError(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, TTSHTTPError(err)
		}
		return data, nil
	}
	if !isRetry && (resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden) {
		// Invalidate only the rejected credentials, preserving a refresh another call completed.
		endpointCache.mutex.Lock()
		if endpointCache.data == cache {
			endpointCache.data = nil
		}
		endpointCache.mutex.Unlock()
		resp.Body.Close()
		return callTTSAPI(ctx, ssml, outputFormat, true)
	}
	return nil, ttsProviderError(resp.StatusCode, resp.Header.Get("Retry-After"), true)
}
