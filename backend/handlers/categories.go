package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

var DefaultColors = []string{
	"#A4D3F2", // 晴蓝
	"#2DABC2", // 海青
	"#143B5D", // 深海
	"#FDBA11", // 金黄
	"#FF8A00", // 橙焰
	"#E85D3F", // 珊红
	"#5D9B6A", // 松绿
	"#7A64B8", // 葡紫
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
	Name      string `json:"name" binding:"required,max=50"`
	SortOrder *int   `json:"sort_order"`
}

func (h *CategoriesHandler) Create(c *gin.Context) {
	var req categoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	categories, err := h.db.ListCategories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list categories"})
		return
	}

	sortOrder := len(categories) + 1
	if req.SortOrder != nil && *req.SortOrder > 0 {
		sortOrder = *req.SortOrder
	}

	// 根据排序位置自动分配颜色
	colorIndex := (sortOrder - 1) % len(DefaultColors)
	color := DefaultColors[colorIndex]

	category := &models.Category{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Color:     color,
		SortOrder: sortOrder,
		CreatedAt: time.Now(),
	}

	if err := h.db.SaveCategory(category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save category"})
		return
	}

	c.JSON(http.StatusOK, category)
}

type categoryUpdateRequest struct {
	Name      *string `json:"name"`
	SortOrder *int    `json:"sort_order"`
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
	if req.SortOrder != nil {
		if *req.SortOrder <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sort order"})
			return
		}
		// 如果排序位置变化，更新颜色
		oldSortOrder := category.SortOrder
		category.SortOrder = *req.SortOrder
		if oldSortOrder != *req.SortOrder {
			colorIndex := (*req.SortOrder - 1) % len(DefaultColors)
			category.Color = DefaultColors[colorIndex]
		}
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
