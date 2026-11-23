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
	"os"
	"strings"
)

type epubMetadata struct {
	Title  string `xml:"title"`
	Author string `xml:"creator"`
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

func extractEPUBMetadataFromReader(reader *zip.Reader) (*epubMetadata, error) {
	var meta epubMetadata
	for _, f := range reader.File {
		if strings.HasSuffix(f.Name, ".opf") || f.Name == "OEBPS/content.opf" {
			data, err := readZipFileWithLimit(f, maxEPUBMetadataBytes)
			if err != nil {
				return nil, err
			}

			var pkg struct {
				Metadata epubMetadata `xml:"metadata"`
			}
			if err := xml.Unmarshal(data, &pkg); err != nil {
				return nil, err
			}
			meta = pkg.Metadata
			break
		}
	}

	return &meta, nil
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
	coverNames := []string{
		"OEBPS/cover.jpg", "OEBPS/cover.jpeg", "OEBPS/cover.png", "OEBPS/cover.webp",
		"cover.jpg", "cover.jpeg", "cover.png",
		"OEBPS/Images/cover.jpg", "OEBPS/Images/cover.jpeg",
	}

	for _, f := range reader.File {
		name := strings.ToLower(f.Name)
		for _, coverName := range coverNames {
			if strings.ToLower(coverName) == name || strings.Contains(name, "cover") {
				data, err := readZipFileWithLimit(f, maxEPUBCoverBytes)
				if err != nil {
					return nil, "", err
				}
				contentType := http.DetectContentType(data)
				if !strings.HasPrefix(contentType, "image/") {
					return nil, "", fmt.Errorf("封面格式无效")
				}
				return data, contentType, nil
			}
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
