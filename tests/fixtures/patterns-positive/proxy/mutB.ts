// POSITIVO (mutación B: guarda de inicialización perezosa duplicada en 2 métodos).
class ShapeService {
  private real: RealShape | null = null;
  area(): number {
    if (this.real === null) {
      this.real = new RealShape();
    }
    return this.real.area();
  }
  paint(color: string): void {
    if (this.real === null) {
      this.real = new RealShape();
    }
    this.real.paint(color);
  }
}
