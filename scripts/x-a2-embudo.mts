/**
 * OLA X — FRENTE A2. LA SONDA DE LOS 17 EMBUDOS.
 *
 * LA PREGUNTA: para cada patrón, ¿EN QUÉ COMPUERTA MUERE? Cuántos candidatos
 * entran desde su ancla, cuántos sobreviven a cada `required`, y cuántos
 * terminan en cada estado.
 *
 * CÓMO, y por qué así. El frente W1 de la ola pasada instrumentó DOS patrones
 * escribiendo un trazador temporal DENTRO de cada builder. Eso no escala a
 * quince y, sobre todo, esta ola tiene diez frentes editando el mismo árbol:
 * cualquier edición mía en `hypotheses/` pisaría a otro. Así que la
 * instrumentación es GENÉRICA y VIVE FUERA DEL ÁRBOL:
 *
 *   - `engine.ts#build` es el ÚNICO cuello por donde pasan los 18 patrones
 *     registrados: ahí corren `spec.required`, ahí decide `appliedState`, ahí
 *     se calculan los discriminadores. Un solo punto instrumentado = los 18
 *     embudos, sin una línea por patrón.
 *   - `run.ts` es el ÚNICO lugar donde se sabe DE QUÉ HALLAZGO cuelga cada
 *     llamada (`engine.build` no recibe el `Finding`: recibe el `problem`
 *     propio de cada patrón, que tiene 18 formas distintas). Ahí se marca el
 *     hallazgo en curso.
 *
 * Las dos copias se generan en un temporal y se enchufan con un gancho de
 * resolución (`x-a2-hook.mjs`). `src/` NO SE TOCA — verificable con `md5sum`
 * antes y después.
 *
 * TRES BUCKETS QUE LA SONDA DISTINGUE Y QUE EL VOLCADO NO PUEDE DISTINGUIR:
 *   1. el builder devolvió `null` SIN llegar a `engine.build` (murió en su
 *      propio pre-chequeo, aguas arriba del motor pero dentro de `hypotheses/`);
 *   2. murió en `engine.build` (capacidades, aristas o un `required`);
 *   3. sobrevivió, con su estado.
 *
 * Uso:
 *   npx tsx scripts/x-a2-embudo.mts <dir-del-repo> <salida.json>
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , repoDir, outPath] = process.argv;
if (!repoDir || !outPath) {
  console.error("Uso: npx tsx scripts/x-a2-embudo.mts <dir-del-repo> <salida.json>");
  process.exit(64);
}

const ROOT = path.resolve(import.meta.dirname, "..");
const HYP = path.join(ROOT, "src/server/services/hypotheses");
const TMP = process.env.X_A2_TMP ?? path.join(process.env.TMPDIR ?? "/tmp", `x-a2-${process.pid}`);
mkdirSync(TMP, { recursive: true });

/** Reescribe TODO especificador relativo a una URL absoluta del archivo REAL:
 *  la copia vive en otro directorio, pero sigue hablando con el árbol de
 *  verdad. `.js` → `.ts` es el mapeo que tsx ya hace en el proyecto. */
function absolutizeImports(src: string, originalDir: string): string {
  return src.replace(/from\s+"(\.\.?\/[^"]+)"/g, (_m, spec: string) => {
    const abs = path.resolve(originalDir, spec.replace(/\.js$/, ".ts"));
    return `from "${pathToFileURL(abs).href}"`;
  });
}

interface Sub {
  readonly what: string;
  readonly find: string;
  readonly repl: string;
  readonly times: number;
}

function applySubs(src: string, subs: readonly Sub[], file: string): string {
  let out = src;
  for (const s of subs) {
    const n = out.split(s.find).length - 1;
    if (n !== s.times) {
      throw new Error(
        `x-a2: la sustitución "${s.what}" aparece ${n} veces en ${file}, se esperaban ${s.times}. ` +
          `Otro frente cambió el archivo: releé el original y ajustá la sonda ANTES de creerle a un número.`,
      );
    }
    out = out.split(s.find).join(s.repl);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// COPIA INSTRUMENTADA DE engine.ts
// ─────────────────────────────────────────────────────────────────────────────
const ENGINE_SRC = path.join(HYP, "engine.ts");
const engineOriginal = readFileSync(ENGINE_SRC, "utf8");

const ENGINE_PROLOGUE = `
/* eslint-disable */
// @ts-nocheck
// ——— INSTRUMENTACIÓN A2 (copia temporal; el original no se tocó) ———
const __A2G: any = globalThis as any;
function __a2rec(rec: any): void {
  const cur = __A2G.__A2CUR;
  if (cur) (cur.eng ??= []).push(rec);
  else (__A2G.__A2ORPHAN ??= []).push(rec);
}
`;

const engineInstrumented =
  ENGINE_PROLOGUE +
  applySubs(
    absolutizeImports(engineOriginal, HYP),
    [
      {
        what: "compuerta de capacidades",
        find: `  const missingCapabilities = spec.needs.filter((n) => !capabilities.has(n));
  if (missingCapabilities.length > 0) {`,
        repl: `  const missingCapabilities = spec.needs.filter((n) => !capabilities.has(n));
  if (missingCapabilities.length > 0) {
    __a2rec({ pat: spec.pattern, gate: "0-missing-capabilities", req: [], state: null, miss: missingCapabilities.slice() });`,
        times: 1,
      },
      {
        what: "compuerta de aristas",
        find: `    if (missingEdgeKinds.length > 0) {
      return { state: "ausente"`,
        repl: `    if (missingEdgeKinds.length > 0) {
      __a2rec({ pat: spec.pattern, gate: "0-missing-edges", req: [], state: null, miss: missingEdgeKinds.slice() });
      return { state: "ausente"`,
        times: 1,
      },
      {
        what: "compuertas required",
        find: `  const requiredResults = spec.required.map((c) => toCheck(c, "required", problem, graph));
  if (requiredResults.some((r) => !r.passed)) return null; // sin esto, ni siquiera es candidata`,
        repl: `  const requiredResults = spec.required.map((c) => toCheck(c, "required", problem, graph));
  const __a2req: [string, number][] = spec.required.map((c, i) => [c.id, requiredResults[i]!.passed ? 1 : 0]);
  if (requiredResults.some((r) => !r.passed)) {
    __a2rec({ pat: spec.pattern, gate: "1-required", req: __a2req, state: null });
    return null; // sin esto, ni siquiera es candidata
  }`,
        times: 1,
      },
      {
        what: "salida con estado",
        find: `  return {
    state,
    confidence,
    missingCapabilities: [],
    missingEdgeKinds: [],`,
        repl: `  __a2rec({
    pat: spec.pattern,
    gate: "2-pass",
    req: __a2req,
    state,
    conf: confidence,
    disc: discriminatorResults.map((d, i) => [spec.discriminators[i]!.id, d.passed ? 1 : 0]),
    applied: appliedChecks.map((c) => [c.label, c.passed ? 1 : 0]),
  });
  return {
    state,
    confidence,
    missingCapabilities: [],
    missingEdgeKinds: [],`,
        times: 1,
      },
    ],
    "engine.ts",
  );

// ─────────────────────────────────────────────────────────────────────────────
// COPIA INSTRUMENTADA DE run.ts — el único lugar que sabe de qué Finding cuelga
// ─────────────────────────────────────────────────────────────────────────────
const RUN_SRC = path.join(HYP, "run.ts");
const runOriginal = readFileSync(RUN_SRC, "utf8");

const RUN_PROLOGUE = `
/* eslint-disable */
// @ts-nocheck
// ——— INSTRUMENTACIÓN A2 (copia temporal; el original no se tocó) ———
const __A2G: any = globalThis as any;
`;

const runInstrumented =
  RUN_PROLOGUE +
  applySubs(absolutizeImports(runOriginal, HYP), [
    {
      what: "llamada a builder.build",
      find: `      const h = builder.build(finding, input.repo.graph, ctx);`,
      repl: `      const __a2row: any = {
        pat: builder.pattern,
        kind: finding.kind,
        lang: finding.language ?? null,
        file: finding.locations[0]?.file ?? null,
        line: finding.locations[0]?.startLine ?? null,
        g: input.repo.graph == null ? 0 : 1,
        f: finding,
      };
      (__A2G.__A2ROWS ??= []).push(__a2row);
      __A2G.__A2CUR = __a2row;
      const h = builder.build(finding, input.repo.graph, ctx);
      __A2G.__A2CUR = null;
      __a2row.ret = h ? h.state : null;`,
      times: 2,
    },
  ], "run.ts");

const engineCopy = path.join(TMP, "x-a2-engine.mts");
const runCopy = path.join(TMP, "x-a2-run.mts");
writeFileSync(engineCopy, engineInstrumented);
writeFileSync(runCopy, runInstrumented);

register("./x-a2-hook.mjs", import.meta.url, {
  data: {
    "/src/server/services/hypotheses/engine.ts": pathToFileURL(engineCopy).href,
    "/src/server/services/hypotheses/run.ts": pathToFileURL(runCopy).href,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LA CORRIDA. `analyzeRepo` directo, NUNCA `analyzeRepoCached`: la caché
// tiene la huella del analizador y devolvería un HIT sin ejecutar una sola
// hipótesis — un embudo vacío que parecería un resultado.
// ─────────────────────────────────────────────────────────────────────────────
const { analyzeRepo } = await import("../src/server/services/code-analyzer.js");
const { stableFindingId } = await import("../src/server/services/code-finding-ids.js");
const { HYPOTHESES } = await import("../src/server/services/hypotheses/registry.js");

const t0 = performance.now();
const analysis = await analyzeRepo({ dir: repoDir, repoName: "x-a2", limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);

const G = globalThis as unknown as { __A2ROWS?: any[]; __A2ORPHAN?: any[] };
const rows = G.__A2ROWS ?? [];

// Una fila por (Finding, patrón), quedándose con la ÚLTIMA — que es la del
// MEJOR contexto: `rebuildHypothesesWithGraph` vuelve a llamar `build()` con
// el grafo del repo y el árbol revivido, y ES la que se publica. Mismo
// criterio que W1 ("evaluaciones con el mejor contexto disponible"), pero sin
// perder los hallazgos que la segunda pasada saltea por falta de árbol vivo.
//
// LA LLAVE ES `stableFindingId`, NO LA IDENTIDAD DEL OBJETO — medido: entre la
// pasada de `analyzeFile` y la de `crossAnalyze` los `Finding` se
// RECONSTRUYEN, así que dedupar por referencia contaba cada candidato dos
// veces (verificado en un repo mini: 144 filas crudas para 72 pares reales).
// La llave NO puede ser sólo `stableFindingId`: MEDIDO en click, dos
// hallazgos distintos comparten id y colapsarlos perdía una hipótesis
// publicada (Builder: 5 contadas contra 6 publicadas). Se agrega el título y
// el rango de TODAS las ubicaciones — estable entre las dos pasadas (lo
// escribe el mismo detector) y distinto entre dos hallazgos distintos.
const claveDe = new Map<unknown, { k: string; fid: string }>();
function clave(f: any): { k: string; fid: string } {
  let c = claveDe.get(f);
  if (!c) {
    const fid = (f.id ?? stableFindingId(f)) as string;
    const donde = (f.locations ?? []).map((l: any) => `${l.file}:${l.startLine}-${l.endLine}:${l.symbol ?? ""}`).join(",");
    claveDe.set(f, (c = { k: `${fid} ${f.title ?? ""} ${donde}`, fid }));
  }
  return c;
}

const finalByFinding = new Map<string, Map<string, any>>();
const filasPorClave = new Map<string, number>();
for (const r of rows) {
  const { k } = clave(r.f);
  const kp = `${k} ${r.pat}`;
  filasPorClave.set(kp, (filasPorClave.get(kp) ?? 0) + 1);
  let byPat = finalByFinding.get(k);
  if (!byPat) finalByFinding.set(k, (byPat = new Map()));
  const previo = byPat.get(r.pat);
  // Se conserva la de MEJOR contexto: con grafo le gana a sin grafo; a igual
  // contexto, la última.
  if (!previo || r.g >= previo.g) byPat.set(r.pat, r);
}
// Verificación de la llave: `build()` se llama como mucho DOS veces por
// candidato (la pasada de `analyzeFile` y la de `rebuildHypothesesWithGraph`).
// Una llave con más de dos filas es una colisión, y hay que decirlo, no
// esconderlo detrás de un total.
const filasExcedentes = [...filasPorClave.values()].reduce((n, c) => n + Math.max(0, c - 2), 0);
// Diagnóstico de la llave: cuántas de las evaluaciones de cada kind vieron UNA
// sola pasada y cuántas dos. Si la llave partiera un mismo candidato en dos
// (el error simétrico al de colapsarlos), TODO se vería como "1 pasada".
const pasadasPorKind: Record<string, { una: number; dos: number; mas: number }> = {};
for (const r of rows) {
  const kp = `${clave(r.f).k} ${r.pat}`;
  const c = filasPorClave.get(kp) ?? 0;
  const e = (pasadasPorKind[r.kind] ??= { una: 0, dos: 0, mas: 0 });
  if (c === 1) e.una += 1 / 1;
  else if (c === 2) e.dos += 1 / 2;
  else e.mas += 1 / c;
}

const anchorsByPattern = new Map<string, readonly string[]>(HYPOTHESES.map((b) => [b.pattern, b.anchors]));

interface Bucket {
  entran: number;
  porLenguaje: Record<string, number>;
  porKind: Record<string, number>;
  /** murió antes de llegar al motor (pre-chequeo del propio builder) */
  preMotor: number;
  preMotorPorKind: Record<string, number>;
  /** murió en el motor, por compuerta */
  muerePorCompuerta: Record<string, number>;
  /** cuántas veces falló CADA required (no sólo el primero) */
  fallaPorCheck: Record<string, number>;
  /** cuántas veces PASÓ cada required */
  pasaPorCheck: Record<string, number>;
  pasan: number;
  estados: Record<string, number>;
  estadosPorLenguaje: Record<string, Record<string, number>>;
}

const nuevo = (): Bucket => ({
  entran: 0,
  porLenguaje: {},
  porKind: {},
  preMotor: 0,
  preMotorPorKind: {},
  muerePorCompuerta: {},
  fallaPorCheck: {},
  pasaPorCheck: {},
  pasan: 0,
  estados: {},
  estadosPorLenguaje: {},
});

const inc = (o: Record<string, number>, k: string): void => {
  o[k] = (o[k] ?? 0) + 1;
};

const embudo: Record<string, Bucket> = {};
/** Filas crudas por hallazgo, para cruzar contra los veredictos del nivel 1. */
const porHallazgo: Record<string, { kind: string; lang: string | null; donde: string; patrones: Record<string, string> }> = {};

for (const [, byPat] of finalByFinding) {
  const f = [...byPat.values()][0]!.f as any;
  const fid = clave(f).fid;
  const donde = `${f.locations?.[0]?.file ?? "?"}:${f.locations?.[0]?.startLine ?? "?"}`;
  const entrada = (porHallazgo[fid] ??= { kind: f.kind, lang: f.language ?? null, donde, patrones: {} });

  for (const [pat, r] of byPat) {
    const b = (embudo[pat] ??= nuevo());
    b.entran++;
    inc(b.porLenguaje, r.lang ?? "(sin-lenguaje)");
    inc(b.porKind, r.kind);

    const engs: any[] = r.eng ?? [];
    const paso = engs.find((e) => e.gate === "2-pass");

    if (engs.length === 0) {
      b.preMotor++;
      inc(b.preMotorPorKind, r.kind);
      entrada.patrones[pat] = "pre-motor";
      continue;
    }
    // Un builder puede evaluar más de un `spec` por hallazgo (p.ej. una forma
    // estructural y una forma ausente). Si ALGUNO pasó, el hallazgo pasó.
    if (paso) {
      b.pasan++;
      inc(b.estados, paso.state);
      const l = (b.estadosPorLenguaje[r.lang ?? "(sin-lenguaje)"] ??= {});
      inc(l, paso.state);
      for (const [id, ok] of paso.req as [string, number][]) inc(ok ? b.pasaPorCheck : b.fallaPorCheck, id);
      entrada.patrones[pat] = `pasa:${paso.state}`;
    } else {
      // Se atribuye la muerte al PRIMER `required` que falló del intento que
      // más lejos llegó — la lectura "en qué compuerta muere" del encargo.
      let mejor = engs[0];
      for (const e of engs) {
        const okE = (e.req ?? []).filter((x: [string, number]) => x[1] === 1).length;
        const okM = (mejor.req ?? []).filter((x: [string, number]) => x[1] === 1).length;
        if (okE > okM) mejor = e;
      }
      const primerFallo = (mejor.req ?? []).find((x: [string, number]) => x[1] === 0)?.[0] ?? mejor.gate;
      inc(b.muerePorCompuerta, `${mejor.gate}:${primerFallo}`);
      for (const [id, ok] of (mejor.req ?? []) as [string, number][]) inc(ok ? b.pasaPorCheck : b.fallaPorCheck, id);
      entrada.patrones[pat] = `muere:${primerFallo}`;
    }
  }
}

// EL CENSO PUBLICADO — lo que un volcado (`dump-hallazgos.mts`) vería. Se
// mide acá al lado del embudo a propósito: la diferencia contra `pasan` es
// exactamente lo que se pierde DESPUÉS de `build()` (el agrupado/topes del
// ranking y el arbitraje de `arbitrateRivalHypotheses`), y sin las dos
// columnas juntas esa pérdida es invisible.
const publicado: Record<string, Record<string, number>> = {};
for (const f of analysis.findings as any[]) {
  for (const h of f.hypotheses ?? []) {
    const e = (publicado[h.pattern] ??= {});
    e[h.state] = (e[h.state] ?? 0) + 1;
  }
}

// La población del ancla, para la columna de SELECTIVIDAD: hallazgos de los
// kinds que cada patrón declara, existan o no filas de evaluación.
const totalPorKind: Record<string, number> = {};
for (const f of analysis.findings) inc(totalPorKind, f.kind);

const anclaPorPatron: Record<string, { kinds: string[]; hallazgosDelAncla: number }> = {};
for (const [pat, anchors] of anchorsByPattern) {
  anclaPorPatron[pat] = {
    kinds: [...anchors],
    hallazgosDelAncla: anchors.reduce((n, k) => n + (totalPorKind[k] ?? 0), 0),
  };
}

writeFileSync(
  outPath,
  JSON.stringify(
    {
      repo: repoDir,
      // El árbol se mueve mientras se mide (diez frentes a la vez): cada
      // volcado dice contra QUÉ versión de los dos archivos del motor se midió.
      cuando: new Date().toISOString(),
      huellaMotor: createHash("sha1").update(engineOriginal).digest("hex").slice(0, 12),
      huellaRun: createHash("sha1").update(runOriginal).digest("hex").slice(0, 12),
      wallMs,
      llamadasCrudas: rows.length,
      evaluacionesFinales: [...finalByFinding.values()].reduce((n, m) => n + m.size, 0),
      huerfanas: (G.__A2ORPHAN ?? []).length,
      filasExcedentes,
      pasadasPorKind,
      totalHallazgos: analysis.findings.length,
      totalPorKind,
      anclaPorPatron,
      publicado,
      embudo,
      porHallazgo,
    },
    null,
    1,
  ),
);

const filas = Object.entries(embudo).sort((a, b) => b[1].entran - a[1].entran);
console.log(`\n${repoDir} — ${wallMs} ms · ${rows.length} llamadas · ${filas.length} patrones con población\n`);
for (const [pat, b] of filas) {
  const recs = (b.estados["ausente"] ?? 0) + (b.estados["parcial"] ?? 0);
  console.log(
    `${pat.padEnd(26)} entran ${String(b.entran).padStart(6)} · pre-motor ${String(b.preMotor).padStart(6)} · pasan ${String(b.pasan).padStart(5)} · recs ${String(recs).padStart(5)} · ${JSON.stringify(b.estados)}`,
  );
}
console.log(`\n${outPath}`);
