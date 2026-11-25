package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

// SessionsBucket 是存储 session 的 bbolt bucket 名称
var SessionsBucket = []byte("sessions")

const maxSessionCacheEntries = 256

// SessionDB 封装独立的 bbolt 实例，仅存储 session 数据。
// 与主 DB（图书、进度等）分离后，session 验证不再与业务数据争抢 bbolt 全局写锁。
type SessionDB struct {
	*bbolt.DB
	cacheMu             sync.RWMutex
	cache               map[string]models.Session
	cacheEpoch          uint64
	beforeCacheFillHook func()
}

// OpenSession 打开或创建独立的 session 数据库文件。
func OpenSession(path string) (*SessionDB, error) {
	db, err := bbolt.Open(path, 0600, &bbolt.Options{
		Timeout:      1 * time.Second,
		FreelistType: bbolt.FreelistMapType,
	})
	if err != nil {
		return nil, err
	}

	sdb := &SessionDB{
		DB:    db,
		cache: make(map[string]models.Session),
	}
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

func (sdb *SessionDB) cachePutLocked(hashed string, session models.Session, now time.Time) {
	if sdb.cache == nil {
		sdb.cache = make(map[string]models.Session)
	}
	if now.After(session.ExpiresAt) {
		delete(sdb.cache, hashed)
		return
	}
	if _, exists := sdb.cache[hashed]; !exists && len(sdb.cache) >= maxSessionCacheEntries {
		for key, entry := range sdb.cache {
			if now.After(entry.ExpiresAt) {
				delete(sdb.cache, key)
			}
		}
		if len(sdb.cache) >= maxSessionCacheEntries {
			clear(sdb.cache)
		}
	}
	sdb.cache[hashed] = session
}

func (sdb *SessionDB) cachePutIfEpoch(hashed string, session models.Session, now time.Time, epoch uint64) {
	sdb.cacheMu.Lock()
	defer sdb.cacheMu.Unlock()
	if sdb.cacheEpoch != epoch {
		return
	}
	sdb.cachePutLocked(hashed, session, now)
}

// SaveSession 保存 session 到独立 session 数据库。
func (sdb *SessionDB) SaveSession(session *models.Session) error {
	sCopy := *session
	hashed := hashToken(session.Token)
	sCopy.Token = hashed
	sdb.cacheMu.RLock()
	epoch := sdb.cacheEpoch
	sdb.cacheMu.RUnlock()
	err := sdb.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		data, err := json.Marshal(&sCopy)
		if err != nil {
			return err
		}
		return b.Put([]byte(hashed), data)
	})
	if err != nil {
		return err
	}
	sdb.cachePutIfEpoch(hashed, sCopy, time.Now(), epoch)
	return nil
}

// GetSession 从独立 session 数据库读取 session（会检查过期）。
func (sdb *SessionDB) GetSession(token string) (*models.Session, error) {
	var session models.Session
	hashed := hashToken(token)
	now := time.Now()

	sdb.cacheMu.RLock()
	cached, ok := sdb.cache[hashed]
	epoch := sdb.cacheEpoch
	hook := sdb.beforeCacheFillHook
	sdb.cacheMu.RUnlock()
	if ok {
		if !now.After(cached.ExpiresAt) {
			return &cached, nil
		}
		sdb.cacheMu.Lock()
		if current, stillPresent := sdb.cache[hashed]; stillPresent {
			if !now.After(current.ExpiresAt) {
				sdb.cacheMu.Unlock()
				return &current, nil
			}
			delete(sdb.cache, hashed)
			sdb.cacheEpoch++
		}
		sdb.cacheMu.Unlock()
		return nil, nil
	}

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
	if hook != nil {
		hook()
	}
	now = time.Now()
	if now.After(session.ExpiresAt) {
		return nil, nil
	}
	sdb.cachePutIfEpoch(hashed, session, now, epoch)
	return &session, nil
}

// DeleteSession 从独立 session 数据库删除 session。
func (sdb *SessionDB) DeleteSession(token string) error {
	return sdb.DeleteSessions(token)
}

// DeleteSessions 在一次事务中撤销所有指定的 session。
func (sdb *SessionDB) DeleteSessions(tokens ...string) error {
	hashedTokens := make([]string, len(tokens))
	for i, token := range tokens {
		hashedTokens[i] = hashToken(token)
	}
	err := sdb.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		for _, hashed := range hashedTokens {
			if err := b.Delete([]byte(hashed)); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	sdb.cacheMu.Lock()
	if len(hashedTokens) > 0 {
		sdb.cacheEpoch++
		for _, hashed := range hashedTokens {
			delete(sdb.cache, hashed)
		}
	}
	sdb.cacheMu.Unlock()
	return nil
}

// ClearSessions invalidates all sessions in one transaction.
func (sdb *SessionDB) ClearSessions() error {
	err := sdb.Update(func(tx *bbolt.Tx) error {
		if err := tx.DeleteBucket(SessionsBucket); err != nil {
			return err
		}
		_, err := tx.CreateBucket(SessionsBucket)
		return err
	})
	if err != nil {
		return err
	}
	sdb.cacheMu.Lock()
	sdb.cacheEpoch++
	clear(sdb.cache)
	sdb.cacheMu.Unlock()
	return nil
}

// CleanExpiredSessions 清理独立 session 数据库中已过期的 session。
func (sdb *SessionDB) CleanExpiredSessions() error {
	now := time.Now()
	deletedFromDB := false
	err := sdb.Update(func(tx *bbolt.Tx) error {
		b := tx.Bucket(SessionsBucket)
		var toDelete [][]byte
		err := b.ForEach(func(k, v []byte) error {
			var session models.Session
			if err := json.Unmarshal(v, &session); err != nil {
				toDelete = append(toDelete, append([]byte(nil), k...))
				return nil
			}
			if now.After(session.ExpiresAt) {
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
		deletedFromDB = len(toDelete) > 0
		return nil
	})
	if err != nil {
		return err
	}
	sdb.cacheMu.Lock()
	deletedFromCache := false
	for key, entry := range sdb.cache {
		if now.After(entry.ExpiresAt) {
			delete(sdb.cache, key)
			deletedFromCache = true
		}
	}
	if deletedFromDB || deletedFromCache {
		sdb.cacheEpoch++
	}
	sdb.cacheMu.Unlock()
	return nil
}
