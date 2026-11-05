package main

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Store owns the application state. Every change goes through mutate, which
// records an undo snapshot and tells subscribers on the bus.
type Store struct {
	state State
	bus   *Bus
	hist  *History
	now   func() string

	// touched is the id of the task that just changed, so the view can animate
	// only that row. TakeTouched reads and clears it.
	touched int
}

// TakeTouched returns the id of the task that changed since the last call
// (0 if none) and clears it.
func (s *Store) TakeTouched() int {
	id := s.touched
	s.touched = 0
	return id
}

func NewStore(bus *Bus, st State) *Store {
	return &Store{state: st, bus: bus, hist: &History{}, now: today}
}

// State returns the current state. Callers must treat it as read-only.
func (s *Store) State() State { return s.state }

func (s *Store) CanUndo() bool { return s.hist.CanUndo() }
func (s *Store) CanRedo() bool { return s.hist.CanRedo() }

func (s *Store) mutate(label string, fn func()) {
	s.hist.Push(label, s.state)
	fn()
	s.bus.Emit(TopicChanged, label)
}

// NewTask holds the fields needed to create a task.
type NewTask struct {
	Title     string
	Notes     string
	Priority  Priority
	Tags      []string
	Due       string
	ProjectID int
}

// AddTask validates and appends a task.
func (s *Store) AddTask(n NewTask) (Task, error) {
	title := strings.TrimSpace(n.Title)
	if title == "" {
		return Task{}, errors.New("a task needs a title")
	}
	if n.Due != "" && !validDate(n.Due) {
		return Task{}, fmt.Errorf("%q is not a valid date", n.Due)
	}
	if !s.state.HasProject(n.ProjectID) {
		n.ProjectID = InboxID
	}
	var created Task
	s.mutate("add task", func() {
		created = Task{
			ID:        s.state.NextTaskID,
			Title:     title,
			Notes:     strings.TrimSpace(n.Notes),
			Priority:  n.Priority,
			Tags:      append([]string(nil), n.Tags...),
			Due:       n.Due,
			ProjectID: n.ProjectID,
			Created:   s.now(),
		}
		s.state.NextTaskID++
		s.state.Tasks = append(s.state.Tasks, created)
		s.touched = created.ID
	})
	return created, nil
}

// Update applies fn to one task as a single undoable change.
func (s *Store) Update(id int, label string, fn func(*Task)) bool {
	idx := s.indexOf(id)
	if idx < 0 {
		return false
	}
	s.mutate(label, func() {
		fn(&s.state.Tasks[idx])
		s.touched = id
	})
	return true
}

func (s *Store) Toggle(id int) {
	s.Update(id, "toggle task", func(t *Task) {
		t.Done = !t.Done
		if t.Done {
			t.CompletedOn = s.now()
		} else {
			t.CompletedOn = ""
		}
	})
}

func (s *Store) Delete(id int) {
	idx := s.indexOf(id)
	if idx < 0 {
		return
	}
	s.mutate("delete task", func() {
		s.state.Tasks = append(s.state.Tasks[:idx], s.state.Tasks[idx+1:]...)
	})
}

// ClearCompleted removes every finished task and returns how many went.
func (s *Store) ClearCompleted() int {
	n := 0
	for _, t := range s.state.Tasks {
		if t.Done {
			n++
		}
	}
	if n == 0 {
		return 0
	}
	s.mutate("clear completed", func() {
		kept := s.state.Tasks[:0]
		for _, t := range s.state.Tasks {
			if !t.Done {
				kept = append(kept, t)
			}
		}
		s.state.Tasks = kept
	})
	return n
}

// AddProject creates a project. Names must be unique, ignoring case.
func (s *Store) AddProject(name string) (Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Project{}, errors.New("a project needs a name")
	}
	for _, p := range s.state.Projects {
		if strings.EqualFold(p.Name, name) {
			return Project{}, fmt.Errorf("project %q already exists", p.Name)
		}
	}
	var created Project
	s.mutate("add project", func() {
		created = Project{ID: s.state.NextProjectID, Name: name}
		s.state.NextProjectID++
		s.state.Projects = append(s.state.Projects, created)
	})
	return created, nil
}

// DeleteProject removes a project and moves its tasks to the Inbox.
func (s *Store) DeleteProject(id int) error {
	if id == InboxID {
		return errors.New("the Inbox cannot be deleted")
	}
	if !s.state.HasProject(id) {
		return errors.New("no such project")
	}
	s.mutate("delete project", func() {
		for i := range s.state.Tasks {
			if s.state.Tasks[i].ProjectID == id {
				s.state.Tasks[i].ProjectID = InboxID
			}
		}
		kept := s.state.Projects[:0]
		for _, p := range s.state.Projects {
			if p.ID != id {
				kept = append(kept, p)
			}
		}
		s.state.Projects = kept
	})
	return nil
}

// Replace swaps the whole state (used by import and reset) as one undoable step.
func (s *Store) Replace(st State, label string) {
	s.mutate(label, func() { s.state = st })
}

// Undo and Redo move through history and report what changed.
func (s *Store) Undo() (string, bool) {
	st, label, ok := s.hist.Undo(s.state)
	if !ok {
		return "", false
	}
	s.state = st
	s.bus.Emit(TopicChanged, "undo "+label)
	return label, true
}

func (s *Store) Redo() (string, bool) {
	st, label, ok := s.hist.Redo(s.state)
	if !ok {
		return "", false
	}
	s.state = st
	s.bus.Emit(TopicChanged, "redo "+label)
	return label, true
}

// TagCount is a tag with how many tasks use it.
type TagCount struct {
	Tag   string
	Count int
}

// TagCounts returns every tag, most used first.
func (s *Store) TagCounts() []TagCount {
	counts := map[string]int{}
	for _, t := range s.state.Tasks {
		for _, tag := range t.Tags {
			counts[tag]++
		}
	}
	out := make([]TagCount, 0, len(counts))
	for tag, n := range counts {
		out = append(out, TagCount{Tag: tag, Count: n})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Tag < out[j].Tag
	})
	return out
}

func (s *Store) indexOf(id int) int {
	for i, t := range s.state.Tasks {
		if t.ID == id {
			return i
		}
	}
	return -1
}
