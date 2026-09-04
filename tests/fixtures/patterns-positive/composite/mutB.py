# POSITIVO (mutación B: recorrido de árbol repetido, sin abstracción compartida).
class ShapeGroup:
    def __init__(self):
        self.children = []

    def add(self, child):
        self.children.append(child)

    def render(self):
        for c in self.children:
            c.render()


class WidgetGroup:
    def __init__(self):
        self.children = []

    def add(self, child):
        self.children.append(child)

    def render(self):
        for c in self.children:
            c.render()
