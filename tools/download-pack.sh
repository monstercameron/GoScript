#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$ROOT_DIR/docs/assets"
OUTPUT_FILE="$OUTPUT_DIR/goscript.pack"
TAG="${GOSCRIPT_PACK_TAG:-demo}"
REPO="${GOSCRIPT_PACK_REPO:-monstercameron/GoScript}"
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG/goscript.pack"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

mkdir -p "$OUTPUT_DIR"

if [[ -f "$OUTPUT_FILE" && "$FORCE" -ne 1 ]]; then
  echo "goscript.pack already exists at $OUTPUT_FILE"
  echo "Use --force to re-download."
  exit 0
fi

echo "Downloading goscript.pack from $DOWNLOAD_URL"
curl -L --fail --output "$OUTPUT_FILE" "$DOWNLOAD_URL"

SIZE_MB=$(du -m "$OUTPUT_FILE" | cut -f1)
echo "Saved $OUTPUT_FILE (${SIZE_MB} MB)"
