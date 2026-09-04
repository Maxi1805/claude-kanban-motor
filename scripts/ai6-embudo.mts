/**
 * OLA AI, FRENTE AI6 — EL EMBUDO DE LOS SEIS PATRONES CREACIONALES Y DE
 * COLECCIÓN (Builder, Factory Method, Abstract Factory, Command, Composite,
 * Iterator).
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiar nada) con la traza de
 * los seis módulos prendida y deja en JSON, por hallazgo-ancla, en qué
 * `required` muere (o si emite) y qué estado le habría dado `appliedState`.
 * Es el número que el volcado de producción no puede dar: el volcado sólo
 * publica lo que sobrevive.
 *
 * Además escribe el MISMO volcado que `dump-hallazgos.mts` (mismo esquema)
 * para no pagar dos veces el análisis.
 *
 * Uso: npx tsx scripts/ai6-embudo.mts <dir> <salida-traza.json> <salida-volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import * as builderMod from "../src/server/services/hypotheses/builder.js";
import * as factoryMod from "../src/server/services/hypotheses/factory-method.js";
import * as absfacMod from "../src/server/services/hypotheses/abstract-factory.js";
import * as commandMod from "../src/server/services/hypotheses/command.js";
import * as compositeMod from "../src/server/services/hypotheses/composite.js";
import * as iteratorMod from "../src/server/services/hypotheses/iterator.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/ai6-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const MODS = [
  ["Builder", builderMod],
  ["Factory Method", factoryMod],
  ["Abstract Factory", absfacMod],
  ["Command", commandMod],
  ["Composite", compositeMod],
  ["Iterator", iteratorMod],
] as const;

const t0 = performance.now();
for (const [, m] of MODS) m.startAi6Trace();
const a = await analyzeRepo({ dir, repoName: "ai6", limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);

const findings = a.findings.map((f) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  title: f.title,
  where: f.locations.map((l) => `${l.file}:${l.startLine}`),
  symbols: f.locations.map((l) => l.symbol ?? ""),
  hypotheses: (f.hypotheses ?? []).map((h) => ({ pattern: h.pattern, state: h.state })),
}));
const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}
writeFileSync(outVolcado, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1));

/* ¿La hipótesis sobrevive al ARBITRAJE? (`arbitrateRivalHypotheses` corre
 * DESPUÉS de `build()`, así que "emitido" en la traza no implica
 * "publicado"). Se cruza contra el volcado real, patrón por patrón. */
const publicadoPor = new Map<string, Set<string>>();
for (const f of findings) {
  for (const h of f.hypotheses) {
    let s = publicadoPor.get(h.pattern);
    if (!s) {
      s = new Set<string>();
      publicadoPor.set(h.pattern, s);
    }
    s.add(f.id);
  }
}

const salida: Record<string, unknown> = { dir, wallMs, total: findings.length };
let totalEntradas = 0;
for (const [patron, m] of MODS) {
  const traza = m.takeAi6Trace();
  totalEntradas += traza.length;
  /* La ÚLTIMA entrada por (hallazgo, camino) es la que decide lo publicado:
   * `rebuildHypothesesWithGraph` vuelve a llamar `build()` con árbol vivo Y
   * grafo real y REEMPLAZA `finding.hypotheses` (ver `hypotheses/run.ts`). */
  const ultima = new Map<string, (typeof traza)[number]>();
  const pasadas = new Map<string, number>();
  for (const e of traza) {
    const k = `${e.findingId} ${e.camino}`;
    ultima.set(k, e);
    pasadas.set(k, (pasadas.get(k) ?? 0) + 1);
  }
  const pub = publicadoPor.get(patron) ?? new Set<string>();
  salida[patron] = [...ultima.entries()].map(([k, e]) => ({ ...e, pasadas: pasadas.get(k) ?? 0, publicado: pub.has(e.findingId) }));
}
writeFileSync(outTraza, JSON.stringify(salida, null, 1));

console.log(`${dir}: ${findings.length} hallazgos · traza ${totalEntradas} entradas · ${wallMs}ms`);
