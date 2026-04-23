package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

type CategoriesHandler struct {
	cfg *config.Config
	db  *storage.DB
}

func NewCategoriesHandler(cfg *config.Config, db *storage.DB) *CategoriesHandler {
	return &CategoriesHandler{cfg: cfg, db: db}
}

func (h *CategoriesHandler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	categories, err := h.db.ListCategories(userID)
	if err != nil {
		response.InternalError(c, "获取分类列表失败")
		return
	}
	c.JSON(http.StatusOK, categories)
}
