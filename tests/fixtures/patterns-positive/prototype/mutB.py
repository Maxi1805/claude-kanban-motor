class Shape:
    def __init__(self, color, x, y):
        self.color = color
        self.x = x
        self.y = y


# POSITIVO (mutación B: sin clone(); copia de campos duplicada en 2 sitios).
def duplicate_for_layer(shape):
    return Shape(shape.color, shape.x, shape.y)


def duplicate_for_export(shape):
    return Shape(shape.color, shape.x, shape.y)
