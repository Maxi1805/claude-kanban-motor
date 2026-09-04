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
