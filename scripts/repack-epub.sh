#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/repack-epub.sh /path/to/book.epub [/path/to/output.epub]

Description:
  Repack a macOS EPUB package directory into a standard single-file EPUB.

Examples:
  scripts/repack-epub.sh "/Users/me/Downloads/Book.epub"
  scripts/repack-epub.sh "/Users/me/Downloads/Book.epub" "/tmp/Book-fixed.epub"
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

input_path=$1

if [[ ! -e "$input_path" ]]; then
  echo "Input does not exist: $input_path" >&2
  exit 1
fi

if [[ ! -d "$input_path" ]]; then
  echo "Input is not a directory package: $input_path" >&2
  exit 1
fi

if [[ ! -f "$input_path/mimetype" ]]; then
  echo "Missing required EPUB file: $input_path/mimetype" >&2
  exit 1
fi

if [[ ! -d "$input_path/META-INF" ]]; then
  echo "Missing required EPUB directory: $input_path/META-INF" >&2
  exit 1
fi

if [[ $# -eq 2 ]]; then
  output_path=$2
else
  input_name=$(basename "$input_path")
  stem=${input_name%.epub}
  if [[ "$stem" == "$input_name" ]]; then
    stem="$input_name"
  fi
  output_path="$(dirname "$input_path")/${stem}-fixed.epub"
fi

output_dir=$(dirname "$output_path")
mkdir -p "$output_dir"

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/repack-epub.XXXXXX")
tmp_output="$tmp_dir/output.epub"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

(
  cd "$input_path"
  zip -X0 "$tmp_output" mimetype >/dev/null
  zip -Xr9D "$tmp_output" . -x mimetype -x "*.DS_Store" >/dev/null
)

mv "$tmp_output" "$output_path"
trap - EXIT

echo "Created EPUB: $output_path"
