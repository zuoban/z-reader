package models

import "time"

type Book struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Author    string    `json:"author"`
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	CoverPath string    `json:"cover_path,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Progress struct {
	BookID     string    `json:"book_id"`
	CFI        string    `json:"cfi"`
	Percentage float64   `json:"percentage"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Session struct {
	Token     string    `json:"token"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}
