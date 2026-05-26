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
	"strings"
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
	if response.Token != "" {
		t.Fatal("expected login token to be omitted")
	}
	cookies := recorder.Result().Cookies()
	var sessionToken string
	for _, cookie := range cookies {
		if cookie.Name == sessionCookieName {
			sessionToken = cookie.Value
			if !cookie.HttpOnly {
				t.Fatal("expected session cookie to be HttpOnly")
			}
			break
		}
	}
	if sessionToken == "" {
		t.Fatal("expected session cookie")
	}
	session, err := db.GetSession(sessionToken)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if session == nil || session.UserID != user.ID || session.Role != models.UserRoleUser {
		t.Fatalf("unexpected session: %+v", session)
	}
}

func TestAuthRegisterCreatesUserSessionAndOmitsRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewAuthHandler(&config.Config{}, db)

	body := bytes.NewBufferString(`{"username":"reader","password":"reader-password"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/register", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Register(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) == 0 || cookies[0].Name != sessionCookieName {
		t.Fatalf("expected session cookie, got %+v", cookies)
	}

	var resp map[string]map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	userResp := resp["user"]
	if userResp["username"] != "reader" {
		t.Fatalf("expected username reader, got %+v", userResp)
	}
	if _, ok := userResp["role"]; ok {
		t.Fatalf("expected public user to omit role, got %+v", userResp)
	}
	if _, ok := userResp["password_hash"]; ok {
		t.Fatalf("expected public user to omit password hash, got %+v", userResp)
	}

	user, err := db.GetUserByUsername("reader")
	if err != nil {
		t.Fatalf("GetUserByUsername returned error: %v", err)
	}
	if user == nil || !storage.CheckPassword(user.PasswordHash, "reader-password") {
		t.Fatalf("expected stored user with hashed password, got %+v", user)
	}

	session, err := db.GetSession(cookies[0].Value)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if session == nil || session.UserID != user.ID {
		t.Fatalf("expected saved session for user, got %+v", session)
	}
}

func TestAuthRegisterRejectsDuplicateUsername(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	passwordHash, _ := storage.HashPassword("original-password")
	if err := db.SaveUser(&models.User{
		ID:           "existing-user",
		Username:     "reader",
		PasswordHash: passwordHash,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	handler := NewAuthHandler(&config.Config{}, db)
	body := bytes.NewBufferString(`{"username":" reader ","password":"reader-password"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/register", body)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Register(ctx)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRegisterRejectsInvalidInput(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name string
		body string
	}{
		{name: "empty username", body: `{"username":"  ","password":"reader-password"}`},
		{name: "long username", body: `{"username":"` + strings.Repeat("a", 51) + `","password":"reader-password"}`},
		{name: "short password", body: `{"username":"reader","password":"short"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := openHandlerTestDB(t)
			handler := NewAuthHandler(&config.Config{}, db)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(tt.body))
			ctx.Request.Header.Set("Content-Type", "application/json")

			handler.Register(ctx)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("expected status 400, got %d body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestAuthRegisterUserCanLogin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	handler := NewAuthHandler(&config.Config{}, db)

	registerRecorder := httptest.NewRecorder()
	registerCtx, _ := gin.CreateTestContext(registerRecorder)
	registerCtx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/register",
		bytes.NewBufferString(`{"username":"reader","password":"reader-password"}`),
	)
	registerCtx.Request.Header.Set("Content-Type", "application/json")
	handler.Register(registerCtx)
	if registerRecorder.Code != http.StatusOK {
		t.Fatalf("expected register status 200, got %d body=%s", registerRecorder.Code, registerRecorder.Body.String())
	}

	loginRecorder := httptest.NewRecorder()
	loginCtx, _ := gin.CreateTestContext(loginRecorder)
	loginCtx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/login",
		bytes.NewBufferString(`{"username":"reader","password":"reader-password"}`),
	)
	loginCtx.Request.Header.Set("Content-Type", "application/json")

	handler.Login(loginCtx)

	if loginRecorder.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d body=%s", loginRecorder.Code, loginRecorder.Body.String())
	}
}

func TestAuthRegisterFirstUserClaimsLegacyBooks(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	if err := db.SaveBook(&models.Book{
		ID:        "legacy-book",
		Title:     "Legacy Book",
		Filename:  "legacy.epub",
		Format:    "epub",
		Size:      100,
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("failed to save legacy book: %v", err)
	}

	handler := NewAuthHandler(&config.Config{}, db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/register",
		bytes.NewBufferString(`{"username":"first","password":"reader-password"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.Register(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	user, err := db.GetUserByUsername("first")
	if err != nil {
		t.Fatalf("GetUserByUsername returned error: %v", err)
	}
	gotBook, err := db.GetBook("legacy-book")
	if err != nil {
		t.Fatalf("GetBook returned error: %v", err)
	}
	if user == nil || gotBook == nil || gotBook.UserID != user.ID {
		t.Fatalf("expected legacy book to belong to first user=%+v, got book=%+v", user, gotBook)
	}
	books, err := db.ListBooks(user.ID)
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(books) != 1 || books[0].ID != "legacy-book" {
		t.Fatalf("expected legacy book in first user's list, got %+v", books)
	}
}

func TestAuthLogoutAcceptsSessionCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	session := &models.Session{
		Token:     "cookie-session-token",
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
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: session.Token})
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
		{name: "epub ok", format: "epub", content: zipBytes(t, map[string][]byte{
			"mimetype":               []byte("application/epub+zip"),
			"META-INF/container.xml": []byte("<container/>"),
		})},
		{name: "macos packaged epub ok", format: "epub", content: zipBytes(t, map[string][]byte{
			"笔记的方法.epub/mimetype":               []byte("application/epub+zip"),
			"笔记的方法.epub/META-INF/container.xml": []byte("<container/>"),
		})},
		{name: "epub rejects plain zip", format: "epub", content: zipBytes(t, map[string][]byte{
			"readme.txt": []byte("not an epub"),
		}), wantErr: true},
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

func TestInferBookFormatFromContentType(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		wantFormat  string
		wantExt     string
		wantOK      bool
	}{
		{
			name:        "epub with charset",
			contentType: "application/epub+zip; charset=binary",
			wantFormat:  "epub",
			wantExt:     ".epub",
			wantOK:      true,
		},
		{
			name:        "pdf",
			contentType: "application/pdf",
			wantFormat:  "pdf",
			wantExt:     ".pdf",
			wantOK:      true,
		},
		{
			name:        "unsupported",
			contentType: "application/zip",
			wantOK:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFormat, gotExt, gotOK := inferBookFormatFromContentType(tt.contentType)
			if gotFormat != tt.wantFormat || gotExt != tt.wantExt || gotOK != tt.wantOK {
				t.Fatalf(
					"inferBookFormatFromContentType() = %q, %q, %v; want %q, %q, %v",
					gotFormat,
					gotExt,
					gotOK,
					tt.wantFormat,
					tt.wantExt,
					tt.wantOK,
				)
			}
		})
	}
}

func TestInferUploadedBookFormatFromContent(t *testing.T) {
	file := newMultipartFileHeader(t, "download", validEPUBBytes(t))

	gotFormat, gotExt, gotOK := inferUploadedBookFormat(file)

	if gotFormat != "epub" || gotExt != ".epub" || !gotOK {
		t.Fatalf(
			"inferUploadedBookFormat() = %q, %q, %v; want epub, .epub, true",
			gotFormat,
			gotExt,
			gotOK,
		)
	}
}

func TestBooksUploadRejectsDuplicateContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
	userID := "user-a"
	content := validEPUBBytes(t)

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
	content := validEPUBBytes(t)
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

func TestBooksUploadNormalizesMacOSPackagedEPUB(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := NewBooksHandler(&config.Config{UploadDir: uploadDir}, db)
	userID := "user-a"

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("userID", userID)
	ctx.Request = newMultipartUploadRequest(t, "笔记的方法.epub.zip", macOSPackagedEPUBBytes(t))

	handler.Upload(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected upload status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	books, err := db.ListBooks(userID)
	if err != nil {
		t.Fatalf("ListBooks returned error: %v", err)
	}
	if len(books) != 1 {
		t.Fatalf("expected 1 uploaded book, got %d", len(books))
	}
	if books[0].Format != "epub" || filepath.Ext(books[0].Filename) != ".epub" {
		t.Fatalf("expected normalized epub book, got %+v", books[0])
	}

	reader, err := zip.OpenReader(filepath.Join(uploadDir, books[0].Filename))
	if err != nil {
		t.Fatalf("failed to open saved epub: %v", err)
	}
	defer reader.Close()

	names := make(map[string]bool)
	for _, entry := range reader.File {
		names[entry.Name] = true
		if strings.HasPrefix(entry.Name, "笔记的方法.epub/") {
			t.Fatalf("expected packaged epub root to be stripped, got entry %q", entry.Name)
		}
	}
	if !names["mimetype"] || !names["META-INF/container.xml"] {
		t.Fatalf("expected saved epub root entries, got %#v", names)
	}
}

func TestNormalizeStoredEPUBFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "book.epub")
	if err := os.WriteFile(path, macOSPackagedEPUBBytes(t), 0600); err != nil {
		t.Fatalf("failed to write packaged epub: %v", err)
	}

	normalized, err := normalizeStoredEPUBFile(path)
	if err != nil {
		t.Fatalf("normalizeStoredEPUBFile returned error: %v", err)
	}
	if !normalized {
		t.Fatal("expected stored packaged epub to be normalized")
	}

	reader, err := zip.OpenReader(path)
	if err != nil {
		t.Fatalf("failed to open normalized epub: %v", err)
	}
	defer reader.Close()

	names := make(map[string]bool)
	for _, entry := range reader.File {
		names[entry.Name] = true
		if strings.HasPrefix(entry.Name, "笔记的方法.epub/") {
			t.Fatalf("expected packaged epub root to be stripped, got entry %q", entry.Name)
		}
	}
	if !names["mimetype"] || !names["META-INF/container.xml"] {
		t.Fatalf("expected normalized epub root entries, got %#v", names)
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

func zipBytes(t *testing.T, files map[string][]byte) []byte {
	t.Helper()

	var body bytes.Buffer
	writer := zip.NewWriter(&body)
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
	return body.Bytes()
}

func validEPUBBytes(t *testing.T) []byte {
	t.Helper()

	return zipBytes(t, map[string][]byte{
		"mimetype":               []byte("application/epub+zip"),
		"META-INF/container.xml": []byte("<container/>"),
	})
}

func macOSPackagedEPUBBytes(t *testing.T) []byte {
	t.Helper()

	return zipBytes(t, map[string][]byte{
		"笔记的方法.epub/mimetype":               []byte("application/epub+zip"),
		"笔记的方法.epub/META-INF/container.xml": []byte("<container/>"),
	})
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
