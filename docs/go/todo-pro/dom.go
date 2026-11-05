package main

import "syscall/js"

// A tiny DOM toolkit on top of syscall/js. Text always goes in as text nodes,
// never as HTML, so user input can't inject markup.

var doc = js.Global().Get("document")

// Attrs are HTML attributes for H. "class" and "value" are set as properties.
type Attrs map[string]string

// H creates an element. Children may be string, js.Value, or []js.Value.
func H(tag string, attrs Attrs, kids ...any) js.Value {
	el := doc.Call("createElement", tag)
	for k, v := range attrs {
		switch k {
		case "class":
			el.Set("className", v)
		case "value":
			el.Set("value", v)
		default:
			el.Call("setAttribute", k, v)
		}
	}
	appendKids(el, kids)
	return el
}

func appendKids(el js.Value, kids []any) {
	for _, k := range kids {
		switch c := k.(type) {
		case string:
			el.Call("appendChild", doc.Call("createTextNode", c))
		case js.Value:
			el.Call("appendChild", c)
		case []js.Value:
			for _, v := range c {
				el.Call("appendChild", v)
			}
		}
	}
}

// Replace empties el and fills it with new children.
func Replace(el js.Value, kids ...any) {
	el.Set("textContent", "")
	appendKids(el, kids)
}

func isNil(v js.Value) bool { return v.IsNull() || v.IsUndefined() }

// Q finds the first element matching a CSS selector (or null).
func Q(sel string) js.Value { return doc.Call("querySelector", sel) }

// ByID finds an element by id and panics with a clear message if it is absent.
func ByID(id string) js.Value {
	el := doc.Call("getElementById", id)
	if isNil(el) {
		panic("missing element #" + id)
	}
	return el
}

// On attaches a Go function as an event listener. The returned js.Func should
// be released if the listener is ever removed; app-lifetime listeners aren't.
func On(target js.Value, event string, fn func(e js.Value)) js.Func {
	f := js.FuncOf(func(this js.Value, args []js.Value) any {
		fn(args[0])
		return nil
	})
	target.Call("addEventListener", event, f)
	return f
}

// Closest walks up from el to the nearest ancestor (or itself) matching sel.
func Closest(el js.Value, sel string) js.Value {
	if isNil(el) || el.Get("closest").Type() != js.TypeFunction {
		return js.Null()
	}
	return el.Call("closest", sel)
}

// Data reads a data-* attribute ("" if missing).
func Data(el js.Value, key string) string {
	if isNil(el) {
		return ""
	}
	v := el.Get("dataset").Get(key)
	if isNil(v) {
		return ""
	}
	return v.String()
}

// Val reads the current value of an input, textarea, or select.
func Val(el js.Value) string { return el.Get("value").String() }

// Focus focuses an element by id.
func Focus(id string) { ByID(id).Call("focus") }
