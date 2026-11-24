package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
	"z-reader/backend/response"
)

const maxClientErrorBodyBytes = 16 * 1024

type ClientErrorHandler struct{}

type clientErrorReport struct {
	Message   string `json:"message" binding:"required"`
	Component string `json:"component"`
	Path      string `json:"path"`
}

func NewClientErrorHandler() *ClientErrorHandler {
	return &ClientErrorHandler{}
}

func (h *ClientErrorHandler) Report(c *gin.Context) {

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxClientErrorBodyBytes)
	var report clientErrorReport
	if err := c.ShouldBindJSON(&report); err != nil || strings.TrimSpace(report.Message) == "" {
		response.BadRequest(c, "客户端错误报告无效")
		return
	}

	component := "unknown"
	switch report.Component {
	case "ErrorBoundary", "window.onerror", "unhandledrejection":
		component = report.Component
	}
	page := "unknown"
	switch {
	case strings.HasPrefix(report.Path, "/read/"):
		page = "/read/:id"
	case report.Path == "/", report.Path == "/login", report.Path == "/shelf":
		page = report.Path
	}
	logger.Warn("Client error report", "request_id", logger.RequestID(c.Request.Context()),
		"component", component, "page", page)
	c.JSON(http.StatusAccepted, gin.H{})
}
