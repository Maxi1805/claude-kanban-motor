// Fixture canónica: Null Object — YA APLICADO (JavaScript), forma COMPLETA
// (ver typescript.ts de esta misma carpeta para el detalle y por qué el
// nombre lleva sufijo `Js`): protocolo compartido por (name,arity) vía
// `satisfies` derivado, fan-out `calls` = 0 en TODOS los miembros de
// `JsNullLogger`, y `createJsLogger` la instancia como sustituto real
// cuando `quiet` es cierto.
class JsConsoleLogger {
  log(msg) {
    console.log(msg);
  }
  flush() {
    console.log("(flush)");
  }
}

class JsNullLogger {
  log(msg) {}
  flush() {}
}

function createJsLogger(quiet) {
  if (quiet) return new JsNullLogger();
  return new JsConsoleLogger();
}

// Control negativo: método corto, SIN familia con hermanos activos NI sitio
// de instanciación.
class JsReportOptions {
  middleName() {}
}
