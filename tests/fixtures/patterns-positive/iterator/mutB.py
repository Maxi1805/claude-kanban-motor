class NumberList:
    def __init__(self, numbers):
        self.numbers = numbers


# POSITIVO (mutación B: sin Iterator; cursor manual duplicado en 2 sitios).
def sum_all(lst):
    i = 0
    total = 0
    while i < len(lst.numbers):
        total += lst.numbers[i]
        i += 1
    return total


def print_all(lst):
    i = 0
    while i < len(lst.numbers):
        print(lst.numbers[i])
        i += 1
