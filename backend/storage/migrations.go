package storage

import (
	"encoding/json"
	"strconv"
	"strings"

	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

func (db *DB) runMigrations() error {
	migrations := []struct {
		version int
		name    string
		run     func(tx *bbolt.Tx) error
	}{
		{
			version: 1,
			name:    "InitializeBuckets",
			run: func(tx *bbolt.Tx) error {
				for _, bucket := range [][]byte{
					BooksBucket,
					ProgressBucket,
					BookmarksBucket,
					UsersBucket,
					UserBooksIndex,
					UsernameIndex,
					BookSortIndex,
				} {
					if _, err := tx.CreateBucketIfNotExists(bucket); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			version: 2,
			name:    "MigrateIndexes",
			run: func(tx *bbolt.Tx) error {
				if err := migrateUsernameIndex(tx); err != nil {
					return err
				}
				return migrateUserBooksIndex(tx)
			},
		},
		{
			version: 3,
			name:    "NormalizeBookCategories",
			run: func(tx *bbolt.Tx) error {
				return migrateBookCategories(tx)
			},
		},
		{
			version: 4,
			name:    "FlattenUserBooksIndex",
			run: func(tx *bbolt.Tx) error {
				idxB := tx.Bucket(UserBooksIndex)
				if idxB == nil {
					return nil
				}

				type oldIndexEntry struct {
					userID  string
					bookIDs []string
				}

				var entries []oldIndexEntry

				// Read all old JSON entries first to avoid mutating during iteration
				err := idxB.ForEach(func(k, v []byte) error {
					if strings.Contains(string(k), ":") {
						return nil
					}
					var ids []string
					if err := json.Unmarshal(v, &ids); err == nil {
						entries = append(entries, oldIndexEntry{
							userID:  string(k),
							bookIDs: ids,
						})
					}
					return nil
				})
				if err != nil {
					return err
				}

				// Re-insert as flat keys and delete old ones
				for _, entry := range entries {
					for _, bookID := range entry.bookIDs {
						newKey := entry.userID + ":" + bookID
						if err := idxB.Put([]byte(newKey), []byte{}); err != nil {
							return err
						}
					}
					if err := idxB.Delete([]byte(entry.userID)); err != nil {
						return err
					}
				}

				return nil
			},
		},
		{
			version: 5,
			name:    "BuildBookSortIndex",
			run:     rebuildBookSortIndex,
		},
		{
			version: 6,
			name:    "BuildBookSearchIndex",
			run:     rebuildBookSearchIndex,
		},
		{
			version: 7,
			name:    "BuildProgressTimeIndex",
			run:     rebuildProgressTimeIndex,
		},
		{
			version: 8,
			name:    "BuildBookContentAndLibrarySummaryIndexes",
			run: func(tx *bbolt.Tx) error {
				if err := rebuildBookContentIndex(tx); err != nil {
					return err
				}
				return rebuildLibrarySummaryIndex(tx)
			},
		},
		{
			version: 9,
			name:    "BuildBookSearchGramIndex",
			run:     rebuildBookSearchGramIndex,
		},
		{version: 10, name: "BuildCategoryHashBacklogAndSearchCounts", run: rebuildLibraryQueryIndexes},
		{version: 11, name: "MergePersonalLibrary", run: mergePersonalLibrary},
	}

	return db.Update(func(tx *bbolt.Tx) error {
		metaB, err := tx.CreateBucketIfNotExists(SystemMetaBucket)
		if err != nil {
			return err
		}

		currentVersion := 0
		if vBytes := metaB.Get([]byte("schema_version")); vBytes != nil {
			var err error
			currentVersion, err = strconv.Atoi(string(vBytes))
			if err != nil {
				currentVersion = 0
			}
		}

		for _, m := range migrations {
			if m.version > currentVersion {
				if err := m.run(tx); err != nil {
					return err
				}
				if err := metaB.Put([]byte("schema_version"), []byte(strconv.Itoa(m.version))); err != nil {
					return err
				}
				currentVersion = m.version
			}
		}
		return nil
	})
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func migrateUsernameIndex(tx *bbolt.Tx) error {
	idxB := tx.Bucket(UsernameIndex)
	usersB := tx.Bucket(UsersBucket)
	if idxB == nil || usersB == nil {
		return nil
	}

	return usersB.ForEach(func(k, v []byte) error {
		var user models.User
		if err := user.UnmarshalDB(v); err != nil {
			return err
		}
		norm := normalizeUsername(user.Username)
		if norm != "" {
			existing := idxB.Get([]byte(norm))
			if existing == nil {
				if err := idxB.Put([]byte(norm), k); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func migrateUserBooksIndex(tx *bbolt.Tx) error {
	idxB := tx.Bucket(UserBooksIndex)
	booksB := tx.Bucket(BooksBucket)

	return booksB.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(v); err != nil {
			return err
		}
		if book.UserID != "" {
			key := []byte(book.UserID + ":" + book.ID)
			if idxB.Get(key) == nil {
				if err := idxB.Put(key, []byte{}); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func migrateBookCategories(tx *bbolt.Tx) error {
	booksB := tx.Bucket(BooksBucket)

	return booksB.ForEach(func(k, v []byte) error {
		var book models.Book
		if err := book.UnmarshalDB(v); err != nil {
			return err
		}

		nextCategory := normalizeCategoryName(book.Category)
		changed := false
		if (book.Category == nil) != (nextCategory == nil) {
			changed = true
		} else if book.Category != nil && nextCategory != nil && *book.Category != *nextCategory {
			changed = true
		}
		if !changed {
			return nil
		}

		book.Category = nextCategory
		data, err := book.MarshalDB()
		if err != nil {
			return err
		}
		return booksB.Put(k, data)
	})
}

func (db *DB) NormalizeBookCategories() error {
	return db.Update(func(tx *bbolt.Tx) error {
		if err := migrateBookCategories(tx); err != nil {
			return err
		}
		for _, rebuild := range []func(*bbolt.Tx) error{
			rebuildBookSortIndex, rebuildBookSearchIndex, rebuildBookSearchGramIndex, rebuildLibrarySummaryIndex,
		} {
			if err := rebuild(tx); err != nil {
				return err
			}
		}
		return nil
	})
}
