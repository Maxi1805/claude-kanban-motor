class Shape {
  constructor(color, x, y) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone() {
    return new Shape(this.color, this.x, this.y);
  }
}
