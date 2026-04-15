package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const VoiceCacheDuration = 4 * 60 * 60

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
	mutex     sync.RWMutex
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

func GetVoiceList() ([]Voice, error) {
	voiceCache.mutex.RLock()
	if voiceCache.data != nil && voiceCache.cacheTime > 0 {
		data := voiceCache.data
		cacheTime := voiceCache.cacheTime
		voiceCache.mutex.RUnlock()

		now := time.Now().Unix()
		if now-cacheTime < VoiceCacheDuration {
			return data, nil
		}
	} else {
		voiceCache.mutex.RUnlock()
	}

	return refreshVoiceCache()
}

func refreshVoiceCache() ([]Voice, error) {
	voiceCache.mutex.Lock()
	defer voiceCache.mutex.Unlock()

	voices, err := callVoiceListAPI()
	if err != nil {
		if len(voiceCache.data) > 0 {
			return voiceCache.data, nil
		}
		return fallbackVoices, nil
	}

	voiceCache.data = voices
	voiceCache.cacheTime = time.Now().Unix()

	return voices, nil
}

func callVoiceListAPI() ([]Voice, error) {
	url := "https://eastus.api.speech.microsoft.com/cognitiveservices/voices/list"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.26")
	req.Header.Set("X-Ms-Useragent", "SpeechStudio/2021.05.001")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://azure.microsoft.com")
	req.Header.Set("Referer", "https://azure.microsoft.com")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("voice list API returned status %d", resp.StatusCode)
	}

	var voices []Voice
	if err := json.NewDecoder(resp.Body).Decode(&voices); err != nil {
		return nil, err
	}

	return voices, nil
}
