<script>
// Fixture canónica: Decorator (Vue Composition API — sin clases, sin "this").
// El modismo funcional: una función que CIERRA sobre el colaborador
// inyectado (parámetro `shape`) y retorna un objeto cuyos métodos delegan
// incondicionalmente — el "campo" es la variable capturada, no this.campo.
function useColorDecorator(shape) {
  return {
    area: () => shape.area(),
    describe: () => shape.describe(),
  };
}

// Control negativo: colaborador (logger) ajeno a la familia, método distinto.
function useReportGenerator(logger) {
  return {
    generate: () => logger.info("generating"),
  };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: Decorator (Vue Composition API — sin clases, sin "this").
// El modismo funcional: una función que CIERRA sobre el colaborador
// inyectado (parámetro `shape`) y retorna un objeto cuyos métodos delegan
// incondicionalmente — el "campo" es la variable capturada, no this.campo.
function useColorDecorator2(shape) {
  return {
    area: () => shape.area(),
    describe: () => shape.describe(),
  };
}

// Control negativo: colaborador (logger) ajeno a la familia, método distinto.
function useReportGenerator2(logger) {
  return {
    generate: () => logger.info("generating"),
  };
}

</script>

<template>
  <div />
</template>
