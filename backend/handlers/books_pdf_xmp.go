package handlers

import (
	"bytes"
	"encoding/xml"
	"strings"
)

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
	for len(data) > 0 {
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

		data = data[startIdx+1:]
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
