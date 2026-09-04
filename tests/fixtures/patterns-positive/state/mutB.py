# POSITIVO (mutación B: State aplanado en if/elif sobre un discriminante).
class TrafficLight:
    def __init__(self):
        self.kind = "red"

    def advance(self):
        if self.kind == "red":
            self.kind = "green"
        elif self.kind == "green":
            self.kind = "yellow"
        elif self.kind == "yellow":
            self.kind = "red"

    def force_state(self, kind):
        self.kind = kind
