# GoScript

**Run the real Go compiler in the browser.**

GoScript is a browser-hosted Go toolchain. It ships `cmd/compile`, `cmd/link`, and a precompiled `js/wasm` standard library inside a single `goscript.pack`, then drives that toolchain from JavaScript through an in-memory virtual filesystem.

This is not an interpreter, not a toy parser, and not a language subset. The browser runs the same compile-then-link pipeline you would invoke with `go tool compile` and `go tool link`, then executes the resulting WebAssembly.

**Live demo: <https://monstercameron.github.io/GoScript/>**

## Try it

| Page | What it shows |
|---|---|
| [Playground](https://monstercameron.github.io/GoScript/index.html) | An editor with examples. Write Go, compile it in the tab, see the output. |
| [Simple Todo](https://monstercameron.github.io/GoScript/todo.html) | A todo app written in **3 plain-text `.go` files**. The page is a disabled HTML skeleton; Go is fetched, compiled and run on load, and then the Go program attaches every event listener. |
| [Advanced Todo](https://monstercameron.github.io/GoScript/todo-advanced.html) | A task manager in **20 Go files** (projects, tags, priorities, due dates, a search language, undo/redo, JSON import/export). The page is an empty `<div>`; Go builds the whole UI and injects its own CSS. |

Both todo pages show a live **pipeline** (fetch sources, load toolchain, compile and link, run, listeners attached), a syntax-highlighted view of the exact `.go` files that were compiled, a **compile time** panel, and a **source vs precompiled `.wasm`** size comparison.

## How it works

```text
.go text files
  -> written into an in-memory filesystem
  -> cmd/compile (WASM)  -> main.o
  -> cmd/link (WASM) + stdlib .a archives -> main.wasm
  -> wasm_exec.js runs it in the page
```

1. The toolchain pack contains `compile.wasm`, `link.wasm`, a package index, and precompiled `.a` archives for the standard library (371 packages). Format: [reference/PACK-FORMAT.md](reference/PACK-FORMAT.md).
2. The pack is downloaded once, stored in the browser's **Cache Storage**, and unpacked into a virtual filesystem.
3. Your source is written into that filesystem and compiled and linked by the two WebAssembly programs.
4. The compiled `.wasm` is cached per source, so repeat loads skip the compiler.
5. The result runs with Go's `wasm_exec.js`. A Go program that ends in `select {}` keeps its `syscall/js` callbacks alive, which is how the todo apps handle clicks.

The standard library is prebuilt, not recompiled on each run. That is the only reason this is practical in a browser.

## Performance and size

Measured with Go 1.27.3. The numbers behind this table live in [docs/data/size-report.json](docs/data/size-report.json) (written by [tools/measure-sizes.ps1](tools/measure-sizes.ps1)), and the pages render them live.

| | Size |
|---|---|
| Toolchain pack, uncompressed | 200.9 MB |
| Toolchain pack, **gzip (what GitHub Pages serves)** | 45.4 MB |
| Toolchain pack, brotli | 29.9 MB |
| Simple Todo source / its compiled `.wasm` (brotli) | 3.2 KB / 893.9 KB |
| Advanced Todo source / its compiled `.wasm` (brotli) | 19.1 KB / 954.4 KB |

| In the browser | Time |
|---|---|
| First build, no cache, 3 files | about 2 s |
| First build, no cache, 20 files | about 3 to 4.5 s (one throttled run took 12.8 s) |
| Cached load (compiled `.wasm` already stored) | about 12 to 45 ms |

Those timings are from one machine and one Chromium-based browser, and they vary with CPU load. The pages record every build in your own browser and show medians, so you can measure yours.

**Source or `.wasm`?** For a single fixed app, ship the compiled `.wasm`: it is smaller and has no build step. Once a visitor opens roughly **33 different programs** (brotli figures), or the code is edited by users or changes often, shipping source plus one cached compiler is smaller, because each extra program costs only its text. Brotli figures apply on hosts that send `Content-Encoding: br`. This repo ships the gzip copy because it works on any static host.

## Using the SDK

Build the bundles from a checkout (`npm ci && npm run build`), then load `dist/goscript.bundle.js` with a script tag, or use `dist/index.mjs` / `dist/index.cjs` as a module. Full reference: [reference/SDK.md](reference/SDK.md).

```html
<script src="dist/goscript.bundle.js"></script>
<script>
const gs = new GoScript({
    packUrl: 'assets/goscript.pack.gz?v=go1.27.3',   // .gz is decompressed in the browser
    stdout: (text) => console.log(text)
});
await gs.init();

// One string, or a { filename: source } map for several files.
const built = await gs.compile({
    'main.go':  'package main\nfunc main() { greet() }',
    'greet.go': 'package main\nimport "fmt"\nfunc greet() { fmt.Println("Hello from the browser!") }'
});
console.log(built.size, built.timings);   // timings: { cacheHit, totalMs, compilerMs, linkerMs, stages }

// run() resolves only when the program exits. Don't await it for programs that never do.
gs.run(built.wasm);
</script>
```

Hosting the pack yourself:

- Serve `goscript.pack.gz` (45.4 MB) or a raw `goscript.pack`. The loader detects gzip by its header, so either works, and a server that already sends `Content-Encoding: gzip` is fine too.
- The pack is cached by its full URL. **Change the `?v=` value whenever you rebuild the pack**, otherwise returning visitors keep the old one. The old entry is deleted when a new version is fetched.

## Run it locally

The site is static and the pack is committed, so there is nothing to build to view it. Serve the `docs/` folder with any static file server:

```bash
npx serve -l 3000 docs        # then open http://localhost:3000
```

(During development it was checked with a small Go file server; `npx serve` is the equivalent, but was not run in this environment.)

To change the SDK, edit `src/`, run `npm run build`, and copy `dist/goscript.bundle.js` and `dist/goscript.bundle.min.js` into `docs/scripts/`. The Pages workflow does that copy for you on deploy. Styles are `docs/styles/input.css` (Tailwind, `npm run css`) plus the hand-written `docs/styles/site.css`.

## Rebuilding the toolchain pack

The compiler, linker and standard library **must be built with the same Go version**. These are the steps that produced the committed pack on Windows with Go 1.27.3 (PowerShell):

```powershell
# 1. Compile the compiler and linker to WebAssembly.
$env:GOOS = 'js'; $env:GOARCH = 'wasm'
go build -o static/bin/compile.wasm cmd/compile
go build -o static/bin/link.wasm    cmd/link

# 2. Build the standard library archives and index them.
powershell -File tools/copy-std-lib.ps1
powershell -File tools/generate-pkg-index.ps1

# 3. Pack. The last step also writes docs/assets/goscript.pack.gz.
powershell -File tools/pack-stdlib.ps1
powershell -File tools/pack-toolchain.ps1
```

Then bump the `?v=` in `docs/index.html`, `docs/todo.html` and `docs/todo-advanced.html`, optionally re-run `pwsh -File tools/measure-sizes.ps1` (needs PowerShell 7) to refresh the size report, and commit `docs/assets/goscript.pack.gz`. It is 45 MB, so every rebuild adds about that much to git history.

Notes:

- `npm run build:compiler`, `build:stdlib` and `build:toolchain` wrap these scripts. They were not run through npm here.
- The `.sh` variants exist for the compiler and packing steps and need Node. The stdlib copy and index steps exist only as PowerShell scripts.
- `static/` is build output and is gitignored.

## Deployment

Pushing to `main` runs [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml): install, `npm run build`, `npm run css`, assemble the site from `docs/` (with freshly built bundles), check that `docs/assets/goscript.pack.gz` is present, and publish to GitHub Pages. The pack is part of the repo, so nothing needs downloading by hand and the `demo` release asset is no longer used by the site.

## Repository layout

```text
src/                    the runtime, bundled into dist/ by tools/build.js
  constants.js            shared paths, cache names, defaults
  platform.js             virtual filesystem, fs bridge, cache, toolchain loader
  engine.js               compilation manager, build timings, program runner
  goscript-sdk.js         the public GoScript class
  wasm_exec.js            Go's js/wasm runtime shim
docs/                   the GitHub Pages site
  index.html              playground
  todo.html               Simple Todo
  todo-advanced.html      Advanced Todo
  go/todo/                3 Go files (Simple Todo)
  go/todo-pro/            20 Go files and a manifest (Advanced Todo)
  assets/goscript.pack.gz the shipped toolchain pack (45.4 MB)
  data/size-report.json   measured sizes
  scripts/                bundles, todo loader, panels, motion
  styles/                 Tailwind input/output and site.css
tools/                  build and measurement scripts
reference/              SDK, getting started, and pack format docs
CHANGELOG.md            what changed and why
```

## Browser support and accessibility

- Needs WebAssembly and `DecompressionStream('gzip')`. Cache Storage is strongly recommended: without it the pack is downloaded on every visit. Page-to-page crossfades use cross-document view transitions where available and are skipped elsewhere.
- Layouts were checked from 320 px wide up. Touch devices get 44 px targets and 16 px form text.
- With `prefers-reduced-motion` on, animations and transitions are turned off, including the playground's.
- Everything was checked in one Chromium-based browser. Safari, Firefox, real phones and landscape phones were not tested.

## Limitations

- The first visit downloads about 45 MB, and compilation is memory-heavy, so it suits desktop-class browsers best.
- Compiling runs on the page's main thread, so the tab freezes for a few seconds during a fresh build.
- The decompressed pack is over Chromium's IndexedDB value limit (about 127 MB), so the IndexedDB copy is skipped with a console warning. The compressed file in Cache Storage is what makes repeat visits fast.
- Only the packaged standard library is available, and the target is `js/wasm`. It is not a general replacement for the normal Go toolchain.
- The Playwright config exists (`npm test`), but no tests are checked in yet.
- The `demo` release's `goscript.pack` (what `npm run fetch:pack` downloads) is an earlier, smaller build. The site does not use it.

## License

MIT. See [CHANGELOG.md](CHANGELOG.md) for the history of this work.
