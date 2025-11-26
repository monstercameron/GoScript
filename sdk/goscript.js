/**
 * @fileoverview GoScript SDK - Browser-based Go compiler using WebAssembly
 * @version 1.0.0
 * @license MIT
 * 
 * @description
 * GoScript is a complete Go-to-WebAssembly compilation toolkit that runs entirely
 * in the browser. It packages the Go compiler, linker, and standard library into
 * a single distributable file for easy integration.
 * 
 * @example Basic Usage
 * ```javascript
 * const goscript = new GoScript();
 * await goscript.init();
 * 
 * const result = await goscript.compile(`
 *   package main
 *   import "fmt"
 *   func main() { fmt.Println("Hello!") }
 * `);
 * 
 * await goscript.run(result.wasm);
 * ```
 * 
 * @example With Output Capture
 * ```javascript
 * const goscript = new GoScript({
 *   onOutput: (text) => console.log(text),
 *   onError: (err) => console.error(err),
 *   onProgress: (pct, msg) => updateUI(pct, msg)
 * });
 * ```
 */

(function(global) {
    'use strict';

    /**
     * @typedef {Object} GoScriptOptions
     * @property {string} [packUrl='assets/goscript.pack'] - URL to the goscript.pack file
     * @property {Function} [onOutput] - Callback for stdout/stderr output
     * @property {Function} [onError] - Callback for error messages
     * @property {Function} [onProgress] - Callback for progress updates (percentage, message)
     * @property {boolean} [debug=false] - Enable debug logging
     */

    /**
     * @typedef {Object} CompileResult
     * @property {boolean} success - Whether compilation succeeded
     * @property {ArrayBuffer} [wasm] - Compiled WASM binary (if successful)
     * @property {string} [error] - Error message (if failed)
     * @property {Object} metadata - Compilation metadata
     * @property {number} metadata.compileTime - Time taken in milliseconds
     * @property {number} metadata.wasmSize - Size of output WASM in bytes
     */

    /**
     * @typedef {Object} RunResult
     * @property {boolean} success - Whether execution succeeded
     * @property {string} [output] - Captured stdout output
     * @property {string} [error] - Error message (if failed)
     * @property {number} exitCode - Process exit code
     */

    /**
     * GoScript SDK - Browser-based Go compiler
     * @class
     */
    class GoScript {
        /**
         * Create a new GoScript instance
         * @param {GoScriptOptions} [options={}] - Configuration options
         */
        constructor(options = {}) {
            /** @private */
            this.options = {
                packUrl: options.packUrl || 'assets/goscript.pack',
                onOutput: options.onOutput || null,
                onError: options.onError || null,
                onProgress: options.onProgress || null,
                debug: options.debug || false
            };

            /** @private */
            this.state = {
                initialized: false,
                compilerReady: false,
                compiling: false
            };

            /** @private */
            this.toolchain = null;

            /** @private */
            this.vfs = null;

            /** @private */
            this.compilerWasm = null;

            /** @private */
            this.linkerWasm = null;

            /** @private */
            this.fsPolyfill = null;

            /** @private */
            this.goRuntime = null;
        }

        /**
         * Initialize the GoScript SDK
         * Loads the toolchain pack and prepares the compiler
         * @returns {Promise<void>}
         * @throws {Error} If initialization fails
         * 
         * @example
         * const gs = new GoScript();
         * await gs.init();
         * console.log('GoScript ready!');
         */
        async init() {
            if (this.state.initialized) {
                this._log('Already initialized');
                return;
            }

            this._progress(0, 'Starting initialization...');

            try {
                // Initialize virtual filesystem
                this._progress(5, 'Creating virtual filesystem...');
                this.vfs = new VirtualFS();

                // Load toolchain pack
                this._progress(10, 'Downloading toolchain...');
                await this._loadToolchain();

                // Setup Go runtime
                this._progress(90, 'Initializing Go runtime...');
                this._setupGoRuntime();

                this.state.initialized = true;
                this.state.compilerReady = true;
                this._progress(100, 'Ready');
                this._log('GoScript initialized successfully');

            } catch (error) {
                this._error(`Initialization failed: ${error.message}`);
                throw error;
            }
        }

        /**
         * Compile Go source code to WebAssembly
         * @param {string|Object} source - Go source code string or object with multiple files
         * @param {Object} [options={}] - Compilation options
         * @param {string} [options.packageName='main'] - Package name
         * @param {boolean} [options.optimize=true] - Enable optimizations
         * @returns {Promise<CompileResult>}
         * 
         * @example Single file
         * const result = await gs.compile('package main\nfunc main() {}');
         * 
         * @example Multiple files
         * const result = await gs.compile({
         *   'main.go': 'package main\nfunc main() { hello() }',
         *   'hello.go': 'package main\nimport "fmt"\nfunc hello() { fmt.Println("Hi") }'
         * });
         */
        async compile(source, options = {}) {
            if (!this.state.initialized) {
                throw new Error('GoScript not initialized. Call init() first.');
            }

            if (this.state.compiling) {
                throw new Error('Compilation already in progress');
            }

            this.state.compiling = true;
            const startTime = Date.now();

            try {
                // Normalize source to object format
                const sourceFiles = typeof source === 'string' 
                    ? { 'main.go': source }
                    : source;

                this._progress(0, 'Starting compilation...');

                // Write source files to VFS
                this._progress(10, 'Preparing source files...');
                const tempDir = '/tmp/build';
                this.vfs.mkdir(tempDir);
                
                const filePaths = [];
                for (const [filename, content] of Object.entries(sourceFiles)) {
                    const path = `${tempDir}/${filename}`;
                    this.vfs.writeFile(path, content);
                    filePaths.push(path);
                }

                // Run compiler
                this._progress(30, 'Compiling Go to object file...');
                await this._runCompiler(filePaths);

                // Run linker
                this._progress(60, 'Linking...');
                await this._runLinker();

                // Read output
                this._progress(90, 'Reading output...');
                const wasmPath = `${tempDir}/main.wasm`;
                
                if (!this.vfs.exists(wasmPath)) {
                    throw new Error('Compilation failed: no output generated');
                }

                const wasmData = this.vfs.readFile(wasmPath);
                const wasmBuffer = wasmData instanceof Uint8Array 
                    ? wasmData.buffer 
                    : wasmData;

                this._progress(100, 'Compilation complete');

                return {
                    success: true,
                    wasm: wasmBuffer,
                    metadata: {
                        compileTime: Date.now() - startTime,
                        wasmSize: wasmBuffer.byteLength,
                        sourceFiles: Object.keys(sourceFiles).length
                    }
                };

            } catch (error) {
                this._error(`Compilation failed: ${error.message}`);
                return {
                    success: false,
                    error: error.message,
                    metadata: {
                        compileTime: Date.now() - startTime,
                        wasmSize: 0
                    }
                };
            } finally {
                this.state.compiling = false;
            }
        }

        /**
         * Run a compiled WebAssembly binary
         * @param {ArrayBuffer} wasmBinary - Compiled WASM binary from compile()
         * @param {Object} [options={}] - Execution options
         * @param {string[]} [options.args=[]] - Command line arguments
         * @param {Object} [options.env={}] - Environment variables
         * @returns {Promise<RunResult>}
         * 
         * @example
         * const compiled = await gs.compile(source);
         * if (compiled.success) {
         *   const result = await gs.run(compiled.wasm);
         *   console.log('Output:', result.output);
         * }
         */
        async run(wasmBinary, options = {}) {
            if (!this.state.initialized) {
                throw new Error('GoScript not initialized. Call init() first.');
            }

            const output = [];
            const originalCallback = this.options.onOutput;

            try {
                // Capture output
                this.options.onOutput = (text) => {
                    output.push(text);
                    if (originalCallback) originalCallback(text);
                };

                // Create new Go instance for execution
                const go = new Go();
                go.argv = ['main.wasm', ...(options.args || [])];
                go.env = { ...go.env, ...(options.env || {}) };

                // Setup output capture
                this._setupOutputCapture(go);

                // Instantiate and run
                const result = await WebAssembly.instantiate(wasmBinary, go.importObject);
                await go.run(result.instance);

                return {
                    success: true,
                    output: output.join(''),
                    exitCode: 0
                };

            } catch (error) {
                this._error(`Execution failed: ${error.message}`);
                return {
                    success: false,
                    output: output.join(''),
                    error: error.message,
                    exitCode: 1
                };
            } finally {
                this.options.onOutput = originalCallback;
            }
        }

        /**
         * Compile and run Go source code in one step
         * @param {string|Object} source - Go source code
         * @param {Object} [options={}] - Options passed to compile() and run()
         * @returns {Promise<RunResult & {compileResult: CompileResult}>}
         * 
         * @example
         * const result = await gs.compileAndRun(`
         *   package main
         *   import "fmt"
         *   func main() { fmt.Println("Hello, World!") }
         * `);
         * console.log(result.output); // "Hello, World!\n"
         */
        async compileAndRun(source, options = {}) {
            const compileResult = await this.compile(source, options);
            
            if (!compileResult.success) {
                return {
                    success: false,
                    output: '',
                    error: compileResult.error,
                    exitCode: 1,
                    compileResult
                };
            }

            const runResult = await this.run(compileResult.wasm, options);
            return {
                ...runResult,
                compileResult
            };
        }

        /**
         * Get the current state of the SDK
         * @returns {Object} Current state
         */
        getState() {
            return { ...this.state };
        }

        /**
         * Get statistics about the loaded toolchain
         * @returns {Object} Toolchain statistics
         */
        getStats() {
            if (!this.toolchain) {
                return null;
            }

            return {
                compilerSize: this.compilerWasm?.byteLength || 0,
                linkerSize: this.linkerWasm?.byteLength || 0,
                packageCount: this.toolchain.packageIndex?.size || 0,
                vfsStats: this.vfs?.getStats() || null
            };
        }

        /**
         * Check if a standard library package is available
         * @param {string} packageName - Package name (e.g., 'fmt', 'crypto/sha256')
         * @returns {boolean}
         */
        hasPackage(packageName) {
            return this.toolchain?.packageIndex?.has(packageName) || false;
        }

        /**
         * Get list of available standard library packages
         * @returns {string[]}
         */
        getPackages() {
            return this.toolchain?.packageNames || [];
        }

        /**
         * Reset the SDK state (clears VFS, keeps toolchain loaded)
         */
        reset() {
            if (this.vfs) {
                this.vfs.clear();
                this._reloadStdLib();
            }
            this._log('SDK reset');
        }

        // ============================================================
        // Private Methods
        // ============================================================

        /** @private */
        async _loadToolchain() {
            this._log(`Loading toolchain from ${this.options.packUrl}`);

            const response = await fetch(this.options.packUrl);
            if (!response.ok) {
                throw new Error(`Failed to load toolchain: ${response.status}`);
            }

            const packData = await response.arrayBuffer();
            this._progress(50, `Downloaded ${(packData.byteLength / 1024 / 1024).toFixed(1)} MB`);

            // Parse toolchain pack
            this.toolchain = this._parseToolchainPack(packData);
            this.compilerWasm = this.toolchain.compilerWasm;
            this.linkerWasm = this.toolchain.linkerWasm;

            // Load packages into VFS
            this._progress(70, 'Loading standard library...');
            this._loadPackagesIntoVFS();

            this._log(`Toolchain loaded: ${this.toolchain.packageIndex.size} packages`);
        }

        /** @private */
        _parseToolchainPack(packData) {
            const view = new DataView(packData);
            let offset = 0;

            // Magic header
            const magic = new TextDecoder().decode(new Uint8Array(packData, 0, 8));
            if (magic !== 'GOSCRIPT') {
                throw new Error('Invalid toolchain pack format');
            }
            offset += 8;

            // Version
            const version = view.getUint32(offset, true);
            if (version !== 2) {
                throw new Error(`Unsupported pack version: ${version}`);
            }
            offset += 4;

            // Compiler
            const compilerSize = view.getUint32(offset, true);
            offset += 4;
            const compilerWasm = packData.slice(offset, offset + compilerSize);
            offset += compilerSize;

            // Linker
            const linkerSize = view.getUint32(offset, true);
            offset += 4;
            const linkerWasm = packData.slice(offset, offset + linkerSize);
            offset += linkerSize;

            // Package index JSON
            const indexSize = view.getUint32(offset, true);
            offset += 4;
            const indexBytes = new Uint8Array(packData, offset, indexSize);
            const packageNames = JSON.parse(new TextDecoder().decode(indexBytes));
            offset += indexSize;

            // Package data
            const packageCount = view.getUint32(offset, true);
            offset += 4;
            const indexOffset = Number(view.getBigUint64(offset, true));
            offset += 8;
            const packageDataStart = offset;

            // Parse package index
            const packageIndex = new Map();
            let indexPos = indexOffset;
            
            for (let i = 0; i < packageCount; i++) {
                const nameLen = view.getUint16(indexPos, true);
                indexPos += 2;
                const name = new TextDecoder().decode(new Uint8Array(packData, indexPos, nameLen));
                indexPos += nameLen;
                const pkgOffset = Number(view.getBigUint64(indexPos, true));
                indexPos += 8;
                const pkgSize = view.getUint32(indexPos, true);
                indexPos += 4;

                packageIndex.set(name, {
                    offset: packageDataStart + pkgOffset,
                    size: pkgSize
                });
            }

            return {
                packData,
                compilerWasm,
                linkerWasm,
                packageNames,
                packageIndex,
                packageDataStart
            };
        }

        /** @private */
        _loadPackagesIntoVFS() {
            for (const [name, entry] of this.toolchain.packageIndex) {
                const data = new Uint8Array(this.toolchain.packData, entry.offset, entry.size);
                this.vfs.writeFile(`/pkg/js_wasm/${name}.a`, data);
            }
        }

        /** @private */
        _reloadStdLib() {
            if (this.toolchain) {
                this._loadPackagesIntoVFS();
            }
        }

        /** @private */
        _setupGoRuntime() {
            if (typeof Go === 'undefined') {
                throw new Error('Go runtime (wasm_exec.js) not loaded');
            }
            this.goRuntime = new Go();
        }

        /** @private */
        _setupOutputCapture(go) {
            const writeOutput = (text) => {
                if (this.options.onOutput) {
                    this.options.onOutput(text);
                }
            };

            // Patch fs.writeSync for stdout/stderr
            if (!globalThis.fs) globalThis.fs = {};
            
            const originalWriteSync = globalThis.fs.writeSync;
            globalThis.fs.writeSync = (fd, buf) => {
                if (fd === 1 || fd === 2) {
                    const text = new TextDecoder().decode(buf);
                    writeOutput(text);
                    return buf.length;
                }
                return originalWriteSync ? originalWriteSync(fd, buf) : buf.length;
            };
        }

        /** @private */
        async _runCompiler(filePaths) {
            const go = new Go();
            go.argv = ['compile', '-o', '/tmp/build/main.o', '-p', 'main', '-complete', ...filePaths];
            go.env = { GOOS: 'js', GOARCH: 'wasm', GOROOT: '/' };

            this._setupFSPolyfill();

            const instance = await WebAssembly.instantiate(this.compilerWasm, go.importObject);
            await go.run(instance.instance);

            if (!this.vfs.exists('/tmp/build/main.o')) {
                throw new Error('Compiler failed to produce output');
            }
        }

        /** @private */
        async _runLinker() {
            const go = new Go();
            go.argv = ['link', '-o', '/tmp/build/main.wasm', '-L', '/pkg/js_wasm', '/tmp/build/main.o'];
            go.env = { GOOS: 'js', GOARCH: 'wasm', GOROOT: '/' };

            this._setupFSPolyfill();

            const instance = await WebAssembly.instantiate(this.linkerWasm, go.importObject);
            await go.run(instance.instance);

            if (!this.vfs.exists('/tmp/build/main.wasm')) {
                throw new Error('Linker failed to produce output');
            }
        }

        /** @private */
        _setupFSPolyfill() {
            if (!this.fsPolyfill) {
                this.fsPolyfill = new FSPolyfill(this.vfs, (text) => {
                    if (this.options.onOutput) this.options.onOutput(text);
                });
            }
            this.fsPolyfill.patch();
        }

        /** @private */
        _progress(percentage, message) {
            if (this.options.onProgress) {
                this.options.onProgress(percentage, message);
            }
            this._log(`[${percentage}%] ${message}`);
        }

        /** @private */
        _log(message) {
            if (this.options.debug) {
                console.log(`[GoScript] ${message}`);
            }
        }

        /** @private */
        _error(message) {
            console.error(`[GoScript] ${message}`);
            if (this.options.onError) {
                this.options.onError(message);
            }
        }
    }

    // ============================================================
    // Virtual Filesystem
    // ============================================================

    /**
     * Simple virtual filesystem for the Go compiler
     * @class
     * @private
     */
    class VirtualFS {
        constructor() {
            this.files = new Map();
            this.directories = new Set(['/']);
            this.workingDirectory = '/';
        }

        /**
         * Write a file to the virtual filesystem
         * @param {string} path - File path
         * @param {string|Uint8Array} content - File content
         */
        writeFile(path, content) {
            const normalized = this._normalize(path);
            this.files.set(normalized, content);
            this._ensureDir(this._dirname(normalized));
        }

        /**
         * Read a file from the virtual filesystem
         * @param {string} path - File path
         * @returns {string|Uint8Array}
         */
        readFile(path) {
            const normalized = this._normalize(path);
            if (!this.files.has(normalized)) {
                throw new Error(`File not found: ${normalized}`);
            }
            return this.files.get(normalized);
        }

        /**
         * Check if a file exists
         * @param {string} path - File path
         * @returns {boolean}
         */
        exists(path) {
            return this.files.has(this._normalize(path));
        }

        /**
         * Create a directory
         * @param {string} path - Directory path
         */
        mkdir(path) {
            this.directories.add(this._normalize(path));
        }

        /**
         * List directory contents
         * @param {string} path - Directory path
         * @returns {string[]}
         */
        listDir(path = '/') {
            let normalized = this._normalize(path);
            if (!normalized.endsWith('/')) normalized += '/';

            const contents = new Set();

            for (const filePath of this.files.keys()) {
                if (filePath.startsWith(normalized)) {
                    const relative = filePath.substring(normalized.length);
                    const parts = relative.split('/').filter(p => p);
                    if (parts.length > 0) contents.add(parts[0]);
                }
            }

            for (const dirPath of this.directories) {
                if (dirPath.startsWith(normalized) && dirPath !== normalized) {
                    const relative = dirPath.substring(normalized.length);
                    const parts = relative.split('/').filter(p => p);
                    if (parts.length > 0) contents.add(parts[0]);
                }
            }

            return [...contents].sort();
        }

        /**
         * Clear all files
         */
        clear() {
            this.files.clear();
            this.directories.clear();
            this.directories.add('/');
        }

        /**
         * Get filesystem statistics
         * @returns {Object}
         */
        getStats() {
            return {
                fileCount: this.files.size,
                directoryCount: this.directories.size,
                totalSize: [...this.files.values()].reduce((sum, f) => sum + (f.length || f.byteLength || 0), 0)
            };
        }

        /** @private */
        _normalize(path) {
            if (!path.startsWith('/')) path = '/' + path;
            // Resolve . and ..
            const parts = path.split('/').filter(p => p && p !== '.');
            const resolved = [];
            for (const part of parts) {
                if (part === '..') {
                    resolved.pop();
                } else {
                    resolved.push(part);
                }
            }
            return '/' + resolved.join('/');
        }

        /** @private */
        _dirname(path) {
            const parts = path.split('/');
            parts.pop();
            return parts.join('/') || '/';
        }

        /** @private */
        _ensureDir(path) {
            if (path && path !== '/') {
                this.directories.add(path);
                this._ensureDir(this._dirname(path));
            }
        }
    }

    // ============================================================
    // FS Polyfill for Go WASM
    // ============================================================

    /**
     * Bridges Node.js fs API to VirtualFS for Go WASM
     * @class
     * @private
     */
    class FSPolyfill {
        constructor(vfs, outputCallback) {
            this.vfs = vfs;
            this.outputCallback = outputCallback;
            this.fds = new Map();
            this.nextFd = 100;
        }

        patch() {
            const self = this;

            globalThis.fs = {
                constants: { O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_TRUNC: 512, O_APPEND: 1024, O_EXCL: 128, O_DIRECTORY: 65536 },
                
                writeSync(fd, buf) {
                    if (fd === 1 || fd === 2) {
                        const text = new TextDecoder().decode(buf);
                        if (self.outputCallback) {
                            self.outputCallback(text);
                        }
                        return buf.length;
                    }
                    
                    const file = self.fds.get(fd);
                    if (!file) throw new Error("EBADF");
                    
                    const newContent = new Uint8Array(file.content.length + buf.length);
                    newContent.set(file.content);
                    newContent.set(buf, file.content.length);
                    file.content = newContent;
                    self.vfs.writeFile(file.path, file.content);
                    
                    return buf.length;
                },

                write(fd, buf, offset, length, position, callback) {
                    try {
                        if (fd === 1 || fd === 2) {
                            const text = new TextDecoder().decode(buf.subarray(offset, offset + length));
                            if (self.outputCallback) {
                                self.outputCallback(text);
                            }
                            callback(null, length);
                            return;
                        }
                        
                        const file = self.fds.get(fd);
                        if (!file) { callback(new Error("EBADF")); return; }
                        
                        const data = buf.subarray(offset, offset + length);
                        let pos = position !== null ? position : file.position;
                        
                        if (pos + length > file.content.length) {
                            const newContent = new Uint8Array(pos + length);
                            newContent.set(file.content);
                            file.content = newContent;
                        }
                        
                        file.content.set(data, pos);
                        if (position === null) {
                            file.position = pos + length;
                        }
                        
                        self.vfs.writeFile(file.path, file.content);
                        callback(null, length);
                    } catch (e) {
                        callback(e);
                    }
                },

                open(path, flags, mode, callback) {
                    try {
                        if (!path.startsWith('/')) {
                            path = self.vfs.workingDirectory + (self.vfs.workingDirectory.endsWith('/') ? '' : '/') + path;
                        }
                        path = self.vfs._normalize(path);

                        let content = new Uint8Array(0);
                        if (self.vfs.exists(path)) {
                            const vfsContent = self.vfs.readFile(path);
                            if (typeof vfsContent === 'string') {
                                content = new TextEncoder().encode(vfsContent);
                            } else {
                                content = new Uint8Array(vfsContent);
                            }
                        } else {
                            if (!(flags & 64)) { // O_CREAT
                                const err = new Error("ENOENT");
                                err.code = "ENOENT";
                                callback(err);
                                return;
                            }
                        }
                        
                        if (flags & 512) { // O_TRUNC
                            content = new Uint8Array(0);
                        }
                        
                        const fd = self.nextFd++;
                        self.fds.set(fd, {
                            path,
                            flags,
                            content,
                            position: 0
                        });
                        
                        callback(null, fd);
                    } catch (e) {
                        callback(e);
                    }
                },

                read(fd, buffer, offset, length, position, callback) {
                    try {
                        const file = self.fds.get(fd);
                        if (!file) { callback(new Error("EBADF")); return; }
                        
                        let pos = position !== null ? position : file.position;
                        
                        if (pos >= file.content.length) {
                            callback(null, 0);
                            return;
                        }
                        
                        const end = Math.min(pos + length, file.content.length);
                        const bytesRead = end - pos;
                        
                        buffer.set(file.content.subarray(pos, end), offset);
                        
                        if (position === null) {
                            file.position += bytesRead;
                        }
                        
                        callback(null, bytesRead);
                    } catch (e) {
                        callback(e);
                    }
                },

                close(fd, callback) {
                    self.fds.delete(fd);
                    callback(null);
                },

                fstat(fd, callback) {
                    const file = self.fds.get(fd);
                    if (!file) { callback(new Error("EBADF")); return; }
                    callback(null, {
                        isDirectory: () => false,
                        isFile: () => true,
                        size: file.content.length,
                        mode: 0o666,
                        dev: 0, ino: 0, nlink: 1, uid: 0, gid: 0, rdev: 0,
                        blksize: 4096, blocks: 0,
                        atimeMs: Date.now(), mtimeMs: Date.now(), ctimeMs: Date.now()
                    });
                },

                stat(path, callback) {
                    try {
                        if (!path.startsWith('/')) {
                            path = self.vfs.workingDirectory + (self.vfs.workingDirectory.endsWith('/') ? '' : '/') + path;
                        }
                        path = self.vfs._normalize(path);

                        if (self.vfs.exists(path)) {
                            const content = self.vfs.readFile(path);
                            callback(null, {
                                isDirectory: () => false,
                                isFile: () => true,
                                size: content.length || content.byteLength || 0,
                                mode: 0o666,
                                dev: 0, ino: 0, nlink: 1, uid: 0, gid: 0, rdev: 0,
                                blksize: 4096, blocks: 0,
                                atimeMs: Date.now(), mtimeMs: Date.now(), ctimeMs: Date.now()
                            });
                        } else if (self.vfs.directories.has(path) || path === '/') {
                            callback(null, {
                                isDirectory: () => true,
                                isFile: () => false,
                                size: 0,
                                mode: 0o777 | 0o40000,
                                dev: 0, ino: 0, nlink: 1, uid: 0, gid: 0, rdev: 0,
                                blksize: 4096, blocks: 0,
                                atimeMs: Date.now(), mtimeMs: Date.now(), ctimeMs: Date.now()
                            });
                        } else {
                            const err = new Error("ENOENT");
                            err.code = "ENOENT";
                            callback(err);
                        }
                    } catch (e) {
                        callback(e);
                    }
                },

                lstat(path, callback) {
                    this.stat(path, callback);
                },

                mkdir(path, perm, callback) {
                    try {
                        self.vfs.mkdir(path);
                        callback(null);
                    } catch (e) {
                        callback(e);
                    }
                },

                readdir(path, callback) {
                    try {
                        const files = self.vfs.listDir(path);
                        callback(null, files);
                    } catch (e) {
                        callback(e);
                    }
                },
                
                unlink(path, callback) { callback(null); },
                rename(from, to, callback) { callback(null); },
                rmdir(path, callback) { callback(null); },
                fsync(fd, callback) { callback(null); },
                chmod(path, mode, callback) { callback(null); },
                fchmod(fd, mode, callback) { callback(null); },
                chown(path, uid, gid, callback) { callback(null); },
                fchown(fd, uid, gid, callback) { callback(null); },
                utimes(path, atime, mtime, callback) { callback(null); },
                ftruncate(fd, length, callback) { callback(null); },
                link(existingPath, newPath, callback) { callback(null); },
                symlink(target, path, type, callback) { callback(null); },
                readlink(path, callback) { callback(new Error("EINVAL")); }
            };

            if (!globalThis.process) globalThis.process = {};
            globalThis.process.cwd = () => self.vfs.workingDirectory;
            globalThis.process.chdir = (path) => { self.vfs.workingDirectory = path; };
        }
    }

    // ============================================================
    // Export
    // ============================================================

    // UMD export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GoScript;
    } else if (typeof define === 'function' && define.amd) {
        define([], function() { return GoScript; });
    } else {
        global.GoScript = GoScript;
    }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
