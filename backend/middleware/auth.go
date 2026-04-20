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
			c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
			c.Abort()
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			token = authHeader
		}

		session, err := db.GetSession(token)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "验证登录状态失败"})
			c.Abort()
			return
		}
		if session == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已失效，请重新登录"})
			c.Abort()
			return
		}
		if session.UserID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已失效，请重新登录"})
			c.Abort()
			return
		}

		user, err := db.GetUser(session.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "获取用户失败"})
			c.Abort()
			return
		}
		if user == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已失效，请重新登录"})
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
			c.JSON(http.StatusForbidden, gin.H{"error": "需要管理员权限"})
			c.Abort()
			return
		}
		c.Next()
	}
}
