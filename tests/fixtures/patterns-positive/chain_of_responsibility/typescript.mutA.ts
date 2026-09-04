// Fixture canónica: Chain of Responsibility (TypeScript).
class Handler {
  private next: Handler | null = null;

  setNext(handler: Handler): void {
    this.next = handler;
  }

  handle(request: Request): void {
    if (this.next) {
      this.next.handle(request);
    }
  }
}

// Control negativo: condicional real, pero mensaje reenviado DISTINTO al
// nombre del método contenedor.
class Cache {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  reset(): void {
    if (this.logger) {
      this.logger.flush();
    }
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Chain of Responsibility (TypeScript).
class Handler2 {
  private next: Handler2 | null = null;

  setNext(handler: Handler2): void {
    this.next = handler;
  }

  handle(request: Request): void {
    if (this.next) {
      this.next.handle(request);
    }
  }
}

// Control negativo: condicional real, pero mensaje reenviado DISTINTO al
// nombre del método contenedor.
class Cache2 {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  reset(): void {
    if (this.logger) {
      this.logger.flush();
    }
  }
}

