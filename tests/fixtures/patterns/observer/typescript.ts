// Fixture canónica: Observer (TypeScript), ya aplicado. `attach`+`notifyAll`
// son la pareja suscriptor/notificador completa. `onCreate`/`onDelete` son
// el ancla real del hallazgo (`manual-notification`): dos eventos que
// TODAVÍA no migraron a la lista y siguen notificando a mano — conviven con
// la lista, no la reemplazan (ver `hypotheses/observer.ts`, `ya-aplicado`).
class Subject {
  observers: Observer[] = [];
  status = "";
  emailObserver!: EmailObserver;
  smsObserver!: SmsObserver;

  attach(observer: Observer) {
    this.observers.push(observer);
  }
  notifyAll(event: string) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }

  onCreate(event: string) {
    this.status = "created";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
  onDelete(event: string) {
    this.status = "deleted";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
}
