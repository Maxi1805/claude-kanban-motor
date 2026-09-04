/**
 * VERIFICACIÓN INDEPENDIENTE DE R1 (integrador de la Ola D).
 *
 * No mide "¿el código dice que R1 está cerrada?" sino el hecho observable:
 * cuando `crossAnalyze` le entrega el contexto a una hipótesis anclada en un
 * `Finding` `inter-file`, ¿`ctx.file` y `ctx.fileAt(<archivo de la
 * evidencia>)` devuelven un `FileUnit` con árbol real, o siguen `null`?
 *
 * Instrumenta cada builder del registro real (envuelve `build`) y registra,
 * por llamada: scope del ancla, si `ctx.file` es no-nulo, y cuántos de los
 * `locations[].file` del propio `Finding` resuelven vía `ctx.fileAt`.
 * Además comprueba que el `FileUnit` devuelto tenga AST navegable de verdad
 * (root con hijos), no un cascarón.
 */
import { analyzeRepo } from "../../src/server/services/code-analyzer.js";
import { HYPOTHESES } from "../../src/server/services/hypotheses/registry.js";
import { DETECTORS } from "../../src/server/services/detect/registry.js";

const dir = process.argv[2];
if (!dir) {
  console.error("uso: npx tsx scripts/probes/verificar-r1-integrador.mts <dir>");
  process.exit(1);
}

const scopeByKind = new Map<string, string>();
for (const d of DETECTORS as readonly { kind: string; scope: string }[]) scopeByKind.set(d.kind, d.scope);

interface Row {
  pattern: string;
  kind: string;
  scope: string;
  ctxFileNonNull: boolean;
  ctxFileHasAst: boolean;
  locFiles: number;
  locFilesResolved: number;
  primary: string;
  returned: boolean;
}
const rows: Row[] = [];

for (const b of HYPOTHESES as readonly any[]) {
  const original = b.build.bind(b);
  b.build = (problem: any, graph: any, ctx: any) => {
    const locFiles = [...new Set<string>(problem.locations.map((l: any) => l.file))];
    let resolved = 0;
    for (const p of locFiles) if (ctx.fileAt(p)) resolved++;
    const f = ctx.file;
    let hasAst = false;
    try {
      hasAst = !!f && !!f.root && Array.isArray(f.root.children) && f.root.children.length > 0;
    } catch {
      hasAst = false;
    }
    const out = original(problem, graph, ctx);
    rows.push({
      pattern: b.pattern,
      kind: problem.kind,
      scope: scopeByKind.get(problem.kind) ?? "?",
      ctxFileNonNull: !!f,
      ctxFileHasAst: hasAst,
      locFiles: locFiles.length,
      locFilesResolved: resolved,
      primary: problem.locations[0].file,
      returned: !!out,
    });
    return out;
  };
}

const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: "r1", limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);

const inter = rows.filter((r) => r.scope === "inter-file");
const intra = rows.filter((r) => r.scope !== "inter-file");

const okInter = inter.filter((r) => r.ctxFileNonNull).length;
const astInter = inter.filter((r) => r.ctxFileHasAst).length;
const locTotal = inter.reduce((s, r) => s + r.locFiles, 0);
const locOk = inter.reduce((s, r) => s + r.locFilesResolved, 0);

console.log(`\n=== R1 sobre ${dir} — wall ${wallMs}ms, ${a.findings.length} hallazgos ===`);
console.log(`llamadas a build(): ${rows.length}  (inter-file ${inter.length}, intra-file ${intra.length})`);
console.log(`inter-file con ctx.file NO nulo : ${okInter}/${inter.length}`);
console.log(`inter-file con ctx.file CON AST : ${astInter}/${inter.length}`);
console.log(`archivos de evidencia resueltos vía ctx.fileAt: ${locOk}/${locTotal}`);

// Desglose por ancla inter-file
const byKind = new Map<string, { n: number; ok: number; loc: number; locOk: number }>();
for (const r of inter) {
  const e = byKind.get(r.kind) ?? { n: 0, ok: 0, loc: 0, locOk: 0 };
  e.n++;
  if (r.ctxFileNonNull) e.ok++;
  e.loc += r.locFiles;
  e.locOk += r.locFilesResolved;
  byKind.set(r.kind, e);
}
console.log(`\nancla inter-file           llamadas  ctx.file≠null  evidencia resuelta`);
for (const [k, e] of [...byKind].sort()) {
  console.log(`  ${k.padEnd(26)} ${String(e.n).padStart(6)}   ${String(e.ok).padStart(10)}   ${e.locOk}/${e.loc}`);
}

// Prototype en particular
const proto = rows.filter((r) => r.pattern === "Prototype");
console.log(`\nPrototype: ${proto.length} llamadas, ctx.file≠null en ${proto.filter((r) => r.ctxFileNonNull).length}, evidencia resuelta ${proto.reduce((s, r) => s + r.locFilesResolved, 0)}/${proto.reduce((s, r) => s + r.locFiles, 0)}, devolvió hipótesis en ${proto.filter((r) => r.returned).length}`);
for (const p of proto) console.log(`   - ${p.kind} @ ${p.primary}  file=${p.ctxFileNonNull ? "SÍ" : "null"} ast=${p.ctxFileHasAst ? "SÍ" : "no"} evid=${p.locFilesResolved}/${p.locFiles} → ${p.returned ? "hipótesis" : "null"}`);
