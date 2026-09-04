package strategies

import "sort"

// Fixture canónica: parámetro invocable (#18) — Go (func como valor de
// primera clase, el modismo real en vez de una jerarquía de interfaces).
type Sorter struct{}

func (s Sorter) SortBy(list []int, comparator func(a, b int) bool) {
	sort.Slice(list, func(i, j int) bool {
		return comparator(list[i], list[j])
	})
}

// Control negativo #18: el callback se guarda pero nunca se invoca acá.
type EventBus struct {
	subscribers []func()
}

func (b *EventBus) Subscribe(callback func()) {
	b.subscribers = append(b.subscribers, callback)
}

// Positivo #23 (SAM), aproximado con struct: un solo método público.
// NOTA (ver generalidad.md): el modismo MÁS idiomático de Go para SAM es una
// `interface` de un solo método (`type Runner interface { Run() }`), no un
// struct — el extractor de referencia de esta ronda no visita declaraciones
// `interface_type` como unidades, solo `struct_type`; queda documentado
// como límite del extractor, no de la relación.
type PrintCommand struct{}

func (p PrintCommand) Execute() {
	println("printing")
}
