// POSITIVO (mutación B: Decorator aplanado; acumulador con 3 capas condicionales).
function describeShape(shape: Shape, hasColor: boolean, hasBorder: boolean, hasShadow: boolean): string {
  let result = shape.describe();
  if (hasColor) {
    result = "colored(" + result + ")";
  }
  if (hasBorder) {
    result = "bordered(" + result + ")";
  }
  if (hasShadow) {
    result = "shadowed(" + result + ")";
  }
  return result;
}
