// Fixture canónica: Composite (JavaScript, sin anotaciones de tipo — el
// campo "children" no tiene ningún indicio de tipo; la única señal posible
// es conductual: se itera invocando el mismo mensaje que el contenedor).
class ShapeGroup extends Shape {
  constructor() {
    super();
    this.children = [];
  }

  add(child) {
    this.children.push(child);
  }

  render() {
    this.children.forEach((c) => c.render());
  }
}

// Control negativo: colección ajena a la familia, iterada para sumar.
class Invoice {
  constructor() {
    this.items = [];
  }

  addItem(price) {
    this.items.push(price);
  }

  total() {
    let sum = 0;
    this.items.forEach((price) => {
      sum += price;
    });
    return sum;
  }
}
