/**
 * P4 (Ola P) — medicion ad-hoc, NO produccion.
 *
 * Corre el detector REAL `buildCouplingWithoutAbstractionFindings` sobre un volcado
 * de `n5-dump-graph.mts` y reporta (a) hallazgos crudos por lenguaje y (b) la FORMA
 * de cada par que emite: unidad-de-tipo contra unidad-de-tipo, o modulo contra modulo.
 *
 * La reimplementacion de `collectOperationUnits` de abajo es una COPIA del criterio de
 * produccion, solo para la columna diagnostica (b); los conteos de (a) salen del
 * detector real, no de la copia.
 *
 * Uso: npx tsx scripts/probes/p4-medir.mts <volcado.json> [--casos=N]
 */
import { readFileSync } from "node:fs";

import {
  buildCouplingWithoutAbstractionFindings,
  detector,
} from "../../src/server/services/detect/inter-file/coupling-without-abstraction.js";
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
  console.error("Uso: npx tsx scripts/probes/p4-medir.mts <volcado.json>");
  process.exit(1);
}
const casos = Number(rest.find((r) => r.startsWith("--casos="))?.split("=")[1] ?? 0);

const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as Dump;
const nodes = dump.nodes.map((n) => ({ ...n, family: n.family ?? undefined })) as unknown as CodeGraphNode[];
const graph = { nodes, edges: dump.edges } as unknown as CodeGraph;
const repo: RepoUnit = { repoName: dump.dir, files: dump.files, functions: [], clones: [], graph };

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

/* ── copia del criterio de superficie, SOLO para la columna diagnostica ── */
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const containsByFrom = new Map<string, string[]>();
for (const e of dump.edges) {
  if (e.kind !== "contains") continue;
  let arr = containsByFrom.get(e.from);
  if (!arr) containsByFrom.set(e.from, (arr = []));
  arr.push(e.to);
}
const anon = (n: string) => n.includes("<") || n.includes(">");
function unidades(file: string): { tipo: number; modulo: number } {
  let tipo = 0;
  const moduleNames = new Set<string>();
  const visit = (nodeId: string, insideClass: boolean): void => {
    for (const childId of containsByFrom.get(nodeId) ?? []) {
      const child = nodeById.get(childId);
      if (!child || child.kind !== "symbol") continue;
      const childName = child.symbolPath[child.symbolPath.length - 1];
      if (child.family === "class-like") {
        let n = 0;
        for (const mid of containsByFrom.get(child.id) ?? []) {
          const m = nodeById.get(mid);
          if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
          const nm = m.symbolPath[m.symbolPath.length - 1];
          if (nm !== undefined && !anon(nm)) n++;
        }
        if (n > 0) tipo++;
        visit(child.id, true);
      } else if (child.family === "namespace-like") {
        visit(child.id, insideClass);
      } else if (child.family === "function-like" && !insideClass) {
        if (childName !== undefined && !anon(childName)) moduleNames.add(childName);
      }
    }
  };
  visit(`file:${file}`, false);
  return { tipo, modulo: moduleNames.size > 0 ? 1 : 0 };
}

const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));
const byLang = new Map<string, number>();
const formaPorLang = new Map<string, Map<string, number>>();
const ejemplos: string[] = [];
for (const f of findings) {
  // El par ANCLA son las dos primeras locations (ver la construccion del
  // hallazgo); el resto son clientes.
  const archivos = [f.locations[0]!.file, f.locations[1]!.file];
  const langs = new Set(archivos.map((a) => langByFile.get(a) ?? "?"));
  const lang = langs.size === 1 ? [...langs][0]! : "mixto";
  byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
  const us = archivos.map((a) => unidades(a));
  const soloModulo = us.every((u) => u.tipo === 0 && u.modulo > 0);
  const conTipo = us.every((u) => u.tipo > 0);
  const forma = soloModulo ? "modulo-modulo" : conTipo ? "tipo-tipo" : "mixta";
  let m = formaPorLang.get(lang);
  if (!m) formaPorLang.set(lang, (m = new Map()));
  m.set(forma, (m.get(forma) ?? 0) + 1);
  if (casos > 0 && ejemplos.length < casos) {
    const ops = /con el mismo nombre \(([^)]*)\)/.exec(f.detail)?.[1] ?? "?";
    ejemplos.push(`[${lang}/${forma}] ${archivos.join(" <-> ")} :: ops=${ops}`);
  }
}

console.log(`${dump.dir}: ${findings.length} hallazgos crudos (pre-maxFindings)`);
for (const [l, n] of [...byLang].sort((a, b) => b[1] - a[1])) {
  const formas = [...(formaPorLang.get(l) ?? new Map())].map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`  ${l}: ${n}   (${formas})`);
}
for (const e of ejemplos) console.log("  · " + e);

/* ── superficie: cuantas unidades de TIPO y cuantas de MODULO, por lenguaje ── */
const uPorLang = new Map<string, { tipo: number; modulo: number; archivos: number }>();
for (const f of dump.files) {
  const u = unidades(f.path);
  let acc = uPorLang.get(f.language);
  if (!acc) uPorLang.set(f.language, (acc = { tipo: 0, modulo: 0, archivos: 0 }));
  acc.tipo += u.tipo;
  acc.modulo += u.modulo;
  acc.archivos++;
}
for (const [l, a] of [...uPorLang].sort((x, y) => y[1].tipo - x[1].tipo)) {
  if (a.tipo === 0 && a.modulo === 0) continue;
  console.log(`  UNIDADES ${l}: ${a.archivos} archivos, ${a.tipo} de tipo, ${a.modulo} de modulo`);
}
