package shapes

// Fixture canónica: Decorator (Go — sin herencia de clases, campo SIEMPRE
// anotado por gramática, la inyección se lee del composite literal en NewX).
type ColorDecorator struct {
	shape Shape
}

func NewColorDecorator(shape Shape) *ColorDecorator {
	return &ColorDecorator{shape: shape}
}

func (d *ColorDecorator) Area() float64 {
	return d.shape.Area()
}

func (d *ColorDecorator) Describe() string {
	return d.shape.Describe()
}

// Control negativo: colaborador (Logger) ajeno a la familia, método distinto.
type ReportGenerator struct {
	logger Logger
}

func NewReportGenerator(logger Logger) *ReportGenerator {
	return &ReportGenerator{logger: logger}
}

func (r *ReportGenerator) Generate() {
	r.logger.Info("generating")
}
