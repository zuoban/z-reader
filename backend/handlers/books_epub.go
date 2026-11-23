package handlers

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
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

func saveNormalizedEPUBFile(file *multipart.FileHeader, path string, maxExpandedBytes int64) (bool, string, error) {
	src, err := file.Open()
	if err != nil {
		return false, "", err
	}
	defer src.Close()

	reader, err := zip.NewReader(src, file.Size)
	if err != nil {
		return false, "", nil
	}

	root, ok := epubPackageRoot(reader)
	if !ok {
		return false, "", nil
	}
	if err := validateEPUBArchive(reader, maxExpandedBytes); err != nil {
		return true, "", err
	}

	contentHash, err := writeNormalizedEPUBZip(reader, root, path, maxExpandedBytes)
	if err != nil {
		removeFileIfExists(path)
		return true, "", err
	}

	return true, contentHash, nil
}

func normalizeStoredEPUBFile(path string) (bool, error) {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return false, nil
	}
	defer reader.Close()

	root, ok := epubPackageRoot(&reader.Reader)
	if !ok {
		return false, nil
	}
	if err := validateEPUBArchive(&reader.Reader, maxEPUBExpandedBytes); err != nil {
		return false, err
	}

	tmpPath := path + ".normalized"
	if _, err := writeNormalizedEPUBZip(&reader.Reader, root, tmpPath, maxEPUBExpandedBytes); err != nil {
		removeFileIfExists(tmpPath)
		return false, err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		removeFileIfExists(tmpPath)
		return false, err
	}

	return true, nil
}

func writeNormalizedEPUBZip(reader *zip.Reader, root string, path string, maxExpandedBytes int64) (contentHash string, err error) {
	dst, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer func() {
		if closeErr := dst.Close(); err == nil && closeErr != nil {
			err = closeErr
		}
	}()

	hash := sha256.New()
	writer := zip.NewWriter(io.MultiWriter(dst, hash))
	defer func() {
		if err != nil {
			_ = writer.Close()
		}
	}()
	var copiedBytes int64
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
			return "", err
		}
		target, err := writer.CreateHeader(&header)
		if err != nil {
			entryReader.Close()
			return "", err
		}
		remaining := maxExpandedBytes - copiedBytes
		if remaining < 0 {
			entryReader.Close()
			return "", fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		copied, err := io.Copy(target, io.LimitReader(entryReader, remaining+1))
		if err != nil {
			entryReader.Close()
			return "", err
		}
		if copied > remaining {
			entryReader.Close()
			return "", fmt.Errorf("EPUB 解压后的内容超过大小限制")
		}
		copiedBytes += copied
		if err := entryReader.Close(); err != nil {
			return "", err
		}
	}

	if err := writer.Close(); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
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
	parts := strings.Split(normalized, "/")
	if len(parts) > 1 && strings.HasSuffix(parts[0], ".epub") {
		return strings.Join(parts[1:], "/")
	}
	return normalized
}

func epubPackageRoot(reader *zip.Reader) (string, bool) {
	roots := make(map[string]bool)
	for _, entry := range reader.File {
		name := strings.ToLower(strings.TrimLeft(entry.Name, "/"))
		parts := strings.Split(name, "/")
		if len(parts) <= 1 || !strings.HasSuffix(parts[0], ".epub") {
			continue
		}
		stripped := strings.Join(parts[1:], "/")
		if stripped == "mimetype" || stripped == "meta-inf/container.xml" {
			roots[parts[0]+"/"] = true
		}
	}

	if len(roots) != 1 {
		return "", false
	}
	for root := range roots {
		return root, true
	}
	return "", false
}

func stripEPUBPackageRoot(name string, root string) (string, bool) {
	trimmed := strings.TrimLeft(name, "/")
	if len(trimmed) < len(root) || !strings.EqualFold(trimmed[:len(root)], root) {
		return "", false
	}
	return strings.TrimLeft(trimmed[len(root):], "/"), true
}

func extractBookPreview(path string, format string) (*epubMetadata, []byte, string, error) {
	switch format {
	case "epub":
		return extractEPUBPreview(path)
	default:
		return nil, nil, "", fmt.Errorf("metadata extraction not implemented for %s", format)
	}
}

func extractEPUBPreview(path string) (*epubMetadata, []byte, string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, nil, "", err
	}
	defer r.Close()
	meta := &epubMetadata{}
	if extractedMeta, err := extractEPUBMetadataFromReader(&r.Reader); err == nil {
		meta = extractedMeta
	}
	coverData, contentType, coverErr := extractEPUBCoverFromReader(&r.Reader)
	if coverErr != nil {
		// A cover is optional and should not make an otherwise valid upload fail.
		return meta, nil, "", nil
	}
	return meta, coverData, contentType, nil
}

func findZipFile(reader *zip.Reader, target string) *zip.File {
	cleanTarget := path.Clean(strings.TrimLeft(strings.ReplaceAll(target, "\\", "/"), "/"))
	if cleanTarget == "." || cleanTarget == ".." || strings.HasPrefix(cleanTarget, "../") {
		return nil
	}
	var ciMatch *zip.File
	for _, f := range reader.File {
		if strings.HasSuffix(f.Name, "/") {
			continue
		}
		cleanName := path.Clean(strings.TrimLeft(strings.ReplaceAll(f.Name, "\\", "/"), "/"))
		if cleanName == cleanTarget {
			return f
		}
		if ciMatch == nil && strings.EqualFold(cleanName, cleanTarget) {
			ciMatch = f
		}
	}
	return ciMatch
}

func findEPUBOPFFile(reader *zip.Reader) *zip.File {
	if containerFile := findZipFile(reader, "META-INF/container.xml"); containerFile != nil {
		if data, err := readZipFileWithLimit(containerFile, maxEPUBMetadataBytes); err == nil {
			var container epubContainer
			if err := xml.Unmarshal(data, &container); err == nil {
				for _, rf := range container.Rootfiles {
					fullPath := strings.TrimSpace(rf.FullPath)
					if fullPath == "" {
						continue
					}
					if f := findZipFile(reader, fullPath); f != nil {
						return f
					}
				}
			}
		}
	}

	if f := findZipFile(reader, "OEBPS/content.opf"); f != nil {
		return f
	}
	for _, f := range reader.File {
		if !strings.HasSuffix(f.Name, "/") && strings.HasSuffix(strings.ToLower(f.Name), ".opf") {
			return f
		}
	}
	return nil
}

func parseEPUBPackage(reader *zip.Reader) (*epubPackage, string, error) {
	opfFile := findEPUBOPFFile(reader)
	if opfFile == nil {
		return nil, "", fmt.Errorf("未找到 OPF 文件")
	}
	data, err := readZipFileWithLimit(opfFile, maxEPUBMetadataBytes)
	if err != nil {
		return nil, "", err
	}
	var pkg epubPackage
	if err := xml.Unmarshal(data, &pkg); err != nil {
		return nil, "", err
	}
	cleanOPF := path.Clean(strings.TrimLeft(strings.ReplaceAll(opfFile.Name, "\\", "/"), "/"))
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

func extractEPUBMetadataFromReader(reader *zip.Reader) (*epubMetadata, error) {
	pkg, _, err := parseEPUBPackage(reader)
	if err != nil {
		if findEPUBOPFFile(reader) == nil {
			return &epubMetadata{}, nil
		}
		return nil, err
	}
	return &epubMetadata{
		Title:  pkg.Metadata.Title,
		Author: pkg.Metadata.Author,
	}, nil
}

func extractEPUBCover(path string) ([]byte, string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()
	return extractEPUBCoverFromReader(&r.Reader)
}

func extractEPUBCoverFromReader(reader *zip.Reader) ([]byte, string, error) {
	if pkg, opfDir, err := parseEPUBPackage(reader); err == nil {
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
		for _, meta := range pkg.Metadata.Metas {
			if !strings.EqualFold(strings.TrimSpace(meta.Name), "cover") {
				continue
			}
			coverID := strings.TrimSpace(meta.Content)
			if coverID == "" {
				continue
			}
			matched := false
			for _, item := range pkg.Manifest.Items {
				if item.ID == coverID || strings.EqualFold(item.ID, coverID) {
					addHref(item.Href)
					matched = true
				}
			}
			if !matched {
				// Some malformed EPUBs put an image path directly in meta content.
				addHref(coverID)
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
			if data, contentType, ok := readEPUBImageEntry(findZipFile(reader, target)); ok {
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
		if data, contentType, ok := readEPUBImageEntry(findZipFile(reader, coverName)); ok {
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
		if data, contentType, ok := readEPUBImageEntry(f); ok {
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
