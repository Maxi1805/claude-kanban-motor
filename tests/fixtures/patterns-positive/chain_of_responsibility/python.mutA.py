# Fixture canónica: Chain of Responsibility (Python).
class Handler:
    def __init__(self):
        self.next = None

    def set_next(self, handler):
        self.next = handler

    def handle(self, request):
        if self.next:
            self.next.handle(request)


# Control negativo: condicional real, mensaje reenviado DISTINTO.
class Cache:
    def __init__(self, logger):
        self.logger = logger

    def reset(self):
        if self.logger:
            self.logger.flush()


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Chain of Responsibility (Python).
class Handler2:
    def __init__(self):
        self.next = None

    def set_next(self, handler):
        self.next = handler

    def handle(self, request):
        if self.next:
            self.next.handle(request)


# Control negativo: condicional real, mensaje reenviado DISTINTO.
class Cache2:
    def __init__(self, logger):
        self.logger = logger

    def reset(self):
        if self.logger:
            self.logger.flush()

