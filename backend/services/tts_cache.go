package services

import (
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"z-reader/backend/logger"
)

const (
	defaultTTSAudioCacheMaxBytes = 64 * 1024 * 1024
	defaultTTSAudioCacheMaxItems = 128
	defaultTTSAudioCacheTTL      = 24 * time.Hour
	defaultTTSMaxConcurrency     = 3
	defaultTTSMaxQueued          = 12
	defaultTTSQueueWait          = 30 * time.Second
)

var ErrTTSBusy = errors.New("tts service is busy")

type ttsCacheConfig struct {
	MaxBytes      int
	MaxItems      int
	TTL           time.Duration
	Dir           string
	MaxConcurrent int
	MaxQueued     int
	QueueWait     time.Duration
}

type ttsCacheEntry struct {
	key       string
	data      []byte
	size      int
	expiresAt time.Time
}

type ttsAudioCache struct {
	mutex  sync.Mutex
	items  map[string]*list.Element
	order  *list.List
	bytes  int
	config ttsCacheConfig
}

type ttsRuntimeState struct {
	config    ttsCacheConfig
	cache     *ttsAudioCache
	semaphore chan struct{}
	queue     chan struct{}
}

var ttsRuntime struct {
	once  sync.Once
	state *ttsRuntimeState
}

func getTTSRuntime() *ttsRuntimeState {
	ttsRuntime.once.Do(func() {
		config := loadTTSCacheConfig()
		ttsRuntime.state = newTTSRuntimeState(config)
		logger.Info(
			"TTS cache configured",
			"dir", config.Dir,
			"max_bytes", config.MaxBytes,
			"max_items", config.MaxItems,
			"ttl_seconds", int(config.TTL.Seconds()),
			"max_concurrency", config.MaxConcurrent,
			"max_queued", config.MaxQueued,
			"queue_wait_seconds", int(config.QueueWait.Seconds()),
		)
	})
	return ttsRuntime.state
}

func newTTSRuntimeState(config ttsCacheConfig) *ttsRuntimeState {
	if config.MaxConcurrent <= 0 {
		config.MaxConcurrent = defaultTTSMaxConcurrency
	}
	if config.MaxQueued <= 0 {
		config.MaxQueued = defaultTTSMaxQueued
	}
	if config.QueueWait <= 0 {
		config.QueueWait = defaultTTSQueueWait
	}
	return &ttsRuntimeState{
		config:    config,
		cache:     newTTSAudioCache(config),
		semaphore: make(chan struct{}, config.MaxConcurrent),
		queue:     make(chan struct{}, config.MaxConcurrent+config.MaxQueued),
	}
}

func loadTTSCacheConfig() ttsCacheConfig {
	return ttsCacheConfig{
		MaxBytes:      getEnvInt("TTS_CACHE_MAX_BYTES", defaultTTSAudioCacheMaxBytes),
		MaxItems:      getEnvInt("TTS_CACHE_MAX_ITEMS", defaultTTSAudioCacheMaxItems),
		TTL:           getEnvDurationSeconds("TTS_CACHE_TTL_SECONDS", defaultTTSAudioCacheTTL),
		Dir:           getEnvString("TTS_CACHE_DIR", filepath.Join(".", "data", "tts-cache")),
		MaxConcurrent: getEnvInt("TTS_MAX_CONCURRENCY", defaultTTSMaxConcurrency),
		MaxQueued:     getEnvInt("TTS_MAX_QUEUED", defaultTTSMaxQueued),
		QueueWait:     getEnvDurationSeconds("TTS_QUEUE_WAIT_SECONDS", defaultTTSQueueWait),
	}
}

func newTTSAudioCache(config ttsCacheConfig) *ttsAudioCache {
	if config.MaxBytes <= 0 {
		config.MaxBytes = defaultTTSAudioCacheMaxBytes
	}
	if config.MaxItems <= 0 {
		config.MaxItems = defaultTTSAudioCacheMaxItems
	}
	if config.TTL <= 0 {
		config.TTL = defaultTTSAudioCacheTTL
	}
	return &ttsAudioCache{
		items:  make(map[string]*list.Element),
		order:  list.New(),
		config: config,
	}
}

func getEnvString(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func getEnvDurationSeconds(key string, fallback time.Duration) time.Duration {
	seconds := getEnvInt(key, int(fallback.Seconds()))
	return time.Duration(seconds) * time.Second
}

func ttsCacheKey(ssml, outputFormat string) string {
	sum := sha256.Sum256([]byte(outputFormat + "\x00" + ssml))
	return hex.EncodeToString(sum[:])
}

func (c *ttsAudioCache) get(key string) ([]byte, bool) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	el, ok := c.items[key]
	if !ok {
		return nil, false
	}

	entry := el.Value.(*ttsCacheEntry)
	if time.Now().After(entry.expiresAt) {
		c.removeElement(el)
		return nil, false
	}

	c.order.MoveToFront(el)
	return append([]byte(nil), entry.data...), true
}

func (c *ttsAudioCache) set(key string, data []byte) {
	if len(data) == 0 || len(data) > c.config.MaxBytes {
		return
	}

	c.mutex.Lock()
	defer c.mutex.Unlock()

	if el, ok := c.items[key]; ok {
		c.removeElement(el)
	}

	copied := append([]byte(nil), data...)
	entry := &ttsCacheEntry{
		key:       key,
		data:      copied,
		size:      len(copied),
		expiresAt: time.Now().Add(c.config.TTL),
	}
	el := c.order.PushFront(entry)
	c.items[key] = el
	c.bytes += entry.size

	for c.bytes > c.config.MaxBytes || len(c.items) > c.config.MaxItems {
		oldest := c.order.Back()
		if oldest == nil {
			break
		}
		c.removeElement(oldest)
	}
}

func (c *ttsAudioCache) removeElement(el *list.Element) {
	entry := el.Value.(*ttsCacheEntry)
	delete(c.items, entry.key)
	c.bytes -= entry.size
	c.order.Remove(el)
}

type ttsInflightCall struct {
	data    []byte
	err     error
	done    chan struct{}
	cancel  context.CancelFunc
	waiters atomic.Int64
}

var ttsInflight struct {
	mutex sync.Mutex
	calls map[string]*ttsInflightCall
}

func callTTSAPIWithCache(ssml, outputFormat string) ([]byte, error) {
	return callTTSAPIWithCacheContext(context.Background(), ssml, outputFormat)
}

func callTTSAPIWithCacheContext(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	runtime := getTTSRuntime()
	key := ttsCacheKey(ssml, outputFormat)
	if data, ok := runtime.cache.get(key); ok {
		logger.Info("TTS cache hit", "source", "memory", "key", key, "bytes", len(data))
		return data, nil
	}

	if data, ok := readDiskTTSCache(runtime.config, key); ok {
		runtime.cache.set(key, data)
		logger.Info("TTS cache hit", "source", "disk", "key", key, "bytes", len(data))
		return data, nil
	}

	ttsInflight.mutex.Lock()
	if ttsInflight.calls == nil {
		ttsInflight.calls = make(map[string]*ttsInflightCall)
	}
	if call, ok := ttsInflight.calls[key]; ok {
		call.waiters.Add(1)
		ttsInflight.mutex.Unlock()
		return waitForTTSCall(ctx, call)
	}

	workCtx, cancel := context.WithCancel(context.Background())
	call := &ttsInflightCall{done: make(chan struct{}), cancel: cancel}
	call.waiters.Store(1)
	ttsInflight.calls[key] = call
	ttsInflight.mutex.Unlock()

	go func() {
		defer cancel()
		defer func() {
			ttsInflight.mutex.Lock()
			delete(ttsInflight.calls, key)
			ttsInflight.mutex.Unlock()
			close(call.done)
		}()

		logger.Info("TTS cache miss", "key", key, "ssml_bytes", len(ssml), "output_format", outputFormat)
		call.data, call.err = callTTSAPIThrottled(workCtx, ssml, outputFormat)
		if call.err == nil {
			runtime.cache.set(key, call.data)
			if err := writeDiskTTSCache(runtime.config, key, call.data); err != nil {
				logger.Warn("Failed to write TTS disk cache", "key", key, "error", err)
			}
		}

		logger.Info(
			"TTS request completed",
			"key", key,
			"bytes", len(call.data),
			"waiters", call.waiters.Load(),
			"error", errorString(call.err),
		)
	}()

	return waitForTTSCall(ctx, call)
}

func waitForTTSCall(ctx context.Context, call *ttsInflightCall) ([]byte, error) {
	select {
	case <-call.done:
		if call.err != nil {
			return nil, call.err
		}
		return append([]byte(nil), call.data...), nil
	case <-ctx.Done():
		if call.waiters.Add(-1) == 0 {
			call.cancel()
		}
		return nil, ctx.Err()
	}
}

func callTTSAPIThrottled(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	runtime := getTTSRuntime()
	release, err := acquireTTSSlotContext(ctx, runtime)
	if err != nil {
		return nil, err
	}
	defer release()

	start := time.Now()
	data, err := callTTSAPI(ctx, ssml, outputFormat, false)
	logger.Info(
		"TTS API call",
		"latency_ms", time.Since(start).Milliseconds(),
		"bytes", len(data),
		"ssml_bytes", len(ssml),
		"output_format", outputFormat,
		"error", errorString(err),
	)
	return data, err
}

func acquireTTSSlot(runtime *ttsRuntimeState) (func(), error) {
	return acquireTTSSlotContext(context.Background(), runtime)
}

func acquireTTSSlotContext(ctx context.Context, runtime *ttsRuntimeState) (func(), error) {
	select {
	case runtime.queue <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
		return nil, ErrTTSBusy
	}

	timer := time.NewTimer(runtime.config.QueueWait)
	defer timer.Stop()
	select {
	case runtime.semaphore <- struct{}{}:
		return func() {
			<-runtime.semaphore
			<-runtime.queue
		}, nil
	case <-timer.C:
		<-runtime.queue
		return nil, ErrTTSBusy
	case <-ctx.Done():
		<-runtime.queue
		return nil, ctx.Err()
	}
}

func IsTTSBusy(err error) bool {
	return errors.Is(err, ErrTTSBusy)
}

func diskTTSCachePath(config ttsCacheConfig, key string) string {
	return filepath.Join(config.Dir, key+".audio")
}

func readDiskTTSCache(config ttsCacheConfig, key string) ([]byte, bool) {
	if config.Dir == "" {
		return nil, false
	}

	path := diskTTSCachePath(config, key)
	info, err := os.Stat(path)
	if err != nil {
		return nil, false
	}
	if info.Size() <= 0 || info.Size() > int64(config.MaxBytes) {
		removeStaleDiskCache(path)
		return nil, false
	}
	if time.Since(info.ModTime()) > config.TTL {
		removeStaleDiskCache(path)
		return nil, false
	}

	data, err := os.ReadFile(path)
	if err != nil {
		logger.Warn("Failed to read TTS disk cache", "key", key, "error", err)
		return nil, false
	}
	_ = os.Chtimes(path, time.Now(), time.Now())
	return data, true
}

func writeDiskTTSCache(config ttsCacheConfig, key string, data []byte) error {
	if config.Dir == "" || len(data) == 0 || len(data) > config.MaxBytes {
		return nil
	}

	if err := os.MkdirAll(config.Dir, 0700); err != nil {
		return err
	}

	path := diskTTSCachePath(config, key)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}

	cleanupDiskTTSCache(config)
	return nil
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
	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime.Before(files[j].modTime)
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

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
