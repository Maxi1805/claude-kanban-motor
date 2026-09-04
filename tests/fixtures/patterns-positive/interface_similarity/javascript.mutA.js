// Fixture canónica: similitud de interfaz (#9), SIN herencia común (JavaScript).
class CreditCardPayment {
  pay(amount) {}
  refund(amount) {}
}

class PayPalPayment {
  pay(amount) {}
  refund(amount) {}
}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
class Report {
  generate() {}
  export() {}
}

class Widget {
  generate() {}
  render() {}
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: similitud de interfaz (#9), SIN herencia común (JavaScript).
class CreditCardPayment2 {
  pay(amount) {}
  refund(amount) {}
}

class PayPalPayment2 {
  pay(amount) {}
  refund(amount) {}
}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
class Report2 {
  generate() {}
  export() {}
}

class Widget2 {
  generate() {}
  render() {}
}

