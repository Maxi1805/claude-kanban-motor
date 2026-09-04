package payments

// Fixture canónica: similitud de interfaz (#9), SIN herencia común (Go —
// aquí es incluso más natural: Go resuelve interfaces IMPLÍCITAMENTE).
type CreditCardPayment struct{}

func (p CreditCardPayment) Pay(amount float64)    {}
func (p CreditCardPayment) Refund(amount float64) {}

type PayPalPayment struct{}

func (p PayPalPayment) Pay(amount float64)    {}
func (p PayPalPayment) Refund(amount float64) {}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
type Report struct{}

func (r Report) Generate() {}
func (r Report) Export()   {}

type Widget struct{}

func (w Widget) Generate() {}
func (w Widget) Render()   {}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type CreditCardPayment2 struct{}

func (p CreditCardPayment2) Pay(amount float64)    {}
func (p CreditCardPayment2) Refund(amount float64) {}

type PayPalPayment2 struct{}

func (p PayPalPayment2) Pay(amount float64)    {}
func (p PayPalPayment2) Refund(amount float64) {}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
type Report2 struct{}

func (r Report2) Generate() {}
func (r Report2) Export()   {}

type Widget2 struct{}

func (w Widget2) Generate() {}
func (w Widget2) Render()   {}

