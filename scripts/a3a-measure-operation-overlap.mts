/**
 * A3a - medicion ad-hoc (NO produccion, no se importa desde ningun detector).
 *
 * Verifica, sobre el grafo real de un repo, dos formas posibles de operacionalizar
 * "hacen lo mismo" para coupling-without-abstraction:
 *   1. operacion INVOCADA compartida: de lo que los `clients` compartidos invocan
 *      (aristas references/calls resueltas) hacia A y hacia B, ¿hay algun nombre
 *      de miembro en comun?
 *   2. miembro DECLARADO compartido, restringido a pares donde AMBOS extremos
 *      tienen al menos un simbolo class-like de primer nivel (si no lo tienen,
 *      "Extract Interface" -el remedio que este detector propone- no aplica
 *      mecanicamente): de los metodos que A y B DECLARAN (via `contains`,
 *      independiente de quien los invoque), ¿hay algun nombre en comun?
 *
 * Reimplementa la MISMA proyeccion que
 * coupling-without-abstraction.ts#projectDependencies/buildCouplingWithoutAbstractionFindings
 * (candidatos ya filtrados por minClients/ubicuidad/concentracion).
 *
 * Uso: npx tsx scripts/a3a-measure-operation-overlap.mts <dir>
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph, CodeGraphNode } from "../src/server/services/graph/types.js";

const OPERATION_EDGE_KINDS = new Set(["references", "calls"]);

function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

async function main(): Promise<void> {
  const [, , dir] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/a3a-measure-operation-overlap.mts <dir>");
    process.exit(1);
  }

  let graph: CodeGraph | null = null;
  await analyzeRepo({ dir, repoName: "a3a-measure", limits: { maxFindings: "unlimited" }, onGraph: (r: { graph: CodeGraph }) => (graph = r.graph) });
  if (!graph) {
    console.error("sin grafo");
    process.exit(1);
  }
  const g: CodeGraph = graph;

  const nodeById = new Map<string, CodeGraphNode>(g.nodes.map((n) => [n.id, n]));
  const dependsOn = new Map<string, Set<string>>();
  const dependedBy = new Map<string, Set<string>>();
  const nominalPairs = new Set<string>();
  const nominalTargetsOf = new Map<string, Set<string>>();
  const opNames = new Map<string, Set<string>>();
  const containsByFrom = new Map<string, string[]>();

  const addTo = (m: Map<string, Set<string>>, k: string, v: string) => {
    let s = m.get(k);
    if (!s) {
      s = new Set();
      m.set(k, s);
    }
    s.add(v);
  };

  for (const edge of g.edges) {
    if (edge.kind === "contains") {
      let arr = containsByFrom.get(edge.from);
      if (!arr) {
        arr = [];
        containsByFrom.set(edge.from, arr);
      }
      arr.push(edge.to);
      continue;
    }
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.file === to.file) continue;
    if (edge.provenance === "inferred" || edge.provenance === "ambiguous") continue;

    addTo(dependsOn, from.file, to.file);
    addTo(dependedBy, to.file, from.file);
    if (edge.kind === "extends" || edge.kind === "implements" || edge.kind === "mixes-in" || edge.kind === "satisfies") {
      nominalPairs.add(pairKey(from.file, to.file));
      addTo(nominalTargetsOf, from.file, to.file);
    }
    if (OPERATION_EDGE_KINDS.has(edge.kind) && to.kind === "symbol" && to.symbolPath.length > 0) {
      const name = to.symbolPath[to.symbolPath.length - 1]!;
      addTo(opNames, `${from.file} ${to.file}`, name);
    }
  }

  function classMembersOf(file: string): Set<string> {
    const members = new Set<string>();
    const fileId = `file:${file}`;
    for (const childId of containsByFrom.get(fileId) ?? []) {
      const child = nodeById.get(childId);
      if (!child || child.kind !== "symbol" || child.family !== "class-like") continue;
      for (const mId of containsByFrom.get(child.id) ?? []) {
        const m = nodeById.get(mId);
        if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
        const name = m.symbolPath[m.symbolPath.length - 1];
        if (name && name !== "constructor") members.add(name);
      }
    }
    return members;
  }

  const totalFiles = new Set(g.nodes.filter((n) => n.kind === "file").map((n) => n.file)).size;
  const MAX_UBIQUITOUS_FAN_IN_RATIO = 0.1;
  const MAX_FANOUT_CONSIDERED = 60;
  const MIN_CLIENT_SHARE_OF_FANIN = 0.3;
  const MIN_CLIENTS = 3;

  const clientsOfPair = new Map<string, Set<string>>();
  for (const [source, targets] of dependsOn) {
    if (targets.size < 2 || targets.size > MAX_FANOUT_CONSIDERED) continue;
    const sorted = [...targets].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = pairKey(sorted[i]!, sorted[j]!);
        let c = clientsOfPair.get(key);
        if (!c) {
          c = new Set();
          clientsOfPair.set(key, c);
        }
        c.add(source);
      }
    }
  }

  function hasCommonAbstraction(a: string, b: string): boolean {
    if (nominalPairs.has(pairKey(a, b))) return true;
    const ta = nominalTargetsOf.get(a);
    const tb = nominalTargetsOf.get(b);
    if (!ta || !tb) return false;
    for (const t of ta) if (tb.has(t)) return true;
    return false;
  }

  const rows: {
    a: string;
    b: string;
    clients: number;
    namesA: number;
    namesB: number;
    shared: number;
    sharedNames: string[];
    bothClassLike: boolean;
    declaredA: number;
    declaredB: number;
    sharedDeclared: number;
    sharedDeclaredNames: string[];
  }[] = [];

  for (const [key, clients] of clientsOfPair) {
    if (clients.size < MIN_CLIENTS) continue;
    const [a, b] = key.split(" ") as [string, string];
    if (hasCommonAbstraction(a, b)) continue;
    const ratioA = (dependedBy.get(a)?.size ?? 0) / totalFiles;
    const ratioB = (dependedBy.get(b)?.size ?? 0) / totalFiles;
    if (ratioA >= MAX_UBIQUITOUS_FAN_IN_RATIO || ratioB >= MAX_UBIQUITOUS_FAN_IN_RATIO) continue;
    const fanInA = dependedBy.get(a)?.size ?? 0;
    const fanInB = dependedBy.get(b)?.size ?? 0;
    const shareA = fanInA === 0 ? 0 : clients.size / fanInA;
    const shareB = fanInB === 0 ? 0 : clients.size / fanInB;
    if (Math.min(shareA, shareB) < MIN_CLIENT_SHARE_OF_FANIN) continue;

    const namesA = new Set<string>();
    const namesB = new Set<string>();
    for (const c of clients) {
      for (const n of opNames.get(`${c} ${a}`) ?? []) namesA.add(n);
      for (const n of opNames.get(`${c} ${b}`) ?? []) namesB.add(n);
    }
    const shared = [...namesA].filter((n) => namesB.has(n));

    const declaredA = classMembersOf(a);
    const declaredB = classMembersOf(b);
    const bothClassLike = declaredA.size > 0 && declaredB.size > 0;
    const sharedDeclared = bothClassLike ? [...declaredA].filter((n) => declaredB.has(n)) : [];

    rows.push({
      a,
      b,
      clients: clients.size,
      namesA: namesA.size,
      namesB: namesB.size,
      shared: shared.length,
      sharedNames: shared,
      bothClassLike,
      declaredA: declaredA.size,
      declaredB: declaredB.size,
      sharedDeclared: sharedDeclared.length,
      sharedDeclaredNames: sharedDeclared,
    });
  }

  rows.sort((x, y) => y.clients - x.clients);
  console.log(`candidatos actuales (post minClients/ubicuidad/concentracion): ${rows.length}`);
  console.log(`con >=1 operacion INVOCADA compartida por los mismos clients: ${rows.filter((r) => r.shared >= 1).length}`);
  console.log(`con namesA=0 o namesB=0 (sin dato de invocacion en algun lado): ${rows.filter((r) => r.namesA === 0 || r.namesB === 0).length}`);
  console.log(`con A y B AMBOS con >=1 simbolo class-like de primer nivel: ${rows.filter((r) => r.bothClassLike).length}`);
  console.log(`  de esos, con >=1 miembro DECLARADO compartido: ${rows.filter((r) => r.bothClassLike && r.sharedDeclared >= 1).length}`);
  for (const r of rows) {
    console.log(
      `${r.clients}c  ${r.a} <-> ${r.b}  invoked A=${r.namesA} B=${r.namesB} shared=${r.shared}${r.shared > 0 ? " [" + r.sharedNames.slice(0, 5).join(",") + "]" : ""}` +
        `  |  classLike=${r.bothClassLike} declaredA=${r.declaredA} declaredB=${r.declaredB} sharedDeclared=${r.sharedDeclared}${r.sharedDeclared > 0 ? " [" + r.sharedDeclaredNames.slice(0, 5).join(",") + "]" : ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
