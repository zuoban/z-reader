package config

import "os"

type Config struct {
	AppPassword    string
	AppPort        string
	UploadDir      string
	DBPath         string
	AllowedOrigins []string
}

func Load() *Config {
	return &Config{
		AppPassword:    getEnv("APP_PASSWORD", "password"),
		AppPort:        getEnv("APP_PORT", "8080"),
		UploadDir:      getEnv("UPLOAD_DIR", "./uploads"),
		DBPath:         getEnv("DB_PATH", "./data.db"),
		AllowedOrigins: getEnvSlice("ALLOWED_ORIGINS", []string{"http://localhost:3000", "http://localhost:8080"}),
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
	for _, v := range splitBy(s, ",") {
		result = append(result, v)
	}
	return result
}

func splitBy(s, sep string) []string {
	var result []string
	for {
		i := findSeparator(s, sep)
		if i < 0 {
			if s != "" {
				result = append(result, s)
			}
			break
		}
		result = append(result, s[:i])
		s = s[i+len(sep):]
	}
	return result
}

func findSeparator(s, sep string) int {
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			return i
		}
	}
	return -1
}
