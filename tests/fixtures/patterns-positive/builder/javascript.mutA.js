// Fixture canónica: Builder / encadenamiento fluido (JavaScript).
class PizzaBuilder {
  constructor() {
    this.toppings = [];
  }

  setSize(size) {
    this.size = size;
    return this;
  }

  addTopping(topping) {
    this.toppings.push(topping);
    return this;
  }
}

// Control negativo: mismos pasos, SIN encadenamiento.
class PizzaOrder {
  constructor() {
    this.toppings = [];
  }

  setSize(size) {
    this.size = size;
  }

  addTopping(topping) {
    this.toppings.push(topping);
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Builder / encadenamiento fluido (JavaScript).
class PizzaBuilder2 {
  constructor() {
    this.toppings = [];
  }

  setSize(size) {
    this.size = size;
    return this;
  }

  addTopping(topping) {
    this.toppings.push(topping);
    return this;
  }
}

// Control negativo: mismos pasos, SIN encadenamiento.
class PizzaOrder2 {
  constructor() {
    this.toppings = [];
  }

  setSize(size) {
    this.size = size;
  }

  addTopping(topping) {
    this.toppings.push(topping);
  }
}

