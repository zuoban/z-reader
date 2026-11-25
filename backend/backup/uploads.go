package backup

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func openSnapshot(root *os.Root, name string) (*bbolt.DB, error) {
	db, err := bbolt.Open(name, 0600, &bbolt.Options{
		ReadOnly: true,
		Timeout:  time.Second,
		OpenFile: func(name string, _ int, _ os.FileMode) (*os.File, error) {
			return openRegularBackupFile(root, name)
		},
	})
	if err != nil {
		return nil, fmt.Errorf("open snapshot %s: %w", name, err)
	}
	return db, nil
}

func visitSnapshotUploads(root *os.Root, snapshot string, visit func(name string) error) error {
	db, err := openSnapshot(root, snapshot)
	if err != nil {
		return err
	}
	defer db.Close()
	seen := make(map[string]struct{})
	return db.View(func(tx *bbolt.Tx) error {
		books := tx.Bucket(storage.BooksBucket)
		if books == nil {
			return fmt.Errorf("snapshot is missing the books bucket")
		}
		return books.ForEach(func(id, data []byte) error {
			var book models.Book
			if err := book.UnmarshalDB(data); err != nil {
				return fmt.Errorf("read snapshot book %q: %w", id, err)
			}
			if strings.TrimSpace(book.Filename) == "" {
				return fmt.Errorf("snapshot book %q has no filename", id)
			}
			for _, name := range []string{book.Filename, book.CoverPath, book.CoverThumbPath} {
				if name == "" {
					continue
				}
				if !safeRelativePath(name) {
					return fmt.Errorf("snapshot book %q has unsafe upload path %q", id, name)
				}
				name = filepath.Clean(name)
				if _, ok := seen[name]; ok {
					continue
				}
				if err := visit(name); err != nil {
					return fmt.Errorf("snapshot book %q upload %q: %w", id, name, err)
				}
				seen[name] = struct{}{}
			}
			return nil
		})
	})
}

func copySnapshotUploads(snapshot, source, destination string) error {
	return copySnapshotUploadsWithDedup(context.Background(), snapshot, source, destination, "", Manifest{}, nil)
}

func copySnapshotUploadsWithDedup(
	ctx context.Context,
	snapshot, source, destination, prevBackupDir string,
	prevManifest Manifest,
	digests map[string]string,
) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	root, err := os.OpenRoot(source)
	if err != nil {
		return err
	}
	defer root.Close()
	if err := os.MkdirAll(destination, 0700); err != nil {
		return err
	}
	snapshotRoot, err := os.OpenRoot(filepath.Dir(snapshot))
	if err != nil {
		return err
	}
	defer snapshotRoot.Close()
	var prevRoot *os.Root
	if prevBackupDir != "" {
		if opened, err := os.OpenRoot(prevBackupDir); err == nil {
			prevRoot = opened
			defer prevRoot.Close()
		}
	}
	var readBuffer []byte
	return visitSnapshotUploads(snapshotRoot, filepath.Base(snapshot), func(name string) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		input, err := openRegularBackupFile(root, name)
		if err != nil {
			return err
		}
		defer input.Close()
		target := filepath.Join(destination, name)
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		info, err := input.Stat()
		if err != nil {
			return err
		}
		manifestKey := filepath.ToSlash(filepath.Join("uploads", name))
		if readBuffer == nil {
			readBuffer = make([]byte, hashBufferSize)
		}
		digest, linked, err := tryHardLinkFromPreviousBackup(ctx, input, info.Size(), name, target, prevRoot, prevBackupDir, prevManifest, readBuffer)
		if err != nil {
			return err
		}
		if linked {
			if digests != nil {
				digests[manifestKey] = digest
			}
			return nil
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if _, err := input.Seek(0, io.SeekStart); err != nil {
			return err
		}
		if digest != "" {
			if err := copyToBackupFile(ctx, input, target, readBuffer); err != nil {
				return err
			}
		} else {
			digest, err = copyToBackupFileWithDigest(ctx, input, target, readBuffer)
			if err != nil {
				return err
			}
		}
		if digests != nil {
			digests[manifestKey] = digest
		}
		return nil
	})
}

func tryHardLinkFromPreviousBackup(
	ctx context.Context,
	input *os.File,
	size int64,
	name, target string,
	prevRoot *os.Root,
	prevBackupDir string,
	prevManifest Manifest,
	digestBuffer []byte,
) (string, bool, error) {
	if err := ctx.Err(); err != nil {
		return "", false, err
	}
	if prevRoot == nil || prevBackupDir == "" || len(prevManifest.Files) == 0 {
		return "", false, nil
	}
	manifestKey := filepath.ToSlash(filepath.Join("uploads", name))
	expectedDigest, ok := prevManifest.Files[manifestKey]
	if !ok || expectedDigest == "" {
		return "", false, nil
	}
	previous, err := openRegularBackupFile(prevRoot, manifestKey)
	if err != nil {
		return "", false, nil
	}
	defer previous.Close()
	prevInfo, err := previous.Stat()
	if err != nil || !prevInfo.Mode().IsRegular() || prevInfo.Size() != size {
		return "", false, nil
	}
	sourceDigest, err := hashBackupReaderWithBuffer(ctx, input, digestBuffer)
	if err != nil {
		if ctx.Err() != nil {
			return "", false, ctx.Err()
		}
		return "", false, nil
	}
	if sourceDigest != expectedDigest {
		return sourceDigest, false, nil
	}
	prevDigest, err := hashBackupReaderWithBuffer(ctx, previous, digestBuffer)
	if err != nil {
		if ctx.Err() != nil {
			return "", false, ctx.Err()
		}
		return sourceDigest, false, nil
	}
	if prevDigest != sourceDigest {
		return sourceDigest, false, nil
	}
	// The digest of the resulting staged file is verified before publication.
	if err := os.Link(filepath.Join(prevBackupDir, manifestKey), target); err != nil {
		return sourceDigest, false, nil
	}
	return sourceDigest, true, nil
}
