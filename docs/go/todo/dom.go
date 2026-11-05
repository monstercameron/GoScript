package main

import (
	"fmt"
	"syscall/js"
)

// Small helpers around the browser DOM, using syscall/js.

var document = js.Global().Get("document")

func byID(id string) js.Value {
	el := document.Call("getElementById", id)
	if el.IsNull() || el.IsUndefined() {
		panic("missing element #" + id)
	}
	return el
}

func newEl(tag, class, text string) js.Value {
	el := document.Call("createElement", tag)
	if class != "" {
		el.Set("className", class)
	}
	if text != "" {
		// textContent, never innerHTML: user text can't inject markup.
		el.Set("textContent", text)
	}
	return el
}

// on attaches a Go function as a DOM event listener. The js.Func is kept alive
// for the life of the program (main blocks forever), so callbacks keep working.
func on(target js.Value, event string, fn func(e js.Value)) {
	target.Call("addEventListener", event, js.FuncOf(func(this js.Value, args []js.Value) any {
		fn(args[0])
		return nil
	}))
}

// renderList rebuilds the <ul>, the counters and the filter buttons.
func (a *App) renderList() {
	a.renders++
	list := a.list
	list.Set("textContent", "")

	visible := a.store.Visible()
	touched := a.store.TakeTouched() // only this row gets an enter animation
	for _, t := range visible {
		li := newEl("li", "todo-item", "")
		if t.Done {
			li.Get("classList").Call("add", "is-done")
		}
		li.Get("dataset").Set("id", fmt.Sprint(t.ID))
		if t.ID == touched {
			li.Get("classList").Call("add", "just-changed")
		}

		toggle := newEl("button", "todo-check", "")
		toggle.Get("dataset").Set("action", "toggle")
		toggle.Call("setAttribute", "aria-label", "Toggle: "+t.Text)
		toggle.Call("setAttribute", "aria-pressed", fmt.Sprint(t.Done))
		if t.Done {
			toggle.Set("textContent", "✓")
		}

		label := newEl("span", "todo-text", t.Text)
		label.Get("dataset").Set("action", "toggle")

		remove := newEl("button", "todo-delete", "×")
		remove.Get("dataset").Set("action", "delete")
		remove.Call("setAttribute", "aria-label", "Delete: "+t.Text)

		li.Call("appendChild", toggle)
		li.Call("appendChild", label)
		li.Call("appendChild", remove)
		list.Call("appendChild", li)
	}

	empty := byID("todo-empty")
	empty.Get("style").Set("display", map[bool]string{true: "block", false: "none"}[len(visible) == 0])

	remaining, done, total := a.store.Counts()
	noun := "items"
	if remaining == 1 {
		noun = "item"
	}
	byID("todo-count").Set("textContent", fmt.Sprintf("%d %s left", remaining, noun))
	byID("todo-clear").Set("disabled", done == 0)
	byID("go-stats").Set("textContent",
		fmt.Sprintf("Rendered by Go: %d todos, %d done, %d renders", total, done, a.renders))

	for _, f := range []Filter{FilterAll, FilterActive, FilterCompleted} {
		btn := byID("filter-" + string(f))
		active := a.store.filter == f
		btn.Call("setAttribute", "aria-pressed", fmt.Sprint(active))
	}
}
