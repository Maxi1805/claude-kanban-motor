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
