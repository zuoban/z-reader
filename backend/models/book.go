package models

import (
	"encoding/json"
	"time"
)

type Book struct {
	ID             string     `json:"id"`
	UserID         string     `json:"user_id"`
	Title          string     `json:"title"`
	Author         string     `json:"author"`
	Filename       string     `json:"filename"`
	Format         string     `json:"format"`
	Size           int64      `json:"size"`
	ContentHash    string     `json:"content_hash,omitempty"`
	CoverPath      string     `json:"cover_path,omitempty"`
	CoverThumbPath string     `json:"cover_thumb_path,omitempty"`
	Category       *string    `json:"category,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	LastReadAt     *time.Time `json:"last_read_at,omitempty"`
}

// MarshalDB serializes Book for database storage (includes all fields).
func (b Book) MarshalDB() ([]byte, error) {
	type dbBook struct {
		ID             string     `json:"id"`
		UserID         string     `json:"user_id"`
		Title          string     `json:"title"`
		Author         string     `json:"author"`
		Filename       string     `json:"filename"`
		Format         string     `json:"format"`
		Size           int64      `json:"size"`
		ContentHash    string     `json:"content_hash,omitempty"`
		CoverPath      string     `json:"cover_path,omitempty"`
		CoverThumbPath string     `json:"cover_thumb_path,omitempty"`
		Category       *string    `json:"category,omitempty"`
		CreatedAt      time.Time  `json:"created_at"`
		LastReadAt     *time.Time `json:"last_read_at,omitempty"`
	}
	return json.Marshal(dbBook{
		ID:             b.ID,
		UserID:         b.UserID,
		Title:          b.Title,
		Author:         b.Author,
		Filename:       b.Filename,
		Format:         b.Format,
		Size:           b.Size,
		ContentHash:    b.ContentHash,
		CoverPath:      b.CoverPath,
		CoverThumbPath: b.CoverThumbPath,
		Category:       b.Category,
		CreatedAt:      b.CreatedAt,
		LastReadAt:     b.LastReadAt,
	})
}

// UnmarshalDB deserializes Book from database storage.
func (b *Book) UnmarshalDB(data []byte) error {
	type dbBook struct {
		ID             string     `json:"id"`
		UserID         string     `json:"user_id"`
		Title          string     `json:"title"`
		Author         string     `json:"author"`
		Filename       string     `json:"filename"`
		Format         string     `json:"format"`
		Size           int64      `json:"size"`
		ContentHash    string     `json:"content_hash,omitempty"`
		CoverPath      string     `json:"cover_path,omitempty"`
		CoverThumbPath string     `json:"cover_thumb_path,omitempty"`
		Category       *string    `json:"category,omitempty"`
		CreatedAt      time.Time  `json:"created_at"`
		LastReadAt     *time.Time `json:"last_read_at,omitempty"`
	}
	var db dbBook
	if err := json.Unmarshal(data, &db); err != nil {
		return err
	}
	b.ID = db.ID
	b.UserID = db.UserID
	b.Title = db.Title
	b.Author = db.Author
	b.Filename = db.Filename
	b.Format = db.Format
	b.Size = db.Size
	b.ContentHash = db.ContentHash
	b.CoverPath = db.CoverPath
	b.CoverThumbPath = db.CoverThumbPath
	b.Category = db.Category
	b.CreatedAt = db.CreatedAt
	b.LastReadAt = db.LastReadAt
	return nil
}

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
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

const (
	UserRoleUser = "user"
)

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// MarshalJSON serializes User for API responses (excludes PasswordHash).
func (u User) MarshalJSON() ([]byte, error) {
	type Alias struct {
		ID        string    `json:"id"`
		Username  string    `json:"username"`
		Role      string    `json:"role"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	return json.Marshal(Alias{
		ID:        u.ID,
		Username:  u.Username,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	})
}

// MarshalDB serializes User for database storage (includes PasswordHash).
func (u User) MarshalDB() ([]byte, error) {
	type dbUser struct {
		ID           string    `json:"id"`
		Username     string    `json:"username"`
		PasswordHash string    `json:"password_hash"`
		Role         string    `json:"role"`
		CreatedAt    time.Time `json:"created_at"`
		UpdatedAt    time.Time `json:"updated_at"`
	}
	return json.Marshal(dbUser{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		Role:         u.Role,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	})
}

// UnmarshalDB deserializes User from database storage (includes PasswordHash).
func (u *User) UnmarshalDB(data []byte) error {
	type dbUser struct {
		ID           string    `json:"id"`
		Username     string    `json:"username"`
		PasswordHash string    `json:"password_hash"`
		Role         string    `json:"role"`
		CreatedAt    time.Time `json:"created_at"`
		UpdatedAt    time.Time `json:"updated_at"`
	}
	var db dbUser
	if err := json.Unmarshal(data, &db); err != nil {
		return err
	}
	u.ID = db.ID
	u.Username = db.Username
	u.PasswordHash = db.PasswordHash
	u.Role = db.Role
	u.CreatedAt = db.CreatedAt
	u.UpdatedAt = db.UpdatedAt
	return nil
}
