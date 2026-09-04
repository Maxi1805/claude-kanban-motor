// Fixture canónica: similitud de interfaz (#9), SIN herencia común (TypeScript).
class CreditCardPayment {
  pay(amount: number): void {}
  refund(amount: number): void {}
}

class PayPalPayment {
  pay(amount: number): void {}
  refund(amount: number): void {}
}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
class Report {
  generate(): void {}
  export(): void {}
}

class Widget {
  generate(): void {}
  render(): void {}
}
