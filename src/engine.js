/**
 * GoScript execution layer
 * Compilation pipeline and WASM runtime execution.
 */

/**
 * Personal Website 2025 - Compilation Manager
 * Orchestrates Go to WASM compilation pipeline
 */

class CompilationManager {
    constructor() {
        this.vfs = null;
        this.cacheManager = null;
        this.compilerLoaded = false;
        this.allowMockFallback = false;
        this.toolchainUrl = 'assets/goscript.pack';
        this.status = 'idle';
        this.callbacks = {
            onProgress: null,
            onStageUpdate: null,
            onError: null,
            onComplete: null
        };
    }

    /**
     * Initialize the compilation manager
     * @param {VirtualFileSystem} vfs - Virtual filesystem instance
     * @param {CacheManager} cacheManager - Cache manager instance
     */
    init(vfs, cacheManager) {
        this.vfs = vfs;
        this.cacheManager = cacheManager;
        console.log('⚡ CompilationManager: Initialized with VFS and CacheManager');
    }

    /**
     * Set event callbacks
     * @param {Object} callbacks - Event callback functions
     */
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * Start the compilation process
     * @param {Object} sourceFiles - Source files to compile (key: filename, value: content)
     * @returns {Promise<ArrayBuffer>} Compiled WASM binary
     */
    async compile(sourceFiles) {
        try {
            this.status = 'compiling';
            this.emitProgress(0, 'COMPILATION_START');
            
            // Store the specific files to compile (not all files in VFS)
            this.filesToCompile = sourceFiles;
            
            // Stage 1: Load Go compiler
            this.emitStageUpdate(1, 'active');
            if (!this.compilerLoaded || !this.compileWasmBytes || !this.linkWasmBytes) {
                await this.loadCompiler();
            }
            this.emitStageUpdate(1, 'complete');
            this.emitProgress(15, 'COMPILER_READY');
            
            // Stage 2: Check cache
            this.emitStageUpdate(2, 'active');
            const sourceHash = this.cacheManager.generateSourceHash(sourceFiles);
            const cachedWasm = await this.cacheManager.getCachedWasm(sourceHash);
            
            if (cachedWasm) {
                console.log('🎯 CompilationManager: Using cached WASM binary');
                this.emitStageUpdate(2, 'complete');
                this.emitProgress(100, 'CACHED_BINARY_LOADED');
                this.status = 'complete';
                this.emitComplete(cachedWasm.wasmBinary, cachedWasm.metadata);
                return cachedWasm.wasmBinary;
            }
            
            this.emitStageUpdate(2, 'complete');
            this.emitProgress(25, 'CACHE_CHECKED');
            
            // Stage 3: Fetch source files (already done, just update VFS)
            this.emitStageUpdate(3, 'active');
            this.vfs.loadGoSources(sourceFiles);
            this.emitStageUpdate(3, 'complete');
            this.emitProgress(40, 'SOURCES_LOADED');
            
            // Stage 4: Create virtual filesystem structure
            this.emitStageUpdate(4, 'active');
            await this.setupBuildEnvironment();
            this.emitStageUpdate(4, 'complete');
            this.emitProgress(55, 'VFS_READY');
            
            // Stage 5: Compile Go to WASM
            this.emitStageUpdate(5, 'active');
            const wasmBinary = await this.compileToWasm();
            this.emitStageUpdate(5, 'complete');
            this.emitProgress(80, 'WASM_COMPILED');
            
            // Stage 6: Cache compiled binary
            this.emitStageUpdate(6, 'active');
            const metadata = this.generateMetadata();
            await this.cacheManager.cacheCompiledWasm(sourceHash, wasmBinary, metadata);
            this.emitStageUpdate(6, 'complete');
            this.emitProgress(95, 'BINARY_CACHED');
            
            // Stage 7: Prepare for execution
            this.emitStageUpdate(7, 'active');
            await this.prepareBinary(wasmBinary);
            this.emitStageUpdate(7, 'complete');
            this.emitProgress(100, 'READY_FOR_EXECUTION');
            
            this.status = 'complete';
            this.emitComplete(wasmBinary, metadata);
            
            return wasmBinary;
            
        } catch (error) {
            this.status = 'error';
            this.emitError(error.message);
            throw error;
        }
    }

    /**
     * Load the Go compiler (real WASM implementation)
     * @private
     */
    async loadCompiler() {
        console.log('🔧 CompilationManager: Loading GoScript toolchain...');
        
        try {
            // Try to use packed toolchain first (single file with everything)
            if (GoScriptGlobal.ToolchainLoader) {
                console.log('📦 Using packed goscript.pack (compiler + linker + stdlib in 1 file)');
                this.toolchainLoader = new GoScriptGlobal.ToolchainLoader();
                await this.toolchainLoader.load(this.toolchainUrl);
                
                // Extract compiler and linker
                this.compileWasmBytes = this.toolchainLoader.getCompilerWasm();
                this.linkWasmBytes = this.toolchainLoader.getLinkerWasm();
                
                // Set up filesystem interface for the compiler
                this.setupCompilerFilesystem();
                
                // Load stdlib packages into VFS
                this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
                
                const stats = this.toolchainLoader.getStats();
                console.log(`✅ CompilationManager: Toolchain ready (${(stats.packSize / 1024 / 1024).toFixed(1)} MB total)`);
                
                this.compilerLoaded = true;
                return;
            }
            
            // Fallback: Load compiler and linker separately
            console.log('⚠️ ToolchainLoader not available, loading files separately...');
            await this.loadCompilerSeparately();
            
        } catch (error) {
            console.error('❌ CompilationManager: Failed to load packed toolchain:', error);
            // Fall back to separate loading
            await this.loadCompilerSeparately();
        }
    }

    /**
     * Load compiler and linker separately (fallback)
     * @private
     */
    async loadCompilerSeparately() {
        try {
            // Load the Go compiler WASM binary
            const compileResp = await fetch('assets/bin/compile.wasm');
            if (!compileResp.ok) throw new Error(`Failed to fetch compile.wasm: ${compileResp.status}`);
            this.compileWasmBytes = await compileResp.arrayBuffer();
            
            // Load the Go linker WASM binary
            const linkResp = await fetch('assets/bin/link.wasm');
            if (!linkResp.ok) throw new Error(`Failed to fetch link.wasm: ${linkResp.status}`);
            this.linkWasmBytes = await linkResp.arrayBuffer();
            
            console.log(`📦 CompilationManager: Loaded compiler (${(this.compileWasmBytes.byteLength / 1024 / 1024).toFixed(2)} MB) and linker (${(this.linkWasmBytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            
            // Set up filesystem interface for the compiler
            this.setupCompilerFilesystem();
            
            // Load standard library
            await this.loadStdLib();

            this.compilerLoaded = true;
            console.log('✅ CompilationManager: Go compiler WASM loaded and ready');
            
        } catch (error) {
            console.error('❌ CompilationManager: Failed to load Go compiler:', error);
            throw error;
        }
    }

    /**
     * Load standard library from packed archive (fallback when not using toolchain pack)
     * @private
     */
    async loadStdLib() {
        console.log('📚 CompilationManager: Loading Go standard library...');
        
        try {
            // Try to use packed stdlib first
            if (GoScriptGlobal.StdLibLoader) {
                console.log('📦 Using packed stdlib.pack (340 packages in 1 file)');
                this.stdlibLoader = new GoScriptGlobal.StdLibLoader();
                await this.stdlibLoader.load('static/pkg/stdlib.pack');
                this.stdlibLoader.loadAllIntoVFS(this.vfs);
                
                const stats = this.stdlibLoader.getStats();
                console.log(`✅ CompilationManager: Standard library ready (${stats.packageCount} packages, ${(stats.packSize / 1024 / 1024).toFixed(1)} MB)`);
                return;
            }
            
            // Fallback to individual package loading
            console.log('⚠️ Packed stdlib not available, loading 340 packages individually (slower)...');
            await this.loadStdLibIndividual();
            
        } catch (error) {
            console.error('❌ CompilationManager: Failed to load packed stdlib:', error);
            // Fall back to individual loading
            await this.loadStdLibIndividual();
        }
    }

    /**
     * Load standard library packages individually (fallback)
     * @private
     */
    async loadStdLibIndividual() {
        console.log('📚 CompilationManager: Loading standard library individually...');
        
        try {
            const indexResp = await fetch('static/pkg/index.json');
            if (!indexResp.ok) throw new Error("Failed to load package index");
            const packages = await indexResp.json();
            
            console.log(`📚 CompilationManager: Found ${packages.length} packages in index`);

            const loadPackage = async (pkg) => {
                try {
                    const resp = await fetch(`static/pkg/js_wasm/${pkg}.a`);
                    if (!resp.ok) return; // Skip if not found
                    const data = await resp.arrayBuffer();
                    this.vfs.writeFile(`/pkg/js_wasm/${pkg}.a`, new Uint8Array(data));
                } catch (e) {
                    console.warn(`Failed to load package ${pkg}:`, e);
                }
            };

            // Load in parallel (batches of 10 to avoid network congestion)
            const batchSize = 10;
            for (let i = 0; i < packages.length; i += batchSize) {
                const batch = packages.slice(i, i + batchSize);
                await Promise.all(batch.map(loadPackage));
            }
            
            console.log('✅ CompilationManager: Standard library loaded');
        } catch (error) {
            console.error('❌ CompilationManager: Failed to load standard library:', error);
            // Fallback to minimal set if index fails
            await this.loadMinimalStdLib();
        }
    }

    async loadMinimalStdLib() {
        const packages = [
            'runtime', 'internal/bytealg', 'internal/cpu', 'internal/abi', 'internal/goarch', 'internal/goos', 
            'sync', 'io', 'os', 'fmt', 'errors', 'syscall/js'
        ];
        // ... (rest of minimal loading logic if needed, but hopefully index works)
    }

    /**
     * Setup build environment in VFS
     * @private
     */
    async setupBuildEnvironment() {
        console.log('🏗️ CompilationManager: Setting up build environment...');
        
        // Create build directories
        this.vfs.mkdir('/tmp');
        this.vfs.mkdir('/build');
        this.vfs.mkdir('/output');
        
        // Generate build configuration
        const buildConfig = this.generateBuildConfig();
        this.vfs.writeFile('/build/config.json', JSON.stringify(buildConfig, null, 2));
        
        console.log('✅ CompilationManager: Build environment ready');
    }

    /**
     * Compile Go source to WASM (real Go compiler implementation)
     * @private
     */
    async compileToWasm() {
        console.log('🔥 CompilationManager: Compiling Go to WASM using real Go compiler...');
        
        const moduleInfo = this.vfs.getModuleInfo();
        const goFiles = this.vfs.getGoFiles();
        
        console.log(`📦 CompilationManager: Module: ${moduleInfo.name}`);
        console.log(`📝 CompilationManager: Compiling ${goFiles.length} Go files`);
        
        if (this.compileWasmBytes && this.linkWasmBytes) {
            try {
                // Use the real Go compiler WASM
                const wasmBinary = await this.runGoCompiler();
                console.log(`✅ CompilationManager: Real WASM compiled (${wasmBinary.byteLength} bytes)`);
                return wasmBinary;
                
            } catch (error) {
                console.warn(`⚠️ CompilationManager: Real compiler failed: ${error.message}`);
                console.error(error);
                if (!this.allowMockFallback) {
                    throw error;
                }
            }
        }
        
        if (!this.allowMockFallback) {
            throw new Error('Go compiler is not available');
        }

        // Fallback: Simulate compilation time and generate mock WASM
        const compilationTime = Math.max(1000, goFiles.length * 200);
        await this.delay(compilationTime);
        
        const mockWasm = this.generateMockWasm();
        console.log(`✅ CompilationManager: Mock WASM compiled (${mockWasm.byteLength} bytes)`);
        return mockWasm;
    }

    /**
     * Prepare binary for execution
     * @private
     */
    async prepareBinary(wasmBinary) {
        console.log('🎯 CompilationManager: Preparing binary for execution...');
        
        // Validate WASM binary
        if (!this.validateWasmBinary(wasmBinary)) {
            throw new Error('Invalid WASM binary generated');
        }
        
        // Store in VFS for access
        this.vfs.writeFile('/output/main.wasm', wasmBinary);
        
        console.log('✅ CompilationManager: Binary prepared for execution');
    }

    /**
     * Generate build configuration
     * @private
     */
    generateBuildConfig() {
        const moduleInfo = this.vfs.getModuleInfo();
        
        return {
            module: moduleInfo.name,
            goVersion: moduleInfo.goVersion,
            target: 'wasm',
            os: 'js',
            arch: 'wasm',
            buildTime: new Date().toISOString(),
            optimization: 'size',
            debug: false
        };
    }

    /**
     * Generate compilation metadata
     * @private
     */
    generateMetadata() {
        const stats = this.vfs.getStats();
        
        return {
            compilationTime: Date.now(),
            sourceFiles: stats.goFiles,
            totalSize: stats.totalSize,
            optimizations: ['deadcode', 'size'],
            target: 'js/wasm',
            version: '1.0.0'
        };
    }

    /**
     * Generate mock WASM binary (placeholder)
     * @private
     */
    generateMockWasm() {
        // Create a simple mock WASM binary
        const wasmHeader = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, // WASM magic number
            0x01, 0x00, 0x00, 0x00  // Version 1
        ]);
        
        // Add some mock content to simulate a real binary
        const mockContent = new Uint8Array(2048);
        for (let i = 0; i < mockContent.length; i++) {
            mockContent[i] = Math.floor(Math.random() * 256);
        }
        
        const result = new Uint8Array(wasmHeader.length + mockContent.length);
        result.set(wasmHeader, 0);
        result.set(mockContent, wasmHeader.length);
        
        return result.buffer;
    }

    /**
     * Validate WASM binary format
     * @private
     */
    validateWasmBinary(wasmBinary) {
        if (wasmBinary.byteLength < 8) return false;
        
        const view = new Uint8Array(wasmBinary);
        
        // Check WASM magic number: 0x00 0x61 0x73 0x6d
        return (
            view[0] === 0x00 &&
            view[1] === 0x61 &&
            view[2] === 0x73 &&
            view[3] === 0x6d
        );
    }

    /**
     * Setup filesystem interface for the Go compiler
     * @private
     */
    setupCompilerFilesystem() {
        console.log('🗂️ CompilationManager: Setting up compiler filesystem interface...');
        
        if (GoScriptGlobal.FSPolyfill) {
            const polyfill = new GoScriptGlobal.FSPolyfill(this.vfs);
            polyfill.patch();
            console.log('✅ CompilationManager: Filesystem interface patched');
        } else {
            console.warn('⚠️ CompilationManager: FSPolyfill not found');
        }
    }

    /**
     * Run the real Go compiler on the source files
     * @private
     */
    async runGoCompiler() {
        console.log('⚙️ CompilationManager: Invoking real Go compiler...');

        if (typeof Go === 'undefined') {
            throw new Error('wasm_exec.js is not loaded');
        }
        
        // Only compile the specific files passed to compile(), not all files in VFS
        const filesToCompile = Object.keys(this.filesToCompile || {});
        if (filesToCompile.length === 0) {
            throw new Error("No Go files specified for compilation");
        }
        
        // Write the source files to temporary location for compilation
        const tempFiles = [];
        for (const [filename, content] of Object.entries(this.filesToCompile)) {
            const tempPath = `/tmp/${filename}`;
            this.vfs.writeFile(tempPath, content);
            tempFiles.push(tempPath);
        }
        
        console.log(`📝 CompilationManager: Compiling ${tempFiles.length} file(s): ${tempFiles.join(', ')}`);
        
        // Debug: Check what's in VFS
        console.log('📦 VFS Stats:', this.vfs.getStats());
        console.log('📦 pkg/js_wasm contents:', this.vfs.listDir('/pkg/js_wasm').slice(0, 10));
        
        // Capture compiler output
        let compilerOutput = [];
        const originalAddConsoleOutput = GoScriptGlobal.addConsoleOutput;
        GoScriptGlobal.addConsoleOutput = (text) => {
            compilerOutput.push(text);
            console.log('[COMPILER]', text);
            if (originalAddConsoleOutput) originalAddConsoleOutput(text);
        };
        
        try {
            // 1. Compile (cmd/compile)
            // go tool compile -o main.o -p main main.go ...
            console.log('⚙️ CompilationManager: Running compile...');
            console.log('⚙️ Args:', ['compile', '-o', '/tmp/main.o', '-p', 'main', '-I', '/pkg/js_wasm', ...tempFiles]);
            const goCompile = new Go();
            goCompile.exitCode = 0;
            const originalCompileExit = goCompile.exit.bind(goCompile);
            goCompile.exit = (code) => {
                goCompile.exitCode = code;
                originalCompileExit(code);
            };
            goCompile.argv = ['compile', '-o', '/tmp/main.o', '-p', 'main', '-I', '/pkg/js_wasm', ...tempFiles];
            goCompile.env = { 'GOOS': 'js', 'GOARCH': 'wasm', 'GOROOT': '/' };
            
            const compileInstance = await WebAssembly.instantiate(this.compileWasmBytes, goCompile.importObject);
            const compileExitPromise = goCompile.run(compileInstance.instance);
            
            // Check exit code
            await compileExitPromise;
            console.log('Compile exit code:', goCompile.exitCode);
            
            if (compilerOutput.length > 0) {
                console.log('Compiler output:', compilerOutput.join('\n'));
            }

            if (goCompile.exitCode !== 0) {
                const errorMsg = compilerOutput.length > 0 ? compilerOutput.join('\n') : `compiler exited with code ${goCompile.exitCode}`;
                throw new Error(`Compilation failed: ${errorMsg}`);
            }
        } finally {
            GoScriptGlobal.addConsoleOutput = originalAddConsoleOutput;
        }
        
        // Check if main.o exists
        if (!this.vfs.exists('/tmp/main.o')) {
            const errorMsg = compilerOutput.length > 0 ? compilerOutput.join('\n') : 'No output from compiler';
            throw new Error(`Compilation failed: main.o not created. Compiler output: ${errorMsg}`);
        }
        
        // 2. Link (cmd/link)
        // go tool link -o main.wasm main.o
        console.log('⚙️ CompilationManager: Running link...');
        const goLink = new Go();
        goLink.exitCode = 0;
        const originalLinkExit = goLink.exit.bind(goLink);
        goLink.exit = (code) => {
            goLink.exitCode = code;
            originalLinkExit(code);
        };
        goLink.argv = ['link', '-o', '/tmp/main.wasm', '-L', '/pkg/js_wasm', '/tmp/main.o'];
        goLink.env = { 'GOOS': 'js', 'GOARCH': 'wasm', 'GOROOT': '/' };
        
        const linkInstance = await WebAssembly.instantiate(this.linkWasmBytes, goLink.importObject);
        await goLink.run(linkInstance.instance);

        if (goLink.exitCode !== 0) {
            throw new Error(`Linking failed with exit code ${goLink.exitCode}`);
        }
        
        // Read output
        if (!this.vfs.exists('/tmp/main.wasm')) {
            throw new Error("Linking failed: main.wasm not created");
        }
        
        const wasm = this.vfs.readFile('/tmp/main.wasm');
        return wasm.buffer; // Return ArrayBuffer
    }

    /**
     * Utility delay function
     * @private
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Event emission methods
    emitProgress(percentage, status) {
        if (this.callbacks.onProgress) {
            this.callbacks.onProgress(percentage, status);
        }
    }

    emitStageUpdate(stage, status) {
        if (this.callbacks.onStageUpdate) {
            this.callbacks.onStageUpdate(stage, status);
        }
    }

    emitError(message) {
        if (this.callbacks.onError) {
            this.callbacks.onError(message);
        }
    }

    emitComplete(wasmBinary, metadata) {
        if (this.callbacks.onComplete) {
            this.callbacks.onComplete(wasmBinary, metadata);
        }
    }

    /**
     * Get current compilation status
     * @returns {string} Current status
     */
    getStatus() {
        return this.status;
    }

    /**
     * Cancel ongoing compilation
     */
    cancel() {
        if (this.status === 'compiling') {
            this.status = 'cancelled';
            console.log('🛑 CompilationManager: Compilation cancelled');
        }
    }
}

// Export for use in other modules
GoScriptGlobal.CompilationManager = CompilationManager; 




/**
 * Personal Website 2025 - App Runner
 * Handles WASM execution and DOM mounting
 */

class AppRunner {
    constructor() {
        this.wasmInstance = null;
        this.wasmModule = null;
        this.isRunning = false;
        this.mountPoint = null;
        this.go = null; // Go runtime instance
        this.outputCallback = null;
        this.allowMockExecution = false;
        this.usingMockRuntime = false;
    }

    /**
     * Configure output redirection
     * @param {Function} outputCallback - Function to handle stdout/stderr strings
     */
    configureOutput(outputCallback) {
        this.outputCallback = outputCallback;
        this.setupFsPolyfill();
    }

    /**
     * Setup FS polyfill for stdout/stderr capture
     * @private
     */
    setupFsPolyfill() {
        if (!GoScriptGlobal.fs) GoScriptGlobal.fs = {};
        const baseFs = GoScriptGlobal.fs;
        const originalWriteSync = typeof baseFs.writeSync === 'function' ? baseFs.writeSync.bind(baseFs) : null;
        const originalWrite = typeof baseFs.write === 'function' ? baseFs.write.bind(baseFs) : null;
        const originalOpen = typeof baseFs.open === 'function' ? baseFs.open.bind(baseFs) : null;
        
        const writeToOutput = (buf) => {
            if (this.outputCallback) {
                const decoder = new TextDecoder("utf-8");
                const text = decoder.decode(buf);
                this.outputCallback(text);
            }
        };

        GoScriptGlobal.fs.writeSync = (fd, buf) => {
            if (fd === 1 || fd === 2) {
                writeToOutput(buf);
                return buf.length;
            }

            if (originalWriteSync) {
                return originalWriteSync(fd, buf);
            }

            return buf.length;
        };
        
        GoScriptGlobal.fs.write = (fd, buf, offset, length, position, callback) => {
            if (fd === 1 || fd === 2) {
                writeToOutput(buf.subarray(offset, offset + length));
                callback(null, length);
                return;
            }

            if (originalWrite) {
                originalWrite(fd, buf, offset, length, position, callback);
                return;
            }

            callback(null, length);
        };
        
        GoScriptGlobal.fs.open = (path, flags, mode, callback) => {
            if (originalOpen) {
                originalOpen(path, flags, mode, callback);
                return;
            }

            callback(null, 0);
        };
    }

    /**
     * Initialize the app runner
     * @returns {Promise<void>}
     */
    async init() {
        console.log('🚀 AppRunner: Initializing WASM execution environment...');
        
        // Initialize Go runtime if wasm_exec.js is loaded
        if (typeof Go !== 'undefined') {
            this.go = new Go();
            console.log('✅ AppRunner: Go runtime initialized');
        } else {
            console.warn('⚠️ AppRunner: wasm_exec.js not loaded, using mock runtime');
        }
    }

    /**
     * Execute WASM binary and mount to DOM
     * @param {ArrayBuffer} wasmBinary - Compiled WASM binary
     * @param {Object} metadata - Compilation metadata
     * @param {string} mountElementId - DOM element ID to mount to
     * @returns {Promise<void>}
     */
    async execute(wasmBinary, metadata = {}, mountElementId = 'root') {
        try {
            console.log(`🎯 AppRunner: Executing WASM binary (${wasmBinary.byteLength} bytes)`);
            
            this.mountPoint = document.getElementById(mountElementId);
            if (!this.mountPoint) {
                throw new Error(`Mount point #${mountElementId} not found`);
            }

            // Load and instantiate WASM module
            await this.loadWasmModule(wasmBinary);
            
            // Setup DOM environment for Go application
            this.setupDOMEnvironment();
            
            // Run the WASM application
            await this.runWasmApplication();
            
            this.isRunning = true;
            console.log('✅ AppRunner: Application running successfully');
            
        } catch (error) {
            console.error('❌ AppRunner: Execution failed:', error.message);
            this.showError(error.message);
            throw error;
        }
    }

    /**
     * Execute WASM binary as a console application (no DOM takeover)
     * @param {ArrayBuffer} wasmBinary - Compiled WASM binary
     * @param {string} sourceCode - Original source code for mock execution
     * @returns {Promise<void>}
     */
    async executeConsole(wasmBinary, sourceCode = null) {
        try {
            console.log(`🎯 AppRunner: Executing Console WASM binary (${wasmBinary.byteLength} bytes)`);
            
            // Check if this is a mock WASM (small size indicates mock)
            const isMock = wasmBinary.byteLength < 10000;
            
            if (isMock) {
                if (!this.allowMockExecution) {
                    throw new Error('Mock WASM execution is disabled');
                }
                // For mock WASM, simulate the output based on source code
                console.log('🎭 AppRunner: Using mock execution (compiler not available)');
                await this.executeMockConsole(sourceCode);
                return;
            }
            
            // Load and instantiate WASM module
            await this.loadWasmModule(wasmBinary);

            if (this.usingMockRuntime) {
                if (!this.allowMockExecution) {
                    throw new Error('Mock runtime fallback is disabled');
                }
                await this.executeMockConsole(sourceCode);
                this.isRunning = true;
                return;
            }
            
            // Run the WASM application
            await this.runWasmApplication(true);
            
            this.isRunning = true;
            console.log('✅ AppRunner: Console application finished');
            
        } catch (error) {
            console.error('❌ AppRunner: Console execution failed:', error.message);
            throw error;
        }
    }

    /**
     * Execute mock console output based on source code analysis
     * @private
     */
    async executeMockConsole(sourceCode) {
        if (!sourceCode) {
            if (this.outputCallback) {
                this.outputCallback('(Mock execution - no source code provided)\n');
            }
            return;
        }
        
        // Parse fmt.Println and fmt.Printf calls from source
        const printlnMatches = sourceCode.matchAll(/fmt\.Println\s*\(\s*"([^"]*)"\s*\)/g);
        const printfMatches = sourceCode.matchAll(/fmt\.Printf\s*\(\s*"([^"]*)"[^)]*\)/g);
        
        const outputs = [];
        
        // Collect Println outputs
        for (const match of printlnMatches) {
            outputs.push(match[1]);
        }
        
        // Simple simulation for specific examples
        if (sourceCode.includes('Hello, World!')) {
            outputs.length = 0;
            outputs.push('Hello, World!');
            outputs.push('Welcome to GoScript - Go in your browser!');
        } else if (sourceCode.includes('fibonacci')) {
            outputs.length = 0;
            outputs.push('Fibonacci Sequence:');
            for (let i = 0; i < 15; i++) {
                outputs.push(`fib(${i}) = ${this.fib(i)}`);
            }
        } else if (sourceCode.includes('FizzBuzz')) {
            outputs.length = 0;
            outputs.push('FizzBuzz from 1 to 30:');
            outputs.push('');
            for (let i = 1; i <= 30; i++) {
                if (i % 15 === 0) outputs.push('FizzBuzz');
                else if (i % 3 === 0) outputs.push('Fizz');
                else if (i % 5 === 0) outputs.push('Buzz');
                else outputs.push(String(i));
            }
        } else if (sourceCode.includes('isPrime')) {
            outputs.length = 0;
            outputs.push('Prime numbers from 1 to 100:');
            outputs.push('');
            let line = '';
            let count = 0;
            for (let i = 2; i <= 100; i++) {
                if (this.isPrime(i)) {
                    line += String(i).padStart(4) + ' ';
                    count++;
                    if (count % 10 === 0) {
                        outputs.push(line);
                        line = '';
                    }
                }
            }
            if (line) outputs.push(line);
            outputs.push('');
            outputs.push(`Found ${count} prime numbers.`);
        } else if (sourceCode.includes('Person') && sourceCode.includes('Greet')) {
            outputs.length = 0;
            outputs.push('Meet our team:');
            outputs.push('');
            outputs.push("Hi, I'm Alice, 30 years old from New York!");
            outputs.push("Hi, I'm Bob, 25 years old from San Francisco!");
            outputs.push("Hi, I'm Charlie, 35 years old from Seattle!");
        }
        
        // Output with slight delay for effect
        for (const line of outputs) {
            if (this.outputCallback) {
                this.outputCallback(line + '\n');
            }
            await this.delay(10);
        }
    }

    // Helper functions for mock execution
    fib(n) {
        if (n <= 1) return n;
        return this.fib(n - 1) + this.fib(n - 2);
    }

    isPrime(n) {
        if (n < 2) return false;
        for (let i = 2; i * i <= n; i++) {
            if (n % i === 0) return false;
        }
        return true;
    }

    /**
     * Load and instantiate WASM module
     * @private
     */
    async loadWasmModule(wasmBinary) {
        console.log('📦 AppRunner: Loading WASM module...');
        
        if (this.go) {
            // Use actual Go runtime
            try {
                this.wasmModule = await WebAssembly.instantiate(wasmBinary, this.go.importObject);
                this.wasmInstance = this.wasmModule.instance;
                this.usingMockRuntime = false;
                console.log('✅ AppRunner: WASM module loaded with Go runtime');
            } catch (error) {
                if (!this.allowMockExecution) {
                    throw error;
                }
                console.warn('⚠️ AppRunner: Go runtime failed, falling back to mock');
                await this.loadMockModule(wasmBinary);
            }
        } else {
            // Use mock implementation
            if (!this.allowMockExecution) {
                throw new Error('Go runtime is unavailable and mock execution is disabled');
            }
            await this.loadMockModule(wasmBinary);
        }
    }

    /**
     * Load mock WASM module for development
     * @private
     */
    async loadMockModule(wasmBinary) {
        console.log('🎭 AppRunner: Loading mock WASM module...');
        
        // Simulate WASM loading
        await this.delay(500);
        
        // Create a mock module that renders our demo content
        this.wasmModule = {
            instance: {
                exports: {
                    main: () => this.renderMockApplication(),
                    _start: () => this.renderMockApplication()
                }
            }
        };
        
        this.wasmInstance = this.wasmModule.instance;
        this.usingMockRuntime = true;
        console.log('✅ AppRunner: Mock WASM module loaded');
    }

    /**
     * Setup DOM environment for Go application
     * @private
     */
    setupDOMEnvironment() {
        console.log('🌐 AppRunner: Setting up DOM environment...');
        
        // Clear mount point
        this.mountPoint.innerHTML = '';
        
        // Add CSS for the application
        this.injectApplicationCSS();
        
        // Setup global objects that Go WASM might expect
        if (!GoScriptGlobal.fs) {
            GoScriptGlobal.fs = {
                writeSync: () => {},
                write: () => {}
            };
        }
        
        console.log('✅ AppRunner: DOM environment ready');
    }

    /**
     * Run the WASM application
     * @private
     */
    async runWasmApplication(isConsole = false) {
        console.log('▶️ AppRunner: Starting WASM application...');
        
        if (this.usingMockRuntime) {
            if (!isConsole) {
                this.renderMockApplication();
                return;
            }

            console.warn('⚠️ AppRunner: Mock application skipped in console mode');
            return;
        }

        if (this.go) {
            // Run with Go runtime
            await this.go.run(this.wasmInstance);
        } else if (this.wasmInstance.exports.main) {
            // Run main function
            this.wasmInstance.exports.main();
        } else if (this.wasmInstance.exports._start) {
            // Run _start function
            this.wasmInstance.exports._start();
        } else {
            // Fallback to mock
            if (!isConsole) {
                this.renderMockApplication();
            } else {
                console.warn('⚠️ AppRunner: Mock application skipped in console mode');
            }
        }
    }

    /**
     * Render mock application for development
     * @private
     */
    renderMockApplication() {
        console.log('🎭 AppRunner: Rendering mock application...');
        
        this.mountPoint.innerHTML = `
            <div class="mock-app">
                <header class="app-header">
                    <h1>🎉 Personal Website 2025</h1>
                    <p>Compiled from Go to WASM • Running in Browser</p>
                </header>
                
                <main class="app-content">
                    <div class="welcome-section">
                        <h2>✨ Welcome to the Future of Web Development</h2>
                        <p>This website was compiled from Go source code directly in your browser using WebAssembly!</p>
                    </div>
                    
                    <div class="features-grid">
                        <div class="feature-card">
                            <h3>🚀 Real-time Compilation</h3>
                            <p>Go source code fetched from GitHub and compiled to WASM instantly</p>
                        </div>
                        
                        <div class="feature-card">
                            <h3>💾 Smart Caching</h3>
                            <p>IndexedDB caching with commit-hash based invalidation</p>
                        </div>
                        
                        <div class="feature-card">
                            <h3>🌐 No Server Required</h3>
                            <p>Everything runs in your browser - no backend needed</p>
                        </div>
                        
                        <div class="feature-card">
                            <h3>⚡ Lightning Fast</h3>
                            <p>WebAssembly performance with Go's simplicity</p>
                        </div>
                    </div>
                    
                    <div class="demo-section">
                        <h3>🎯 Interactive Demo</h3>
                        <button onclick="globalThis.appRunner.handleDemoClick()" class="demo-button">
                            Click me! (Handled by Go WASM)
                        </button>
                        <div id="demo-output" class="demo-output"></div>
                    </div>
                    
                    <div class="tech-stack">
                        <h3>🛠️ Technology Stack</h3>
                        <div class="tech-tags">
                            <span class="tech-tag">Go 1.21</span>
                            <span class="tech-tag">WebAssembly</span>
                            <span class="tech-tag">Fiber Framework</span>
                            <span class="tech-tag">IndexedDB</span>
                            <span class="tech-tag">GitHub API</span>
                            <span class="tech-tag">Virtual Filesystem</span>
                        </div>
                    </div>
                </main>
                
                <footer class="app-footer">
                    <p>🔧 Compiled ${new Date().toLocaleString()}</p>
                    <p>💚 Powered by Go WebAssembly</p>
                </footer>
            </div>
        `;
        
        // Make the app runner globally accessible for demo interactions
        GoScriptGlobal.appRunner = this;
    }

    /**
     * Handle demo button click (simulates Go WASM interaction)
     */
    handleDemoClick() {
        const output = document.getElementById('demo-output');
        const responses = [
            'Hello from Go WASM! 👋',
            'This interaction was handled by compiled Go code! 🚀',
            'WebAssembly + Go = Amazing performance! ⚡',
            'Your browser is now running Go! 🎉',
            'Fiber framework responding from WASM! 🌐'
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        output.innerHTML = `<p>🎯 ${randomResponse}</p>`;
        
        console.log('🎭 AppRunner: Demo interaction handled');
    }

    /**
     * Inject CSS for the application
     * @private
     */
    injectApplicationCSS() {
        const style = document.createElement('style');
        style.textContent = `
            .mock-app {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 25%, #16213e 50%, #1a1a2e 75%, #0a0a0f 100%);
                color: #f8fafc;
                min-height: 100vh;
                padding: 2rem;
                animation: fadeIn 0.8s ease-in-out;
            }
            
            .app-header {
                text-align: center;
                margin-bottom: 3rem;
            }
            
            .app-header h1 {
                font-size: 3rem;
                font-weight: bold;
                margin-bottom: 0.5rem;
                background: linear-gradient(90deg, #4f46e5, #7c3aed, #06b6d4);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 0 20px rgba(79, 70, 229, 0.3);
            }
            
            .app-header p {
                font-size: 1.2rem;
                color: #cbd5e1;
            }
            
            .welcome-section {
                text-align: center;
                margin-bottom: 3rem;
                padding: 2rem;
                background: rgba(26, 26, 46, 0.7);
                border-radius: 1rem;
                border: 1px solid rgba(79, 70, 229, 0.2);
            }
            
            .features-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 1.5rem;
                margin-bottom: 3rem;
            }
            
            .feature-card {
                background: rgba(26, 26, 46, 0.7);
                padding: 1.5rem;
                border-radius: 0.75rem;
                border: 1px solid rgba(79, 70, 229, 0.2);
                backdrop-filter: blur(10px);
            }
            
            .feature-card h3 {
                color: #10b981;
                margin-bottom: 0.5rem;
            }
            
            .demo-section {
                text-align: center;
                margin-bottom: 3rem;
                padding: 2rem;
                background: rgba(26, 26, 46, 0.7);
                border-radius: 1rem;
                border: 1px solid rgba(79, 70, 229, 0.2);
            }
            
            .demo-button {
                background: linear-gradient(90deg, #10b981, #06d6a0);
                color: white;
                border: none;
                padding: 1rem 2rem;
                border-radius: 0.5rem;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
            }
            
            .demo-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
            }
            
            .demo-output {
                margin-top: 1rem;
                min-height: 2rem;
                font-size: 1.1rem;
                color: #10b981;
            }
            
            .tech-stack {
                text-align: center;
                margin-bottom: 2rem;
            }
            
            .tech-tags {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 0.5rem;
                margin-top: 1rem;
            }
            
            .tech-tag {
                background: rgba(79, 70, 229, 0.2);
                color: #a5b4fc;
                padding: 0.5rem 1rem;
                border-radius: 1rem;
                font-size: 0.9rem;
                font-weight: 500;
                border: 1px solid rgba(79, 70, 229, 0.3);
            }
            
            .app-footer {
                text-align: center;
                padding-top: 2rem;
                color: #64748b;
                border-top: 1px solid rgba(79, 70, 229, 0.2);
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(1.05); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Show error message in the mount point
     * @private
     */
    showError(message) {
        if (this.mountPoint) {
            this.mountPoint.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0a0a0f; color: #f8fafc; font-family: 'Inter', sans-serif;">
                    <div style="text-align: center; padding: 2rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 1rem;">
                        <h2 style="color: #ef4444; margin-bottom: 1rem;">❌ Application Error</h2>
                        <p style="color: #cbd5e1; margin-bottom: 1rem;">${message}</p>
                        <button onclick="globalThis.location.reload()" style="background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer;">
                            🔄 Reload Page
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Stop the running application
     */
    stop() {
        if (this.isRunning) {
            console.log('🛑 AppRunner: Stopping application...');
            this.isRunning = false;
            
            if (this.mountPoint) {
                this.mountPoint.innerHTML = '';
            }
            
            console.log('✅ AppRunner: Application stopped');
        }
    }

    /**
     * Get application status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            hasWasmModule: !!this.wasmModule,
            hasGoRuntime: !!this.go,
            mountPoint: this.mountPoint?.id || null
        };
    }

    /**
     * Utility delay function
     * @private
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other modules
GoScriptGlobal.AppRunner = AppRunner;

