package services

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"z-reader/backend/logger"
)

var ErrTTSBusy = errors.New("tts service is busy")

type ttsInflightCall struct {
	data    []byte
	err     error
	done    chan struct{}
	cancel  context.CancelFunc
	waiters atomic.Int64
	key     string
	ctx     context.Context
}

var ttsInflight struct {
	mutex sync.Mutex
	calls map[string]*ttsInflightCall
}

func callTTSAPIWithCacheContext(ctx context.Context, ssml, outputFormat string) ([]byte, error) {
	return synthesizeTTSAudio(ctx, ssml, outputFormat, false)
}

func synthesizeTTSAudio(ctx context.Context, ssml, outputFormat string, refresh bool) (data []byte, err error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	runtime := getTTSRuntime()
	defer func() { runtime.metrics.recordResult(err) }()
	provider := ActiveTTSProvider()
	key := ttsCacheKey(provider.Name(), ssml, outputFormat)
	if refresh {
		// Share concurrent refreshes without joining a regular request that may
		// still be publishing the audio the client just failed to decode.
		key = "refresh:" + key
	} else {
		if data, ok := runtime.cache.get(key); ok {
			runtime.metrics.recordCache(0, true)
			logger.Info("TTS cache hit", "source", "memory", "key", key, "bytes", len(data))
			return data, nil
		}

		runtime.metrics.recordCache(0, false)
		if data, ok := readDiskTTSCache(runtime.config, key); ok {
			runtime.metrics.recordCache(1, true)
			runtime.cache.set(key, data)
			logger.Info("TTS cache hit", "source", "disk", "key", key, "bytes", len(data))
			return data, nil
		}
		runtime.metrics.recordCache(1, false)
	}
	ttsInflight.mutex.Lock()
	if ttsInflight.calls == nil {
		ttsInflight.calls = make(map[string]*ttsInflightCall)
	}
	if call, ok := ttsInflight.calls[key]; ok && call.ctx.Err() == nil {
		call.waiters.Add(1)
		ttsInflight.mutex.Unlock()
		return waitForTTSCall(ctx, call)
	}

	workCtx, cancel := context.WithTimeout(context.Background(), defaultTTSSynthesisTimeout)
	call := &ttsInflightCall{done: make(chan struct{}), cancel: cancel, key: key, ctx: workCtx}
	call.waiters.Store(1)
	ttsInflight.calls[key] = call
	ttsInflight.mutex.Unlock()

	go func() {
		defer cancel()
		var persistData []byte
		persisting := false
		func() {
			defer func() {
				ttsInflight.mutex.Lock()
				if ttsInflight.calls[key] == call {
					delete(ttsInflight.calls, key)
				}
				ttsInflight.mutex.Unlock()
				close(call.done)
			}()

			logger.Info("TTS cache miss", "key", key, "ssml_bytes", len(ssml))
			call.data, call.err = callTTSAPIThrottled(workCtx, provider, ssml, outputFormat)
			// A browser decode failure can be local to that client. Recovery leaves
			// the shared cache alone and runs under the same synthesis limits.
			if call.err == nil && !refresh {
				runtime.cache.set(key, call.data)
				if shouldPersistDiskTTSCache(runtime.config, call.data) {
					runtime.diskWG.Add(1)
					persisting = true
					persistData = call.data
				}
			}

			logger.Info(
				"TTS request completed",
				"key", key,
				"bytes", len(call.data),
				"waiters", call.waiters.Load(),
				"error", ttsFailureKind(call.err),
			)
		}()

		if persisting {
			defer runtime.diskWG.Done()
			if err := writeDiskTTSCacheFile(runtime.config, key, persistData); err != nil {
				logger.Warn("Failed to write TTS disk cache", "key", key, "error", err)
				return
			}
			runtime.maybeCleanupDiskTTSCache()
		}
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
		ttsInflight.mutex.Lock()
		if call.waiters.Add(-1) == 0 {
			call.cancel()
			if ttsInflight.calls[call.key] == call {
				delete(ttsInflight.calls, call.key)
			}
		}
		ttsInflight.mutex.Unlock()
		return nil, ctx.Err()
	}
}

func callTTSAPIThrottled(ctx context.Context, provider TTSProvider, ssml, outputFormat string) ([]byte, error) {
	runtime := getTTSRuntime()
	queueStart := time.Now()
	release, err := acquireTTSSlotContext(ctx, runtime)
	runtime.metrics.observeQueueWait(time.Since(queueStart))
	if err != nil {
		return nil, err
	}
	defer release()

	start := time.Now()
	defer func() { runtime.metrics.observeSynthesis(time.Since(start)) }()
	data, err := provider.Synthesize(ctx, ssml, outputFormat)
	logger.Info(
		"TTS API call",
		"latency_ms", time.Since(start).Milliseconds(),
		"bytes", len(data),
		"ssml_bytes", len(ssml),
		"error", ttsFailureKind(err),
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

func ttsFailureKind(err error) string {
	if err == nil {
		return ""
	}
	return TTSHTTPError(err).Kind
}
