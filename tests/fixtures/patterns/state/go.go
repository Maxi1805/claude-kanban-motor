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
