package shapes

import "fmt"

// Fixture canónica: Proxy (Go). El campo se auto-instancia DENTRO de NewX
// (no llega como parámetro de NewX) — auto-instanciación, no inyección.
type ShapeProxy struct {
	real *RealShape
}

func NewShapeProxy() *ShapeProxy {
	return &ShapeProxy{real: NewRealShape()}
}

func (p *ShapeProxy) Area() float64 {
	return p.real.Area()
}

func (p *ShapeProxy) Paint(color string) {
	fmt.Println("painting")
	p.real.Paint(color)
}

// Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
type PureWrapper struct {
	real *RealShape
}

func NewPureWrapper() *PureWrapper {
	return &PureWrapper{real: NewRealShape()}
}

func (w *PureWrapper) Area() float64 {
	return w.real.Area()
}

func (w *PureWrapper) Paint(color string) {
	w.real.Paint(color)
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type ShapeProxy2 struct {
	real *RealShape
}

func NewShapeProxy2() *ShapeProxy2 {
	return &ShapeProxy2{real: NewRealShape()}
}

func (p *ShapeProxy2) Area() float64 {
	return p.real.Area()
}

func (p *ShapeProxy2) Paint(color string) {
	fmt.Println("painting")
	p.real.Paint(color)
}

// Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
type PureWrapper2 struct {
	real *RealShape
}

func NewPureWrapper2() *PureWrapper2 {
	return &PureWrapper2{real: NewRealShape()}
}

func (w *PureWrapper2) Area() float64 {
	return w.real.Area()
}

func (w *PureWrapper2) Paint(color string) {
	w.real.Paint(color)
}

