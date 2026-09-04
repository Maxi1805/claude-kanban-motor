<script>
// Fixture canónica: Proxy (Vue Composition API). El colaborador se
// auto-instancia ADENTRO del composable (no llega por parámetro).
function useShapeProxy() {
  const real = new RealShape();

  function area() {
    return real.area();
  }

  function paint(color) {
    console.log("painting");
    real.paint(color);
  }

  return { area, paint };
}

// Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
function usePureWrapper() {
  const real = new RealShape();

  function area() {
    return real.area();
  }

  function paint(color) {
    real.paint(color);
  }

  return { area, paint };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: Proxy (Vue Composition API). El colaborador se
// auto-instancia ADENTRO del composable (no llega por parámetro).
function useShapeProxy2() {
  const real = new RealShape();

  function area() {
    return real.area();
  }

  function paint(color) {
    console.log("painting");
    real.paint(color);
  }

  return { area, paint };
}

// Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
function usePureWrapper2() {
  const real = new RealShape();

  function area() {
    return real.area();
  }

  function paint(color) {
    real.paint(color);
  }

  return { area, paint };
}

</script>

<template>
  <div />
</template>
