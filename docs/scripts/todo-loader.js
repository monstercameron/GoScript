/* Shared loader for the Go-powered demo pages.
 *
 * Fetches .go source files as plain text, compiles and links them in the
 * browser with GoScript, then runs the WASM. The Go program itself attaches the
 * event listeners and calls window.onGoTodoReady when it is live.
 *
 *   TodoDemo.start({
 *     sourceDir:   'go/todo/',
 *     files:       ['main.go', ...],          // or: manifest: 'go/todo/manifest.json'
 *     packUrl:     'assets/goscript.pack.gz?v=go1.27.3',
 *     storageKeys: ['goscript.todo.v1']       // cleared by the reset button
 *   });
 */
(function () {
    'use strict';

    function ms(start) { return Math.round(performance.now() - start) + ' ms'; }
    function fmtMs(v) { return v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms'; }

    function start(config) {
        var stageEls = {};
        document.querySelectorAll('.stage').forEach(function (el) { stageEls[el.dataset.stage] = el; });
        var overlay = document.getElementById('boot-overlay');
        var bootTitle = document.getElementById('boot-title');
        var bootDetail = document.getElementById('boot-detail');
        var errorBox = document.getElementById('build-error');
        var listenersStart = 0;

        function setStage(name, state, detail) {
            var el = stageEls[name];
            if (!el) return;
            el.dataset.state = state;
            if (detail !== undefined) el.querySelector('.stage-detail').textContent = detail;
        }

        function fail(stage, err) {
            var msg = (err && err.message) ? err.message : String(err);
            setStage(stage, 'error', 'failed');
            errorBox.textContent = msg;
            errorBox.classList.add('is-visible');
            overlay.classList.add('is-error');
            bootTitle.textContent = 'Build failed';
            bootDetail.textContent = 'See the error above.';
            console.error('[todo]', err);
        }

        // The Go program calls this once its listeners are attached.
        window.onGoTodoReady = function (todoCount) {
            setStage('run', 'done', 'running');
            setStage('listeners', 'done', todoCount + ' tasks, ' + ms(listenersStart) + ' after start');
            overlay.classList.add('is-hidden');
            window.setTimeout(function () { overlay.style.display = 'none'; }, 350);
        };

        var resetButton = document.getElementById('reset-data');
        if (resetButton) {
            resetButton.addEventListener('click', function () {
                (config.storageKeys || []).forEach(function (key) {
                    try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
                });
                location.reload();
            });
        }

        function showSources(files, sources) {
            var tabs = document.getElementById('src-tabs');
            var view = document.getElementById('src-view');
            var meta = document.getElementById('src-meta');
            tabs.textContent = '';

            // Syntax highlighting: a read-only CodeMirror with the Go mode. If the
            // CDN scripts did not load, the plain <pre> stays as the fallback.
            var cm = null;
            if (window.CodeMirror) {
                try {
                    cm = window.CodeMirror(function (node) {
                        node.classList.add('src-cm');
                        view.parentNode.insertBefore(node, view);
                        view.style.display = 'none';
                    }, {
                        value: '', mode: 'text/x-go', theme: 'dracula', lineNumbers: true,
                        readOnly: true, tabSize: 4, indentUnit: 4
                    });
                } catch (e) {
                    cm = null;
                    view.style.display = '';
                }
            }
            function setCode(text) {
                if (cm) {
                    cm.setValue(text);
                    // Fit short files, cap long ones at 460px and scroll inside the box.
                    var fitted = Math.min(460, cm.defaultTextHeight() * cm.lineCount() + 12);
                    cm.setSize(null, fitted);
                    // output.css forces .CodeMirror to 300px !important, so go through a CSS variable.
                    cm.getWrapperElement().style.setProperty('--src-h', fitted + 'px');
                    cm.refresh();
                    // Replay the short swap animation each time another file is shown.
                    var wrapper = cm.getWrapperElement();
                    wrapper.classList.remove('src-swap');
                    void wrapper.offsetWidth;
                    wrapper.classList.add('src-swap');
                    cm.scrollTo(0, 0);
                    cm.setCursor(0, 0);
                }
                else { view.textContent = text; }
            }
            function select(name) {
                tabs.querySelectorAll('button').forEach(function (b) {
                    b.setAttribute('aria-selected', String(b.dataset.file === name));
                });
                setCode(sources[name]);
                meta.textContent = '';
                var link = document.createElement('a');
                link.href = config.sourceDir + name;
                link.textContent = config.sourceDir + name;
                meta.append(sources[name].split('\n').length + ' lines · ', link);
            }
            files.forEach(function (name, i) {
                var b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('role', 'tab');
                b.dataset.file = name;
                b.textContent = name;
                b.addEventListener('click', function () { select(name); });
                tabs.appendChild(b);
                if (i === 0) select(name);
            });
        }

        async function packWasCached() {
            try {
                if (typeof caches === 'undefined') return false;
                var hit = await caches.match(new URL(config.packUrl, location.href).href);
                return !!hit;
            } catch (e) { return false; }
        }

        async function boot() {
            var t = performance.now();
            var files = config.files;
            var sources = {};

            // 1. fetch the .go text files
            setStage('fetch', 'active', 'listing files...');
            bootDetail.textContent = 'Fetching Go source';
            try {
                if (!files) {
                    var res = await fetch(config.manifest, { cache: 'no-cache' });
                    if (!res.ok) throw new Error('Could not fetch ' + config.manifest + ' (HTTP ' + res.status + ')');
                    files = (await res.json()).files;
                }
                setStage('fetch', 'active', files.length + ' files...');
                await Promise.all(files.map(async function (name) {
                    var r = await fetch(config.sourceDir + name, { cache: 'no-cache' });
                    if (!r.ok) throw new Error('Could not fetch ' + config.sourceDir + name + ' (HTTP ' + r.status + ')');
                    sources[name] = await r.text();
                }));
            } catch (e) { return fail('fetch', e); }
            var bytes = files.reduce(function (n, f) { return n + sources[f].length; }, 0);
            setStage('fetch', 'done', files.length + ' files, ' + (bytes / 1024).toFixed(1) + ' KB, ' + ms(t));
            showSources(files, sources);

            // 2. load the compiler + linker + stdlib (from Cache Storage after the first visit)
            t = performance.now();
            var cached = await packWasCached();
            setStage('toolchain', 'active', cached ? 'reading cached copy...' : 'downloading...');
            bootDetail.textContent = cached
                ? 'Loading the Go toolchain from this browser’s cache'
                : 'Downloading the Go toolchain (first visit only)';
            var gs;
            try {
                gs = new GoScript({
                    packUrl: config.packUrl,
                    debug: false,
                    stdout: function (s) { console.log('[go]', s); },
                    stderr: function (e) { console.error('[go]', e); },
                    progress: function (pct, message) {
                        if (message) setStage('toolchain', 'active', Math.round(pct) + '% ' + message);
                    }
                });
                await gs.init();
            } catch (e) { return fail('toolchain', e); }
            setStage('toolchain', 'done', (cached ? 'from cache, ' : 'downloaded, ') + ms(t));

            // 3. compile + link all .go files together
            t = performance.now();
            setStage('compile', 'active', 'go compile + go link...');
            bootDetail.textContent = 'Compiling and linking ' + files.length + ' files in your browser';
            var built;
            try {
                built = await gs.compile(sources);
            } catch (e) { return fail('compile', e); }
            var wasmMb = (built.size / 1048576).toFixed(1) + ' MB wasm, ';
            var tm = built.timings || {};
            if (tm.cacheHit) {
                setStage('compile', 'done', 'cache hit, ' + fmtMs(tm.totalMs) + ' (no compiler run), ' + wasmMb.slice(0, -2));
            } else if (tm.compilerMs != null && tm.linkerMs != null) {
                setStage('compile', 'done', fmtMs(tm.totalMs) + ' = compile ' + fmtMs(tm.compilerMs) + ' + link ' + fmtMs(tm.linkerMs) + ', ' + wasmMb.slice(0, -2));
            } else {
                setStage('compile', 'done', wasmMb + ms(t));
            }

            // Record this build and let the panel time fresh builds on demand.
            var sourceBytes = bytes;
            function toEntry(result, kind) {
                var r = result.timings || {};
                return {
                    at: new Date().toISOString(),
                    example: config.exampleId || 'unknown',
                    files: files.length,
                    sourceBytes: sourceBytes,
                    wasmBytes: result.size,
                    cacheHit: !!r.cacheHit,
                    totalMs: r.totalMs != null ? r.totalMs : result.compileTime,
                    compilerMs: r.compilerMs != null ? r.compilerMs : null,
                    linkerMs: r.linkerMs != null ? r.linkerMs : null,
                    stages: r.stages || {},
                    kind: kind
                };
            }
            if (window.CompileStats) {
                window.CompileStats.record(toEntry(built, 'page-load'));
                window.CompileStats.setFreshBuilder(async function () {
                    await gs.clearCompiledCache(sources);
                    return toEntry(await gs.compile(sources), 'forced');
                });
            }

            // 4. run it. go.run() only resolves when the program exits, and ours
            //    blocks forever, so do not await it.
            setStage('run', 'active', 'starting...');
            bootDetail.textContent = 'Starting the program';
            listenersStart = performance.now();
            gs.run(built.wasm, sources).then(function () {
                console.log('[todo] Go program exited');
            }, function (e) { fail('run', e); });
        }

        if (typeof GoScript === 'undefined') {
            fail('toolchain', new Error('goscript.bundle.js did not load.'));
        } else {
            boot();
        }
    }

    window.TodoDemo = { start: start };
})();
