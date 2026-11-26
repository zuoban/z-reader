package models

import (
	"encoding/json"
	"time"
)

type Book struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	Title           string     `json:"title"`
	Author          string     `json:"author"`
	Filename        string     `json:"filename"`
	Format          string     `json:"format"`
	Size            int64      `json:"size"`
	ContentHash     string     `json:"content_hash,omitempty"`
	CoverPath       string     `json:"cover_path,omitempty"`
	CoverThumbPath  string     `json:"cover_thumb_path,omitempty"`
	CoverMissing    bool       `json:"cover_missing,omitempty"`
	ProcessingState string     `json:"processing_state,omitempty"`
	Category        *string    `json:"category,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	LastReadAt      *time.Time `json:"last_read_at,omitempty"`

	// Keep explicit edits distinguishable from fallback metadata after a restart.
	PendingTitleEdited  bool `json:"-"`
	PendingAuthorEdited bool `json:"-"`
	CoverThumbChecked   bool `json:"-"`
}

type bookAlias Book

type dbBook struct {
	*bookAlias
	PendingTitleEdited  bool `json:"pending_title_edited,omitempty"`
	PendingAuthorEdited bool `json:"pending_author_edited,omitempty"`
	CoverThumbChecked   bool `json:"cover_thumb_checked,omitempty"`
}

// MarshalDB serializes Book for database storage (includes all fields).
func (b Book) MarshalDB() ([]byte, error) {
	alias := bookAlias(b)
	return json.Marshal(dbBook{
		bookAlias:           &alias,
		PendingTitleEdited:  b.PendingTitleEdited,
		PendingAuthorEdited: b.PendingAuthorEdited,
		CoverThumbChecked:   b.CoverThumbChecked,
	})
}

// UnmarshalDB deserializes Book from database storage.
func (b *Book) UnmarshalDB(data []byte) error {
	var raw bookAlias
	db := dbBook{bookAlias: &raw}
	if err := json.Unmarshal(data, &db); err != nil {
		return err
	}
	*b = Book(raw)
	b.PendingTitleEdited = db.PendingTitleEdited
	b.PendingAuthorEdited = db.PendingAuthorEdited
	b.CoverThumbChecked = db.CoverThumbChecked
	return nil
}

const (
	BookProcessingPending = "pending"
	BookProcessingReady   = "ready"
	BookProcessingFailed  = "failed"
)

type Progress struct {
	BookID     string    `json:"book_id"`
	UserID     string    `json:"user_id"`
	CFI        string    `json:"cfi"`
	Percentage float64   `json:"percentage"`
	DeviceID   string    `json:"device_id,omitempty"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Bookmark struct {
	ID         string    `json:"id"`
	BookID     string    `json:"book_id"`
	UserID     string    `json:"user_id"`
	CFI        string    `json:"cfi"`
	Percentage float64   `json:"percentage"`
	Chapter    string    `json:"chapter,omitempty"`
	Note       string    `json:"note,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type Session struct {
	Token     string    `json:"token"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}
