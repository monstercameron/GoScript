# GoScript Pack Format Specification

The `.pack` format is a binary archive containing the complete GoScript toolchain: compiler, linker, and Go standard library pre-compiled for `js/wasm`.

## File Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        HEADER                                │
├─────────────────────────────────────────────────────────────┤
│ Magic Number    │ 8 bytes  │ "GOSCRIPT" (ASCII)             │
│ Version         │ 4 bytes  │ uint32 LE (currently: 2)       │
├─────────────────────────────────────────────────────────────┤
│                    SECTION 1: COMPILER                       │
├─────────────────────────────────────────────────────────────┤
│ Compiler Size   │ 4 bytes  │ uint32 LE                      │
│ Compiler WASM   │ N bytes  │ compile.wasm binary            │
├─────────────────────────────────────────────────────────────┤
│                     SECTION 2: LINKER                        │
├─────────────────────────────────────────────────────────────┤
│ Linker Size     │ 4 bytes  │ uint32 LE                      │
│ Linker WASM     │ N bytes  │ link.wasm binary               │
├─────────────────────────────────────────────────────────────┤
│                  SECTION 3: PACKAGE INDEX                    │
├─────────────────────────────────────────────────────────────┤
│ Index Size      │ 4 bytes  │ uint32 LE                      │
│ Index JSON      │ N bytes  │ JSON array of package names    │
├─────────────────────────────────────────────────────────────┤
│                  SECTION 4: STDLIB PACKAGES                  │
├─────────────────────────────────────────────────────────────┤
│ Package Count   │ 4 bytes  │ uint32 LE                      │
│ Index Offset    │ 8 bytes  │ uint64 LE (offset to pkg index)│
│ Package Data    │ N bytes  │ Concatenated .a archive files  │
│ Package Index   │ N bytes  │ Package lookup table           │
└─────────────────────────────────────────────────────────────┘
```

## Header Details

### Magic Number (8 bytes)
- ASCII string: `GOSCRIPT`
- Used to validate file format

### Version (4 bytes)
- Little-endian uint32
- Current version: `2`
- Version 1 was stdlib-only, version 2 added compiler/linker

## Section Details

### Section 1: Compiler WASM
- **Size field**: 4-byte little-endian uint32
- **Content**: Raw WebAssembly binary (`compile.wasm`)
- Built from Go's `cmd/compile` for `GOOS=js GOARCH=wasm`
- Typical size: ~25-30 MB

### Section 2: Linker WASM
- **Size field**: 4-byte little-endian uint32
- **Content**: Raw WebAssembly binary (`link.wasm`)
- Built from Go's `cmd/link` for `GOOS=js GOARCH=wasm`
- Typical size: ~18-22 MB

### Section 3: Package Index
- **Size field**: 4-byte little-endian uint32
- **Content**: JSON array of package names
- Example: `["fmt", "os", "crypto/sha256", ...]`

### Section 4: Stdlib Packages
- **Package Count**: 4-byte uint32 - number of packages
- **Index Offset**: 8-byte uint64 - byte offset to package index table
- **Package Data**: Concatenated `.a` archive files
- **Package Index**: Lookup table at end of section

#### Package Index Entry Format
For each package:
```
┌────────────────────────────────────────┐
│ Name Length   │ 2 bytes │ uint16 LE    │
│ Package Name  │ N bytes │ UTF-8 string │
│ Data Offset   │ 8 bytes │ uint64 LE    │
│ Data Size     │ 4 bytes │ uint32 LE    │
└────────────────────────────────────────┘
```

## Example Sizes

Typical `goscript.pack` file (~168 MB):
- Header: 12 bytes
- Compiler WASM: ~27 MB
- Linker WASM: ~20 MB
- Package Index JSON: ~8 KB
- Stdlib Packages: ~117 MB (340 packages)

## Reading the Pack File

```javascript
async function readPack(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);
    let offset = 0;
    
    // 1. Validate magic
    const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8));
    if (magic !== 'GOSCRIPT') throw new Error('Invalid pack file');
    offset += 8;
    
    // 2. Read version
    const version = view.getUint32(offset, true);
    offset += 4;
    
    // 3. Read compiler
    const compilerSize = view.getUint32(offset, true);
    offset += 4;
    const compilerWasm = buffer.slice(offset, offset + compilerSize);
    offset += compilerSize;
    
    // 4. Read linker
    const linkerSize = view.getUint32(offset, true);
    offset += 4;
    const linkerWasm = buffer.slice(offset, offset + linkerSize);
    offset += linkerSize;
    
    // 5. Read package index JSON
    const indexSize = view.getUint32(offset, true);
    offset += 4;
    const indexJson = new TextDecoder().decode(new Uint8Array(buffer, offset, indexSize));
    const packageNames = JSON.parse(indexJson);
    offset += indexSize;
    
    // ... continue with stdlib packages
}
```

## Creating a Pack File

See `tools/pack-toolchain.ps1` or `tools/pack-toolchain.sh` for the packing scripts.

Requirements:
- `compile.wasm` - Go compiler built for js/wasm
- `link.wasm` - Go linker built for js/wasm  
- `stdlib/` - Pre-compiled standard library packages

## Caching

The pack file is cached in IndexedDB after first download:
- Database: `GoScriptCache`
- Store: `toolchain`
- Key: Pack URL

This allows instant loading on subsequent page visits without re-downloading the ~168 MB file.
