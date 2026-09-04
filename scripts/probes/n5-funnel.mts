/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 *
 * Carga el volcado de `n5-dump-graph.mts` y (a) corre el detector REAL
 * `buildCouplingWithoutAbstractionFindings` sobre el, y (b) reimplementa el embudo
 * con contadores por etapa, para ver DONDE muere cada lenguaje.
 *
 * Uso: npx tsx scripts/probes/n5-funnel.mts <volcado.json> [--casos N]
 */
import { readFileSync } from "node:fs";

import { buildCouplingWithoutAbstractionFindings, detector } from "../../src/server/services/detect/inter-file/coupling-without-abstraction.js";
import { resolveThreshold } from "../../src/server/services/detect/thresholds.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../src/server/services/graph/types.js";
import type { RepoUnit } from "../../src/server/services/detect/types.js";

interface Dump {
  dir: string;
  files: { path: string; lines: number; language: string }[];
  nodes: (Omit<CodeGraphNode, "family"> & { family: string | null })[];
  edges: CodeGraphEdge[];
}

const [, , dumpPath, ...rest] = process.argv;
if (!dumpPath) {
  console.error("Uso: npx tsx scripts/probes/n5-funnel.mts <volcado.json>");
  process.exit(1);
}
const casos = Number(rest.find((r) => r.startsWith("--casos="))?.split("=")[1] ?? 0);

const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as Dump;
const nodes = dump.nodes.map((n) => ({ ...n, family: n.family ?? undefined })) as unknown as CodeGraphNode[];
const graph = { nodes, edges: dump.edges } as unknown as CodeGraph;
const repo: RepoUnit = {
  repoName: dump.dir,
  files: dump.files,
  functions: [],
  clones: [],
  graph,
};

const th = (k: keyof typeof detector.thresholds) =>
  resolveThreshold(detector.thresholds[k]!, { language: "", sampleSize: () => 0, corpusP95: () => null });

const findings = buildCouplingWithoutAbstractionFindings(
  repo,
  th("minClients"),
  th("maxUbiquitousFanInRatio"),
  th("maxFanoutConsidered"),
  th("minClientShareOfFanIn"),
  th("minSharedOperations"),
  th("minSharedProtocolShare"),
  th("maxOperationUbiquity"),
  th("minAbstractionProtocol"),
);

const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));
const byLang = new Map<string, number>();
for (const f of findings) {
  const langs = new Set(f.locations.map((l) => langByFile.get(l.file) ?? "?"));
  const lang = langs.size === 1 ? [...langs][0]! : "mixto";
  byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
}
console.log(`${dump.dir}: ${findings.length} hallazgos crudos (pre-maxFindings)`);
for (const [l, n] of [...byLang].sort((a, b) => b[1] - a[1])) console.log(`  ${l}: ${n}`);

/* ── embudo reimplementado, MISMO criterio que produccion, con contadores ── */
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const dependsOn = new Map<string, Set<string>>();
const dependedBy = new Map<string, Set<string>>();
const nominalPairs = new Set<string>();
const nominalTargetsOf = new Map<string, Set<string>>();
const containsByFrom = new Map<string, string[]>();
const pk = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
const addTo = (m: Map<string, Set<string>>, k: string, v: string) => {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
};
for (const e of dump.edges) {
  if (e.kind === "contains") {
    let arr = containsByFrom.get(e.from);
    if (!arr) containsByFrom.set(e.from, (arr = []));
    arr.push(e.to);
    continue;
  }
  const from = nodeById.get(e.from);
  const to = nodeById.get(e.to);
  if (!from || !to || from.file === to.file) continue;
  if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
  addTo(dependsOn, from.file, to.file);
  addTo(dependedBy, to.file, from.file);
  if (e.kind === "extends" || e.kind === "implements" || e.kind === "mixes-in" || e.kind === "satisfies") {
    nominalPairs.add(pk(from.file, to.file));
    addTo(nominalTargetsOf, from.file, to.file);
  }
}

const totalFiles = dump.files.length;
const clientsOfPair = new Map<string, Set<string>>();
for (const [source, targets] of dependsOn) {
  if (targets.size < 2 || targets.size > 60) continue;
  const sorted = [...targets].sort();
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const key = pk(sorted[i]!, sorted[j]!);
      let c = clientsOfPair.get(key);
      if (!c) clientsOfPair.set(key, (c = new Set()));
      c.add(source);
    }
}

/** produccion actual: class-like de PRIMER nivel del archivo -> miembros function-like */
function opsProd(file: string): Set<string> {
  const names = new Set<string>();
  for (const cid of containsByFrom.get(`file:${file}`) ?? []) {
    const c = nodeById.get(cid);
    if (!c || c.kind !== "symbol" || c.family !== "class-like") continue;
    for (const mid of containsByFrom.get(c.id) ?? []) {
      const m = nodeById.get(mid);
      if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
      const n = m.symbolPath[m.symbolPath.length - 1];
      if (n && n !== "constructor") names.add(n);
    }
  }
  return names;
}

const stages = {
  pares: 0,
  minClients: 0,
  sinAbstraccion: 0,
  noUbicuo: 0,
  concentrado: 0,
  ambosClassLike: 0,
  compartenOp: 0,
};
const perLangStage = new Map<string, Record<string, number>>();
const bump = (lang: string, stage: string) => {
  let r = perLangStage.get(lang);
  if (!r) perLangStage.set(lang, (r = { minClients: 0, sinAbstraccion: 0, noUbicuo: 0, concentrado: 0, ambosClassLike: 0, compartenOp: 0 }));
  r[stage] = (r[stage] ?? 0) + 1;
};
const ejemplos: string[] = [];

for (const [key, clients] of clientsOfPair) {
  stages.pares++;
  if (clients.size < 3) continue;
  const [a, b] = key.split(" ") as [string, string];
  const la = langByFile.get(a) ?? "?";
  const lb = langByFile.get(b) ?? "?";
  const lang = la === lb ? la : "mixto";
  stages.minClients++;
  bump(lang, "minClients");
  if (nominalPairs.has(pk(a, b))) continue;
  const ta = nominalTargetsOf.get(a);
  const tb = nominalTargetsOf.get(b);
  if (ta && tb) {
    let common = false;
    for (const t of ta) if (tb.has(t)) common = true;
    if (common) continue;
  }
  stages.sinAbstraccion++;
  bump(lang, "sinAbstraccion");
  const ratioA = (dependedBy.get(a)?.size ?? 0) / totalFiles;
  const ratioB = (dependedBy.get(b)?.size ?? 0) / totalFiles;
  if (ratioA >= 0.1 || ratioB >= 0.1) continue;
  stages.noUbicuo++;
  bump(lang, "noUbicuo");
  const fanInA = dependedBy.get(a)?.size ?? 0;
  const fanInB = dependedBy.get(b)?.size ?? 0;
  const shareA = fanInA === 0 ? 0 : clients.size / fanInA;
  const shareB = fanInB === 0 ? 0 : clients.size / fanInB;
  if (Math.min(shareA, shareB) < 0.3) continue;
  stages.concentrado++;
  bump(lang, "concentrado");
  const pa = opsProd(a);
  const pb = opsProd(b);
  if (pa.size > 0 && pb.size > 0) {
    stages.ambosClassLike++;
    bump(lang, "ambosClassLike");
    const sh = [...pa].filter((n) => pb.has(n));
    if (sh.length > 0) {
      stages.compartenOp++;
      bump(lang, "compartenOp");
    }
  }
  if (casos > 0 && ejemplos.length < casos) {
    ejemplos.push(`${clients.size}c ${a} <-> ${b}  [${lang}] opsProdA=${pa.size} opsProdB=${pb.size}`);
  }
}

console.log("\nEMBUDO (global):");
for (const [k, v] of Object.entries(stages)) console.log(`  ${k}: ${v}`);
console.log("\nEMBUDO por lenguaje (desde minClients):");
for (const [l, r] of [...perLangStage].sort((a, b) => b[1].minClients - a[1].minClients)) {
  console.log(`  ${l}: ${Object.entries(r).map(([k, v]) => `${k}=${v}`).join(" ")}`);
}
if (ejemplos.length) {
  console.log("\nEJEMPLOS (post-concentracion):");
  for (const e of ejemplos) console.log("  " + e);
}
