package main

import (
	"encoding/json"
	"strings"
	"syscall/js"
)

// Todo is a single task. The JSON tags are what gets saved to localStorage.
type Todo struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
	Done bool   `json:"done"`
}

// Filter selects which todos are visible.
type Filter string

const (
	FilterAll       Filter = "all"
	FilterActive    Filter = "active"
	FilterCompleted Filter = "completed"
)

const storageKey = "goscript.todo.v1"

// Store holds the todo list and knows how to persist itself.
type Store struct {
	items  []Todo
	nextID int
	filter Filter

	// touched is the id of the todo that just changed, so the view can animate
	// only that row. TakeTouched reads and clears it.
	touched int
}

type savedState struct {
	Items  []Todo `json:"items"`
	NextID int    `json:"nextId"`
}

// NewStore restores the saved list, or seeds a few starter items.
func NewStore() *Store {
	s := &Store{nextID: 1, filter: FilterAll}
	if !s.load() {
		s.Add("Open this page and watch Go compile in the browser")
		s.Add("Click a task to mark it done")
		s.Add("Reload: this list is restored from localStorage")
		s.items[0].Done = true
		s.touched = 0 // seeding is not a user change, so nothing should animate on load
		s.save()
	}
	return s
}

// Add appends a todo. Blank text is ignored. Returns true if added.
func (s *Store) Add(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	s.items = append(s.items, Todo{ID: s.nextID, Text: text})
	s.touched = s.nextID
	s.nextID++
	return true
}

// TakeTouched returns the id of the todo that changed since the last call
// (0 if none) and clears it.
func (s *Store) TakeTouched() int {
	id := s.touched
	s.touched = 0
	return id
}

// Toggle flips the done state of one todo.
func (s *Store) Toggle(id int) {
	for i := range s.items {
		if s.items[i].ID == id {
			s.items[i].Done = !s.items[i].Done
			s.touched = id
			return
		}
	}
}

// Remove deletes one todo.
func (s *Store) Remove(id int) {
	kept := s.items[:0]
	for _, t := range s.items {
		if t.ID != id {
			kept = append(kept, t)
		}
	}
	s.items = kept
}

// ClearCompleted deletes every finished todo and returns how many were removed.
func (s *Store) ClearCompleted() int {
	before := len(s.items)
	kept := s.items[:0]
	for _, t := range s.items {
		if !t.Done {
			kept = append(kept, t)
		}
	}
	s.items = kept
	return before - len(kept)
}

// Visible returns the todos that match the current filter.
func (s *Store) Visible() []Todo {
	out := make([]Todo, 0, len(s.items))
	for _, t := range s.items {
		switch s.filter {
		case FilterActive:
			if t.Done {
				continue
			}
		case FilterCompleted:
			if !t.Done {
				continue
			}
		}
		out = append(out, t)
	}
	return out
}

// Counts returns (remaining, completed, total).
func (s *Store) Counts() (int, int, int) {
	done := 0
	for _, t := range s.items {
		if t.Done {
			done++
		}
	}
	return len(s.items) - done, done, len(s.items)
}

func (s *Store) load() (ok bool) {
	// Reading localStorage can throw (private mode, blocked storage).
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	raw := js.Global().Get("localStorage").Call("getItem", storageKey)
	if raw.IsNull() || raw.IsUndefined() {
		return false
	}
	var saved savedState
	if err := json.Unmarshal([]byte(raw.String()), &saved); err != nil {
		return false
	}
	s.items = saved.Items
	s.nextID = saved.NextID
	if s.nextID < 1 {
		s.nextID = 1
	}
	return true
}

func (s *Store) save() {
	defer func() { _ = recover() }()
	data, err := json.Marshal(savedState{Items: s.items, NextID: s.nextID})
	if err != nil {
		return
	}
	js.Global().Get("localStorage").Call("setItem", storageKey, string(data))
}
