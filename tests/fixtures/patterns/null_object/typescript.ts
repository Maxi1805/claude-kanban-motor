// Fixture canónica: Null Object — YA APLICADO (TypeScript), forma COMPLETA
// (CONTRATO-F10.md / hypotheses/null-object.ts): `TsNullLogger` y
// `TsConsoleLogger` comparten protocolo por (name,arity) — `satisfies` sale
// DERIVADO del grafo (mismo conjunto de miembros, sin interfaz textual
// declarada) —, `TsNullLogger` tiene fan-out `calls` = 0 en TODOS sus
// miembros, y `createTsLogger` la instancia como sustituto real del logger
// activo cuando `quiet` es cierto — el sitio de sustitución que el patrón
// exige. Nombres con sufijo `Ts` A PROPÓSITO: el resto de esta carpeta
// (javascript.js/vue.vue) repite exactamente esta forma con OTRO nombre de
// clase — sin eso, `ConsoleLogger`/`NullLogger` quedarían declarados varias
// veces en el mismo repo (fixtures-multi se analiza como UN solo repo) y la
// resolución de `new NullLogger()` cae en AMBIGUOUS entre archivos, nunca
// llega a `confidentEdges` — verificado a mano volcando el grafo.
class TsConsoleLogger {
  log(msg: string): void {
    console.log(msg);
  }
  flush(): void {
    console.log("(flush)");
  }
}

class TsNullLogger {
  log(msg: string): void {}
  flush(): void {}
}

function createTsLogger(quiet: boolean): TsConsoleLogger | TsNullLogger {
  if (quiet) return new TsNullLogger();
  return new TsConsoleLogger();
}

// Control negativo: método corto, SIN familia con hermanos activos NI sitio
// de instanciación — no participa de ninguna de las dos formas.
class TsReportOptions {
  middleName(): void {}
}
