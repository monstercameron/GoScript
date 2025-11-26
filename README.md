# GoScript - Browser-Based Go Compiler

Compile and run Go code directly in your browser using WebAssembly.

## Project Structure

```
GoScript/
├── index.html              # Main UI entry point
├── src/
│   ├── main.js             # Application orchestrator
│   ├── core/
│   │   ├── virtual-fs.js   # In-memory virtual filesystem
│   │   ├── fs-polyfill.js  # Node.js fs API bridge for Go WASM
│   │   └── cache-manager.js # IndexedDB caching
│   ├── compiler/
│   │   ├── compilation-manager.js  # Go→WASM compilation pipeline
│   │   └── github-fetcher.js       # Fetch Go source from GitHub
│   └── runtime/
│       ├── app-runner.js   # WASM execution environment
│       └── wasm_exec.js    # Go's official WASM runtime support
├── static/
│   ├── bin/                # compile.wasm, link.wasm (compiler binaries)
│   └── pkg/                # Precompiled Go standard library
│       ├── index.json
│       └── js_wasm/        # .a archives for js/wasm target
└── tools/
    ├── build-compiler.ps1  # Build Go compiler to WASM
    ├── copy-std-lib.ps1    # Copy Go std library archives
    └── generate-pkg-index.ps1  # Generate package index
```

## How It Works

1.  **WASM Binaries**: The Go toolchain (`cmd/compile` and `cmd/link`) is compiled to WASM.
2.  **Virtual Filesystem**: A JavaScript VFS stores source files and build artifacts.
3.  **FS Polyfill**: The Node.js `fs` API is patched to redirect file operations to the VFS.
4.  **Compilation Pipeline**:
    *   Write Go source to VFS
    *   Run `compile.wasm` to generate object files (`.o`)
    *   Run `link.wasm` to generate the final executable (`.wasm`)
    *   Execute the generated WASM in the browser

## Setup

1.  Run `tools/build-compiler.ps1` to build the compiler and linker WASM binaries.
2.  Run `tools/copy-std-lib.ps1` to copy standard library packages.
3.  Run `tools/generate-pkg-index.ps1` to generate the package index.
4.  Serve the directory with any HTTP server.
5.  Open in browser and use `go run main.go` in the terminal.

## Limitations

*   **Performance**: The compiler binaries are large (~20MB each) and take time to load.
*   **Standard Library**: Only packages in `static/pkg/js_wasm/` are available.
