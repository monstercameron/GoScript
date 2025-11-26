#!/bin/bash
# Pack Go Toolchain into a single archive file
# Includes: compile.wasm, link.wasm, and all stdlib packages (from stdlib.pack)
# Creates a simple binary format for loading in the browser

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/static/bin"
STDLIB_PACK="$ROOT_DIR/static/pkg/stdlib.pack"
OUTPUT_FILE="$ROOT_DIR/static/goscript.pack"
INDEX_FILE="$ROOT_DIR/static/pkg/index.json"

echo "Packing GoScript Toolchain..."
echo "Output: $OUTPUT_FILE"
echo ""

# This script requires a more complex binary writer than bash can easily provide
# For cross-platform compatibility, we recommend using Node.js for the actual packing

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required for packing. Please install Node.js."
    exit 1
fi

# Use a Node.js script to do the actual packing
node -e "
const fs = require('fs');
const path = require('path');

const binDir = '$BIN_DIR';
const stdlibPack = '$STDLIB_PACK';
const outputFile = '$OUTPUT_FILE';
const indexFile = '$INDEX_FILE';

console.log('Section 1: Compiler');
const compilerBytes = fs.readFileSync(path.join(binDir, 'compile.wasm'));
console.log('  + compile.wasm (' + (compilerBytes.length / 1024 / 1024).toFixed(2) + ' MB)');

console.log('Section 2: Linker');
const linkerBytes = fs.readFileSync(path.join(binDir, 'link.wasm'));
console.log('  + link.wasm (' + (linkerBytes.length / 1024 / 1024).toFixed(2) + ' MB)');

console.log('Section 3: Package Index');
const indexBytes = fs.readFileSync(indexFile);
console.log('  + index.json (' + indexBytes.length + ' bytes)');

console.log('Section 4: Standard Library Packages (from stdlib.pack)');
const stdlibBytes = fs.readFileSync(stdlibPack);

// Parse stdlib.pack header
let pos = 8; // skip magic
const stdlibVersion = stdlibBytes.readUInt32LE(pos); pos += 4;
const stdlibPackageCount = stdlibBytes.readUInt32LE(pos); pos += 4;
const stdlibIndexOffset = Number(stdlibBytes.readBigUInt64LE(pos)); pos += 8;

console.log('  Reading ' + stdlibPackageCount + ' packages from stdlib.pack...');

// Read package index from stdlib
pos = stdlibIndexOffset;
const indexEntryCount = stdlibBytes.readUInt32LE(pos); pos += 4;

const packageIndex = [];
for (let i = 0; i < indexEntryCount; i++) {
    const nameLen = stdlibBytes.readUInt16LE(pos); pos += 2;
    const name = stdlibBytes.slice(pos, pos + nameLen).toString('utf8'); pos += nameLen;
    const pkgOffset = Number(stdlibBytes.readBigUInt64LE(pos)); pos += 8;
    const pkgSize = stdlibBytes.readUInt32LE(pos); pos += 4;
    packageIndex.push({ name, oldOffset: pkgOffset, size: pkgSize });
}

// Build output
const chunks = [];

// Magic header
chunks.push(Buffer.from('GOSCRIPT'));

// Version
const versionBuf = Buffer.alloc(4);
versionBuf.writeUInt32LE(2);
chunks.push(versionBuf);

// Compiler
const compilerLenBuf = Buffer.alloc(4);
compilerLenBuf.writeUInt32LE(compilerBytes.length);
chunks.push(compilerLenBuf);
chunks.push(compilerBytes);

// Linker
const linkerLenBuf = Buffer.alloc(4);
linkerLenBuf.writeUInt32LE(linkerBytes.length);
chunks.push(linkerLenBuf);
chunks.push(linkerBytes);

// Package index JSON
const indexLenBuf = Buffer.alloc(4);
indexLenBuf.writeUInt32LE(indexBytes.length);
chunks.push(indexLenBuf);
chunks.push(indexBytes);

// Package count
const pkgCountBuf = Buffer.alloc(4);
pkgCountBuf.writeUInt32LE(packageIndex.length);
chunks.push(pkgCountBuf);

// Index offset placeholder (will calculate after)
const indexOffsetPlaceholder = chunks.length;
chunks.push(Buffer.alloc(8));

// Copy package data
const oldDataStart = 24;
const newOffsets = {};
let currentOffset = 0;

for (const entry of packageIndex) {
    const data = stdlibBytes.slice(oldDataStart + entry.oldOffset, oldDataStart + entry.oldOffset + entry.size);
    chunks.push(data);
    newOffsets[entry.name] = currentOffset;
    currentOffset += entry.size;
}

console.log('  + ' + packageIndex.length + ' packages copied');

// Calculate current position for index
let totalLen = 0;
for (let i = 0; i < chunks.length; i++) {
    totalLen += chunks[i].length;
}
const newIndexOffset = totalLen;

// Write index offset
const indexOffsetBuf = Buffer.alloc(8);
indexOffsetBuf.writeBigUInt64LE(BigInt(newIndexOffset));
chunks[indexOffsetPlaceholder] = indexOffsetBuf;

// Write package index
for (const entry of packageIndex) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const nameLenBuf = Buffer.alloc(2);
    nameLenBuf.writeUInt16LE(nameBytes.length);
    chunks.push(nameLenBuf);
    chunks.push(nameBytes);
    
    const offsetBuf = Buffer.alloc(8);
    offsetBuf.writeBigUInt64LE(BigInt(newOffsets[entry.name]));
    chunks.push(offsetBuf);
    
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32LE(entry.size);
    chunks.push(sizeBuf);
}

// Write output
const output = Buffer.concat(chunks);
fs.writeFileSync(outputFile, output);

const sizeMB = (output.length / 1024 / 1024).toFixed(2);
console.log('');
console.log('Pack complete!');
console.log('  Compiler:  ' + (compilerBytes.length / 1024 / 1024).toFixed(2) + ' MB');
console.log('  Linker:    ' + (linkerBytes.length / 1024 / 1024).toFixed(2) + ' MB');
console.log('  Stdlib:    ' + packageIndex.length + ' packages');
console.log('  Total:     ' + sizeMB + ' MB');
console.log('');
console.log('Output: ' + outputFile);
"
