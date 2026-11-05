package main

// The app's whole stylesheet lives in Go and is injected at startup, so the
// HTML page needs nothing but an empty <div id="app-root">. It reuses the host
// page's --gs-* colour tokens when they exist and falls back to its own.

const appCSS = `
.tp-app{--bg:var(--gs-surface-strong,#0a1220);--line:var(--gs-line,rgba(148,163,184,.18));--text:var(--gs-text,#edf4ff);--muted:var(--gs-muted,#8ea3bf);--accent:var(--gs-accent,#48d8b5);--cyan:var(--gs-cyan,#47c6ff);--rose:#ff7a9a;
 display:grid;grid-template-columns:270px minmax(0,1fr);gap:22px;position:relative;color:var(--text);
 border:1px solid var(--line);border-radius:28px;background:var(--bg);padding:24px;box-shadow:var(--gs-shadow,0 24px 80px rgba(3,10,20,.48))}
.tp-app *{box-sizing:border-box}
.tp-app h2{margin:0 0 14px;font-size:1.5rem}
.tp-app h3{margin:18px 0 8px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.tp-app h3:first-child{margin-top:0}
.tp-app button,.tp-app select,.tp-app input,.tp-app textarea{font:inherit;color:var(--text)}
.tp-app input[type=text],.tp-app input[type=search],.tp-app input[type=date],.tp-app select,.tp-app textarea{
 background:rgba(7,17,31,.8);border:1px solid var(--line);border-radius:12px;padding:9px 11px;min-width:0;color-scheme:dark}
.tp-app :focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.tp-btn{padding:8px 13px;border:1px solid var(--line);border-radius:12px;background:rgba(148,163,184,.1);cursor:pointer}
.tp-btn:hover:not(:disabled){filter:brightness(1.2)}
.tp-btn:disabled{opacity:.4;cursor:not-allowed}
.tp-primary{border:0;background:linear-gradient(135deg,#1ea77e,#11735f);font-weight:700}
.tp-side{min-width:0}
.tp-nav{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:10px;background:transparent;cursor:pointer}
.tp-nav:hover{background:rgba(148,163,184,.1)}
.tp-nav.is-active{background:rgba(71,198,255,.16);color:var(--cyan)}
.tp-projrow{display:flex;align-items:center}
.tp-projrow .tp-nav{flex:1}
.tp-n{color:var(--muted);font-size:.8rem;margin-left:8px}
.tp-inline{display:flex;gap:6px;margin-top:8px}.tp-inline input{flex:1}
.tp-tags{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-block;padding:2px 9px;border-radius:999px;border:1px solid var(--line);font-size:.75rem;background:transparent;line-height:1.5}
button.chip{cursor:pointer}
.chip.tag{color:var(--cyan)}.chip.tag.is-active{background:rgba(71,198,255,.2);border-color:var(--cyan)}
.chip.pri-high{color:#ff9aa8;border-color:rgba(255,122,154,.5)}
.chip.pri-medium{color:#ffd37a;border-color:rgba(255,211,122,.45)}
.chip.pri-low{color:#9ad7ff;border-color:rgba(154,215,255,.4)}
.chip.due.overdue{color:#fff;background:rgba(212,87,127,.55);border-color:transparent}
.tp-bar{font-family:'IBM Plex Mono',monospace;color:var(--accent);letter-spacing:1px}
.tp-warn{color:var(--rose)}.tp-muted{color:var(--muted);font-size:.85rem}
#stats{font-size:.9rem;line-height:1.6}
.tp-help{margin-top:18px;color:var(--muted);font-size:.85rem}.tp-help ul{padding-left:18px;margin:8px 0}
kbd{font-family:'IBM Plex Mono',monospace;font-size:.75rem;border:1px solid var(--line);border-radius:6px;padding:1px 6px}
.tp-gostats{margin:16px 0 0;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--accent)}
.tp-main-col{min-width:0}
.tp-add{display:grid;grid-template-columns:minmax(0,2fr) repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
.tp-add #new-tags,.tp-add .tp-btn{grid-column:auto}
.tp-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.tp-toolbar #search{flex:1 1 240px}
.tp-data{margin-bottom:12px}.tp-data[hidden]{display:none}
.tp-data textarea{width:100%;font-family:'IBM Plex Mono',monospace;font-size:.78rem}
.tp-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.tp-count{color:var(--muted);font-size:.85rem;margin:6px 0 10px}
.tp-link{border:0;background:none;color:var(--cyan);text-decoration:underline;cursor:pointer;margin-left:8px}
.tp-group{margin-bottom:16px}.tp-group h4{margin:0 0 6px;font-size:.95rem}
.tp-tasks{list-style:none;margin:0;padding:0}
.tp-task{display:flex;align-items:flex-start;gap:12px;padding:10px 4px;border-bottom:1px solid var(--line)}
.tp-check{flex:none;width:24px;height:24px;margin-top:1px;display:grid;place-items:center;border:2px solid rgba(125,211,252,.4);border-radius:50%;background:transparent;color:#06101d;font-weight:700;cursor:pointer}
.tp-task.is-done .tp-check{background:var(--accent);border-color:var(--accent)}
.tp-body{flex:1;min-width:0}
.tp-title{cursor:text;overflow-wrap:anywhere}
.tp-task.is-done .tp-title{color:var(--muted);text-decoration:line-through}
.tp-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}
.edit-input{width:100%}
.tp-del{flex:none;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:var(--muted);font-size:1.25rem;line-height:1;cursor:pointer}
.tp-del:hover{color:#ff8aa8;background:rgba(212,87,127,.15)}
.tp-empty{color:var(--muted);text-align:center;padding:26px 0}
.tp-toasts{position:fixed;right:18px;bottom:18px;z-index:50;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.tp-toast{background:#10213a;border:1px solid var(--cyan);border-radius:12px;padding:10px 14px;font-size:.88rem;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.tp-btn,.tp-nav,.chip,.tp-check,.tp-del,.tp-link{transition:background-color .18s ease,border-color .18s ease,color .18s ease,transform .18s cubic-bezier(.2,.8,.2,1),filter .18s ease}
.tp-btn:hover:not(:disabled){transform:translateY(-1px)}
.tp-btn:active:not(:disabled){transform:translateY(0) scale(.97)}
.tp-check:hover{border-color:var(--accent)}
.tp-check:active{transform:scale(.86)}
.tp-del:active{transform:scale(.85)}
.chip.tag:hover{background:rgba(71,198,255,.16)}
.tp-task{transition:background-color .2s ease}
.tp-task:hover{background:rgba(148,163,184,.06)}
.tp-app input:focus-visible,.tp-app select:focus-visible,.tp-app textarea:focus-visible{outline-offset:1px}
.tp-app input,.tp-app select,.tp-app textarea{transition:border-color .18s ease,box-shadow .18s ease}
.tp-app input:focus,.tp-app select:focus,.tp-app textarea:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(71,198,255,.15)}
.tp-task.just-changed{animation:tp-row-in .5s cubic-bezier(.2,.8,.2,1)}
.tp-task.just-changed .tp-check{animation:tp-pop .45s cubic-bezier(.34,1.56,.64,1)}
.tp-data:not([hidden]){animation:tp-drop .28s cubic-bezier(.2,.8,.2,1)}
.tp-toast{animation:tp-toast-in .3s cubic-bezier(.2,.8,.2,1),tp-toast-out .3s ease-in 2.45s forwards}
@keyframes tp-row-in{from{opacity:0;transform:translateY(-10px) scale(.98);background:rgba(72,216,181,.22)}to{opacity:1;transform:none;background:transparent}}
@keyframes tp-pop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes tp-drop{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@keyframes tp-toast-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes tp-toast-out{to{opacity:0;transform:translateY(8px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.tp-app *,.tp-toast{animation:none!important;transition:none!important}}
@media (max-width:820px){
 .tp-app{grid-template-columns:1fr;padding:16px;gap:18px;border-radius:22px}
 .tp-main-col{order:-1}
 .tp-add{grid-template-columns:1fr 1fr}
 .tp-add #new-title,.tp-add .tp-primary{grid-column:1/-1}
 .tp-toolbar #search{flex-basis:100%}
 .tp-toasts{left:14px;right:14px;bottom:14px}
}
@media (max-width:420px){.tp-add{grid-template-columns:1fr}}
@media (max-width:820px),(pointer:coarse){
 .tp-app input[type=text],.tp-app input[type=search],.tp-app input[type=date],.tp-app select,.tp-app textarea{font-size:16px;min-height:44px}
 .tp-btn{min-height:44px;padding:10px 16px}
 .tp-nav{min-height:44px;align-items:center}
 .tp-help summary{padding:12px 0;cursor:pointer}
 .tp-link{padding:12px 8px}
 button.chip{min-height:36px;padding:6px 12px;display:inline-flex;align-items:center}
 .tp-meta{gap:8px}
 .tp-check{position:relative}
 .tp-check::after{content:"";position:absolute;inset:-12px}
 .tp-del{width:44px;height:44px}
 .tp-task{gap:14px;padding:12px 0}
}
`

// injectStyle adds the stylesheet to the page once.
func injectStyle() {
	if !isNil(Q("#todo-pro-style")) {
		return
	}
	doc.Get("head").Call("appendChild", H("style", Attrs{"id": "todo-pro-style"}, appCSS))
}
