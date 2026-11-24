package handlers

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"unicode"
)

type epubMetadata struct {
	Title  string `xml:"title"`
	Author string `xml:"creator"`
}

type epubContainer struct {
	Rootfiles []struct {
		FullPath string `xml:"full-path,attr"`
	} `xml:"rootfiles>rootfile"`
}

type epubPackage struct {
	Metadata struct {
		Title  string `xml:"title"`
		Author string `xml:"creator"`
		Metas  []struct {
			Name    string `xml:"name,attr"`
			Content string `xml:"content,attr"`
		} `xml:"meta"`
	} `xml:"metadata"`
	Manifest struct {
		Items []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		} `xml:"item"`
	} `xml:"manifest"`
}

func writeNormalizedEPUBZip(reader *zip.Reader, root string, dst io.Writer, maxExpandedBytes int64) (err error) {
	if maxExpandedBytes <= 0 {
		maxExpandedBytes = maxEPUBExpandedBytes
	}
	writer := zip.NewWriter(dst)
	defer func() {
		if err != nil {
			_ = writer.Close()
		}
	}()
	var copiedBytes int64
	var copyBuffer []byte
	for _, entry := range reader.File {
		normalizedName, ok := stripEPUBPackageRoot(entry.Name, root)
		if !ok || normalizedName == "" || strings.HasSuffix(normalizedName, "/") {
			continue
		}
		if strings.HasPrefix(normalizedName, "../") || strings.Contains(normalizedName, "/../") {
			continue
		}

		header := entry.FileHeader
		header.Name = normalizedName
		if header.Name == "mimetype" {
			header.Method = zip.Store
		}

		entryReader, err := entry.Open()
		if err != nil {
			return err
		}
		target, err := writer.CreateHeader(&header)
		if err != nil {
			entryReader.Close()
			return err
		}
		remaining := maxExpandedBytes - copiedBytes
		if remaining < 0 {
			entryReader.Close()
			return fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		if copyBuffer == nil {
			copyBuffer = make([]byte, 32*1024)
		}
		copied, err := io.CopyBuffer(target, io.LimitReader(entryReader, remaining+1), copyBuffer)
		if err != nil {
			entryReader.Close()
			return err
		}
		if copied > remaining {
			entryReader.Close()
			return fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		copiedBytes += copied
		if err := entryReader.Close(); err != nil {
			return err
		}
	}

	return writer.Close()
}

func isValidEPUBFile(file *multipart.FileHeader, maxExpandedBytes int64) bool {
	return validateEPUBFile(file, maxExpandedBytes) == nil
}

func validateEPUBFile(file *multipart.FileHeader, maxExpandedBytes int64) error {
	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("读取 EPUB 文件失败")
	}
	defer src.Close()

	reader, err := zip.NewReader(src, file.Size)
	if err != nil {
		return fmt.Errorf("上传文件与 EPUB 格式不匹配")
	}
	if err := validateEPUBArchive(reader, maxExpandedBytes); err != nil {
		return err
	}

	hasMimetype := false
	hasContainer := false
	for _, entry := range reader.File {
		name := normalizeEPUBZipEntryName(entry.Name)
		switch name {
		case "mimetype":
			data, err := readZipFileWithLimit(entry, 128)
			if err != nil {
				return fmt.Errorf("上传文件与 EPUB 格式不匹配")
			}
			hasMimetype = strings.TrimSpace(string(data)) == "application/epub+zip"
		case "meta-inf/container.xml":
			hasContainer = true
		}
	}

	if !hasMimetype && !hasContainer {
		return fmt.Errorf("上传文件与 EPUB 格式不匹配")
	}
	return nil
}

func validateEPUBArchive(reader *zip.Reader, maxExpandedBytes int64) error {
	if maxExpandedBytes <= 0 {
		maxExpandedBytes = maxEPUBExpandedBytes
	}
	if len(reader.File) > maxEPUBArchiveEntries {
		return fmt.Errorf("EPUB 包含过多文件")
	}

	var total uint64
	limit := uint64(maxExpandedBytes)
	for _, entry := range reader.File {
		if strings.HasSuffix(entry.Name, "/") {
			continue
		}
		if entry.UncompressedSize64 > limit || total > limit-entry.UncompressedSize64 {
			return fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		total += entry.UncompressedSize64
	}
	return nil
}

func maxEPUBExpansionLimit(uploadLimit int64) int64 {
	if uploadLimit > 0 && uploadLimit < maxEPUBExpandedBytes/4 {
		return uploadLimit * 4
	}
	return maxEPUBExpandedBytes
}

func normalizeEPUBZipEntryName(name string) string {
	normalized := strings.ToLower(strings.TrimLeft(name, "/"))
	root, rest, found := strings.Cut(normalized, "/")
	if found && strings.HasSuffix(root, ".epub") {
		return rest
	}
	return normalized
}

func epubPackageRoot(reader *zip.Reader) (string, bool) {
	var root string
	for _, entry := range reader.File {
		name := strings.ToLower(strings.TrimLeft(entry.Name, "/"))
		candidate, rest, found := strings.Cut(name, "/")
		if !found || !strings.HasSuffix(candidate, ".epub") ||
			(rest != "mimetype" && rest != "meta-inf/container.xml") {
			continue
		}
		if root != "" && root != candidate {
			return "", false
		}
		root = candidate
	}
	if root == "" {
		return "", false
	}
	return root + "/", true
}

func stripEPUBPackageRoot(name string, root string) (string, bool) {
	trimmed := strings.TrimLeft(name, "/")
	if len(trimmed) < len(root) || !strings.EqualFold(trimmed[:len(root)], root) {
		return "", false
	}
	return strings.TrimLeft(trimmed[len(root):], "/"), true
}

func extractBookPreview(file *os.File, format string) (*epubMetadata, []byte, string, error) {
	switch format {
	case "epub":
		return extractEPUBPreview(file)
	default:
		return nil, nil, "", fmt.Errorf("metadata extraction not implemented for %s", format)
	}
}

func openStoredEPUB(file *os.File) (*zip.Reader, error) {
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	reader, err := zip.NewReader(file, info.Size())
	if err != nil {
		return nil, err
	}
	if err := validateEPUBArchive(reader, maxEPUBExpandedBytes); err != nil {
		return nil, err
	}
	return reader, nil
}

func extractEPUBPreview(file *os.File) (*epubMetadata, []byte, string, error) {
	r, err := openStoredEPUB(file)
	if err != nil {
		return nil, nil, "", err
	}
	lookup := indexEPUBEntries(r)
	pkg, opfDir := readEPUBPackage(r, lookup)
	meta := metadataFromEPUBPackage(pkg)
	coverData, contentType, coverErr := extractEPUBCoverCandidate(r, lookup, pkg, opfDir)
	if coverErr != nil {
		// A cover is optional and should not make an otherwise valid upload fail.
		return meta, nil, "", nil
	}
	return meta, coverData, contentType, nil
}

func indexEPUBEntries(reader *zip.Reader) func(string) *zip.File {
	exact := make(map[string]*zip.File, len(reader.File))
	folded := make(map[string]*zip.File, len(reader.File))
	for _, file := range reader.File {
		if strings.HasSuffix(file.Name, "/") {
			continue
		}
		name := cleanEPUBEntryName(file.Name)
		if exact[name] == nil {
			exact[name] = file
		}
		key := foldEPUBName(name)
		if folded[key] == nil {
			folded[key] = file
		}
	}
	return func(name string) *zip.File {
		name = cleanEPUBEntryName(name)
		if name == "." || name == ".." || strings.HasPrefix(name, "../") {
			return nil
		}
		if file := exact[name]; file != nil {
			return file
		}
		return folded[foldEPUBName(name)]
	}
}

// Canonicalize the same Unicode case-fold groups as strings.EqualFold.
func foldEPUBName(name string) string {
	return strings.Map(func(char rune) rune {
		// ASCII letters have the uppercase ASCII rune as their group minimum,
		// including K and S, whose fold groups also contain non-ASCII runes.
		if char <= unicode.MaxASCII {
			if 'a' <= char && char <= 'z' {
				return char - ('a' - 'A')
			}
			return char
		}
		canonical := char
		for next := unicode.SimpleFold(char); next != char; next = unicode.SimpleFold(next) {
			canonical = min(canonical, next)
		}
		return canonical
	}, name)
}

func cleanEPUBEntryName(name string) string {
	return path.Clean(strings.TrimLeft(strings.ReplaceAll(name, "\\", "/"), "/"))
}

func findEPUBOPFFile(reader *zip.Reader, lookup func(string) *zip.File) *zip.File {
	if containerFile := lookup("META-INF/container.xml"); containerFile != nil {
		if data, err := readZipFileWithLimit(containerFile, maxEPUBMetadataBytes); err == nil {
			var container epubContainer
			if err := xml.Unmarshal(data, &container); err == nil {
				for _, rf := range container.Rootfiles {
					fullPath := strings.TrimSpace(rf.FullPath)
					if fullPath == "" {
						continue
					}
					if f := lookup(fullPath); f != nil {
						return f
					}
				}
			}
		}
	}

	if f := lookup("OEBPS/content.opf"); f != nil {
		return f
	}
	const extension = ".opf"
	for _, f := range reader.File {
		name := f.Name
		if len(name) >= len(extension) && strings.EqualFold(name[len(name)-len(extension):], extension) {
			return f
		}
	}
	return nil
}

func parseEPUBPackage(opfFile *zip.File) (*epubPackage, string, error) {
	data, err := readZipFileWithLimit(opfFile, maxEPUBMetadataBytes)
	if err != nil {
		return nil, "", err
	}
	var pkg epubPackage
	if err := xml.Unmarshal(data, &pkg); err != nil {
		return nil, "", err
	}
	cleanOPF := cleanEPUBEntryName(opfFile.Name)
	opfDir := path.Dir(cleanOPF)
	if opfDir == "." {
		opfDir = ""
	}
	return &pkg, opfDir, nil
}

func resolveEPUBRelativePath(baseDir, href string) (string, bool) {
	trimmed := strings.TrimSpace(href)
	if trimmed == "" {
		return "", false
	}
	if idx := strings.IndexAny(trimmed, "#?"); idx >= 0 {
		trimmed = trimmed[:idx]
	}
	if unescaped, err := url.PathUnescape(trimmed); err == nil {
		trimmed = unescaped
	}
	trimmed = strings.ReplaceAll(trimmed, "\\", "/")
	joined := trimmed
	if baseDir != "" && !strings.HasPrefix(trimmed, "/") {
		joined = baseDir + "/" + trimmed
	}
	cleaned := path.Clean(strings.TrimLeft(joined, "/"))
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", false
	}
	return cleaned, true
}

func readEPUBImageEntry(f *zip.File) ([]byte, string, bool) {
	if f == nil || strings.HasSuffix(f.Name, "/") {
		return nil, "", false
	}
	data, err := readZipFileWithLimit(f, maxEPUBCoverBytes)
	if err != nil || len(data) == 0 {
		return nil, "", false
	}
	contentType := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		return nil, "", false
	}
	return data, contentType, true
}

func hasXMLProperty(properties, target string) bool {
	for _, field := range strings.Fields(properties) {
		if field == target {
			return true
		}
	}
	return false
}

func metadataFromEPUBPackage(pkg *epubPackage) *epubMetadata {
	if pkg == nil {
		return &epubMetadata{}
	}
	return &epubMetadata{Title: pkg.Metadata.Title, Author: pkg.Metadata.Author}
}

func readEPUBPackage(reader *zip.Reader, lookup func(string) *zip.File) (*epubPackage, string) {
	if file := findEPUBOPFFile(reader, lookup); file != nil {
		pkg, dir, err := parseEPUBPackage(file)
		if err == nil {
			return pkg, dir
		}
	}
	return nil, ""
}

func extractEPUBCover(file *os.File) ([]byte, string, error) {
	r, err := openStoredEPUB(file)
	if err != nil {
		return nil, "", err
	}
	return extractEPUBCoverFromReader(r)
}

func extractEPUBCoverFromReader(reader *zip.Reader) ([]byte, string, error) {
	lookup := indexEPUBEntries(reader)
	pkg, opfDir := readEPUBPackage(reader, lookup)
	return extractEPUBCoverCandidate(reader, lookup, pkg, opfDir)
}

func extractEPUBCoverCandidate(
	reader *zip.Reader, lookup func(string) *zip.File, pkg *epubPackage, opfDir string,
) ([]byte, string, error) {
	checked := make(map[*zip.File]bool)
	readCandidate := func(file *zip.File) ([]byte, string, bool) {
		if file == nil || checked[file] {
			return nil, "", false
		}
		checked[file] = true
		return readEPUBImageEntry(file)
	}
	if pkg != nil {
		var candidateHrefs []string
		seen := make(map[string]struct{})
		addHref := func(href string) {
			resolved, ok := resolveEPUBRelativePath(opfDir, href)
			if !ok {
				return
			}
			if _, exists := seen[resolved]; exists {
				return
			}
			seen[resolved] = struct{}{}
			candidateHrefs = append(candidateHrefs, resolved)
		}

		// 1. EPUB 3: manifest item with properties="cover-image"
		for _, item := range pkg.Manifest.Items {
			if hasXMLProperty(item.Properties, "cover-image") {
				addHref(item.Href)
			}
		}

		// 2. EPUB 2: <meta name="cover" content="<manifest-item-id>"/>
		var hrefsByID map[string][]string
		seenIDs := make(map[string]bool)
		for _, meta := range pkg.Metadata.Metas {
			if !strings.EqualFold(strings.TrimSpace(meta.Name), "cover") {
				continue
			}
			coverID := strings.TrimSpace(meta.Content)
			if coverID == "" {
				continue
			}
			if hrefsByID == nil {
				hrefsByID = make(map[string][]string)
				for _, item := range pkg.Manifest.Items {
					id := foldEPUBName(item.ID)
					hrefsByID[id] = append(hrefsByID[id], item.Href)
				}
			}
			id := foldEPUBName(coverID)
			hrefs := hrefsByID[id]
			if len(hrefs) == 0 {
				// Some malformed EPUBs put an image path directly in meta content.
				addHref(coverID)
			} else if !seenIDs[id] {
				seenIDs[id] = true
				for _, href := range hrefs {
					addHref(href)
				}
			}
		}

		// 3. Manifest image items mentioning "cover" in ID or href.
		for _, item := range pkg.Manifest.Items {
			if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(item.MediaType)), "image/") {
				continue
			}
			if strings.Contains(strings.ToLower(item.ID), "cover") ||
				strings.Contains(strings.ToLower(item.Href), "cover") {
				addHref(item.Href)
			}
		}

		for _, target := range candidateHrefs {
			if data, contentType, ok := readCandidate(lookup(target)); ok {
				return data, contentType, nil
			}
		}
	}

	// 4. Fallback: common cover paths first, then any image entry whose name contains "cover".
	coverNames := []string{
		"OEBPS/cover.jpg", "OEBPS/cover.jpeg", "OEBPS/cover.png", "OEBPS/cover.webp",
		"cover.jpg", "cover.jpeg", "cover.png", "cover.webp",
		"OEBPS/Images/cover.jpg", "OEBPS/Images/cover.jpeg", "OEBPS/Images/cover.png",
	}
	for _, coverName := range coverNames {
		if data, contentType, ok := readCandidate(lookup(coverName)); ok {
			return data, contentType, nil
		}
	}

	for _, f := range reader.File {
		if strings.HasSuffix(f.Name, "/") {
			continue
		}
		if !strings.Contains(strings.ToLower(f.Name), "cover") {
			continue
		}
		if data, contentType, ok := readCandidate(f); ok {
			return data, contentType, nil
		}
	}

	return nil, "", fmt.Errorf("封面不存在")
}

func readZipFileWithLimit(file *zip.File, maxBytes int64) ([]byte, error) {
	if file.UncompressedSize64 > uint64(maxBytes) {
		return nil, fmt.Errorf("zip 条目超过读取限制")
	}

	rc, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	limited := io.LimitReader(rc, maxBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("zip 条目超过读取限制")
	}
	return data, nil
}
