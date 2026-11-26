package services

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"time"

	"z-reader/backend/logger"
)

const (
	diskTTSCleanupMinInterval = 30 * time.Second
	diskTTSTouchMaxInterval   = 10 * time.Minute
)

func diskTTSCachePath(config ttsCacheConfig, key string) string {
	return filepath.Join(config.Dir, key+".audio")
}

func readDiskTTSCache(config ttsCacheConfig, key string) ([]byte, bool) {
	if config.Dir == "" {
		return nil, false
	}

	path := diskTTSCachePath(config, key)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 ||
		info.Size() > int64(config.MaxBytes) || time.Since(info.ModTime()) > config.TTL {
		return nil, false
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer file.Close()
	current, err := file.Stat()
	if err != nil || !os.SameFile(info, current) {
		return nil, false
	}
	data, err := readBoundedBody(file, int64(config.MaxBytes))
	if err != nil || len(data) == 0 {
		return nil, false
	}
	touchInterval := config.TTL / 4
	if touchInterval > diskTTSTouchMaxInterval {
		touchInterval = diskTTSTouchMaxInterval
	}
	if touchInterval <= 0 || time.Since(info.ModTime()) >= touchInterval {
		now := time.Now()
		_ = os.Chtimes(path, now, now)
	}
	return data, true
}

func shouldPersistDiskTTSCache(config ttsCacheConfig, data []byte) bool {
	return config.Dir != "" && len(data) > 0 && len(data) <= config.MaxBytes
}

func writeDiskTTSCacheFile(config ttsCacheConfig, key string, data []byte) error {
	if !shouldPersistDiskTTSCache(config, data) {
		return nil
	}

	tmp, err := os.CreateTemp(config.Dir, ".tts-audio-*")
	if errors.Is(err, os.ErrNotExist) {
		if mkErr := os.MkdirAll(config.Dir, 0700); mkErr != nil {
			return mkErr
		}
		tmp, err = os.CreateTemp(config.Dir, ".tts-audio-*")
	}
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	_, writeErr := tmp.Write(data)
	if err := errors.Join(writeErr, tmp.Close()); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), diskTTSCachePath(config, key))
}

func writeDiskTTSCache(config ttsCacheConfig, key string, data []byte) error {
	if err := writeDiskTTSCacheFile(config, key, data); err != nil {
		return err
	}
	if shouldPersistDiskTTSCache(config, data) {
		cleanupDiskTTSCache(config)
	}
	return nil
}

func (r *ttsRuntimeState) maybeCleanupDiskTTSCache() {
	if r.config.Dir == "" {
		return
	}
	stride := uint64(max(1, r.config.MaxItems/8))
	writes := r.diskWrites.Add(1)

	r.cleanupMu.Lock()
	if r.cleanupRunning {
		r.cleanupMu.Unlock()
		return
	}
	dueByCount := writes%stride == 0
	dueByTime := r.lastCleanup.IsZero() || time.Since(r.lastCleanup) >= diskTTSCleanupMinInterval
	if !dueByCount && !dueByTime {
		r.cleanupMu.Unlock()
		return
	}
	r.cleanupRunning = true
	r.cleanupMu.Unlock()

	defer func() {
		r.cleanupMu.Lock()
		r.lastCleanup = time.Now()
		r.cleanupRunning = false
		r.cleanupMu.Unlock()
	}()

	cleanupDiskTTSCache(r.config)
}

func cleanupDiskTTSCache(config ttsCacheConfig) {
	if config.Dir == "" {
		return
	}

	entries, err := os.ReadDir(config.Dir)
	if err != nil {
		return
	}

	var total int64
	type fileInfo struct {
		path    string
		size    int64
		modTime time.Time
	}
	files := make([]fileInfo, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".audio" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(config.Dir, entry.Name())
		if time.Since(info.ModTime()) > config.TTL {
			removeStaleDiskCache(path)
			continue
		}
		total += info.Size()
		files = append(files, fileInfo{path: path, size: info.Size(), modTime: info.ModTime()})
	}

	if total <= int64(config.MaxBytes) && len(files) <= config.MaxItems {
		return
	}

	// 按修改时间升序排序（最旧的在前），使用 O(n log n) 排序
	slices.SortFunc(files, func(a, b fileInfo) int {
		return a.modTime.Compare(b.modTime)
	})

	for _, file := range files {
		if total <= int64(config.MaxBytes) && len(files) <= config.MaxItems {
			break
		}
		removeStaleDiskCache(file.path)
		total -= file.size
		files = files[1:]
	}
}

func removeStaleDiskCache(path string) {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		logger.Warn("Failed to remove TTS disk cache", "path", path, "error", err)
	}
}
