// POSITIVO (mutación B: Strategy aplanado en ifs anidados; cuerpos sustanciales).
class Sorter {
  sortBy(list: number[], mode: "asc" | "desc" | "abs"): number[] {
    if (mode === "asc") {
      return list.slice().sort((a, b) => a - b);
    } else if (mode === "desc") {
      return list.slice().sort((a, b) => b - a);
    } else if (mode === "abs") {
      return list.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
    }
    return list;
  }
}
