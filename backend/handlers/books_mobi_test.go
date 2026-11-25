package handlers

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image/color"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"z-reader/backend/config"
	"z-reader/backend/models"
	"z-reader/backend/storage"
)

type syntheticMOBIOptions struct {
	palmName        string
	encoding        uint32
	fullName        []byte
	exthRecords     []syntheticEXTHRecord
	omitEXTHFlag    bool
	firstImageIndex uint32
	extraRecords    [][]byte
}

type syntheticEXTHRecord struct {
	recType uint32
	data    []byte
}

func uint32Bytes(v uint32) []byte {
	var b [4]byte
	binary.BigEndian.PutUint32(b[:], v)
	return b[:]
}

func buildSyntheticMOBI(opts syntheticMOBIOptions) []byte {
	const mobiHeaderLen = 232
	rec0 := make([]byte, mobiPalmDOCHeaderSize+mobiHeaderLen)
	// PalmDOC header (16 bytes): uncompressed, 1 text record.
	binary.BigEndian.PutUint16(rec0[0:2], 1)
	binary.BigEndian.PutUint16(rec0[8:10], 1)
	binary.BigEndian.PutUint16(rec0[10:12], 4096)

	// MOBI header at offset 16.
	copy(rec0[16:20], "MOBI")
	binary.BigEndian.PutUint32(rec0[20:24], mobiHeaderLen)
	binary.BigEndian.PutUint32(rec0[24:28], 2) // Mobipocket book
	encoding := opts.encoding
	if encoding == 0 {
		encoding = mobiEncodingUTF8
	}
	binary.BigEndian.PutUint32(rec0[28:32], encoding)
	binary.BigEndian.PutUint32(rec0[108:112], opts.firstImageIndex)

	var exthBuf bytes.Buffer
	if len(opts.exthRecords) > 0 {
		if !opts.omitEXTHFlag {
			binary.BigEndian.PutUint32(rec0[128:132], mobiEXTHFlagPresent)
		}
		var recordsBuf bytes.Buffer
		for _, rec := range opts.exthRecords {
			var hdr [8]byte
			binary.BigEndian.PutUint32(hdr[0:4], rec.recType)
			binary.BigEndian.PutUint32(hdr[4:8], uint32(8+len(rec.data)))
			recordsBuf.Write(hdr[:])
			recordsBuf.Write(rec.data)
		}
		exthTotalLen := 12 + recordsBuf.Len()
		exthBuf.WriteString("EXTH")
		exthBuf.Write(uint32Bytes(uint32(exthTotalLen)))
		exthBuf.Write(uint32Bytes(uint32(len(opts.exthRecords))))
		exthBuf.Write(recordsBuf.Bytes())
	}

	fullNameOffset := len(rec0) + exthBuf.Len()
	if len(opts.fullName) > 0 {
		binary.BigEndian.PutUint32(rec0[84:88], uint32(fullNameOffset))
		binary.BigEndian.PutUint32(rec0[88:92], uint32(len(opts.fullName)))
	}

	rec0 = append(rec0, exthBuf.Bytes()...)
	rec0 = append(rec0, opts.fullName...)

	records := make([][]byte, 0, 1+len(opts.extraRecords))
	records = append(records, rec0)
	records = append(records, opts.extraRecords...)

	return assemblePalmDB(opts.palmName, records)
}

func assemblePalmDB(name string, records [][]byte) []byte {
	header := make([]byte, palmDBHeaderSize)
	copy(header[:31], name)
	copy(header[60:68], "BOOKMOBI")
	binary.BigEndian.PutUint16(header[76:78], uint16(len(records)))

	tableSize := len(records) * palmDBRecordEntrySize
	offset := palmDBHeaderSize + tableSize
	table := make([]byte, tableSize)
	for i, rec := range records {
		binary.BigEndian.PutUint32(table[i*8:i*8+4], uint32(offset))
		offset += len(rec)
	}

	var out bytes.Buffer
	out.Write(header)
	out.Write(table)
	for _, rec := range records {
		out.Write(rec)
	}
	return out.Bytes()
}

func TestExtractMOBIMetadataAndJPEGCover(t *testing.T) {
	coverJPEG := encodeTestJPEG(t, color.RGBA{R: 210, G: 80, B: 40, A: 255})
	data := buildSyntheticMOBI(syntheticMOBIOptions{
		palmName:        "Fallback_Palm_Name",
		encoding:        mobiEncodingUTF8,
		fullName:        []byte("Full Name Title"),
		firstImageIndex: 2,
		exthRecords: []syntheticEXTHRecord{
			{recType: exthTypeUpdatedTitle, data: []byte("三体：地球往事")},
			{recType: exthTypeAuthor, data: []byte("刘慈欣")},
			{recType: exthTypeAuthor, data: []byte("Ken Liu")},
			{recType: exthTypeAuthor, data: []byte("刘慈欣")}, // duplicate should be deduped
			{recType: exthTypeCoverOffset, data: uint32Bytes(0)},
		},
		extraRecords: [][]byte{
			[]byte("text record 1"),
			coverJPEG,
		},
	})

	meta, cover, contentType := extractMOBIPreviewFromReaderAt(bytes.NewReader(data), int64(len(data)))
	if meta.Title != "三体：地球往事" {
		t.Fatalf("Title = %q, want %q", meta.Title, "三体：地球往事")
	}
	if meta.Author != "刘慈欣, Ken Liu" {
		t.Fatalf("Author = %q, want %q", meta.Author, "刘慈欣, Ken Liu")
	}
	if contentType != "image/jpeg" {
		t.Fatalf("contentType = %q, want image/jpeg", contentType)
	}
	if !bytes.Equal(cover, coverJPEG) {
		t.Fatalf("cover bytes mismatch: got %d bytes, want %d bytes", len(cover), len(coverJPEG))
	}
}

func TestExtractAZW3ThumbOffsetFallbackAndPNGCover(t *testing.T) {
	coverPNG := encodeTestPNG(t, color.RGBA{R: 40, G: 160, B: 220, A: 255})
	data := buildSyntheticMOBI(syntheticMOBIOptions{
		palmName:        "AZW3Fallback",
		encoding:        mobiEncodingUTF8,
		firstImageIndex: 2,
		exthRecords: []syntheticEXTHRecord{
			{recType: exthTypeUpdatedTitle, data: []byte("AZW3 Edition")},
			{recType: exthTypeAuthor, data: []byte("Ada Lovelace")},
			{recType: exthTypeCoverOffset, data: uint32Bytes(99)}, // out of bounds -> fall back to thumb
			{recType: exthTypeThumbOffset, data: uint32Bytes(1)},
		},
		extraRecords: [][]byte{
			[]byte("text record"),
			[]byte("<html>not an image</html>"),
			coverPNG,
		},
	})

	meta, cover, contentType := extractMOBIPreviewFromReaderAt(bytes.NewReader(data), int64(len(data)))
	if meta.Title != "AZW3 Edition" || meta.Author != "Ada Lovelace" {
		t.Fatalf("unexpected metadata: %+v", meta)
	}
	if contentType != "image/png" || !bytes.Equal(cover, coverPNG) {
		t.Fatalf("expected PNG cover via thumb fallback, got mime=%q len=%d", contentType, len(cover))
	}
}

func TestExtractMOBIWindows1252AndTitleFallbacks(t *testing.T) {
	t.Run("windows-1252 EXTH decoding", func(t *testing.T) {
		// "Café “Smart” — €10" in Windows-1252
		cp1252Title := []byte{'C', 'a', 'f', 0xE9, ' ', 0x93, 'S', 'm', 'a', 'r', 't', 0x94, ' ', 0x97, ' ', 0x80, '1', '0'}
		cp1252Author := []byte{'R', 'e', 'n', 0xE9, ' ', 'D', 'e', 's', 'c', 'a', 'r', 't', 'e', 's'}
		data := buildSyntheticMOBI(syntheticMOBIOptions{
			palmName:        "PalmName",
			encoding:        mobiEncodingCP1252,
			firstImageIndex: mobiNoIndex,
			exthRecords: []syntheticEXTHRecord{
				{recType: exthTypeUpdatedTitle, data: cp1252Title},
				{recType: exthTypeAuthor, data: cp1252Author},
			},
		})
		meta, cover, _ := extractMOBIPreviewFromReaderAt(bytes.NewReader(data), int64(len(data)))
		wantTitle := "Café “Smart” — €10"
		if meta.Title != wantTitle {
			t.Fatalf("Title = %q, want %q", meta.Title, wantTitle)
		}
		if meta.Author != "René Descartes" {
			t.Fatalf("Author = %q, want %q", meta.Author, "René Descartes")
		}
		if len(cover) != 0 {
			t.Fatalf("expected no cover, got %d bytes", len(cover))
		}
	})

	t.Run("falls back to MOBI full name when EXTH 503 absent", func(t *testing.T) {
		data := buildSyntheticMOBI(syntheticMOBIOptions{
			palmName:        "PalmFallback",
			encoding:        mobiEncodingUTF8,
			fullName:        []byte("Full Header Title"),
			firstImageIndex: mobiNoIndex,
			exthRecords: []syntheticEXTHRecord{
				{recType: exthTypeAuthor, data: []byte("Only Author")},
			},
		})
		meta, _, _ := extractMOBIPreviewFromReaderAt(bytes.NewReader(data), int64(len(data)))
		if meta.Title != "Full Header Title" || meta.Author != "Only Author" {
			t.Fatalf("unexpected metadata: %+v", meta)
		}
	})

	t.Run("falls back to PalmDB header name when MOBI full name absent", func(t *testing.T) {
		data := buildSyntheticMOBI(syntheticMOBIOptions{
			palmName:        "PalmDB Only Title",
			encoding:        mobiEncodingUTF8,
			firstImageIndex: mobiNoIndex,
		})
		meta, _, _ := extractMOBIPreviewFromReaderAt(bytes.NewReader(data), int64(len(data)))
		if meta.Title != "PalmDB Only Title" {
			t.Fatalf("Title = %q, want %q", meta.Title, "PalmDB Only Title")
		}
	})
}

func TestExtractMOBICorruptAndMaliciousInputsDoNotPanic(t *testing.T) {
	// Malicious EXTH with zero-length record and huge record count.
	maliciousEXTH := buildSyntheticMOBI(syntheticMOBIOptions{
		palmName:        "BadEXTH",
		encoding:        mobiEncodingUTF8,
		firstImageIndex: 0xFFFFFFFE,
		exthRecords: []syntheticEXTHRecord{
			{recType: exthTypeCoverOffset, data: uint32Bytes(5)}, // uint32 overflow if not widened
		},
	})
	if idx := bytes.Index(maliciousEXTH, []byte("EXTH")); idx >= 0 && idx+20 <= len(maliciousEXTH) {
		binary.BigEndian.PutUint32(maliciousEXTH[idx+8:idx+12], 0xFFFFFFFF) // huge record count
		binary.BigEndian.PutUint32(maliciousEXTH[idx+16:idx+20], 0)         // recLen == 0
	}

	// Malicious PalmDB with backwards record offsets.
	badOffsets := assemblePalmDB("BadOffsets", [][]byte{make([]byte, 32), make([]byte, 32)})
	binary.BigEndian.PutUint32(badOffsets[78:82], 200)
	binary.BigEndian.PutUint32(badOffsets[86:90], 100)

	// Non-image bytes at cover record.
	nonImageCover := buildSyntheticMOBI(syntheticMOBIOptions{
		palmName:        "NonImage",
		firstImageIndex: 1,
		exthRecords: []syntheticEXTHRecord{
			{recType: exthTypeUpdatedTitle, data: []byte("Safe Title")},
			{recType: exthTypeCoverOffset, data: uint32Bytes(0)},
		},
		extraRecords: [][]byte{[]byte("<script>alert(1)</script>")},
	})

	cases := map[string][]byte{
		"empty":                  nil,
		"too_short":              []byte("BOOKMOBI"),
		"zero_records":           assemblePalmDB("Zero", nil),
		"truncated_record_table": append(make([]byte, 76), 0xFF, 0xFF),
		"bad_offsets":            badOffsets,
		"malicious_exth":         maliciousEXTH,
		"non_image_cover":        nonImageCover,
		"non_mobi_rec0":          assemblePalmDB("PlainPalm", [][]byte{[]byte("not a mobi header record")}),
	}

	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			meta, cover, mime := extractMOBIPreviewFromReaderAt(bytes.NewReader(payload), int64(len(payload)))
			if meta == nil {
				t.Fatal("expected non-nil metadata")
			}
			if name == "non_image_cover" {
				if meta.Title != "Safe Title" {
					t.Fatalf("Title = %q, want Safe Title", meta.Title)
				}
				if len(cover) != 0 || mime != "" {
					t.Fatalf("expected non-image cover to be rejected, got mime=%q len=%d", mime, len(cover))
				}
			}
		})
	}
}

func TestBooksUploadProcessesMOBIAndAZW3MetadataAndCover(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, tc := range []struct {
		name      string
		filename  string
		wantFmt   string
		coverData []byte
		wantMime  string
	}{
		{
			name:      "mobi with jpeg cover",
			filename:  "sample-book.mobi",
			wantFmt:   "mobi",
			coverData: encodeTestJPEG(t, color.RGBA{R: 150, G: 60, B: 180, A: 255}),
			wantMime:  "image/jpeg",
		},
		{
			name:      "azw3 with png cover",
			filename:  "sample-book.azw3",
			wantFmt:   "azw3",
			coverData: encodeTestPNG(t, color.RGBA{R: 30, G: 140, B: 90, A: 255}),
			wantMime:  "image/png",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := openHandlerTestDB(t)
			uploadDir := t.TempDir()
			handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

			content := buildSyntheticMOBI(syntheticMOBIOptions{
				palmName:        "PalmFallback",
				encoding:        mobiEncodingUTF8,
				firstImageIndex: 2,
				exthRecords: []syntheticEXTHRecord{
					{recType: exthTypeUpdatedTitle, data: []byte("Extracted " + tc.wantFmt + " Title")},
					{recType: exthTypeAuthor, data: []byte("Extracted Author")},
					{recType: exthTypeCoverOffset, data: uint32Bytes(0)},
				},
				extraRecords: [][]byte{
					[]byte("text body"),
					tc.coverData,
				},
			})

			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = newMultipartUploadRequest(t, tc.filename, content)
			handler.Upload(ctx)

			if rec.Code != http.StatusOK {
				t.Fatalf("Upload status = %d body=%s", rec.Code, rec.Body.String())
			}

			var uploaded models.Book
			if err := json.Unmarshal(rec.Body.Bytes(), &uploaded); err != nil {
				t.Fatalf("decode upload response: %v", err)
			}
			if uploaded.Format != tc.wantFmt {
				t.Fatalf("Format = %q, want %q", uploaded.Format, tc.wantFmt)
			}
			if uploaded.ProcessingState != models.BookProcessingPending {
				t.Fatalf("ProcessingState = %q, want pending", uploaded.ProcessingState)
			}

			deadline := time.Now().Add(3 * time.Second)
			var processed *models.Book
			for time.Now().Before(deadline) {
				b, err := db.GetBookForUser(uploaded.ID, uploaded.UserID)
				if err != nil {
					t.Fatal(err)
				}
				if b != nil && b.ProcessingState == models.BookProcessingReady {
					processed = b
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if processed == nil {
				t.Fatalf("timed out waiting for %s processing", tc.wantFmt)
			}
			if processed.Title != "Extracted "+tc.wantFmt+" Title" || processed.Author != "Extracted Author" {
				t.Fatalf("unexpected processed metadata: %+v", processed)
			}
			if processed.CoverPath == "" {
				t.Fatalf("expected extracted cover to be persisted: %+v", processed)
			}
			if _, err := os.Stat(filepath.Join(uploadDir, processed.CoverPath)); err != nil {
				t.Fatalf("expected cover file on disk: %v", err)
			}

			// Verify GetCover serves the extracted cover.
			coverRec := httptest.NewRecorder()
			coverCtx, _ := gin.CreateTestContext(coverRec)
			coverCtx.Params = gin.Params{{Key: "id", Value: processed.ID}}
			coverCtx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+processed.ID+"/cover", nil)
			handler.GetCover(coverCtx)
			if coverRec.Code != http.StatusOK {
				t.Fatalf("GetCover status = %d, want 200", coverRec.Code)
			}
			if !bytes.Equal(coverRec.Body.Bytes(), tc.coverData) {
				t.Fatalf("served cover bytes mismatch: got %d, want %d", coverRec.Body.Len(), len(tc.coverData))
			}
		})
	}
}

func TestGetCoverExtractsLegacyMOBICoverOnDemand(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := openHandlerTestDB(t)
	uploadDir := t.TempDir()
	handler := newBooksHandler(t, &config.Config{UploadDir: uploadDir}, db)

	coverJPEG := encodeTestJPEG(t, color.RGBA{R: 80, G: 120, B: 200, A: 255})
	mobiBytes := buildSyntheticMOBI(syntheticMOBIOptions{
		palmName:        "LegacyMOBI",
		firstImageIndex: 1,
		exthRecords: []syntheticEXTHRecord{
			{recType: exthTypeCoverOffset, data: uint32Bytes(0)},
		},
		extraRecords: [][]byte{coverJPEG},
	})
	if err := os.WriteFile(filepath.Join(uploadDir, "legacy.mobi"), mobiBytes, 0644); err != nil {
		t.Fatal(err)
	}
	book := &models.Book{
		ID:              "legacy-mobi-1",
		UserID:          storage.PersonalLibrary,
		Title:           "Legacy MOBI",
		Filename:        "legacy.mobi",
		Format:          "mobi",
		ProcessingState: models.BookProcessingReady,
		CreatedAt:       time.Now(),
	}
	if err := db.CreateBook(book); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Params = gin.Params{{Key: "id", Value: book.ID}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/books/"+book.ID+"/cover", nil)
	handler.GetCover(ctx)

	if rec.Code != http.StatusOK {
		t.Fatalf("GetCover status = %d, want 200", rec.Code)
	}
	if !bytes.Equal(rec.Body.Bytes(), coverJPEG) {
		t.Fatalf("cover mismatch: got %d bytes, want %d bytes", rec.Body.Len(), len(coverJPEG))
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		stored, err := db.GetBook(book.ID)
		if err != nil {
			t.Fatal(err)
		}
		if stored != nil && stored.CoverPath != "" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for on-demand MOBI cover cache write")
}
