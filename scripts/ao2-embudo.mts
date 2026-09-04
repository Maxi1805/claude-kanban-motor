/**
 * OLA AO, FRENTE AO2 — EL EMBUDO DE LOS CUATRO PATRONES DE CREACIÓN
 * (Builder, Factory Method, Abstract Factory, Prototype).
 *
 * Calcado de `scripts/ai6-embudo.mts` (mismo mecanismo, mismo esquema de
 * salida) y le SUMA la traza de `prototype.ts` (`startPrototypeTrace`, de
 * AI7/AJ3), que tiene forma propia. No toca ni una línea de producción: las
 * cuatro trazas son `null` por default y se prenden desde acá.
 *
 * Uso: npx tsx scripts/ao2-embudo.mts <dir> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import * as builderMod from "../src/server/services/hypotheses/builder.js";
import * as factoryMod from "../src/server/services/hypotheses/factory-method.js";
import * as absfacMod from "../src/server/services/hypotheses/abstract-factory.js";
import * as prototypeMod from "../src/server/services/hypotheses/prototype.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/ao2-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const MODS = [
  ["Builder", builderMod],
  ["Factory Method", factoryMod],
  ["Abstract Factory", absfacMod],
] as const;

const t0 = performance.now();
for (const [, m] of MODS) m.startAi6Trace();
prototypeMod.startPrototypeTrace();
const a = await analyzeRepo({ dir, repoName: "ao2", limits: { maxFindings: "unlimited" } });
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
{
  const traza = prototypeMod.takePrototypeTrace();
  totalEntradas += traza.length;
  const ultima = new Map<string, (typeof traza)[number]>();
  const pasadas = new Map<string, number>();
  for (const e of traza) {
    const k = `${e.findingId} ${e.ruta}`;
    ultima.set(k, e);
    pasadas.set(k, (pasadas.get(k) ?? 0) + 1);
  }
  const pub = publicadoPor.get("Prototype") ?? new Set<string>();
  salida["Prototype"] = [...ultima.entries()].map(([k, e]) => ({ ...e, pasadas: pasadas.get(k) ?? 0, publicado: pub.has(e.findingId) }));
}
writeFileSync(outTraza, JSON.stringify(salida, null, 1));

console.log(`${dir}: ${findings.length} hallazgos · traza ${totalEntradas} entradas · ${wallMs}ms`);
