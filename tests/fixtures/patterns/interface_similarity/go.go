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
