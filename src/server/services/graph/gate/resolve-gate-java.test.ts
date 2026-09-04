/**
 * LA CASCADA REAL contra las 200 aristas etiquetadas de `guava` (Java) —
 * hermano de `resolve-gate.test.ts` (jekyll/Ruby), archivo NUEVO y separado
 * a propósito para no tocar ese archivo (dueño distinto esta ola) ni
 * `graph/gate/precision-recall.test.ts` (idem).
 *
 * POR QUÉ ESTE ARCHIVO EXISTE — F4, paquete F: `resolve-gate.test.ts` mide
 * UN repo, UN lenguaje (jekyll/lib, Ruby) y lo declara con todas las letras
 * en su propio docstring ("no es una garantía universal"). Mientras tanto,
 * en Java, `path-proximity` — la única etapa HEURÍSTICA de la cascada,
 * `provenance: "inferred"` — resuelve el 81% de las aristas de `guava`
 * (47.216 de 58.532) y esa etapa NUNCA fue ejercitada por el dataset Ruby.
 * Esta ola etiquetó 200 aristas de `guava` a mano (mismo método, mismo
 * criterio previo a mirar los datos — ver `scratchpad/impl/gate-java/
 * RESULTADO.md`) y ese trabajo vivía SOLO en scratchpad, sin ningún test
 * que lo mirara. Este archivo lo versiona.
 *
 * ⚠️ EL GATE DE JAVA NO ES 0.90 — WAIVER ESCRITO, NO UN AJUSTE SILENCIOSO ⚠️
 *
 * Al momento de etiquetar (`RESULTADO.md`, método completo ahí): sobre las
 * 130 filas muestreadas de lo que la cascada ACEPTA (100 `path-proximity` +
 * 30 `structural`/`global-uniqueness`), la precisión fue **71,5% muestral**
 * (93/130, Wilson95 [63,3–78,6%]) / **≈74,5% ponderada** por población real
 * de cada estrato (47.216 vs 11.314) — MUY por debajo del 0,90 que
 * `resolve-gate.test.ts` exige en Ruby. La etapa `structural` (aceptada por
 * `global-uniqueness`, la única etapa NO heurística — `provenance:
 * "structural"`, se supone la más confiable) midió apenas **10,0%** (3/30):
 * peor que `path-proximity`, la heurística. Causa raíz #1 documentada en
 * `RESULTADO.md`: `guava` triplica casi cada clase/campo/método en árboles
 * paralelos (`android/`, `guava/`, `guava-gwt/`) y `global-uniqueness`
 * acepta el "gemelo" bit-a-bit de una declaración propia como si fuera una
 * referencia real (27/30 de la muestra `structural` eran exactamente este
 * patrón) — es EXACTAMENTE el bug que el paquete B de esta ola ataca.
 * Causa raíz #2: `JAVA_PROBE` nunca clasifica `interface_declaration`/
 * `enum_declaration` como tipo-clase, así que todo override de método de
 * interfaz/Object (JDK, invisible a este análisis) sobrevive hasta
 * `path-proximity`, que le inventa un destino por cercanía de directorio.
 *
 * El piso de este archivo (`PRECISION_FLOOR_JAVA`, más abajo) se fija
 * DEBAJO del extremo inferior Wilson95 de esa medición histórica (0,633),
 * NO en 0,90: exigir 0,90 hoy sería rojo desde el día 1, y el punto de esta
 * compuerta es AUDITAR la brecha real, no esconderla subiendo el gate a un
 * número que el propio grafo no alcanza. Es un PISO DE NO-REGRESIÓN contra
 * la peor medición ya documentada, no un objetivo de calidad.
 *
 * ADVERTENCIA REPRODUCIDA AL ESCRIBIR ESTE ARCHIVO: la precisión que este
 * test mide HOY, cruzando el dataset congelado contra la cascada REAL que
 * corre en este repo en este momento, ya no es 71,5%: es más alta, porque
 * 11 de las 200 filas etiquetadas (7 del estrato `structural`, 4 de
 * `rejected-other` — TODAS etiquetadas `incorrecta`) ya no aparecen como
 * candidatos vivos en absoluto. Es exactamente el escenario que esta tarea
 * pidió diseñar desde el principio (ver más abajo, sección "candidatos que
 * dejan de existir"): un candidato `incorrecta` que deja de generarse es
 * una MEJORA (probablemente el paquete B, que ataca `global-uniqueness`,
 * ya aterrizó parcialmente en este checkout compartido), no un fallo — así
 * que NO se cuenta como fallo aquí, y el piso se mantiene conservador
 * (calibrado contra la medición histórica, no contra el número de hoy) para
 * no depender de en qué estado exacto dejó el checkout compartido otro
 * agente en paralelo.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../../code-grammar.js";
import type { AstNode } from "../../detect/types.js";
import { extractReferences } from "../references.js";
import { extractSymbols } from "../symbols.js";
import { ALL_STAGES, resolveReferences } from "../resolve.js";
import { buildCandidates, buildResolutionContext, type GraphFileFacts } from "../build.js";
import type { CandidateTrace } from "../stages.js";
import { loadLabeledDataset, labeledSampleLineKey, type JavaLabelStratum, type LabeledSample } from "./labeled-dataset.js";
import { wilsonInterval } from "./wilson.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const MANIFEST_PATH = path.join(GOLDEN_DIR, "manifest.json");
const LABELED_DATASET_PATH = path.join(GOLDEN_DIR, "graph", "cascade-labeled-dataset.guava.json");

/**
 * Piso de no-regresión, NO el objetivo de calidad (0,90, el de Ruby). Ver el
 * docstring del archivo para el waiver completo: 0,60 queda debajo del
 * extremo inferior Wilson95 (0,633) de la precisión medida al etiquetar
 * (71,5% muestral, 93/130) — margen deliberado para no acoplar este gate al
 * estado exacto, en un momento dado, de un checkout compartido con otros
 * agentes en paralelo (ver "candidatos que dejan de existir" más abajo).
 */
const PRECISION_FLOOR_JAVA = 0.6;
/** El objetivo de calidad de `resolve-gate.test.ts` (Ruby) — sólo para el mensaje informativo de abajo, nunca gatea nada acá (eso lo hace `PRECISION_FLOOR_JAVA`). */
const QUALITY_TARGET_JAVA = 0.9;

function readManifestGuavaSha(): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as { corpus?: Record<string, { sha: string }> };
    return manifest.corpus?.guava?.sha ?? null;
  } catch {
    return null;
  }
}
function gitSha(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
function resolveRootDirOrSkipReason(): { rootDir: string | null; skipReason: string | null } {
  const corpusRoot = process.env.CK_CORPUS_DIR;
  if (!corpusRoot) return { rootDir: null, skipReason: "CK_CORPUS_DIR no está seteado" };
  const expectedSha = readManifestGuavaSha();
  if (!expectedSha) return { rootDir: null, skipReason: "manifest.json sin entrada guava" };
  const guavaDir = path.join(corpusRoot, "corpus", "guava");
  if (!fs.existsSync(guavaDir)) return { rootDir: null, skipReason: `no existe ${guavaDir}` };
  const actualSha = gitSha(guavaDir);
  if (actualSha !== expectedSha) return { rootDir: null, skipReason: `sha desincronizado (${expectedSha} vs ${actualSha})` };
  // El dataset se etiquetó sobre la RAÍZ del repo guava (no un subdirectorio,
  // a diferencia de jekyll/lib) — mismas exclusiones de producción aplicadas
  // durante el recorrido (`walkJavaFiles`, más abajo), no un recorte previo.
  return { rootDir: guavaDir, skipReason: null };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}
let javaParser: Promise<any> | null = null;
function parser(): Promise<any> {
  javaParser ??= (async () => {
    const { Parser, Language } = await loadRuntime();
    const wasm = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", "tree-sitter-java.wasm");
    const language = await Language.load(wasm);
    const p = new Parser();
    p.setLanguage(language);
    return p;
  })();
  return javaParser;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Mismas exclusiones que `code-analyzer.ts#SKIP_DIRS`/`TEST_DIR_NAMES`
// (copiadas verbatim — no exportadas desde `code-analyzer.ts`, mismo patrón
// que `scratchpad/impl/gate-java/collect.mts` ya usó para producir el
// dataset que este archivo versiona) ───────────────────────────────────────
const SKIP_DIRS = new Set([
  ".git", "node_modules", "vendor", "tmp", "log", "dist", "build", "coverage",
  "public", ".next", ".nuxt", "__pycache__", ".venv", "venv", "target",
  ".bundle", "bower_components", ".cache", "storage",
]);
const TEST_DIR_NAMES = new Set(["spec", "test", "tests", "__tests__", "features"]);

function walkJavaFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory() && TEST_DIR_NAMES.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walkJavaFiles(abs, acc);
    else if (e.isFile() && e.name.endsWith(".java")) acc.push(abs);
  }
  return acc;
}

// El mismo `JAVA_PROBE` que `code-analyzer.ts` usa en producción (copiado
// verbatim para que `deriveNodeSets` vea exactamente los mismos tipos de
// nodo que producción vería — ver Hallazgo 1 de `RESULTADO.md`: este probe
// es precisamente el que NUNCA declara una `interface`/`enum`).
const JAVA_PROBE = `
public class Shape extends Base {
  private String name;

  public Shape(String name) {
    this.name = name;
  }

  public int area(int x, int y, int z, int w, int v, int u) {
    int ternary = x > 0 ? 1 : 2;
    if (x > 0) {
      return 1;
    } else if (x < 0) {
      return 2;
    } else {
      return 3;
    }
  }

  public String describe(String kind) {
    switch (kind) {
      case "circle":
        return "circle";
      case "square":
        return "square";
      default:
        return "unknown";
    }
  }

  public void loopy() {
    while (true) {
      break;
    }
    do {
      break;
    } while (true);
    for (int i = 0; i < 3; i++) {
      System.out.println(i);
    }
    for (int x : new int[]{1, 2}) {
      System.out.println(x);
    }
    try {
      risky();
    } catch (Exception e) {
      handle(e);
    } finally {
      cleanup();
    }
  }
}
`;

async function buildFacts(rootDir: string): Promise<{ files: GraphFileFacts[]; sets: DerivedNodeSets }> {
  const p = await parser();
  const probeRoot = p.parse(JAVA_PROBE).rootNode as unknown as ProbeNode;
  const sets = deriveNodeSets(probeRoot);
  const files: GraphFileFacts[] = [];
  for (const abs of walkJavaFiles(rootDir)) {
    const rel = path.relative(rootDir, abs);
    const src = fs.readFileSync(abs, "utf8");
    const root = p.parse(src).rootNode as unknown as AstNode;
    files.push({ path: rel, language: "java", symbols: extractSymbols(root, sets), references: extractReferences(root, sets) });
  }
  return { files, sets };
}

interface StageReport {
  readonly label: string;
  readonly n: number;
  readonly correct: number;
  readonly rate: number;
  readonly wilsonLower: number;
}
function report(label: string, correct: number, n: number): StageReport {
  const rate = n > 0 ? correct / n : 0;
  return { label, n, correct, rate, wilsonLower: wilsonInterval(correct, n).lower };
}
function fmt(r: StageReport): string {
  return `  ${r.label.padEnd(46)} ${r.correct}/${r.n} (${(r.rate * 100).toFixed(1)}%, Wilson95 inf ${(r.wilsonLower * 100).toFixed(1)}%)`;
}

// Estratos ACEPTADOS por la cascada — la `structural` es la aceptada por
// `global-uniqueness`, la etapa no-heurística; `path-proximity` es la
// heurística de desempate. Ambos entran en la cláusula de precisión.
const ACCEPTED_STRATA: readonly JavaLabelStratum[] = ["path-proximity", "structural"];
// Estratos RECHAZADOS/AMBIGUOS — acá `label === "correcta"` significa "había
// un destino real que la etapa perdió" (convención de `RESULTADO.md`, igual
// que la de Ruby): mide RECALL perdido, no precisión de lo aceptado.
const LOST_STRATA: readonly JavaLabelStratum[] = ["rejected-role", "rejected-other", "ambiguous-unresolved"];

const { rootDir, skipReason } = resolveRootDirOrSkipReason();
const test = skipReason ? it.skip : it;

describe("graph/resolve.ts — cascada REAL contra las 200 aristas etiquetadas (guava, Java, ÚNICO repo/lenguaje medido acá)", () => {
  test(
    skipReason ?? `precisión de lo aceptado ≥ piso de no-regresión (${PRECISION_FLOOR_JAVA}) + desglose auditable por estrato`,
    async () => {
      const dataset = loadLabeledDataset<JavaLabelStratum>(LABELED_DATASET_PATH);
      const { files } = await buildFacts(rootDir as string);

      const ctx = buildResolutionContext(files);
      const candidates = buildCandidates(files, undefined);
      const traces: CandidateTrace[] = [];
      resolveReferences(ALL_STAGES, candidates, ctx, { trace: (t) => traces.push(t) });

      // Mismo cruce por (archivo, símbolo, línea de uso) que
      // `resolve-gate.test.ts` (BUG 3 de su docstring): `buildCandidates`
      // guarda un candidato por SITIO DE USO, no uno por (archivo, símbolo).
      const byKey = new Map(traces.map((t) => [t.candidateId, t]));
      const byFromSymbolLine = new Map<string, CandidateTrace>();
      for (const c of candidates) {
        const t = byKey.get(c.id);
        if (!t) continue;
        const key = labeledSampleLineKey({ from: c.from.file, symbol: c.from.ref.name, useLine: c.from.ref.line });
        if (!byFromSymbolLine.has(key)) byFromSymbolLine.set(key, t);
      }

      // ─── Candidatos que dejan de existir ───────────────────────────────
      // Una fila etiquetada puede no tener candidato vivo en la cascada de
      // HOY (otro paquete de esta ola, en particular el que ataca
      // `global-uniqueness`, puede haber cambiado qué se genera como
      // candidato). Si la etiqueta era `incorrecta`, que el candidato ya no
      // exista es la MEJORA esperada (el propio falso-positivo desapareció),
      // no un fallo — así que NO se excluye de un conteo "faltantes" que
      // rompa el test; simplemente no entra en `rows`, igual que
      // `resolve-gate.test.ts` ya hace para jekyll. Se imprime igual,
      // separado por etiqueta, para que sea auditable si algún día una fila
      // `correcta` desaparece (eso SÍ sería sospechoso: una arista real que
      // la cascada dejó de poder ver).
      const missing: LabeledSample<JavaLabelStratum>[] = [];
      type Row = { readonly stratum: JavaLabelStratum; readonly label: string; readonly final: string };
      const rows: Row[] = [];
      for (const s of dataset.sample) {
        const t = byFromSymbolLine.get(labeledSampleLineKey(s));
        if (!t) {
          missing.push(s);
          continue;
        }
        rows.push({ stratum: s.stratum, label: s.label, final: t.final });
      }
      const missingCorrecta = missing.filter((s) => s.label === "correcta");
      const missingIncorrecta = missing.filter((s) => s.label === "incorrecta");
      const missingDudosa = missing.filter((s) => s.label === "dudosa");

      const decided = rows.filter((r) => r.label !== "dudosa");
      const acceptedRows = decided.filter((r) => ACCEPTED_STRATA.includes(r.stratum) && r.final === "resolved");
      const acceptedCorrect = acceptedRows.filter((r) => r.label === "correcta").length;
      const clause1 = report("Precisión sobre lo ACEPTADO (path-proximity + structural)", acceptedCorrect, acceptedRows.length);

      const byStratum: StageReport[] = [...ACCEPTED_STRATA, ...LOST_STRATA].map((stratum) => {
        const inStratum = decided.filter((r) => r.stratum === stratum);
        const isAccepted = ACCEPTED_STRATA.includes(stratum);
        // Para estratos aceptados: correcto = etiqueta `correcta` entre lo
        // que la cascada de hoy sigue aceptando (precisión). Para estratos
        // perdidos: correcto = etiqueta `correcta` (recall perdido), sin
        // filtrar por `final` — mide lo que la MUESTRA dice, no lo que la
        // cascada de hoy decidió (que por construcción es "rechazada").
        const relevant = isAccepted ? inStratum.filter((r) => r.final === "resolved") : inStratum;
        const correct = relevant.filter((r) => r.label === "correcta").length;
        return report(`${stratum}${isAccepted ? " (aceptado)" : " (perdido)"}`, correct, relevant.length);
      });

      const lines = [
        "",
        "════════════════════════════════════════════════════════════════════",
        "CASCADA REAL (graph/resolve.ts, 9 etapas) sobre las 200 filas etiquetadas — guava, Java, ÚNICO repo",
        "════════════════════════════════════════════════════════════════════",
        fmt(clause1) +
          ` — piso no-regresión ${(PRECISION_FLOOR_JAVA * 100).toFixed(0)}%: ${clause1.rate >= PRECISION_FLOOR_JAVA ? "PASA" : "FALLA"}` +
          ` (objetivo real ${(QUALITY_TARGET_JAVA * 100).toFixed(0)}%, igual que Ruby: ${clause1.rate >= QUALITY_TARGET_JAVA ? "SÍ se alcanza hoy" : "NO se alcanza"} — ver docstring del archivo)`,
        "",
        "Precisión/recall por estrato (auditable, no sólo el agregado):",
        ...byStratum.map(fmt),
        "",
        `Filas sin candidato vivo en la cascada de HOY: ${missing.length} ` +
          `(correcta=${missingCorrecta.length} incorrecta=${missingIncorrecta.length} dudosa=${missingDudosa.length}). ` +
          `${missingCorrecta.length > 0 ? "⚠ hay filas CORRECTA que desaparecieron — posible pérdida de recall, revisar a mano." : "Ninguna era `correcta`: consistente con una mejora (menos falsos positivos generados), no una regresión."}`,
        missing.length > 0 ? missing.map((s) => `  #${s.id} [${s.stratum}/${s.label}] ${s.from}::${s.symbol}@${s.useLine}`).join("\n") : "",
        "",
        "HONESTIDAD: un repo (guava), un lenguaje (Java). No es una garantía universal — ver docstring de este archivo.",
        "════════════════════════════════════════════════════════════════════",
        "",
      ];
      // eslint-disable-next-line no-console
      console.log(lines.join("\n"));

      expect(
        clause1.rate,
        `precisión ${(clause1.rate * 100).toFixed(1)}% bajo el PISO DE NO-REGRESIÓN ${PRECISION_FLOOR_JAVA * 100}% (no el objetivo 90%: ver waiver en el docstring)`,
      ).toBeGreaterThanOrEqual(PRECISION_FLOOR_JAVA);
    },
    180_000,
  );
});
