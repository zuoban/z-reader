package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func currentUserID(c *gin.Context) (string, bool) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
		return "", false
	}
	return userID, true
}
