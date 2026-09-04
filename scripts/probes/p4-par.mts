/**
 * P4 (Ola P) — medicion ad-hoc, NO produccion.
 *
 * Muestra las UNIDADES de operacion (copia del criterio de produccion) de los archivos
 * cuyo path contenga cada patron dado, sobre un volcado de `n5-dump-graph.mts`.
 *
 * Uso: npx tsx scripts/probes/p4-par.mts <volcado.json> <patron> [patron...]
 */
import { readFileSync } from "node:fs";

import type { CodeGraphEdge, CodeGraphNode } from "../../src/server/services/graph/types.js";

interface Dump {
  dir: string;
  files: { path: string; lines: number; language: string }[];
  nodes: (Omit<CodeGraphNode, "family"> & { family: string | null })[];
  edges: CodeGraphEdge[];
}

const [, , dumpPath, ...patrones] = process.argv;
const dump = JSON.parse(readFileSync(dumpPath!, "utf8")) as Dump;
const nodeById = new Map(dump.nodes.map((n) => [n.id, n]));
const containsByFrom = new Map<string, string[]>();
for (const e of dump.edges) {
  if (e.kind !== "contains") continue;
  let arr = containsByFrom.get(e.from);
  if (!arr) containsByFrom.set(e.from, (arr = []));
  arr.push(e.to);
}
const anon = (n: string) => n.includes("<") || n.includes(">");

function unidades(file: string): { etiqueta: string; names: string[] }[] {
  const out: { etiqueta: string; names: string[] }[] = [];
  const moduleNames = new Set<string>();
  const visit = (nodeId: string, insideClass: boolean): void => {
    for (const childId of containsByFrom.get(nodeId) ?? []) {
      const child = nodeById.get(childId);
      if (!child || child.kind !== "symbol") continue;
      const childName = child.symbolPath[child.symbolPath.length - 1];
      if (child.family === "class-like") {
        const names: string[] = [];
        for (const mid of containsByFrom.get(child.id) ?? []) {
          const m = nodeById.get(mid);
          if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
          const nm = m.symbolPath[m.symbolPath.length - 1];
          if (nm !== undefined && !anon(nm)) names.push(nm);
        }
        if (names.length > 0) out.push({ etiqueta: `tipo ${child.symbolPath.join(".")}`, names });
        visit(child.id, true);
      } else if (child.family === "namespace-like") {
        visit(child.id, insideClass);
      } else if (child.family === "function-like" && !insideClass) {
        if (childName !== undefined && !anon(childName)) moduleNames.add(childName);
      }
    }
  };
  visit(`file:${file}`, false);
  if (moduleNames.size > 0) out.push({ etiqueta: "MODULO", names: [...moduleNames] });
  return out;
}

for (const pat of patrones) {
  for (const f of dump.files.filter((x) => x.path.includes(pat))) {
    console.log(`\n== ${f.path} (${f.language})`);
    for (const u of unidades(f.path)) console.log(`   ${u.etiqueta}: ${u.names.sort().join(", ")}`);
  }
}
