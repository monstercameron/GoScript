(function () {
    const DEFAULT_CONFIG = {
        packUrl: 'assets/goscript.pack',
        debug: true,
        releasePackUrl: 'https://github.com/monstercameron/GoScript/releases/download/demo/goscript.pack'
    };

    const LOCAL_PACK_CACHE_KEY = 'local-pack://goscript.pack';
    const PACK_SOURCE_STORAGE_KEY = 'goscript-preferred-pack-source';
    const PACK_PANEL_COLLAPSED_STORAGE_KEY = 'goscript-pack-panel-collapsed';

    function createTerminalLogger(container) {
        const originalConsole = {
            log: console.log.bind(console),
            info: typeof console.info === 'function' ? console.info.bind(console) : console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: typeof console.debug === 'function' ? console.debug.bind(console) : console.log.bind(console)
        };

        const colors = {
            log: 'text-slate-300',
            info: 'text-cyan-300',
            warn: 'text-amber-300',
            error: 'text-rose-300',
            debug: 'text-violet-300'
        };

        function stringifyPart(value) {
            if (value instanceof Error) {
                return value.stack || value.message;
            }

            if (typeof value === 'string') {
                return value;
            }

            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        }

        function append(level, args) {
            if (!container) {
                return;
            }

            const line = document.createElement('div');
            line.className = `font-mono text-xs leading-5 ${colors[level] || colors.log}`;
            line.style.whiteSpace = 'pre-wrap';
            line.style.overflowWrap = 'anywhere';
            line.style.wordBreak = 'break-word';

            const timestamp = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const renderedArgs = args.map(stringifyPart).join(' ');
            line.textContent = `[${timestamp}] ${level.toUpperCase()} ${renderedArgs}`;
            container.appendChild(line);
            container.scrollTop = container.scrollHeight;
        }

        function mirror(level) {
            return (...args) => {
                originalConsole[level](...args);
                append(level, args);
            };
        }

        return {
            install() {
                console.log = mirror('log');
                console.info = mirror('info');
                console.warn = mirror('warn');
                console.error = mirror('error');
                console.debug = mirror('debug');
            },
            clear() {
                if (container) {
                    container.textContent = '';
                }
            },
            log(...args) {
                console.log(...args);
            },
            warn(...args) {
                console.warn(...args);
            },
            error(...args) {
                console.error(...args);
            }
        };
    }

    function createToastApi(container) {
        if (!container) {
            return {
                show: () => null,
                update: () => {},
                dismiss: () => {}
            };
        }

        const colors = {
            info: 'bg-slate-800 border-indigo-500',
            success: 'bg-slate-800 border-emerald-500',
            error: 'bg-slate-800 border-red-500',
            loading: 'bg-slate-800 border-amber-500'
        };

        const icons = {
            info: 'i',
            success: 'OK',
            error: 'ERR',
            loading: '...'
        };

        function dismiss(toast) {
            if (!toast) {
                return;
            }

            toast.classList.remove('translate-x-0');
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }

        function show(message, type = 'info', duration = 4000) {
            const toast = document.createElement('div');
            toast.className = `flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 shadow-lg transform translate-x-full transition-transform duration-300 ${colors[type]}`;
            toast.innerHTML = `
                <span class="text-sm font-bold text-gray-200 min-w-[2rem]">${icons[type]}</span>
                <span class="text-gray-100 text-sm font-medium">${message}</span>
            `;

            container.appendChild(toast);
            requestAnimationFrame(() => {
                toast.classList.remove('translate-x-full');
                toast.classList.add('translate-x-0');
            });

            if (type !== 'loading' && duration > 0) {
                setTimeout(() => dismiss(toast), duration);
            }

            return toast;
        }

        function update(toast, message, type = 'success') {
            if (!toast) {
                return;
            }

            toast.className = toast.className.replace(/border-(indigo|emerald|red|amber)-500/, colors[type].split(' ')[1]);
            toast.innerHTML = `
                <span class="text-sm font-bold text-gray-200 min-w-[2rem]">${icons[type]}</span>
                <span class="text-gray-100 text-sm font-medium">${message}</span>
            `;

            if (type !== 'loading') {
                setTimeout(() => dismiss(toast), 3000);
            }
        }

        return { show, update, dismiss };
    }

    async function bootstrap() {
        const config = { ...DEFAULT_CONFIG, ...(window.GoScriptPlaygroundConfig || {}) };
        const examples = window.GoScriptExamples || {};

        const sourceEl = document.getElementById('source');
        const outputEl = document.getElementById('output');
        const btnRun = document.getElementById('btn-run');
        const btnClear = document.getElementById('btn-clear');
        const btnDownload = document.getElementById('btn-download');
        const packDownloadLink = document.getElementById('pack-download-link');
        const packFileEl = document.getElementById('pack-file');
        const btnLoadPack = document.getElementById('btn-load-pack');
        const btnClearPackCache = document.getElementById('btn-clear-pack-cache');
        const btnClearWasmCache = document.getElementById('btn-clear-wasm-cache');
        const btnTogglePackPanel = document.getElementById('btn-toggle-pack-panel');
        const packPanelBody = document.getElementById('pack-panel-body');
        const packPanelSummary = document.getElementById('pack-panel-summary');
        const packFileNameEl = document.getElementById('pack-file-name');
        const packSourceEl = document.getElementById('pack-source');
        const packCacheStatusEl = document.getElementById('pack-cache-status');
        const examplesEl = document.getElementById('examples');
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        const progressBar = document.getElementById('progress-bar');
        const compileTimeEl = document.getElementById('compile-time');
        const wasmSizeEl = document.getElementById('wasm-size');
        const terminalEl = document.getElementById('terminal-log');
        const btnClearTerminal = document.getElementById('btn-clear-terminal');
        const toastApi = createToastApi(document.getElementById('toast-container'));
        const terminalLogger = createTerminalLogger(terminalEl);

        if (!sourceEl || !outputEl || !btnRun || !btnClear || !btnDownload || !packFileEl || !btnLoadPack || !btnClearPackCache || !btnClearWasmCache || !btnTogglePackPanel || !packPanelBody || !packPanelSummary || !packFileNameEl || !packSourceEl || !packCacheStatusEl || !examplesEl || !statusDot || !statusText || !progressBar || !compileTimeEl || !wasmSizeEl || !terminalEl || !btnClearTerminal) {
            throw new Error('GoScript playground DOM is incomplete.');
        }

        terminalLogger.install();

        if (packDownloadLink) {
            packDownloadLink.href = config.releasePackUrl;
        }

        const editor = CodeMirror.fromTextArea(sourceEl, {
            mode: 'go',
            theme: 'dracula',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: true,
            extraKeys: {
                'Ctrl-Enter': () => btnRun.click(),
                'Cmd-Enter': () => btnRun.click()
            }
        });
        editor.on('change', () => {
            if (currentExampleKey && examples[currentExampleKey] !== editor.getValue()) {
                currentExampleKey = null;
            }
        });

        let gs = null;
        let gsInitialized = false;
        let initInFlight = false;
        let selectedPackFile = null;
        let lastWasmBinary = null;
        let currentExampleKey = null;

        function appendProgramOutput(text) {
            outputEl.textContent += text;
            outputEl.scrollTop = outputEl.scrollHeight;
        }

        function formatMegabytes(byteLength) {
            return `${(byteLength / 1024 / 1024).toFixed(1)} MB`;
        }

        function getCurrentSourceFiles() {
            return {
                'main.go': editor.getValue()
            };
        }

        function getCurrentProgramLabel() {
            return currentExampleKey ? `example "${currentExampleKey}"` : 'current editor program';
        }

        function setStatus(state, text) {
            statusDot.className = 'w-2 h-2 rounded-full';
            if (state === 'ready') statusDot.classList.add('bg-emerald-500');
            else if (state === 'loading') statusDot.classList.add('bg-amber-500', 'animate-pulse');
            else if (state === 'error') statusDot.classList.add('bg-red-500');
            else statusDot.classList.add('bg-gray-500');
            statusText.textContent = text;
        }

        function setPackSource(packUrl) {
            if (packUrl === LOCAL_PACK_CACHE_KEY) {
                packSourceEl.textContent = 'Pack source: local file cached in browser';
            } else {
                packSourceEl.textContent = 'Pack source: same-origin asset';
            }
        }

        function setPackPanelCollapsed(collapsed) {
            packPanelBody.style.display = collapsed ? 'none' : 'block';
            btnTogglePackPanel.textContent = collapsed ? 'Expand' : 'Collapse';
            packPanelSummary.textContent = collapsed
                ? `${packSourceEl.textContent} • ${packCacheStatusEl.textContent}`
                : 'Manage pack download, local import, and the toolchain cache.';
            localStorage.setItem(PACK_PANEL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
        }

        async function refreshPackCacheStatus() {
            const loader = new ToolchainLoader();
            const localPack = await loader.getCached(LOCAL_PACK_CACHE_KEY);
            const defaultPack = await loader.getCached(config.packUrl);

            if (localPack) {
                packCacheStatusEl.textContent = `Toolchain cache: local pack cached (${formatMegabytes(localPack.byteLength)})`;
                if (!selectedPackFile) {
                    packFileNameEl.textContent = 'Using cached local pack';
                }
            } else if (defaultPack) {
                packCacheStatusEl.textContent = `Toolchain cache: same-origin pack cached (${formatMegabytes(defaultPack.byteLength)})`;
                if (!selectedPackFile) {
                    packFileNameEl.textContent = 'No local pack selected';
                }
            } else {
                packCacheStatusEl.textContent = 'Toolchain cache: empty';
                if (!selectedPackFile) {
                    packFileNameEl.textContent = 'No local pack selected';
                }
            }

            if (packPanelBody.style.display === 'none') {
                packPanelSummary.textContent = `${packSourceEl.textContent} • ${packCacheStatusEl.textContent}`;
            }
        }

        async function resolveInitialPackUrl() {
            const preferredPack = localStorage.getItem(PACK_SOURCE_STORAGE_KEY);
            if (preferredPack === LOCAL_PACK_CACHE_KEY) {
                const loader = new ToolchainLoader();
                const cached = await loader.getCached(LOCAL_PACK_CACHE_KEY);
                if (cached) {
                    return LOCAL_PACK_CACHE_KEY;
                }
                localStorage.removeItem(PACK_SOURCE_STORAGE_KEY);
            }
            return config.packUrl;
        }

        async function init(packUrlOverride) {
            if (initInFlight) {
                return;
            }

            initInFlight = true;
            gsInitialized = false;
            btnRun.disabled = true;
            btnDownload.disabled = true;
            lastWasmBinary = null;
            progressBar.style.width = '0%';

            const packUrl = packUrlOverride || await resolveInitialPackUrl();
            setPackSource(packUrl);
            setStatus('idle', 'Initializing...');
            const loadingToast = toastApi.show('Loading GoScript toolchain (~168 MB)...', 'loading', 0);

            try {
                gs = new GoScript({
                    packUrl,
                    debug: config.debug,
                    onProgress: (pct, msg) => {
                        console.log(`[Init] ${pct}% - ${msg}`);
                    },
                    onOutput: (text) => {
                        appendProgramOutput(text);
                    },
                    onError: (err) => {
                        appendProgramOutput(`Error: ${err}\n`);
                    }
                });

                await gs.init();
                window.gs = gs;
                gsInitialized = true;
                setStatus('ready', 'Ready');
                btnRun.disabled = false;
                console.log('GoScript Stats:', gs.getStats());
                await refreshPackCacheStatus();
                toastApi.update(loadingToast, 'GoScript toolchain ready!', 'success');
            } catch (error) {
                setStatus('error', `Failed: ${error.message}`);
                console.error('Init failed:', error);
                await refreshPackCacheStatus();
                toastApi.update(loadingToast, `Failed to load toolchain: ${error.message}`, 'error');
            } finally {
                initInFlight = false;
            }
        }

        packFileEl.addEventListener('change', () => {
            selectedPackFile = packFileEl.files && packFileEl.files[0] ? packFileEl.files[0] : null;
            packFileNameEl.textContent = selectedPackFile
                ? `Selected local pack: ${selectedPackFile.name} (${formatMegabytes(selectedPackFile.size)})`
                : 'No local pack selected';
            btnLoadPack.disabled = !selectedPackFile;
        });

        btnTogglePackPanel.addEventListener('click', () => {
            setPackPanelCollapsed(packPanelBody.style.display !== 'none');
        });

        btnLoadPack.addEventListener('click', async () => {
            if (!selectedPackFile) {
                return;
            }

            btnLoadPack.disabled = true;
            setStatus('loading', 'Importing local pack...');
            const importToast = toastApi.show('Importing local goscript.pack into browser cache...', 'loading', 0);

            try {
                const loader = new ToolchainLoader();
                const packData = await selectedPackFile.arrayBuffer();
                await loader.importPack(LOCAL_PACK_CACHE_KEY, packData);
                localStorage.setItem(PACK_SOURCE_STORAGE_KEY, LOCAL_PACK_CACHE_KEY);
                packFileNameEl.textContent = `Cached local pack: ${selectedPackFile.name} (${formatMegabytes(packData.byteLength)})`;
                await refreshPackCacheStatus();
                toastApi.update(importToast, 'Local pack cached. Switching to browser-stored pack...', 'success');
                await init(LOCAL_PACK_CACHE_KEY);
                btnLoadPack.disabled = false;
            } catch (error) {
                setStatus('error', `Local pack failed: ${error.message}`);
                appendProgramOutput(`${error.message}\n`);
                toastApi.update(importToast, `Local pack failed: ${error.message}`, 'error');
                btnLoadPack.disabled = false;
            }
        });

        btnClearPackCache.addEventListener('click', async () => {
            const loader = new ToolchainLoader();
            await loader.clearCache();
            localStorage.removeItem(PACK_SOURCE_STORAGE_KEY);
            packFileEl.value = '';
            selectedPackFile = null;
            btnLoadPack.disabled = true;
            packFileNameEl.textContent = 'No local pack selected';
            setPackSource(config.packUrl);
            await refreshPackCacheStatus();
            if (gsInitialized) {
                setStatus('ready', 'Ready');
                appendProgramOutput('\nToolchain cache cleared. Reload to force a fresh pack load.\n');
            }
            toastApi.show('Toolchain cache cleared.', 'success');
        });

        btnClearWasmCache.addEventListener('click', async () => {
            const cacheManager = new CacheManager();
            const sourceHash = cacheManager.generateSourceHash(getCurrentSourceFiles());
            const cleared = await cacheManager.clearCompiledWasmEntry(sourceHash);

            lastWasmBinary = null;
            btnDownload.disabled = true;

            if (cleared) {
                appendProgramOutput(`\nCompiled WASM cache cleared for ${getCurrentProgramLabel()}.\n`);
                toastApi.show('Current program WASM cache cleared.', 'success');
                console.log(`Compiled WASM cache cleared for ${getCurrentProgramLabel()}`);
            } else {
                appendProgramOutput(`\nNo cached WASM found for ${getCurrentProgramLabel()}.\n`);
                toastApi.show('No cached WASM found for current program.', 'info');
                console.log(`No compiled WASM cache entry found for ${getCurrentProgramLabel()}`);
            }
        });

        btnRun.addEventListener('click', async () => {
            if (!gs || !gsInitialized) {
                return;
            }

            btnRun.disabled = true;
            outputEl.textContent = '';
            compileTimeEl.textContent = '';
            wasmSizeEl.textContent = '';
            progressBar.style.width = '50%';
            setStatus('loading', 'Compiling...');

            try {
                const result = await gs.compileAndRun(editor.getValue());

                if (result.success) {
                    progressBar.style.width = '100%';
                    setStatus('ready', 'Complete');
                    compileTimeEl.textContent = `${result.compileResult.metadata.compileTime}ms`;
                    wasmSizeEl.textContent = `${(result.compileResult.metadata.wasmSize / 1024).toFixed(1)} KB`;
                    lastWasmBinary = result.compileResult.wasm;
                    btnDownload.disabled = false;
                } else {
                    progressBar.style.width = '100%';
                    setStatus('error', 'Compilation failed');
                    appendProgramOutput(`${result.error || 'Unknown error'}\n`);
                }
            } catch (error) {
                progressBar.style.width = '0%';
                setStatus('error', 'Error');
                appendProgramOutput(`${error.message}\n`);
            } finally {
                btnRun.disabled = false;
            }
        });

        btnClear.addEventListener('click', () => {
            outputEl.textContent = '';
            compileTimeEl.textContent = '';
            wasmSizeEl.textContent = '';
        });

        btnClearTerminal.addEventListener('click', () => {
            terminalLogger.clear();
        });

        btnDownload.addEventListener('click', () => {
            if (!lastWasmBinary) {
                return;
            }

            const blob = new Blob([lastWasmBinary], { type: 'application/wasm' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'program.wasm';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });

        examplesEl.addEventListener('change', () => {
            const example = examplesEl.value;
            if (example && examples[example]) {
                editor.setValue(examples[example]);
                currentExampleKey = example;
            }
        });

        const packPanelCollapsed = localStorage.getItem(PACK_PANEL_COLLAPSED_STORAGE_KEY);
        setPackPanelCollapsed(packPanelCollapsed === null ? true : packPanelCollapsed === '1');
        await refreshPackCacheStatus();
        await init();
    }

    bootstrap().catch((error) => {
        console.error('Playground bootstrap failed:', error);
    });
})();
