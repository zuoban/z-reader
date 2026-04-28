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

type BookmarksHandler struct {
	db *storage.DB
}

func NewBookmarksHandler(db *storage.DB) *BookmarksHandler {
	return &BookmarksHandler{db: db}
}

type BookmarkRequest struct {
	CFI        string  `json:"cfi"`
	Percentage float64 `json:"percentage"`
	Chapter    string  `json:"chapter"`
	Note       string  `json:"note"`
}

func (h *BookmarksHandler) List(c *gin.Context) {
	bookID := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	bookmarks, err := h.db.ListBookmarks(bookID, userID)
	if err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "书籍不存在")
			return
		}
		response.InternalError(c, "获取书签失败")
		return
	}

	c.JSON(http.StatusOK, bookmarks)
}

func (h *BookmarksHandler) Create(c *gin.Context) {
	bookID := c.Param("id")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	var req BookmarkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求内容无效")
		return
	}

	req.CFI = strings.TrimSpace(req.CFI)
	if req.CFI == "" {
		response.BadRequest(c, "缺少书签位置")
		return
	}
	if req.Percentage < 0 || req.Percentage > 100 {
		response.BadRequest(c, "书签进度必须在 0 到 100 之间")
		return
	}

	now := time.Now().UTC()
	bookmark := &models.Bookmark{
		ID:         uuid.New().String(),
		BookID:     bookID,
		UserID:     userID,
		CFI:        req.CFI,
		Percentage: req.Percentage,
		Chapter:    strings.TrimSpace(req.Chapter),
		Note:       strings.TrimSpace(req.Note),
		CreatedAt:  now,
	}

	if err := h.db.SaveBookmark(bookmark, userID); err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "书籍不存在")
			return
		}
		response.InternalError(c, "保存书签失败")
		return
	}

	c.JSON(http.StatusCreated, bookmark)
}

func (h *BookmarksHandler) Delete(c *gin.Context) {
	bookID := c.Param("id")
	bookmarkID := c.Param("bookmarkID")
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	if err := h.db.DeleteBookmark(bookID, bookmarkID, userID); err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "书签不存在")
			return
		}
		response.InternalError(c, "删除书签失败")
		return
	}

	c.Status(http.StatusNoContent)
	c.Writer.WriteHeaderNow()
}
