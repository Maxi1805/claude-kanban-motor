# POSITIVO (mutación B: sin colección de suscriptores; llamadas directas).
class Subject:
    def __init__(self, a, b):
        self.a = a
        self.b = b

    def notify_all(self, event):
        self.a.update(event)
        self.b.update(event)
