package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestModuleCoverage(t *testing.T) {
	profilePath := filepath.Join(t.TempDir(), "coverage.out")
	profile := `mode: set
z-reader/backend/handlers/books.go:10.1,12.2 3 1
z-reader/backend/handlers/books.go:14.1,16.2 2 0
z-reader/backend/middleware/auth.go:10.1,11.2 4 2
z-reader/backend/services/tts.go:10.1,11.2 5 0
z-reader/backend/storage/db.go:10.1,11.2 6 1
z-reader/backend/config/config.go:10.1,11.2 7 1
`
	if err := os.WriteFile(profilePath, []byte(profile), 0o600); err != nil {
		t.Fatalf("write profile: %v", err)
	}

	coverage, err := moduleCoverage(profilePath)
	if err != nil {
		t.Fatalf("moduleCoverage() error = %v", err)
	}

	tests := map[string]coverageCount{
		"handlers":   {statements: 5, covered: 3},
		"middleware": {statements: 4, covered: 4},
		"services":   {statements: 5, covered: 0},
		"storage":    {statements: 6, covered: 6},
	}
	for module, want := range tests {
		if got := coverage[module]; got != want {
			t.Errorf("coverage[%q] = %#v, want %#v", module, got, want)
		}
	}
}

func TestModuleCoverageRejectsMissingCoreModule(t *testing.T) {
	profilePath := filepath.Join(t.TempDir(), "coverage.out")
	profile := "mode: set\nz-reader/backend/handlers/books.go:10.1,12.2 3 1\n"
	if err := os.WriteFile(profilePath, []byte(profile), 0o600); err != nil {
		t.Fatalf("write profile: %v", err)
	}

	if _, err := moduleCoverage(profilePath); err == nil {
		t.Fatal("moduleCoverage() error = nil, want missing core module error")
	}
}
