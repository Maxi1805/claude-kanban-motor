// Fixture canónica: Iterator / protocolo conocido (TypeScript: `next()`).
class NumberIterator {
  private i: number = 0;
  private numbers: number[];

  constructor(numbers: number[]) {
    this.numbers = numbers;
  }

  next(): number {
    return this.numbers[this.i++];
  }
}

// Control negativo: nombre parecido ("nextPage"), NO coincide con el
// protocolo fijo (`next`/`hasNext`+`next`).
class Paginator {
  private page: number = 0;

  nextPage(): void {
    this.page += 1;
  }
}
