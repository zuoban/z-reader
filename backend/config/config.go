package config

import (
	"net"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppPassword    string
	AppPort        string
	UploadDir      string
	DBPath         string
	AllowedOrigins []string
}

// getLocalIP 获取局域网 IP 地址
// 优先返回 192.168.x.x 或 10.x.x.x 或 172.16-31.x.x 的 IP
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}

	// 第一次遍历，寻找私有 IP
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP.IsLoopback() || ipNet.IP.To4() == nil {
			continue
		}

		ip := ipNet.IP.String()
		if isPrivateIP(ip) {
			return ip
		}
	}

	// 第二次遍历，返回第一个找到的 IPv4 地址
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP.IsLoopback() || ipNet.IP.To4() == nil {
			continue
		}
		return ipNet.IP.String()
	}

	return "127.0.0.1"
}

// isPrivateIP 判断是否为私有 IP 地址
func isPrivateIP(ip string) bool {
	return strings.HasPrefix(ip, "192.168.") ||
		strings.HasPrefix(ip, "10.") ||
		isPrivate172(ip)
}

// isPrivate172 判断是否为 172.16-31.x.x
func isPrivate172(ip string) bool {
	if !strings.HasPrefix(ip, "172.") {
		return false
	}
	parts := strings.Split(ip, ".")
	if len(parts) < 2 {
		return false
	}
	second, err := strconv.Atoi(parts[1])
	if err != nil {
		return false
	}
	return second >= 16 && second <= 31
}

// getAllowedOrigins 获取允许的 CORS 来源
func getAllowedOrigins() []string {
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		return splitCSV(origins)
	}

	// 默认允许本地开发和局域网访问
	localIP := getLocalIP()
	return uniqueStrings([]string{
		"http://localhost:3000",
		"http://localhost:8080",
		"http://127.0.0.1:3000",
		"http://127.0.0.1:8080",
		"http://" + localIP + ":3000",
		"http://" + localIP + ":8080",
	})
}

func Load() *Config {
	return &Config{
		AppPassword:    getEnv("APP_PASSWORD", "password"),
		AppPort:        getEnv("APP_PORT", "8080"),
		UploadDir:      getEnv("UPLOAD_DIR", "./uploads"),
		DBPath:         getEnv("DB_PATH", "./data.db"),
		AllowedOrigins: getAllowedOrigins(),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return splitCSV(value)
	}
	return defaultValue
}

func splitCSV(s string) []string {
	var result []string
	for _, v := range strings.Split(s, ",") {
		trimmed := strings.TrimSpace(v)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return uniqueStrings(result)
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
