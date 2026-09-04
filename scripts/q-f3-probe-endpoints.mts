/**
 * Sonda del frente F3 (Ola Q) — ¿hay aristas colgadas HOY?
 *
 * Corre el pipeline real (`analyzeRepo` + `onGraph`) sobre un árbol y cuenta,
 * por `kind` y por `provenance`, cuántas aristas nombran un extremo que no
 * está entre los nodos del grafo. Es la medición previa al test de invariante:
 * no se congela un invariante sin saber antes si se cumple.
 *
 * Uso: npx tsx scripts/q-f3-probe-endpoints.mts <dir> [<dir> ...]
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("Uso: npx tsx scripts/q-f3-probe-endpoints.mts <dir> [<dir> ...]");
  process.exit(1);
}

for (const dir of dirs) {
  let graph: CodeGraph | null = null;
  await analyzeRepo({
    dir,
    repoName: "q-f3-probe",
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
    },
  });
  if (!graph) {
    console.log(`${dir}: sin grafo`);
    continue;
  }
  const g: CodeGraph = graph;
  const ids = new Set(g.nodes.map((n) => n.id));
  const dupes = g.nodes.length - ids.size;
  const porKind = new Map<string, { from: number; to: number; alt: number }>();
  let colgadas = 0;
  let conAlternativaColgada = 0;
  const ejemplos: string[] = [];
  for (const e of g.edges) {
    const key = `${e.kind}/${e.provenance}`;
    const bucket = porKind.get(key) ?? { from: 0, to: 0, alt: 0 };
    let mala = false;
    if (!ids.has(e.from)) {
      bucket.from++;
      mala = true;
    }
    if (!ids.has(e.to)) {
      bucket.to++;
      mala = true;
    }
    const altMalas = (e.alternatives ?? []).filter((a) => !ids.has(a)).length;
    if (altMalas > 0) {
      bucket.alt += altMalas;
      conAlternativaColgada++;
    }
    if (mala) {
      colgadas++;
      if (ejemplos.length < 8) ejemplos.push(`${e.kind}/${e.provenance}  ${e.from}  ->  ${e.to}`);
    }
    if (mala || altMalas > 0) porKind.set(key, bucket);
  }
  console.log(
    `\n${dir}: ${g.nodes.length} nodos (${dupes} ids repetidos), ${g.edges.length} aristas, ` +
      `${colgadas} con un extremo colgado, ${conAlternativaColgada} con alguna alternativa colgada`,
  );
  for (const [k, v] of [...porKind].sort()) console.log(`   ${k}: from=${v.from} to=${v.to} alt=${v.alt}`);
  for (const e of ejemplos) console.log(`   ej: ${e}`);
}
