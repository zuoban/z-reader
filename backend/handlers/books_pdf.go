package handlers

import (
	"bytes"
	"encoding/binary"
	"encoding/xml"
	"io"
	"os"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

const (
	pdfHeadWindowBytes   = 512 * 1024
	pdfTailWindowBytes   = 512 * 1024
	pdfXrefWindowBytes   = 256 * 1024
	pdfObjectWindowBytes = 64 * 1024
	pdfMaxXMPPacketBytes = 256 * 1024
	pdfMaxStringBytes    = 4096
)

type pdfIndirectRef struct {
	objNum int
	genNum int
}

func extractPDFPreview(file *os.File) (*epubMetadata, []byte, string, error) {
	info, err := file.Stat()
	if err != nil {
		return &epubMetadata{}, nil, "", nil
	}
	meta := extractPDFMetadataFromReaderAt(file, info.Size())
	return meta, nil, "", nil
}

func extractPDFMetadataFromReaderAt(r io.ReaderAt, fileSize int64) *epubMetadata {
	meta := &epubMetadata{}
	if r == nil || fileSize <= 0 {
		return meta
	}

	var head, tail []byte
	if fileSize <= pdfHeadWindowBytes+pdfTailWindowBytes {
		buf, err := readExactAt(r, 0, int(fileSize))
		if err != nil {
			return meta
		}
		head = buf
		tail = buf
	} else {
		var err error
		head, err = readExactAt(r, 0, pdfHeadWindowBytes)
		if err != nil {
			return meta
		}
		tail, err = readExactAt(r, fileSize-pdfTailWindowBytes, pdfTailWindowBytes)
		if err != nil {
			return meta
		}
	}

	headerCheckLen := min(len(head), 1024)
	if !bytes.Contains(head[:headerCheckLen], []byte("%PDF-")) {
		return meta
	}

	// 1. Try XMP metadata packets (tail first for incremental updates, then head).
	xmpTitle, xmpAuthor := extractPDFXMPMetadata(tail)
	if (xmpTitle == "" || xmpAuthor == "") && len(head) > 0 && &head[0] != &tail[0] {
		ht, ha := extractPDFXMPMetadata(head)
		if xmpTitle == "" {
			xmpTitle = ht
		}
		if xmpAuthor == "" {
			xmpAuthor = ha
		}
	}

	// 2. Try PDF /Info dictionary entries if either field is still missing.
	var infoTitle, infoAuthor string
	if xmpTitle == "" || xmpAuthor == "" {
		infoTitle, infoAuthor = extractPDFInfoMetadata(r, fileSize, head, tail)
	}

	if xmpTitle != "" {
		meta.Title = xmpTitle
	} else {
		meta.Title = infoTitle
	}
	if xmpAuthor != "" {
		meta.Author = xmpAuthor
	} else {
		meta.Author = infoAuthor
	}
	return meta
}

func extractPDFXMPMetadata(window []byte) (string, string) {
	if len(window) == 0 {
		return "", ""
	}
	var title, author string
	search := window
	for len(search) > 0 {
		packet, rest, ok := nextXMPPacket(search)
		if !ok {
			break
		}
		search = rest
		t, a := parseXMPPacket(packet)
		if title == "" && t != "" {
			title = t
		}
		if author == "" && a != "" {
			author = a
		}
		if title != "" && author != "" {
			break
		}
	}
	return title, author
}

func nextXMPPacket(data []byte) ([]byte, []byte, bool) {
	startIdx := -1
	endMarker := []byte("</x:xmpmeta>")
	if idx := bytes.Index(data, []byte("<x:xmpmeta")); idx >= 0 {
		startIdx = idx
	} else if idx := bytes.Index(data, []byte("<?xpacket")); idx >= 0 {
		startIdx = idx
		endMarker = []byte("<?xpacket end")
	} else if idx := bytes.Index(data, []byte("<rdf:RDF")); idx >= 0 {
		startIdx = idx
		endMarker = []byte("</rdf:RDF>")
	}
	if startIdx < 0 {
		return nil, nil, false
	}

	segment := data[startIdx:]
	if len(segment) > pdfMaxXMPPacketBytes {
		segment = segment[:pdfMaxXMPPacketBytes]
	}

	endIdx := bytes.Index(segment, endMarker)
	if endIdx >= 0 {
		packetEnd := endIdx + len(endMarker)
		if bytes.Equal(endMarker, []byte("<?xpacket end")) {
			if closeIdx := bytes.Index(segment[packetEnd:], []byte("?>")); closeIdx >= 0 {
				packetEnd += closeIdx + 2
			}
		}
		return segment[:packetEnd], data[startIdx+packetEnd:], true
	}

	// If <x:xmpmeta> wasn't closed cleanly inside the window, try closing at </rdf:RDF>.
	if rdfEnd := bytes.Index(segment, []byte("</rdf:RDF>")); rdfEnd >= 0 {
		packetEnd := rdfEnd + len("</rdf:RDF>")
		return segment[:packetEnd], data[startIdx+packetEnd:], true
	}
	return nil, nil, false
}

func parseXMPPacket(packet []byte) (string, string) {
	// Skip leading <?xpacket ...?> processing instruction so XML decoder starts cleanly.
	if rdfStart := bytes.Index(packet, []byte("<x:xmpmeta")); rdfStart >= 0 {
		packet = packet[rdfStart:]
	} else if rdfStart := bytes.Index(packet, []byte("<rdf:RDF")); rdfStart >= 0 {
		packet = packet[rdfStart:]
	}

	decoder := xml.NewDecoder(bytes.NewReader(packet))
	decoder.Strict = false

	var title string
	var authors []string
	seenAuthors := make(map[string]struct{})

	addAuthor := func(val string) {
		val = sanitizeExtractedMetadataValue(val, maxBookAuthorRunes)
		if val == "" {
			return
		}
		if _, exists := seenAuthors[val]; !exists {
			seenAuthors[val] = struct{}{}
			authors = append(authors, val)
		}
	}

	for {
		tok, err := decoder.Token()
		if err != nil {
			break
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		if se.Name.Local == "Description" {
			for _, attr := range se.Attr {
				if title == "" && isDCName(attr.Name, "title") {
					title = sanitizeExtractedMetadataValue(attr.Value, maxBookTitleRunes)
				}
				if isDCName(attr.Name, "creator") {
					addAuthor(attr.Value)
				}
			}
			continue
		}
		if isDCName(se.Name, "title") && title == "" {
			title = sanitizeExtractedMetadataValue(readXMPTitleValue(decoder), maxBookTitleRunes)
		} else if isDCName(se.Name, "creator") {
			for _, item := range readXMPListValues(decoder) {
				addAuthor(item)
			}
		}
	}

	return title, sanitizeExtractedMetadataValue(strings.Join(authors, ", "), maxBookAuthorRunes)
}

func isDCName(name xml.Name, local string) bool {
	if !strings.EqualFold(name.Local, local) {
		return false
	}
	return name.Space == "http://purl.org/dc/elements/1.1/" || strings.EqualFold(name.Space, "dc")
}

func readXMPTitleValue(decoder *xml.Decoder) string {
	depth := 1
	var defaultTitle, firstTitle string
	var directText strings.Builder
	var liText strings.Builder
	inLI := false
	isDefaultLang := false

	for depth > 0 {
		tok, err := decoder.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if strings.EqualFold(t.Name.Local, "li") {
				inLI = true
				liText.Reset()
				isDefaultLang = false
				for _, attr := range t.Attr {
					if strings.EqualFold(attr.Name.Local, "lang") && strings.EqualFold(strings.TrimSpace(attr.Value), "x-default") {
						isDefaultLang = true
					}
				}
			}
		case xml.EndElement:
			if strings.EqualFold(t.Name.Local, "li") && inLI {
				val := strings.TrimSpace(liText.String())
				if val != "" {
					if firstTitle == "" {
						firstTitle = val
					}
					if isDefaultLang && defaultTitle == "" {
						defaultTitle = val
					}
				}
				inLI = false
			}
			depth--
		case xml.CharData:
			if inLI {
				liText.Write(t)
			} else if depth == 1 {
				directText.Write(t)
			}
		}
	}

	if defaultTitle != "" {
		return defaultTitle
	}
	if firstTitle != "" {
		return firstTitle
	}
	return strings.TrimSpace(directText.String())
}

func readXMPListValues(decoder *xml.Decoder) []string {
	depth := 1
	var values []string
	var directText strings.Builder
	var liText strings.Builder
	inLI := false

	for depth > 0 {
		tok, err := decoder.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if strings.EqualFold(t.Name.Local, "li") {
				inLI = true
				liText.Reset()
			}
		case xml.EndElement:
			if strings.EqualFold(t.Name.Local, "li") && inLI {
				if val := strings.TrimSpace(liText.String()); val != "" {
					values = append(values, val)
				}
				inLI = false
			}
			depth--
		case xml.CharData:
			if inLI {
				liText.Write(t)
			} else if depth == 1 {
				directText.Write(t)
			}
		}
	}

	if len(values) > 0 {
		return values
	}
	if val := strings.TrimSpace(directText.String()); val != "" {
		return []string{val}
	}
	return nil
}

func extractPDFInfoMetadata(r io.ReaderAt, fileSize int64, head, tail []byte) (string, string) {
	trailerDict := findLastPDFTrailerDict(tail)
	if trailerDict != nil {
		if hasPDFDictKey(trailerDict, "/Encrypt") {
			return "", ""
		}
		if inlineInfo := findInlinePDFInfoDict(trailerDict); inlineInfo != nil {
			return parsePDFInfoDict(inlineInfo, tail, head)
		}
		if ref, ok := findPDFDictIndirectRef(trailerDict, "/Info"); ok {
			if objDict := resolvePDFInfoObjectDict(r, fileSize, ref, tail, head); objDict != nil {
				return parsePDFInfoDict(objDict, tail, head)
			}
		}
	}

	// Fallback: scan for candidate Info dictionaries in tail then head.
	if title, author := scanWindowForPDFInfoDict(tail, tail, head); title != "" || author != "" {
		return title, author
	}
	if len(head) > 0 && &head[0] != &tail[0] {
		if title, author := scanWindowForPDFInfoDict(head, tail, head); title != "" || author != "" {
			return title, author
		}
	}
	return "", ""
}

func findLastPDFTrailerDict(tail []byte) []byte {
	if idx := bytes.LastIndex(tail, []byte("trailer")); idx >= 0 {
		if dict, _, ok := extractPDFDictionaryAt(tail, idx+len("trailer")); ok {
			return dict
		}
	}
	// PDF 1.5+ cross-reference streams embed trailer keys inside a /Type /XRef dictionary.
	if idx := bytes.LastIndex(tail, []byte("/XRef")); idx >= 0 {
		if start := bytes.LastIndex(tail[:idx], []byte("<<")); start >= 0 {
			if dict, _, ok := extractPDFDictionaryAt(tail, start); ok {
				return dict
			}
		}
	}
	return nil
}

func findInlinePDFInfoDict(trailerDict []byte) []byte {
	valStart, ok := findPDFDictKeyValueStart(trailerDict, "/Info")
	if !ok {
		return nil
	}
	if valStart+2 <= len(trailerDict) && trailerDict[valStart] == '<' && trailerDict[valStart+1] == '<' {
		dict, _, found := extractPDFDictionaryAt(trailerDict, valStart)
		if found {
			return dict
		}
	}
	return nil
}

func resolvePDFInfoObjectDict(r io.ReaderAt, fileSize int64, ref pdfIndirectRef, tail, head []byte) []byte {
	if dict := findIndirectObjectDictInWindow(tail, ref); dict != nil {
		return dict
	}
	if len(head) > 0 && &head[0] != &tail[0] {
		if dict := findIndirectObjectDictInWindow(head, ref); dict != nil {
			return dict
		}
	}
	xrefOffset, ok := findLastStartXref(tail)
	if !ok || xrefOffset <= 0 || xrefOffset >= fileSize {
		return nil
	}
	objOffset, ok := lookupXrefObjectOffset(r, fileSize, xrefOffset, ref.objNum)
	if !ok || objOffset < 0 || objOffset >= fileSize {
		return nil
	}
	readLen := min(int64(pdfObjectWindowBytes), fileSize-objOffset)
	window, err := readExactAt(r, objOffset, int(readLen))
	if err != nil {
		return nil
	}
	return findIndirectObjectDictInWindow(window, ref)
}

func findIndirectObjectDictInWindow(window []byte, ref pdfIndirectRef) []byte {
	marker := []byte(strconv.Itoa(ref.objNum) + " " + strconv.Itoa(ref.genNum) + " obj")
	pos := 0
	for pos < len(window) {
		idx := bytes.Index(window[pos:], marker)
		if idx < 0 {
			return nil
		}
		absIdx := pos + idx
		// Require token boundary before object number so "12 0 obj" doesn't match "2 0 obj".
		if absIdx > 0 && !isPDFDelimiterOrSpace(window[absIdx-1]) {
			pos = absIdx + len(marker)
			continue
		}
		after := absIdx + len(marker)
		if after < len(window) && !isPDFDelimiterOrSpace(window[after]) {
			pos = after
			continue
		}
		if dict, _, ok := extractPDFDictionaryAt(window, after); ok {
			return dict
		}
		pos = after
	}
	return nil
}

func findLastStartXref(tail []byte) (int64, bool) {
	idx := bytes.LastIndex(tail, []byte("startxref"))
	if idx < 0 {
		return 0, false
	}
	p := skipPDFWhitespaceAndComments(tail, idx+len("startxref"))
	start := p
	for p < len(tail) && tail[p] >= '0' && tail[p] <= '9' {
		p++
	}
	if p == start {
		return 0, false
	}
	val, err := strconv.ParseInt(string(tail[start:p]), 10, 64)
	if err != nil || val <= 0 {
		return 0, false
	}
	return val, true
}

func lookupXrefObjectOffset(r io.ReaderAt, fileSize, xrefOffset int64, targetObj int) (int64, bool) {
	readLen := min(int64(pdfXrefWindowBytes), fileSize-xrefOffset)
	buf, err := readExactAt(r, xrefOffset, int(readLen))
	if err != nil {
		return 0, false
	}
	p := skipPDFWhitespaceAndComments(buf, 0)
	if !bytes.HasPrefix(buf[p:], []byte("xref")) {
		return 0, false
	}
	p += len("xref")

	for p < len(buf) {
		p = skipPDFWhitespaceAndComments(buf, p)
		if p >= len(buf) || bytes.HasPrefix(buf[p:], []byte("trailer")) {
			break
		}
		firstObj, nextP, ok := readPDFInt(buf, p)
		if !ok {
			break
		}
		count, nextP, ok := readPDFInt(buf, nextP)
		if !ok || count < 0 {
			break
		}
		p = skipPDFLineEnd(buf, nextP)

		if targetObj >= firstObj && targetObj < firstObj+count {
			entryPos := p + (targetObj-firstObj)*20
			if entryPos+18 <= len(buf) {
				entry := buf[entryPos : entryPos+18]
				if entry[17] == 'n' {
					off, err := strconv.ParseInt(strings.TrimSpace(string(entry[:10])), 10, 64)
					if err == nil && off > 0 && off < fileSize {
						return off, true
					}
				}
			}
			return 0, false
		}
		advance := count * 20
		if advance < 0 || advance > len(buf)-p {
			break
		}
		p += advance
	}
	return 0, false
}

func scanWindowForPDFInfoDict(window, tail, head []byte) (string, string) {
	pos := 0
	for pos < len(window) {
		idx := bytes.Index(window[pos:], []byte("<<"))
		if idx < 0 {
			break
		}
		start := pos + idx
		dict, end, ok := extractPDFDictionaryAt(window, start)
		if !ok {
			pos = start + 2
			continue
		}
		pos = end
		if isLikelyPDFInfoDict(dict) {
			title, author := parsePDFInfoDict(dict, tail, head)
			if title != "" || author != "" {
				return title, author
			}
		}
	}
	return "", ""
}

func isLikelyPDFInfoDict(dict []byte) bool {
	if !hasPDFDictKey(dict, "/Title") && !hasPDFDictKey(dict, "/Author") {
		return false
	}
	// Reject non-Info dictionaries (outlines/bookmarks, pages, annotations, fonts, catalogs).
	for _, disallowed := range []string{"/Parent", "/Dest", "/Subtype", "/Type", "/Encrypt", "/Kids"} {
		if hasPDFDictKey(dict, disallowed) {
			return false
		}
	}
	return true
}

func parsePDFInfoDict(dict, tail, head []byte) (string, string) {
	title := extractPDFInfoField(dict, "/Title", tail, head, maxBookTitleRunes)
	author := extractPDFInfoField(dict, "/Author", tail, head, maxBookAuthorRunes)
	return title, author
}

func extractPDFInfoField(dict []byte, key string, tail, head []byte, maxRunes int) string {
	valStart, ok := findPDFDictKeyValueStart(dict, key)
	if !ok || valStart >= len(dict) {
		return ""
	}
	raw, ok := parsePDFStringValue(dict, valStart)
	if !ok {
		// Support simple indirect string reference (/Title 10 0 R) when present in our windows.
		if ref, refOK := parsePDFIndirectRef(dict, valStart); refOK {
			raw, ok = findIndirectStringInWindows(ref, tail, head)
		}
	}
	if !ok || len(raw) == 0 {
		return ""
	}
	return sanitizeExtractedMetadataValue(decodePDFString(raw), maxRunes)
}

func findIndirectStringInWindows(ref pdfIndirectRef, tail, head []byte) ([]byte, bool) {
	for _, win := range [][]byte{tail, head} {
		if len(win) == 0 {
			continue
		}
		marker := []byte(strconv.Itoa(ref.objNum) + " " + strconv.Itoa(ref.genNum) + " obj")
		pos := 0
		for pos < len(win) {
			idx := bytes.Index(win[pos:], marker)
			if idx < 0 {
				break
			}
			absIdx := pos + idx
			after := absIdx + len(marker)
			if (absIdx == 0 || isPDFDelimiterOrSpace(win[absIdx-1])) &&
				(after == len(win) || isPDFDelimiterOrSpace(win[after])) {
				valStart := skipPDFWhitespaceAndComments(win, after)
				if raw, ok := parsePDFStringValue(win, valStart); ok {
					return raw, true
				}
			}
			pos = after
		}
	}
	return nil, false
}

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
