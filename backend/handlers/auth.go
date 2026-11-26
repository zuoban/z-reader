package handlers

import (
	"crypto/sha256"
	"crypto/subtle"
	"net"
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
	if !bindJSON(c, &req, "请输入访问密码") {
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
	h.setAccessCookie(c, token, int(sessionDuration.Seconds()))
	h.Verify(c)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	token := middleware.SessionToken(c)
	cookie, _ := c.Cookie(middleware.SessionCookieName)
	var candidates []string
	if token != "" {
		candidates = append(candidates, middleware.SessionKey(h.cfg.AccessPassword, token))
	}
	if cookie != "" && cookie != token {
		candidates = append(candidates, middleware.SessionKey(h.cfg.AccessPassword, cookie))
	}
	var keys []string
	for _, key := range candidates {
		session, err := h.db.GetSession(key)
		if err != nil {
			response.InternalError(c, "退出失败")
			return
		}
		if session != nil {
			keys = append(keys, key)
		}
	}
	if len(keys) > 0 {
		if err := h.db.DeleteSessions(keys...); err != nil {
			response.InternalError(c, "退出失败")
			return
		}
	}
	h.setAccessCookie(c, "", -1)
	response.Success(c, "已退出")
}

func (h *AuthHandler) Verify(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"valid": true, "password_required": h.cfg.AccessPassword != ""})
}

func (h *AuthHandler) setAccessCookie(c *gin.Context, token string, maxAge int) {
	var trustedProxies []string
	if h.cfg != nil {
		trustedProxies = h.cfg.TrustedProxies
	}
	secure := isSecureRequest(c, trustedProxies)
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(middleware.SessionCookieName, token, maxAge, "/", "", secure, true)
}

func isSecureRequest(c *gin.Context, trustedProxies []string) bool {
	if c == nil || c.Request == nil {
		return false
	}
	if c.Request.TLS != nil {
		return true
	}
	proto := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Proto"), ",")[0])
	if !strings.EqualFold(proto, "https") {
		return false
	}
	return isTrustedProxy(c.Request.RemoteAddr, trustedProxies)
}

func isTrustedProxy(remoteAddr string, trustedProxies []string) bool {
	if len(trustedProxies) == 0 {
		return false
	}
	host := strings.TrimSpace(remoteAddr)
	if splitHost, _, err := net.SplitHostPort(host); err == nil {
		host = splitHost
	} else {
		host = strings.Trim(host, "[]")
	}
	peerIP := net.ParseIP(host)

	for _, entry := range trustedProxies {
		trimmed := strings.TrimSpace(entry)
		if trimmed == "" {
			continue
		}
		if trimmed == "*" {
			return true
		}
		if peerIP == nil {
			continue
		}
		if strings.Contains(trimmed, "/") {
			_, ipNet, err := net.ParseCIDR(trimmed)
			if err == nil && ipNet.Contains(peerIP) {
				return true
			}
			continue
		}
		if trustedIP := net.ParseIP(trimmed); trustedIP != nil && trustedIP.Equal(peerIP) {
			return true
		}
	}
	return false
}
