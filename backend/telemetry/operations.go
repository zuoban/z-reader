// Package telemetry records low-cardinality operation metrics without adding a
// metrics SDK dependency. It deliberately accepts only fixed operation names.
package telemetry

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

var durationBuckets = []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10}

type operationMetric struct {
	count        uint64
	durationSec  float64
	items        uint64
	bucketCounts []uint64
}

var operations = struct {
	mu    sync.Mutex
	items map[string]*operationMetric
}{items: make(map[string]*operationMetric)}

// Observe records an operation's elapsed time and its bounded work-unit count
// (for example, candidate records considered by a search).
func Observe(name string, elapsed time.Duration, itemCount int) {
	if name == "" {
		return
	}
	seconds := elapsed.Seconds()
	operations.mu.Lock()
	defer operations.mu.Unlock()
	metric := operations.items[name]
	if metric == nil {
		metric = &operationMetric{bucketCounts: make([]uint64, len(durationBuckets))}
		operations.items[name] = metric
	}
	metric.count++
	metric.durationSec += seconds
	if itemCount > 0 {
		metric.items += uint64(itemCount)
	}
	for index, upperBound := range durationBuckets {
		if seconds <= upperBound {
			metric.bucketCounts[index]++
		}
	}
}

// AppendPrometheus writes operation counters and latency histograms. It uses
// stable names and labels only, never book, user, query, or file identifiers.
func AppendPrometheus(output *strings.Builder) {
	type row struct {
		name   string
		metric operationMetric
	}
	operations.mu.Lock()
	rows := make([]row, 0, len(operations.items))
	for name, metric := range operations.items {
		rows = append(rows, row{name: name, metric: operationMetric{
			count:        metric.count,
			durationSec:  metric.durationSec,
			items:        metric.items,
			bucketCounts: append([]uint64(nil), metric.bucketCounts...),
		}})
	}
	operations.mu.Unlock()
	sort.Slice(rows, func(i, j int) bool { return rows[i].name < rows[j].name })

	output.WriteString("# HELP z_reader_operation_duration_seconds Operation execution latency.\n")
	output.WriteString("# TYPE z_reader_operation_duration_seconds histogram\n")
	output.WriteString("# HELP z_reader_operation_items_total Work units processed by operations.\n")
	output.WriteString("# TYPE z_reader_operation_items_total counter\n")
	for _, row := range rows {
		for index, upperBound := range durationBuckets {
			fmt.Fprintf(
				output,
				"z_reader_operation_duration_seconds_bucket{operation=%q,le=%q} %d\n",
				row.name,
				fmt.Sprintf("%g", upperBound),
				row.metric.bucketCounts[index],
			)
		}
		fmt.Fprintf(
			output,
			"z_reader_operation_duration_seconds_bucket{operation=%q,le=\"+Inf\"} %d\n",
			row.name,
			row.metric.count,
		)
		fmt.Fprintf(output, "z_reader_operation_duration_seconds_sum{operation=%q} %.6f\n", row.name, row.metric.durationSec)
		fmt.Fprintf(output, "z_reader_operation_duration_seconds_count{operation=%q} %d\n", row.name, row.metric.count)
		fmt.Fprintf(output, "z_reader_operation_items_total{operation=%q} %d\n", row.name, row.metric.items)
	}
}
