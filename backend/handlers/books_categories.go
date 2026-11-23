package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

func (h *BooksHandler) BatchUpdateCategory(c *gin.Context) {
	var req batchBookCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请求内容无效")
		return
	}
	req.IDs = normalizeBookIDs(req.IDs)
	if len(req.IDs) == 0 {
		response.BadRequest(c, "请选择要设置分类的图书")
		return
	}
	if len(req.IDs) > maxBatchBookIDs {
		response.BadRequest(c, "单次最多操作 500 本图书")
		return
	}
	if !req.Category.Set {
		response.BadRequest(c, "缺少分类字段")
		return
	}

	category := normalizeBookCategory(req.Category.Value)
	if category != nil && len([]rune(*category)) > 50 {
		response.BadRequest(c, "分类不能超过 50 个字符")
		return
	}

	books, err := h.db.UpdateBooksCategory(req.IDs, storage.PersonalLibrary, category)
	if err != nil {
		if err == storage.ErrNotFound {
			response.NotFound(c, "部分图书不存在")
			return
		}
		response.InternalError(c, "设置分类失败")
		return
	}

	for i := range books {
		books[i].Format = normalizeBookFormat(books[i].Format, books[i].Filename)
	}

	c.JSON(http.StatusOK, gin.H{"books": books})
}

func (h *BooksHandler) RemoveCategory(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.UpdateBook(id, storage.PersonalLibrary, func(book *models.Book) bool {
		book.Category = nil
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if err == storage.ErrNotFound {
		response.NotFound(c, "书籍不存在")
		return
	}
	if err != nil {
		response.InternalError(c, "保存书籍失败")
		return
	}

	c.JSON(http.StatusOK, book)
}

func normalizeBookCategory(value *string) *string {
	if value == nil {
		return nil
	}

	category := strings.TrimSpace(*value)
	if category == "" {
		return nil
	}
	return &category
}
