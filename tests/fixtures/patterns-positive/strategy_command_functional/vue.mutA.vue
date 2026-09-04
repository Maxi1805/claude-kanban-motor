<script>
// Fixture canónica: parámetro invocable (#18) y SAM (#23) — Vue.
function useSorter() {
  function sortBy(list, comparator) {
    return list.sort((a, b) => comparator(a, b));
  }
  return { sortBy };
}

// Control negativo #18: el callback se guarda pero nunca se invoca acá.
function useEventBus() {
  const subscribers = [];
  function subscribe(callback) {
    subscribers.push(callback);
  }
  return { subscribe };
}

// Positivo #23 (SAM): un solo método público, nombre genérico.
function usePrintCommand() {
  function execute() {
    console.log("printing");
  }
  return { execute };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: parámetro invocable (#18) y SAM (#23) — Vue.
function useSorter2() {
  function sortBy(list, comparator) {
    return list.sort((a, b) => comparator(a, b));
  }
  return { sortBy };
}

// Control negativo #18: el callback se guarda pero nunca se invoca acá.
function useEventBus2() {
  const subscribers = [];
  function subscribe(callback) {
    subscribers.push(callback);
  }
  return { subscribe };
}

// Positivo #23 (SAM): un solo método público, nombre genérico.
function usePrintCommand2() {
  function execute() {
    console.log("printing");
  }
  return { execute };
}

</script>

<template>
  <div />
</template>
