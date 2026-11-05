package main

import (
	"sort"
	"strings"
)

// SortKey chooses how the visible tasks are ordered.
type SortKey string

const (
	SortCreated  SortKey = "created"
	SortDue      SortKey = "due"
	SortPriority SortKey = "priority"
	SortTitle    SortKey = "title"
)

// Query is a parsed search box. Syntax (all parts are ANDed together):
//
//	groceries            free words match the title and notes
//	tag:work             has this tag
//	priority:high        priority (also p:h)
//	project:home         project name, lower-case with dashes for spaces
//	is:done / is:open    completion
//	due:today|overdue|week|none|any
type Query struct {
	Words    []string
	Tags     []string
	Priority *Priority
	Done     *bool
	Project  string
	Due      string
}

// ParseQuery turns the search text into a Query. Unknown "key:value" tokens
// fall back to free words, so typing never produces an error.
func ParseQuery(raw string) Query {
	var q Query
	for _, tok := range strings.Fields(raw) {
		key, val, found := strings.Cut(tok, ":")
		key, val = strings.ToLower(key), strings.ToLower(val)
		if !found || val == "" {
			q.Words = append(q.Words, strings.ToLower(tok))
			continue
		}
		switch key {
		case "tag":
			q.Tags = append(q.Tags, strings.TrimLeft(val, "#"))
		case "priority", "p":
			if p, ok := ParsePriority(val); ok {
				q.Priority = &p
			} else {
				q.Words = append(q.Words, strings.ToLower(tok))
			}
		case "is":
			switch val {
			case "done":
				done := true
				q.Done = &done
			case "open", "active":
				done := false
				q.Done = &done
			default:
				q.Words = append(q.Words, strings.ToLower(tok))
			}
		case "project":
			q.Project = val
		case "due":
			q.Due = val
		default:
			q.Words = append(q.Words, strings.ToLower(tok))
		}
	}
	return q
}

// Empty reports whether the query filters nothing.
func (q Query) Empty() bool {
	return len(q.Words) == 0 && len(q.Tags) == 0 && q.Priority == nil &&
		q.Done == nil && q.Project == "" && q.Due == ""
}

// Match reports whether one task satisfies the query.
func (q Query) Match(t Task, projectName, now string) bool {
	if q.Done != nil && t.Done != *q.Done {
		return false
	}
	if q.Priority != nil && t.Priority != *q.Priority {
		return false
	}
	if q.Project != "" && slug(projectName) != q.Project {
		return false
	}
	for _, want := range q.Tags {
		if !hasTag(t.Tags, want) {
			return false
		}
	}
	if !q.matchDue(t, now) {
		return false
	}
	haystack := strings.ToLower(t.Title + " " + t.Notes)
	for _, w := range q.Words {
		if !strings.Contains(haystack, w) {
			return false
		}
	}
	return true
}

func (q Query) matchDue(t Task, now string) bool {
	switch q.Due {
	case "":
		return true
	case "none":
		return t.Due == ""
	case "any":
		return t.Due != ""
	case "today":
		return t.Due == now
	case "overdue":
		return !t.Done && t.Due != "" && t.Due < now
	case "week":
		n, ok := daysFrom(now, t.Due)
		return ok && n >= 0 && n <= 7
	}
	return true
}

func hasTag(tags []string, want string) bool {
	for _, t := range tags {
		if t == want {
			return true
		}
	}
	return false
}

// SortTasks orders tasks in place. Finished tasks always sink to the bottom,
// and ties fall back to creation order so the result is stable.
func SortTasks(ts []Task, key SortKey) {
	sort.SliceStable(ts, func(i, j int) bool {
		a, b := ts[i], ts[j]
		if a.Done != b.Done {
			return !a.Done
		}
		switch key {
		case SortDue:
			if a.Due != b.Due {
				if a.Due == "" {
					return false
				}
				if b.Due == "" {
					return true
				}
				return a.Due < b.Due
			}
		case SortPriority:
			if a.Priority != b.Priority {
				return a.Priority > b.Priority
			}
		case SortTitle:
			la, lb := strings.ToLower(a.Title), strings.ToLower(b.Title)
			if la != lb {
				return la < lb
			}
		}
		return a.ID < b.ID
	})
}

// SetToken replaces any "key:..." token in raw with "key:val" (or removes it if
// val is empty). Used by the sidebar to apply project filters.
func SetToken(raw, key, val string) string {
	var out []string
	for _, tok := range strings.Fields(raw) {
		if strings.HasPrefix(strings.ToLower(tok), key+":") {
			continue
		}
		out = append(out, tok)
	}
	if val != "" {
		out = append(out, key+":"+val)
	}
	return strings.Join(out, " ")
}

// ToggleToken adds the exact token if absent and removes it if present.
func ToggleToken(raw, token string) string {
	var out []string
	found := false
	for _, tok := range strings.Fields(raw) {
		if strings.EqualFold(tok, token) {
			found = true
			continue
		}
		out = append(out, tok)
	}
	if !found {
		out = append(out, token)
	}
	return strings.Join(out, " ")
}
