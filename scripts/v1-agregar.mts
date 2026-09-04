/**
 * V1 (Ola V) — agrega los A/B por repo de `scripts/v1-ab.mts` en las tablas
 * del informe.
 *
 * QUÉ CONTESTA, y por qué estas columnas y no el volumen total:
 *   - NIVEL 2 por patrón × estado, con la columna que el CONTEXTO de la ola
 *     declara como el entregable real: `recomendaciones reales` =
 *     `ausente` + `parcial`. Un patrón que sube volumen a costa de más
 *     `ya-aplicado` no mejoró nada.
 *   - Lo mismo por LENGUAJE (derivado de la extensión del archivo primario
 *     del hallazgo-ancla).
 *   - "checks SIN GRAFO": cuántos checks publicados decían, con todas las
 *     letras, que no pudieron evaluarse por falta de grafo. Es la medida
 *     directa de lo que esta pasada arregla, y se mueve aunque el `state` no.
 *   - NIVEL 1 por kind: tiene que ser IDÉNTICO. Colgar una hipótesis no
 *     puede crear ni borrar un hallazgo.
 *
 * Uso: npx tsx scripts/v1-agregar.mts /tmp/v1/ab-*.json
 */
import { readFileSync } from "node:fs";

const EXT_LANG: Record<string, string> = {
  ".py": "python", ".go": "go", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".java": "java",
  ".rb": "ruby", ".cs": "csharp", ".vue": "vue",
};

interface Fila {
  id: string; kind: string; pattern: string; state: string; where: string;
  confidence?: string | null; sinGrafo?: number; confirmados?: number;
}
interface Lado { filas: Fila[]; porKind: Record<string, number>; total: number; ms: number }
interface AB { dir: string; sin: Lado; con: Lado }

const langOf = (file: string): string => EXT_LANG[file.slice(file.lastIndexOf(".")).toLowerCase()] ?? "otro";
const ESTADOS = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"] as const;
const esReal = (f: Fila): boolean => f.state === "ausente" || f.state === "parcial";

const archivos = process.argv.slice(2);
if (archivos.length === 0) { console.error("uso: v1-agregar.mts <ab-*.json>"); process.exit(1); }

const todos: { repo: string; ab: AB }[] = archivos.map((p) => ({
  repo: p.replace(/.*ab-/, "").replace(/\.json$/, ""),
  ab: JSON.parse(readFileSync(p, "utf8")) as AB,
}));

/* ── nivel 1: tiene que ser idéntico ─────────────────────────────────────── */
console.log("=== NIVEL 1 — el control de que colgar hipótesis no crea ni borra hallazgos ===");
let n1sin = 0, n1con = 0, celdasMovidas = 0;
for (const { repo, ab } of todos) {
  n1sin += ab.sin.total; n1con += ab.con.total;
  const kinds = new Set([...Object.keys(ab.sin.porKind), ...Object.keys(ab.con.porKind)]);
  for (const k of kinds) {
    const a = ab.sin.porKind[k] ?? 0, b = ab.con.porKind[k] ?? 0;
    if (a !== b) { celdasMovidas++; console.log(`  ${b > a ? "SUBE" : "baja"} ${repo} (${k}): ${a} → ${b}`); }
  }
}
console.log(`  total ${n1sin} → ${n1con} · celdas (repo,kind) movidas: ${celdasMovidas}`);

/* ── nivel 2 ─────────────────────────────────────────────────────────────── */
interface Cuenta { sin: Record<string, number>; con: Record<string, number> }
const porPatron = new Map<string, Cuenta>();
const porPatronLang = new Map<string, Map<string, Cuenta>>();
const vacio = (): Cuenta => ({ sin: {}, con: {} });

let sgSin = 0, sgCon = 0, ckSin = 0, ckCon = 0;
const claves = (f: Fila) => `${f.id}|${f.pattern}`;
let nuevas = 0, retiradas = 0, cambioEstado = 0, cambioConfianza = 0, dejanSinGrafo = 0;
const detalleNuevas: string[] = [], detalleRetiradas: string[] = [], detalleCambio: string[] = [];

for (const { repo, ab } of todos) {
  for (const [lado, filas] of [["sin", ab.sin.filas], ["con", ab.con.filas]] as const) {
    for (const f of filas) {
      const c = porPatron.get(f.pattern) ?? vacio();
      c[lado][f.state] = (c[lado][f.state] ?? 0) + 1;
      porPatron.set(f.pattern, c);
      const lang = langOf(f.where.split(":")[0] ?? "");
      const pl = porPatronLang.get(f.pattern) ?? new Map<string, Cuenta>();
      const cl = pl.get(lang) ?? vacio();
      cl[lado][f.state] = (cl[lado][f.state] ?? 0) + 1;
      pl.set(lang, cl); porPatronLang.set(f.pattern, pl);
      if (lado === "sin") { sgSin += f.sinGrafo ?? 0; ckSin += f.confirmados ?? 0; }
      else { sgCon += f.sinGrafo ?? 0; ckCon += f.confirmados ?? 0; }
    }
  }
  const mSin = new Map(ab.sin.filas.map((f) => [claves(f), f] as const));
  const mCon = new Map(ab.con.filas.map((f) => [claves(f), f] as const));
  for (const [k, f] of mCon) {
    const prev = mSin.get(k);
    if (!prev) { nuevas++; detalleNuevas.push(`${repo} ${f.pattern} [${f.state}] ${f.kind} @ ${f.where}`); continue; }
    if (prev.state !== f.state) { cambioEstado++; detalleCambio.push(`${repo} ${f.pattern} ${prev.state} → ${f.state} · ${f.kind} @ ${f.where}`); }
    if ((prev.confidence ?? null) !== (f.confidence ?? null)) cambioConfianza++;
    if ((prev.sinGrafo ?? 0) > 0 && (f.sinGrafo ?? 0) === 0) dejanSinGrafo++;
  }
  for (const [k, f] of mSin) if (!mCon.has(k)) { retiradas++; detalleRetiradas.push(`${repo} ${f.pattern} [${f.state}] ${f.kind} @ ${f.where}`); }
}

const tot = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const real = (r: Record<string, number>) => (r["ausente"] ?? 0) + (r["parcial"] ?? 0);

console.log(`\n=== NIVEL 2 — por patrón (SIN pasada → CON pasada) ===`);
console.log(`patrón | tot sin | REALES sin | tot con | REALES con | Δ REALES | estados con (au/par/ya/elu)`);
let tS = 0, rS = 0, tC = 0, rC = 0;
for (const p of [...porPatron.keys()].sort()) {
  const c = porPatron.get(p)!;
  tS += tot(c.sin); rS += real(c.sin); tC += tot(c.con); rC += real(c.con);
  const d = real(c.con) - real(c.sin);
  console.log(`${p} | ${tot(c.sin)} | ${real(c.sin)} | ${tot(c.con)} | ${real(c.con)} | ${d >= 0 ? "+" : ""}${d} | ${ESTADOS.map((s) => c.con[s] ?? 0).join("/")}`);
}
console.log(`TOTAL | ${tS} | ${rS} | ${tC} | ${rC} | ${rC - rS >= 0 ? "+" : ""}${rC - rS}`);

console.log(`\n=== NIVEL 2 — por patrón × lenguaje (REALES, total entre paréntesis) — sólo donde algo se mueve ===`);
for (const p of [...porPatronLang.keys()].sort()) {
  const partes: string[] = [];
  for (const [lang, c] of [...porPatronLang.get(p)!.entries()].sort()) {
    const mueve = tot(c.sin) !== tot(c.con) || real(c.sin) !== real(c.con);
    partes.push(`${lang} ${real(c.sin)}(${tot(c.sin)})→${real(c.con)}(${tot(c.con)})${mueve ? " ***" : ""}`);
  }
  console.log(`${p}: ${partes.join(" · ")}`);
}

console.log(`\n=== LO QUE LA PASADA MUEVE ===`);
console.log(`hipótesis nuevas: ${nuevas} · retiradas: ${retiradas} · cambian de estado: ${cambioEstado} · cambian de confianza: ${cambioConfianza}`);
console.log(`checks publicados que decían "sin grafo": ${sgSin} → ${sgCon} · hipótesis que dejan de publicar alguno: ${dejanSinGrafo}`);
console.log(`checks confirmados (los tres roles): ${ckSin} → ${ckCon}`);
for (const d of detalleNuevas) console.log(`  NUEVA    ${d}`);
for (const d of detalleRetiradas) console.log(`  RETIRADA ${d}`);
for (const d of detalleCambio) console.log(`  CAMBIA   ${d}`);

console.log(`\n=== COSTO (ms de analyzeRepo, mismo proceso) ===`);
let msSin = 0, msCon = 0;
for (const { repo, ab } of todos) {
  msSin += ab.sin.ms; msCon += ab.con.ms;
  console.log(`  ${repo}: ${ab.sin.ms} → ${ab.con.ms} (${(((ab.con.ms - ab.sin.ms) / ab.sin.ms) * 100).toFixed(0)} %)`);
}
console.log(`  TOTAL: ${msSin} → ${msCon} (${(((msCon - msSin) / msSin) * 100).toFixed(0)} %)`);
