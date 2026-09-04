// Fixture canónica: Composite (TypeScript, con anotaciones de tipo).
class ShapeGroup extends Shape {
  private children: Shape[] = [];

  add(child: Shape): void {
    this.children.push(child);
  }

  render(): void {
    this.children.forEach((c) => c.render());
  }
}

// Control negativo: colección real (number[]), ajena a la familia, iterada
// para sumar en vez de invocar el mismo mensaje.
class Invoice {
  private items: number[] = [];

  addItem(price: number): void {
    this.items.push(price);
  }

  total(): number {
    let sum = 0;
    this.items.forEach((price) => {
      sum += price;
    });
    return sum;
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Composite (TypeScript, con anotaciones de tipo).
class ShapeGroup2 extends Shape {
  private children: Shape[] = [];

  add(child: Shape): void {
    this.children.push(child);
  }

  render(): void {
    this.children.forEach((c) => c.render());
  }
}

// Control negativo: colección real (number[]), ajena a la familia, iterada
// para sumar en vez de invocar el mismo mensaje.
class Invoice2 {
  private items: number[] = [];

  addItem(price: number): void {
    this.items.push(price);
  }

  total(): number {
    let sum = 0;
    this.items.forEach((price) => {
      sum += price;
    });
    return sum;
  }
}

