/**
 * SUSTITUTO de la cascada real — SÓLO para el arnés de la compuerta de F3.
 *
 * Re-implementa en TypeScript, decisión por decisión, la MISMA lógica que ya
 * está congelada en dos scripts de sólo lectura (no se tocan, son la fuente
 * de verdad de cómo se generó `labeled-dataset.json`):
 *
 *   - `scratchpad/revision2/probe/10-cascada.mjs` — el prototipo original
 *     (MODE=cascada), citado en PLAN.md §2.1.
 *   - `scratchpad/impl/spikes/cascada-refs/collect.mjs` — el que de verdad
 *     produjo las 829 filas candidatas de las que salieron las 200 aristas
 *     etiquetadas a mano (`labeled-dataset.json`), documentado en
 *     `spikes/cascada-refs/RESULTADO.md`.
 *
 * Es DELIBERADAMENTE angosto: sólo Ruby, sólo 3 rechazos (rol sintáctico,
 * miembro-de-clase, namespace léxico) más la aceptación por unicidad global.
 * NO implementa las cinco etapas restantes de `ResolutionStageId`
 * (CONTRATO-F3.md §3.3) — en particular NO implementa `bare-constant-receiver`,
 * el refinamiento que el contrato pide para subir el recall. Eso es trabajo
 * de quien es dueño de `graph/resolve.ts` + `graph/stages.ts`; este archivo
 * no es ese archivo.
 *
 * Por qué existe igual: la compuerta de F3 (precisión ≥ 0,90 + recall por
 * etapa publicado) tiene que poder correr y dar un número HOY, con o sin la
 * cascada real terminada, y tiene que poder verificar contra el conjunto
 * etiquetado tal como se generó — reproduciendo el MISMO algoritmo que lo
 * generó es la única forma de que el cruce `(archivo, símbolo)` tenga
 * sentido. Cuando `graph/resolve.ts` exista, `precision-recall.test.ts`
 * cambia UNA función (ver su docstring, "CABLEADO A LA CASCADA REAL") y todo
 * lo demás — la carga del dataset, el cálculo de precisión con intervalo de
 * Wilson, el recall por etapa — sigue igual, porque ambos producen
 * `readonly CascadeOutcome[]` (`cascade-outcome.ts`).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import type { CascadeOutcome } from "./cascade-outcome.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TSNode {
  readonly type: string;
  readonly text: string;
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly parent: TSNode | null;
  readonly childCount: number;
  readonly namedChildCount: number;
  readonly id: number;
  child(i: number): TSNode | null;
  namedChild(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
}

interface TSParser {
  setLanguage(language: unknown): void;
  parse(source: string): { rootNode: TSNode; delete?: () => void };
}

/**
 * Carga `web-tree-sitter` + la gramática de Ruby, self-contained. NO reusa el
 * `loadRuntime`/`resolveLanguage` de `code-analyzer.ts` (no exportados, y a
 * propósito: este archivo replica el loader ya probado de los scripts del
 * spike — `collect.mjs`/`10-cascada.mjs` — en vez de acoplarse al caché de
 * proceso del analizador de producción).
 *
 * CACHEADO A NIVEL DE MÓDULO — MUST, no es una optimización: el propio
 * comentario de `loadRuntime` en `code-analyzer.ts` documenta que
 * `web-tree-sitter` sobreescribe `require.cache` como efecto colateral de
 * `Parser.init()` (glue de Emscripten: `module["exports"] = Module`), así
 * que un SEGUNDO `require("web-tree-sitter")` en el mismo proceso devuelve
 * el runtime wasm crudo, no la clase `Parser` — `Parser.init` deja de ser
 * una función. Medido acá mismo: `runProbeCascade` corriendo dos veces en el
 * mismo proceso vitest (dos `it()` de `precision-recall.test.ts`) fallaba
 * con `TypeError: Parser.init is not a function` en la segunda llamada antes
 * de este caché.
 */
let cachedParser: Promise<TSParser> | null = null;

async function loadRubyParser(): Promise<TSParser> {
  cachedParser ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
    const lang = await Language.load(path.join(wasmDir, "out", "tree-sitter-ruby.wasm"));
    const parser: TSParser = new Parser();
    parser.setLanguage(lang);
    return parser;
  })();
  return cachedParser;
}

function walkRubyFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkRubyFiles(p, acc);
    else if (e.name.endsWith(".rb")) acc.push(p);
  }
  return acc;
}

/** Un `module`/`class` cuyo cuerpo son sólo declaraciones no es un símbolo referenciable — mata el falso hub de contenedores de namespace. */
function isDeclOnlyBody(node: TSNode): boolean {
  const body = node.childForFieldName("body");
  if (!body) return false;
  let n = 0;
  for (let i = 0; i < body.namedChildCount; i++) {
    const c = body.namedChild(i);
    if (!c) continue;
    if (c.type === "comment") continue;
    n++;
    if (!c.childForFieldName("name")) return false;
  }
  return n > 0;
}

/** Rol sintáctico: ¿este nodo hoja es una referencia a símbolo raíz, o es el `method`/`key`/parámetro de otra cosa? */
function roleOk(n: TSNode): boolean {
  const p = n.parent;
  if (!p) return true;
  const fieldIs = (name: string): boolean => {
    const c = p.childForFieldName(name);
    return !!c && c.id === n.id;
  };
  if (p.type === "call" && fieldIs("method") && p.childForFieldName("receiver")) return false;
  if (p.type === "pair" && fieldIs("key")) return false;
  if (p.type === "method_parameters" || p.type === "block_parameters" || p.type === "parameters") return false;
  if (p.type === "keyword_parameter" || p.type === "optional_parameter") return !fieldIs("name");
  return true;
}

/**
 * Vocabulario COMPARTIDO con `ResolutionStageId` (CONTRATO-F3.md §3.3), pero
 * es una copia local a propósito: `graph/stages.ts` todavía no existe (lo
 * escribe otro agente) y este archivo no depende de que exista para correr
 * hoy. `"global-uniqueness"` hace doble función acá: es tanto la
 * PRECONDICIÓN para ser candidato (sólo símbolos con un único dueño cross-file
 * entran a `rows`) como la etapa que efectivamente ACEPTA cuando las otras
 * tres no rechazaron — en la cascada real esas son dos cosas separadas.
 */
export type ProbeStageId = "syntactic-role" | "class-member" | "qualified-name" | "global-uniqueness";

export interface ProbeCandidateRow extends CascadeOutcome {
  readonly useCol: number;
  readonly useNs: string;
  readonly to: string;
  readonly declLine: number | null;
  readonly declType: string;
  readonly declNs: string;
  readonly roleOk: boolean;
  readonly memberOk: boolean;
  readonly scopeOk: boolean;
  readonly finalStage: ProbeStageId;
}

export interface ProbeCascadeSummary {
  readonly files: number;
  /** `(archivo, símbolo)` únicos con dueño global único ≠ archivo de uso — la población total. */
  readonly candidateRows: number;
  readonly edgesUnicidadGlobalSola: number;
  readonly edgesRole: number;
  readonly edgesRoleMember: number;
  readonly edgesCascadaFinal: number;
  readonly rowsAccepted: number;
  readonly rowsRejectedRole: number;
  readonly rowsRejectedMember: number;
  readonly rowsRejectedScope: number;
}

export interface ProbeCascadeResult {
  readonly rows: readonly ProbeCandidateRow[];
  readonly summary: ProbeCascadeSummary;
}

/**
 * Corre la cascada de 4 salidas sobre TODOS los `.rb` bajo `rootDir`, en
 * memoria, un sólo walk por archivo (sin segunda pasada). Mismo algoritmo que
 * `collect.mjs`: unicidad global de dueño (name -> Set(file), dueño único y
 * no-namespace-container) es la PRECONDICIÓN para que un `(archivo, símbolo)`
 * exista como fila; después, cada fila pasa por rol → miembro → namespace
 * léxico y termina en exactamente una etapa terminal.
 */
export async function runProbeCascade(rootDir: string): Promise<ProbeCascadeResult> {
  const parser = await loadRubyParser();
  const files = walkRubyFiles(rootDir);

  const decls = new Map<string, Set<string>>();
  const declDepth = new Map<string, number>();
  const declNs = new Map<string, string>();
  const declType = new Map<string, string>();
  const declPos = new Map<string, { file: string; row: number }>();
  const leaves = new Map<string, Map<string, { ns: string; row: number; col: number; roleOk: boolean }>>();
  const nsContainer = new Set<string>();

  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const tree = parser.parse(src);
    const rel = path.relative(rootDir, f);
    const seen = new Map<string, { ns: string; row: number; col: number; roleOk: boolean }>();
    const stack: { n: TSNode; ns: string[] }[] = [{ n: tree.rootNode, ns: [] }];
    while (stack.length) {
      const { n, ns } = stack.pop()!;
      let childNs = ns;
      const nameNode = n.childForFieldName("name");
      if (nameNode && (n.type === "class" || n.type === "module" || n.type === "method")) {
        const nm = nameNode.text.split("::").pop()!;
        if (!decls.has(nm)) decls.set(nm, new Set());
        decls.get(nm)!.add(rel);
        if (!declDepth.has(nm) || ns.length < declDepth.get(nm)!) {
          declDepth.set(nm, ns.length);
          declNs.set(nm, ns.join("::"));
          declType.set(nm, n.type);
          declPos.set(nm, { file: rel, row: n.startPosition.row + 1 });
        }
        if ((n.type === "module" || n.type === "class") && isDeclOnlyBody(n)) nsContainer.add(nm);
        if (n.type === "class" || n.type === "module") childNs = [...ns, nm];
      }
      if (n.type === "constant" || n.type === "identifier") {
        const ok = roleOk(n);
        let effNs = ns.join("::");
        const p = n.parent;
        if (p && p.type === "scope_resolution" && p.childForFieldName("name")?.id === n.id) {
          const scope = p.childForFieldName("scope");
          if (scope) effNs = scope.text.replace(/^::/, "");
        }
        // Primera ocurrencia por (archivo, símbolo) — igual que collect.mjs.
        if (!seen.has(n.text)) {
          seen.set(n.text, { ns: effNs, row: n.startPosition.row + 1, col: n.startPosition.column, roleOk: ok });
        }
      }
      for (let i = 0; i < n.childCount; i++) {
        const c = n.child(i);
        if (c) stack.push({ n: c, ns: childNs });
      }
    }
    leaves.set(rel, seen);
    tree.delete?.();
  }

  const owner = new Map<string, string>();
  for (const [nm, set] of decls) {
    if (set.size === 1 && !nsContainer.has(nm)) owner.set(nm, [...set][0]!);
  }

  const rows: ProbeCandidateRow[] = [];
  for (const [from, syms] of leaves) {
    for (const [symbol, use] of syms) {
      const to = owner.get(symbol);
      if (!to || to === from) continue;
      const memberOk = declType.get(symbol) !== "method";
      const dns = declNs.get(symbol) ?? "";
      const scopeOk =
        !dns ||
        use.ns === dns ||
        use.ns.endsWith("::" + dns) ||
        dns.endsWith("::" + use.ns) ||
        use.ns.startsWith(dns + "::");

      let finalStage: ProbeStageId;
      let accepted: boolean;
      if (!use.roleOk) {
        finalStage = "syntactic-role";
        accepted = false;
      } else if (!memberOk) {
        finalStage = "class-member";
        accepted = false;
      } else if (!scopeOk) {
        finalStage = "qualified-name";
        accepted = false;
      } else {
        finalStage = "global-uniqueness";
        accepted = true;
      }

      const dp = declPos.get(symbol);
      rows.push({
        symbol,
        from,
        useLine: use.row,
        useCol: use.col,
        useNs: use.ns,
        to,
        declLine: dp?.row ?? null,
        declType: declType.get(symbol) ?? "",
        declNs: dns,
        roleOk: use.roleOk,
        memberOk,
        scopeOk,
        accepted,
        finalStage,
      });
    }
  }

  function edgeCount(pred: (r: ProbeCandidateRow) => boolean): number {
    const set = new Set<string>();
    for (const r of rows) if (pred(r)) set.add(r.from + "->" + r.to);
    return set.size;
  }

  const summary: ProbeCascadeSummary = {
    files: files.length,
    candidateRows: rows.length,
    edgesUnicidadGlobalSola: edgeCount(() => true),
    edgesRole: edgeCount((r) => r.roleOk),
    edgesRoleMember: edgeCount((r) => r.roleOk && r.memberOk),
    edgesCascadaFinal: edgeCount((r) => r.accepted),
    rowsAccepted: rows.filter((r) => r.accepted).length,
    rowsRejectedRole: rows.filter((r) => r.finalStage === "syntactic-role").length,
    rowsRejectedMember: rows.filter((r) => r.finalStage === "class-member").length,
    rowsRejectedScope: rows.filter((r) => r.finalStage === "qualified-name").length,
  };

  return { rows, summary };
}
