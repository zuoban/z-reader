package storage

import "errors"

var (
	ErrNotFound             = errors.New("未找到")
	ErrDuplicateBookContent = errors.New("图书已存在")
	ErrProgressConflict     = errors.New("阅读进度已在其他设备更新")
)
