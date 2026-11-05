package main

import (
	"strconv"
	"syscall/js"
)

// App wires the Go todo Store to the page.
//
// The HTML page ships only a static, disabled skeleton. Everything interactive
// is attached here, by Go code that was fetched as text, compiled and linked in
// the browser, and only then executed.
type App struct {
	store   *Store
	list    js.Value
	renders int
}

func main() {
	app := &App{store: NewStore(), list: byID("todo-list")}
	app.bindEvents()
	app.renderList()
	app.enableControls()
	app.announceReady()

	// Keep the Go runtime alive so the event listeners keep working.
	select {}
}

// bindEvents attaches every event listener from Go.
func (a *App) bindEvents() {
	input := byID("todo-input")

	add := func() {
		if a.store.Add(input.Get("value").String()) {
			a.store.save()
			input.Set("value", "")
			a.renderList()
		}
		input.Call("focus")
	}

	on(byID("todo-add"), "click", func(js.Value) { add() })
	on(input, "keydown", func(e js.Value) {
		if e.Get("key").String() == "Enter" {
			e.Call("preventDefault")
			add()
		}
	})

	// One delegated listener handles toggle and delete for every row.
	on(a.list, "click", func(e js.Value) {
		hit := e.Get("target").Call("closest", "[data-action]")
		if hit.IsNull() {
			return
		}
		row := hit.Call("closest", "li")
		if row.IsNull() {
			return
		}
		id, err := strconv.Atoi(row.Get("dataset").Get("id").String())
		if err != nil {
			return
		}
		switch hit.Get("dataset").Get("action").String() {
		case "toggle":
			a.store.Toggle(id)
		case "delete":
			a.store.Remove(id)
		default:
			return
		}
		a.store.save()
		a.renderList()
	})

	for _, f := range []Filter{FilterAll, FilterActive, FilterCompleted} {
		filter := f
		on(byID("filter-"+string(filter)), "click", func(js.Value) {
			a.store.filter = filter
			a.renderList()
		})
	}

	on(byID("todo-clear"), "click", func(js.Value) {
		if a.store.ClearCompleted() > 0 {
			a.store.save()
			a.renderList()
		}
	})
}

// enableControls turns on the inputs that the static HTML left disabled.
func (a *App) enableControls() {
	for _, id := range []string{"todo-input", "todo-add", "filter-all", "filter-active", "filter-completed"} {
		byID(id).Set("disabled", false)
	}
	byID("todo-input").Call("focus")
}

// announceReady tells the host page that Go is running and listeners are live.
func (a *App) announceReady() {
	hook := js.Global().Get("onGoTodoReady")
	if hook.Type() == js.TypeFunction {
		hook.Invoke(len(a.store.items))
	}
}
