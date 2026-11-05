package main

// Entry point. The page ships only an empty <div id="app-root">: this program
// builds the entire interface, styles included, and attaches every listener.
func main() {
	root := Q("#app-root")
	if isNil(root) {
		panic("missing #app-root")
	}
	NewApp(root).Start()

	// Keep the Go runtime alive so listeners and timers keep working.
	select {}
}
