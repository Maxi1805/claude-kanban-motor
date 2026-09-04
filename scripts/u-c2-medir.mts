/**
 * Medición C2 (Ola U) — UNA sola corrida de `analyzeRepo` por repo que talla
 * a la vez las DOS cosas que este frente tiene que reportar:
 *
 *   1. GRAFO: nodos por kind y por family, aristas por kind. El impacto de
 *      agregar nodos hijos de campo (hueco #1) se mide como DELTA contra la
 *      corrida de antes — nunca como absoluto (regla del CONTEXTO §6:
 *      "un volcado de grafo SE VENCE").
 *   2. HIPÓTESIS: por patrón × estado, más el conteo de RECOMENDACIONES
 *      REALES (`ausente` + `parcial`), que es lo único que le sirve al
 *      usuario.
 *
 * Correrlo dos veces (antes/después) con el MISMO repo y comparar con
 * `u-c2-diff.mts`.
 *
 * Uso: npx tsx scripts/u-c2-medir.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

function tally(values: Iterable<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function main(): Promise<void> {
  const [, , dir, slug, outFile] = process.argv;
  if (!dir || !slug || !outFile) {
    console.error("uso: npx tsx scripts/u-c2-medir.mts <dir> <slug> <salida.json>");
    process.exitCode = 1;
    return;
  }
  const rootDir = path.resolve(dir);
  const state: { graph: CodeGraph | null } = { graph: null };

  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      state.graph = r.graph;
    },
  });

  const g = state.graph;
  const hipotesis: Record<string, Record<string, number>> = {};
  let recomendaciones = 0;
  let totalHipotesis = 0;
  for (const f of analysis.findings) {
    for (const h of f.hypotheses ?? []) {
      const porEstado = (hipotesis[h.pattern] ??= {});
      porEstado[h.state] = (porEstado[h.state] ?? 0) + 1;
      totalHipotesis++;
      if (h.state === "ausente" || h.state === "parcial") recomendaciones++;
    }
  }

  const out = {
    slug,
    hallazgos: analysis.findings.length,
    hallazgosPorKind: tally(analysis.findings.map((f) => f.kind)),
    totalHipotesis,
    recomendaciones,
    hipotesis: Object.fromEntries(Object.entries(hipotesis).sort(([a], [b]) => a.localeCompare(b))),
    grafo: g
      ? {
          nodos: g.nodes.length,
          aristas: g.edges.length,
          nodosPorKind: tally(g.nodes.map((n) => n.kind)),
          nodosPorFamily: tally(g.nodes.map((n) => n.family ?? "sin-family")),
          aristasPorKind: tally(g.edges.map((e) => e.kind)),
          aristasPorProvenance: tally(g.edges.map((e) => e.provenance)),
          // Ola U (C2), HUECO #2 — cobertura del tipo de retorno: de los nodos
          // `function-like`, ¿cuántos traen `returnType`? El resto es un `no
          // sé`, nunca "no devuelve" (ver el docstring del campo).
          funcionesConRetorno: g.nodes.filter((n) => n.family === "function-like" && n.returnType !== undefined).length,
          funcionesTotales: g.nodes.filter((n) => n.family === "function-like").length,
        }
      : null,
  };

  const p = path.resolve(outFile);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.error(
    `${slug}: ${analysis.findings.length} hallazgos · ${totalHipotesis} hipótesis (${recomendaciones} recomendaciones) · ` +
      `${g ? `${g.nodes.length} nodos / ${g.edges.length} aristas` : "SIN GRAFO"} -> ${p}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
