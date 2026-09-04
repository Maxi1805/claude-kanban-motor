/**
 * `carries` — FORMA 2 de CONTRATO-F9.md §3.3: "literal function-like como
 * valor". Un nodo de `sets.functionNodes` SIN campo `name` propio (una
 * declaración con nombre es forma 1/carries-derive.ts, no esto) cuyo padre
 * sintáctico lo recibe como valor de un campo con nombre (declarador/
 * asignación), como entrada de mapa, como elemento de colección o como
 * argumento posicional.
 *
 * ESTRUCTURAL, NO VOCABULARIO — el único criterio que importa en cada punto
 * de decisión es el NOMBRE DE CAMPO DE LA GRAMÁTICA que `fieldNameForChild`
 * devuelve (`"key"`/`"value"`/`"name"`/`"left"`/`"right"`/`"arguments"`/
 * `"argument_list"`) — el mismo vocabulario, ya usado por `references.ts`
 * (`MEMBER_FIELDS`/`RECEIVER_FIELDS`) y `sentinel.ts`/`mixin.ts`
 * (`fieldNameForChild`, `hasField`), nunca el nombre que el PROGRAMADOR le
 * dio a esa variable. `SELF_KEYWORDS` es la única excepción de texto, y es
 * vocabulario del LENGUAJE (palabra reservada), no de dominio — misma
 * categoría que `CONSTRUCTOR_NAMES` en `code-grammar.ts`.
 *
 * NO ES UN `EdgeExtractor` — divergencia deliberada del comentario de
 * enganche que dejó Cimientos en `build.ts` ("portador.ts, extractor normal,
 * se suma a typedByKind"). Un `EdgeExtractor` produce `EdgeFacts` con
 * `toName` CRUDO, resuelto después contra declaraciones existentes por la
 * cascada de 9 etapas (`resolve.ts`) — ese mecanismo asume que el destino
 * YA EXISTE en algún archivo, con nombre. Un literal function-like anónimo
 * NO tiene nombre que resolver: su nodo (`sym:...<anon@n>`,
 * CONTRATO-F9.md §3.2) tiene que CREARSE, no buscarse, y la relación es
 * siempre intra-archivo (un literal nace y se usa en el mismo archivo por
 * definición). Forzarlo por `EdgeFacts`+cascada habría sido más código para
 * modelar MENOS: acá, `extractCarrierFacts` (puro, por archivo, sobre el
 * AST vivo — mismo momento que `extractSymbols`/`extractReferences`) más
 * `materializeCarrierFacts` (puro, sin AST, arma nodos+aristas locales) le
 * dan a `graph/build.ts` exactamente el mismo par nodos+aristas que
 * cualquier otro paso de `buildNodesAndContainsForFile`, sin pasar por el
 * `GraphIndex`/cascada compartidos con las OTRAS 5 aristas tipadas.
 *
 * DIVERGENCIA #2, medida en symbols.ts: `extractSymbols` (frozen, F9 no lo
 * toca) sólo registra un nodo `other` para un binding CUANDO NO está dentro
 * de un scope function-like (`!isLocal`) — una variable local que guarda un
 * callback (`const onClick = () => {...}` dentro de un método) NUNCA tiene
 * nodo `symbol` en el grafo hoy. Por eso este módulo NUNCA asume que el nodo
 * "ya existe" para el caso nombrado (`CONTRATO-F9.md §3.2` sí lo asume) —
 * SIEMPRE sintetiza su propio nodo `carrier:`, con id estable por
 * `(archivo, containerPath, nombre)` para que dos asignaciones al MISMO
 * nombre (o dos lecturas de OTRO extractor apuntando al mismo campo, ver
 * `invocacion-indirecta.ts`) converjan en el mismo portador — el fan-in que
 * Observer necesita (CONTRATO-F9.md §3.5).
 */
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { AstNode } from "../../detect/types.js";
import { carrierNodeId, symbolNodeId, type CodeGraphEdge, type CodeGraphNode } from "../types.js";

export type CarrierForm = "field" | "collection-element" | "map-value" | "argument" | "local";

export interface CarrierFact {
  /** Camino de contenedores NOMBRADOS, de afuera hacia adentro — mismo formato que `SymbolFacts.container`. */
  readonly containerPath: readonly string[];
  readonly carrierForm: CarrierForm;
  /** Nombre declarado (LHS de una asignación, o miembro de `self`/`this`) — sólo `"field"`/`"local"`. `null` en las tres formas posicionales. */
  readonly carrierName: string | null;
  /**
   * Id del literal anónimo (`sym:...<anon@n>`) — SIEMPRE único por sitio,
   * nunca compartido entre dos closures distintos. HALLAZGO MEDIDO, no
   * hipotético: la primera versión de este módulo reusaba el mismo número
   * para esto Y para agrupar el portador (`carrierOrdinal` de abajo) —
   * corrido sobre lodash real, un objeto de despacho de 6 entradas
   * (`fp/_baseConvert.js#baseConvert`, `{'castArray': fn, 'iteratee': fn,
   * ...}`) colapsó 6 closures DISTINTOS al mismo `<anon@0>`, perdiendo 5 de
   * los 6 en el `Map` de dedup por id de `buildNodesAndContainsForFile`
   * (`seenNodeIds`). Los dos números divergen a propósito: EL PORTADOR de
   * un `map-value`/`collection-element` es compartido (fan-in real, es el
   * PUNTO del contrato) pero cada CLOSURE que llega a él es un nodo propio.
   */
  readonly ordinal: number;
  /**
   * Clave de agrupación del portador para las tres formas POSICIONALES
   * (`map-value`/`collection-element`/`argument`) — dos sitios con el MISMO
   * nodo físico envolvente (mismo array/objeto/lista de argumentos)
   * comparten este número, así que convergen en el mismo `carrier:` vía
   * `portadorCarrierId`. Sin usar en `"field"`/`"local"` (esas ya son
   * estables por `carrierName`).
   */
  readonly carrierOrdinal: number;
  readonly startLine: number;
  readonly endLine: number;
}

/** `AstNode`'s inherited `child()`/`childForFieldName()` (from `ProbeNode`)
 *  return `ProbeNode`, not `AstNode` — same established idiom as
 *  `sentinel.ts`/`imports.ts`: cast to `AstNode | null` at each call site,
 *  in the leaf, not by re-typing the walk on the narrower `ProbeNode`. */
interface FieldNamedNode extends AstNode {
  fieldNameForChild(index: number): string | null;
}

function fieldNameForChild(node: AstNode, index: number): string | null {
  const f = node as FieldNamedNode;
  return typeof f.fieldNameForChild === "function" ? f.fieldNameForChild(index) : null;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];
/** Palabra reservada del LENGUAJE, no vocabulario de dominio — ver el docstring del módulo. */
const SELF_KEYWORDS = new Set(["self", "this"]);

function firstField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/** `self.foo`/`this.foo` — devuelve `"foo"`, o `null` si `node` no tiene esa forma. */
function memberOfSelf(node: AstNode): string | null {
  const receiver = firstField(node, RECEIVER_FIELDS);
  if (!receiver || !SELF_KEYWORDS.has(receiver.text)) return null;
  const member = firstField(node, MEMBER_FIELDS);
  return member ? member.text : null;
}

/**
 * CONTRATO-F9.md §3.4: "el invocable que cruza un `return`... exige análisis
 * interprocedural. Fuera." — medido, no supuesto: sin esta exclusión, un
 * closure devuelto (`return func(){...}`, forma idiomática de Go — sonda
 * directa, `cobra` real) cae al caso posicional por defecto y se etiqueta
 * `collection-element`, que es FALSO (no hay colección; el valor cruza la
 * frontera de la función). Vocabulario de GRAMÁTICA (`return_statement`/
 * `return_expression`/`return`), no de dominio — mismo principio que
 * `LOOP_WORD` en `code-grammar.ts`. Confirmado por sonda en Go (el literal
 * queda envuelto en `expression_list` — de ahí que se revisen DOS niveles,
 * no sólo el padre directo), JS y Python.
 */
const RETURN_WORD = /^return(_\w+)?$/;

function crossesReturn(parent: AstNode, grandparent: AstNode | null): boolean {
  return RETURN_WORD.test(parent.type) || (grandparent !== null && RETURN_WORD.test(grandparent.type));
}

function indexAndFieldOf(parent: AstNode, node: AstNode): { readonly index: number; readonly field: string | null } | null {
  for (let i = 0; i < parent.childCount; i++) {
    const c = parent.child(i) as AstNode | null;
    if (c && c.type === node.type && c.startPosition.row === node.startPosition.row && c.startPosition.column === node.startPosition.column) {
      return { index: i, field: fieldNameForChild(parent, i) };
    }
  }
  return null;
}

/**
 * BRECHA MEDIDA Y DECLARADA, NO ESCONDIDA (sonda directa,
 * `tree-sitter-go.wasm`): Go envuelve AMBOS lados de una asignación
 * (`local := func(){}`, `w.handler = func(){}`) en un `expression_list`
 * intermedio — el literal function-like nunca llena `right`/`value`
 * DIRECTAMENTE, un `expression_list` sí. Se evaluó "desenvolver" cualquier
 * nodo con exactamente un hijo nombrado, pero esa regla NO es segura de
 * forma genérica: un `arguments`/`argument_list` con UN solo argumento, o un
 * literal de array con UN solo elemento, tienen la MISMA forma (un hijo
 * nombrado) sin ser transparentes — desenvolverlos habría reclasificado
 * `list.push(soloUnArgumento)` o `[soloUnElemento]` como si el literal fuera
 * el valor DIRECTO de la declaración envolvente, perdiendo la forma real
 * (`argument`/`collection-element`). Ninguna señal estructural disponible
 * (sin `node-types.json` en el paquete `.wasm`, ver `code-grammar.ts`'s
 * propia nota sobre esto) distingue de forma segura "este nodo SIEMPRE
 * envuelve un solo valor" de "este nodo HOY tiene un solo elemento". Go
 * queda sin forma 2 vía asignación (`local`/`field`) — SÍ cubierto para
 * `argument` (`register(func(){})`: el `argument_list` de Go no interpone
 * ningún envoltorio, confirmado por sonda) y para `collection-element`/
 * `map-value` en cualquier lenguaje cuya gramática nombre el campo
 * directamente.
 */

interface Classification {
  readonly carrierForm: CarrierForm;
  readonly carrierName: string | null;
  /** `true` = el portador es un campo de la clase ENVOLVENTE (self/this), así que su `containerPath` es la ruta a esa clase, no la ruta al método donde se lo asigna. */
  readonly ownerIsEnclosingClass: boolean;
  /** Nodo físico que agrupa a este sitio — usado para dar el MISMO ordinal a dos elementos del mismo array/mapa/lista de argumentos (fan-in). `null` para las formas nombradas (id ya estable por nombre). */
  readonly enclosing: AstNode | null;
}

function classifyCarrierForm(node: AstNode, parent: AstNode, grandparent: AstNode | null, immediateIsFunctionLike: boolean): Classification | null {
  if (crossesReturn(parent, grandparent)) return null; // CONTRATO-F9.md §3.4 — ver el docstring de `RETURN_WORD`.
  const info = indexAndFieldOf(parent, node);
  if (!info) return null;
  const { field } = info;

  // Entrada de mapa/objeto: el padre resuelve AMBOS `key` y `value`, y `node` llena `value`.
  if (field === "value" && hasField(parent, "key")) {
    return { carrierForm: "map-value", carrierName: null, ownerIsEnclosingClass: false, enclosing: grandparent };
  }

  // Declarador/asignación con nombre: `node` llena el lado derecho, el padre resuelve un lado izquierdo DIRECTAMENTE (ver la nota de Go arriba: un lado envuelto en un nodo intermedio no matchea acá, brecha declarada).
  if (field === "value" || field === "right") {
    const lhs = firstField(parent, ["name", "left"]);
    if (lhs) {
      if (lhs.childCount === 0 && lhs.isNamed) {
        return { carrierForm: immediateIsFunctionLike ? "local" : "field", carrierName: lhs.text, ownerIsEnclosingClass: false, enclosing: null };
      }
      const memberName = memberOfSelf(lhs);
      if (memberName !== null) {
        return { carrierForm: "field", carrierName: memberName, ownerIsEnclosingClass: true, enclosing: null };
      }
    }
    return null;
  }

  // Posicional: sin nombre de campo — argumento de llamada vs. elemento de colección.
  if (field === null) {
    if (grandparent) {
      const parentInfo = indexAndFieldOf(grandparent, parent);
      if (parentInfo && (parentInfo.field === "arguments" || parentInfo.field === "argument_list")) {
        return { carrierForm: "argument", carrierName: null, ownerIsEnclosingClass: false, enclosing: parent };
      }
    }
    return { carrierForm: "collection-element", carrierName: null, ownerIsEnclosingClass: false, enclosing: parent };
  }

  return null; // otro campo con nombre no modelado (p.ej. valor por defecto de un parámetro) — brecha declarada, no escondida.
}

interface Frame {
  readonly name: string | null;
  readonly isFunctionLike: boolean;
  readonly isClassLike: boolean;
}

/**
 * Deriva los sitios portadores de UN archivo. Pura y síncrona, sobre un
 * árbol YA parseado — mismo momento y misma disciplina que
 * `extractSymbols`/`extractReferences` (F9 no re-implementa el parseo).
 */
export function extractCarrierFacts(root: AstNode, sets: DerivedNodeSets): readonly CarrierFact[] {
  const out: CarrierFact[] = [];
  const scopeStack: Frame[] = [];
  const ordinalByEnclosing = new Map<string, number>();
  let nextOrdinalCounter = 0;

  const containerPathOf = (): readonly string[] => scopeStack.filter((f) => f.name !== null).map((f) => f.name as string);
  const nearestClassPath = (): readonly string[] | null => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i]!.isClassLike) {
        return scopeStack.slice(0, i + 1).filter((f) => f.name !== null).map((f) => f.name as string);
      }
    }
    return null;
  };
  const immediateIsFunctionLike = (): boolean => {
    const top = scopeStack[scopeStack.length - 1];
    return top ? top.isFunctionLike : false;
  };

  /** Un ordinal ESTABLE por nodo envolvente físico (mismo array/mapa/lista de argumentos visto de nuevo ⇒ mismo ordinal), para que el fan-in de una colección converja en un solo portador. */
  const ordinalFor = (enclosing: AstNode | null): number => {
    if (!enclosing) return nextOrdinalCounter++;
    const key = `${enclosing.type}@${enclosing.startPosition.row}:${enclosing.startPosition.column}`;
    const existing = ordinalByEnclosing.get(key);
    if (existing !== undefined) return existing;
    const n = nextOrdinalCounter++;
    ordinalByEnclosing.set(key, n);
    return n;
  };

  const visit = (node: AstNode, parent: AstNode | null, grandparent: AstNode | null): void => {
    if (!node.isNamed) return;

    const functionLike = sets.functionNodes.has(node.type);
    const classLike = !functionLike && sets.classNodes.has(node.type);

    if (functionLike && !hasField(node, "name") && parent) {
      const cls = classifyCarrierForm(node, parent, grandparent, immediateIsFunctionLike());
      if (cls) {
        const containerPath = cls.ownerIsEnclosingClass ? nearestClassPath() : containerPathOf();
        if (containerPath !== null) {
          out.push({
            containerPath,
            carrierForm: cls.carrierForm,
            carrierName: cls.carrierName,
            ordinal: nextOrdinalCounter++, // SIEMPRE único — ver el docstring del campo.
            carrierOrdinal: ordinalFor(cls.enclosing),
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
        }
      }
    }

    let pushed = false;
    if (functionLike || classLike) {
      const nameNode = node.childForFieldName("name") as AstNode | null;
      scopeStack.push({ name: nameNode ? nameNode.text : null, isFunctionLike: functionLike, isClassLike: classLike });
      pushed = true;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child, node, parent);
    }
    if (pushed) scopeStack.pop();
  };

  visit(root, null, null);
  return out;
}

/** Id de portador ESTABLE — mismo criterio para un carrier nombrado (ordinal fijo 0) y para uno posicional (ordinal del sitio/nodo envolvente). */
export function portadorCarrierId(file: string, containerPath: readonly string[], carrierName: string | null, ordinal: number): string {
  return carrierName !== null ? carrierNodeId(file, [...containerPath, carrierName], 0) : carrierNodeId(file, containerPath, ordinal);
}

/**
 * Sin AST, sin resolución cruzada de archivos — arma nodos+aristas LOCALES
 * a partir de los `CarrierFact` de un archivo. Mismo patrón que
 * `buildNodesAndContainsForFile`: puro, determinista, sin estado entre
 * llamadas.
 */
export function materializeCarrierFacts(file: string, facts: readonly CarrierFact[]): { readonly nodes: readonly CodeGraphNode[]; readonly edges: readonly CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const seenCarrierIds = new Set<string>();

  for (const f of facts) {
    const anonSymbolPath = [...f.containerPath, `<anon@${f.ordinal}>`];
    const anonId = symbolNodeId(file, anonSymbolPath);
    nodes.push({ id: anonId, kind: "symbol", file, symbolPath: anonSymbolPath, family: "function-like", startLine: f.startLine, endLine: f.endLine });

    const carrierId = portadorCarrierId(file, f.containerPath, f.carrierName, f.carrierOrdinal);
    if (!seenCarrierIds.has(carrierId)) {
      seenCarrierIds.add(carrierId);
      nodes.push({
        id: carrierId,
        kind: "carrier",
        file,
        symbolPath: f.carrierName !== null ? [...f.containerPath, f.carrierName] : f.containerPath,
        carrierForm: f.carrierForm,
      });
    }
    edges.push({ from: carrierId, to: anonId, kind: "carries", provenance: "declared", weight: 1 });
  }

  return { nodes, edges };
}
