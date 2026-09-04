class Shape:
    def __init__(self, color, x, y):
        self.color = color
        self.x = x
        self.y = y
    def clone(self):
        return Shape(self.color, self.x, self.y)
