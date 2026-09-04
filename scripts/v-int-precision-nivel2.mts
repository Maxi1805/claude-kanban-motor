/**
 * OLA V · INTEGRADOR — precisión del NIVEL 2 sobre el corpus, con Wilson 95 % en TODOS los
 * patrones y la cuarta categoría reportada APARTE: `problema-si-patron-no` (el problema que el
 * ancla señala es real, pero el patrón propuesto NO es la respuesta). Nunca se funde con
 * `falso`: un `falso` pide apagar el ancla o endurecer un check; un `problema-si-patron-no` pide
 * proponer OTRO patrón. Son dos arreglos distintos y por eso son dos columnas.
 *
 * Sucesor de `u-int-precision-nivel2.mts`, con dos cambios que la Ola V hace necesarios:
 *
 *  1. **TRES fuentes de veredicto**, no dos: las planillas `*.hypotheses.csv` (que hoy tienen
 *     filas de DOS generaciones — las de M0 con id sintético `u-m0::` y las 33 que la Ola U
 *     persistió con `stableFindingId` REAL), y los JSON de veredictos de los frentes de
 *     medición de esta ola (`ola-v/veredictos/*.json`), más los míos.
 *  2. **La regla de vigencia se aplica con la clave más fuerte disponible para cada fila.**
 *     Una fila con id real se cruza por `id::patrón` (el id es estable ante cambios de línea);
 *     una fila `u-m0::` sólo puede cruzarse por `patrón|repo|archivo|línea`. En los dos casos
 *     se exige, además, que el ESTADO sea el mismo que tenía cuando se la juzgó, cuando ese
 *     estado se conoce: un veredicto de nivel 2 contesta "¿el código sostiene ESTA afirmación?",
 *     y si la afirmación cambió de estado el veredicto quedó VENCIDO.
 *
 *     LIMITACIÓN DECLARADA: los JSON de veredictos (`{"<id>::<patrón>": {verdict, note}}`) no
 *     guardan el estado en que se juzgó la hipótesis, así que para esas filas la vigencia es
 *     SÓLO "sigue viva con ese id y ese patrón". Se cuenta y se reporta cuántas son.
 *
 * OLA AJ · FRENTE AJ2 — LA CLAVE PASA A PODER NOMBRAR DOS PROPUESTAS DEL MISMO PATRÓN EN LA
 * MISMA FILA, Y ES ADITIVO. El defecto, medido: desde la Ola AC una fila agrupada cuelga las
 * hipótesis de TODOS sus miembros (`code-analyzer.ts#hypothesesOfAllMembers`), deduplicadas por
 * `(patrón, estado, LUGARES)`, así que N propuestas del mismo patrón en N lugares distintos del
 * código comparten UNA clave `<id>::<patrón>` — y `vivoPorId.set` se queda con UNA. El caso
 * testigo: `click · long-function:_c7REnnTm-LveJA_ · Extract Method` son **14** propuestas
 * sobre 14 funciones de `src/click/core.py`; 13 no se pueden nombrar, ni juzgar, ni contar.
 *
 * Los DOS cambios, y ninguno mueve un solo veredicto existente:
 *
 *   1. `vivoPorId` registra, ADEMÁS de la clave vieja, la clave DIRIGIDA
 *      `<id>@<dirección>::<patrón>` de cada fila del censo (`Row.dir`, que escribe
 *      `w-int-censo-nivel2.mts` desde el `at` del volcado). La clave vieja se registra
 *      EXACTAMENTE como antes —incluido "gana la última", que es lo que decidía hasta hoy a qué
 *      fila resuelve—, así que todo veredicto de las diez olas resuelve contra la MISMA fila
 *      que resolvía ayer.
 *   2. El `clave` con el que se DEDUPLICA pasa a ser el CANÓNICO (el dirigido de la fila que
 *      resolvió), en vez del literal escrito en el archivo. Sin esto, un veredicto viejo
 *      `<id>::<P>` y uno nuevo `<id>@<dir>::<P>` sobre LA MISMA propuesta se contarían dos
 *      veces. La rama CSV ya canonizaba así (`clave: `${vivo.id}::${pattern}``): esto es la
 *      misma idea, con la clave que ahora sí distingue.
 *
 * Verificado antes de aterrizar: con los archivos de veredicto de hoy —que no tienen ni una
 * clave dirigida salvo las del propio AJ2— la salida de este script es IDÉNTICA línea por línea
 * a la de la versión anterior. Ver `ola-aj/informes/AJ2.md`.
 *
 * Uso: npx tsx scripts/v-int-precision-nivel2.mts <dir-censo-json> <veredictos.json>[,<mas.json>...]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { desarmarClave } from "../src/server/services/detect/precision/direccion-hipotesis.js";
import { estaBajoCompuerta } from "../src/server/services/detect/precision/olas-bajo-compuerta.js";
import { PATRONES_RETIRADOS } from "../src/server/services/detect/precision/patrones-retirados.js";
import { parseCsv } from "../src/server/services/detect/precision/csv.js";
import { wilsonInterval } from "../src/server/services/graph/gate/wilson.js";
import { HYPOTHESES } from "../src/server/services/hypotheses/registry.js";

const CORPUS = new Set([
  "click", "cobra", "eslint", "guava", "hugo", "jekyll", "lodash",
  "nest", "newtonsoft-json", "preact", "rubocop", "sqlalchemy", "vueuse",
]);
const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");

interface Row {
  id: string; repo: string; kind: string; pattern: string; state: string;
  lang: string; file: string; line: number; confidence: string | null;
  /** AJ2: la dirección de la propuesta dentro de su fila. Ausente en censos anteriores al frente. */
  dir?: string;
}
/** La clave CANÓNICA de una fila del censo: la dirigida cuando el censo trae dirección, la vieja cuando no. */
const claveCanonica = (r: Row): string => (r.dir ? `${r.id}@${r.dir}::${r.pattern}` : `${r.id}::${r.pattern}`);
interface Veredicto { pattern: string; verdict: string; fuente: string; clave: string; estado: string }

const [, , censoDir, veredictosArg] = process.argv;
if (!censoDir) {
  console.error("Uso: npx tsx scripts/v-int-precision-nivel2.mts <dir-censo-json> [<veredictos.json>,...]");
  process.exit(1);
}

/* ── 1. La población VIVA, de los censos por repo ─────────────────────────── */
const rows: Row[] = [];
for (const f of readdirSync(censoDir).filter((f) => f.endsWith(".json"))) {
  const j = JSON.parse(readFileSync(path.join(censoDir, f), "utf8")) as { rows: Row[] };
  rows.push(...j.rows);
}
/** id::patrón → estado (la clave FUERTE) */
const vivoPorId = new Map<string, Row>();
/** patrón|repo|archivo|línea → estado (la clave DÉBIL, la única que tienen las filas `u-m0::`) */
const vivoPorUbicacion = new Map<string, Row>();
for (const r of rows) {
  // La clave VIEJA, tal cual estaba —incluido "gana la última", que es lo que hasta hoy decidía
  // a qué fila resuelve un veredicto ambiguo. Cambiar ese criterio movería el ESTADO con el que
  // se cuenta un veredicto viejo y podría sacar una VERDADERA de la columna de recomendaciones.
  vivoPorId.set(`${r.id}::${r.pattern}`, r);
  // AJ2: la clave DIRIGIDA. Sólo AGREGA: nunca pisa una vieja (lleva `@`, que un id no puede tener).
  if (r.dir) vivoPorId.set(claveCanonica(r), r);
  vivoPorUbicacion.set(`${r.pattern}|${r.repo}|${r.file}|${r.line}`, r);
}

/* ── 2. Los veredictos, de las tres fuentes, con la regla de vigencia ─────── */
const veredictos: Veredicto[] = [];
let csvTotal = 0, csvVencidos = 0, csvVencidosPorEstado = 0;
let jsonTotal = 0, jsonVencidos = 0;
const vencidosDetalle: string[] = [];
/** Veredictos que ya no aplican porque la hipótesis DEJÓ DE EMITIRSE en esta ola.
 *  Es la medida directa de qué mató la ola: si lo que desapareció era mayoritariamente
 *  `falso`, la ola quitó ruido; si arrastró `verdadero`, quitó producto. */
const muertas: { pattern: string; verdict: string }[] = [];

for (const file of readdirSync(PRECISION_DIR).filter((f) => f.endsWith(".hypotheses.csv"))) {
  const slug = file.slice(0, file.indexOf("."));
  if (!CORPUS.has(slug)) continue;
  const { header, records } = parseCsv(readFileSync(path.join(PRECISION_DIR, file), "utf8"));
  if (header.length === 0) continue;
  const col = (name: string): number => header.indexOf(name);
  for (const row of records) {
    const id = row[col("id")] ?? "";
    const pattern = row[col("pattern")] ?? "";
    const state = row[col("state")] ?? "";
    const verdict = row[col("verdict")] ?? "";
    if (!verdict) continue;
    csvTotal++;
    // La columna `id` viene en DOS formatos según la generación de la fila:
    //  · M0: `u-m0::<patrón>::<slug>::<archivo>:<línea>` — id SINTÉTICO, no cruzable;
    //    la única clave posible es la ubicación.
    //  · Ola U en adelante: `<stableFindingId>::<patrón>` — la clave FUERTE, y ya trae
    //    el `::<patrón>` pegado (no hay que volver a concatenarlo: hacerlo produce
    //    `…::Patrón::Patrón` y da "muerta" para TODA fila con id real — encontrado
    //    midiendo, no revisando: Chain of Responsibility perdía 3 de sus 5 veredictos).
    const claveFuerte = id.endsWith(`::${pattern}`) ? id : `${id}::${pattern}`;
    const vivo = id.startsWith("u-m0::")
      ? vivoPorUbicacion.get(`${pattern}|${slug}|${row[col("file")]}|${Number(row[col("startLine")])}`)
      : vivoPorId.get(claveFuerte);
    if (!vivo) { csvVencidos++; muertas.push({ pattern, verdict }); vencidosDetalle.push(`${slug} ${pattern} ${row[col("file")]}:${row[col("startLine")]} — muerta (${verdict})`); continue; }
    if (vivo.state !== state) { csvVencidos++; csvVencidosPorEstado++; vencidosDetalle.push(`${slug} ${pattern} ${row[col("file")]}:${row[col("startLine")]} — ${state}→${vivo.state} (${verdict})`); continue; }
    veredictos.push({ pattern, verdict, fuente: `csv:${slug}`, clave: claveCanonica(vivo), estado: vivo.state });
  }
}

/* ── 2-BIS. LA COMPUERTA DE FORMA DEL PROPIO INSTRUMENTO — Ola AY, frente AY1 ──
 *
 * EL DEFECTO QUE CIERRA, reproducido en vivo antes de tocar una línea. Hasta hoy este bloque
 * hacía `clave.slice(clave.lastIndexOf("::") + 2)` SIN comprobar que la clave tuviera `::`:
 * cuando no lo tiene, `lastIndexOf` da `-1`, `slice(1)` **se come el primer carácter** y el
 * resultado se usa como si fuera un nombre de patrón. Por eso la corrida del 01-09-2026 sobre
 * los 162 archivos de veredictos imprimía, en el bloque «QUÉ MATÓ LA OLA», patrones llamados
 * `uicios` (por `juicios`), `ype-switch`, `amilia`, `vetaCerrada` y otros 40. Sobre 4.427 claves
 * de primer nivel, **1.206 no tenían `::`** — 602 metadatos y 604 claves de veredictos viejos.
 *
 * Y el defecto de fondo es peor que el síntoma: **el instrumento procesaba mal y seguía**. Un
 * archivo escrito fuera de formato —una LISTA de juicios, un CONTENEDOR anidado, el campo
 * `veredicto` en vez de `verdict`— entraba sin una queja y sus juicios simplemente no existían.
 * Eso costó, medido y escrito en `ola-ax/informes/ATERRIZAJE.md` §9.2, **18 verdaderas de
 * `Extract Class` y 195 juicios de `unused-symbol`**.
 *
 * LA REGLA, y es la que impide que vuelva a pasar: **lo que el instrumento no entiende, lo
 * RECHAZA RUIDOSAMENTE, con el nombre del archivo y la clave ofensora.** Y el rechazo tiene dos
 * grados, con un criterio explícito:
 *
 *   · **FATAL (aborta con código 2)** cuando un JUICIO se perdería o se leería mal: raíz que no
 *     es diccionario · LISTA con juicios adentro · CONTENEDOR con juicios adentro · campo
 *     `veredicto` · clave de juicio sin `::` · patrón que no existe · veredicto que no se cuenta.
 *     **Sólo para las olas BAJO COMPUERTA** (`olas-bajo-compuerta.ts`), que son las que tienen
 *     obligación de formato y a las que su frente todavía puede arreglar.
 *   · **AVISO (se nombra, se cuenta y no se procesa)** cuando NO se pierde ningún juicio: una
 *     clave de primer nivel de METADATOS sin el prefijo `_`. Y todo lo demás en las olas
 *     anteriores a la AE, que están fuera de la compuerta a propósito: sus archivos ya están
 *     contados en la serie publicada y re-formatearlos movería veredictos históricos.
 *
 * EL DEFECTO HERMANO, que también se cierra acá: `scratchpad-ax7/censo-patrones.py` quedó
 * **ciego a `Proxy`** porque tenía la lista de patrones escrita a mano y buscaba `"Proxy"`
 * mientras el volcado escribe `"Proxy (inicialización perezosa)"` — 137 propuestas invisibles.
 * Acá la lista de patrones aceptados **se DERIVA**: del censo que se está midiendo, más el
 * registro de producción. Ni un nombre escrito a mano. Y una clave con un patrón que no está en
 * esa lista ya no se cuenta como «una propuesta de `Proxy` que la ola mató»: se rechaza por su
 * nombre, que es lo que hace visible la truncación en vez de disfrazarla de pérdida.
 *
 * OLA AY · GUARDIÁN DE CIERRE — HALLAZGO A de AY7. Censo y registro de producción dejan de bastar
 * el día que un patrón se RETIRA (V = 0, autorizado por el encargo): sale de los dos a la vez, y
 * toda clave histórica sobre él pasa a ser "un patrón que no existe" → FATAL, incluso en olas bajo
 * compuerta que no tienen nada que ver con el retiro. `patrones-retirados.ts` es la tercera fuente,
 * con la misma disciplina de no escribirse a mano dos veces: una entrada, un lugar, importada acá.
 */

/** Los cuatro veredictos que este instrumento sabe contar. Los mismos que `formato-veredictos.test.ts`. */
const VERDICTOS_CONTADOS = new Set(["verdadero", "falso", "problema-si-patron-no", "dudoso"]);
/** Los nombres de patrón aceptables, DERIVADOS (nunca escritos a mano): los que emite el censo
 *  que se está midiendo, más los del registro de producción —para que un patrón registrado con
 *  población 0 en este volcado no se lea como un nombre inventado. */
const PATRONES_ACEPTADOS = new Set<string>([
  ...rows.map((r) => r.pattern),
  ...HYPOTHESES.map((h) => h.pattern),
  ...PATRONES_RETIRADOS.map((p) => p.pattern),
]);
/** Un valor «parece un juicio» si trae alguno de los dos campos de veredicto que este proyecto
 *  usó alguna vez. Reconocer `veredicto` es deliberado: es la única forma de poder DECIR
 *  «renombralo» en vez de dejar el archivo pasar como si no tuviera juicios. */
const pareceJuicio = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  ("verdict" in (v as object) || "veredicto" in (v as object));

interface Ofensa { archivo: string; clave: string; problema: string; arreglo: string }
const ofensasFatales: Ofensa[] = [];
const avisos: Ofensa[] = [];

for (const jf of (veredictosArg ?? "").split(",").filter(Boolean)) {
  const bajoCompuerta = estaBajoCompuerta(jf);
  const nombre = jf.split(/[\\/]/).slice(-3).join("/");
  const anotar = (clave: string, problema: string, arreglo: string, pierdeJuicios: boolean): void => {
    (pierdeJuicios && bajoCompuerta ? ofensasFatales : avisos).push({ archivo: nombre, clave, problema, arreglo });
  };
  const crudo: unknown = JSON.parse(readFileSync(jf, "utf8"));
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    anotar("(raíz)", "la raíz del JSON no es un diccionario; el instrumento hace `Object.entries` sobre ella y NINGÚN juicio se lee.",
      "envolvé los juicios en un diccionario de primer nivel, con clave `<id>::<Patrón>` cada uno.", true);
    continue;
  }
  for (const [clave, valor] of Object.entries(crudo as Record<string, unknown>)) {
    // Las claves `_…` están fuera del instrumento A PROPÓSITO (metadatos, familias
    // desconectadas, capas de calibración). `formato-veredictos.test.ts` §9 las verifica.
    if (clave.startsWith("_")) continue;
    if (Array.isArray(valor)) {
      const n = valor.filter(pareceJuicio).length;
      if (n > 0) {
        anotar(clave, `es una LISTA con ${String(n)} juicio(s) adentro. Una lista no tiene claves \`<id>::<Patrón>\`: el instrumento no puede resolver ninguno contra el censo.`,
          `convertí la lista en entradas de PRIMER NIVEL, una por juicio, con clave \`<id>::<Patrón>\` (el \`id\` y el \`pattern\` salen del MISMO volcado).`, true);
      } else {
        anotar(clave, "es una lista de METADATOS en primer nivel, sin prefijo `_`. No se pierde ningún juicio, pero el instrumento tiene que adivinar que no lo es.",
          `renombrá la clave a \`_${clave}\`.`, false);
      }
      continue;
    }
    if (!pareceJuicio(valor)) {
      const adentro = typeof valor === "object" && valor !== null
        ? Object.values(valor as Record<string, unknown>).filter(pareceJuicio).length : 0;
      if (adentro > 0) {
        anotar(clave, `es un CONTENEDOR con ${String(adentro)} juicio(s) adentro. El instrumento sólo mira el PRIMER NIVEL: todo lo que cuelga de acá se pierde.`,
          `subí esos ${String(adentro)} juicios al primer nivel. Si de verdad no son direccionables, renombrá la clave a \`_${clave}\` y declaralo en tu informe.`, true);
      } else {
        anotar(clave, "es una clave de METADATOS en primer nivel, sin prefijo `_`.",
          `renombrá la clave a \`_${clave}\`.`, false);
      }
      continue;
    }
    if (!("verdict" in valor)) {
      anotar(clave, "el campo del veredicto se llama `veredicto`. El instrumento lee `v.verdict` y sólo eso: este juicio entraría con veredicto VACÍO y no contaría en ninguna columna.",
        "renombrá el campo a `verdict`.", true);
      continue;
    }
    const d = desarmarClave(clave);
    if (d === null) {
      anotar(clave, "la clave de un juicio no tiene `::`, así que no nombra ningún patrón ni resuelve contra el censo.",
        "usá `<stableFindingId>::<Patrón>` (o `<id>@<archivo>:<línea>::<Patrón>`).", true);
      continue;
    }
    if (!PATRONES_ACEPTADOS.has(d.pattern)) {
      const casi = [...PATRONES_ACEPTADOS].filter((p) => p.startsWith(d.pattern) || d.pattern.startsWith(p)).sort();
      anotar(clave, `\`${d.pattern}\` no es un patrón que el censo emita ni que el registro declare.` +
        (casi.length > 0 ? ` ¿Quisiste decir ${casi.map((p) => `\`${p}\``).join(" o ")}?` : ""),
        "usá el nombre COMPLETO del patrón, copiado del volcado.", true);
      continue;
    }
    const val = valor["verdict"];
    if (typeof val !== "string" || !VERDICTOS_CONTADOS.has(val)) {
      anotar(clave, `el veredicto es ${JSON.stringify(val)}, que el instrumento no cuenta en ninguna columna.`,
        `usá uno de: ${[...VERDICTOS_CONTADOS].join(" · ")}.`, true);
      continue;
    }
    jsonTotal++;
    const vivo = vivoPorId.get(clave);
    if (!vivo) { jsonVencidos++; muertas.push({ pattern: d.pattern, verdict: val }); continue; }
    veredictos.push({ pattern: d.pattern, verdict: val, fuente: path.basename(jf), clave: claveCanonica(vivo), estado: vivo.state });
  }
}

if (ofensasFatales.length > 0) {
  console.error(`\nARCHIVOS DE VEREDICTOS FUERA DE FORMATO — ${String(ofensasFatales.length)} ofensa(s) que HACEN PERDER JUICIOS, en olas BAJO COMPUERTA.`);
  console.error("El instrumento NO mide con esto adentro: un número que sale igual con juicios perdidos es peor que no medir.\n");
  for (const o of ofensasFatales) {
    console.error(`  ARCHIVO:  ${o.archivo}`);
    console.error(`  CLAVE:    ${o.clave}`);
    console.error(`  PROBLEMA: ${o.problema}`);
    console.error(`  CORREGÍ:  ${o.arreglo}\n`);
  }
  console.error("El formato canónico está en `ola-af/FORMATO-VEREDICTOS.md` y lo hace cumplir");
  console.error("`src/server/services/detect/precision/formato-veredictos.test.ts`.");
  process.exit(2);
}

/* Un mismo `id::patrón` puede tener veredicto en dos fuentes: se cuenta UNA vez (la primera). */
const vistos = new Set<string>();
const unicos = veredictos.filter((v) => (vistos.has(v.clave) ? false : (vistos.add(v.clave), true)));
const duplicados = veredictos.length - unicos.length;

/* ── 3. La tabla ──────────────────────────────────────────────────────────── */
const poblacion = new Map<string, { total: number; reales: number }>();
for (const r of rows) {
  const p = poblacion.get(r.pattern) ?? { total: 0, reales: 0 };
  p.total++;
  if (r.state === "ausente" || r.state === "parcial") p.reales++;
  poblacion.set(r.pattern, p);
}

const patrones = [...new Set([...poblacion.keys(), ...unicos.map((v) => v.pattern)])].sort();
const pct = (k: number, n: number): string => (n === 0 ? "—" : `${Math.round((k / n) * 100)} %`);
const wil = (k: number, n: number): string => {
  if (n === 0) return "—";
  const w = wilsonInterval(k, n);
  return `[${Math.round(w.lower * 100)} %, ${Math.round(w.upper * 100)} %]`;
};

/* La SEGUNDA columna de precisión, la que la Ola U no tenía y que este cierre agrega:
 * la precisión restringida a las RECOMENDACIONES REALES (`ausente`+`parcial`).
 * Por qué importa: la precisión global mezcla afirmaciones de dos naturalezas distintas
 * — "acá falta este patrón" (lo que el usuario recibe y puede accionar) y "acá el patrón
 * YA está / está eludido" (información, no recomendación). Un patrón como Facade tiene 65
 * hipótesis y 3 recomendaciones reales: su precisión global la deciden 62 afirmaciones que
 * nadie va a accionar. El entregable del nivel 2 son las recomendaciones reales, así que
 * su precisión merece columna propia. */
const esReal = (v: Veredicto): boolean => v.estado === "ausente" || v.estado === "parcial";

console.log("| Patrón | población | reales | n (V+F) | V | F | precisión | Wilson 95 % | n_rec | **precisión RECS** | Wilson recs | psp | dudoso |");
console.log("|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---:|");
let tV = 0, tF = 0, tP = 0, tD = 0, tPob = 0, tReales = 0, tVr = 0, tFr = 0;
for (const p of patrones) {
  const vs = unicos.filter((v) => v.pattern === p);
  const V = vs.filter((v) => v.verdict === "verdadero").length;
  const F = vs.filter((v) => v.verdict === "falso").length;
  const P = vs.filter((v) => v.verdict === "problema-si-patron-no").length;
  const D = vs.filter((v) => v.verdict === "dudoso").length;
  const Vr = vs.filter((v) => esReal(v) && v.verdict === "verdadero").length;
  const Fr = vs.filter((v) => esReal(v) && v.verdict === "falso").length;
  const pob = poblacion.get(p) ?? { total: 0, reales: 0 };
  tV += V; tF += F; tP += P; tD += D; tPob += pob.total; tReales += pob.reales; tVr += Vr; tFr += Fr;
  console.log(`| ${p} | ${pob.total} | ${pob.reales} | ${V + F} | ${V} | ${F} | ${pct(V, V + F)} | ${wil(V, V + F)} | ${Vr + Fr} | ${pct(Vr, Vr + Fr)} | ${wil(Vr, Vr + Fr)} | ${P} | ${D} |`);
}
console.log(`| **GLOBAL** | **${tPob}** | **${tReales}** | **${tV + tF}** | **${tV}** | **${tF}** | **${pct(tV, tV + tF)}** | **${wil(tV, tV + tF)}** | **${tVr + tFr}** | **${pct(tVr, tVr + tFr)}** | **${wil(tVr, tVr + tFr)}** | **${tP}** | **${tD}** |`);

console.log("");
console.log(`FUENTES: csv ${csvTotal} filas → ${csvTotal - csvVencidos} vigentes / ${csvVencidos} vencidas (${csvVencidosPorEstado} por CAMBIO DE ESTADO, el resto porque la hipótesis murió)`);
console.log(`         json ${jsonTotal} filas → ${jsonTotal - jsonVencidos} vigentes / ${jsonVencidos} vencidas (regla más débil: sólo "sigue viva con ese id y ese patrón")`);
console.log(`         ${duplicados} veredicto(s) duplicado(s) entre fuentes, contados una sola vez`);
if (avisos.length > 0) {
  const porArchivo = new Map<string, number>();
  for (const a of avisos) porArchivo.set(a.archivo, (porArchivo.get(a.archivo) ?? 0) + 1);
  console.log(`RECHAZADOS SIN PROCESAR: ${String(avisos.length)} clave(s) de primer nivel en ${String(porArchivo.size)} archivo(s) — ninguna pierde un juicio (metadatos sin prefijo \`_\`, u olas anteriores a la AE, que están fuera de la compuerta a propósito).`);
  if (process.env["CK_RECHAZADOS"] === "1") for (const a of avisos) console.log(`   ${a.archivo} → ${a.clave}: ${a.problema}`);
  else console.log(`   (CK_RECHAZADOS=1 para verlas una por una)`);
}
console.log(`POBLACIÓN VIVA: ${rows.length} hipótesis · ${tReales} recomendaciones reales`);
const sinBase = patrones.filter((p) => (poblacion.get(p)?.total ?? 0) > 0 && unicos.filter((v) => v.pattern === p && (v.verdict === "verdadero" || v.verdict === "falso")).length === 0);
console.log(`PATRONES CON POBLACIÓN Y SIN BASE (n=0): ${sinBase.length === 0 ? "ninguno" : sinBase.join(", ")}`);
console.log("");
const mV = muertas.filter((m) => m.verdict === "verdadero").length;
const mF = muertas.filter((m) => m.verdict === "falso").length;
const mP = muertas.filter((m) => m.verdict === "problema-si-patron-no").length;
const mD = muertas.filter((m) => m.verdict === "dudoso").length;
console.log(`QUÉ MATÓ LA OLA — de los ${muertas.length} veredictos cuya hipótesis DEJÓ DE EMITIRSE: ${mV} verdadero(s) · ${mF} falso(s) · ${mP} problema-si-patrón-no · ${mD} dudoso(s)`);
const porPat = new Map<string, { V: number; F: number; P: number; D: number }>();
for (const m of muertas) {
  const e = porPat.get(m.pattern) ?? { V: 0, F: 0, P: 0, D: 0 };
  if (m.verdict === "verdadero") e.V++; else if (m.verdict === "falso") e.F++; else if (m.verdict === "problema-si-patron-no") e.P++; else e.D++;
  porPat.set(m.pattern, e);
}
for (const [p, e] of [...porPat].sort()) console.log(`   ${p}: V=${e.V} F=${e.F} psp=${e.P} dud=${e.D}`);
if (process.env.CK_VENCIDOS === "1") { console.log("\nVENCIDOS:"); for (const d of vencidosDetalle) console.log("  " + d); }
