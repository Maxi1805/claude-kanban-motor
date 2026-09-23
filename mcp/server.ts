/**
 * Servidor MCP del motor de análisis.
 *
 * Expone el motor a cualquier agente por stdio, en dos familias de
 * herramientas:
 *
 *   PROBLEMAS   — qué está mal en el código y qué remedio propone el motor.
 *     analyze_repo · list_problems · new_problems · problems_in_touched_files
 *     new_dependencies · impact
 *
 *   NAVEGACIÓN  — el grafo de código que el motor ya construye para analizar:
 *     find_symbol · symbol_neighbors · path · file_overview · implementations
 *
 *   ANTES DE ESCRIBIR / DESPUÉS DE CAMBIAR:
 *     find_similar · tests_for · unused · risky_files · change_summary
 *
 * Todas las respuestas son ACOTADAS: el análisis completo de un repo grande
 * pesa megabytes y un agente no puede tragárselo. Cada herramienta devuelve
 * lo mínimo útil y un `limit` para pedir más.
 *
 * El análisis se cachea en memoria por directorio y se invalida solo cuando
 * cambia el contenido del árbol (`worktreeSignature`). La primera llamada
 * sobre un repo es lenta (segundos a minutos según tamaño); las siguientes,
 * instantáneas.
 *
 * El servidor LEE el árbol, nunca lo escribe: ni checkout, ni stash, ni
 * cambio de rama. La comparación contra un ref materializa el base en un
 * worktree temporal aparte (ver `engine/git-ref.ts`).
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { analyzeRepo, worktreeSignature } from "../src/server/services/code-analyzer.js";
import { compareAgainstRef } from "../src/server/services/engine/compare.js";
import { changedFilesSince, resolveBaseCommit } from "../src/server/services/engine/git-ref.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../src/server/services/graph/types.js";
import type { CodeAnalysis, CodeFinding } from "../src/shared/types.js";

const exec = promisify(execFile);

/* ── Caché de análisis ─────────────────────────────────────────────────── */

interface Snapshot {
  readonly signature: string;
  readonly analysis: CodeAnalysis;
  readonly graph: CodeGraph | null;
  readonly analyzedAt: string;
  readonly ms: number;
}

const snapshots = new Map<string, Snapshot>();
const inFlight = new Map<string, Promise<Snapshot>>();

async function snapshotOf(dirArg: string): Promise<Snapshot> {
  const dir = path.resolve(dirArg);
  const signature = await worktreeSignature(dir);
  const cached = snapshots.get(dir);
  if (cached && cached.signature === signature) return cached;

  const pending = inFlight.get(dir);
  if (pending) return pending;

  const run = (async () => {
    const t0 = Date.now();
    let graph: CodeGraph | null = null;
    const analysis = await analyzeRepo({
      dir,
      repoName: path.basename(dir),
      limits: { maxFindings: "unlimited" },
      onGraph: (r) => {
        graph = r.graph;
      },
    });
    const snap: Snapshot = { signature, analysis, graph, analyzedAt: new Date().toISOString(), ms: Date.now() - t0 };
    snapshots.set(dir, snap);
    return snap;
  })();
  inFlight.set(dir, run);
  try {
    return await run;
  } finally {
    inFlight.delete(dir);
  }
}

/* ── Formas compactas para el agente ───────────────────────────────────── */

const RECOMMENDATION_STATES = new Set(["ausente", "parcial"]);

/**
 * Un problema en dos o tres líneas de texto. Las respuestas son texto plano y no JSON a propósito: el JSON
 * repite cada clave en cada fila y un agente paga cada token. `here` omite la ruta cuando ya está en el título.
 */
function findingLines(f: CodeFinding, opts: { here?: string; tag?: string; detail?: boolean } = {}): string[] {
  const loc = f.locations?.[0];
  const at = loc
    ? `${loc.file === opts.here ? "" : loc.file}:${loc.startLine}${loc.symbol ? ` ${loc.symbol}` : ""}`
    : "";
  const metric = f.metric ? ` · ${f.metric.label} ${f.metric.value}` : "";
  const lines = [`- [${f.severity}] ${f.kind} ${at}${metric}${opts.tag ? ` ${opts.tag}` : ""}`];
  const hyps = f.hypotheses ?? [];
  const recs = hyps
    .filter((h) => RECOMMENDATION_STATES.has(h.state))
    .map((h) => `${h.pattern} (${h.layer}, ${h.state}${h.confidence ? `, ${h.confidence}` : ""})`);
  const remedy = recs.length ? recs.join("; ") : f.advice?.primary?.name;
  const applied = hyps.filter((h) => !RECOMMENDATION_STATES.has(h.state)).map((h) => `${h.pattern} (${h.state})`);
  if (remedy || applied.length)
    lines.push(`  remedio: ${remedy ?? "—"}${applied.length ? ` · ya aplicado: ${applied.join(", ")}` : ""}`);
  if (opts.detail) {
    lines.push(`  ${f.title}`);
    const why = f.advice?.primary;
    if (why?.why) lines.push(`  por qué: ${why.why}${why.source ? ` (${why.source})` : ""}`);
  }
  const others = (f.locations ?? []).slice(1, 4).map((l) => `${l.file === loc?.file ? "" : l.file}:${l.startLine}`);
  if (others.length) lines.push(`  también en: ${others.join(", ")}${(f.locations ?? []).length > 4 ? " …" : ""}`);
  return lines;
}

function worstBy(findings: readonly CodeFinding[]) {
  const byKind = new Map<string, { count: number; worst: number; worstAt?: string }>();
  for (const f of findings) {
    const v = typeof f.metric?.value === "number" ? f.metric.value : 0;
    const loc = f.locations?.[0];
    const e = byKind.get(f.kind) ?? { count: 0, worst: -Infinity };
    e.count++;
    if (v > e.worst) {
      e.worst = v;
      e.worstAt = loc ? `${loc.file}:${loc.startLine}${loc.symbol ? ` ${loc.symbol}` : ""}` : undefined;
    }
    byKind.set(f.kind, e);
  }
  return [...byKind.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([kind, e]) => ({ kind, count: e.count, worst: e.worst, worstAt: e.worstAt }));
}

function out(lines: readonly (string | false | null | undefined)[]) {
  return { content: [{ type: "text" as const, text: lines.filter((l): l is string => typeof l === "string").join("\n") }] };
}

/** "20 problemas" o "20 problemas (30 mostrados)" sólo cuando se cortó. */
const count = (total: number, shown: number, noun: string) => `${total} ${noun}${shown < total ? ` (${shown} mostrados)` : ""}`;

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/* ── Caché de comparaciones ────────────────────────────────────────────── */

type Comparison = Awaited<ReturnType<typeof compareAgainstRef>>;
interface CachedComparison {
  readonly result: Comparison;
  readonly headGraph: CodeGraph | null;
  readonly baseGraph: CodeGraph | null;
}
const comparisons = new Map<string, { key: string; value: CachedComparison }>();

/**
 * Compara contra `baseRef`, reusando el resultado mientras no cambien ni el árbol ni el commit del base.
 * El lado actual sale de `snapshotOf` (mismo caché que el resto de las herramientas); el lado base se
 * analiza en el worktree efímero y de ahí se guarda también su grafo, para `new_dependencies`.
 */
async function compareCached(dir: string, baseRef: string): Promise<CachedComparison> {
  const [signature, { stdout: head }, { stdout: base }] = await Promise.all([
    worktreeSignature(dir),
    exec("git", ["rev-parse", "HEAD"], { cwd: dir }),
    exec("git", ["rev-parse", baseRef], { cwd: dir }),
  ]);
  const key = `${signature}|${head.trim()}|${base.trim()}`;
  const slot = `${dir}|${baseRef}`;
  const hit = comparisons.get(slot);
  if (hit && hit.key === key) return hit.value;

  let headGraph: CodeGraph | null = null;
  let baseGraph: CodeGraph | null = null;
  const result = await compareAgainstRef({
    dir,
    baseRef,
    repoName: path.basename(dir),
    analyze: async (req) => {
      if (path.resolve(req.dir) === dir) {
        const snap = await snapshotOf(dir);
        headGraph = snap.graph;
        return snap.analysis;
      }
      return analyzeRepo({
        dir: req.dir,
        repoName: req.repoName,
        limits: { maxFindings: "unlimited" },
        onGraph: (r) => {
          baseGraph = r.graph;
        },
      });
    },
  });
  const value = { result, headGraph, baseGraph };
  comparisons.set(slot, { key, value });
  return value;
}

/* ── Qué líneas cambiaron ──────────────────────────────────────────────── */

/**
 * Rangos de líneas (del lado actual) que cambiaron contra `baseCommit`, por archivo relativo a `dir`.
 * Un archivo sin trackear cuenta entero. Un archivo borrado no aparece: no tiene símbolos en el árbol actual.
 */
async function changedRanges(dir: string, baseCommit: string): Promise<Map<string, [number, number][]>> {
  const ranges = new Map<string, [number, number][]>();
  const { stdout } = await exec("git", ["diff", "-U0", "--relative", "--no-renames", "--no-color", baseCommit, "--"], {
    cwd: dir,
    maxBuffer: 256 * 1024 * 1024,
  });
  let file: string | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.slice(6);
      continue;
    }
    const m = file && /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m || !file) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    // count 0 = sólo se borraron líneas: el símbolo que las contenía igual cambió.
    const list = ranges.get(file) ?? [];
    list.push([start, start + Math.max(count, 1) - 1]);
    ranges.set(file, list);
  }
  const { stdout: untracked } = await exec("git", ["ls-files", "--others", "--exclude-standard"], { cwd: dir });
  for (const f of untracked.split("\n").filter(Boolean)) ranges.set(f, [[1, Number.MAX_SAFE_INTEGER]]);
  return ranges;
}

const isTestFile = (file: string) =>
  /(^|[/.])(test|tests|spec|__tests__)([/.]|$)|_test\.|_spec\.|(^|\/)test_[^/]+\.py$/.test(file);

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|py|rb|go|java|kt|cs|php|rs|scala|swift)$/;

/**
 * Los archivos de test del directorio. EL MOTOR LOS EXCLUYE DEL ANÁLISIS (un test que repite forma no es un
 * problema de diseño), así que no están en el grafo: se listan aparte y se leen como texto.
 */
async function listTestFiles(dir: string): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["ls-files", "-co", "--exclude-standard"], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
    return stdout.split("\n").filter((f) => f && CODE_EXT.test(f) && isTestFile(f));
  } catch {
    const found: string[] = [];
    const walk = async (rel: string): Promise<void> => {
      for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else if (CODE_EXT.test(r) && isTestFile(r)) found.push(r);
      }
    };
    await walk("");
    return found;
  }
}

interface TestHit {
  readonly file: string;
  /** Qué objetivos nombra el test, con la primera línea donde aparece cada uno. */
  mentions: string[];
  /** true si además importa el archivo del objetivo: la señal fuerte. */
  readonly imports: boolean;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Qué tests tocan a estos símbolos o archivos, por texto: el test nombra el símbolo y/o importa su archivo.
 * No es cobertura medida: un test que llama por un alias no aparece, y uno que sólo nombra algo homónimo sí.
 */
async function testsTouching(dir: string, targets: readonly CodeGraphNode[]): Promise<TestHit[]> {
  // Nombres de 5+ letras: `name`, `get`, `run` aparecen en cualquier test y no dicen nada.
  const names = new Map<string, RegExp>();
  for (const t of targets) {
    const name = t.kind === "symbol" ? t.symbolPath[t.symbolPath.length - 1] : undefined;
    if (name && name.length >= 5 && !name.startsWith("<")) names.set(name, new RegExp(`\\b${escapeRe(name)}\\b`));
  }
  const modules = new Set(targets.map((t) => path.basename(t.file).replace(/\.[^.]+$/, "")));
  const importRe = [...modules].map((m) => new RegExp(`(import|require|from|use)\\b.*\\b${escapeRe(m)}\\b`));
  const hits: TestHit[] = [];
  for (const file of await listTestFiles(dir)) {
    let content: string;
    try {
      content = await readFile(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    const mentions: string[] = [];
    for (const [name, re] of names) {
      const at = lines.findIndex((l) => re.test(l));
      if (at >= 0) mentions.push(`${name}:${at + 1}`);
    }
    const imports = lines.some((l) => importRe.some((re) => re.test(l)));
    if (mentions.length || imports) hits.push({ file, mentions, imports });
  }
  // Un nombre que aparece en más de un tercio de los tests es vocabulario del proyecto, no una señal.
  const testCount = hits.length;
  if (testCount >= 6) {
    const freq = new Map<string, number>();
    for (const h of hits) for (const m of h.mentions) freq.set(m.split(":")[0], (freq.get(m.split(":")[0]) ?? 0) + 1);
    const common = new Set([...freq].filter(([, c]) => c > testCount / 3).map(([n]) => n));
    for (const h of hits) h.mentions.splice(0, h.mentions.length, ...h.mentions.filter((m) => !common.has(m.split(":")[0])));
  }
  const kept = hits.filter((h) => h.mentions.length || h.imports);
  hits.length = 0;
  hits.push(...kept);
  // Primero los que importan Y nombran; después los que sólo nombran; al final los que sólo importan.
  const rank = (h: TestHit) => (h.imports && h.mentions.length ? 0 : h.mentions.length ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || b.mentions.length - a.mentions.length);
}

const testLine = (h: TestHit) =>
  `  ${h.file}${h.imports ? " · importa" : ""}${h.mentions.length ? ` · nombra ${h.mentions.join(", ")}` : ""}`;

/**
 * Sube por el grafo desde `seeds`: quién los usa, quién usa a esos, hasta `maxDepth` saltos. Un símbolo
 * anidado también es alcanzado a través de su contenedor (usar la clase alcanza al método).
 */
function upward(g: CodeGraph, seeds: readonly string[], maxDepth: number) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const users = new Map<string, CodeGraphEdge[]>();
  const parentOf = new Map<string, string>();
  for (const e of g.edges) {
    if (e.kind === "contains") {
      if (byId.get(e.to)?.kind === "symbol") parentOf.set(e.to, e.from);
      continue;
    }
    const list = users.get(e.to) ?? [];
    list.push(e);
    users.set(e.to, list);
  }
  const reached = new Map<string, { depth: number; via: string; relation: string }>();
  let frontier = [...seeds];
  const seen = new Set(frontier);
  for (let level = 1; level <= maxDepth && frontier.length; level++) {
    const next: string[] = [];
    for (const id of frontier) {
      const targets = [id];
      const parent = parentOf.get(id);
      if (parent && byId.get(parent)?.kind === "symbol") targets.push(parent);
      for (const t of targets)
        for (const e of users.get(t) ?? []) {
          if (seen.has(e.from)) continue;
          const user = byId.get(e.from);
          if (!user || !NAVIGABLE.has(user.kind)) continue;
          seen.add(e.from);
          reached.set(e.from, { depth: level, via: byId.get(id)!.symbolPath.join(".") || byId.get(id)!.file, relation: e.kind });
          next.push(e.from);
        }
    }
    frontier = next;
  }
  return [...reached.entries()]
    .map(([id, r]) => ({ node: byId.get(id)!, ...r }))
    .sort((a, b) => a.depth - b.depth || a.node.file.localeCompare(b.node.file));
}

/* ── Rama base por defecto ─────────────────────────────────────────────── */

/** La rama por defecto del remoto (`origin/HEAD`), o `main`/`master` locales. */
async function defaultBaseRef(dir: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: dir });
    if (stdout.trim()) return stdout.trim();
  } catch {
    /* sin origin/HEAD */
  }
  for (const candidate of ["main", "master", "origin/main", "origin/master"]) {
    try {
      await exec("git", ["rev-parse", "--verify", "--quiet", candidate], { cwd: dir });
      return candidate;
    } catch {
      /* no existe */
    }
  }
  throw new Error("No encontré rama base: no hay origin/HEAD, main ni master. Pasá `base` explícito.");
}

/* ── Grafo: helpers de navegación ──────────────────────────────────────── */

/**
 * Cómo se escribe un nodo en una respuesta: `ruta#Clase.metodo:línea` para un símbolo, la ruta sola para un
 * archivo. Es también lo que `resolveNode` acepta de vuelta, así que el agente puede copiarlo tal cual.
 * Con `here`, un símbolo del mismo archivo se abrevia a `#Clase.metodo:línea`.
 */
function nodeLabel(n: CodeGraphNode, here?: string): string {
  if (n.kind === "symbol")
    return `${n.file === here ? "" : n.file}#${n.symbolPath.join(".")}${n.startLine ? `:${n.startLine}` : ""}`;
  if (n.kind === "file") return n.file;
  return `${n.kind}:${n.file}`;
}

/** Lo que es código: archivos y símbolos. Carpetas y nodos internos del motor (hallazgos, portadores) no se navegan. */
const NAVIGABLE = new Set<string>(["file", "symbol"]);

const span = (n: CodeGraphNode) => (n.startLine ? `${n.startLine}-${n.endLine ?? n.startLine}` : "");
const isAnon = (n: CodeGraphNode) => n.symbolPath.some((p) => p.startsWith("<anon"));

function candidatesText(label: string, candidates: readonly CodeGraphNode[]) {
  return out([
    `'${label}' es ambiguo, ${candidates.length} coincidencias. Repetí con una de estas:`,
    ...candidates.slice(0, 20).map((c) => `  ${nodeLabel(c)}`),
  ]);
}

/** Resuelve lo que pasó el agente a un nodo: un id exacto, `archivo#Simbolo`, una ruta de archivo, o un nombre suelto. */
function resolveNode(graph: CodeGraph, target: string): { node?: CodeGraphNode; candidates?: CodeGraphNode[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // `ruta#Simbolo:123` o `ruta#Simbolo:123-140` (lo que imprime nodeLabel) → `ruta#Simbolo`.
  const bare = target.includes("#") ? target.replace(/:\d+(?:-\d+)?$/, "") : target;
  const direct = byId.get(bare) ?? byId.get(`sym:${bare}`) ?? byId.get(`file:${bare}`);
  if (direct) return { node: direct };
  const lower = target.toLowerCase();
  const matches = graph.nodes.filter(
    (n) =>
      n.kind === "symbol" &&
      (n.symbolPath.join(".").toLowerCase() === lower || n.symbolPath[n.symbolPath.length - 1]?.toLowerCase() === lower),
  );
  if (matches.length === 1) return { node: matches[0] };
  if (matches.length > 1) return { candidates: matches };
  const file = graph.nodes.find((n) => n.kind === "file" && (n.file === target || n.file.endsWith(`/${target}`)));
  return file ? { node: file } : {};
}

/* ── Servidor ──────────────────────────────────────────────────────────── */

const server = new McpServer(
  { name: "claude-kanban-motor", version: "0.1.0" },
  {
    instructions:
      "Motor de análisis de código. Detecta problemas reales (funciones largas, complejidad, duplicación, " +
      "obsesión por primitivos…) y propone el remedio en dos capas: refactorizaciones (≈68 % de precisión) y " +
      "patrones de diseño (≈28 %; tratarlos como sugerencia a validar, no como orden). También expone el grafo " +
      "de código para navegar: buscar símbolos, ver quién llama a qué, y resumir un archivo.\n\n" +
      "Flujo típico: `analyze_repo` para el panorama → `list_problems` filtrando por archivo o tipo → " +
      "`new_problems` para ver sólo lo que introdujo el trabajo actual contra la rama base, `new_dependencies` " +
      "para las relaciones que creó, e `impact` para lo que puede romper. Para navegar: " +
      "`find_symbol` → `symbol_neighbors` → `file_overview`, `path` para ver cómo se conectan dos puntos, " +
      "`implementations` para jerarquías. Antes de escribir código nuevo: `find_similar` (¿ya existe?) y " +
      "`risky_files`. Después: `tests_for`, `change_summary` (¿mejoró o empeoró?) y `unused`.\n\n" +
      "La primera llamada sobre un repo lo analiza entero (segundos a minutos); las siguientes usan caché " +
      "hasta que cambie el código. Apuntá `dir` a la raíz de código del proyecto, no a un directorio que " +
      "contenga repos ajenos clonados: se analizaría todo.",
  },
);

const DIR = z.string().describe("Ruta absoluta al directorio a analizar (raíz del repo o una subcarpeta de código).");

server.registerTool(
  "analyze_repo",
  {
    title: "Panorama del repo",
    description:
      "Analiza el directorio y devuelve el panorama: archivos y líneas, cantidad de problemas por tipo con la " +
      "peor instancia de cada uno, y los archivos más cargados. Usalo primero para orientarte.",
    inputSchema: { dir: DIR },
    annotations: { readOnlyHint: true },
  },
  async ({ dir }) => {
    try {
      const s = await snapshotOf(dir);
      const findings = s.analysis.findings;
      const perFile = new Map<string, number>();
      for (const f of findings) {
        const file = f.locations?.[0]?.file;
        if (file) perFile.set(file, (perFile.get(file) ?? 0) + 1);
      }
      const recs = findings.reduce(
        (n, f) => n + (f.hypotheses ?? []).filter((h) => RECOMMENDATION_STATES.has(h.state)).length,
        0,
      );
      const hot = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      const g = s.graph;
      return out([
        `${path.resolve(dir)} · ${s.analysis.files.length} archivos · ${s.analysis.totalLines} líneas · ` +
          `${findings.length} problemas · ${recs} recomendaciones` +
          (g ? ` · grafo ${g.nodes.filter((n) => n.kind === "symbol").length} símbolos, ${g.edges.length} relaciones` : "") +
          ` · análisis ${Math.round(s.ms / 1000)} s`,
        "por tipo (cantidad · peor):",
        ...worstBy(findings).map((k) => `  ${k.kind} ${k.count} · ${k.worst}${k.worstAt ? ` en ${k.worstAt}` : ""}`),
        `archivos más cargados: ${hot.map(([f, c]) => `${f} (${c})`).join(", ")}`,
      ]);
    } catch (e) {
      return fail(`No pude analizar ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "list_problems",
  {
    title: "Problemas y remedios",
    description:
      "Lista problemas detectados con el remedio que propone el motor. Filtrá por archivo (substring de la ruta), " +
      "por tipo (ej. long-function, complexity, duplication) o por capa del remedio (refactorizacion | patron). " +
      "Ordenados de peor a mejor.",
    inputSchema: {
      dir: DIR,
      file: z.string().optional().describe("Substring de la ruta del archivo, ej. 'api/tasks.ts'."),
      kind: z.string().optional().describe("Tipo de problema, ej. 'long-function'."),
      layer: z.enum(["refactorizacion", "patron"]).optional().describe("Sólo problemas con un remedio de esta capa."),
      onlyWithRecommendation: z.boolean().optional().describe("Sólo los que tienen un remedio propuesto. Default false."),
      detail: z.boolean().optional().describe("true = agrega el título completo y el porqué de cada remedio. Default false."),
      limit: z.number().int().min(1).max(200).optional().describe("Máximo a devolver. Default 30."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, file, kind, layer, onlyWithRecommendation, detail, limit }) => {
    try {
      const s = await snapshotOf(dir);
      let fs = s.analysis.findings.slice();
      if (file) fs = fs.filter((f) => (f.locations ?? []).some((l) => l.file.includes(file)));
      if (kind) fs = fs.filter((f) => f.kind === kind);
      if (layer)
        fs = fs.filter((f) => (f.hypotheses ?? []).some((h) => h.layer === layer && RECOMMENDATION_STATES.has(h.state)));
      if (onlyWithRecommendation)
        fs = fs.filter((f) => (f.hypotheses ?? []).some((h) => RECOMMENDATION_STATES.has(h.state)));
      fs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const n = limit ?? 30;
      const shown = fs.slice(0, n);
      return out([count(fs.length, shown.length, "problemas"), ...shown.flatMap((f) => findingLines(f, { detail }))]);
    } catch (e) {
      return fail(`No pude listar problemas en ${dir}: ${(e as Error).message}`);
    }
  },
);

const BASE = z
  .string()
  .optional()
  .describe("Ref de git contra el que comparar (rama, tag, sha). Default: la rama por defecto del remoto (origin/HEAD) o main/master.");

server.registerTool(
  "new_problems",
  {
    title: "Problemas que introdujo el trabajo actual",
    description:
      "Compara el código actual contra una rama base y devuelve SÓLO los problemas que no existían ahí: lo que " +
      "introdujo el trabajo en curso (commits y cambios sin commitear). Usa el punto de bifurcación (merge-base), " +
      "así que no te culpa de lo que cambió en la base después de que ramificaste. `partiallyIntroduced` son " +
      "problemas viejos a los que les agregaste código nuevo: la parte nueva es tuya, el problema no.",
    inputSchema: {
      dir: z.string().describe("Ruta absoluta a un checkout de git."),
      base: BASE,
      detail: z.boolean().optional().describe("true = agrega el título completo y el porqué de cada remedio. Default false."),
      limit: z.number().int().min(1).max(200).optional().describe("Máximo a devolver. Default 50."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, base, detail, limit }) => {
    try {
      const d = path.resolve(dir);
      const baseRef = base ?? (await defaultBaseRef(d));
      const cmp = (await compareCached(d, baseRef)).result;
      const n = limit ?? 50;
      const partial = cmp.partiallyIntroduced.slice(0, 20);
      const fixed = cmp.resolved.slice(0, 20);
      return out([
        `base ${baseRef} (${cmp.baseCommit.slice(0, 10)}${cmp.mergeBaseUsed ? ", merge-base" : ""}) · ` +
          `${cmp.changedFiles.length} archivos cambiados${cmp.headDirty ? " · incluye cambios sin commitear" : ""}`,
        `nuevos: ${count(cmp.introduced.length, Math.min(n, cmp.introduced.length), "problemas")}`,
        ...cmp.introduced.slice(0, n).flatMap((f) => findingLines(f, { detail })),
        partial.length > 0 && `problemas viejos a los que agregaste código (${cmp.partiallyIntroduced.length}):`,
        ...partial.flatMap((p) => [...findingLines(p.finding, { detail }), `  lo nuevo: ${p.newLocations.join(", ")}`]),
        fixed.length > 0 && `resueltos por el cambio (${cmp.resolved.length}):`,
        ...fixed.flatMap((f) => findingLines(f, { detail })),
      ]);
    } catch (e) {
      return fail(`No pude comparar ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "problems_in_touched_files",
  {
    title: "Problemas en los archivos que tocaste",
    description:
      "Todos los problemas que viven en los archivos modificados contra la rama base, existieran antes o no. " +
      "Responde 'qué me conviene arreglar ya que estoy acá'. Cada uno va marcado [nuevo] o " +
      "[ya estaba] — no presentes los viejos como generados por el trabajo actual.",
    inputSchema: {
      dir: z.string().describe("Ruta absoluta a un checkout de git."),
      base: BASE,
      detail: z.boolean().optional().describe("true = agrega el título completo y el porqué de cada remedio. Default false."),
      limit: z.number().int().min(1).max(200).optional().describe("Máximo a devolver. Default 50."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, base, detail, limit }) => {
    try {
      const d = path.resolve(dir);
      const baseRef = base ?? (await defaultBaseRef(d));
      const cmp = (await compareCached(d, baseRef)).result;
      const n = limit ?? 50;
      const shown = cmp.inTouchedFiles.slice(0, n);
      return out([
        `base ${baseRef} · archivos cambiados: ${cmp.changedFiles.join(", ")}`,
        count(cmp.inTouchedFiles.length, shown.length, "problemas"),
        ...shown.flatMap((t) => findingLines(t.finding, { detail, tag: t.alsoIntroduced ? "[nuevo]" : "[ya estaba]" })),
      ]);
    } catch (e) {
      return fail(`No pude comparar ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "find_symbol",
  {
    title: "Buscar símbolo",
    description:
      "Busca clases, funciones, métodos y módulos por nombre en el grafo de código. Coincidencia por substring, " +
      "sin distinguir mayúsculas. Devuelve cada uno como `ruta#Simbolo:línea`, que se puede pasar tal cual a `symbol_neighbors` o `path`.",
    inputSchema: {
      dir: DIR,
      name: z.string().describe("Nombre o parte del nombre, ej. 'createTask' o 'Router'."),
      limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, name, limit }) => {
    try {
      const s = await snapshotOf(dir);
      if (!s.graph) return fail("Este análisis no produjo grafo (¿lenguaje sin soporte?).");
      const q = name.toLowerCase();
      const hits = s.graph.nodes
        .filter((n) => n.kind === "symbol" && n.symbolPath.join(".").toLowerCase().includes(q))
        .sort((a, b) => {
          const ea = a.symbolPath[a.symbolPath.length - 1]?.toLowerCase() === q ? 0 : 1;
          const eb = b.symbolPath[b.symbolPath.length - 1]?.toLowerCase() === q ? 0 : 1;
          return ea - eb || a.symbolPath.length - b.symbolPath.length;
        });
      const n = limit ?? 20;
      const shown = hits.slice(0, n);
      return out([count(hits.length, shown.length, "símbolos"), ...shown.map((h) => `  ${nodeLabel(h)}${h.endLine ? `-${h.endLine}` : ""}`)]);
    } catch (e) {
      return fail(`No pude buscar en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "symbol_neighbors",
  {
    title: "Vecinos de un símbolo",
    description:
      "Navega el grafo desde un símbolo o archivo: quién lo usa (entrantes) y qué usa (salientes) — llamadas, " +
      "referencias, imports, herencia, instanciación. `target` acepta lo que imprime `find_symbol` " +
      "('ruta#Clase.metodo:línea'), una ruta de archivo, o un nombre único. Los símbolos del mismo archivo se " +
      "abrevian a '#Simbolo:línea'.",
    inputSchema: {
      dir: DIR,
      target: z.string().describe("'ruta#Simbolo:línea' (como lo imprime find_symbol), ruta de archivo, o nombre de símbolo."),
      direction: z.enum(["in", "out", "both"]).optional().describe("in = quién lo usa, out = qué usa. Default both."),
      edgeKinds: z
        .array(z.string())
        .optional()
        .describe("Filtrar por tipo de relación: calls, references, imports, extends, implements, instantiates…"),
      limit: z.number().int().min(1).max(200).optional().describe("Máximo por dirección. Default 40."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, target, direction, edgeKinds, limit }) => {
    try {
      const s = await snapshotOf(dir);
      if (!s.graph) return fail("Este análisis no produjo grafo.");
      const { node, candidates } = resolveNode(s.graph, target);
      if (!node && candidates)
        return candidatesText(target, candidates);
      if (!node) return fail(`No encontré '${target}' en el grafo. Probá find_symbol primero.`);

      const byId = new Map(s.graph.nodes.map((n) => [n.id, n]));
      const kinds = edgeKinds?.length ? new Set(edgeKinds) : null;
      const navigable = (id: string) => NAVIGABLE.has(byId.get(id)?.kind ?? "");
      const keep = (e: CodeGraphEdge) =>
        e.kind !== "contains" && (!kinds || kinds.has(e.kind)) && navigable(e.from) && navigable(e.to);
      const dirn = direction ?? "both";
      const n = limit ?? 40;
      const here = node.file;
      // Una fila por vecino, con todas sus relaciones juntas: "calls, references  X" en vez de dos filas.
      const grouped = (edges: CodeGraphEdge[], otherOf: (e: CodeGraphEdge) => string) => {
        const byOther = new Map<string, Set<string>>();
        for (const e of edges) {
          const k = otherOf(e);
          (byOther.get(k) ?? byOther.set(k, new Set()).get(k)!).add(e.kind);
        }
        return [...byOther.entries()].map(([id, rels]) => {
          const o = byId.get(id);
          return `  ${[...rels].join(", ")}  ${o ? nodeLabel(o, here) : id}`;
        });
      };
      const incoming = dirn === "out" ? [] : s.graph.edges.filter((e) => e.to === node.id && keep(e));
      const outgoing = dirn === "in" ? [] : s.graph.edges.filter((e) => e.from === node.id && keep(e));
      const usedBy = grouped(incoming, (e) => e.from);
      const uses = grouped(outgoing, (e) => e.to);
      const members = s.graph.edges
        .filter((e) => e.from === node.id && e.kind === "contains")
        .map((e) => byId.get(e.to))
        .filter((m): m is CodeGraphNode => !!m && m.kind === "symbol" && !isAnon(m));
      return out([
        `${nodeLabel(node)}${node.endLine ? `-${node.endLine}` : ""}`,
        dirn !== "out" && `lo usan: ${count(usedBy.length, Math.min(n, usedBy.length), "")}`.trimEnd(),
        ...usedBy.slice(0, n),
        dirn !== "in" && `usa: ${count(uses.length, Math.min(n, uses.length), "")}`.trimEnd(),
        ...uses.slice(0, n),
        members.length > 0 && `contiene: ${members.slice(0, n).map((m) => `${m.symbolPath[m.symbolPath.length - 1]}:${m.startLine ?? "?"}`).join(", ")}`,
      ]);
    } catch (e) {
      return fail(`No pude navegar en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "path",
  {
    title: "Camino entre dos puntos del código",
    description:
      "El camino más corto en el grafo entre dos símbolos o archivos: cómo se conecta A con B (llamadas, " +
      "referencias, imports, herencia, y la pertenencia archivo↔símbolo). `from` y `to` aceptan lo mismo que " +
      "`symbol_neighbors`. Por defecto ignora la dirección de las relaciones; `directed: true` sólo sigue " +
      "A→usa→B.",
    inputSchema: {
      dir: DIR,
      from: z.string().describe("Origen: id de nodo, 'ruta#Simbolo', ruta de archivo, o nombre de símbolo."),
      to: z.string().describe("Destino, mismo formato."),
      directed: z.boolean().optional().describe("true = sólo seguir relaciones en su sentido (A usa … B). Default false."),
      maxHops: z.number().int().min(1).max(30).optional().describe("Largo máximo del camino. Default 12."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, from, to, directed, maxHops }) => {
    try {
      const s = await snapshotOf(dir);
      if (!s.graph) return fail("Este análisis no produjo grafo.");
      const ends = [resolveNode(s.graph, from), resolveNode(s.graph, to)];
      for (const [i, r] of ends.entries()) {
        const label = i === 0 ? from : to;
        if (!r.node && r.candidates)
          return candidatesText(label, r.candidates);
        if (!r.node) return fail(`No encontré '${label}' en el grafo. Probá find_symbol primero.`);
      }
      const [a, b] = [ends[0].node!, ends[1].node!];
      const byId = new Map(s.graph.nodes.map((n) => [n.id, n]));

      // Sólo archivos y símbolos: "los dos están en src/" no es una conexión, y los nodos internos del motor tampoco.
      const adj = new Map<string, { to: string; edge: CodeGraphEdge; forward: boolean }[]>();
      const link = (x: string, y: string, edge: CodeGraphEdge, forward: boolean) => {
        const list = adj.get(x) ?? [];
        list.push({ to: y, edge, forward });
        adj.set(x, list);
      };
      for (const e of s.graph.edges) {
        const f = byId.get(e.from);
        const t = byId.get(e.to);
        if (!f || !t || !NAVIGABLE.has(f.kind) || !NAVIGABLE.has(t.kind)) continue;
        link(e.from, e.to, e, true);
        if (!directed) link(e.to, e.from, e, false);
      }

      // Dijkstra con costo 1 por relación real y 3 por subir/bajar archivo↔símbolo: así "A está en el archivo
      // que referencia a B" sólo gana cuando no hay un camino por símbolos de largo parecido.
      const limit = maxHops ?? 12;
      const cost = (e: CodeGraphEdge) => (e.kind === "contains" ? 3 : 1);
      const prev = new Map<string, { from: string; edge: CodeGraphEdge; forward: boolean }>();
      const best = new Map<string, number>([[a.id, 0]]);
      const hopsTo = new Map<string, number>([[a.id, 0]]);
      const buckets: string[][] = [[a.id]];
      const done = new Set<string>();
      for (let c = 0; c < buckets.length && !done.has(b.id); c++) {
        for (const cur of buckets[c] ?? []) {
          if (done.has(cur) || best.get(cur) !== c) continue;
          done.add(cur);
          if (cur === b.id) break;
          const h = hopsTo.get(cur)!;
          if (h >= limit) continue;
          for (const step of adj.get(cur) ?? []) {
            const nc = c + cost(step.edge);
            if (nc >= (best.get(step.to) ?? Infinity)) continue;
            best.set(step.to, nc);
            hopsTo.set(step.to, h + 1);
            prev.set(step.to, { from: cur, edge: step.edge, forward: step.forward });
            (buckets[nc] ??= []).push(step.to);
          }
        }
      }
      if (!done.has(b.id))
        return out([`Sin camino entre ${nodeLabel(a)} y ${nodeLabel(b)} de ${limit} saltos o menos${directed ? " siguiendo la dirección" : ""}.`]);

      // Una línea por salto: "-calls->" = el de arriba usa al de abajo; "<-calls-" = al revés.
      const steps: string[] = [];
      for (let cur = b.id; cur !== a.id; ) {
        const p = prev.get(cur)!;
        steps.unshift(`  ${p.forward ? `-${p.edge.kind}->` : `<-${p.edge.kind}-`} ${nodeLabel(byId.get(cur)!)}`);
        cur = p.from;
      }
      return out([`${steps.length} saltos`, `  ${nodeLabel(a)}`, ...steps]);
    } catch (e) {
      return fail(`No pude buscar el camino en ${dir}: ${(e as Error).message}`);
    }
  },
);

/** Clave de una relación que sobrevive entre dos grafos: los ids son rutas relativas, así que coinciden. */
const edgeKey = (e: CodeGraphEdge) => `${e.from}|${e.kind}|${e.to}`;

server.registerTool(
  "new_dependencies",
  {
    title: "Dependencias que creó el trabajo actual",
    description:
      "Las relaciones que el código nuevo agregó contra una rama base: imports, llamadas, referencias, herencia " +
      "e instanciación que no existían. También las que se quitaron. Sirve para ver si un cambio amarró cosas que " +
      "no debía (una capa importando otra que no le corresponde, un módulo nuevo del que ahora depende medio repo). " +
      "Sólo cuenta relaciones con al menos una punta en un archivo modificado.",
    inputSchema: {
      dir: z.string().describe("Ruta absoluta a un checkout de git."),
      base: BASE,
      edgeKinds: z.array(z.string()).optional().describe("Filtrar por tipo: imports, calls, references, extends…"),
      limit: z.number().int().min(1).max(300).optional().describe("Máximo por lista. Default 60."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, base, edgeKinds, limit }) => {
    try {
      const d = path.resolve(dir);
      const baseRef = base ?? (await defaultBaseRef(d));
      const { result, headGraph, baseGraph } = await compareCached(d, baseRef);
      if (!headGraph || !baseGraph) return fail("Uno de los dos análisis no produjo grafo.");
      const changed = new Set(result.changedFiles);
      const kinds = edgeKinds?.length ? new Set(edgeKinds) : null;

      const relevant = (g: CodeGraph) => {
        const byId = new Map(g.nodes.map((n) => [n.id, n]));
        const out = new Map<string, { e: CodeGraphEdge; from: CodeGraphNode; to: CodeGraphNode }>();
        for (const e of g.edges) {
          if (e.kind === "contains" || (kinds && !kinds.has(e.kind))) continue;
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          if (!from || !to || !NAVIGABLE.has(from.kind) || !NAVIGABLE.has(to.kind)) continue;
          if (!changed.has(from.file) && !changed.has(to.file)) continue;
          out.set(edgeKey(e), { e, from, to });
        }
        return out;
      };
      const now = relevant(headGraph);
      const before = relevant(baseGraph);
      const added = [...now.entries()].filter(([k]) => !before.has(k)).map(([, v]) => v);
      const removed = [...before.entries()].filter(([k]) => !now.has(k)).map(([, v]) => v);

      const fmt = (x: { e: CodeGraphEdge; from: CodeGraphNode; to: CodeGraphNode }) =>
        `  ${nodeLabel(x.from)} -${x.e.kind}-> ${nodeLabel(x.to, x.from.file)}`;
      // Lo que cruza archivos primero: es lo que acopla. Dentro de un archivo es detalle.
      const order = (a: { from: CodeGraphNode; to: CodeGraphNode }, b: { from: CodeGraphNode; to: CodeGraphNode }) =>
        Number(a.from.file === a.to.file) - Number(b.from.file === b.to.file);
      added.sort(order);
      removed.sort(order);

      const fileLevel = (list: typeof added) => {
        const pairs = new Map<string, number>();
        for (const x of list) {
          if (x.from.file === x.to.file) continue;
          const k = `${x.from.file} -> ${x.to.file}`;
          pairs.set(k, (pairs.get(k) ?? 0) + 1);
        }
        return [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([pair, c]) => `  ${pair} (${c})`);
      };

      const n = limit ?? 60;
      const files = fileLevel(added);
      return out([
        `base ${baseRef} (${result.baseCommit.slice(0, 10)}) · ${result.changedFiles.length} archivos cambiados · ` +
          `${added.length} relaciones nuevas, ${removed.length} quitadas`,
        files.length > 0 && "archivos que ahora dependen de otros:",
        ...files,
        added.length > 0 && `agregadas: ${count(added.length, Math.min(n, added.length), "")}`.trimEnd(),
        ...added.slice(0, n).map(fmt),
        removed.length > 0 && `quitadas: ${count(removed.length, Math.min(n, removed.length), "")}`.trimEnd(),
        ...removed.slice(0, n).map(fmt),
      ]);
    } catch (e) {
      return fail(`No pude comparar dependencias en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "impact",
  {
    title: "Qué puede romper el cambio actual",
    description:
      "Toma los símbolos que el trabajo actual modificó (por las líneas del diff contra la rama base) y sube por " +
      "el grafo: quién los usa, quién usa a esos, hasta `depth` saltos. Devuelve los afectados por distancia y los " +
      "tests entre ellos: los lugares a revisar y los tests a correr. No necesita analizar la base, así que es " +
      "rápido. `base: \"HEAD\"` mide sólo lo no commiteado.",
    inputSchema: {
      dir: z.string().describe("Ruta absoluta a un checkout de git."),
      base: BASE,
      depth: z.number().int().min(1).max(8).optional().describe("Saltos hacia arriba. Default 3."),
      limit: z.number().int().min(1).max(300).optional().describe("Máximo de afectados a devolver. Default 80."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, base, depth, limit }) => {
    try {
      const d = path.resolve(dir);
      const baseRef = base ?? (await defaultBaseRef(d));
      const baseCommit = (await resolveBaseCommit(d, baseRef)).commit;
      const [s, ranges, changedFiles] = await Promise.all([snapshotOf(d), changedRanges(d, baseCommit), changedFilesSince(d, baseCommit)]);
      if (!s.graph) return fail("Este análisis no produjo grafo.");
      const g = s.graph;
      const byId = new Map(g.nodes.map((n) => [n.id, n]));

      // Los símbolos tocados: los que se solapan con una línea cambiada, quedándose con el más interno
      // (si cambió un método, el afectado es el método, no toda la clase).
      const overlaps = (n: CodeGraphNode) =>
        n.kind === "symbol" &&
        n.startLine !== undefined &&
        (ranges.get(n.file) ?? []).some(([a, b]) => a <= (n.endLine ?? n.startLine!) && b >= n.startLine!);
      // Los callbacks anónimos no tienen quién los llame por nombre: el tocado es la función que los contiene.
      const touched = g.nodes.filter((n) => overlaps(n) && !n.symbolPath.some((p) => p.startsWith("<anon")));
      const seeds = touched.filter(
        (n) =>
          !touched.some(
            (m) =>
              m !== n &&
              m.file === n.file &&
              m.symbolPath.length > n.symbolPath.length &&
              n.symbolPath.every((p, i) => m.symbolPath[i] === p),
          ),
      );

      const maxDepth = depth ?? 3;
      const affected = upward(g, seeds.map((x) => x.id), maxDepth);
      const affectedFiles = new Set(affected.map((a) => a.node.file));
      // Los tests no están en el grafo (el motor los excluye): se buscan por texto contra lo cambiado y lo afectado.
      const tests = (await testsTouching(d, [...seeds, ...affected.map((x) => x.node)])).filter((h) => h.mentions.length);
      const n = limit ?? 80;
      const perDepth = Array.from({ length: maxDepth }, (_, i) => affected.filter((a) => a.depth === i + 1).length);
      return out([
        `base ${baseRef} (${baseCommit.slice(0, 10)}) · ${changedFiles.length} archivos cambiados`,
        `cambiaste: ${seeds.slice(0, 60).map((x) => nodeLabel(x)).join(", ") || "ningún símbolo"}`,
        `afectados: ${affected.length} en ${affectedFiles.size} archivos (por salto: ${perDepth.join(" / ")})`,
        tests.length > 0 && `tests que nombran lo cambiado o lo afectado (${tests.length}):`,
        ...tests.slice(0, 20).map(testLine),
        ...affected.slice(0, n).map((a) => `  ${a.depth} ${nodeLabel(a.node)} -${a.relation}-> ${a.via}`),
        affected.length > n && `  … ${affected.length - n} más`,
      ]);
    } catch (e) {
      return fail(`No pude calcular el impacto en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "file_overview",
  {
    title: "Resumen de un archivo",
    description:
      "Todo lo que el motor sabe de un archivo: sus símbolos con líneas, qué importa, quién lo importa, y sus " +
      "problemas con el remedio propuesto. Útil antes de editarlo.",
    inputSchema: {
      dir: DIR,
      file: z.string().describe("Ruta del archivo relativa al dir, o un sufijo único de ella."),
      detail: z.boolean().optional().describe("true = agrega el título completo y el porqué de cada remedio. Default false."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, file, detail }) => {
    try {
      const s = await snapshotOf(dir);
      const summary = s.analysis.files.find((f) => f.path === file || f.path.endsWith(`/${file}`) || f.path.endsWith(file));
      const filePath = summary?.path ?? file;
      const problems = s.analysis.findings.filter((f) => (f.locations ?? []).some((l) => l.file === filePath));
      const g = s.graph;
      const symbols = g ? g.nodes.filter((n) => n.kind === "symbol" && n.file === filePath).sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0)) : [];
      const fileId = `file:${filePath}`;
      const byId = g ? new Map(g.nodes.map((n) => [n.id, n])) : new Map();
      const imports = g ? g.edges.filter((e) => e.kind === "imports" && e.from === fileId).map((e) => byId.get(e.to)?.file ?? e.to) : [];
      const importedBy = g ? g.edges.filter((e) => e.kind === "imports" && e.to === fileId).map((e) => byId.get(e.from)?.file ?? e.from) : [];
      if (!summary && !symbols.length && !problems.length) return fail(`No encontré '${file}' en el análisis de ${dir}.`);
      // Anidados con sangría en vez de repetir el prefijo; los callbacks anónimos no aportan.
      const named = symbols.filter((x) => !isAnon(x));
      // Los callbacks (handlers de rutas, listeners) se cuentan en su función en vez de listarse uno por uno.
      const callbacks = new Map<string, number>();
      for (const x of symbols) {
        const at = x.symbolPath.findIndex((p) => p.startsWith("<anon"));
        if (at <= 0 || at !== x.symbolPath.length - 1) continue;
        const owner = x.symbolPath.slice(0, at).join(".");
        callbacks.set(owner, (callbacks.get(owner) ?? 0) + 1);
      }
      return out([
        `${filePath}${summary ? ` · ${summary.lines} líneas · ${summary.language}` : ""}`,
        "símbolos:",
        ...named.slice(0, 80).map((x) => `${"  ".repeat(x.symbolPath.length)}${x.symbolPath[x.symbolPath.length - 1]} ${span(x)}${x.family === "class-like" ? " (tipo)" : ""}${callbacks.has(x.symbolPath.join(".")) ? ` · ${callbacks.get(x.symbolPath.join("."))} callbacks` : ""}`),
        named.length > 80 && `  … ${named.length - 80} más`,
        `importa: ${[...new Set(imports)].slice(0, 40).join(", ") || "—"}`,
        `lo importan: ${[...new Set(importedBy)].slice(0, 40).join(", ") || "—"}`,
        problems.length > 0 && `problemas (${problems.length}):`,
        ...problems.flatMap((f) => findingLines(f, { here: filePath, detail })),
      ]);
    } catch (e) {
      return fail(`No pude resumir ${file}: ${(e as Error).message}`);
    }
  },
);

/* ── Parecidos: índice de vocabulario por función ─────────────────────── */

const STOPWORDS = new Set(
  ("const let var function return this self def class public private protected static void string number boolean " +
    "any null undefined true false none nil new await async import export from require module end else elif then " +
    "while for each case switch break continue try catch finally throw raise yield type interface extends implements " +
    "readonly unknown never object array map set get has err error value values item items data result args opts")
    .split(" "),
);

/** Palabras de un texto de código: identificadores partidos por camelCase y snake_case, sin palabras del lenguaje. */
function vocabulary(textIn: string): string[] {
  const words: string[] = [];
  for (const id of textIn.match(/[A-Za-z_$][\w$]*/g) ?? [])
    for (const part of id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_$]+/)) {
      const w = part.toLowerCase();
      if (w.length >= 3 && !STOPWORDS.has(w)) words.push(w);
    }
  return words;
}

interface SimilarityIndex {
  readonly docs: { node: CodeGraphNode; lines: number; vec: Map<string, number>; norm: number }[];
  readonly idf: Map<string, number>;
}

const indexes = new WeakMap<Snapshot, Promise<SimilarityIndex>>();

/**
 * Un vector TF-IDF por función (cuerpo + nombre, el nombre pesa triple). Se arma una vez por instantánea.
 * Encuentra funciones que hablan de lo mismo, no clones exactos: los clones ya los reporta `duplication`.
 */
function similarityIndex(dir: string, s: Snapshot): Promise<SimilarityIndex> {
  const cached = indexes.get(s);
  if (cached) return cached;
  const built = (async () => {
    const g = s.graph!;
    const fns = g.nodes.filter(
      (n) => n.kind === "symbol" && n.family === "function-like" && !isAnon(n) && n.startLine && (n.endLine ?? 0) - n.startLine >= 2,
    );
    const texts = new Map<string, string[]>();
    for (const file of new Set(fns.map((n) => n.file))) {
      try {
        texts.set(file, (await readFile(path.join(dir, file), "utf8")).split("\n"));
      } catch {
        /* el archivo desapareció entre el análisis y la consulta */
      }
    }
    const raw = fns.flatMap((node) => {
      const lines = texts.get(node.file);
      if (!lines) return [];
      const body = lines.slice(node.startLine! - 1, node.endLine).join("\n");
      const name = node.symbolPath[node.symbolPath.length - 1];
      return [{ node, lines: node.endLine! - node.startLine! + 1, words: [...vocabulary(body), ...Array(3).fill(vocabulary(name)).flat()] }];
    });
    const df = new Map<string, number>();
    for (const r of raw) for (const w of new Set(r.words)) df.set(w, (df.get(w) ?? 0) + 1);
    const idf = new Map([...df].map(([w, c]) => [w, Math.log((raw.length + 1) / (c + 1)) + 1]));
    const docs = raw.map((r) => {
      const { vec, norm } = weigh(r.words, idf);
      return { node: r.node, lines: r.lines, vec, norm };
    });
    return { docs, idf };
  })();
  indexes.set(s, built);
  return built;
}

function weigh(words: readonly string[], idf: Map<string, number>) {
  const tf = new Map<string, number>();
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
  const vec = new Map([...tf].map(([w, c]) => [w, (1 + Math.log(c)) * (idf.get(w) ?? 1)]));
  const norm = Math.sqrt([...vec.values()].reduce((a, v) => a + v * v, 0)) || 1;
  return { vec, norm };
}

server.registerTool(
  "find_similar",
  {
    title: "¿Ya existe algo parecido?",
    description:
      "Antes de escribir una función nueva: busca funciones existentes que hacen algo parecido, para reusarlas o " +
      "extender en vez de duplicar. Se le pasa UNA de tres cosas: `symbol` (una función existente: busca sus " +
      "gemelas), `code` (el borrador que ibas a escribir) o `words` (qué hace, con palabras en el idioma del " +
      "código, ej. 'parse page limit params'). Compara vocabulario, no texto exacto.",
    inputSchema: {
      dir: DIR,
      symbol: z.string().optional().describe("Función existente, como la imprime find_symbol."),
      code: z.string().optional().describe("Código que ibas a escribir."),
      words: z.string().optional().describe("Qué hace, en palabras del idioma del código."),
      limit: z.number().int().min(1).max(50).optional().describe("Default 10."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, symbol, code, words, limit }) => {
    try {
      const d = path.resolve(dir);
      const s = await snapshotOf(d);
      if (!s.graph) return fail("Este análisis no produjo grafo.");
      const idx = await similarityIndex(d, s);
      let query: { vec: Map<string, number>; norm: number };
      let self: CodeGraphNode | undefined;
      if (symbol) {
        const r = resolveNode(s.graph, symbol);
        if (!r.node && r.candidates) return candidatesText(symbol, r.candidates);
        const doc = idx.docs.find((x) => x.node.id === r.node?.id);
        if (!doc) return fail(`'${symbol}' no es una función indexada (¿es una clase, un archivo o tiene menos de 3 líneas?).`);
        self = doc.node;
        query = doc;
      } else if (code || words) {
        query = weigh(vocabulary(`${code ?? ""} ${words ?? ""}`), idx.idf);
        if (!query.vec.size) return fail("La consulta no tiene palabras útiles (todas muy cortas o del lenguaje).");
      } else return fail("Pasá `symbol`, `code` o `words`.");

      const related = (n: CodeGraphNode) =>
        !!self &&
        n.file === self.file &&
        (n.symbolPath.every((p, i) => self!.symbolPath[i] === p) || self.symbolPath.every((p, i) => n.symbolPath[i] === p));
      const scored = idx.docs
        .filter((x) => !related(x.node))
        .map((x) => {
          let dot = 0;
          for (const [w, v] of query.vec) dot += v * (x.vec.get(w) ?? 0);
          return { x, score: dot / (query.norm * x.norm) };
        })
        .filter((r) => r.score >= 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit ?? 10);
      if (!scored.length) return out(["Nada parecido (similitud < 0,15)."]);
      return out([
        "similitud · función · líneas",
        ...scored.map((r) => `  ${r.score.toFixed(2)} ${nodeLabel(r.x.node)}-${r.x.node.endLine} · ${r.x.lines}`),
      ]);
    } catch (e) {
      return fail(`No pude buscar parecidos en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "tests_for",
  {
    title: "Qué tests cubren esto",
    description:
      "Los tests que tocan un símbolo o archivo: los que lo nombran o importan su archivo, y los que llegan por " +
      "quienes lo usan (hasta `depth` saltos). Búsqueda por texto en los archivos de test —el motor no los " +
      "analiza—, así que es una pista fuerte, no cobertura medida.",
    inputSchema: {
      dir: DIR,
      target: z.string().describe("'ruta#Simbolo:línea' (como lo imprime find_symbol), ruta de archivo, o nombre."),
      depth: z.number().int().min(0).max(4).optional().describe("Saltos hacia quienes lo usan. 0 = sólo el objetivo. Default 1."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, target, depth }) => {
    try {
      const d = path.resolve(dir);
      const s = await snapshotOf(d);
      if (!s.graph) return fail("Este análisis no produjo grafo.");
      const { node, candidates } = resolveNode(s.graph, target);
      if (!node && candidates) return candidatesText(target, candidates);
      if (!node) return fail(`No encontré '${target}' en el grafo.`);
      const own = node.kind === "file" ? s.graph.nodes.filter((n) => n.file === node.file && n.kind === "symbol" && !isAnon(n)) : [node];
      const callers = upward(s.graph, own.map((n) => n.id), depth ?? 1).map((a) => a.node);
      const touching = await testsTouching(d, own.length ? own : [node]);
      const direct = touching.filter((h) => h.mentions.length);
      const importOnly = touching.filter((h) => !h.mentions.length);
      const directFiles = new Set(direct.map((h) => h.file));
      const viaCallers = (await testsTouching(d, callers)).filter((h) => h.mentions.length && !directFiles.has(h.file));
      return out([
        `${nodeLabel(node)} · ${direct.length} lo nombran, ${viaCallers.length} nombran a quien lo usa, ${importOnly.length} sólo importan su archivo`,
        direct.length > 0 && "lo nombran:",
        ...direct.slice(0, 30).map(testLine),
        viaCallers.length > 0 && "nombran a quien lo usa:",
        ...viaCallers.slice(0, 30).map(testLine),
        importOnly.length > 0 && `sólo importan su archivo: ${importOnly.slice(0, 30).map((h) => h.file).join(", ")}`,
        !touching.length && !viaCallers.length && "Ningún test lo nombra ni importa su archivo.",
      ]);
    } catch (e) {
      return fail(`No pude buscar tests en ${dir}: ${(e as Error).message}`);
    }
  },
);

const UNUSED_KINDS = new Set(["unused-symbol", "unused-variable", "speculative-abstraction"]);

server.registerTool(
  "unused",
  {
    title: "Código que no se usa",
    description:
      "Símbolos y variables sin uso, y abstracciones especulativas (interfaces o clases base con una sola " +
      "implementación). Precisión medida ≈47 %: verificá con `symbol_neighbors` o un grep antes de borrar, sobre " +
      "todo si es API pública, se llama por reflexión o por nombre desde fuera del directorio analizado.",
    inputSchema: {
      dir: DIR,
      file: z.string().optional().describe("Substring de la ruta para acotar."),
      limit: z.number().int().min(1).max(200).optional().describe("Default 40."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, file, limit }) => {
    try {
      const s = await snapshotOf(dir);
      const fs = s.analysis.findings
        .filter((f) => UNUSED_KINDS.has(f.kind))
        .filter((f) => !file || (f.locations ?? []).some((l) => l.file.includes(file)))
        .sort((a, b) => (a.locations?.[0]?.file ?? "").localeCompare(b.locations?.[0]?.file ?? ""));
      const shown = fs.slice(0, limit ?? 40);
      return out([count(fs.length, shown.length, "sin uso"), ...shown.flatMap((f) => findingLines(f))]);
    } catch (e) {
      return fail(`No pude buscar código sin uso en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "risky_files",
  {
    title: "Archivos más riesgosos de tocar",
    description:
      "Los archivos que combinan muchos problemas con mucha dependencia entrante: tocarlos es caro (el código " +
      "es difícil) y arriesgado (muchos otros archivos lo usan). Riesgo = severidad sumada × (1 + archivos que " +
      "dependen de él).",
    inputSchema: {
      dir: DIR,
      limit: z.number().int().min(1).max(100).optional().describe("Default 15."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, limit }) => {
    try {
      const s = await snapshotOf(dir);
      const sev = new Map<string, { n: number; sum: number }>();
      for (const f of s.analysis.findings) {
        const file = f.locations?.[0]?.file;
        if (!file) continue;
        const e = sev.get(file) ?? { n: 0, sum: 0 };
        e.n++;
        e.sum += f.severity ?? 0;
        sev.set(file, e);
      }
      const fanIn = new Map<string, Set<string>>();
      if (s.graph) {
        const byId = new Map(s.graph.nodes.map((n) => [n.id, n]));
        for (const e of s.graph.edges) {
          if (e.kind === "contains") continue;
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b || !NAVIGABLE.has(a.kind) || !NAVIGABLE.has(b.kind) || a.file === b.file) continue;
          (fanIn.get(b.file) ?? fanIn.set(b.file, new Set()).get(b.file)!).add(a.file);
        }
      }
      const rows = [...sev.entries()]
        .map(([file, e]) => ({ file, ...e, users: fanIn.get(file)?.size ?? 0 }))
        .map((r) => ({ ...r, risk: Math.round(r.sum * (1 + r.users)) }))
        .sort((a, b) => b.risk - a.risk)
        .slice(0, limit ?? 15);
      return out([
        "riesgo · archivo · problemas (severidad) · archivos que dependen de él",
        ...rows.map((r) => `  ${r.risk} ${r.file} · ${r.n} (${Math.round(r.sum)}) · ${r.users}`),
      ]);
    } catch (e) {
      return fail(`No pude calcular el riesgo en ${dir}: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "change_summary",
  {
    title: "¿El cambio mejoró o empeoró el repo?",
    description:
      "Balance del trabajo actual contra una rama base: problemas antes y después, nuevos contra resueltos por " +
      "tipo, severidad total, y cómo cambió la peor función y la peor complejidad. Una respuesta corta para " +
      "decidir si el cambio deja el código mejor de lo que lo encontró.",
    inputSchema: {
      dir: z.string().describe("Ruta absoluta a un checkout de git."),
      base: BASE,
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, base }) => {
    try {
      const d = path.resolve(dir);
      const baseRef = base ?? (await defaultBaseRef(d));
      const { result: r } = await compareCached(d, baseRef);
      const sevOf = (fs: readonly CodeFinding[]) => Math.round(fs.reduce((a, f) => a + (f.severity ?? 0), 0));
      const worst = (fs: readonly CodeFinding[], kind: string) =>
        Math.max(0, ...fs.filter((f) => f.kind === kind).map((f) => (typeof f.metric?.value === "number" ? f.metric.value : 0)));
      const before = r.baseAnalysis.findings;
      const after = r.headAnalysis.findings;
      const byKind = new Map<string, number>();
      for (const f of r.introduced) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
      for (const f of r.resolved) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) - 1);
      const net = sevOf(r.introduced) - sevOf(r.resolved);
      const verdict = net > 0 ? "empeoró" : net < 0 ? "mejoró" : "igual";
      const delta = (a: number, b: number) => `${a} → ${b}${b !== a ? ` (${b > a ? "+" : ""}${b - a})` : ""}`;
      return out([
        `base ${baseRef} (${r.baseCommit.slice(0, 10)}) · ${r.changedFiles.length} archivos cambiados`,
        `veredicto: ${verdict} (severidad nueva ${sevOf(r.introduced)}, resuelta ${sevOf(r.resolved)})`,
        `problemas: ${delta(before.length, after.length)} · ${r.introduced.length} nuevos, ${r.resolved.length} resueltos`,
        `severidad total: ${delta(sevOf(before), sevOf(after))}`,
        `peor función (líneas): ${delta(worst(before, "long-function"), worst(after, "long-function"))}`,
        `peor complejidad: ${delta(worst(before, "complexity"), worst(after, "complexity"))}`,
        byKind.size > 0 &&
          `por tipo: ${[...byKind].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ") || "sin cambio neto"}`,
      ]);
    } catch (e) {
      return fail(`No pude hacer el balance en ${dir}: ${(e as Error).message}`);
    }
  },
);

const HIERARCHY = new Set(["extends", "implements", "mixes-in", "satisfies"]);

server.registerTool(
  "implementations",
  {
    title: "Quién implementa o extiende esto",
    description:
      "Todas las clases que extienden, implementan, incluyen (mixin) o satisfacen un tipo, transitivamente: las " +
      "subclases de las subclases también, con su distancia.",
    inputSchema: {
      dir: DIR,
      target: z.string().describe("Interfaz, clase o módulo: 'ruta#Tipo:línea' o nombre único."),
      depth: z.number().int().min(1).max(10).optional().describe("Default 6."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ dir, target, depth }) => {
    try {
      const s = await snapshotOf(dir);
      if (!s.graph) return fail("Este análisis no produjo grafo.");
      const { node, candidates } = resolveNode(s.graph, target);
      if (!node && candidates) return candidatesText(target, candidates);
      if (!node) return fail(`No encontré '${target}' en el grafo.`);
      const byId = new Map(s.graph.nodes.map((n) => [n.id, n]));
      const children = new Map<string, CodeGraphEdge[]>();
      for (const e of s.graph.edges)
        if (HIERARCHY.has(e.kind)) (children.get(e.to) ?? children.set(e.to, []).get(e.to)!).push(e);
      const found: string[] = [];
      const seen = new Set([node.id]);
      let frontier = [node.id];
      for (let level = 1; level <= (depth ?? 6) && frontier.length; level++) {
        const next: string[] = [];
        for (const id of frontier)
          for (const e of children.get(id) ?? []) {
            if (seen.has(e.from)) continue;
            seen.add(e.from);
            const c = byId.get(e.from);
            if (c) found.push(`  ${level} ${nodeLabel(c)} -${e.kind}-> ${byId.get(id)!.symbolPath.join(".")}`);
            next.push(e.from);
          }
        frontier = next;
      }
      return out([`${nodeLabel(node)} · ${found.length} implementaciones`, ...found.slice(0, 100)]);
    } catch (e) {
      return fail(`No pude buscar implementaciones en ${dir}: ${(e as Error).message}`);
    }
  },
);

await server.connect(new StdioServerTransport());
