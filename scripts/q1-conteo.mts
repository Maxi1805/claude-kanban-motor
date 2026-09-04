/**
 * SONDA DEL FRENTE F1 (Ola Q) — conteo por kind + estado de las aristas
 * `satisfies`, en una corrida del pipeline real. Sirve para el ANTES/DESPUÉS
 * del frente: se corre con el árbol sin tocar y con el árbol tocado, y el
 * delta sale de restar. No publica ningún absoluto de cierre.
 *
 * Uso: npx tsx scripts/q1-conteo.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/q1-conteo.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const state: { graph: CodeGraph | null } = { graph: null };
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    state.graph = r.graph;
  },
});

const g = state.graph;
const sat = g ? g.edges.filter((e) => e.kind === "satisfies") : [];
const byKind: Record<string, number> = {};
for (const f of analysis.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

const out = {
  slug,
  generatedAt: new Date().toISOString(),
  satisfies: sat.length,
  satisfiesAmbiguous: sat.filter((e) => e.provenance === "ambiguous").length,
  totalFindings: analysis.findings.length,
  byKind,
};
await fs.writeFile(outFile, JSON.stringify(out, null, 1));
console.log(`${slug}: satisfies=${out.satisfies} (ambiguas ${out.satisfiesAmbiguous}) · spec-abs=${byKind["speculative-abstraction"] ?? 0} · total=${out.totalFindings}`);
