package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// RequestBodyLimit limits non-multipart requests before a handler attempts to
// decode them. File handlers apply their own, larger multipart limits.
func RequestBodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if maxBytes <= 0 || c.Request == nil || c.Request.Body == nil {
			c.Next()
			return
		}

		contentType := c.GetHeader("Content-Type")
		if strings.HasPrefix(strings.ToLower(contentType), "multipart/form-data") {
			c.Next()
			return
		}

		if c.Request.ContentLength > maxBytes {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": "请求体过大",
			})
			return
		}

		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
