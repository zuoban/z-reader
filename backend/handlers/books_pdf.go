package handlers

import (
	"bytes"
	"io"
	"os"
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
