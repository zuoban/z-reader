package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSecurityHeadersSetsDefaultsAndAllowsOverrides(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		if c.Query("preset") == "1" {
			c.Header("Referrer-Policy", "no-referrer")
		}
		c.Next()
	})
	router.Use(SecurityHeaders())

	router.GET("/default", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})
	router.GET("/override", func(c *gin.Context) {
		c.Header("X-Frame-Options", "SAMEORIGIN")
		c.String(http.StatusOK, "ok")
	})

	t.Run("sets default headers", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/default", nil)
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Fatalf("X-Content-Type-Options = %q, want %q", got, "nosniff")
		}
		if got := rec.Header().Get("X-Frame-Options"); got != "DENY" {
			t.Fatalf("X-Frame-Options = %q, want %q", got, "DENY")
		}
		if got := rec.Header().Get("Referrer-Policy"); got != "strict-origin-when-cross-origin" {
			t.Fatalf("Referrer-Policy = %q, want %q", got, "strict-origin-when-cross-origin")
		}
	})

	t.Run("allows handler override", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/override", nil)
		router.ServeHTTP(rec, req)

		if got := rec.Header().Get("X-Frame-Options"); got != "SAMEORIGIN" {
			t.Fatalf("X-Frame-Options = %q, want %q", got, "SAMEORIGIN")
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Fatalf("X-Content-Type-Options = %q, want %q", got, "nosniff")
		}
	})

	t.Run("preserves upstream header if already set", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/default?preset=1", nil)
		router.ServeHTTP(rec, req)

		if got := rec.Header().Get("Referrer-Policy"); got != "no-referrer" {
			t.Fatalf("Referrer-Policy = %q, want %q", got, "no-referrer")
		}
	})
}
