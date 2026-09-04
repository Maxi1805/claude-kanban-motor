<script>
// Fixture canónica: similitud de interfaz (#9) entre COMPOSABLES, sin
// herencia ni acoplamiento textual — el caso puro de Strategy en Vue.
function useCreditCardPayment() {
  function pay(amount) {}
  function refund(amount) {}
  return { pay, refund };
}

function usePayPalPayment() {
  function pay(amount) {}
  function refund(amount) {}
  return { pay, refund };
}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
function useReport() {
  function generate() {}
  function exportIt() {}
  return { generate, exportIt };
}

function useWidget() {
  function generate() {}
  function render() {}
  return { generate, render };
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: similitud de interfaz (#9) entre COMPOSABLES, sin
// herencia ni acoplamiento textual — el caso puro de Strategy en Vue.
function useCreditCardPayment2() {
  function pay(amount) {}
  function refund(amount) {}
  return { pay, refund };
}

function usePayPalPayment2() {
  function pay(amount) {}
  function refund(amount) {}
  return { pay, refund };
}

// Control negativo: solo 1 nombre en común (por debajo del umbral).
function useReport2() {
  function generate() {}
  function exportIt() {}
  return { generate, exportIt };
}

function useWidget2() {
  function generate() {}
  function render() {}
  return { generate, render };
}

</script>

<template>
  <div />
</template>
