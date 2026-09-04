# Fixture canónica: parámetro invocable (#18) y SAM (#23) — Python.
class Sorter:
    def sort_by(self, items, comparator):
        return sorted(items, key=lambda x: comparator(x))


# Control negativo #18: el callback se guarda pero nunca se invoca acá.
class EventBus:
    def __init__(self):
        self.subscribers = []

    def subscribe(self, callback):
        self.subscribers.append(callback)


# Positivo #23 (SAM): un solo método público, nombre genérico.
class PrintCommand:
    def execute(self):
        print("printing")


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: parámetro invocable (#18) y SAM (#23) — Python.
class Sorter2:
    def sort_by(self, items, comparator):
        return sorted(items, key=lambda x: comparator(x))


# Control negativo #18: el callback se guarda pero nunca se invoca acá.
class EventBus2:
    def __init__(self):
        self.subscribers = []

    def subscribe(self, callback):
        self.subscribers.append(callback)


# Positivo #23 (SAM): un solo método público, nombre genérico.
class PrintCommand2:
    def execute(self):
        print("printing")

