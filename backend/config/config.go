package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AccessPassword      string
	AppPort             string
	UploadDir           string
	DBPath              string
	MaxUploadBytes      int64
	MaxRequestBodyBytes int64
	AllowedOrigins      []string
	TrustedProxies      []string
	MetricsEnabled      bool
	PprofEnabled        bool
	BackupDir           string
	BackupIntervalHours int
	BackupRetentionDays int
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

		if ipNet.IP.IsPrivate() {
			return ipNet.IP.String()
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

func validateAllowedOrigins(origins []string) error {
	if len(origins) == 0 {
		return fmt.Errorf("ALLOWED_ORIGINS must contain at least one valid origin")
	}
	for _, origin := range origins {
		if origin == "*" {
			return fmt.Errorf("ALLOWED_ORIGINS cannot contain wildcard %q when credentials are enabled", origin)
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: %w", origin, err)
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			return fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: scheme must be http or https", origin)
		}
		if parsed.Opaque != "" || parsed.User != nil || parsed.Hostname() == "" {
			return fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: must include a valid host", origin)
		}
		if parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" ||
			strings.ContainsAny(origin, "?#") {
			return fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: must not include path, query, or fragment", origin)
		}
	}
	return nil
}

func Load() (*Config, error) {
	allowedOrigins := getAllowedOrigins()
	if err := validateAllowedOrigins(allowedOrigins); err != nil {
		return nil, err
	}
	return &Config{
		AccessPassword:      os.Getenv("ACCESS_PASSWORD"),
		AppPort:             getEnv("APP_PORT", "8080"),
		UploadDir:           getEnv("UPLOAD_DIR", "./uploads"),
		DBPath:              getEnv("DB_PATH", "./data.db"),
		MaxUploadBytes:      getEnvInt64("MAX_UPLOAD_BYTES", 256*1024*1024),
		MaxRequestBodyBytes: getEnvInt64("MAX_REQUEST_BODY_BYTES", 1024*1024),
		AllowedOrigins:      allowedOrigins,
		TrustedProxies:      getEnvSlice("TRUSTED_PROXIES", []string{"127.0.0.1", "::1"}),
		MetricsEnabled:      getEnvBool("METRICS_ENABLED", false),
		PprofEnabled:        getEnvBool("PPROF_ENABLED", false),
		BackupDir:           getEnv("BACKUP_DIR", "./backups"),
		BackupIntervalHours: getEnvInt("BACKUP_INTERVAL_HOURS", 24),
		BackupRetentionDays: getEnvInt("BACKUP_RETENTION_DAYS", 7),
	}, nil
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

func getEnvInt64(key string, defaultValue int64) int64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return defaultValue
	}

	return parsed
}

func getEnvBool(key string, defaultValue bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvInt(key string, defaultValue int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return defaultValue
	}
	return parsed
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
