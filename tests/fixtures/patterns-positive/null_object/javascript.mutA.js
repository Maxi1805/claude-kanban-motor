// Fixture canónica: Null Object / override trivial (JavaScript).
class ConsoleLogger {
  log(msg) {
    console.log(msg);
  }
}

class NullLogger {
  log(msg) {}
}

// Control negativo: método corto, SIN familia con hermanos activos.
class ReportOptions {
  middleName() {}
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Null Object / override trivial (JavaScript).
class ConsoleLogger2 {
  log(msg) {
    console.log(msg);
  }
}

class NullLogger2 {
  log(msg) {}
}

// Control negativo: método corto, SIN familia con hermanos activos.
class ReportOptions2 {
  middleName() {}
}

