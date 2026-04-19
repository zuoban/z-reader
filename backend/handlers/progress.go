package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

type ProgressHandler struct {
	db *storage.DB
}

func NewProgressHandler(db *storage.DB) *ProgressHandler {
	return &ProgressHandler{db: db}
}

type ProgressRequest struct {
	CFI        string  `json:"cfi"`
	Percentage float64 `json:"percentage"`
}

func (h *ProgressHandler) Get(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get book"})
		return
	}
	if book == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
		return
	}

	progress, err := h.db.GetProgress(id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get progress"})
		return
	}

	if progress == nil {
		c.JSON(http.StatusOK, gin.H{
			"book_id":    id,
			"cfi":        "",
			"percentage": 0,
		})
		return
	}

	c.JSON(http.StatusOK, progress)
}

func (h *ProgressHandler) Save(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	var req ProgressRequest
	// 支持 JSON 和 form-urlencoded 格式（sendBeacon 使用 form 格式）
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.CFI == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cfi required"})
		return
	}

	if req.Percentage < 0 || req.Percentage > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "percentage must be between 0 and 100"})
		return
	}

	progress := &models.Progress{
		BookID:     id,
		UserID:     userID,
		CFI:        req.CFI,
		Percentage: req.Percentage,
		UpdatedAt:  time.Now(),
	}

	if err := h.db.SaveProgress(progress, userID); err != nil {
		if err == storage.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "book not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save progress"})
		return
	}

	c.JSON(http.StatusOK, progress)
}
