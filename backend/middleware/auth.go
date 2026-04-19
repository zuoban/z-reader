package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
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
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify token"})
			c.Abort()
			return
		}
		if session == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}
		if session.UserID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		user, err := db.GetUser(session.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
			c.Abort()
			return
		}
		if user == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("token", token)
		c.Set("userID", user.ID)
		c.Set("username", user.Username)
		c.Set("userRole", user.Role)
		c.Set("user", gin.H{
			"id":         user.ID,
			"username":   user.Username,
			"role":       user.Role,
			"created_at": user.CreatedAt,
			"updated_at": user.UpdatedAt,
		})
		c.Next()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("userRole")
		if role != models.UserRoleAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "admin permission required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
