# Fixture canónica: Observer (Ruby), ya aplicado. `attach`+`notify_all` son
# la pareja suscriptor/notificador completa (`<<` + `.each` con bloque, sin
# nodo de bucle dedicado). `on_create`/`on_delete` son el ancla real del
# hallazgo (`manual-notification`): dos eventos que TODAVÍA no migraron a la
# lista y siguen notificando a mano — conviven con la lista, no la
# reemplazan (ver `hypotheses/observer.ts`, `ya-aplicado`).
class Subject
  def initialize
    @observers = []
  end
  def attach(observer)
    @observers << observer
  end
  def notify_all(event)
    @observers.each { |observer| observer.update(event) }
  end

  def on_create(event)
    @status = "created"
    @email_observer.on_change(event)
    @sms_observer.on_change(event)
  end
  def on_delete(event)
    @status = "deleted"
    @email_observer.on_change(event)
    @sms_observer.on_change(event)
  end
end
