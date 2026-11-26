package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
	"z-reader/backend/telemetry"
)

const batchReparseMaxWorkers = 4

type batchReparseResponse struct {
	UpdatedIDs []string       `json:"updated_ids"`
	FailedIDs  []string       `json:"failed_ids"`
	Books      []*models.Book `json:"books"`
}

type reparseBookError struct {
	status  int
	message string
	err     error
}

func (e *reparseBookError) Error() string {
	return e.message
}

func (h *BooksHandler) ReparseMetadata(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()
	book, err := h.reparseBook(ctx, id, storage.PersonalLibrary)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		switch err.status {
		case http.StatusNotFound:
			response.NotFound(c, err.message)
		case http.StatusForbidden:
			response.Forbidden(c, err.message)
		case http.StatusBadRequest:
			response.BadRequest(c, err.message)
		default:
			response.InternalError(c, err.message)
		}
		return
	}

	c.JSON(http.StatusOK, book)
}

func (h *BooksHandler) BatchReparseMetadata(c *gin.Context) {
	var req batchBookIDsRequest
	if !bindJSON(c, &req, "请求内容无效") {
		return
	}

	ids := normalizeBookIDs(req.IDs)
	if len(ids) == 0 {
		response.BadRequest(c, "请选择要重新解析的图书")
		return
	}
	if len(ids) > maxBatchBookIDs {
		response.BadRequest(c, "单次最多操作 500 本图书")
		return
	}

	ctx := c.Request.Context()
	if ctx.Err() != nil {
		return
	}

	type batchReparseItem struct {
		book *models.Book
		ok   bool
	}

	results := make([]batchReparseItem, len(ids))
	workerCount := min(batchReparseMaxWorkers, len(ids))
	jobs := make(chan int, len(ids))
	for i := range ids {
		jobs <- i
	}
	close(jobs)

	var wg sync.WaitGroup
	wg.Add(workerCount)
	for range workerCount {
		go func() {
			defer wg.Done()
			for {
				if ctx.Err() != nil {
					return
				}
				select {
				case <-ctx.Done():
					return
				case idx, ok := <-jobs:
					if !ok || ctx.Err() != nil {
						return
					}
					book, err := h.reparseBook(ctx, ids[idx], storage.PersonalLibrary)
					if err != nil {
						if errors.Is(err.err, context.Canceled) || errors.Is(err.err, context.DeadlineExceeded) || ctx.Err() != nil {
							return
						}
						logger.Warn("Failed to reparse book metadata in batch",
							slog.String("book_id", ids[idx]),
							slog.Int("status", err.status),
							slog.String("reason", err.message),
						)
						continue
					}
					results[idx] = batchReparseItem{book: book, ok: true}
				}
			}
		}()
	}
	wg.Wait()

	if ctx.Err() != nil {
		return
	}

	resp := batchReparseResponse{
		UpdatedIDs: make([]string, 0, len(ids)),
		FailedIDs:  make([]string, 0),
		Books:      make([]*models.Book, 0, len(ids)),
	}
	for i, res := range results {
		if res.ok && res.book != nil {
			resp.UpdatedIDs = append(resp.UpdatedIDs, ids[i])
			resp.Books = append(resp.Books, res.book)
		} else {
			resp.FailedIDs = append(resp.FailedIDs, ids[i])
		}
	}

	c.JSON(http.StatusOK, resp)
}

func (h *BooksHandler) reparseBook(ctx context.Context, id, userID string) (*models.Book, *reparseBookError) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, &reparseBookError{status: http.StatusRequestTimeout, message: "请求已取消", err: err}
	}

	book, err := h.db.GetBookForUser(id, userID)
	if err != nil {
		return nil, &reparseBookError{status: http.StatusInternalServerError, message: "获取书籍失败"}
	}
	if book == nil {
		return nil, &reparseBookError{status: http.StatusNotFound, message: "书籍不存在"}
	}
	if err := ctx.Err(); err != nil {
		return nil, &reparseBookError{status: http.StatusRequestTimeout, message: "请求已取消", err: err}
	}

	format := normalizeBookFormat(book.Format, book.Filename)

	file, _, err := openUploadFile(h.cfg.UploadDir, book.Filename)
	if os.IsNotExist(err) {
		return nil, &reparseBookError{status: http.StatusNotFound, message: "书籍文件不存在"}
	}
	if err != nil {
		return nil, &reparseBookError{status: http.StatusForbidden, message: "文件访问被拒绝"}
	}

	extractFn := h.extractBookPreviewFn
	if extractFn == nil {
		extractFn = extractBookPreview
	}

	startedAt := time.Now()
	metadata, coverData, contentType, extractErr := extractFn(file, format)
	file.Close()
	telemetry.Observe("book_reparse", time.Since(startedAt), 1)
	if extractErr != nil {
		return nil, &reparseBookError{status: http.StatusBadRequest, message: "解析书籍元数据失败"}
	}
	if metadata == nil {
		metadata = &epubMetadata{}
	}
	if err := ctx.Err(); err != nil {
		return nil, &reparseBookError{status: http.StatusRequestTimeout, message: "请求已取消", err: err}
	}

	title := sanitizeExtractedMetadataValue(metadata.Title, maxBookTitleRunes)
	author := sanitizeExtractedMetadataValue(metadata.Author, maxBookAuthorRunes)

	var cover bookCover
	if len(coverData) > 0 {
		var coverErr error
		cover, coverErr = h.prepareExtractedCover(book.ID, coverData, contentType)
		if coverErr != nil {
			return nil, &reparseBookError{status: http.StatusInternalServerError, message: "保存封面失败"}
		}
		if err := ctx.Err(); err != nil {
			h.removeUploadFiles(cover.path, cover.thumb)
			return nil, &reparseBookError{status: http.StatusRequestTimeout, message: "请求已取消", err: err}
		}
	}

	var previous bookCover
	updated, updateErr := h.db.UpdateBook(book.ID, userID, func(current *models.Book) bool {
		if current.Filename != book.Filename {
			return false
		}
		if title != "" {
			current.Title = title
		}
		if author != "" {
			current.Author = author
		}
		if cover.path != "" {
			previous = bookCover{path: current.CoverPath, thumb: current.CoverThumbPath}
			cover.apply(current)
		} else if current.CoverPath == "" && supportsExtractedCoverFormat(format) {
			current.CoverMissing = true
		}
		current.ProcessingState = models.BookProcessingReady
		current.PendingTitleEdited = false
		current.PendingAuthorEdited = false
		current.Format = normalizeBookFormat(current.Format, current.Filename)
		return true
	})

	if cover.path != "" {
		if updateErr != nil || updated == nil || updated.CoverPath != cover.path {
			h.removeUploadFiles(cover.path, cover.thumb)
		} else {
			var obsolete []string
			if previous.path != "" && previous.path != cover.path {
				obsolete = append(obsolete, previous.path)
			}
			if previous.thumb != "" && previous.thumb != cover.thumb {
				obsolete = append(obsolete, previous.thumb)
			}
			if len(obsolete) > 0 {
				h.removePublishedUploadFiles(obsolete...)
			}
		}
	}

	if updateErr == storage.ErrNotFound {
		return nil, &reparseBookError{status: http.StatusNotFound, message: "书籍不存在"}
	}
	if updateErr != nil {
		return nil, &reparseBookError{status: http.StatusInternalServerError, message: "保存书籍失败"}
	}

	return updated, nil
}
