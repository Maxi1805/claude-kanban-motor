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


// --- POSITIVO (mutacion A: clone-duplicate) ---
type Handler2 struct {
	next *Handler2
}

func (h *Handler2) SetNext(next *Handler2) {
	h.next = next
}

func (h *Handler2) Handle(req *Request) {
	if h.next != nil {
		h.next.Handle(req)
	}
}

// Control negativo: condicional real, mensaje reenviado DISTINTO.
type Cache2 struct {
	logger Logger
}

func (c *Cache2) Reset() {
	if c.logger != nil {
		c.logger.Flush()
	}
}

