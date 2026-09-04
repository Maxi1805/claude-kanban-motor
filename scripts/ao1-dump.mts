/**
 * OLA AO · FRENTE AO1 — volcado contra el ÁRBOL CONGELADO `scratchpad-ao1/src0`.
 *
 * Copia de `dump-hallazgos.mts` con DOS diferencias, y las dos son deliberadas:
 *   1. importa de `../scratchpad-ao1/src0/...` (mismo idiom que `aj5-embudo.mts`
 *      y `ak1-embudo.mts`): corren SEIS frentes sobre `src/` a la vez y una
 *      medición contra un árbol que se mueve no vale;
 *   2. usa `analyzeRepo` directo, sin la caché — la huella de la caché se
 *      calcula sobre `src/`, no sobre la copia, así que un HIT sería un
 *      resultado de OTRO árbol.
 *
 * Además agrega `endLine` por ubicación: el frente necesita ubicar la FUNCIÓN,
 * no sólo la línea de inicio.
 *
 * Uso: npx tsx scripts/ao1-dump.mts <dirRepo> <salida.json> [subarbol]
 */
import { writeFileSync } from "node:fs";

const SRC = process.env.AO1_SRC ?? "../scratchpad-ao1/src0";
const { analyzeRepo } = await import(`${SRC}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${SRC}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(`${SRC}/server/services/detect/precision/direccion-hipotesis.js`);

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ao1-dump.mts <dir> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: "dump", limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);

const findings = (a.findings as any[]).map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    detail: f.detail ?? "",
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    spans: f.locations.map((l: any) => [l.file, l.startLine, l.endLine]),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});

const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}

writeFileSync(out, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1));
console.log(`${out}: ${findings.length} hallazgos, ${Object.keys(porKind).length} kinds, ${wallMs}ms`);
