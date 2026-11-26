package services

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"z-reader/backend/internal/singleflight"
)

const (
	maxTTSEndpointResponseBytes = 64 * 1024
	EndpointRefreshThreshold    = 300
)

// defaultSignatureKey 是 Microsoft Translator TTS 端点的默认签名密钥。
// 建议通过 MICROSOFT_TTS_SIGNATURE_KEY 环境变量覆盖。
var defaultSignatureKey = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=="

type EndpointCache struct {
	Endpoint  string
	Token     string
	ExpiredAt int64
}

type EndpointResponse struct {
	T string `json:"t"`
	R string `json:"r"`
}

var endpointCache struct {
	data  *EndpointCache
	mutex sync.RWMutex
}

var endpointFlights singleflight.Group[*EndpointCache]

func GetEndpoint() (*EndpointCache, error) { return GetEndpointContext(context.Background()) }

func GetEndpointContext(ctx context.Context) (*EndpointCache, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	endpointCache.mutex.RLock()
	cache := endpointCache.data
	endpointCache.mutex.RUnlock()
	if cache != nil && cache.ExpiredAt-time.Now().Unix() > EndpointRefreshThreshold {
		return cache, nil
	}

	cache, _, _, err := endpointFlights.DoContext(ctx, "endpoint", 10*time.Second, refreshEndpointCacheContext)
	return cache, err
}

func refreshEndpointCacheContext(ctx context.Context) (*EndpointCache, error) {
	endpointCache.mutex.RLock()
	previous := endpointCache.data
	endpointCache.mutex.RUnlock()
	if previous != nil && previous.ExpiredAt-time.Now().Unix() > EndpointRefreshThreshold {
		return previous, nil
	}

	resp, err := callEndpointAPIContext(ctx)
	if err != nil {
		// Retain the existing best-effort endpoint fallback while still unexpired, but never bypass cancellation.
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if previous != nil && previous.ExpiredAt > time.Now().Unix() {
			return previous, nil
		}
		return nil, err
	}
	exp, err := parseJWTExp(resp.T)
	if err != nil {
		if previous != nil && previous.ExpiredAt > time.Now().Unix() {
			return previous, nil
		}
		return nil, TTSHTTPError(err)
	}
	cache := &EndpointCache{Endpoint: resp.R, Token: resp.T, ExpiredAt: exp}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	endpointCache.mutex.Lock()
	endpointCache.data = cache
	endpointCache.mutex.Unlock()
	return cache, nil
}

func parseJWTExp(token string) (int64, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, fmt.Errorf("语音服务令牌格式无效")
	}

	payload := parts[1]
	var decoded []byte
	var err error
	for _, enc := range []*base64.Encoding{
		base64.RawURLEncoding,
		base64.URLEncoding,
		base64.RawStdEncoding,
		base64.StdEncoding,
	} {
		decoded, err = enc.DecodeString(payload)
		if err == nil {
			break
		}
	}
	if err != nil {
		return 0, fmt.Errorf("解析语音服务令牌失败：%v", err)
	}

	var jwtData struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(decoded, &jwtData); err != nil {
		return 0, fmt.Errorf("读取语音服务令牌失败：%v", err)
	}

	return jwtData.Exp, nil
}

func callEndpointAPIContext(ctx context.Context) (*EndpointResponse, error) {

	url := "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0"
	signature, err := buildSignature(url)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept-Language", "zh-Hans")
	req.Header.Set("X-ClientVersion", "4.0.530a 5fe1dc6c")
	req.Header.Set("X-UserId", generateUserID())
	req.Header.Set("X-HomeGeographicRegion", "zh-Hans-CN")
	req.Header.Set("X-ClientTraceId", uuid.NewString())
	req.Header.Set("X-MT-Signature", signature)
	req.Header.Set("User-Agent", "okhttp/4.5.0")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Length", "0")

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		drainResponseBody(resp.Body)
		return nil, ttsProviderError(resp.StatusCode, resp.Header.Get("Retry-After"), false)
	}

	body, err := readBoundedBody(resp.Body, maxTTSEndpointResponseBytes)
	if err != nil {
		return nil, err
	}
	var endpointResp EndpointResponse
	if err := json.Unmarshal(body, &endpointResp); err != nil {
		return nil, err
	}

	if !validTTSRegion(endpointResp.R) {
		return nil, fmt.Errorf("invalid speech provider region")
	}
	return &endpointResp, nil
}

func getSignatureKey() string {
	if key := os.Getenv("MICROSOFT_TTS_SIGNATURE_KEY"); key != "" {
		return key
	}
	return defaultSignatureKey
}

func buildSignature(urlStr string) (string, error) {
	urlPart := strings.TrimPrefix(urlStr, "https://")
	encodedUrl := encodeURIComponent(urlPart)
	uuidStr := uuid.NewString()
	formattedDate := formatDate()

	bytesToSign := strings.ToLower("MSTranslatorAndroidApp" + encodedUrl + formattedDate + uuidStr)

	key, err := base64.StdEncoding.DecodeString(getSignatureKey())
	if err != nil {
		return "", err
	}

	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(bytesToSign))
	signBase64 := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return "MSTranslatorAndroidApp::" + signBase64 + "::" + formattedDate + "::" + uuidStr, nil
}

func generateUserID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func encodeURIComponent(str string) string {
	result := url.QueryEscape(str)
	return strings.ReplaceAll(result, "+", "%20")
}

func formatDate() string {
	now := time.Now().UTC()
	formatted := now.Format("Mon, 02 Jan 2006 15:04:05 GMT")
	return strings.ToLower(formatted)
}
