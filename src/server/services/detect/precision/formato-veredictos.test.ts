/**
 * LA COMPUERTA DE FORMA DE LOS ARCHIVOS DE VEREDICTOS — Ola AF, frente AF1.
 *
 * POR QUÉ EXISTE, con su número. `scripts/v-int-precision-nivel2.mts` —el instrumento oficial de
 * precisión de nivel 2, que NO se toca— lee de un archivo de veredictos EXCLUSIVAMENTE claves de
 * PRIMER NIVEL con la forma `<id>::<Patrón>` y campo `verdict`, y resuelve esa clave contra el
 * censo vivo. Todo lo demás lo ignora EN SILENCIO: sin excepción, sin log, sin código de salida.
 *
 * Eso pasó DOS OLAS SEGUIDAS. En la Ola AD costó una propuesta verdadera (un archivo escribió
 * `veredicto` en vez de `verdict`). En la Ola AE costó 35 de 40: doce frentes escribieron en OCHO
 * convenciones distintas —contenedor anidado bajo `juicios`, listas sin clave, clave de UBICACIÓN
 * en vez de id, campo `veredicto`, y `::Proxy` donde el patrón se llama
 * `Proxy (inicialización perezosa)`— y el instrumento leyó cinco.
 *
 * QUÉ VERIFICA CADA CHEQUEO — la intención, no la sintaxis. Cada uno ataja un defecto REAL, medido,
 * con su costo al lado:
 *
 *   1. CONTENEDOR      la raíz es un objeto           ← AE11 escribió una lista: 21 juicios perdidos
 *   2. ANIDAMIENTO     ningún juicio bajo otra clave  ← AE6/12/13/14: 87 juicios, 21 verdaderas
 *   3. LISTA DE JUICIOS ninguna lista de juicios      ← AE8: 41 juicios, 9 verdaderas
 *   4. CAMPO           `verdict`, nunca `veredicto`   ← AE8, y la Ola AD antes
 *   5. FORMA DE CLAVE  `<id>::<Patrón>`, no ubicación ← AE7/AE9: 47 juicios, 4 verdaderas
 *   5-BIS. DIRECCIÓN   `@<archivo>:<línea>` bien formada ← AJ2: una dirección mal escrita no
 *                                                          resuelve, y no avisa
 *   6. SUFIJO          patrón REGISTRADO, completo    ← AE13: 32 juicios, 12 verdaderas
 *   7. VALOR           uno de los cuatro admitidos    ← un valor libre cuenta como no-juzgado
 *
 * OLA AJ · FRENTE AJ2 — LA CLAVE GANA UNA DIRECCIÓN OPCIONAL, Y LA VIEJA SIGUE SIENDO VÁLIDA.
 * `<id>::<Patrón>` nombra la fila entera: cuando esa fila cuelga DOS propuestas del mismo
 * patrón en dos lugares distintos del código —lo normal desde que la Ola AC hizo que un grupo
 * publique las hipótesis de todos sus miembros— las dos comparten esa clave y sólo una se puede
 * juzgar (medido: `click · long-function:_c7REnnTm-LveJA_ · Extract Method` son **14**
 * propuestas bajo UNA clave). La forma nueva `<id>@<archivo>:<línea>::<Patrón>` nombra UNA.
 * **Las dos formas son válidas y las dos resuelven**: la vieja no se deprecia, porque
 * deprecarla huerfanaría los ~1.900 veredictos vivos de diez olas. Ver
 * `detect/precision/direccion-hipotesis.ts` y `ola-af/FORMATO-VEREDICTOS.md` §1-BIS.
 *
 * DE DÓNDE SALE LA LISTA DE PATRONES: de `hypotheses/registry.ts#HYPOTHESES`, el registro de
 * producción — no de una copia pegada acá. Si mañana nace un patrón, este test lo acepta solo, y si
 * uno cambia de nombre, este test lo exige en el mismo commit.
 *
 * LO QUE ESTE TEST NO PUEDE HACER, y va declarado en vez de insinuado: NO verifica que la clave
 * RESUELVA contra el censo vivo. Eso exige correr el analizador (o leer un volcado del día), que no
 * es trabajo de una suite unitaria. Un archivo verde acá todavía puede tener claves vencidas; el
 * frente las verifica con su propio volcado (`ola-af/FORMATO-VEREDICTOS.md` §3). Este test cubre
 * los seis defectos de FORMA, que son los que costaron las 35.
 *
 * ALCANCE: de `ola-ae/veredictos/` en adelante, INCLUIDA LA OLA EN CURSO. Las olas anteriores a la
 * AE quedan fuera a propósito: sus archivos ya están contados en la serie publicada y
 * re-formatearlos movería veredictos históricos bajo una firma que no es la suya. Si el directorio
 * de la ola no existe todavía, el test pasa sin aserciones (y lo dice) — corre igual el día 1.
 *
 * OLA AU · FRENTE AU1 — LA LISTA `DIRS` SE HABÍA QUEDADO CUATRO OLAS ATRÁS, Y COSTÓ EXACTAMENTE LO
 * QUE ESTE ARCHIVO EXISTE PARA EVITAR. `ola-aq`, `ola-ar`, `ola-as` y `ola-at` NO estaban. AP1 §9,
 * AR4 §7 y el integrador de la Ola AS lo pidieron por escrito — tres olas. Medido al extenderla:
 * **de 1.070 juicios de esas cuatro olas, el instrumento oficial CONTABA 72.** Once de quince
 * archivos guardaban los juicios en LISTAS (defecto #3) y 669 escribían `veredicto` en vez de
 * `verdict` (defecto #4). Después de migrarlos cuenta **262**, y las **OCHO** familias de
 * refactorización que estaban en `n=0` —`Guard Clauses`, `Lookup Table`, `Consolidate Conditional`,
 * `Decompose Conditional`, `Extract Variable`, `Handle Empty Catch`, `Remove Flag Argument`,
 * `Split Phase`— pasaron a tener base. Ver `ola-au/informes/AU1.md`.
 *
 * **`DIRS` INCLUYE LA OLA EN CURSO.** Dejar afuera la ola que se está escribiendo es exactamente
 * cómo esta lista se atrasó cuatro olas: nadie la agrega al abrir, y al cerrar ya hay mil juicios
 * escritos en la forma equivocada. **Al abrir una ola nueva, su línea va acá el día 1.**
 *
 * 8-BIS. LOS DOS CHEQUEOS DE LA OLA AU, y por qué son una tuerca MÁS APRETADA:
 *
 *   9. CONTENEDORES        los juicios bajo una clave `_…` también traen `verdict` y un valor
 *                          contado. Los chequeos 2 y 3 saltean toda clave `_` —para eso existe el
 *                          prefijo—, así que hasta la Ola AU **nada miraba adentro**: ~900 juicios
 *                          de cuatro olas sin una sola verificación.
 *   10. FAMILIA DESCONECTADA  lo declarado en `_familiasDesconectadas` no es un patrón registrado
 *                          ni una TRUNCACIÓN de uno. Sin esto la declaración sería el agujero por
 *                          donde entra justo lo que ataja el chequeo 6.
 *
 * LA CONTRADICCIÓN QUE RESUELVEN, que el integrador de la Ola AT dejó escrita y sin resolución:
 * el chequeo 6 exige un patrón REGISTRADO, y los juicios sobre familias CONSTRUIDAS, MEDIDAS Y
 * DESCONECTADAS no pueden cumplirlo nunca. **La salida NO es aflojar el chequeo 6** —no se tocó ni
 * un carácter—: un juicio de familia desconectada **no va a primer nivel** (allí no contaría igual,
 * y ensuciaría la tabla de "muertas" del instrumento como si la ola lo hubiera matado), va a un
 * contenedor `_…`, y el contenedor **ahora se verifica**. El día que la familia aterrice, el juicio
 * sube a primer nivel con el campo ya bien escrito.
 *
 * ── REGLA DE HIGIENE QUE SE LLEVA MEDIA OLA CADA VEZ ────────────────────────────────────────────
 * **TODO `grep` DE ESTE PROYECTO LLEVA `-a`.** 16 archivos de `src/` tienen un byte NUL literal, y
 * `grep` sin `-a` los trata como binarios: devuelve **VACÍO con código de salida 0**, sin avisar.
 * Comprobalo: `grep -c "pattern:" src/server/services/hypotheses/registry.ts` da **0**; con `-a` da
 * las 28 líneas. **Una conclusión apoyada en un grep vacío sobre esos archivos NO VALE.** Está acá
 * porque este archivo lo abre toda ola que escribe veredictos.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HYPOTHESES } from "../../hypotheses/registry.js";
import { desarmarClave } from "./direccion-hipotesis.js";
import { DIRS_VEREDICTOS } from "./olas-bajo-compuerta.js";
import { PATRONES_RETIRADOS } from "./patrones-retirados.js";

/** Los directorios bajo compuerta. Relativos a la raíz del repo del analizador. */
/* CIERRE DE LA OLA AU (guardián). AU1 no dejó puesta esta línea a propósito —con siete frentes
 * escribiendo a la vez, gatear el directorio EN CURSO ponía en rojo a seis frentes por un defecto
 * de forma que sólo el cierre podía arreglar (ver el docstring de arriba, §8-BIS). El guardián migró
 * los cuatro archivos que fallaban (`AU2`, `AU3`, `AU4`, `AU6`: listas de primer nivel, campo
 * `veredicto`, o sin `_sinJuiciosDireccionables`) y agregó la línea DESPUÉS, no antes — el orden que
 * el propio AU1 pidió. `AU1`, `AU5` y `AU7` ya estaban en la forma canónica. */
/** Los directorios bajo compuerta. **LA LISTA YA NO VIVE ACA.**
 *
 * OLA AY · FRENTE AY1 — SE MUDO A `olas-bajo-compuerta.ts` Y NO ES COSMETICA. Esta lista se
 * atraso DOS VECES por la misma razon: el que la tiene que actualizar (el frente que abre la
 * ola) no la ve, porque esta adentro de un test que el no abre. La primera vez costo cuatro
 * olas (Ola AU: de 1.070 juicios el instrumento contaba 72); la segunda, `ola-aw` y `ola-ax`
 * quedaron afuera y con ellas **18 verdaderas de `Extract Class` y 195 juicios de
 * `unused-symbol`** que el instrumento oficial no podia leer
 * (`ola-ax/informes/ATERRIZAJE.md` §9.2). Desde la Ola AY el instrumento oficial
 * (`scripts/v-int-precision-nivel2.mts`) usa LA MISMA lista para decidir a que archivo le
 * ABORTA: dos listas escritas a mano en dos lugares es exactamente como
 * `scratchpad-ax7/censo-patrones.py` quedo ciego a `Proxy` durante toda una ola.
 *
 * **AL ABRIR UNA OLA NUEVA, SU SLUG VA EN `OLAS_BAJO_COMPUERTA` EL DIA 1.** */
const DIRS = DIRS_VEREDICTOS;

/** Los cuatro veredictos que `v-int-precision-nivel2.mts` sabe contar. `dudoso` y
 *  `problema-si-patron-no` NO entran en la precisión pero SÍ se reportan aparte: son
 *  categorías, no basura, y por eso están acá. */
const VERDICTOS = new Set(["verdadero", "falso", "problema-si-patron-no", "dudoso"]);

/** Los nombres COMPLETOS de patrón, derivados del registro de producción, más los RETIRADOS
 *  (Ola AY, guardián — HALLAZGO A de AY7: una vez que un patrón sale de `HYPOTHESES`, esta
 *  compuerta también tiene que seguir aceptando sus claves históricas, o el mismo aborto que
 *  cierra `v-int-precision-nivel2.mts` aparece acá, sobre archivos que no tienen nada que ver
 *  con el retiro). Ver `patrones-retirados.ts`. */
const PATRONES = new Set<string>([...HYPOTHESES.map((h) => h.pattern), ...PATRONES_RETIRADOS.map((p) => p.pattern)]);

/** Un valor "parece un juicio" si es un objeto con alguno de los dos campos de veredicto que este
 *  proyecto usó alguna vez. Reconocer `veredicto` es deliberado: es la única forma de poder DECIR
 *  "renombralo" en vez de dejar el archivo pasar como si no tuviera juicios. */
const pareceJuicio = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  ("verdict" in (v as object) || "veredicto" in (v as object));

const raiz = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");

interface Archivo { dir: string; nombre: string; ruta: string }

const archivos: Archivo[] = [];
for (const dir of DIRS) {
  const abs = path.resolve(raiz, dir);
  if (!existsSync(abs)) continue;
  for (const nombre of readdirSync(abs).filter((f) => f.endsWith(".json")).sort()) {
    archivos.push({ dir, nombre, ruta: path.join(abs, nombre) });
  }
}

/** El mensaje SIEMPRE dice qué corregir y dónde: un frente lo lee a las 3 de la mañana. */
const comoCorregir = (a: Archivo, clave: string, problema: string, arreglo: string): string =>
  `\n\n  ARCHIVO: ${a.dir}/${a.nombre}` +
  `\n  CLAVE:   ${clave}` +
  `\n  PROBLEMA: ${problema}` +
  `\n  CORREGÍ:  ${arreglo}` +
  `\n  El formato canónico está en ola-af/FORMATO-VEREDICTOS.md.` +
  `\n  Lo que este archivo NO cumpla, el instrumento oficial lo ignora EN SILENCIO.\n`;

describe("formato de los archivos de veredictos — lo que `v-int-precision-nivel2.mts` puede leer", () => {
  it("hay al menos un directorio de veredictos bajo compuerta, o se dice que no", () => {
    if (archivos.length === 0) {
      console.log("[formato-veredictos] ningún archivo bajo compuerta todavía (los directorios no existen o están vacíos).");
    }
    expect(Array.isArray(archivos)).toBe(true);
  });

  for (const a of archivos) {
    describe(`${a.dir}/${a.nombre}`, () => {
      const crudo = readFileSync(a.ruta, "utf8");

      it("1. CONTENEDOR — la raíz es un diccionario, no una lista", () => {
        const j: unknown = JSON.parse(crudo);
        expect(
          typeof j === "object" && j !== null && !Array.isArray(j),
          comoCorregir(a, "(raíz)",
            "la raíz del JSON no es un diccionario. El instrumento hace `Object.entries(j)` sobre la raíz: una lista no tiene claves y NINGÚN juicio se lee.",
            "envolvé los juicios en un diccionario de primer nivel, con clave `<id>::<Patrón>` cada uno."),
        ).toBe(true);
      });

      const j = JSON.parse(crudo) as Record<string, unknown>;

      it("2. ANIDAMIENTO — ningún juicio escondido debajo de otra clave", () => {
        for (const [clave, valor] of Object.entries(j)) {
          if (clave.startsWith("_")) continue; // metadatos: el instrumento los descarta y nadie los cuenta
          if (typeof valor !== "object" || valor === null || Array.isArray(valor)) continue;
          if (pareceJuicio(valor)) continue;   // es EL juicio, no un contenedor
          const adentro = Object.values(valor as Record<string, unknown>).filter(pareceJuicio);
          expect(
            adentro.length,
            comoCorregir(a, clave,
              `\`${clave}\` es un CONTENEDOR con ${adentro.length} juicio(s) adentro. El instrumento sólo mira el PRIMER NIVEL: todo lo que está acá abajo se pierde en silencio.`,
              `subí esos ${adentro.length} juicios al primer nivel del archivo (y borrá \`${clave}\`). Si de verdad no son juicios direccionables, renombrá la clave a \`_${clave}\` y declaralos en tu informe.`),
          ).toBe(0);
        }
      });

      it("3. LISTA DE JUICIOS — ninguna lista de juicios, en ningún nivel de primer orden", () => {
        for (const [clave, valor] of Object.entries(j)) {
          if (clave.startsWith("_")) continue;
          if (!Array.isArray(valor)) continue;
          const adentro = valor.filter(pareceJuicio);
          expect(
            adentro.length,
            comoCorregir(a, clave,
              `\`${clave}\` es una LISTA con ${adentro.length} juicio(s). Una lista no tiene claves \`<id>::<Patrón>\`: el instrumento no puede resolver ninguno contra el censo y los descarta enteros.`,
              `convertí la lista en entradas de primer nivel, una por juicio, con clave \`<id>::<Patrón>\`.`),
          ).toBe(0);
        }
      });

      const juicios = Object.entries(j).filter(([k, v]) => !k.startsWith("_") && pareceJuicio(v)) as [string, Record<string, unknown>][];

      it("4. CAMPO — el veredicto se llama `verdict`, nunca `veredicto`", () => {
        for (const [clave, v] of juicios) {
          expect(
            "veredicto" in v && !("verdict" in v),
            comoCorregir(a, clave,
              "el campo del veredicto se llama `veredicto`. El instrumento lee `v.verdict` y sólo eso: este juicio entra con veredicto VACÍO y no cuenta ni como verdadero ni como falso.",
              "renombrá el campo a `verdict`."),
          ).toBe(false);
        }
      });

      it("5. FORMA DE LA CLAVE — `<id>::<Patrón>`, y la izquierda es un id, no una ubicación", () => {
        for (const [clave] of juicios) {
          expect(
            clave.includes("::"),
            comoCorregir(a, clave,
              "la clave no tiene `::`. El instrumento parte por el ÚLTIMO `::` para sacar el patrón y busca la clave entera en el censo: sin `::` no resuelve nunca.",
              "usá `<stableFindingId>::<Patrón>` — el `id` y el `pattern` salen del MISMO volcado de `scripts/dump-hallazgos.mts`."),
          ).toBe(true);

          // AJ2: la ubicación PUEDE estar, pero sólo detrás del `@` y como DIRECCIÓN de la
          // propuesta. Lo que sigue prohibido es que la ubicación esté donde va el id.
          const id = desarmarClave(clave)?.id ?? clave.slice(0, clave.lastIndexOf("::"));
          expect(
            id.includes("|") || /\.(ts|tsx|js|jsx|mjs|cjs|go|java|py|rb|cs|vue|rs|ex|exs)(:\d+)?(\||$)/.test(id),
            comoCorregir(a, clave,
              `la parte izquierda de la clave (\`${id}\`) es una UBICACIÓN (tiene \`|\` o una ruta de archivo), no un \`stableFindingId\`. El censo indexa por \`<id>::<Patrón>\` (o \`<id>@<archivo>:<línea>::<Patrón>\`): una ubicación en el lugar del id no resuelve.`,
              "reemplazá la ubicación por el `id` del hallazgo (`<kind>:<hash>`), que sale del volcado. Si lo que querías era APUNTAR a un lugar dentro de la fila, la forma es `<id>@<archivo>:<línea>::<Patrón>`. NO lo deduzcas a mano: si no podés resolverlo sin ambigüedad, movelo a `_juiciosNoDireccionables` y declaralo."),
          ).toBe(false);
        }
      });

      it("5-BIS. DIRECCIÓN — si la clave trae `@`, lo que sigue es `<archivo>:<línea>` (con `#k` opcional)", () => {
        // QUÉ INTENCIÓN VERIFICA: una dirección mal escrita no resuelve, y el instrumento la
        // descarta EN SILENCIO igual que a una clave mal formada — el defecto que costó 35
        // propuestas en la Ola AE, ahora con una superficie nueva donde repetirse. La dirección
        // sale del campo `at` del volcado; escribirla a mano es legítimo (es `<archivo>:<línea>`,
        // lo mismo que el juez anota en su nota), y por eso conviene que un error se vea acá.
        for (const [clave] of juicios) {
          const d = desarmarClave(clave);
          if (!d || d.direccion === null) continue;
          expect(
            /^[^|]+:\d+(#\d+)?$/.test(d.direccion),
            comoCorregir(a, clave,
              `la dirección \`${d.direccion}\` no tiene la forma \`<archivo>:<línea>\` (con \`#k\` opcional cuando dos propuestas del mismo patrón caen en el MISMO lugar). El censo indexa por esa cadena exacta: cualquier otra cosa no resuelve.`,
              "copiá la dirección del campo `at` del volcado (`scripts/dump-hallazgos.mts`), o escribila como `<archivo relativo al repo>:<línea del primer `place`>`."),
          ).toBe(true);
        }
      });

      it("6. SUFIJO — lo que sigue al último `::` es un patrón REGISTRADO, con su nombre completo", () => {
        for (const [clave] of juicios) {
          if (!clave.includes("::")) continue; // ya falló en el chequeo 5
          const patron = clave.slice(clave.lastIndexOf("::") + 2);
          const casi = [...PATRONES].filter((p) => p.startsWith(patron) || patron.startsWith(p));
          expect(
            PATRONES.has(patron),
            comoCorregir(a, clave,
              `\`${patron}\` no es un patrón registrado (\`hypotheses/registry.ts\`). El censo emite el nombre COMPLETO; cualquier otra cosa no resuelve.` +
              (casi.length > 0 ? ` ¿Quisiste decir ${casi.map((p) => `\`${p}\``).join(" o ")}?` : ""),
              `usá el nombre completo. Los registrados hoy son: ${[...PATRONES].sort().join(" · ")}.`),
          ).toBe(true);
        }
      });

      it("7. VALOR — `verdict` es uno de los cuatro veredictos que el instrumento cuenta", () => {
        for (const [clave, v] of juicios) {
          const val = v["verdict"] ?? v["veredicto"];
          expect(
            typeof val === "string" && VERDICTOS.has(val),
            comoCorregir(a, clave,
              `el veredicto es ${JSON.stringify(val)}, que el instrumento no cuenta en ninguna columna.`,
              `usá uno de: ${[...VERDICTOS].join(" · ")}.`),
          ).toBe(true);
        }
      });

      /** Los juicios que viven DENTRO de un contenedor `_…`. Los chequeos 2 y 3 saltean toda
       *  clave que empieza con `_` —para eso existe el prefijo— y por eso hasta hoy NADA
       *  miraba lo que hay adentro. Son ~900 juicios de cuatro olas. */
      const enContenedores: [string, string, Record<string, unknown>][] = [];
      for (const [clave, valor] of Object.entries(j)) {
        if (!clave.startsWith("_")) continue;
        if (Array.isArray(valor)) {
          valor.forEach((v, i) => { if (pareceJuicio(v)) enContenedores.push([clave, `[${i}]`, v]); });
        } else if (typeof valor === "object" && valor !== null && !pareceJuicio(valor)) {
          for (const [kk, vv] of Object.entries(valor as Record<string, unknown>)) {
            if (pareceJuicio(vv)) enContenedores.push([clave, kk, vv]);
          }
        }
      }

      it("9. CONTENEDORES — los juicios guardados bajo una clave `_…` también traen `verdict` y un valor contado", () => {
        // QUÉ INTENCIÓN VERIFICA, y por qué es ADITIVO y no un relajamiento. Un juicio bajo `_`
        // está fuera del instrumento A PROPÓSITO: o su familia está CONSTRUIDA, MEDIDA Y
        // DESCONECTADA (no tiene fila en el censo y no puede resolver nunca), o es una capa de
        // CALIBRACIÓN que se excluye sola (`AR2`/`AR3`, la vara: 338 re-juicios ciegos de casos
        // que el banco YA tiene juzgados — subirlos pisaría veredictos de 30 olas). Estar fuera
        // del instrumento NO es razón para estar fuera de la compuerta: el día que la familia
        // aterrice, estos juicios pasan a primer nivel de una, y si traen `veredicto` en vez de
        // `verdict` se pierden en silencio — el defecto #4, el que en la Ola AD costó una
        // propuesta verdadera. Este chequeo los cubre HOY, mientras todavía son baratos de
        // arreglar. Los chequeos 5 y 6 NO se aplican acá: una familia desconectada no tiene
        // nombre registrado ni id que resuelva, y exigírselos sería exigir un imposible.
        for (const [contenedor, k, v] of enContenedores) {
          if (contenedor === "_juiciosConVeredictoNoCanonico") continue; // su razón de ser es ésa, y la declara
          expect(
            "veredicto" in v && !("verdict" in v),
            comoCorregir(a, `${contenedor} → ${k}`,
              "el campo del veredicto se llama `veredicto`. Hoy este juicio está bajo `_` y el instrumento no lo mira; el día que su familia aterrice y suba a primer nivel, entrará con veredicto VACÍO y no contará ni como verdadero ni como falso.",
              "renombrá el campo a `verdict`."),
          ).toBe(false);
          const val = v["verdict"] ?? v["veredicto"];
          expect(
            typeof val === "string" && VERDICTOS.has(val),
            comoCorregir(a, `${contenedor} → ${k}`,
              `el veredicto es ${JSON.stringify(val)}, que el instrumento no cuenta en ninguna columna.`,
              `usá uno de: ${[...VERDICTOS].join(" · ")}. Si de verdad no es ninguno de los cuatro, movelo a \`_juiciosConVeredictoNoCanonico\` y declaralo — NO lo traduzcas, traducirlo sería CAMBIAR un veredicto.`),
          ).toBe(true);
        }
      });

      it("10. FAMILIA DESCONECTADA — lo declarado en `_familiasDesconectadas` no es un patrón registrado ni una TRUNCACIÓN de uno", () => {
        // POR QUÉ ES UNA TUERCA MÁS APRETADA Y NO UNA MÁS FLOJA. `_familiasDesconectadas` es la
        // única puerta por la que un nombre que NO está en el registro puede aparecer en un
        // archivo de veredictos. Sin esta aserción esa puerta sería un agujero: alcanzaría con
        // declarar `Proxy` para colar la abreviatura que el chequeo 6 existe para atajar (Ola AE:
        // `::Proxy` donde el patrón se llama `Proxy (inicialización perezosa)`, 32 juicios y 12
        // verdaderas). Se rechaza el nombre REGISTRADO y se rechaza la TRUNCACIÓN de uno; se
        // ACEPTA la EXTENSIÓN (`Remove Flag Argument (variante V2, DESCARTADA)`), que nombra a
        // propósito algo distinto de la familia registrada y no puede confundirse con ella.
        const declaradas = j["_familiasDesconectadas"];
        if (!Array.isArray(declaradas)) return;
        for (const fam of declaradas) {
          expect(
            typeof fam === "string" && !PATRONES.has(fam),
            comoCorregir(a, `_familiasDesconectadas → ${JSON.stringify(fam)}`,
              `\`${String(fam)}\` SÍ es un patrón registrado. Un patrón registrado tiene fila en el censo: sus juicios van a PRIMER NIVEL, donde el instrumento los cuenta.`,
              "sacá el nombre de `_familiasDesconectadas` y subí sus juicios al primer nivel con clave `<id>::<Patrón>`."),
          ).toBe(true);
          const truncaA = [...PATRONES].filter((p) => typeof fam === "string" && p !== fam && p.startsWith(fam));
          expect(
            truncaA.length,
            comoCorregir(a, `_familiasDesconectadas → ${JSON.stringify(fam)}`,
              `\`${String(fam)}\` es el PREFIJO de ${truncaA.map((p) => `\`${p}\``).join(" o ")}. Una truncación declarada como "familia desconectada" es exactamente el defecto que el chequeo 6 ataja, entrando por la puerta de atrás.`,
              `escribí el nombre COMPLETO del patrón y subí sus juicios al primer nivel, o —si de verdad es otra familia— dale un nombre que no sea el prefijo de uno registrado.`),
          ).toBe(0);
        }
      });

      it("8. el archivo aporta al menos un juicio direccionable, o declara por qué no", () => {
        const declaraQueNoTiene = "_sinJuiciosDireccionables" in j || "_juiciosNoDireccionables" in j;
        expect(
          juicios.length > 0 || declaraQueNoTiene,
          comoCorregir(a, "(archivo)",
            "el archivo no tiene NI UN juicio de primer nivel con `<id>::<Patrón>` y `verdict`. Para el instrumento oficial este archivo está vacío.",
            "subí tus juicios al primer nivel, o —si de verdad no juzgaste nivel 2— agregá `_sinJuiciosDireccionables` con la razón, para que el vacío sea deliberado y no un accidente de forma."),
        ).toBe(true);
      });
    });
  }
});
