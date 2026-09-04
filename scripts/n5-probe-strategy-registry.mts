/**
 * Ola U / frente N5 — SONDA DE MEDICIÓN, no parte del analizador.
 *
 * Mide, sobre el GRAFO REAL de un repo y en UNA sola corrida, el DELTA entre
 * la regla VIEJA y la NUEVA de `hypotheses/strategy.ts` para la evidencia
 * estructural de Strategy. Las dos reglas se evalúan sobre el MISMO grafo en
 * el MISMO proceso, así que el número es un delta aislado: no depende de qué
 * hayan cambiado otros frentes en el árbol, ni de que el volcado esté fresco.
 *
 *   REGLA VIEJA (hasta la Ola U): familia = aristas `{implements, satisfies}`,
 *   con TODOS los hermanos declarados en el archivo del hallazgo; portador
 *   "heterogéneo" = >=2 firmas `nombre#aridad` distintas, contando también los
 *   literales anónimos (`<anon@n>`, sin nombre ni aridad reales).
 *
 *   REGLA NUEVA (Ola U): familia = aristas `{extends, implements}` (protocolo
 *   DECLARADO — `satisfies` sólo corrobora), anclada en el archivo (protocolo o
 *   >=1 hermano acá); portador "heterogéneo" sólo si >=2 destinos con firma
 *   CONOCIDA y distintas entre sí.
 *
 * Además vuelca (`--foco <substr>`) los nodos y aristas alrededor de una ruta,
 * para poder responder con evidencia si una forma concreta (p. ej. el registro
 * por decorador de sqlalchemy) existe en el grafo o no.
 *
 * Uso: npx tsx scripts/n5-probe-strategy-registry.mts <dir> <slug> [--foco <substr>]
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { confidentEdges } from "../src/server/services/detect/inter-file/confident-edges.js";
import { memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../src/server/services/graph/types.js";

const [, , dir, slug, ...rest] = process.argv;
if (!dir || !slug) {
  console.error("Uso: npx tsx scripts/n5-probe-strategy-registry.mts <dir> <slug> [--foco <substr>]");
  process.exit(1);
}
const focoIdx = rest.indexOf("--foco");
const foco = focoIdx >= 0 ? (rest[focoIdx + 1] ?? null) : null;

let graph: CodeGraph | null = null;
await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.log(JSON.stringify({ slug, error: "sin grafo" }));
  process.exit(0);
}
const g: CodeGraph = graph;
const edges = confidentEdges(g);
const nodeById = new Map<string, CodeGraphNode>();
for (const n of g.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
const edgesFrom = new Map<string, CodeGraphEdge[]>();
for (const e of edges) {
  const l = edgesFrom.get(e.from);
  if (l) l.push(e);
  else edgesFrom.set(e.from, [e]);
}
const gi: GraphIndex = { nodeById: (id) => nodeById.get(id) ?? null, edgesFrom: (id) => edgesFrom.get(id) ?? [] };

function memberNodeId(ownerId: string, name: string): string | null {
  for (const e of edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const t = nodeById.get(e.to);
    if (t?.kind === "symbol" && t.family === "function-like" && t.symbolPath[t.symbolPath.length - 1] === name) return t.id;
  }
  return null;
}

function commonMember(kids: readonly string[]): { name: string; arity: number | null } | null {
  const first = memberSignatures(gi, kids[0]!);
  for (const m of first) {
    if (kids.every((h) => memberSignatures(gi, h).some((mm) => mm.name === m.name && mm.arity === m.arity))) return { name: m.name, arity: m.arity };
  }
  return null;
}

function instantiateAmongThemselves(kids: readonly string[]): boolean {
  const ids = new Set(kids);
  return kids.some((a) => (edgesFrom.get(a) ?? []).some((e) => e.kind === "instantiates" && e.to !== a && ids.has(e.to)));
}

/** familias por conjunto de aristas, sin filtro de archivo. */
function familiesBy(kinds: ReadonlySet<string>): Map<string, string[]> {
  const kidsOf = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!kinds.has(e.kind)) continue;
    const from = nodeById.get(e.from);
    if (!from || from.kind !== "symbol") continue;
    const s = kidsOf.get(e.to) ?? new Set<string>();
    s.add(e.from);
    kidsOf.set(e.to, s);
  }
  const out = new Map<string, string[]>();
  for (const [base, kids] of kidsOf) if (kids.size >= 2) out.set(base, [...kids]);
  return out;
}

interface FamilyStat {
  base: string;
  baseFile: string;
  member: string;
  hijos: number;
  archivosDondeAncla: number;
  archivosDondeTodosViven: number;
  llamadaAlMiembroDeLaBase: number;
}
function statsFor(fams: Map<string, string[]>): FamilyStat[] {
  const out: FamilyStat[] = [];
  for (const [base, kids] of fams) {
    if (instantiateAmongThemselves(kids)) continue;
    const m = commonMember(kids);
    if (!m) continue;
    const baseNode = nodeById.get(base);
    const files = new Set(kids.map((k) => nodeById.get(k)?.file ?? "?"));
    if (baseNode) files.add(baseNode.file);
    const baseMemberId = memberNodeId(base, m.name);
    out.push({
      base: baseNode?.symbolPath.join(".") ?? base,
      baseFile: baseNode?.file ?? "?",
      member: m.name,
      hijos: kids.length,
      archivosDondeAncla: files.size,
      archivosDondeTodosViven: files.size === 1 ? 1 : 0,
      llamadaAlMiembroDeLaBase: baseMemberId ? edges.filter((e) => e.kind === "calls" && e.to === baseMemberId).length : 0,
    });
  }
  return out;
}

const VIEJA = new Set(["implements", "satisfies"]);
const NUEVA = new Set(["extends", "implements"]);
const statsVieja = statsFor(familiesBy(VIEJA));
const statsNueva = statsFor(familiesBy(NUEVA));

// Portadores.
const carrierTargets = new Map<string, Map<string, { name: string; arity: number | null }>>();
for (const e of edges) {
  if (e.kind !== "carries") continue;
  const t = nodeById.get(e.to);
  if (!t || t.kind !== "symbol" || t.family !== "function-like") continue;
  const m = carrierTargets.get(e.from) ?? new Map();
  m.set(t.id, { name: t.symbolPath[t.symbolPath.length - 1] ?? "", arity: t.arity ?? null });
  carrierTargets.set(e.from, m);
}
const invocados = new Set<string>();
for (const e of edges) if (e.kind === "invokes-indirect") invocados.add(e.to);
const known = (t: { name: string; arity: number | null }): boolean => t.arity !== null && t.name.length > 0 && !t.name.startsWith("<");

let portadoresReales = 0;
let hetVieja = 0;
let hetNueva = 0;
for (const [cid, targets] of carrierTargets) {
  if (targets.size < 2 || !invocados.has(cid)) continue;
  portadoresReales++;
  const all = [...targets.values()];
  if (new Set(all.map((t) => `${t.name}#${t.arity ?? "?"}`)).size >= 2) hetVieja++;
  const k = all.filter(known);
  if (k.length >= 2 && new Set(k.map((t) => `${t.name}#${t.arity ?? "?"}`)).size >= 2) hetNueva++;
}

const conteoAristas: Record<string, number> = {};
for (const e of edges) conteoAristas[e.kind] = (conteoAristas[e.kind] ?? 0) + 1;

const focoOut: unknown[] = [];
if (foco) {
  for (const n of g.nodes) {
    if (!n.file.includes(foco)) continue;
    const out = (edgesFrom.get(n.id) ?? []).map((e) => `${e.kind}→${nodeById.get(e.to)?.symbolPath.join(".") ?? e.to}`);
    const inc = edges.filter((e) => e.to === n.id).map((e) => `${e.kind}←${nodeById.get(e.from)?.symbolPath.join(".") ?? e.from}`);
    focoOut.push({ id: n.id, kind: n.kind, family: n.family, sym: n.symbolPath.join("."), arity: n.arity, out, inc });
  }
}

console.log(
  JSON.stringify(
    {
      slug,
      conteoAristas,
      familias: {
        VIEJA_implements_satisfies: {
          conMiembroComun: statsVieja.length,
          enUnSoloArchivo: statsVieja.filter((f) => f.archivosDondeTodosViven === 1).length,
          conLlamadaPolimorfica: statsVieja.filter((f) => f.llamadaAlMiembroDeLaBase > 0).length,
        },
        NUEVA_extends_implements: {
          conMiembroComun: statsNueva.length,
          enUnSoloArchivo: statsNueva.filter((f) => f.archivosDondeTodosViven === 1).length,
          conLlamadaPolimorfica: statsNueva.filter((f) => f.llamadaAlMiembroDeLaBase > 0).length,
        },
      },
      portadores: { realesConInvokesIndirect: portadoresReales, heterogeneosVIEJA: hetVieja, heterogeneosNUEVA: hetNueva },
      familiasTopNueva: statsNueva.sort((a, b) => b.hijos - a.hijos).slice(0, 10),
      familiasTopVieja: statsVieja.sort((a, b) => b.hijos - a.hijos).slice(0, 10),
      foco: focoOut,
    },
    null,
    1,
  ),
);
