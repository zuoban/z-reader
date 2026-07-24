package main

import (
	"flag"
	"fmt"
	"os"

	"z-reader/backend/backup"
)

func main() {
	dir := flag.String("dir", "", "backup directory to restore")
	dbPath := flag.String("db", "./data.db", "new database file path")
	uploadDir := flag.String("uploads", "./uploads", "new uploads directory path")
	flag.Parse()

	if *dir == "" {
		fmt.Fprintln(os.Stderr, "usage: restore-backup --dir <backup-directory> [--db <new-db-path>] [--uploads <new-uploads-directory>]")
		os.Exit(2)
	}
	if err := backup.Restore(*dir, backup.RestoreConfig{
		DBPath:    *dbPath,
		UploadDir: *uploadDir,
	}); err != nil {
		fmt.Fprintln(os.Stderr, "backup restore failed:", err)
		os.Exit(1)
	}
	fmt.Println("backup restore succeeded; start the service and check /readyz")
}
