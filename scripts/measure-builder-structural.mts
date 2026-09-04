/**
 * Ola 10/11 — Builder, verificación del excluder ESTRUCTURAL nuevo
 * (`hypotheses/builder.ts#evaluateGraphShape`) contra un repo real, vía el
 * grafo REAL (`analyzeRepo#onGraph`).
 *
 * POR QUÉ ESTE SCRIPT LLAMA `hypothesis.build` DIRECTAMENTE, NO SÓLO LEE
 * `finding.hypotheses`: el ancla de Builder (`long-parameter-list`/
 * `data-clump`) es `intra-function`/`intra-file`, así que su ÚNICO paso por
 * `attachHypotheses` en producción ocurre DENTRO de `analyzeFile`
 * (`code-analyzer.ts`), ANTES de que `repo.graph` exista — ahí SIEMPRE es
 * `null` (confirmado leyendo `code-analyzer.ts`, ver el docstring de
 * `builder.ts`, §"LÍMITE DE CABLEADO ESTRUCTURAL"). La única pasada
 * posterior con grafo real (`refreshHypotheses`) nunca vuelve a llamar
 * `builder.build` — sólo `refresh` (discriminadores/confianza, nunca
 * `state`), y Builder no lo implementa. Así que `analysis.findings[].
 * hypotheses` de esta corrida SIEMPRE va a mostrar el resultado con
 * `graph=null` (declarado, no un bug de este script). Este script mide la
 * pregunta DISTINTA — "¿la lógica estructural, con un grafo real, encuentra
 * la forma?" — llamando `hypothesis.build(finding, graph, ctx)` una segunda
 * vez, a mano, con el grafo real capturado por `onGraph`.
 *
 * ADAPTADOR `CodeFinding` (público, HTTP) → `Finding` (interno,
 * `detect/types.ts`): `analyzeRepo` sólo devuelve el primero
 * (`CodeAnalysis.findings: CodeFinding[]`, `shared/types.ts`), que YA NO
 * tiene `.trigger`/`.scope`/`.language` (los aplana a `.metric: {label,
 * value}`). `hypothesis.build`/`evaluateGraphShape` sólo leen `.kind` y
 * `.locations` de la parte estructural, y `.trigger[0]` (label+value) del
 * lado `required`/`discriminator` — así que el adaptador de abajo alcanza
 * sin fingir datos que la lógica no usa.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-builder-structural.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { Capability } from "../src/server/services/detect/capabilities.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { Finding, RoleLocation } from "../src/server/services/detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import { hypothesis } from "../src/server/services/hypotheses/builder.js";
import type { HypothesisContext } from "../src/server/services/hypotheses/types.js";
import type { CodeFinding } from "../src/shared/types.js";

function ctxFor(graph: CodeGraph | null): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: { repoName: "", files: [], functions: [], clones: [], graph },
    // Builder.needs === [] — ninguna capacidad gatea esta hipótesis.
    capabilities: new Set<Capability>(),
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/** Ver el docstring del módulo — adaptador mínimo, suficiente para lo que `builder.ts` lee. */
function toInternalFinding(cf: CodeFinding): Finding | null {
  if (cf.locations.length === 0) return null;
  const threshold = resolveThreshold(pisoDeclarado(cf.metric.value, { rationale: "adaptador de medición (no de producción)" }), {
    language: "javascript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
  const locations = cf.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol, role: "n/a" })) as [
    RoleLocation,
    ...RoleLocation[],
  ];
  return {
    id: cf.id ?? `${cf.kind}:${locations[0]?.file ?? ""}:${locations[0]?.startLine ?? 0}`,
    detectorId: cf.kind,
    kind: cf.kind,
    scope: "intra-function",
    language: null,
    title: cf.title,
    detail: cf.detail,
    trigger: [{ label: cf.metric.label, value: cf.metric.value, threshold }],
    locations,
    severity: cf.severity,
    advice: cf.advice ?? { primary: { name: "n/a", kind: "refactorizacion", why: "n/a", source: "n/a" } },
  };
}

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-builder-structural.mts <dir> <slug>");
    process.exit(1);
  }

  let graph: CodeGraph | null = null;
  const analysis = await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
    },
  });

  const anchors = new Set<string>(hypothesis.anchors);
  const candidates = analysis.findings.filter((f) => anchors.has(f.kind));

  const ctx = ctxFor(graph);
  const counts: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0, "sin-candidata": 0 };
  const examples: Record<string, string[]> = { parcial: [], "ya-aplicado": [], "aplicado-eludido": [], ausente: [] };

  for (const cf of candidates) {
    const finding = toInternalFinding(cf);
    if (!finding) continue;
    const h = hypothesis.build(finding, graph, ctx);
    if (!h) {
      counts["sin-candidata"] = (counts["sin-candidata"] ?? 0) + 1;
      continue;
    }
    counts[h.state] = (counts[h.state] ?? 0) + 1;
    if (examples[h.state] && examples[h.state]!.length < 8) {
      const loc = finding.locations[0];
      const applied = h.checks.find((c) => c.role === "applied" && c.passed) ?? h.checks.find((c) => c.role === "applied");
      examples[h.state]!.push(`${loc?.file}:${loc?.startLine} (${loc?.symbol ?? "?"}) — ${applied?.label ?? "?"}: ${applied?.why ?? "?"}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        totalCandidateFindings: candidates.length,
        estados: counts,
        ejemplos: examples,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
