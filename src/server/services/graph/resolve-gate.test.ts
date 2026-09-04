/**
 * LA CASCADA REAL contra las 200 aristas etiquetadas — CONTRATO-F3.md §3.5,
 * ejecutado con `graph/resolve.ts`/`graph/build.ts` (no con
 * `graph/gate/probe-cascade.ts`, el sustituto de 4 etapas que NO implementa
 * `bare-constant-receiver`). Archivo MÍO, deliberadamente separado de
 * `graph/gate/precision-recall.test.ts` (dueño distinto esta ola, regla 6:
 * no tocar un archivo ajeno) — aunque ese archivo documenta exactamente este
 * cableado como su propio TODO futuro ("CABLEADO A LA CASCADA REAL"), sigo
 * la regla dura y lo hago en un archivo propio en vez de editar el suyo.
 * Reutilizo sus tipos/utilidades de sólo lectura (`gate/labeled-dataset.ts`,
 * `gate/wilson.ts`) — son superficie pública, no archivos que edito.
 *
 * DOS DIFERENCIAS DELIBERADAS frente a `precision-recall.test.ts`:
 *
 * 1. NO exijo que el `finalStage` de cada fila etiquetada coincida con la
 *    etapa que el PROBE de 4 etapas le habría asignado. Mi cascada tiene 9
 *    etapas, no 4, y el refinamiento `bare-constant-receiver` existe
 *    EXACTAMENTE para mover filas del estrato `role` (rechazadas por el
 *    probe) a `accepted` — que la etapa final difiera del estrato original
 *    es el resultado ESPERADO, no un bug. La etiqueta (`correcta`/
 *    `incorrecta`) sigue siendo válida sin importar qué etapa decidió, así
 *    que la reutilizo tal cual para medir precisión/recall de MI cascada.
 * 2. Reporto, además de precisión/recall agregados, el par de números que
 *    esta tarea pide como entregable central: cuántas de las 40 filas del
 *    estrato `role` (la muestra etiquetada de lo que el filtro de rol
 *    rechaza) `bare-constant-receiver` RECUPERA como aceptadas, y qué
 *    fracción de esas recuperadas son realmente `correcta` — la precisión
 *    ESPECÍFICA del refinamiento, no sólo su efecto en el agregado.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";
import { extractReferences } from "./references.js";
import { extractSymbols } from "./symbols.js";
import { ALL_STAGES, resolveReferences } from "./resolve.js";
import { buildCandidates, buildResolutionContext, type GraphFileFacts } from "./build.js";
import type { CandidateTrace } from "./stages.js";
import { loadLabeledDataset, labeledSampleLineKey, type LabelStratum } from "./gate/labeled-dataset.js";
import { wilsonInterval } from "./gate/wilson.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const MANIFEST_PATH = path.join(GOLDEN_DIR, "manifest.json");
const LABELED_DATASET_PATH = path.join(GOLDEN_DIR, "graph", "cascade-labeled-dataset.jekyll.json");
const PRECISION_GATE = 0.9;

function readManifestJekyllSha(): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as { corpus?: Record<string, { sha: string }> };
    return manifest.corpus?.jekyll?.sha ?? null;
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
  const expectedSha = readManifestJekyllSha();
  if (!expectedSha) return { rootDir: null, skipReason: "manifest.json sin entrada jekyll" };
  const jekyllDir = path.join(corpusRoot, "corpus", "jekyll");
  if (!fs.existsSync(jekyllDir)) return { rootDir: null, skipReason: `no existe ${jekyllDir}` };
  const actualSha = gitSha(jekyllDir);
  if (actualSha !== expectedSha) return { rootDir: null, skipReason: `sha desincronizado (${expectedSha} vs ${actualSha})` };
  return { rootDir: path.join(jekyllDir, "lib"), skipReason: null };
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
let rubyParser: Promise<any> | null = null;
function parser(): Promise<any> {
  rubyParser ??= (async () => {
    const { Parser, Language } = await loadRuntime();
    const wasm = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", "tree-sitter-ruby.wasm");
    const language = await Language.load(wasm);
    const p = new Parser();
    p.setLanguage(language);
    return p;
  })();
  return rubyParser;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function walkRubyFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkRubyFiles(p, acc);
    else if (e.name.endsWith(".rb")) acc.push(p);
  }
  return acc;
}

const RUBY_PROBE = `
class Shape
  def initialize(name, opts = {})
    @name = name
  end
  def self.build(x)
    new(x)
  end
end
module Helper
  def self.build
    new
  end
end
`;

async function buildFacts(rootDir: string): Promise<{ files: GraphFileFacts[]; sets: DerivedNodeSets }> {
  const p = await parser();
  const probeRoot = p.parse(RUBY_PROBE).rootNode as unknown as ProbeNode;
  const sets = deriveNodeSets(probeRoot);
  const files: GraphFileFacts[] = [];
  for (const abs of walkRubyFiles(rootDir)) {
    const rel = path.relative(rootDir, abs);
    const src = fs.readFileSync(abs, "utf8");
    const root = p.parse(src).rootNode as unknown as AstNode;
    files.push({ path: rel, language: "ruby", symbols: extractSymbols(root, sets), references: extractReferences(root, sets) });
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
  return `  ${r.label.padEnd(38)} ${r.correct}/${r.n} (${(r.rate * 100).toFixed(1)}%, Wilson95 inf ${(r.wilsonLower * 100).toFixed(1)}%)`;
}

const { rootDir, skipReason } = resolveRootDirOrSkipReason();
const test = skipReason ? it.skip : it;

describe("graph/resolve.ts — cascada REAL contra las 200 aristas etiquetadas (jekyll/lib, único repo medido)", () => {
  test(
    skipReason ?? "precisión ≥0.90 (clausula 1) + cuánto recupera bare-constant-receiver y a qué costo",
    async () => {
      const dataset = loadLabeledDataset(LABELED_DATASET_PATH);
      const { files } = await buildFacts(rootDir as string);

      const ctx = buildResolutionContext(files);
      const candidates = buildCandidates(files, undefined);
      // `buildCandidates` recomputes its own index when `undefined` is passed
      // (see `build.ts`) — fine here since this is a one-shot measurement,
      // not the hot path `buildGraph` optimizes for.
      const traces: CandidateTrace[] = [];
      resolveReferences(ALL_STAGES, candidates, ctx, { trace: (t) => traces.push(t) });

      const byKey = new Map(traces.map((t) => [t.candidateId, t]));
      // `candidateId` (`build.ts`) is `${file}::${scope}#${name}@${role}...`,
      // NOT `(from, symbol)` — rebuild a `(from, symbol, useLine) -> trace`
      // index keyed by `labeledSampleLineKey`, NOT the collapsed
      // `labeledSampleKey` (BUG 3): `buildCandidates` keeps ONE row per SITE
      // OF USE, not one per (file, symbol) — several reference occurrences of
      // the SAME name in the SAME container, on DIFFERENT lines, are
      // DIFFERENT live candidates that can land on DIFFERENT cascade
      // verdicts (measured: id=90, `File.join@include.rb:272` real verdict
      // is "rejected", but the (file,symbol)-collapsed cross used to borrow
      // `PathManager.join@100`'s "resolved" trace instead — same file, same
      // symbol name, wrong line). Crossing by line fixes the attribution;
      // first-in-iteration-order still wins on the vanishingly rare case of
      // two occurrences sharing the exact same line (e.g. two roles for the
      // same name in one statement).
      const byFromSymbolLine = new Map<string, CandidateTrace>();
      for (const c of candidates) {
        const t = byKey.get(c.id);
        if (!t) continue;
        const key = labeledSampleLineKey({ from: c.from.file, symbol: c.from.ref.name, useLine: c.from.ref.line });
        if (!byFromSymbolLine.has(key)) byFromSymbolLine.set(key, t);
      }

      const missing: string[] = [];
      type Row = { readonly stratum: LabelStratum; readonly label: string; readonly final: string; readonly finalStage: string | null };
      const rows: Row[] = [];
      for (const s of dataset.sample) {
        const t = byFromSymbolLine.get(labeledSampleLineKey(s));
        if (!t) {
          missing.push(`#${s.id} ${s.from}::${s.symbol}@${s.useLine} — no es candidato vivo en la cascada real (línea exacta)`);
          continue;
        }
        rows.push({ stratum: s.stratum, label: s.label, final: t.final, finalStage: t.finalStage });
      }
      // No exijo `missing.length === 0` como hard-fail: la cascada real difiere
      // estructuralmente del probe en más que sólo bare-constant-receiver
      // (namespace-container/SFC/path-proximity no existen en el probe), así
      // que una fila del dataset podría legítimamente no tener targets vivos
      // bajo las reglas nuevas. Se imprime igual, para que sea auditable.
      // eslint-disable-next-line no-console
      if (missing.length > 0) console.log(`\n(${missing.length} filas del dataset sin candidato vivo en la cascada real)\n${missing.join("\n")}`);

      const decided = rows.filter((r) => r.label !== "dudosa");
      const acceptedRows = decided.filter((r) => r.final === "resolved");
      const acceptedCorrect = acceptedRows.filter((r) => r.label === "correcta").length;
      const clause1 = report("Cláusula 1 — precisión sobre lo aceptado (cascada real)", acceptedCorrect, acceptedRows.length);

      // ── El entregable central: cuánto recupera bare-constant-receiver, y a qué costo ──
      const roleStratum = decided.filter((r) => r.stratum === "role");
      const roleRecovered = roleStratum.filter((r) => r.final === "resolved");
      const roleConsideredByBCR = roleStratum.filter((r) => r.finalStage === "bare-constant-receiver");
      const roleRejectedByBCR = roleConsideredByBCR.filter((r) => r.final === "rejected");
      const roleRecoveredCorrect = roleRecovered.filter((r) => r.label === "correcta").length;
      const bcrReport = report(
        "bare-constant-receiver — recuperadas del estrato 'role' (correctas)",
        roleRecoveredCorrect,
        roleRecovered.length,
      );
      const roleRecoveredRate = roleStratum.length > 0 ? roleRecovered.length / roleStratum.length : 0;
      const estRecoveredInPopulation = roleRecoveredRate * dataset.poolSizes.role;
      const estCorrectlyRecovered = estRecoveredInPopulation * bcrReport.rate;

      const byStratum = (["accepted", "role", "member", "scope"] as const).map((stratum) => {
        const inStratum = decided.filter((r) => r.stratum === stratum);
        const nowAccepted = inStratum.filter((r) => r.final === "resolved").length;
        const stillRejected = inStratum.filter((r) => r.final === "rejected").length;
        const dropped = inStratum.filter((r) => r.final === "ambiguous" || r.final === "unresolved").length;
        return { stratum, n: inStratum.length, nowAccepted, stillRejected, dropped };
      });

      const lines = [
        "",
        "════════════════════════════════════════════════════════════════════",
        "CASCADA REAL (graph/resolve.ts, 9 etapas) sobre las 200 filas etiquetadas — jekyll/lib, Ruby, ÚNICO repo",
        "════════════════════════════════════════════════════════════════════",
        fmt(clause1) + ` — gate ${(PRECISION_GATE * 100).toFixed(0)}%: ${clause1.rate >= PRECISION_GATE ? "PASA" : "FALLA"}`,
        "",
        "Reclasificación por estrato original del dataset (label del probe de 4 etapas) bajo la cascada real de 9:",
        ...byStratum.map(
          (s) => `  ${s.stratum.padEnd(10)} n=${s.n}  ahora-aceptadas=${s.nowAccepted}  siguen-rechazadas=${s.stillRejected}  descartadas(ambig/unresolved)=${s.dropped}`,
        ),
        "",
        `Recuperación de bare-constant-receiver: de ${roleStratum.length} filas muestreadas del estrato 'role' (antes: 0/40 aceptadas, todo el estrato rechazado por el filtro de rol solo),`,
        `  ${roleConsideredByBCR.length} llegaron a la etapa bare-constant-receiver (receptor = constante desnuda),`,
        `  de las cuales ${roleRejectedByBCR.length} fueron rechazadas ahí (constante no coincide con clase única declarante) y ${roleRecovered.length} ACEPTADAS.`,
        fmt(bcrReport),
        `  extrapolado a la población del estrato ('role' = ${dataset.poolSizes.role} candidatos): ` +
          `≈${estRecoveredInPopulation.toFixed(1)} recuperadas, ≈${estCorrectlyRecovered.toFixed(1)} de ellas correctas.`,
        "",
        "HONESTIDAD: un repo (jekyll), un lenguaje (Ruby). No es una garantía universal — ver docstring de este archivo.",
        "════════════════════════════════════════════════════════════════════",
        "",
      ];
      // eslint-disable-next-line no-console
      console.log(lines.join("\n"));

      expect(clause1.rate, `precisión ${(clause1.rate * 100).toFixed(1)}% bajo el gate ${PRECISION_GATE * 100}%`).toBeGreaterThanOrEqual(
        PRECISION_GATE,
      );
    },
    120_000,
  );
});
