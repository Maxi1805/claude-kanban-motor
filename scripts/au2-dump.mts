/**
 * OLA AU - FRENTE AU2 - VOLCADO DE LAS DOS FAMILIAS DE DUPLICACION.
 *
 * Corre `analyzeRepo` sobre la COPIA CONGELADA `scratchpad-au2/src0` (el arbol
 * real se mueve: siete frentes en paralelo). Emite:
 *   1. `censo`: hallazgos por kind.
 *   2. `hipotesis`: (findingId, kind, pattern, state) de TODA hipotesis colgada
 *      - la linea base contra la que se verifica que los 19 patrones no se
 *      movieron. De MIS DOS nombres se guarda la propuesta ENTERA
 *      (`places`/`cost`/`checks`/`discriminadores`), que es lo unico con lo que
 *      se puede juzgar abriendo el archivo.
 *   3. `traza`: el EMBUDO completo de las dos familias - por que muere cada
 *      candidato, candidato por candidato. Sin esto no se puede decir en que
 *      compuerta se va la poblacion.
 *   4. `anclas`: el registro de cada hallazgo de `duplication` y
 *      `distributed-duplication` (titulo, detalle, ubicaciones).
 *
 * Uso: npx tsx scripts/au2-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-au2/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);
const edm: any = await import(`${S0}/server/services/hypotheses/extract-duplicated-method.js`);
const pud: any = await import(`${S0}/server/services/hypotheses/pull-up-duplicated-member.js`);

const ANCLAS = new Set(["duplication", "distributed-duplication"]);
const MIOS = new Set(["Extract Duplicated Method", "Pull Up Duplicated Member"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) {
  console.error("Uso: npx tsx scripts/au2-dump.mts <dir-repo> <nombre> <salida.json>");
  process.exit(1);
}

edm.startExtractDuplicatedMethodTrace();
pud.startPullUpDuplicatedMemberTrace();

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const trazaEdm = edm.takeExtractDuplicatedMethodTrace();
const trazaPud = pud.takePullUpDuplicatedMemberTrace();

const censo: Record<string, number> = {};
const hipotesis: any[] = [];
const anclas: any[] = [];

for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const fila: any = { id, kind: f.kind, pattern: h.pattern, state: h.state, confidence: h.confidence ?? null };
    if (MIOS.has(h.pattern)) {
      fila.file = f.locations[0]?.file ?? "";
      fila.language = f.language ?? null;
      fila.cost = h.cost ?? null;
      fila.title = f.title;
      fila.places = (h.places ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role }));
      fila.checks = (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role }));
      fila.discriminadores = (h.discriminators ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why }));
    }
    hipotesis.push(fila);
  }
  if (!ANCLAS.has(f.kind)) continue;
  anclas.push({
    id,
    kind: f.kind,
    language: f.language,
    title: f.title,
    detail: f.detail.length > 700 ? f.detail.slice(0, 700) : f.detail,
    locations: f.locations.map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}

writeFileSync(
  out,
  JSON.stringify({ repo: nombre, dir, wallMs, totalHallazgos: a.findings.length, censo, anclas, hipotesis, trazaEdm, trazaPud }, null, 1),
);
const mias = hipotesis.filter((h) => MIOS.has(h.pattern)).length;
console.error(`${nombre}: ${a.findings.length} hallazgos - ${anclas.length} anclas - ${mias} propuestas mias - traza ${trazaEdm.length}/${trazaPud.length} - ${wallMs} ms`);
