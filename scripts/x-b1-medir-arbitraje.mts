/**
 * OLA X, FRENTE B1 — LA MEDICIÓN OFFLINE DEL ARBITRAJE.
 *
 * Lee los volcados de `scripts/x-b1-dump-arbitraje.mts` (UNA corrida por repo,
 * con la traza adentro) y reconstruye los TRES brazos sin volver a analizar
 * nada — ver el docstring de ese script para por qué eso es exacto y no una
 * aproximación (el arbitraje es un filtro puro sobre `finding.hypotheses` y
 * nada aguas abajo lee ese campo para decidir qué hallazgos existen).
 *
 *   sin    — sin arbitraje: sobreviven todas
 *   vieja  — la regla de la Ola 11b: una oportunidad muere si ALGÚN otro
 *            patrón del mismo ancla confirmó (`ya-aplicado`/`aplicado-eludido`)
 *   nueva  — lo mismo, PERO sólo si además los `places` se solapan
 *
 * Escribe tres directorios de volcados con el shape de `dump-hallazgos.mts`,
 * para que `scripts/w-cobertura-nivel2.mts` mida los tres con el MISMO
 * instrumento de siempre, sin tocarlo.
 *
 * USO: npx tsx scripts/x-b1-medir-arbitraje.mts /tmp/x-b1/dumps /tmp/x-b1/brazos
 */
import fs from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { HYPOTHESES } from "../src/server/services/hypotheses/registry.js";

const EXT_TO_LANG = new Map<string, string>();
for (const decl of LANGUAGE_DECLS) for (const ext of decl.extensions) EXT_TO_LANG.set(ext, decl.id);
const languageOfFile = (file: string): string => EXT_TO_LANG.get(path.extname(file).toLowerCase()) ?? "?";

const SLUGS = [
  "click", "cobra", "eslint", "guava", "hugo", "jekyll", "lodash",
  "nest", "newtonsoft-json", "preact", "rubocop", "sqlalchemy", "vueuse",
] as const;

const OPORTUNIDAD = new Set(["ausente", "parcial"]);

interface TrazaHip {
  pattern: string;
  state: string;
  confidence: string | null;
  places: { file: string; startLine: number; endLine: number; symbol?: string }[];
  overlappingConfirmed: string[];
  anyConfirmed: string[];
  discarded: boolean;
}
interface Traza {
  anchorFindingId: string;
  hypotheses: TrazaHip[];
}
interface Volcado {
  dir: string;
  total: number;
  porKind: Record<string, { n: number; conHipotesis: number }>;
  findings: { id: string; kind: string; where: string[]; symbols: string[]; hypotheses: { pattern: string; state: string }[] }[];
  arbitraje: Traza[];
}

type Brazo = "sin" | "vieja" | "nueva";

function sobrevive(h: TrazaHip, brazo: Brazo): boolean {
  if (!OPORTUNIDAD.has(h.state)) return true;
  if (brazo === "sin") return true;
  if (brazo === "vieja") return h.anyConfirmed.length === 0;
  return h.overlappingConfirmed.length === 0;
}

interface Descartada {
  slug: string;
  kind: string;
  language: string;
  id: string;
  file: string;
  pattern: string;
  state: string;
  confidence: string | null;
  ganadores: string[];
  ganadoresSolapan: string[];
}

function main(): void {
  const [dumpsDir, outDir] = process.argv.slice(2);
  if (!dumpsDir || !outDir) {
    console.error("uso: x-b1-medir-arbitraje.mts <dir-de-volcados> <dir-de-salida>");
    process.exitCode = 1;
    return;
  }
  const brazos: Brazo[] = ["sin", "vieja", "nueva"];
  for (const b of brazos) fs.mkdirSync(path.join(outDir, b), { recursive: true });

  const descartadasVieja: Descartada[] = [];
  const descartadasNueva: Descartada[] = [];
  let anclasConVarias = 0;
  let anclasConConflicto = 0; // >=1 oportunidad y >=1 confirmado
  const paresPorKind = new Map<string, number>();
  const faltantes: string[] = [];

  for (const slug of SLUGS) {
    const p = path.join(dumpsDir, `${slug}.json`);
    if (!fs.existsSync(p)) {
      faltantes.push(slug);
      continue;
    }
    const v = JSON.parse(fs.readFileSync(p, "utf8")) as Volcado;
    const porId = new Map(v.findings.map((f) => [f.id, f]));
    const traza = new Map(v.arbitraje.map((t) => [t.anchorFindingId, t]));

    anclasConVarias += v.arbitraje.length;
    for (const t of v.arbitraje) {
      const f = porId.get(t.anchorFindingId);
      const kind = f?.kind ?? "?";
      const file = f?.where[0]?.replace(/:\d+$/, "") ?? "";
      const language = languageOfFile(file);
      const hayOportunidad = t.hypotheses.some((h) => OPORTUNIDAD.has(h.state));
      const hayConfirmado = t.hypotheses.some((h) => !OPORTUNIDAD.has(h.state));
      if (hayOportunidad && hayConfirmado) {
        anclasConConflicto++;
        paresPorKind.set(kind, (paresPorKind.get(kind) ?? 0) + 1);
      }
      for (const h of t.hypotheses) {
        const d: Descartada = {
          slug, kind, language, id: t.anchorFindingId, file,
          pattern: h.pattern, state: h.state, confidence: h.confidence,
          ganadores: h.anyConfirmed, ganadoresSolapan: h.overlappingConfirmed,
        };
        if (!sobrevive(h, "vieja")) descartadasVieja.push(d);
        if (!sobrevive(h, "nueva")) descartadasNueva.push(d);
      }
    }

    for (const b of brazos) {
      const findings = v.findings.map((f) => {
        const t = traza.get(f.id);
        if (!t) return f;
        return { ...f, hypotheses: t.hypotheses.filter((h) => sobrevive(h, b)).map((h) => ({ pattern: h.pattern, state: h.state })) };
      });
      fs.writeFileSync(path.join(outDir, b, `${slug}.json`), JSON.stringify({ dir: v.dir, total: findings.length, findings }, null, 1));
    }
  }

  if (faltantes.length) console.error(`AVISO: sin volcado para ${faltantes.join(", ")}`);

  const tabla = (titulo: string, filas: Map<string, number>): void => {
    console.log(`\n${titulo}`);
    for (const [k, n] of [...filas].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(44)} ${String(n).padStart(5)}`);
  };
  const cuenta = <T,>(xs: readonly T[], key: (x: T) => string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return m;
  };

  console.log("=== CUÁNTO MATA EL ARBITRAJE — 13 repos, una corrida, tres brazos reconstruidos ===");
  console.log(`anclas con >=2 hipótesis .................... ${anclasConVarias}`);
  console.log(`  de ésas, con conflicto (oportunidad+confirmado) ${anclasConConflicto}`);
  console.log(`OPORTUNIDADES DESCARTADAS — regla VIEJA ..... ${descartadasVieja.length}`);
  console.log(`OPORTUNIDADES DESCARTADAS — regla NUEVA ..... ${descartadasNueva.length}`);
  console.log(`  (la diferencia, ${descartadasVieja.length - descartadasNueva.length}, son oportunidades que la regla vieja callaba con una confirmación sobre OTRO lugar del archivo)`);

  tabla("— por PATRÓN silenciado (regla vieja):", cuenta(descartadasVieja, (d) => `${d.pattern} (${d.state})`));
  tabla("— a favor de qué CONFIRMADO (regla vieja):", cuenta(descartadasVieja.flatMap((d) => d.ganadores.map((g) => ({ g }))), (x) => x.g));
  tabla("— por KIND del ancla (regla vieja):", cuenta(descartadasVieja, (d) => d.kind));
  tabla("— por LENGUAJE (regla vieja):", cuenta(descartadasVieja, (d) => d.language));
  tabla("— por CONFIANZA de la oportunidad silenciada (regla vieja):", cuenta(descartadasVieja, (d) => String(d.confidence)));
  tabla("— anclas en conflicto por KIND:", paresPorKind);
  tabla("— SOBREVIVE con la regla nueva, por patrón:", cuenta(descartadasVieja.filter((d) => d.ganadoresSolapan.length === 0), (d) => `${d.pattern} (${d.state})`));
  tabla("— SOBREVIVE con la regla nueva, por kind:", cuenta(descartadasVieja.filter((d) => d.ganadoresSolapan.length === 0), (d) => d.kind));

  // ─── EL EMBUDO ANTERIOR AL ARBITRAJE ────────────────────────────────────
  // El arbitraje sólo puede actuar donde DOS builders emitieron sobre el mismo
  // hallazgo. Antes de discutir la regla hay que saber cuán seguido pasa eso, y
  // eso se responde sin correr nada: el REGISTRO dice qué kinds tienen >=2
  // builders declarados, y el volcado dice cuántas hipótesis salieron de hecho.
  const buildersPorKind = new Map<string, string[]>();
  for (const b of HYPOTHESES) for (const k of b.anchors) buildersPorKind.set(k, [...(buildersPorKind.get(k) ?? []), b.pattern]);

  const embudo = new Map<string, { hallazgos: number; conHip: number; conDos: number; builders: number }>();
  for (const slug of SLUGS) {
    const p = path.join(dumpsDir, `${slug}.json`);
    if (!fs.existsSync(p)) continue;
    const v = JSON.parse(fs.readFileSync(p, "utf8")) as Volcado;
    for (const f of v.findings) {
      const builders = buildersPorKind.get(f.kind);
      if (!builders) continue;
      const e = embudo.get(f.kind) ?? { hallazgos: 0, conHip: 0, conDos: 0, builders: builders.length };
      e.hallazgos++;
      if (f.hypotheses.length >= 1) e.conHip++;
      if (f.hypotheses.length >= 2) e.conDos++;
      embudo.set(f.kind, e);
    }
  }
  console.log("\n=== EL EMBUDO ANTERIOR AL ARBITRAJE — dónde PUEDE haber rivalidad, y dónde la hay ===");
  console.log(`${"kind del ancla".padEnd(30)} ${"blds".padStart(4)} ${"hallazgos".padStart(9)} ${"c/hip".padStart(6)} ${"c/>=2".padStart(6)}  patrones registrados`);
  for (const [k, e] of [...embudo].sort((a, b) => b[1].conDos - a[1].conDos || b[1].hallazgos - a[1].hallazgos)) {
    console.log(
      `${k.padEnd(30)} ${String(e.builders).padStart(4)} ${String(e.hallazgos).padStart(9)} ` +
        `${String(e.conHip).padStart(6)} ${String(e.conDos).padStart(6)}  ${(buildersPorKind.get(k) ?? []).join(", ")}`,
    );
  }

  // ─── QUIÉN OCUPA CADA ANCLA COMPARTIDA ──────────────────────────────────
  // Si un kind tiene 2+ builders registrados y NUNCA salen 2 hipótesis, la
  // pregunta siguiente es si los dos patrones se reparten los hallazgos o si
  // uno solo se los queda todos. Es la diferencia entre "colisionan y algo los
  // separa" y "el segundo builder nunca pasa su `required`".
  // La tasa de colisión sobre la población EN RIESGO — los hallazgos cuyo kind
  // tiene >=2 builders registrados Y que recibieron al menos una hipótesis. Es
  // el denominador honesto: donde no hay ni una hipótesis no puede haber dos.
  let riesgo = 0;
  let riesgoConDos = 0;
  for (const [, e] of embudo) {
    if (e.builders < 2) continue;
    riesgo += e.conHip;
    riesgoConDos += e.conDos;
  }
  const wil = (k: number, n: number): string => {
    if (n === 0) return "—";
    const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n);
    const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    const lo = Math.max(0, (c - r) / d), hi = Math.min(1, (c + r) / d);
    return `${((k / n) * 100).toFixed(2)} % [${(lo * 100).toFixed(2)} %, ${(hi * 100).toFixed(2)} %]`;
  };
  console.log(`\npoblación EN RIESGO (kind con >=2 builders Y >=1 hipótesis) ... ${riesgo}`);
  console.log(`  de ésos, con DOS hipótesis .................................. ${riesgoConDos}  ${wil(riesgoConDos, riesgo)}`);
  console.log(`  de ésos, con CONFLICTO (oportunidad + confirmado) ........... ${anclasConConflicto}  ${wil(anclasConConflicto, riesgo)}`);

  console.log("\n=== QUIÉN OCUPA CADA ANCLA COMPARTIDA (kinds con >=2 builders registrados) ===");
  for (const [k, e] of [...embudo].sort((a, b) => b[1].hallazgos - a[1].hallazgos)) {
    if (e.builders < 2) continue;
    const reparto = new Map<string, number>();
    for (const slug of SLUGS) {
      const p = path.join(dumpsDir, `${slug}.json`);
      if (!fs.existsSync(p)) continue;
      const v = JSON.parse(fs.readFileSync(p, "utf8")) as Volcado;
      for (const f of v.findings) {
        if (f.kind !== k) continue;
        for (const h of f.hypotheses) reparto.set(`${h.pattern}/${h.state}`, (reparto.get(`${h.pattern}/${h.state}`) ?? 0) + 1);
      }
    }
    const registrados = (buildersPorKind.get(k) ?? []).join(" · ");
    const mudos = (buildersPorKind.get(k) ?? []).filter((p) => ![...reparto.keys()].some((r) => r.startsWith(`${p}/`)));
    console.log(
      `${k.padEnd(26)} hallazgos=${String(e.hallazgos).padStart(5)}  registrados: ${registrados}\n` +
        `${" ".repeat(26)} emite:   ${[...reparto].map(([r, n]) => `${r}=${n}`).join("  ") || "(nada)"}\n` +
        `${" ".repeat(26)} MUDOS:   ${mudos.join(", ") || "—"}`,
    );
  }

  fs.writeFileSync(path.join(outDir, "descartadas-vieja.json"), JSON.stringify(descartadasVieja, null, 1));
  fs.writeFileSync(path.join(outDir, "descartadas-nueva.json"), JSON.stringify(descartadasNueva, null, 1));
  console.log(`\n-> ${outDir}/{sin,vieja,nueva}/  + descartadas-{vieja,nueva}.json`);
}

main();
