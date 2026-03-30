package main

import (
	"log"
	"os"

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
	defer db.Close()

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

	r.POST("/api/login", authHandler.Login)
	r.POST("/api/logout", authHandler.Logout)

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
	if err := r.Run(":" + cfg.AppPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
