# Fixture canónica: Decorator (Python, sin anotaciones de tipo).
class ColorDecorator(Shape):
    def __init__(self, shape):
        self.shape = shape

    def area(self):
        return self.shape.area()

    def describe(self):
        return self.shape.describe()


# Control negativo: colaborador (logger) ajeno a la familia, método distinto.
class ReportGenerator:
    def __init__(self, logger):
        self.logger = logger

    def generate(self):
        self.logger.info("generating")


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Decorator (Python, sin anotaciones de tipo).
class ColorDecorator2(Shape):
    def __init__(self, shape):
        self.shape = shape

    def area(self):
        return self.shape.area()

    def describe(self):
        return self.shape.describe()


# Control negativo: colaborador (logger) ajeno a la familia, método distinto.
class ReportGenerator2:
    def __init__(self, logger):
        self.logger = logger

    def generate(self):
        self.logger.info("generating")

