/**
 * P4 (Ola P) — medicion ad-hoc, NO produccion.
 *
 * Compara dos volcados de `n5-dump-graph.mts` (mismo repo, agrupamiento por tipo apagado
 * y prendido) y reporta el delta de nodos y de aristas POR KIND y POR LENGUAJE.
 *
 * Uso: npx tsx scripts/probes/p4-difgrafo.mts <base.json> <desp.json>
 */
import { readFileSync } from "node:fs";

interface Dump {
  dir: string;
  files: { path: string; lines: number; language: string }[];
  nodes: { id: string; kind: string; file: string; symbolPath: string[]; family: string | null }[];
  edges: { kind: string; from: string; to: string; provenance: string }[];
}

const [, , aPath, bPath] = process.argv;
const A = JSON.parse(readFileSync(aPath!, "utf8")) as Dump;
const B = JSON.parse(readFileSync(bPath!, "utf8")) as Dump;
const lang = new Map(B.files.map((f) => [f.path, f.language]));

function porKindLang(d: Dump): Map<string, number> {
  const nodeFile = new Map(d.nodes.map((n) => [n.id, n.file]));
  const m = new Map<string, number>();
  for (const e of d.edges) {
    const l = lang.get(nodeFile.get(e.from) ?? "") ?? "?";
    const k = `${e.kind}/${e.provenance}/${l}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
const ma = porKindLang(A);
const mb = porKindLang(B);
const claves = [...new Set([...ma.keys(), ...mb.keys()])].sort();
console.log(`${A.dir}: nodos ${A.nodes.length} -> ${B.nodes.length}, aristas ${A.edges.length} -> ${B.edges.length}`);
for (const k of claves) {
  const x = ma.get(k) ?? 0;
  const y = mb.get(k) ?? 0;
  if (x !== y) console.log(`  ${k}: ${x} -> ${y}  (${y - x >= 0 ? "+" : ""}${y - x})`);
}

// Simbolos que cambiaron de symbolPath: cuantos, y por lenguaje.
const idsA = new Set(A.nodes.map((n) => n.id));
const nuevos = B.nodes.filter((n) => !idsA.has(n.id));
const porLang = new Map<string, number>();
for (const n of nuevos) porLang.set(lang.get(n.file) ?? "?", (porLang.get(lang.get(n.file) ?? "?") ?? 0) + 1);
console.log(`  nodos con id NUEVO (agrupados bajo su tipo): ${nuevos.length}`);
for (const [l, n] of [...porLang].sort((a, b) => b[1] - a[1])) console.log(`    ${l}: ${n}`);
for (const n of nuevos.slice(0, 5)) console.log(`    · ${n.id}`);
