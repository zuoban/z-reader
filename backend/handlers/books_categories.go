package handlers

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

func (h *BooksHandler) BatchUpdateCategory(c *gin.Context) {
	var req batchBookCategoryRequest
	if !bindJSON(c, &req, "请求内容无效") {
		return
	}
	ids, ok := validateBatchBookIDs(c, req.IDs, "请选择要设置分类的图书")
	if !ok {
		return
	}
	if !req.Category.Set {
		response.BadRequest(c, "缺少分类字段")
		return
	}

	category := normalizeBookCategory(req.Category.Value)
	if category != nil && utf8.RuneCountInString(*category) > 50 {
		response.BadRequest(c, "分类不能超过 50 个字符")
		return
	}

	books, err := h.db.UpdateBooksCategory(ids, storage.PersonalLibrary, category)
	if respondStorageError(c, err, "部分图书不存在", "设置分类失败") {
		return
	}

	normalizeBookFormats(books)

	c.JSON(http.StatusOK, gin.H{"books": books})
}

func (h *BooksHandler) RemoveCategory(c *gin.Context) {
	id := c.Param("id")

	book, err := h.db.UpdateBook(id, storage.PersonalLibrary, func(book *models.Book) bool {
		book.Category = nil
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if respondStorageError(c, err, "书籍不存在", "保存书籍失败") {
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
