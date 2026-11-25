package handlers

import (
	"bytes"
	"io"
	"strconv"
	"strings"
)

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
