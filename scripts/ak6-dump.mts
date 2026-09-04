/**
 * OLA AK, FRENTE AK6 — volcado DETALLADO (no producción) de las dos celdas del frente.
 *
 * Corre `analyzeRepo` sobre un ÁRBOL DE `src/` PASADO POR ARGUMENTO (para poder
 * medir el contrafáctico de UNA sola variable contra una copia congelada) y deja,
 * para cada hallazgo de `large-class` y de `optional-behavior-flags`, la hipótesis
 * ENTERA — `state`, `confidence`, `provisional`, y CADA check con su `passed`/`role` —
 * que es lo único que el volcado oficial no puede decir.
 *
 * Uso: npx tsx scripts/ak6-dump.mts <raiz-src> <dir-repo> <salida.json>
 *   <raiz-src> = "src" (producción) o "scratchpad-ak6/src0" (copia congelada)
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , srcRoot, dir, out] = process.argv;
if (!srcRoot || !dir || !out) {
  console.error("Uso: npx tsx scripts/ak6-dump.mts <raiz-src> <dir-repo> <salida.json>");
  process.exit(1);
}

const base = resolve(process.cwd(), srcRoot);
const { analyzeRepo } = await import(`${base}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${base}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(`${base}/server/services/detect/precision/direccion-hipotesis.js`);

const ANCLAS = new Set(["large-class", "optional-behavior-flags"]);

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: "ak6", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const findings = a.findings
  .filter((f: any) => ANCLAS.has(f.kind))
  .map((f: any) => {
    const hs = f.hypotheses ?? [];
    const at = direccionesDeFila(hs, f.locations[0]);
    return {
      id: f.id ?? stableFindingId(f),
      kind: f.kind,
      title: f.title,
      where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
      symbols: f.locations.map((l: any) => l.symbol ?? ""),
      hypotheses: hs.map((h: any, i: number) => ({
        pattern: h.pattern,
        state: h.state,
        at: at[i] ?? "",
        confidence: h.confidence ?? null,
        provisional: h.provisional ?? false,
        checks: (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, role: c.role ?? null })),
        discriminators: (h.discriminators ?? []).map((c: any) => ({ label: c.label, passed: c.passed })),
        places: (h.places ?? []).map((p: any) => `${p.file}:${p.startLine}`),
      })),
    };
  });

const porKind: Record<string, number> = {};
for (const f of a.findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ srcRoot, dir, wallMs, totalHallazgos: a.findings.length, porKind, findings }, null, 0));
console.log(`${out}: ${a.findings.length} hallazgos · ${findings.length} de las 2 anclas · ${wallMs}ms`);
