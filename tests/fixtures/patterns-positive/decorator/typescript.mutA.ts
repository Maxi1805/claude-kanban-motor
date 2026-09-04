// Fixture canónica: Decorator (TypeScript, CON anotaciones de tipo).
// Positivo: ColorDecorator envuelve un Shape inyectado y delega su interfaz.
class ColorDecorator extends Shape {
  private shape: Shape;

  constructor(shape: Shape) {
    super();
    this.shape = shape;
  }

  area(): number {
    return this.shape.area();
  }

  describe(): string {
    return this.shape.describe();
  }
}

// Control negativo: un colaborador cualquiera (Logger), NO de la propia
// familia, usado con un nombre de método DISTINTO al del contenedor.
class ReportGenerator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  generate(): void {
    this.logger.info("generating");
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Decorator (TypeScript, CON anotaciones de tipo).
// Positivo: ColorDecorator2 envuelve un Shape inyectado y delega su interfaz.
class ColorDecorator2 extends Shape {
  private shape: Shape;

  constructor(shape: Shape) {
    super();
    this.shape = shape;
  }

  area(): number {
    return this.shape.area();
  }

  describe(): string {
    return this.shape.describe();
  }
}

// Control negativo: un colaborador cualquiera (Logger), NO de la propia
// familia, usado con un nombre de método DISTINTO al del contenedor.
class ReportGenerator2 {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  generate(): void {
    this.logger.info("generating");
  }
}

