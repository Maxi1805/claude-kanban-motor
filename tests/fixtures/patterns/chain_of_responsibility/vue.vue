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
</script>

<template>
  <div />
</template>
