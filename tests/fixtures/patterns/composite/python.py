# Fixture canónica: Composite (Python, sin anotaciones de tipo).
class ShapeGroup(Shape):
    def __init__(self):
        self.children = []

    def add(self, child):
        self.children.append(child)

    def render(self):
        for c in self.children:
            c.render()


# Control negativo: colección ajena a la familia, iterada para sumar.
class Invoice:
    def __init__(self):
        self.items = []

    def add_item(self, price):
        self.items.append(price)

    def total(self):
        sum_ = 0
        for price in self.items:
            sum_ += price
        return sum_
