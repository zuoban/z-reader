package handlers

import (
	"encoding/binary"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

func extractPDFDictionaryAt(data []byte, start int) ([]byte, int, bool) {
	p := skipPDFWhitespaceAndComments(data, start)
	if p+2 > len(data) || data[p] != '<' || data[p+1] != '<' {
		return nil, start, false
	}
	dictStart := p
	p += 2
	depth := 1
	maxEnd := min(len(data), dictStart+pdfObjectWindowBytes)

	for p < maxEnd && depth > 0 {
		switch data[p] {
		case '(':
			_, nextP, ok := parsePDFLiteralString(data, p)
			if !ok {
				return nil, dictStart + 2, false
			}
			p = nextP
		case '%':
			p = skipPDFComment(data, p)
		case '<':
			if p+1 < maxEnd && data[p+1] == '<' {
				depth++
				p += 2
			} else {
				_, nextP, ok := parsePDFHexString(data, p)
				if !ok {
					p++
				} else {
					p = nextP
				}
			}
		case '>':
			if p+1 < maxEnd && data[p+1] == '>' {
				depth--
				p += 2
			} else {
				p++
			}
		default:
			p++
		}
	}
	if depth != 0 {
		return nil, dictStart + 2, false
	}
	return data[dictStart:p], p, true
}

func hasPDFDictKey(dict []byte, key string) bool {
	_, ok := findPDFDictKeyValueStart(dict, key)
	return ok
}

func findPDFDictIndirectRef(dict []byte, key string) (pdfIndirectRef, bool) {
	valStart, ok := findPDFDictKeyValueStart(dict, key)
	if !ok {
		return pdfIndirectRef{}, false
	}
	return parsePDFIndirectRef(dict, valStart)
}

// findPDFDictKeyValueStart walks top-level key-value pairs of a PDF dictionary
// (<< ... >>) and returns the start index of the value token for key.
func findPDFDictKeyValueStart(dict []byte, key string) (int, bool) {
	if len(dict) < 4 || dict[0] != '<' || dict[1] != '<' {
		return 0, false
	}
	p := 2
	end := len(dict) - 2

	for p < end {
		p = skipPDFWhitespaceAndComments(dict, p)
		if p >= end {
			break
		}
		if dict[p] != '/' {
			// Skip unexpected token safely to avoid infinite loops on malformed dicts.
			next := skipPDFValue(dict, p, end)
			if next <= p {
				p++
			} else {
				p = next
			}
			continue
		}
		nameStart := p
		p++
		for p < end && !isPDFDelimiterOrSpace(dict[p]) {
			p++
		}
		name := string(dict[nameStart:p])
		valStart := skipPDFWhitespaceAndComments(dict, p)
		if valStart >= end {
			break
		}
		if name == key {
			return valStart, true
		}
		next := skipPDFValue(dict, valStart, end)
		if next <= valStart {
			p = valStart + 1
		} else {
			p = next
		}
	}
	return 0, false
}

func skipPDFValue(data []byte, start, limit int) int {
	p := skipPDFWhitespaceAndComments(data, start)
	if p >= limit {
		return limit
	}
	switch data[p] {
	case '(':
		if _, next, ok := parsePDFLiteralString(data[:limit], p); ok {
			return next
		}
		return limit
	case '<':
		if p+1 < limit && data[p+1] == '<' {
			if _, next, ok := extractPDFDictionaryAt(data[:limit], p); ok {
				return next
			}
			return limit
		}
		if _, next, ok := parsePDFHexString(data[:limit], p); ok {
			return next
		}
		return p + 1
	case '[':
		return skipPDFArray(data, p, limit)
	case '/':
		p++
		for p < limit && !isPDFDelimiterOrSpace(data[p]) {
			p++
		}
		return p
	default:
		if _, ok := parsePDFIndirectRef(data[:limit], p); ok {
			// Skip "objNum genNum R".
			_, p, _ = readPDFInt(data[:limit], p)
			_, p, _ = readPDFInt(data[:limit], p)
			p = skipPDFWhitespaceAndComments(data[:limit], p)
			if p < limit && data[p] == 'R' {
				p++
			}
			return p
		}
		for p < limit && !isPDFDelimiterOrSpace(data[p]) {
			p++
		}
		return p
	}
}

func skipPDFArray(data []byte, start, limit int) int {
	p := start + 1
	depth := 1
	for p < limit && depth > 0 {
		switch data[p] {
		case '(':
			if _, next, ok := parsePDFLiteralString(data[:limit], p); ok {
				p = next
			} else {
				return limit
			}
		case '%':
			p = skipPDFComment(data[:limit], p)
		case '<':
			if p+1 < limit && data[p+1] == '<' {
				if _, next, ok := extractPDFDictionaryAt(data[:limit], p); ok {
					p = next
				} else {
					return limit
				}
			} else if _, next, ok := parsePDFHexString(data[:limit], p); ok {
				p = next
			} else {
				p++
			}
		case '[':
			depth++
			p++
		case ']':
			depth--
			p++
		default:
			p++
		}
	}
	return p
}

func parsePDFStringValue(data []byte, start int) ([]byte, bool) {
	if start >= len(data) {
		return nil, false
	}
	switch data[start] {
	case '(':
		val, _, ok := parsePDFLiteralString(data, start)
		return val, ok
	case '<':
		if start+1 < len(data) && data[start+1] == '<' {
			return nil, false
		}
		val, _, ok := parsePDFHexString(data, start)
		return val, ok
	default:
		return nil, false
	}
}

func parsePDFLiteralString(data []byte, start int) ([]byte, int, bool) {
	if start >= len(data) || data[start] != '(' {
		return nil, start, false
	}
	out := make([]byte, 0, 64)
	depth := 1
	p := start + 1

	for p < len(data) && depth > 0 {
		ch := data[p]
		switch ch {
		case '\\':
			p++
			if p >= len(data) {
				return nil, p, false
			}
			esc := data[p]
			switch esc {
			case 'n':
				if len(out) < pdfMaxStringBytes {
					out = append(out, '\n')
				}
				p++
			case 'r':
				if len(out) < pdfMaxStringBytes {
					out = append(out, '\r')
				}
				p++
			case 't':
				if len(out) < pdfMaxStringBytes {
					out = append(out, '\t')
				}
				p++
			case 'b':
				if len(out) < pdfMaxStringBytes {
					out = append(out, '\b')
				}
				p++
			case 'f':
				if len(out) < pdfMaxStringBytes {
					out = append(out, '\f')
				}
				p++
			case '(', ')', '\\':
				if len(out) < pdfMaxStringBytes {
					out = append(out, esc)
				}
				p++
			case '\r':
				p++
				if p < len(data) && data[p] == '\n' {
					p++
				}
			case '\n':
				p++
			default:
				if esc >= '0' && esc <= '7' {
					val := int(esc - '0')
					p++
					for digits := 1; digits < 3 && p < len(data) && data[p] >= '0' && data[p] <= '7'; digits++ {
						val = val*8 + int(data[p]-'0')
						p++
					}
					if len(out) < pdfMaxStringBytes {
						out = append(out, byte(val&0xFF))
					}
				} else {
					if len(out) < pdfMaxStringBytes {
						out = append(out, esc)
					}
					p++
				}
			}
		case '(':
			depth++
			if len(out) < pdfMaxStringBytes {
				out = append(out, '(')
			}
			p++
		case ')':
			depth--
			if depth > 0 && len(out) < pdfMaxStringBytes {
				out = append(out, ')')
			}
			p++
		case '\r':
			if len(out) < pdfMaxStringBytes {
				out = append(out, '\n')
			}
			p++
			if p < len(data) && data[p] == '\n' {
				p++
			}
		default:
			if len(out) < pdfMaxStringBytes {
				out = append(out, ch)
			}
			p++
		}
	}
	if depth != 0 {
		return nil, p, false
	}
	return out, p, true
}

func parsePDFHexString(data []byte, start int) ([]byte, int, bool) {
	if start >= len(data) || data[start] != '<' {
		return nil, start, false
	}
	out := make([]byte, 0, 64)
	p := start + 1
	hasHigh := false
	var high byte

	for p < len(data) {
		ch := data[p]
		p++
		if ch == '>' {
			if hasHigh && len(out) < pdfMaxStringBytes {
				out = append(out, high<<4)
			}
			return out, p, true
		}
		if isPDFWhitespace(ch) {
			continue
		}
		nibble, ok := hexNibble(ch)
		if !ok {
			return nil, p, false
		}
		if !hasHigh {
			high = nibble
			hasHigh = true
		} else {
			if len(out) < pdfMaxStringBytes {
				out = append(out, (high<<4)|nibble)
			}
			hasHigh = false
		}
	}
	return nil, p, false
}

func hexNibble(ch byte) (byte, bool) {
	switch {
	case ch >= '0' && ch <= '9':
		return ch - '0', true
	case ch >= 'a' && ch <= 'f':
		return ch - 'a' + 10, true
	case ch >= 'A' && ch <= 'F':
		return ch - 'A' + 10, true
	default:
		return 0, false
	}
}

func parsePDFIndirectRef(data []byte, start int) (pdfIndirectRef, bool) {
	objNum, p, ok := readPDFInt(data, start)
	if !ok || objNum <= 0 {
		return pdfIndirectRef{}, false
	}
	genNum, p, ok := readPDFInt(data, p)
	if !ok || genNum < 0 {
		return pdfIndirectRef{}, false
	}
	p = skipPDFWhitespaceAndComments(data, p)
	if p >= len(data) || data[p] != 'R' {
		return pdfIndirectRef{}, false
	}
	if p+1 < len(data) && !isPDFDelimiterOrSpace(data[p+1]) {
		return pdfIndirectRef{}, false
	}
	return pdfIndirectRef{objNum: objNum, genNum: genNum}, true
}

func readPDFInt(data []byte, start int) (int, int, bool) {
	p := skipPDFWhitespaceAndComments(data, start)
	numStart := p
	for p < len(data) && data[p] >= '0' && data[p] <= '9' {
		p++
	}
	if p == numStart || p-numStart > 10 {
		return 0, start, false
	}
	val, err := strconv.Atoi(string(data[numStart:p]))
	if err != nil {
		return 0, start, false
	}
	return val, p, true
}

func skipPDFWhitespaceAndComments(data []byte, p int) int {
	for p < len(data) {
		if isPDFWhitespace(data[p]) {
			p++
			continue
		}
		if data[p] == '%' {
			p = skipPDFComment(data, p)
			continue
		}
		break
	}
	return p
}

func skipPDFComment(data []byte, p int) int {
	for p < len(data) && data[p] != '\n' && data[p] != '\r' {
		p++
	}
	return p
}

func skipPDFLineEnd(data []byte, p int) int {
	for p < len(data) && (data[p] == ' ' || data[p] == '\t') {
		p++
	}
	if p < len(data) && data[p] == '\r' {
		p++
		if p < len(data) && data[p] == '\n' {
			p++
		}
	} else if p < len(data) && data[p] == '\n' {
		p++
	}
	return p
}

func isPDFWhitespace(ch byte) bool {
	return ch == 0x00 || ch == '\t' || ch == '\n' || ch == '\f' || ch == '\r' || ch == ' '
}

func isPDFDelimiterOrSpace(ch byte) bool {
	if isPDFWhitespace(ch) {
		return true
	}
	switch ch {
	case '(', ')', '<', '>', '[', ']', '{', '}', '/', '%':
		return true
	default:
		return false
	}
}

func decodePDFString(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	// UTF-16BE with BOM
	if len(raw) >= 2 && raw[0] == 0xFE && raw[1] == 0xFF {
		return decodeUTF16(raw[2:], binary.BigEndian)
	}
	// UTF-16LE with BOM
	if len(raw) >= 2 && raw[0] == 0xFF && raw[1] == 0xFE {
		return decodeUTF16(raw[2:], binary.LittleEndian)
	}
	// UTF-8 with BOM
	if len(raw) >= 3 && raw[0] == 0xEF && raw[1] == 0xBB && raw[2] == 0xBF {
		return strings.ToValidUTF8(string(raw[3:]), "")
	}
	// Valid UTF-8 (handles ASCII and modern UTF-8 PDFs without BOM)
	if utf8.Valid(raw) {
		return string(raw)
	}
	return decodePDFDocEncoding(raw)
}

func decodeUTF16(data []byte, order binary.ByteOrder) string {
	pairCount := len(data) / 2
	if pairCount == 0 {
		return ""
	}
	u16 := make([]uint16, pairCount)
	for i := range pairCount {
		u16[i] = order.Uint16(data[i*2 : i*2+2])
	}
	return string(utf16.Decode(u16))
}

// PDFDocEncoding mapping for 0x80..0xA0 per PDF 1.7 Annex D.2.
var pdfDocEncoding80A0 = [33]rune{
	0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x0192, 0x2044,
	0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C, 0x201D, 0x2018,
	0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x0141, 0x0152, 0x0160,
	0x0178, 0x017D, 0x0131, 0x0142, 0x0153, 0x0161, 0x017E, 0xFFFD,
	0x20AC,
}

func decodePDFDocEncoding(data []byte) string {
	var b strings.Builder
	b.Grow(len(data))
	for _, ch := range data {
		switch {
		case ch == 0:
			continue
		case ch < 0x80 || ch > 0xA0:
			b.WriteRune(rune(ch))
		default:
			r := pdfDocEncoding80A0[ch-0x80]
			if r != 0xFFFD {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}
