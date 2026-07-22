package main

import (
	"flag"
	"fmt"
	"os"

	"z-reader/backend/backup"
)

func main() {
	dir := flag.String("dir", "", "backup directory to verify")
	flag.Parse()
	if *dir == "" {
		fmt.Fprintln(os.Stderr, "usage: verify-backup --dir <backup-directory>")
		os.Exit(2)
	}
	if err := backup.Verify(*dir); err != nil {
		fmt.Fprintln(os.Stderr, "backup verification failed:", err)
		os.Exit(1)
	}
	fmt.Println("backup verification succeeded")
}
