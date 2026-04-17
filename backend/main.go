package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"z-reader/backend/config"
	"z-reader/backend/handlers"
	"z-reader/backend/logger"
	"z-reader/backend/middleware"
	"z-reader/backend/storage"
)

func main() {
	godotenv.Load()
	godotenv.Load("../.env")

	logger.Init()
	cfg, err := config.Load()
	if err != nil {
		logger.Error("Failed to load config", "error", err)
		os.Exit(1)
	}

	logger.Info("Server starting", "port", cfg.AppPort, "password_configured", cfg.AppPassword != "")

	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		logger.Error("Failed to create upload directory", "error", err)
		os.Exit(1)
	}

	db, err := storage.Open(cfg.DBPath)
	if err != nil {
		logger.Error("Failed to open database", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		startSessionCleaner(ctx, db)
	}()

	r := gin.Default()
	server := &http.Server{
		Addr:    ":" + cfg.AppPort,
		Handler: r,
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	authHandler := handlers.NewAuthHandler(cfg, db)
	booksHandler := handlers.NewBooksHandler(cfg, db)
	progressHandler := handlers.NewProgressHandler(db)
	ttsHandler := handlers.NewTTSHandler()
	categoriesHandler := handlers.NewCategoriesHandler(cfg, db)

	r.POST("/api/login", authHandler.Login)
	r.POST("/api/logout", authHandler.Logout)
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	api.Use(middleware.AuthRequired(db))
	{
		api.GET("/auth/verify", authHandler.Verify)

		api.GET("/books", booksHandler.List)
		api.GET("/books/:id", booksHandler.Get)
		api.POST("/books", booksHandler.Upload)
		api.PATCH("/books/:id", booksHandler.Update)
		api.DELETE("/books/:id/category", booksHandler.RemoveCategory)
		api.POST("/books/:id/cover", booksHandler.UploadCover)
		api.DELETE("/books/:id", booksHandler.Delete)
		api.GET("/books/:id/file", booksHandler.GetFile)
		api.GET("/books/:id/cover", booksHandler.GetCover)

		api.GET("/progress/:id", progressHandler.Get)
		api.POST("/progress/:id", progressHandler.Save)

		api.GET("/tts", ttsHandler.TTS)
		api.POST("/ssml", ttsHandler.SSML)
		api.GET("/voices", ttsHandler.VoiceList)

		api.GET("/categories", categoriesHandler.List)
		api.POST("/categories", categoriesHandler.Create)
		api.PATCH("/categories/:id", categoriesHandler.Update)
		api.DELETE("/categories/:id", categoriesHandler.Delete)
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("Server error", "error", err)
		}
	case sig := <-quit:
		logger.Info("Received signal", "signal", sig)
	}

	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("Failed to shut down server gracefully", "error", err)
	}
	wg.Wait()
	db.Close()
	logger.Info("Server stopped")
}

func startSessionCleaner(ctx context.Context, db *storage.DB) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	if err := db.CleanExpiredSessions(); err != nil {
		logger.Error("Failed to clean expired sessions", "error", err)
	}
	logger.Info("Session cleaner started")

	for {
		select {
		case <-ctx.Done():
			logger.Info("Session cleaner stopped")
			return
		case <-ticker.C:
			if err := db.CleanExpiredSessions(); err != nil {
				logger.Error("Failed to clean expired sessions", "error", err)
			}
		}
	}
}
