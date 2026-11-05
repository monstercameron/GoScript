/* "How long does compiling take?" panel, rendered into #compile-stats.
 *
 * Timings come from the GoScript engine (performance.now() around the real
 * cmd/compile and cmd/link runs). Each build is appended to a history in this
 * browser's localStorage. The panel leads with two numbers, a first build and a
 * cached load, using medians so one throttled run cannot skew them.
 *
 *   CompileStats.record(entry)         add a build and refresh the panel
 *   CompileStats.setFreshBuilder(fn)   fn() clears the cached binary, rebuilds
 *                                      without running, returns an entry
 */
(function () {
    'use strict';

    var KEY = 'goscript.compile-history.v1';
    var MAX = 60;
    var host = document.getElementById('compile-stats');
    var focusId = host ? (host.getAttribute('data-example') || '') : '';
    var freshBuilder = null;
    var busy = false;

    var STAGE_LABELS = [
        ['cacheCheck', 'Look for a cached build'],
        ['loadSources', 'Copy the sources into the in-memory filesystem'],
        ['buildEnvironment', 'Prepare build folders'],
        ['compileAndLink', 'Compile and link (the Go toolchain)'],
        ['cacheWrite', 'Save the result to the cache'],
        ['prepare', 'Validate the finished .wasm']
    ];
    var NAMES = { 'todo': 'Simple todo', 'todo-pro': 'Advanced todo' };

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
    }
    function save(history) {
        try { localStorage.setItem(KEY, JSON.stringify(history.slice(-MAX))); } catch (e) { /* storage blocked */ }
    }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function ms(v) {
        if (v == null) return '–';
        if (v >= 10000) return (v / 1000).toFixed(1) + ' s';
        if (v >= 1000) return (v / 1000).toFixed(2) + ' s';
        return Math.round(v) + ' ms';
    }
    function kb(b) { return (b / 1024).toFixed(1) + ' KB'; }
    function mb(b) { return (b / 1048576).toFixed(1) + ' MB'; }
    function numbers(list, key) {
        return list.map(function (e) { return e[key]; }).filter(function (v) { return typeof v === 'number'; });
    }
    function median(list) {
        if (!list.length) return null;
        var s = list.slice().sort(function (a, b) { return a - b; });
        var m = s.length >> 1;
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

    function record(entry) {
        var history = load();
        history.push(entry);
        save(history);
        render();
        return entry;
    }
    function clear() {
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        render();
    }

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

    // Where one fresh build spent its time.
    function breakdown(entry) {
        var box = el('div', 'cs-last');
        box.appendChild(el('h3', 'sz-h', 'Where a typical first build spends its time'));
        var when = new Date(entry.at);
        box.appendChild(el('p', 'sz-note',
            'A typical first build (the recorded one closest to the median): ' + ms(entry.totalMs) + ' for ' + plural(entry.files, 'file') +
            ' (' + kb(entry.sourceBytes) + ' of source) into a ' + mb(entry.wasmBytes) + ' .wasm, recorded at ' + when.toLocaleTimeString() + '.'));
        var other = Math.max(0, entry.totalMs - entry.compilerMs - entry.linkerMs);
        var parts = [
            ['compiler', 'Compile', 'Go source to object code', entry.compilerMs],
            ['linker', 'Link', 'object code to a runnable .wasm', entry.linkerMs],
            ['other', 'Everything else', 'cache and file handling', other]
        ];
        var bar = el('div', 'cs-bar');
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', 'Compile ' + ms(entry.compilerMs) + ', link ' + ms(entry.linkerMs) + ', other ' + ms(other));
        parts.forEach(function (p) {
            var seg = el('div', 'cs-seg cs-seg-' + p[0]);
            seg.style.width = Math.max(0.5, p[3] / entry.totalMs * 100) + '%';
            bar.appendChild(seg);
        });
        box.appendChild(bar);
        var legend = el('ul', 'cs-legend');
        parts.forEach(function (p) {
            var li = el('li', 'cs-legend-item');
            li.appendChild(el('i', 'cs-dot cs-seg-' + p[0]));
            var text = el('span');
            text.appendChild(el('strong', '', p[1] + ' ' + ms(p[3]) + ' (' + Math.round(p[3] / entry.totalMs * 100) + '%)'));
            text.appendChild(document.createTextNode(' – ' + p[2]));
            li.appendChild(text);
            legend.appendChild(li);
        });
        box.appendChild(legend);

        var stages = entry.stages || {};
        var list = el('dl', 'cs-stages');
        STAGE_LABELS.forEach(function (s) {
            if (stages[s[0]] == null) return;
            list.appendChild(el('dt', '', s[1]));
            list.appendChild(el('dd', '', ms(stages[s[0]])));
        });
        if (list.children.length) {
            var f = fold('Stage by stage');
            f.appendChild(list);
            box.appendChild(f);
        }
        return box;
    }

    function allBuilds(history) {
        var ids = [];
        history.forEach(function (e) { if (ids.indexOf(e.example) < 0) ids.push(e.example); });
        var headers = ['Example', 'First builds', 'Typical (median)', 'Range', 'Cached loads', 'Typical (median)'];
        var table = el('table', 'sz-table');
        var thead = el('thead'), hr = el('tr');
        headers.forEach(function (h) { hr.appendChild(el('th', '', h)); });
        thead.appendChild(hr); table.appendChild(thead);
        var tbody = el('tbody');
        ids.forEach(function (id) {
            var mine = history.filter(function (e) { return e.example === id; });
            var fresh = numbers(mine.filter(function (e) { return !e.cacheHit; }), 'totalMs');
            var hits = numbers(mine.filter(function (e) { return e.cacheHit; }), 'totalMs');
            var cells = [
                (NAMES[id] || id) + ' (' + plural(mine[mine.length - 1].files, 'file') + ')',
                String(fresh.length),
                fresh.length ? ms(median(fresh)) : '–',
                fresh.length ? ms(Math.min.apply(null, fresh)) + ' to ' + ms(Math.max.apply(null, fresh)) : '–',
                String(hits.length),
                hits.length ? ms(median(hits)) : '–'
            ];
            var tr = el('tr');
            cells.forEach(function (c, i) {
                var cell = el(i === 0 ? 'th' : 'td', '', c);
                if (i > 0) cell.setAttribute('data-label', headers[i]);
                tr.appendChild(cell);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        var wrap = el('div', 'sz-scroll'); wrap.appendChild(table);
        return wrap;
    }

    function render() {
        if (!host) return;
        var history = load();
        var mine = history.filter(function (e) { return !focusId || e.example === focusId; });
        var fresh = mine.filter(function (e) { return !e.cacheHit; });
        var hits = mine.filter(function (e) { return e.cacheHit; });
        var medFresh = median(numbers(fresh, 'totalMs'));
        var medHit = median(numbers(hits, 'totalMs'));

        host.textContent = '';
        host.appendChild(el('h2', 'card-title', 'How long does compiling take?'));
        host.appendChild(el('p', 'card-sub',
            'The Go compiler runs inside this tab. A program it has not seen takes a few seconds to build. The result is then cached ' +
            'in your browser, so every later load takes milliseconds.'));

        // ---- headline: first build vs cached load ----
        var tiles = el('div', 'stat-tiles');
        if (fresh.length) {
            var fr = numbers(fresh, 'totalMs');
            tiles.appendChild(tile('fresh', 'First build, no cache', ms(medFresh),
                'typical of ' + plural(fresh.length, 'build') + (fr.length > 1
                    ? ', from ' + ms(Math.min.apply(null, fr)) + ' to ' + ms(Math.max.apply(null, fr)) : '') +
                '. The compiler and linker both run.'));
        } else {
            tiles.appendChild(tile('fresh', 'First build, no cache', '–',
                'Not measured yet. Press "Time a fresh build" below to compile once without the cache.'));
        }
        if (hits.length) {
            tiles.appendChild(tile('hit', 'Cached load', ms(medHit),
                'typical of ' + plural(hits.length, 'load') + '. The finished .wasm is read from the cache and the compiler does not run.'));
        } else {
            tiles.appendChild(tile('hit', 'Cached load', '–', 'Reload the page to see a cached load.'));
        }
        if (medFresh != null && medHit != null && medHit > 0) {
            var x = medFresh / medHit;
            tiles.appendChild(tile('speed', 'Cache speed-up', (x >= 10 ? Math.round(x) : x.toFixed(1)) + '× faster',
                'a cached load compared with a first build of this app.'));
        } else {
            tiles.appendChild(tile('speed', 'Cache speed-up', '–', 'Needs one first build and one cached load.'));
        }
        host.appendChild(tiles);

        // ---- breakdown of the latest first build ----
        var detailed = fresh.filter(function (e) { return e.compilerMs != null && e.linkerMs != null; });
        if (detailed.length) {
            // Describe a real build near the median, not whichever happened to run last (that may be an outlier).
            var typical = detailed.reduce(function (best, e) {
                return Math.abs(e.totalMs - medFresh) < Math.abs(best.totalMs - medFresh) ? e : best;
            }, detailed[0]);
            host.appendChild(breakdown(typical));
        }

        // ---- all builds, folded ----
        if (history.length) {
            var f = fold('All recorded builds (' + history.length + ')');
            f.appendChild(allBuilds(history));
            host.appendChild(f);
        }

        // ---- actions ----
        var row = el('div', 'cs-actions');
        var status = el('span', 'cs-status');
        status.setAttribute('aria-live', 'polite');
        var freshBtn = el('button', 'tp-clear-cache', 'Time a fresh build');
        freshBtn.type = 'button';
        freshBtn.disabled = !freshBuilder || busy;
        freshBtn.addEventListener('click', function () {
            if (!freshBuilder || busy) return;
            busy = true; freshBtn.disabled = true;
            status.textContent = 'Compiling without the cache. This tab freezes for a few seconds...';
            // Let the browser paint the message before the compiler takes the thread.
            window.setTimeout(function () {
                freshBuilder().then(function (entry) {
                    busy = false;
                    record(entry);
                }).catch(function (err) {
                    busy = false; freshBtn.disabled = false;
                    status.textContent = 'Build failed: ' + (err && err.message ? err.message : err);
                });
            }, 60);
        });
        var wipe = el('button', 'tp-clear-cache', 'Clear history');
        wipe.type = 'button';
        wipe.addEventListener('click', clear);
        row.appendChild(freshBtn); row.appendChild(wipe); row.appendChild(status);
        host.appendChild(row);
        host.appendChild(el('p', 'sz-note',
            '"Time a fresh build" throws away the cached .wasm for these sources, compiles again without running the program, and records the time. ' +
            'Timings vary with CPU load, and background tabs are throttled, so one slow run is normal; the typical figures use the median to ignore outliers. ' +
            'The last ' + MAX + ' builds are kept in this browser only.'));
    }

    function setFreshBuilder(fn) {
        freshBuilder = fn;
        render();
    }

    window.CompileStats = { record: record, clear: clear, setFreshBuilder: setFreshBuilder, render: render };
    render();
})();
