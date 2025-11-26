#!/bin/bash
# Build Go Compiler and Linker to WASM

set -e

export GOOS=js
export GOARCH=wasm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$ROOT_DIR/static/bin"

mkdir -p "$OUTPUT_DIR"

echo "Building Go Compiler (cmd/compile)..."
go build -o "$OUTPUT_DIR/compile.wasm" cmd/compile

echo "Building Go Linker (cmd/link)..."
go build -o "$OUTPUT_DIR/link.wasm" cmd/link

echo "Copying wasm_exec.js..."
GOROOT=$(go env GOROOT)

# Try lib/wasm first (newer Go versions)
WASM_EXEC_PATH="$GOROOT/lib/wasm/wasm_exec.js"
if [ ! -f "$WASM_EXEC_PATH" ]; then
    WASM_EXEC_PATH="$GOROOT/misc/wasm/wasm_exec.js"
fi

cp "$WASM_EXEC_PATH" "$ROOT_DIR/src/runtime/wasm_exec.js"

echo "Done."
