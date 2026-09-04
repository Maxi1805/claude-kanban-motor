# POSITIVO (mutación B: guarda de inicialización perezosa duplicada en 2 métodos).
class ShapeService:
    def __init__(self):
        self.real = None

    def area(self):
        if self.real is None:
            self.real = RealShape()
        return self.real.area()

    def paint(self, color):
        if self.real is None:
            self.real = RealShape()
        self.real.paint(color)
