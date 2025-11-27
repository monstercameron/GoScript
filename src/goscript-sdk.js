/**
 * GoScript SDK - Simple API for browser-based Go compilation
 * This is the main entry point for using GoScript in web applications
 */

class GoScript {
    constructor(options = {}) {
        this.options = {
            packUrl: options.packUrl || 'assets/goscript.pack',
            debug: options.debug || false,
            onProgress: options.onProgress || (() => {}),
            onOutput: options.onOutput || ((text) => console.log(text)),
            onError: options.onError || ((err) => console.error(err))
        };
        
        this.initialized = false;
        this.toolchainLoader = null;
        this.vfs = null;
        this.compilationManager = null;
        this.appRunner = null;
        this.lastWasmBinary = null;
        this.compileStartTime = 0;
    }

    /**
     * Initialize the GoScript SDK
     * Downloads and prepares the toolchain
     */
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            this.log('[GoScript] Initializing GoScript...');
            this.options.onProgress(0, 'Starting initialization...');

            // Create virtual filesystem
            this.vfs = new VirtualFileSystem();
            this.options.onProgress(10, 'Fetching toolchain pack...');

            // Load toolchain pack
            this.toolchainLoader = new ToolchainLoader();
            await this.toolchainLoader.load(this.options.packUrl);
            this.options.onProgress(50, 'Toolchain loaded...');

            // Create compilation manager
            this.compilationManager = new CompilationManager();
            
            // Create cache manager
            this.cacheManager = new CacheManager();
            await this.cacheManager.init();
            
            // Initialize compilation manager with VFS and cache
            this.compilationManager.init(this.vfs, this.cacheManager);
            
            // Setup filesystem polyfill for Go WASM
            if (window.FSPolyfill) {
                const polyfill = new FSPolyfill(this.vfs);
                polyfill.patch();
            }

            // Load stdlib packages into VFS
            this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
            this.options.onProgress(80, 'Standard library loaded...');

            // Store compiler and linker references
            this.compilationManager.compileWasmBytes = this.toolchainLoader.getCompilerWasm();
            this.compilationManager.linkWasmBytes = this.toolchainLoader.getLinkerWasm();
            this.compilationManager.compilerLoaded = true;

            // Create app runner
            this.appRunner = new AppRunner();
            this.appRunner.init(this.vfs);

            this.options.onProgress(100, 'Ready');
            this.initialized = true;
            this.log('[GoScript] Initialization complete');

        } catch (error) {
            this.log(`[GoScript] Initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Compile Go source code to WebAssembly
     * @param {string} sourceCode - Go source code
     * @returns {Promise<{wasm: ArrayBuffer, compileTime: number}>}
     */
    async compile(sourceCode) {
        if (!this.initialized) {
            throw new Error('GoScript not initialized. Call init() first.');
        }

        this.log('[GoScript] Starting compilation...');
        this.compileStartTime = performance.now();

        try {
            // Prepare source files
            const sourceFiles = {
                'main.go': sourceCode
            };

            // Set up output capture
            const originalAddConsoleOutput = window.addConsoleOutput;
            window.addConsoleOutput = (text) => {
                this.options.onOutput(text);
                if (originalAddConsoleOutput) originalAddConsoleOutput(text);
            };

            // Run compilation
            const wasmBinary = await this.compilationManager.compile(sourceFiles);
            
            // Restore output handler
            window.addConsoleOutput = originalAddConsoleOutput;

            const compileTime = Math.round(performance.now() - this.compileStartTime);
            this.lastWasmBinary = wasmBinary;

            this.log(`[GoScript] Compilation complete in ${compileTime}ms`);

            return {
                wasm: wasmBinary,
                compileTime: compileTime,
                size: wasmBinary.byteLength
            };

        } catch (error) {
            this.log(`[GoScript] Compilation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run the last compiled WebAssembly binary
     * @returns {Promise<void>}
     */
    async run() {
        if (!this.lastWasmBinary) {
            throw new Error('No compiled binary available. Call compile() first.');
        }

        this.log('[GoScript] Running compiled program...');

        try {
            // Set up output capture for Go's stdout/stderr
            this.appRunner.configureOutput((text) => {
                this.options.onOutput(text);
            });

            await this.appRunner.executeConsole(this.lastWasmBinary);

            this.log('[GoScript] Program execution complete');

        } catch (error) {
            this.log(`[GoScript] Execution failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Compile and run Go source code
     * @param {string} sourceCode - Go source code
     * @returns {Promise<{success: boolean, compileResult: {wasm: ArrayBuffer, metadata: {compileTime: number, wasmSize: number}}, error?: string}>}
     */
    async compileAndRun(sourceCode) {
        try {
            const result = await this.compile(sourceCode);
            await this.run();
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

    /**
     * Get the last compiled WebAssembly binary
     * @returns {ArrayBuffer|null}
     */
    getWasmBinary() {
        return this.lastWasmBinary;
    }

    /**
     * Get SDK statistics
     * @returns {Object}
     */
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

    /**
     * Check if SDK is initialized
     * @returns {boolean}
     */
    isReady() {
        return this.initialized;
    }

    /**
     * Internal logging helper
     * @private
     */
    log(message) {
        if (this.options.debug) {
            console.log(message);
        }
    }
}

// Export globally for use in HTML
window.GoScript = GoScript;
