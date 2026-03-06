/**
 * GoScript SDK
 * Public browser-facing API for loading the toolchain, compiling Go, and running wasm.
 */

var GoScriptSdkResult = GoScriptGlobal.GoScriptResult;
var GoScriptSdkConstants = GoScriptGlobal.GoScriptConstants;

/**
 * Public GoScript entry point.
 */
class GoScript {
    /**
     * @param {Object} [options]
     * @param {string} [options.packUrl]
     * @param {boolean} [options.debug]
     * @param {(text: string) => void} [options.stdout]
     * @param {(error: Error) => void} [options.stderr]
     * @param {(percent: number, message: string) => void} [options.progress]
     * @param {(text: string) => void} [options.onOutput]
     * @param {(error: Error) => void} [options.onError]
     * @param {(percent: number, message: string) => void} [options.onProgress]
     */
    constructor(options = {}) {
        const stdoutHandler = options.stdout || options.onOutput || ((outputText) => console.log(outputText));
        const stderrHandler = options.stderr || options.onError || ((reportedError) => console.error(reportedError));
        const progressHandler = options.progress || options.onProgress || (() => {});

        this.options = {
            packUrl: options.packUrl || GoScriptSdkConstants.toolchain.defaultPackUrl,
            debug: options.debug || false,
            stdout: stdoutHandler,
            stderr: stderrHandler,
            progress: progressHandler
        };

        this.initialized = false;
        this.toolchainLoader = null;
        this.vfs = null;
        this.compilationManager = null;
        this.cacheManager = null;
        this.appRunner = null;
        this.lastWasmBinary = null;
        this.lastSourceFiles = null;
        this.compileStartedAtMs = 0;
    }

    /**
     * Create and initialize a GoScript instance in one call.
     * @param {Object} [options]
     * @returns {Promise<GoScript>}
     */
    static async create(options = {}) {
        const goScriptSdk = new GoScript(options);
        await goScriptSdk.ready();
        return goScriptSdk;
    }

    /**
     * Ensure the SDK is initialized and ready to compile.
     * @param {string} [packUrl=this.options.packUrl]
     * @returns {Promise<GoScript>}
     */
    async ready(packUrl = this.options.packUrl) {
        if (packUrl) {
            this.options.packUrl = packUrl;
        }

        const [, initError] = await GoScriptSdkResult.captureAsyncResult(
            () => this.init(),
            'Failed to initialize GoScript'
        );
        if (initError) {
            throw initError;
        }

        return this;
    }

    /**
     * Initialize the runtime, toolchain, and compiler state.
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) {
            return;
        }

        this.log('[GoScript] Initializing GoScript...');
        this.options.progress(0, 'Starting initialization...');
        this.vfs = new VirtualFileSystem();
        this.options.progress(10, 'Fetching toolchain pack...');

        const [, loadToolchainError] = await GoScriptSdkResult.captureAsyncResult(
            () => this.loadToolchain(this.options.packUrl),
            'Failed to load the GoScript toolchain'
        );
        if (loadToolchainError) {
            this.log(`[GoScript] Initialization failed: ${loadToolchainError.message}`);
            this.reportError(loadToolchainError);
            throw loadToolchainError;
        }

        this.options.progress(100, 'Ready');
        this.initialized = true;
        this.log('[GoScript] Initialization complete');
    }

    /**
     * Compile source input and return the build result.
     * @param {string|Object<string,string>} sourceInput
     * @returns {Promise<{wasm: ArrayBuffer, compileTime: number, size: number}>}
     */
    async build(sourceInput) {
        await this.ready();
        return this.compile(sourceInput);
    }

    /**
     * Compile Go source into a WASM binary.
     * @param {string|Object<string,string>} sourceInput
     * @returns {Promise<{wasm: ArrayBuffer, compileTime: number, size: number}>}
     */
    async compile(sourceInput) {
        if (!this.initialized) {
            throw new Error('GoScript not initialized. Call ready() or init() first.');
        }

        this.log('[GoScript] Starting compilation...');
        this.compileStartedAtMs = performance.now();

        const sourceFileMap = this.normalizeSourceFiles(sourceInput);
        this.lastSourceFiles = sourceFileMap;
        const previousConsoleOutput = GoScriptGlobal.addConsoleOutput;
        const mirrorConsoleOutput = (outputText) => {
            this.options.stdout(outputText);
            if (previousConsoleOutput) {
                previousConsoleOutput(outputText);
            }
        };

        const [wasmBinary, compileError] = await GoScriptSdkResult.withTemporaryGlobal(
            'addConsoleOutput',
            mirrorConsoleOutput,
            () => this.compilationManager.compile(sourceFileMap),
            'Failed to compile Go source'
        );
        if (compileError) {
            this.log(`[GoScript] Compilation failed: ${compileError.message}`);
            this.reportError(compileError);
            throw compileError;
        }

        const compileDurationMs = Math.round(performance.now() - this.compileStartedAtMs);
        this.lastWasmBinary = wasmBinary;
        this.log(`[GoScript] Compilation complete in ${compileDurationMs}ms`);

        return {
            wasm: wasmBinary,
            compileTime: compileDurationMs,
            size: wasmBinary.byteLength
        };
    }

    /**
     * Compile and immediately run a source program.
     * @param {string|Object<string,string>} sourceInput
     * @returns {Promise<{wasm: ArrayBuffer, compileTime: number, size: number}>}
     */
    async runCode(sourceInput) {
        const sourceFileMap = this.normalizeSourceFiles(sourceInput);
        const buildResult = await this.build(sourceFileMap);
        await this.run(buildResult.wasm, sourceFileMap);
        return buildResult;
    }

    /**
     * Run an already-compiled WASM binary.
     * @param {ArrayBuffer} [wasmBinary=this.lastWasmBinary]
     * @param {string|Object<string,string>|null} [sourceFiles=this.lastSourceFiles]
     * @returns {Promise<void>}
     */
    async runWasm(wasmBinary = this.lastWasmBinary, sourceFiles = this.lastSourceFiles) {
        await this.ready();
        await this.run(wasmBinary, sourceFiles);
    }

    /**
     * Execute a compiled program through the app runner.
     * @param {ArrayBuffer} [wasmBinary=this.lastWasmBinary]
     * @param {string|Object<string,string>|null} [sourceFiles=this.lastSourceFiles]
     * @returns {Promise<void>}
     */
    async run(wasmBinary = this.lastWasmBinary, sourceFiles = this.lastSourceFiles) {
        if (!wasmBinary) {
            throw new Error('No compiled binary available. Call build() or compile() first.');
        }

        this.log('[GoScript] Running compiled program...');
        this.appRunner.configureOutput((outputText) => {
            this.options.stdout(outputText);
        });

        const mainSourceCode = typeof sourceFiles === 'string'
            ? sourceFiles
            : sourceFiles?.[GoScriptSdkConstants.vfs.entrySourceFileName] || null;

        const [, runtimeError] = await GoScriptSdkResult.captureAsyncResult(
            () => this.appRunner.executeConsole(wasmBinary, mainSourceCode),
            'Failed to execute the compiled WASM program'
        );
        if (runtimeError) {
            this.log(`[GoScript] Execution failed: ${runtimeError.message}`);
            this.reportError(runtimeError);
            throw runtimeError;
        }

        this.log('[GoScript] Program execution complete');
    }

    /**
     * Compatibility wrapper that returns a success object instead of throwing.
     * @param {string|Object<string,string>} sourceInput
     * @returns {Promise<{success: boolean, compileResult?: {wasm: ArrayBuffer, metadata: {compileTime: number, wasmSize: number}}, error?: string}>}
     */
    async compileAndRun(sourceInput) {
        const [runResult, runError] = await GoScriptSdkResult.captureAsyncResult(
            () => this.runCode(sourceInput),
            'Failed to compile and run the Go program'
        );
        if (runError) {
            return {
                success: false,
                error: runError.message
            };
        }

        return {
            success: true,
            compileResult: {
                wasm: runResult.wasm,
                metadata: {
                    compileTime: runResult.compileTime,
                    wasmSize: runResult.size
                }
            }
        };
    }

    /**
     * Clear the compiled WASM cache for a specific source input.
     * @param {string|Object<string,string>} [sourceInput=this.lastSourceFiles]
     * @returns {Promise<boolean>}
     */
    async clearCompiledCache(sourceInput = this.lastSourceFiles) {
        await this.ready();
        const sourceFileMap = this.normalizeSourceFiles(sourceInput);
        const sourceHash = this.cacheManager.generateSourceHash(sourceFileMap);
        return this.cacheManager.clearCompiledWasmEntry(sourceHash);
    }

    /**
     * Return the last compiled WASM binary.
     * @returns {ArrayBuffer|null}
     */
    getWasmBinary() {
        return this.lastWasmBinary;
    }

    /**
     * Return current toolchain statistics.
     * @returns {Object}
     */
    getStats() {
        if (!this.toolchainLoader) {
            return { initialized: false };
        }

        const toolchainStats = this.toolchainLoader.getStats();
        return {
            initialized: this.initialized,
            packSize: toolchainStats.packSize,
            compilerSize: toolchainStats.compilerSize,
            linkerSize: toolchainStats.linkerSize,
            packageCount: toolchainStats.packageCount,
            totalPackageSize: toolchainStats.totalPackageSize
        };
    }

    /**
     * @returns {boolean}
     */
    isReady() {
        return this.initialized;
    }

    /**
     * Return high-level runtime state for diagnostics.
     * @returns {Object}
     */
    getState() {
        return {
            initialized: this.initialized,
            compilerReady: !!this.compilationManager?.compilerLoaded,
            compiling: this.compilationManager?.getStatus() === 'compiling',
            hasBinary: !!this.lastWasmBinary
        };
    }

    /**
     * @param {string} packageName
     * @returns {boolean}
     */
    hasPackage(packageName) {
        return !!this.toolchainLoader?.hasPackage(packageName);
    }

    /**
     * @returns {string[]}
     */
    getPackages() {
        return this.toolchainLoader?.getPackageNames() || [];
    }

    /**
     * Reset transient build state while keeping the loaded toolchain.
     */
    reset() {
        this.lastWasmBinary = null;
        this.lastSourceFiles = null;
        this.vfs = new VirtualFileSystem();

        if (GoScriptGlobal.FSPolyfill) {
            const filesystemPolyfill = new FSPolyfill(this.vfs);
            filesystemPolyfill.patch();
        }

        if (this.toolchainLoader) {
            this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
        }

        if (!this.compilationManager || !this.cacheManager) {
            return;
        }

        this.compilationManager.init(this.vfs, this.cacheManager);
        this.compilationManager.toolchainUrl = this.options.packUrl;
        this.compilationManager.compileWasmBytes = this.toolchainLoader?.getCompilerWasm() || null;
        this.compilationManager.linkWasmBytes = this.toolchainLoader?.getLinkerWasm() || null;
        this.compilationManager.compilerLoaded = !!(
            this.compilationManager.compileWasmBytes &&
            this.compilationManager.linkWasmBytes
        );
    }

    /**
     * Load the compiler toolchain and initialize execution services.
     * @param {string} [packUrl=this.options.packUrl]
     * @returns {Promise<void>}
     */
    async loadToolchain(packUrl = this.options.packUrl) {
        this.options.packUrl = packUrl;

        if (!this.vfs) {
            this.vfs = new VirtualFileSystem();
        }

        if (!this.toolchainLoader) {
            this.toolchainLoader = new ToolchainLoader();
        }
        const [, toolchainLoadError] = await GoScriptSdkResult.captureAsyncResult(
            () => this.toolchainLoader.load(packUrl),
            'Failed to load the toolchain pack'
        );
        if (toolchainLoadError) {
            throw toolchainLoadError;
        }
        this.options.progress(50, 'Toolchain loaded...');

        if (!this.cacheManager) {
            this.cacheManager = new CacheManager();
            const [, cacheInitError] = await GoScriptSdkResult.captureAsyncResult(
                () => this.cacheManager.init(),
                'Failed to initialize the compile cache'
            );
            if (cacheInitError) {
                throw cacheInitError;
            }
        }

        if (!this.compilationManager) {
            this.compilationManager = new CompilationManager();
        }
        this.compilationManager.init(this.vfs, this.cacheManager);
        this.compilationManager.toolchainUrl = packUrl;

        if (GoScriptGlobal.FSPolyfill) {
            const filesystemPolyfill = new FSPolyfill(this.vfs);
            filesystemPolyfill.patch();
        }

        this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
        this.options.progress(80, 'Standard library loaded...');

        this.compilationManager.compileWasmBytes = this.toolchainLoader.getCompilerWasm();
        this.compilationManager.linkWasmBytes = this.toolchainLoader.getLinkerWasm();
        this.compilationManager.compilerLoaded = true;

        if (!this.appRunner) {
            this.appRunner = new AppRunner();
            const [, appRunnerInitError] = await GoScriptSdkResult.captureAsyncResult(
                () => this.appRunner.init(),
                'Failed to initialize the WASM runtime'
            );
            if (appRunnerInitError) {
                throw appRunnerInitError;
            }
        }
    }

    /**
     * Debug logger gated by the `debug` option.
     * @param {string} messageText
     */
    log(messageText) {
        if (this.options.debug) {
            console.log(messageText);
        }
    }

    /**
     * Normalize source input into the internal filename -> contents map.
     * @param {string|Object<string,string>} sourceInput
     * @returns {Object<string,string>}
     */
    normalizeSourceFiles(sourceInput) {
        const sourceFileMap = typeof sourceInput === 'string'
            ? { [GoScriptSdkConstants.vfs.entrySourceFileName]: sourceInput }
            : sourceInput;

        if (!sourceFileMap || typeof sourceFileMap !== 'object') {
            throw new Error('Expected a Go source string or a filename-to-source map');
        }

        return sourceFileMap;
    }

    /**
     * Report a user-facing error without allowing error sinks to hide the root cause.
     * @param {Error} runtimeError
     */
    reportError(runtimeError) {
        GoScriptSdkResult.captureSyncResult(() => this.options.stderr(runtimeError), 'stderr handler failed');
    }
}

const createGoScript = GoScript.create.bind(GoScript);

GoScriptGlobal.GoScript = GoScript;
GoScriptGlobal.createGoScript = createGoScript;

