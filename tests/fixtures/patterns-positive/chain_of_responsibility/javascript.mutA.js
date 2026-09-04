// Fixture canónica: Chain of Responsibility (JavaScript, sin anotaciones).
class Handler {
  constructor() {
    this.next = null;
  }

  setNext(handler) {
    this.next = handler;
  }

  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}

// Control negativo: condicional real, mensaje reenviado DISTINTO.
class Cache {
  constructor(logger) {
    this.logger = logger;
  }

  reset() {
    if (this.logger) {
      this.logger.flush();
    }
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Chain of Responsibility (JavaScript, sin anotaciones).
class Handler2 {
  constructor() {
    this.next = null;
  }

  setNext(handler) {
    this.next = handler;
  }

  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}

// Control negativo: condicional real, mensaje reenviado DISTINTO.
class Cache2 {
  constructor(logger) {
    this.logger = logger;
  }

  reset() {
    if (this.logger) {
      this.logger.flush();
    }
  }
}

