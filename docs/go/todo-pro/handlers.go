package main

import (
	"fmt"
	"strconv"
	"strings"
	"syscall/js"
)

// bindEvents attaches a handful of delegated listeners on the app root. Rows
// are rebuilt on every render, so delegation means no per-row listeners.
func (a *App) bindEvents() {
	On(a.root, "click", a.onClick)
	On(a.root, "keydown", a.onKeydown)
	On(a.root, "input", a.onInput)
	On(a.root, "change", a.onChange)
	On(a.root, "focusout", a.onFocusOut)
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func (a *App) onClick(e js.Value) {
	hit := Closest(e.Get("target"), "[data-act]")
	if isNil(hit) {
		return
	}
	taskID := atoi(Data(Closest(hit, "[data-task]"), "task"))

	switch Data(hit, "act") {
	case "add-task":
		a.addTaskFromForm()
	case "toggle":
		a.store.Toggle(taskID)
	case "delete":
		a.store.Delete(taskID)
		a.toast("Task deleted. Press Ctrl+Z to undo.")
	case "edit":
		a.startEdit(taskID)
	case "filter-project":
		a.setQuery(SetToken(a.query, "project", Data(hit, "project")))
	case "filter-tag":
		a.setQuery(ToggleToken(a.query, "tag:"+Data(hit, "tag")))
	case "clear-filter":
		a.setQuery("")
	case "add-project":
		a.addProjectFromForm()
	case "delete-project":
		if err := a.store.DeleteProject(atoi(Data(hit, "projectId"))); err != nil {
			a.toast(err.Error())
		} else {
			a.toast("Project deleted. Its tasks moved to Inbox.")
		}
	case "undo":
		a.undo()
	case "redo":
		a.redo()
	case "clear-done":
		if n := a.store.ClearCompleted(); n > 0 {
			a.toast(fmt.Sprintf("Cleared %d completed", n))
		} else {
			a.toast("No completed tasks to clear")
		}
	case "toggle-data":
		a.showData = !a.showData
		if a.showData {
			if text, err := ExportJSON(a.store.State(), true); err == nil {
				ByID("data-text").Set("value", text)
			}
		}
		a.render()
	case "download":
		if text, err := ExportJSON(a.store.State(), true); err == nil {
			download("goscript-todos.json", text)
		}
	case "import":
		a.importFromText()
	case "reset-sample":
		a.store.Replace(seedState(today()), "reset to sample data")
		a.toast("Sample data restored. Ctrl+Z undoes this.")
	}
}

func (a *App) onKeydown(e js.Value) {
	target := e.Get("target")
	key := e.Get("key").String()

	if target.Get("classList").Call("contains", "edit-input").Bool() {
		switch key {
		case "Enter":
			e.Call("preventDefault")
			a.commitEdit(Val(target))
		case "Escape":
			a.editingID = 0
			a.render()
		}
		return
	}

	if key == "Enter" {
		switch Data(target, "enter") {
		case "add-task":
			e.Call("preventDefault")
			a.addTaskFromForm()
		case "add-project":
			e.Call("preventDefault")
			a.addProjectFromForm()
		}
		return
	}

	if key == "Escape" && target.Get("id").String() == "search" {
		a.setQuery("")
	}
}

func (a *App) onInput(e js.Value) {
	target := e.Get("target")
	if target.Get("id").String() != "search" {
		return
	}
	value := Val(target)
	// Wait for a pause in typing before filtering (a Go timer, not JavaScript).
	a.searchDeb.Do(func() {
		a.query = value
		a.render()
	})
}

func (a *App) onChange(e js.Value) {
	target := e.Get("target")
	if target.Get("id").String() == "sort" {
		a.sortKey = SortKey(Val(target))
		a.render()
	}
}

func (a *App) onFocusOut(e js.Value) {
	target := e.Get("target")
	if a.editingID != 0 && target.Get("classList").Call("contains", "edit-input").Bool() {
		a.commitEdit(Val(target))
	}
}

func (a *App) setQuery(q string) {
	a.query = q
	ByID("search").Set("value", q)
	a.render()
}

func (a *App) addTaskFromForm() {
	prio, _ := ParsePriority(Val(ByID("new-priority")))
	_, err := a.store.AddTask(NewTask{
		Title:     Val(ByID("new-title")),
		Priority:  prio,
		Tags:      normalizeTags(Val(ByID("new-tags"))),
		Due:       Val(ByID("new-due")),
		ProjectID: atoi(Val(ByID("new-project"))),
	})
	if err != nil {
		a.toast(err.Error())
		return
	}
	for _, id := range []string{"new-title", "new-tags", "new-due"} {
		ByID(id).Set("value", "")
	}
	Focus("new-title")
}

func (a *App) addProjectFromForm() {
	input := ByID("new-project-name")
	if _, err := a.store.AddProject(Val(input)); err != nil {
		a.toast(err.Error())
		return
	}
	input.Set("value", "")
}

func (a *App) startEdit(id int) {
	if id == 0 {
		return
	}
	a.editingID = id
	a.render()
	if input := Q(".edit-input"); !isNil(input) {
		input.Call("focus")
		input.Call("select")
	}
}

func (a *App) commitEdit(title string) {
	id := a.editingID
	a.editingID = 0 // clear first so the blur caused by re-rendering is ignored
	title = strings.TrimSpace(title)
	if title == "" {
		a.render()
		return
	}
	changed := a.store.Update(id, "edit title", func(t *Task) {
		if t.Title == title {
			return
		}
		t.Title = title
	})
	if !changed {
		a.render()
	}
}

func (a *App) importFromText() {
	st, err := ImportJSON(Val(ByID("data-text")))
	if err != nil {
		a.toast("Import failed: " + err.Error())
		return
	}
	a.showData = false
	a.store.Replace(st, "import data")
	a.toast(fmt.Sprintf("Imported %d tasks in %d projects", len(st.Tasks), len(st.Projects)))
}

func (a *App) undo() {
	if label, ok := a.store.Undo(); ok {
		a.toast("Undid: " + label)
	} else {
		a.toast("Nothing to undo")
	}
}

func (a *App) redo() {
	if label, ok := a.store.Redo(); ok {
		a.toast("Redid: " + label)
	} else {
		a.toast("Nothing to redo")
	}
}
