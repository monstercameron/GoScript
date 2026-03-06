/**
 * GoScript platform layer
 * Virtual filesystem, fs polyfill, IndexedDB cache, and toolchain pack loader.
 */

var GoScriptGlobal = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : {});
var GoScriptPlatformConstants = GoScriptGlobal.GoScriptConstants;

/**
 * Normalize unknown thrown values into Error objects.
 * @param {unknown} thrownValue
 * @param {string} [fallbackMessage]
 * @returns {Error}
 */
function normalizeGoScriptError(thrownValue, fallbackMessage = 'Unexpected GoScript error') {
    if (thrownValue instanceof Error) {
        return thrownValue;
    }

    if (typeof thrownValue === 'string') {
        return new Error(thrownValue);
    }

    const normalizedError = new Error(fallbackMessage);
    normalizedError.cause = thrownValue;
    return normalizedError;
}

/**
 * Wrap sync work in a `[result, error]` tuple.
 * @template T
 * @param {() => T} workFunction
 * @param {string} [fallbackMessage]
 * @returns {[T, null] | [null, Error]}
 */
function captureSyncResult(workFunction, fallbackMessage) {
    try {
        return [workFunction(), null];
    } catch (thrownValue) {
        return [null, normalizeGoScriptError(thrownValue, fallbackMessage)];
    }
}

/**
 * Wrap async work in a `[result, error]` tuple.
 * @template T
 * @param {() => Promise<T>|T} workFunction
 * @param {string} [fallbackMessage]
 * @returns {Promise<[T, null] | [null, Error]>}
 */
function captureAsyncResult(workFunction, fallbackMessage) {
    return Promise.resolve()
        .then(workFunction)
        .then(
            (workResult) => [workResult, null],
            (thrownValue) => [null, normalizeGoScriptError(thrownValue, fallbackMessage)]
        );
}

/**
 * Convert an existing promise into a `[result, error]` tuple.
 * @template T
 * @param {Promise<T>} workPromise
 * @param {string} [fallbackMessage]
 * @returns {Promise<[T, null] | [null, Error]>}
 */
function promiseToResult(workPromise, fallbackMessage) {
    return Promise.resolve(workPromise)
        .then(
            (workResult) => [workResult, null],
            (thrownValue) => [null, normalizeGoScriptError(thrownValue, fallbackMessage)]
        );
}

/**
 * Temporarily override a global value while async work runs.
 * The hot compile path uses this to route stdout without leaving global state behind.
 * @template T
 * @param {string} globalKey
 * @param {*} temporaryValue
 * @param {() => Promise<T>|T} workFunction
 * @param {string} [fallbackMessage]
 * @returns {Promise<[T, null] | [null, Error]>}
 */
function withTemporaryGlobal(globalKey, temporaryValue, workFunction, fallbackMessage) {
    const previousValue = GoScriptGlobal[globalKey];
    GoScriptGlobal[globalKey] = temporaryValue;

    return captureAsyncResult(workFunction, fallbackMessage).then(([workResult, workError]) => {
        GoScriptGlobal[globalKey] = previousValue;
        return [workResult, workError];
    });
}

GoScriptGlobal.GoScriptResult = {
    normalizeGoScriptError,
    captureSyncResult,
    captureAsyncResult,
    promiseToResult,
    withTemporaryGlobal
};

/**
 * Personal Website 2025 - Virtual Filesystem
 * In-memory filesystem for Go compiler integration
 */

class VirtualFileSystem {
    constructor() {
        this.files = new Map();
        this.directories = new Set();
        this.workingDirectory = GoScriptPlatformConstants.vfs.rootPath;
    }

    /**
     * Write file to virtual filesystem
     * @param {string} path - File path
     * @param {string|Uint8Array|ArrayBuffer} content - File content
     */
    writeFile(path, content) {
        const normalizedPath = this.normalizePath(path);
        const normalizedContent = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
        this.files.set(normalizedPath, normalizedContent);
        this.ensureDirectoryExists(this.getDirectory(normalizedPath));
        console.log(`📝 VFS: Written ${normalizedPath} (${this.getContentSize(normalizedContent)} bytes)`);
    }

    /**
     * Read file from virtual filesystem
     * @param {string} path - File path
     * @returns {string|Uint8Array} File content
     */
    readFile(path) {
        const normalizedPath = this.normalizePath(path);
        if (!this.files.has(normalizedPath)) {
            throw new Error(`File not found: ${normalizedPath}`);
        }
        return this.files.get(normalizedPath);
    }

    /**
     * Check if file exists
     * @param {string} path - File path
     * @returns {boolean}
     */
    exists(path) {
        const normalizedPath = this.normalizePath(path);
        return this.files.has(normalizedPath);
    }

    /**
     * List directory contents
     * @param {string} path - Directory path
     * @returns {Array<string>} File and directory names
     */
    listDir(path = '/') {
        let normalizedPath = this.normalizePath(path);
        if (!normalizedPath.endsWith('/')) normalizedPath += '/';
        
        const contents = new Set();
        
        // Find files in this directory
        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(normalizedPath)) {
                const relativePath = filePath.substring(normalizedPath.length);
                const pathParts = relativePath.split('/').filter(p => p);
                if (pathParts.length > 0) {
                    contents.add(pathParts[0]);
                }
            }
        }

        // Find directories in this directory
        for (const dirPath of this.directories) {
            let dirPathStr = dirPath;
            if (!dirPathStr.startsWith('/')) dirPathStr = '/' + dirPathStr;
            
            // Check if directory is inside the requested path
            // We need to handle the case where dirPath equals normalizedPath (minus slash)
            if (dirPathStr.startsWith(normalizedPath) || (normalizedPath === '/' && dirPathStr.startsWith('/'))) {
                 // If normalizedPath is /, dirPathStr is /src. startsWith works.
                 // If normalizedPath is /src/, dirPathStr is /src/foo. startsWith works.
                 if (dirPathStr.startsWith(normalizedPath)) {
                    const relativePath = dirPathStr.substring(normalizedPath.length);
                    const pathParts = relativePath.split('/').filter(p => p);
                    if (pathParts.length > 0) {
                        contents.add(pathParts[0]);
                    }
                 }
            }
        }
        
        return [...contents].sort();
    }

    /**
     * Create directory
     * @param {string} path - Directory path
     */
    mkdir(path) {
        const normalizedPath = this.normalizePath(path);
        this.directories.add(normalizedPath);
        console.log(`📁 VFS: Created directory ${normalizedPath}`);
    }

    /**
     * Delete file from virtual filesystem
     * @param {string} path - File path
     */
    unlink(path) {
        const normalizedPath = this.normalizePath(path);
        if (!this.files.has(normalizedPath)) {
            throw this.createError('ENOENT', `File not found: ${normalizedPath}`);
        }
        this.files.delete(normalizedPath);
    }

    /**
     * Remove an empty directory
     * @param {string} path - Directory path
     */
    rmdir(path) {
        const normalizedPath = this.normalizePath(path);
        if (normalizedPath === '/') {
            throw this.createError('EBUSY', 'Cannot remove root directory');
        }
        if (!this.directories.has(normalizedPath)) {
            throw this.createError('ENOENT', `Directory not found: ${normalizedPath}`);
        }
        if (this.listDir(normalizedPath).length > 0) {
            throw this.createError('ENOTEMPTY', `Directory not empty: ${normalizedPath}`);
        }
        this.directories.delete(normalizedPath);
    }

    /**
     * Rename a file or directory
     * @param {string} from - Existing path
     * @param {string} to - New path
     */
    rename(from, to) {
        const sourcePath = this.normalizePath(from);
        const targetPath = this.normalizePath(to);

        if (this.files.has(sourcePath)) {
            const content = this.files.get(sourcePath);
            this.files.delete(sourcePath);
            this.writeFile(targetPath, content);
            return;
        }

        if (!this.directories.has(sourcePath)) {
            throw this.createError('ENOENT', `Path not found: ${sourcePath}`);
        }

        const updatedDirectories = new Set();
        for (const dirPath of this.directories) {
            if (dirPath === sourcePath || dirPath.startsWith(`${sourcePath}/`)) {
                updatedDirectories.add(dirPath.replace(sourcePath, targetPath));
            } else {
                updatedDirectories.add(dirPath);
            }
        }
        this.directories = updatedDirectories;

        const updatedFiles = new Map();
        for (const [filePath, content] of this.files.entries()) {
            if (filePath.startsWith(`${sourcePath}/`)) {
                updatedFiles.set(filePath.replace(sourcePath, targetPath), content);
            } else {
                updatedFiles.set(filePath, content);
            }
        }
        this.files = updatedFiles;
        this.ensureDirectoryExists(this.getDirectory(targetPath));
    }

    /**
     * Check if path is a directory
     * @param {string} path - Path to check
     * @returns {boolean}
     */
    isDirectory(path) {
        const normalizedPath = this.normalizePath(path);
        return this.directories.has(normalizedPath);
    }

    /**
     * Read directory contents (alias for listDir)
     * @param {string} path - Directory path
     * @returns {Array<string>} File and directory names
     */
    readDir(path) {
        return this.listDir(path);
    }

    /**
     * Load Go source files from fetched data
     * @param {Object} sourceFiles - Files from GitHub fetcher
     */
    loadGoSources(sourceFiles) {
        console.log('📦 VFS: Loading Go source files...');
        
        for (const [filePath, content] of Object.entries(sourceFiles)) {
            this.writeFile(filePath, content);
        }
        
        // Create standard Go directories
        this.mkdir(GoScriptPlatformConstants.vfs.sourceRootPath);
        this.mkdir(GoScriptPlatformConstants.vfs.packageRootPath);
        this.mkdir(GoScriptPlatformConstants.vfs.binaryRootPath);
        
        console.log(`✅ VFS: Loaded ${Object.keys(sourceFiles).length} source files`);
    }

    /**
     * Get all Go files
     * @returns {Array<string>} List of .go file paths
     */
    getGoFiles() {
        return Array.from(this.files.keys()).filter(path => path.endsWith('.go'));
    }

    /**
     * Get main package files
     * @returns {Array<string>} List of main package .go files
     */
    getMainPackageFiles() {
        const mainFiles = [];
        
        for (const filePath of this.getGoFiles()) {
            const content = this.readFile(filePath);
            if (content.includes('package main')) {
                mainFiles.push(filePath);
            }
        }
        
        return mainFiles;
    }

    /**
     * Get module information from go.mod
     * @returns {Object} Module info
     */
    getModuleInfo() {
        const [goModContent, readError] = captureSyncResult(
            () => this.readFile('/go.mod'),
            'Failed to read go.mod from the virtual filesystem'
        );

        if (readError) {
            return {
                name: GoScriptPlatformConstants.defaults.moduleName,
                goVersion: GoScriptPlatformConstants.defaults.goVersion,
                dependencies: []
            };
        }

        const moduleMatch = goModContent.match(/module\s+([^\s\n]+)/);
        const goVersionMatch = goModContent.match(/go\s+([0-9.]+)/);

        return {
            name: moduleMatch ? moduleMatch[1] : 'unknown',
            goVersion: goVersionMatch ? goVersionMatch[1] : GoScriptPlatformConstants.defaults.goVersion,
            dependencies: this.parseDependencies(goModContent)
        };
    }

    /**
     * Parse dependencies from go.mod content
     * @private
     */
    parseDependencies(goModContent) {
        const deps = [];
        const requireMatch = goModContent.match(/require\s*\(([\s\S]*?)\)/);
        
        if (requireMatch) {
            const requireBlock = requireMatch[1];
            const depMatches = requireBlock.matchAll(/([^\s]+)\s+([^\s\n]+)/g);
            
            for (const match of depMatches) {
                deps.push({ name: match[1], version: match[2] });
            }
        }
        
        return deps;
    }

    /**
     * Generate file tree for debugging
     * @returns {string} ASCII file tree
     */
    getFileTree() {
        const paths = Array.from(this.files.keys()).sort();
        let tree = 'Virtual Filesystem:\n';
        
        for (const path of paths) {
            const depth = (path.match(/\//g) || []).length - 1;
            const indent = '  '.repeat(depth);
            const fileName = path.split('/').pop();
            tree += `${indent}├── ${fileName}\n`;
        }
        
        return tree;
    }

    // Utility methods
    normalizePath(path) {
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        return path.replace(/\/+/g, '/');
    }

    getDirectory(filePath) {
        const parts = filePath.split('/');
        parts.pop(); // Remove filename
        return parts.join('/') || '/';
    }

    ensureDirectoryExists(dirPath) {
        if (dirPath !== '/') {
            this.directories.add(dirPath);
        }
    }

    createError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    /**
     * Clear all files and directories
     */
    clear() {
        this.files.clear();
        this.directories.clear();
        console.log('🗑️ VFS: Cleared all files');
    }

    /**
     * Get filesystem stats
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            totalFiles: this.files.size,
            totalDirectories: this.directories.size,
            goFiles: this.getGoFiles().length,
            totalSize: Array.from(this.files.values()).reduce((sum, content) => sum + this.getContentSize(content), 0)
        };
    }

    getContentSize(content) {
        if (typeof content === 'string') {
            return content.length;
        }

        return content?.byteLength ?? content?.length ?? 0;
    }
}

// Export for use in other modules
GoScriptGlobal.VirtualFileSystem = VirtualFileSystem; 




/**
 * Filesystem Polyfill for Go WASM
 * Bridges Node.js fs API to VirtualFileSystem
 */

class FSPolyfill {
    constructor(vfs) {
        this.vfs = vfs;
        this.fds = new Map();
        this.nextFd = 100;
    }

    /**
     * Convert a VFS payload into bytes for the compiler runtime.
     * @param {string|Uint8Array|ArrayBuffer} fileContent
     * @returns {Uint8Array}
     */
    toByteArray(fileContent) {
        if (fileContent instanceof Uint8Array) {
            return fileContent;
        }

        if (fileContent instanceof ArrayBuffer) {
            return new Uint8Array(fileContent);
        }

        return new TextEncoder().encode(fileContent);
    }

    /**
     * Resolve cwd-relative paths into normalized VFS paths.
     * @param {string} inputPath
     * @returns {string}
     */
    resolvePath(inputPath) {
        const workingDirectoryPath = this.vfs.workingDirectory.endsWith('/')
            ? this.vfs.workingDirectory
            : `${this.vfs.workingDirectory}/`;
        const candidatePath = inputPath.startsWith('/') ? inputPath : `${workingDirectoryPath}${inputPath}`;
        return this.vfs.normalizePath(candidatePath);
    }

    /**
     * Build a node-style fs error.
     * @param {string} errorCode
     * @param {string} [errorMessage]
     * @returns {Error}
     */
    createFsError(errorCode, errorMessage = errorCode) {
        const filesystemError = new Error(errorMessage);
        filesystemError.code = errorCode;
        return filesystemError;
    }

    /**
     * Complete a node-style callback from tuple-based logic.
     * @template T
     * @param {(error: Error|null, result?: T) => void} callback
     * @param {() => T} operationFunction
     * @returns {void}
     */
    completeCallback(callback, operationFunction) {
        const [operationResult, operationError] = captureSyncResult(operationFunction, 'Filesystem operation failed');
        if (operationError) {
            callback(operationError);
            return;
        }

        callback(null, operationResult);
    }

    patch() {
        const filesystemPolyfill = this;
        const outputDecoder = new TextDecoder();
        const emitConsoleOutput = (byteSlice) => {
            const consoleText = outputDecoder.decode(byteSlice);
            if (GoScriptGlobal.addConsoleOutput) {
                GoScriptGlobal.addConsoleOutput(consoleText.trimEnd());
                return;
            }

            console.log(consoleText);
        };
        const buildStatRecord = (isDirectoryRecord, entrySize = 0) => ({
            isDirectory: () => isDirectoryRecord,
            isFile: () => !isDirectoryRecord,
            size: entrySize,
            mode: isDirectoryRecord ? (0o777 | 0o40000) : 0o666,
            dev: 0,
            ino: 0,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: 0,
            blksize: 4096,
            blocks: 0,
            atimeMs: Date.now(),
            mtimeMs: Date.now(),
            ctimeMs: Date.now()
        });

        globalThis.fs = {
            constants: { O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_TRUNC: 512, O_APPEND: 1024, O_EXCL: 128, O_DIRECTORY: 65536 },
            
            writeSync(fileDescriptor, byteBuffer) {
                if (fileDescriptor === 1 || fileDescriptor === 2) {
                    emitConsoleOutput(byteBuffer);
                    return byteBuffer.length;
                }

                const fileRecord = filesystemPolyfill.fds.get(fileDescriptor);
                if (!fileRecord) {
                    throw filesystemPolyfill.createFsError('EBADF');
                }

                const mergedContent = new Uint8Array(fileRecord.content.length + byteBuffer.length);
                mergedContent.set(fileRecord.content);
                mergedContent.set(byteBuffer, fileRecord.content.length);
                fileRecord.content = mergedContent;

                // Keep the VFS in sync so compile/link output is visible immediately.
                filesystemPolyfill.vfs.writeFile(fileRecord.path, fileRecord.content);
                return byteBuffer.length;
            },

            write(fileDescriptor, byteBuffer, byteOffset, byteLength, writePosition, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    if (fileDescriptor === 1 || fileDescriptor === 2) {
                        emitConsoleOutput(byteBuffer.subarray(byteOffset, byteOffset + byteLength));
                        return byteLength;
                    }

                    const fileRecord = filesystemPolyfill.fds.get(fileDescriptor);
                    if (!fileRecord) {
                        throw filesystemPolyfill.createFsError('EBADF');
                    }

                    const writeChunk = byteBuffer.subarray(byteOffset, byteOffset + byteLength);
                    const targetOffset = writePosition !== null ? writePosition : fileRecord.position;

                    if (targetOffset + byteLength > fileRecord.content.length) {
                        const grownContent = new Uint8Array(targetOffset + byteLength);
                        grownContent.set(fileRecord.content);
                        fileRecord.content = grownContent;
                    }

                    fileRecord.content.set(writeChunk, targetOffset);
                    if (writePosition === null) {
                        fileRecord.position = targetOffset + byteLength;
                    }

                    filesystemPolyfill.vfs.writeFile(fileRecord.path, fileRecord.content);
                    return byteLength;
                });
            },

            open(inputPath, openFlags, _mode, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    const resolvedPath = filesystemPolyfill.resolvePath(inputPath);
                    let fileContent = new Uint8Array(0);

                    if (filesystemPolyfill.vfs.exists(resolvedPath)) {
                        const existingContent = filesystemPolyfill.vfs.readFile(resolvedPath);
                        fileContent = filesystemPolyfill.toByteArray(existingContent);
                    } else if (!(openFlags & globalThis.fs.constants.O_CREAT)) {
                        throw filesystemPolyfill.createFsError('ENOENT');
                    }

                    if (openFlags & globalThis.fs.constants.O_TRUNC) {
                        fileContent = new Uint8Array(0);
                    }

                    const allocatedFileDescriptor = filesystemPolyfill.nextFd++;
                    filesystemPolyfill.fds.set(allocatedFileDescriptor, {
                        path: resolvedPath,
                        flags: openFlags,
                        content: fileContent,
                        position: 0
                    });

                    return allocatedFileDescriptor;
                });
            },

            read(fileDescriptor, targetBuffer, targetOffset, requestedLength, readPosition, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    const fileRecord = filesystemPolyfill.fds.get(fileDescriptor);
                    if (!fileRecord) {
                        throw filesystemPolyfill.createFsError('EBADF');
                    }

                    const currentOffset = readPosition !== null ? readPosition : fileRecord.position;
                    if (currentOffset >= fileRecord.content.length) {
                        return 0;
                    }

                    const endOffset = Math.min(currentOffset + requestedLength, fileRecord.content.length);
                    const bytesReadCount = endOffset - currentOffset;
                    targetBuffer.set(fileRecord.content.subarray(currentOffset, endOffset), targetOffset);

                    if (readPosition === null) {
                        fileRecord.position += bytesReadCount;
                    }

                    return bytesReadCount;
                });
            },

            close(fileDescriptor, callback) {
                filesystemPolyfill.fds.delete(fileDescriptor);
                callback(null);
            },

            fstat(fileDescriptor, callback) {
                const fileRecord = filesystemPolyfill.fds.get(fileDescriptor);
                if (!fileRecord) {
                    callback(filesystemPolyfill.createFsError('EBADF'));
                    return;
                }

                callback(null, buildStatRecord(false, fileRecord.content.length));
            },

            stat(inputPath, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    const resolvedPath = filesystemPolyfill.resolvePath(inputPath);
                    if (filesystemPolyfill.vfs.exists(resolvedPath)) {
                        const storedContent = filesystemPolyfill.vfs.readFile(resolvedPath);
                        return buildStatRecord(false, filesystemPolyfill.vfs.getContentSize(storedContent));
                    }

                    if (filesystemPolyfill.vfs.directories.has(resolvedPath) || resolvedPath === '/') {
                        return buildStatRecord(true, 0);
                    }

                    throw filesystemPolyfill.createFsError('ENOENT');
                });
            },

            lstat(inputPath, callback) {
                this.stat(inputPath, callback);
            },

            mkdir(inputPath, _permissions, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    filesystemPolyfill.vfs.mkdir(inputPath);
                });
            },

            readdir(inputPath, callback) {
                filesystemPolyfill.completeCallback(callback, () => filesystemPolyfill.vfs.listDir(inputPath));
            },
            
            unlink(inputPath, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    filesystemPolyfill.vfs.unlink(inputPath);
                });
            },
            
            rename(sourcePath, targetPath, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    filesystemPolyfill.vfs.rename(sourcePath, targetPath);
                });
            },
            
            rmdir(inputPath, callback) {
                filesystemPolyfill.completeCallback(callback, () => {
                    filesystemPolyfill.vfs.rmdir(inputPath);
                });
            }
        };

        // Patch process
        if (!globalThis.process) globalThis.process = {};
        globalThis.process.cwd = () => filesystemPolyfill.vfs.workingDirectory;
        globalThis.process.chdir = (inputPath) => {
            const normalizedPath = filesystemPolyfill.vfs.normalizePath(inputPath);
            if (normalizedPath !== '/' && !filesystemPolyfill.vfs.isDirectory(normalizedPath)) {
                const err = new Error(`ENOENT: no such directory, chdir '${inputPath}'`);
                err.code = 'ENOENT';
                throw err;
            }
            filesystemPolyfill.vfs.workingDirectory = normalizedPath;
        };
    }
}

GoScriptGlobal.FSPolyfill = FSPolyfill;




/**
 * Personal Website 2025 - Cache Manager
 * Handles caching of source files and compiled WASM using IndexedDB
 */

class CacheManager {
    constructor() {
        this.dbName = GoScriptPlatformConstants.cache.sourceDatabaseName;
        this.dbVersion = GoScriptPlatformConstants.cache.sourceDatabaseVersion;
        this.db = null;
        this.ready = false;
    }

    /**
     * Initialize the cache database
     * @returns {Promise<void>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            console.log('🗄️ CacheManager: Initializing IndexedDB cache...');
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('❌ CacheManager: Failed to open IndexedDB');
                reject(new Error('Failed to initialize cache database'));
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                console.log('✅ CacheManager: Cache database ready');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains(GoScriptPlatformConstants.cache.sourceFilesStore)) {
                    const sourceStore = db.createObjectStore(GoScriptPlatformConstants.cache.sourceFilesStore, { keyPath: 'key' });
                    sourceStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains(GoScriptPlatformConstants.cache.compiledWasmStore)) {
                    const wasmStore = db.createObjectStore(GoScriptPlatformConstants.cache.compiledWasmStore, { keyPath: 'key' });
                    wasmStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains(GoScriptPlatformConstants.cache.metadataStore)) {
                    db.createObjectStore(GoScriptPlatformConstants.cache.metadataStore, { keyPath: 'key' });
                }
                
                console.log('📊 CacheManager: Created object stores');
            };
        });
    }

    /**
     * Cache source files with commit hash
     * @param {string} commitHash - Git commit hash for cache busting
     * @param {Object} sourceFiles - Source files to cache
     * @returns {Promise<void>}
     */
    async cacheSourceFiles(commitHash, sourceFiles) {
        if (!this.ready) await this.init();
        
        console.log(`💾 CacheManager: Caching source files for commit ${commitHash}`);
        
        const transaction = this.db.transaction([GoScriptPlatformConstants.cache.sourceFilesStore], 'readwrite');
        const store = transaction.objectStore(GoScriptPlatformConstants.cache.sourceFilesStore);
        
        const cacheEntry = {
            key: `sources_${commitHash}`,
            commitHash: commitHash,
            files: sourceFiles,
            timestamp: Date.now(),
            size: JSON.stringify(sourceFiles).length
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(cacheEntry);
            
            request.onsuccess = () => {
                console.log(`✅ CacheManager: Cached ${Object.keys(sourceFiles).length} source files`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('❌ CacheManager: Failed to cache source files');
                reject(new Error('Failed to cache source files'));
            };
        });
    }

    /**
     * Get cached source files by commit hash
     * @param {string} commitHash - Git commit hash
     * @returns {Promise<Object|null>} Cached source files or null
     */
    async getCachedSourceFiles(commitHash) {
        if (!this.ready) await this.init();
        
        const transaction = this.db.transaction([GoScriptPlatformConstants.cache.sourceFilesStore], 'readonly');
        const store = transaction.objectStore(GoScriptPlatformConstants.cache.sourceFilesStore);
        
        return new Promise((resolve, reject) => {
            const request = store.get(`sources_${commitHash}`);
            
            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log(`🎯 CacheManager: Found cached sources for commit ${commitHash}`);
                    resolve(result.files);
                } else {
                    console.log(`🔍 CacheManager: No cached sources for commit ${commitHash}`);
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('❌ CacheManager: Failed to retrieve cached sources');
                reject(new Error('Failed to retrieve cached sources'));
            };
        });
    }

    /**
     * Cache compiled WASM binary
     * @param {string} sourceHash - Hash of source files
     * @param {ArrayBuffer} wasmBinary - Compiled WASM binary
     * @param {Object} metadata - Compilation metadata
     * @returns {Promise<void>}
     */
    async cacheCompiledWasm(sourceHash, wasmBinary, metadata = {}) {
        if (!this.ready) await this.init();
        
        console.log(`💾 CacheManager: Caching WASM binary (${wasmBinary.byteLength} bytes)`);
        
        const transaction = this.db.transaction([GoScriptPlatformConstants.cache.compiledWasmStore], 'readwrite');
        const store = transaction.objectStore(GoScriptPlatformConstants.cache.compiledWasmStore);
        
        const cacheEntry = {
            key: `wasm_${sourceHash}`,
            sourceHash: sourceHash,
            wasmBinary: wasmBinary,
            metadata: metadata,
            timestamp: Date.now(),
            size: wasmBinary.byteLength
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(cacheEntry);
            
            request.onsuccess = () => {
                console.log(`✅ CacheManager: Cached WASM binary`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('❌ CacheManager: Failed to cache WASM binary');
                reject(new Error('Failed to cache WASM binary'));
            };
        });
    }

    /**
     * Get cached WASM binary
     * @param {string} sourceHash - Hash of source files
     * @returns {Promise<Object|null>} Cached WASM data or null
     */
    async getCachedWasm(sourceHash) {
        if (!this.ready) await this.init();
        
        const transaction = this.db.transaction([GoScriptPlatformConstants.cache.compiledWasmStore], 'readonly');
        const store = transaction.objectStore(GoScriptPlatformConstants.cache.compiledWasmStore);
        
        return new Promise((resolve, reject) => {
            const request = store.get(`wasm_${sourceHash}`);
            
            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log(`🎯 CacheManager: Found cached WASM for hash ${sourceHash}`);
                    resolve({
                        wasmBinary: result.wasmBinary,
                        metadata: result.metadata,
                        timestamp: result.timestamp
                    });
                } else {
                    console.log(`🔍 CacheManager: No cached WASM for hash ${sourceHash}`);
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('❌ CacheManager: Failed to retrieve cached WASM');
                reject(new Error('Failed to retrieve cached WASM'));
            };
        });
    }

    /**
     * Generate hash for source files (simple implementation)
     * @param {Object} sourceFiles - Source files to hash
     * @returns {string} Hash string
     */
    generateSourceHash(sourceFiles) {
        const content = JSON.stringify(sourceFiles, Object.keys(sourceFiles).sort());
        return this.simpleHash(content);
    }

    /**
     * Simple hash function for source content
     * @private
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Clear old cache entries
     * @param {number} maxAge - Maximum age in milliseconds
     * @returns {Promise<void>}
     */
    async clearOldEntries(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
        if (!this.ready) await this.init();
        
        console.log('🧹 CacheManager: Clearing old cache entries...');
        
        const cutoffTime = Date.now() - maxAge;
        const stores = [GoScriptPlatformConstants.cache.sourceFilesStore, GoScriptPlatformConstants.cache.compiledWasmStore];
        
        await Promise.all(stores.map((storeName) => new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const index = store.index('timestamp');
            const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                    return;
                }
                resolve();
            };

            request.onerror = () => reject(request.error || new Error(`Failed to clear ${storeName}`));
            transaction.onerror = () => reject(transaction.error || new Error(`Failed to clear ${storeName}`));
        })));
        
        console.log('✅ CacheManager: Old entries cleared');
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache stats
     */
    async getStats() {
        if (!this.ready) await this.init();
        
        const countStore = (storeName) => new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const items = [];
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    items.push(cursor.value);
                    cursor.continue();
                    return;
                }
                resolve(items);
            };

            request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}`));
            transaction.onerror = () => reject(transaction.error || new Error(`Failed to read ${storeName}`));
        });

        const [sourceFiles, compiledWasm] = await Promise.all([
            countStore(GoScriptPlatformConstants.cache.sourceFilesStore),
            countStore(GoScriptPlatformConstants.cache.compiledWasmStore)
        ]);

        return {
            sourceFiles: sourceFiles.length,
            compiledWasm: compiledWasm.length,
            totalSize: sourceFiles.reduce((sum, entry) => sum + (entry.size || 0), 0) +
                compiledWasm.reduce((sum, entry) => sum + (entry.size || 0), 0)
        };
    }

    /**
     * Clear only compiled WASM cache entries
     * @returns {Promise<void>}
     */
    async clearCompiledWasm() {
        if (!this.ready) await this.init();

        console.log('🧹 CacheManager: Clearing compiled WASM cache...');

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([GoScriptPlatformConstants.cache.compiledWasmStore], 'readwrite');
            const request = transaction.objectStore(GoScriptPlatformConstants.cache.compiledWasmStore).clear();

            request.onsuccess = () => {
                console.log('✅ CacheManager: Compiled WASM cache cleared');
                resolve();
            };

            request.onerror = () => {
                console.error('❌ CacheManager: Failed to clear compiled WASM cache');
                reject(request.error || new Error('Failed to clear compiled WASM cache'));
            };

            transaction.onerror = () => reject(transaction.error || new Error('Failed to clear compiled WASM cache'));
        });
    }

    /**
     * Clear one compiled WASM cache entry by source hash
     * @param {string} sourceHash
     * @returns {Promise<boolean>}
     */
    async clearCompiledWasmEntry(sourceHash) {
        if (!this.ready) await this.init();

        const cacheKey = `wasm_${sourceHash}`;
        console.log(`🧹 CacheManager: Clearing compiled WASM cache entry ${cacheKey}...`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([GoScriptPlatformConstants.cache.compiledWasmStore], 'readwrite');
            const store = transaction.objectStore(GoScriptPlatformConstants.cache.compiledWasmStore);
            const getRequest = store.get(cacheKey);

            getRequest.onerror = () => reject(getRequest.error || new Error('Failed to inspect compiled WASM cache entry'));
            getRequest.onsuccess = () => {
                if (!getRequest.result) {
                    console.log(`🔍 CacheManager: No compiled WASM cache entry for ${cacheKey}`);
                    resolve(false);
                    return;
                }

                const deleteRequest = store.delete(cacheKey);
                deleteRequest.onerror = () => {
                    console.error(`❌ CacheManager: Failed to clear compiled WASM cache entry ${cacheKey}`);
                    reject(deleteRequest.error || new Error('Failed to clear compiled WASM cache entry'));
                };
                deleteRequest.onsuccess = () => {
                    console.log(`✅ CacheManager: Cleared compiled WASM cache entry ${cacheKey}`);
                    resolve(true);
                };
            };

            transaction.onerror = () => reject(transaction.error || new Error('Failed to clear compiled WASM cache entry'));
        });
    }

    /**
     * Clear all cache data
     * @returns {Promise<void>}
     */
    async clearAll() {
        if (!this.ready) await this.init();
        
        console.log('🗑️ CacheManager: Clearing all cache data...');
        
        const transaction = this.db.transaction([GoScriptPlatformConstants.cache.sourceFilesStore, GoScriptPlatformConstants.cache.compiledWasmStore, GoScriptPlatformConstants.cache.metadataStore], 'readwrite');
        
        const promises = [
            new Promise(resolve => {
                const request = transaction.objectStore(GoScriptPlatformConstants.cache.sourceFilesStore).clear();
                request.onsuccess = () => resolve();
            }),
            new Promise(resolve => {
                const request = transaction.objectStore(GoScriptPlatformConstants.cache.compiledWasmStore).clear();
                request.onsuccess = () => resolve();
            }),
            new Promise(resolve => {
                const request = transaction.objectStore(GoScriptPlatformConstants.cache.metadataStore).clear();
                request.onsuccess = () => resolve();
            })
        ];
        
        await Promise.all(promises);
        console.log('✅ CacheManager: All cache data cleared');
    }
}

// Export for use in other modules
GoScriptGlobal.CacheManager = CacheManager; 




/**
 * GoScript - Toolchain Pack Loader
 * Loads the complete GoScript toolchain from a single packed file
 * Includes: compile.wasm, link.wasm, package index, and all stdlib packages
 */

class ToolchainLoader {
    constructor() {
        this.packData = null;
        this.compilerWasm = null;
        this.linkerWasm = null;
        this.packageIndex = new Map();  // package name -> { offset, size }
        this.packageNames = [];
        this.loaded = false;
        
        // Offsets for package data section
        this.packageDataStart = 0;
        
        // Cache configuration
        this.dbName = GoScriptPlatformConstants.cache.toolchainDatabaseName;
        this.storeName = GoScriptPlatformConstants.cache.toolchainStore;
        this.cacheVersion = GoScriptPlatformConstants.cache.toolchainDatabaseVersion;
    }

    /**
     * Open IndexedDB connection
     * @private
     * @returns {Promise<IDBDatabase>}
     */
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.cacheVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    /**
     * Get cached pack data from IndexedDB
     * @private
     * @param {string} url - URL used as cache key
     * @returns {Promise<ArrayBuffer|null>}
     */
    async getCached(url) {
        const [databaseHandle, openError] = await captureAsyncResult(
            () => this.openDB(),
            'Failed to open the toolchain cache'
        );

        if (openError) {
            console.warn('📦 ToolchainLoader: IndexedDB not available, skipping cache');
            return null;
        }

        return new Promise((resolve, reject) => {
            const readTransaction = databaseHandle.transaction(this.storeName, 'readonly');
            const toolchainStore = readTransaction.objectStore(this.storeName);
            const getRequest = toolchainStore.get(url);
            
            getRequest.onerror = () => {
                databaseHandle.close();
                reject(getRequest.error);
            };
            getRequest.onsuccess = () => {
                databaseHandle.close();
                resolve(getRequest.result || null);
            };
        });
    }

    /**
     * Store pack data in IndexedDB
     * @private
     * @param {string} url - URL used as cache key
     * @param {ArrayBuffer} data - Pack data to cache
     * @returns {Promise<void>}
     */
    async setCache(url, data) {
        const [databaseHandle, openError] = await captureAsyncResult(
            () => this.openDB(),
            'Failed to open the toolchain cache for writing'
        );

        if (openError) {
            console.warn('📦 ToolchainLoader: Failed to cache pack:', openError.message);
            return;
        }

        return new Promise((resolve, reject) => {
            const writeTransaction = databaseHandle.transaction(this.storeName, 'readwrite');
            const toolchainStore = writeTransaction.objectStore(this.storeName);
            const putRequest = toolchainStore.put(data, url);
            
            putRequest.onerror = () => {
                databaseHandle.close();
                reject(putRequest.error);
            };
            putRequest.onsuccess = () => {
                databaseHandle.close();
                resolve();
            };
        });
    }

    /**
     * Delete one cached pack entry
     * @private
     * @param {string} url - URL used as cache key
     * @returns {Promise<void>}
     */
    async deleteCache(url) {
        const [databaseHandle, openError] = await captureAsyncResult(
            () => this.openDB(),
            'Failed to open the toolchain cache for deletion'
        );

        if (openError) {
            console.warn('📦 ToolchainLoader: Failed to delete cached pack:', openError.message);
            return;
        }

        return new Promise((resolve, reject) => {
            const writeTransaction = databaseHandle.transaction(this.storeName, 'readwrite');
            const toolchainStore = writeTransaction.objectStore(this.storeName);
            const deleteRequest = toolchainStore.delete(url);

            deleteRequest.onerror = () => {
                databaseHandle.close();
                reject(deleteRequest.error);
            };
            deleteRequest.onsuccess = () => {
                databaseHandle.close();
                resolve();
            };
        });
    }

    /**
     * Load the complete toolchain pack
     * @param {string} url - URL to goscript.pack file
     * @returns {Promise<void>}
     */
    async load(url = GoScriptPlatformConstants.toolchain.defaultPackUrl) {
        // Try to load from IndexedDB cache first
        console.log('📦 ToolchainLoader: Checking cache for GoScript toolchain...');
        const cachedPackData = await this.getCached(url);
        
        if (!cachedPackData) {
            await this.downloadAndParse(url);
            return;
        }

        console.log(`✅ ToolchainLoader: Loaded from cache (${(cachedPackData.byteLength / 1024 / 1024).toFixed(2)} MB)`);
        const [cachedParseResult, cachedParseError] = await captureAsyncResult(
            () => this.parseAndStorePack(cachedPackData),
            `Failed to parse cached goscript.pack from ${url}`
        );

        if (!cachedParseError) {
            this.loaded = true;
            this.logReadyState();
            return cachedParseResult;
        }

        console.warn(`⚠️ ToolchainLoader: Cached goscript.pack is invalid, deleting cache entry for ${url}`);
        await this.deleteCache(url);
        this.resetState();

        const [, downloadError] = await captureAsyncResult(
            () => this.downloadAndParse(url),
            `Failed to refresh goscript.pack from ${url}`
        );
        if (downloadError) {
            throw this.buildCachedPackRecoveryError(url, cachedParseError, downloadError);
        }
    }

    /**
     * Download, validate, and cache the pack
     * @private
     * @param {string} url
     * @returns {Promise<void>}
     */
    async downloadAndParse(url) {
        console.log('📦 ToolchainLoader: Downloading GoScript toolchain (single file)...');

        const [response, fetchError] = await promiseToResult(fetch(url), `Failed to fetch goscript.pack from ${url}`);
        if (fetchError) {
            throw this.buildFetchError(url, fetchError);
        }

        if (!response.ok) {
            throw this.buildHttpError(url, response.status, response.statusText);
        }

        const [packData, packReadError] = await promiseToResult(
            response.arrayBuffer(),
            `Failed to read goscript.pack from ${url}`
        );
        if (packReadError) {
            throw new Error(`Failed to read goscript.pack from ${url}. The download did not complete successfully. ${packReadError.message}`);
        }

        console.log(`📦 ToolchainLoader: Downloaded ${(packData.byteLength / 1024 / 1024).toFixed(2)} MB`);

        const [, parseError] = await captureAsyncResult(
            () => this.parseAndStorePack(packData),
            `Failed to parse goscript.pack from ${url}`
        );
        if (parseError) {
            this.resetState();
            throw this.buildInvalidPackError(url, packData, parseError, false);
        }

        // Cache only after validation succeeds.
        console.log('💾 ToolchainLoader: Caching toolchain for future use...');
        await this.setCache(url, packData);
        console.log('✅ ToolchainLoader: Toolchain cached successfully');

        this.loaded = true;
        this.logReadyState();
    }

    /**
     * Import a local pack file into memory and long-term cache
     * @param {string} cacheKey - Cache key to store the imported pack under
     * @param {ArrayBuffer} packData - Raw goscript.pack bytes
     * @returns {Promise<void>}
     */
    async importPack(cacheKey, packData) {
        if (!(packData instanceof ArrayBuffer)) {
            throw new Error('Local goscript.pack import requires an ArrayBuffer.');
        }

        const [, parseError] = await captureAsyncResult(
            () => this.parseAndStorePack(packData),
            `Failed to parse imported goscript.pack from ${cacheKey}`
        );
        if (parseError) {
            this.resetState();
            throw this.buildInvalidPackError(cacheKey, packData, parseError, false);
        }

        console.log(`📦 ToolchainLoader: Imported local goscript.pack (${(packData.byteLength / 1024 / 1024).toFixed(2)} MB)`);
        console.log('💾 ToolchainLoader: Caching imported toolchain for future use...');
        await this.setCache(cacheKey, packData);
        console.log('✅ ToolchainLoader: Imported toolchain cached successfully');

        this.loaded = true;
        this.logReadyState();
    }

    /**
     * Clear the toolchain cache
     * @returns {Promise<void>}
     */
    async clearCache() {
        const [databaseHandle, openError] = await captureAsyncResult(
            () => this.openDB(),
            'Failed to open the toolchain cache for clearing'
        );

        if (openError) {
            console.warn('📦 ToolchainLoader: Failed to clear cache:', openError.message);
            return;
        }

        return new Promise((resolve, reject) => {
            const clearTransaction = databaseHandle.transaction(this.storeName, 'readwrite');
            const toolchainStore = clearTransaction.objectStore(this.storeName);
            const clearRequest = toolchainStore.clear();
            
            clearRequest.onerror = () => {
                databaseHandle.close();
                reject(clearRequest.error);
            };
            clearRequest.onsuccess = () => {
                databaseHandle.close();
                console.log('🗑️ ToolchainLoader: Cache cleared');
                resolve();
            };
        });
    }

    /**
     * Reset parsed pack state before retrying
     * @private
     */
    resetState() {
        this.packData = null;
        this.compilerWasm = null;
        this.linkerWasm = null;
        this.packageIndex = new Map();
        this.packageNames = [];
        this.loaded = false;
        this.packageDataStart = 0;
    }

    /**
     * Parse pack bytes into the active loader state.
     * @private
     * @param {ArrayBuffer} packData
     */
    parseAndStorePack(packData) {
        this.packData = packData;
        this.parseToolchain();
    }

    /**
     * Log the current ready state once parse/load has succeeded.
     * @private
     */
    logReadyState() {
        console.log(
            `✅ ToolchainLoader: Ready (compiler: ${(this.compilerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, ` +
            `linker: ${(this.linkerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, ${this.packageIndex.size} packages)`
        );
    }

    /**
     * Build an error for network-level fetch failures
     * @private
     */
    buildFetchError(url, error) {
        return new Error(
            `Unable to download goscript.pack from ${url}. ` +
            'The compiler pack may be missing from the server, blocked by the browser, or the network request failed. ' +
            `Original error: ${error.message}`
        );
    }

    /**
     * Build an error for HTTP failures
     * @private
     */
    buildHttpError(url, status, statusText) {
        return new Error(
            `Unable to download goscript.pack from ${url}. ` +
            `The server returned HTTP ${status}${statusText ? ` ${statusText}` : ''}. ` +
            'This usually means the compiler pack file is not deployed at that path.'
        );
    }

    /**
     * Build an error for cached pack recovery failures
     * @private
     */
    buildCachedPackRecoveryError(url, cacheError, downloadError) {
        return new Error(
            `The cached goscript.pack for ${url} is invalid and a fresh copy could not be downloaded. ` +
            'The browser likely cached an HTML error page or a partial file instead of the compiler pack. ' +
            `Cached error: ${cacheError.message}. Download error: ${downloadError.message}`
        );
    }

    /**
     * Build a clearer invalid-pack error
     * @private
     */
    buildInvalidPackError(url, packData, error, fromCache) {
        const source = fromCache ? 'cached' : 'downloaded';
        const details = [];
        const sizeBytes = packData?.byteLength || 0;
        const preview = this.getPackPreview(packData);

        if (this.looksLikeHtml(packData)) {
            details.push('Received HTML instead of the binary compiler pack');
        } else if (sizeBytes > 0 && sizeBytes < 1024 * 1024) {
            details.push(`File is unexpectedly small (${sizeBytes} bytes)`);
        }

        if (preview) {
            details.push(`Starts with: ${preview}`);
        }

        const detailText = details.length > 0 ? ` ${details.join('. ')}.` : '';
        const remediation = fromCache
            ? 'Clear the site data for this origin and reload.'
            : 'Verify that the deployed site includes a valid goscript.pack at that path.';

        return new Error(
            `The ${source} goscript.pack at ${url} is not a valid GoScript compiler pack. ` +
            `${remediation}${detailText} Parser error: ${error.message}`
        );
    }

    /**
     * Detect common HTML/error payloads
     * @private
     */
    looksLikeHtml(packData) {
        const preview = this.getPackPreview(packData).toLowerCase();
        return preview.startsWith('<!doctype') ||
            preview.startsWith('<html') ||
            preview.includes('<head') ||
            preview.includes('not found');
    }

    /**
     * Return a short printable preview of a pack payload
     * @private
     */
    getPackPreview(packData) {
        if (!packData || packData.byteLength === 0) {
            return '';
        }

        const previewBytes = new Uint8Array(packData, 0, Math.min(80, packData.byteLength));
        return new TextDecoder().decode(previewBytes).replace(/\s+/g, ' ').trim().slice(0, 60);
    }

    /**
     * Parse the toolchain pack file
     * @private
     */
    parseToolchain() {
        const view = new DataView(this.packData);
        let offset = 0;
        
        // Read magic header (8 bytes: "GOSCRIPT")
        const magic = new TextDecoder().decode(new Uint8Array(this.packData, 0, 8));
        if (magic !== 'GOSCRIPT') {
            throw new Error('Invalid goscript.pack format: bad magic');
        }
        offset += 8;
        
        // Read version (uint32)
        const version = view.getUint32(offset, true);
        if (version !== 2) {
            throw new Error(`Unsupported pack version: ${version}`);
        }
        offset += 4;
        
        // === Section 1: Compiler WASM ===
        const compilerSize = view.getUint32(offset, true);
        offset += 4;
        this.compilerWasm = this.packData.slice(offset, offset + compilerSize);
        offset += compilerSize;
        console.log(`📦 ToolchainLoader: Compiler extracted (${(compilerSize / 1024 / 1024).toFixed(2)} MB)`);
        
        // === Section 2: Linker WASM ===
        const linkerSize = view.getUint32(offset, true);
        offset += 4;
        this.linkerWasm = this.packData.slice(offset, offset + linkerSize);
        offset += linkerSize;
        console.log(`📦 ToolchainLoader: Linker extracted (${(linkerSize / 1024 / 1024).toFixed(2)} MB)`);
        
        // === Section 3: Package Index (JSON) ===
        const indexSize = view.getUint32(offset, true);
        offset += 4;
        const indexBytes = new Uint8Array(this.packData, offset, indexSize);
        const indexJson = new TextDecoder().decode(indexBytes);
        this.packageNames = JSON.parse(indexJson);
        offset += indexSize;
        console.log(`📦 ToolchainLoader: Package index loaded (${this.packageNames.length} packages)`);
        
        // === Section 4: Stdlib Packages ===
        const packageCount = view.getUint32(offset, true);
        offset += 4;
        
        // Read index offset
        const indexOffset = Number(view.getBigUint64(offset, true));
        offset += 8;
        
        // Remember where package data starts
        this.packageDataStart = offset;
        
        // Parse package index (at end of file)
        let indexPos = indexOffset;
        for (let i = 0; i < packageCount; i++) {
            // Read name length and name
            const nameLen = view.getUint16(indexPos, true);
            indexPos += 2;
            
            const nameBytes = new Uint8Array(this.packData, indexPos, nameLen);
            const name = new TextDecoder().decode(nameBytes);
            indexPos += nameLen;
            
            // Read offset and size
            const pkgOffset = Number(view.getBigUint64(indexPos, true));
            indexPos += 8;
            const pkgSize = view.getUint32(indexPos, true);
            indexPos += 4;
            
            this.packageIndex.set(name, {
                offset: this.packageDataStart + pkgOffset,
                size: pkgSize
            });
        }
    }

    /**
     * Get the compiler WASM binary
     * @returns {ArrayBuffer}
     */
    getCompilerWasm() {
        return this.compilerWasm;
    }

    /**
     * Get the linker WASM binary
     * @returns {ArrayBuffer}
     */
    getLinkerWasm() {
        return this.linkerWasm;
    }

    /**
     * Get a package's archive data
     * @param {string} packageName - Package name (e.g., "fmt", "crypto/sha256")
     * @returns {Uint8Array|null} Package archive data
     */
    getPackage(packageName) {
        const entry = this.packageIndex.get(packageName);
        if (!entry) {
            return null;
        }
        return new Uint8Array(this.packData, entry.offset, entry.size);
    }

    /**
     * Check if a package exists
     * @param {string} packageName - Package name
     * @returns {boolean}
     */
    hasPackage(packageName) {
        return this.packageIndex.has(packageName);
    }

    /**
     * Get list of all package names
     * @returns {string[]}
     */
    getPackageNames() {
        return this.packageNames;
    }

    /**
     * Load all packages into a VFS
     * @param {VirtualFileSystem} vfs - Virtual filesystem to load into
     */
    loadAllPackagesIntoVFS(vfs) {
        console.log('📂 ToolchainLoader: Extracting packages to virtual filesystem...');
        
        let loaded = 0;
        let totalBytes = 0;
        for (const [name, entry] of this.packageIndex) {
            const data = new Uint8Array(this.packData, entry.offset, entry.size);
            vfs.writeFile(`${GoScriptPlatformConstants.vfs.jsWasmPackagePath}/${name}.a`, data);
            loaded++;
            totalBytes += entry.size;
        }
        
        console.log(`✅ ToolchainLoader: Extracted ${loaded} packages (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to ${GoScriptPlatformConstants.vfs.jsWasmPackagePath}/`);
    }

    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
        let totalPackageSize = 0;
        for (const entry of this.packageIndex.values()) {
            totalPackageSize += entry.size;
        }
        
        return {
            packSize: this.packData?.byteLength || 0,
            compilerSize: this.compilerWasm?.byteLength || 0,
            linkerSize: this.linkerWasm?.byteLength || 0,
            packageCount: this.packageIndex.size,
            totalPackageSize: totalPackageSize
        };
    }
}

// Export for use in other modules
GoScriptGlobal.ToolchainLoader = ToolchainLoader;



