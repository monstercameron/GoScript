package main

import (
	"strconv"
	"syscall/js"
)

// buildShell creates the static page structure once. render() later fills the
// dynamic regions (projects, tags, stats, task list) and never touches the
// search box, so typing is never interrupted.
func (a *App) buildShell() {
	a.root.Get("classList").Call("add", "tp-app")

	var prioOptions []js.Value
	for i := len(AllPriorities) - 1; i >= 0; i-- {
		p := AllPriorities[i]
		prioOptions = append(prioOptions, H("option", Attrs{"value": p.String()}, p.String()))
	}

	var sortOptions []js.Value
	for _, s := range []struct {
		key   SortKey
		label string
	}{
		{SortDue, "Sort: due date"},
		{SortPriority, "Sort: priority"},
		{SortTitle, "Sort: title"},
		{SortCreated, "Sort: newest last"},
	} {
		sortOptions = append(sortOptions, H("option", Attrs{"value": string(s.key)}, s.label))
	}

	side := H("aside", Attrs{"class": "tp-side"},
		H("h3", nil, "Projects"),
		H("div", Attrs{"id": "projects"}),
		H("div", Attrs{"class": "tp-inline"},
			H("input", Attrs{"id": "new-project-name", "type": "text", "placeholder": "New project",
				"aria-label": "New project name", "data-enter": "add-project", "autocomplete": "off"}),
			H("button", Attrs{"type": "button", "class": "tp-btn", "data-act": "add-project"}, "Add")),
		H("h3", nil, "Tags"),
		H("div", Attrs{"id": "tags", "class": "tp-tags"}),
		H("h3", nil, "Progress"),
		H("div", Attrs{"id": "stats"}),
		H("details", Attrs{"class": "tp-help"},
			H("summary", nil, "Keyboard shortcuts"),
			H("ul", nil,
				H("li", nil, H("kbd", nil, "n"), " new task"),
				H("li", nil, H("kbd", nil, "/"), " search"),
				H("li", nil, H("kbd", nil, "Ctrl+Z"), " undo"),
				H("li", nil, H("kbd", nil, "Ctrl+Shift+Z"), " redo"),
				H("li", nil, H("kbd", nil, "Esc"), " clear search / cancel edit"),
				H("li", nil, H("kbd", nil, "?"), " toggle this list"))),
		H("p", Attrs{"id": "go-stats", "class": "tp-gostats"}))

	addForm := H("div", Attrs{"class": "tp-add"},
		H("input", Attrs{"id": "new-title", "type": "text", "placeholder": "Add a task...",
			"aria-label": "Task title", "data-enter": "add-task", "autocomplete": "off"}),
		H("select", Attrs{"id": "new-project", "aria-label": "Project"}),
		H("select", Attrs{"id": "new-priority", "aria-label": "Priority"}, prioOptions),
		H("input", Attrs{"id": "new-due", "type": "date", "aria-label": "Due date"}),
		H("input", Attrs{"id": "new-tags", "type": "text", "placeholder": "tags, comma separated",
			"aria-label": "Tags", "data-enter": "add-task", "autocomplete": "off"}),
		H("button", Attrs{"type": "button", "class": "tp-btn tp-primary", "data-act": "add-task"}, "Add task"))

	toolbar := H("div", Attrs{"class": "tp-toolbar"},
		H("input", Attrs{"id": "search", "type": "search", "autocomplete": "off",
			"placeholder": "Search: milk tag:home priority:high due:overdue is:done",
			"aria-label":  "Search tasks"}),
		H("select", Attrs{"id": "sort", "aria-label": "Sort order"}, sortOptions),
		H("button", Attrs{"id": "btn-undo", "type": "button", "class": "tp-btn", "data-act": "undo"}, "Undo"),
		H("button", Attrs{"id": "btn-redo", "type": "button", "class": "tp-btn", "data-act": "redo"}, "Redo"),
		H("button", Attrs{"type": "button", "class": "tp-btn", "data-act": "clear-done"}, "Clear done"),
		H("button", Attrs{"type": "button", "class": "tp-btn", "data-act": "toggle-data"}, "Data"))

	dataPanel := H("div", Attrs{"id": "data-panel", "class": "tp-data", "hidden": "hidden"},
		H("textarea", Attrs{"id": "data-text", "rows": "8", "spellcheck": "false",
			"aria-label": "Tasks as JSON"}),
		H("div", Attrs{"class": "tp-row"},
			H("button", Attrs{"type": "button", "class": "tp-btn", "data-act": "download"}, "Download JSON"),
			H("button", Attrs{"type": "button", "class": "tp-btn tp-primary", "data-act": "import"}, "Import from text"),
			H("button", Attrs{"type": "button", "class": "tp-btn", "data-act": "reset-sample"}, "Reset to sample data")))

	mainCol := H("main", Attrs{"class": "tp-main-col"},
		H("h2", nil, "Task manager"),
		addForm, toolbar, dataPanel,
		H("div", Attrs{"id": "result-count", "class": "tp-count"}),
		H("div", Attrs{"id": "task-groups"}))

	toasts := H("div", Attrs{"id": "toast-host", "class": "tp-toasts", "aria-live": "polite"})

	Replace(a.root, side, mainCol, toasts)
}

// render refreshes every dynamic region from the current state.
func (a *App) render() {
	a.renders++
	now := today()
	a.touchedID = a.store.TakeTouched() // later renders (search, sort) must not replay it
	st := a.store.State()
	a.renderFormOptions(st)
	a.renderSidebar(st, now)
	a.renderTasks(st, now)
	a.renderChrome()
}

// renderFormOptions rebuilds the project dropdown, keeping the selection.
func (a *App) renderFormOptions(st State) {
	sel := ByID("new-project")
	current := Val(sel)
	var opts []js.Value
	for _, p := range st.Projects {
		opts = append(opts, H("option", Attrs{"value": strconv.Itoa(p.ID)}, p.Name))
	}
	Replace(sel, opts)
	if current != "" && st.HasProject(atoi(current)) {
		sel.Set("value", current)
	}
}

// renderChrome updates buttons and panels that depend on app state.
func (a *App) renderChrome() {
	ByID("btn-undo").Set("disabled", !a.store.CanUndo())
	ByID("btn-redo").Set("disabled", !a.store.CanRedo())
	ByID("sort").Set("value", string(a.sortKey))
	ByID("data-panel").Set("hidden", !a.showData)
}
