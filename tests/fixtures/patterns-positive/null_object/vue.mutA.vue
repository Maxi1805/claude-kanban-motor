<script>
// Fixture canónica: Null Object / override trivial (Vue, composables como
// "familia por forma": mismo nombre de miembro retornado, cuerpo trivial).
function useConsoleLogger() {
  function log(msg) {
    console.log(msg);
  }
  return { log };
}

function useNullLogger() {
  function log(msg) {}
  return { log };
}

// Control negativo: método corto, SIN familia con hermanos activos.
function useReportOptions() {
  function middleName() {}
  return { middleName };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: Null Object / override trivial (Vue, composables como
// "familia por forma": mismo nombre de miembro retornado, cuerpo trivial).
function useConsoleLogger2() {
  function log(msg) {
    console.log(msg);
  }
  return { log };
}

function useNullLogger2() {
  function log(msg) {}
  return { log };
}

// Control negativo: método corto, SIN familia con hermanos activos.
function useReportOptions2() {
  function middleName() {}
  return { middleName };
}

</script>

<template>
  <div />
</template>
