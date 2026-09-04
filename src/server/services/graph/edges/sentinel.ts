/**
 * LA SONDA CENTINELA — CONTRATO-F4.md §2.3. Mecanismo genérico y OBLIGATORIO
 * para derivar qué campo de un nodo lleva una relación tipada del grafo, sin
 * listar nombres de campo por lenguaje (`"extends"|"superclass"|"base_list"`
 * está prohibido en cualquier extractor).
 *
 * *** NOTA DE PROCESO *** (ver el mismo aviso en `types.ts`): este archivo es
 * infraestructura mínima creada porque la tarea del "agente-sonda" (S0) no
 * llegó a correr antes que los seis extractores. Implementa la firma exacta
 * de CONTRATO-F4.md §2.3, verificada contra el spike real de la ola anterior
 * (`impl/spikes/discover-carrier/`, 9/9 lenguajes) y contra los dumps propios
 * de este agente sobre las 9 gramáticas (`mixin-probe/`, scratchpad).
 *
 * `discoverCarrier` generaliza `isClassLike` de `code-grammar.ts` quitándole
 * el requisito `body` (igual que el slot `named-type` del spike): localiza
 * el nodo declarante de `from` por FORMA (`hasField('name') && !isFunctionLike`,
 * NUNCA por `node.type` de una gramática concreta), hace DFS adentro
 * buscando la hoja de texto EXACTO `to`, y arma el camino de campos con
 * `fieldNameForChild` — sin nombre de campo, el paso queda `positional: true`
 * con su índice.
 *
 * RESERVA MEDIDA (no negociable, del spike): la prueba relajada
 * `hasField('name') && !isFunctionLike` aplicada como WALK CIEGO sobre TODO
 * el árbol clasifica `variable_declarator`/`var_spec` como tipo nominal en 6
 * de 9 gramáticas — el propio `JS_FAMILY_PROBE` que el producto usa hoy tiene
 * tres `const` reales. Por eso acá SIEMPRE se ancla a un nombre centinela
 * conocido (`from`) antes de buscar `to`; nunca se ofrece una función que
 * clasifique "todo nodo con campo name" sin ese ancla.
 */
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { Capability } from "../../detect/capabilities.js";
import type { AstNode } from "../../detect/types.js";
import type { EdgeExtractor } from "./types.js";

export interface CarrierStep {
  readonly field: string | null;
  readonly index?: number;
  readonly nodeType: string;
}

export interface CarrierPath {
  readonly ownerType: string;
  readonly steps: readonly CarrierStep[];
  readonly positional: boolean;
}

export type SlotStatus = "derived" | "positional" | "ambiguous" | "absent-in-language" | "not-recovered";

/** Superficie extra que un `AstNode` real (tree-sitter) expone y que la interfaz
 *  angosta del proyecto no declara — mismo patrón de cast puntual, en la hoja,
 *  que el resto del código ya usa (ver `detect/types.ts#AstNode`'s propio
 *  docstring de módulo, "el cast se hace UNA vez, en la hoja"). */
interface FieldNamedNode extends AstNode {
  fieldNameForChild(index: number): string | null;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isFunctionLike(node: AstNode): boolean {
  return hasField(node, "body") && (hasField(node, "parameters") || hasField(node, "parameter_list"));
}

/** Generalización ANCLADA (nunca walk ciego) de `isClassLike` — ver la RESERVA MEDIDA arriba. */
function isNamedDeclLike(node: AstNode): boolean {
  return hasField(node, "name") && !isFunctionLike(node);
}

function findDeclaring(root: AstNode, name: string): AstNode | null {
  if (root.isNamed && isNamedDeclLike(root)) {
    const nameNode = root.childForFieldName("name") as AstNode | null;
    if (nameNode?.text === name) return root;
  }
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i) as AstNode | null;
    if (!child) continue;
    const found = findDeclaring(child, name);
    if (found) return found;
  }
  return null;
}

function searchLeaf(node: AstNode, text: string): CarrierStep[] | null {
  const fieldAware = node as FieldNamedNode;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child) continue;
    const field = typeof fieldAware.fieldNameForChild === "function" ? fieldAware.fieldNameForChild(i) : null;
    const step: CarrierStep = field ? { field, nodeType: child.type } : { field: null, index: i, nodeType: child.type };
    if (child.childCount === 0 && child.isNamed && child.text === text) return [step];
    const deeper = searchLeaf(child, text);
    if (deeper) return [step, ...deeper];
  }
  return null;
}

/**
 * Ver el docstring del módulo. `root` es un árbol YA PARSEADO (sonda o real,
 * ambos son `AstNode`): esta función no parsea nada por su cuenta.
 */
export function discoverCarrier(root: AstNode, from: string, to: string): CarrierPath | null {
  const declaring = findDeclaring(root, from);
  if (!declaring) return null;
  const steps = searchLeaf(declaring, to);
  if (!steps || steps.length === 0) return null;
  return { ownerType: declaring.type, steps, positional: steps.some((s) => s.field === null) };
}

export function probeSlot(
  root: AstNode,
  _sets: DerivedNodeSets,
  expect: { from: string; to: string },
): { status: SlotStatus; carriers: readonly CarrierPath[]; evidence: string } {
  const path = discoverCarrier(root, expect.from, expect.to);
  if (!path) {
    return {
      status: "not-recovered",
      carriers: [],
      evidence: `no se encontró un camino estructural de "${expect.from}" a "${expect.to}"`,
    };
  }
  return {
    status: path.positional ? "positional" : "derived",
    carriers: [path],
    evidence: `${path.ownerType} -> ${path.steps.map((s) => s.field ?? `[${s.index}]`).join(".")} (${path.steps.at(-1)?.nodeType})`,
  };
}

/**
 * Registro de sondas YA parseadas, una por (lenguaje, extractor), llenado por
 * quien orqueste el arranque de un lenguaje (mismo momento que
 * `ResolvedLanguage.capabilities`, CONTRATO-F4.md §1.5) — ESTA tarea no
 * posee esa orquestación (es de W1 / del integrador de `build.ts`), así que
 * `edgeProfile` sólo puede reportar sobre lo que ya se registró acá. Si
 * nadie registró nada para un (lenguaje, extractor) todavía, se reporta
 * `not-recovered` con la razón, nunca se inventa un status.
 */
const registeredProbes = new Map<string, AstNode>();

function probeKey(language: string, extractorId: string): string {
  return `${language}::${extractorId}`;
}

/** Llamado por el arranque de lenguaje (fuera de esta tarea) una vez por proceso. */
export function registerSentinelProbe(language: string, extractorId: string, parsedSentinelRoot: AstNode): void {
  registeredProbes.set(probeKey(language, extractorId), parsedSentinelRoot);
}

export function edgeProfile(
  language: string,
  extractor: EdgeExtractor,
): { readonly status: SlotStatus; readonly carriers: readonly CarrierPath[]; readonly missing: readonly Capability[] } {
  if (!(language in extractor.sentinel)) {
    return { status: "absent-in-language", carriers: [], missing: [] };
  }
  const root = registeredProbes.get(probeKey(language, extractor.id));
  if (!root) {
    return { status: "not-recovered", carriers: [], missing: [] };
  }
  // sets no se necesita para discoverCarrier (ancla por texto, no por conjunto derivado);
  // se acepta `null` porque `probeSlot` no lo usa hoy — está en la firma por si una
  // etapa futura quiere cruzar el resultado contra `classNodes`/`functionNodes`.
  const { status, carriers } = probeSlot(root, { classNodes: new Set(), functionNodes: new Set() } as DerivedNodeSets, extractor.expect);
  return { status, carriers, missing: [] };
}
