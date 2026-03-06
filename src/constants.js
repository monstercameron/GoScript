/**
 * Shared GoScript runtime constants.
 * Centralizing these avoids path drift between the SDK, compiler pipeline, cache,
 * and the browser playground bundle.
 */

var GoScriptGlobal = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : {});

var GoScriptConstants = {
    toolchain: {
        defaultPackUrl: 'assets/goscript.pack',
        compilerWasmUrl: 'assets/bin/compile.wasm',
        linkerWasmUrl: 'assets/bin/link.wasm',
        stdlibPackUrl: 'static/pkg/stdlib.pack',
        stdlibIndexUrl: 'static/pkg/index.json',
        stdlibArchivePrefix: 'static/pkg/js_wasm'
    },
    vfs: {
        rootPath: '/',
        sourceRootPath: '/src',
        packageRootPath: '/pkg',
        jsWasmPackagePath: '/pkg/js_wasm',
        binaryRootPath: '/bin',
        buildRootPath: '/build',
        tempRootPath: '/tmp',
        outputRootPath: '/output',
        buildConfigPath: '/build/config.json',
        tempObjectPath: '/tmp/main.o',
        tempWasmPath: '/tmp/main.wasm',
        outputWasmPath: '/output/main.wasm',
        entrySourceFileName: 'main.go'
    },
    defaults: {
        moduleName: 'personal-website-2025',
        goVersion: '1.21',
        target: 'wasm',
        goos: 'js',
        goarch: 'wasm',
        packageTarget: 'js/wasm',
        debug: false
    },
    cache: {
        sourceDatabaseName: 'PersonalWebsite2025Cache',
        sourceDatabaseVersion: 1,
        sourceFilesStore: 'sourceFiles',
        compiledWasmStore: 'compiledWasm',
        metadataStore: 'metadata',
        toolchainDatabaseName: 'GoScriptCache',
        toolchainStore: 'toolchain',
        toolchainDatabaseVersion: 1
    },
    runtime: {
        mockWasmThresholdBytes: 10000,
        mockDelayMs: 500,
        outputDelayMs: 10
    },
    build: {
        compileStartStatus: 'COMPILATION_START',
        compilerReadyStatus: 'COMPILER_READY',
        cachedBinaryLoadedStatus: 'CACHED_BINARY_LOADED',
        cacheCheckedStatus: 'CACHE_CHECKED',
        sourcesLoadedStatus: 'SOURCES_LOADED',
        vfsReadyStatus: 'VFS_READY',
        wasmCompiledStatus: 'WASM_COMPILED',
        binaryCachedStatus: 'BINARY_CACHED',
        readyForExecutionStatus: 'READY_FOR_EXECUTION'
    }
};

GoScriptGlobal.GoScriptConstants = GoScriptConstants;
