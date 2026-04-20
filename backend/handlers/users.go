package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

type UsersHandler struct {
	db *storage.DB
}

func NewUsersHandler(db *storage.DB) *UsersHandler {
	return &UsersHandler{db: db}
}

type userResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type createUserRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Role     string `json:"role"`
}

type updateUserRequest struct {
	Password *string `json:"password"`
	Role     *string `json:"role"`
}

func publicUser(user models.User) userResponse {
	return userResponse{
		ID:        user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}
}

func normalizeUserRole(role string) string {
	role = strings.TrimSpace(strings.ToLower(role))
	if role == "" {
		return models.UserRoleUser
	}
	return role
}

func isValidUserRole(role string) bool {
	return role == models.UserRoleAdmin || role == models.UserRoleUser
}

func (h *UsersHandler) List(c *gin.Context) {
	users, err := h.db.ListUsers()
	if err != nil {
		response.InternalError(c, "获取用户列表失败")
		return
	}

	resp := make([]userResponse, 0, len(users))
	for _, user := range users {
		resp = append(resp, publicUser(user))
	}
	c.JSON(http.StatusOK, resp)
}

func (h *UsersHandler) Create(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求内容无效")
		return
	}

	username := strings.TrimSpace(req.Username)
	password := strings.TrimSpace(req.Password)
	role := normalizeUserRole(req.Role)
	if username == "" || len(username) > 50 {
		response.BadRequest(c, "用户名长度必须为 1 到 50 个字符")
		return
	}
	if len(password) < 6 {
		response.BadRequest(c, "密码至少需要 6 个字符")
		return
	}
	if !isValidUserRole(role) {
		response.BadRequest(c, "用户角色无效")
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
		Role:         role,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := h.db.SaveUser(user); err != nil {
		response.InternalError(c, "保存用户失败")
		return
	}

	c.JSON(http.StatusOK, publicUser(*user))
}

func (h *UsersHandler) Update(c *gin.Context) {
	user, err := h.db.GetUser(c.Param("id"))
	if err != nil {
		response.InternalError(c, "获取用户失败")
		return
	}
	if user == nil {
		response.NotFound(c, "用户不存在")
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求内容无效")
		return
	}

	if req.Password != nil {
		password := strings.TrimSpace(*req.Password)
		if len(password) < 6 {
			response.BadRequest(c, "密码至少需要 6 个字符")
			return
		}
		passwordHash, err := storage.HashPassword(password)
		if err != nil {
			response.InternalError(c, "处理密码失败")
			return
		}
		user.PasswordHash = passwordHash
	}

	if req.Role != nil {
		role := normalizeUserRole(*req.Role)
		if !isValidUserRole(role) {
			response.BadRequest(c, "用户角色无效")
			return
		}
		if user.Role == models.UserRoleAdmin && role != models.UserRoleAdmin {
			if h.isLastAdmin(user.ID) {
				response.BadRequest(c, "不能移除最后一个管理员")
				return
			}
		}
		user.Role = role
	}

	user.UpdatedAt = time.Now()
	if err := h.db.SaveUser(user); err != nil {
		response.InternalError(c, "保存用户失败")
		return
	}
	c.JSON(http.StatusOK, publicUser(*user))
}

func (h *UsersHandler) Delete(c *gin.Context) {
	user, err := h.db.GetUser(c.Param("id"))
	if err != nil {
		response.InternalError(c, "获取用户失败")
		return
	}
	if user == nil {
		response.NotFound(c, "用户不存在")
		return
	}

	currentUserID, _ := currentUserID(c)
	if currentUserID == user.ID {
		response.BadRequest(c, "不能删除当前登录用户")
		return
	}
	if user.Role == models.UserRoleAdmin && h.isLastAdmin(user.ID) {
		response.BadRequest(c, "不能删除最后一个管理员")
		return
	}

	if err := h.db.DeleteUserData(user.ID); err != nil {
		response.InternalError(c, "清理用户数据失败")
		return
	}
	if err := h.db.DeleteUser(user.ID); err != nil {
		response.InternalError(c, "删除用户失败")
		return
	}
	response.Success(c, "已删除")
}

func (h *UsersHandler) isLastAdmin(userID string) bool {
	users, err := h.db.ListUsers()
	if err != nil {
		return true
	}
	adminCount := 0
	for _, user := range users {
		if user.Role == models.UserRoleAdmin {
			adminCount++
		}
	}
	return adminCount <= 1
}
