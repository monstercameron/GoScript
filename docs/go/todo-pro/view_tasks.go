package main

import (
	"fmt"
	"strconv"
	"syscall/js"
)

// renderTasks filters, sorts, groups by project, and draws the task list.
func (a *App) renderTasks(st State, now string) {
	q := ParseQuery(a.query)

	var visible []Task
	for _, t := range st.Tasks {
		if q.Match(t, st.ProjectName(t.ProjectID), now) {
			visible = append(visible, t)
		}
	}
	SortTasks(visible, a.sortKey)

	summary := []any{fmt.Sprintf("Showing %d of %d tasks", len(visible), len(st.Tasks))}
	if !q.Empty() {
		summary = append(summary,
			H("button", Attrs{"type": "button", "class": "tp-link", "data-act": "clear-filter"}, "clear filter"))
	}
	Replace(ByID("result-count"), summary...)

	var groups []js.Value
	for _, p := range st.Projects {
		var rows []js.Value
		for _, t := range visible {
			if t.ProjectID == p.ID {
				rows = append(rows, a.taskRow(t, now))
			}
		}
		if len(rows) == 0 {
			continue
		}
		groups = append(groups, H("section", Attrs{"class": "tp-group"},
			H("h4", nil, p.Name, H("span", Attrs{"class": "tp-n"}, strconv.Itoa(len(rows)))),
			H("ul", Attrs{"class": "tp-tasks"}, rows)))
	}
	if len(groups) == 0 {
		msg := "No tasks yet. Add one above."
		if !q.Empty() {
			msg = "No tasks match this search."
		}
		groups = append(groups, H("p", Attrs{"class": "tp-empty"}, msg))
	}
	Replace(ByID("task-groups"), groups)
}

// taskRow builds one list item.
func (a *App) taskRow(t Task, now string) js.Value {
	class := "tp-task"
	if t.ID == a.touchedID {
		class += " just-changed"
	}
	tick := ""
	if t.Done {
		class += " is-done"
		tick = "✓"
	}

	check := H("button", Attrs{
		"class": "tp-check", "data-act": "toggle", "type": "button",
		"aria-pressed": strconv.FormatBool(t.Done), "aria-label": "Toggle: " + t.Title,
	}, tick)

	var title js.Value
	if a.editingID == t.ID {
		title = H("input", Attrs{"class": "edit-input", "value": t.Title, "aria-label": "Edit title"})
	} else {
		title = H("span", Attrs{"class": "tp-title", "data-act": "edit", "title": "Click to edit"}, t.Title)
	}

	var chips []js.Value
	if t.Priority != PriorityNone {
		chips = append(chips, H("span", Attrs{"class": "chip pri-" + t.Priority.String()}, t.Priority.String()))
	}
	if t.Due != "" {
		label, overdue := dueLabel(t.Due, now)
		cls := "chip due"
		if overdue && !t.Done {
			cls += " overdue"
		}
		chips = append(chips, H("span", Attrs{"class": cls, "title": t.Due}, label))
	}
	for _, tag := range t.Tags {
		chips = append(chips, H("button", Attrs{
			"class": "chip tag", "type": "button", "data-act": "filter-tag", "data-tag": tag,
		}, "#"+tag))
	}

	del := H("button", Attrs{
		"class": "tp-del", "type": "button", "data-act": "delete", "aria-label": "Delete: " + t.Title,
	}, "×")

	return H("li", Attrs{"class": class, "data-task": strconv.Itoa(t.ID)},
		check,
		H("div", Attrs{"class": "tp-body"}, title, H("div", Attrs{"class": "tp-meta"}, chips)),
		del)
}
