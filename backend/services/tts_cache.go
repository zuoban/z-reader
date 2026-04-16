package services

import (
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

const (
	ttsAudioCacheMaxBytes = 64 * 1024 * 1024
	ttsAudioCacheMaxItems = 128
	ttsAudioCacheTTL      = 24 * time.Hour
)

type ttsCacheEntry struct {
	key       string
	data      []byte
	size      int
	expiresAt time.Time
}

type ttsAudioCache struct {
	mutex sync.Mutex
	items map[string]*list.Element
	order *list.List
	bytes int
}

var audioCache = &ttsAudioCache{
	items: make(map[string]*list.Element),
	order: list.New(),
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
	if len(data) == 0 || len(data) > ttsAudioCacheMaxBytes {
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
		expiresAt: time.Now().Add(ttsAudioCacheTTL),
	}
	el := c.order.PushFront(entry)
	c.items[key] = el
	c.bytes += entry.size

	for c.bytes > ttsAudioCacheMaxBytes || len(c.items) > ttsAudioCacheMaxItems {
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
	wg   sync.WaitGroup
	data []byte
	err  error
}

var ttsInflight struct {
	mutex sync.Mutex
	calls map[string]*ttsInflightCall
}

func callTTSAPIWithCache(ssml, outputFormat string) ([]byte, error) {
	key := ttsCacheKey(ssml, outputFormat)
	if data, ok := audioCache.get(key); ok {
		return data, nil
	}

	ttsInflight.mutex.Lock()
	if ttsInflight.calls == nil {
		ttsInflight.calls = make(map[string]*ttsInflightCall)
	}
	if call, ok := ttsInflight.calls[key]; ok {
		ttsInflight.mutex.Unlock()
		call.wg.Wait()
		if call.err != nil {
			return nil, call.err
		}
		return append([]byte(nil), call.data...), nil
	}

	call := &ttsInflightCall{}
	call.wg.Add(1)
	ttsInflight.calls[key] = call
	ttsInflight.mutex.Unlock()

	defer func() {
		ttsInflight.mutex.Lock()
		delete(ttsInflight.calls, key)
		ttsInflight.mutex.Unlock()
	}()

	call.data, call.err = callTTSAPI(ssml, outputFormat, false)
	if call.err == nil {
		audioCache.set(key, call.data)
	}
	call.wg.Done()

	if call.err != nil {
		return nil, call.err
	}
	return append([]byte(nil), call.data...), nil
}
