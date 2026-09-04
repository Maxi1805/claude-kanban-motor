class Subject {
  observers: Observer[] = [];
  attach(observer: Observer) {
    this.observers.push(observer);
  }
  notifyAll(event: string) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
class Subject2 {
  observers: Observer[] = [];
  attach(observer: Observer) {
    this.observers.push(observer);
  }
  notifyAll(event: string) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}

