package models

import "time"

type Book struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	Title       string     `json:"title"`
	Author      string     `json:"author"`
	Filename    string     `json:"filename"`
	Format      string     `json:"format"`
	Size        int64      `json:"size"`
	ContentHash string     `json:"content_hash,omitempty"`
	CoverPath   string     `json:"cover_path,omitempty"`
	Category    *string    `json:"category,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	LastReadAt  *time.Time `json:"last_read_at,omitempty"`
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
	UserRoleAdmin = "admin"
	UserRoleUser  = "user"
)

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"password_hash"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
