package handlers

import (
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

var DefaultColors = []string{
	"#EF4444", // 红色
	"#F59E0B", // 橙色
	"#10B981", // 绿色
	"#3B82F6", // 蓝色
	"#8B5CF6", // 紫色
	"#EC4899", // 粉色
	"#6366F1", // 靛蓝
	"#14B8A6", // 青色
}

var colorRegex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func isValidColor(color string) bool {
	return colorRegex.MatchString(color)
}

type CategoriesHandler struct {
	cfg *config.Config
	db  *storage.DB
}

func NewCategoriesHandler(cfg *config.Config, db *storage.DB) *CategoriesHandler {
	return &CategoriesHandler{cfg: cfg, db: db}
}

func (h *CategoriesHandler) List(c *gin.Context) {
	categories, err := h.db.ListCategories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list categories"})
		return
	}
	c.JSON(http.StatusOK, categories)
}

type categoryRequest struct {
	Name  string `json:"name" binding:"required,max=50"`
	Color string `json:"color" binding:"required,len=7"`
}

func (h *CategoriesHandler) Create(c *gin.Context) {
	var req categoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if !isValidColor(req.Color) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid color format"})
		return
	}

	category := &models.Category{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Color:     req.Color,
		CreatedAt: time.Now(),
	}

	if err := h.db.SaveCategory(category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save category"})
		return
	}

	c.JSON(http.StatusOK, category)
}

type categoryUpdateRequest struct {
	Name  *string `json:"name"`
	Color *string `json:"color"`
}

func (h *CategoriesHandler) Update(c *gin.Context) {
	id := c.Param("id")

	category, err := h.db.GetCategory(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get category"})
		return
	}
	if category == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}

	var req categoryUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.Name != nil {
		category.Name = *req.Name
	}
	if req.Color != nil {
		if !isValidColor(*req.Color) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid color format"})
			return
		}
		category.Color = *req.Color
	}

	if err := h.db.SaveCategory(category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save category"})
		return
	}

	c.JSON(http.StatusOK, category)
}

func (h *CategoriesHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	category, err := h.db.GetCategory(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get category"})
		return
	}
	if category == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}

	if err := h.db.DeleteCategory(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete category"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}


