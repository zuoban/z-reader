package storage

import "sync"

type uploadSnapshots struct {
	mu      sync.Mutex
	active  int
	pending []func()
}

// WithUploadFilesRetained defers cleanup of published uploads from before the
// database snapshot starts until the backup has copied its referenced files.
func (db *DB) WithUploadFilesRetained(capture func() error) error {
	snapshots := &db.uploadSnapshots
	snapshots.mu.Lock()
	snapshots.active++
	snapshots.mu.Unlock()
	defer snapshots.release()
	return capture()
}

// CleanupUnreferencedUploads runs cleanup after any active upload snapshots.
// Call only after committing the removal of the references. Published paths
// must never be reused, so a later snapshot cannot need a queued removal.
func (db *DB) CleanupUnreferencedUploads(cleanup func()) {
	snapshots := &db.uploadSnapshots
	snapshots.mu.Lock()
	if snapshots.active > 0 {
		snapshots.pending = append(snapshots.pending, cleanup)
		snapshots.mu.Unlock()
		return
	}
	snapshots.mu.Unlock()
	cleanup()
}

func (snapshots *uploadSnapshots) release() {
	snapshots.mu.Lock()
	snapshots.active--
	if snapshots.active > 0 {
		snapshots.mu.Unlock()
		return
	}
	pending := snapshots.pending
	snapshots.pending = nil
	snapshots.mu.Unlock()
	for _, cleanup := range pending {
		cleanup()
	}
}
