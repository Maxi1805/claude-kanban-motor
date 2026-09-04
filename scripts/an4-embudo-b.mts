/**
 * OLA AN, FRENTE AN4 — el MISMO embudo que `an4-embudo.mts`, pero contra un
 * ÁRBOL CONGELADO que se pasa por parámetro. Corren seis frentes en paralelo
 * sobre `src/` y una medición contra un árbol que se mueve no vale: el "antes"
 * corre contra `scratchpad-an4/src0` (copia byte a byte de `src/` al abrir) y
 * el "después" contra `scratchpad-an4/srcB` (= `src0` + `hypotheses/builder.ts`
 * y su test, y NADA más — verificado con `diff -rq`). Así la diferencia medida
 * no puede contener el cambio de ningún otro frente.
 *
 * Uso: npx tsx scripts/an4-embudo-b.mts <src0|srcB> <dir-repo> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

const [, , arbol, dir, outTraza, outVolcado] = process.argv;
if (!arbol || !dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/an4-embudo-b.mts <src0|srcB> <dir-repo> <traza.json> <volcado.json>");
  process.exit(1);
}
const base = `../scratchpad-an4/${arbol}/server/services`;
const { analyzeRepo } = await import(`${base}/code-analyzer.js`);
const { stableFindingId } = await import(`${base}/code-finding-ids.js`);
const { direccionesDeFila } = await import(`${base}/detect/precision/direccion-hipotesis.js`);
const builderMod = await import(`${base}/hypotheses/builder.js`);
const startAi6Trace = builderMod.startAi6Trace as () => void;
const takeAi6Trace = builderMod.takeAi6Trace as () => readonly Record<string, unknown>[];

const t0 = performance.now();
startAi6Trace();
const a = await analyzeRepo({ dir, repoName: "an4", limits: { maxFindings: "unlimited" } });
const traza = takeAi6Trace();
const wallMs = Math.round(performance.now() - t0);

interface Loc { file: string; startLine: number; symbol?: string }
interface Hyp { pattern: string; state: string }
interface Fin { id?: string; kind: string; title: string; locations: Loc[]; hypotheses?: Hyp[] }
const findings = (a.findings as Fin[]).map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: f.locations.map((l) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l) => l.symbol ?? ""),
    hypotheses: hs.map((h, i) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});
const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}
writeFileSync(outVolcado, JSON.stringify({ arbol, dir, wallMs, total: findings.length, porKind, findings }, null, 1));

const publicado = new Map<string, string>();
for (const f of findings) {
  const h = f.hypotheses.find((x) => x.pattern === "Builder");
  if (h) publicado.set(f.id, h.state);
}
const pasadas = new Map<string, number>();
for (const e of traza) pasadas.set(e.findingId as string, (pasadas.get(e.findingId as string) ?? 0) + 1);
writeFileSync(
  outTraza,
  JSON.stringify(
    {
      arbol,
      dir,
      wallMs,
      entradas: traza.length,
      hallazgosDistintos: pasadas.size,
      traza: traza.map((e, i) => ({ ...e, orden: i, pasadasDeEsteHallazgo: pasadas.get(e.findingId as string) ?? 0, publicado: publicado.get(e.findingId as string) ?? null })),
    },
    null,
    1,
  ),
);
console.log(`[${arbol}] ${dir}: ${findings.length} hallazgos · traza ${traza.length} sobre ${pasadas.size} hallazgos · ${wallMs} ms`);
