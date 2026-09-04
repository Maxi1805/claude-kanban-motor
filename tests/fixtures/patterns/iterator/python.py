# Fixture canónica: Iterator / protocolo conocido (Python: __iter__+__next__).
class NumberCollection:
    def __init__(self, numbers):
        self._numbers = numbers
        self._i = 0

    def __iter__(self):
        return self

    def __next__(self):
        value = self._numbers[self._i]
        self._i += 1
        return value


# Control negativo: implementa SOLO __next__, sin __iter__ — no coincide con
# ninguna de las dos combinaciones fijas del protocolo.
class HalfIterator:
    def __next__(self):
        return None
