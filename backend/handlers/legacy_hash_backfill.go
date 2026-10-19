package handlers

import (
	"fmt"
	"log/slog"
	"sync"
	"time"

	"z-reader/backend/logger"
	"z-reader/backend/models"
)

const legacyHashBatchSize = 16

type legacyHashRequest struct {
	userID string
	done   chan error
}

type legacyHashBackfill struct {
	handler  *BooksHandler
	requests chan legacyHashRequest
	stop     chan struct{}
	done     chan struct{}
	once     sync.Once
}

func newLegacyHashBackfill(handler *BooksHandler) *legacyHashBackfill {
	worker := &legacyHashBackfill{
		handler:  handler,
		requests: make(chan legacyHashRequest),
		stop:     make(chan struct{}),
		done:     make(chan struct{}),
	}
	go worker.run()
	return worker
}

func (worker *legacyHashBackfill) catchUp(userID string) error {
	// The common path reads at most one missing-hash index entry.
	books, _, err := worker.handler.db.ListBooksMissingHash(&userID, "", 1)
	if err != nil || len(books) == 0 {
		return err
	}
	request := legacyHashRequest{userID: userID, done: make(chan error, 1)}
	select {
	case worker.requests <- request:
	case <-worker.stop:
		return fmt.Errorf("hash backfill stopped")
	}
	select {
	case err := <-request.done:
		return err
	case <-worker.stop:
		return fmt.Errorf("hash backfill stopped")
	}
}

func (worker *legacyHashBackfill) close() {
	worker.once.Do(func() { close(worker.stop) })
	<-worker.done
}

func (worker *legacyHashBackfill) run() {
	defer close(worker.done)
	timer := time.NewTimer(0)
	defer timer.Stop()
	cursor := ""
	for {
		select {
		case <-worker.stop:
			return
		case request := <-worker.requests:
			next := ""
			var err error
			for {
				select {
				case <-worker.stop:
					request.done <- fmt.Errorf("hash backfill stopped")
					return
				default:
				}
				next, err = worker.batch(&request.userID, next)
				if err != nil || next == "" {
					break
				}
			}
			request.done <- err
		case <-timer.C:
			next, err := worker.batch(nil, cursor)
			cursor = next
			delay := 100 * time.Millisecond
			if err != nil || cursor == "" {
				cursor = ""
				delay = time.Minute
			}
			timer.Reset(delay)
		}
	}
}

func (worker *legacyHashBackfill) batch(userID *string, cursor string) (string, error) {
	books, next, err := worker.handler.db.ListBooksMissingHash(userID, cursor, legacyHashBatchSize)
	if err != nil {
		return "", err
	}
	hashes := make([]models.Book, 0, len(books))
	for _, book := range books {
		select {
		case <-worker.stop:
			return "", fmt.Errorf("hash backfill stopped")
		default:
		}
		path, err := resolveUploadPath(worker.handler.cfg.UploadDir, book.Filename)
		if err == nil {
			var hash string
			hash, err = hashFile(path)
			if err == nil {
				book.ContentHash = hash
				hashes = append(hashes, book)
			}
		}
		if err != nil {
			// Keep the durable entry: restored files and restarts get another attempt.
			logger.Warn("Legacy book hash backfill deferred",
				slog.String("book_id", book.ID), slog.Any("error", err))
		}
	}
	if err := worker.handler.db.BackfillBookContentHashes(hashes); err != nil {
		return "", err
	}
	return next, nil
}
