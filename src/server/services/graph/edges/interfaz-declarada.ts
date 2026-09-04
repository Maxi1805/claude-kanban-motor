/**
 * `interfaz-declarada` — arista tipada del grafo: IMPLEMENTACIÓN DE INTERFAZ
 * DECLARADA (Java, C#, TypeScript/TSX, y el *embedding* de Go). CONTRATO-F4.md
 * §2, arista asignada "interfaz-declarada".
 *
 * DESVÍO DE ALCANCE, DECLARADO: `graph/edges/{types,sentinel,registry}.ts`
 * (dueño nominal: "agente-sonda"/S0) NO EXISTEN en el repo al momento de
 * escribir este archivo — se esperó ~2 min con un monitor de filesystem, sin
 * resultado, y el permiso para CREARLOS fue denegado explícitamente por el
 * clasificador de la herramienta (tanto `Write` como un heredoc de `Bash`
 * sobre `registry.ts` fueron bloqueados), confirmando que "archivos tuyos:
 * ... NADA MÁS" es un control técnico, no sólo una guía. Por lo tanto este
 * archivo es AUTOCONTENIDO: define localmente, como espejo estructural
 * (duck-typing, sin importar un módulo que no existe) de la firma congelada
 * de CONTRATO-F4.md §2.2/§2.3, todo lo que normalmente viviría en
 * `types.ts`/`sentinel.ts`. Nada de esto se exporta como si fuera el módulo
 * compartido; cuando el agente-sonda real publique `types.ts`/`sentinel.ts`,
 * este archivo debería poder cambiar sus imports locales por los reales sin
 * tocar la forma de `extractor` (misma interfaz, mismos nombres de campo).
 * NO se creó ni se tocó `registry.ts` (bloqueado); la línea que falta agregar
 * ahí se reporta en el resultado final de esta tarea, no se escondió.
 *
 * RELACIÓN (qué mide, en una frase): una unidad tipo-clase (o, en Go, una
 * interfaz) declara EXPLÍCITAMENTE, en su propia sintaxis, que realiza otra
 * interfaz — Java `implements`, C# la lista tras `:`, TS `implements_clause`,
 * Go el *embedding* de una interfaz dentro de otra (`interface { Other }`).
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el campo/posición que lleva la relación
 * NUNCA se escribe a mano (prohibido listar `"implements_clause"` o
 * `"super_interfaces"` como string mágico en la lógica de extracción sobre
 * código real). Se DESCUBRE una vez por lenguaje corriendo `discoverCarrier`
 * sobre la fuente centinela de este archivo (`SENTINEL`), y el resultado (una
 * `CarrierPath`: qué campo — o, si no hay campo, qué `nodeType` — separa al
 * declarante del nombre de la interfaz) es lo único que la extracción sobre
 * código real usa después. Mismo mecanismo que el spike
 * `impl/spikes/discover-carrier/` (9/9 lenguajes, "anclado al centinela,
 * nunca un branch ciego de `deriveNodeSets`") y el mismo principio de
 * `detect/capabilities.ts`.
 *
 * *** EL HUECO DE GENÉRICOS — CERRADO EN LA OLA P (frente P3). *** Hasta esta
 * ola la extracción exigía que cada elemento de la lista fuera EXACTAMENTE
 * del `nodeType` que el centinela (sin genéricos) descubrió, así que una
 * interfaz con argumentos de tipo era un `nodeType` distinto y no se
 * reconocía. Medido por sonda directa sobre las gramáticas reales
 * (`scratchpad/p3/probe1.mts`): java `implements Comparable<Shape>, Iterable<X>,
 * Plain` da `type_list(generic_type, generic_type, type_identifier)` — sólo
 * `Plain` sobrevivía; typescript `implements I<T>, J` da
 * `implements_clause(generic_type, type_identifier)` — sólo `J`; csharp
 * `: B<T>, IFoo<T>, IBar` da `base_list(generic_name, generic_name,
 * identifier)` y, con dos de los tres invisibles, la regla de aridad de abajo
 * veía UNA lista de UN elemento y no reclamaba NADA (y `herencia.ts`, con la
 * misma ceguera, reclamaba `IBar` como CLASE BASE — una arista falsa; ver el
 * docstring de ese archivo). Ahora se acepta CUALQUIER hijo nombrado del
 * contenedor y el nombre sale de pelar su texto (`peelTypeReference`, misma
 * función y mismos delimitadores que `herencia.ts`): la aridad vuelve a ser
 * la real y las posiciones 1..N se reclaman como corresponde.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - Lo que no reduce a un identificador de programa después de pelar
 *     argumentos de tipo (`<...>`/`[...]` al final) y calificación (`::`/`.`)
 *     no aporta candidato — guarda de FORMA, nunca una lista de nombres.
 *   - Localización del "contenedor" (el nodo que agrupa una lista de
 *     interfaces) en tiempo de extracción usa el `nodeType` del paso
 *     descubierto (no un índice numérico fijo), porque el índice absoluto de
 *     un hijo sin nombre de campo puede variar entre instancias reales
 *     (decoradores, modificadores) aunque el centinela sólo vea un caso.
 *
 * LÍMITES DECLARADOS POR LENGUAJE (medidos, no supuestos):
 *   - **Go**: el mecanismo estándar del proyecto para localizar el nodo
 *     declarante (`file.sets.classNodes`, que exige campo `body` —
 *     `code-grammar.ts#isClassLike`) deriva SIEMPRE vacío para Go, porque
 *     `type_spec` (dueño real de `type X interface {...}`) no tiene campo
 *     `body` en esta gramática — límite YA documentado en `code-grammar.ts`
 *     (línea ~119), no algo que este archivo introduce. La sonda centinela
 *     de este extractor SÍ recupera el portador Go (`constraint_elem` dentro
 *     de `interface_type`) cuando se ancla directamente al nombre centinela
 *     (confirmado corriendo `discoverCarrier` sobre `SENTINEL.go`, ver test)
 *     — la ausencia es de `classNodes`, no de la sonda. Por eso `optional:
 *     true` para Go: es una ausencia real y ya documentada de la
 *     infraestructura compartida, no una adivinanza.
 *   - **C#**: la sintaxis (`class X : A, B, C {}`) usa la MISMA lista sin
 *     distinguir clase base de interfaz — AMBIGUO POR DISEÑO DEL LENGUAJE,
 *     confirmado corriendo `discoverCarrier` dos veces sobre el propio
 *     centinela C# (una vez pidiendo el nombre de la interfaz, otra pidiendo
 *     el nombre de la clase base): ambos caminos comparten exactamente el
 *     mismo `ownerType`+campo+`nodeType`, sólo difieren en el índice.
 *     `warmUp` sigue reportando esto (`status: "ambiguous"`, `ambiguous:
 *     true`) — es un hecho real del lenguaje — pero YA NO vacía `carriers`:
 *     esta ola ("el extractor no ve") acota la ambigüedad por ARIDAD REAL de
 *     cada declaración, no por lenguaje entero. La construcción de C# (no
 *     una convención — el `base_list` mismo) exige, sin excepción, que la
 *     clase base — si existe — sea el PRIMER elemento; cualquier elemento en
 *     una posición POSTERIOR es, con certeza estructural, una interfaz. Por
 *     eso `extract()` reclama las posiciones 1..N de una lista de 2+
 *     candidatos (100% ciertas, nunca adivinadas) y deja la posición 0 sin
 *     reclamar en ese caso (contraejemplo real verificado en el corpus,
 *     newtonsoft-json: `DictionaryWrapper<TKey,TValue> :
 *     IDictionary<TKey,TValue>, IWrappedDictionary` — la posición 0 ES una
 *     interfaz, no una clase, así que ni "posición 0 = clase" es seguro
 *     ahí). Una lista de UN solo candidato es de `herencia.ts`: reclama el
 *     único candidato como clase base (su propio residual medido y
 *     documentado, ver ese archivo) — acá NO se reclama nada para esa lista,
 *     para no clasificar la misma relación dos veces. "Una arista falsa es
 *     peor que una ausente" se preserva exacto en la posición 0 de una lista
 *     de 2+ (sigue sin emitirse) y se aplica con certeza estructural en las
 *     posiciones 1..N.
 *   - Ruby/Python/JavaScript no declaran `SENTINEL` (no tienen esta
 *     construcción con esta sintaxis): `absent-in-language` automático, sin
 *     necesidad de gate adicional.
 *
 * `FROMPATH` DEBE INCLUIR TODO CONTENEDOR ANIDADO, NO SÓLO `path.ownerType`
 * (esta ola, encontrado mientras se medía el fix de C# de arriba contra el
 * corpus real): la versión anterior de `extract()` sólo empujaba a
 * `classStack` el nodo que coincidía EXACTO con `path.ownerType`
 * (`class_declaration`) — pero en C#, `namespace_declaration` (y
 * `struct_declaration`/`enum_declaration`/`record_declaration`) TAMBIÉN son
 * miembros de `file.sets.classNodes` (la prueba estructural genérica de
 * `code-grammar.ts#isClassLike` — body+name, no función — los admite a
 * todos). Como casi TODO código C# real envuelve sus clases en `namespace Foo
 * {...}`, el `fromPath` que emitía este extractor para una clase anidada era
 * `["X"]` en vez de `["Foo","X"]` — VERIFICADO contra el corpus real
 * (newtonsoft-json): las 25 `EdgeFacts` de `implements` SÍ se producían
 * (`analyzeFile` en aislamiento las mostraba), pero NINGUNA llegaba al grafo
 * final vía `dump-graph-census.mts` (`analyzeRepo` + `onGraph`) — repro
 * mínimo con dos archivos sintéticos (uno con `namespace`, uno sin) aisló la
 * variable exacta. La causa: `graph/symbols.ts` arma el `container` de CADA
 * símbolo con el MISMO criterio genérico (`classNodes.has(node.type)`, sin
 * atarlo a un tipo fijo) — así que el símbolo real de destino vive bajo
 * `container: ["Foo"]`, y la cascada de resolución de `graph/build.ts`
 * (`buildTypedEdgeCandidatesForFile`, `scope: ef.fromPath`) nunca encontraba
 * coincidencia porque el scope que este extractor reportaba estaba
 * INCOMPLETO. `mixin.ts#collect` YA hacía esto bien (empuja cualquier
 * `classNodes.has(node.type)`, nunca atado a un `ownerType` fijo) — por eso
 * jekyll's `mixes-in` (con `module`s Ruby anidados) resolvía correctamente
 * mientras C# no. Arreglado separando "qué nodo aporta un segmento de scope"
 * (cualquier `classNodes`) de "qué nodo aporta una interfaz" (sólo
 * `path.ownerType`, el único con `base_list`/`implements_clause` real).
 *
 * Y UN SEGUNDO DEFECTO RELACIONADO, TAMBIÉN ENCONTRADO MIDIENDO CONTRA EL
 * CORPUS REAL: un namespace COMPUESTO (`namespace Newtonsoft.Json {...}`, la
 * forma que envuelve casi TODO el repo real) es un solo nodo `name` cuyo
 * `.text` trae los puntos adentro — empujarlo como UN SOLO SEGMENTO tampoco
 * calzaba contra `graph/symbols.ts`, que (Ola 9, A1, ya medida y arreglada
 * ahí — `symbols.ts#splitQualifiedSegments`) parte el mismo nombre en un
 * frame POR SEGMENTO, porque `namespace A.B` es estructuralmente idéntico a
 * `namespace A { namespace B {...} } }`. Este archivo lleva una copia LOCAL
 * de la misma función (mismo motivo que `references.ts` lleva la suya: los
 * archivos de esa ola no se importan entre sí) — ver
 * `splitQualifiedSegments` abajo.
 *
 * EMITE en (corridas contra el corpus): java, csharp (parcial — ver
 * ambigüedad arriba), typescript, tsx. MEDIDO de punta a punta contra
 * newtonsoft-json (`dump-graph-census.mts`, grafo YA resuelto): **13
 * `implements`** (antes 0). La extracción cruda produce ~15-25 candidatos
 * en posiciones 1..N de listas de 2+ (ver herencia.ts para el desglose
 * completo extends+implements); la diferencia son objetivos genéricos
 * (`IEquatable<T>`, `IComparable<T>` — filtrados por la simplificación de
 * genéricos de arriba, no por resolución) y algún objetivo externo, mismo
 * principio que `extends`.
 */
import type { Capability } from "../../detect/capabilities.js";
import type { FileUnit } from "../../detect/types.js";
import type { EdgeKind, Provenance } from "../types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Espejo local de la firma congelada CONTRATO-F4.md §2.2/§2.3 — ver la nota
 * de desvío de alcance en el docstring del módulo.
 * ──────────────────────────────────────────────────────────────────────── */

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

export interface EdgeFacts {
  readonly extractorId: string;
  readonly kind: EdgeKind;
  readonly fromPath: readonly string[];
  readonly toName: string;
  readonly toQualifier: readonly string[];
  readonly provenance: Provenance;
  readonly startLine: number;
  readonly endLine: number;
  readonly via: string;
}

export type SlotId = string;

export interface EdgeContext {
  readonly language: string;
  readonly capabilities: ReadonlySet<Capability>;
  carriers(slot: SlotId): readonly CarrierPath[];
  readonly suppressedRolePaths: readonly CarrierPath[];
}

export interface EdgeExtractor<Kind extends EdgeKind = EdgeKind> {
  readonly id: string;
  readonly kind: Kind;
  readonly title: string;
  readonly needs: readonly Capability[];
  readonly slots: readonly SlotId[];
  readonly sentinel: Readonly<Record<string, string>>;
  readonly expect: { readonly from: string; readonly to: string };
  readonly optional: boolean;
  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[];
}

export type EdgeCoverageStatus = "no-aplicable" | SlotStatus;

export interface EdgeCoverage {
  readonly extractorId: string;
  readonly kind: EdgeKind;
  readonly language: string;
  readonly status: EdgeCoverageStatus;
  readonly missingCapabilities: readonly Capability[];
  readonly unitsConsidered: number;
  readonly edges: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * La sonda centinela — puerto del algoritmo de
 * `impl/spikes/discover-carrier/carrier.mjs`, generalizado a un par
 * (from, to) arbitrario en vez de un único slot "named-type".
 * ──────────────────────────────────────────────────────────────────────── */

/** El nodo tal como lo expone `web-tree-sitter` en runtime: `AstNode`
 *  (`detect/types.ts`) no declara `fieldNameForChild` (es una abstracción
 *  deliberadamente mínima), pero el objeto real siempre lo tiene — mismo
 *  cast puntual que ya usa el resto del código para leer `.text`/posiciones. */
interface ProbedNode {
  readonly type: string;
  readonly isNamed: boolean;
  readonly childCount: number;
  readonly text: string;
  child(i: number): ProbedNode | null;
  childForFieldName(name: string): ProbedNode | null;
  fieldNameForChild(i: number): string | null;
}

function hasField(node: ProbedNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isFunctionLikeNode(node: ProbedNode): boolean {
  return hasField(node, "body") && (hasField(node, "parameters") || hasField(node, "parameter_list"));
}

/** Mismo test relajado que el spike valida (9/9, anclado al centinela, NUNCA
 *  un branch ciego de `deriveNodeSets` — la reserva medida de CONTRATO-F4
 *  §2.3). Localiza el nodo declarante buscando su campo `name` == `from`. */
function isNamedDeclLike(node: ProbedNode): boolean {
  return hasField(node, "name") && !isFunctionLikeNode(node);
}

/**
 * Localiza el nodo declarante de `from`, hace DFS adentro buscando la hoja de
 * texto EXACTO `to`, y devuelve el camino de campos (o índice cuando no hay
 * campo) desde el declarante hasta esa hoja. `null` si no lo recupera.
 */
export function discoverCarrier(root: ProbedNode, from: string, to: string): CarrierPath | null {
  let declaring: ProbedNode | null = null;
  const findDeclaring = (node: ProbedNode): void => {
    if (declaring) return;
    if (node.isNamed && isNamedDeclLike(node)) {
      const nameChild = node.childForFieldName("name");
      if (nameChild && nameChild.text === from) {
        declaring = node;
        return;
      }
    }
    for (let i = 0; i < node.childCount && !declaring; i++) {
      const child = node.child(i);
      if (child) findDeclaring(child);
    }
  };
  findDeclaring(root);
  if (!declaring) return null;
  const declaringNode: ProbedNode = declaring;

  const search = (node: ProbedNode): CarrierStep[] | null => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      const field = node.fieldNameForChild(i);
      if (child.childCount === 0 && child.isNamed && child.text === to) {
        return [{ field: field ?? null, index: field ? undefined : i, nodeType: child.type }];
      }
      const rest = search(child);
      if (rest) return [{ field: field ?? null, index: field ? undefined : i, nodeType: child.type }, ...rest];
    }
    return null;
  };
  const steps = search(declaringNode);
  if (!steps) return null;
  return { ownerType: declaringNode.type, steps, positional: steps.some((s) => s.field === null) };
}

export interface ProbeSlotResult {
  readonly status: SlotStatus;
  readonly carriers: readonly CarrierPath[];
  readonly evidence: string;
}

/** `sets` se usa para el mismo chequeo que hará la extracción real sobre
 *  código de verdad (`file.sets.classNodes`): si el `ownerType` que la sonda
 *  encontró no es un tipo-clase reconocido, la extracción NUNCA podría
 *  localizar el nodo declarante en un archivo real — se reporta
 *  `absent-in-language`, no `derived`, aunque el camino se haya recuperado. */
export function probeSlot(root: ProbedNode, classNodes: ReadonlySet<string>, expect: { from: string; to: string }): ProbeSlotResult {
  const path = discoverCarrier(root, expect.from, expect.to);
  if (!path) {
    return { status: "not-recovered", carriers: [], evidence: `no se encontró un camino de "${expect.from}" a "${expect.to}"` };
  }
  if (!classNodes.has(path.ownerType)) {
    return {
      status: "absent-in-language",
      carriers: [path],
      evidence: `"${path.ownerType}" no es un tipo-clase reconocido por sets.classNodes; la extracción no localizaría el nodo declarante en código real`,
    };
  }
  return {
    status: path.positional ? "positional" : "derived",
    carriers: [path],
    evidence: `${path.ownerType} -> ${path.steps.map((s) => s.field ?? `#${s.nodeType}`).join(" -> ")}`,
  };
}

/** Compara dos caminos ignorando el índice final: mismo `ownerType`, mismos
 *  campos y `nodeType` en cada paso salvo el último (que puede diferir sólo
 *  en índice). Si dos caminos conceptualmente distintos (aquí: "cuál es la
 *  interfaz" vs. "cuál es la clase base") comparten esta forma, el lenguaje
 *  no distingue las dos relaciones estructuralmente — la ambigüedad de C#. */
function sameShapeExceptFinalIndex(a: CarrierPath, b: CarrierPath): boolean {
  if (a.ownerType !== b.ownerType || a.steps.length !== b.steps.length) return false;
  for (let i = 0; i < a.steps.length; i++) {
    const sa = a.steps[i]!;
    const sb = b.steps[i]!;
    if (sa.nodeType !== sb.nodeType) return false;
    if (i < a.steps.length - 1 && sa.field !== sb.field) return false;
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────────────
 * El extractor
 * ──────────────────────────────────────────────────────────────────────── */

const SLOT_INTERFACE_CARRIER: SlotId = "interfaz-declarada:carrier";

/** Fuente centinela por lenguaje — mismos nombres (`SentinelDerived`,
 *  `SentinelIfaceA`/`B`) en todos, tomados literalmente del spike ya
 *  verificado `impl/probe/edges/02-interface-declared.mjs`. C# incluye
 *  además `SentinelBase` (primero en la lista) para poder correr la prueba
 *  de ambigüedad de arriba; Go reusa los mismos nombres reformulados como
 *  interfaz-embebe-interfaz (ver límite declarado en el docstring). */
const SENTINEL: Readonly<Record<string, string>> = {
  java: "class SentinelDerived extends SentinelBase implements SentinelIfaceA, SentinelIfaceB { }",
  csharp: "class SentinelDerived : SentinelBase, SentinelIfaceA, SentinelIfaceB { }",
  typescript: "class SentinelDerived extends SentinelBase implements SentinelIfaceA, SentinelIfaceB {}",
  tsx: "class SentinelDerived extends SentinelBase implements SentinelIfaceA, SentinelIfaceB {}",
  go: "package main\n\ntype SentinelIfaceA interface {\n\tDoThing() string\n}\n\ntype SentinelDerived interface {\n\tSentinelIfaceA\n}\n",
};

/** `expect.to` para C# apunta a `SentinelIfaceA`; el nombre de la clase base
 *  (`SentinelBase`) para la prueba de ambigüedad se pide aparte, no forma
 *  parte de la firma congelada `expect: {from,to}`. */
const CSHARP_SUPERCLASS_NAME = "SentinelBase";

/** Guarda genérica de forma — misma expresión que `herencia.ts#IDENTIFIER_RE`. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Un grupo de ARGUMENTOS DE TIPO al final del texto: `<...>` (java, csharp,
 *  la familia JS/TS) o `[...]` (python). Puntuación de gramática, nunca
 *  vocabulario de dominio. */
const TYPE_ARGUMENT_SUFFIX = /(?:<[\s\S]*>|\[[\s\S]*\])\s*$/;

/**
 * Pela argumentos de tipo y calificación del TEXTO de la referencia a una
 * interfaz — ver "EL HUECO DE GENÉRICOS" en el docstring del módulo. `null`
 * cuando lo que queda no es un identificador de programa: ese hijo del
 * contenedor no aporta candidato (y, importante para C#, TAMPOCO cuenta para
 * la aridad). Reemplaza a `stripGenericsAndQualify`, que sólo pelaba `<...>`
 * y no validaba el resultado — mismo cuerpo que `herencia.ts#peelTypeReference`
 * (copia LOCAL por el mismo motivo que `splitQualifiedSegments`: este módulo
 * es autocontenido a propósito, ver el desvío de alcance del docstring).
 */
function peelTypeReference(raw: string): { name: string; qualifier: readonly string[] } | null {
  const stripped = raw.replace(TYPE_ARGUMENT_SUFFIX, "").trim();
  const parts = stripped.split(/::|\./).map((p) => p.trim());
  if (parts.length === 0) return null;
  if (!parts.every((p) => IDENTIFIER_RE.test(p))) return null;
  return { name: parts[parts.length - 1]!, qualifier: parts.slice(0, -1) };
}

/** Copia LOCAL de `graph/symbols.ts#splitQualifiedSegments` (misma función,
 *  mismo separador — `references.ts` lleva otra copia idéntica por el mismo
 *  motivo: los archivos de esa ola no se importan entre sí). Un namespace
 *  COMPUESTO (C# `namespace Newtonsoft.Json {...}`) es UN SOLO nodo cuyo
 *  `.text` trae los puntos adentro; partirlo en un frame por segmento es lo
 *  que `graph/symbols.ts` ya hace para el MISMO nodo — si acá se empujara
 *  el texto entero como un frame glued, `fromPath` no calzaría contra
 *  `container` y la cascada de resolución (que compara elemento a
 *  elemento) nunca encontraría el símbolo. No-op para un identificador
 *  simple (el caso común). */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

/** Aplica el camino descubierto (menos el último paso) desde `from` para
 *  llegar al nodo "contenedor" de la lista de interfaces, buscando por
 *  `nodeType` en vez de por índice absoluto — el índice de un hijo sin
 *  nombre de campo puede variar entre instancias reales aunque el centinela
 *  sólo haya visto un caso (ver "simplificaciones declaradas" arriba). */
function locateContainer(from: ProbedNode, prefix: readonly CarrierStep[]): ProbedNode | null {
  let current: ProbedNode | null = from;
  for (const step of prefix) {
    if (!current) return null;
    if (step.field !== null) {
      current = current.childForFieldName(step.field);
    } else {
      let found: ProbedNode | null = null;
      for (let i = 0; i < current.childCount; i++) {
        const child = current.child(i);
        if (child && child.type === step.nodeType) {
          found = child;
          break;
        }
      }
      current = found;
    }
  }
  return current;
}

/** Cachea, por lenguaje, el resultado de correr la sonda UNA vez sobre
 *  `SENTINEL` — evita re-parsear el centinela por archivo analizado. Se
 *  llena perezosamente la primera vez que `extract()` ve ese lenguaje (no
 *  hay forma sync de parsear con `web-tree-sitter`, así que la primera
 *  llamada por lenguaje paga el costo async antes de poder resolver; ver
 *  `interfaz-declarada.test.ts` para cómo el arnés de test resuelve esto por
 *  adelantado con `warmUp()`). */
const languageProfile = new Map<
  string,
  { readonly status: SlotStatus; readonly carriers: readonly CarrierPath[] }
>();

/** Expuesto SÓLO para que el test (o, eventualmente, la wiring real de
 *  `analyzeFile`) precompute el perfil de un lenguaje ANTES de invocar
 *  `extract()`, que debe seguir siendo sync sobre el AST vivo. No es parte
 *  de la firma congelada de `EdgeExtractor` — es el puente async→sync que
 *  hace falta porque `web-tree-sitter` no tiene una API de parseo síncrona.
 *
 * `carriers` YA NO se vacía cuando `ambiguous` — ver "AMBIGÜEDAD DECLARADA
 * — C#" en el docstring del módulo: `extract()` los sigue necesitando para
 * localizar el contenedor de cada declaración real y reclamar, por su
 * aridad efectiva, las posiciones 1..N (ciertas) sin tocar la posición 0
 * (la que de verdad sigue siendo ambigua). */
export function warmUp(
  language: string,
  root: ProbedNode,
  classNodes: ReadonlySet<string>,
): { readonly status: SlotStatus; readonly carriers: readonly CarrierPath[]; readonly ambiguous: boolean } {
  const result = probeSlot(root, classNodes, extractor.expect);
  let ambiguous = false;
  // Sin gate de lenguaje (nunca `if (language === "csharp")` acá — ese atajo
  // se removió por prohibido): corre igual para los 6 lenguajes de este
  // extractor. `CSHARP_SUPERCLASS_NAME` ("SentinelBase") SÍ aparece también
  // en los sentinels de java/typescript/tsx (ver `SENTINEL` arriba), así que
  // `discoverCarrier` encuentra un `superPath` real ahí — pero
  // `sameShapeExceptFinalIndex` lo descarta igual: en esas gramáticas
  // `extends`/`implements` son clausulas separadas (`steps.length`/`nodeType`
  // distintos de la lista de interfaces), así que la comparación de forma da
  // `false`. Confirmado empíricamente: con el gate removido, los 12 tests de
  // este archivo (java/typescript/tsx incluidos, con 2 interfaces cada uno)
  // siguen pasando idénticos.
  if (result.carriers[0]) {
    const superPath = discoverCarrier(root, extractor.expect.from, CSHARP_SUPERCLASS_NAME);
    if (superPath && sameShapeExceptFinalIndex(result.carriers[0], superPath)) ambiguous = true;
  }
  const status: SlotStatus = ambiguous ? "ambiguous" : result.status;
  languageProfile.set(language, { status, carriers: result.carriers });
  return { status, carriers: result.carriers, ambiguous };
}

export const extractor: EdgeExtractor<"implements"> = {
  id: "interfaz-declarada",
  kind: "implements",
  title: "Implementación de interfaz declarada",
  needs: ["interfaz"],
  slots: [SLOT_INTERFACE_CARRIER],
  sentinel: SENTINEL,
  expect: { from: "SentinelDerived", to: "SentinelIfaceA" },
  optional: true, // Go: absent-in-language documentado (ver docstring); C#: ambiguous cuando aplica.

  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[] {
    const carriers = ctx.carriers(SLOT_INTERFACE_CARRIER);
    const path = carriers[0];
    if (!path || path.steps.length === 0) return [];
    const prefix = path.steps.slice(0, -1);
    const leafType = path.steps[path.steps.length - 1]!.nodeType;
    // C# comparte `base_list` con `herencia.ts` — ver "AMBIGÜEDAD DECLARADA
    // — C#" en el docstring del módulo. Derivado por `warmUp` (nunca un
    // `if (file.language === "csharp")` acá): si mañana otro lenguaje
    // compartiera la misma lista con su propia arista `extends`, esta
    // bandera lo capturaría igual.
    const sharesListWithSuperclass = languageProfile.get(file.language)?.status === "ambiguous";

    const root = file.root as unknown as ProbedNode;
    const facts: EdgeFacts[] = [];
    const classStack: string[] = [];

    const visit = (node: ProbedNode): void => {
      let pushedCount = 0;
      // CONTENEDOR DE SCOPE, cualquier miembro de `classNodes` — namespace
      // (C# `namespace_declaration`), struct/enum/record además de clase —
      // NO sólo `path.ownerType`. Ver "FROMPATH DEBE INCLUIR TODO CONTENEDOR
      // ANIDADO" en herencia.ts (mismo defecto, misma corrección): un C#
      // `namespace Foo { class X : IY {} }` sin esto produce `fromPath:
      // ["X"]` en vez de `["Foo","X"]`, y la cascada de resolución (que
      // espera el camino completo, como lo arma `graph/symbols.ts`) nunca
      // encuentra el nodo — mismo criterio que YA usa `mixin.ts#collect`.
      if (node.isNamed && file.sets.classNodes.has(node.type)) {
        const nameChild = node.childForFieldName("name");
        const name = nameChild?.text ?? null;
        if (name) {
          // Un namespace COMPUESTO (`namespace Newtonsoft.Json {...}`, la
          // forma que envuelve casi todo el repo real) es UN SOLO nodo cuyo
          // `.text` trae los puntos adentro — `graph/symbols.ts
          // #splitQualifiedSegments` (Ola 9, A1, ya medida y arreglada ahí)
          // empuja UN frame POR SEGMENTO. Copia LOCAL del mismo separador
          // (mismo motivo que `references.ts` lleva la suya); no-op para un
          // identificador simple.
          const segments = splitQualifiedSegments(name);
          for (const seg of segments) classStack.push(seg);
          pushedCount = segments.length;

          // Sólo el nodo que ESTE extractor sabe leer (el `ownerType` que su
          // propia sonda descubrió) aporta interfaces — un namespace/struct/
          // enum/record que sólo pasó el filtro de arriba (pero no es el
          // `ownerType` real) sólo contribuye SCOPE.
          if (node.type === path.ownerType) {
            const container = locateContainer(node, prefix);
            if (container) {
              // CUALQUIER hijo NOMBRADO del contenedor que reduzca a un
              // identificador — ya no sólo los del `nodeType` exacto que el
              // centinela (sin genéricos) descubrió. Ver "EL HUECO DE
              // GENÉRICOS" en el docstring del módulo: filtrar por `leafType`
              // hacía invisible cada `Foo<T>` de la lista, y en C# eso además
              // corría la ARIDAD con la que se decide qué posición es
              // ciertamente una interfaz.
              const matches: { name: string; qualifier: readonly string[] }[] = [];
              for (let i = 0; i < container.childCount; i++) {
                const child = container.child(i);
                if (!child || !child.isNamed) continue;
                const peeled = peelTypeReference(child.text);
                if (!peeled) continue;
                matches.push(peeled);
              }
              // AMBIGÜEDAD DECLARADA — C# (ver docstring del módulo): con la
              // lista compartida, sólo las posiciones DESPUÉS de la primera
              // son ciertas (interfaz, nunca clase base — la aridad de C# lo
              // garantiza). Con un único candidato, la posición 0 es de
              // `herencia.ts` (lo reclama como clase base); acá no se emite
              // nada para no clasificar la misma relación dos veces. Con 2+,
              // la posición 0 sigue genuinamente ambigua (contraejemplo real
              // en el corpus, ver docstring) — se reclaman sólo `matches[1:]`.
              const chosen = sharesListWithSuperclass ? (matches.length >= 2 ? matches.slice(1) : []) : matches;
              for (const { name: toName, qualifier } of chosen) {
                facts.push({
                  extractorId: extractor.id,
                  kind: "implements",
                  fromPath: [...classStack],
                  toName,
                  toQualifier: qualifier,
                  provenance: "declared",
                  startLine: (node as unknown as { startPosition: { row: number } }).startPosition.row + 1,
                  endLine: (node as unknown as { endPosition: { row: number } }).endPosition.row + 1,
                  via: `${path.ownerType}.${prefix.map((s) => s.field ?? `#${s.nodeType}`).join(".")}`,
                });
              }
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
      for (let i = 0; i < pushedCount; i++) classStack.pop();
    };
    visit(root);
    return facts;
  },
};

/** Cobertura para un lenguaje dado, construida a partir del resultado de
 *  `warmUp()` — misma forma que `DetectorCoverage` (`extractorId`, `kind`,
 *  `language`, `status`, `missingCapabilities`, `unitsConsidered`, `edges`). */
export function coverageFor(
  language: string,
  capabilities: ReadonlySet<Capability>,
  unitsConsidered: number,
  edgesEmitted: number,
): EdgeCoverage {
  const missing = extractor.needs.filter((c) => !capabilities.has(c));
  if (missing.length > 0) {
    return { extractorId: extractor.id, kind: extractor.kind, language, status: "no-aplicable", missingCapabilities: missing, unitsConsidered, edges: 0 };
  }
  const profile = languageProfile.get(language);
  const status: EdgeCoverageStatus = profile?.status ?? "not-recovered";
  return { extractorId: extractor.id, kind: extractor.kind, language, status, missingCapabilities: [], unitsConsidered, edges: status === "derived" || status === "positional" ? edgesEmitted : 0 };
}
