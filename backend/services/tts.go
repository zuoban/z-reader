package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"z-reader/backend/logger"
	"z-reader/backend/utils"
)

const (
	maxTTSAudioResponseBytes     int64 = 32 * 1024 * 1024
	maxTTSVoiceListResponseBytes int64 = 8 * 1024 * 1024
)

var (
	azureConfigWarnMu    sync.Mutex
	azureConfigWarnState string
)

// TTSProvider abstracts speech synthesis and voice discovery backends.
type TTSProvider interface {
	Name() string
	Synthesize(ctx context.Context, ssml, outputFormat string) ([]byte, error)
	ListVoices(ctx context.Context) ([]Voice, error)
}

// ActiveTTSProvider resolves the configured TTS provider from environment variables:
//  1. TTS_CUSTOM_ENDPOINT (+ optional TTS_CUSTOM_API_KEY / TTS_CUSTOM_VOICES_ENDPOINT)
//  2. AZURE_TTS_KEY + AZURE_TTS_REGION
//  3. Default Microsoft Translator/Speech endpoint (backwards-compatible default)
func ActiveTTSProvider() TTSProvider {
	if customEndpoint := strings.TrimSpace(os.Getenv("TTS_CUSTOM_ENDPOINT")); customEndpoint != "" {
		return &customTTSProvider{
			endpoint:       customEndpoint,
			apiKey:         strings.TrimSpace(os.Getenv("TTS_CUSTOM_API_KEY")),
			voicesEndpoint: strings.TrimSpace(os.Getenv("TTS_CUSTOM_VOICES_ENDPOINT")),
		}
	}
	azureKey := strings.TrimSpace(os.Getenv("AZURE_TTS_KEY"))
	azureRegion := strings.TrimSpace(os.Getenv("AZURE_TTS_REGION"))
	if azureKey != "" && azureRegion != "" {
		return &azureTTSProvider{
			key:    azureKey,
			region: azureRegion,
		}
	}
	if (azureKey != "") != (azureRegion != "") {
		missing := "AZURE_TTS_REGION"
		if azureKey == "" {
			missing = "AZURE_TTS_KEY"
		}
		azureConfigWarnMu.Lock()
		if azureConfigWarnState != missing {
			azureConfigWarnState = missing
			logger.Warn(
				"Incomplete Azure TTS configuration; falling back to default provider",
				"missing_env", missing,
			)
		}
		azureConfigWarnMu.Unlock()
	}
	return microsoftTranslatorProvider{}
}

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

// RefreshAudioFromSsmlContext synthesizes audio after a client decoder failure.
func RefreshAudioFromSsmlContext(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	return synthesizeTTSAudio(ctx, ssml, outputFormat, true)
}

func clearEndpointCache() {
	endpointCache.mutex.Lock()
	endpointCache.data = nil
	endpointCache.mutex.Unlock()
}

func callTTSAPI(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	return ActiveTTSProvider().Synthesize(ctx, ssml, outputFormat)
}

func readBoundedBody(r io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("upstream response exceeded %d bytes", limit)
	}
	return data, nil
}

type microsoftTranslatorProvider struct{}

func (microsoftTranslatorProvider) Name() string {
	return "microsoft_translator"
}

func (microsoftTranslatorProvider) Synthesize(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	return callMicrosoftTranslatorTTS(ctx, ssml, outputFormat, false)
}

func (microsoftTranslatorProvider) ListVoices(ctx context.Context) ([]Voice, error) {
	return callMicrosoftVoiceListAPI(ctx)
}

func callMicrosoftTranslatorTTS(ctx context.Context, ssml, outputFormat string, isRetry bool) ([]byte, error) {
	cache, err := GetEndpointContext(ctx)
	if err != nil {
		return nil, TTSHTTPError(err)
	}

	endpointURL := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", cache.Endpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpointURL, bytes.NewBufferString(ssml))
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
		data, err := readBoundedBody(resp.Body, maxTTSAudioResponseBytes)
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
		return callMicrosoftTranslatorTTS(ctx, ssml, outputFormat, true)
	}
	return nil, ttsProviderError(resp.StatusCode, resp.Header.Get("Retry-After"), true)
}

type azureTTSProvider struct {
	key    string
	region string
}

func (p *azureTTSProvider) Name() string {
	return "azure:" + p.region
}

func (p *azureTTSProvider) Synthesize(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	endpointURL := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", p.region)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpointURL, bytes.NewBufferString(ssml))
	if err != nil {
		return nil, TTSHTTPError(err)
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", p.key)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("X-Microsoft-OutputFormat", outputFormat)
	req.Header.Set("User-Agent", "z-reader")

	return doSynthesisRequest(req)
}

func (p *azureTTSProvider) ListVoices(ctx context.Context) ([]Voice, error) {
	endpointURL := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/voices/list", p.region)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpointURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", p.key)
	req.Header.Set("Accept", "application/json")

	return doVoiceListRequest(req)
}

type customTTSProvider struct {
	endpoint       string
	apiKey         string
	voicesEndpoint string
}

func (p *customTTSProvider) Name() string {
	return "custom:" + p.endpoint
}

func (p *customTTSProvider) Synthesize(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewBufferString(ssml))
	if err != nil {
		return nil, TTSHTTPError(err)
	}
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("X-Microsoft-OutputFormat", outputFormat)
	if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}

	return doSynthesisRequest(req)
}

func (p *customTTSProvider) ListVoices(ctx context.Context) ([]Voice, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if p.voicesEndpoint == "" {
		return cloneVoices(fallbackVoices), nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.voicesEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
	return doVoiceListRequest(req)
}

func doSynthesisRequest(req *http.Request) ([]byte, error) {
	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return nil, TTSHTTPError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		data, err := readBoundedBody(resp.Body, maxTTSAudioResponseBytes)
		if err != nil {
			return nil, TTSHTTPError(err)
		}
		return data, nil
	}
	return nil, ttsProviderError(resp.StatusCode, resp.Header.Get("Retry-After"), true)
}
