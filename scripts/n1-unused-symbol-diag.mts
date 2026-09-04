/**
 * SONDA DE DIAGNÓSTICO DEL FRENTE N1 (Ola O) — de dónde sale el fan-in cero.
 *
 * Para cada candidato que `unused-symbol` emite hoy, marca banderas
 * DERIVADAS DEL GRAFO (nunca del texto) que dicen si "nadie lo referencia"
 * está VERIFICADO o sólo NO OBSERVADO:
 *
 *  - `ambiguo`      : alguna arista de consumo AMBIGUA lo apunta (como `to` o
 *                     como `alternatives`). El detector las descarta hoy vía
 *                     `confidentEdges`, o sea que fabrica el fan-in cero.
 *  - `homonimoUsado`: existe OTRO símbolo del repo con el MISMO nombre final
 *                     y fan-in > 0. La cascada resuelve por nombre; con dos
 *                     homónimos no puede decir cuál, así que el cero de éste
 *                     es un artefacto del desempate.
 *  - `homonimo`     : existe otro símbolo del repo con el mismo nombre final.
 *  - `duenoConAncestro` / `duenoConDescendiente`: el contenedor participa de
 *                     una jerarquía de tipos (despacho polimórfico).
 *  - `redeclaraEnAncestro`: un ancestro del contenedor declara un miembro con
 *                     el mismo nombre ⇒ es un override.
 *  - `recibeRolMiembro`: alguna arista de consumo hacia un símbolo con ESTE
 *                     nombre trae el rol `receiver-member`.
 *
 * NOTA DE LECTURA: su conjunto `CONSUMER` es el de ANTES de la Ola O (las cinco
 * aristas de uso, sin las cuatro de TIPO que la PUERTA 5 sumó). Es a propósito:
 * los porcentajes que el docstring de `unused-symbol.ts` cita (ambiguo 13,7 %
 * en preact, homónimo 45–69 %) se midieron sobre la población de candidatos
 * VIEJA, que es la que había que explicar.
 *
 * Uso: npx tsx scripts/n1-unused-symbol-diag.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { detector } from "../src/server/services/detect/inter-file/unused-symbol.js";
import { testContext } from "../src/server/services/detect/testing.js";
import {
  edgeHasRole,
  edgeIsAmbiguous,
  symbolNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type EdgeKind,
} from "../src/server/services/graph/types.js";

const CONSUMER: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["references", "calls", "instantiates", "invokes-indirect", "carries"]);
const TYPE_EDGES: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["extends", "implements", "satisfies", "mixes-in"]);

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/n1-unused-symbol-diag.mts <dir> <slug> <salida.json>");
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
if (!state.graph) {
  console.error(`[n1-diag] ${slug}: sin grafo.`);
  process.exit(1);
}
const graph = state.graph;

const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
const last = (n: CodeGraphNode): string => n.symbolPath[n.symbolPath.length - 1] ?? "?";

const fanIn = new Map<string, number>();
const ambiguousTargets = new Set<string>();
const receiverMemberTargets = new Set<string>();
for (const e of graph.edges) {
  if (!CONSUMER.has(e.kind)) continue;
  if (edgeIsAmbiguous(e)) {
    ambiguousTargets.add(e.to);
    for (const alt of e.alternatives ?? []) ambiguousTargets.add(alt);
    continue;
  }
  fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + e.weight);
  if (edgeHasRole(e, "receiver-member")) receiverMemberTargets.add(e.to);
}

/** nombre final -> {total, conFanIn, conRolMiembro} sobre símbolos function/class-like. */
const byName = new Map<string, { total: number; usados: number; rolMiembro: number }>();
for (const n of graph.nodes) {
  if (n.kind !== "symbol" || (n.family !== "function-like" && n.family !== "class-like")) continue;
  const k = last(n);
  const e = byName.get(k) ?? { total: 0, usados: 0, rolMiembro: 0 };
  e.total++;
  if ((fanIn.get(n.id) ?? 0) > 0) e.usados++;
  if (receiverMemberTargets.has(n.id)) e.rolMiembro++;
  byName.set(k, e);
}

const edgesFrom = new Map<string, CodeGraphEdge[]>();
const edgesTo = new Map<string, CodeGraphEdge[]>();
for (const e of graph.edges) {
  (edgesFrom.get(e.from) ?? edgesFrom.set(e.from, []).get(e.from)!).push(e);
  (edgesTo.get(e.to) ?? edgesTo.set(e.to, []).get(e.to)!).push(e);
}

function ownerOf(n: CodeGraphNode): CodeGraphNode | null {
  if (n.symbolPath.length < 2) return null;
  return nodeById.get(symbolNodeId(n.file, n.symbolPath.slice(0, -1))) ?? null;
}
function ancestorsOf(id: string, depth = 4): CodeGraphNode[] {
  const out: CodeGraphNode[] = [];
  let frontier = [id];
  const seen = new Set([id]);
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const e of edgesFrom.get(cur) ?? []) {
        if (!TYPE_EDGES.has(e.kind) || seen.has(e.to)) continue;
        seen.add(e.to);
        const n = nodeById.get(e.to);
        if (n) out.push(n);
        next.push(e.to);
      }
    }
    frontier = next;
  }
  return out;
}
function membersOf(id: string): string[] {
  const out: string[] = [];
  for (const e of edgesFrom.get(id) ?? []) {
    if (e.kind !== "contains") continue;
    const n = nodeById.get(e.to);
    if (n?.kind === "symbol") out.push(last(n));
  }
  return out;
}

const raw = detector.run(
  {
    repoName: slug,
    files: analysis.files.map((f) => ({ path: f.path, lines: f.lines, language: f.language })),
    functions: [],
    clones: [],
    graph,
  },
  testContext(detector, "*"),
);

const languageByFile = new Map(analysis.files.map((f) => [f.path, f.language]));
const rows = raw.map((f) => {
  const loc = f.locations[0]!;
  const id = symbolNodeId(loc.file, loc.anchor?.symbolPath ?? []);
  const node = nodeById.get(id);
  const owner = node ? ownerOf(node) : null;
  const name = loc.symbol ?? "";
  const nm = byName.get(name) ?? { total: 0, usados: 0, rolMiembro: 0 };
  const anc = owner ? ancestorsOf(owner.id) : [];
  const desc = owner ? (edgesTo.get(owner.id) ?? []).filter((e) => TYPE_EDGES.has(e.kind)).length : 0;
  return {
    file: loc.file,
    language: languageByFile.get(loc.file) ?? "?",
    symbol: name,
    role: loc.role ?? "",
    severity: f.severity,
    family: node?.family ?? "?",
    ambiguo: ambiguousTargets.has(id),
    homonimo: nm.total > 1,
    homonimoUsado: nm.usados > 0,
    homonimoRolMiembro: nm.rolMiembro > 0,
    duenoConAncestro: anc.length > 0,
    duenoConDescendiente: desc > 0,
    redeclaraEnAncestro: anc.some((a) => membersOf(a.id).includes(name)),
  };
});

function pct(n: number): string {
  return `${((100 * n) / Math.max(1, rows.length)).toFixed(1)}%`;
}
const flags = [
  "ambiguo",
  "homonimo",
  "homonimoUsado",
  "homonimoRolMiembro",
  "duenoConAncestro",
  "duenoConDescendiente",
  "redeclaraEnAncestro",
] as const;
const resumen: Record<string, string> = {};
for (const f of flags) resumen[f] = `${rows.filter((r) => r[f]).length} (${pct(rows.filter((r) => r[f]).length)})`;
const ninguna = rows.filter((r) => !flags.some((f) => r[f]));
resumen["SIN NINGUNA bandera"] = `${ninguna.length} (${pct(ninguna.length)})`;

await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
await fs.writeFile(path.resolve(outFile), `${JSON.stringify({ slug, total: rows.length, resumen, filas: rows }, null, 2)}\n`, "utf8");
console.error(`[n1-diag] ${slug}: ${rows.length} candidatos`);
console.error(JSON.stringify(resumen, null, 2));
