package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"syscall/js"
)

const (
	storageKey    = "goscript.todo.pro"
	schemaVersion = 2
)

// envelope wraps the saved state with a schema version so old data can be migrated.
type envelope struct {
	Version int             `json:"version"`
	State   json.RawMessage `json:"state"`
}

// legacyV1 is the first (flat) schema: tasks only, with a "text" field.
type legacyV1 struct {
	Tasks []struct {
		ID   int    `json:"id"`
		Text string `json:"text"`
		Done bool   `json:"done"`
	} `json:"tasks"`
}

// LoadState reads and validates the saved state. ok is false if nothing usable
// was stored (first visit, blocked storage, or corrupt data).
func LoadState() (st State, ok bool) {
	defer func() {
		if recover() != nil {
			st, ok = State{}, false
		}
	}()
	raw := js.Global().Get("localStorage").Call("getItem", storageKey)
	if raw.IsNull() || raw.IsUndefined() {
		return State{}, false
	}
	st, err := ImportJSON(raw.String())
	if err != nil {
		return State{}, false
	}
	return st, true
}

// SaveState writes the state to localStorage.
func SaveState(st State) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("storage unavailable: %v", r)
		}
	}()
	data, err := ExportJSON(st, false)
	if err != nil {
		return err
	}
	js.Global().Get("localStorage").Call("setItem", storageKey, data)
	return nil
}

// ExportJSON serialises the state inside a versioned envelope.
func ExportJSON(st State, pretty bool) (string, error) {
	body, err := json.Marshal(st)
	if err != nil {
		return "", err
	}
	env := envelope{Version: schemaVersion, State: body}
	var out []byte
	if pretty {
		out, err = json.MarshalIndent(env, "", "  ")
	} else {
		out, err = json.Marshal(env)
	}
	return string(out), err
}

// ImportJSON parses, migrates, and validates saved or pasted data.
func ImportJSON(data string) (State, error) {
	var env envelope
	if err := json.Unmarshal([]byte(data), &env); err != nil {
		return State{}, fmt.Errorf("not valid JSON: %w", err)
	}
	var st State
	switch env.Version {
	case 2:
		if err := json.Unmarshal(env.State, &st); err != nil {
			return State{}, fmt.Errorf("bad state: %w", err)
		}
	case 1:
		var old legacyV1
		if err := json.Unmarshal(env.State, &old); err != nil {
			return State{}, fmt.Errorf("bad v1 state: %w", err)
		}
		st = migrateV1(old)
	default:
		return State{}, fmt.Errorf("unsupported version %d (expected 1 or %d)", env.Version, schemaVersion)
	}
	if err := normalize(&st); err != nil {
		return State{}, err
	}
	return st, nil
}

func migrateV1(old legacyV1) State {
	st := State{NextTaskID: 1, NextProjectID: InboxID + 1,
		Projects: []Project{{ID: InboxID, Name: "Inbox"}}}
	for _, t := range old.Tasks {
		st.Tasks = append(st.Tasks, Task{
			ID: t.ID, Title: t.Text, Done: t.Done, ProjectID: InboxID, Created: today(),
		})
	}
	return st
}

// normalize repairs or rejects imported data so the rest of the app can trust it.
func normalize(st *State) error {
	if !st.HasProject(InboxID) {
		st.Projects = append([]Project{{ID: InboxID, Name: "Inbox"}}, st.Projects...)
	}
	seenProject := map[int]bool{}
	maxProject := InboxID
	for _, p := range st.Projects {
		if strings.TrimSpace(p.Name) == "" {
			return errors.New("a project has an empty name")
		}
		if seenProject[p.ID] {
			return fmt.Errorf("duplicate project id %d", p.ID)
		}
		seenProject[p.ID] = true
		if p.ID > maxProject {
			maxProject = p.ID
		}
	}
	seenTask := map[int]bool{}
	maxTask := 0
	for i := range st.Tasks {
		t := &st.Tasks[i]
		t.Title = strings.TrimSpace(t.Title)
		if t.Title == "" {
			return fmt.Errorf("task %d has an empty title", t.ID)
		}
		if t.ID <= 0 || seenTask[t.ID] {
			return fmt.Errorf("task %q has a missing or duplicate id", t.Title)
		}
		seenTask[t.ID] = true
		if t.ID > maxTask {
			maxTask = t.ID
		}
		if !seenProject[t.ProjectID] {
			t.ProjectID = InboxID
		}
		if t.Due != "" && !validDate(t.Due) {
			t.Due = ""
		}
		t.Tags = normalizeTags(strings.Join(t.Tags, ","))
	}
	if st.NextTaskID <= maxTask {
		st.NextTaskID = maxTask + 1
	}
	if st.NextProjectID <= maxProject {
		st.NextProjectID = maxProject + 1
	}
	sort.SliceStable(st.Projects, func(i, j int) bool { return st.Projects[i].ID < st.Projects[j].ID })
	return nil
}

// download hands a text file to the browser as a download.
func download(filename, content string) {
	blob := js.Global().Get("Blob").New([]any{content}, map[string]any{"type": "application/json"})
	url := js.Global().Get("URL").Call("createObjectURL", blob)
	a := H("a", Attrs{"href": url.String(), "download": filename})
	doc.Get("body").Call("appendChild", a)
	a.Call("click")
	a.Call("remove")
	js.Global().Get("URL").Call("revokeObjectURL", url)
}
