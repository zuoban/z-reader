package handlers

import (
	"crypto/tls"
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

func TestLogoutRevokesCookieAndBearerSessions(t *testing.T) {
	const password = "library password"
	db := openHandlerTestDB(t)
	handler := NewAuthHandler(&config.Config{AccessPassword: password}, db)
	router := gin.New()
	router.POST("/login", handler.Login)
	router.POST("/logout", handler.Logout)
	router.GET("/verify", middleware.AuthRequired(db, password), handler.Verify)

	login := func() *http.Cookie {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"password":"library password"}`))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		cookies := rec.Result().Cookies()
		if rec.Code != http.StatusOK || len(cookies) != 1 {
			t.Fatalf("login returned %d with %d cookies", rec.Code, len(cookies))
		}
		return cookies[0]
	}
	cookie, bearer, other := login(), login(), login()

	logout := func() {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/logout", nil)
		req.AddCookie(cookie)
		req.Header.Set("Authorization", "Bearer "+bearer.Value)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		cookies := rec.Result().Cookies()
		if rec.Code != http.StatusOK || len(cookies) != 1 || cookies[0].MaxAge >= 0 {
			t.Fatalf("logout returned %d, expected an expired session cookie", rec.Code)
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("logout response must not be stored")
		}
	}
	logout()
	logout()

	for _, tc := range []struct {
		name string
		add  func(*http.Request)
		want int
	}{
		{"cookie", func(req *http.Request) { req.AddCookie(cookie) }, http.StatusUnauthorized},
		{"bearer", func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+bearer.Value)
		}, http.StatusUnauthorized},
		{"other device", func(req *http.Request) { req.AddCookie(other) }, http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/verify", nil)
			tc.add(req)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("verify returned %d, want %d", rec.Code, tc.want)
			}
		})
	}
}

func TestAccessCookieSecureFlagRespectsTrustedProxiesAndTLS(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)

	cases := []struct {
		name           string
		trustedProxies []string
		remoteAddr     string
		forwardedProto string
		directTLS      bool
		wantSecure     bool
	}{
		{
			name:           "direct HTTP with spoofed X-Forwarded-Proto from untrusted IP",
			trustedProxies: []string{"127.0.0.1", "::1"},
			remoteAddr:     "203.0.113.10:44321",
			forwardedProto: "https",
			wantSecure:     false,
		},
		{
			name:           "direct HTTP with spoofed X-Forwarded-Proto and empty trusted proxies",
			trustedProxies: nil,
			remoteAddr:     "127.0.0.1:44321",
			forwardedProto: "https",
			wantSecure:     false,
		},
		{
			name:           "trusted proxy IPv4 with X-Forwarded-Proto https",
			trustedProxies: []string{"127.0.0.1", "::1"},
			remoteAddr:     "127.0.0.1:54321",
			forwardedProto: "https",
			wantSecure:     true,
		},
		{
			name:           "trusted proxy IPv6 with X-Forwarded-Proto https",
			trustedProxies: []string{"127.0.0.1", "::1"},
			remoteAddr:     "[::1]:54321",
			forwardedProto: "https",
			wantSecure:     true,
		},
		{
			name:           "trusted proxy CIDR with X-Forwarded-Proto https",
			trustedProxies: []string{"10.0.0.0/8"},
			remoteAddr:     "10.24.0.5:8080",
			forwardedProto: "https",
			wantSecure:     true,
		},
		{
			name:           "untrusted IP outside CIDR",
			trustedProxies: []string{"10.0.0.0/8"},
			remoteAddr:     "192.168.1.5:8080",
			forwardedProto: "https",
			wantSecure:     false,
		},
		{
			name:           "trusted wildcard proxy with X-Forwarded-Proto https",
			trustedProxies: []string{"*"},
			remoteAddr:     "198.51.100.7:1234",
			forwardedProto: "https",
			wantSecure:     true,
		},
		{
			name:           "trusted proxy with X-Forwarded-Proto http",
			trustedProxies: []string{"127.0.0.1"},
			remoteAddr:     "127.0.0.1:1234",
			forwardedProto: "http",
			wantSecure:     false,
		},
		{
			name:           "direct TLS always sets Secure regardless of trusted proxies",
			trustedProxies: nil,
			remoteAddr:     "203.0.113.55:443",
			forwardedProto: "",
			directTLS:      true,
			wantSecure:     true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			handler := NewAuthHandler(&config.Config{
				AccessPassword: "secret",
				TrustedProxies: tc.trustedProxies,
			}, db)
			router.POST("/login", handler.Login)
			router.POST("/logout", handler.Logout)

			req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"password":"secret"}`))
			req.Header.Set("Content-Type", "application/json")
			req.RemoteAddr = tc.remoteAddr
			if tc.forwardedProto != "" {
				req.Header.Set("X-Forwarded-Proto", tc.forwardedProto)
			}
			if tc.directTLS {
				req.TLS = &tls.ConnectionState{}
			}

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("login returned %d: %s", rec.Code, rec.Body.String())
			}
			cookies := rec.Result().Cookies()
			if len(cookies) != 1 {
				t.Fatalf("expected 1 cookie, got %d", len(cookies))
			}
			if cookies[0].Secure != tc.wantSecure {
				t.Fatalf("cookie Secure = %v, want %v", cookies[0].Secure, tc.wantSecure)
			}
			if !cookies[0].HttpOnly {
				t.Fatal("expected HttpOnly cookie")
			}

			// Logout cookie must mirror the same Secure policy.
			logoutReq := httptest.NewRequest(http.MethodPost, "/logout", nil)
			logoutReq.RemoteAddr = tc.remoteAddr
			if tc.forwardedProto != "" {
				logoutReq.Header.Set("X-Forwarded-Proto", tc.forwardedProto)
			}
			if tc.directTLS {
				logoutReq.TLS = &tls.ConnectionState{}
			}
			logoutReq.AddCookie(cookies[0])
			logoutRec := httptest.NewRecorder()
			router.ServeHTTP(logoutRec, logoutReq)
			if logoutRec.Code != http.StatusOK {
				t.Fatalf("logout returned %d: %s", logoutRec.Code, logoutRec.Body.String())
			}
			logoutCookies := logoutRec.Result().Cookies()
			if len(logoutCookies) != 1 || logoutCookies[0].Secure != tc.wantSecure {
				t.Fatalf("logout cookie mismatch: %+v, want Secure=%v", logoutCookies, tc.wantSecure)
			}
		})
	}
}
