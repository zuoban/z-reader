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

func TestLoadReadsUploadLimit(t *testing.T) {
	t.Setenv("MAX_UPLOAD_BYTES", "1024")
	t.Setenv("MAX_REQUEST_BODY_BYTES", "2048")
	t.Setenv("TRUSTED_PROXIES", "127.0.0.1, 10.0.0.0/8")
	t.Setenv("APP_PORT", "")
	t.Setenv("UPLOAD_DIR", "")
	t.Setenv("DB_PATH", "")
	t.Setenv("ALLOWED_ORIGINS", "")
	t.Setenv("PPROF_ENABLED", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.MaxUploadBytes != 1024 {
		t.Fatalf("expected MaxUploadBytes=1024, got %d", cfg.MaxUploadBytes)
	}
	if cfg.MaxRequestBodyBytes != 2048 {
		t.Fatalf("expected MaxRequestBodyBytes=2048, got %d", cfg.MaxRequestBodyBytes)
	}
	if !cfg.PprofEnabled {
		t.Fatal("expected PprofEnabled=true")
	}

	wantProxies := []string{"127.0.0.1", "10.0.0.0/8"}
	if !reflect.DeepEqual(cfg.TrustedProxies, wantProxies) {
		t.Fatalf("expected TrustedProxies=%#v, got %#v", wantProxies, cfg.TrustedProxies)
	}
}
