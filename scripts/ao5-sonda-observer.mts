/**
 * AO5 — SONDA DE SÓLO LECTURA de Observer. No toca producción.
 *
 * Corre el DETECTOR REAL (`hard-wired-notification`) sobre los árboles vivos de
 * un repo, con los dos umbrales movidos, para CONTAR el embudo:
 *   (T=3, L=2) → lo que el ancla emite HOY
 *   (T=3, L=1) → miembros con la fuerza que mueren en la condición (4), ESCALA
 *   (T=2, L=2) / (T=2, L=1) → los pares fijos, para tener la cota superior
 * Y corre `manual-notification` real, para verificar su cero.
 *
 * Los umbrales SÓLO se mueven DENTRO de la sonda: producción no cambia.
 *
 * Uso: npx tsx scripts/ao5-sonda-observer.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector as hardWired } from "../src/server/services/detect/intra-file/hard-wired-notification.js";
import { detector as manualNotification } from "../src/server/services/detect/intra-file/manual-notification.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { RawFinding, RunContext } from "../src/server/services/detect/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ao5-sonda-observer.mts <dir> <salida.json>");
  process.exit(1);
}

function ctxCon(language: string, interesados: number, lugares: number): RunContext<"interesados" | "lugares"> {
  const mk = (v: number) => resolveThreshold(pisoDeclarado(v, { rationale: "sonda AO5, sólo lectura" }), { language, sampleSize: () => 0, corpusP95: () => null });
  return {
    language,
    capabilities: new Set(),
    threshold: (name) => (name === "interesados" ? mk(interesados) : mk(lugares)),
  } as RunContext<"interesados" | "lugares">;
}

function ctxManual(language: string, distinctNotifiers: number): RunContext<"distinctNotifiers"> {
  const mk = (v: number) => resolveThreshold(pisoDeclarado(v, { rationale: "sonda AO5, sólo lectura" }), { language, sampleSize: () => 0, corpusP95: () => null });
  return { language, capabilities: new Set(), threshold: () => mk(distinctNotifiers) } as RunContext<"distinctNotifiers">;
}

/** `lugares` es `presencia` en producción (value 1) y el detector hace `+1`, así que L=1 ⇒ sin repetición. */
const VARIANTES: readonly { readonly nombre: string; readonly T: number; readonly L: number }[] = [
  { nombre: "T3_L2_produccion", T: 3, L: 1 },
  { nombre: "T3_L1_sin_repeticion", T: 3, L: 0 },
  { nombre: "T2_L2", T: 2, L: 1 },
  { nombre: "T2_L1_sin_repeticion", T: 2, L: 0 },
  { nombre: "T4_L2", T: 4, L: 1 },
];

const files = await collectFiles(dir);
const conteo: Record<string, number> = {};
const detalle: Record<string, { file: string; line: number; symbol: string; title: string }[]> = {};
for (const v of VARIANTES) { conteo[v.nombre] = 0; detalle[v.nombre] = []; }
let manual = 0;
const manualDetalle: { file: string; line: number; symbol: string }[] = [];
let porLenguaje: Record<string, number> = {};
let analizados = 0;

for (const sf of files) {
  const live = await resolveLiveFileUnit(dir, sf.path);
  if (!live) continue;
  analizados++;
  // `ScannedFile` no lleva lenguaje y estos dos detectores no leen `ctx.language`
  // (sólo `ctx.threshold`, y los dos umbrales de la sonda son `pisoDeclarado`,
  // que no depende del lenguaje). La FIDELIDAD contra producción lo confirma.
  const lang = "";
  try {
    for (const v of VARIANTES) {
      let rs: readonly RawFinding[] = [];
      try { rs = hardWired.run(live.unit, ctxCon(lang, v.T, v.L)); } catch { rs = []; }
      conteo[v.nombre] += rs.length;
      for (const r of rs) {
        detalle[v.nombre].push({ file: sf.path, line: r.locations[0].startLine, symbol: r.locations[0].symbol ?? "", title: r.title });
      }
      if (v.nombre === "T3_L2_produccion" && rs.length) porLenguaje[lang] = (porLenguaje[lang] ?? 0) + rs.length;
    }
    let ms: readonly RawFinding[] = [];
    try { ms = manualNotification.run(live.unit, ctxManual(lang, 1) as never); } catch { ms = []; }
    manual += ms.length;
    for (const r of ms) manualDetalle.push({ file: sf.path, line: r.locations[0].startLine, symbol: r.locations[0].symbol ?? "" });
  } finally {
    live.release();
  }
}

writeFileSync(out, JSON.stringify({ dir, archivos: files.length, analizados, conteo, manual, porLenguaje, detalle, manualDetalle }, null, 1));
console.log(`${out}: ${JSON.stringify(conteo)} manual=${manual}`);
