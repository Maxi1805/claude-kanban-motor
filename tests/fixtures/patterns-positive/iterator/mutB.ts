class NumberList {
  numbers: number[];
  constructor(numbers: number[]) {
    this.numbers = numbers;
  }
}

// POSITIVO (mutación B: sin Iterator; cursor manual duplicado en 2 sitios).
function sumAll(list: NumberList): number {
  let i = 0;
  let sum = 0;
  while (i < list.numbers.length) {
    sum += list.numbers[i];
    i += 1;
  }
  return sum;
}
function printAll(list: NumberList): void {
  let i = 0;
  while (i < list.numbers.length) {
    console.log(list.numbers[i]);
    i += 1;
  }
}
