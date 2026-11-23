package telemetry

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestAppendPrometheusReportsBackupState(t *testing.T) {
	ConfigureBackupSchedule(24 * time.Hour)
	ObserveBackup(20*time.Millisecond, nil)
	ObserveBackup(10*time.Millisecond, errors.New("write failed"))

	var output strings.Builder
	AppendPrometheus(&output)
	body := output.String()
	for _, expected := range []string{
		"z_reader_backup_enabled 1",
		"z_reader_backup_interval_seconds 86400",
		"z_reader_backup_attempts_total 2",
		"z_reader_backup_failures_total 1",
		"z_reader_backup_last_duration_seconds 0.020000",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected metric %q in output: %s", expected, body)
		}
	}
	if strings.Contains(body, "z_reader_backup_last_success_timestamp_seconds 0") {
		t.Fatalf("expected successful backup timestamp, got %s", body)
	}
}

func TestRecordExistingBackupOnlySeedsWhenUnset(t *testing.T) {
	backupMetrics.mu.Lock()
	previous := backupMetrics.metric
	backupMetrics.metric = backupMetric{}
	backupMetrics.mu.Unlock()
	t.Cleanup(func() {
		backupMetrics.mu.Lock()
		backupMetrics.metric = previous
		backupMetrics.mu.Unlock()
	})

	seeded := time.Unix(1700000000, 0).UTC()
	RecordExistingBackup(seeded)
	RecordExistingBackup(time.Unix(1800000000, 0).UTC())

	backupMetrics.mu.Lock()
	got := backupMetrics.metric.lastSuccessUnix
	backupMetrics.mu.Unlock()
	if got != seeded.Unix() {
		t.Fatalf("lastSuccessUnix = %d, want %d", got, seeded.Unix())
	}
}
