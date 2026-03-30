package config

import "os"

type Config struct {
	AppPassword string
	AppPort     string
	UploadDir   string
	DBPath      string
}

func Load() *Config {
	return &Config{
		AppPassword: getEnv("APP_PASSWORD", "password"),
		AppPort:     getEnv("APP_PORT", "8080"),
		UploadDir:   getEnv("UPLOAD_DIR", "./uploads"),
		DBPath:      getEnv("DB_PATH", "./data.db"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
