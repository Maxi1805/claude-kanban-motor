class Shape {
  name = "shape";

  area() {
    const local = this.name;
    return local;
  }
}

const TOP_LEVEL = 1;
const helper = (x) => x + 1;

function standalone(a, b) {
  return a + b;
}
