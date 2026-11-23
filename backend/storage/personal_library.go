package storage

import (
	"encoding/json"

	"github.com/google/uuid"
	"go.etcd.io/bbolt"

	"z-reader/backend/models"
)

const PersonalLibrary = "personal"

func mergePersonalLibrary(tx *bbolt.Tx) error {
	if err := rewriteLibraryBucket(tx, BooksBucket, func(_ *bbolt.Bucket, key, value []byte) ([]byte, []byte, error) {
		var book models.Book
		if err := book.UnmarshalDB(value); err != nil {
			return nil, nil, err
		}
		book.UserID = PersonalLibrary
		data, err := book.MarshalDB()
		return key, data, err
	}); err != nil {
		return err
	}
	if err := rewriteLibraryBucket(tx, ProgressBucket, func(dest *bbolt.Bucket, _, value []byte) ([]byte, []byte, error) {
		var progress models.Progress
		if err := json.Unmarshal(value, &progress); err != nil {
			return nil, nil, err
		}
		progress.UserID = PersonalLibrary
		key := progressKey(PersonalLibrary, progress.BookID)
		if previous := dest.Get(key); previous != nil {
			var saved models.Progress
			if err := json.Unmarshal(previous, &saved); err != nil {
				return nil, nil, err
			}
			if !progress.UpdatedAt.After(saved.UpdatedAt) {
				return key, previous, nil
			}
		}
		data, err := json.Marshal(progress)
		return key, data, err
	}); err != nil {
		return err
	}
	if err := rewriteLibraryBucket(tx, BookmarksBucket, func(dest *bbolt.Bucket, _, value []byte) ([]byte, []byte, error) {
		var bookmark models.Bookmark
		if err := json.Unmarshal(value, &bookmark); err != nil {
			return nil, nil, err
		}
		bookmark.UserID = PersonalLibrary
		key := bookmarkKey(PersonalLibrary, bookmark.BookID, bookmark.ID)
		if dest.Get(key) != nil {
			bookmark.ID = uuid.NewString()
			key = bookmarkKey(PersonalLibrary, bookmark.BookID, bookmark.ID)
		}
		data, err := json.Marshal(bookmark)
		return key, data, err
	}); err != nil {
		return err
	}
	if err := tx.DeleteBucket(UserBooksIndex); err != nil {
		return err
	}
	if _, err := tx.CreateBucket(UserBooksIndex); err != nil {
		return err
	}
	if err := migrateUserBooksIndex(tx); err != nil {
		return err
	}
	if err := rebuildProgressTimeIndex(tx); err != nil {
		return err
	}
	return rebuildLibraryQueryIndexes(tx)
}

func rewriteLibraryBucket(tx *bbolt.Tx, name []byte,
	transform func(dest *bbolt.Bucket, key, value []byte) ([]byte, []byte, error),
) error {
	stagingName := []byte("personal_library_migration")
	staging, err := tx.CreateBucket(stagingName)
	if err != nil {
		return err
	}
	if err := tx.Bucket(name).ForEach(func(key, value []byte) error {
		newKey, data, err := transform(staging, key, value)
		if err != nil {
			return err
		}
		return staging.Put(newKey, data)
	}); err != nil {
		return err
	}
	if err := tx.DeleteBucket(name); err != nil {
		return err
	}
	dest, err := tx.CreateBucket(name)
	if err != nil {
		return err
	}
	if err := staging.ForEach(dest.Put); err != nil {
		return err
	}
	return tx.DeleteBucket(stagingName)
}
