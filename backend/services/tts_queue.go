package services

import (
	"context"
	"errors"
	"time"

	"z-reader/backend/internal/singleflight"
	"z-reader/backend/logger"
)

var ErrTTSBusy = errors.New("tts service is busy")

var ttsInflight singleflight.Group[[]byte]

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
	var audio []byte
	audio, _, _, err = ttsInflight.DoContext(ctx, key, defaultTTSSynthesisTimeout, func(workCtx context.Context) ([]byte, error) {
		logger.Info("TTS cache miss", "key", key, "ssml_bytes", len(ssml))
		result, synthErr := callTTSAPIThrottled(workCtx, provider, ssml, outputFormat)
		// A browser decode failure can be local to that client. Recovery leaves
		// the shared cache alone and runs under the same synthesis limits.
		if synthErr == nil && !refresh {
			runtime.cache.set(key, result)
			if shouldPersistDiskTTSCache(runtime.config, result) && runtime.tryStartDiskWrite() {
				persisted := result
				go func() {
					defer runtime.diskWG.Done()
					if writeErr := writeDiskTTSCacheFile(runtime.config, key, persisted); writeErr != nil {
						logger.Warn("Failed to write TTS disk cache", "key", key, "error", writeErr)
						return
					}
					runtime.maybeCleanupDiskTTSCache()
				}()
			}
		}

		logger.Info(
			"TTS request completed",
			"key", key,
			"bytes", len(result),
			"waiters", ttsInflight.Waiters(key),
			"error", ttsFailureKind(synthErr),
		)
		return result, synthErr
	})
	if err != nil {
		return nil, err
	}
	return append([]byte(nil), audio...), nil
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
