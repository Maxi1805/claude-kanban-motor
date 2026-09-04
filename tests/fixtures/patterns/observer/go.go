package events

// Fixture canónica: Observer (Go), ya aplicado. `Attach`+`NotifyAll` son la
// pareja suscriptor/notificador completa (lista genérica + recorrido-e-
// invocación). `OnCreate`/`OnDelete` son el ancla real del hallazgo
// (`manual-notification`): dos eventos que TODAVÍA no migraron a la lista y
// siguen notificando a mano, campo por campo — conviven con la lista, no la
// reemplazan (ver `hypotheses/observer.ts`, estado `ya-aplicado`).
type Subject struct {
	observers     []Observer
	status        string
	emailObserver EmailObserver
	smsObserver   SmsObserver
}

func (s *Subject) Attach(o Observer) {
	s.observers = append(s.observers, o)
}

func (s *Subject) NotifyAll(event string) {
	for _, observer := range s.observers {
		observer.Update(event)
	}
}

func (s *Subject) OnCreate(event string) {
	s.status = "created"
	s.emailObserver.OnChange(event)
	s.smsObserver.OnChange(event)
}

func (s *Subject) OnDelete(event string) {
	s.status = "deleted"
	s.emailObserver.OnChange(event)
	s.smsObserver.OnChange(event)
}
