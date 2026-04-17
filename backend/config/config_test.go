package config

import (
	"reflect"
	"testing"
)

func TestSplitCSVTrimsAndDeduplicates(t *testing.T) {
	got := splitCSV(" http://localhost:3000, http://localhost:3000 , ,http://127.0.0.1:3000 ")
	want := []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("splitCSV() = %#v, want %#v", got, want)
	}
}

func TestUniqueStringsPreservesOrder(t *testing.T) {
	got := uniqueStrings([]string{"a", "b", "a", "c", "b"})
	want := []string{"a", "b", "c"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("uniqueStrings() = %#v, want %#v", got, want)
	}
}

func TestLoadRequiresPassword(t *testing.T) {
	t.Setenv("APP_PASSWORD", "")

	cfg, err := Load()
	if err == nil {
		t.Fatalf("expected Load to fail when APP_PASSWORD is missing, got cfg=%+v", cfg)
	}
}

func TestLoadReadsUploadLimit(t *testing.T) {
	t.Setenv("APP_PASSWORD", "secret")
	t.Setenv("MAX_UPLOAD_BYTES", "1024")
	t.Setenv("APP_PORT", "")
	t.Setenv("UPLOAD_DIR", "")
	t.Setenv("DB_PATH", "")
	t.Setenv("ALLOWED_ORIGINS", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.MaxUploadBytes != 1024 {
		t.Fatalf("expected MaxUploadBytes=1024, got %d", cfg.MaxUploadBytes)
	}
}
