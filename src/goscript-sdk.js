/**
 * GoScript SDK
 * Public browser-facing API for loading the toolchain, compiling Go, and running wasm.
 */

class GoScript {
    constructor(options = {}) {
        const stdout = options.stdout || options.onOutput || ((text) => console.log(text));
        const stderr = options.stderr || options.onError || ((error) => console.error(error));
        const progress = options.progress || options.onProgress || (() => {});

        this.options = {
            packUrl: options.packUrl || 'assets/goscript.pack',
            debug: options.debug || false,
            stdout,
            stderr,
            progress
        };

        this.initialized = false;
        this.toolchainLoader = null;
        this.vfs = null;
        this.compilationManager = null;
        this.cacheManager = null;
        this.appRunner = null;
        this.lastWasmBinary = null;
        this.lastSourceFiles = null;
        this.compileStartTime = 0;
    }

    static async create(options = {}) {
        const gs = new GoScript(options);
        await gs.ready();
        return gs;
    }

    async ready(packUrl = this.options.packUrl) {
        if (packUrl) {
            this.options.packUrl = packUrl;
        }
        await this.init();
        return this;
    }

    async init() {
        if (this.initialized) {
            return;
        }

        try {
            this.log('[GoScript] Initializing GoScript...');
            this.options.progress(0, 'Starting initialization...');

            this.vfs = new VirtualFileSystem();
            this.options.progress(10, 'Fetching toolchain pack...');

            await this.loadToolchain(this.options.packUrl);

            this.options.progress(100, 'Ready');
            this.initialized = true;
            this.log('[GoScript] Initialization complete');
        } catch (error) {
            this.log(`[GoScript] Initialization failed: ${error.message}`);
            this.options.stderr(error);
            throw error;
        }
    }

    async build(sourceCode) {
        await this.ready();
        return this.compile(sourceCode);
    }

    async compile(sourceCode) {
        if (!this.initialized) {
            throw new Error('GoScript not initialized. Call ready() or init() first.');
        }

        this.log('[GoScript] Starting compilation...');
        this.compileStartTime = performance.now();

        try {
            const sourceFiles = this.normalizeSourceFiles(sourceCode);
            this.lastSourceFiles = sourceFiles;

            const originalAddConsoleOutput = GoScriptGlobal.addConsoleOutput;
            GoScriptGlobal.addConsoleOutput = (text) => {
                this.options.stdout(text);
                if (originalAddConsoleOutput) originalAddConsoleOutput(text);
            };

            try {
                const wasmBinary = await this.compilationManager.compile(sourceFiles);
                const compileTime = Math.round(performance.now() - this.compileStartTime);
                this.lastWasmBinary = wasmBinary;

                this.log(`[GoScript] Compilation complete in ${compileTime}ms`);

                return {
                    wasm: wasmBinary,
                    compileTime,
                    size: wasmBinary.byteLength
                };
            } finally {
                GoScriptGlobal.addConsoleOutput = originalAddConsoleOutput;
            }
        } catch (error) {
            this.log(`[GoScript] Compilation failed: ${error.message}`);
            this.options.stderr(error);
            throw error;
        }
    }

    async runCode(sourceCode) {
        const sourceFiles = this.normalizeSourceFiles(sourceCode);
        const result = await this.build(sourceFiles);
        await this.run(result.wasm, sourceFiles);
        return result;
    }

    async runWasm(wasmBinary = this.lastWasmBinary, sourceFiles = this.lastSourceFiles) {
        await this.ready();
        await this.run(wasmBinary, sourceFiles);
    }

    async run(wasmBinary = this.lastWasmBinary, sourceFiles = this.lastSourceFiles) {
        if (!wasmBinary) {
            throw new Error('No compiled binary available. Call build() or compile() first.');
        }

        this.log('[GoScript] Running compiled program...');

        try {
            this.appRunner.configureOutput((text) => {
                this.options.stdout(text);
            });

            const sourceCode = typeof sourceFiles === 'string'
                ? sourceFiles
                : sourceFiles?.['main.go'] || null;

            await this.appRunner.executeConsole(wasmBinary, sourceCode);
            this.log('[GoScript] Program execution complete');
        } catch (error) {
            this.log(`[GoScript] Execution failed: ${error.message}`);
            this.options.stderr(error);
            throw error;
        }
    }

    async compileAndRun(sourceCode) {
        try {
            const result = await this.runCode(sourceCode);
            return {
                success: true,
                compileResult: {
                    wasm: result.wasm,
                    metadata: {
                        compileTime: result.compileTime,
                        wasmSize: result.size
                    }
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async clearCompiledCache(sourceCode = this.lastSourceFiles) {
        await this.ready();
        const sourceFiles = this.normalizeSourceFiles(sourceCode);
        const sourceHash = this.cacheManager.generateSourceHash(sourceFiles);
        return this.cacheManager.clearCompiledWasmEntry(sourceHash);
    }

    getWasmBinary() {
        return this.lastWasmBinary;
    }

    getStats() {
        if (!this.toolchainLoader) {
            return { initialized: false };
        }

        const stats = this.toolchainLoader.getStats();
        return {
            initialized: this.initialized,
            packSize: stats.packSize,
            compilerSize: stats.compilerSize,
            linkerSize: stats.linkerSize,
            packageCount: stats.packageCount,
            totalPackageSize: stats.totalPackageSize
        };
    }

    isReady() {
        return this.initialized;
    }

    getState() {
        return {
            initialized: this.initialized,
            compilerReady: !!this.compilationManager?.compilerLoaded,
            compiling: this.compilationManager?.getStatus() === 'compiling',
            hasBinary: !!this.lastWasmBinary
        };
    }

    hasPackage(name) {
        return !!this.toolchainLoader?.hasPackage(name);
    }

    getPackages() {
        return this.toolchainLoader?.getPackageNames() || [];
    }

    reset() {
        this.lastWasmBinary = null;
        this.lastSourceFiles = null;
        this.vfs = new VirtualFileSystem();

        if (GoScriptGlobal.FSPolyfill) {
            const polyfill = new FSPolyfill(this.vfs);
            polyfill.patch();
        }

        if (this.toolchainLoader) {
            this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
        }

        if (this.compilationManager && this.cacheManager) {
            this.compilationManager.init(this.vfs, this.cacheManager);
            this.compilationManager.toolchainUrl = this.options.packUrl;
            this.compilationManager.compileWasmBytes = this.toolchainLoader?.getCompilerWasm() || null;
            this.compilationManager.linkWasmBytes = this.toolchainLoader?.getLinkerWasm() || null;
            this.compilationManager.compilerLoaded = !!(this.compilationManager.compileWasmBytes && this.compilationManager.linkWasmBytes);
        }
    }

    async loadToolchain(packUrl = this.options.packUrl) {
        this.options.packUrl = packUrl;

        if (!this.vfs) {
            this.vfs = new VirtualFileSystem();
        }

        if (!this.toolchainLoader) {
            this.toolchainLoader = new ToolchainLoader();
        }
        await this.toolchainLoader.load(packUrl);
        this.options.progress(50, 'Toolchain loaded...');

        if (!this.cacheManager) {
            this.cacheManager = new CacheManager();
            await this.cacheManager.init();
        }

        if (!this.compilationManager) {
            this.compilationManager = new CompilationManager();
        }
        this.compilationManager.init(this.vfs, this.cacheManager);
        this.compilationManager.toolchainUrl = packUrl;

        if (GoScriptGlobal.FSPolyfill) {
            const polyfill = new FSPolyfill(this.vfs);
            polyfill.patch();
        }

        this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
        this.options.progress(80, 'Standard library loaded...');

        this.compilationManager.compileWasmBytes = this.toolchainLoader.getCompilerWasm();
        this.compilationManager.linkWasmBytes = this.toolchainLoader.getLinkerWasm();
        this.compilationManager.compilerLoaded = true;

        if (!this.appRunner) {
            this.appRunner = new AppRunner();
            await this.appRunner.init();
        }
    }

    log(message) {
        if (this.options.debug) {
            console.log(message);
        }
    }

    normalizeSourceFiles(sourceCode) {
        const sourceFiles = typeof sourceCode === 'string'
            ? { 'main.go': sourceCode }
            : sourceCode;

        if (!sourceFiles || typeof sourceFiles !== 'object') {
            throw new Error('Expected a Go source string or a filename-to-source map');
        }

        return sourceFiles;
    }
}

const createGoScript = GoScript.create.bind(GoScript);

GoScriptGlobal.GoScript = GoScript;
GoScriptGlobal.createGoScript = createGoScript;
