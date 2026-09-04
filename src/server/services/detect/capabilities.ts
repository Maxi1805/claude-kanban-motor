/**
 * Capacidades estructurales de un lenguaje — CONTRATOS.md §1.2.
 *
 * Cada capacidad es un predicado sobre la MISMA parse de `probeSource` que ya
 * hace `resolveLanguage` en `code-analyzer.ts` (cacheada ahí, no re-parseada
 * acá) más los seis conjuntos ya derivados por `deriveNodeSets`
 * (`code-grammar.ts`). Nunca se decide por `decl.id`: si mañana se agrega un
 * lenguaje diez, no hay una rama nueva que escribir acá, sólo un `probeSource`
 * que ejercite (o no) la construcción correspondiente.
 *
 * Como `deriveNodeSets`, la única superficie "por vocabulario" que este módulo
 * se permite es un puñado de regex GENÉRICAS aplicadas IDÉNTICAMENTE a todos
 * los lenguajes (mismo estilo que `LOOP_WORD`/`EXCEPTION_WORD`/`SWITCH_WORD` de
 * `code-grammar.ts`) — no listas por lenguaje, un vocabulario compartido.
 */
import type { DerivedNodeSets, ProbeNode } from "../code-grammar.js";

export type Capability =
  | "unidad-tipo-clase"
  | "herencia"
  | "interfaz"
  | "tipos-explicitos"
  | "imports"
  | "excepciones"
  | "ternario"
  | "nodo-constructor"
  | "visibilidad"
  | "genericos"
  | "modulos";

/** Vocabulario genérico compartido entre TODOS los lenguajes — nunca por lenguaje. */
const IMPORT_WORD = /(^|_)(import|require|using)(_declaration|_statement)?$/;
const MODULE_WORD = /(^|_)(module|namespace|package)(_declaration)?$/;
const INTERFACE_WORD = /(^|_)(interface|protocol|trait)(_declaration)?$/;
/** Mismo patrón que `TERNARY_NAME` de `code-grammar.ts`: duplicado a propósito
 *  para no crear una dependencia de ese módulo hacia un detalle que sólo le
 *  importa a este (ver el resultado final: reportado como decisión, no bug).
 *
 *  BUG5 (P6): el ternario de tree-sitter-ruby se llama `conditional` BARE —
 *  sin sufijo `_expression` — confirmado por probe directo sobre
 *  `RUBY_PROBE` (`x > 0 ? 1 : 2` en `code-analyzer.ts`): parsea como un único
 *  nodo `conditional`, y `conditional` NO aparece en ningún otro lugar del
 *  árbol (if/unless/case/when/while/until/for son todos tipos de nodo
 *  distintos, no comparten ese nombre). La regex original exigía el sufijo,
 *  así que este nodo nunca matcheaba y `ruby.ternario` quedaba `false` para
 *  siempre. El `(_expression)?` opcional es el arreglo completo: todo otro
 *  ternario ya trae el sufijo (`ternary_expression` en Java, C#, JS/TS;
 *  `conditional_expression` en Python), así que ensanchar el sufijo a
 *  opcional no cuesta nada ahí y arregla Ruby. Mismo arreglo que F1 ya hizo
 *  en `code-grammar.ts` (ver su comentario ahí) — ahora ambas copias
 *  coinciden. */
const TERNARY_NAME = /^(ternary|conditional)(_expression)?$/;
/** Campos GENÉRICOS (no nombres de nodo) que distintas gramáticas usan para
 *  "de qué hereda"/"qué implementa" — probado con `childForFieldName`, igual
 *  que `hasField` en `code-grammar.ts`, así que sigue siendo forma, no texto
 *  de programa. */
const INHERITANCE_FIELDS = ["superclass", "superclasses", "base_class", "bases", "extends", "heritage"];
const INTERFACE_FIELDS = ["interfaces", "implements"];
const MODIFIER_FIELDS = ["modifiers", "visibility"];
const GENERIC_FIELDS = ["type_parameters", "type_arguments"];
const TYPE_FIELDS = ["type", "return_type"];
/**
 * Vocabulario GENÉRICO para el tipo de nodo de un hijo POSICIONAL (sin campo
 * con nombre) que envuelve "de qué hereda" una unidad de tipo — confirmado
 * por probe directo sobre los wasm reales de tree-sitter-javascript/
 * -typescript: `class Shape extends Base {}` cuelga de `class_heritage`, un
 * hijo directo de `class_declaration` que NO resuelve ningún
 * `childForFieldName` (ni `"extends"`, ni `"heritage"`, ni ninguno de
 * `INHERITANCE_FIELDS`) — a diferencia de C# (`bases` → `base_list`), Java
 * (`superclass`), Ruby (`superclass`) y Python (`superclasses`), que sí son
 * campos y ya cubre `INHERITANCE_FIELDS` arriba. Mismo estilo que
 * `INTERFACE_WORD`/`MODULE_WORD`: un puñado de sinónimos aplicado
 * IDÉNTICAMENTE a los 9 lenguajes vía `hasPositionalChildOfType`, nunca el
 * nombre de nodo de UN lenguaje particular.
 */
const HERITAGE_WORD = /(^|_)(heritage|extends_clause|superclass_clause)$/;

function hasField(node: ProbeNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function hasAnyField(node: ProbeNode, fields: readonly string[]): boolean {
  return fields.some((f) => hasField(node, f));
}

/**
 * Verdadero si ALGÚN hijo DIRECTO (posicional, con o sin campo con nombre —
 * `child(i)` los devuelve a todos por igual, a diferencia de
 * `childForFieldName`, que sólo ve los que tienen campo) matchea `test` sobre
 * su tipo de nodo. Deliberadamente NO recursivo: igual que `hasAnyField` sólo
 * mira los campos propios del nodo (no desciende al cuerpo de la clase), este
 * tampoco desciende — así `class Box<T extends Base> {}` (una restricción de
 * genérico, DENTRO de `type_parameters`, no un hijo directo de
 * `class_declaration`) nunca se confunde con herencia real.
 */
function hasPositionalChildOfType(node: ProbeNode, test: (type: string) => boolean): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed && test(child.type)) return true;
  }
  return false;
}

/** Verdadero si ALGÚN nodo del árbol (no sólo la raíz) matchea `test`. */
function existsInTree(root: ProbeNode, test: (node: ProbeNode) => boolean): boolean {
  if (test(root)) return true;
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child && existsInTree(child, test)) return true;
  }
  return false;
}

/**
 * Deriva las capacidades de un lenguaje a partir de su probe ya parseado y sus
 * `DerivedNodeSets` ya calculados. Se llama UNA vez por lenguaje (junto a
 * `resolveLanguage`) y el resultado se cachea junto al `LanguageSpec`.
 */
export function deriveCapabilities(probeRoot: ProbeNode, sets: DerivedNodeSets): ReadonlySet<Capability> {
  const caps = new Set<Capability>();

  // "unidad-tipo-clase": la gramática distingue una unidad de tipo (clase,
  // struct, módulo-como-tipo) de una función — exactamente lo que
  // `deriveNodeSets` ya calculó.
  if (sets.classNodes.size > 0) caps.add("unidad-tipo-clase");

  // "herencia": alguna instancia de un nodo de tipo expone un campo genérico
  // de herencia (forma, no nombre de nodo) O UN HIJO POSICIONAL sin campo que
  // matchea el mismo concepto (`class_heritage` en JS/TS/TSX/Vue — ver
  // `HERITAGE_WORD`). Complementa, no reemplaza: C#/Java/Ruby/Python siguen
  // resolviendo por campo (`hasAnyField`), sin regresión.
  if (
    existsInTree(
      probeRoot,
      (n) => sets.classNodes.has(n.type) && (hasAnyField(n, INHERITANCE_FIELDS) || hasPositionalChildOfType(n, (t) => HERITAGE_WORD.test(t))),
    )
  ) {
    caps.add("herencia");
  }

  // "interfaz": existe un nodo de tipo `interface`-como (vocabulario genérico)
  // o un nodo de tipo con un campo genérico de "implements".
  if (
    existsInTree(probeRoot, (n) => INTERFACE_WORD.test(n.type)) ||
    existsInTree(probeRoot, (n) => sets.classNodes.has(n.type) && hasAnyField(n, INTERFACE_FIELDS))
  ) {
    caps.add("interfaz");
  }

  // "tipos-explicitos": algún nodo del árbol resuelve un campo `type`/`return_type`.
  if (existsInTree(probeRoot, (n) => hasAnyField(n, TYPE_FIELDS))) caps.add("tipos-explicitos");

  // "imports": existe un nodo cuyo tipo matchea el vocabulario genérico de import.
  if (existsInTree(probeRoot, (n) => IMPORT_WORD.test(n.type))) caps.add("imports");

  // "excepciones": delega en `sets.exceptionNodes` (F1, `code-grammar.ts`) en
  // vez de recalcular con su propio vocabulario — ver `DerivedNodeSets`, que
  // desde F1 SÍ expone esta categoría sin fusionar. Antes este módulo tenía
  // su propia copia de `EXCEPTION_WORD` (con un vocabulario ligeramente
  // distinto: incluía "try" pero no "with"/"using"), una segunda fuente de
  // verdad que podía desalinearse de `code-grammar.ts` sin que ningún test lo
  // notara — reportado en revisión adversarial (ver el resultado final).
  // Delegar elimina la duplicación: sólo hay UNA clasificación de "esto es un
  // nodo de manejo de excepciones" en todo el sistema.
  if (sets.exceptionNodes.size > 0) caps.add("excepciones");

  // "ternario": existe un nodo cuyo tipo matchea el nombre estructural del
  // ternario (mismo criterio que `code-grammar.ts`, duplicado a propósito).
  if (existsInTree(probeRoot, (n) => TERNARY_NAME.test(n.type))) caps.add("ternario");

  // "nodo-constructor": la gramática distingue, con un TIPO DE NODO propio
  // (no por nombre de método), un constructor de un método común. Se detecta
  // RELACIONALMENTE: existe un tipo función-como que SÓLO aparece como hijo
  // directo de un nodo de tipo (nunca suelto ni anidado en otra función) Y que
  // es un tipo DISTINTO de al menos otro tipo función-como que sí aparece
  // fuera de esa posición. Python/Ruby/Go no tienen un nodo de grammar propio
  // para "constructor" (su `__init__`/`initialize`/`New` es una función común
  // con un nombre convencional) — correctamente `false` acá, porque decidir
  // por ese nombre sería exactamente la lista-de-palabras-por-lenguaje que la
  // regla 4 prohíbe.
  if (hasDedicatedConstructorNode(probeRoot, sets)) caps.add("nodo-constructor");

  // "visibilidad": algún nodo expone un campo genérico de modificador/visibilidad.
  if (existsInTree(probeRoot, (n) => hasAnyField(n, MODIFIER_FIELDS))) caps.add("visibilidad");

  // "genericos": algún nodo expone parámetros o argumentos de tipo genéricos.
  if (existsInTree(probeRoot, (n) => hasAnyField(n, GENERIC_FIELDS))) caps.add("genericos");

  // "modulos": existe un nodo cuyo tipo matchea el vocabulario genérico de
  // módulo/namespace/paquete.
  if (existsInTree(probeRoot, (n) => MODULE_WORD.test(n.type))) caps.add("modulos");

  return caps;
}

/**
 * Ver el comentario de "nodo-constructor" arriba. Implementación: para cada
 * tipo función-como, se registra si ALGUNA instancia tiene como ámbito
 * envolvente MÁS CERCANO (saltando envoltorios como `class_body`/`block`, que
 * pasan el ámbito sin cambiarlo — mismo patrón que `switchWalk` de
 * `code-grammar.ts` para contenedor/rama) un nodo de tipo, y si ALGUNA
 * instancia tiene un ámbito envolvente distinto (suelto, o anidado en otra
 * función). Un tipo función-como que SÓLO se vio con ámbito "tipo",
 * habiendo al menos otro tipo función-como que se vio con otro ámbito, es un
 * nodo de constructor dedicado — la gramática lo distingue estructuralmente.
 *
 * GUARDA `bodylessInsideType` (encontrada arreglando Go's `classNodes`/
 * `functionNodes`, ver `code-grammar.ts#GO_TYPE_SPEC_WORD`/
 * `GO_METHOD_SPEC_WORD`): en cuanto `type_spec` entra a `classNodes` y
 * `method_spec` (la firma de método de una interfaz — `Area() int` dentro de
 * `interface Shaper { Area() int }`, SIN `body`, por construcción del
 * lenguaje) entra a `functionNodes`, `method_spec` pasa a ser EXACTAMENTE la
 * forma que el heurístico de arriba busca: un tipo función-como que sólo
 * aparece con ámbito "tipo" (nunca suelto), mientras `function_declaration`/
 * `method_declaration` sí aparecen sueltos — y el heurístico lo confunde con
 * un constructor dedicado. Es un FALSO POSITIVO, no un constructor: una
 * firma de interfaz no construye nada, es un requisito de forma. La
 * distinción real, confirmada por sonda directa sobre Java/C# (cuyo
 * `constructor_declaration` SIEMPRE tiene `body` — un constructor no puede
 * ser abstracto en ninguno de los dos) y sobre Go (`method_spec` NUNCA tiene
 * `body` — una firma de interfaz no puede tenerlo): un candidato "sólo visto
 * dentro de un tipo" que ADEMÁS se vio alguna vez SIN `body` es una firma,
 * no un constructor, sin importar qué tan consistentemente aparezca sólo
 * dentro de un tipo. Estructural, no por nombre de nodo — el mismo criterio
 * que el resto de este módulo y de `code-grammar.ts` ya usan.
 */
function hasDedicatedConstructorNode(probeRoot: ProbeNode, sets: DerivedNodeSets): boolean {
  const onlyInsideType = new Set<string>();
  const seenOutsideType = new Set<string>();
  const seenBodyless = new Set<string>();

  type Enclosing = "tipo" | "funcion" | "ninguno";

  const visit = (node: ProbeNode, enclosing: Enclosing): void => {
    let next = enclosing;
    if (node.isNamed) {
      if (sets.functionNodes.has(node.type)) {
        if (enclosing === "tipo") onlyInsideType.add(node.type);
        else seenOutsideType.add(node.type);
        if (!hasField(node, "body")) seenBodyless.add(node.type);
        next = "funcion";
      } else if (sets.classNodes.has(node.type)) {
        next = "tipo";
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child, next);
    }
  };
  visit(probeRoot, "ninguno");

  for (const type of onlyInsideType) {
    if (!seenOutsideType.has(type) && seenOutsideType.size > 0 && !seenBodyless.has(type)) return true;
  }
  return false;
}
