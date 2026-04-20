package services

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"z-reader/backend/utils"
)

var (
	forceRefreshMutex sync.Mutex
	endpointClearOnce sync.Once
)

func GenerateAudioFromText(text, voiceName, rate, pitch, style, outputFormat string) ([]byte, error) {
	ssml := utils.BuildSsml(text, voiceName, rate, pitch, style)
	return callTTSAPIWithCache(ssml, outputFormat)
}

func GenerateAudioFromSsml(ssml, outputFormat string) ([]byte, error) {
	return callTTSAPIWithCache(ssml, outputFormat)
}

func clearEndpointCache() {
	endpointCache.mutex.Lock()
	endpointCache.data = nil
	endpointCache.mutex.Unlock()
}

func callTTSAPI(ssml, outputFormat string, isRetry bool) ([]byte, error) {
	cache, err := GetEndpoint()
	if err != nil {
		return nil, fmt.Errorf("获取语音服务端点失败：%v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	url := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", cache.Endpoint)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBufferString(ssml))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", cache.Token)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("User-Agent", "okhttp/4.5.0")
	req.Header.Set("X-Microsoft-OutputFormat", outputFormat)

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return io.ReadAll(resp.Body)
	}

	if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		if !isRetry {
			forceRefreshMutex.Lock()
			clearEndpointCache()
			forceRefreshMutex.Unlock()

			return callTTSAPI(ssml, outputFormat, true)
		}
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	return nil, fmt.Errorf("语音合成服务返回错误：状态码 %d，信息：%s", resp.StatusCode, string(bodyBytes))
}
