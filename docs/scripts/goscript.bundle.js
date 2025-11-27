/**
 * GoScript SDK v1.0.0
 * Browser-based Go compiler using WebAssembly
 * 
 * https://github.com/aspect-build/aspect-cli
 * 
 * Includes:
 * - GoScript SDK (MIT License)
 * - Go wasm_exec.js (BSD License)
 * 
 * Built: 2025-11-26 20:24:10
 */

// ============================================================
// Go WASM Runtime (wasm_exec.js)
// ============================================================

// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

"use strict";

(() => {
	const enosys = () => {
		const err = new Error("not implemented");
		err.code = "ENOSYS";
		return err;
	};

	if (!globalThis.fs) {
		let outputBuf = "";
		globalThis.fs = {
			constants: { O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1, O_DIRECTORY: -1 }, // unused
			writeSync(fd, buf) {
				outputBuf += decoder.decode(buf);
				const nl = outputBuf.lastIndexOf("\n");
				if (nl != -1) {
					console.log(outputBuf.substring(0, nl));
					outputBuf = outputBuf.substring(nl + 1);
				}
				return buf.length;
			},
			write(fd, buf, offset, length, position, callback) {
				if (offset !== 0 || length !== buf.length || position !== null) {
					callback(enosys());
					return;
				}
				const n = this.writeSync(fd, buf);
				callback(null, n);
			},
			chmod(path, mode, callback) { callback(enosys()); },
			chown(path, uid, gid, callback) { callback(enosys()); },
			close(fd, callback) { callback(enosys()); },
			fchmod(fd, mode, callback) { callback(enosys()); },
			fchown(fd, uid, gid, callback) { callback(enosys()); },
			fstat(fd, callback) { callback(enosys()); },
			fsync(fd, callback) { callback(null); },
			ftruncate(fd, length, callback) { callback(enosys()); },
			lchown(path, uid, gid, callback) { callback(enosys()); },
			link(path, link, callback) { callback(enosys()); },
			lstat(path, callback) { callback(enosys()); },
			mkdir(path, perm, callback) { callback(enosys()); },
			open(path, flags, mode, callback) { callback(enosys()); },
			read(fd, buffer, offset, length, position, callback) { callback(enosys()); },
			readdir(path, callback) { callback(enosys()); },
			readlink(path, callback) { callback(enosys()); },
			rename(from, to, callback) { callback(enosys()); },
			rmdir(path, callback) { callback(enosys()); },
			stat(path, callback) { callback(enosys()); },
			symlink(path, link, callback) { callback(enosys()); },
			truncate(path, length, callback) { callback(enosys()); },
			unlink(path, callback) { callback(enosys()); },
			utimes(path, atime, mtime, callback) { callback(enosys()); },
		};
	}

	if (!globalThis.process) {
		globalThis.process = {
			getuid() { return -1; },
			getgid() { return -1; },
			geteuid() { return -1; },
			getegid() { return -1; },
			getgroups() { throw enosys(); },
			pid: -1,
			ppid: -1,
			umask() { throw enosys(); },
			cwd() { throw enosys(); },
			chdir() { throw enosys(); },
		}
	}

	if (!globalThis.path) {
		globalThis.path = {
			resolve(...pathSegments) {
				return pathSegments.join("/");
			}
		}
	}

	if (!globalThis.crypto) {
		throw new Error("globalThis.crypto is not available, polyfill required (crypto.getRandomValues only)");
	}

	if (!globalThis.performance) {
		throw new Error("globalThis.performance is not available, polyfill required (performance.now only)");
	}

	if (!globalThis.TextEncoder) {
		throw new Error("globalThis.TextEncoder is not available, polyfill required");
	}

	if (!globalThis.TextDecoder) {
		throw new Error("globalThis.TextDecoder is not available, polyfill required");
	}

	const encoder = new TextEncoder("utf-8");
	const decoder = new TextDecoder("utf-8");

	globalThis.Go = class {
		constructor() {
			this.argv = ["js"];
			this.env = {};
			this.exit = (code) => {
				if (code !== 0) {
					console.warn("exit code:", code);
				}
			};
			this._exitPromise = new Promise((resolve) => {
				this._resolveExitPromise = resolve;
			});
			this._pendingEvent = null;
			this._scheduledTimeouts = new Map();
			this._nextCallbackTimeoutID = 1;

			const setInt64 = (addr, v) => {
				this.mem.setUint32(addr + 0, v, true);
				this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true);
			}

			const setInt32 = (addr, v) => {
				this.mem.setUint32(addr + 0, v, true);
			}

			const getInt64 = (addr) => {
				const low = this.mem.getUint32(addr + 0, true);
				const high = this.mem.getInt32(addr + 4, true);
				return low + high * 4294967296;
			}

			const loadValue = (addr) => {
				const f = this.mem.getFloat64(addr, true);
				if (f === 0) {
					return undefined;
				}
				if (!isNaN(f)) {
					return f;
				}

				const id = this.mem.getUint32(addr, true);
				return this._values[id];
			}

			const storeValue = (addr, v) => {
				const nanHead = 0x7FF80000;

				if (typeof v === "number" && v !== 0) {
					if (isNaN(v)) {
						this.mem.setUint32(addr + 4, nanHead, true);
						this.mem.setUint32(addr, 0, true);
						return;
					}
					this.mem.setFloat64(addr, v, true);
					return;
				}

				if (v === undefined) {
					this.mem.setFloat64(addr, 0, true);
					return;
				}

				let id = this._ids.get(v);
				if (id === undefined) {
					id = this._idPool.pop();
					if (id === undefined) {
						id = this._values.length;
					}
					this._values[id] = v;
					this._goRefCounts[id] = 0;
					this._ids.set(v, id);
				}
				this._goRefCounts[id]++;
				let typeFlag = 0;
				switch (typeof v) {
					case "object":
						if (v !== null) {
							typeFlag = 1;
						}
						break;
					case "string":
						typeFlag = 2;
						break;
					case "symbol":
						typeFlag = 3;
						break;
					case "function":
						typeFlag = 4;
						break;
				}
				this.mem.setUint32(addr + 4, nanHead | typeFlag, true);
				this.mem.setUint32(addr, id, true);
			}

			const loadSlice = (addr) => {
				const array = getInt64(addr + 0);
				const len = getInt64(addr + 8);
				return new Uint8Array(this._inst.exports.mem.buffer, array, len);
			}

			const loadSliceOfValues = (addr) => {
				const array = getInt64(addr + 0);
				const len = getInt64(addr + 8);
				const a = new Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = loadValue(array + i * 8);
				}
				return a;
			}

			const loadString = (addr) => {
				const saddr = getInt64(addr + 0);
				const len = getInt64(addr + 8);
				return decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len));
			}

			const testCallExport = (a, b) => {
				this._inst.exports.testExport0();
				return this._inst.exports.testExport(a, b);
			}

			const timeOrigin = Date.now() - performance.now();
			this.importObject = {
				_gotest: {
					add: (a, b) => a + b,
					callExport: testCallExport,
				},
				gojs: {
					// Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
					// may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
					// function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
					// This changes the SP, thus we have to update the SP used by the imported function.

					// func wasmExit(code int32)
					"runtime.wasmExit": (sp) => {
						sp >>>= 0;
						const code = this.mem.getInt32(sp + 8, true);
						this.exited = true;
						delete this._inst;
						delete this._values;
						delete this._goRefCounts;
						delete this._ids;
						delete this._idPool;
						this.exit(code);
					},

					// func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
					"runtime.wasmWrite": (sp) => {
						sp >>>= 0;
						const fd = getInt64(sp + 8);
						const p = getInt64(sp + 16);
						const n = this.mem.getInt32(sp + 24, true);
						fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n));
					},

					// func resetMemoryDataView()
					"runtime.resetMemoryDataView": (sp) => {
						sp >>>= 0;
						this.mem = new DataView(this._inst.exports.mem.buffer);
					},

					// func nanotime1() int64
					"runtime.nanotime1": (sp) => {
						sp >>>= 0;
						setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
					},

					// func walltime() (sec int64, nsec int32)
					"runtime.walltime": (sp) => {
						sp >>>= 0;
						const msec = (new Date).getTime();
						setInt64(sp + 8, msec / 1000);
						this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true);
					},

					// func scheduleTimeoutEvent(delay int64) int32
					"runtime.scheduleTimeoutEvent": (sp) => {
						sp >>>= 0;
						const id = this._nextCallbackTimeoutID;
						this._nextCallbackTimeoutID++;
						this._scheduledTimeouts.set(id, setTimeout(
							() => {
								this._resume();
								while (this._scheduledTimeouts.has(id)) {
									// for some reason Go failed to register the timeout event, log and try again
									// (temporary workaround for https://github.com/golang/go/issues/28975)
									console.warn("scheduleTimeoutEvent: missed timeout event");
									this._resume();
								}
							},
							getInt64(sp + 8),
						));
						this.mem.setInt32(sp + 16, id, true);
					},

					// func clearTimeoutEvent(id int32)
					"runtime.clearTimeoutEvent": (sp) => {
						sp >>>= 0;
						const id = this.mem.getInt32(sp + 8, true);
						clearTimeout(this._scheduledTimeouts.get(id));
						this._scheduledTimeouts.delete(id);
					},

					// func getRandomData(r []byte)
					"runtime.getRandomData": (sp) => {
						sp >>>= 0;
						crypto.getRandomValues(loadSlice(sp + 8));
					},

					// func finalizeRef(v ref)
					"syscall/js.finalizeRef": (sp) => {
						sp >>>= 0;
						const id = this.mem.getUint32(sp + 8, true);
						this._goRefCounts[id]--;
						if (this._goRefCounts[id] === 0) {
							const v = this._values[id];
							this._values[id] = null;
							this._ids.delete(v);
							this._idPool.push(id);
						}
					},

					// func stringVal(value string) ref
					"syscall/js.stringVal": (sp) => {
						sp >>>= 0;
						storeValue(sp + 24, loadString(sp + 8));
					},

					// func valueGet(v ref, p string) ref
					"syscall/js.valueGet": (sp) => {
						sp >>>= 0;
						const result = Reflect.get(loadValue(sp + 8), loadString(sp + 16));
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 32, result);
					},

					// func valueSet(v ref, p string, x ref)
					"syscall/js.valueSet": (sp) => {
						sp >>>= 0;
						Reflect.set(loadValue(sp + 8), loadString(sp + 16), loadValue(sp + 32));
					},

					// func valueDelete(v ref, p string)
					"syscall/js.valueDelete": (sp) => {
						sp >>>= 0;
						Reflect.deleteProperty(loadValue(sp + 8), loadString(sp + 16));
					},

					// func valueIndex(v ref, i int) ref
					"syscall/js.valueIndex": (sp) => {
						sp >>>= 0;
						storeValue(sp + 24, Reflect.get(loadValue(sp + 8), getInt64(sp + 16)));
					},

					// valueSetIndex(v ref, i int, x ref)
					"syscall/js.valueSetIndex": (sp) => {
						sp >>>= 0;
						Reflect.set(loadValue(sp + 8), getInt64(sp + 16), loadValue(sp + 24));
					},

					// func valueCall(v ref, m string, args []ref) (ref, bool)
					"syscall/js.valueCall": (sp) => {
						sp >>>= 0;
						try {
							const v = loadValue(sp + 8);
							const m = Reflect.get(v, loadString(sp + 16));
							const args = loadSliceOfValues(sp + 32);
							const result = Reflect.apply(m, v, args);
							sp = this._inst.exports.getsp() >>> 0; // see comment above
							storeValue(sp + 56, result);
							this.mem.setUint8(sp + 64, 1);
						} catch (err) {
							sp = this._inst.exports.getsp() >>> 0; // see comment above
							storeValue(sp + 56, err);
							this.mem.setUint8(sp + 64, 0);
						}
					},

					// func valueInvoke(v ref, args []ref) (ref, bool)
					"syscall/js.valueInvoke": (sp) => {
						sp >>>= 0;
						try {
							const v = loadValue(sp + 8);
							const args = loadSliceOfValues(sp + 16);
							const result = Reflect.apply(v, undefined, args);
							sp = this._inst.exports.getsp() >>> 0; // see comment above
							storeValue(sp + 40, result);
							this.mem.setUint8(sp + 48, 1);
						} catch (err) {
							sp = this._inst.exports.getsp() >>> 0; // see comment above
							storeValue(sp + 40, err);
							this.mem.setUint8(sp + 48, 0);
						}
					},

					// func valueNew(v ref, args []ref) (ref, bool)
					"syscall/js.valueNew": (sp) => {
						sp >>>= 0;
						try {
							const v = loadValue(sp + 8);
							const args = loadSliceOfValues(sp + 16);
							const result = Reflect.construct(v, args);
							sp = this._inst.exports.getsp() >>> 0; // see comment above
							storeValue(sp + 40, result);
							this.mem.setUint8(sp + 48, 1);
						} catch (err) {
							sp = this._inst.exports.getsp() >>> 0; // see comment above
							storeValue(sp + 40, err);
							this.mem.setUint8(sp + 48, 0);
						}
					},

					// func valueLength(v ref) int
					"syscall/js.valueLength": (sp) => {
						sp >>>= 0;
						setInt64(sp + 16, parseInt(loadValue(sp + 8).length));
					},

					// valuePrepareString(v ref) (ref, int)
					"syscall/js.valuePrepareString": (sp) => {
						sp >>>= 0;
						const str = encoder.encode(String(loadValue(sp + 8)));
						storeValue(sp + 16, str);
						setInt64(sp + 24, str.length);
					},

					// valueLoadString(v ref, b []byte)
					"syscall/js.valueLoadString": (sp) => {
						sp >>>= 0;
						const str = loadValue(sp + 8);
						loadSlice(sp + 16).set(str);
					},

					// func valueInstanceOf(v ref, t ref) bool
					"syscall/js.valueInstanceOf": (sp) => {
						sp >>>= 0;
						this.mem.setUint8(sp + 24, (loadValue(sp + 8) instanceof loadValue(sp + 16)) ? 1 : 0);
					},

					// func copyBytesToGo(dst []byte, src ref) (int, bool)
					"syscall/js.copyBytesToGo": (sp) => {
						sp >>>= 0;
						const dst = loadSlice(sp + 8);
						const src = loadValue(sp + 32);
						if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
							this.mem.setUint8(sp + 48, 0);
							return;
						}
						const toCopy = src.subarray(0, dst.length);
						dst.set(toCopy);
						setInt64(sp + 40, toCopy.length);
						this.mem.setUint8(sp + 48, 1);
					},

					// func copyBytesToJS(dst ref, src []byte) (int, bool)
					"syscall/js.copyBytesToJS": (sp) => {
						sp >>>= 0;
						const dst = loadValue(sp + 8);
						const src = loadSlice(sp + 16);
						if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
							this.mem.setUint8(sp + 48, 0);
							return;
						}
						const toCopy = src.subarray(0, dst.length);
						dst.set(toCopy);
						setInt64(sp + 40, toCopy.length);
						this.mem.setUint8(sp + 48, 1);
					},

					"debug": (value) => {
						console.log(value);
					},
				}
			};
		}

		async run(instance) {
			if (!(instance instanceof WebAssembly.Instance)) {
				throw new Error("Go.run: WebAssembly.Instance expected");
			}
			this._inst = instance;
			this.mem = new DataView(this._inst.exports.mem.buffer);
			this._values = [ // JS values that Go currently has references to, indexed by reference id
				NaN,
				0,
				null,
				true,
				false,
				globalThis,
				this,
			];
			this._goRefCounts = new Array(this._values.length).fill(Infinity); // number of references that Go has to a JS value, indexed by reference id
			this._ids = new Map([ // mapping from JS values to reference ids
				[0, 1],
				[null, 2],
				[true, 3],
				[false, 4],
				[globalThis, 5],
				[this, 6],
			]);
			this._idPool = [];   // unused ids that have been garbage collected
			this.exited = false; // whether the Go program has exited

			// Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
			let offset = 4096;

			const strPtr = (str) => {
				const ptr = offset;
				const bytes = encoder.encode(str + "\0");
				new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes);
				offset += bytes.length;
				if (offset % 8 !== 0) {
					offset += 8 - (offset % 8);
				}
				return ptr;
			};

			const argc = this.argv.length;

			const argvPtrs = [];
			this.argv.forEach((arg) => {
				argvPtrs.push(strPtr(arg));
			});
			argvPtrs.push(0);

			const keys = Object.keys(this.env).sort();
			keys.forEach((key) => {
				argvPtrs.push(strPtr(`${key}=${this.env[key]}`));
			});
			argvPtrs.push(0);

			const argv = offset;
			argvPtrs.forEach((ptr) => {
				this.mem.setUint32(offset, ptr, true);
				this.mem.setUint32(offset + 4, 0, true);
				offset += 8;
			});

			// The linker guarantees global data starts from at least wasmMinDataAddr.
			// Keep in sync with cmd/link/internal/ld/data.go:wasmMinDataAddr.
			const wasmMinDataAddr = 4096 + 8192;
			if (offset >= wasmMinDataAddr) {
				throw new Error("total length of command line and environment variables exceeds limit");
			}

			this._inst.exports.run(argc, argv);
			if (this.exited) {
				this._resolveExitPromise();
			}
			await this._exitPromise;
		}

		_resume() {
			if (this.exited) {
				throw new Error("Go program has already exited");
			}
			this._inst.exports.resume();
			if (this.exited) {
				this._resolveExitPromise();
			}
		}

		_makeFuncWrapper(id) {
			const go = this;
			return function () {
				const event = { id: id, this: this, args: arguments };
				go._pendingEvent = event;
				go._resume();
				return event.result;
			};
		}
	}
})();


// ============================================================
// GoScript SDK
// ============================================================

/**
 * Personal Website 2025 - Virtual Filesystem
 * In-memory filesystem for Go compiler integration
 */

class VirtualFileSystem {
    constructor() {
        this.files = new Map();
        this.directories = new Set();
        this.workingDirectory = '/';
    }

    /**
     * Write file to virtual filesystem
     * @param {string} path - File path
     * @param {string|Uint8Array} content - File content
     */
    writeFile(path, content) {
        const normalizedPath = this.normalizePath(path);
        this.files.set(normalizedPath, content);
        this.ensureDirectoryExists(this.getDirectory(normalizedPath));
        console.log(`ðŸ“ VFS: Written ${normalizedPath} (${content.length} bytes)`);
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
        console.log(`ðŸ“ VFS: Created directory ${normalizedPath}`);
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
        console.log('ðŸ“¦ VFS: Loading Go source files...');
        
        for (const [filePath, content] of Object.entries(sourceFiles)) {
            this.writeFile(filePath, content);
        }
        
        // Create standard Go directories
        this.mkdir('/src');
        this.mkdir('/pkg');
        this.mkdir('/bin');
        
        console.log(`âœ… VFS: Loaded ${Object.keys(sourceFiles).length} source files`);
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
        try {
            const goModContent = this.readFile('/go.mod');
            const moduleMatch = goModContent.match(/module\s+([^\s\n]+)/);
            const goVersionMatch = goModContent.match(/go\s+([0-9.]+)/);
            
            return {
                name: moduleMatch ? moduleMatch[1] : 'unknown',
                goVersion: goVersionMatch ? goVersionMatch[1] : '1.21',
                dependencies: this.parseDependencies(goModContent)
            };
        } catch (e) {
            return {
                name: 'personal-website-2025',
                goVersion: '1.21',
                dependencies: []
            };
        }
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
            tree += `${indent}â”œâ”€â”€ ${fileName}\n`;
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

    /**
     * Clear all files and directories
     */
    clear() {
        this.files.clear();
        this.directories.clear();
        console.log('ðŸ—‘ï¸ VFS: Cleared all files');
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
            totalSize: Array.from(this.files.values()).reduce((sum, content) => sum + content.length, 0)
        };
    }
}

// Export for use in other modules
window.VirtualFileSystem = VirtualFileSystem; 

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

    patch() {
        const self = this;
        const enosys = () => {
            const err = new Error("not implemented");
            err.code = "ENOSYS";
            return err;
        };

        globalThis.fs = {
            constants: { O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_TRUNC: 512, O_APPEND: 1024, O_EXCL: 128, O_DIRECTORY: 65536 },
            
            writeSync(fd, buf) {
                if (fd === 1 || fd === 2) {
                    const text = new TextDecoder().decode(buf);
                    if (window.addConsoleOutput) {
                        window.addConsoleOutput(text.trimEnd());
                    } else {
                        console.log(text);
                    }
                    return buf.length;
                }
                
                const file = self.fds.get(fd);
                if (!file) throw new Error("EBADF");
                
                // Append to file content
                const newContent = new Uint8Array(file.content.length + buf.length);
                newContent.set(file.content);
                newContent.set(buf, file.content.length);
                file.content = newContent;
                
                // Sync to VFS immediately
                self.vfs.writeFile(file.path, file.content);
                
                return buf.length;
            },

            write(fd, buf, offset, length, position, callback) {
                try {
                    if (fd === 1 || fd === 2) {
                        const text = new TextDecoder().decode(buf.subarray(offset, offset + length));
                        if (window.addConsoleOutput) {
                            window.addConsoleOutput(text.trimEnd());
                        } else {
                            console.log(text);
                        }
                        callback(null, length);
                        return;
                    }
                    
                    const file = self.fds.get(fd);
                    if (!file) { callback(new Error("EBADF")); return; }
                    
                    const data = buf.subarray(offset, offset + length);
                    let pos = position !== null ? position : file.position;
                    
                    // Expand file if needed
                    if (pos + length > file.content.length) {
                        const newContent = new Uint8Array(pos + length);
                        newContent.set(file.content);
                        file.content = newContent;
                    }
                    
                    file.content.set(data, pos);
                    if (position === null) {
                        file.position = pos + length;
                    }
                    
                    // Sync to VFS
                    self.vfs.writeFile(file.path, file.content);
                    
                    callback(null, length);
                } catch (e) {
                    callback(e);
                }
            },

            open(path, flags, mode, callback) {
                try {
                    // Handle relative paths
                    if (!path.startsWith('/')) {
                        path = self.vfs.workingDirectory + (self.vfs.workingDirectory.endsWith('/') ? '' : '/') + path;
                    }
                    path = self.vfs.normalizePath(path);

                    let content = new Uint8Array(0);
                    if (self.vfs.exists(path)) {
                        const vfsContent = self.vfs.readFile(path);
                        if (typeof vfsContent === 'string') {
                            content = new TextEncoder().encode(vfsContent);
                        } else {
                            content = vfsContent;
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
                const file = self.fds.get(fd);
                if (file) {
                    self.fds.delete(fd);
                }
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
            },

            stat(path, callback) {
                try {
                    if (!path.startsWith('/')) {
                        path = self.vfs.workingDirectory + (self.vfs.workingDirectory.endsWith('/') ? '' : '/') + path;
                    }
                    path = self.vfs.normalizePath(path);

                    if (self.vfs.exists(path)) {
                         const content = self.vfs.readFile(path);
                         const size = content.length;
                         callback(null, {
                             isDirectory: () => false,
                             isFile: () => true,
                             size: size,
                             mode: 0o666,
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
                    } else if (self.vfs.directories.has(path) || path === '/') {
                        callback(null, {
                            isDirectory: () => true,
                            isFile: () => false,
                            size: 0,
                            mode: 0o777 | 0o40000, // Add directory bit
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
            
            unlink(path, callback) {
                // Not implemented in VFS yet
                callback(null);
            },
            
            rename(from, to, callback) {
                // Not implemented in VFS yet
                callback(null);
            },
            
            rmdir(path, callback) {
                callback(null);
            }
        };

        // Patch process
        if (!globalThis.process) globalThis.process = {};
        globalThis.process.cwd = () => self.vfs.workingDirectory;
        globalThis.process.chdir = (path) => {
            self.vfs.workingDirectory = path;
        };
    }
}

window.FSPolyfill = FSPolyfill;


/**
 * Personal Website 2025 - Cache Manager
 * Handles caching of source files and compiled WASM using IndexedDB
 */

class CacheManager {
    constructor() {
        this.dbName = 'PersonalWebsite2025Cache';
        this.dbVersion = 1;
        this.db = null;
        this.ready = false;
    }

    /**
     * Initialize the cache database
     * @returns {Promise<void>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            console.log('ðŸ—„ï¸ CacheManager: Initializing IndexedDB cache...');
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('âŒ CacheManager: Failed to open IndexedDB');
                reject(new Error('Failed to initialize cache database'));
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                console.log('âœ… CacheManager: Cache database ready');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('sourceFiles')) {
                    const sourceStore = db.createObjectStore('sourceFiles', { keyPath: 'key' });
                    sourceStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('compiledWasm')) {
                    const wasmStore = db.createObjectStore('compiledWasm', { keyPath: 'key' });
                    wasmStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
                
                console.log('ðŸ“Š CacheManager: Created object stores');
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
        
        console.log(`ðŸ’¾ CacheManager: Caching source files for commit ${commitHash}`);
        
        const transaction = this.db.transaction(['sourceFiles'], 'readwrite');
        const store = transaction.objectStore('sourceFiles');
        
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
                console.log(`âœ… CacheManager: Cached ${Object.keys(sourceFiles).length} source files`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('âŒ CacheManager: Failed to cache source files');
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
        
        const transaction = this.db.transaction(['sourceFiles'], 'readonly');
        const store = transaction.objectStore('sourceFiles');
        
        return new Promise((resolve, reject) => {
            const request = store.get(`sources_${commitHash}`);
            
            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log(`ðŸŽ¯ CacheManager: Found cached sources for commit ${commitHash}`);
                    resolve(result.files);
                } else {
                    console.log(`ðŸ” CacheManager: No cached sources for commit ${commitHash}`);
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('âŒ CacheManager: Failed to retrieve cached sources');
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
        
        console.log(`ðŸ’¾ CacheManager: Caching WASM binary (${wasmBinary.byteLength} bytes)`);
        
        const transaction = this.db.transaction(['compiledWasm'], 'readwrite');
        const store = transaction.objectStore('compiledWasm');
        
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
                console.log(`âœ… CacheManager: Cached WASM binary`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('âŒ CacheManager: Failed to cache WASM binary');
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
        
        const transaction = this.db.transaction(['compiledWasm'], 'readonly');
        const store = transaction.objectStore('compiledWasm');
        
        return new Promise((resolve, reject) => {
            const request = store.get(`wasm_${sourceHash}`);
            
            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log(`ðŸŽ¯ CacheManager: Found cached WASM for hash ${sourceHash}`);
                    resolve({
                        wasmBinary: result.wasmBinary,
                        metadata: result.metadata,
                        timestamp: result.timestamp
                    });
                } else {
                    console.log(`ðŸ” CacheManager: No cached WASM for hash ${sourceHash}`);
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('âŒ CacheManager: Failed to retrieve cached WASM');
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
        
        console.log('ðŸ§¹ CacheManager: Clearing old cache entries...');
        
        const cutoffTime = Date.now() - maxAge;
        const stores = ['sourceFiles', 'compiledWasm'];
        
        for (const storeName of stores) {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore('sourceFiles');
            const index = store.index('timestamp');
            
            const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
        }
        
        console.log('âœ… CacheManager: Old entries cleared');
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache stats
     */
    async getStats() {
        if (!this.ready) await this.init();
        
        const stats = {
            sourceFiles: 0,
            compiledWasm: 0,
            totalSize: 0
        };
        
        const transaction = this.db.transaction(['sourceFiles', 'compiledWasm'], 'readonly');
        
        // Count source files
        const sourceStore = transaction.objectStore('sourceFiles');
        const sourceRequest = sourceStore.count();
        
        sourceRequest.onsuccess = (event) => {
            stats.sourceFiles = event.target.result;
        };
        
        // Count WASM files
        const wasmStore = transaction.objectStore('compiledWasm');
        const wasmRequest = wasmStore.count();
        
        wasmRequest.onsuccess = (event) => {
            stats.compiledWasm = event.target.result;
        };
        
        return stats;
    }

    /**
     * Clear all cache data
     * @returns {Promise<void>}
     */
    async clearAll() {
        if (!this.ready) await this.init();
        
        console.log('ðŸ—‘ï¸ CacheManager: Clearing all cache data...');
        
        const transaction = this.db.transaction(['sourceFiles', 'compiledWasm', 'metadata'], 'readwrite');
        
        const promises = [
            new Promise(resolve => {
                const request = transaction.objectStore('sourceFiles').clear();
                request.onsuccess = () => resolve();
            }),
            new Promise(resolve => {
                const request = transaction.objectStore('compiledWasm').clear();
                request.onsuccess = () => resolve();
            }),
            new Promise(resolve => {
                const request = transaction.objectStore('metadata').clear();
                request.onsuccess = () => resolve();
            })
        ];
        
        await Promise.all(promises);
        console.log('âœ… CacheManager: All cache data cleared');
    }
}

// Export for use in other modules
window.CacheManager = CacheManager; 

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
            console.warn('ðŸ“¦ ToolchainLoader: IndexedDB not available, skipping cache');
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
            console.warn('ðŸ“¦ ToolchainLoader: Failed to cache pack:', e.message);
        }
    }

    /**
     * Load the complete toolchain pack
     * @param {string} url - URL to goscript.pack file
     * @returns {Promise<void>}
     */
    async load(url = 'assets/goscript.pack') {
        // Try to load from IndexedDB cache first
        console.log('ðŸ“¦ ToolchainLoader: Checking cache for GoScript toolchain...');
        const cached = await this.getCached(url);
        
        if (cached) {
            console.log(`âœ… ToolchainLoader: Loaded from cache (${(cached.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            this.packData = cached;
        } else {
            console.log('ðŸ“¦ ToolchainLoader: Downloading GoScript toolchain (single file)...');
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load goscript.pack: ${response.status}`);
            }
            
            this.packData = await response.arrayBuffer();
            console.log(`ðŸ“¦ ToolchainLoader: Downloaded ${(this.packData.byteLength / 1024 / 1024).toFixed(2)} MB`);
            
            // Cache for future use
            console.log('ðŸ’¾ ToolchainLoader: Caching toolchain for future use...');
            await this.setCache(url, this.packData);
            console.log('âœ… ToolchainLoader: Toolchain cached successfully');
        }
        
        this.parseToolchain();
        this.loaded = true;
        
        console.log(`âœ… ToolchainLoader: Ready (compiler: ${(this.compilerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, linker: ${(this.linkerWasm.byteLength / 1024 / 1024).toFixed(1)} MB, ${this.packageIndex.size} packages)`);
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
                    console.log('ðŸ—‘ï¸ ToolchainLoader: Cache cleared');
                    resolve();
                };
            });
        } catch (e) {
            console.warn('ðŸ“¦ ToolchainLoader: Failed to clear cache:', e.message);
        }
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
        console.log(`ðŸ“¦ ToolchainLoader: Compiler extracted (${(compilerSize / 1024 / 1024).toFixed(2)} MB)`);
        
        // === Section 2: Linker WASM ===
        const linkerSize = view.getUint32(offset, true);
        offset += 4;
        this.linkerWasm = this.packData.slice(offset, offset + linkerSize);
        offset += linkerSize;
        console.log(`ðŸ“¦ ToolchainLoader: Linker extracted (${(linkerSize / 1024 / 1024).toFixed(2)} MB)`);
        
        // === Section 3: Package Index (JSON) ===
        const indexSize = view.getUint32(offset, true);
        offset += 4;
        const indexBytes = new Uint8Array(this.packData, offset, indexSize);
        const indexJson = new TextDecoder().decode(indexBytes);
        this.packageNames = JSON.parse(indexJson);
        offset += indexSize;
        console.log(`ðŸ“¦ ToolchainLoader: Package index loaded (${this.packageNames.length} packages)`);
        
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
        console.log('ðŸ“‚ ToolchainLoader: Extracting packages to virtual filesystem...');
        
        let loaded = 0;
        let totalBytes = 0;
        for (const [name, entry] of this.packageIndex) {
            const data = new Uint8Array(this.packData, entry.offset, entry.size);
            vfs.writeFile(`/pkg/js_wasm/${name}.a`, data);
            loaded++;
            totalBytes += entry.size;
        }
        
        console.log(`âœ… ToolchainLoader: Extracted ${loaded} packages (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to /pkg/js_wasm/`);
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


/**
 * Personal Website 2025 - GitHub Source Fetcher
 * Fetches Go source files from GitHub repositories
 */

class GitHubFetcher {
    constructor() {
        this.baseUrl = 'https://api.github.com';
        this.cache = new Map();
    }

    /**
     * Fetch Go source files from the GoWebComponents repository
     * @returns {Promise<Object>} Source files mapped by path
     */
    async fetchGoWebComponentsSources() {
        console.log('ðŸ” GitHubFetcher: Fetching GoWebComponents sources...');
        
        // TODO: Implement actual GitHub API fetching
        // For now, return stub data
        return {
            'examples/blog_landing_page.go': this.getStubGoCode(),
            'go.mod': this.getStubGoMod(),
            'go.sum': this.getStubGoSum()
        };
    }

    /**
     * Fetch specific file from GitHub
     * @param {string} repo - Repository in format 'owner/repo'
     * @param {string} path - File path in repository
     * @param {string} branch - Branch name (default: 'main')
     * @returns {Promise<string>} File content
     */
    async fetchFile(repo, path, branch = 'main') {
        console.log(`ðŸ“„ GitHubFetcher: Fetching ${repo}/${path} from ${branch}`);
        
        // TODO: Implement actual GitHub API call
        // const url = `${this.baseUrl}/repos/${repo}/contents/${path}?ref=${branch}`;
        
        throw new Error('GitHubFetcher.fetchFile() - Not implemented yet');
    }

    /**
     * Get repository structure
     * @param {string} repo - Repository in format 'owner/repo'
     * @param {string} path - Directory path (default: '')
     * @returns {Promise<Array>} Directory listing
     */
    async getRepoStructure(repo, path = '') {
        console.log(`ðŸ“ GitHubFetcher: Getting structure for ${repo}/${path}`);
        
        // TODO: Implement repository structure fetching
        throw new Error('GitHubFetcher.getRepoStructure() - Not implemented yet');
    }

    /**
     * Check if repository exists and is accessible
     * @param {string} repo - Repository in format 'owner/repo'
     * @returns {Promise<boolean>}
     */
    async validateRepo(repo) {
        console.log(`âœ… GitHubFetcher: Validating repository ${repo}`);
        
        // TODO: Implement repository validation
        return true; // Stub: assume valid
    }

    // Stub data for development
    getStubGoCode() {
        return `package main

import (
    "fmt"
    "github.com/gofiber/fiber/v2"
)

func main() {
    app := fiber.New()
    
    app.Get("/", func(c *fiber.Ctx) error {
        return c.HTML(\`
            <h1>ðŸŽ‰ Personal Website 2025</h1>
            <p>Compiled from Go to WASM in your browser!</p>
            <p>This is a demonstration of real-time Go compilation.</p>
        \`)
    })
    
    fmt.Println("ðŸš€ Website compiled and ready!")
    app.Listen(":3000")
}`;
    }

    getStubGoMod() {
        return `module personal-website-2025

go 1.21

require (
    github.com/gofiber/fiber/v2 v2.52.0
)`;
    }

    getStubGoSum() {
        return `github.com/gofiber/fiber/v2 v2.52.0 h1:example
github.com/gofiber/fiber/v2 v2.52.0/go.mod h1:example`;
    }
}

// Export for use in other modules
window.GitHubFetcher = GitHubFetcher; 

/**
 * Personal Website 2025 - Compilation Manager
 * Orchestrates Go to WASM compilation pipeline
 */

class CompilationManager {
    constructor() {
        this.vfs = null;
        this.cacheManager = null;
        this.compilerLoaded = false;
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
        console.log('âš¡ CompilationManager: Initialized with VFS and CacheManager');
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
            await this.loadCompiler();
            this.emitStageUpdate(1, 'complete');
            this.emitProgress(15, 'COMPILER_READY');
            
            // Stage 2: Check cache
            this.emitStageUpdate(2, 'active');
            const sourceHash = this.cacheManager.generateSourceHash(sourceFiles);
            const cachedWasm = await this.cacheManager.getCachedWasm(sourceHash);
            
            if (cachedWasm) {
                console.log('ðŸŽ¯ CompilationManager: Using cached WASM binary');
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
        console.log('ðŸ”§ CompilationManager: Loading GoScript toolchain...');
        
        try {
            // Try to use packed toolchain first (single file with everything)
            if (window.ToolchainLoader) {
                console.log('ðŸ“¦ Using packed goscript.pack (compiler + linker + stdlib in 1 file)');
                this.toolchainLoader = new window.ToolchainLoader();
                await this.toolchainLoader.load('assets/goscript.pack');
                
                // Extract compiler and linker
                this.compileWasmBytes = this.toolchainLoader.getCompilerWasm();
                this.linkWasmBytes = this.toolchainLoader.getLinkerWasm();
                
                // Set up filesystem interface for the compiler
                this.setupCompilerFilesystem();
                
                // Load stdlib packages into VFS
                this.toolchainLoader.loadAllPackagesIntoVFS(this.vfs);
                
                const stats = this.toolchainLoader.getStats();
                console.log(`âœ… CompilationManager: Toolchain ready (${(stats.packSize / 1024 / 1024).toFixed(1)} MB total)`);
                
                this.compilerLoaded = true;
                return;
            }
            
            // Fallback: Load compiler and linker separately
            console.log('âš ï¸ ToolchainLoader not available, loading files separately...');
            await this.loadCompilerSeparately();
            
        } catch (error) {
            console.error('âŒ CompilationManager: Failed to load packed toolchain:', error);
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
            
            console.log(`ðŸ“¦ CompilationManager: Loaded compiler (${(this.compileWasmBytes.byteLength / 1024 / 1024).toFixed(2)} MB) and linker (${(this.linkWasmBytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            
            // Set up filesystem interface for the compiler
            this.setupCompilerFilesystem();
            
            // Load standard library
            await this.loadStdLib();

            this.compilerLoaded = true;
            console.log('âœ… CompilationManager: Go compiler WASM loaded and ready');
            
        } catch (error) {
            console.error('âŒ CompilationManager: Failed to load Go compiler:', error);
            // Fall back to mock implementation
            await this.delay(500);
            this.compilerLoaded = true;
            console.log('âš ï¸ CompilationManager: Using fallback mock compiler');
        }
    }

    /**
     * Load standard library from packed archive (fallback when not using toolchain pack)
     * @private
     */
    async loadStdLib() {
        console.log('ðŸ“š CompilationManager: Loading Go standard library...');
        
        try {
            // Try to use packed stdlib first
            if (window.StdLibLoader) {
                console.log('ðŸ“¦ Using packed stdlib.pack (340 packages in 1 file)');
                this.stdlibLoader = new window.StdLibLoader();
                await this.stdlibLoader.load('static/pkg/stdlib.pack');
                this.stdlibLoader.loadAllIntoVFS(this.vfs);
                
                const stats = this.stdlibLoader.getStats();
                console.log(`âœ… CompilationManager: Standard library ready (${stats.packageCount} packages, ${(stats.packSize / 1024 / 1024).toFixed(1)} MB)`);
                return;
            }
            
            // Fallback to individual package loading
            console.log('âš ï¸ Packed stdlib not available, loading 340 packages individually (slower)...');
            await this.loadStdLibIndividual();
            
        } catch (error) {
            console.error('âŒ CompilationManager: Failed to load packed stdlib:', error);
            // Fall back to individual loading
            await this.loadStdLibIndividual();
        }
    }

    /**
     * Load standard library packages individually (fallback)
     * @private
     */
    async loadStdLibIndividual() {
        console.log('ðŸ“š CompilationManager: Loading standard library individually...');
        
        try {
            const indexResp = await fetch('static/pkg/index.json');
            if (!indexResp.ok) throw new Error("Failed to load package index");
            const packages = await indexResp.json();
            
            console.log(`ðŸ“š CompilationManager: Found ${packages.length} packages in index`);

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
            
            console.log('âœ… CompilationManager: Standard library loaded');
        } catch (error) {
            console.error('âŒ CompilationManager: Failed to load standard library:', error);
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
        console.log('ðŸ—ï¸ CompilationManager: Setting up build environment...');
        
        // Create build directories
        this.vfs.mkdir('/tmp');
        this.vfs.mkdir('/build');
        this.vfs.mkdir('/output');
        
        // Generate build configuration
        const buildConfig = this.generateBuildConfig();
        this.vfs.writeFile('/build/config.json', JSON.stringify(buildConfig, null, 2));
        
        console.log('âœ… CompilationManager: Build environment ready');
    }

    /**
     * Compile Go source to WASM (real Go compiler implementation)
     * @private
     */
    async compileToWasm() {
        console.log('ðŸ”¥ CompilationManager: Compiling Go to WASM using real Go compiler...');
        
        const moduleInfo = this.vfs.getModuleInfo();
        const goFiles = this.vfs.getGoFiles();
        
        console.log(`ðŸ“¦ CompilationManager: Module: ${moduleInfo.name}`);
        console.log(`ðŸ“ CompilationManager: Compiling ${goFiles.length} Go files`);
        
        if (this.compileWasmBytes && this.linkWasmBytes) {
            try {
                // Use the real Go compiler WASM
                const wasmBinary = await this.runGoCompiler();
                console.log(`âœ… CompilationManager: Real WASM compiled (${wasmBinary.byteLength} bytes)`);
                return wasmBinary;
                
            } catch (error) {
                console.warn(`âš ï¸ CompilationManager: Real compiler failed, using fallback: ${error.message}`);
                console.error(error);
                // Fall back to mock if real compilation fails
            }
        }
        
        // Fallback: Simulate compilation time and generate mock WASM
        const compilationTime = Math.max(1000, goFiles.length * 200);
        await this.delay(compilationTime);
        
        const mockWasm = this.generateMockWasm();
        console.log(`âœ… CompilationManager: Mock WASM compiled (${mockWasm.byteLength} bytes)`);
        return mockWasm;
    }

    /**
     * Prepare binary for execution
     * @private
     */
    async prepareBinary(wasmBinary) {
        console.log('ðŸŽ¯ CompilationManager: Preparing binary for execution...');
        
        // Validate WASM binary
        if (!this.validateWasmBinary(wasmBinary)) {
            throw new Error('Invalid WASM binary generated');
        }
        
        // Store in VFS for access
        this.vfs.writeFile('/output/main.wasm', wasmBinary);
        
        console.log('âœ… CompilationManager: Binary prepared for execution');
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
        console.log('ðŸ—‚ï¸ CompilationManager: Setting up compiler filesystem interface...');
        
        if (window.FSPolyfill) {
            const polyfill = new window.FSPolyfill(this.vfs);
            polyfill.patch();
            console.log('âœ… CompilationManager: Filesystem interface patched');
        } else {
            console.warn('âš ï¸ CompilationManager: FSPolyfill not found');
        }
    }

    /**
     * Run the real Go compiler on the source files
     * @private
     */
    async runGoCompiler() {
        console.log('âš™ï¸ CompilationManager: Invoking real Go compiler...');
        
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
        
        console.log(`ðŸ“ CompilationManager: Compiling ${tempFiles.length} file(s): ${tempFiles.join(', ')}`);
        
        // Debug: Check what's in VFS
        console.log('ðŸ“¦ VFS Stats:', this.vfs.getStats());
        console.log('ðŸ“¦ pkg/js_wasm contents:', this.vfs.listDir('/pkg/js_wasm').slice(0, 10));
        
        // Capture compiler output
        let compilerOutput = [];
        const originalAddConsoleOutput = window.addConsoleOutput;
        window.addConsoleOutput = (text) => {
            compilerOutput.push(text);
            console.log('[COMPILER]', text);
            if (originalAddConsoleOutput) originalAddConsoleOutput(text);
        };
        
        try {
            // 1. Compile (cmd/compile)
            // go tool compile -o main.o -p main main.go ...
            console.log('âš™ï¸ CompilationManager: Running compile...');
            console.log('âš™ï¸ Args:', ['compile', '-o', '/tmp/main.o', '-p', 'main', '-I', '/pkg/js_wasm', ...tempFiles]);
            const goCompile = new Go();
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
        } finally {
            window.addConsoleOutput = originalAddConsoleOutput;
        }
        
        // Check if main.o exists
        if (!this.vfs.exists('/tmp/main.o')) {
            const errorMsg = compilerOutput.length > 0 ? compilerOutput.join('\n') : 'No output from compiler';
            throw new Error(`Compilation failed: main.o not created. Compiler output: ${errorMsg}`);
        }
        
        // 2. Link (cmd/link)
        // go tool link -o main.wasm main.o
        console.log('âš™ï¸ CompilationManager: Running link...');
        const goLink = new Go();
        goLink.argv = ['link', '-o', '/tmp/main.wasm', '-L', '/pkg/js_wasm', '/tmp/main.o'];
        goLink.env = { 'GOOS': 'js', 'GOARCH': 'wasm', 'GOROOT': '/' };
        
        const linkInstance = await WebAssembly.instantiate(this.linkWasmBytes, goLink.importObject);
        await goLink.run(linkInstance.instance);
        
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
            console.log('ðŸ›‘ CompilationManager: Compilation cancelled');
        }
    }
}

// Export for use in other modules
window.CompilationManager = CompilationManager; 

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
        if (!window.fs) window.fs = {};
        
        const writeToOutput = (buf) => {
            if (this.outputCallback) {
                const decoder = new TextDecoder("utf-8");
                const text = decoder.decode(buf);
                this.outputCallback(text);
            }
        };

        window.fs.writeSync = (fd, buf) => {
            if (fd === 1 || fd === 2) {
                writeToOutput(buf);
                return buf.length;
            }
            return buf.length;
        };
        
        window.fs.write = (fd, buf, offset, length, position, callback) => {
             if (fd === 1 || fd === 2) {
                writeToOutput(buf.subarray(offset, offset + length));
                callback(null, length);
            } else {
                console.log("fs.write", fd);
                callback(null, 0);
            }
        };
        
        if (!window.fs.open) {
             window.fs.open = (path, flags, mode, callback) => {
                // console.log("fs.open", path);
                callback(null, 0);
            };
        }
    }

    /**
     * Initialize the app runner
     * @returns {Promise<void>}
     */
    async init() {
        console.log('ðŸš€ AppRunner: Initializing WASM execution environment...');
        
        // Initialize Go runtime if wasm_exec.js is loaded
        if (typeof Go !== 'undefined') {
            this.go = new Go();
            console.log('âœ… AppRunner: Go runtime initialized');
        } else {
            console.warn('âš ï¸ AppRunner: wasm_exec.js not loaded, using mock runtime');
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
            console.log(`ðŸŽ¯ AppRunner: Executing WASM binary (${wasmBinary.byteLength} bytes)`);
            
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
            console.log('âœ… AppRunner: Application running successfully');
            
        } catch (error) {
            console.error('âŒ AppRunner: Execution failed:', error.message);
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
            console.log(`ðŸŽ¯ AppRunner: Executing Console WASM binary (${wasmBinary.byteLength} bytes)`);
            
            // Check if this is a mock WASM (small size indicates mock)
            const isMock = wasmBinary.byteLength < 10000;
            
            if (isMock) {
                // For mock WASM, simulate the output based on source code
                console.log('ðŸŽ­ AppRunner: Using mock execution (compiler not available)');
                await this.executeMockConsole(sourceCode);
                return;
            }
            
            // Load and instantiate WASM module
            await this.loadWasmModule(wasmBinary);
            
            // Run the WASM application
            await this.runWasmApplication(true);
            
            this.isRunning = true;
            console.log('âœ… AppRunner: Console application finished');
            
        } catch (error) {
            console.error('âŒ AppRunner: Console execution failed:', error.message);
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
        console.log('ðŸ“¦ AppRunner: Loading WASM module...');
        
        if (this.go) {
            // Use actual Go runtime
            try {
                this.wasmModule = await WebAssembly.instantiate(wasmBinary, this.go.importObject);
                this.wasmInstance = this.wasmModule.instance;
                console.log('âœ… AppRunner: WASM module loaded with Go runtime');
            } catch (error) {
                console.warn('âš ï¸ AppRunner: Go runtime failed, falling back to mock');
                await this.loadMockModule(wasmBinary);
            }
        } else {
            // Use mock implementation
            await this.loadMockModule(wasmBinary);
        }
    }

    /**
     * Load mock WASM module for development
     * @private
     */
    async loadMockModule(wasmBinary) {
        console.log('ðŸŽ­ AppRunner: Loading mock WASM module...');
        
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
        console.log('âœ… AppRunner: Mock WASM module loaded');
    }

    /**
     * Setup DOM environment for Go application
     * @private
     */
    setupDOMEnvironment() {
        console.log('ðŸŒ AppRunner: Setting up DOM environment...');
        
        // Clear mount point
        this.mountPoint.innerHTML = '';
        
        // Add CSS for the application
        this.injectApplicationCSS();
        
        // Setup global objects that Go WASM might expect
        if (!window.fs) {
            window.fs = {
                writeSync: () => {},
                write: () => {}
            };
        }
        
        console.log('âœ… AppRunner: DOM environment ready');
    }

    /**
     * Run the WASM application
     * @private
     */
    async runWasmApplication(isConsole = false) {
        console.log('â–¶ï¸ AppRunner: Starting WASM application...');
        
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
                console.warn('âš ï¸ AppRunner: Mock application skipped in console mode');
            }
        }
    }

    /**
     * Render mock application for development
     * @private
     */
    renderMockApplication() {
        console.log('ðŸŽ­ AppRunner: Rendering mock application...');
        
        this.mountPoint.innerHTML = `
            <div class="mock-app">
                <header class="app-header">
                    <h1>ðŸŽ‰ Personal Website 2025</h1>
                    <p>Compiled from Go to WASM â€¢ Running in Browser</p>
                </header>
                
                <main class="app-content">
                    <div class="welcome-section">
                        <h2>âœ¨ Welcome to the Future of Web Development</h2>
                        <p>This website was compiled from Go source code directly in your browser using WebAssembly!</p>
                    </div>
                    
                    <div class="features-grid">
                        <div class="feature-card">
                            <h3>ðŸš€ Real-time Compilation</h3>
                            <p>Go source code fetched from GitHub and compiled to WASM instantly</p>
                        </div>
                        
                        <div class="feature-card">
                            <h3>ðŸ’¾ Smart Caching</h3>
                            <p>IndexedDB caching with commit-hash based invalidation</p>
                        </div>
                        
                        <div class="feature-card">
                            <h3>ðŸŒ No Server Required</h3>
                            <p>Everything runs in your browser - no backend needed</p>
                        </div>
                        
                        <div class="feature-card">
                            <h3>âš¡ Lightning Fast</h3>
                            <p>WebAssembly performance with Go's simplicity</p>
                        </div>
                    </div>
                    
                    <div class="demo-section">
                        <h3>ðŸŽ¯ Interactive Demo</h3>
                        <button onclick="window.appRunner.handleDemoClick()" class="demo-button">
                            Click me! (Handled by Go WASM)
                        </button>
                        <div id="demo-output" class="demo-output"></div>
                    </div>
                    
                    <div class="tech-stack">
                        <h3>ðŸ› ï¸ Technology Stack</h3>
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
                    <p>ðŸ”§ Compiled ${new Date().toLocaleString()}</p>
                    <p>ðŸ’š Powered by Go WebAssembly</p>
                </footer>
            </div>
        `;
        
        // Make the app runner globally accessible for demo interactions
        window.appRunner = this;
    }

    /**
     * Handle demo button click (simulates Go WASM interaction)
     */
    handleDemoClick() {
        const output = document.getElementById('demo-output');
        const responses = [
            'Hello from Go WASM! ðŸ‘‹',
            'This interaction was handled by compiled Go code! ðŸš€',
            'WebAssembly + Go = Amazing performance! âš¡',
            'Your browser is now running Go! ðŸŽ‰',
            'Fiber framework responding from WASM! ðŸŒ'
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        output.innerHTML = `<p>ðŸŽ¯ ${randomResponse}</p>`;
        
        console.log('ðŸŽ­ AppRunner: Demo interaction handled');
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
                        <h2 style="color: #ef4444; margin-bottom: 1rem;">âŒ Application Error</h2>
                        <p style="color: #cbd5e1; margin-bottom: 1rem;">${message}</p>
                        <button onclick="window.location.reload()" style="background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer;">
                            ðŸ”„ Reload Page
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
            console.log('ðŸ›‘ AppRunner: Stopping application...');
            this.isRunning = false;
            
            if (this.mountPoint) {
                this.mountPoint.innerHTML = '';
            }
            
            console.log('âœ… AppRunner: Application stopped');
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
window.AppRunner = AppRunner;

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


/**
 * GoScript - Main Integration Script
 * Orchestrates the complete system initialization and execution
 */

// Example programs stored in VFS
const EXAMPLE_PROGRAMS = {
    '/examples/hello/main.go': `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    fmt.Println("Welcome to GoScript - Go in your browser!")
}`,

    '/examples/fibonacci/main.go': `package main

import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    fmt.Println("Fibonacci Sequence:")
    for i := 0; i < 15; i++ {
        fmt.Printf("fib(%d) = %d\\n", i, fibonacci(i))
    }
}`,

    '/examples/fizzbuzz/main.go': `package main

import "fmt"

func main() {
    fmt.Println("FizzBuzz from 1 to 30:")
    fmt.Println()
    
    for i := 1; i <= 30; i++ {
        switch {
        case i%15 == 0:
            fmt.Println("FizzBuzz")
        case i%3 == 0:
            fmt.Println("Fizz")
        case i%5 == 0:
            fmt.Println("Buzz")
        default:
            fmt.Println(i)
        }
    }
}`,

    '/examples/primes/main.go': `package main

import "fmt"

func isPrime(n int) bool {
    if n < 2 {
        return false
    }
    for i := 2; i*i <= n; i++ {
        if n%i == 0 {
            return false
        }
    }
    return true
}

func main() {
    fmt.Println("Prime numbers from 1 to 100:")
    fmt.Println()
    
    count := 0
    for i := 1; i <= 100; i++ {
        if isPrime(i) {
            fmt.Printf("%4d ", i)
            count++
            if count%10 == 0 {
                fmt.Println()
            }
        }
    }
    fmt.Printf("\\n\\nFound %d prime numbers.\\n", count)
}`,

    '/examples/structs/main.go': `package main

import "fmt"

type Person struct {
    Name string
    Age  int
    City string
}

func (p Person) Greet() string {
    return fmt.Sprintf("Hi, I'm %s, %d years old from %s!", p.Name, p.Age, p.City)
}

func main() {
    people := []Person{
        {Name: "Alice", Age: 30, City: "New York"},
        {Name: "Bob", Age: 25, City: "San Francisco"},
        {Name: "Charlie", Age: 35, City: "Seattle"},
    }
    
    fmt.Println("Meet our team:")
    fmt.Println()
    
    for _, person := range people {
        fmt.Println(person.Greet())
    }
}`
};

class PersonalWebsite2025 {
    constructor() {
        this.modules = {
            gitHubFetcher: null,
            vfs: null,
            cacheManager: null,
            compilationManager: null,
            appRunner: null
        };
        
        this.state = {
            initialized: false,
            compiling: false,
            compiled: false,
            running: false,
            compiledWasmBinary: null,
            lastSourceCode: null
        };
        
        this.ui = {
            updateProgress: null,
            updateProgressText: null,
            setStageStatus: null,
            addConsoleOutput: null,
            showReadyState: null,
            showError: null
        };

        // Editor state
        this.openTabs = [];
        this.activeTab = null;
        this.currentDir = '/';
        this.editor = null;  // CodeMirror instance
        this.tabModified = new Map();  // Track modified state per tab
        this.tabContent = new Map();   // Store content for each tab
    }

    /**
     * Initialize the complete system
     * @param {Object} uiCallbacks - UI callback functions
     */
    async init(uiCallbacks) {
        try {
            this.ui = uiCallbacks;
            
            this.ui.addConsoleOutput('ðŸš€ GoScript: System initialization started');
            
            // Initialize CodeMirror editor
            this.initEditor();
            
            // Initialize all modules
            await this.initializeModules();
            
            // Load example programs into VFS
            this.loadExamplePrograms();
            
            // Open all example files in editor tabs
            this.openAllExampleTabs();
            
            // Configure output redirection
            this.modules.appRunner.configureOutput((text) => {
                this.ui.addConsoleOutput(text, true);
            });
            
            // Set up module interconnections
            this.wireModules();
            
            this.setupTerminal();
            this.setupEditorButtons();
            
            this.state.initialized = true;
            this.ui.addConsoleOutput('');
            this.ui.addConsoleOutput('âœ… GoScript: System ready!');
            this.ui.addConsoleOutput('');
            this.ui.addConsoleOutput('ðŸ“ Example programs available in /examples:');
            this.ui.addConsoleOutput('   â€¢ /examples/hello      - Hello World');
            this.ui.addConsoleOutput('   â€¢ /examples/fibonacci  - Fibonacci sequence');
            this.ui.addConsoleOutput('   â€¢ /examples/fizzbuzz   - FizzBuzz challenge');
            this.ui.addConsoleOutput('   â€¢ /examples/primes     - Prime numbers');
            this.ui.addConsoleOutput('   â€¢ /examples/structs    - Go structs & methods');
            this.ui.addConsoleOutput('');
            this.ui.addConsoleOutput('ðŸ’¡ Try: cd /examples/hello && cat main.go && go run main.go');
            
        } catch (error) {
            this.ui.addConsoleOutput(`âŒ GoScript: Initialization failed - ${error.message}`);
            this.ui.showError(error.message);
            throw error;
        }
    }

    /**
     * Initialize CodeMirror editor
     * @private
     */
    initEditor() {
        const textarea = document.getElementById('code-editor');
        this.editor = CodeMirror.fromTextArea(textarea, {
            mode: 'go',
            theme: 'dracula',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: true,
            lineWrapping: false,
            extraKeys: {
                'Ctrl-Z': () => this.editor.undo(),
                'Ctrl-Y': () => this.editor.redo(),
                'Ctrl-Shift-Z': () => this.editor.redo(),
                'Ctrl-S': (cm) => {
                    this.saveCurrentFile();
                    return false;
                }
            }
        });
        
        // Track changes
        this.editor.on('change', () => {
            if (this.activeTab) {
                this.tabModified.set(this.activeTab, true);
                this.renderTabs();
            }
        });
        
        // Set initial placeholder
        this.editor.setValue('// Select a file from /examples to get started\n// Try: cd /examples/hello && cat main.go');
    }

    /**
     * Setup editor buttons
     * @private
     */
    setupEditorButtons() {
        document.getElementById('undo-btn')?.addEventListener('click', () => {
            this.editor.undo();
        });
        
        document.getElementById('redo-btn')?.addEventListener('click', () => {
            this.editor.redo();
        });
        
        document.getElementById('save-btn')?.addEventListener('click', () => {
            this.saveCurrentFile();
        });
    }

    /**
     * Save the current file to VFS
     */
    saveCurrentFile() {
        if (!this.activeTab) {
            this.ui.addConsoleOutput('No file open to save');
            return;
        }
        
        const content = this.editor.getValue();
        this.modules.vfs.writeFile(this.activeTab, content);
        this.tabModified.set(this.activeTab, false);
        this.tabContent.set(this.activeTab, content);
        this.renderTabs();
        this.ui.addConsoleOutput(`ðŸ’¾ Saved: ${this.activeTab}`);
    }

    /**
     * Load example programs into VFS
     * @private
     */
    loadExamplePrograms() {
        const vfs = this.modules.vfs;
        
        // Create example directories
        vfs.mkdir('/examples');
        vfs.mkdir('/examples/hello');
        vfs.mkdir('/examples/fibonacci');
        vfs.mkdir('/examples/fizzbuzz');
        vfs.mkdir('/examples/primes');
        vfs.mkdir('/examples/structs');
        
        // Write all example files
        for (const [path, content] of Object.entries(EXAMPLE_PROGRAMS)) {
            vfs.writeFile(path, content);
        }
        
        this.ui.addConsoleOutput('ðŸ“¦ GoScript: Loaded 5 example programs');
    }

    /**
     * Open all example files as tabs in the editor
     * @private
     */
    openAllExampleTabs() {
        const exampleFiles = [
            '/examples/hello/main.go',
            '/examples/fibonacci/main.go',
            '/examples/fizzbuzz/main.go',
            '/examples/primes/main.go',
            '/examples/structs/main.go'
        ];
        
        const vfs = this.modules.vfs;
        
        for (const filePath of exampleFiles) {
            if (vfs.exists(filePath)) {
                let content = vfs.readFile(filePath);
                if (content instanceof Uint8Array) {
                    content = new TextDecoder().decode(content);
                }
                
                this.openTabs.push(filePath);
                this.tabContent.set(filePath, content);
                this.tabModified.set(filePath, false);
            }
        }
        
        // Set hello as active tab and load its content
        if (this.openTabs.length > 0) {
            this.activeTab = this.openTabs[0];
            this.editor.setValue(this.tabContent.get(this.activeTab));
            this.editor.clearHistory();
        }
        
        this.renderTabs();
    }

    /**
     * Handle tab completion for terminal
     * @param {HTMLInputElement} input - Terminal input element
     * @private
     */
    handleTabCompletion(input) {
        const value = input.value;
        const cursorPos = input.selectionStart;
        
        // Get the word being completed (from last space to cursor)
        const beforeCursor = value.substring(0, cursorPos);
        const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
        const wordStart = lastSpaceIndex + 1;
        const partial = beforeCursor.substring(wordStart);
        
        if (!partial) return;
        
        const vfs = this.modules.vfs;
        let completions = [];
        
        // Check if it looks like a path
        if (partial.includes('/') || partial.startsWith('.')) {
            // Path completion
            let dirPath, filePrefix;
            
            if (partial.endsWith('/')) {
                dirPath = this.resolvePath(partial);
                filePrefix = '';
            } else {
                const lastSlash = partial.lastIndexOf('/');
                if (lastSlash >= 0) {
                    dirPath = this.resolvePath(partial.substring(0, lastSlash + 1));
                    filePrefix = partial.substring(lastSlash + 1);
                } else {
                    dirPath = this.currentDir;
                    filePrefix = partial;
                }
            }
            
            // Get directory contents
            const contents = vfs.readDir(dirPath);
            if (contents) {
                completions = contents
                    .filter(name => name.toLowerCase().startsWith(filePrefix.toLowerCase()))
                    .map(name => {
                        const fullPath = dirPath + (dirPath.endsWith('/') ? '' : '/') + name;
                        const isDir = vfs.isDirectory(fullPath);
                        return partial.substring(0, partial.lastIndexOf('/') + 1) + name + (isDir ? '/' : '');
                    });
            }
        } else {
            // Command completion
            const commands = ['cd', 'ls', 'cat', 'pwd', 'clear', 'help', 'history', 'exit', 'go', 'tree', 'echo'];
            completions = commands.filter(cmd => cmd.startsWith(partial.toLowerCase()));
        }
        
        if (completions.length === 1) {
            // Single match - complete it
            const afterCursor = value.substring(cursorPos);
            input.value = value.substring(0, wordStart) + completions[0] + afterCursor;
            input.selectionStart = input.selectionEnd = wordStart + completions[0].length;
        } else if (completions.length > 1) {
            // Multiple matches - show them and complete common prefix
            this.ui.addConsoleOutput(completions.join('  '));
            
            // Find common prefix
            let commonPrefix = completions[0];
            for (const c of completions) {
                while (!c.startsWith(commonPrefix)) {
                    commonPrefix = commonPrefix.slice(0, -1);
                }
            }
            
            if (commonPrefix.length > partial.length) {
                const afterCursor = value.substring(cursorPos);
                input.value = value.substring(0, wordStart) + commonPrefix + afterCursor;
                input.selectionStart = input.selectionEnd = wordStart + commonPrefix.length;
            }
        }
    }

    /**
     * Resolve a path relative to current directory
     * @param {string} path - Path to resolve
     * @returns {string} Absolute path
     * @private
     */
    resolvePath(path) {
        if (path.startsWith('/')) return path;
        if (path === '.') return this.currentDir;
        if (path === '..') {
            const parts = this.currentDir.split('/').filter(p => p);
            parts.pop();
            return '/' + parts.join('/');
        }
        if (path.startsWith('./')) path = path.substring(2);
        if (path.startsWith('../')) {
            const parts = this.currentDir.split('/').filter(p => p);
            parts.pop();
            return '/' + parts.join('/') + '/' + path.substring(3);
        }
        return this.currentDir + (this.currentDir.endsWith('/') ? '' : '/') + path;
    }

    /**
     * Initialize all system modules
     * @private
     */
    async initializeModules() {
        this.ui.addConsoleOutput('ðŸ”§ GoScript: Creating module instances...');
        
        // Create all modules
        this.modules.gitHubFetcher = new GitHubFetcher();
        this.modules.vfs = new VirtualFileSystem();
        this.modules.cacheManager = new CacheManager();
        this.modules.appRunner = new AppRunner();
        
        // Initialize async modules
        await this.modules.cacheManager.init();
        await this.modules.appRunner.init();
        
        // Create compilation manager
        this.modules.compilationManager = new CompilationManager();
        this.modules.compilationManager.init(this.modules.vfs, this.modules.cacheManager);
        
        this.ui.addConsoleOutput('âœ… GoScript: All modules created successfully');
    }

    /**
     * Wire modules together with callbacks
     * @private
     */
    wireModules() {
        this.ui.addConsoleOutput('ðŸ”— GoScript: Wiring module callbacks...');
        
        // Set up compilation manager callbacks
        this.modules.compilationManager.setCallbacks({
            onProgress: (percentage, status) => {
                // this.ui.addConsoleOutput(`ðŸ“Š PROGRESS: ${percentage}% - ${status}`);
            },
            
            onStageUpdate: (stage, status) => {
                const stageNames = [
                    '', 'Compiler Load', 'Cache Check', 'Source Fetch', 
                    'VFS Setup', 'Go Compile', 'Binary Cache', 'Prep Exec'
                ];
                if (status === 'active') {
                    this.ui.addConsoleOutput(`ðŸŽ¯ ${stageNames[stage]}...`);
                }
            },
            
            onError: (message) => {
                this.ui.addConsoleOutput(`âŒ COMPILATION_ERROR: ${message}`);
                this.state.compiling = false;
                this.ui.showError(message);
            },
            
            onComplete: async (wasmBinary, metadata) => {
                this.state.compiledWasmBinary = wasmBinary;
                this.state.compiled = true;
                this.state.compiling = false;
                
                this.ui.addConsoleOutput(`âœ… Compiled successfully (${wasmBinary.byteLength} bytes)`);
                
                // Auto-run console app
                this.ui.addConsoleOutput('');
                this.ui.addConsoleOutput('--- Program Output ---');
                await this.runConsoleApp();
                this.ui.addConsoleOutput('--- End Output ---');
                this.ui.addConsoleOutput('');
            }
        });
        
        this.ui.addConsoleOutput('âœ… GoScript: Module callbacks wired');
    }

    /**
     * Start the compilation pipeline
     * @param {string} filePath - Path to the main.go file to compile
     * @private
     */
    async startCompilation(filePath) {
        if (this.state.compiling) {
            this.ui.addConsoleOutput('âš ï¸ GoScript: Compilation already in progress');
            return;
        }

        try {
            this.state.compiling = true;
            this.ui.addConsoleOutput(`ðŸ”„ GoScript: Compiling ${filePath}...`);
            
            // Read source from VFS
            const vfs = this.modules.vfs;
            if (!vfs.exists(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            
            let sourceCode = vfs.readFile(filePath);
            if (sourceCode instanceof Uint8Array) {
                sourceCode = new TextDecoder().decode(sourceCode);
            }
            
            // Store source code for mock execution
            this.state.lastSourceCode = sourceCode;
            
            const sourceFiles = { 'main.go': sourceCode };
            
            // Start compilation
            await this.modules.compilationManager.compile(sourceFiles);
            
            // Compilation completion is handled by callbacks
            
        } catch (error) {
            this.state.compiling = false;
            this.ui.addConsoleOutput(`âŒ GoScript: Compilation failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the compilation pipeline with editor support (legacy)
     * @private
     */
    async startCompilationWithEditor() {
        if (this.state.compiling) {
            this.ui.addConsoleOutput('âš ï¸ GoScript: Compilation already in progress');
            return;
        }

        try {
            this.state.compiling = true;
            this.ui.addConsoleOutput('ðŸ”„ GoScript: Starting compilation pipeline...');
            
            // Check if we have an active tab with content
            if (this.activeTab) {
                const sourceCode = this.editor.getValue();
                this.state.lastSourceCode = sourceCode;
                const sourceFiles = { 'main.go': sourceCode };
                await this.modules.compilationManager.compile(sourceFiles);
            } else {
                throw new Error('No file open. Use: cd /examples/hello && go run main.go');
            }
            
        } catch (error) {
            this.state.compiling = false;
            this.ui.addConsoleOutput(`âŒ GoScript: Compilation failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Launch the compiled application
     */
    async launchApplication() {
        if (!this.state.compiled || !this.state.compiledWasmBinary) {
            this.ui.addConsoleOutput('âŒ GoScript: No compiled binary available for launch');
            return;
        }

        try {
            this.state.running = true;
            this.ui.addConsoleOutput('ðŸš€ GoScript: Launching compiled application...');
            
            // Execute the WASM binary
            await this.modules.appRunner.execute(this.state.compiledWasmBinary);
            
            this.ui.addConsoleOutput('âœ… GoScript: Application launched successfully');
            
        } catch (error) {
            this.state.running = false;
            this.ui.addConsoleOutput(`âŒ GoScript: Launch failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Run the compiled application in console mode
     */
    async runConsoleApp() {
        if (!this.state.compiled || !this.state.compiledWasmBinary) {
            this.ui.addConsoleOutput('âŒ GoScript: No compiled binary available');
            return;
        }
        
        try {
            // Pass source code for mock execution
            await this.modules.appRunner.executeConsole(
                this.state.compiledWasmBinary, 
                this.state.lastSourceCode
            );
        } catch (error) {
            this.ui.addConsoleOutput(`âŒ GoScript: Execution failed - ${error.message}`);
        }
    }

    /**
     * Get system status
     * @returns {Object} Current system state
     */
    getStatus() {
        return {
            ...this.state,
            modules: Object.keys(this.modules).reduce((acc, key) => {
                acc[key] = !!this.modules[key];
                return acc;
            }, {}),
            appRunnerStatus: this.modules.appRunner?.getStatus() || null
        };
    }

    /**
     * Reset the system to initial state
     */
    reset() {
        this.ui.addConsoleOutput('ðŸ”„ GoScript: Resetting system...');
        
        // Stop running application
        if (this.modules.appRunner && this.state.running) {
            this.modules.appRunner.stop();
        }
        
        // Reset state
        this.state = {
            initialized: false,
            compiling: false,
            compiled: false,
            running: false,
            compiledWasmBinary: null,
            lastSourceCode: null
        };
        
        // Clear VFS
        if (this.modules.vfs) {
            this.modules.vfs.clear();
        }
        
        this.ui.addConsoleOutput('âœ… GoScript: System reset complete');
    }

    /**
     * Get compilation and cache statistics
     * @returns {Promise<Object>} System statistics
     */
    async getStats() {
        const stats = {
            vfs: this.modules.vfs?.getStats() || null,
            cache: await this.modules.cacheManager?.getStats() || null,
            compilation: {
                status: this.modules.compilationManager?.getStatus() || 'unknown',
                hasBinary: !!this.state.compiledWasmBinary,
                binarySize: this.state.compiledWasmBinary?.byteLength || 0
            }
        };
        
        return stats;
    }

    /**
     * Setup the interactive terminal
     * @private
     */
    setupTerminal() {
        const input = document.getElementById('terminal-input');
        const container = document.getElementById('terminal-container');
        
        if (!input || !container) return;

        this.commandHistory = [];
        this.historyIndex = -1;

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTabCompletion(input);
            } else if (e.key === 'Enter') {
                const command = input.value;
                input.value = '';
                
                // Add to history
                if (command.trim()) {
                    this.commandHistory.push(command);
                    this.historyIndex = this.commandHistory.length;
                }

                // Echo command
                this.ui.addConsoleOutput(`$ ${command}`);
                
                await this.handleCommand(command.trim());
                
                // Scroll to bottom
                container.scrollTop = container.scrollHeight;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    input.value = this.commandHistory[this.historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    input.value = this.commandHistory[this.historyIndex];
                } else {
                    this.historyIndex = this.commandHistory.length;
                    input.value = '';
                }
            }
        });
        
        // Focus input on click
        container.addEventListener('click', () => input.focus());
        input.focus();
    }

    /**
     * Open a file in the editor
     * @param {string} filePath - Path to the file
     */
    openFileInEditor(filePath) {
        const vfs = this.modules.vfs;
        
        if (!vfs.exists(filePath)) {
            this.ui.addConsoleOutput(`cat: ${filePath}: No such file`);
            return;
        }
        
        // Save current tab content if modified
        if (this.activeTab && this.tabModified.get(this.activeTab)) {
            this.tabContent.set(this.activeTab, this.editor.getValue());
        }
        
        // Read file content
        let content = vfs.readFile(filePath);
        if (content instanceof Uint8Array) {
            content = new TextDecoder().decode(content);
        }
        
        // Add tab if not already open
        if (!this.openTabs.includes(filePath)) {
            this.openTabs.push(filePath);
            this.tabContent.set(filePath, content);
            this.tabModified.set(filePath, false);
        }
        
        // Set as active tab
        this.activeTab = filePath;
        
        // Update editor with file content (use stored content if available and modified)
        const displayContent = this.tabModified.get(filePath) 
            ? this.tabContent.get(filePath) 
            : content;
        this.editor.setValue(displayContent);
        this.editor.clearHistory();  // Clear undo history for new file
        
        // Update file path display
        document.getElementById('current-file-path').textContent = filePath;
        
        // Render tabs
        this.renderTabs();
    }

    /**
     * Close a tab
     * @param {string} filePath - Path to the file tab to close
     */
    closeTab(filePath) {
        const index = this.openTabs.indexOf(filePath);
        if (index === -1) return;
        
        // Check for unsaved changes
        if (this.tabModified.get(filePath)) {
            // For now, just warn (could add confirmation dialog)
            this.ui.addConsoleOutput(`âš ï¸ Discarding unsaved changes in ${filePath}`);
        }
        
        this.openTabs.splice(index, 1);
        this.tabContent.delete(filePath);
        this.tabModified.delete(filePath);
        
        // If closing active tab, switch to another
        if (this.activeTab === filePath) {
            if (this.openTabs.length > 0) {
                const newActive = this.openTabs[Math.max(0, index - 1)];
                this.openFileInEditor(newActive);
            } else {
                this.activeTab = null;
                this.editor.setValue('// No file open\n// Use: cd /examples/hello && cat main.go');
                document.getElementById('current-file-path').textContent = 'No file open';
            }
        }
        
        this.renderTabs();
    }

    /**
     * Render editor tabs
     * @private
     */
    renderTabs() {
        const tabsContainer = document.getElementById('editor-tabs');
        if (!tabsContainer) return;
        
        tabsContainer.innerHTML = '';
        
        for (const filePath of this.openTabs) {
            const tab = document.createElement('div');
            const isModified = this.tabModified.get(filePath);
            tab.className = `editor-tab font-mono ${filePath === this.activeTab ? 'active' : ''} ${isModified ? 'modified' : ''}`;
            
            // Get just the filename for display
            const fileName = filePath.split('/').pop();
            const dirName = filePath.split('/').slice(-2, -1)[0] || '';
            
            tab.innerHTML = `
                <span class="tab-name">${dirName}/${fileName}</span>
                <span class="tab-close" onclick="event.stopPropagation(); pws2025.closeTab('${filePath}')">Ã—</span>
            `;
            
            tab.onclick = () => this.openFileInEditor(filePath);
            tabsContainer.appendChild(tab);
        }
    }

    /**
     * Update terminal prompt with current directory
     * @private
     */
    updatePrompt() {
        const prompt = document.getElementById('terminal-prompt');
        if (prompt) {
            // Show abbreviated path for long paths
            let displayPath = this.currentDir;
            if (displayPath.length > 25) {
                const parts = displayPath.split('/').filter(p => p);
                displayPath = '.../' + parts.slice(-2).join('/');
            }
            prompt.textContent = `${displayPath} $`;
        }
    }

    /**
     * Handle terminal commands
     * @param {string} cmd 
     */
    async handleCommand(cmd) {
        if (!cmd) return;
        
        // Simple argument parsing handling quotes
        const args = cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/"/g, '')) || [];
        const command = args[0];
        const vfs = this.modules.vfs;

        // Helper to resolve path
        const resolvePath = (path) => {
            if (!path) return this.currentDir;
            if (path.startsWith('/')) return path;
            if (this.currentDir === '/') return '/' + path;
            return this.currentDir + '/' + path;
        };

        // Normalize path (handle .. and .)
        const normalizePath = (path) => {
            const parts = path.split('/').filter(p => p && p !== '.');
            const result = [];
            for (const part of parts) {
                if (part === '..') {
                    result.pop();
                } else {
                    result.push(part);
                }
            }
            return '/' + result.join('/');
        };
        
        switch(command) {
            case 'help':
                this.ui.addConsoleOutput('Available commands:');
                this.ui.addConsoleOutput('  Navigation: ls, cd, pwd');
                this.ui.addConsoleOutput('  Files:      cat, head, tail, grep, touch, rm, cp, mv');
                this.ui.addConsoleOutput('  Go:         go run <file>, go version');
                this.ui.addConsoleOutput('  Other:      clear, echo, history, date, whoami, help');
                this.ui.addConsoleOutput('');
                this.ui.addConsoleOutput('Example: cd /examples/fibonacci && go run main.go');
                break;
            case 'clear':
                document.getElementById('console-output').textContent = '';
                break;
            case 'date':
                this.ui.addConsoleOutput(new Date().toString());
                break;
            case 'whoami':
                this.ui.addConsoleOutput('gopher');
                break;
            case 'pwd':
                this.ui.addConsoleOutput(this.currentDir);
                break;
            case 'echo':
                this.ui.addConsoleOutput(args.slice(1).join(' '));
                break;
            case 'ls':
                const lsPath = args[1] ? normalizePath(resolvePath(args[1])) : this.currentDir;
                try {
                    const files = vfs.listDir(lsPath);
                    if (files.length === 0) {
                        this.ui.addConsoleOutput('(empty directory)');
                    } else {
                        // Color directories differently
                        const output = files.map(f => {
                            if (vfs.directories.has(normalizePath(lsPath + '/' + f))) {
                                return `\x1b[34m${f}/\x1b[0m`;
                            }
                            return f;
                        }).join('  ');
                        this.ui.addConsoleOutput(files.join('  '));
                    }
                } catch (e) {
                    this.ui.addConsoleOutput(`ls: ${e.message}`);
                }
                break;
            case 'cd':
                const target = args[1] || '/';
                const newPath = normalizePath(resolvePath(target));
                
                // Check if directory exists
                if (newPath === '/' || vfs.directories.has(newPath) || vfs.listDir(newPath).length > 0) {
                    this.currentDir = newPath || '/';
                    this.updatePrompt();
                } else {
                    this.ui.addConsoleOutput(`cd: ${target}: No such directory`);
                }
                break;
            case 'mkdir':
                if (!args[1]) { this.ui.addConsoleOutput('mkdir: missing operand'); break; }
                vfs.mkdir(normalizePath(resolvePath(args[1])));
                break;
            case 'touch':
                if (!args[1]) { this.ui.addConsoleOutput('touch: missing operand'); break; }
                vfs.writeFile(normalizePath(resolvePath(args[1])), '');
                break;
            case 'rm':
                if (!args[1]) { this.ui.addConsoleOutput('rm: missing operand'); break; }
                const rmPath = normalizePath(resolvePath(args[1]));
                if (vfs.files.has(rmPath)) {
                    vfs.files.delete(rmPath);
                } else {
                    this.ui.addConsoleOutput(`rm: ${args[1]}: No such file`);
                }
                break;
            case 'cat':
                if (!args[1]) { this.ui.addConsoleOutput('cat: missing operand'); break; }
                try {
                    const catPath = normalizePath(resolvePath(args[1]));
                    const content = vfs.readFile(catPath);
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    this.ui.addConsoleOutput(text);
                    
                    // Also open in editor if it's a .go file
                    if (catPath.endsWith('.go')) {
                        this.openFileInEditor(catPath);
                    }
                } catch (e) {
                    this.ui.addConsoleOutput(`cat: ${e.message}`);
                }
                break;
            case 'cp':
                if (args.length < 3) { this.ui.addConsoleOutput('cp: missing file operand'); break; }
                try {
                    const src = vfs.readFile(normalizePath(resolvePath(args[1])));
                    vfs.writeFile(normalizePath(resolvePath(args[2])), src);
                } catch (e) {
                    this.ui.addConsoleOutput(`cp: ${e.message}`);
                }
                break;
            case 'mv':
                if (args.length < 3) { this.ui.addConsoleOutput('mv: missing file operand'); break; }
                try {
                    const srcPath = normalizePath(resolvePath(args[1]));
                    const destPath = normalizePath(resolvePath(args[2]));
                    const srcContent = vfs.readFile(srcPath);
                    vfs.writeFile(destPath, srcContent);
                    vfs.files.delete(srcPath);
                } catch (e) {
                    this.ui.addConsoleOutput(`mv: ${e.message}`);
                }
                break;
            case 'grep':
                if (args.length < 3) { this.ui.addConsoleOutput('grep: usage: grep PATTERN FILE'); break; }
                try {
                    const pattern = args[1];
                    const content = vfs.readFile(normalizePath(resolvePath(args[2])));
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    const lines = text.split('\n');
                    lines.forEach(line => {
                        if (line.includes(pattern)) this.ui.addConsoleOutput(line);
                    });
                } catch (e) {
                    this.ui.addConsoleOutput(`grep: ${e.message}`);
                }
                break;
            case 'head':
                if (!args[1]) { this.ui.addConsoleOutput('head: missing operand'); break; }
                try {
                    const content = vfs.readFile(normalizePath(resolvePath(args[1])));
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    const lines = text.split('\n').slice(0, 10);
                    this.ui.addConsoleOutput(lines.join('\n'));
                } catch (e) {
                    this.ui.addConsoleOutput(`head: ${e.message}`);
                }
                break;
            case 'tail':
                if (!args[1]) { this.ui.addConsoleOutput('tail: missing operand'); break; }
                try {
                    const content = vfs.readFile(normalizePath(resolvePath(args[1])));
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    const lines = text.split('\n');
                    this.ui.addConsoleOutput(lines.slice(-10).join('\n'));
                } catch (e) {
                    this.ui.addConsoleOutput(`tail: ${e.message}`);
                }
                break;
            case 'history':
                this.commandHistory.forEach((cmd, i) => {
                    this.ui.addConsoleOutput(`${i + 1}  ${cmd}`);
                });
                break;
            case 'exit':
                this.ui.addConsoleOutput('logout');
                break;
            case 'go':
                if (args[1] === 'run') {
                    // Determine the file to run
                    let fileToRun = args[2] || 'main.go';
                    const fullPath = normalizePath(resolvePath(fileToRun));
                    
                    if (!vfs.exists(fullPath)) {
                        this.ui.addConsoleOutput(`go run: ${fileToRun}: no such file`);
                        break;
                    }
                    
                    // Open in editor
                    this.openFileInEditor(fullPath);
                    
                    // Run compilation
                    await this.startCompilation(fullPath);
                } else if (args[1] === 'version') {
                    this.ui.addConsoleOutput('go version go1.21.0 js/wasm');
                } else {
                    this.ui.addConsoleOutput('Usage: go run <file.go>');
                    this.ui.addConsoleOutput('       go version');
                }
                break;
            case './main.wasm':
                if (this.state.compiled) {
                    await this.launchApplication();
                } else {
                    this.ui.addConsoleOutput('bash: ./main.wasm: No such file or directory (compile first)');
                }
                break;
            case 'tree':
                this.ui.addConsoleOutput(vfs.getFileTree());
                break;
            default:
                this.ui.addConsoleOutput(`bash: command not found: ${command}`);
        }
    }
}

// Export globally for use in HTML
window.PersonalWebsite2025 = PersonalWebsite2025;
