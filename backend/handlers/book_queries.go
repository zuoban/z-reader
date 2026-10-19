package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/response"
)

func requestedBookCategory(c *gin.Context) *string {
	if category, ok := c.GetQuery("category"); ok && strings.TrimSpace(category) != "" {
		category = strings.TrimSpace(category)
		return &category
	}
	if c.Query("uncategorized") == "true" {
		empty := ""
		return &empty
	}
	return nil
}

// Status batches processing refreshes without one HTTP request per pending book.
func (h *BooksHandler) Status(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	ids := normalizeBookIDs(strings.Split(c.Query("book_ids"), ","))
	if len(ids) == 0 || len(ids) > maxBatchBookIDs {
		response.BadRequest(c, "book_ids 必须包含 1 到 500 个图书 ID")
		return
	}
	books, err := h.db.ListBooksForIDs(userID, ids)
	if err != nil {
		response.InternalError(c, "获取书籍状态失败")
		return
	}
	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}
	c.JSON(http.StatusOK, gin.H{"books": books})
}

// RenameCategory renames or removes a complete category, including unloaded pages.
func (h *BooksHandler) RenameCategory(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	var req struct {
		From string         `json:"from"`
		To   optionalString `json:"to"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请求内容无效")
		return
	}
	req.From = strings.TrimSpace(req.From)
	if req.From == "" || len([]rune(req.From)) > 50 {
		response.BadRequest(c, "来源分类必须包含 1 到 50 个字符")
		return
	}
	if !req.To.Set {
		response.BadRequest(c, "缺少目标分类")
		return
	}
	category := normalizeBookCategory(req.To.Value)
	if category != nil && len([]rune(*category)) > 50 {
		response.BadRequest(c, "分类不能超过 50 个字符")
		return
	}
	ids, err := h.db.RenameBookCategory(userID, req.From, category)
	if err != nil {
		response.InternalError(c, "更新分类失败")
		return
	}
	c.JSON(http.StatusOK, struct {
		UpdatedIDs []string `json:"updated_ids"`
		Category   *string  `json:"category,omitempty"`
	}{UpdatedIDs: ids, Category: category})
}
