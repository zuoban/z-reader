package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type SuccessResponse struct {
	Message string `json:"message"`
}

var (
	ErrBadRequest   = &ErrorResponse{Code: "bad_request", Message: "请求无效"}
	ErrUnauthorized = &ErrorResponse{Code: "unauthorized", Message: "请先登录"}
	ErrForbidden    = &ErrorResponse{Code: "forbidden", Message: "没有访问权限"}
	ErrNotFound     = &ErrorResponse{Code: "not_found", Message: "资源不存在"}
	ErrInternal     = &ErrorResponse{Code: "internal_error", Message: "服务器内部错误"}
)

func Error(c *gin.Context, status int, err *ErrorResponse) {
	c.JSON(status, err)
}

func BadRequest(c *gin.Context, message string) {
	err := &ErrorResponse{Code: "bad_request", Message: message}
	if message == "" {
		err = ErrBadRequest
	}
	c.JSON(http.StatusBadRequest, err)
}

func Unauthorized(c *gin.Context, message string) {
	err := &ErrorResponse{Code: "unauthorized", Message: message}
	if message == "" {
		err = ErrUnauthorized
	}
	c.JSON(http.StatusUnauthorized, err)
}

func Forbidden(c *gin.Context, message string) {
	err := &ErrorResponse{Code: "forbidden", Message: message}
	if message == "" {
		err = ErrForbidden
	}
	c.JSON(http.StatusForbidden, err)
}

func NotFound(c *gin.Context, message string) {
	err := &ErrorResponse{Code: "not_found", Message: message}
	if message == "" {
		err = ErrNotFound
	}
	c.JSON(http.StatusNotFound, err)
}

func Conflict(c *gin.Context, message string) {
	err := &ErrorResponse{Code: "conflict", Message: message}
	c.JSON(http.StatusConflict, err)
}

func InternalError(c *gin.Context, message string) {
	err := &ErrorResponse{Code: "internal_error", Message: message}
	if message == "" {
		err = ErrInternal
	}
	c.JSON(http.StatusInternalServerError, err)
}

func Success(c *gin.Context, message string) {
	c.JSON(http.StatusOK, SuccessResponse{Message: message})
}
