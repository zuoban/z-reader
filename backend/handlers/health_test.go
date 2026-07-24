package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"go.etcd.io/bbolt"

	"z-reader/backend/storage"
)

func TestHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/healthz", Health)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("expected health status 200, got %d: %s", response.Code, response.Body.String())
	}
}

func TestReadyChecksDatabaseAndUploadDirectory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	router := gin.New()
	router.GET("/readyz", Ready(db, uploadDir))

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("expected ready status 200, got %d: %s", response.Code, response.Body.String())
	}

	if err := os.RemoveAll(uploadDir); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected unavailable status 503, got %d: %s", response.Code, response.Body.String())
	}

	brokenDB := openHandlerTestDB(t)
	if err := brokenDB.Update(func(tx *bbolt.Tx) error {
		return tx.DeleteBucket(storage.BooksBucket)
	}); err != nil {
		t.Fatal(err)
	}
	brokenRouter := gin.New()
	brokenRouter.GET("/readyz", Ready(brokenDB, t.TempDir()))
	response = httptest.NewRecorder()
	brokenRouter.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected unavailable database status 503, got %d: %s", response.Code, response.Body.String())
	}
}
