package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

// SessionsBucket 是存储 session 的 bbolt bucket 名称
var SessionsBucket = []byte("sessions")

// SessionDB 封装独立的 bbolt 实例，仅存储 session 数据。
// 与主 DB（图书、进度等）分离后，session 验证不再与业务数据争抢 bbolt 全局写锁。
type SessionDB struct {
	*bbolt.DB
}

// OpenSession 打开或创建独立的 session 数据库文件。
func OpenSession(path string) (*SessionDB, error) {
	db, err := bbolt.Open(path, 0600, &bbolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		return nil, err
	}

	sdb := &SessionDB{db}
	if err := sdb.init(); err != nil {
		db.Close()
		return nil, err
	}

	return sdb, nil
}

func (sdb *SessionDB) init() error {
	return sdb.Update(func(tx *bbolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists(SessionsBucket)
		return err
	})
}

// BackupTo writes a consistent snapshot of the independent session database.
func (sdb *SessionDB) BackupTo(path string) error {
	return sdb.View(func(tx *bbolt.Tx) error {
		return tx.CopyFile(path, 0600)
	})
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// SaveSession 保存 session 到独立 session 数据库。
func (sdb *SessionDB) SaveSession(session *models.Session) error {
	return sdb.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		sCopy := *session
		hashed := hashToken(session.Token)
		sCopy.Token = hashed
		data, err := json.Marshal(&sCopy)
		if err != nil {
			return err
		}
		return b.Put([]byte(hashed), data)
	})
}

// GetSession 从独立 session 数据库读取 session（会检查过期）。
func (sdb *SessionDB) GetSession(token string) (*models.Session, error) {
	var session models.Session
	hashed := hashToken(token)
	err := sdb.View(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		data := b.Get([]byte(hashed))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &session)
	})
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	if time.Now().After(session.ExpiresAt) {
		return nil, nil
	}
	return &session, nil
}

// DeleteSession 从独立 session 数据库删除 session。
func (sdb *SessionDB) DeleteSession(token string) error {
	return sdb.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		return b.Delete([]byte(hashToken(token)))
	})
}

// CleanExpiredSessions 清理独立 session 数据库中已过期的 session。
func (sdb *SessionDB) CleanExpiredSessions() error {
	return sdb.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		var toDelete [][]byte
		err := b.ForEach(func(k, v []byte) error {
			var session models.Session
			if err := json.Unmarshal(v, &session); err != nil {
				toDelete = append(toDelete, append([]byte(nil), k...))
				return nil
			}
			if time.Now().After(session.ExpiresAt) {
				toDelete = append(toDelete, append([]byte(nil), k...))
			}
			return nil
		})
		if err != nil {
			return err
		}
		for _, key := range toDelete {
			if err := b.Delete(key); err != nil {
				return err
			}
		}
		return nil
	})
}
