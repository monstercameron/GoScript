/**
 * GoScript - Standard Library Pack Loader
 * Loads packed stdlib.pack file and extracts packages on demand
 */

class StdLibLoader {
    constructor() {
        this.packData = null;
        this.index = new Map();  // package name -> { offset, size }
        this.loaded = false;
    }

    /**
     * Load the packed standard library
     * @param {string} url - URL to stdlib.pack file
     * @returns {Promise<void>}
     */
    async load(url = 'static/pkg/stdlib.pack') {
        console.log('� StdLibLoader: Downloading packed standard library (single file)...');
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load stdlib.pack: ${response.status}`);
        }
        
        this.packData = await response.arrayBuffer();
        this.parseIndex();
        
        console.log(`📦 StdLibLoader: Unpacked ${this.index.size} packages from ${(this.packData.byteLength / 1024 / 1024).toFixed(2)} MB archive`);
        this.loaded = true;
    }

    /**
     * Parse the index from the pack file
     * @private
     */
    parseIndex() {
        const view = new DataView(this.packData);
        let offset = 0;
        
        // Read magic header (8 bytes: "GOSTDLIB")
        const magic = new TextDecoder().decode(new Uint8Array(this.packData, 0, 8));
        if (magic !== 'GOSTDLIB') {
            throw new Error('Invalid stdlib.pack format');
        }
        offset += 8;
        
        // Read version (uint32)
        const version = view.getUint32(offset, true);
        offset += 4;
        
        // Read package count (uint32)
        const packageCount = view.getUint32(offset, true);
        offset += 4;
        
        // Read index offset (uint64 - but we'll use lower 32 bits)
        const indexOffset = Number(view.getBigUint64(offset, true));
        offset = indexOffset;
        
        // Read index
        const indexCount = view.getUint32(offset, true);
        offset += 4;
        
        // Data starts after the header (8 + 4 + 4 + 8 = 24 bytes)
        const dataStart = 24;
        
        for (let i = 0; i < indexCount; i++) {
            // Read name length (uint16)
            const nameLen = view.getUint16(offset, true);
            offset += 2;
            
            // Read name
            const nameBytes = new Uint8Array(this.packData, offset, nameLen);
            const name = new TextDecoder().decode(nameBytes);
            offset += nameLen;
            
            // Read offset and size
            const pkgOffset = Number(view.getBigUint64(offset, true));
            offset += 8;
            const pkgSize = view.getUint32(offset, true);
            offset += 4;
            
            this.index.set(name, {
                offset: dataStart + pkgOffset,
                size: pkgSize
            });
        }
    }

    /**
     * Get a package's archive data
     * @param {string} packageName - Package name (e.g., "fmt", "crypto/sha256")
     * @returns {Uint8Array|null} Package archive data
     */
    getPackage(packageName) {
        const entry = this.index.get(packageName);
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
        return this.index.has(packageName);
    }

    /**
     * Get list of all package names
     * @returns {string[]}
     */
    getPackageNames() {
        return Array.from(this.index.keys());
    }

    /**
     * Load all packages into a VFS
     * @param {VirtualFileSystem} vfs - Virtual filesystem to load into
     */
    loadAllIntoVFS(vfs) {
        console.log('� StdLibLoader: Extracting packages to virtual filesystem...');
        
        let loaded = 0;
        let totalBytes = 0;
        for (const [name, entry] of this.index) {
            const data = new Uint8Array(this.packData, entry.offset, entry.size);
            vfs.writeFile(`/pkg/js_wasm/${name}.a`, data);
            loaded++;
            totalBytes += entry.size;
        }
        
        console.log(`✅ StdLibLoader: Extracted ${loaded} packages (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to /pkg/js_wasm/`);
    }

    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
        let totalSize = 0;
        for (const entry of this.index.values()) {
            totalSize += entry.size;
        }
        
        return {
            packageCount: this.index.size,
            totalSize: totalSize,
            packSize: this.packData?.byteLength || 0
        };
    }
}

// Export for use in other modules
window.StdLibLoader = StdLibLoader;
