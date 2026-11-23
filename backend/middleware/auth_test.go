package middleware

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func TestAccessMiddleware(t *testing.T) {
	db, err := storage.Open(filepath.Join(t.TempDir(), "library.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	const password = "library password"
	const token = "active-session"
	if err := db.SaveSession(&models.Session{
		Token: SessionKey(password, token), ExpiresAt: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, password, cookie, bearer string
		want                           int
	}{
		{"open", "", "", "", 200},
		{"no session", password, "", "", 401},
		{"invalid session", password, "invalid", "", 401},
		{"cookie", password, token, "", 200},
		{"bearer", password, "", token, 200},
		{"wrong password namespace", "changed", token, "", 401},
	} {
		t.Run(test.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/", AuthRequired(db, test.password), func(c *gin.Context) {
				c.Status(http.StatusOK)
			})
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if test.cookie != "" {
				req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: test.cookie})
			}
			if test.bearer != "" {
				req.Header.Set("Authorization", "Bearer "+test.bearer)
			}
			result := httptest.NewRecorder()
			router.ServeHTTP(result, req)
			if result.Code != test.want {
				t.Fatalf("status = %d, want %d", result.Code, test.want)
			}
		})
	}
}
