package shapes

// Fixture canónica: Composite (Go).
type ShapeGroup struct {
	children []Shape
}

func (g *ShapeGroup) Add(child Shape) {
	g.children = append(g.children, child)
}

func (g *ShapeGroup) Render() {
	for _, c := range g.children {
		c.Render()
	}
}

// Control negativo: colección ajena a la familia (precios), iterada para sumar.
type Invoice struct {
	items []float64
}

func (i *Invoice) AddItem(price float64) {
	i.items = append(i.items, price)
}

func (i *Invoice) Total() float64 {
	sum := 0.0
	for _, price := range i.items {
		sum += price
	}
	return sum
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type ShapeGroup2 struct {
	children []Shape
}

func (g *ShapeGroup2) Add(child Shape) {
	g.children = append(g.children, child)
}

func (g *ShapeGroup2) Render() {
	for _, c := range g.children {
		c.Render()
	}
}

// Control negativo: colección ajena a la familia (precios), iterada para sumar.
type Invoice2 struct {
	items []float64
}

func (i *Invoice2) AddItem(price float64) {
	i.items = append(i.items, price)
}

func (i *Invoice2) Total() float64 {
	sum := 0.0
	for _, price := range i.items {
		sum += price
	}
	return sum
}

