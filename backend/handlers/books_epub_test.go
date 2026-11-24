package handlers

import (
	"archive/zip"
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func encodeTestJPEG(t *testing.T, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func encodeTestPNG(t *testing.T, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func buildTestZipReader(t *testing.T, entries []struct {
	name string
	data []byte
}) *zip.Reader {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, entry := range entries {
		w, err := zw.Create(entry.name)
		if err != nil {
			t.Fatalf("create zip entry %s: %v", entry.name, err)
		}
		if _, err := w.Write(entry.data); err != nil {
			t.Fatalf("write zip entry %s: %v", entry.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("open zip reader: %v", err)
	}
	return zr
}

func TestExtractEPUBCoverSkipsNonImageCoverEntries(t *testing.T) {
	coverJPEG := encodeTestJPEG(t, color.RGBA{R: 200, G: 50, B: 50, A: 255})
	zr := buildTestZipReader(t, []struct {
		name string
		data []byte
	}{
		{name: "OEBPS/cover.xhtml", data: []byte("<html><body><img src='images/cover.jpg'/></body></html>")},
		{name: "OEBPS/cover.css", data: []byte("body { margin: 0; }")},
		{name: "OEBPS/images/cover.jpg", data: coverJPEG},
	})

	data, contentType, err := extractEPUBCoverFromReader(zr)
	if err != nil {
		t.Fatalf("expected cover image to be extracted, got error: %v", err)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("contentType = %q, want image/jpeg", contentType)
	}
	if !bytes.Equal(data, coverJPEG) {
		t.Fatal("extracted cover bytes do not match original JPEG")
	}
}

func TestExtractEPUBCoverPrefersEPUB3CoverImageProperty(t *testing.T) {
	epub3PNG := encodeTestPNG(t, color.RGBA{R: 40, G: 120, B: 220, A: 255})
	decoyJPEG := encodeTestJPEG(t, color.RGBA{R: 10, G: 10, B: 10, A: 255})

	containerXML := `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
	opfXML := `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>EPUB3 Book</dc:title>
    <dc:creator>Ada</dc:creator>
  </metadata>
  <manifest>
    <item id="hero" href="assets/book%20art.png" media-type="image/png" properties="cover-image"/>
    <item id="decoy" href="cover.jpg" media-type="image/jpeg"/>
  </manifest>
</package>`

	zr := buildTestZipReader(t, []struct {
		name string
		data []byte
	}{
		{name: "META-INF/container.xml", data: []byte(containerXML)},
		{name: "OPS/package.opf", data: []byte(opfXML)},
		{name: "OPS/cover.jpg", data: decoyJPEG},
		{name: "OPS/assets/book art.png", data: epub3PNG},
	})

	pkg, _ := readEPUBPackage(zr, indexEPUBEntries(zr))
	meta := metadataFromEPUBPackage(pkg)
	if meta.Title != "EPUB3 Book" || meta.Author != "Ada" {
		t.Fatalf("meta = %+v, want Title='EPUB3 Book' Author='Ada'", meta)
	}

	data, contentType, err := extractEPUBCoverFromReader(zr)
	if err != nil {
		t.Fatalf("extract cover: %v", err)
	}
	if contentType != "image/png" || !bytes.Equal(data, epub3PNG) {
		t.Fatalf("got contentType=%q len=%d, want EPUB3 PNG len=%d", contentType, len(data), len(epub3PNG))
	}
}

func TestIndexEPUBEntriesMatchesMixedCaseAndUnicodeNames(t *testing.T) {
	reader := buildTestZipReader(t, []struct {
		name string
		data []byte
	}{
		{name: "OPS/Kelvin-Sigma-Σ.png"},
		{name: "OPS/kelvin-sigma-σ.png"},
	})
	lookup := indexEPUBEntries(reader)

	// Non-exact matches use the same fold group and return the earliest entry.
	if got := lookup("ops/Kelvin-ſigma-ς.PNG"); got != reader.File[0] {
		t.Fatalf("folded match = %v, want first entry", got)
	}
	if got := lookup("OPS/kelvin-sigma-σ.png"); got != reader.File[1] {
		t.Fatalf("exact match = %v, want second entry", got)
	}
}

func TestFindEPUBOPFFileFallsBackToFirstMatchingExtension(t *testing.T) {
	reader := buildTestZipReader(t, []struct {
		name string
		data []byte
	}{
		{name: "a"},
		{name: "Book/ignored.OPF/"},
		{name: "Book/ignored.OPF.bak"},
		{name: "图书/Package.OpF"},
		{name: "Book/another.opf"},
	})
	if got := findEPUBOPFFile(reader, indexEPUBEntries(reader)); got != reader.File[3] {
		t.Fatalf("fallback match = %v, want %q", got, reader.File[3].Name)
	}
}

func TestExtractEPUBCoverUsesEPUB2MetaCover(t *testing.T) {
	frontJPEG := encodeTestJPEG(t, color.RGBA{R: 30, G: 180, B: 90, A: 255})

	containerXML := `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="book/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
	opfXML := `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>EPUB2 Book</dc:title>
    <dc:creator>Grace</dc:creator>
    <meta name="cover" content="front-img"/>
  </metadata>
  <manifest>
    <item id="front-img" href="img/front.jpg" media-type="image/jpeg"/>
  </manifest>
</package>`

	zr := buildTestZipReader(t, []struct {
		name string
		data []byte
	}{
		{name: "META-INF/container.xml", data: []byte(containerXML)},
		{name: "book/content.opf", data: []byte(opfXML)},
		{name: "book/img/front.jpg", data: frontJPEG},
	})

	data, contentType, err := extractEPUBCoverFromReader(zr)
	if err != nil {
		t.Fatalf("extract cover: %v", err)
	}
	if contentType != "image/jpeg" || !bytes.Equal(data, frontJPEG) {
		t.Fatalf("got contentType=%q len=%d, want EPUB2 JPEG len=%d", contentType, len(data), len(frontJPEG))
	}
}

func TestOpenUploadFileReadsRegularNestedUpload(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "library"), 0700); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join("library", "book.epub")
	if err := os.WriteFile(filepath.Join(dir, name), []byte("book"), 0600); err != nil {
		t.Fatal(err)
	}
	file, info, err := openUploadFile(dir, name)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if info.Name() != "book.epub" || info.Size() != 4 {
		t.Fatal("unexpected file metadata")
	}
	if dirFile, _, err := openUploadFile(dir, "library"); err == nil {
		dirFile.Close()
		t.Fatal("expected upload reads to require a regular file")
	}
}
