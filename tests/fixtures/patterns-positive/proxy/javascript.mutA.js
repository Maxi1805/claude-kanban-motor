// Fixture canónica: Proxy (JavaScript, sin anotaciones).
class ShapeProxy extends Shape {
  constructor() {
    super();
    this.real = new RealShape();
  }

  area() {
    return this.real.area();
  }

  paint(color) {
    console.log("painting");
    this.real.paint(color);
  }
}

// Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
class PureWrapper extends Shape {
  constructor() {
    super();
    this.real = new RealShape();
  }

  area() {
    return this.real.area();
  }

  paint(color) {
    this.real.paint(color);
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Proxy (JavaScript, sin anotaciones).
class ShapeProxy2 extends Shape {
  constructor() {
    super();
    this.real = new RealShape();
  }

  area() {
    return this.real.area();
  }

  paint(color) {
    console.log("painting");
    this.real.paint(color);
  }
}

// Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
class PureWrapper2 extends Shape {
  constructor() {
    super();
    this.real = new RealShape();
  }

  area() {
    return this.real.area();
  }

  paint(color) {
    this.real.paint(color);
  }
}

