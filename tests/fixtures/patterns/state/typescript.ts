// Fixture canónica: State ya aplicado (TypeScript). Cada estado es su
// propia clase con la misma interfaz; el contexto solo reasigna
// this.state, sin ningún if/else sobre él repartido en varios métodos.
interface LightState {
  next(): LightState;
}

class RedState implements LightState {
  next(): LightState {
    return new GreenState();
  }
}

class GreenState implements LightState {
  next(): LightState {
    return new YellowState();
  }
}

class YellowState implements LightState {
  next(): LightState {
    return new RedState();
  }
}

export class TrafficLight {
  private state: LightState = new RedState();

  advance(): void {
    this.state = this.state.next();
  }

  forceState(state: LightState): void {
    this.state = state;
  }
}
