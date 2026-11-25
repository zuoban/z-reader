package handlers

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	palmDBHeaderSize         = 78
	palmDBRecordEntrySize    = 8
	mobiPalmDOCHeaderSize    = 16
	mobiMaxHeaderRecordBytes = 4 * 1024 * 1024
	mobiMaxCoverBytes        = maxEPUBCoverBytes
	mobiEncodingUTF8         = 65001
	mobiEncodingCP1252       = 1252
	mobiNoIndex              = 0xFFFFFFFF
	mobiEXTHFlagPresent      = 0x40

	exthTypeAuthor       = 100
	exthTypeKF8Boundary  = 121
	exthTypeCoverOffset  = 201
	exthTypeThumbOffset  = 202
	exthTypeUpdatedTitle = 503
)

type palmDBHeader struct {
	name          string
	recordOffsets []int64
	fileSize      int64
}

type mobiHeaderInfo struct {
	title           string
	authors         []string
	fullName        string
	firstImageIndex uint32
	hasFirstImage   bool
	coverOffset     uint32
	hasCoverOffset  bool
	thumbOffset     uint32
	hasThumbOffset  bool
	kf8Boundary     uint32
	hasKF8Boundary  bool
}

func extractMOBIPreview(file *os.File) (*epubMetadata, []byte, string, error) {
	info, err := file.Stat()
	if err != nil {
		return &epubMetadata{}, nil, "", nil
	}
	meta, coverData, contentType := extractMOBIPreviewFromReaderAt(file, info.Size())
	return meta, coverData, contentType, nil
}

func extractMOBICover(file *os.File) ([]byte, string, error) {
	info, err := file.Stat()
	if err != nil {
		return nil, "", err
	}
	_, coverData, contentType := extractMOBIPreviewFromReaderAt(file, info.Size())
	if len(coverData) == 0 || contentType == "" {
		return nil, "", fmt.Errorf("封面不存在")
	}
	return coverData, contentType, nil
}

func extractMOBIPreviewFromReaderAt(r io.ReaderAt, fileSize int64) (*epubMetadata, []byte, string) {
	meta := &epubMetadata{}
	pdb, ok := readPalmDBHeader(r, fileSize)
	if !ok {
		return meta, nil, ""
	}

	info, ok := readAndParseMOBIHeaderRecord(r, pdb, 0)
	if !ok {
		if fallback := sanitizeExtractedMetadataValue(decodeWindows1252([]byte(pdb.name)), maxBookTitleRunes); fallback != "" {
			meta.Title = fallback
		}
		return meta, nil, ""
	}

	coverData, contentType, _ := extractMOBICoverFromPalmDB(r, pdb, info)

	// Combo MOBI6+KF8 files can store updated metadata or images in the KF8 boundary record.
	if info.hasKF8Boundary && info.kf8Boundary > 0 && int64(info.kf8Boundary) < int64(len(pdb.recordOffsets)) &&
		(info.title == "" || len(info.authors) == 0 || len(coverData) == 0) {
		if kf8Info, kf8OK := readAndParseMOBIHeaderRecord(r, pdb, int(info.kf8Boundary)); kf8OK {
			if info.title == "" {
				info.title = kf8Info.title
			}
			if info.fullName == "" {
				info.fullName = kf8Info.fullName
			}
			if len(info.authors) == 0 {
				info.authors = kf8Info.authors
			}
			if len(coverData) == 0 {
				coverData, contentType, _ = extractMOBICoverFromPalmDB(r, pdb, kf8Info)
			}
		}
	}

	switch {
	case info.title != "":
		meta.Title = info.title
	case info.fullName != "":
		meta.Title = info.fullName
	default:
		meta.Title = sanitizeExtractedMetadataValue(decodeWindows1252([]byte(pdb.name)), maxBookTitleRunes)
	}
	if len(info.authors) > 0 {
		meta.Author = sanitizeExtractedMetadataValue(strings.Join(info.authors, ", "), maxBookAuthorRunes)
	}

	return meta, coverData, contentType
}

func readPalmDBHeader(r io.ReaderAt, fileSize int64) (*palmDBHeader, bool) {
	if r == nil || fileSize < palmDBHeaderSize {
		return nil, false
	}
	header, err := readExactAt(r, 0, palmDBHeaderSize)
	if err != nil {
		return nil, false
	}
	numRecords := int(binary.BigEndian.Uint16(header[76:78]))
	if numRecords <= 0 {
		return nil, false
	}
	tableBytes := int64(numRecords) * palmDBRecordEntrySize
	if int64(palmDBHeaderSize)+tableBytes > fileSize {
		return nil, false
	}
	table, err := readExactAt(r, palmDBHeaderSize, int(tableBytes))
	if err != nil {
		return nil, false
	}
	offsets := make([]int64, numRecords)
	for i := range numRecords {
		offsets[i] = int64(binary.BigEndian.Uint32(table[i*palmDBRecordEntrySize : i*palmDBRecordEntrySize+4]))
	}
	rawName := header[:32]
	if nul := bytes.IndexByte(rawName, 0); nul >= 0 {
		rawName = rawName[:nul]
	}
	return &palmDBHeader{
		name:          string(rawName),
		recordOffsets: offsets,
		fileSize:      fileSize,
	}, true
}

func (h *palmDBHeader) recordRange(index int) (int64, int64, bool) {
	if h == nil || index < 0 || index >= len(h.recordOffsets) {
		return 0, 0, false
	}
	tableEnd := int64(palmDBHeaderSize) + int64(len(h.recordOffsets))*palmDBRecordEntrySize
	start := h.recordOffsets[index]
	if start < tableEnd || start >= h.fileSize {
		return 0, 0, false
	}
	end := h.fileSize
	if index+1 < len(h.recordOffsets) {
		nextStart := h.recordOffsets[index+1]
		if nextStart < start || nextStart > h.fileSize {
			return 0, 0, false
		}
		end = nextStart
	}
	size := end - start
	if size <= 0 {
		return 0, 0, false
	}
	return start, size, true
}

func readAndParseMOBIHeaderRecord(r io.ReaderAt, pdb *palmDBHeader, recordIndex int) (*mobiHeaderInfo, bool) {
	start, size, ok := pdb.recordRange(recordIndex)
	if !ok {
		return nil, false
	}
	readLen := min(size, int64(mobiMaxHeaderRecordBytes))
	rec0, err := readExactAt(r, start, int(readLen))
	if err != nil {
		return nil, false
	}
	return parseMOBIRecord0(rec0)
}

func parseMOBIRecord0(rec0 []byte) (*mobiHeaderInfo, bool) {
	if len(rec0) < mobiPalmDOCHeaderSize+8 || string(rec0[16:20]) != "MOBI" {
		return nil, false
	}
	headerLen := binary.BigEndian.Uint32(rec0[20:24])
	if headerLen < 16 {
		return nil, false
	}

	info := &mobiHeaderInfo{}
	encoding := uint32(mobiEncodingCP1252)
	if len(rec0) >= 32 && headerLen >= 16 {
		encoding = binary.BigEndian.Uint32(rec0[28:32])
	}

	if len(rec0) >= 92 && headerLen >= 76 {
		fullNameOff := uint64(binary.BigEndian.Uint32(rec0[84:88]))
		fullNameLen := uint64(binary.BigEndian.Uint32(rec0[88:92]))
		if fullNameLen > 0 && fullNameOff <= uint64(len(rec0)) && fullNameLen <= uint64(len(rec0))-fullNameOff {
			info.fullName = sanitizeExtractedMetadataValue(
				decodeMOBIText(rec0[fullNameOff:fullNameOff+fullNameLen], encoding),
				maxBookTitleRunes,
			)
		}
	}

	if len(rec0) >= 112 && headerLen >= 96 {
		idx := binary.BigEndian.Uint32(rec0[108:112])
		if idx != mobiNoIndex {
			info.firstImageIndex = idx
			info.hasFirstImage = true
		}
	}

	if len(rec0) >= 132 && headerLen >= 116 {
		exthFlags := binary.BigEndian.Uint32(rec0[128:132])
		if exthFlags&mobiEXTHFlagPresent != 0 {
			parseMOBIEXTH(rec0, uint64(mobiPalmDOCHeaderSize)+uint64(headerLen), encoding, info)
		}
	}

	return info, true
}

func parseMOBIEXTH(rec0 []byte, exthStart uint64, encoding uint32, info *mobiHeaderInfo) {
	if exthStart+12 > uint64(len(rec0)) || string(rec0[exthStart:exthStart+4]) != "EXTH" {
		return
	}
	exthLen := uint64(binary.BigEndian.Uint32(rec0[exthStart+4 : exthStart+8]))
	recordCount := binary.BigEndian.Uint32(rec0[exthStart+8 : exthStart+12])
	exthEnd := uint64(len(rec0))
	if exthLen >= 12 && exthLen <= uint64(len(rec0))-exthStart {
		exthEnd = exthStart + exthLen
	}

	seenAuthors := make(map[string]struct{})
	pos := exthStart + 12
	for i := uint32(0); i < recordCount && pos+8 <= exthEnd; i++ {
		recType := binary.BigEndian.Uint32(rec0[pos : pos+4])
		recLen := uint64(binary.BigEndian.Uint32(rec0[pos+4 : pos+8]))
		if recLen < 8 || recLen > exthEnd-pos {
			break
		}
		data := rec0[pos+8 : pos+recLen]
		switch recType {
		case exthTypeUpdatedTitle:
			if title := sanitizeExtractedMetadataValue(decodeMOBIText(data, encoding), maxBookTitleRunes); title != "" && info.title == "" {
				info.title = title
			}
		case exthTypeAuthor:
			if author := sanitizeExtractedMetadataValue(decodeMOBIText(data, encoding), maxBookAuthorRunes); author != "" {
				if _, exists := seenAuthors[author]; !exists {
					seenAuthors[author] = struct{}{}
					info.authors = append(info.authors, author)
				}
			}
		case exthTypeCoverOffset:
			if len(data) == 4 {
				if off := binary.BigEndian.Uint32(data); off != mobiNoIndex {
					info.coverOffset = off
					info.hasCoverOffset = true
				}
			}
		case exthTypeThumbOffset:
			if len(data) == 4 {
				if off := binary.BigEndian.Uint32(data); off != mobiNoIndex {
					info.thumbOffset = off
					info.hasThumbOffset = true
				}
			}
		case exthTypeKF8Boundary:
			if len(data) == 4 {
				if boundary := binary.BigEndian.Uint32(data); boundary != mobiNoIndex {
					info.kf8Boundary = boundary
					info.hasKF8Boundary = true
				}
			}
		}
		pos += recLen
	}
}

func extractMOBICoverFromPalmDB(r io.ReaderAt, pdb *palmDBHeader, info *mobiHeaderInfo) ([]byte, string, bool) {
	if !info.hasFirstImage {
		return nil, "", false
	}

	var candidates []uint64
	if info.hasCoverOffset {
		candidates = append(candidates, uint64(info.firstImageIndex)+uint64(info.coverOffset))
	}
	if info.hasThumbOffset && (!info.hasCoverOffset || info.thumbOffset != info.coverOffset) {
		candidates = append(candidates, uint64(info.firstImageIndex)+uint64(info.thumbOffset))
	}

	for _, candidate := range candidates {
		if candidate >= uint64(len(pdb.recordOffsets)) {
			continue
		}
		start, size, ok := pdb.recordRange(int(candidate))
		if !ok || size <= 0 || size > mobiMaxCoverBytes {
			continue
		}
		sniffLen := min(int(size), 512)
		sniff, err := readExactAt(r, start, sniffLen)
		if err != nil {
			continue
		}
		contentType := detectSafeCoverImageType(sniff)
		if contentType == "" {
			continue
		}
		if int64(sniffLen) == size {
			return sniff, contentType, true
		}
		data, err := readExactAt(r, start, int(size))
		if err != nil {
			continue
		}
		return data, contentType, true
	}

	return nil, "", false
}

func readExactAt(r io.ReaderAt, offset int64, length int) ([]byte, error) {
	if offset < 0 || length < 0 {
		return nil, io.ErrUnexpectedEOF
	}
	buf := make([]byte, length)
	n, err := r.ReadAt(buf, offset)
	if n == length && (err == nil || err == io.EOF) {
		return buf, nil
	}
	if err != nil {
		return nil, err
	}
	return nil, io.ErrUnexpectedEOF
}

func detectSafeCoverImageType(header []byte) string {
	switch {
	case len(header) >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF:
		return "image/jpeg"
	case len(header) >= 8 && bytes.Equal(header[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}):
		return "image/png"
	case len(header) >= 6 && (bytes.HasPrefix(header, []byte("GIF87a")) || bytes.HasPrefix(header, []byte("GIF89a"))):
		return "image/gif"
	case len(header) >= 12 && bytes.Equal(header[:4], []byte("RIFF")) && bytes.Equal(header[8:12], []byte("WEBP")):
		return "image/webp"
	default:
		return ""
	}
}

func decodeMOBIText(data []byte, encoding uint32) string {
	if len(data) == 0 {
		return ""
	}
	switch encoding {
	case mobiEncodingUTF8:
		if utf8.Valid(data) {
			return string(data)
		}
		return strings.ToValidUTF8(string(data), "")
	case mobiEncodingCP1252:
		return decodeWindows1252(data)
	default:
		if utf8.Valid(data) {
			return string(data)
		}
		return decodeWindows1252(data)
	}
}

var windows1252Table = [32]rune{
	0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
	0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F,
	0x0090, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
	0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178,
}

func decodeWindows1252(data []byte) string {
	var b strings.Builder
	b.Grow(len(data))
	for _, ch := range data {
		switch {
		case ch == 0:
			continue
		case ch < 0x80 || ch >= 0xA0:
			b.WriteRune(rune(ch))
		default:
			b.WriteRune(windows1252Table[ch-0x80])
		}
	}
	return b.String()
}

func sanitizeExtractedMetadataValue(raw string, maxRunes int) string {
	if raw == "" {
		return ""
	}
	if !utf8.ValidString(raw) {
		raw = strings.ToValidUTF8(raw, "")
	}
	var b strings.Builder
	b.Grow(len(raw))
	runeCount := 0
	inSpace := false
	for _, r := range raw {
		if r == 0 || r == '\uFEFF' {
			continue
		}
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			if b.Len() > 0 {
				inSpace = true
			}
			continue
		}
		if inSpace {
			if maxRunes > 0 && runeCount+1 >= maxRunes {
				break
			}
			b.WriteByte(' ')
			runeCount++
			inSpace = false
		}
		if maxRunes > 0 && runeCount >= maxRunes {
			break
		}
		b.WriteRune(r)
		runeCount++
	}
	return strings.TrimSpace(b.String())
}
