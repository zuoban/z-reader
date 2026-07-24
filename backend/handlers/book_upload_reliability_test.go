package handlers

import (
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
)

func TestBooksUploadRejectsDamagedEPUBWithoutPersistingData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "upload-user")
	ctx.Request = newMultipartUploadRequest(t, "damaged.epub", []byte("not an EPUB archive"))
	handler.Upload(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	books, err := db.ListBooks("upload-user")
	if err != nil || len(books) != 0 {
		t.Fatalf("books after damaged upload = %+v, err = %v", books, err)
	}
	entries, err := os.ReadDir(uploadDir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("upload directory after damaged upload = %+v, err = %v", entries, err)
	}
}

func TestSaveUploadedBookFileLeavesNoOutputForUnreadableSource(t *testing.T) {
	path := filepath.Join(t.TempDir(), "interrupted.pdf")
	_, err := saveUploadedBookFile(&multipart.FileHeader{Filename: "interrupted.pdf"}, "pdf", path, 0)
	if err == nil {
		t.Fatal("expected unreadable upload source to fail")
	}
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatalf("expected no partial upload file, stat error = %v", statErr)
	}
}
