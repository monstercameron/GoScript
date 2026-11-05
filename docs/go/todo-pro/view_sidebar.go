package main

import (
	"fmt"
	"strconv"
	"syscall/js"
)

// renderSidebar draws the project list, tag cloud, and statistics.
func (a *App) renderSidebar(st State, now string) {
	q := ParseQuery(a.query)
	stats := ComputeStats(st, now)

	// Projects: "All tasks" plus one button per project with its open count.
	all := H("button", Attrs{
		"type": "button", "class": navClass(q.Project == ""), "data-act": "filter-project", "data-project": "",
	}, "All tasks", H("span", Attrs{"class": "tp-n"}, strconv.Itoa(stats.Open)))
	items := []js.Value{all}
	for _, ps := range stats.Projects {
		p := projectByName(st, ps.Name)
		row := []any{
			H("button", Attrs{
				"type": "button", "class": navClass(q.Project == slug(p.Name)),
				"data-act": "filter-project", "data-project": slug(p.Name),
			}, p.Name, H("span", Attrs{"class": "tp-n"}, strconv.Itoa(ps.Open))),
		}
		if p.ID != InboxID {
			row = append(row, H("button", Attrs{
				"type": "button", "class": "tp-del", "data-act": "delete-project",
				"data-project-id": strconv.Itoa(p.ID), "aria-label": "Delete project " + p.Name,
			}, "×"))
		}
		items = append(items, H("div", Attrs{"class": "tp-projrow"}, row...))
	}
	Replace(ByID("projects"), items)

	// Tags, most used first. Clicking toggles a tag:<name> filter.
	var tagButtons []js.Value
	for _, tc := range a.store.TagCounts() {
		active := hasTag(q.Tags, tc.Tag)
		cls := "chip tag"
		if active {
			cls += " is-active"
		}
		tagButtons = append(tagButtons, H("button", Attrs{
			"type": "button", "class": cls, "data-act": "filter-tag", "data-tag": tc.Tag,
		}, fmt.Sprintf("#%s %d", tc.Tag, tc.Count)))
	}
	if len(tagButtons) == 0 {
		tagButtons = append(tagButtons, H("span", Attrs{"class": "tp-muted"}, "No tags yet"))
	}
	Replace(ByID("tags"), tagButtons)

	// Statistics.
	lines := []js.Value{
		H("div", Attrs{"class": "tp-bar", "aria-label": fmt.Sprintf("%d percent done", stats.PercentDone)},
			ProgressBar(stats.PercentDone, 14)),
		H("div", nil, fmt.Sprintf("%d%% done (%d of %d)", stats.PercentDone, stats.Done, stats.Total)),
	}
	if stats.Overdue > 0 {
		lines = append(lines, H("div", Attrs{"class": "tp-warn"}, fmt.Sprintf("%d overdue", stats.Overdue)))
	}
	if stats.DueToday > 0 {
		lines = append(lines, H("div", nil, fmt.Sprintf("%d due today", stats.DueToday)))
	}
	lines = append(lines, H("div", Attrs{"class": "tp-muted"}, fmt.Sprintf("Open: %d high, %d medium, %d low",
		stats.OpenByPrio[PriorityHigh], stats.OpenByPrio[PriorityMedium], stats.OpenByPrio[PriorityLow])))
	Replace(ByID("stats"), lines)

	ByID("go-stats").Set("textContent", fmt.Sprintf("Rendered by Go: %d tasks, %d renders", stats.Total, a.renders))
}

func navClass(active bool) string {
	if active {
		return "tp-nav is-active"
	}
	return "tp-nav"
}

func projectByName(st State, name string) Project {
	for _, p := range st.Projects {
		if p.Name == name {
			return p
		}
	}
	return Project{ID: InboxID, Name: name}
}
