package handlers

import (
	"log/slog"
	"sync"
	"time"

	"z-reader/backend/logger"
	"z-reader/backend/models"
	"z-reader/backend/storage"
	"z-reader/backend/telemetry"
)

const (
	bookProcessingWorkers     = 2
	bookProcessingQueueSize   = 32
	bookRecoveryScanBatchSize = 64
)

type bookProcessingJob struct {
	bookID       string
	userID       string
	initialTitle string
}

// bookProcessor bounds CPU and disk intensive EPUB preview extraction so an
// upload request only needs to persist the book and its content hash.
type bookProcessor struct {
	handler      *BooksHandler
	jobs         chan bookProcessingJob
	mu           sync.Mutex
	overflow     []bookProcessingJob
	pendingSet   map[string]struct{}
	closed       bool
	notify       chan struct{}
	stopFeeder   chan struct{}
	stopRecovery chan struct{}
	recoveryWG   sync.WaitGroup
	feederWG     sync.WaitGroup
	workerWG     sync.WaitGroup
	closeOnce    sync.Once
}

func newBookProcessor(handler *BooksHandler) *bookProcessor {
	processor := &bookProcessor{
		handler:      handler,
		jobs:         make(chan bookProcessingJob, bookProcessingQueueSize),
		pendingSet:   make(map[string]struct{}),
		notify:       make(chan struct{}, 1),
		stopFeeder:   make(chan struct{}),
		stopRecovery: make(chan struct{}),
	}
	processor.workerWG.Add(bookProcessingWorkers)
	for range bookProcessingWorkers {
		go func() {
			defer processor.workerWG.Done()
			for job := range processor.jobs {
				if processor.isClosed() {
					processor.mu.Lock()
					delete(processor.pendingSet, job.bookID)
					processor.mu.Unlock()
					continue
				}
				processor.handler.processBookPreview(job)
				processor.mu.Lock()
				delete(processor.pendingSet, job.bookID)
				processor.mu.Unlock()
			}
		}()
	}

	processor.feederWG.Add(1)
	go processor.runFeeder()

	if handler != nil && handler.db != nil {
		processor.recoveryWG.Add(1)
		go processor.recoverPendingBooks()
	}

	return processor
}

func (p *bookProcessor) isClosed() bool {
	p.mu.Lock()
	closed := p.closed
	p.mu.Unlock()
	return closed
}

func (p *bookProcessor) signalFeeder() {
	select {
	case p.notify <- struct{}{}:
	default:
	}
}

func (p *bookProcessor) enqueue(job bookProcessingJob) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return
	}
	if job.bookID != "" {
		if _, exists := p.pendingSet[job.bookID]; exists {
			p.mu.Unlock()
			return
		}
		p.pendingSet[job.bookID] = struct{}{}
	}
	if len(p.overflow) == 0 {
		select {
		case p.jobs <- job:
			p.mu.Unlock()
			return
		default:
		}
	}
	p.overflow = append(p.overflow, job)
	p.mu.Unlock()
	p.signalFeeder()
}

func (p *bookProcessor) runFeeder() {
	defer p.feederWG.Done()
	defer close(p.jobs)
	for {
		p.mu.Lock()
		if p.closed {
			// Leave unstarted overflow jobs in pending state for startup recovery
			// so graceful shutdown finishes quickly instead of hitting SIGKILL.
			for i := range p.overflow {
				delete(p.pendingSet, p.overflow[i].bookID)
			}
			p.overflow = nil
			p.mu.Unlock()
			return
		}
		if len(p.overflow) == 0 {
			p.mu.Unlock()
			select {
			case <-p.notify:
			case <-p.stopFeeder:
				return
			}
			continue
		}
		job := p.overflow[0]
		p.overflow[0] = bookProcessingJob{}
		p.overflow = p.overflow[1:]
		if len(p.overflow) == 0 {
			p.overflow = nil
		}
		p.mu.Unlock()

		select {
		case p.jobs <- job:
		case <-p.stopFeeder:
			p.mu.Lock()
			delete(p.pendingSet, job.bookID)
			p.mu.Unlock()
			return
		}
	}
}

func (p *bookProcessor) recoverPendingBooks() {
	defer p.recoveryWG.Done()
	cursor := ""
	for {
		select {
		case <-p.stopRecovery:
			return
		default:
		}
		books, nextCursor, err := p.handler.db.ListBooksByCursor(
			storage.PersonalLibrary, cursor, bookRecoveryScanBatchSize,
		)
		if err != nil {
			logger.Warn("Failed to scan pending books for startup recovery",
				slog.Any("error", err),
			)
			return
		}
		for i := range books {
			select {
			case <-p.stopRecovery:
				return
			default:
			}
			if books[i].ProcessingState == models.BookProcessingPending {
				p.enqueue(bookProcessingJob{
					bookID:       books[i].ID,
					userID:       books[i].UserID,
					initialTitle: books[i].Title,
				})
			}
		}
		if nextCursor == "" {
			return
		}
		cursor = nextCursor
	}
}

func (p *bookProcessor) close() {
	p.closeOnce.Do(func() {
		close(p.stopRecovery)
		p.recoveryWG.Wait()

		p.mu.Lock()
		p.closed = true
		p.mu.Unlock()
		close(p.stopFeeder)
		p.signalFeeder()

		p.feederWG.Wait()
		p.workerWG.Wait()
	})
}

func (h *BooksHandler) enqueueBookProcessing(book *models.Book) {
	if h.processor == nil || book == nil {
		return
	}
	h.processor.enqueue(bookProcessingJob{
		bookID:       book.ID,
		userID:       book.UserID,
		initialTitle: book.Title,
	})
}

// Close drains accepted background jobs. Call it after the HTTP server has
// stopped accepting requests and before closing the database.
func (h *BooksHandler) Close() {
	if h.legacyHashes != nil {
		h.legacyHashes.close()
	}
	if h.processor == nil {
		return
	}
	h.processor.close()
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
		h.markBookProcessingFailed(job, err)
		return
	}

	startedAt := time.Now()
	metadata, coverData, contentType, err := extractBookPreview(bookPath, book.Format)
	telemetry.Observe("book_preview", time.Since(startedAt), 1)
	if err != nil {
		h.markBookProcessingFailed(job, err)
		return
	}

	var cover bookCover
	if len(coverData) > 0 && book.CoverPath == "" {
		cover, err = h.prepareExtractedCover(book.ID, coverData, contentType)
		if err != nil {
			logger.Warn("Failed to cache EPUB cover during background processing",
				slog.String("book_id", book.ID),
				slog.Any("error", err),
			)
		}
	}
	h.completeBookPreview(job, book.Filename, *metadata, cover)
}

func (h *BooksHandler) completeBookPreview(job bookProcessingJob, filename string, metadata epubMetadata, cover bookCover) {
	var previousThumb string
	book, err := h.db.UpdateBook(job.bookID, job.userID, func(book *models.Book) bool {
		if book.ProcessingState != models.BookProcessingPending || book.Filename != filename {
			return false
		}
		if metadata.Title != "" && !book.PendingTitleEdited && book.Title == job.initialTitle {
			book.Title = metadata.Title
		}
		if metadata.Author != "" && !book.PendingAuthorEdited && book.Author == "" {
			book.Author = metadata.Author
		}
		if cover.path != "" && book.CoverPath == "" {
			previousThumb = book.CoverThumbPath
			cover.apply(book)
		}
		book.ProcessingState = models.BookProcessingReady
		book.PendingTitleEdited = false
		book.PendingAuthorEdited = false
		book.Format = normalizeBookFormat(book.Format, book.Filename)
		return true
	})
	if cover.path != "" {
		if err != nil || book.CoverPath != cover.path {
			h.removeUploadFiles(cover.path, cover.thumb)
		} else {
			h.removeUploadFiles(previousThumb)
		}
	}
	if err != nil && err != storage.ErrNotFound {
		logger.Error("Failed to save processed book preview",
			slog.String("book_id", job.bookID),
			slog.Any("error", err),
		)
	}
}

func (h *BooksHandler) markBookProcessingFailed(job bookProcessingJob, processingErr error) {
	logger.Warn("Failed to process uploaded EPUB",
		slog.String("book_id", job.bookID),
		slog.Any("error", processingErr),
	)

	_, err := h.db.UpdateBook(job.bookID, job.userID, func(book *models.Book) bool {
		if book.ProcessingState != models.BookProcessingPending {
			return false
		}
		book.ProcessingState = models.BookProcessingFailed
		book.PendingTitleEdited = false
		book.PendingAuthorEdited = false
		return true
	})
	if err != nil && err != storage.ErrNotFound {
		logger.Error("Failed to save EPUB processing status",
			slog.String("book_id", job.bookID),
			slog.Any("error", err),
		)
	}
}
