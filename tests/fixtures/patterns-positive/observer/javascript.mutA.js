class Subject {
  constructor() {
    this.observers = [];
  }
  attach(observer) {
    this.observers.push(observer);
  }
  notifyAll(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
class Subject2 {
  constructor() {
    this.observers = [];
  }
  attach(observer) {
    this.observers.push(observer);
  }
  notifyAll(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}

