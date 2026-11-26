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

func BadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, &ErrorResponse{Code: "bad_request", Message: message})
}

func Unauthorized(c *gin.Context, message string) {
	c.JSON(http.StatusUnauthorized, &ErrorResponse{Code: "unauthorized", Message: message})
}

func Forbidden(c *gin.Context, message string) {
	c.JSON(http.StatusForbidden, &ErrorResponse{Code: "forbidden", Message: message})
}

func NotFound(c *gin.Context, message string) {
	c.JSON(http.StatusNotFound, &ErrorResponse{Code: "not_found", Message: message})
}

func Conflict(c *gin.Context, message string) {
	c.JSON(http.StatusConflict, &ErrorResponse{Code: "conflict", Message: message})
}

func InternalError(c *gin.Context, message string) {
	c.JSON(http.StatusInternalServerError, &ErrorResponse{Code: "internal_error", Message: message})
}

func Success(c *gin.Context, message string) {
	c.JSON(http.StatusOK, SuccessResponse{Message: message})
}
