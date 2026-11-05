package main

import (
	"fmt"
	"math"
	"syscall/js"
	"time"
)

const dateLayout = "2006-01-02"

// today returns the user's local date as YYYY-MM-DD. It asks the browser,
// because the Go wasm runtime does not know the user's time zone.
func today() string {
	d := js.Global().Get("Date").New()
	return fmt.Sprintf("%04d-%02d-%02d",
		d.Call("getFullYear").Int(),
		d.Call("getMonth").Int()+1,
		d.Call("getDate").Int())
}

func parseDate(s string) (time.Time, bool) {
	t, err := time.Parse(dateLayout, s)
	return t, err == nil
}

// validDate reports whether s is a real calendar date in YYYY-MM-DD form.
func validDate(s string) bool {
	_, ok := parseDate(s)
	return ok
}

// daysFrom returns how many whole days target is after base (negative = before).
func daysFrom(base, target string) (int, bool) {
	a, ok1 := parseDate(base)
	b, ok2 := parseDate(target)
	if !ok1 || !ok2 {
		return 0, false
	}
	return int(math.Round(b.Sub(a).Hours() / 24)), true
}

// addDays shifts a YYYY-MM-DD date by n days.
func addDays(base string, n int) string {
	t, ok := parseDate(base)
	if !ok {
		return base
	}
	return t.AddDate(0, 0, n).Format(dateLayout)
}

// dueLabel renders a due date relative to now, and says whether it is overdue.
func dueLabel(due, now string) (label string, overdue bool) {
	n, ok := daysFrom(now, due)
	if !ok {
		return "", false
	}
	switch {
	case n < 0:
		return fmt.Sprintf("%dd overdue", -n), true
	case n == 0:
		return "today", false
	case n == 1:
		return "tomorrow", false
	case n < 7:
		return fmt.Sprintf("in %dd", n), false
	}
	return due, false
}
