<script>
// Fixture canónica: Chain of Responsibility (Vue Composition API).
function useHandler() {
  let next = null;

  function setNext(handler) {
    next = handler;
  }

  function handle(request) {
    if (next) {
      next.handle(request);
    }
  }

  return { setNext, handle };
}

// Control negativo: condicional real, mensaje reenviado DISTINTO.
function useCache(logger) {
  function reset() {
    if (logger) {
      logger.flush();
    }
  }

  return { reset };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: Chain of Responsibility (Vue Composition API).
function useHandler2() {
  let next = null;

  function setNext(handler) {
    next = handler;
  }

  function handle(request) {
    if (next) {
      next.handle(request);
    }
  }

  return { setNext, handle };
}

// Control negativo: condicional real, mensaje reenviado DISTINTO.
function useCache2(logger) {
  function reset() {
    if (logger) {
      logger.flush();
    }
  }

  return { reset };
}

</script>

<template>
  <div />
</template>
