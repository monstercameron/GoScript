#!/bin/bash
# GoScript Build Script
# Bundles the SDK and wasm_exec.js into a single distributable file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$ROOT_DIR/src"
DIST_DIR="$ROOT_DIR/dist"

# Ensure dist directory exists
mkdir -p "$DIST_DIR"

echo "Building GoScript SDK..."
echo ""

# Build banner
BUILD_DATE=$(date "+%Y-%m-%d %H:%M:%S")
BANNER="/**
 * GoScript SDK v1.0.0
 * Browser-based Go compiler using WebAssembly
 * 
 * https://github.com/aspect-build/aspect-cli
 * 
 * Includes:
 * - GoScript SDK (MIT License)
 * - Go wasm_exec.js (BSD License)
 * 
 * Built: $BUILD_DATE
 */
"

# Combined bundle (SDK + wasm_exec)
{
    echo "$BANNER"
    echo ""
    echo "// ============================================================"
    echo "// Go WASM Runtime (wasm_exec.js)"
    echo "// ============================================================"
    echo ""
    cat "$SRC_DIR/runtime/wasm_exec.js"
    echo ""
    echo "// ============================================================"
    echo "// GoScript SDK"
    echo "// ============================================================"
    echo ""
    cat "$SRC_DIR/core/virtual-fs.js"
    echo ""
    cat "$SRC_DIR/core/fs-polyfill.js"
    echo ""
    cat "$SRC_DIR/core/cache-manager.js"
    echo ""
    cat "$SRC_DIR/core/toolchain-loader.js"
    echo ""
    cat "$SRC_DIR/compiler/github-fetcher.js"
    echo ""
    cat "$SRC_DIR/compiler/compilation-manager.js"
    echo ""
    cat "$SRC_DIR/runtime/app-runner.js"
    echo ""
    cat "$SRC_DIR/main.js"
} > "$DIST_DIR/goscript.bundle.js"

# SDK only (requires wasm_exec.js to be loaded separately)
{
    echo "$BANNER"
    echo ""
    cat "$SRC_DIR/core/virtual-fs.js"
    echo ""
    cat "$SRC_DIR/core/fs-polyfill.js"
    echo ""
    cat "$SRC_DIR/core/cache-manager.js"
    echo ""
    cat "$SRC_DIR/core/toolchain-loader.js"
    echo ""
    cat "$SRC_DIR/compiler/github-fetcher.js"
    echo ""
    cat "$SRC_DIR/compiler/compilation-manager.js"
    echo ""
    cat "$SRC_DIR/runtime/app-runner.js"
    echo ""
    cat "$SRC_DIR/main.js"
} > "$DIST_DIR/goscript.js"

# Calculate sizes
BUNDLE_SIZE=$(du -k "$DIST_DIR/goscript.bundle.js" | cut -f1)
SDK_SIZE=$(du -k "$DIST_DIR/goscript.js" | cut -f1)

echo "Output files:"
echo "  dist/goscript.bundle.js     - ${BUNDLE_SIZE} KB (SDK + wasm_exec.js)"
echo "  dist/goscript.js            - ${SDK_SIZE} KB (SDK only)"

# Minify using terser if available
TERSER_PATH="$ROOT_DIR/node_modules/.bin/terser"
if [ -x "$TERSER_PATH" ]; then
    echo ""
    echo "Minifying..."
    
    "$TERSER_PATH" "$DIST_DIR/goscript.bundle.js" -o "$DIST_DIR/goscript.bundle.min.js" --compress --mangle
    "$TERSER_PATH" "$DIST_DIR/goscript.js" -o "$DIST_DIR/goscript.min.js" --compress --mangle
    
    BUNDLE_MIN_SIZE=$(du -k "$DIST_DIR/goscript.bundle.min.js" | cut -f1)
    SDK_MIN_SIZE=$(du -k "$DIST_DIR/goscript.min.js" | cut -f1)
    
    echo "  dist/goscript.bundle.min.js - ${BUNDLE_MIN_SIZE} KB (minified)"
    echo "  dist/goscript.min.js        - ${SDK_MIN_SIZE} KB (minified)"
else
    echo ""
    echo "Note: Install terser for minified builds: npm install -D terser"
fi

echo ""

# Show asset info
PACK_PATH="$ROOT_DIR/docs/assets/goscript.pack"
if [ -f "$PACK_PATH" ]; then
    PACK_SIZE=$(du -m "$PACK_PATH" | cut -f1)
    echo "Required asset:"
    echo "  docs/assets/goscript.pack   - ${PACK_SIZE} MB (toolchain)"
    echo ""
fi

echo "Build complete!"
echo ""
echo "Usage:"
echo '  <script src="dist/goscript.bundle.js"></script>'
echo '  <script>'
echo '    const gs = new GoScript();'
echo '    await gs.init();'
echo '  </script>'
