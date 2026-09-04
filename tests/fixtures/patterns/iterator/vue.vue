<script>
// Fixture canónica: Iterator / protocolo conocido (Vue: `next()`).
function useNumberIterator(numbers) {
  let i = 0;
  function next() {
    return numbers[i++];
  }
  return { next };
}

// Control negativo: nombre parecido ("nextPage"), no coincide con el protocolo.
function usePaginator() {
  let page = 0;
  function nextPage() {
    page += 1;
  }
  return { nextPage };
}
</script>

<template>
  <div />
</template>
