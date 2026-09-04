package shapes

type Shape struct {
	Name string
}

func (s *Shape) Area() int {
	local := 0
	return local
}

func NewShape(name string) *Shape {
	return &Shape{Name: name}
}

var ExportedVar = 1

const ExportedConst = 2
