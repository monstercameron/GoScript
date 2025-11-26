#!/bin/bash
# Pack Go Standard Library into a single archive file
# Creates a simple binary format for loading in the browser

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PKG_DIR="$ROOT_DIR/static/pkg/js_wasm"
OUTPUT_FILE="$ROOT_DIR/static/pkg/stdlib.pack"
INDEX_FILE="$ROOT_DIR/static/pkg/index.json"

echo "Packing Go Standard Library..."
echo "Source: $PKG_DIR"
echo "Output: $OUTPUT_FILE"

# This script requires binary writing capabilities
# For cross-platform compatibility, we use Node.js

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required for packing. Please install Node.js."
    exit 1
fi

node -e "
const fs = require('fs');
const path = require('path');

const pkgDir = '$PKG_DIR';
const outputFile = '$OUTPUT_FILE';
const indexFile = '$INDEX_FILE';

const packages = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const chunks = [];

// Magic header
chunks.push(Buffer.from('GOSTDLIB'));

// Version
const versionBuf = Buffer.alloc(4);
versionBuf.writeUInt32LE(1);
chunks.push(versionBuf);

// Package count
const countBuf = Buffer.alloc(4);
countBuf.writeUInt32LE(packages.length);
chunks.push(countBuf);

// Index offset placeholder
const indexOffsetPlaceholder = chunks.length;
chunks.push(Buffer.alloc(8));

// Collect package data
const packageIndex = [];
let currentOffset = 0;

for (const pkg of packages) {
    const filePath = path.join(pkgDir, pkg + '.a');
    if (fs.existsSync(filePath)) {
        const bytes = fs.readFileSync(filePath);
        packageIndex.push({
            name: pkg,
            offset: currentOffset,
            size: bytes.length
        });
        chunks.push(bytes);
        currentOffset += bytes.length;
        
        const sizeKB = (bytes.length / 1024).toFixed(1);
        console.log('  + ' + pkg + ' (' + sizeKB + ' KB)');
    }
}

// Calculate index offset
let totalLen = 0;
for (const chunk of chunks) totalLen += chunk.length;
const indexOffset = totalLen;

// Write index offset
const indexOffsetBuf = Buffer.alloc(8);
indexOffsetBuf.writeBigUInt64LE(BigInt(indexOffset));
chunks[indexOffsetPlaceholder] = indexOffsetBuf;

// Index entry count
const entryCountBuf = Buffer.alloc(4);
entryCountBuf.writeUInt32LE(packageIndex.length);
chunks.push(entryCountBuf);

// Write index entries
for (const entry of packageIndex) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const nameLenBuf = Buffer.alloc(2);
    nameLenBuf.writeUInt16LE(nameBytes.length);
    chunks.push(nameLenBuf);
    chunks.push(nameBytes);
    
    const offsetBuf = Buffer.alloc(8);
    offsetBuf.writeBigUInt64LE(BigInt(entry.offset));
    chunks.push(offsetBuf);
    
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32LE(entry.size);
    chunks.push(sizeBuf);
}

const output = Buffer.concat(chunks);
fs.writeFileSync(outputFile, output);

const sizeMB = (output.length / 1024 / 1024).toFixed(2);
console.log('');
console.log('Pack complete!');
console.log('  Packages: ' + packageIndex.length);
console.log('  Total size: ' + sizeMB + ' MB');
"
