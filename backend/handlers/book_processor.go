package handlers

import (
	"log/slog"
	"sync"
	"time"

	"z-reader/backend/logger"
	"z-reader/backend/models"
	"z-reader/backend/telemetry"
)

const (
	bookProcessingWorkers   = 2
	bookProcessingQueueSize = 32
)

type bookProcessingJob struct {
	bookID       string
	userID       string
	initialTitle string
}

// bookProcessor bounds CPU and disk intensive EPUB preview extraction so an
// upload request only needs to persist the book and its content hash.
type bookProcessor struct {
	handler   *BooksHandler
	jobs      chan bookProcessingJob
	closeOnce sync.Once
	wg        sync.WaitGroup
}

func newBookProcessor(handler *BooksHandler) *bookProcessor {
	processor := &bookProcessor{
		handler: handler,
		jobs:    make(chan bookProcessingJob, bookProcessingQueueSize),
	}
	processor.wg.Add(bookProcessingWorkers)
	for range bookProcessingWorkers {
		go func() {
			defer processor.wg.Done()
			for job := range processor.jobs {
				processor.handler.processBookPreview(job)
			}
		}()
	}
	return processor
}

func (h *BooksHandler) enqueueBookProcessing(book *models.Book) {
	if h.processor == nil || book == nil {
		return
	}
	h.processor.jobs <- bookProcessingJob{
		bookID:       book.ID,
		userID:       book.UserID,
		initialTitle: book.Title,
	}
}

// Close drains accepted background jobs. Call it after the HTTP server has
// stopped accepting requests and before closing the database.
func (h *BooksHandler) Close() {
	if h.processor == nil {
		return
	}
	h.processor.closeOnce.Do(func() {
		close(h.processor.jobs)
		h.processor.wg.Wait()
	})
}

func (h *BooksHandler) processBookPreview(job bookProcessingJob) {
	book, err := h.db.GetBookForUser(job.bookID, job.userID)
	if err != nil {
		logger.Error("Failed to load book for background processing",
			slog.String("book_id", job.bookID),
			slog.Any("error", err),
		)
		return
	}
	if book == nil || book.ProcessingState != models.BookProcessingPending {
		return
	}

	bookPath, err := resolveUploadPath(h.cfg.UploadDir, book.Filename)
	if err != nil {
		h.markBookProcessingFailed(book, err)
		return
	}

	startedAt := time.Now()
	metadata, coverData, contentType, err := extractBookPreview(bookPath, book.Format)
	telemetry.Observe("book_preview", time.Since(startedAt), 1)
	if err != nil {
		h.markBookProcessingFailed(book, err)
		return
	}

	// Refresh before saving so a quick rename, category change, or deletion is
	// not overwritten by metadata extraction that started earlier.
	book, err = h.db.GetBookForUser(job.bookID, job.userID)
	if err != nil {
		logger.Error("Failed to reload book after background processing",
			slog.String("book_id", job.bookID),
			slog.Any("error", err),
		)
		return
	}
	if book == nil || book.ProcessingState != models.BookProcessingPending {
		return
	}

	if metadata.Title != "" && book.Title == job.initialTitle {
		book.Title = metadata.Title
	}
	if metadata.Author != "" && book.Author == "" {
		book.Author = metadata.Author
	}
	if len(coverData) > 0 && book.CoverPath == "" {
		coverFilename, coverErr := h.writeExtractedCover(book.ID, coverData, contentType)
		if coverErr != nil {
			logger.Warn("Failed to cache EPUB cover during background processing",
				slog.String("book_id", book.ID),
				slog.Any("error", coverErr),
			)
		} else {
			book.CoverPath = coverFilename
			h.attachCoverThumbnail(book)
		}
	}

	book.ProcessingState = models.BookProcessingReady
	book.Format = normalizeBookFormat(book.Format, book.Filename)
	if err := h.db.SaveBook(book); err != nil {
		logger.Error("Failed to save processed book preview",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
	}
}

func (h *BooksHandler) markBookProcessingFailed(book *models.Book, processingErr error) {
	logger.Warn("Failed to process uploaded EPUB",
		slog.String("book_id", book.ID),
		slog.Any("error", processingErr),
	)
	book.ProcessingState = models.BookProcessingFailed
	if err := h.db.SaveBook(book); err != nil {
		logger.Error("Failed to save EPUB processing status",
			slog.String("book_id", book.ID),
			slog.Any("error", err),
		)
	}
}
