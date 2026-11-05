package main

import "time"

const maxToasts = 3

// showToast pops up a short message and removes it again after a moment.
func (a *App) showToast(msg string) {
	host := ByID("toast-host")
	for host.Get("children").Length() >= maxToasts {
		host.Get("firstElementChild").Call("remove")
	}
	toast := H("div", Attrs{"class": "tp-toast", "role": "status"}, msg)
	host.Call("appendChild", toast)
	time.AfterFunc(2800*time.Millisecond, func() { toast.Call("remove") })
}
