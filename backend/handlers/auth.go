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
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

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
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}

	if err := h.db.SaveSession(session); err != nil {
		response.InternalError(c, "保存登录状态失败")
		return
	}

	c.JSON(http.StatusOK, LoginResponse{Token: token, User: publicUser(*user)})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	token := strings.TrimSpace(c.GetHeader("Authorization"))
	if token == "" {
		response.BadRequest(c, "缺少登录凭证")
		return
	}

	token = strings.TrimPrefix(token, "Bearer ")
	token = strings.TrimSpace(token)
	if token == "" {
		response.BadRequest(c, "缺少登录凭证")
		return
	}

	if err := h.db.DeleteSession(token); err != nil {
		response.InternalError(c, "退出登录失败")
		return
	}

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
