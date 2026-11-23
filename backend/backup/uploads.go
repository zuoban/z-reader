package backup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
	"z-reader/backend/storage"
)

func openSnapshot(path string) (*bbolt.DB, error) {
	db, err := bbolt.Open(path, 0600, &bbolt.Options{ReadOnly: true, Timeout: time.Second})
	if err != nil {
		return nil, fmt.Errorf("open snapshot %s: %w", filepath.Base(path), err)
	}
	return db, nil
}

func visitSnapshotUploads(snapshot string, visit func(name string) error) error {
	db, err := openSnapshot(snapshot)
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
	root, err := os.OpenRoot(source)
	if err != nil {
		return err
	}
	defer root.Close()
	if err := os.MkdirAll(destination, 0700); err != nil {
		return err
	}
	return visitSnapshotUploads(snapshot, func(name string) error {
		info, err := root.Lstat(name)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported upload entry")
		}
		input, err := root.Open(name)
		if err != nil {
			return err
		}
		defer input.Close()
		target := filepath.Join(destination, name)
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		return copyToFile(input, target)
	})
}
