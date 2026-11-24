package storage

import "z-reader/backend/models"

// SessionDB 返回专用的 session 数据库实例。
func (db *DB) SessionDB() *SessionDB {
	return db.sessionDB
}

// SaveSession 保存 session 到独立 session 数据库（与主 DB 锁隔离）。
func (db *DB) SaveSession(session *models.Session) error {
	return db.sessionDB.SaveSession(session)
}

// GetSession 从独立 session 数据库读取 session。
func (db *DB) GetSession(token string) (*models.Session, error) {
	return db.sessionDB.GetSession(token)
}

// DeleteSession 从独立 session 数据库删除 session。
func (db *DB) DeleteSession(token string) error {
	return db.sessionDB.DeleteSession(token)
}

// DeleteSessions 在一次事务中撤销所有指定的 session。
func (db *DB) DeleteSessions(tokens ...string) error {
	return db.sessionDB.DeleteSessions(tokens...)
}

// CleanExpiredSessions 清理独立 session 数据库中过期的 session。
func (db *DB) CleanExpiredSessions() error {
	return db.sessionDB.CleanExpiredSessions()
}
