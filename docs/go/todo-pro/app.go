package main

import (
	"fmt"
	"syscall/js"
	"time"
)

// App connects the store (data), the bus (events), and the views (DOM).
type App struct {
	bus       *Bus
	store     *Store
	root      js.Value
	query     string
	sortKey   SortKey
	editingID int
	showData  bool
	searchDeb *Debouncer
	saveDeb   *Debouncer
	renders   int
	touchedID int // task to animate in the next render (0 = none)
}

// NewApp restores saved data, or seeds the sample list on a first visit.
func NewApp(root js.Value) *App {
	bus := NewBus()
	st, ok := LoadState()
	if !ok {
		st = seedState(today())
	}
	return &App{
		bus:       bus,
		store:     NewStore(bus, st),
		root:      root,
		sortKey:   SortDue,
		searchDeb: NewDebouncer(150 * time.Millisecond),
		saveDeb:   NewDebouncer(300 * time.Millisecond),
	}
}

// Start builds the whole UI from Go and attaches every listener.
func (a *App) Start() {
	injectStyle()
	a.buildShell()
	a.bindEvents()
	a.bindShortcuts()

	a.bus.On(TopicChanged, func(any) {
		a.saveSoon()
		a.render()
	})
	a.bus.On(TopicToast, func(msg any) { a.showToast(fmt.Sprint(msg)) })

	a.render()
	a.announceReady()
}

func (a *App) toast(msg string) { a.bus.Emit(TopicToast, msg) }

// saveSoon persists the state after a short quiet period (debounced).
func (a *App) saveSoon() {
	a.saveDeb.Do(func() {
		if err := SaveState(a.store.State()); err != nil {
			a.toast("Could not save: " + err.Error())
		}
	})
}

// announceReady tells the host page that Go is running and listeners are live.
func (a *App) announceReady() {
	hook := js.Global().Get("onGoTodoReady")
	if hook.Type() == js.TypeFunction {
		hook.Invoke(len(a.store.State().Tasks))
	}
}
