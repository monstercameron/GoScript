# GoScript

**Run Go in the browser.** No server, no installation, no setup.

GoScript brings the full Go compiler to your web browser using WebAssembly. Write Go code, hit run, and see it execute—all client-side.

## What is this?

GoScript is a complete Go development environment that runs entirely in your browser. It compiles the official Go toolchain (`cmd/compile` and `cmd/link`) to WebAssembly, giving you a real Go compiler without any backend infrastructure.

This isn't a Go interpreter or a subset of Go—it's the actual Go compiler running in your browser tab.

## What can you do with it?

- **Learning & Education** — Teach Go without requiring students to install anything. Share a link and they're coding.
- **Interactive Documentation** — Embed runnable Go examples in your docs, blog posts, or tutorials.
- **Playgrounds** — Build your own Go playground for your library or framework.
- **Offline Development** — Once loaded, everything runs locally. No internet required.
- **Rapid Prototyping** — Quickly test Go snippets without context-switching to a terminal.

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

## SDK

GoScript provides a clean JavaScript SDK for integration. See [docs/SDK.md](docs/SDK.md) for full documentation.

```javascript
const gs = new GoScript();
gs.on('stdout', (text) => console.log(text));
gs.on('stderr', (text) => console.error(text));

await gs.init();
await gs.loadToolchain('assets/goscript.pack');

const { success, wasm, error } = await gs.compile('main.go', code);
if (success) await gs.run(wasm);
```

## How It Works

1. The Go compiler and linker are compiled to WebAssembly (~50MB combined)
2. The entire Go standard library is pre-compiled and bundled (~118MB)
3. A virtual filesystem provides the file I/O that Go expects
4. Your code compiles to WASM, then runs in a second WASM instance

Everything is cached in IndexedDB after the first load for fast subsequent visits.

## Limitations

- **Initial Load** — The toolchain is ~168MB. It's cached after the first load.
- **Memory** — Compilation uses significant memory. Works best on desktop browsers.
- **Packages** — Only the standard library is available. No `go get` for external packages (yet).

## License

MIT
