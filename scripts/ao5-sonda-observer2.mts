/**
 * AO5 — SONDA 2 de Observer. Corre una COPIA instrumentada del detector
 * (`scratchpad-ao5/hwn-sonda.ts`, byte a byte igual a producción salvo el
 * registro del embudo y el flag `selfField` del `Notice`) y publica:
 *   - miembros examinados, miembros que mutan estado propio,
 *   - CANDIDATOS: miembros que pasan (1)+(2)+(3) con >= T destinatarios,
 *   - cuántos de esos candidatos tienen >= T destinatarios que son COLABORADORES
 *     DEL DUEÑO (campo propio o campo declarado en el cuerpo del dueño) — el
 *     resto son nombres que se resuelven FUERA del dueño.
 *   - FIDELIDAD: los hallazgos de la copia contra los del detector REAL.
 *
 * Uso: npx tsx scripts/ao5-sonda-observer2.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector as realHW } from "../src/server/services/detect/intra-file/hard-wired-notification.js";
import { detector as copiaHW, EMBUDO, limpiarEmbudo } from "../scratchpad-ao5/hwn-sonda.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { RunContext } from "../src/server/services/detect/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/ao5-sonda-observer2.mts <dir> <salida.json>"); process.exit(1); }

function ctxCon(language: string, interesados: number): RunContext<"interesados" | "lugares"> {
  const mk = (v: number) => resolveThreshold(pisoDeclarado(v, { rationale: "sonda AO5" }), { language, sampleSize: () => 0, corpusP95: () => null });
  return { language, capabilities: new Set(), threshold: (n) => (n === "interesados" ? mk(interesados) : mk(1)) } as RunContext<"interesados" | "lugares">;
}

const files = await collectFiles(dir);
let miembros = 0, mutan = 0;
const candPorT: Record<string, number> = { T2: 0, T3: 0, T4: 0, T5: 0 };
const candPropiosPorT: Record<string, number> = { T2: 0, T3: 0, T4: 0, T5: 0 };
let duenos = 0;
let fidelidadReal = 0, fidelidadCopia = 0;
const ejemplos: unknown[] = [];

for (const sf of files) {
  const live = await resolveLiveFileUnit(dir, sf.path);
  if (!live) continue;
  // `ScannedFile` no lleva lenguaje y estos dos detectores no leen `ctx.language`
  // (sólo `ctx.threshold`, y los dos umbrales de la sonda son `pisoDeclarado`,
  // que no depende del lenguaje). La FIDELIDAD contra producción lo confirma.
  const lang = "";
  try {
    limpiarEmbudo();
    // T=1 para que `cands` recoja TODO miembro con >=1 destinatario descartado.
    let copia: readonly unknown[] = [];
    try { copia = copiaHW.run(live.unit, ctxCon(lang, 1)); } catch { copia = []; }
    void copia;
    for (const fila of EMBUDO) {
      duenos++;
      miembros += fila.miembros;
      mutan += fila.miembrosQueMutan;
      for (const c of fila.candidatosDetalle) {
        for (const T of [2, 3, 4, 5]) {
          if (c.targets.length >= T) candPorT[`T${T}`]++;
          if (c.propios >= T) candPropiosPorT[`T${T}`]++;
        }
        if (c.targets.length >= 3 && ejemplos.length < 60) {
          ejemplos.push({ file: fila.file, owner: fila.owner, miembro: c.miembro, linea: c.linea, targets: c.targets, propios: c.propios });
        }
      }
    }
    // FIDELIDAD: copia vs real, en el cableado de producción (T=3, lugares presencia).
    limpiarEmbudo();
    let a: readonly unknown[] = [], b: readonly unknown[] = [];
    try { a = realHW.run(live.unit, ctxCon(lang, 3)); } catch { a = []; }
    try { b = copiaHW.run(live.unit, ctxCon(lang, 3)); } catch { b = []; }
    fidelidadReal += a.length; fidelidadCopia += b.length;
  } finally { live.release(); }
}

writeFileSync(out, JSON.stringify({ dir, archivos: files.length, duenos, miembros, miembrosQueMutan: mutan, candPorT, candPropiosPorT, fidelidadReal, fidelidadCopia, ejemplos }, null, 1));
console.log(`${out}: duenos=${duenos} miembros=${miembros} mutan=${mutan} cand=${JSON.stringify(candPorT)} propios=${JSON.stringify(candPropiosPorT)} fid=${fidelidadReal}/${fidelidadCopia}`);
