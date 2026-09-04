// Fixture canónica: State ya aplicado (JavaScript). Cada estado es su
// propia clase con la misma interfaz; el contexto solo reasigna
// this.state, sin ningún if/else sobre él repartido en varios métodos.
class RedState {
  next() {
    return new GreenState();
  }
}

class GreenState {
  next() {
    return new YellowState();
  }
}

class YellowState {
  next() {
    return new RedState();
  }
}

class TrafficLight {
  constructor() {
    this.state = new RedState();
  }

  advance() {
    this.state = this.state.next();
  }

  forceState(state) {
    this.state = state;
  }
}

module.exports = { TrafficLight, RedState, GreenState, YellowState };


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: State ya aplicado (JavaScript). Cada estado es su
// propia clase con la misma interfaz; el contexto solo reasigna
// this.state, sin ningún if/else sobre él repartido en varios métodos.
class RedState2 {
  next() {
    return new GreenState2();
  }
}

class GreenState2 {
  next() {
    return new YellowState2();
  }
}

class YellowState2 {
  next() {
    return new RedState2();
  }
}

class TrafficLight2 {
  constructor() {
    this.state = new RedState2();
  }

  advance() {
    this.state = this.state.next();
  }

  forceState(state) {
    this.state = state;
  }
}

module.exports = { TrafficLight2, RedState2, GreenState2, YellowState2 };

