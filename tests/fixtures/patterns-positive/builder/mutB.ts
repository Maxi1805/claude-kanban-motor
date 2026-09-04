// POSITIVO (mutación B: Builder aplanado en constructor telescópico).
class Pizza {
  size: string;
  toppings: string[];
  crust: string;
  extraCheese: boolean;

  constructor(
    size: string,
    topping1: string | null,
    topping2: string | null,
    topping3: string | null,
    topping4: string | null,
    crust: string,
    extraCheese: boolean,
  ) {
    this.size = size;
    this.toppings = [topping1, topping2, topping3, topping4].filter((t): t is string => t !== null);
    this.crust = crust;
    this.extraCheese = extraCheese;
  }
}
