package logging

// Fixture canónica: Null Object / override trivial (Go).
type ConsoleLogger struct{}

func (l ConsoleLogger) Log(msg string) {
	println(msg)
}

type NullLogger struct{}

func (l NullLogger) Log(msg string) {
}

// Control negativo: método corto, SIN familia con hermanos activos.
type ReportOptions struct{}

func (r ReportOptions) MiddleName() {
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type ConsoleLogger2 struct{}

func (l ConsoleLogger2) Log(msg string) {
	println(msg)
}

type NullLogger2 struct{}

func (l NullLogger2) Log(msg string) {
}

// Control negativo: método corto, SIN familia con hermanos activos.
type ReportOptions2 struct{}

func (r ReportOptions2) MiddleName() {
}

