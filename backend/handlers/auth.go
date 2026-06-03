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

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string           `json:"token,omitempty"`
	User  authUserResponse `json:"user"`
}

type authUserResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
		response.BadRequest(c, "请输入用户名")
		return
	}
	if len(req.Password) > 72 {
		response.Unauthorized(c, "用户名或密码错误")
		return
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

	h.createSessionResponse(c, user)
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求内容无效")
		return
	}

	username := strings.TrimSpace(req.Username)
	password := strings.TrimSpace(req.Password)
	if username == "" || len(username) > 50 {
		response.BadRequest(c, "用户名长度必须为 1 到 50 个字符")
		return
	}
	if len(password) < 6 {
		response.BadRequest(c, "密码至少需要 6 个字符")
		return
	}
	if len(password) > 72 {
		response.BadRequest(c, "密码不能超过 72 个字符")
		return
	}

	existing, err := h.db.GetUserByUsername(username)
	if err != nil {
		response.InternalError(c, "获取用户失败")
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
		return
	}

	users, err := h.db.ListUsers()
	if err != nil {
		response.InternalError(c, "获取用户失败")
		return
	}

	passwordHash, err := storage.HashPassword(password)
	if err != nil {
		response.InternalError(c, "处理密码失败")
		return
	}

	now := time.Now()
	user := &models.User{
		ID:           uuid.New().String(),
		Username:     username,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := h.db.SaveUser(user); err != nil {
		response.InternalError(c, "保存用户失败")
		return
	}
	if len(users) == 0 {
		if err := h.db.AssignUnownedDataToUser(user.ID); err != nil {
			response.InternalError(c, "迁移历史数据失败")
			return
		}
	}

	h.createSessionResponse(c, user)
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

func (h *AuthHandler) createSessionResponse(c *gin.Context, user *models.User) {
	token := uuid.New().String()
	now := time.Now()
	session := &models.Session{
		Token:     token,
		UserID:    user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: now,
		ExpiresAt: now.Add(sessionDuration),
	}

	if err := h.db.SaveSession(session); err != nil {
		response.InternalError(c, "保存登录状态失败")
		return
	}

	setSessionCookie(c, token, session.ExpiresAt)
	c.JSON(http.StatusOK, LoginResponse{User: publicAuthUser(*user)})
}

func publicAuthUser(user models.User) authUserResponse {
	return authUserResponse{
		ID:        user.ID,
		Username:  user.Username,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
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
