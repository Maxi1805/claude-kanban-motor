<script>
// Fixture canónica: State ya aplicado (Vue). Cada estado es su propia
// clase con la misma interfaz; el contexto solo reasigna this.state, sin
// ningún if/else sobre él repartido en varios métodos.
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


// --- POSITIVO (mutacion A: clone-duplicate) ---

// Fixture canónica: State ya aplicado (Vue). Cada estado es su propia
// clase con la misma interfaz; el contexto solo reasigna this.state, sin
// ningún if/else sobre él repartido en varios métodos.
interface LightState2 {
  next(): LightState2;
}

class RedState2 implements LightState2 {
  next(): LightState2 {
    return new GreenState2();
  }
}

class GreenState2 implements LightState2 {
  next(): LightState2 {
    return new YellowState2();
  }
}

class YellowState2 implements LightState2 {
  next(): LightState2 {
    return new RedState2();
  }
}

export class TrafficLight2 {
  private state: LightState2 = new RedState2();

  advance(): void {
    this.state = this.state.next();
  }

  forceState(state: LightState2): void {
    this.state = state;
  }
}

</script>

<template>
  <div />
</template>
