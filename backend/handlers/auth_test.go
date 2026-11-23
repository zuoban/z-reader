package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/middleware"
	"z-reader/backend/models"
)

func TestPersonalLibraryAccess(t *testing.T) {
	db := openHandlerTestDB(t)
	makeRouter := func(password string) *gin.Engine {
		router := gin.New()
		handler := NewAuthHandler(&config.Config{AccessPassword: password}, db)
		router.POST("/login", handler.Login)
		router.POST("/logout", handler.Logout)
		router.GET("/verify", middleware.AuthRequired(db, password), handler.Verify)
		return router
	}
	request := func(router *gin.Engine, method, path, body string, cookie *http.Cookie, status int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if cookie != nil {
			req.AddCookie(cookie)
		}
		result := httptest.NewRecorder()
		router.ServeHTTP(result, req)
		if result.Code != status {
			t.Fatalf("%s %s returned %d: %s", method, path, result.Code, result.Body)
		}
		return result
	}

	open := makeRouter("")
	if result := request(open, "GET", "/verify", "", nil, 200); !strings.Contains(result.Body.String(), `"password_required":false`) {
		t.Fatal("expected open access")
	}
	if result := request(open, "POST", "/login", "", nil, 200); len(result.Result().Cookies()) != 0 {
		t.Fatal("open access should not create sessions")
	}

	protected := makeRouter("test access")
	request(protected, "GET", "/verify", "", nil, 401)
	request(protected, "POST", "/login", `{"password":"wrong"}`, nil, 401)
	request(protected, "POST", "/login", `{}`, nil, 400)
	result := request(protected, "POST", "/login", `{"password":"test access"}`, nil, 200)
	cookies := result.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].Name != middleware.SessionCookieName {
		t.Fatal("expected one HttpOnly access cookie")
	}
	cookie := cookies[0]
	request(protected, "GET", "/verify", "", cookie, 200)
	request(makeRouter("changed"), "GET", "/verify", "", cookie, 401)
	request(protected, "POST", "/logout", "", cookie, 200)
	request(protected, "GET", "/verify", "", cookie, 401)

	for _, session := range []models.Session{
		{Token: cookie.Value, UserID: "old-account", ExpiresAt: time.Now().Add(time.Hour)},
		{Token: middleware.SessionKey("test access", cookie.Value), ExpiresAt: time.Now().Add(-time.Hour)},
	} {
		if err := db.SaveSession(&session); err != nil {
			t.Fatal(err)
		}
		request(protected, "GET", "/verify", "", cookie, 401)
	}
}
