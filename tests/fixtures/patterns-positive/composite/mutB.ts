// POSITIVO (mutación B: recorrido de árbol repetido, sin abstracción compartida).
class ShapeGroup {
  private children: Shape[] = [];
  add(child: Shape): void {
    this.children.push(child);
  }
  render(): void {
    this.children.forEach((c) => c.render());
  }
}
class WidgetGroup {
  private children: Widget[] = [];
  add(child: Widget): void {
    this.children.push(child);
  }
  render(): void {
    this.children.forEach((c) => c.render());
  }
}
