/**
 * AI5 — volcado contra un ÁRBOL ARBITRARIO, para el contrafáctico de UNA sola
 * variable. Corren siete frentes sobre `src/` al mismo tiempo, así que
 * comparar "antes" contra "después" usando `src/` mide los cambios de todos.
 * Este script corre `analyzeRepo` desde la raíz que se le pase
 * (`scratchpad-ai5/src0` = árbol congelado de apertura;
 * `scratchpad-ai5/srcB` = el mismo árbol + SÓLO mi archivo).
 *
 * Uso: npx tsx scripts/ai5-dump-arbol.mts <raizSrc> <dirRepo> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , raiz, dir, out] = process.argv;
if (!raiz || !dir || !out) {
  console.error("Uso: npx tsx scripts/ai5-dump-arbol.mts <raizSrc> <dirRepo> <salida.json>");
  process.exit(1);
}

const base = path.resolve(raiz, "server/services");
const { analyzeRepo } = await import(pathToFileURL(path.join(base, "code-analyzer.ts")).href);
const { stableFindingId } = await import(pathToFileURL(path.join(base, "code-finding-ids.ts")).href);

const a = await analyzeRepo({ dir, repoName: "ai5", limits: { maxFindings: "unlimited" } });
const findings = (a as any).findings.map((f: any) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  where: f.locations.map((l: any) => `${l.file}:${l.startLine}-${l.endLine}`),
  hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
}));
writeFileSync(out, JSON.stringify({ raiz, dir, total: findings.length, findings }, null, 0));
console.log(`${out}: ${findings.length} hallazgos`);
