package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/response"
	"z-reader/backend/storage"
)

func openHandlerTestDB(t *testing.T) *storage.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "handlers.db")
	db, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("failed to close test db: %v", err)
		}
	})

	return db
}

func TestAuthLogoutAcceptsBearerToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	session := &models.Session{
		Token:     "session-token",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	handler := NewAuthHandler(&config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	req.Header.Set("Authorization", "Bearer "+session.Token)
	ctx.Request = req

	handler.Logout(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected session to be deleted, got %+v", got)
	}
}

func TestAuthLoginAcceptsStoredUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	passwordHash, err := storage.HashPassword("reader-password")
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}
	user := &models.User{
		ID:           "reader-user",
		Username:     "reader",
		PasswordHash: passwordHash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := db.SaveUser(user); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	body := bytes.NewBufferString(`{"username":"reader","password":"reader-password"}`)
	handler := NewAuthHandler(&config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/login", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Login(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var response LoginResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if response.Token == "" {
		t.Fatal("expected login token")
	}
	session, err := db.GetSession(response.Token)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if session == nil || session.UserID != user.ID || session.Role != models.UserRoleUser {
		t.Fatalf("unexpected session: %+v", session)
	}
}

func TestBooksListIncludesLastReadAt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	userID := "user-a"
	bookA := &models.Book{
		ID:        "book-a",
		UserID:    userID,
		Title:     "Alpha",
		Filename:  "book-a.epub",
		Format:    "epub",
		Size:      128,
		CreatedAt: time.Now().UTC().Add(-2 * time.Hour),
	}
	bookB := &models.Book{
		ID:        "book-b",
		UserID:    userID,
		Title:     "Beta",
		Filename:  "book-b.pdf",
		Format:    "pdf",
		Size:      256,
		CreatedAt: time.Now().UTC().Add(-1 * time.Hour),
	}
	if err := db.SaveBook(bookA); err != nil {
		t.Fatalf("failed to save book A: %v", err)
	}
	if err := db.SaveBook(bookB); err != nil {
		t.Fatalf("failed to save book B: %v", err)
	}

	lastReadAt := time.Now().UTC().Truncate(time.Second)
	if err := db.SaveProgress(&models.Progress{
		BookID:     bookA.ID,
		CFI:        "epubcfi(/6/2[chapter]!/4/2/6)",
		Percentage: 30,
		UpdatedAt:  lastReadAt,
	}, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	handler := NewBooksHandler(&config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var books []models.Book
	if err := json.Unmarshal(recorder.Body.Bytes(), &books); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(books) != 2 {
		t.Fatalf("expected 2 books, got %d", len(books))
	}

	var found bool
	for _, book := range books {
		if book.ID != bookA.ID {
			continue
		}
		found = true
		if book.LastReadAt == nil || !book.LastReadAt.Equal(lastReadAt) {
			t.Fatalf("expected last_read_at %s, got %+v", lastReadAt, book.LastReadAt)
		}
	}

	if !found {
		t.Fatalf("book %s not found in response", bookA.ID)
	}
}

func TestBooksDeleteRemovesCoverAndProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)
	userID := "user-a"

	book := &models.Book{
		ID:        "book-delete",
		UserID:    userID,
		Title:     "Delete Me",
		Filename:  "book-delete.epub",
		Format:    "epub",
		Size:      128,
		CoverPath: "book-delete.cover.png",
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}
	if err := db.SaveProgress(&models.Progress{
		BookID:     book.ID,
		CFI:        "epubcfi(/6/2[chapter]!/4/2/6)",
		Percentage: 44,
		UpdatedAt:  time.Now().UTC(),
	}, userID); err != nil {
		t.Fatalf("failed to save progress: %v", err)
	}

	bookPath := filepath.Join(uploadDir, book.Filename)
	coverPath := filepath.Join(uploadDir, book.CoverPath)
	if err := os.WriteFile(bookPath, []byte("book"), 0600); err != nil {
		t.Fatalf("failed to write book file: %v", err)
	}
	if err := os.WriteFile(coverPath, []byte("cover"), 0600); err != nil {
		t.Fatalf("failed to write cover file: %v", err)
	}

	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	req := httptest.NewRequest(http.MethodDelete, "/api/books/"+book.ID, nil)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = req

	handler.Delete(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	if _, err := os.Stat(bookPath); !os.IsNotExist(err) {
		t.Fatalf("expected book file to be removed, stat err=%v", err)
	}
	if _, err := os.Stat(coverPath); !os.IsNotExist(err) {
		t.Fatalf("expected cover file to be removed, stat err=%v", err)
	}

	gotBook, err := db.GetBook(book.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if gotBook != nil {
		t.Fatalf("expected book to be deleted, got %+v", gotBook)
	}

	gotProgress, err := db.GetProgress(book.ID, userID)
	if err != nil {
		t.Fatalf("GetProgress returned error: %v", err)
	}
	if gotProgress != nil {
		t.Fatalf("expected progress to be deleted, got %+v", gotProgress)
	}
}

func TestBooksGetFileReturnsNotModifiedForMatchingETag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uploadDir := t.TempDir()
	db := openHandlerTestDB(t)
	userID := "user-a"
	book := &models.Book{
		ID:          "book-cache",
		UserID:      userID,
		Title:       "Cached Book",
		Filename:    "book-cache.epub",
		Format:      "epub",
		Size:        8,
		ContentHash: "abc123",
		CreatedAt:   time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, book.Filename), []byte("book"), 0600); err != nil {
		t.Fatalf("failed to write book file: %v", err)
	}

	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/file", nil)
	ctx.Request.Header.Set("If-None-Match", `"abc123"`)

	handler.GetFile(ctx)

	if recorder.Code != http.StatusNotModified {
		t.Fatalf("expected status 304, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("ETag"); got != `"abc123"` {
		t.Fatalf("expected ETag header, got %q", got)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "private, max-age=3600" {
		t.Fatalf("expected private cache header, got %q", got)
	}
}

func TestResolveUploadPathRejectsTraversal(t *testing.T) {
	uploadDir := t.TempDir()
	if _, err := resolveUploadPath(uploadDir, "../secret.epub"); err == nil {
		t.Fatal("expected traversal path to be rejected")
	}

	resolved, err := resolveUploadPath(uploadDir, "book.epub")
	if err != nil {
		t.Fatalf("expected normal path to resolve, got %v", err)
	}
	if filepath.Dir(resolved) != uploadDir {
		t.Fatalf("expected resolved path to stay in upload dir, got %q", resolved)
	}
}

func TestValidateUploadedBook(t *testing.T) {
	tests := []struct {
		name    string
		format  string
		content []byte
		wantErr bool
	}{
		{name: "pdf ok", format: "pdf", content: []byte("%PDF-1.7 test")},
		{name: "pdf mismatch", format: "pdf", content: []byte("not-a-pdf"), wantErr: true},
		{name: "epub ok", format: "epub", content: []byte{'P', 'K', 3, 4, 0, 0}},
		{name: "mobi ok", format: "mobi", content: append(make([]byte, 60), []byte("BOOKMOBI")...)},
		{name: "azw3 mismatch", format: "azw3", content: []byte("plain-text"), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := newMultipartFileHeader(t, "book.bin", tt.content)
			err := validateUploadedBook(file, tt.format)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateUploadedBook() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestBooksUploadRejectsDuplicateContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
	userID := "user-a"
	content := []byte{'P', 'K', 3, 4, 0, 0}

	firstRecorder := httptest.NewRecorder()
	firstCtx, _ := gin.CreateTestContext(firstRecorder)
	firstCtx.Set("userID", userID)
	firstCtx.Request = newMultipartUploadRequest(t, "duplicate.epub", content)

	handler.Upload(firstCtx)

	if firstRecorder.Code != http.StatusOK {
		t.Fatalf("expected first upload status 200, got %d body=%s", firstRecorder.Code, firstRecorder.Body.String())
	}

	secondRecorder := httptest.NewRecorder()
	secondCtx, _ := gin.CreateTestContext(secondRecorder)
	secondCtx.Set("userID", userID)
	secondCtx.Request = newMultipartUploadRequest(t, "renamed.epub", content)

	handler.Upload(secondCtx)

	if secondRecorder.Code != http.StatusConflict {
		t.Fatalf("expected duplicate upload status 409, got %d body=%s", secondRecorder.Code, secondRecorder.Body.String())
	}

	var resp response.ErrorResponse
	if err := json.Unmarshal(secondRecorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode duplicate response: %v", err)
	}
	if resp.Message == "" {
		t.Fatal("expected duplicate response message")
	}

	books, err := db.ListBooks(userID)
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(books) != 1 {
		t.Fatalf("expected 1 book after duplicate upload, got %d", len(books))
	}
	if books[0].ContentHash == "" {
		t.Fatal("expected uploaded book to store content hash")
	}
}

func TestBooksUploadRejectsLegacyDuplicateContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
	userID := "user-a"
	content := []byte{'P', 'K', 3, 4, 0, 0}
	legacyBook := &models.Book{
		ID:        "legacy-book",
		UserID:    userID,
		Title:     "Legacy Book",
		Filename:  "legacy.epub",
		Format:    "epub",
		Size:      int64(len(content)),
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(legacyBook); err != nil {
		t.Fatalf("failed to save legacy book: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, legacyBook.Filename), content, 0600); err != nil {
		t.Fatalf("failed to write legacy book file: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Request = newMultipartUploadRequest(t, "legacy-copy.epub", content)

	handler.Upload(ctx)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected duplicate upload status 409, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	got, err := db.GetBook(legacyBook.ID)
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if got == nil || got.ContentHash == "" {
		t.Fatalf("expected legacy book hash to be backfilled, got %+v", got)
	}
}

func TestBooksUploadRejectsOversizedRequestBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{
		UploadDir:      uploadDir,
		MaxUploadBytes: 8,
	}, db)

	content := append([]byte{'P', 'K', 3, 4}, bytes.Repeat([]byte("x"), int(multipartOverhead)+16)...)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "user-a")
	ctx.Request = newMultipartUploadRequest(t, "too-large.epub", content)

	handler.Upload(ctx)

	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestValidateUploadedCover(t *testing.T) {
	pngHeader := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0, 0, 0, 0, 'I', 'H', 'D', 'R',
	}

	if err := validateUploadedCover(newMultipartFileHeader(t, "cover.png", pngHeader), ".png"); err != nil {
		t.Fatalf("expected PNG cover to validate, got %v", err)
	}

	err := validateUploadedCover(newMultipartFileHeader(t, "cover.png", []byte("not-an-image")), ".png")
	if err == nil {
		t.Fatalf("expected invalid PNG cover to fail validation")
	}
}

func TestExtractEPUBCoverDetectsContentType(t *testing.T) {
	epubPath := filepath.Join(t.TempDir(), "cover.epub")
	pngHeader := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0, 0, 0, 0, 'I', 'H', 'D', 'R',
	}
	writeZipFile(t, epubPath, map[string][]byte{
		"OEBPS/cover.png": pngHeader,
	})

	data, contentType, err := extractEPUBCover(epubPath)
	if err != nil {
		t.Fatalf("extractEPUBCover returned error: %v", err)
	}
	if contentType != "image/png" {
		t.Fatalf("expected image/png content type, got %q", contentType)
	}
	if !bytes.Equal(data, pngHeader) {
		t.Fatal("expected extracted cover bytes to match input")
	}
}

func TestReadZipFileWithLimitRejectsOversizedEntry(t *testing.T) {
	zipPath := filepath.Join(t.TempDir(), "oversized.zip")
	writeZipFile(t, zipPath, map[string][]byte{
		"content.opf": []byte("12345"),
	})

	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatalf("failed to open zip: %v", err)
	}
	defer reader.Close()

	if len(reader.File) != 1 {
		t.Fatalf("expected 1 zip entry, got %d", len(reader.File))
	}
	if _, err := readZipFileWithLimit(reader.File[0], 4); err == nil {
		t.Fatal("expected oversized zip entry to be rejected")
	}
}

func writeZipFile(t *testing.T, path string, files map[string][]byte) {
	t.Helper()

	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("failed to create zip file: %v", err)
	}
	defer file.Close()

	writer := zip.NewWriter(file)
	for name, content := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("failed to create zip entry: %v", err)
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatalf("failed to write zip entry: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}
}

func newMultipartUploadRequest(t *testing.T, filename string, content []byte) *http.Request {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("part.Write returned error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close returned error: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/books", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func newMultipartFileHeader(t *testing.T, filename string, content []byte) *multipart.FileHeader {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("part.Write returned error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close returned error: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(int64(len(body.Bytes()) + 1024)); err != nil {
		t.Fatalf("ParseMultipartForm returned error: %v", err)
	}

	file, header, err := req.FormFile("file")
	if err != nil {
		t.Fatalf("FormFile returned error: %v", err)
	}
	_ = file.Close()

	return header
}

func TestUsersHandlerCreateReturnsUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"newuser","password":"secret123","role":"user"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp userResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Username != "newuser" || resp.Role != models.UserRoleUser {
		t.Fatalf("unexpected user: %+v", resp)
	}
}

func TestUsersHandlerCreateRejectsDuplicate(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	passwordHash, _ := storage.HashPassword("original")
	db.SaveUser(&models.User{
		ID:           "existing-user",
		Username:     "existing",
		PasswordHash: passwordHash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})

	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"existing","password":"newpass123"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerListReturnsAll(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	now := time.Now().UTC()
	for i := 0; i < 3; i++ {
		hash, _ := storage.HashPassword("pass")
		db.SaveUser(&models.User{
			ID:           "user-list",
			Username:     "user",
			PasswordHash: hash,
			Role:         models.UserRoleUser,
			CreatedAt:    now.Add(time.Duration(i) * time.Hour),
			UpdatedAt:    now,
		})
	}

	handler := NewUsersHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/users", nil)

	handler.List(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var users []userResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &users); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(users) < 1 {
		t.Fatalf("expected at least 1 user, got %d", len(users))
	}
}

func TestUsersHandlerDeleteRemovesData(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)

	// Create admin user
	adminHash, _ := storage.HashPassword("admin123")
	admin := &models.User{
		ID:           "admin-user",
		Username:     "admin",
		PasswordHash: adminHash,
		Role:         models.UserRoleAdmin,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := db.SaveUser(admin); err != nil {
		t.Fatalf("failed to save admin: %v", err)
	}

	// Create regular user with data
	userHash, _ := storage.HashPassword("pass123")
	user := &models.User{
		ID:           "regular-user",
		Username:     "regular",
		PasswordHash: userHash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := db.SaveUser(user); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	// Add a book for the regular user
	book := &models.Book{
		ID:        "user-book",
		UserID:    user.ID,
		Title:     "User Book",
		Filename:  "book.epub",
		Format:    "epub",
		Size:      100,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.SaveBook(book); err != nil {
		t.Fatalf("failed to save book: %v", err)
	}

	// Delete as admin
	handler := NewUsersHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", admin.ID)
	ctx.Params = gin.Params{{Key: "id", Value: user.ID}}
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/users/"+user.ID, nil)

	handler.Delete(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	// Verify user data was cleaned up
	gotUser, _ := db.GetUser(user.ID)
	if gotUser != nil {
		t.Fatal("expected user to be deleted")
	}
	gotBook, _ := db.GetBook(book.ID)
	if gotBook != nil {
		t.Fatal("expected user's book to be deleted")
	}
}

func TestUsersHandlerDeleteCannotDeleteSelf(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	hash, _ := storage.HashPassword("pass123")
	db.SaveUser(&models.User{
		ID:           "self-delete",
		Username:     "self",
		PasswordHash: hash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})

	handler := NewUsersHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "self-delete")
	ctx.Params = gin.Params{{Key: "id", Value: "self-delete"}}
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/users/self-delete", nil)

	handler.Delete(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerUpdateRejectsLastAdminDemote(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	hash, _ := storage.HashPassword("admin123")
	admin := &models.User{
		ID:           "only-admin",
		Username:     "onlyadmin",
		PasswordHash: hash,
		Role:         models.UserRoleAdmin,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	db.SaveUser(admin)

	handler := NewUsersHandler(db)
	role := models.UserRoleUser
	body := bytes.NewBufferString(`{"role":"user"}`)
	_ = role

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/users/only-admin", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "only-admin"}}

	handler.Update(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerCreateRejectsShortPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"newuser","password":"short"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerCreateRejectsEmptyUsername(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"  ","password":"secret123"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerCreateRejectsInvalidRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"newuser","password":"secret123","role":"superadmin"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerCreateDefaultsToUserRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"newuser","password":"secret123"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp userResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Role != models.UserRoleUser {
		t.Fatalf("expected default role user, got %s", resp.Role)
	}
}

func TestUsersHandlerCreateAcceptsAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"username":"newadmin","password":"secret123","role":"admin"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/users", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Create(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp userResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Role != models.UserRoleAdmin {
		t.Fatalf("expected role admin, got %s", resp.Role)
	}
}

func TestUsersHandlerUpdateChangesPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	hash, _ := storage.HashPassword("oldpass")
	user := &models.User{
		ID:           "update-user",
		Username:     "updateuser",
		PasswordHash: hash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	db.SaveUser(user)

	handler := NewUsersHandler(db)
	body := bytes.NewBufferString(`{"password":"newpassword123"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/users/update-user", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "update-user"}}

	handler.Update(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	got, _ := db.GetUser("update-user")
	if got == nil {
		t.Fatal("expected user to exist")
	}
	if storage.CheckPassword(got.PasswordHash, "newpassword123") == false {
		t.Fatal("expected password to be updated")
	}
	if storage.CheckPassword(got.PasswordHash, "oldpass") == true {
		t.Fatal("expected old password to no longer work")
	}
}

func TestUsersHandlerUpdateChangesRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	hash, _ := storage.HashPassword("pass123")
	db.SaveUser(&models.User{
		ID:           "role-user",
		Username:     "roleuser",
		PasswordHash: hash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})
	// Create another admin so we can promote
	db.SaveUser(&models.User{
		ID:           "other-admin",
		Username:     "otheradmin",
		PasswordHash: hash,
		Role:         models.UserRoleAdmin,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})

	handler := NewUsersHandler(db)
	body := bytes.NewBufferString(`{"role":"admin"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/users/role-user", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "role-user"}}

	handler.Update(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	var resp userResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Role != models.UserRoleAdmin {
		t.Fatalf("expected role admin, got %s", resp.Role)
	}
}

func TestUsersHandlerUpdateReturnsNotFoundForMissingUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewUsersHandler(db)

	body := bytes.NewBufferString(`{"password":"newpass123"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/users/nonexistent", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "nonexistent"}}

	handler.Update(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerUpdateRejectsShortPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	hash, _ := storage.HashPassword("pass123")
	db.SaveUser(&models.User{
		ID:           "short-pass-user",
		Username:     "shortpass",
		PasswordHash: hash,
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})

	handler := NewUsersHandler(db)
	body := bytes.NewBufferString(`{"password":"short"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/users/short-pass-user", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "short-pass-user"}}

	handler.Update(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUsersHandlerDeleteReturnsNotFoundForMissingUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	hash, _ := storage.HashPassword("admin123")
	db.SaveUser(&models.User{
		ID:           "delete-admin",
		Username:     "deladmin",
		PasswordHash: hash,
		Role:         models.UserRoleAdmin,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})

	handler := NewUsersHandler(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", "delete-admin")
	ctx.Params = gin.Params{{Key: "id", Value: "nonexistent"}}
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/users/nonexistent", nil)

	handler.Delete(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}
