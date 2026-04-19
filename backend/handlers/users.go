package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/models"
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	username := strings.TrimSpace(req.Username)
	password := strings.TrimSpace(req.Password)
	role := normalizeUserRole(req.Role)
	if username == "" || len(username) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username must be 1-50 characters"})
		return
	}
	if len(password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 6 characters"})
		return
	}
	if !isValidUserRole(role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user role"})
		return
	}

	existing, err := h.db.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	passwordHash, err := storage.HashPassword(password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save user"})
		return
	}

	c.JSON(http.StatusOK, publicUser(*user))
}

func (h *UsersHandler) Update(c *gin.Context) {
	user, err := h.db.GetUser(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.Password != nil {
		password := strings.TrimSpace(*req.Password)
		if len(password) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 6 characters"})
			return
		}
		passwordHash, err := storage.HashPassword(password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		user.PasswordHash = passwordHash
	}

	if req.Role != nil {
		role := normalizeUserRole(*req.Role)
		if !isValidUserRole(role) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user role"})
			return
		}
		if user.Role == models.UserRoleAdmin && role != models.UserRoleAdmin {
			if h.isLastAdmin(user.ID) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove the last admin"})
				return
			}
		}
		user.Role = role
	}

	user.UpdatedAt = time.Now()
	if err := h.db.SaveUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save user"})
		return
	}
	c.JSON(http.StatusOK, publicUser(*user))
}

func (h *UsersHandler) Delete(c *gin.Context) {
	user, err := h.db.GetUser(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	currentUserID, _ := currentUserID(c)
	if currentUserID == user.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete current user"})
		return
	}
	if user.Role == models.UserRoleAdmin && h.isLastAdmin(user.ID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete the last admin"})
		return
	}

	if err := h.db.DeleteUserData(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clean user data"})
		return
	}
	if err := h.db.DeleteUser(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
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
