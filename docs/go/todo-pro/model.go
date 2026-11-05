package main

import (
	"sort"
	"strings"
)

// InboxID is the built-in project that can never be deleted.
const InboxID = 1

// Task is one todo item.
type Task struct {
	ID          int      `json:"id"`
	Title       string   `json:"title"`
	Notes       string   `json:"notes,omitempty"`
	Done        bool     `json:"done"`
	Priority    Priority `json:"priority"`
	Tags        []string `json:"tags,omitempty"`
	Due         string   `json:"due,omitempty"` // YYYY-MM-DD, empty = no date
	ProjectID   int      `json:"projectId"`
	Created     string   `json:"created"`
	CompletedOn string   `json:"completedOn,omitempty"`
}

// Project groups tasks.
type Project struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// State is everything that gets saved, exported, and put on the undo stack.
type State struct {
	Tasks         []Task    `json:"tasks"`
	Projects      []Project `json:"projects"`
	NextTaskID    int       `json:"nextTaskId"`
	NextProjectID int       `json:"nextProjectId"`
}

// Clone makes a deep copy, so history snapshots can't be changed later.
func (s State) Clone() State {
	out := State{
		Tasks:         make([]Task, len(s.Tasks)),
		Projects:      append([]Project(nil), s.Projects...),
		NextTaskID:    s.NextTaskID,
		NextProjectID: s.NextProjectID,
	}
	for i, t := range s.Tasks {
		t.Tags = append([]string(nil), t.Tags...)
		out.Tasks[i] = t
	}
	return out
}

// ProjectName looks up a project by id ("Inbox" if it is missing).
func (s State) ProjectName(id int) string {
	for _, p := range s.Projects {
		if p.ID == id {
			return p.Name
		}
	}
	return "Inbox"
}

// HasProject reports whether a project id exists.
func (s State) HasProject(id int) bool {
	for _, p := range s.Projects {
		if p.ID == id {
			return true
		}
	}
	return false
}

// slug is how a project name is written in a search query: lower-case, no spaces.
func slug(name string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "-"))
}

// normalizeTags splits "Work, #urgent  home" into ["home" "urgent" "work"].
func normalizeTags(raw string) []string {
	seen := map[string]bool{}
	var tags []string
	for _, f := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == ';'
	}) {
		f = strings.ToLower(strings.TrimLeft(strings.TrimSpace(f), "#"))
		if f != "" && !seen[f] {
			seen[f] = true
			tags = append(tags, f)
		}
	}
	sort.Strings(tags)
	return tags
}
