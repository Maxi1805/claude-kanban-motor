/**
 * OLA AM · FRENTE AM1 — VOLCADO PROPIO PARA EL BANCO DE `Template Method`.
 *
 * Igual que `scripts/dump-hallazgos.mts` (que NO se toca) pero agrega, SÓLO para las
 * hipótesis de `Template Method`, el detalle que el banco necesita y el volcado
 * compartido no lleva: `checks`, `discriminators`, `evidence` del hallazgo-ancla y
 * `variant`. Sin eso no se puede decir POR QUÉ pasó una compuerta.
 *
 * Se importa desde una raíz de `src` PARAMETRIZABLE (`CK_SRC_ROOT`, default `../src`)
 * para poder correr el mismo volcado contra una copia congelada del árbol — corren
 * cinco frentes en paralelo sobre `src/` y una medición contra un árbol que se mueve
 * no vale.
 *
 * Uso: [CK_SRC_ROOT=scratchpad-am1/srcB] npx tsx scripts/am1-dump.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.CK_SRC_ROOT ?? "../src";
const base = ROOT.startsWith(".") ? ROOT : path.join("..", ROOT);
const { analyzeRepoCached } = await import(`${base}/server/services/analyze-cache.js`);
const { stableFindingId } = await import(`${base}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(
  `${base}/server/services/detect/precision/direccion-hipotesis.js`
);

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/am1-dump.mts <dir> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const { analysis: a, cache } = await analyzeRepoCached({
  dir,
  repoName: "dump",
  limits: { maxFindings: "unlimited" },
});
console.error(
  `[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`,
);
const wallMs = Math.round(performance.now() - t0);

const TM = "Template Method";

const findings = a.findings.map((f: any) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  const tieneTM = hs.some((h: any) => h.pattern === TM);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    variant: f.variant ?? null,
    lang: f.language ?? null,
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({
      pattern: h.pattern,
      state: h.state,
      at: at[i] ?? "",
    })),
    ...(tieneTM
      ? {
          ev: (f.evidence ?? []).map((e: any) => `${e.label}=${e.value}`),
          locs: f.locations.map((l: any) => ({
            file: l.file,
            a: l.startLine,
            b: l.endLine,
            sym: l.symbol ?? "",
          })),
          tm: hs
            .map((h: any, i: number) => ({ h, i }))
            .filter((x: any) => x.h.pattern === TM)
            .map((x: any) => ({
              at: at[x.i] ?? "",
              state: x.h.state,
              conf: x.h.confidence ?? null,
              source: x.h.source ?? "",
              checks: (x.h.checks ?? []).map((c: any) => ({
                l: c.label,
                p: c.passed,
                r: c.role ?? "",
                w: c.why,
              })),
              disc: (x.h.discriminators ?? []).map((c: any) => ({
                l: c.label,
                p: c.passed,
                w: c.why,
              })),
              places: (x.h.places ?? []).map((p: any) => ({
                file: p.file ?? "",
                a: p.startLine ?? null,
                b: p.endLine ?? null,
                sym: p.symbol ?? "",
                role: p.role ?? "",
              })),
            })),
        }
      : {}),
  };
});

const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}

writeFileSync(out, JSON.stringify({ dir, srcRoot: ROOT, wallMs, total: findings.length, porKind, findings }, null, 1));
console.log(`${out}: ${findings.length} hallazgos, ${Object.keys(porKind).length} kinds, ${wallMs}ms`);
