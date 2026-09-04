/** AN5 — vuelca las hipotesis de Template Method con sus PLACES y ROLES (para poder juzgar).
 *  Uso: npx tsx scripts/an5-detalle.mts <dir> <out.json> */
import { writeFileSync } from "node:fs";
const [, , dir, out] = process.argv;
const { analyzeRepo } = await import("../src/server/services/code-analyzer.js");
const { stableFindingId } = await import("../src/server/services/code-finding-ids.js");
const a: any = await analyzeRepo({ dir, repoName: "an5d", limits: { maxFindings: "unlimited" } } as any);
const rows: any[] = [];
for (const f of a.findings) {
  for (const h of f.hypotheses ?? []) {
    if (h.pattern !== "Template Method") continue;
    rows.push({
      id: f.id ?? stableFindingId(f), kind: f.kind, title: f.title, state: h.state,
      where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
      places: (h.places ?? []).map((p: any) => ({ at: `${p.file}:${p.startLine}`, sym: p.symbol ?? null, role: p.role ?? null })),
      why: h.why ?? null,
      checks: (h.checks ?? []).map((c: any) => `${c.id ?? c.label}=${c.passed}`),
    });
  }
}
writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`${out}: ${rows.length} hipotesis TM`);
