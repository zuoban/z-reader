package services

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Buckets and labels are fixed so content and provider identifiers never affect cardinality.
var ttsDurationBuckets = [...]float64{0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30, 55}

type ttsHistogram struct {
	buckets [len(ttsDurationBuckets)]uint64
	count   uint64
	sum     float64
}

func (h *ttsHistogram) observe(seconds float64) {
	h.count++
	h.sum += seconds
	for i, boundary := range ttsDurationBuckets {
		if seconds <= boundary {
			h.buckets[i]++
		}
	}
}

type ttsMetrics struct {
	mutex     sync.Mutex
	cache     [2][2]uint64
	results   [4]uint64
	queueWait ttsHistogram
	synthesis ttsHistogram
}

func (m *ttsMetrics) recordCache(layer int, hit bool) {
	result := 1
	if hit {
		result = 0
	}
	m.mutex.Lock()
	m.cache[layer][result]++
	m.mutex.Unlock()
}

func (m *ttsMetrics) recordResult(err error) {
	result := 0
	if errors.Is(err, context.Canceled) {
		result = 2
	} else if errors.Is(err, ErrTTSBusy) {
		result = 3
	} else if err != nil {
		result = 1
	}
	m.mutex.Lock()
	m.results[result]++
	m.mutex.Unlock()
}

func (m *ttsMetrics) observeQueueWait(duration time.Duration) {
	m.mutex.Lock()
	m.queueWait.observe(duration.Seconds())
	m.mutex.Unlock()
}

func (m *ttsMetrics) observeSynthesis(duration time.Duration) {
	m.mutex.Lock()
	m.synthesis.observe(duration.Seconds())
	m.mutex.Unlock()
}

func appendTTSHistogram(output *strings.Builder, name, help string, histogram ttsHistogram) {
	fmt.Fprintf(output, "# HELP %s %s\n# TYPE %s histogram\n", name, help, name)
	for i, boundary := range ttsDurationBuckets {
		fmt.Fprintf(output, "%s_bucket{le=%q} %d\n", name, strconv.FormatFloat(boundary, 'g', -1, 64), histogram.buckets[i])
	}
	fmt.Fprintf(output, "%s_bucket{le=\"+Inf\"} %d\n", name, histogram.count)
	fmt.Fprintf(output, "%s_sum %s\n%s_count %d\n", name, strconv.FormatFloat(histogram.sum, 'g', -1, 64), name, histogram.count)
}

// TTSQueueMetrics is a point-in-time view of the bounded TTS synthesis queue.
// It contains configuration and aggregate work counts only.
type TTSQueueMetrics struct {
	Active           int
	Queued           int
	QueueCapacity    int
	ConcurrencyLimit int
}

func ttsQueueMetrics(runtime *ttsRuntimeState) TTSQueueMetrics {
	active := len(runtime.semaphore)
	queued := max(0, len(runtime.queue)-active)
	return TTSQueueMetrics{
		Active:           active,
		Queued:           queued,
		QueueCapacity:    runtime.config.MaxQueued,
		ConcurrencyLimit: runtime.config.MaxConcurrent,
	}
}

// TTSQueueMetricsSnapshot returns false until TTS has been used for the first
// time. Reading metrics must not initialize the runtime or create its cache.
func TTSQueueMetricsSnapshot() (TTSQueueMetrics, bool) {
	runtime := ttsRuntime.state.Load()
	if runtime == nil {
		return TTSQueueMetrics{}, false
	}
	return ttsQueueMetrics(runtime), true
}

// AppendTTSPrometheus adds TTS queue gauges when the TTS runtime is active.
func AppendTTSPrometheus(output *strings.Builder) {
	runtime := ttsRuntime.state.Load()
	if runtime == nil {
		return
	}
	metrics := ttsQueueMetrics(runtime)

	output.WriteString("# HELP z_reader_tts_active_syntheses Active TTS syntheses.\n")
	output.WriteString("# TYPE z_reader_tts_active_syntheses gauge\n")
	fmt.Fprintf(output, "z_reader_tts_active_syntheses %d\n", metrics.Active)
	output.WriteString("# HELP z_reader_tts_queue_depth TTS requests waiting for a synthesis slot.\n")
	output.WriteString("# TYPE z_reader_tts_queue_depth gauge\n")
	fmt.Fprintf(output, "z_reader_tts_queue_depth %d\n", metrics.Queued)
	output.WriteString("# HELP z_reader_tts_queue_capacity Configured TTS queue capacity.\n")
	output.WriteString("# TYPE z_reader_tts_queue_capacity gauge\n")
	fmt.Fprintf(output, "z_reader_tts_queue_capacity %d\n", metrics.QueueCapacity)
	output.WriteString("# HELP z_reader_tts_concurrency_limit Configured concurrent TTS synthesis limit.\n")
	output.WriteString("# TYPE z_reader_tts_concurrency_limit gauge\n")
	fmt.Fprintf(output, "z_reader_tts_concurrency_limit %d\n", metrics.ConcurrencyLimit)
	runtime.metrics.mutex.Lock()
	cache, results := runtime.metrics.cache, runtime.metrics.results
	queueWait, synthesis := runtime.metrics.queueWait, runtime.metrics.synthesis
	runtime.metrics.mutex.Unlock()
	output.WriteString("# HELP z_reader_tts_cache_requests_total TTS cache lookups by layer and result.\n")
	output.WriteString("# TYPE z_reader_tts_cache_requests_total counter\n")
	for layer, layerName := range []string{"memory", "disk"} {
		for result, resultName := range []string{"hit", "miss"} {
			fmt.Fprintf(output, "z_reader_tts_cache_requests_total{layer=%q,result=%q} %d\n", layerName, resultName, cache[layer][result])
		}
	}
	output.WriteString("# HELP z_reader_tts_requests_total Completed TTS callers including cache hits and shared waiters.\n")
	output.WriteString("# TYPE z_reader_tts_requests_total counter\n")
	for i, result := range []string{"success", "failure", "cancelled", "busy"} {
		fmt.Fprintf(output, "z_reader_tts_requests_total{result=%q} %d\n", result, results[i])
	}
	appendTTSHistogram(output, "z_reader_tts_queue_wait_seconds", "Time waiting for a synthesis slot, including rejected or cancelled work.", queueWait)
	appendTTSHistogram(output, "z_reader_tts_synthesis_duration_seconds", "Synthesis duration including endpoint refresh, excluding queue wait and cache hits.", synthesis)
}
