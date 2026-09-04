class Shape {
  color: string;
  x: number;
  y: number;
  constructor(color: string, x: number, y: number) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
}

// POSITIVO (mutación B: sin clone(); copia de campos duplicada en 2 sitios).
function duplicateForLayer(shape: Shape): Shape {
  return new Shape(shape.color, shape.x, shape.y);
}
function duplicateForExport(shape: Shape): Shape {
  return new Shape(shape.color, shape.x, shape.y);
}
