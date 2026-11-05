/* "Ship source or ship a .wasm?" panel, rendered into #size-compare.
 * Every number comes from data/size-report.json (written by tools/measure-sizes.ps1),
 * so nothing here is hardcoded.
 *
 * Reading order: three headline numbers, a one-line rule of thumb, an interactive
 * break-even calculator, the live cache status, then folded-away detail. */
(function () {
    'use strict';

    var host = document.getElementById('size-compare');
    if (!host) return;
    var focusId = host.getAttribute('data-example') || 'todo-pro';

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    // Auto units for headline numbers.
    function fmt(b) {
        if (b >= 1048576) return (b / 1048576).toFixed(b >= 10485760 ? 1 : 2) + ' MB';
        if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
        return b + ' B';
    }
    // Always KB, with thousands separators: lets a whole column be compared at a glance.
    function kb(b) {
        return (b / 1024).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' KB';
    }
    function times(a, b) { var r = a / b; return (r >= 100 ? Math.round(r) : r.toFixed(1)) + '×'; }

    function tile(kind, label, value, sub) {
        var t = el('div', 'stat-tile stat-tile-' + kind);
        t.appendChild(el('div', 'stat-label', label));
        t.appendChild(el('div', 'stat-value', value));
        t.appendChild(el('p', 'stat-sub', sub));
        return t;
    }

    function fold(title) {
        var d = el('details', 'fold');
        d.appendChild(el('summary', '', title));
        return d;
    }

    function table(headers, rows) {
        var t = el('table', 'sz-table');
        var thead = el('thead'), hr = el('tr');
        headers.forEach(function (h) { hr.appendChild(el('th', '', h)); });
        thead.appendChild(hr); t.appendChild(thead);
        var tbody = el('tbody');
        rows.forEach(function (cells) {
            var tr = el('tr');
            cells.forEach(function (c, i) {
                var cell = el(i === 0 ? 'th' : 'td', '', c);
                if (i > 0) cell.setAttribute('data-label', headers[i]); // shown on phones
                tr.appendChild(cell);
            });
            tbody.appendChild(tr);
        });
        t.appendChild(tbody);
        var wrap = el('div', 'sz-scroll'); wrap.appendChild(t);
        return wrap;
    }

    function render(report) {
        var ex = report.examples.filter(function (e) { return e.id === focusId; })[0] || report.examples[0];
        var comp = report.compiler;
        var loader = report.runtimeJs.goscriptBundleMin;
        var wasm = ex.wasmDefault.brotli, src = ex.source.brotli;
        var state = { codec: 'brotli' };

        host.textContent = '';
        host.appendChild(el('h2', 'card-title', 'Ship source or ship a .wasm?'));
        host.appendChild(el('p', 'card-sub',
            'Two ways to put this same app on a page. Sizes are measured for "' + ex.name + '" (' + report.goVersion +
            '), compressed with brotli, the smallest option.'));

        // ---- 1. headline numbers ----
        var tiles = el('div', 'stat-tiles');
        tiles.appendChild(tile('wasm', 'Ship a compiled .wasm', fmt(wasm),
            'for this one app. Every app or page needs its own copy, and each copy carries the Go runtime again.'));
        tiles.appendChild(tile('src', 'Ship the Go source', fmt(src),
            ex.fileCount + ' text files, ' + times(wasm, src) + ' smaller than the .wasm. This is all a source page adds per app.'));
        tiles.appendChild(tile('pack', 'Plus the compiler, once', fmt(comp.packBrotli),
            'downloaded once, then cached in the browser and shared by every page on this site.'));
        host.appendChild(tiles);

        var breakEven = Math.ceil((comp.packBrotli + loader.brotli) / (wasm - src));
        var rule = el('p', 'callout');
        rule.appendChild(el('strong', '', 'Rule of thumb: '));
        rule.appendChild(document.createTextNode(
            'for one fixed app, ship the .wasm: it is smaller and needs no build step. Once a visitor opens about ' + breakEven +
            ' different programs, or the code is edited by users or changes often, shipping source plus one cached compiler is smaller.'));
        host.appendChild(rule);

        // ---- 2. calculator ----
        var calc = el('div', 'sz-calc');
        calc.appendChild(el('h3', 'sz-h', 'Try it: how many different apps does a visitor open?'));
        var controls = el('div', 'sz-controls');
        var label = el('label', 'sz-label'); label.htmlFor = 'sz-apps';
        var slider = el('input'); slider.type = 'range'; slider.min = '1'; slider.max = '60'; slider.value = '1';
        slider.id = 'sz-apps';
        var radios = el('div', 'sz-radios');
        [['brotli', 'brotli'], ['gzip', 'gzip (what GitHub Pages serves)']].forEach(function (c) {
            var l = el('label', 'sz-radio');
            var r = el('input'); r.type = 'radio'; r.name = 'sz-codec'; r.value = c[0]; r.checked = c[0] === state.codec;
            r.addEventListener('change', function () { state.codec = c[0]; update(); });
            l.appendChild(r); l.appendChild(document.createTextNode(' ' + c[1]));
            radios.appendChild(l);
        });
        controls.appendChild(label); controls.appendChild(slider); controls.appendChild(radios);
        calc.appendChild(controls);

        var bars = el('div', 'sz-bars');
        function bar(kind) {
            var b = el('div', 'sz-bar'), f = el('div', 'sz-fill sz-fill-' + kind), t = el('span', 'sz-bar-text');
            b.appendChild(f); b.appendChild(t); bars.appendChild(b);
            return { fill: f, text: t };
        }
        var barBin = bar('bin'), barSrc = bar('src');
        calc.appendChild(bars);
        var verdict = el('p', 'sz-verdict');
        verdict.setAttribute('aria-live', 'polite');
        calc.appendChild(verdict);
        host.appendChild(calc);

        function update() {
            var n = parseInt(slider.value, 10), k = state.codec;
            var perWasm = ex.wasmDefault[k], perSrc = ex.source[k];
            var oneTime = (k === 'brotli' ? comp.packBrotli : comp.packGzip) + loader[k];
            var binTotal = n * perWasm, srcTotal = oneTime + n * perSrc;
            var be = Math.ceil(oneTime / (perWasm - perSrc));
            label.textContent = n + (n === 1 ? ' app' : ' different apps');
            var max = Math.max(binTotal, srcTotal);
            barBin.fill.style.width = (binTotal / max * 100) + '%';
            barSrc.fill.style.width = (srcTotal / max * 100) + '%';
            barBin.text.textContent = 'Ship a .wasm each time: ' + fmt(binTotal);
            barSrc.text.textContent = 'Ship source + cached compiler: ' + fmt(srcTotal);
            verdict.classList.remove('flash');
            void verdict.offsetWidth; // restart the animation on every change
            verdict.classList.add('flash');
            verdict.textContent = n >= be
                ? 'Source wins by ' + fmt(binTotal - srcTotal) + ' at ' + n + ' apps. Break-even is ' + be +
                  ' apps; each extra app then costs only ' + fmt(perSrc) + '.'
                : 'The .wasm wins by ' + fmt(srcTotal - binTotal) + ' at ' + n + (n === 1 ? ' app' : ' apps') +
                  '. The compiler (' + fmt(oneTime) + ') pays for itself at about ' + be + ' apps.';
        }
        slider.addEventListener('input', update);
        update();

        // ---- 3. cache status (live from this browser) ----
        var cache = el('div', 'sz-cache');
        cache.appendChild(el('h3', 'sz-h', 'Is the compiler really cached?'));
        cache.appendChild(el('p', 'sz-note',
            'Yes. It is saved once in the browser’s Cache Storage under a versioned URL, so later visits and other pages load it from disk with no network request. ' +
            'Pages that only need source files cost a few KB.'));
        var live = el('p', 'sz-live', 'Checking this browser…');
        live.setAttribute('aria-live', 'polite');
        var clear = el('button', 'tp-clear-cache', 'Clear cached compiler'); clear.type = 'button';
        cache.appendChild(live); cache.appendChild(clear);
        host.appendChild(cache);

        function cachedPacks() {
            return caches.keys().then(function (names) {
                return Promise.all(names.filter(function (n) { return n.indexOf('goscript-toolchain') === 0; })
                    .map(function (n) { return caches.open(n).then(function (c) { return c.keys(); }); }));
            });
        }
        function refreshLive() {
            if (typeof caches === 'undefined') { live.textContent = 'This browser has no Cache Storage, so the compiler downloads on every visit.'; return; }
            cachedPacks().then(function (lists) {
                var count = lists.reduce(function (s, l) { return s + l.length; }, 0);
                var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
                return est.then(function (e) {
                    live.textContent = count
                        ? 'Cached in this browser now' + (e ? ' (this site stores about ' + fmt(e.usage) + ')' : '') + '. Reloading will not download it again.'
                        : 'Not cached yet. It downloads on the first compile and is kept for later visits.';
                });
            }).catch(function () { live.textContent = 'Could not read the browser cache.'; });
        }
        clear.addEventListener('click', function () {
            caches.keys().then(function (names) {
                return Promise.all(names.filter(function (n) { return n.indexOf('goscript-toolchain') === 0; })
                    .map(function (n) { return caches.delete(n); }));
            }).then(function () { live.textContent = 'Cleared. The next reload downloads the compiler again.'; });
        });
        refreshLive();
        window.setTimeout(refreshLive, 12000); // pick up the cache write after a first download

        // ---- 4. detail, folded away ----
        var full = fold('Full measurements');
        full.appendChild(el('p', 'sz-note', 'Per app, in KB so every row compares directly. "Larger by" is the .wasm divided by its source, both brotli.'));
        var rows = [];
        report.examples.forEach(function (e) {
            rows.push([e.name + ': Go source (' + e.fileCount + ' files)', kb(e.source.raw), kb(e.source.gzip), kb(e.source.brotli), '']);
            rows.push([e.name + ': compiled .wasm', kb(e.wasmDefault.raw), kb(e.wasmDefault.gzip), kb(e.wasmDefault.brotli), times(e.wasmDefault.brotli, e.source.brotli)]);
        });
        full.appendChild(table(['Per app', 'Uncompressed', 'gzip', 'brotli', 'Larger by'], rows));
        full.appendChild(el('p', 'sz-note', 'One-time, shared by every app:'));
        full.appendChild(table(['Shared', 'Uncompressed', 'gzip', 'brotli'], [
            ['Compiler + linker + standard library', fmt(comp.packRaw), fmt(comp.packGzip), fmt(comp.packBrotli)],
            ['GoScript loader script', fmt(loader.raw), fmt(loader.gzip), fmt(loader.brotli)]
        ]));
        host.appendChild(full);

        var strip = Math.round((1 - ex.wasmStripped.brotli / ex.wasmDefault.brotli) * 1000) / 10;
        var notes = fold('Notes and caveats');
        var ul = el('ul', 'sz-notes');
        [
            'The first compile in the browser takes a few seconds (see the compile time panel). The SDK then caches the compiled .wasm per source, so repeat visits skip it.',
            'The compiler stays cached until the user clears site data or the browser frees space. Changing the ?v= in the pack URL fetches a new one and removes the old.',
            'Brotli figures apply on hosts that send Content-Encoding: br. This browser cannot decode brotli in JavaScript, so GitHub Pages serves the gzip copy (' + fmt(comp.packGzip) + '). Use the radio above to compare both.',
            'Stripping debug info from the .wasm (-ldflags "-s -w") saves only ' + strip + '% here, so it does not change the picture.',
            'Both models need wasm_exec.js (' + fmt(report.runtimeJs.wasmExec.raw) + '). The source model also loads the GoScript SDK (' + fmt(loader.raw) + ' minified).',
            'TinyGo builds much smaller binaries than the standard Go compiler, so a TinyGo comparison would narrow the gap. It was not measured.',
            'Measured ' + report.generatedAt.slice(0, 10) + ' by tools/measure-sizes.ps1.'
        ].forEach(function (t) { ul.appendChild(el('li', '', t)); });
        notes.appendChild(ul);
        host.appendChild(notes);
    }

    host.appendChild(el('p', 'card-sub', 'Loading measurements…'));
    fetch('data/size-report.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(render)
        .catch(function (e) {
            host.textContent = '';
            host.appendChild(el('p', 'card-sub', 'Could not load data/size-report.json (' + e.message + ').'));
        });
})();
