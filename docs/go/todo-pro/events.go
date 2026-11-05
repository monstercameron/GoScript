package main

import (
	"sync"
	"time"
)

// Topic names used on the event bus.
const (
	TopicChanged = "changed" // payload: string label of the change
	TopicToast   = "toast"   // payload: string message
)

// Bus is a tiny publish/subscribe hub that decouples the store from the views.
type Bus struct {
	handlers map[string][]func(any)
}

func NewBus() *Bus {
	return &Bus{handlers: map[string][]func(any){}}
}

func (b *Bus) On(topic string, fn func(any)) {
	b.handlers[topic] = append(b.handlers[topic], fn)
}

func (b *Bus) Emit(topic string, payload any) {
	for _, fn := range b.handlers[topic] {
		fn(payload)
	}
}

// Debouncer runs only the most recent function after a quiet period. It uses a
// real Go timer (time.AfterFunc), which runs on its own goroutine.
type Debouncer struct {
	mu    sync.Mutex
	delay time.Duration
	timer *time.Timer
}

func NewDebouncer(delay time.Duration) *Debouncer {
	return &Debouncer{delay: delay}
}

func (d *Debouncer) Do(fn func()) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.timer != nil {
		d.timer.Stop()
	}
	d.timer = time.AfterFunc(d.delay, fn)
}
