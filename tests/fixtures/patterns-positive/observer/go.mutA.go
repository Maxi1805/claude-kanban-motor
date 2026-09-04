package events

type Subject struct {
	observers []Observer
}

func (s *Subject) Attach(o Observer) {
	s.observers = append(s.observers, o)
}

func (s *Subject) NotifyAll(event string) {
	for _, observer := range s.observers {
		observer.Update(event)
	}
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type Subject2 struct {
	observers []Observer
}

func (s *Subject2) Attach(o Observer) {
	s.observers = append(s.observers, o)
}

func (s *Subject2) NotifyAll(event string) {
	for _, observer := range s.observers {
		observer.Update(event)
	}
}

