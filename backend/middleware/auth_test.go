package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func openMiddlewareTestDB(t *testing.T) *storage.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "middleware.db")
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

func setupAuthTestUser(t *testing.T, db *storage.DB) (*models.User, *models.Session) {
	t.Helper()

	user := &models.User{
		ID:           "auth-user",
		Username:     "testuser",
		PasswordHash: "dummy-hash",
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := db.SaveUser(user); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	session := &models.Session{
		Token:     "valid-token",
		UserID:    user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("failed to save session: %v", err)
	}

	return user, session
}

func TestAuthRequiredAcceptsValidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)
	user, session := setupAuthTestUser(t, db)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.Header.Set("Authorization", "Bearer "+session.Token)

	middleware(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	if ctx.GetString("userID") != user.ID {
		t.Fatalf("expected userID %s, got %s", user.ID, ctx.GetString("userID"))
	}
	if ctx.GetString("username") != user.Username {
		t.Fatalf("expected username %s, got %s", user.Username, ctx.GetString("username"))
	}
	if ctx.GetString("userRole") != user.Role {
		t.Fatalf("expected role %s, got %s", user.Role, ctx.GetString("userRole"))
	}
}

func TestAuthRequiredAcceptsTokenWithoutBearerPrefix(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)
	_, session := setupAuthTestUser(t, db)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.Header.Set("Authorization", session.Token)

	middleware(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredAcceptsSessionCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)
	_, session := setupAuthTestUser(t, db)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: session.Token})

	middleware(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredRejectsMissingHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)

	middleware(ctx)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredRejectsInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.Header.Set("Authorization", "Bearer invalid-token")

	middleware(ctx)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredRejectsExpiredSession(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)
	user := &models.User{
		ID:           "expired-user",
		Username:     "expired",
		PasswordHash: "dummy",
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	db.SaveUser(user)

	// Create expired session
	session := &models.Session{
		Token:     "expired-token",
		UserID:    user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: time.Now().UTC().Add(-48 * time.Hour),
		ExpiresAt: time.Now().UTC().Add(-24 * time.Hour),
	}
	db.SaveSession(session)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.Header.Set("Authorization", "Bearer "+session.Token)

	middleware(ctx)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredRejectsDeletedUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	// Create session for non-existent user
	session := &models.Session{
		Token:     "orphan-token",
		UserID:    "non-existent-user",
		Username:  "ghost",
		Role:      models.UserRoleUser,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	db.SaveSession(session)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.Header.Set("Authorization", "Bearer orphan-token")

	middleware(ctx)

	// GetSession returns session but GetUser returns nil, so Unauthorized
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredSetsUserContext(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)
	user, session := setupAuthTestUser(t, db)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	ctx.Request.Header.Set("Authorization", "Bearer "+session.Token)

	middleware(ctx)

	// Check the user object in context
	userData := ctx.Value("user")
	if userData == nil {
		t.Fatal("expected user in context")
	}

	userMap, ok := userData.(gin.H)
	if !ok {
		t.Fatal("expected user to be gin.H")
	}
	if userMap["id"] != user.ID {
		t.Fatalf("expected user id %s, got %v", user.ID, userMap["id"])
	}
	if userMap["username"] != user.Username {
		t.Fatalf("expected username %s, got %v", user.Username, userMap["username"])
	}
	if userMap["role"] != user.Role {
		t.Fatalf("expected role %s, got %v", user.Role, userMap["role"])
	}
}

func TestAdminRequiredAcceptsAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	adminUser := &models.User{
		ID:           "admin-user",
		Username:     "admin",
		PasswordHash: "dummy",
		Role:         models.UserRoleAdmin,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	db.SaveUser(adminUser)

	session := &models.Session{
		Token:     "admin-token",
		UserID:    adminUser.ID,
		Username:  adminUser.Username,
		Role:      adminUser.Role,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	db.SaveSession(session)

	// Chain auth + admin middleware
	recorder := httptest.NewRecorder()
	ctx, engine := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin", nil)
	ctx.Request.Header.Set("Authorization", "Bearer "+session.Token)

	// Use engine to chain middlewares
	engine.Use(AuthRequired(db))
	engine.GET("/api/admin", func(c *gin.Context) {
		AdminRequired()(c)
		if c.IsAborted() {
			return
		}
		c.Status(http.StatusOK)
	})

	engine.HandleContext(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminRequiredRejectsUserRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	user := &models.User{
		ID:           "regular-user",
		Username:     "user",
		PasswordHash: "dummy",
		Role:         models.UserRoleUser,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	db.SaveUser(user)

	session := &models.Session{
		Token:     "user-token",
		UserID:    user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	db.SaveSession(session)

	recorder := httptest.NewRecorder()
	ctx, engine := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin", nil)
	ctx.Request.Header.Set("Authorization", "Bearer "+session.Token)

	engine.Use(AuthRequired(db))
	engine.GET("/api/admin", func(c *gin.Context) {
		AdminRequired()(c)
		c.Status(http.StatusOK)
	})

	engine.HandleContext(ctx)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminRequiredRejectsMissingRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	middleware := AdminRequired()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin", nil)

	middleware(ctx)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthRequiredAbortsOnFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)

	// After middleware, the request should be aborted
	middleware(ctx)

	if !ctx.IsAborted() {
		t.Fatal("expected request to be aborted on auth failure")
	}
}

func TestAuthRequiredResponseContainsMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := openMiddlewareTestDB(t)

	middleware := AuthRequired(db)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)

	middleware(ctx)

	var resp map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if msg, ok := resp["message"].(string); !ok || msg == "" {
		t.Fatalf("expected response with message, got %+v", resp)
	}
}
