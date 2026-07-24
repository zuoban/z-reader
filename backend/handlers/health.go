package handlers

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
	"z-reader/backend/storage"
)

// Health reports whether the HTTP process is running.
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Ready returns a handler that checks the databases and upload storage before
// accepting traffic.
func Ready(db *storage.DB, uploadDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := db.Check(); err != nil {
			logger.Error(
				"Readiness check failed",
				"request_id", logger.RequestID(c.Request.Context()),
				"error", err,
			)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		if info, err := os.Stat(uploadDir); err != nil || !info.IsDir() {
			logger.Error(
				"Readiness upload directory check failed",
				"request_id", logger.RequestID(c.Request.Context()),
				"error", err,
			)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	}
}
