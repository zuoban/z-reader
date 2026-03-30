package utils

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"

	"github.com/google/uuid"
)

func GenerateUUID() string {
	return uuid.New().String()
}

func GenerateUUIDNoDash() string {
	return uuid.New().String()
}

func GenerateUserID() string {
	const chars = "abcdef0123456789"
	result := make([]byte, 16)
	for i := 0; i < 16; i++ {
		randomByte := make([]byte, 1)
		rand.Read(randomByte)
		result[i] = chars[randomByte[0]%16]
	}
	return string(result)
}

func HmacSha256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func Base64Decode(str string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(str)
}

func Base64Encode(bytes []byte) string {
	return base64.StdEncoding.EncodeToString(bytes)
}
