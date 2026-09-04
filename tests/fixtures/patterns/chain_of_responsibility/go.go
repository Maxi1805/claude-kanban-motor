package handlers

// Fixture canónica: Chain of Responsibility (Go).
type Handler struct {
	next *Handler
}

func (h *Handler) SetNext(next *Handler) {
	h.next = next
}

func (h *Handler) Handle(req *Request) {
	if h.next != nil {
		h.next.Handle(req)
	}
}

// Control negativo: condicional real, mensaje reenviado DISTINTO.
type Cache struct {
	logger Logger
}

func (c *Cache) Reset() {
	if c.logger != nil {
		c.logger.Flush()
	}
}
