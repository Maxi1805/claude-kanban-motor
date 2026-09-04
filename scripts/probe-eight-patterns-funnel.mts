/**
 * Sonda B3 (Ola B) — el embudo ancla → required → estado, para los 8
 * patrones mudos (Abstract Factory, Composite, Factory Method, Null Object,
 * Observer, Prototype, State, Template Method) sobre UNA población.
 *
 * Corre `analyzeRepo` real (mismo pipeline de producción, `attachHypotheses`
 * incluido) y, para cada patrón, cuenta:
 *   1. ancla   — Findings cuyo `kind` está en `HypothesisBuilder.anchors`.
 *   2. build   — de esos, cuántos tienen >=1 `PatternHypothesis` de ESE
 *                patrón colgada (`finding.hypotheses`) — sobrevivieron
 *                `required` (y, para null-object/prototype, la búsqueda
 *                interna de candidato antes de siquiera llamar al motor).
 *   3. estados — de (2), histograma de `state`.
 *
 * anchor - build = cuántos Findings-ancla NUNCA llegaron a `PatternHypothesis`
 * (required rechazó, o el propio `build()` de la hipótesis no encontró
 * candidato antes de invocar al motor — ver hypotheses/null-object.ts y
 * hypotheses/prototype.ts, que pueden devolver `null` ANTES del `engine.build`).
 *
 * Uso: npx tsx scripts/probe-eight-patterns-funnel.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding } from "../src/shared/types.js";

interface PatternSpec {
  pattern: string;
  anchors: readonly string[];
}

const EIGHT: readonly PatternSpec[] = [
  { pattern: "Abstract Factory", anchors: ["parallel-hierarchies"] },
  { pattern: "Composite", anchors: ["distributed-duplication"] },
  { pattern: "Factory Method", anchors: ["conditional-chain"] },
  { pattern: "Null Object", anchors: ["distributed-duplication"] },
  { pattern: "Observer", anchors: ["manual-notification"] },
  { pattern: "Prototype", anchors: ["speculative-abstraction"] },
  { pattern: "State", anchors: ["repeated-switch"] },
  { pattern: "Template Method", anchors: ["distributed-duplication", "parallel-hierarchies", "large-class", "refused-bequest", "inheritance-family"] },
];

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/probe-eight-patterns-funnel.mts <dir> <slug>");
    process.exit(1);
  }
  const collected: CodeFinding[] = [];
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onPreCapFindings: (findings) => {
      collected.push(...findings);
    },
  });
  const wallMs = Math.round(performance.now() - t0);
  // `onPreCapFindings` ya corre DESPUÉS de `attachHypotheses` (verificado
  // leyendo code-analyzer.ts: attachHypotheses en crossAnalyze corre antes de
  // computar rankedGroupFindings, que es lo que onPreCapFindings recibe) —
  // mismo universo, sin cap, que `analysis.findings` bajo maxFindings:
  // "unlimited". Se usa `collected` (más explícito sobre el momento).
  const findings = collected.length > 0 ? collected : analysis.findings;

  console.log(`\n########## ${slug} (${dir}) — wallMs=${wallMs}, totalFindings=${findings.length} ##########\n`);

  const findingsByKind = new Map<string, CodeFinding[]>();
  for (const f of findings) {
    const list = findingsByKind.get(f.kind) ?? [];
    list.push(f);
    findingsByKind.set(f.kind, list);
  }
  console.log("Findings por kind (todos, para contexto de anclas):");
  for (const [kind, list] of [...findingsByKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${kind}: ${list.length}`);
  }
  console.log("");

  for (const spec of EIGHT) {
    const anchorFindings = spec.anchors.flatMap((k) => findingsByKind.get(k) ?? []);
    const withHyp = anchorFindings.filter((f) => (f.hypotheses ?? []).some((h) => h.pattern === spec.pattern));
    const withoutHyp = anchorFindings.filter((f) => !(f.hypotheses ?? []).some((h) => h.pattern === spec.pattern));

    console.log(`=== ${spec.pattern} (anclas: ${spec.anchors.join(", ")}) ===`);
    console.log(`  1. ancla (Findings de ese kind): ${anchorFindings.length}`);
    console.log(`  2. con hipótesis "${spec.pattern}" colgada (sobrevivió required + build interno): ${withHyp.length}`);
    console.log(`  2b. SIN hipótesis (required rechazó, o build() no encontró candidato antes del motor): ${withoutHyp.length}`);

    if (withHyp.length > 0) {
      const byState = new Map<string, number>();
      const byConfidence = new Map<string, number>();
      for (const f of withHyp) {
        const h = f.hypotheses!.find((h) => h.pattern === spec.pattern)!;
        byState.set(h.state, (byState.get(h.state) ?? 0) + 1);
        byConfidence.set(String(h.confidence), (byConfidence.get(String(h.confidence)) ?? 0) + 1);
      }
      console.log(`  3. estados: ${JSON.stringify(Object.fromEntries(byState))}`);
      console.log(`  3b. confianza: ${JSON.stringify(Object.fromEntries(byConfidence))}`);
      // Un ejemplo por estado, con sus checks — para leer POR QUÉ a mano.
      const seen = new Set<string>();
      for (const f of withHyp) {
        const h = f.hypotheses!.find((h) => h.pattern === spec.pattern)!;
        if (seen.has(h.state)) continue;
        seen.add(h.state);
        const loc = f.locations[0];
        console.log(`  ejemplo [${h.state}] conf=${h.confidence} @ ${loc ? `${loc.file}:${loc.startLine}` : "?"}`);
        for (const c of h.checks) {
          console.log(`      [${c.passed ? "OK" : "NO"}] (${c.role ?? "?"}) ${c.label}`);
        }
      }
    } else if (anchorFindings.length > 0) {
      console.log(`  ejemplos de Findings-ancla SIN hipótesis (primeros 3):`);
      for (const f of anchorFindings.slice(0, 3)) {
        const loc = f.locations[0];
        console.log(`      ${f.kind} @ ${loc ? `${loc.file}:${loc.startLine}` : "?"} — "${f.title}"`);
      }
    } else {
      console.log(`  (sin Findings-ancla en esta corrida: el detector-ancla no produjo nada de este kind.)`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
