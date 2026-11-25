package services

import (
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
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
	defaultTTSSynthesisTimeout   = 55 * time.Second
)

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
	metrics   ttsMetrics

	diskWG         sync.WaitGroup
	diskWrites     atomic.Uint64
	cleanupMu      sync.Mutex
	cleanupRunning bool
	lastCleanup    time.Time
}

func (r *ttsRuntimeState) waitDiskWrites() {
	r.diskWG.Wait()
}

func (r *ttsRuntimeState) waitDiskWritesContext(ctx context.Context) error {
	if ctx == nil {
		r.diskWG.Wait()
		return nil
	}
	done := make(chan struct{})
	go func() {
		r.diskWG.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

var ttsRuntime struct {
	once  sync.Once
	state atomic.Pointer[ttsRuntimeState]
}

func getTTSRuntime() *ttsRuntimeState {
	ttsRuntime.once.Do(func() {
		config := loadTTSCacheConfig()
		state := newTTSRuntimeState(config)
		ttsRuntime.state.Store(state)
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
	return ttsRuntime.state.Load()
}

// WaitTTSDiskWrites waits for any in-flight background TTS disk cache writes to
// finish, bounded by ctx. If the TTS runtime has not been initialized, it
// returns nil immediately without initializing the runtime.
func WaitTTSDiskWrites(ctx context.Context) error {
	runtime := ttsRuntime.state.Load()
	if runtime == nil {
		return nil
	}
	return runtime.waitDiskWritesContext(ctx)
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

func ttsCacheKey(providerName, ssml, outputFormat string) string {
	sum := sha256.Sum256([]byte(providerName + "\x00" + outputFormat + "\x00" + ssml))
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
