package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"z-reader/backend/logger"
)

const (
	VoiceCacheDuration = 4 * 60 * 60
	voiceFetchTimeout  = 30 * time.Second
)

type Voice struct {
	Name        string   `json:"Name"`
	DisplayName string   `json:"DisplayName"`
	LocalName   string   `json:"LocalName"`
	ShortName   string   `json:"ShortName"`
	Gender      string   `json:"Gender"`
	Locale      string   `json:"Locale"`
	StyleList   []string `json:"StyleList,omitempty"`
}

var voiceCache struct {
	data      []Voice
	cacheTime int64
	provider  string
	mutex     sync.RWMutex
}

type voiceInflightCall struct {
	done     chan struct{}
	ctx      context.Context
	cancel   context.CancelFunc
	provider string
	waiters  int
	data     []Voice
	err      error
}

var voiceRefresh struct {
	mutex sync.Mutex
	call  *voiceInflightCall
}

var fallbackVoices = []Voice{
	{
		Name:        "zh-CN-XiaoxiaoMultilingualNeural",
		DisplayName: "Xiaoxiao Multilingual",
		LocalName:   "晓晓 多语种",
		ShortName:   "zh-CN-XiaoxiaoMultilingualNeural",
		Gender:      "Female",
		Locale:      "zh-CN",
		StyleList:   []string{"general", "assistant", "chat", "customerservice", "newscast"},
	},
	{
		Name:        "zh-CN-XiaoyiNeural",
		DisplayName: "Xiaoyi",
		LocalName:   "晓伊",
		ShortName:   "zh-CN-XiaoyiNeural",
		Gender:      "Female",
		Locale:      "zh-CN",
		StyleList:   []string{"general", "assistant", "chat"},
	},
	{
		Name:        "zh-CN-YunxiNeural",
		DisplayName: "Yunxi",
		LocalName:   "云希",
		ShortName:   "zh-CN-YunxiNeural",
		Gender:      "Male",
		Locale:      "zh-CN",
		StyleList:   []string{"general", "assistant", "chat", "newscast"},
	},
}

func cloneVoices(voices []Voice) []Voice {
	if voices == nil {
		return nil
	}
	cloned := make([]Voice, len(voices))
	for i, v := range voices {
		if v.StyleList != nil {
			v.StyleList = append([]string(nil), v.StyleList...)
		}
		cloned[i] = v
	}
	return cloned
}

func clearVoiceCache() {
	voiceCache.mutex.Lock()
	voiceCache.data = nil
	voiceCache.cacheTime = 0
	voiceCache.provider = ""
	voiceCache.mutex.Unlock()
}

func GetVoiceList() ([]Voice, error) {
	return GetVoiceListContext(context.Background())
}

func GetVoiceListContext(ctx context.Context) ([]Voice, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	provider := ActiveTTSProvider()
	providerName := provider.Name()

	voiceCache.mutex.RLock()
	if voiceCache.data != nil && voiceCache.cacheTime > 0 && voiceCache.provider == providerName {
		data := voiceCache.data
		cacheTime := voiceCache.cacheTime
		voiceCache.mutex.RUnlock()

		if time.Now().Unix()-cacheTime < VoiceCacheDuration {
			return cloneVoices(data), nil
		}
	} else {
		voiceCache.mutex.RUnlock()
	}

	voiceRefresh.mutex.Lock()
	call := voiceRefresh.call
	if call == nil || call.ctx.Err() != nil || call.provider != providerName {
		workCtx, cancel := context.WithTimeout(context.Background(), voiceFetchTimeout)
		call = &voiceInflightCall{
			done:     make(chan struct{}),
			ctx:      workCtx,
			cancel:   cancel,
			provider: providerName,
		}
		voiceRefresh.call = call
		go func() {
			defer cancel()
			call.data, call.err = refreshVoiceCacheContext(workCtx, provider)
			voiceRefresh.mutex.Lock()
			if voiceRefresh.call == call {
				voiceRefresh.call = nil
			}
			close(call.done)
			voiceRefresh.mutex.Unlock()
		}()
	}
	call.waiters++
	voiceRefresh.mutex.Unlock()

	select {
	case <-call.done:
		if call.err != nil {
			return nil, call.err
		}
		return cloneVoices(call.data), nil
	case <-ctx.Done():
		voiceRefresh.mutex.Lock()
		call.waiters--
		if call.waiters == 0 {
			call.cancel()
			if voiceRefresh.call == call {
				voiceRefresh.call = nil
			}
		}
		voiceRefresh.mutex.Unlock()
		return nil, ctx.Err()
	}
}

func refreshVoiceCacheContext(ctx context.Context, provider TTSProvider) ([]Voice, error) {
	providerName := provider.Name()

	voiceCache.mutex.RLock()
	var previous []Voice
	var previousTime int64
	if voiceCache.provider == providerName && len(voiceCache.data) > 0 {
		previous = voiceCache.data
		previousTime = voiceCache.cacheTime
	}
	voiceCache.mutex.RUnlock()

	if len(previous) > 0 && previousTime > 0 && time.Now().Unix()-previousTime < VoiceCacheDuration {
		return previous, nil
	}

	voices, err := provider.ListVoices(ctx)
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return nil, ctx.Err()
		}
		if len(previous) > 0 {
			return previous, nil
		}
		return fallbackVoices, nil
	}

	if errors.Is(ctx.Err(), context.Canceled) {
		return nil, ctx.Err()
	}

	if len(voices) == 0 {
		logger.Warn("Voice list provider returned empty list; skipping cache write")
		if len(previous) > 0 {
			return previous, nil
		}
		return fallbackVoices, nil
	}

	voiceCache.mutex.Lock()
	voiceCache.data = voices
	voiceCache.cacheTime = time.Now().Unix()
	voiceCache.provider = providerName
	voiceCache.mutex.Unlock()

	return voices, nil
}

func callMicrosoftVoiceListAPI(ctx context.Context) ([]Voice, error) {
	url := "https://eastus.api.speech.microsoft.com/cognitiveservices/voices/list"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.26")
	req.Header.Set("X-Ms-Useragent", "SpeechStudio/2021.05.001")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://azure.microsoft.com")
	req.Header.Set("Referer", "https://azure.microsoft.com")

	return doVoiceListRequest(req)
}

func doVoiceListRequest(req *http.Request) ([]Voice, error) {
	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		drainResponseBody(resp.Body)
		return nil, fmt.Errorf("声音列表服务返回状态码 %d", resp.StatusCode)
	}

	body, err := readBoundedBody(resp.Body, maxTTSVoiceListResponseBytes)
	if err != nil {
		return nil, err
	}

	var voices []Voice
	if err := json.Unmarshal(body, &voices); err != nil {
		return nil, err
	}

	return voices, nil
}
