/* Scroll reveal and number count-up for the todo pages.
 *
 * - Cards already on screen rise in with a short stagger. Cards below the fold
 *   start hidden and fade up as they scroll into view. Without this script, or
 *   with prefers-reduced-motion, nothing is ever hidden.
 * - Headline numbers (.stat-value) count up once when they first scroll into
 *   view. The panels render those nodes asynchronously, so a MutationObserver
 *   watches for them.
 */
(function () {
    'use strict';

    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // ---------------- scroll reveal ----------------
    var REVEAL = '.hero-panel:not(.reveal), .card-surface, .todo-shell, .adv-stage, .info-banner:not(.reveal)';
    var revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var node = entry.target;
            revealIO.unobserve(node);
            node.classList.add('fx-show');
            window.setTimeout(function () { node.classList.remove('fx-pending', 'fx-show'); }, 800);
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    var shownAtLoad = 0;
    document.querySelectorAll(REVEAL).forEach(function (node) {
        var top = node.getBoundingClientRect().top;
        if (top < window.innerHeight * 0.92) {
            node.style.animationDelay = (shownAtLoad * 70) + 'ms';
            node.classList.add('fx-in');
            shownAtLoad++;
            node.addEventListener('animationend', function done(e) {
                if (e.target !== node) return;
                node.classList.remove('fx-in');
                node.style.animationDelay = '';
                node.removeEventListener('animationend', done);
            });
        } else {
            node.classList.add('fx-pending');
            revealIO.observe(node);
        }
    });

    // ---------------- count-up ----------------
    function countUp(node) {
        var text = node.textContent;
        var m = /^(\d[\d,]*\.?\d*)(.*)$/.exec(text);
        if (!m) return;
        var raw = m[1].replace(/,/g, '');
        var target = parseFloat(raw);
        if (!isFinite(target) || target === 0) return;
        var decimals = (raw.split('.')[1] || '').length;
        var suffix = m[2];
        var started = performance.now();
        var duration = 750;
        function format(v) {
            var s = v.toFixed(decimals);
            return m[1].indexOf(',') > -1 ? Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s;
        }
        function frame(now) {
            var t = Math.min(1, (now - started) / duration);
            var eased = 1 - Math.pow(1 - t, 3);
            node.textContent = t < 1 ? format(target * eased) + suffix : text;
            if (t < 1) window.requestAnimationFrame(frame);
        }
        window.requestAnimationFrame(frame);
    }

    var countIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            countIO.unobserve(entry.target);
            countUp(entry.target);
        });
    }, { threshold: 0.6 });

    function watchValues(root) {
        if (root.nodeType !== 1) return;
        if (root.classList && root.classList.contains('stat-value')) countIO.observe(root);
        if (root.querySelectorAll) root.querySelectorAll('.stat-value').forEach(function (n) { countIO.observe(n); });
    }
    watchValues(document.body);
    new MutationObserver(function (records) {
        records.forEach(function (r) { r.addedNodes.forEach(watchValues); });
    }).observe(document.body, { childList: true, subtree: true });
})();
