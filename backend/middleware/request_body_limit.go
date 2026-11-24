package middleware

import (
	"mime"
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"
)

// RequestBodyLimit limits requests before decoding. Only the listed POST routes
// can use their upload handlers' separate limits for multipart bodies.
func RequestBodyLimit(maxBytes int64, uploadRoutes ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if maxBytes <= 0 || c.Request == nil || c.Request.Body == nil {
			c.Next()
			return
		}

		if c.Request.Method == http.MethodPost && slices.Contains(uploadRoutes, c.FullPath()) {
			mediaType, params, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
			if err == nil && mediaType == "multipart/form-data" && params["boundary"] != "" {
				c.Next()
				return
			}
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
