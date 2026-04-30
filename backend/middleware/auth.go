package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

const sessionCookieName = "z_reader_session"

func AuthRequired(db *storage.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := sessionTokenFromRequest(c)
		if token == "" {
			response.Unauthorized(c, "请先登录")
			c.Abort()
			return
		}

		session, err := db.GetSession(token)
		if err != nil {
			response.InternalError(c, "验证登录状态失败")
			c.Abort()
			return
		}
		if session == nil {
			response.Unauthorized(c, "登录已失效，请重新登录")
			c.Abort()
			return
		}
		if session.UserID == "" {
			response.Unauthorized(c, "登录已失效，请重新登录")
			c.Abort()
			return
		}

		user, err := db.GetUser(session.UserID)
		if err != nil {
			response.InternalError(c, "获取用户失败")
			c.Abort()
			return
		}
		if user == nil {
			response.Unauthorized(c, "登录已失效，请重新登录")
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

func sessionTokenFromRequest(c *gin.Context) string {
	token := strings.TrimSpace(c.GetHeader("Authorization"))
	token = strings.TrimSpace(strings.TrimPrefix(token, "Bearer "))
	if token != "" {
		return token
	}

	cookieToken, err := c.Cookie(sessionCookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookieToken)
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("userRole")
		if role != models.UserRoleAdmin {
			response.Forbidden(c, "需要管理员权限")
			c.Abort()
			return
		}
		c.Next()
	}
}
