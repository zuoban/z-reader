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

	"z-reader/backend/backup"
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

	logger.Info("Server starting", "port", cfg.AppPort)

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
	if cfg.BackupIntervalHours > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			startBackupWorker(ctx, db, cfg)
		}()
	}

	r := gin.New()
	r.Use(
		middleware.RequestID(),
		middleware.RequestLogger(),
		middleware.HTTPMetrics(),
		gin.Recovery(),
		middleware.RequestBodyLimit(cfg.MaxRequestBodyBytes),
	)
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		logger.Error("Failed to configure trusted proxies", "error", err)
		os.Exit(1)
	}
	server := &http.Server{
		Addr:              ":" + cfg.AppPort,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       10 * time.Minute,
		WriteTimeout:      10 * time.Minute,
		IdleTimeout:       60 * time.Second,
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		ExposeHeaders:    []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	authHandler := handlers.NewAuthHandler(cfg, db)
	booksHandler := handlers.NewBooksHandler(cfg, db)
	progressHandler := handlers.NewProgressHandler(db)
	bookmarksHandler := handlers.NewBookmarksHandler(db)
	ttsHandler := handlers.NewTTSHandler()
	clientErrorHandler := handlers.NewClientErrorHandler()

	r.POST("/api/login", middleware.RateLimit(middleware.NewRateLimiter(5, 5*time.Minute)), authHandler.Login)
	r.POST("/api/register", middleware.RateLimit(middleware.NewRateLimiter(5, 5*time.Minute)), authHandler.Register)
	r.POST("/api/logout", authHandler.Logout)
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.GET("/readyz", func(c *gin.Context) {
		if err := db.Check(); err != nil {
			logger.Error("Readiness check failed", "request_id", logger.RequestID(c.Request.Context()), "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		if info, err := os.Stat(cfg.UploadDir); err != nil || !info.IsDir() {
			logger.Error("Readiness upload directory check failed", "request_id", logger.RequestID(c.Request.Context()), "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})
	if cfg.MetricsEnabled {
		r.GET("/metrics", middleware.MetricsHandler)
	}

	api := r.Group("/api")
	api.Use(middleware.AuthRequired(db))
	ttsIPLimiter := middleware.NewRateLimiter(30, time.Minute)
	ttsUserLimiter := middleware.NewRateLimiter(30, time.Minute)
	{
		api.GET("/auth/verify", authHandler.Verify)
		api.POST("/client-errors", middleware.RateLimit(middleware.NewRateLimiter(30, time.Minute)), clientErrorHandler.Report)

		api.GET("/books", booksHandler.List)
		api.GET("/books/summary", booksHandler.Summary)
		api.GET("/books/search", booksHandler.Search)
		api.GET("/books/:id", booksHandler.Get)
		api.POST("/books", middleware.RateLimit(middleware.NewRateLimiter(10, 5*time.Minute)), booksHandler.Upload)
		api.POST("/books/batch/delete", booksHandler.BatchDelete)
		api.POST("/books/batch/category", booksHandler.BatchUpdateCategory)
		api.PATCH("/books/:id", booksHandler.Update)
		api.DELETE("/books/:id/category", booksHandler.RemoveCategory)
		api.POST("/books/:id/cover", middleware.RateLimit(middleware.NewRateLimiter(10, 5*time.Minute)), booksHandler.UploadCover)
		api.DELETE("/books/:id", booksHandler.Delete)
		api.GET("/books/:id/file", booksHandler.GetFile)
		api.GET("/books/:id/cover", booksHandler.GetCover)
		api.GET("/books/:id/bookmarks", bookmarksHandler.List)
		api.POST("/books/:id/bookmarks", bookmarksHandler.Create)
		api.DELETE("/books/:id/bookmarks/:bookmarkID", bookmarksHandler.Delete)

		api.GET("/progress", progressHandler.List)
		api.GET("/progress/:id", progressHandler.Get)
		api.POST("/progress/:id", progressHandler.Save)

		api.GET(
			"/tts",
			middleware.RateLimit(ttsIPLimiter),
			middleware.RateLimitByUser(ttsUserLimiter),
			ttsHandler.TTS,
		)
		api.POST(
			"/ssml",
			middleware.RateLimit(ttsIPLimiter),
			middleware.RateLimitByUser(ttsUserLimiter),
			ttsHandler.SSML,
		)
		api.GET("/voices", ttsHandler.VoiceList)

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

func startBackupWorker(ctx context.Context, db *storage.DB, cfg *config.Config) {
	interval := time.Duration(cfg.BackupIntervalHours) * time.Hour
	createBackup := func() {
		path, err := backup.Create(db, backup.Config{
			Dir:           cfg.BackupDir,
			UploadDir:     cfg.UploadDir,
			RetentionDays: cfg.BackupRetentionDays,
		})
		if err != nil {
			logger.Error("Failed to create verified backup", "error", err)
			return
		}
		logger.Info("Verified backup created", "path", path)
	}

	createBackup()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	logger.Info("Backup worker started", "interval_hours", cfg.BackupIntervalHours)
	for {
		select {
		case <-ctx.Done():
			logger.Info("Backup worker stopped")
			return
		case <-ticker.C:
			createBackup()
		}
	}
}
