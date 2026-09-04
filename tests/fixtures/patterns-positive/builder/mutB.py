# POSITIVO (mutación B: Builder aplanado en constructor telescópico).
class Pizza:
    def __init__(self, size, topping1, topping2, topping3, topping4, crust, extra_cheese):
        self.size = size
        self.toppings = [t for t in (topping1, topping2, topping3, topping4) if t is not None]
        self.crust = crust
        self.extra_cheese = extra_cheese
