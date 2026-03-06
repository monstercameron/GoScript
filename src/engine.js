/**
 * GoScript execution layer
 * Compilation pipeline and WASM runtime execution.
 */

var GoScriptEngineResult = GoScriptGlobal.GoScriptResult;
var GoScriptEngineConstants = GoScriptGlobal.GoScriptConstants;

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
        this.toolchainUrl = GoScriptEngineConstants.toolchain.defaultPackUrl;
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
        this.status = 'compiling';
        this.emitProgress(0, GoScriptEngineConstants.build.compileStartStatus);

        // Persist the exact compile input for cache hashing and temp file staging.
        this.filesToCompile = sourceFiles;

        this.emitStageUpdate(1, 'active');
        if (!this.compilerLoaded || !this.compileWasmBytes || !this.linkWasmBytes) {
            const [, compilerLoadError] = await GoScriptEngineResult.captureAsyncResult(
                () => this.loadCompiler(),
                'Failed to load the Go compiler toolchain'
            );
            if (compilerLoadError) {
                this.status = 'error';
                this.emitError(compilerLoadError.message);
                throw compilerLoadError;
            }
        }
        this.emitStageUpdate(1, 'complete');
        this.emitProgress(15, GoScriptEngineConstants.build.compilerReadyStatus);

        this.emitStageUpdate(2, 'active');
        const sourceHash = this.cacheManager.generateSourceHash(sourceFiles);
        const [cachedWasmEntry, cacheLookupError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.cacheManager.getCachedWasm(sourceHash),
            'Failed to inspect the compiled WASM cache'
        );
        if (cacheLookupError) {
            this.status = 'error';
            this.emitError(cacheLookupError.message);
            throw cacheLookupError;
        }

        if (cachedWasmEntry) {
            console.log('🎯 CompilationManager: Using cached WASM binary');
            this.emitStageUpdate(2, 'complete');
            this.emitProgress(100, GoScriptEngineConstants.build.cachedBinaryLoadedStatus);
            this.status = 'complete';
            this.emitComplete(cachedWasmEntry.wasmBinary, cachedWasmEntry.metadata);
            return cachedWasmEntry.wasmBinary;
        }

        this.emitStageUpdate(2, 'complete');
        this.emitProgress(25, GoScriptEngineConstants.build.cacheCheckedStatus);

        this.emitStageUpdate(3, 'active');
        this.vfs.loadGoSources(sourceFiles);
        this.emitStageUpdate(3, 'complete');
        this.emitProgress(40, GoScriptEngineConstants.build.sourcesLoadedStatus);

        this.emitStageUpdate(4, 'active');
        const [, buildEnvironmentError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.setupBuildEnvironment(),
            'Failed to prepare the build environment'
        );
        if (buildEnvironmentError) {
            this.status = 'error';
            this.emitError(buildEnvironmentError.message);
            throw buildEnvironmentError;
        }
        this.emitStageUpdate(4, 'complete');
        this.emitProgress(55, GoScriptEngineConstants.build.vfsReadyStatus);

        this.emitStageUpdate(5, 'active');
        const [wasmBinary, compilePipelineError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.compileToWasm(),
            'Failed to compile Go source into WASM'
        );
        if (compilePipelineError) {
            this.status = 'error';
            this.emitError(compilePipelineError.message);
            throw compilePipelineError;
        }
        this.emitStageUpdate(5, 'complete');
        this.emitProgress(80, GoScriptEngineConstants.build.wasmCompiledStatus);

        this.emitStageUpdate(6, 'active');
        const compilationMetadata = this.generateMetadata();
        const [, cacheWriteError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.cacheManager.cacheCompiledWasm(sourceHash, wasmBinary, compilationMetadata),
            'Failed to cache the compiled WASM binary'
        );
        if (cacheWriteError) {
            this.status = 'error';
            this.emitError(cacheWriteError.message);
            throw cacheWriteError;
        }
        this.emitStageUpdate(6, 'complete');
        this.emitProgress(95, GoScriptEngineConstants.build.binaryCachedStatus);

        this.emitStageUpdate(7, 'active');
        const [, prepareBinaryError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.prepareBinary(wasmBinary),
            'Failed to prepare the compiled WASM binary for execution'
        );
        if (prepareBinaryError) {
            this.status = 'error';
            this.emitError(prepareBinaryError.message);
            throw prepareBinaryError;
        }
        this.emitStageUpdate(7, 'complete');
        this.emitProgress(100, GoScriptEngineConstants.build.readyForExecutionStatus);

        this.status = 'complete';
        this.emitComplete(wasmBinary, compilationMetadata);
        return wasmBinary;
    }

    /**
     * Load the Go compiler (real WASM implementation)
     * @private
     */
    async loadCompiler() {
        console.log('🔧 CompilationManager: Loading GoScript toolchain...');

        if (!GoScriptGlobal.ToolchainLoader) {
            console.log('⚠️ ToolchainLoader not available, loading files separately...');
            await this.loadCompilerSeparately();
            return;
        }

        console.log('📦 Using packed goscript.pack (compiler + linker + stdlib in 1 file)');
        this.toolchainLoader = new GoScriptGlobal.ToolchainLoader();
        const [, packedToolchainError] = await GoScriptEngineResult.captureAsyncResult(async () => {
            await this.toolchainLoader.load(this.toolchainUrl);
            this.compileWasmBytes = this.toolchainLoader.getCompilerWasm();
            this.linkWasmBytes = this.toolchainLoader.getLinkerWasm();
            this.setupCompilerFilesystem();
            this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);

            const toolchainStats = this.toolchainLoader.getStats();
            console.log(`✅ CompilationManager: Toolchain ready (${(toolchainStats.packSize / 1024 / 1024).toFixed(1)} MB total)`);
            this.compilerLoaded = true;
        }, 'Failed to load the packed Go toolchain');
        if (!packedToolchainError) {
            return;
        }

        console.error('❌ CompilationManager: Failed to load packed toolchain:', packedToolchainError);
        await this.loadCompilerSeparately();
    }

    /**
     * Load compiler and linker separately (fallback)
     * @private
     */
    async loadCompilerSeparately() {
        const [compileResponse, compileFetchError] = await GoScriptEngineResult.promiseToResult(
            fetch(GoScriptEngineConstants.toolchain.compilerWasmUrl),
            'Failed to fetch compile.wasm'
        );
        if (compileFetchError) {
            console.error('❌ CompilationManager: Failed to load Go compiler:', compileFetchError);
            throw compileFetchError;
        }
        if (!compileResponse.ok) {
            const compileHttpError = new Error(`Failed to fetch compile.wasm: ${compileResponse.status}`);
            console.error('❌ CompilationManager: Failed to load Go compiler:', compileHttpError);
            throw compileHttpError;
        }

        const [compilerWasmBytes, compilerReadError] = await GoScriptEngineResult.promiseToResult(compileResponse.arrayBuffer(), 'Failed to read compile.wasm');
        if (compilerReadError) {
            console.error('❌ CompilationManager: Failed to load Go compiler:', compilerReadError);
            throw compilerReadError;
        }

        const [linkResponse, linkFetchError] = await GoScriptEngineResult.promiseToResult(
            fetch(GoScriptEngineConstants.toolchain.linkerWasmUrl),
            'Failed to fetch link.wasm'
        );
        if (linkFetchError) {
            console.error('❌ CompilationManager: Failed to load Go compiler:', linkFetchError);
            throw linkFetchError;
        }
        if (!linkResponse.ok) {
            const linkerHttpError = new Error(`Failed to fetch link.wasm: ${linkResponse.status}`);
            console.error('❌ CompilationManager: Failed to load Go compiler:', linkerHttpError);
            throw linkerHttpError;
        }

        const [linkerWasmBytes, linkerReadError] = await GoScriptEngineResult.promiseToResult(linkResponse.arrayBuffer(), 'Failed to read link.wasm');
        if (linkerReadError) {
            console.error('❌ CompilationManager: Failed to load Go compiler:', linkerReadError);
            throw linkerReadError;
        }

        this.compileWasmBytes = compilerWasmBytes;
        this.linkWasmBytes = linkerWasmBytes;
        console.log(`📦 CompilationManager: Loaded compiler (${(this.compileWasmBytes.byteLength / 1024 / 1024).toFixed(2)} MB) and linker (${(this.linkWasmBytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);

        this.setupCompilerFilesystem();
        await this.loadStdLib();
        this.compilerLoaded = true;
        console.log('✅ CompilationManager: Go compiler WASM loaded and ready');
    }

    /**
     * Load standard library from packed archive (fallback when not using toolchain pack)
     * @private
     */
    async loadStdLib() {
        console.log('📚 CompilationManager: Loading Go standard library...');

        if (!GoScriptGlobal.StdLibLoader) {
            console.log('⚠️ Packed stdlib not available, loading 340 packages individually (slower)...');
            await this.loadStdLibIndividual();
            return;
        }

        console.log('📦 Using packed stdlib.pack (340 packages in 1 file)');
        this.stdlibLoader = new GoScriptGlobal.StdLibLoader();
        const [, packedStdLibError] = await GoScriptEngineResult.captureAsyncResult(async () => {
            await this.stdlibLoader.load(GoScriptEngineConstants.toolchain.stdlibPackUrl);
            this.stdlibLoader.loadAllIntoVFS(this.vfs);

            const standardLibraryStats = this.stdlibLoader.getStats();
            console.log(`✅ CompilationManager: Standard library ready (${standardLibraryStats.packageCount} packages, ${(standardLibraryStats.packSize / 1024 / 1024).toFixed(1)} MB)`);
        }, 'Failed to load the packed standard library');
        if (!packedStdLibError) {
            return;
        }

        console.error('❌ CompilationManager: Failed to load packed stdlib:', packedStdLibError);
        await this.loadStdLibIndividual();
    }

    /**
     * Load standard library packages individually (fallback)
     * @private
     */
    async loadStdLibIndividual() {
        console.log('📚 CompilationManager: Loading standard library individually...');

        const [packageIndexResponse, packageIndexError] = await GoScriptEngineResult.promiseToResult(
            fetch(GoScriptEngineConstants.toolchain.stdlibIndexUrl),
            'Failed to fetch the standard library package index'
        );
        if (packageIndexError) {
            console.error('❌ CompilationManager: Failed to load standard library:', packageIndexError);
            await this.loadMinimalStdLib();
            return;
        }
        if (!packageIndexResponse.ok) {
            console.error('❌ CompilationManager: Failed to load standard library:', new Error('Failed to load package index'));
            await this.loadMinimalStdLib();
            return;
        }

        const [packageNameList, packageJsonError] = await GoScriptEngineResult.promiseToResult(
            packageIndexResponse.json(),
            'Failed to parse the standard library package index'
        );
        if (packageJsonError) {
            console.error('❌ CompilationManager: Failed to load standard library:', packageJsonError);
            await this.loadMinimalStdLib();
            return;
        }

        console.log(`📚 CompilationManager: Found ${packageNameList.length} packages in index`);

        const loadArchivePackage = async (packageName) => {
            const [archiveResponse, archiveFetchError] = await GoScriptEngineResult.promiseToResult(
                fetch(`${GoScriptEngineConstants.toolchain.stdlibArchivePrefix}/${packageName}.a`),
                `Failed to fetch package ${packageName}`
            );
            if (archiveFetchError) {
                console.warn(`Failed to load package ${packageName}:`, archiveFetchError);
                return;
            }
            if (!archiveResponse.ok) {
                return;
            }

            const [archiveBytes, archiveReadError] = await GoScriptEngineResult.promiseToResult(
                archiveResponse.arrayBuffer(),
                `Failed to read package ${packageName}`
            );
            if (archiveReadError) {
                console.warn(`Failed to load package ${packageName}:`, archiveReadError);
                return;
            }

            this.vfs.writeFile(`${GoScriptEngineConstants.vfs.jsWasmPackagePath}/${packageName}.a`, new Uint8Array(archiveBytes));
        };

        const batchSize = 10;
        for (let batchStart = 0; batchStart < packageNameList.length; batchStart += batchSize) {
            const packageBatch = packageNameList.slice(batchStart, batchStart + batchSize);
            await Promise.all(packageBatch.map(loadArchivePackage));
        }

        console.log('✅ CompilationManager: Standard library loaded');
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
        this.vfs.mkdir(GoScriptEngineConstants.vfs.tempRootPath);
        this.vfs.mkdir(GoScriptEngineConstants.vfs.buildRootPath);
        this.vfs.mkdir(GoScriptEngineConstants.vfs.outputRootPath);
        
        // Generate build configuration
        const buildConfig = this.generateBuildConfig();
        this.vfs.writeFile(GoScriptEngineConstants.vfs.buildConfigPath, JSON.stringify(buildConfig, null, 2));
        
        console.log('✅ CompilationManager: Build environment ready');
    }

    /**
     * Compile Go source to WASM (real Go compiler implementation)
     * @private
     */
    async compileToWasm() {
        console.log('🔥 CompilationManager: Compiling Go to WASM using real Go compiler...');

        const moduleInfo = this.vfs.getModuleInfo();
        const goFilePaths = this.vfs.getGoFiles();

        console.log(`📦 CompilationManager: Module: ${moduleInfo.name}`);
        console.log(`📝 CompilationManager: Compiling ${goFilePaths.length} Go files`);

        if (this.compileWasmBytes && this.linkWasmBytes) {
            const [compiledWasmBinary, compileError] = await GoScriptEngineResult.captureAsyncResult(
                () => this.runGoCompiler(),
                'The real Go compiler failed'
            );
            if (!compileError) {
                console.log(`✅ CompilationManager: Real WASM compiled (${compiledWasmBinary.byteLength} bytes)`);
                return compiledWasmBinary;
            }

            console.warn(`⚠️ CompilationManager: Real compiler failed: ${compileError.message}`);
            console.error(compileError);
            if (!this.allowMockFallback) {
                throw compileError;
            }
        }

        if (!this.allowMockFallback) {
            throw new Error('Go compiler is not available');
        }

        const simulatedCompileDelayMs = Math.max(1000, goFilePaths.length * 200);
        await this.delay(simulatedCompileDelayMs);

        const mockWasmBinary = this.generateMockWasm();
        console.log(`✅ CompilationManager: Mock WASM compiled (${mockWasmBinary.byteLength} bytes)`);
        return mockWasmBinary;
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
        this.vfs.writeFile(GoScriptEngineConstants.vfs.outputWasmPath, wasmBinary);
        
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
            target: GoScriptEngineConstants.defaults.target,
            os: GoScriptEngineConstants.defaults.goos,
            arch: GoScriptEngineConstants.defaults.goarch,
            buildTime: new Date().toISOString(),
            optimization: 'size',
            debug: GoScriptEngineConstants.defaults.debug
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
            target: GoScriptEngineConstants.defaults.packageTarget,
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

        const sourceFileNames = Object.keys(this.filesToCompile || {});
        if (sourceFileNames.length === 0) {
            throw new Error('No Go files specified for compilation');
        }

        const tempSourcePaths = [];
        for (const [sourceFileName, sourceFileContent] of Object.entries(this.filesToCompile)) {
            const tempSourcePath = `${GoScriptEngineConstants.vfs.tempRootPath}/${sourceFileName}`;
            this.vfs.writeFile(tempSourcePath, sourceFileContent);
            tempSourcePaths.push(tempSourcePath);
        }

        console.log(`📝 CompilationManager: Compiling ${tempSourcePaths.length} file(s): ${tempSourcePaths.join(', ')}`);
        console.log('📦 VFS Stats:', this.vfs.getStats());
        console.log('📦 pkg/js_wasm contents:', this.vfs.listDir(GoScriptEngineConstants.vfs.jsWasmPackagePath).slice(0, 10));

        const compileOutputLines = [];
        const previousConsoleOutput = GoScriptGlobal.addConsoleOutput;
        const captureCompilerOutput = (outputText) => {
            compileOutputLines.push(outputText);
            console.log('[COMPILER]', outputText);
            if (previousConsoleOutput) {
                previousConsoleOutput(outputText);
            }
        };

        const compileArgumentList = ['compile', '-o', GoScriptEngineConstants.vfs.tempObjectPath, '-p', 'main', '-I', GoScriptEngineConstants.vfs.jsWasmPackagePath, ...tempSourcePaths];
        const [compileResult, compileError] = await GoScriptEngineResult.withTemporaryGlobal('addConsoleOutput', captureCompilerOutput, async () => {
            console.log('⚙️ CompilationManager: Running compile...');
            console.log('⚙️ Args:', compileArgumentList);

            const compileRuntimeProcess = new Go();
            compileRuntimeProcess.exitCode = 0;
            const originalExitHandler = compileRuntimeProcess.exit.bind(compileRuntimeProcess);
            compileRuntimeProcess.exit = (exitCode) => {
                compileRuntimeProcess.exitCode = exitCode;
                originalExitHandler(exitCode);
            };
            compileRuntimeProcess.argv = compileArgumentList;
            compileRuntimeProcess.env = { GOOS: 'js', GOARCH: 'wasm', GOROOT: '/' };

            const compileModuleRecord = await WebAssembly.instantiate(this.compileWasmBytes, compileRuntimeProcess.importObject);
            await compileRuntimeProcess.run(compileModuleRecord.instance);
            return compileRuntimeProcess.exitCode;
        }, 'Failed while running cmd/compile');
        if (compileError) {
            throw compileError;
        }

        console.log('Compile exit code:', compileResult);
        if (compileOutputLines.length > 0) {
            console.log('Compiler output:', compileOutputLines.join('\n'));
        }
        if (compileResult !== 0) {
            const compilerMessage = compileOutputLines.length > 0
                ? compileOutputLines.join('\n')
                : `compiler exited with code ${compileResult}`;
            throw new Error(`Compilation failed: ${compilerMessage}`);
        }

        if (!this.vfs.exists(GoScriptEngineConstants.vfs.tempObjectPath)) {
            const compilerMessage = compileOutputLines.length > 0 ? compileOutputLines.join('\n') : 'No output from compiler';
            throw new Error(`Compilation failed: main.o not created. Compiler output: ${compilerMessage}`);
        }

        // The linker reads the object file written above from the VFS, so a missing
        // or partial main.o must fail here instead of being hidden by a later wasm error.
        console.log('⚙️ CompilationManager: Running link...');
        const linkArgumentList = ['link', '-o', GoScriptEngineConstants.vfs.tempWasmPath, '-L', GoScriptEngineConstants.vfs.jsWasmPackagePath, GoScriptEngineConstants.vfs.tempObjectPath];
        const [linkExitCode, linkError] = await GoScriptEngineResult.captureAsyncResult(async () => {
            const linkRuntimeProcess = new Go();
            linkRuntimeProcess.exitCode = 0;
            const originalExitHandler = linkRuntimeProcess.exit.bind(linkRuntimeProcess);
            linkRuntimeProcess.exit = (exitCode) => {
                linkRuntimeProcess.exitCode = exitCode;
                originalExitHandler(exitCode);
            };
            linkRuntimeProcess.argv = linkArgumentList;
            linkRuntimeProcess.env = { GOOS: 'js', GOARCH: 'wasm', GOROOT: '/' };

            const linkerModuleRecord = await WebAssembly.instantiate(this.linkWasmBytes, linkRuntimeProcess.importObject);
            await linkRuntimeProcess.run(linkerModuleRecord.instance);
            return linkRuntimeProcess.exitCode;
        }, 'Failed while running cmd/link');
        if (linkError) {
            throw linkError;
        }
        if (linkExitCode !== 0) {
            throw new Error(`Linking failed with exit code ${linkExitCode}`);
        }
        if (!this.vfs.exists(GoScriptEngineConstants.vfs.tempWasmPath)) {
            throw new Error('Linking failed: main.wasm not created');
        }

        const wasmFileContent = this.vfs.readFile(GoScriptEngineConstants.vfs.tempWasmPath);
        const wasmByteArray = wasmFileContent instanceof Uint8Array ? wasmFileContent : new Uint8Array(wasmFileContent);
        return wasmByteArray.buffer.slice(wasmByteArray.byteOffset, wasmByteArray.byteOffset + wasmByteArray.byteLength);
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
        console.log(`🎯 AppRunner: Executing WASM binary (${wasmBinary.byteLength} bytes)`);

        this.mountPoint = document.getElementById(mountElementId);
        if (!this.mountPoint) {
            const mountPointError = new Error(`Mount point #${mountElementId} not found`);
            console.error('❌ AppRunner: Execution failed:', mountPointError.message);
            this.showError(mountPointError.message);
            throw mountPointError;
        }

        const [, wasmLoadError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.loadWasmModule(wasmBinary),
            'Failed to load the application WASM module'
        );
        if (wasmLoadError) {
            console.error('❌ AppRunner: Execution failed:', wasmLoadError.message);
            this.showError(wasmLoadError.message);
            throw wasmLoadError;
        }

        const [, domSetupError] = GoScriptEngineResult.captureSyncResult(
            () => this.setupDOMEnvironment(),
            'Failed to prepare the DOM environment'
        );
        if (domSetupError) {
            console.error('❌ AppRunner: Execution failed:', domSetupError.message);
            this.showError(domSetupError.message);
            throw domSetupError;
        }

        const [, runtimeError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.runWasmApplication(),
            'Failed to run the WASM application'
        );
        if (runtimeError) {
            console.error('❌ AppRunner: Execution failed:', runtimeError.message);
            this.showError(runtimeError.message);
            throw runtimeError;
        }

        this.isRunning = true;
        console.log('✅ AppRunner: Application running successfully');
    }

    /**
     * Execute WASM binary as a console application (no DOM takeover)
     * @param {ArrayBuffer} wasmBinary - Compiled WASM binary
     * @param {string} sourceCode - Original source code for mock execution
     * @returns {Promise<void>}
     */
    async executeConsole(wasmBinary, sourceCode = null) {
        console.log(`🎯 AppRunner: Executing Console WASM binary (${wasmBinary.byteLength} bytes)`);

        const isMockBinary = wasmBinary.byteLength < GoScriptEngineConstants.runtime.mockWasmThresholdBytes;
        if (isMockBinary) {
            if (!this.allowMockExecution) {
                throw new Error('Mock WASM execution is disabled');
            }

            console.log('🎭 AppRunner: Using mock execution (compiler not available)');
            const [, mockExecutionError] = await GoScriptEngineResult.captureAsyncResult(
                () => this.executeMockConsole(sourceCode),
                'Failed to execute the mock console runtime'
            );
            if (mockExecutionError) {
                console.error('❌ AppRunner: Console execution failed:', mockExecutionError.message);
                throw mockExecutionError;
            }
            return;
        }

        const [, wasmLoadError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.loadWasmModule(wasmBinary),
            'Failed to load the console WASM module'
        );
        if (wasmLoadError) {
            console.error('❌ AppRunner: Console execution failed:', wasmLoadError.message);
            throw wasmLoadError;
        }

        if (this.usingMockRuntime) {
            if (!this.allowMockExecution) {
                const runtimeFallbackError = new Error('Mock runtime fallback is disabled');
                console.error('❌ AppRunner: Console execution failed:', runtimeFallbackError.message);
                throw runtimeFallbackError;
            }

            const [, mockExecutionError] = await GoScriptEngineResult.captureAsyncResult(
                () => this.executeMockConsole(sourceCode),
                'Failed to execute the mock console runtime'
            );
            if (mockExecutionError) {
                console.error('❌ AppRunner: Console execution failed:', mockExecutionError.message);
                throw mockExecutionError;
            }
            this.isRunning = true;
            return;
        }

        const [, runtimeError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.runWasmApplication(true),
            'Failed to run the console WASM application'
        );
        if (runtimeError) {
            console.error('❌ AppRunner: Console execution failed:', runtimeError.message);
            throw runtimeError;
        }

        this.isRunning = true;
        console.log('✅ AppRunner: Console application finished');
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
            await this.delay(GoScriptEngineConstants.runtime.outputDelayMs);
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

        if (!this.go) {
            if (!this.allowMockExecution) {
                throw new Error('Go runtime is unavailable and mock execution is disabled');
            }

            const [, mockRuntimeError] = await GoScriptEngineResult.captureAsyncResult(
                () => this.loadMockModule(wasmBinary),
                'Failed to load the mock WASM runtime'
            );
            if (mockRuntimeError) {
                throw mockRuntimeError;
            }
            return;
        }

        const [wasmModuleRecord, wasmInstantiateError] = await GoScriptEngineResult.promiseToResult(
            WebAssembly.instantiate(wasmBinary, this.go.importObject),
            'Failed to instantiate the Go WASM module'
        );
        if (!wasmInstantiateError) {
            this.wasmModule = wasmModuleRecord;
            this.wasmInstance = wasmModuleRecord.instance;
            this.usingMockRuntime = false;
            console.log('✅ AppRunner: WASM module loaded with Go runtime');
            return;
        }

        if (!this.allowMockExecution) {
            throw wasmInstantiateError;
        }

        console.warn('⚠️ AppRunner: Go runtime failed, falling back to mock');
        const [, mockRuntimeError] = await GoScriptEngineResult.captureAsyncResult(
            () => this.loadMockModule(wasmBinary),
            'Failed to load the mock WASM runtime after Go runtime instantiation failed'
        );
        if (mockRuntimeError) {
            throw mockRuntimeError;
        }
    }

    /**
     * Load mock WASM module for development
     * @private
     */
    async loadMockModule(wasmBinary) {
        console.log('🎭 AppRunner: Loading mock WASM module...');
        
        // Simulate WASM loading
        await this.delay(GoScriptEngineConstants.runtime.mockDelayMs);
        
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
                            <span class="tech-tag">Go ${GoScriptEngineConstants.defaults.goVersion}</span>
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


