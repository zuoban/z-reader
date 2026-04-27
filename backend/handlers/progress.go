package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

type ProgressHandler struct {
	db *storage.DB
}

func NewProgressHandler(db *storage.DB) *ProgressHandler {
	return &ProgressHandler{db: db}
}

type ProgressRequest struct {
	CFI               string     `json:"cfi" form:"cfi"`
	Percentage        float64    `json:"percentage" form:"percentage"`
	DeviceID          string     `json:"device_id" form:"device_id"`
	ExpectedUpdatedAt *time.Time `json:"expected_updated_at" form:"expected_updated_at"`
}

func (h *ProgressHandler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	progress, err := h.db.ListProgress(userID)
	if err != nil {
		response.InternalError(c, "获取阅读进度失败")
		return
	}

	c.JSON(http.StatusOK, progress)
}

func (h *ProgressHandler) Get(c *gin.Context) {
	id := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		response.InternalError(c, "获取书籍失败")
		return
	}
	if book == nil {
		response.NotFound(c, "书籍不存在")
		return
	}

	progress, err := h.db.GetProgress(id, userID)
	if err != nil {
		response.InternalError(c, "获取阅读进度失败")
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
		response.BadRequest(c, "请求内容无效")
		return
	}

	if req.CFI == "" {
		response.BadRequest(c, "缺少阅读位置")
		return
	}

	if req.Percentage < 0 || req.Percentage > 100 {
		response.BadRequest(c, "阅读进度必须在 0 到 100 之间")
		return
	}

	progress := &models.Progress{
		BookID:     id,
		UserID:     userID,
		CFI:        req.CFI,
		Percentage: req.Percentage,
		DeviceID:   req.DeviceID,
		UpdatedAt:  time.Now(),
	}

	if err := h.db.SaveProgressIfCurrent(progress, userID, req.ExpectedUpdatedAt); err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "书籍不存在")
			return
		}
		if err == storage.ErrProgressConflict {
			current, getErr := h.db.GetProgress(id, userID)
			if getErr != nil {
				response.InternalError(c, "获取最新阅读进度失败")
				return
			}
			c.JSON(http.StatusConflict, gin.H{
				"error":    "阅读进度已在其他设备更新",
				"progress": current,
			})
			return
		}
		response.InternalError(c, "保存阅读进度失败")
		return
	}

	c.JSON(http.StatusOK, progress)
}
