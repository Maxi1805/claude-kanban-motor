/**
 * El test anti-entrada-faltante — DIAGNÓSTICO-5B §5, tarea de esta ola,
 * punto 2.
 *
 * Dos olas seguidas se rompieron por un archivo compartido que exige una
 * entrada por elemento y que alguien olvidó: `CodeFindingKind` en la Ola 4,
 * `detect/impact.ts` en la Ola 5 (15 detectores sin tier, `impactOf` tirando
 * en producción). Hasta ahora cada registro se auditaba por separado y
 * ninguno auditaba la dirección DISCO → REGISTRO: `impact.test.ts` compara
 * `DETECTOR_IMPACT` contra `DETECTORS` (un registro contra otro), pero
 * ningún test compara ninguno de los tres registros de arreglo
 * (`detect/registry.ts`, `graph/edges/registry.ts`,
 * `graph/metrics/registry.ts`) contra los ARCHIVOS que de verdad existen en
 * disco — un detector/arista/métrica escrito y jamás importado al registro
 * pasa hoy en verde. Este archivo es el que faltaba: originalmente los
 * CUATRO registros (agregando `detect/impact.ts`), en un solo test, contra
 * disco y entre sí.
 *
 * Sólo LEE los cinco registros — ninguno se toca ni se corrige acá.
 *
 * P5/F6 agrega el QUINTO: `hypotheses/registry.ts` (`HYPOTHESES`). Observer
 * NO está migrado a propósito (decisión declarada: no existe detector-ancla
 * real) — el chequeo compara contra los ARCHIVOS EN DISCO de `hypotheses/`,
 * nunca contra una lista teórica de 17 patrones.
 */
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeRepo } from "./code-analyzer.js";
import { DETECTOR_IMPACT } from "./detect/impact.js";
import { DETECTORS } from "./detect/registry.js";
import { EDGE_EXTRACTORS } from "./graph/edges/registry.js";
import { HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR } from "./hypotheses/desregistradas.js";
import { HYPOTHESES } from "./hypotheses/registry.js";
import { GRAPH_METRICS } from "./graph/metrics/registry.js";

const ROOT = path.resolve(import.meta.dirname);

/** Un `id: "..."` kebab-case dentro del archivo — misma forma en los tres registros de arreglo. */
const ID_RE = /\bid:\s*"([a-z0-9]+(?:-[a-z0-9]+)*)"/;

/**
 * Variante para `hypotheses/`: a diferencia de los otros tres directorios,
 * cada archivo de hipótesis declara VARIOS `id: "..."` (uno por check de
 * discriminador/required, además del propio) — `ID_RE` de arriba tomaría el
 * PRIMERO que aparece en el archivo (casi siempre un check interno, nunca el
 * id de la hipótesis: comprobado en las 16 hipótesis migradas, p.ej.
 * `builder.ts` tiene `id: "magnitud-suficiente"` antes que `id: "builder"`).
 * El id propio de la hipótesis es, en las 16, el ÚNICO `id: "..."` seguido
 * en la línea siguiente por `pattern:` (el objeto `HypothesisBuilder` que se
 * exporta), así que se ancla por esa forma en vez de por posición.
 */
const HYPOTHESIS_ID_RE = /\bid:\s*"([a-z0-9]+(?:-[a-z0-9]+)*)"\s*,?\s*\n\s*pattern:/;

interface DiskEntry {
  /** Ruta relativa a `ROOT` (`src/server/services`), para mensajes de error legibles. */
  file: string;
  /** `null` cuando el archivo no declara ningún `id: "..."` reconocible (el propio test lo reporta, no lo asume). */
  id: string | null;
}

/**
 * Todo `.ts` no-test de `dir`, salvo los de `infraBasenames` (los archivos
 * de infraestructura compartida del propio registro — `types.ts`,
 * `sentinel.ts`, `projection.ts`, `budget.ts`, el `registry.ts` mismo —
 * declarados por nombre porque cada uno lo documenta como tal en su propio
 * docstring, no porque este test los adivine).
 */
function scanDir(dir: string, infraBasenames: readonly string[], idRegex: RegExp = ID_RE): DiskEntry[] {
  const abs = path.join(ROOT, dir);
  const entries: DiskEntry[] = [];
  for (const name of fs.readdirSync(abs)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const base = name.slice(0, -3);
    if (infraBasenames.includes(base)) continue;
    const text = fs.readFileSync(path.join(abs, name), "utf8");
    const match = idRegex.exec(text);
    entries.push({ file: `${dir}/${name}`, id: match ? match[1] : null });
  }
  return entries;
}

/**
 * Excepción DECLARADA, no un olvido — Ola AC, guardián.
 *
 * Este test existe para atrapar exactamente el descuido que su docstring de
 * arriba describe: "un detector... escrito y jamás importado al registro
 * pasa hoy en verde". `enumerated-field-dispatch.ts` NO es ese descuido: es
 * el ancla-fuerza que el frente AC2 construyó, midió sobre la POBLACIÓN
 * COMPLETA (28 hipótesis, las dos poblaciones) y decidió NO encender —R1,
 * 1/20 = 5,0 % [0,9 %, 23,6 %], bajo el piso del 20 %— dejando el detector
 * escrito y desregistrado A PROPÓSITO como artefacto reproducible del
 * experimento (30 tests propios, seis trampas de gramática documentadas;
 * `ola-ac/informes/AC2.md` §5). Registrarlo revertiría esa R1 sin nueva
 * evidencia; borrarlo destruiría el artefacto de un frente que ya cerró, y
 * `detect/` no está trackeado en git para recuperarlo después.
 *
 * La excepción es NOMBRADA y AUDITADA, no un agujero genérico: sólo tapa
 * ESTE id, y el chequeo de abajo se pone rojo solo si el archivo desaparece
 * del disco o si alguien lo registra sin borrar esta entrada — así no puede
 * pudrirse en silencio.
 */
/**
 * EL MISMO MECANISMO QUE `DELIBERATELY_UNREGISTERED`, PERO PARA `hypotheses/` —
 * Ola AX, aterrizaje.
 *
 * `hypotheses/move-member.ts` es un `HypothesisBuilder` completo (tiene su
 * `id`/`pattern`/`anchors`) que NO se registra: entró al árbol como
 * DEPENDENCIA de `extract-class.ts`, que le consume el vocabulario de acceso a
 * miembros y de auto-referencia (`accessOf`, `esAutoReferencia`,
 * `autoReferenciaDe`, …). Registrar `Move Member` sería dar de alta una
 * familia que nadie midió: sus tres anclas —`feature-envy-intra`,
 * `feature-envy-inter`, `inappropriate-intimacy`— están las TRES
 * desregistradas (AW y AX), así que emitiría CERO y su número no existe.
 *
 * Borrar el archivo tampoco: `extract-class.ts` no compila sin él y el árbol
 * no está en git para recuperarlo después. Por eso la excepción es NOMBRADA y
 * AUDITADA —tapa este id y ninguno más—, igual que la de `detect/`.
 */
// OLA AZ (frente AZ1) — LA LISTA SE MUDÓ A `hypotheses/desregistradas.ts`, y no por
// prolijidad: la Ola AZ dio de baja cuatro patrones a la vez y eso destapó que la lista la
// necesitan DOS compuertas, no una — ésta (la del REGISTRO) y
// `hypotheses/consumo-mecanismos.test.ts` (la del CONSUMO, que cuenta archivos en disco y
// caía por debajo de cuatro pisos al contar sólo los registrados). Dos listas escritas a mano
// en dos lugares es exactamente como `scratchpad-ax7/censo-patrones.py` quedó ciego a `Proxy`
// durante una ola entera: UNA sola lista, importada por las dos. Las razones y los números de
// cada baja viven allá, con la misma redacción que tenían acá.

const DELIBERATELY_UNREGISTERED: ReadonlyArray<{ readonly file: string; readonly id: string; readonly razon: string }> = [
  {
    file: "detect/intra-file/enumerated-field-dispatch.ts",
    id: "enumerated-field-dispatch",
    razon: "Ola AC, frente AC2: R1 aplicada (1/20 = 5,0 %, bajo el piso del 20 %). Ver ola-ac/informes/AC2.md §5.",
  },
  {
    file: "detect/intra-file/data-class.ts",
    id: "data-class",
    razon:
      "Ola AU, frente AU6: CONSTRUIDO Y MEDIDO, 0/40 = 0 % [0 %, 8,8 %] sobre 21 repos — falla " +
      "estructuralmente porque el hecho que decide (¿otras clases manipulan sus datos con detalle?) " +
      "es inter-file y este detector es intra-file. Ver ola-au/informes/AU6.md §2. Queda como artefacto " +
      "reproducible (16 tests); la mitad inter-file que sí podría funcionar está diseñada pero no construida.",
  },
  // ═══════════════════════════════════════════════════════════════════════
  // OLA AX · ATERRIZAJE — AVISO DE VIGENCIA SOBRE LAS RAZONES DE ABAJO.
  //
  // Varias de estas razones dicen "ninguna hipótesis registrada depende del
  // kind" y estaban VERIFICADAS contra las 32 hipótesis de entonces. Con el
  // aterrizaje son 34, y DOS de los kinds dados de baja pasaron a estar
  // ANCLADOS por una hipótesis registrada:
  //
  //   · `divergent-change`  (baja de AW3) ← `Extract Class`
  //   · `unused-variable`   (baja de AW)  ← `Remove Dead Code` (camino C)
  //
  // NO ROMPE NADA Y NO CAMBIA NINGUNA BAJA: un detector desregistrado no
  // produce `Finding`s, así que el ancla queda INERTE — `Extract Class` sale
  // entera de `large-class` y `Remove Dead Code` entera de `unused-symbol`
  // (`ola-ax/informes/AX2.md` §8.2 lo midió: el camino C emite CERO en los 21
  // repos). El precedente ya existía: `Form Template Method` ancla en
  // `parallel-hierarchies`, dado de baja por AX8.
  //
  // Queda escrito porque la frase de abajo, leída hoy y sin fecha, afirmaría
  // algo que dejó de ser cierto. Ver `ola-ax/informes/ATERRIZAJE.md`.
  // ═══════════════════════════════════════════════════════════════════════
  // OLA AW — SEIS BAJAS DE UNA SOLA VEZ, la primera vez que el encargo autoriza
  // quitar detectores. Las tres condiciones (ninguna hipótesis registrada
  // depende del kind; se desregistra, no se borra; el delta de nivel 1 está
  // medido y declarado) están verificadas para las OCHO, ancla por ancla
  // contra las 32 hipótesis registradas Y contra el mapa `kind → hipótesis`
  // que el árbitro (AW7) reconstruyó de forma independiente — ver
  // `ola-aw/informes/guardian.md`.
  {
    file: "detect/inter-file/shotgun-surgery.ts",
    id: "shotgun-surgery",
    razon:
      "Ola AW, frente AW5: RE-MEDIDO, 0/26 vivos (0/31 con los muertos) = 0 % [0 %, 12,9 %] en 14 " +
      "repos y 6 lenguajes (más vue). Dos causas, la segunda de raíz: (a) el grafo de llamadas " +
      "conflaciona HOMÓNIMOS (`Any` 3.493 llamadores = `typing.Any`; `constructor` 387 = la palabra " +
      "reservada de cada clase; `Program` 36 = el visitor que declara cada regla de eslint); (b) CM/CC " +
      "altos son la firma de un PUNTO ÚNICO DE CAMBIO, o sea la AUSENCIA del olor — el propio " +
      "docstring del módulo declara que la evidencia que lo separa de una utilidad compartida sana (la " +
      "historia de cambios) no es observable desde `CodeGraph`. No es ancla de ninguna hipótesis. " +
      "Ver ola-aw/informes/AW5.md §3.",
  },
  {
    file: "detect/inter-file/divergent-change.ts",
    id: "divergent-change",
    razon:
      "Ola AW, frente AW3: re-medido sobre los 21 repos, 4/23 = 17,4 % en muestra fresca sistemática " +
      "juzgada abriendo el archivo, y 8/44 = 18,2 % sumando el banco heredado (el número heredado NO " +
      "estaba inflado: se reproduce). Se quita no por el porcentaje sino porque 7 de sus 8 verdaderas " +
      "YA las reporta large-class (100 %), god-component o fanout-without-cohesion: su aporte único " +
      "sobre 44 juicios es UNO (jekyll/lib/jekyll/page.rb). No es ancla de ninguna hipótesis " +
      "registrada — Split by Reason to Change, la única que la ancla, quedó sin registrar por la " +
      "misma razón. Ver ola-aw/informes/AW3.md §1.",
  },
  {
    file: "detect/inter-file/feature-envy-inter.ts",
    id: "feature-envy-inter",
    razon:
      "Ola AW, frente AW4: 0/46 = 0 % [0 %, 7,7 %] sobre el banco entero. Sus 46 falsos son cinco " +
      "familias sanas (barril/re-export, módulo de tipos ubicuo, archivos del mismo paquete Go, " +
      "wrapper delgado documentado, cliente de la utilidad de su propio subsistema), no un umbral mal " +
      "puesto. La vía de atribución por módulo construida en esta misma ola (ver `modulo-envy`, " +
      "desconectada) no la rescata. Ver ola-aw/informes/AW4.md §1-ter y §4-bis.",
  },
  {
    file: "detect/inter-file/inappropriate-intimacy.ts",
    id: "inappropriate-intimacy",
    razon:
      "Ola AW, frente AW4: 0/18 = 0 % [0 %, 17,6 %] sobre el banco entero; emite apenas 6 hallazgos en " +
      "21 repos (no está mudo, pero es diminuto). Sus 18 falsos son 'mismo paquete Go' y 'módulo " +
      "compañero por diseño', dos formas que la atribución por módulo COLAPSA en vez de detectar. Ver " +
      "ola-aw/informes/AW4.md §1-ter y §4-bis.",
  },
  {
    file: "detect/intra-function/demeter-chain.ts",
    id: "demeter-chain",
    razon:
      "Ola AW, frente AW4: 9/122 = 7,4 % [3,9 %, 13,4 %] sobre TODOS los juicios de nivel 1 (dudosos " +
      "fuera del denominador, columna `stillPresent` sin usar). No mide acoplamiento por módulo: mide " +
      "largo de cadena, y la vía de atribución por módulo no lo rescata. Ninguna hipótesis lo usa. " +
      "OJO: la cifra 'vigente' de 52,9 % (9/17) que circuló en olas previas es la MISMA base, sólo que " +
      "filtrada a `stillPresent` — con cobertura de apenas 22,7 % es un estimador frágil (AU7 la " +
      "desmintió a ciegas con 22,2 % sobre 18 casos frescos); el número que decide esta baja es el de " +
      "n=122, no el de n=17. Ver ola-aw/informes/AW4.md §4-bis.",
  },
  {
    file: "detect/inter-file/coupling-without-abstraction.ts",
    id: "coupling-without-abstraction",
    razon:
      "Ola AW, frente AW4: 0/63 = 0 % [0 %, 5,7 %] sobre el banco entero Y ADEMÁS muda — 0 hallazgos " +
      "en los 12 repos censados. El peor caso posible: 63 juicios, ni un verdadero, y hoy ni siquiera " +
      "emite. Ninguna hipótesis la usa. Ver ola-aw/informes/AW4.md §4-bis.",
  },
  {
    file: "detect/inter-file/speculative-abstraction.ts",
    id: "speculative-abstraction",
    razon:
      "Ola AW, frente AW6: 0/10 = 0 % [0 %, 27,8 %] sobre una muestra fresca de sqlalchemy (donde vive " +
      "el grueso de sus 305-422 hallazgos), 3/57 ≈ 5,3 % acumulado con el banco. CORRECCIÓN AL ENCARGO " +
      "DE APERTURA, verificada por el árbitro (AW7): el detector NO está vacío (emite cientos de " +
      "hallazgos en 6 lenguajes) — la baja es por PRECISIÓN, no por mudez. Su precondición ('un solo " +
      "subtipo') es una FORMA, no un HECHO suficiente para ser PROBLEMA: los 10 casos abiertos son " +
      "bases de dialecto/driver legítimas y documentadas ('por si acaso' es una intención sobre el " +
      "futuro, no algo verificable abriendo el archivo). Perdió su único consumidor hace olas: era " +
      "ancla de Prototype y la Ola X (frente B5) lo re-ancló a `duplication`. Ver " +
      "ola-aw/informes/AW6.md §3.5 y §4.1.",
  },
  {
    file: "detect/intra-function/unused-variable.ts",
    id: "unused-variable",
    razon:
      "Ola AW, frente AW6: 1/17 = 5,9 % [1,0 %, 27,0 %] en muestra fresca sobre la población de hoy " +
      "(541 hallazgos, 19 repos). El 53,6 % 'vigente' NO estaba inflado por el defecto de " +
      "`stillPresent` —delta 0,0 exacto, verificado por el árbitro (AW7)— pero su Wilson [35,8 %, " +
      "70,5 %] cruza el piso con cobertura de apenas 4,0 % (28 de 699): no decidía nada. 264 de 278 " +
      "hallazgos medidos son PARÁMETROS, y los 16 falsos de la muestra fresca son parámetros cuya " +
      "firma la fija un contrato externo (manejador de evento .NET, interfaz de goldmark, señal de " +
      "Django, oyente de SQLAlchemy) — resolverlo exige overrides/delegados/registros de framework, " +
      "que el analizador no hace. Ninguna hipótesis la usa. Ver ola-aw/informes/AW6.md §3.3 y §4.2.",
  },
  // OLA AW, frente AW4 — no es una baja: es un detector NUEVO que se
  // construyó, midió y quedó CONSTRUIDO, MEDIDO Y DESCONECTADO (mismo
  // destino que `data-class`, arriba). Se copia igual al disco, porque
  // `detect/` no está en git y borrarlo sería perder el artefacto.
  {
    file: "detect/inter-file/modulo-envy.ts",
    id: "modulo-envy",
    razon:
      "Ola AW, frente AW4: CONSTRUIDO Y MEDIDO, 3/44 = 6,8 % [2,3 %, 18,2 %] abriendo el archivo real " +
      "en SIETE lenguajes y 12 repos — atribución por MÓDULO en vez de por CLASE (la idea del " +
      "usuario), que rescata 66.768 aristas de uso (23,1 % del total) que el camino por tipos no " +
      "puede resolver. Emite en los seis lenguajes donde feature-envy-intra no puede (va, python, " +
      "javascript incluidos), pero la forma que detecta ('este cuerpo toca más miembros de allá que " +
      "de acá') la comparten el mapeador, el renderizador y el cliente de una utilidad — el 87 % de " +
      "la población — y eso no se ve abriendo el archivo. Ninguna hipótesis la usa. Ver " +
      "ola-aw/informes/AW4.md §3.",
  },
  // OLA AX — TRES BAJAS MÁS, verificadas por el guardián con las tres
  // condiciones de siempre (ninguna hipótesis registrada depende del kind —
  // recorrido ancla por ancla, no por memoria; se desregistra, no se borra;
  // delta de nivel 1 medido y declarado). Ver `ola-ax/informes/guardian.md`.
  {
    file: "detect/intra-file/feature-envy-intra.ts",
    id: "feature-envy-intra",
    razon:
      "Ola AX, frente AX8: RE-MEDIDO sobre la población de HOY, 1/81 = 1,2 % [0,2 %, 6,7 %], con los " +
      "81 juzgados ABRIENDO EL ARCHIVO REAL en 4 lenguajes (java 0/41, csharp 0/28, typescript 0/10, " +
      "ruby 1/2) y 8 repos — cobertura del 100 % de la población, no una muestra. El 5,3 % heredado " +
      "se reproduce (1/19 vivo en el banco) pero la población es otra. NO ES UN UMBRAL MAL PUESTO: " +
      "los 80 falsos son OCHO familias sanas (hook polimórfico de framework, mapeador/adaptador, " +
      "poblador de descriptor, serializador/escritor, renderizador de un control sobre su modelo, " +
      "validador, cargador/fábrica, ayudante de aserción de un test). Se midieron y se REFUTARON las " +
      "dos compuertas pre-registradas: W (el método escribe al proveedor, la pista que AU4 dejó con " +
      "n=2) 1/10 = 10,0 % — un POBLADOR escribe al objeto que puebla; y P (el proveedor es un CAMPO " +
      "propio y no un parámetro, la exclusión de mapeadores/pobladores que pedía el encargo) " +
      "1/11 = 9,1 % — el ViewModel guarda sus opciones en un campo y el control de Avalonia su modelo " +
      "en una StyledProperty. P∧W da 1/5 = 20,0 %, bajo la banda intermedia y con n=5. Se suman los " +
      "cuatro hechos de AU4 (Q∪R∪S∪S-bis, 15,4 %) y la vía por MÓDULO de AW4 (`modulo-envy`, 6,8 %): " +
      "SIETE compuertas medidas por cuatro frentes en cuatro olas, ninguna llega al piso del 50 %. " +
      "La causa de fondo: su precondición es una FORMA ('toca más miembros de allá que de acá'), no " +
      "un hecho SUFICIENTE para ser problema — lo que separa la envidia del mapeo es si la lógica " +
      "PODRÍA vivir allá, que es una intención de diseño. Ninguna de las 32 hipótesis registradas lo " +
      "usa como ancla y sus hallazgos sostienen CERO propuestas (medido). PRECIO DECLARADO: se pierde " +
      "el único verdadero vivo del corpus (rubocop lib/rubocop/lsp/server.rb:58 Server#configure), y " +
      "por eso se sacó su fila del snapshot de recall y se agregaron 4 waivers de censo (33 claves, " +
      "guava/nest/newtonsoft-json/rubocop) en el mismo cambio. Ver ola-ax/informes/AX8.md §2.",
  },
  {
    file: "detect/inter-file/parallel-hierarchies.ts",
    id: "parallel-hierarchies",
    razon:
      "Ola AX, frente AX8: NO ES UN DETECTOR MALO — ESTÁ CORRECTAMENTE MUDO, y se desregistra por " +
      "INÚTIL, no por malo. AW5 le puso la compuerta de CORRESPONDENCIA DE NOMBRES (los " +
      "discriminadores de las dos familias se espejan), que es una precondición legítima: un HECHO " +
      "en `symbolPath`, visible en lo que el analizador carga, y suficiente para que sea problema. " +
      "Con ella emite 0 hallazgos en 21 repos (16 re-verificados en esta ola), contra los 14 juicios " +
      "vivos y 0 verdaderos que traía. Es ancla de `template-method` (CONGELADO) y de " +
      "`form-template-method`, pero al no emitir NO sostiene ni una propuesta: el delta de nivel 2 " +
      "de esta baja es CERO, medido. Los `anchors` de las dos hipótesis quedan intactos (inertes, " +
      "`run.ts` filtra por `kind` de `Finding`) para no tocar un patrón congelado. El archivo y sus " +
      "tests se conservan porque el 0 puede leerse como 'el olor no está en el corpus' y no sólo " +
      "como 'la compuerta es muy exigente'. Ver ola-ax/informes/AX8.md §1.",
  },
  // OLA AX, frente AX4 — no es una baja: es un detector NUEVO que se
  // construyó, midió y quedó CONSTRUIDO, MEDIDO Y DESCONECTADO (mismo
  // destino que `data-class`/`modulo-envy`, arriba). Se copia igual al
  // disco, porque `detect/` no está en git y borrarlo sería perder el
  // artefacto.
  {
    file: "detect/inter-file/homonymous-divergent-signature.ts",
    id: "homonymous-divergent-signature",
    razon:
      "Ola AX, frente AX4: CONSTRUIDO Y MEDIDO — el `kind` que le faltaba a `Alternative Classes` " +
      "(AW3 §2.6: ~100 sujetos inalcanzables porque ningún `kind` nombraba la forma). Nivel 1: " +
      "4/21 = 19,0 % [7,7 %, 40,0 %] sobre 21 hallazgos en 2 de 11 repos medidos (jenkins, nest). " +
      "Nivel 2, `Unify Alternative Interfaces` sobre el ancla nueva: 3/9 = 33,3 % [12,1 %, 64,6 %]. " +
      "Los dos puntos caen por debajo del piso de la banda intermedia (35 %) — el árbitro (AX7) " +
      "coincide explícitamente: 'entra en la banda por el techo pero no por el punto'. Con tres " +
      "compuertas propias (G6/G8/G9, que retiran seis falsas de los dos repos de formulación sin " +
      "costar ninguna verdadera) sube a 26,7 %/50,0 %, pero esos números se midieron SOBRE los " +
      "mismos sujetos que las formularon (n=6 y n=15) y la medición sobre repos frescos (§2.3 de " +
      "AX4.md) quedó PENDIENTE al cerrar el frente — no hay número fresco que sostenga un alta. " +
      "Once de los diecisiete falsos no son un error del detector: son dos métodos que comparten " +
      "nombre por casualidad bajo una interfaz de capacidad, un puente `@Deprecated`, o una " +
      "sobrecarga a lo largo de la propia cadena de herencia — la divergencia de aridad es real, " +
      "el problema no. Registrado SÓLO en la copia de medición del frente " +
      "(`scratchpad-ax4/src1..4`), nunca en el árbol real. Las dos líneas para cuando una ola " +
      "futura complete la medición fresca y decida registrarlo están en ola-ax/informes/AX4.md " +
      "§1.2. Ver ola-ax/informes/AX4.md §1 y ola-ax/informes/AX7.md §8 (fila 9) y §9.",
  },
  {
    file: "detect/inter-file/middle-man.ts",
    id: "middle-man",
    razon:
      "Ola AX, frente AX6: NO ERA UN DETECTOR MALO, ERA UN CABLE CORTADO — y esta misma ola lo " +
      "arregló. `code-analyzer.ts` armaba `RepoUnit.functions` para nadie (`functions: []` " +
      "hardcodeado); por eso el detector llevaba 0 hallazgos en 21 repos y 0 juicios en su historia. " +
      "El frente arregló el cable (`buildRepoFunctionUnits`, enchufado SÓLO a la pasada inter-file " +
      "para no darle datos nuevos a `null-object`/`factory-method`/`builder`, los tres patrones " +
      "CONGELADOS que también leen `repo.functions` — el arreglo de `code-analyzer.ts` SE QUEDA, " +
      "verificado con `tsc` limpio) y midió por primera vez: 755 hallazgos en 18 repos, 42 juzgados " +
      "ABRIENDO EL ARCHIVO en los SEIS lenguajes, 0/42 verdaderos [0,0 %, 8,4 %] (2 " +
      "'problema-si-patrón-no' a favor: 4,8 % [1,3 %, 15,8 %]). Causa dominante (39 de 40 falsos): " +
      "`graph/resolve.ts` empareja el 'destino del reenvío' por coincidencia de nombre y produce " +
      "aristas de llamada donde no hay ninguna llamada — una propiedad leída, un tipo, una " +
      "anotación, un constructor, un builtin, y hasta un archivo de OTRO lenguaje. Deuda de otro " +
      "archivo, no de éste. El árbitro (AX7) corroboró el número por un camino independiente " +
      "(R0 sobre `Ghost`: 0→60 hallazgos, 0 verdaderas de los 17 patrones congelados movidas) y " +
      "midió que la baja es segura en las dos direcciones: `middle-man` en `Ghost` vuelve a 0, que " +
      "es exactamente el estado en el que las propuestas de `Null Object` en ese repo ya se " +
      "verificaron idénticas. Ver ola-ax/informes/AX6.md §6 y ola-ax/informes/AX7.md §15.3.",
  },
];

describe("registries — disco ↔ registro ↔ satélites, los cinco a la vez", () => {
  it("detect/registry.ts: todo archivo bajo intra-function/intra-file/inter-file está en DETECTORS, y viceversa", () => {
    const onDisk = [
      ...scanDir("detect/intra-function", []),
      ...scanDir("detect/intra-file", []),
      // `confident-edges.ts` — P1 (Ola 9), CONTRATO-F9.md §4.5: helper
      // compartido (`confidentEdges(graph)`), no un detector; no declara
      // `id:` por la misma razón de infraestructura que ya excluye a
      // `types.ts`/`sentinel.ts`/`projection.ts`/`budget.ts` en los otros
      // registros de este mismo test. `repo-name-index.ts` — Ola AW, frente
      // AW6: helper compartido (el índice de texto crudo del repo) que usan
      // `unused-symbol` y `orphan-file`, mismo criterio que `confident-edges`.
      ...scanDir("detect/inter-file", ["confident-edges", "repo-name-index"]),
    ];

    const withoutId = onDisk.filter((f) => f.id === null);
    expect(withoutId, `archivos sin un "id: ..." reconocible: ${withoutId.map((f) => f.file).join(", ")}`).toEqual([]);

    const registered = new Set(DETECTORS.map((d) => d.id));
    const deliberate = new Set(DELIBERATELY_UNREGISTERED.map((d) => d.id));
    const filesNotRegistered = onDisk.filter((f) => !registered.has(f.id!) && !deliberate.has(f.id!));
    expect(
      filesNotRegistered,
      `archivos en disco sin línea en detect/registry.ts: ${filesNotRegistered.map((f) => f.file).join(", ")}`,
    ).toEqual([]);

    const onDiskIds = new Set(onDisk.map((f) => f.id));
    const idsWithoutFile = [...registered].filter((id) => !onDiskIds.has(id));
    expect(idsWithoutFile, `ids en DETECTORS sin archivo en disco: ${idsWithoutFile.join(", ")}`).toEqual([]);

    // La excepción no puede pudrirse en silencio: si alguien REGISTRA el
    // detector sin borrar la declaración, o si el archivo declarado
    // desaparece del disco, esto se pone rojo y obliga a leer por qué.
    const onDiskById = new Map(onDisk.map((f) => [f.id, f.file]));
    for (const d of DELIBERATELY_UNREGISTERED) {
      expect(onDiskById.get(d.id), `declarado DELIBERATELY_UNREGISTERED pero no está en disco: ${d.file}`).toBe(d.file);
      expect(
        registered.has(d.id),
        `${d.id} está en DETECTORS Y en DELIBERATELY_UNREGISTERED a la vez — borrar la declaración`,
      ).toBe(false);
    }
  });

  it("detect/registry.ts: todo detector registrado tiene su <id>.test.ts al lado", () => {
    const dirs = ["detect/intra-function", "detect/intra-file", "detect/inter-file"];
    const missingTests = DETECTORS.filter(
      (d) => !dirs.some((dir) => fs.existsSync(path.join(ROOT, dir, `${d.id}.test.ts`))),
    );
    expect(missingTests.map((d) => d.id), "detectores sin <id>.test.ts en ningún directorio").toEqual([]);
  });

  it("detect/impact.ts: un tier por CADA detector registrado, ni falta ni sobra", () => {
    const registered = new Set(DETECTORS.map((d) => d.id));
    const declared = new Set(Object.keys(DETECTOR_IMPACT));
    const missing = [...registered].filter((id) => !declared.has(id));
    const stale = [...declared].filter((id) => !registered.has(id));
    expect(missing, `detectores registrados sin tier en DETECTOR_IMPACT: ${missing.join(", ")}`).toEqual([]);
    expect(stale, `tiers de detectores que ya no están en DETECTORS: ${stale.join(", ")}`).toEqual([]);
  });

  it("graph/edges/registry.ts: todo extractor en disco está en EDGE_EXTRACTORS, y viceversa", () => {
    // `registry.ts` (el propio archivo del arreglo), `types.ts`/`sentinel.ts`
    // (vocabulario/sonda compartidos) y `warmup.ts` (el DESPACHADOR que
    // invoca los extractores sobre un archivo real — ver su propio
    // docstring, "Archivo NUEVO... no toca ninguno de los 6 extractores")
    // son infraestructura de este directorio, no extractores — ninguno
    // lleva su propio `id: "..."`. `satisfies-derive.ts` (CONTRATO-F8G.md
    // §3.2), `carries-derive.ts`, `invocacion-indirecta.ts` y `portador.ts`
    // (CONTRATO-F9.md §3.3, "relación mediada por un valor") tampoco: NO son
    // un `EdgeExtractor` que corra `extract(file, ctx)` sobre un archivo —
    // son derivaciones sobre el grafo YA armado (nodos + `contains`),
    // enganchadas directo desde `graph/build.ts`, nunca pasan por
    // `EDGE_EXTRACTORS`. `portador.ts` lo declara explícitamente en su propio
    // docstring ("NO ES UN EdgeExtractor — divergencia deliberada...").
    const onDisk = scanDir("graph/edges", [
      "registry",
      "types",
      "sentinel",
      "warmup",
      "satisfies-derive",
      "carries-derive",
      "invocacion-indirecta",
      "portador",
    ]);
    const withoutId = onDisk.filter((f) => f.id === null);
    expect(withoutId, `archivos sin un "id: ..." reconocible: ${withoutId.map((f) => f.file).join(", ")}`).toEqual([]);

    const registered = new Set(EDGE_EXTRACTORS.map((e) => e.id));
    const filesNotRegistered = onDisk.filter((f) => !registered.has(f.id!));
    expect(
      filesNotRegistered,
      `extractores en disco sin línea en graph/edges/registry.ts: ${filesNotRegistered.map((f) => f.file).join(", ")}`,
    ).toEqual([]);

    const onDiskIds = new Set(onDisk.map((f) => f.id));
    const idsWithoutFile = [...registered].filter((id) => !onDiskIds.has(id));
    expect(idsWithoutFile, `ids en EDGE_EXTRACTORS sin archivo en disco: ${idsWithoutFile.join(", ")}`).toEqual([]);
  });

  it("graph/metrics/registry.ts: toda métrica en disco está en GRAPH_METRICS, y viceversa", () => {
    // `registry.ts` (el propio arreglo), `types.ts`/`projection.ts`/
    // `budget.ts` son infraestructura compartida (ver sus docstrings), no
    // métricas — ninguno lleva su propio `id`.
    const onDisk = scanDir("graph/metrics", ["registry", "types", "projection", "budget"]);
    const withoutId = onDisk.filter((f) => f.id === null);
    expect(withoutId, `archivos sin un "id: ..." reconocible: ${withoutId.map((f) => f.file).join(", ")}`).toEqual([]);

    const registered = new Set(GRAPH_METRICS.map((m) => m.id));
    const filesNotRegistered = onDisk.filter((f) => !registered.has(f.id!));
    expect(
      filesNotRegistered,
      `métricas en disco sin línea en graph/metrics/registry.ts: ${filesNotRegistered.map((f) => f.file).join(", ")}`,
    ).toEqual([]);

    const onDiskIds = new Set(onDisk.map((f) => f.id));
    const idsWithoutFile = [...registered].filter((id) => !onDiskIds.has(id));
    expect(idsWithoutFile, `ids en GRAPH_METRICS sin archivo en disco: ${idsWithoutFile.join(", ")}`).toEqual([]);
  });

  it("hypotheses/registry.ts: toda hipótesis en disco está en HYPOTHESES, y viceversa", () => {
    // `types.ts` (vocabulario compartido), `registry.ts` (el propio arreglo),
    // `run.ts`/`engine.ts` (el motor — CONTRATO-F6.md, un único productor de
    // `PatternHypothesis`, no una hipótesis en sí), `builder.fixtures.ts`
    // (fixtures del `.test.ts` de `builder`, no una hipótesis) y
    // `wrapping-chain.ts` (Ola 10, CONTRATO-F10.md §0.4 — "la terna de
    // envoltura" compartida por 11 de los 17 patrones; responde una
    // pregunta de FORMA, nunca decide `PatternState`, así que no es una
    // hipótesis en sí — mismo criterio que `run.ts`/`engine.ts`) y
    // `desregistradas.ts` (Ola AZ, frente AZ1 — la LISTA de hipótesis
    // deliberadamente sin registrar, compartida con
    // `hypotheses/consumo-mecanismos.test.ts`; es un registro, no una
    // hipótesis, y por eso no lleva `id: "..."` de nivel de hipótesis —
    // mismo criterio que `registry.ts`) y
    // `pattern-coverage.ts` (Ola A, frente A3 — cruce PURO entre
    // `HypothesisBuilder.anchors` y la cobertura de los detectores, para
    // separar "el patrón se evaluó y no aplica" de "el patrón nunca llegó a
    // evaluarse porque su ancla quedó `sin-aristas`"; no construye ni
    // clasifica ninguna `PatternHypothesis`, así que no es una hipótesis en
    // sí — mismo criterio que `run.ts`/`engine.ts`) son
    // infraestructura de este directorio — ninguno lleva su propio
    // `id: "..."` de nivel de hipótesis (ver `HYPOTHESIS_ID_RE`).
    const onDisk = scanDir(
      "hypotheses",
      ["types", "registry", "run", "engine", "builder.fixtures", "wrapping-chain", "pattern-coverage", "desregistradas"],
      HYPOTHESIS_ID_RE,
    );
    const withoutId = onDisk.filter((f) => f.id === null);
    expect(withoutId, `archivos sin un "id: ..." de hipótesis reconocible: ${withoutId.map((f) => f.file).join(", ")}`).toEqual([]);

    const registered = new Set(HYPOTHESES.map((h) => h.id));
    const declaradas = new Set(HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR.map((d) => d.id));
    const filesNotRegistered = onDisk.filter((f) => !registered.has(f.id!) && !declaradas.has(f.id!));
    expect(
      filesNotRegistered,
      `hipótesis en disco sin línea en hypotheses/registry.ts: ${filesNotRegistered.map((f) => f.file).join(", ")}`,
    ).toEqual([]);

    const onDiskIds = new Set(onDisk.map((f) => f.id));
    const idsWithoutFile = [...registered].filter((id) => !onDiskIds.has(id));
    expect(idsWithoutFile, `ids en HYPOTHESES sin archivo en disco: ${idsWithoutFile.join(", ")}`).toEqual([]);

    // La excepción no puede pudrirse: se pone roja sola si el archivo
    // desaparece del disco o si alguien lo registra sin borrar la
    // declaración — misma mecánica que `DELIBERATELY_UNREGISTERED` de
    // `detect/`, y por eso se audita acá y no en un `it` aparte.
    const onDiskByIdHip = new Map(onDisk.map((f) => [f.id, f.file] as const));
    for (const d of HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR) {
      expect(
        onDiskByIdHip.get(d.id),
        `declarada HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR pero no está en disco: ${d.file}`,
      ).toBe(d.file);
      expect(
        registered.has(d.id),
        `${d.id} está en HYPOTHESES Y en HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR a la vez — borrar la declaración`,
      ).toBe(false);
    }
  });

  it("invariante compartida: ids únicos y ordenados alfabéticamente en los cuatro registros de arreglo", () => {
    const arrays: readonly (readonly [string, readonly string[]])[] = [
      ["DETECTORS", DETECTORS.map((d) => d.id)],
      ["EDGE_EXTRACTORS", EDGE_EXTRACTORS.map((e) => e.id)],
      ["GRAPH_METRICS", GRAPH_METRICS.map((m) => m.id)],
      ["HYPOTHESES", HYPOTHESES.map((h) => h.id)],
    ];
    for (const [name, ids] of arrays) {
      expect(new Set(ids).size, `${name} tiene ids repetidos`).toBe(ids.length);
      expect(ids, `${name} no está ordenado alfabéticamente por id`).toEqual([...ids].sort());
    }
  });
});

/**
 * Ola 10 — LA MAQUINARIA HUÉRFANA, séptima vez que este patrón exacto
 * aparece en el proyecto (14 detectores registrados y apagados, 6 métricas
 * registradas sin llamador, 6 aristas tipadas sin cablear,
 * `deriveCapabilities` sin llamador, interfaz-estructural sin cablear,
 * `carrierFacts` que no llegaba a `FileFacts`, y ahora el vecindario) — pero
 * un caso NUEVO dentro del patrón, que los cinco tests de arriba NO cubren:
 * el vecindario no es un REGISTRO con una entrada faltante, es un PARÁMETRO
 * OPCIONAL (`HypothesesRunInput.neighborhoodIndex?`) cuyo default es un
 * valor VACÍO Y VÁLIDO (`EMPTY_NEIGHBORHOOD` — responde `[]`/`null`/`undefined`
 * a todo, nunca lanza). Eso es lo que lo vuelve peligroso: un consumidor de
 * producción que se olvida de pasarlo NO rompe el build, ni un test unitario
 * con un `HypothesisContext` armado a mano (que trae su propio vecindario
 * completo) — sólo se nota corriendo el pipeline REAL de punta a punta y
 * viendo si el dato de verdad SALE al otro lado.
 *
 * LA COMPUERTA: correr `analyzeRepo` real (no un mock, no un `ctx` a mano)
 * sobre un repo mínimo con DOS hallazgos que sólo pueden verse el uno al
 * otro A TRAVÉS del vecindario — un `conditional-chain` y un
 * `repeated-switch` sobre el MISMO discriminante ("kind"), en archivos
 * DISTINTOS — y verificar que el discriminador `repeticion-cruzada` de
 * Strategy sale CONFIRMADO en el `CodeAnalysis` final. Si `code-analyzer.ts`
 * alguna vez deja de pasar `neighborhoodIndex` a `refreshHypotheses` (o dejar
 * de llamarla), este test vuelve a ver el vecindario vacío y se pone rojo.
 *
 * PROBADA ROTA A PROPÓSITO (ver el informe de esta ola): comentando la
 * llamada a `refreshHypotheses` dentro de `crossAnalyze`
 * (`code-analyzer.ts`), este test falla — el discriminador vuelve a `false`
 * y la evidencia cita "no aparece en ningún 'repeated-switch'" en vez de
 * "el vecindario confirma repetición cruzada". Revertido después de
 * confirmar el rojo.
 */
describe("el vecindario NO llega vacío al pipeline real (analyzeRepo de punta a punta)", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fsp.rm(root, { recursive: true, force: true });
  });

  /** `makeFixture` de `code-analyzer.test.ts`, repetido acá (no importado: ese archivo no exporta nada, sus fixtures son locales a propósito). */
  async function makeFixture(files: Record<string, string>): Promise<string> {
    const dir = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), "ck-neighborhood-wiring-")));
    for (const [rel, contents] of Object.entries(files)) {
      const full = path.join(dir, rel);
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, contents);
    }
    return dir;
  }

  // >=5 ramas (el piso REAL de `conditional-chain`, ver `threshold-alignment.test.ts`), discriminante "kind" — la MISMA forma que `code-analyzer.test.ts#CONDITIONAL_CHAIN`, con el nombre de variable que hace falta para que coincida con el switch de abajo.
  // Cada rama invoca una operación DISTINTA (nunca un literal): desde Ola D,
  // `distinctBehaviorCheck` (`strategy.ts`) excluye una escalera cuya mayoría
  // de ramas retorna un valor fijo — este fixture prueba el cableado del
  // vecindario, no esa exclusión, así que tiene que tener la forma que SÍ
  // sobrevive a ese check (ver el mismo ajuste en `strategy.test.ts`).
  const CHAIN_SOURCE = `
function classify(kind) {
  if (kind === "a") {
    return handleA(kind);
  } else if (kind === "b") {
    return handleB(kind);
  } else if (kind === "c") {
    return handleC(kind);
  } else if (kind === "d") {
    return handleD(kind);
  } else if (kind === "e") {
    return handleE(kind);
  } else {
    return 0;
  }
}
`;

  // Dos switches sobre "kind" en el MISMO archivo (repeated-switch es intra-file, piso 2) — misma forma que `strategy.test.ts`'s ancla secundaria.
  const DISPATCH_SOURCE = `
function priceFor(kind) {
  switch (kind) {
    case "circle": return computeCirclePrice(kind);
    default: return 0;
  }
}
function iconFor(kind) {
  switch (kind) {
    case "circle": return computeCircleIcon(kind);
    default: return "?";
  }
}
`;

  it("conditional-chain (archivo A) + repeated-switch del MISMO discriminante (archivo B) ⇒ Strategy confirma 'repeticion-cruzada' en el resultado final", async () => {
    root = await makeFixture({
      "src/classify.js": CHAIN_SOURCE,
      "src/dispatch.js": DISPATCH_SOURCE,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain, "el fixture tiene que producir un hallazgo conditional-chain real").toBeDefined();
    expect(chain?.hypotheses, "el conditional-chain tiene que colgar al menos una hipótesis (Strategy)").toBeDefined();

    const strategy = chain!.hypotheses!.find((h) => h.pattern === "Strategy");
    expect(strategy, "tiene que colgar específicamente Strategy").toBeDefined();

    const crossRepetition = strategy!.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(crossRepetition, "el discriminador 'repeticion-cruzada' tiene que estar presente").toBeDefined();
    expect(
      crossRepetition?.passed,
      `esperaba 'repeticion-cruzada' CONFIRMADO (el vecindario real ve al repeated-switch hermano) — si esto da false, neighborhoodIndex volvió a llegar vacío al pipeline real. Evidencia real: "${crossRepetition?.why}"`,
    ).toBe(true);
    expect(crossRepetition?.why).toContain("vecindario confirma repetición cruzada");
  });
});
