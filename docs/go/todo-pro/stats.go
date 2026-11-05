package main

import "strings"

// ProjectStat counts tasks in one project.
type ProjectStat struct {
	Name string
	Open int
	Done int
}

// Stats summarises the whole task list.
type Stats struct {
	Total       int
	Done        int
	Open        int
	Overdue     int
	DueToday    int
	PercentDone int
	OpenByPrio  map[Priority]int
	Projects    []ProjectStat
}

// ComputeStats walks the state once and fills in every counter.
func ComputeStats(st State, now string) Stats {
	s := Stats{OpenByPrio: map[Priority]int{}}
	perProject := map[int]*ProjectStat{}
	for _, p := range st.Projects {
		perProject[p.ID] = &ProjectStat{Name: p.Name}
	}
	for _, t := range st.Tasks {
		s.Total++
		ps := perProject[t.ProjectID]
		if t.Done {
			s.Done++
			if ps != nil {
				ps.Done++
			}
			continue
		}
		s.Open++
		s.OpenByPrio[t.Priority]++
		if ps != nil {
			ps.Open++
		}
		switch {
		case t.Due != "" && t.Due < now:
			s.Overdue++
		case t.Due == now:
			s.DueToday++
		}
	}
	if s.Total > 0 {
		s.PercentDone = s.Done * 100 / s.Total
	}
	for _, p := range st.Projects {
		s.Projects = append(s.Projects, *perProject[p.ID])
	}
	return s
}

// ProgressBar draws a text bar such as "██████░░░░" for a percentage.
func ProgressBar(percent, width int) string {
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	filled := percent * width / 100
	return strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
}
