# Changelog

## Unreleased - 2026-11-04

### Added: Advanced Todo (20 Go files) at `docs/todo-advanced.html`
- A full task manager written entirely in Go (20 files, about 1,950 lines, `docs/go/todo-pro/`, listed in `manifest.json`). The HTML is only an empty `<div id="app-root">`; Go builds the whole UI, injects its own CSS, and attaches every listener.
- Features: projects, tags, priorities, due dates, a search language (`tag:work priority:high due:overdue is:done project:home` plus free words), sort options, inline title editing, undo/redo (Ctrl+Z / Ctrl+Shift+Z) through whole-state snapshots, statistics with a text progress bar, keyboard shortcuts (`n`, `/`, `?`, Esc), toasts, JSON export/import with a versioned schema and a v1 to v2 migration, and persistence to `localStorage`.
- Go techniques it shows: packages split across many files, a pub/sub `Bus`, `time.AfterFunc` debouncers for search and autosave (real Go timers and goroutines), `encoding/json` with a custom `MarshalText` type, delegated DOM listeners through `syscall/js`, and DOM building with text nodes only (no `innerHTML`).
- Compiles together in the browser in about 2.9 s (4.6 MB wasm). Verified with real input: search, add with tag normalisation, click-to-edit, undo/redo, export, a rejected invalid import, a migrated v1 import, undoing the import, and state restored after a reload. The sources pass `go vet` and `gofmt`.
- Shared loader `docs/scripts/todo-loader.js` now drives both todo pages. Tab navigation is now Playground / Simple Todo / Advanced Todo.

### Added: size comparison, source files vs a precompiled `.wasm`
- New section on both todo pages (`docs/scripts/size-compare.js`) renders from `docs/data/size-report.json`, produced by `tools/measure-sizes.ps1` (PowerShell 7, Go 1.27.3). Nothing is hardcoded in the page.
- Measured, brotli on the wire: a plain `go build` `.wasm` is **893.9 KB** (simple todo) and **954.4 KB** (advanced todo), against **3.2 KB** and **19.1 KB** of source. That makes the binary about 279x and 50x bigger than its source. `-ldflags "-s -w"` saves only about 1.4%.
- The compiler pack is a one-time 29.9 MB with brotli (45.4 MB with gzip, which is what GitHub Pages serves) plus a 15.4 KB loader. The section includes a slider for how many different apps a visitor loads. Break-even is about **33 apps** with brotli: for one fixed app a plain `.wasm` is far smaller, and the source model wins with many programs, user-editable code, or code that changes often. It also states the caveats: the first in-browser compile, no TinyGo comparison, and brotli needing `Content-Encoding: br` from the host.

### Added: animations and transitions across the site
- **Page transitions:** navigating between the three pages now crossfades with a short slide (cross-document View Transitions, one CSS rule). The nav keeps its place while the page changes. Browsers without support just navigate normally. Supported in this Chromium pane; the crossfade itself was not recorded or watched.
- **Entrances:** on the todo pages, cards on screen at load rise in with a short stagger, and cards below the fold fade up as they scroll into view (`docs/scripts/motion.js`). Nothing is hidden if the script fails to load. Headline numbers count up once when they first scroll into view and land on the exact value (for example 954.4 KB, 19.1 KB, 29.9 MB). Bars grow from zero and the stat tiles stagger in. Animations inside a not-yet-revealed card are held paused until it appears.
- **Pipeline:** each step flashes green and its check pops when it completes, the active step has a sweeping progress line, a failed step shakes, and the loading text breathes.
- **Interaction:** hover lift and press-down on all buttons and tabs, a shimmering active tab, focus glow on inputs, hover highlight on rows, tag chips and stat tiles, a half-second fade when the verdict line changes, a short swap animation when switching source files, and an animated open for folds and the data panel.
- **Go apps:** both apps now flag only the row that just changed (`Store.TakeTouched()`), so only that row slides in and its checkbox pops. Searching, sorting or re-rendering never replays it, which a plain CSS animation on rebuilt rows would have done to every row on every render. The advanced app's toasts slide in and fade out just before removal.
- **Reduced motion:** with `prefers-reduced-motion` on, the shared CSS cuts every animation and transition to near zero, `motion.js` does nothing, and the Go app's own CSS disables its animations. This also fixes the playground, whose float, shine and reveal animations previously ignored the setting. I could not flip the OS setting here, so I checked the logic directly: with reduced motion stubbed, `motion.js` created no observers and added no classes, and the unwrapped CSS block gave near-zero durations on stages, tabs, tiles, rows and the playground's background orbs.
- Not included: exit animations when a row is deleted (the Go apps rebuild the list, so a deleted row disappears immediately).
- The Go sources changed again, so `docs/data/size-report.json` was regenerated (advanced source now 55.8 KB, 19.1 KB brotli; ratios 279x and 50x).

### Changed: performance and size panels redesigned to be easy to read
- **Compile time panel** now opens with the two numbers that matter: a **first build with no cache** (about 4.4 s for the advanced app) and a **cached load** (about 20 ms), plus the speed-up between them. They use the **median**, because one throttled background-tab run had stretched the old average to 5.7 s (the slowest recorded build was 12.8 s). The range is shown next to it, so outliers stay visible.
- The compiler/linker breakdown now describes the recorded build closest to the median. Before, it showed whichever build ran last, which could be that outlier and contradict the headline. Each bar segment says what it does in plain words (compile: Go source to object code; link: object code to a runnable .wasm). Stage timings and the full history table are folded away, and the history table dropped from eight columns to six.
- **Size panel** now leads with three headline numbers (a compiled .wasm 954.4 KB, the Go source 19.1 KB, the compiler 29.9 MB once), a one-sentence rule of thumb with the break-even (about 33 apps), then the slider and the live cache status. The old page of tables and bullets is folded under "Full measurements" and "Notes and caveats", and the panel went from about 1,450 px tall to about 930 px.
- Table units are consistent: the per-app table is all KB with thousands separators, so a column compares directly. The shared compiler and loader rows are in a separate table. A "Larger by" column replaces the old ratio rows, and the `-s -w` rows became one sentence (stripping saves only 1.4%).
- Empty states explain what to do ("Press Time a fresh build", "Reload the page to see a cached load") instead of showing blanks.
- On both todo pages the compile panel now sits below the app instead of above it, so the demo comes first. Folds get a visible triangle, because the page's reset CSS had removed the default one. Verified on desktop, 375 px and 320 px.

### Fixed: responsive and mobile-friendly layouts (all three pages)
- Audited the playground, Simple Todo and Advanced Todo at 320, 375 and 767 px (touch) and 768 px and desktop widths for horizontal overflow, off-screen elements, touch-target size and tiny text. No page scrolled sideways at any width. Everything below was found and fixed in that audit.
- **Nav:** at phone width the third tab ("Advanced Todo") was clipped and only reachable by scrolling the pill sideways. The nav now wraps, with the brand on its own row and three equal, 44 px tabs.
- **Advanced Todo order:** on phones the whole sidebar (projects, tags, stats) came before the task list, pushing the tasks about 1,000 px down. The task manager now comes first and the sidebar follows. The add form is two columns under 820 px and one column under 420 px, the search box takes a full row, and toasts span the screen width.
- **Tables:** the size and compile-stats tables were 560 and 737 px wide inside a 263 px box at 320 px, so every number was hidden off-screen. On phones each row is now a stacked card with a label beside each value. Desktop keeps the normal tables.
- **Touch:** under 640 px or on any coarse-pointer device, buttons, filters, tabs, sidebar items, delete buttons, the range slider and radio labels are at least 44 px tall. The small checkbox circles keep their look but get a 48 px tap area. Form fields use 16 px text with a 44 px minimum height, which stops iOS Safari zooming the page on focus.
- Changes are in `docs/styles/site.css` and, for the Go-built UI, the injected CSS in `docs/go/todo-pro/style.go`. The playground's own `output.css` is untouched. Because `style.go` grew, `docs/data/size-report.json` was regenerated: the advanced source is now 55.8 KB (19.1 KB brotli).
- Not covered: real devices and Safari or Firefox (checked only in the Chromium-based pane with touch emulation), landscape phone sizes, and text-zoom or browser-font-size changes.

### Added: compile-time tracking
- `src/engine.js`: the compilation manager now records `performance.now()` timings for every build: the total, `cmd/compile` alone, `cmd/link` alone, and each pipeline stage (cache check, load sources, build environment, compile and link, cache write, prepare), plus whether it was a compiled-wasm cache hit. They are exposed as `lastTimings`, and `GoScript.compile()` now returns them as `timings` (documented in `reference/SDK.md`).
- New "Compile time" panel on both todo pages (`docs/scripts/compile-stats.js`): the last build with a compiler/linker/other breakdown bar and per-stage times, and a statistics table per example (fresh builds, average, compiler and linker averages, fastest and slowest, cache hits and their average). Every build is saved to a history in localStorage (last 60 kept).
- "Time a fresh build" clears the cached binary for the sources, compiles again without running the program, and adds the result to the history. "Clear history" empties it. The compile step in the pipeline now reads, for example, "2.17 s = compile 1.60 s + link 548 ms" or "cache hit, 12 ms (no compiler run)".
- Measured in this browser: a fresh build of the simple todo (3 files) took 2.17 s (compiler 74%, linker 25%), and the advanced todo (20 files) took 4.43 s (compiler 82%, linker 17%). A cache hit takes 12 to 23 ms. These are single samples from one machine and one browser, so expect variation. The tab is frozen while a fresh build runs, and the running app stayed fully interactive after an in-page rebuild.
- `docs/scripts/goscript.bundle.js` was patched by hand with the same engine and SDK changes (no Node here); CI rebuilds it from `src/`.

### Added: syntax highlighting in the source viewer
- Both todo pages now show the fetched `.go` files in a read-only CodeMirror editor with the Go mode, the Dracula theme and line numbers (same CodeMirror 5.65.16 from cdnjs that the playground uses). If the CDN scripts fail to load, the plain `<pre>` viewer is used instead.
- Short files fit their content and long ones cap at 460 px and scroll inside the box. Switching files resets the scroll to the top.
- `output.css` forces `.CodeMirror` to `height: 300px !important` and its own fonts for the playground, so `site.css` overrides them with a higher-specificity rule driven by a `--src-h` CSS variable.

### Added: the compiler pack stays cached (Cache Storage)
- `src/platform.js`: new `fetchPackCached()` stores the downloaded pack in the browser's Cache Storage (`goscript-toolchain-v1`), keyed by URL. After the first visit every page loads the toolchain from disk with no network request, whatever the host's HTTP cache headers are (GitHub Pages only allows short ones). Changing the `?v=` in the pack URL fetches a new pack and deletes older versions of the same file. Any Cache Storage failure falls back to a plain fetch.
- This also fixes the earlier problem that the toolchain was re-downloaded on every visit, because the decompressed pack is over the IndexedDB value limit. It stores the compressed 45.4 MB file, which Cache Storage accepts.
- Verified: a reload made **zero** network requests for the pack, the pipeline showed "from cache", and the page reported about 55.8 MB stored for the site. The section has a button to clear the cache so you can see the difference.
- Pack URLs on all pages now carry `?v=go1.27.3`. Bump it whenever the pack is rebuilt.

### Added: Go-powered Todo demo page (Simple Todo, `docs/todo.html`)
- New page `docs/todo.html` demonstrates shipping **plain `.go` text files** that are compiled in the browser on page load. The page itself contains only a disabled HTML skeleton and no todo logic in JavaScript.
- Load sequence (each step is shown live in a pipeline panel): fetch `docs/go/todo/{main,todo,dom}.go` as text, load the toolchain, `compile()` the files together, run the WASM, then **the Go program attaches every event listener** via `syscall/js` and enables the controls. Go signals the page with `window.onGoTodoReady`.
- The Go app (about 8 KB of source, compiles to a 4.3 MB wasm): add (button or Enter), toggle, delete, All/Active/Completed filters, clear completed, remaining counter, and persistence to `localStorage` with `encoding/json`. Text is written with `textContent`, so user input cannot inject markup. `main` ends in `select {}` to keep the Go runtime and its `js.Func` callbacks alive.
- The page shows the exact fetched source in a tabbed viewer.
- Verified in the browser: a first load compiled in about 4.3 s, and a reload took 18 ms because the SDK caches the compiled wasm per source. Add, Enter, toggle, delete, all filters, clear, and reload persistence all worked.
- Top tab navigation (`Playground` / `Go-powered Todo`) added to both pages. New shared stylesheet `docs/styles/site.css` is hand-written, so `output.css` does not need a rebuild.
- Phone width (375 px) checked on the advanced page: stacked layout, no horizontal scroll. Not yet checked: a deployed GitHub Pages run.

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
