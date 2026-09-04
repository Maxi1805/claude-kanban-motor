# Fixture canónica: Proxy (Python, sin anotaciones).
class ShapeProxy(Shape):
    def __init__(self):
        self.real = RealShape()

    def area(self):
        return self.real.area()

    def paint(self, color):
        print("painting")
        self.real.paint(color)


# Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
class PureWrapper(Shape):
    def __init__(self):
        self.real = RealShape()

    def area(self):
        return self.real.area()

    def paint(self, color):
        self.real.paint(color)


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Proxy (Python, sin anotaciones).
class ShapeProxy2(Shape):
    def __init__(self):
        self.real = RealShape()

    def area(self):
        return self.real.area()

    def paint(self, color):
        print("painting")
        self.real.paint(color)


# Control negativo: auto-instanciado, TODOS los métodos son reenvío puro.
class PureWrapper2(Shape):
    def __init__(self):
        self.real = RealShape()

    def area(self):
        return self.real.area()

    def paint(self, color):
        self.real.paint(color)

