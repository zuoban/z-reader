package main

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/handlers"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func setupTestRouter(t *testing.T, maxRequestBodyBytes int64) (*gin.Engine, *storage.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	tmpDir := t.TempDir()
	db, err := storage.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("storage.Open failed: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("db.Close failed: %v", err)
		}
	})

	cfg := &config.Config{
		UploadDir:           tmpDir,
		MaxUploadBytes:      10 * 1024 * 1024,
		MaxRequestBodyBytes: maxRequestBodyBytes,
		AllowedOrigins:      []string{"http://localhost:3000"},
		TrustedProxies:      []string{"127.0.0.1", "::1"},
	}

	booksHandler := handlers.NewBooksHandler(cfg, db)
	ttsHandler := handlers.NewTTSHandler()
	t.Cleanup(func() {
		if err := booksHandler.Close(context.Background()); err != nil {
			t.Errorf("booksHandler.Close failed: %v", err)
		}
		if err := ttsHandler.Close(context.Background()); err != nil {
			t.Errorf("ttsHandler.Close failed: %v", err)
		}
	})

	router, err := newRouter(cfg, db, booksHandler, ttsHandler)
	if err != nil {
		t.Fatalf("newRouter failed: %v", err)
	}
	return router, db
}

func headerContainsToken(values []string, want string) bool {
	for _, value := range values {
		for _, token := range strings.Split(value, ",") {
			if strings.EqualFold(strings.TrimSpace(token), want) {
				return true
			}
		}
	}
	return false
}

func TestHealthAndReadySupportHeadAndSecurityHeaders(t *testing.T) {
	router, _ := setupTestRouter(t, 1024)

	for _, path := range []string{"/healthz", "/readyz"} {
		for _, method := range []string{http.MethodGet, http.MethodHead} {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(method, path, nil)
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("%s %s status = %d, want 200", method, path, rec.Code)
			}
			if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Fatalf("%s %s X-Content-Type-Options = %q, want nosniff", method, path, got)
			}
			if got := rec.Header().Get("X-Frame-Options"); got != "DENY" {
				t.Fatalf("%s %s X-Frame-Options = %q, want DENY", method, path, got)
			}
			if got := rec.Header().Get("Referrer-Policy"); got != "strict-origin-when-cross-origin" {
				t.Fatalf("%s %s Referrer-Policy = %q, want strict-origin-when-cross-origin", method, path, got)
			}
		}
	}
}

func TestRouterCORSMiddlewareOrdering(t *testing.T) {
	router, db := setupTestRouter(t, 64)

	// Seed a book with a long title so GET /api/books exceeds the gzip threshold.
	longTitle := strings.Repeat("compressible-book-title-", 100)
	if err := db.SaveBook(&models.Book{
		ID:        "cors-gzip-book",
		UserID:    storage.PersonalLibrary,
		Title:     longTitle,
		Author:    "Author",
		Filename:  "cors-gzip-book.epub",
		Format:    "epub",
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("SaveBook failed: %v", err)
	}

	t.Run("cross-origin gzipped response preserves Vary Origin and Accept-Encoding", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/books", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		req.Header.Set("Accept-Encoding", "gzip")
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
			t.Fatalf("Content-Encoding = %q, want gzip", got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
			t.Fatalf("Access-Control-Allow-Origin = %q, want http://localhost:3000", got)
		}
		vary := rec.Header().Values("Vary")
		if !headerContainsToken(vary, "Origin") {
			t.Fatalf("Vary headers %v missing Origin", vary)
		}
		if !headerContainsToken(vary, "Accept-Encoding") {
			t.Fatalf("Vary headers %v missing Accept-Encoding", vary)
		}

		gz, err := gzip.NewReader(rec.Body)
		if err != nil {
			t.Fatalf("gzip.NewReader failed: %v", err)
		}
		defer gz.Close()
		decoded, err := io.ReadAll(gz)
		if err != nil {
			t.Fatalf("io.ReadAll failed: %v", err)
		}
		if !strings.Contains(string(decoded), longTitle) {
			t.Fatal("expected decoded gzipped response to contain seeded book title")
		}
	})

	t.Run("cross-origin 413 response includes CORS headers", func(t *testing.T) {
		oversizedBody := strings.NewReader(`{"error":"` + strings.Repeat("x", 256) + `"}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/client-errors", oversizedBody)
		req.Header.Set("Origin", "http://localhost:3000")
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("status = %d, want 413 (body=%s)", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
			t.Fatalf("Access-Control-Allow-Origin = %q, want http://localhost:3000", got)
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
		}
	})
}
