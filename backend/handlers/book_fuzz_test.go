package handlers

import (
	"archive/zip"
	"bytes"
	"testing"
)

func FuzzValidateEPUBArchive(f *testing.F) {
	f.Add([]byte("not an EPUB archive"))
	f.Add([]byte("PK\x03\x04"))
	f.Add([]byte{})

	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 1024*1024 {
			t.Skip()
		}
		reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return
		}
		_, _ = epubPackageRoot(reader)
		_ = validateEPUBArchive(reader, maxEPUBExpandedBytes)
	})
}
