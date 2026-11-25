package backup

import (
	"context"
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

const (
	manifestName   = "manifest.json"
	hashBufferSize = 64 * 1024
)

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
// Unchanged uploads that already exist in the latest backup are hard-linked
// from that backup to save disk space while keeping live uploads isolated.
// If retention cleanup fails, Create returns the published path and the error.
func Create(db *storage.DB, config Config) (string, error) {
	return CreateContext(context.Background(), db, config)
}

// CreateContext creates and verifies a backup like Create, aborting early and
// cleaning up any staged temporary directory if ctx is canceled.
func CreateContext(ctx context.Context, db *storage.DB, config Config) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	prevDir, prevManifest, _ := latestManifest(config.Dir)
	digests := make(map[string]string)
	return createWithDigests(ctx, db, config, digests, func(ctx context.Context, snapshot, source, destination string) error {
		return copySnapshotUploadsWithDedup(ctx, snapshot, source, destination, prevDir, prevManifest, digests)
	})
}

// LatestVerifiedTime returns the creation timestamp of the newest verified
// backup in dir, or false if none exists.
func LatestVerifiedTime(dir string) (time.Time, bool) {
	return LatestVerifiedTimeContext(context.Background(), dir)
}

// LatestVerifiedTimeContext returns the creation timestamp of the newest
// verified backup in dir, stopping early if ctx is canceled.
func LatestVerifiedTimeContext(ctx context.Context, dir string) (time.Time, bool) {
	if dir == "" || ctx.Err() != nil {
		return time.Time{}, false
	}
	candidates := listBackupDirsDescending(dir)
	for _, candidate := range candidates {
		if ctx.Err() != nil {
			return time.Time{}, false
		}
		manifest, ok := readManifest(candidate)
		if !ok || manifest.CreatedAt.IsZero() {
			continue
		}
		if err := VerifyContext(ctx, candidate); err != nil {
			continue
		}
		return manifest.CreatedAt, true
	}
	return time.Time{}, false
}

func listBackupDirsDescending(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "backup-") {
			names = append(names, entry.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	paths := make([]string, 0, len(names))
	for _, name := range names {
		paths = append(paths, filepath.Join(dir, name))
	}
	return paths
}

func readManifest(dir string) (Manifest, bool) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return Manifest{}, false
	}
	defer root.Close()
	manifest, err := readBackupManifest(root)
	return manifest, err == nil
}

func latestManifest(dir string) (string, Manifest, bool) {
	if dir == "" {
		return "", Manifest{}, false
	}
	for _, candidate := range listBackupDirsDescending(dir) {
		if manifest, ok := readManifest(candidate); ok {
			return candidate, manifest, true
		}
	}
	return "", Manifest{}, false
}

func create(db *storage.DB, config Config, copyUploads func(snapshot, source, destination string) error) (string, error) {
	return createWithDigests(context.Background(), db, config, nil, func(_ context.Context, snapshot, source, destination string) error {
		return copyUploads(snapshot, source, destination)
	})
}

func createWithDigests(
	ctx context.Context,
	db *storage.DB,
	config Config,
	precomputedDigests map[string]string,
	copyUploads func(ctx context.Context, snapshot, source, destination string) error,
) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
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
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := db.BackupTo(snapshot); err != nil {
			return fmt.Errorf("snapshot main database: %w", err)
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := copyUploads(ctx, snapshot, config.UploadDir, filepath.Join(temporaryDir, "uploads")); err != nil {
			return fmt.Errorf("copy snapshot uploads: %w", err)
		}
		return nil
	}); err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if err := db.SessionBackupTo(filepath.Join(temporaryDir, "data.db.sessions")); err != nil {
		return "", fmt.Errorf("snapshot session database: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}

	manifest, err := buildManifestWithDigests(ctx, temporaryDir, createdAt, precomputedDigests)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(temporaryDir, manifestName), data, 0600); err != nil {
		return "", err
	}
	if err := VerifyContext(ctx, temporaryDir); err != nil {
		return "", fmt.Errorf("verify created backup: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}

	finalDir := filepath.Join(config.Dir, name)
	if err := os.Rename(temporaryDir, finalDir); err != nil {
		return "", err
	}
	if err := removeExpired(config.Dir, config.RetentionDays); err != nil {
		return finalDir, fmt.Errorf("remove expired backups: %w", err)
	}
	return finalDir, nil
}

// Verify checks the manifest digests, opens both database snapshots in
// read-only mode, and checks that all referenced uploads are in the manifest.
func Verify(path string) error {
	return VerifyContext(context.Background(), path)
}

// VerifyContext checks a backup directory like Verify, aborting early if ctx
// is canceled.
func VerifyContext(ctx context.Context, path string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	root, err := os.OpenRoot(path)
	if err != nil {
		return err
	}
	defer root.Close()
	manifest, err := readBackupManifest(root)
	if err != nil {
		return err
	}
	return verifyManifest(ctx, root, manifest, make([]byte, hashBufferSize))
}

func readBackupManifest(root *os.Root) (Manifest, error) {
	var manifest Manifest
	file, err := openRegularBackupFile(root, manifestName)
	if err != nil {
		return manifest, err
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return manifest, err
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return manifest, err
	}
	if manifest.CreatedAt.IsZero() {
		return manifest, fmt.Errorf("invalid backup manifest")
	}
	for _, name := range []string{"data.db", "data.db.sessions"} {
		if _, ok := manifest.Files[name]; !ok {
			return manifest, fmt.Errorf("%s is missing from the manifest", name)
		}
	}
	return manifest, nil
}

func verifyManifest(ctx context.Context, root *os.Root, manifest Manifest, readBuffer []byte) error {
	for relativePath, expected := range manifest.Files {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !validManifestFile(relativePath) {
			return fmt.Errorf("unsafe manifest path %q", relativePath)
		}
		file, err := openRegularBackupFile(root, relativePath)
		if err != nil {
			return err
		}
		actual, err := hashBackupReaderWithBuffer(ctx, file, readBuffer)
		file.Close()
		if err != nil {
			return err
		}
		if actual != expected {
			return fmt.Errorf("checksum mismatch for %s", relativePath)
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	uploads, err := root.Lstat("uploads")
	if err != nil {
		return fmt.Errorf("open snapshot uploads: %w", err)
	}
	if !uploads.IsDir() {
		return fmt.Errorf("snapshot uploads is not a directory")
	}
	if err := fs.WalkDir(root.FS(), "uploads", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if !entry.IsDir() {
			if _, ok := manifest.Files[name]; !ok {
				return fmt.Errorf("%s is missing from the manifest", name)
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if err := visitSnapshotUploads(root, "data.db", func(name string) error {
		relativePath := filepath.Join("uploads", name)
		if _, ok := manifest.Files[filepath.ToSlash(relativePath)]; !ok {
			return fmt.Errorf("%s is missing from the manifest", relativePath)
		}
		return nil
	}); err != nil {
		return err
	}
	sessions, err := openSnapshot(root, "data.db.sessions")
	if err != nil {
		return err
	}
	return sessions.Close()
}

// Restore verifies a backup and copies it into an empty application data
// location. It clears sessions in the staged copy before publishing. The app
// must be stopped, and existing targets are rejected.
func Restore(source string, config RestoreConfig) error {
	if config.DBPath == "" {
		return fmt.Errorf("database path is required")
	}
	if config.UploadDir == "" {
		return fmt.Errorf("upload directory is required")
	}
	root, err := os.OpenRoot(source)
	if err != nil {
		return err
	}
	defer root.Close()
	manifest, err := readBackupManifest(root)
	if err != nil {
		return fmt.Errorf("read backup before restore: %w", err)
	}
	readBuffer := make([]byte, hashBufferSize)
	if err := verifyManifest(context.Background(), root, manifest, readBuffer); err != nil {
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

	for name, expected := range manifest.Files {
		var target string
		switch name {
		case "data.db":
			target = mainDBTempPath
		case "data.db.sessions":
			target = sessionDBTempPath
		default:
			target = filepath.Join(uploadTempDir, filepath.FromSlash(strings.TrimPrefix(name, "uploads/")))
			if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
				return err
			}
		}
		if err := copyVerifiedFile(root, name, target, expected, readBuffer); err != nil {
			return fmt.Errorf("restore %s: %w", name, err)
		}
	}

	sessions, err := storage.OpenSession(sessionDBTempPath)
	if err != nil {
		return fmt.Errorf("open restored session database: %w", err)
	}
	if err := errors.Join(sessions.ClearSessions(), sessions.Close()); err != nil {
		return fmt.Errorf("clear restored sessions: %w", err)
	}

	// Reserve the database paths, then publish the complete upload tree in one step.
	return publishRestore(uploadTempDir, uploadDir, mainDBTempPath, mainDBPath,
		sessionDBTempPath, sessionDBPath)
}

func publishRestore(uploadTempDir, uploadDir, mainTemp, mainPath, sessionTemp, sessionPath string) error {
	if err := os.Link(mainTemp, mainPath); err != nil {
		return err
	}
	if err := os.Link(sessionTemp, sessionPath); err != nil {
		return errors.Join(err, os.Remove(mainPath))
	}
	if err := publishUploadDirectory(uploadTempDir, uploadDir); err != nil {
		return errors.Join(err, os.Remove(mainPath), os.Remove(sessionPath))
	}
	return nil
}

func copyVerifiedFile(root *os.Root, name, target, expected string, readBuffer []byte) error {
	input, err := openRegularBackupFile(root, name)
	if err != nil {
		return err
	}
	defer input.Close()
	hash := sha256.New()
	if err := copyToFile(io.TeeReader(input, hash), target, readBuffer); err != nil {
		return err
	}
	if hex.EncodeToString(hash.Sum(nil)) != expected {
		return fmt.Errorf("checksum changed during restore")
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
	return buildManifestWithDigests(context.Background(), root, createdAt, nil)
}

func buildManifestWithDigests(ctx context.Context, root string, createdAt time.Time, precomputed map[string]string) (Manifest, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	manifest := Manifest{CreatedAt: createdAt, Files: make(map[string]string)}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
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
		key := filepath.ToSlash(relativePath)
		if digest, ok := precomputed[key]; ok && digest != "" {
			manifest.Files[key] = digest
			return nil
		}
		digest, err := fileSHA256(ctx, path)
		if err != nil {
			return err
		}
		manifest.Files[key] = digest
		return nil
	})
	return manifest, err
}

type contextReader struct {
	ctx context.Context
	r   io.Reader
}

func (cr contextReader) Read(p []byte) (int, error) {
	if err := cr.ctx.Err(); err != nil {
		return 0, err
	}
	return cr.r.Read(p)
}

func copyToFile(input io.Reader, destination string, readBuffer []byte) error {
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	// Hide ReadFrom so the destination file uses the supplied buffer.
	_, copyErr := io.CopyBuffer(struct{ io.Writer }{output}, input, readBuffer)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

// copyToBackupFile copies input to destination as a read-only (0400) backup file.
func copyToBackupFile(ctx context.Context, input io.Reader, destination string, readBuffer []byte) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0400)
	if err != nil {
		return err
	}
	// Wrap input in contextReader so a file's WriteTo cannot bypass readBuffer
	// and cancellation is checked before each chunk read. Hide ReadFrom so the
	// destination file uses the supplied buffer.
	_, copyErr := io.CopyBuffer(struct{ io.Writer }{output}, contextReader{ctx: ctx, r: input}, readBuffer)
	if copyErr == nil {
		copyErr = ctx.Err()
	}
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

// copyToBackupFileWithDigest copies input to destination as a read-only (0400)
// backup file and returns its SHA-256 hex digest in a single pass.
func copyToBackupFileWithDigest(ctx context.Context, input io.Reader, destination string, readBuffer []byte) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0400)
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	// Wrap input in contextReader so a file's WriteTo cannot bypass readBuffer
	// and cancellation is checked before each chunk read.
	_, copyErr := io.CopyBuffer(io.MultiWriter(output, hash), contextReader{ctx: ctx, r: input}, readBuffer)
	if copyErr == nil {
		copyErr = ctx.Err()
	}
	closeErr := output.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func fileSHA256(ctx context.Context, path string) (string, error) {
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return "", err
	}
	defer root.Close()
	file, err := openRegularBackupFile(root, filepath.Base(path))
	if err != nil {
		return "", err
	}
	defer file.Close()
	return hashBackupReader(ctx, file)
}

func validManifestFile(name string) bool {
	return fs.ValidPath(name) && filepath.ToSlash(filepath.Clean(name)) == name &&
		(name == "data.db" || name == "data.db.sessions" || strings.HasPrefix(name, "uploads/"))
}

func openRegularBackupFile(root *os.Root, name string) (*os.File, error) {
	info, err := root.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("%s is not a regular backup file", name)
	}
	file, err := root.Open(name)
	if err != nil {
		return nil, err
	}
	current, err := file.Stat()
	if err != nil || !os.SameFile(info, current) {
		file.Close()
		return nil, fmt.Errorf("%s changed while opening backup file", name)
	}
	return file, nil
}

func hashBackupReader(ctx context.Context, file io.Reader) (string, error) {
	return hashBackupReaderWithBuffer(ctx, file, make([]byte, hashBufferSize))
}

func hashBackupReaderWithBuffer(ctx context.Context, file io.Reader, buf []byte) (string, error) {
	hash := sha256.New()
	for {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		n, readErr := file.Read(buf)
		if n > 0 {
			if _, err := hash.Write(buf[:n]); err != nil {
				return "", err
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return "", readErr
		}
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

func backupCreatedAt(dirPath string, entry fs.DirEntry) (time.Time, bool) {
	if manifest, ok := readManifest(dirPath); ok && !manifest.CreatedAt.IsZero() {
		return manifest.CreatedAt, true
	}
	if ts, ok := parseBackupDirTime(entry.Name()); ok {
		return ts, true
	}
	info, err := entry.Info()
	if err != nil {
		return time.Time{}, false
	}
	return info.ModTime(), true
}

func parseBackupDirTime(name string) (time.Time, bool) {
	raw, ok := strings.CutPrefix(name, "backup-")
	if !ok || raw == "" {
		return time.Time{}, false
	}
	ts, err := time.Parse("20060102T150405.999999999Z", raw)
	if err != nil {
		return time.Time{}, false
	}
	return ts, true
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
		dirPath := filepath.Join(root, entry.Name())
		if createdAt, ok := backupCreatedAt(dirPath, entry); ok && createdAt.Before(cutoff) {
			expired = append(expired, dirPath)
		}
	}
	sort.Strings(expired)
	var errs []error
	for _, path := range expired {
		if err := os.RemoveAll(path); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
