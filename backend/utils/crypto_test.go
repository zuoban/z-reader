package utils

import (
	"strings"
	"testing"
)

func TestGenerateUUIDNoDashReturns32Chars(t *testing.T) {
	uuid := GenerateUUIDNoDash()
	if len(uuid) != 32 {
		t.Fatalf("expected 32 characters, got %d", len(uuid))
	}
	if strings.Contains(uuid, "-") {
		t.Fatalf("expected no dashes, got %s", uuid)
	}
}

func TestGenerateUUIDNoDashIsUnique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		uuid := GenerateUUIDNoDash()
		if seen[uuid] {
			t.Fatal("expected unique UUIDs")
		}
		seen[uuid] = true
	}
}

func TestGenerateUUIDNoDashIsHex(t *testing.T) {
	uuid := GenerateUUIDNoDash()
	for _, c := range uuid {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Fatalf("expected hex characters, got %c in %s", c, uuid)
		}
	}
}

func TestGenerateUserIDReturns16Chars(t *testing.T) {
	userID := GenerateUserID()
	if len(userID) != 16 {
		t.Fatalf("expected 16 characters, got %d", len(userID))
	}
}

func TestGenerateUserIDIsHex(t *testing.T) {
	userID := GenerateUserID()
	for _, c := range userID {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Fatalf("expected hex characters, got %c in %s", c, userID)
		}
	}
}

func TestGenerateUserIDIsUnique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		userID := GenerateUserID()
		if seen[userID] {
			t.Fatal("expected unique user IDs")
		}
		seen[userID] = true
	}
}

func TestHmacSha256ProducesCorrectLength(t *testing.T) {
	key := []byte("secret-key")
	data := []byte("hello world")
	result := HmacSha256(key, data)
	if len(result) != 32 {
		t.Fatalf("expected 32 bytes (SHA-256), got %d", len(result))
	}
}

func TestHmacSha256IsDeterministic(t *testing.T) {
	key := []byte("test-key")
	data := []byte("test data")
	result1 := HmacSha256(key, data)
	result2 := HmacSha256(key, data)
	for i := range result1 {
		if result1[i] != result2[i] {
			t.Fatal("expected deterministic output")
		}
	}
}

func TestHmacSha256DiffersForDifferentData(t *testing.T) {
	key := []byte("test-key")
	result1 := HmacSha256(key, []byte("data1"))
	result2 := HmacSha256(key, []byte("data2"))
	for i := range result1 {
		if result1[i] != result2[i] {
			return // Found a difference
		}
	}
	t.Fatal("expected different results for different data")
}

func TestHmacSha256DiffersForDifferentKeys(t *testing.T) {
	data := []byte("same data")
	result1 := HmacSha256([]byte("key1"), data)
	result2 := HmacSha256([]byte("key2"), data)
	for i := range result1 {
		if result1[i] != result2[i] {
			return // Found a difference
		}
	}
	t.Fatal("expected different results for different keys")
}

func TestBase64EncodeDecodeRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		data []byte
	}{
		{"empty", []byte{}},
		{"ascii", []byte("hello world")},
		{"binary", []byte{0x00, 0x01, 0xff, 0xfe}},
		{"utf8", []byte("中文测试")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded := Base64Encode(tt.data)
			decoded, err := Base64Decode(encoded)
			if err != nil {
				t.Fatalf("Base64Decode returned error: %v", err)
			}
			if string(decoded) != string(tt.data) {
				t.Fatalf("round-trip failed: expected %q, got %q", tt.data, decoded)
			}
		})
	}
}

func TestBase64DecodeRejectsInvalidInput(t *testing.T) {
	_, err := Base64Decode("not-valid-base64!!!")
	if err == nil {
		t.Fatal("expected error for invalid base64 input")
	}
}

func TestBase64EncodeProducesString(t *testing.T) {
	result := Base64Encode([]byte("test"))
	if result == "" {
		t.Fatal("expected non-empty base64 string")
	}
}
