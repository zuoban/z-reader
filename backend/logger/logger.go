package logger

import (
	"context"
	"log/slog"
	"os"
)

var log *slog.Logger

func Init() {
	log = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(log)
}

func Info(msg string, args ...any) {
	slog.Info(msg, args...)
}

func Error(msg string, args ...any) {
	slog.Error(msg, args...)
}

func Warn(msg string, args ...any) {
	slog.Warn(msg, args...)
}

func Debug(msg string, args ...any) {
	slog.Debug(msg, args...)
}

func With(args ...any) *slog.Logger {
	return slog.With(args...)
}

func RequestID(ctx context.Context) string {
	if id, ok := ctx.Value("request_id").(string); ok {
		return id
	}
	return ""
}
