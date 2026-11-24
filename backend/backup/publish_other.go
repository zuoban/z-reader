//go:build !linux && !darwin

package backup

import "os"

func publishUploadDirectory(source, target string) error {
	if err := requireAbsent(target); err != nil {
		return err
	}
	return os.Rename(source, target)
}
