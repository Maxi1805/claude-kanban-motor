# Fixture canónica: Builder / encadenamiento fluido (Python).
class PizzaBuilder:
    def __init__(self):
        self.toppings = []

    def set_size(self, size):
        self.size = size
        return self

    def add_topping(self, topping):
        self.toppings.append(topping)
        return self


# Control negativo: mismos pasos, SIN encadenamiento.
class PizzaOrder:
    def __init__(self):
        self.toppings = []

    def set_size(self, size):
        self.size = size

    def add_topping(self, topping):
        self.toppings.append(topping)


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Builder / encadenamiento fluido (Python).
class PizzaBuilder2:
    def __init__(self):
        self.toppings = []

    def set_size(self, size):
        self.size = size
        return self

    def add_topping(self, topping):
        self.toppings.append(topping)
        return self


# Control negativo: mismos pasos, SIN encadenamiento.
class PizzaOrder2:
    def __init__(self):
        self.toppings = []

    def set_size(self, size):
        self.size = size

    def add_topping(self, topping):
        self.toppings.append(topping)

