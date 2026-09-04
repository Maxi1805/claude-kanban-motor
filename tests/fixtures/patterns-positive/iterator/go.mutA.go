package collections

// Fixture canónica: Iterator / protocolo conocido (Go: `Next()`).
type NumberIterator struct {
	numbers []int
	i       int
}

func (it *NumberIterator) Next() int {
	v := it.numbers[it.i]
	it.i++
	return v
}

// Control negativo: nombre parecido ("NextPage"), no coincide con el protocolo.
type Paginator struct {
	page int
}

func (p *Paginator) NextPage() {
	p.page++
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type NumberIterator2 struct {
	numbers []int
	i       int
}

func (it *NumberIterator2) Next() int {
	v := it.numbers[it.i]
	it.i++
	return v
}

// Control negativo: nombre parecido ("NextPage"), no coincide con el protocolo.
type Paginator2 struct {
	page int
}

func (p *Paginator2) NextPage() {
	p.page++
}

