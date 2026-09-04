class Shape {
  color: string;
  x: number;
  y: number;
  constructor(color: string, x: number, y: number) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone(): Shape {
    return new Shape(this.color, this.x, this.y);
  }
}
