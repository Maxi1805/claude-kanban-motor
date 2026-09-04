package traffic

// Fixture canónica: State ya aplicado (Go). Cada estado es su propio tipo
// con la misma interfaz; el contexto solo reasigna t.state, sin ningún
// switch sobre él repartido en varios métodos.
type LightState interface {
	Next() LightState
}

type RedState struct{}

func (r *RedState) Next() LightState { return &GreenState{} }

type GreenState struct{}

func (g *GreenState) Next() LightState { return &YellowState{} }

type YellowState struct{}

func (y *YellowState) Next() LightState { return &RedState{} }

type TrafficLight struct {
	state LightState
}

func (t *TrafficLight) Advance() {
	t.state = t.state.Next()
}

func (t *TrafficLight) ForceState(s LightState) {
	t.state = s
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type LightState2 interface {
	Next() LightState2
}

type RedState2 struct{}

func (r *RedState2) Next() LightState2 { return &GreenState2{} }

type GreenState2 struct{}

func (g *GreenState2) Next() LightState2 { return &YellowState2{} }

type YellowState2 struct{}

func (y *YellowState2) Next() LightState2 { return &RedState2{} }

type TrafficLight2 struct {
	state LightState2
}

func (t *TrafficLight2) Advance() {
	t.state = t.state.Next()
}

func (t *TrafficLight2) ForceState(s LightState2) {
	t.state = s
}

