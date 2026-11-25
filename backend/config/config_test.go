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

func TestLoadValidatesAllowedOrigins(t *testing.T) {
	t.Run("accepts valid http and https origins", func(t *testing.T) {
		t.Setenv("ALLOWED_ORIGINS", "https://reader.example.com, http://localhost:3000, http://[::1]:8080")
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() unexpected error: %v", err)
		}
		want := []string{
			"https://reader.example.com",
			"http://localhost:3000",
			"http://[::1]:8080",
		}
		if !reflect.DeepEqual(cfg.AllowedOrigins, want) {
			t.Fatalf("AllowedOrigins = %#v, want %#v", cfg.AllowedOrigins, want)
		}
	})

	invalidCases := []struct {
		name  string
		value string
	}{
		{name: "comma only", value: ","},
		{name: "whitespace only", value: "   "},
		{name: "commas and spaces", value: " , , "},
		{name: "wildcard alone", value: "*"},
		{name: "wildcard with valid origin", value: "https://reader.example.com, *"},
		{name: "unsupported scheme", value: "ftp://reader.example.com"},
		{name: "missing scheme", value: "reader.example.com"},
		{name: "empty host", value: "http://"},
		{name: "port without host", value: "http://:3000"},
		{name: "trailing slash", value: "https://reader.example.com/"},
		{name: "with path", value: "https://reader.example.com/app"},
		{name: "with query", value: "https://reader.example.com?foo=bar"},
		{name: "with empty query", value: "https://reader.example.com?"},
		{name: "with fragment", value: "https://reader.example.com#section"},
		{name: "with empty fragment", value: "https://reader.example.com#"},
		{name: "with userinfo", value: "https://user:pass@reader.example.com"},
		{name: "invalid port", value: "https://reader.example.com:notaport"},
	}

	for _, tc := range invalidCases {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			t.Setenv("ALLOWED_ORIGINS", tc.value)
			cfg, err := Load()
			if err == nil {
				t.Fatalf("Load() with ALLOWED_ORIGINS=%q succeeded with %#v, want error", tc.value, cfg.AllowedOrigins)
			}
		})
	}
}
