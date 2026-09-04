/** Depuración AH3: por qué un `complexity` concreto no recibe la hipótesis. */
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { hypothesis as extractMethod, analizarFormaAnidada } from "../src/server/services/hypotheses/extract-method.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import type { AstNode, Finding, FileUnit } from "../src/server/services/detect/types.js";
import type { HypothesisContext } from "../src/server/services/hypotheses/types.js";

const [, , dir, relPath, startArg] = process.argv;
const start = Number(startArg);
const live = await resolveLiveFileUnit(dir!, relPath!);
if (!live) { console.log("SIN ARBOL"); process.exit(0); }
const unit: FileUnit = live.unit;
const cands = unit.functions.filter((f) => f.startLine === start);
console.log("funciones con ese startLine:", cands.map((f) => [f.name, f.startLine, f.endLine, f.metrics.cognitive, f.metrics.maxNesting]));
for (const fn of cands) {
  const finding = {
    id: "dbg", detectorId: "complexity", kind: "complexity", scope: "intra-function", language: unit.language,
    title: "dbg", detail: "d", trigger: [],
    locations: [{ file: unit.path, startLine: fn.startLine, endLine: fn.endLine, symbol: fn.name ?? "", role: "r" }],
    severity: 50, advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
  } as unknown as Finding;
  const ctx = {
    file: unit, fileAt: (p: string) => (p === unit.path ? unit : null),
    repo: { repoName: "dbg", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set(), setsFor: () => unit.sets, neighborhood: EMPTY_NEIGHBORHOOD, branches: () => null,
  } as unknown as HypothesisContext;
  const forma = analizarFormaAnidada(finding, ctx);
  console.log("forma:", forma && { nombre: forma.nombre, maxNesting: forma.maxNesting, bloques: forma.bloques.length, gemelo: forma.gemeloLargoQueYaPropone });
  if (forma) for (const b of forma.bloques) console.log("   bloque", b);
  const built = extractMethod.build(finding, null, ctx);
  console.log("build:", built ? built.state : null);
  if (built) for (const c of built.checks) console.log("   check", c.passed, c.label.slice(0, 90));
}
live.release();
