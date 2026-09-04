<script>
// Fixture canónica: Builder / encadenamiento fluido (Vue, estilo objeto
// retornado con métodos "shorthand" — `this` dentro de un método de objeto
// literal SÍ se liga al propio objeto al invocarlo, igual que en una clase.
function usePizzaBuilder() {
  return {
    toppings: [],
    setSize(size) {
      this.size = size;
      return this;
    },
    addTopping(topping) {
      this.toppings.push(topping);
      return this;
    },
  };
}

// Control negativo: mismos pasos, SIN encadenamiento.
function usePizzaOrder() {
  return {
    toppings: [],
    setSize(size) {
      this.size = size;
    },
    addTopping(topping) {
      this.toppings.push(topping);
    },
  };
}
</script>

<template>
  <div />
</template>
