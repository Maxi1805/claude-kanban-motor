/**
 * EL ARNÉS DE TEST COMPARTIDO de los detectores. Módulo CERRADO: se usa, no se
 * edita (igual que `thresholds.ts`, `ids.ts`, `run.ts`).
 *
 * Existe por una razón medida, no por gusto: los tres detectores de la Ola 1
 * (`empty-catch`, `large-class`, `repeated-switch`) traían cada uno ~55 líneas
 * IDÉNTICAS de arranque de `web-tree-sitter` (cargar el runtime, resolver el
 * `.wasm`, cachear el parser, parsear la sonda, derivar los `DerivedNodeSets`)
 * más su propia variante de "armar un `FunctionUnit`/`FileUnit` a mano". Con
 * doce detectores nuevos en paralelo eso son doce dialectos del mismo arranque,
 * y cada dialecto es una oportunidad de que dos detectores midan cosas
 * sutilmente distintas y nadie lo note.
 *
 * Nada acá está simulado: se parsea con el `web-tree-sitter` real y las mismas
 * gramáticas `.wasm` que usa producción, y los `DerivedNodeSets` salen del
 * `deriveNodeSets` real de `code-grammar.ts`. Lo único que el arnés inventa
 * son las `FunctionMetrics` (`ZERO_METRICS`), porque las calcula el walker de
 * `code-analyzer.ts`, no el extractor de árboles — salvo `className`, que sí
 * se deriva de verdad recorriendo la pila de unidades tipo-clase, porque hay
 * detectores (`large-class`) que dependen de ese campo.
 *
 * NO es un sustituto de `run.ts`: acá se invoca `detector.run` directamente,
 * sin el gate de `needs` ni el presupuesto de `maxFindings`. Eso es lo
 * deseable para un test de detector — permite comprobar la regla G3 (forzar la
 * corrida sobre un lenguaje que NO tiene la capacidad y verificar que
 * igualmente no detecta nada, o sea que el `needs` describe una ausencia real
 * del lenguaje y no un defecto del extractor).
 */
import { createRequire } from "node:module";
import path from "node:path";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../code-grammar.js";
import type { Capability } from "./capabilities.js";
import { resolveThreshold, type ThresholdSpec } from "./thresholds.js";
import type {
  AstNode,
  FileUnit,
  FunctionMetrics,
  FunctionUnit,
  IntraFileDetector,
  IntraFunctionDetector,
  RawFinding,
  RunContext,
} from "./types.js";

const require = createRequire(import.meta.url);

/* ────────────────────────────────────────────────────────────────────────
 * Arranque de web-tree-sitter (cacheado por proceso)
 * ──────────────────────────────────────────────────────────────────────── */
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

/** Ruta al `.wasm` de una gramática dentro de `tree-sitter-wasms`. */
function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}

const parsers = new Map<string, any>();

async function parserFor(wasmFile: string): Promise<any> {
  const cached = parsers.get(wasmFile);
  if (cached) return cached;
  const { Parser, Language } = await loadRuntime();
  const language = await Language.load(wasmPath(wasmFile));
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(wasmFile, parser);
  return parser;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Parsea `source` con la gramática `wasmFile` (p.ej. `"tree-sitter-ruby.wasm"`)
 * y devuelve la raíz. Es un árbol REAL, así que el nodo trae posición y texto:
 * de ahí que el tipo sea `AstNode` y no `ProbeNode`.
 */
export async function parseRoot(wasmFile: string, source: string): Promise<AstNode> {
  const parser = await parserFor(wasmFile);
  return parser.parse(source).rootNode as AstNode;
}

/**
 * Los `DerivedNodeSets` de un lenguaje, derivados de su SONDA con el
 * `deriveNodeSets` real. La sonda es un programa chiquito que ejercita las
 * construcciones que importan (una clase, una función, un `try`/`rescue`, un
 * `switch`); `extraClone` y `functionExclusions` son la única superficie de
 * override por lenguaje que `code-grammar.ts` expone.
 */
export async function nodeSetsFor(
  wasmFile: string,
  probeSource: string,
  extraClone?: readonly string[],
  functionExclusions?: readonly string[],
): Promise<DerivedNodeSets> {
  const probeRoot = await parseRoot(wasmFile, probeSource);
  return deriveNodeSets(probeRoot as ProbeNode, extraClone as string[] | undefined, functionExclusions as string[] | undefined);
}

/**
 * Métricas neutras. Las calcula el walker de `code-analyzer.ts`, no el
 * extractor de árboles: un test de detector que dependa de una métrica la
 * setea explícitamente (`overrides` de `fileUnitFrom`) en vez de esperar que
 * el arnés la adivine — así queda escrito en el test QUÉ métrica se está
 * asumiendo.
 */
export const ZERO_METRICS: FunctionMetrics = {
  branches: 0,
  chain: 0,
  cognitive: 0,
  maxNesting: 0,
  parameters: 0,
  chainHasNullCheck: false,
  chainInstantiates: false,
  className: null,
  isConstructor: false,
  isFactoryLike: false,
};

export interface FileUnitOptions {
  /** Ruta a estampar en las locations. Default: `fixture.<language>`. */
  file?: string;
  /**
   * Métricas a mezclar sobre `ZERO_METRICS` en CADA función. `className` se
   * deriva siempre de verdad y no se puede pisar desde acá: es estructura, no
   * una métrica inventada.
   */
  metrics?: Partial<Omit<FunctionMetrics, "className">>;
  /**
   * `true` ⇒ `metrics.parameters` se DERIVA del árbol en vez de quedar en 0,
   * con la misma lectura por CAMPO que `code-analyzer.ts#countParameters` hace
   * en producción (`parameters`/`parameter_list`, contando sólo los hijos cuyo
   * tipo matchea el vocabulario genérico `identifier|parameter|pattern`).
   *
   * POR QUÉ ES OPT-IN Y NO EL DEFAULT — OLA AX (AX3). La aridad es ESTRUCTURA,
   * igual que `className`, así que por principio debería derivarse siempre. No
   * se cambia el default porque `primitivas/n10-no-es-producto.ts:176` exige
   * `parameters === 0` y hoy hay tests que dependen del 0 implícito del arnés:
   * volverlo default movería detectores ajenos a este frente en una ola que
   * prohíbe tocarlos. Opt-in es aditivo — ningún test existente cambia de
   * comportamiento — y deja el default listo para que un frente dueño de esos
   * detectores lo invierta con su medición en la mano.
   *
   * EL DEFECTO QUE ESTA OPCIÓN DESTAPA, y por eso se escribe acá: un arnés que
   * estampa `parameters: 0` en TODAS las funciones vuelve indistinguibles a
   * `speak()` y `speak(String)`. Un detector que empareje sobrecargas por
   * aridad pasa sus tests aunque la comparación no funcione — el arnés lo
   * enmascara. Es la misma clase de agujero que `no-permissive-required`
   * ataja del otro lado.
   */
  deriveParameters?: boolean;
}

/**
 * Cantidad de parámetros de una función, leída por CAMPO. Copia deliberada de
 * `code-analyzer.ts#countParameters` (que no es exportable desde acá sin
 * arrastrar la capa de análisis legado al arnés de `detect/`), mismo criterio
 * que `refused-bequest.ts` documenta para `extractSuperclassName`.
 */
function countParametersFor(node: AstNode): number {
  const params =
    (node.childForFieldName("parameters") as AstNode | null) ??
    (node.childForFieldName("parameter_list") as AstNode | null);
  if (!params) return 0;
  let count = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    if (child && /identifier|parameter|pattern/.test(child.type)) count++;
  }
  return count;
}

/**
 * Arma un `FileUnit` completo (con sus `functions[]`) recorriendo el árbol UNA
 * vez. `metrics.className` se sigue con una pila de unidades tipo-clase, así
 * que un método anidado en una clase reporta su clase real y una función
 * suelta reporta `null` — nunca un centinela tipo `"(sin clase)"`.
 */
export function fileUnitFrom(
  root: AstNode,
  sets: DerivedNodeSets,
  language: string,
  options: FileUnitOptions = {},
): FileUnit {
  const filePath = options.file ?? `fixture.${language}`;
  const functions: FunctionUnit[] = [];
  const classStack: (string | null)[] = [];

  const visit = (node: AstNode): void => {
    let pushedClass = false;
    if (node.isNamed && sets.classNodes.has(node.type)) {
      classStack.push((node.childForFieldName("name") as AstNode | null)?.text ?? null);
      pushedClass = true;
    }
    if (node.isNamed && sets.functionNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? null;
      const enclosingClass = classStack[classStack.length - 1] ?? null;
      const symbolPath = [...classStack.filter((c): c is string => c !== null), ...(name ? [name] : [])];
      functions.push({
        file: filePath,
        language,
        name,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        symbolPath,
        node,
        sets,
        metrics: {
          ...ZERO_METRICS,
          ...(options.deriveParameters ? { parameters: countParametersFor(node) } : {}),
          ...options.metrics,
          className: enclosingClass,
        },
      });
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
    if (pushedClass) classStack.pop();
  };
  visit(root);

  return {
    path: filePath,
    language,
    lines: root.endPosition.row + 1,
    root,
    sets,
    functions,
  };
}

/**
 * El `RunContext` que un test le pasa al detector. Resuelve los umbrales con
 * el `resolveThreshold` REAL (sin benchmarks, igual que producción hoy), así
 * que un test nunca inventa el valor de un umbral: mide contra el mismo número
 * que verá el usuario.
 */
export function testContext<K extends string>(
  detector: { thresholds: Readonly<Record<K, ThresholdSpec>> },
  language: string,
  capabilities: readonly Capability[] = [],
): RunContext<K> {
  return {
    language,
    capabilities: new Set(capabilities),
    threshold: (name: K) =>
      resolveThreshold(detector.thresholds[name], {
        language,
        sampleSize: () => 0,
        corpusP95: () => null,
      }),
  };
}

export interface RunFixtureOptions extends FileUnitOptions {
  /** Gramática, p.ej. `"tree-sitter-ruby.wasm"`. */
  wasm: string;
  /** Sonda del lenguaje: de acá salen los `DerivedNodeSets`. */
  probe: string;
  /** El código a analizar. */
  source: string;
  /** Nombre del lenguaje tal como lo usa el analizador ("ruby", "javascript", …). */
  language: string;
  capabilities?: readonly Capability[];
  extraClone?: readonly string[];
  functionExclusions?: readonly string[];
}

/**
 * Corre un detector `intra-file` sobre una fixture y devuelve sus hallazgos
 * crudos.
 */
export async function runIntraFile<K extends string, Kind extends string>(
  detector: IntraFileDetector<K, Kind>,
  options: RunFixtureOptions,
): Promise<readonly RawFinding[]> {
  const sets = await nodeSetsFor(options.wasm, options.probe, options.extraClone, options.functionExclusions);
  const root = await parseRoot(options.wasm, options.source);
  const file = fileUnitFrom(root, sets, options.language, options);
  return detector.run(file, testContext(detector, options.language, options.capabilities));
}

/**
 * Corre un detector `intra-function` sobre TODAS las funciones de la fixture y
 * concatena los hallazgos — exactamente lo que hace `run.ts` en producción
 * (una llamada por función), no "la primera función del archivo". Una fixture
 * con dos funciones que disparan devuelve dos hallazgos.
 */
export async function runIntraFunction<K extends string, Kind extends string>(
  detector: IntraFunctionDetector<K, Kind>,
  options: RunFixtureOptions,
): Promise<readonly RawFinding[]> {
  const sets = await nodeSetsFor(options.wasm, options.probe, options.extraClone, options.functionExclusions);
  const root = await parseRoot(options.wasm, options.source);
  const file = fileUnitFrom(root, sets, options.language, options);
  const ctx = testContext(detector, options.language, options.capabilities);
  const findings: RawFinding[] = [];
  for (const fn of file.functions) findings.push(...detector.run(fn, ctx));
  return findings;
}
