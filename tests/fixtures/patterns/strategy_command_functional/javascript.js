// Fixture canónica: parámetro invocable (#18) y SAM (#23) — JavaScript.
class Sorter {
  sortBy(list, comparator) {
    return list.sort((a, b) => comparator(a, b));
  }
}

// Control negativo #18: el callback se guarda pero nunca se invoca acá.
class EventBus {
  constructor() {
    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }
}

// Positivo #23 (SAM): un solo método público, nombre genérico.
class PrintCommand {
  execute() {
    console.log("printing");
  }
}
