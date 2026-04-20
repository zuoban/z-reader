package services

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"z-reader/backend/utils"
)

const (
	EndpointRefreshThreshold = 300
	SignatureKeyBase64       = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=="
)

type EndpointCache struct {
	Endpoint  string
	Token     string
	ExpiredAt int64
	ClientID  string
}

type EndpointResponse struct {
	T string `json:"t"`
	R string `json:"r"`
}

var endpointCache struct {
	data  *EndpointCache
	mutex sync.RWMutex
}

func GetEndpoint() (*EndpointCache, error) {
	endpointCache.mutex.RLock()
	if endpointCache.data != nil {
		cache := endpointCache.data
		endpointCache.mutex.RUnlock()
		now := time.Now().Unix()
		if cache.ExpiredAt-now > EndpointRefreshThreshold {
			return cache, nil
		}
	} else {
		endpointCache.mutex.RUnlock()
	}

	return refreshEndpointCache()
}

func refreshEndpointCache() (*EndpointCache, error) {
	endpointCache.mutex.Lock()
	defer endpointCache.mutex.Unlock()

	resp, err := callEndpointAPI()
	if err != nil {
		return nil, err
	}

	exp, err := parseJWTExp(resp.T)
	if err != nil {
		return nil, err
	}

	cache := &EndpointCache{
		Endpoint:  resp.R,
		Token:     resp.T,
		ExpiredAt: exp,
		ClientID:  utils.GenerateUUID(),
	}

	endpointCache.data = cache
	return cache, nil
}

func parseJWTExp(token string) (int64, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, fmt.Errorf("语音服务令牌格式无效")
	}

	payload := parts[1]
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(payload)
		if err != nil {
			return 0, fmt.Errorf("解析语音服务令牌失败：%v", err)
		}
	}

	var jwtData struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(decoded, &jwtData); err != nil {
		return 0, fmt.Errorf("读取语音服务令牌失败：%v", err)
	}

	return jwtData.Exp, nil
}

func callEndpointAPI() (*EndpointResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

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
	req.Header.Set("X-UserId", utils.GenerateUserID())
	req.Header.Set("X-HomeGeographicRegion", "zh-Hans-CN")
	req.Header.Set("X-ClientTraceId", utils.GenerateUUID())
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
		return nil, fmt.Errorf("语音服务端点返回状态码 %d", resp.StatusCode)
	}

	var endpointResp EndpointResponse
	if err := json.NewDecoder(resp.Body).Decode(&endpointResp); err != nil {
		return nil, err
	}

	return &endpointResp, nil
}

func buildSignature(urlStr string) (string, error) {
	urlPart := strings.TrimPrefix(urlStr, "https://")
	encodedUrl := encodeURIComponent(urlPart)
	uuidStr := utils.GenerateUUID()
	formattedDate := formatDate()

	bytesToSign := strings.ToLower("MSTranslatorAndroidApp" + encodedUrl + formattedDate + uuidStr)

	key, err := utils.Base64Decode(SignatureKeyBase64)
	if err != nil {
		return "", err
	}

	signData := utils.HmacSha256(key, []byte(bytesToSign))
	signBase64 := utils.Base64Encode(signData)

	return "MSTranslatorAndroidApp::" + signBase64 + "::" + formattedDate + "::" + uuidStr, nil
}

func encodeURIComponent(str string) string {
	result := url.QueryEscape(str)
	result = strings.ReplaceAll(result, "+", "%20")
	result = strings.ReplaceAll(result, "%2F", "/")
	result = strings.ReplaceAll(result, "/", "%2F")
	return result
}

func formatDate() string {
	now := time.Now().UTC()
	formatted := now.Format("Mon, 02 Jan 2006 15:04:05 GMT")
	return strings.ToLower(formatted)
}
