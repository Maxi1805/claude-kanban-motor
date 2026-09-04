// Fixture canónica: Decorator (JavaScript, SIN anotaciones de tipo — el caso
// central: la misma forma que TypeScript, pero sin ningún tipo declarado en
// ningún lado. La regla debe reconocerla igual, por vías conductuales.
class ColorDecorator extends Shape {
  constructor(shape) {
    super();
    this.shape = shape;
  }

  area() {
    return this.shape.area();
  }

  describe() {
    return this.shape.describe();
  }
}

// Control negativo: colaborador (Logger) ajeno a la familia, método distinto.
class ReportGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  generate() {
    this.logger.info("generating");
  }
}
