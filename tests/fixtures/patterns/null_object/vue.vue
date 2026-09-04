<script lang="ts">
// Fixture canónica: Null Object — YA APLICADO (Vue). La ruta ESTRUCTURAL de
// esta hipótesis (hypotheses/null-object.ts) exige `family === "class-like"`
// — no cubre closures/composables (ver su docstring, "FORMA EN LENGUAJES
// SIN CLASES") — así que, igual que `template_method/vue.vue` en esta misma
// carpeta, se usa una clase real dentro de `<script>` en vez del modismo de
// composable. Protocolo compartido por (name,arity) vía `satisfies`
// derivado, fan-out `calls` = 0 en TODOS los miembros de `VueNullLogger`, y
// `createVueLogger` la instancia como sustituto real cuando `quiet` es
// cierto. Sufijo `Vue` A PROPÓSITO — ver la nota en typescript.ts de esta
// misma carpeta: sin nombre único por archivo, `new NullLogger()` resuelve
// AMBIGUO entre los 4 archivos con clase de esta carpeta.
class VueConsoleLogger {
  log(msg: string): void {
    console.log(msg);
  }
  flush(): void {
    console.log("(flush)");
  }
}

class VueNullLogger {
  log(msg: string): void {}
  flush(): void {}
}

function createVueLogger(quiet: boolean): VueConsoleLogger | VueNullLogger {
  if (quiet) return new VueNullLogger();
  return new VueConsoleLogger();
}

// Control negativo: método corto, SIN familia con hermanos activos NI sitio
// de instanciación.
class VueReportOptions {
  middleName(): void {}
}
</script>

<template>
  <div />
</template>
