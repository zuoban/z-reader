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

type backupMetric struct {
	enabled         bool
	intervalSeconds float64
	attempts        uint64
	failures        uint64
	lastSuccessUnix int64
	lastDurationSec float64
}

var backupMetrics struct {
	mu     sync.Mutex
	metric backupMetric
}

// ConfigureBackupSchedule records whether automated backups are enabled and
// their configured interval. It is called once during application startup.
func ConfigureBackupSchedule(interval time.Duration) {
	backupMetrics.mu.Lock()
	backupMetrics.metric.enabled = interval > 0
	backupMetrics.metric.intervalSeconds = interval.Seconds()
	backupMetrics.mu.Unlock()
}

// ObserveBackup records one completed verified-backup attempt. It deliberately
// stores no path, user, or error text in metrics.
func ObserveBackup(elapsed time.Duration, err error) {
	backupMetrics.mu.Lock()
	defer backupMetrics.mu.Unlock()
	backupMetrics.metric.attempts++
	if err != nil {
		backupMetrics.metric.failures++
		return
	}
	backupMetrics.metric.lastSuccessUnix = time.Now().Unix()
	backupMetrics.metric.lastDurationSec = elapsed.Seconds()
}

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

	backupMetrics.mu.Lock()
	backup := backupMetrics.metric
	backupMetrics.mu.Unlock()
	output.WriteString("# HELP z_reader_backup_enabled Whether automated backups are enabled.\n")
	output.WriteString("# TYPE z_reader_backup_enabled gauge\n")
	if backup.enabled {
		output.WriteString("z_reader_backup_enabled 1\n")
	} else {
		output.WriteString("z_reader_backup_enabled 0\n")
	}
	output.WriteString("# HELP z_reader_backup_interval_seconds Configured backup interval.\n")
	output.WriteString("# TYPE z_reader_backup_interval_seconds gauge\n")
	fmt.Fprintf(output, "z_reader_backup_interval_seconds %.0f\n", backup.intervalSeconds)
	output.WriteString("# HELP z_reader_backup_attempts_total Completed backup attempts.\n")
	output.WriteString("# TYPE z_reader_backup_attempts_total counter\n")
	fmt.Fprintf(output, "z_reader_backup_attempts_total %d\n", backup.attempts)
	output.WriteString("# HELP z_reader_backup_failures_total Failed backup attempts.\n")
	output.WriteString("# TYPE z_reader_backup_failures_total counter\n")
	fmt.Fprintf(output, "z_reader_backup_failures_total %d\n", backup.failures)
	output.WriteString("# HELP z_reader_backup_last_success_timestamp_seconds Unix timestamp of the latest verified backup.\n")
	output.WriteString("# TYPE z_reader_backup_last_success_timestamp_seconds gauge\n")
	fmt.Fprintf(output, "z_reader_backup_last_success_timestamp_seconds %d\n", backup.lastSuccessUnix)
	output.WriteString("# HELP z_reader_backup_last_duration_seconds Duration of the latest verified backup.\n")
	output.WriteString("# TYPE z_reader_backup_last_duration_seconds gauge\n")
	fmt.Fprintf(output, "z_reader_backup_last_duration_seconds %.6f\n", backup.lastDurationSec)
}
