# Fixture canónica: State ya aplicado (Python). Cada estado es su propia
# clase con la misma interfaz; el contexto solo reasigna self.state, sin
# ningún if/elif sobre él repartido en varios métodos.
class RedState:
    def next(self):
        return GreenState()


class GreenState:
    def next(self):
        return YellowState()


class YellowState:
    def next(self):
        return RedState()


class TrafficLight:
    def __init__(self):
        self.state = RedState()

    def advance(self):
        self.state = self.state.next()

    def force_state(self, state):
        self.state = state


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: State ya aplicado (Python). Cada estado es su propia
# clase con la misma interfaz; el contexto solo reasigna self.state, sin
# ningún if/elif sobre él repartido en varios métodos.
class RedState2:
    def next(self):
        return GreenState2()


class GreenState2:
    def next(self):
        return YellowState2()


class YellowState2:
    def next(self):
        return RedState2()


class TrafficLight2:
    def __init__(self):
        self.state = RedState2()

    def advance(self):
        self.state = self.state.next()

    def force_state(self, state):
        self.state = state

