/**
 * AL2 — SONDA DE POBLACIÓN de `State · temporary-field`: corre el detector-ancla
 * REAL y el builder REAL de `hypotheses/state.ts` sobre cada archivo que el
 * volcado de cierre de la Ola AK marca con un hallazgo `temporary-field`, y
 * dice qué propuestas emiten HOY.
 *
 * NO corre `analyzeRepo`: con cinco frentes escribiendo en `src/` a la vez, un
 * volcado de 21 repos mediría el árbol de todos. La verificación en producción
 * va aparte, sobre repos puntuales.
 *
 * Uso: npx tsx scripts/al2-sonda-poblacion.mts <lista.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { deriveCapabilities } from "../src/server/services/detect/capabilities.js";
import { detector as temporaryFieldDetector } from "../src/server/services/detect/intra-file/temporary-field.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../src/server/services/detect/testing.js";
import type { Finding, RawFinding, RepoUnit } from "../src/server/services/detect/types.js";
import type { DerivedNodeSets } from "../src/server/services/code-grammar.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import { HYPOTHESES } from "../src/server/services/hypotheses/registry.js";
import type { HypothesisContext } from "../src/server/services/hypotheses/types.js";

const [, , listaPath, outPath] = process.argv;
if (!listaPath || !outPath) {
  console.error("Uso: npx tsx scripts/al2-sonda-poblacion.mts <lista.json> <salida.json>");
  process.exit(1);
}

const stateBuilder = HYPOTHESES.find((h) => h.pattern === "State");
if (!stateBuilder) throw new Error("no está el builder de State en el registro");

interface Item { pop: string; repo: string; file: string }
const items = JSON.parse(readFileSync(listaPath, "utf8")) as Item[];

const setsCache = new Map<string, Promise<DerivedNodeSets>>();
const capsCache = new Map<string, Promise<ReadonlySet<string>>>();
function setsFor(decl: (typeof LANGUAGE_DECLS)[number]): Promise<DerivedNodeSets> {
  let p = setsCache.get(decl.id);
  if (!p) { p = nodeSetsFor(decl.wasm, decl.probeSource, decl.extraCloneNodes, decl.functionExclusions); setsCache.set(decl.id, p); }
  return p;
}
async function capsFor(decl: (typeof LANGUAGE_DECLS)[number]): Promise<ReadonlySet<string>> {
  let p = capsCache.get(decl.id);
  if (!p) {
    p = (async () => {
      const sets = await setsFor(decl);
      const probeRoot = await parseRoot(decl.wasm, decl.probeSource);
      return deriveCapabilities(probeRoot, sets) as ReadonlySet<string>;
    })();
    capsCache.set(decl.id, p);
  }
  return p;
}
const byExt = new Map<string, (typeof LANGUAGE_DECLS)[number]>();
for (const d of LANGUAGE_DECLS) for (const e of d.extensions) byExt.set(e, d);

const FAKE_REPO: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };

/** Mismo envoltorio mínimo que `state.test.ts` usa: el builder sólo lee título, locations, evidence y kind. */
function toFinding(raw: RawFinding, language: string): Finding {
  return { ...raw, id: "f-sonda", detectorId: "temporary-field", kind: "temporary-field", scope: "intra-file", language };
}

const out: Record<string, unknown>[] = [];
let sinGramatica = 0;
for (const it of items) {
  const rootDir = it.pop === "LIB" ? "corpus" : "corpus-app";
  const abs = path.join("/home/maxi1805/claude-kanban", rootDir, it.repo, it.file);
  const decl = byExt.get(path.extname(it.file));
  if (!decl) { sinGramatica++; continue; }
  const sets = await setsFor(decl);
  const caps = await capsFor(decl);
  let src: string;
  try { src = readFileSync(abs, "utf8"); } catch { continue; }
  const astRoot = await parseRoot(decl.wasm, src);
  const file = fileUnitFrom(astRoot, sets, decl.id, { file: it.file });
  const raw = temporaryFieldDetector.run(file, testContext(temporaryFieldDetector, decl.id));
  const ctx: HypothesisContext = {
    file,
    fileAt: () => null,
    repo: FAKE_REPO,
    capabilities: caps as HypothesisContext["capabilities"],
    setsFor: () => sets,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
  for (const r of raw) {
    const finding = toFinding(r, decl.id);
    const h = stateBuilder.build(finding, null, ctx);
    out.push({
      pop: it.pop, repo: it.repo, file: it.file, title: finding.title,
      where: finding.locations.map((l) => `${l.file}:${l.startLine}`),
      emite: h !== null,
      state: h?.state ?? null,
      muereEn: h === null ? "descartada por un required" : null,
      checks: h ? null : undefined,
    });
  }
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`archivos ${items.length} · sin gramática ${sinGramatica} · hallazgos ${out.length} · emiten ${out.filter((o) => o.emite).length}`);
