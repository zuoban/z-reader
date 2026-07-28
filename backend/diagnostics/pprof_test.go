package diagnostics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRegisterPprofRoutesServesGoroutineProfile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterPprofRoutes(router)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/debug/pprof/goroutine?debug=1", nil),
	)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "goroutine profile") {
		t.Fatalf("expected goroutine profile, got status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}
