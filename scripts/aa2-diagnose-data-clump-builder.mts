/**
 * Ola AA (frente AA2) — INSTRUMENTACIÓN, no cambio de criterio.
 *
 * Pregunta del encargo: `data-clump` está DECLARADO ancla de Builder
 * (`hypotheses/builder.ts#hypothesis.anchors`) y sin embargo lleva cuatro
 * olas sin una sola recomendación. Este script mide, sobre un repo real:
 *   1. cuántos `Finding` `data-clump` hay hoy;
 *   2. cuántos entran a `builder.ts#build()` (el ancla no filtra por nada
 *      más — ver `hypotheses/run.ts#attachHypotheses`, todo `Finding` cuyo
 *      `kind` está en `anchors` pasa por `build()` de cada builder aplicable,
 *      sin importar cuántas `locations` tenga ni nada más);
 *   3. de los que NO llegan a candidata, EN QUÉ `required` mueren primero
 *      (`ancla-reconocida` / `construye-una-entidad` / `ensambla-con-logica`);
 *   4. de los que SÍ llegan a candidata, con QUÉ ESTADO salen
 *      (`ausente`/`parcial` = recomendación; `ya-aplicado`/`aplicado-eludido`
 *      = NO es recomendación, CONTEXTO.md §4).
 *
 * CÓMO MIDE SIN CAMBIAR EL CRITERIO: usa el side-channel
 * `builder.ts#setRequiredDiagnostics` (mismo patrón que `AnalyzeOptions.
 * onGraph`/`onFacts` de `code-analyzer.ts` — opt-in, cero costo si nadie lo
 * setea), que entrega el resultado de los TRES `required` de CADA `Finding`
 * `data-clump` real que pasa por `build()`, en el ÚNICO momento en que
 * `ctx.file` es el árbol VIVO (dentro de `analyzeFile`, antes de
 * `tree.delete()` — el mismo `ctx` que ve la producción, no uno reconstruido
 * a mano). El hook guarda la REFERENCIA al `Finding` interno; como
 * `attachHypotheses` muta `finding.hypotheses` in-place sobre ESE MISMO
 * objeto un poco más adelante en la misma corrida síncrona, leer
 * `finding.hypotheses` DESPUÉS de que `analyzeRepo()` resuelve alcanza para
 * saber el estado final de los que sí llegaron a candidata — sin
 * re-implementar `appliedState` a mano ni arriesgar que diverja.
 *
 * UN repo por proceso, regla de memoria del proyecto.
 *
 * Uso:
 *   npx tsx scripts/aa2-diagnose-data-clump-builder.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { Finding } from "../src/server/services/detect/types.js";
import { setRequiredDiagnostics } from "../src/server/services/hypotheses/builder.js";

interface RequiredResult {
  id: string;
  holds: boolean;
  evidence: string;
}

interface Diag {
  finding: Finding;
  results: readonly RequiredResult[];
}

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/aa2-diagnose-data-clump-builder.mts <dir> <slug>");
    process.exit(1);
  }

  // Claves por `finding.id`, se queda con la ÚLTIMA — `builder.build()` se
  // llama DOS VECES por `Finding` `intra-file` en producción hoy (Ola V,
  // `hypotheses/run.ts#rebuildHypothesesWithGraph`): pasada 1 dentro de
  // `analyzeFile` con `graph=null`, pasada 2 dentro de `crossAnalyze` con el
  // grafo REAL del repo — y la pasada 2 SOBREESCRIBE `finding.hypotheses`
  // (`run.ts:369`), nunca lo funde con la 1. Los tres `required` de Builder no
  // leen `graph` (verificado: `anclaReconocida`/`construyeUnaEntidad` ignoran
  // el parámetro; `ensamblaConLogica` sólo lee `ctx.file`, el MISMO árbol en
  // las dos pasadas) así que el resultado de la compuerta es idéntico en
  // ambas — pero contar las dos duplicaría cada `Finding`. La ÚLTIMA es la
  // autoritativa porque es la que decide `finding.hypotheses` final.
  const diagsById = new Map<string, Diag>();
  setRequiredDiagnostics((problem, results) => {
    if (problem.kind !== "data-clump") return;
    diagsById.set(problem.id, { finding: problem, results });
  });

  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);

  setRequiredDiagnostics(null); // apaga el hook — el módulo es compartido por proceso.

  const totalDataClumpFindings = analysis.findings.filter((f) => f.kind === "data-clump").length;

  const gateCounts: Record<string, number> = {};
  const stateCounts: Record<string, number> = {};
  const examples: Record<string, string[]> = {};
  // Sonda: de los que mueren en `construye-una-entidad` (nunca llegan a
  // evaluar `ensambla-con-logica` por el cortocircuito de `engineBuild`),
  // ¿cuántos HABRÍAN mostrado ensamblaje real si la compuerta 1 no los
  // hubiera cortado? Responde "¿la compuerta 1 esconde candidatas que la
  // compuerta 2 habría aprobado?" — independiente de si la compuerta 1 es
  // imprecisa reconociendo constructores por símbolo (Java/C#/Go nombrados
  // como su clase).
  let bypassWouldShowAssembly = 0;
  let bypassChecked = 0;
  const bypassExamples: string[] = [];

  const CAP = process.env.AA2_EXAMPLES_CAP ? Number(process.env.AA2_EXAMPLES_CAP) : 6;
  function pushExample(bucketKey: string, text: string): void {
    const bucket = examples[bucketKey] ?? (examples[bucketKey] = []);
    if (bucket.length < CAP) bucket.push(text);
  }

  const diags = [...diagsById.values()];
  for (const d of diags) {
    const loc = d.finding.locations[0];
    const locText = loc ? `${d.finding.id} ${loc.file}:${loc.startLine} (${loc.symbol ?? "?"})` : "?";

    const realRequired = d.results.filter((r) => !r.id.includes("sonda"));
    const sonda = d.results.find((r) => r.id.includes("sonda"));

    const firstFail = realRequired.find((r) => !r.holds);
    if (firstFail) {
      gateCounts[firstFail.id] = (gateCounts[firstFail.id] ?? 0) + 1;
      pushExample(`compuerta:${firstFail.id}`, `${locText} — ${firstFail.evidence}`);
      if (firstFail.id === "construye-una-entidad" && sonda) {
        bypassChecked++;
        if (sonda.holds) {
          bypassWouldShowAssembly++;
          if (bypassExamples.length < 30) bypassExamples.push(`${locText} — SONDA: ${sonda.evidence}`);
        }
      }
      continue;
    }

    // Los tres `required` sostuvieron: es candidata. El estado final lo
    // decide `appliedState`, ya corrido por el `build()` real (no acá).
    const h = (d.finding.hypotheses ?? []).find((hh) => hh.pattern === "Builder");
    const state = h?.state ?? "CANDIDATA-SIN-HIPOTESIS(bug de medición)";
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
    pushExample(`estado:${state}`, locText);
  }

  console.log(
    JSON.stringify(
      {
        slug,
        dir: path.resolve(dir),
        wallMs,
        totalDataClumpFindingsEnAnalysisFindings: totalDataClumpFindings,
        totalDataClumpDiagnosticados: diags.length,
        gateCounts,
        stateCounts,
        bypassChecked,
        bypassWouldShowAssembly,
        bypassExamples,
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
