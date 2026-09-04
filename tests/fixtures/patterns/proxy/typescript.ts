// Fixture canónica: Proxy (TypeScript). Campo auto-instanciado (#11), no
// todos los métodos son reenvío puro.
class ShapeProxy extends Shape {
  private real: RealShape;

  constructor() {
    super();
    this.real = new RealShape();
  }

  area(): number {
    return this.real.area();
  }

  paint(color: string): void {
    console.log("painting");
    this.real.paint(color);
  }
}

// Control negativo: auto-instanciado, pero TODOS los métodos son reenvío
// puro — wrapper trivial, no Proxy.
class PureWrapper extends Shape {
  private real: RealShape;

  constructor() {
    super();
    this.real = new RealShape();
  }

  area(): number {
    return this.real.area();
  }

  paint(color: string): void {
    this.real.paint(color);
  }
}
