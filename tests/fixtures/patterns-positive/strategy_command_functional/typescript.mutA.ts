// Fixture canónica: parámetro invocable (#18) y SAM (#23) — TypeScript.
class Sorter {
  sortBy(list: number[], comparator: (a: number, b: number) => number): number[] {
    return list.sort((a, b) => comparator(a, b));
  }
}

// Control negativo #18: el callback se guarda pero nunca se invoca acá.
class EventBus {
  private subscribers: Array<() => void> = [];

  subscribe(callback: () => void): void {
    this.subscribers.push(callback);
  }
}

// Positivo #23 (SAM): un solo método público, nombre genérico.
class PrintCommand {
  execute(): void {
    console.log("printing");
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: parámetro invocable (#18) y SAM (#23) — TypeScript.
class Sorter2 {
  sortBy(list: number[], comparator: (a: number, b: number) => number): number[] {
    return list.sort((a, b) => comparator(a, b));
  }
}

// Control negativo #18: el callback se guarda pero nunca se invoca acá.
class EventBus2 {
  private subscribers: Array<() => void> = [];

  subscribe(callback: () => void): void {
    this.subscribers.push(callback);
  }
}

// Positivo #23 (SAM): un solo método público, nombre genérico.
class PrintCommand2 {
  execute(): void {
    console.log("printing");
  }
}

