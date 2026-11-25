package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders sets default HTTP security headers before downstream
// handlers run so route handlers can override them when needed.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		headers := c.Writer.Header()
		if headers.Get("X-Content-Type-Options") == "" {
			headers.Set("X-Content-Type-Options", "nosniff")
		}
		if headers.Get("X-Frame-Options") == "" {
			headers.Set("X-Frame-Options", "DENY")
		}
		if headers.Get("Referrer-Policy") == "" {
			headers.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		}
		c.Next()
	}
}
