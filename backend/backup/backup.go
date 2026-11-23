package backup

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"z-reader/backend/storage"
)

const manifestName = "manifest.json"

type Config struct {
	Dir           string
	UploadDir     string
	RetentionDays int
}

// RestoreConfig identifies a new, empty application data location to restore
// into. Restore refuses to overwrite existing files so an operator cannot
// accidentally replace a running library.
type RestoreConfig struct {
	DBPath    string
	UploadDir string
}

type Manifest struct {
	CreatedAt time.Time         `json:"created_at"`
	Files     map[string]string `json:"files"`
}

// Create writes an online database snapshot and a copy of uploaded files into
// an atomically-published backup directory, then verifies its checksums.
func Create(db *storage.DB, config Config) (string, error) {
	return create(db, config, copySnapshotUploads)
}

func create(db *storage.DB, config Config, copyUploads func(snapshot, source, destination string) error) (string, error) {
	if config.Dir == "" {
		return "", fmt.Errorf("backup directory is required")
	}
	if config.UploadDir == "" {
		return "", fmt.Errorf("upload directory is required")
	}
	if err := os.MkdirAll(config.Dir, 0700); err != nil {
		return "", err
	}

	createdAt := time.Now().UTC()
	name := "backup-" + createdAt.Format("20060102T150405.000000000Z")
	temporaryDir, err := os.MkdirTemp(config.Dir, "."+name+"-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(temporaryDir)

	snapshot := filepath.Join(temporaryDir, "data.db")
	if err := db.WithUploadFilesRetained(func() error {
		if err := db.BackupTo(snapshot); err != nil {
			return fmt.Errorf("snapshot main database: %w", err)
		}
		if err := copyUploads(snapshot, config.UploadDir, filepath.Join(temporaryDir, "uploads")); err != nil {
			return fmt.Errorf("copy snapshot uploads: %w", err)
		}
		return nil
	}); err != nil {
		return "", err
	}
	if err := db.SessionBackupTo(filepath.Join(temporaryDir, "data.db.sessions")); err != nil {
		return "", fmt.Errorf("snapshot session database: %w", err)
	}

	manifest, err := buildManifest(temporaryDir, createdAt)
	if err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(temporaryDir, manifestName), data, 0600); err != nil {
		return "", err
	}
	if err := Verify(temporaryDir); err != nil {
		return "", fmt.Errorf("verify created backup: %w", err)
	}

	finalDir := filepath.Join(config.Dir, name)
	if err := os.Rename(temporaryDir, finalDir); err != nil {
		return "", err
	}
	if err := removeExpired(config.Dir, config.RetentionDays); err != nil {
		return "", err
	}
	return finalDir, nil
}

// Verify checks the manifest digests, opens both database snapshots in
// read-only mode, and checks that all referenced uploads are in the manifest.
func Verify(path string) error {
	data, err := os.ReadFile(filepath.Join(path, manifestName))
	if err != nil {
		return err
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return err
	}
	if manifest.CreatedAt.IsZero() || len(manifest.Files) == 0 {
		return fmt.Errorf("invalid backup manifest")
	}
	for relativePath, expected := range manifest.Files {
		if !safeRelativePath(relativePath) {
			return fmt.Errorf("unsafe manifest path %q", relativePath)
		}
		actual, err := fileSHA256(filepath.Join(path, relativePath))
		if err != nil {
			return err
		}
		if actual != expected {
			return fmt.Errorf("checksum mismatch for %s", relativePath)
		}
	}
	uploads, err := os.Lstat(filepath.Join(path, "uploads"))
	if err != nil {
		return fmt.Errorf("open snapshot uploads: %w", err)
	}
	if !uploads.IsDir() {
		return fmt.Errorf("snapshot uploads is not a directory")
	}
	if err := visitSnapshotUploads(filepath.Join(path, "data.db"), func(name string) error {
		relativePath := filepath.Join("uploads", name)
		if _, ok := manifest.Files[filepath.ToSlash(relativePath)]; !ok {
			return fmt.Errorf("%s is missing from the manifest", relativePath)
		}
		return nil
	}); err != nil {
		return err
	}
	sessions, err := openSnapshot(filepath.Join(path, "data.db.sessions"))
	if err != nil {
		return err
	}
	return sessions.Close()
}

// Restore verifies a backup and copies it into an empty application data
// location. The application must be stopped before its restored files are
// used. Existing targets are rejected rather than overwritten.
func Restore(source string, config RestoreConfig) error {
	if config.DBPath == "" {
		return fmt.Errorf("database path is required")
	}
	if config.UploadDir == "" {
		return fmt.Errorf("upload directory is required")
	}
	if err := Verify(source); err != nil {
		return fmt.Errorf("verify backup before restore: %w", err)
	}

	mainDBPath := filepath.Clean(config.DBPath)
	sessionDBPath := mainDBPath + ".sessions"
	uploadDir := filepath.Clean(config.UploadDir)
	for _, path := range []string{mainDBPath, sessionDBPath, uploadDir} {
		if err := requireAbsent(path); err != nil {
			return err
		}
	}

	if err := os.MkdirAll(filepath.Dir(mainDBPath), 0700); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(uploadDir), 0700); err != nil {
		return err
	}

	mainDBTemp, err := os.CreateTemp(filepath.Dir(mainDBPath), ".restore-data-*")
	if err != nil {
		return err
	}
	mainDBTempPath := mainDBTemp.Name()
	if err := mainDBTemp.Close(); err != nil {
		os.Remove(mainDBTempPath)
		return err
	}
	defer os.Remove(mainDBTempPath)

	sessionDBTemp, err := os.CreateTemp(filepath.Dir(sessionDBPath), ".restore-sessions-*")
	if err != nil {
		return err
	}
	sessionDBTempPath := sessionDBTemp.Name()
	if err := sessionDBTemp.Close(); err != nil {
		os.Remove(sessionDBTempPath)
		return err
	}
	defer os.Remove(sessionDBTempPath)

	uploadTempDir, err := os.MkdirTemp(filepath.Dir(uploadDir), ".restore-uploads-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(uploadTempDir)

	if err := copyFile(filepath.Join(source, "data.db"), mainDBTempPath); err != nil {
		return fmt.Errorf("restore main database: %w", err)
	}
	if err := copyFile(filepath.Join(source, "data.db.sessions"), sessionDBTempPath); err != nil {
		return fmt.Errorf("restore session database: %w", err)
	}
	if err := copyTree(filepath.Join(source, "uploads"), uploadTempDir); err != nil {
		return fmt.Errorf("restore uploads: %w", err)
	}

	if err := os.Rename(mainDBTempPath, mainDBPath); err != nil {
		return err
	}
	if err := os.Rename(sessionDBTempPath, sessionDBPath); err != nil {
		os.Remove(mainDBPath)
		return err
	}
	if err := os.Rename(uploadTempDir, uploadDir); err != nil {
		os.Remove(mainDBPath)
		os.Remove(sessionDBPath)
		return err
	}
	return nil
}

func requireAbsent(path string) error {
	_, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("restore target already exists: %s", path)
}

func buildManifest(root string, createdAt time.Time) (Manifest, error) {
	manifest := Manifest{CreatedAt: createdAt, Files: make(map[string]string)}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relativePath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if !safeRelativePath(relativePath) {
			return fmt.Errorf("unsafe backup path %q", relativePath)
		}
		digest, err := fileSHA256(path)
		if err != nil {
			return err
		}
		manifest.Files[filepath.ToSlash(relativePath)] = digest
		return nil
	})
	return manifest, err
}

func copyTree(source, destination string) error {
	if err := os.MkdirAll(destination, 0700); err != nil {
		return err
	}
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return nil
		}
		if !safeRelativePath(relativePath) {
			return fmt.Errorf("unsafe upload path %q", relativePath)
		}
		target := filepath.Join(destination, relativePath)
		if entry.IsDir() {
			return os.MkdirAll(target, 0700)
		}
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return fmt.Errorf("unsupported upload entry %q", path)
		}
		return copyFile(path, target)
	})
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	return copyToFile(input, destination)
}

func copyToFile(input io.Reader, destination string) error {
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func safeRelativePath(path string) bool {
	if path == "" || filepath.IsAbs(path) {
		return false
	}
	clean := filepath.Clean(path)
	return clean != "." && clean != ".." && !strings.HasPrefix(clean, ".."+string(filepath.Separator))
}

func removeExpired(root string, retentionDays int) error {
	if retentionDays <= 0 {
		return nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	var expired []string
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "backup-") {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			expired = append(expired, filepath.Join(root, entry.Name()))
		}
	}
	sort.Strings(expired)
	for _, path := range expired {
		if err := os.RemoveAll(path); err != nil {
			return err
		}
	}
	return nil
}
