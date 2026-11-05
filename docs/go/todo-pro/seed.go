package main

// seedState builds the sample data shown on a first visit. Due dates are
// relative to now so the demo always has overdue, today, and upcoming tasks.
func seedState(now string) State {
	st := State{
		Projects: []Project{
			{ID: InboxID, Name: "Inbox"},
			{ID: 2, Name: "Work"},
			{ID: 3, Name: "Home"},
			{ID: 4, Name: "Learning Go"},
		},
		NextTaskID:    1,
		NextProjectID: 5,
	}
	add := func(title string, p Priority, project int, due int, done bool, tags ...string) {
		t := Task{
			ID: st.NextTaskID, Title: title, Priority: p, ProjectID: project,
			Tags: normalizeTags(joinTags(tags)), Created: now, Done: done,
		}
		if due != noDue {
			t.Due = addDays(now, due)
		}
		if done {
			t.CompletedOn = now
		}
		st.NextTaskID++
		st.Tasks = append(st.Tasks, t)
	}

	add("Try the search box: tag:work priority:high", PriorityLow, InboxID, noDue, false, "tip")
	add("Press ? to see keyboard shortcuts", PriorityLow, InboxID, noDue, false, "tip")
	add("Ship the quarterly report", PriorityHigh, 2, -2, false, "work", "report")
	add("Review pull requests", PriorityMedium, 2, 0, false, "work", "code")
	add("Plan next sprint", PriorityMedium, 2, 3, false, "work", "planning")
	add("Book dentist appointment", PriorityMedium, 3, -1, false, "health")
	add("Buy groceries", PriorityLow, 3, 1, false, "errands")
	add("Fix the leaking tap", PriorityHigh, 3, 5, false, "home", "repair")
	add("Read the Go memory model", PriorityLow, 4, 10, false, "go", "reading")
	add("Write a goroutine worker pool", PriorityMedium, 4, 6, false, "go", "concurrency")
	add("Finish the Tour of Go", PriorityHigh, 4, -3, true, "go")
	return st
}

const noDue = 1 << 30

func joinTags(tags []string) string {
	out := ""
	for i, t := range tags {
		if i > 0 {
			out += ","
		}
		out += t
	}
	return out
}
