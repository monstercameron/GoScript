/**
 * GoScript SDK v1.0.0
 * Browser-based Go compiler using WebAssembly
 *
 * Includes:
 * - GoScript SDK (MIT License)
 * - Go wasm_exec.js (BSD License)
 *
 * Built: 2026-03-06 05:45:58
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


