// Package diagnostics provides opt-in endpoints for production troubleshooting.
package diagnostics

import (
	"net/http/pprof"

	"github.com/gin-gonic/gin"
)

// RegisterPprofRoutes adds the standard Go pprof handlers. Callers must keep
// the routes on a trusted network; they intentionally have no application auth
// so Go tooling can retrieve profiles directly.
func RegisterPprofRoutes(router *gin.Engine) {
	router.GET("/debug/pprof/", gin.WrapF(pprof.Index))
	router.GET("/debug/pprof/:profile", func(c *gin.Context) {
		switch c.Param("profile") {
		case "cmdline":
			pprof.Cmdline(c.Writer, c.Request)
		case "profile":
			pprof.Profile(c.Writer, c.Request)
		case "symbol":
			pprof.Symbol(c.Writer, c.Request)
		case "trace":
			pprof.Trace(c.Writer, c.Request)
		default:
			pprof.Handler(c.Param("profile")).ServeHTTP(c.Writer, c.Request)
		}
	})
	router.POST("/debug/pprof/symbol", gin.WrapF(pprof.Symbol))
}
