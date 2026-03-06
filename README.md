# GoScript

**Run the real Go compiler in the browser.**

GoScript is a browser-hosted Go toolchain. It ships `cmd/compile`, `cmd/link`, and a precompiled `js/wasm` standard library inside a single `goscript.pack`, then drives that toolchain from JavaScript through a virtual filesystem.

This is not an interpreter, not a toy parser, and not a language subset. The interesting part is that the browser is running the same compiler pipeline shape you would normally invoke with `go tool compile` and `go tool link`.

## What It Actually Does

At a high level, GoScript does this:

1. Load a packed toolchain archive containing:
   - `compile.wasm`
   - `link.wasm`
   - a package index
   - precompiled `.a` archives for the Go standard library
2. Mount those assets into an in-memory virtual filesystem.
3. Write your source files into that VFS.
4. Run the Go compiler in WebAssembly to produce `main.o`.
5. Run the Go linker in WebAssembly to produce `main.wasm`.
6. Execute the resulting WebAssembly module in the browser with `wasm_exec.js`.

The standard library is not recompiled on every run. It is prebuilt and loaded as `.a` archives, which is the only reason the browser version is practical at all.

## Why The Compiler Details Matter

- It preserves the real compile/link split instead of pretending `go build` is a single opaque step.
- It feeds the compiler a filesystem and package archive layout close to what the Go toolchain expects.
- It treats the browser as a host environment for a native compiler pipeline, not just as a place to run a generated artifact.
- It caches the toolchain pack in IndexedDB, so the expensive part is mostly a first-load problem.

If you care about compiler infrastructure, the key idea is simple: the browser is hosting a cross-compiled Go toolchain and a synthetic file system, then acting as both build machine and runtime.

## Quick Start

```html
<script src="dist/goscript.bundle.js"></script>
<script>
const gs = new GoScript({
    packUrl: 'docs/assets/goscript.pack'
});

await gs.init();

const result = await gs.compileAndRun(`
package main

import "fmt"

func main() {
    fmt.Println("Hello from the browser!")
}
`);
</script>
```

## Local Setup

```bash
git clone https://github.com/monstercameron/GoScript.git
cd GoScript
npm ci
npm run fetch:pack
npm run build
```

`npm run fetch:pack` downloads `docs/assets/goscript.pack` from the GitHub release asset instead of storing the 168 MB toolchain blob in Git history.

## SDK

The public JavaScript entry point is `GoScript`. Full API details are in [reference/SDK.md](reference/SDK.md).

```bash
npm install goscript
```

```javascript
import GoScript from 'goscript';

const gs = await GoScript.create({
    packUrl: '/assets/goscript.pack',
    stdout: (text) => console.log(text)
});

await gs.runCode(code);
```

Notes:

- The package ships the JavaScript runtime and the Go `wasm_exec.js` shim.
- You still need to host `goscript.pack` yourself and pass its URL with `packUrl`.
- For script-tag usage, keep using `dist/goscript.bundle.js`.

## Repository Layout

The current source layout is intentionally flat:

- [src/platform.js](C:\Users\Cam\Desktop\GoScript\src\platform.js): virtual filesystem, fs bridge, cache, toolchain loader
- [src/engine.js](C:\Users\Cam\Desktop\GoScript\src\engine.js): compilation manager and runtime execution
- [src/goscript-sdk.js](C:\Users\Cam\Desktop\GoScript\src\goscript-sdk.js): public SDK
- [src/wasm_exec.js](C:\Users\Cam\Desktop\GoScript\src\wasm_exec.js): Go runtime shim for `js/wasm`

Supporting docs:

- [reference/GETTING-STARTED.md](reference/GETTING-STARTED.md)
- [reference/SDK.md](reference/SDK.md)
- [reference/PACK-FORMAT.md](reference/PACK-FORMAT.md)

## Compiler Pipeline

The browser pipeline is roughly:

```text
source .go files
  -> VFS writes
  -> cmd/compile (WASM)
  -> main.o
  -> cmd/link (WASM) + stdlib .a archives
  -> main.wasm
  -> wasm_exec.js + browser host
  -> program output
```

Important implementation details:

- The toolchain pack loader validates the `GOSCRIPT` magic header before caching.
- Pack contents are cached in IndexedDB for reuse across reloads.
- The compiler and linker run as separate WebAssembly instances.
- File I/O expected by the Go toolchain is provided by an in-memory fs polyfill.
- Compilation failures are surfaced as real failures; the production path does not silently convert them into fake success.

## Toolchain Pack

`goscript.pack` is a binary container for the browser toolchain. Version 2 contains:

- compiler wasm
- linker wasm
- package name index
- concatenated stdlib package archives
- a package lookup table

The pack format is documented in [reference/PACK-FORMAT.md](reference/PACK-FORMAT.md).

## Use Cases

- Browser playgrounds that need a real Go compiler
- Interactive docs with runnable examples
- Teaching environments where installs are a liability
- Toolchain experiments around browser-hosted compilation
- Offline demos after the pack is cached locally

## Limitations

- Initial toolchain download is large: about 168 MB
- Compilation is memory-heavy and better on desktop-class browsers
- Only the packaged standard library is available by default
- This targets `js/wasm`; it is not a general replacement for the normal Go toolchain

## License

MIT
