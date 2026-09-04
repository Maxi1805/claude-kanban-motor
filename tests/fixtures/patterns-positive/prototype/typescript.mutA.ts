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


// --- POSITIVO (mutacion A: clone-duplicate) ---
class Shape2 {
  color: string;
  x: number;
  y: number;
  constructor(color: string, x: number, y: number) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone(): Shape2 {
    return new Shape2(this.color, this.x, this.y);
  }
}

