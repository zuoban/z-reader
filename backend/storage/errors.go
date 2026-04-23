package storage

import "errors"

var (
	ErrNotFound             = errors.New("未找到")
	ErrDuplicateBookContent = errors.New("图书已存在")
)
