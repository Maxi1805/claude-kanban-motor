// Fixture canónica: Null Object / override trivial (TypeScript).
class ConsoleLogger {
  log(msg: string): void {
    console.log(msg);
  }
}

class NullLogger {
  log(msg: string): void {}
}

// Control negativo: método corto, SIN familia con hermanos activos.
class ReportOptions {
  middleName(): void {}
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Null Object / override trivial (TypeScript).
class ConsoleLogger2 {
  log(msg: string): void {
    console.log(msg);
  }
}

class NullLogger2 {
  log(msg: string): void {}
}

// Control negativo: método corto, SIN familia con hermanos activos.
class ReportOptions2 {
  middleName(): void {}
}

