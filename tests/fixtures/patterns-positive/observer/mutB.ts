// POSITIVO (mutación B: sin colección de suscriptores; llamadas directas).
class Subject {
  private a: ObserverA;
  private b: ObserverB;
  constructor(a: ObserverA, b: ObserverB) {
    this.a = a;
    this.b = b;
  }
  notifyAll(event: string): void {
    this.a.update(event);
    this.b.update(event);
  }
}
