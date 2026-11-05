package main

import (
	"fmt"
	"strings"
)

// Priority is a task's importance. It serialises to JSON as a readable word.
type Priority int

const (
	PriorityNone Priority = iota
	PriorityLow
	PriorityMedium
	PriorityHigh
)

var priorityNames = [...]string{"none", "low", "medium", "high"}

// AllPriorities lists every priority, highest first (handy for menus).
var AllPriorities = []Priority{PriorityHigh, PriorityMedium, PriorityLow, PriorityNone}

func (p Priority) String() string {
	if p < 0 || int(p) >= len(priorityNames) {
		return priorityNames[PriorityNone]
	}
	return priorityNames[p]
}

// ParsePriority accepts full names and one-letter shortcuts.
func ParsePriority(s string) (Priority, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "none", "n":
		return PriorityNone, true
	case "low", "l":
		return PriorityLow, true
	case "medium", "med", "m":
		return PriorityMedium, true
	case "high", "h":
		return PriorityHigh, true
	}
	return PriorityNone, false
}

// MarshalText implements encoding.TextMarshaler for JSON.
func (p Priority) MarshalText() ([]byte, error) {
	return []byte(p.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler for JSON.
func (p *Priority) UnmarshalText(b []byte) error {
	v, ok := ParsePriority(string(b))
	if !ok {
		return fmt.Errorf("unknown priority %q", string(b))
	}
	*p = v
	return nil
}
