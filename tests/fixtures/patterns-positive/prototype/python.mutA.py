class Shape:
    def __init__(self, color, x, y):
        self.color = color
        self.x = x
        self.y = y
    def clone(self):
        return Shape(self.color, self.x, self.y)


# --- POSITIVO (mutacion A: clone-duplicate) ---
class Shape2:
    def __init__(self, color, x, y):
        self.color = color
        self.x = x
        self.y = y
    def clone(self):
        return Shape2(self.color, self.x, self.y)

