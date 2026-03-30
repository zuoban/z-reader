package services

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"z-reader/backend/utils"
)

var forceRefreshMutex sync.Mutex

func GenerateAudioFromText(text, voiceName, rate, pitch, style, outputFormat string) ([]byte, error) {
	ssml := utils.BuildSsml(text, voiceName, rate, pitch, style)
	return callTTSAPI(ssml, outputFormat, false)
}

func GenerateAudioFromSsml(ssml, outputFormat string) ([]byte, error) {
	return callTTSAPI(ssml, outputFormat, false)
}

func callTTSAPI(ssml, outputFormat string, isRetry bool) ([]byte, error) {
	cache, err := GetEndpoint()
	if err != nil {
		return nil, fmt.Errorf("failed to get endpoint: %v", err)
	}

	url := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", cache.Endpoint)

	req, err := http.NewRequest("POST", url, bytes.NewBufferString(ssml))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", cache.Token)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("User-Agent", "okhttp/4.5.0")
	req.Header.Set("X-Microsoft-OutputFormat", outputFormat)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
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
			endpointCache.mutex.Lock()
			endpointCache.data = nil
			endpointCache.mutex.Unlock()
			forceRefreshMutex.Unlock()

			return callTTSAPI(ssml, outputFormat, true)
		}
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	return nil, fmt.Errorf("TTS API error: status %d, message: %s", resp.StatusCode, string(bodyBytes))
}
