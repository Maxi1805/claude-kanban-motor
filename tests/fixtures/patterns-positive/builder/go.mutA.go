package pizza

// Fixture canónica: Builder / encadenamiento fluido (Go). El "receptor" es
// el NOMBRE DE VARIABLE elegido en la firma (`b`), no una palabra reservada.
type PizzaBuilder struct {
	size     string
	toppings []string
}

func (b *PizzaBuilder) SetSize(size string) *PizzaBuilder {
	b.size = size
	return b
}

func (b *PizzaBuilder) AddTopping(topping string) *PizzaBuilder {
	b.toppings = append(b.toppings, topping)
	return b
}

// Control negativo: mismos pasos, SIN encadenamiento (no retorna el receptor).
type PizzaOrder struct {
	size     string
	toppings []string
}

func (o *PizzaOrder) SetSize(size string) {
	o.size = size
}

func (o *PizzaOrder) AddTopping(topping string) {
	o.toppings = append(o.toppings, topping)
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type PizzaBuilder2 struct {
	size     string
	toppings []string
}

func (b *PizzaBuilder2) SetSize(size string) *PizzaBuilder2 {
	b.size = size
	return b
}

func (b *PizzaBuilder2) AddTopping(topping string) *PizzaBuilder2 {
	b.toppings = append(b.toppings, topping)
	return b
}

// Control negativo: mismos pasos, SIN encadenamiento (no retorna el receptor).
type PizzaOrder2 struct {
	size     string
	toppings []string
}

func (o *PizzaOrder2) SetSize(size string) {
	o.size = size
}

func (o *PizzaOrder2) AddTopping(topping string) {
	o.toppings = append(o.toppings, topping)
}

