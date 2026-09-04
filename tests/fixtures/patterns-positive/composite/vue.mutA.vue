<script>
// Fixture canónica: Composite (Vue Composition API). El estado (children) se
// crea ADENTRO del composable (no por parámetro) — el modismo más común.
function useShapeGroup() {
  const children = [];

  function add(child) {
    children.push(child);
  }

  function render() {
    children.forEach((c) => c.render());
  }

  return { add, render };
}

// Control negativo: colección ajena a la familia, iterada para sumar.
function useInvoice() {
  const items = [];

  function addItem(price) {
    items.push(price);
  }

  function total() {
    let sum = 0;
    items.forEach((price) => {
      sum += price;
    });
    return sum;
  }

  return { addItem, total };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: Composite (Vue Composition API). El estado (children) se
// crea ADENTRO del composable (no por parámetro) — el modismo más común.
function useShapeGroup2() {
  const children = [];

  function add(child) {
    children.push(child);
  }

  function render() {
    children.forEach((c) => c.render());
  }

  return { add, render };
}

// Control negativo: colección ajena a la familia, iterada para sumar.
function useInvoice2() {
  const items = [];

  function addItem(price) {
    items.push(price);
  }

  function total() {
    let sum = 0;
    items.forEach((price) => {
      sum += price;
    });
    return sum;
  }

  return { addItem, total };
}

</script>

<template>
  <div />
</template>
