package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/storage"
)

func AuthRequired(db *storage.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			c.Abort()
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			token = authHeader
		}

		session, err := db.GetSession(token)
		if err != nil || session == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("token", token)
		c.Next()
	}
}
