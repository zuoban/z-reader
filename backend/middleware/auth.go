package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/response"
	"z-reader/backend/storage"
)

const SessionCookieName = "z_reader_session"

func SessionToken(c *gin.Context) string {
	authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
	if len(authHeader) >= 7 && strings.EqualFold(authHeader[:7], "Bearer ") {
		if token := strings.TrimSpace(authHeader[7:]); token != "" {
			return token
		}
	}
	token, _ := c.Cookie(SessionCookieName)
	return token
}

func SessionKey(password, token string) string {
	mac := hmac.New(sha256.New, []byte(password))
	mac.Write([]byte(token))
	return hex.EncodeToString(mac.Sum(nil))
}

func AuthRequired(db *storage.DB, password string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if password != "" {
			token := SessionToken(c)
			if token == "" {
				response.Unauthorized(c, "请输入访问密码")
				c.Abort()
				return
			}
			session, err := db.GetSession(SessionKey(password, token))
			if err != nil {
				response.InternalError(c, "验证访问权限失败")
				c.Abort()
				return
			}
			if session == nil {
				response.Unauthorized(c, "访问已过期，请重新输入密码")
				c.Abort()
				return
			}
		}
		c.Next()
	}
}
