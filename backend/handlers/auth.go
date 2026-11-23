package handlers

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/config"
	"z-reader/backend/middleware"
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

const sessionDuration = 7 * 24 * time.Hour

func (h *AuthHandler) Login(c *gin.Context) {
	if h.cfg.AccessPassword == "" {
		h.Verify(c)
		return
	}
	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请输入访问密码")
		return
	}
	expected := sha256.Sum256([]byte(h.cfg.AccessPassword))
	actual := sha256.Sum256([]byte(req.Password))
	if subtle.ConstantTimeCompare(expected[:], actual[:]) != 1 {
		response.Unauthorized(c, "访问密码错误")
		return
	}
	token := uuid.NewString()
	now := time.Now()
	if err := h.db.SaveSession(&models.Session{
		Token:     middleware.SessionKey(h.cfg.AccessPassword, token),
		CreatedAt: now,
		ExpiresAt: now.Add(sessionDuration),
	}); err != nil {
		response.InternalError(c, "保存访问状态失败")
		return
	}
	setAccessCookie(c, token, int(sessionDuration.Seconds()))
	h.Verify(c)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	if token := middleware.SessionToken(c); token != "" {
		if err := h.db.DeleteSession(middleware.SessionKey(h.cfg.AccessPassword, token)); err != nil {
			response.InternalError(c, "退出失败")
			return
		}
	}
	setAccessCookie(c, "", -1)
	response.Success(c, "已退出")
}

func (h *AuthHandler) Verify(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"valid": true, "password_required": h.cfg.AccessPassword != ""})
}

func setAccessCookie(c *gin.Context, token string, maxAge int) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(middleware.SessionCookieName, token, maxAge, "/", "", secure, true)
}
