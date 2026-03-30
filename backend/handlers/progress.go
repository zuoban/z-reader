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
	CFI        string  `json:"cfi" binding:"required"`
	Percentage float64 `json:"percentage" binding:"required"`
}

func (h *ProgressHandler) Get(c *gin.Context) {
	id := c.Param("id")

	progress, err := h.db.GetProgress(id)
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

	var req ProgressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cfi and percentage required"})
		return
	}

	progress := &models.Progress{
		BookID:     id,
		CFI:        req.CFI,
		Percentage: req.Percentage,
		UpdatedAt:  time.Now(),
	}

	if err := h.db.SaveProgress(progress); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save progress"})
		return
	}

	c.JSON(http.StatusOK, progress)
}
