// Fixture canónica: Builder / encadenamiento fluido (TypeScript).
class PizzaBuilder {
  private size: string = "";
  private toppings: string[] = [];

  setSize(size: string): this {
    this.size = size;
    return this;
  }

  addTopping(topping: string): this {
    this.toppings.push(topping);
    return this;
  }
}

// Control negativo: mismos pasos, SIN encadenamiento.
class PizzaOrder {
  private size: string = "";
  private toppings: string[] = [];

  setSize(size: string): void {
    this.size = size;
  }

  addTopping(topping: string): void {
    this.toppings.push(topping);
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Builder / encadenamiento fluido (TypeScript).
class PizzaBuilder2 {
  private size: string = "";
  private toppings: string[] = [];

  setSize(size: string): this {
    this.size = size;
    return this;
  }

  addTopping(topping: string): this {
    this.toppings.push(topping);
    return this;
  }
}

// Control negativo: mismos pasos, SIN encadenamiento.
class PizzaOrder2 {
  private size: string = "";
  private toppings: string[] = [];

  setSize(size: string): void {
    this.size = size;
  }

  addTopping(topping: string): void {
    this.toppings.push(topping);
  }
}

