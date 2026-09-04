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
