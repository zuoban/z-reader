package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
	"z-reader/backend/telemetry"
)

const (
	maxProgressCFIRunes    = 16 * 1024
	maxProgressDeviceRunes = 256
	maxProgressBookIDs     = 100
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

	bookIDs, hasBookIDs := c.GetQuery("book_ids")
	updatedSince, hasUpdatedSince := c.GetQuery("updated_since")
	if hasBookIDs && hasUpdatedSince {
		response.BadRequest(c, "book_ids 和 updated_since 不能同时使用")
		return
	}

	var (
		progress []models.Progress
		err      error
	)
	switch {
	case hasBookIDs:
		if strings.TrimSpace(bookIDs) == "" {
			response.BadRequest(c, "book_ids 不能为空")
			return
		}
		ids := strings.Split(bookIDs, ",")
		if len(ids) > maxProgressBookIDs {
			response.BadRequest(c, "每次最多查询 100 本图书的进度")
			return
		}
		progress, err = h.db.ListProgressForBooks(userID, ids)
	case hasUpdatedSince:
		since, parseErr := time.Parse(time.RFC3339Nano, updatedSince)
		if parseErr != nil {
			response.BadRequest(c, "updated_since 必须是 RFC3339 时间")
			return
		}
		progress, err = h.db.ListProgressUpdatedSince(userID, since)
	default:
		progress, err = h.db.ListProgress(userID)
	}
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
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请求内容无效")
		return
	}

	req.CFI = strings.TrimSpace(req.CFI)
	req.DeviceID = strings.TrimSpace(req.DeviceID)
	if req.CFI == "" {
		response.BadRequest(c, "缺少阅读位置")
		return
	}
	if len([]rune(req.CFI)) > maxProgressCFIRunes {
		response.BadRequest(c, "阅读位置过长")
		return
	}
	if len([]rune(req.DeviceID)) > maxProgressDeviceRunes {
		response.BadRequest(c, "设备标识过长")
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

	writeStartedAt := time.Now()
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
	telemetry.Observe("progress_save", time.Since(writeStartedAt), 1)

	c.JSON(http.StatusOK, progress)
}
