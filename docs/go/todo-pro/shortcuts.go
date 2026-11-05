package main

import (
	"strings"
	"syscall/js"
)

// bindShortcuts listens on the whole document for keyboard shortcuts.
// Shortcuts are ignored while typing so the keys still reach text fields.
func (a *App) bindShortcuts() {
	On(doc, "keydown", func(e js.Value) {
		if isTyping(e.Get("target")) {
			return
		}
		key := e.Get("key").String()
		mod := e.Get("ctrlKey").Bool() || e.Get("metaKey").Bool()
		shift := e.Get("shiftKey").Bool()

		switch {
		case mod && strings.EqualFold(key, "z") && shift,
			mod && strings.EqualFold(key, "y"):
			e.Call("preventDefault")
			a.redo()
		case mod && strings.EqualFold(key, "z"):
			e.Call("preventDefault")
			a.undo()
		case mod:
			return
		case key == "n":
			e.Call("preventDefault")
			Focus("new-title")
		case key == "/":
			e.Call("preventDefault")
			Focus("search")
		case key == "?":
			help := Q(".tp-help")
			if !isNil(help) {
				help.Set("open", !help.Get("open").Bool())
			}
		}
	})
}

func isTyping(target js.Value) bool {
	if isNil(target) {
		return false
	}
	switch strings.ToUpper(target.Get("tagName").String()) {
	case "INPUT", "TEXTAREA", "SELECT":
		return true
	}
	return target.Get("isContentEditable").Bool()
}
