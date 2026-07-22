package handlers

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"z-reader/backend/logger"
	"z-reader/backend/response"
)

const (
	maxClientErrorBodyBytes = 16 * 1024
	maxClientErrorMessage   = 1000
	maxClientErrorStack     = 8000
	maxClientErrorComponent = 300
	maxClientErrorPath      = 1000
)

type ClientErrorHandler struct{}

type clientErrorReport struct {
	Message   string `json:"message" binding:"required"`
	Stack     string `json:"stack"`
	Component string `json:"component"`
	Path      string `json:"path"`
}

func NewClientErrorHandler() *ClientErrorHandler {
	return &ClientErrorHandler{}
}

func (h *ClientErrorHandler) Report(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxClientErrorBodyBytes)
	var report clientErrorReport
	if err := c.ShouldBindJSON(&report); err != nil {
		response.BadRequest(c, "客户端错误报告无效")
		return
	}
	report.Message = trimRunes(strings.TrimSpace(report.Message), maxClientErrorMessage)
	if report.Message == "" {
		response.BadRequest(c, "客户端错误信息不能为空")
		return
	}

	logger.Warn(
		"Client error report",
		"request_id", logger.RequestID(c.Request.Context()),
		"user_id", userID,
		"message", report.Message,
		"stack", trimRunes(strings.TrimSpace(report.Stack), maxClientErrorStack),
		"component", trimRunes(strings.TrimSpace(report.Component), maxClientErrorComponent),
		"path", trimRunes(strings.TrimSpace(report.Path), maxClientErrorPath),
	)
	c.JSON(http.StatusAccepted, gin.H{})
}

func trimRunes(value string, maximum int) string {
	if utf8.RuneCountInString(value) <= maximum {
		return value
	}
	return string([]rune(value)[:maximum])
}
