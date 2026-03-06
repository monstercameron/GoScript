# Getting Started

This guide shows how to import GoScript into a larger web project and wire it up correctly.

The short version:

1. Install the package
2. Host `goscript.pack` somewhere your app can fetch it
3. Import `GoScript`
4. Create an initialized instance with `GoScript.create()`
5. Call `runCode()`

## What You Need To Host

The npm package gives you the JavaScript runtime and SDK code.

It does **not** bundle `goscript.pack` into your app automatically.

You must host the compiler pack yourself, for example at:

- `/assets/goscript.pack`
- `/public/goscript.pack`
- a CDN URL you control

Then pass that URL into `GoScript` with `packUrl`.

## Install

```bash
npm install goscript
```

## Minimal Browser Example

```js
import GoScript from 'goscript';

const gs = await GoScript.create({
  packUrl: '/assets/goscript.pack',
  stdout: (text) => {
    console.log(text);
  },
  stderr: (error) => {
    console.error(error);
  },
  progress: (percent, message) => {
    console.log(percent, message);
  }
});

await gs.runCode(`
package main

import "fmt"

func main() {
    fmt.Println("Hello from GoScript")
}
`);
```

## Typical UI Wiring

```js
import GoScript from 'goscript';

const outputEl = document.getElementById('output');
const runButton = document.getElementById('run');
const statusEl = document.getElementById('status');
const sourceEl = document.getElementById('source');

const gs = await GoScript.create({
  packUrl: '/assets/goscript.pack',
  stdout: (text) => {
    outputEl.textContent += text;
  },
  stderr: (error) => {
    outputEl.textContent += `Error: ${error}\n`;
  },
  progress: (percent, message) => {
    statusEl.textContent = `${percent}% ${message}`;
  }
});

statusEl.textContent = 'Ready';

runButton.addEventListener('click', async () => {
  outputEl.textContent = '';
  statusEl.textContent = 'Compiling...';

  try {
    const result = await gs.runCode(sourceEl.value);
    statusEl.textContent = `Done in ${result.compileTime}ms`;
  } catch (error) {
    statusEl.textContent = 'Failed';
    outputEl.textContent += error.message;
  }
});
```

## Recommended Asset Layout

For most frontend apps:

```text
your-app/
  public/
    goscript.pack
  src/
    main.js
```

Then:

```js
const gs = new GoScript({
  packUrl: '/goscript.pack'
});
```

For the smallest obvious API, prefer:

```js
const gs = await GoScript.create({
  packUrl: '/goscript.pack'
});
```

## React Example

```jsx
import { useEffect, useRef, useState } from 'react';
import GoScript from 'goscript';

export function GoRunner() {
  const sdkRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [output, setOutput] = useState('');

  useEffect(() => {
    GoScript.create({
      packUrl: '/goscript.pack',
      stdout: (text) => {
        setOutput((current) => current + text);
      }
    }).then((gs) => {
      sdkRef.current = gs;
      setReady(true);
    }).catch((error) => {
      setOutput(`Init failed: ${error.message}`);
    });
  }, []);

  async function run() {
    if (!sdkRef.current) {
      return;
    }

    setOutput('');

    try {
      await sdkRef.current.runCode(`
package main

import "fmt"

func main() {
    fmt.Println("Hello from React")
}
`);
    } catch (error) {
      setOutput(error.message);
    }
  }

  return (
    <div>
      <button disabled={!ready} onClick={run}>
        Run
      </button>
      <pre>{output}</pre>
    </div>
  );
}
```

## Vite / Next / Static Site Notes

- Put `goscript.pack` in your app's public/static assets folder.
- Use a same-origin `packUrl` when possible.
- Do not rely on client-side fetches from GitHub Releases directly; that usually fails due to CORS.

Good:

```js
packUrl: '/goscript.pack'
```

Usually bad in-browser:

```js
packUrl: 'https://github.com/owner/repo/releases/download/tag/goscript.pack'
```

## Multiple Source Files

`build()` and `compile()` accept either a string or a filename-to-source map.

```js
const result = await gs.build({
  'main.go': `
package main

func main() {
    hello()
}
`,
  'hello.go': `
package main

import "fmt"

func hello() {
    fmt.Println("hello from another file")
}
`
});

await gs.run(result.wasm);
```

## Recommended Public API

For new integrations, start with these methods:

- `GoScript.create(options)` - create and initialize in one step
- `gs.runCode(source)` - compile and run source code
- `gs.build(source)` - compile without running
- `gs.run(wasm)` or `gs.runWasm(wasm)` - run an already-built binary
- `gs.clearCompiledCache(source?)` - clear compiled cache for one source input

Older compatibility methods like `init()`, `compile()`, and `compileAndRun()` still exist, but they are no longer the simplest path to start with.

## Cache Behavior

GoScript uses two separate caches in the browser:

- toolchain cache: the downloaded `goscript.pack`
- compiled wasm cache: binaries keyed by source hash

If you are integrating into a larger app, you should decide whether to expose controls for:

- clearing the toolchain cache
- clearing compiled binaries

## Operational Constraints

- First-time initialization is large because `goscript.pack` is about 168 MB
- Compilation is CPU and memory heavy compared to normal browser tasks
- This package is meant for browser environments with WebAssembly support
- The output target is `js/wasm`

## Common Mistakes

### 1. Forgetting `packUrl`

If your app does not host the pack at the default path, initialization will fail.

```js
const gs = new GoScript({
  packUrl: '/my-custom-path/goscript.pack'
});
```

### 2. Hosting the pack behind a bad URL

The browser needs a real binary response, not an HTML error page.

### 3. Expecting npm install to include the pack

It does not. Host the pack separately.

### 4. Using server-only code paths

GoScript is designed for browser execution, not Node-side compilation.

## Next Reading

- [SDK.md](C:\Users\Cam\Desktop\GoScript\reference\SDK.md)
- [PACK-FORMAT.md](C:\Users\Cam\Desktop\GoScript\reference\PACK-FORMAT.md)
