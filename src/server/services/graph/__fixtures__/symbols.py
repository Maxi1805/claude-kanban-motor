class Outer:
    class Inner:
        def method(self):
            local = 1
            return local

class Shape:
    def area(self):
        return 0

TOP_LEVEL = 1

def standalone(a, b):
    return a + b
