# GoScript SDK

Browser-based Go compiler using WebAssembly. Compile and run Go programs entirely in the browser with no server required.

## Features

- 🚀 **Complete Go toolchain** - Compiler, linker, and 340 standard library packages
- 📦 **Single file distribution** - Everything in one `goscript.pack` file (168 MB)
- 🌐 **Pure browser execution** - No backend, no installation
- 📚 **Full standard library** - fmt, net/http, encoding/json, crypto, and more
- 🔧 **Simple API** - Three methods: `init()`, `compile()`, `run()`

## Quick Start

### 1. Include the SDK

```html
<!-- Option A: Bundled (includes wasm_exec.js) -->
<script src="dist/goscript.bundle.js"></script>

<!-- Option B: Separate files -->
<script src="src/runtime/wasm_exec.js"></script>
<script src="dist/goscript.js"></script>
```

### 2. Initialize and Run

```javascript
const gs = new GoScript({
    packUrl: 'assets/goscript.pack',
    onOutput: (text) => console.log(text)
});

await gs.init();

const result = await gs.compileAndRun(`
    package main
    import "fmt"
    func main() { fmt.Println("Hello from Go!") }
`);

console.log(result.output); // "Hello from Go!\n"
```

## Installation

### Download

Download the latest release:
- `dist/goscript.bundle.js` - SDK + wasm_exec.js (43 KB)
- `assets/goscript.pack` - Toolchain (168 MB)

### CDN (coming soon)

```html
<script src="https://cdn.example.com/goscript/1.0.0/goscript.bundle.js"></script>
```

### npm (coming soon)

```bash
npm install goscript-sdk
```

## API Reference

### Constructor

```javascript
const gs = new GoScript(options);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `packUrl` | `string` | `'assets/goscript.pack'` | URL to the toolchain pack file |
| `onOutput` | `function` | `null` | Callback for stdout/stderr output |
| `onError` | `function` | `null` | Callback for error messages |
| `onProgress` | `function` | `null` | Callback for progress updates `(percentage, message)` |
| `debug` | `boolean` | `false` | Enable debug logging |

### Methods

#### `init()`

Initialize the SDK. Must be called before compile/run.

```javascript
await gs.init();
```

#### `compile(source, options?)`

Compile Go source code to WebAssembly.

```javascript
// Single file
const result = await gs.compile('package main\nfunc main() {}');

// Multiple files
const result = await gs.compile({
    'main.go': 'package main\nfunc main() { hello() }',
    'hello.go': 'package main\nimport "fmt"\nfunc hello() { fmt.Println("Hi") }'
});
```

**Returns:** `CompileResult`
```typescript
{
    success: boolean;
    wasm?: ArrayBuffer;      // Compiled WASM (if successful)
    error?: string;          // Error message (if failed)
    metadata: {
        compileTime: number; // Milliseconds
        wasmSize: number;    // Bytes
        sourceFiles: number;
    }
}
```

#### `run(wasm, options?)`

Execute a compiled WebAssembly binary.

```javascript
const runResult = await gs.run(compileResult.wasm, {
    args: ['arg1', 'arg2'],
    env: { MY_VAR: 'value' }
});
```

**Returns:** `RunResult`
```typescript
{
    success: boolean;
    output: string;     // Captured stdout
    error?: string;     // Error message (if failed)
    exitCode: number;
}
```

#### `compileAndRun(source, options?)`

Convenience method to compile and run in one step.

```javascript
const result = await gs.compileAndRun(`
    package main
    import "fmt"
    func main() { fmt.Println("Hello!") }
`);
console.log(result.output); // "Hello!\n"
```

#### `getState()`

Get the current state of the SDK.

```javascript
const state = gs.getState();
// { initialized: true, compilerReady: true, compiling: false }
```

#### `getStats()`

Get statistics about the loaded toolchain.

```javascript
const stats = gs.getStats();
// { compilerSize: 41975000, linkerSize: 10970000, packageCount: 340, ... }
```

#### `hasPackage(name)`

Check if a standard library package is available.

```javascript
gs.hasPackage('fmt');           // true
gs.hasPackage('crypto/sha256'); // true
gs.hasPackage('nonexistent');   // false
```

#### `getPackages()`

Get list of all available packages.

```javascript
const packages = gs.getPackages();
// ['bufio', 'bytes', 'cmp', 'context', 'crypto', ...]
```

#### `reset()`

Reset the SDK state (clears VFS, keeps toolchain loaded).

```javascript
gs.reset();
```

## Examples

### Basic Hello World

```javascript
const gs = new GoScript();
await gs.init();

const result = await gs.compileAndRun(`
    package main
    import "fmt"
    func main() {
        fmt.Println("Hello, World!")
    }
`);

console.log(result.output);
```

### With Progress Tracking

```javascript
const gs = new GoScript({
    onProgress: (pct, msg) => {
        document.getElementById('progress').style.width = pct + '%';
        document.getElementById('status').textContent = msg;
    },
    onOutput: (text) => {
        document.getElementById('output').textContent += text;
    }
});

await gs.init();
```

### Error Handling

```javascript
const result = await gs.compile(`
    package main
    func main() {
        fmt.Println("Missing import!")
    }
`);

if (!result.success) {
    console.error('Compilation failed:', result.error);
}
```

### Multiple Source Files

```javascript
const result = await gs.compile({
    'main.go': `
        package main
        func main() {
            PrintMessage()
        }
    `,
    'utils.go': `
        package main
        import "fmt"
        func PrintMessage() {
            fmt.Println("Hello from utils!")
        }
    `
});
```

## File Structure

```
goscript/
├── assets/
│   └── goscript.pack       # Toolchain (compiler + linker + stdlib)
├── dist/
│   ├── goscript.bundle.js  # SDK + wasm_exec.js
│   └── goscript.js         # SDK only
├── sdk/
│   └── goscript.js         # SDK source
├── src/
│   └── runtime/
│       └── wasm_exec.js    # Go WASM runtime
├── tools/
│   ├── build.ps1           # Build script
│   └── pack-toolchain.ps1  # Toolchain packer
├── demo.html               # Interactive demo
└── README.md
```

## Pack File Format

The `goscript.pack` file contains everything needed for compilation:

```
Header:
  - "GOSCRIPT" (8 bytes magic)
  - Version 2 (uint32)

Section 1 - Compiler:
  - Size (uint32)
  - compile.wasm data (~40 MB)

Section 2 - Linker:
  - Size (uint32)
  - link.wasm data (~10 MB)

Section 3 - Package Index:
  - Size (uint32)
  - JSON array of package names

Section 4 - Standard Library:
  - Package count (uint32)
  - Index offset (uint64)
  - Package data (concatenated .a files)
  - Package index (name + offset + size)
```

## Browser Support

- Chrome 57+
- Firefox 53+
- Safari 11+
- Edge 16+

Requires WebAssembly support.

## Limitations

- **First load is slow** - 168 MB toolchain download (cached after first load)
- **Memory intensive** - Requires ~512 MB RAM for compilation
- **No CGO** - Pure Go only, no C bindings
- **js/wasm target only** - Output runs in browser, not natively

## Building from Source

```bash
# Clone repository
git clone https://github.com/user/goscript.git
cd goscript

# Build SDK bundle
powershell -File tools/build.ps1

# Pack toolchain (if rebuilding from Go source)
powershell -File tools/pack-toolchain.ps1
```

## License

MIT License

## Credits

- Go compiler and runtime: [The Go Authors](https://golang.org/) (BSD License)
- WebAssembly support: [WebAssembly Community Group](https://webassembly.org/)
