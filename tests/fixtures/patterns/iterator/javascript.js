// Fixture canónica: Iterator / protocolo conocido (JavaScript: `next()`).
class NumberIterator {
  constructor(numbers) {
    this.numbers = numbers;
    this.i = 0;
  }

  next() {
    return this.numbers[this.i++];
  }
}

// Control negativo: nombre parecido ("nextPage"), no coincide con el protocolo.
class Paginator {
  constructor() {
    this.page = 0;
  }

  nextPage() {
    this.page += 1;
  }
}
