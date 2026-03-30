package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"z-reader/backend/config"
	"z-reader/backend/handlers"
	"z-reader/backend/middleware"
	"z-reader/backend/storage"
)

func main() {
	// Try loading .env from multiple locations
	if err := godotenv.Load(); err != nil {
		if err := godotenv.Load("../.env"); err != nil {
			log.Println("No .env file found, using environment variables")
		}
	}

	cfg := config.Load()

	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		log.Fatalf("Failed to create upload directory: %v", err)
	}

	db, err := storage.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		startSessionCleaner(ctx, db)
	}()

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	authHandler := handlers.NewAuthHandler(cfg, db)
	booksHandler := handlers.NewBooksHandler(cfg, db)
	progressHandler := handlers.NewProgressHandler(db)
	ttsHandler := handlers.NewTTSHandler()

	r.POST("/api/login", authHandler.Login)
	r.POST("/api/logout", authHandler.Logout)

	r.GET("/api/tts", ttsHandler.TTS)
	r.POST("/api/ssml", ttsHandler.SSML)
	r.GET("/api/voices", ttsHandler.VoiceList)

	api := r.Group("/api")
	api.Use(middleware.AuthRequired(db))
	{
		api.GET("/auth/verify", authHandler.Verify)

		api.GET("/books", booksHandler.List)
		api.POST("/books", booksHandler.Upload)
		api.DELETE("/books/:id", booksHandler.Delete)
		api.GET("/books/:id/file", booksHandler.GetFile)
		api.GET("/books/:id/cover", booksHandler.GetCover)

		api.GET("/progress/:id", progressHandler.Get)
		api.POST("/progress/:id", progressHandler.Save)
	}

	log.Printf("Server starting on port %s", cfg.AppPort)
	log.Printf("Password configured: %v", cfg.AppPassword != "")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- r.Run(":" + cfg.AppPort)
	}()

	select {
	case err := <-serverErr:
		if err != nil {
			log.Printf("Server error: %v", err)
		}
	case sig := <-quit:
		log.Printf("Received signal: %v", sig)
	}

	cancel()
	wg.Wait()
	db.Close()
	log.Println("Server stopped")
}

func startSessionCleaner(ctx context.Context, db *storage.DB) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	db.CleanExpiredSessions()
	log.Println("Session cleaner started")

	for {
		select {
		case <-ctx.Done():
			log.Println("Session cleaner stopped")
			return
		case <-ticker.C:
			if err := db.CleanExpiredSessions(); err != nil {
				log.Printf("Failed to clean expired sessions: %v", err)
			}
		}
	}
}
