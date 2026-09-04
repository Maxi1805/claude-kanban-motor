/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 * Forma del arbol `contains` por archivo: que familias cuelgan del nodo archivo,
 * a que profundidad aparecen los `class-like`, y donde viven los `function-like`.
 *
 * Uso: npx tsx scripts/probes/n5-shape.mts <volcado.json> [archivo-ejemplo]
 */
import { readFileSync } from "node:fs";

interface N { id: string; kind: string; file: string; symbolPath: string[]; family: string | null }
interface Dump { dir: string; files: { path: string; language: string }[]; nodes: N[]; edges: { kind: string; from: string; to: string }[] }

const [, , dumpPath, ejemplo] = process.argv;
const dump = JSON.parse(readFileSync(dumpPath!, "utf8")) as Dump;
const nodeById = new Map(dump.nodes.map((n) => [n.id, n]));
const contains = new Map<string, string[]>();
for (const e of dump.edges) {
  if (e.kind !== "contains") continue;
  let a = contains.get(e.from);
  if (!a) contains.set(e.from, (a = []));
  a.push(e.to);
}
const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));

// familia de los hijos de primer nivel del archivo, por lenguaje
const lvl1 = new Map<string, Map<string, number>>();
// profundidad minima a la que aparece un class-like, por lenguaje
const depthOfClass = new Map<string, Map<number, number>>();
// donde viven los function-like: profundidad y familia del padre
const parentOfFn = new Map<string, Map<string, number>>();

const parentById = new Map<string, string>();
for (const [from, tos] of contains) for (const t of tos) parentById.set(t, from);

function depth(id: string): number {
  let d = 0;
  let cur = id;
  while (parentById.has(cur)) {
    cur = parentById.get(cur)!;
    if (nodeById.get(cur)?.kind !== "symbol") break;
    d++;
  }
  return d;
}

for (const n of dump.nodes) {
  if (n.kind !== "symbol") continue;
  const lang = langByFile.get(n.file) ?? "?";
  const p = parentById.get(n.id);
  const pn = p ? nodeById.get(p) : undefined;
  if (pn && pn.kind === "file") {
    let m = lvl1.get(lang);
    if (!m) lvl1.set(lang, (m = new Map()));
    m.set(n.family ?? "?", (m.get(n.family ?? "?") ?? 0) + 1);
  }
  if (n.family === "class-like") {
    let m = depthOfClass.get(lang);
    if (!m) depthOfClass.set(lang, (m = new Map()));
    const d = depth(n.id);
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  if (n.family === "function-like") {
    let m = parentOfFn.get(lang);
    if (!m) parentOfFn.set(lang, (m = new Map()));
    const k = pn ? (pn.kind === "file" ? "archivo" : `${pn.family}`) : "sin-padre";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
}

console.log(`== ${dump.dir}`);
for (const [lang, m] of lvl1) console.log(`  ${lang} hijos-nivel-1-del-archivo: ${[...m].map(([k, v]) => `${k}=${v}`).join(" ")}`);
for (const [lang, m] of depthOfClass) console.log(`  ${lang} profundidad-de-class-like (0=hijo directo del archivo): ${[...m].sort().map(([k, v]) => `${k}:${v}`).join(" ")}`);
for (const [lang, m] of parentOfFn) console.log(`  ${lang} padre-de-function-like: ${[...m].map(([k, v]) => `${k}=${v}`).join(" ")}`);

if (ejemplo) {
  console.log(`\n-- arbol de ${ejemplo}`);
  const fid = `file:${ejemplo}`;
  const walk = (id: string, ind: string) => {
    for (const c of contains.get(id) ?? []) {
      const n = nodeById.get(c);
      if (!n) continue;
      console.log(`${ind}${n.kind}/${n.family ?? "-"} ${n.symbolPath.join(".")}`);
      if (ind.length < 8) walk(c, ind + "  ");
    }
  };
  walk(fid, "  ");
}
