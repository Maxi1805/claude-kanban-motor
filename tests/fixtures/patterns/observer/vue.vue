<script>
// Fixture canónica: Observer (Vue/JS), ya aplicado. `attach`+`notifyAll` son
// la pareja suscriptor/notificador completa. `onCreate`/`onDelete` son el
// ancla real del hallazgo (`manual-notification`): dos eventos que TODAVÍA
// no migraron a la lista y siguen notificando a mano — conviven con la
// lista, no la reemplazan (ver `hypotheses/observer.ts`, `ya-aplicado`).
class Subject {
  constructor() {
    this.observers = [];
  }
  attach(observer) {
    this.observers.push(observer);
  }
  notifyAll(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }

  onCreate(event) {
    this.status = "created";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
  onDelete(event) {
    this.status = "deleted";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
}
</script>
<template><div /></template>
