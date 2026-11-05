# Changelog

## Unreleased - 2026-11-04

### Toolchain
- Rebuilt the in-browser toolchain with **Go 1.27.3** (`go1.27.3 windows/amd64` host, official build from go.dev, SHA-256 verified).
  - `cmd/compile` and `cmd/link` built with `GOOS=js GOARCH=wasm`: `compile.wasm` 53.6 MB, `link.wasm` 12.5 MB.
  - Standard library rebuilt for `js/wasm` with the same Go version: **371 packages** (previously 340), about 138 MB of `.a` archives.
  - New `goscript.pack` (pack format v2) is 200.94 MB uncompressed.
  - The compiler, linker, and stdlib archives must come from the same Go version, so they were rebuilt together with the existing `tools/` scripts: `copy-std-lib`, `generate-pkg-index`, `pack-stdlib`, `pack-toolchain`.
  - `src/wasm_exec.js` already matches the Go 1.27.3 `lib/wasm/wasm_exec.js` (only line endings differ), so it is unchanged.
- Verified end to end in the playground: Hello World compiles (exit code 0), links to a 2.4 MB `main.wasm`, and runs.

### GitHub Pages: no manual pack download
- The site now ships its own toolchain as `docs/assets/goscript.pack.gz` (**45.4 MB**, under GitHub's 50 MB warning and 100 MB limit). Visitors no longer download `goscript.pack` by hand, and the deploy no longer depends on the `demo` release asset.
- `src/platform.js`: new `gunzipIfNeeded()` decompresses the pack in the browser with `DecompressionStream('gzip')`. GitHub Pages serves `.gz` as an opaque file (no `Content-Encoding`), so the loader does it. It only acts when the bytes start with the gzip magic (`1f 8b`), so raw packs and servers that already send `Content-Encoding: gzip` keep working.
- `docs/index.html`: `packUrl` now points to `assets/goscript.pack.gz`.
- `.github/workflows/deploy-pages.yml`: removed the `gh release download` step; the build now fails if `docs/assets/goscript.pack.gz` is missing. (`PACK_TAG` is no longer used.)
- `tools/pack-toolchain.ps1` / `.sh`: also write `docs/assets/goscript.pack.gz` after packing, so rebuilding the pack refreshes the committed file.
- Compression measured on the 200.9 MB pack: gzip 45.4 MB (77% smaller), brotli quality 11 29.9 MB (85% smaller). gzip was chosen because the browser decompresses it natively on every host. The gzip file decompresses to byte-identical contents (SHA-256 checked).

### Fixes
- `docs/scripts/playground/examples.js`: removed a stray `EXAMPLES['select'] = EXAMPLES.select_stmt;` line that threw `ReferenceError: EXAMPLES is not defined` on load and stopped the `select` example alias from being set.
- `src/platform.js` `ToolchainLoader.setCache()`: added a transaction `onabort` handler. Chromium rejects IndexedDB values over about 127 MB (`max=133169152` bytes), the abort was never handled, and `init()` hung forever on "Caching toolchain for future use...". A failed cache write is now logged as a warning and startup continues without the cache.

### Known issues / follow-ups
- The toolchain is not cached between page loads: the decompressed pack (about 201 MB) exceeds the IndexedDB value limit, so every visit downloads the 45.4 MB file again. The log also still prints "Toolchain cached successfully" after the failure warning. Storing the pack in chunks under the limit would fix both.
- The pack is committed to git, so each rebuild adds about 45 MB to history.
- `README.md`, `reference/SDK.md`, and the page header still mention `npm run fetch:pack` and a "168 MB" pack.
- `tools/build-compiler.ps1` copies `wasm_exec.js` to `src\runtime\wasm_exec.js`, which does not exist (the file is `src\wasm_exec.js`).
- `docs/scripts/*.min.js` were not regenerated (no Node available in the build environment); CI rebuilds them from `src/`. `docs/scripts/goscript.bundle.js` and `goscript.js` were patched by hand to match `src/platform.js`.
