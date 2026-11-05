package main

const historyLimit = 100

type historyEntry struct {
	label string
	state State
}

// History is an undo/redo stack of whole-state snapshots.
type History struct {
	undo []historyEntry
	redo []historyEntry
}

// Push records the state as it was before a change. It clears the redo stack.
func (h *History) Push(label string, before State) {
	h.undo = append(h.undo, historyEntry{label: label, state: before.Clone()})
	if len(h.undo) > historyLimit {
		h.undo = h.undo[len(h.undo)-historyLimit:]
	}
	h.redo = nil
}

// Undo returns the previous state. current is saved so Redo can come back.
func (h *History) Undo(current State) (State, string, bool) {
	if len(h.undo) == 0 {
		return current, "", false
	}
	e := h.undo[len(h.undo)-1]
	h.undo = h.undo[:len(h.undo)-1]
	h.redo = append(h.redo, historyEntry{label: e.label, state: current.Clone()})
	return e.state, e.label, true
}

// Redo re-applies the most recently undone change.
func (h *History) Redo(current State) (State, string, bool) {
	if len(h.redo) == 0 {
		return current, "", false
	}
	e := h.redo[len(h.redo)-1]
	h.redo = h.redo[:len(h.redo)-1]
	h.undo = append(h.undo, historyEntry{label: e.label, state: current.Clone()})
	return e.state, e.label, true
}

func (h *History) CanUndo() bool { return len(h.undo) > 0 }
func (h *History) CanRedo() bool { return len(h.redo) > 0 }
