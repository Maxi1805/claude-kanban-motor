# Fixture canónica: Observer (Python), ya aplicado. `attach`+`notify_all` son
# la pareja suscriptor/notificador completa. `on_create`/`on_delete` son el
# ancla real del hallazgo (`manual-notification`): dos eventos que TODAVÍA no
# migraron a la lista y siguen notificando a mano — conviven con la lista, no
# la reemplazan (ver `hypotheses/observer.ts`, `ya-aplicado`).
class Subject:
    def __init__(self):
        self.observers = []
    def attach(self, observer):
        self.observers.append(observer)
    def notify_all(self, event):
        for observer in self.observers:
            observer.update(event)

    def on_create(self, event):
        self.status = "created"
        self.email_observer.on_change(event)
        self.sms_observer.on_change(event)
    def on_delete(self, event):
        self.status = "deleted"
        self.email_observer.on_change(event)
        self.sms_observer.on_change(event)
