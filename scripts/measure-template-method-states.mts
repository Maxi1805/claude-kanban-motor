/**
 * Ola 10 (F10, agente Template Method) — estados por repo, vía el pipeline
 * REAL (`analyzeRepo`). Ancla: `distributed-duplication` (primaria) /
 * `parallel-hierarchies` (secundaria). Cuenta ausente/parcial/ya-aplicado/
 * aplicado-eludido sobre `finding.hypotheses` con `pattern === "Template
 * Method"` — y, para los `ya-aplicado`, si el check de gancho
 * (CONTRATO-F10.md §2, la forma COMPLETA con `calls`) quedó confirmado o
 * sólo declarado como no confirmado (ver `hypotheses/template-method.ts`,
 * "REQUISITO 3").
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-template-method-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-template-method-states.mts <dir> <slug>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);

  const states: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const examples: Record<string, string[]> = { ausente: [], parcial: [], "ya-aplicado": [], "aplicado-eludido": [] };
  let anchored = 0;
  let hookConfirmed = 0;
  let hookDeclaredNotConfirmed = 0;

  for (const f of analysis.findings) {
    const h = f.hypotheses?.find((x) => x.pattern === "Template Method");
    if (!h) continue;
    anchored++;
    states[h.state] = (states[h.state] ?? 0) + 1;
    if (examples[h.state]!.length < 8) {
      examples[h.state]!.push(`${f.locations[0]?.file}:${f.locations[0]?.startLine} (${f.locations[0]?.symbol ?? "?"})`);
    }
    if (h.state === "ya-aplicado") {
      const hookCheck = (h.checks ?? []).find((c) => typeof c.label === "string" && c.label.includes("gancho"));
      if (hookCheck) {
        if (hookCheck.passed) hookConfirmed++;
        else hookDeclaredNotConfirmed++;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        totalFindings: analysis.findings.length,
        anchored,
        states,
        hookConfirmed,
        hookDeclaredNotConfirmed,
        examples,
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
