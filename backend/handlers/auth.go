package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

type AuthHandler struct {
	cfg *config.Config
	db  *storage.DB
}

func NewAuthHandler(cfg *config.Config, db *storage.DB) *AuthHandler {
	return &AuthHandler{cfg: cfg, db: db}
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string       `json:"token,omitempty"`
	User  userResponse `json:"user"`
}

const (
	sessionCookieName = "z_reader_session"
	sessionDuration   = 7 * 24 * time.Hour
)

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请输入密码")
		return
	}

	username := strings.TrimSpace(req.Username)
	if username == "" {
		username = "admin"
	}

	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		response.InternalError(c, "获取用户失败")
		return
	}
	if user == nil || !storage.CheckPassword(user.PasswordHash, req.Password) {
		response.Unauthorized(c, "用户名或密码错误")
		return
	}

	token := uuid.New().String()
	session := &models.Session{
		Token:     token,
		UserID:    user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(sessionDuration),
	}

	if err := h.db.SaveSession(session); err != nil {
		response.InternalError(c, "保存登录状态失败")
		return
	}

	setSessionCookie(c, token, session.ExpiresAt)
	c.JSON(http.StatusOK, LoginResponse{User: publicUser(*user)})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	token := sessionTokenFromRequest(c)
	if token == "" {
		response.BadRequest(c, "缺少登录凭证")
		return
	}

	if err := h.db.DeleteSession(token); err != nil {
		response.InternalError(c, "退出登录失败")
		return
	}

	clearSessionCookie(c)
	response.Success(c, "已退出登录")
}

func (h *AuthHandler) Verify(c *gin.Context) {
	user, ok := c.Get("user")
	if !ok {
		c.JSON(http.StatusOK, gin.H{"valid": true})
		return
	}
	c.JSON(http.StatusOK, gin.H{"valid": true, "user": user})
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

func setSessionCookie(c *gin.Context, token string, expiresAt time.Time) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		sessionCookieName,
		token,
		int(time.Until(expiresAt).Seconds()),
		"/",
		"",
		isSecureRequest(c),
		true,
	)
}

func clearSessionCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(sessionCookieName, "", -1, "/", "", isSecureRequest(c), true)
}

func isSecureRequest(c *gin.Context) bool {
	if c.Request == nil {
		return false
	}
	if c.Request.TLS != nil {
		return true
	}
	return strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
}
