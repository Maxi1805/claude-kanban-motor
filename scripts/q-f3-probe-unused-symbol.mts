/**
 * Sonda del frente F3 (Ola Q) — DE QUÉ ESTÁ HECHO el volumen de
 * `unused-symbol`, sobre el pipeline real (`analyzeRepo` + `onGraph`).
 *
 * Contesta tres preguntas que ni el volumen ni la precisión muestran:
 *
 *  1. ¿En qué lenguajes acredita la PUERTA 3 (`memberUseSeenIn`)? O sea:
 *     ¿llega alguna arista de consumo con rol `receiver-member` que la cascada
 *     haya sabido ATRIBUIR? Donde no llega, el detector calla sobre TODO
 *     miembro de ese lenguaje, y eso no es una elección del detector.
 *  2. ¿Cuántos nodos traen `memberOfClassLike: true` con `symbolPath` de UN
 *     solo segmento — o sea, la forma que sólo el receptor escrito produce?
 *  3. ¿Cuántos nodos de nivel superior traen `exported: false` (evidencia
 *     negativa real) y cuántos `true` (default permisivo)?
 *
 * Uso: npx tsx scripts/q-f3-probe-unused-symbol.mts <dir> [<dir> ...]
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { edgeHasRole, edgeIsAmbiguous, type CodeGraph, type EdgeKind } from "../src/server/services/graph/types.js";

const CONSUMER: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "references",
  "calls",
  "instantiates",
  "invokes-indirect",
  "carries",
  "extends",
  "implements",
  "satisfies",
  "mixes-in",
]);

for (const dir of process.argv.slice(2)) {
  let capturado: CodeGraph | null = null;
  const analysis = await analyzeRepo({
    dir,
    repoName: "q-f3",
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      capturado = r.graph;
    },
  });
  if (!capturado) {
    console.log(`${dir}: sin grafo`);
    continue;
  }
  const g: CodeGraph = capturado;
  const langByFile = new Map(analysis.files.map((f) => [f.path, f.language]));
  const fileByNode = new Map(g.nodes.map((n) => [n.id, n.file]));
  const langOf = (id: string): string => {
    const f = fileByNode.get(id);
    return f === undefined ? "?" : (langByFile.get(f) ?? "?");
  };

  const acredita = new Map<string, number>();
  const ambiguasReceptor = new Map<string, number>();
  for (const e of g.edges) {
    if (!CONSUMER.has(e.kind)) continue;
    if (!edgeHasRole(e, "receiver-member")) continue;
    const l = langOf(e.to);
    if (edgeIsAmbiguous(e)) ambiguasReceptor.set(l, (ambiguasReceptor.get(l) ?? 0) + 1);
    else acredita.set(l, (acredita.get(l) ?? 0) + 1);
  }

  const receptorEscrito = new Map<string, number>();
  const exportadoFalse = new Map<string, number>();
  const exportadoTrue = new Map<string, number>();
  const exportadoAusente = new Map<string, number>();
  for (const n of g.nodes) {
    if (n.kind !== "symbol") continue;
    const l = langByFile.get(n.file) ?? "?";
    if (n.symbolPath.length === 1) {
      if (n.memberOfClassLike === true) receptorEscrito.set(l, (receptorEscrito.get(l) ?? 0) + 1);
      if (n.exported === false) exportadoFalse.set(l, (exportadoFalse.get(l) ?? 0) + 1);
      else if (n.exported === true) exportadoTrue.set(l, (exportadoTrue.get(l) ?? 0) + 1);
      else exportadoAusente.set(l, (exportadoAusente.get(l) ?? 0) + 1);
    }
  }

  const hallazgos = analysis.findings.filter((f) => f.kind === "unused-symbol");
  const sev = new Map<string, number[]>();
  // GUARDIÁN DEL GRAFO — `analyzeRepo` devuelve `CodeAnalysis.findings: CodeFinding[]`
  // (`shared/types.ts`), y `toCodeFinding` (`code-analyzer.ts`) borra `role` a propósito
  // al cruzar la frontera pública: `RoleLocation.role` (`detect/types.ts`) nunca llega acá.
  // El bloque original leía `loc.role` sobre `CodeLocation` (`code-suggest.ts`), que no lo
  // tiene — no tipaba, y en runtime habría impreso "(sin rol)" para TODAS las ubicaciones,
  // sin avisar. Sacado: no hay forma de reconstruir el rol desde la API pública sin volver
  // a correr el registro de detectores.


  const langs = [...new Set([...langByFile.values()])].sort();
  console.log(`\n===== ${dir} — ${g.nodes.length} nodos, ${g.edges.length} aristas =====`);
  console.log(
    `${"lenguaje".padEnd(12)} ${"recv-mbr atrib".padStart(15)} ${"recv-mbr ambig".padStart(15)} ` +
      `${"receptor escr.".padStart(15)} ${"exp=false".padStart(10)} ${"exp=true".padStart(9)} ${"exp ausente".padStart(12)} ` +
      `${"hallazgos".padStart(10)} ${"sev media".padStart(10)}`,
  );
  for (const l of langs) {
    const s = sev.get(l) ?? [];
    const media = s.length === 0 ? "-" : (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1);
    console.log(
      `${l.padEnd(12)} ${String(acredita.get(l) ?? 0).padStart(15)} ${String(ambiguasReceptor.get(l) ?? 0).padStart(15)} ` +
        `${String(receptorEscrito.get(l) ?? 0).padStart(15)} ${String(exportadoFalse.get(l) ?? 0).padStart(10)} ` +
        `${String(exportadoTrue.get(l) ?? 0).padStart(9)} ${String(exportadoAusente.get(l) ?? 0).padStart(12)} ` +
        `${String(s.length).padStart(10)} ${media.padStart(10)}`,
    );
  }
  const confinadas = hallazgos.filter((f) => f.detail.includes("alcanzable SÓLO desde adentro"));
  const porLangConf = new Map<string, number>();
  for (const f of confinadas) {
    const l = langByFile.get(f.locations[0]?.file ?? "") ?? "?";
    porLangConf.set(l, (porLangConf.get(l) ?? 0) + 1);
  }
  console.log(`  hallazgos con exposición CONFINADA declarada: ${confinadas.length} — ${[...porLangConf].map(([k, v]) => `${k}:${v}`).join(", ") || "ninguno"}`);
}
