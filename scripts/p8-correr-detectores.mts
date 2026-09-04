/**
 * SONDA DEL FRENTE P8 (Ola P) — corre los tres detectores del frente
 * (`god-component`, `divergent-change`, `inappropriate-intimacy`) sobre los
 * volcados de grafo de `p8-dump-grafo.mts`, sin re-analizar el repo.
 *
 * Los tres son puros sobre `(repo.files, repo.graph, thresholds)`, y la
 * resolución de umbrales de producción es `benchmarks: null` + `language: "*"`
 * (ver `detect/run.ts#runInterFile`), así que esto reproduce EXACTAMENTE lo
 * que el pipeline emite, incluido el `presupuesto` (`maxFindings`) que
 * `capDetectorFindings` aplica al final.
 *
 * Uso: npx tsx scripts/p8-correr-detectores.mts <dump.json> [...más dumps]
 */
import { readFileSync } from "node:fs";

import { detector as godComponent } from "../src/server/services/detect/inter-file/god-component.js";
import { detector as divergentChange } from "../src/server/services/detect/inter-file/divergent-change.js";
import { detector as inappropriateIntimacy } from "../src/server/services/detect/inter-file/inappropriate-intimacy.js";
import { resolveThreshold, type Threshold, type ThresholdSpec } from "../src/server/services/detect/thresholds.js";
import type { RawFinding, RepoUnit, RunContext } from "../src/server/services/detect/types.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const RESOLVE_INPUT = { language: "*", sampleSize: () => 0, corpusP95: () => null };

function ctxFor(specs: Record<string, ThresholdSpec>): RunContext<string> {
  const cache = new Map<string, Threshold>();
  return {
    language: "*",
    capabilities: new Set(),
    threshold(name: string) {
      let t = cache.get(name);
      if (!t) {
        t = resolveThreshold(specs[name]!, RESOLVE_INPUT);
        cache.set(name, t);
      }
      return t;
    },
    graph: null,
    graphIndex: () => {
      throw new Error("no usado por estos tres detectores");
    },
  } as unknown as RunContext<string>;
}

interface Dump {
  slug: string;
  files: { path: string; lines: number; language: string }[];
  resolution: CodeGraph["resolution"];
  nodes: CodeGraph["nodes"];
  edges: CodeGraph["edges"];
}

export function loadRepo(file: string): { dump: Dump; repo: RepoUnit } {
  const dump = JSON.parse(readFileSync(file, "utf8")) as Dump;
  const repo: RepoUnit = {
    repoName: dump.slug,
    files: dump.files,
    functions: [],
    clones: [],
    graph: { nodes: dump.nodes, edges: dump.edges, resolution: dump.resolution },
  };
  return { dump, repo };
}

const DETECTORS = [godComponent, divergentChange, inappropriateIntimacy] as const;

export function runAll(repo: RepoUnit): Map<string, readonly RawFinding[]> {
  const out = new Map<string, readonly RawFinding[]>();
  for (const d of DETECTORS) {
    const ctx = ctxFor(d.thresholds as unknown as Record<string, ThresholdSpec>);
    const raw = d.run(repo, ctx);
    const cap = resolveThreshold(d.maxFindings!, RESOLVE_INPUT).value;
    // `capDetectorFindings` ordena por severidad desc antes de recortar.
    const kept = raw.length <= cap ? [...raw] : [...raw].sort((a, b) => b.severity - a.severity).slice(0, cap);
    out.set(d.kind, kept);
  }
  return out;
}

if (process.argv[2] === undefined) {
  console.error("uso: npx tsx scripts/p8-correr-detectores.mts <dump.json> [...]");
  process.exit(1);
}

const totals = new Map<string, Map<string, number>>();
for (const file of process.argv.slice(2)) {
  const { dump, repo } = loadRepo(file);
  const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));
  const byKind = runAll(repo);
  for (const [kind, findings] of byKind) {
    const perLang = totals.get(kind) ?? new Map<string, number>();
    totals.set(kind, perLang);
    for (const f of findings) {
      // Un hallazgo cuenta UNA vez por cada lenguaje distinto que toca
      // (`inappropriate-intimacy` ancla en dos archivos; los otros dos en uno).
      const langs = new Set(f.locations.map((l) => langByFile.get(l.file) ?? "?"));
      for (const l of langs) perLang.set(l, (perLang.get(l) ?? 0) + 1);
    }
    console.log(`${dump.slug}\t${kind}\t${findings.length}`);
  }
}

console.log("\n== por lenguaje ==");
for (const [kind, perLang] of totals) {
  const rows = [...perLang.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${kind}: total=${rows.reduce((s, r) => s + r[1], 0)} ${rows.map(([l, n]) => `${l}=${n}`).join(" ")}`);
}
