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
        this.dbName = 'GoScriptCache';
        this.storeName = 'toolchain';
        this.cacheVersion = 1;
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
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(url);
                
                request.onerror = () => {
                    db.close();
                    reject(request.error);
                };
                request.onsuccess = () => {
                    db.close();
                    resolve(request.result || null);
                };
            });
        } catch (e) {
            console.warn('📦 ToolchainLoader: IndexedDB not available, skipping cache');
            return null;
        }
    }

    /**
     * Store pack data in IndexedDB
     * @private
     * @param {string} url - URL used as cache key
     * @param {ArrayBuffer} data - Pack data to cache
     * @returns {Promise<void>}
     */
    async setCache(url, data) {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.put(data, url);
                
                request.onerror = () => {
                    db.close();
                    reject(request.error);
                };
                request.onsuccess = () => {
                    db.close();
                    resolve();
                };
            });
        } catch (e) {
            console.warn('📦 ToolchainLoader: Failed to cache pack:', e.message);
        }
    }

    /**
     * Delete one cached pack entry
     * @private
     * @param {string} url - URL used as cache key
     * @returns {Promise<void>}
     */
    async deleteCache(url) {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.delete(url);

                request.onerror = () => {
                    db.close();
                    reject(request.error);
                };
                request.onsuccess = () => {
                    db.close();
                    resolve();
                };
            });
        } catch (e) {
            console.warn('📦 ToolchainLoader: Failed to delete cached pack:', e.message);
        }
    }

    /**
     * Load the complete toolchain pack
     * @param {string} url - URL to goscript.pack file
     * @returns {Promise<void>}
     */
    async load(url = 'assets/goscript.pack') {
        // Try to load from IndexedDB cache first
        console.log('📦 ToolchainLoader: Checking cache for GoScript toolchain...');
        const cached = await this.getCached(url);
        
        if (cached) {
            console.log(`✅ ToolchainLoader: Loaded from cache (${(cached.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            try {
                this.packData = cached;
                this.parseToolchain();
                this.loaded = true;
                console.log(`✅ ToolchainLoader: Ready (compiler: ${(this.compilerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, linker: ${(this.linkerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, ${this.packageIndex.size} packages)`);
                return;
            } catch (error) {
                console.warn(`⚠️ ToolchainLoader: Cached goscript.pack is invalid, deleting cache entry for ${url}`);
                await this.deleteCache(url);
                this.resetState();

                try {
                    await this.downloadAndParse(url);
                    return;
                } catch (downloadError) {
                    throw this.buildCachedPackRecoveryError(url, error, downloadError);
                }
            }
        } else {
            await this.downloadAndParse(url);
            return;
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

        let response;
        try {
            response = await fetch(url);
        } catch (error) {
            throw this.buildFetchError(url, error);
        }

        if (!response.ok) {
            throw this.buildHttpError(url, response.status, response.statusText);
        }

        let packData;
        try {
            packData = await response.arrayBuffer();
        } catch (error) {
            throw new Error(`Failed to read goscript.pack from ${url}. The download did not complete successfully. ${error.message}`);
        }

        console.log(`📦 ToolchainLoader: Downloaded ${(packData.byteLength / 1024 / 1024).toFixed(2)} MB`);

        try {
            this.packData = packData;
            this.parseToolchain();
        } catch (error) {
            this.resetState();
            throw this.buildInvalidPackError(url, packData, error, false);
        }

        // Cache only after validation succeeds.
        console.log('💾 ToolchainLoader: Caching toolchain for future use...');
        await this.setCache(url, packData);
        console.log('✅ ToolchainLoader: Toolchain cached successfully');

        this.loaded = true;
        console.log(`✅ ToolchainLoader: Ready (compiler: ${(this.compilerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, linker: ${(this.linkerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, ${this.packageIndex.size} packages)`);
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

        try {
            this.packData = packData;
            this.parseToolchain();
        } catch (error) {
            this.resetState();
            throw this.buildInvalidPackError(cacheKey, packData, error, false);
        }

        console.log(`📦 ToolchainLoader: Imported local goscript.pack (${(packData.byteLength / 1024 / 1024).toFixed(2)} MB)`);
        console.log('💾 ToolchainLoader: Caching imported toolchain for future use...');
        await this.setCache(cacheKey, packData);
        console.log('✅ ToolchainLoader: Imported toolchain cached successfully');

        this.loaded = true;
        console.log(`✅ ToolchainLoader: Ready (compiler: ${(this.compilerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, linker: ${(this.linkerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, ${this.packageIndex.size} packages)`);
    }

    /**
     * Clear the toolchain cache
     * @returns {Promise<void>}
     */
    async clearCache() {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.clear();
                
                request.onerror = () => {
                    db.close();
                    reject(request.error);
                };
                request.onsuccess = () => {
                    db.close();
                    console.log('🗑️ ToolchainLoader: Cache cleared');
                    resolve();
                };
            });
        } catch (e) {
            console.warn('📦 ToolchainLoader: Failed to clear cache:', e.message);
        }
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
            vfs.writeFile(`/pkg/js_wasm/${name}.a`, data);
            loaded++;
            totalBytes += entry.size;
        }
        
        console.log(`✅ ToolchainLoader: Extracted ${loaded} packages (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to /pkg/js_wasm/`);
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
window.ToolchainLoader = ToolchainLoader;
