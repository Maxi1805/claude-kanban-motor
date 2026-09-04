/**
 * OLA AX - FRENTE AX6 - VOLCADO PARA MEDIR EL DELTA DEL CABLE DE `repo.functions`.
 *
 * Corre `analyzeRepo` desde el arbol que se le indique por la variable de entorno
 * `AX6_SRC` (`../scratchpad-ax6/src0` = LINEA BASE congelada al arrancar la ola;
 * `../src` = arbol real con el arreglo) y emite:
 *   - censo de nivel 1 kind por kind
 *   - censo de nivel 2 (patron x estado) + la lista de ids en estado `ausente`
 *     (la PROPUESTA emitida), que es lo que no se puede mover
 *   - los registros COMPLETOS de los kinds bajo observacion (`middle-man`,
 *     `modulo-envy`, `commented-out-code`)
 *   - las filas de cobertura de esos detectores
 *
 * Uso: AX6_SRC=../src npx tsx scripts/ax6-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const SRC = process.env.AX6_SRC ?? "../scratchpad-ax6/src0";
const { analyzeRepo } = await import(`${SRC}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${SRC}/server/services/code-finding-ids.js`);

const MIOS = new Set(["middle-man", "modulo-envy", "commented-out-code"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("uso: <dir> <nombre> <salida>"); process.exit(1); }

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const censo: Record<string, number> = {};
const nivel2: Record<string, number> = {};
const ausentes: string[] = [];
const registros: any[] = [];

for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const k = `${h.pattern}|${h.state}`;
    nivel2[k] = (nivel2[k] ?? 0) + 1;
    if (h.state === "ausente") ausentes.push(`${h.pattern}|${id}`);
  }
  if (!MIOS.has(f.kind)) continue;
  registros.push({
    id, kind: f.kind, scope: f.scope, language: f.language, severity: f.severity, title: f.title,
    detail: (f.detail ?? "").slice(0, 2600),
    trigger: (f.trigger ?? []).map((m: any) => ({ label: m.label, value: m.value, umbral: m.threshold?.value ?? null })),
    evidence: (f.evidence ?? []).map((e: any) => ({ label: e.label, value: e.value })),
    locations: (f.locations ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}

const cobertura = (a.coverage ?? [])
  .filter((c: any) => MIOS.has(c.kind) || MIOS.has(c.detectorId))
  .map((c: any) => ({ detectorId: c.detectorId, kind: c.kind, scope: c.scope, status: c.status, reason: c.reason ?? null,
                      unitsConsidered: c.measurement?.unitsConsidered ?? c.unitsConsidered ?? null }));

ausentes.sort();
writeFileSync(out, JSON.stringify({
  repo: nombre, dir, src: SRC, wallMs,
  totalHallazgos: a.findings.length,
  censo, nivel2, nAusentes: ausentes.length, ausentes, registros, cobertura,
}, null, 0));
console.error(`${nombre} [${SRC}]: ${a.findings.length} hallazgos | middle-man ${censo["middle-man"] ?? 0} | modulo-envy ${censo["modulo-envy"] ?? 0} | commented-out-code ${censo["commented-out-code"] ?? 0} | ausentes ${ausentes.length} | ${wallMs} ms`);
