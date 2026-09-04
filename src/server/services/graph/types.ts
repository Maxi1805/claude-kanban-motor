/**
 * El grafo entre archivos — CONTRATO-F3.md §3.1/§3.2, ahora relleno.
 *
 * Antes era una interfaz mínima declarada sin implementación (ver el
 * historial de este archivo): la superficie que `detect/types.ts`'s
 * `RepoUnit.graph` necesitaba para tipar sin existir todavía. F3 la llena
 * con la forma real que `graph/build.ts` produce y `graph/resolve.ts`
 * alimenta. Nadie fuera de `graph/*` lee `.nodes`/`.edges` hoy (`RepoUnit.
 * graph`/`PatternHypothesis.build`'s segundo argumento lo pasan como
 * `CodeGraph | null` opaco — verificado por grep antes de este cambio), así
 * que ensanchar la forma no rompe ningún llamador existente.
 *
 * `CodeGraph` sigue siendo SÓLO DATOS: sin funciones, sin índices. Los
 * índices (`nodeById`, `edgesFrom`, `edgesTo`) son responsabilidad de quien
 * consuma el grafo (F4+), construidos una vez por corrida — no de este tipo.
 *
 * ── CONTRATO-F8G.md — las formas enriquecidas de esta ola, aterrizadas por
 *    Cimientos (este archivo + `graph/build.ts`, únicos dueños de la ola) ──
 *
 * TODO lo de acá abajo es ADITIVO: ningún campo existente cambia de tipo, y
 * los campos nuevos son opcionales — un `CodeGraphNode`/`CodeGraphEdge` de
 * antes de esta ola sigue siendo un valor válido del tipo ensanchado. Los
 * cinco frentes (F1-F5, ver CONTRATO-F8G.md §7) llenan la EXTRACCIÓN; este
 * módulo sólo deja la FORMA puesta, vacía, para que los cinco compilen
 * contra algo real desde el primer commit.
 */
import type { Anchor } from "../detect/types.js";
import type { ResolutionStageId, ResolutionStats } from "./stages.js";
import type { SymbolFamily } from "./symbols.js";

/**
 * CONTRATO-F9.md §2/§3. `"finding"` (§2) es un hallazgo ya detectado,
 * proyectado al grafo — `"carrier"` (§3) es el sitio SIN NOMBRE PROPIO
 * (elemento de colección/entrada de mapa/argumento) que porta un valor
 * invocable, cuando la gramática no le da un nodo `symbol` ya existente.
 * Ambos son ADITIVOS: ningún nodo de antes de esta ola cambia de `kind`.
 */
export type GraphNodeKind = "folder" | "file" | "symbol" | "finding" | "carrier";

/**
 * CONTRATO-F8G.md §2.1. Sólo los cuatro tipos de nodo modificador que la
 * gramática expone en algún lenguaje soportado (`modifiers`/`modifier`/
 * `access_modifier`/`visibility_modifier`) mapean acá — nunca por nombre de
 * símbolo ni por capitalización. F2 (`graph/symbols.ts`) es quien produce
 * el valor real; este tipo sólo es el vocabulario.
 */
export type Visibility = "public" | "private" | "protected" | "internal";

export interface CodeGraphNode {
  /** `folder:src/a` | `file:src/a/b.rb` | `sym:src/a/b.rb#Site.process` — ver `symbolNodeId`/`fileNodeId`/`folderNodeId` abajo. */
  readonly id: string;
  readonly kind: GraphNodeKind;
  /** Ruta del archivo; para `folder`, la ruta de la carpeta. */
  readonly file: string;
  /** Camino de unidades nombradas, de afuera hacia adentro. Vacío = archivo o carpeta. */
  readonly symbolPath: readonly string[];
  /** Sólo `kind === "symbol"`. */
  readonly family?: SymbolFamily;
  readonly startLine?: number;
  readonly endLine?: number;
  /**
   * NUEVO, CONTRATO-F8G.md §2.1. Cantidad de parámetros declarados — sólo
   * `kind === "symbol"` con `family === "function-like"`. `null` = la
   * gramática no expuso lista de parámetros para este nodo (no se sabe;
   * distinto de aridad cero); `undefined` = F2 todavía no corrió sobre este
   * símbolo (día 0 de esta ola, o lenguaje/familia fuera de alcance de F2).
   * Copiado verbatim desde `SymbolFacts.arity` por `buildNodesAndContainsForFile`
   * — ver `graph/build.ts`.
   */
  readonly arity?: number | null;
  /**
   * NUEVO, Ola U (C2) — HUECO DE GRAFO #2 del `PLAN-INTENCIONES.md`. Copiado
   * VERBATIM desde `SymbolFacts.returnType` (ver su docstring en
   * `graph/symbols.ts` para las cuatro ranuras de gramática de las que sale y
   * para las dos únicas normalizaciones que se aplican): **el tipo de retorno
   * ESCRITO** de un miembro. Sólo `kind === "symbol"` con `family ===
   * "function-like"`.
   *
   * POR QUÉ HACE FALTA, MEDIDO: `MemberSignature` comparaba miembros por
   * `(nombre, aridad)` y nada más, así que dos miembros de subtipos hermanos
   * con tipos de retorno INCOMPATIBLES daban coincidencia perfecta —
   * `BsonObject.GetEnumerator(): IEnumerator<BsonProperty>` contra
   * `BsonArray.GetEnumerator(): IEnumerator<BsonToken>`
   * (`newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs:52-54` y `:75-77`),
   * con cuerpos textualmente idénticos, y una recomendación que proponía
   * unificarlos en el ancestro: un cambio que no compila.
   *
   * AUSENTE = **NO SE SABE**, jamás "no devuelve nada" — ruby y javascript no
   * tienen dónde escribirlo, y en las gramáticas que sí lo tienen el autor
   * puede no haberlo escrito. Dos ausentes NO son un acuerdo; un ausente
   * contra un presente NO es un desacuerdo.
   */
  readonly returnType?: string;
  /**
   * NUEVO, CONTRATO-F8G.md §2.1. AUSENTE ≠ público: ausente es "este
   * lenguaje/nodo no expone un slot de visibilidad", no "es público".
   * Copiado verbatim desde `SymbolFacts.visibility`.
   */
  readonly visibility?: Visibility;
  /**
   * NUEVO, Ola P (P2). Copiado verbatim desde `SymbolFacts.memberOfClassLike`
   * — "este símbolo nunca se alcanza por su nombre desnudo: hay que pasar por
   * su dueño". El hecho existía desde F3 y `graph/symbols.ts` lo hizo VERDADERO
   * para la declaración con receptor escrito (`func (p *Foo) bar()`) en la Ola
   * O, pero no viajaba al nodo, así que ningún consumidor del grafo podía
   * leerlo — la causa medida de la regresión de Go de `unused-symbol` (un
   * método con receptor tiene `symbolPath` de UN segmento en Go, así que
   * "profundidad > 1" no lo distingue de una función de paquete; este campo
   * SÍ). Sólo `kind === "symbol"`; `undefined` = quien armó los `SymbolFacts`
   * no lo trajo (literal a mano en un test), nunca "es false".
   */
  readonly memberOfClassLike?: boolean;
  /**
   * NUEVO, Ola P (P2). Copiado verbatim desde `SymbolFacts.exported` — ver su
   * docstring en `graph/symbols.ts` para las DOS fuentes de evidencia
   * NEGATIVA (envoltorio `export` de la familia TS/JS; `private` de Java/C#) y
   * para por qué el default es el permisivo `true`. AUSENTE ≠ `false`:
   * ausente es "quien armó estos hechos no lo calculó". Sólo `kind ===
   * "symbol"`.
   */
  readonly exported?: boolean;
  /**
   * NUEVO, Ola S (S1). Copiado VERBATIM desde `SymbolFacts.nodeType` — el
   * TIPO DE NODO DE LA GRAMÁTICA con el que se declaró este símbolo
   * (`interface_declaration`, `class_declaration`, `type_spec`, `struct_...`,
   * lo que la gramática haya escrito), tercera repetición exacta de la misma
   * operación que la Ola P hizo con `memberOfClassLike`/`exported`: el hecho
   * ya existía del lado de la extracción y no viajaba al nodo, así que ningún
   * consumidor del grafo podía leerlo.
   *
   * POR QUÉ HACE FALTA, MEDIDO: `SymbolFamily` colapsa a `"class-like"` la
   * clase, el struct, el record Y la interfaz — `graph/symbols.ts` no tiene
   * refinamiento para eso, y `graph/edges/satisfies-derive.ts` lo declara
   * explícitamente ("El grafo NO tiene esa distinción"). Consecuencia: un
   * `interface B extends A` entre DOS interfaces llega al grafo con la misma
   * forma que `class B implements A`, y quien cuenta implementadores no puede
   * distinguirlos. Este campo es el único lugar donde la gramática ya dijo
   * cuál de las dos cosas es.
   *
   * NUNCA una etiqueta inventada ni normalizada: es el string de la gramática
   * tal cual, con todo lo que eso implica (dos gramáticas distintas pueden
   * compartir el nombre — `class_declaration` en Java y en TypeScript — y una
   * puede no distinguir lo que otra sí: Go declara struct e interfaz con el
   * MISMO `type_spec`, ver `graph/symbols.ts#SymbolFacts.nodeType`). Quien lo
   * lea tiene que tratar "no distingue" como un `no sé`, nunca como un `no`.
   *
   * Sólo `kind === "symbol"`; `undefined` = quien armó los `SymbolFacts` no lo
   * trajo (literal a mano en un test), nunca "no tiene tipo de nodo".
   */
  readonly nodeType?: string;
  /**
   * NUEVO, Ola S (S1). Copiado VERBATIM desde `SymbolFacts.shapeNodeType` —
   * el MISMO hecho que `nodeType` un nivel más abajo, para la gramática que
   * no escribe la forma del tipo en el nodo declarante (Go: `type_spec` →
   * `interface_type`/`struct_type`). Ver el docstring de ese campo en
   * `graph/symbols.ts` para la medición y para por qué la regla es de forma
   * ("la declaración expone campo `type`") y no de lenguaje.
   *
   * CÓMO SE LEE, y es lo único que hay que recordar: la forma declarada de un
   * tipo es `shapeNodeType ?? nodeType`. AUSENTE = "la forma ya está en
   * `nodeType`", nunca "no se sabe".
   */
  readonly shapeNodeType?: string;
  /**
   * NUEVO, CONTRATO-F9.md §2.1. Sólo `kind === "finding"` — `Finding.kind`
   * verbatim (el `CodeFindingKind`, string libre por diseño de
   * `detect/types.ts`). Ausente en cualquier otro `kind` de nodo.
   */
  readonly findingKind?: string;
  /** NUEVO, CONTRATO-F9.md §2.1. Sólo `kind === "finding"`. 0-100, verbatim de `Finding.severity`. */
  readonly severity?: number;
  /** NUEVO, CONTRATO-F9.md §2.1. Sólo `kind === "finding"`. Verbatim de `Finding.detectorId`. */
  readonly detectorId?: string;
  /**
   * NUEVO, CONTRATO-F9.md §3.2. Sólo `kind === "carrier"` — de qué FORMA
   * SINTÁCTICA es el sitio portador. Derivado del tipo de nodo de la
   * gramática (campo/elemento de colección/entrada de mapa/argumento/
   * variable local), jamás del nombre del campo — mismo criterio "forma, no
   * vocabulario" que el resto del grafo.
   */
  readonly carrierForm?: "field" | "collection-element" | "map-value" | "argument" | "local" | "parameter";
  /**
   * NUEVO, Ola R (R1) — QUÉ SE ESCRIBIÓ en el campo `type` de la gramática
   * para este sitio de declaración. Sólo `kind === "carrier"`, y sólo en los
   * portadores que `graph/edges/declara-tipo.ts` materializa.
   *
   * AUSENTE ≠ "no tiene tipo": ausente es "nadie miró este sitio" — o porque
   * el portador lo creó otro extractor (`portador.ts`,
   * `invocacion-indirecta.ts`), o porque la declaración no escribió ningún
   * tipo. Es el `no sé` de la regla 2, y es DISTINTO de `"nominal"` sin
   * arista, que es "miré, hay un nombre escrito, no hay declaración del repo
   * que lo lleve". Ver `WrittenTypeForm` (`graph/edges/types.ts`) para los
   * tres valores y `declaredTypeOf` (`graph/edges/declara-tipo.ts`) para la
   * consulta que junta este campo con la arista.
   */
  readonly declaredTypeForm?: import("./edges/types.js").WrittenTypeForm;
  /**
   * NUEVO, Ola R (R2) — POR CUÁL DE LAS DOS VÍAS se supo `declaredTypeForm`.
   * Sólo `kind === "carrier"`, y sólo donde `declaredTypeForm` está presente.
   *
   *   - `"declared"` — el tipo lo ESCRIBIÓ la gramática
   *     (`graph/edges/declara-tipo.ts`, vía 1). El compilador garantiza que
   *     nada más puede llegar a ese sitio.
   *   - `"inferred"` — se PROPAGÓ desde el ORIGEN del valor
   *     (`graph/edges/propaga-tipo.ts`, vía 2: `x = Foo()`,
   *     `self.conn = Conn()`, `@cache = {}`). Es lo que se observó en las
   *     asignaciones de ese archivo, no una garantía del lenguaje.
   *
   * Vive en el NODO, y no alcanza con la `provenance` de la ARISTA, porque
   * los dos casos SIN arista (`"primitive"` y `"composite"`) también hay que
   * poder distinguirlos: un `int` escrito no es lo mismo que un `= 5` visto.
   * Consulta: `declaredTypeSourceOf` (`graph/edges/declara-tipo.ts`).
   */
  readonly declaredTypeProvenance?: Provenance;
}

/**
 * El conjunto de miembros de un nodo `class-like`/`namespace-like` NO se
 * ALMACENA (CONTRATO-F8G.md §2.1: denormalizar ~40 000 firmas en guava
 * duplicaría lo que las aristas `contains` ya dicen) — se DERIVA con
 * `memberSignatures` de abajo, sobre el índice que el consumidor arma una
 * vez por corrida.
 */
export interface MemberSignature {
  /** Último segmento de `symbolPath` del miembro. */
  readonly name: string;
  readonly arity: number | null;
  /**
   * NUEVO, Ola U (C2) — HUECO DE GRAFO #2. El tipo de retorno ESCRITO, copiado
   * verbatim desde `CodeGraphNode.returnType` (ver su docstring para el caso
   * medido que lo motiva y para qué significa cada valor).
   *
   * LA REGLA DE LECTURA, y es la única que hay que recordar: **AUSENTE ES UN
   * `no sé`, NO UN ACUERDO NI UN DESACUERDO.** Comparar dos firmas por tipo de
   * retorno sólo tiene sentido cuando LAS DOS lo traen; si alguna falta, el
   * dato no dice nada y quien pregunte tiene que quedarse con lo que ya sabía
   * por `(nombre, aridad)`. Ver `returnTypesConflict` abajo — usar esa función
   * en vez de comparar el campo a mano es lo que impide convertir un `no sé`
   * en un `no`.
   */
  readonly returnType?: string;
  readonly visibility?: Visibility;
}

/**
 * ¿Dos firmas del MISMO nombre y aridad se CONTRADICEN en lo que devuelven?
 *
 * QUÉ INTENCIÓN VERIFICA: "estos dos miembros homónimos, ¿pueden ser el MISMO
 * contrato?". `true` sólo cuando las dos escribieron un tipo de retorno y son
 * textos DISTINTOS — o sea, cuando hay evidencia POSITIVA de que unificarlas
 * en un ancestro común rompería el contrato de tipos de alguna de las dos. Es
 * el discriminador negativo que el plan pide para Template Method: dos
 * `GetEnumerator()` de aridad 0 con cuerpos idénticos y retornos
 * `IEnumerator<BsonProperty>` / `IEnumerator<BsonToken>` NO son un gancho
 * compartido, por mucho que Jaccard de cuerpo dé 1.0.
 *
 * `false` cuando FALTA cualquiera de los dos: ausente es "no se sabe" (la
 * gramática de ruby/javascript no tiene ranura, o el autor no escribió el
 * tipo), y tratar un `no sé` como conflicto apagaría el patrón entero en dos
 * lenguajes. Esta función NUNCA contesta "son compatibles" — sólo "hay
 * desacuerdo escrito, sí o no".
 *
 * IGUALDAD TEXTUAL, no de tipos: dos nombres distintos pueden denotar el mismo
 * tipo vía alias/`using`/import, y resolver eso es un problema de cascada que
 * el grafo no hace acá. Consecuencia declarada: un alias produce un falso
 * "conflicto". Es el trueque elegido — un falso conflicto BAJA la confianza de
 * una recomendación, un falso acuerdo la EMITE rota.
 */
export function returnTypesConflict(a: MemberSignature, b: MemberSignature): boolean {
  if (a.returnType === undefined || b.returnType === undefined) return false;
  return a.returnType !== b.returnType;
}

/**
 * La única superficie de índice que `memberSignatures` necesita — la misma
 * superficie mínima (`nodeById`/`edgesFrom`) que el docstring de `CodeGraph`
 * de arriba ya reserva para "quien consuma el grafo", no un tipo nuevo de
 * responsabilidad.
 */
export interface GraphIndex {
  nodeById(id: string): CodeGraphNode | null;
  edgesFrom(id: string): readonly CodeGraphEdge[];
  /**
   * NUEVO, CONTRATO-F9.md §6 fila 1 ("GraphIndex ensanchado"). OPCIONAL a
   * propósito: el único implementador de hoy (`graph/edges/satisfies-derive.ts`)
   * arma su `GraphIndex` a mano sin `edgesTo`, y esta ola no es dueña de ese
   * archivo — un método requerido lo habría roto sin necesidad. Quien
   * necesite aristas entrantes (el vecindario del §1, un futuro consumidor de
   * `affects`/`carries`) lo provee cuando lo arme; ausente ⇒ ese índice
   * simplemente no ofrece la consulta inversa.
   */
  edgesTo?(id: string): readonly CodeGraphEdge[];
}

/**
 * CONTRATO-F8G.md §2.1: filtra las aristas `contains` que salen de `ownerId`
 * hacia nodos `kind === "symbol"` con `family === "function-like"` y las
 * proyecta a `MemberSignature`. Pura, O(hijos directos de `ownerId`), sin
 * memoria persistente — ninguna llamada cachea nada entre invocaciones.
 * Sigue funcionando (devuelve `[]`) sobre un grafo de antes de esta ola: los
 * nodos ahí no tienen `arity`, así que cada miembro sale con `arity: null`.
 */
export function memberSignatures(index: GraphIndex, ownerId: string): readonly MemberSignature[] {
  const out: MemberSignature[] = [];
  for (const e of index.edgesFrom(ownerId)) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById(e.to);
    if (!target || target.kind !== "symbol" || target.family !== "function-like") continue;
    const name = target.symbolPath[target.symbolPath.length - 1];
    if (name === undefined) continue;
    // `returnType` — Ola U (C2). Copiado verbatim, igual que `arity`/
    // `visibility`: esta función proyecta, no interpreta. Un grafo de antes de
    // esta ola sale con `returnType: undefined`, que es el `no sé` correcto.
    out.push({ name, arity: target.arity ?? null, returnType: target.returnType, visibility: target.visibility });
  }
  return out;
}

/**
 * Esta ola emite las dos primeras. Las tipadas se declaran ahora y se emiten en F4.
 * `"satisfies"` (F4, CONTRATO-F4.md §2.1) es la ÚNICA entrada agregada en toda
 * la ola: satisfacción ESTRUCTURAL de interfaz (Go, TS) — un tipo cumple una
 * interfaz sin declararlo, derivado comparando conjuntos de método
 * (nombre+aridad), nunca por nombre de campo. La agrega el agente de
 * `graph/edges/interfaz-estructural.ts`, ya que el "agente-sonda" que debía
 * hacer este único cambio no llegó a correr por separado (ver la nota de
 * proceso en `graph/edges/types.ts`).
 *
 * `"calls"` — NUEVO, CONTRATO-F8G.md §3.1. `references` símbolo→símbolo cuyo
 * sitio de uso es la posición de callee (`ReferenceFacts.isCallee`, F1).
 * Misma granularidad, misma cascada, mismo mecanismo de re-etiquetado
 * (`relabelKind`) que ya usan las 5 aristas tipadas de arriba — ver
 * `graph/build.ts`'s partición callee/no-callee.
 *
 * Las tres de CONTRATO-F9.md, todas ADITIVAS:
 *   - `"affects"` (§2.2): SIEMPRE `finding → (symbol|file)`. Una por
 *     `location` distinta del `Finding` (deduplicada por ancla serializada).
 *   - `"carries"` (§3.1): `portador → símbolo function-like` — "a este
 *     portador llegó este invocable".
 *   - `"invokes-indirect"` (§3.1): `símbolo que contiene el sitio → portador`
 *     — "este sitio invoca a través de este portador". Nunca hay una arista
 *     directa `sitio → callee`: el camino de DOS tramos (`invokes-indirect`
 *     seguido de `carries`) es la forma en que la incertidumbre queda
 *     declarada, no escondida — un portador puede tener más de un `carries`.
 *
 * `"declares-type"` — NUEVA, Ola R (R1), la 13.ª y la primera que modela el
 * FLUJO DE LOS DATOS y no la estructura: de un SITIO DE DECLARACIÓN (campo,
 * parámetro, variable — un nodo `carrier`, ver `declaraTipoNodeId`) al NODO
 * DE LA CLASE que sostiene. Extracción SINTÁCTICA del tipo escrito, nunca
 * inferencia — y jamás por conjunto de miembros, que es la forma exacta de
 * `deriveSatisfiesEdges`. `provenance: "ambiguous"` + `alternatives` cuando
 * el sitio es multivaluado (unión escrita, u homónimos que la cascada no
 * desempató). Ausencia de arista sobre un nodo con `declaredTypeForm:
 * "nominal"` significa "se escribió un nombre y no hay declaración del repo
 * que lo lleve" — el `no sé` explícito, distinto de la ausencia del nodo.
 * Ver `graph/edges/declara-tipo.ts` y `CONTRATO-DECLARA-TIPO.md`.
 *
 * `"stores"` — NUEVA, Ola R (R3, frente "cadena de identidad",
 * `graph/edges/cadena-identidad.ts`). EL ESLABÓN QUE FALTABA de
 * `construye → guarda → lee`: `binding → símbolo class-like`, "el valor que
 * este binding de nivel de módulo o de clase guarda fue CONSTRUIDO en su
 * propia inicialización, y es de este tipo". `instantiates` dice QUIÉN
 * construye y se corta ahí: no dice dónde queda el resultado.
 *
 * NO es lo mismo que `declares-type` de arriba, aunque en la intersección
 * coincidan: `declares-type` sale del tipo ESCRITO en un sitio de declaración
 * (y su `from` es un nodo `carrier`); `stores` sale de la CONSTRUCCIÓN
 * escrita en la inicialización, y su `from` es SIEMPRE un nodo `symbol` con
 * `family: "other"` — los bindings NO locales que `graph/symbols.ts` ya mina
 * de `BINDING_DECLARATOR_TYPES`. Un `Foo x = fabrica()` tiene `declares-type`
 * y no tiene `stores`; un `x = Foo()` de Python tiene `stores` y no tiene
 * tipo escrito. Es esa diferencia — "acá se construyó", no "acá dice Foo" —
 * la que hace respondible *"¿construido exactamente una vez y guardado en un
 * binding de módulo/clase?"*.
 *
 * El TERCER eslabón (quién LEE el binding) NO necesita arista nueva y está
 * MEDIDO, no supuesto: las `references`/`calls` que ya entran al nodo del
 * binding lo contestan — cobra 56/57 bindings con ≥1 entrante, nest 351/405,
 * jekyll 108/130, preact 181/216, click 252/373 (ver `ola-r/informes/R3.md`).
 *
 * Multivaluada por diseño: dos inicializaciones del MISMO binding con
 * orígenes distintos viajan como `provenance: "ambiguous"` + `alternatives`,
 * nunca colapsadas a un tipo — ver `markAmbiguousStores` en el módulo de la
 * arista.
 */
export type EdgeKind =
  | "contains"
  | "references"
  | "extends"
  | "implements"
  | "mixes-in"
  | "instantiates"
  | "imports"
  | "satisfies"
  | "calls"
  | "affects"
  | "carries"
  | "invokes-indirect"
  | "declares-type"
  | "stores";

/**
 * `declared` = la sintaxis lo dice; `resolved` = lo dedujo la cascada;
 * `inferred` = heurística; `ambiguous` — NUEVO, CONTRATO-F9.md §4.1,
 * vocabulario tomado de Graphify (aristas `AMBIGUOUS`) con comportamiento
 * propio (ver `CodeGraphEdge.alternatives` y `edgeIsAmbiguous` abajo): la
 * cascada sobrevivió con más de un destino posible y, en vez de descartarla
 * (como antes de esta ola), se conserva con el primer candidato determinista
 * como `to` y el resto en `alternatives`.
 */
export type Provenance = "declared" | "resolved" | "inferred" | "ambiguous";

/**
 * CONTRATO-F8G.md §1.1. Los 3 de los 6 roles de `classifyRole`
 * (`graph/references.ts`) que son SITIOS DE USO, no de declaración — los
 * otros tres (`decl-name`, `parameter`, `key`) nunca llegan a una arista
 * (la etapa `syntactic-role` los rechaza antes). Nombre verbatim, cero
 * traducción.
 */
export type EdgeRole = "bare" | "receiver-member" | "qualified";

/** CONTRATO-F8G.md §1.2 — máscara de bits, no string: ver `CodeGraphEdge.roles`. */
export const EDGE_ROLE_BARE = 1;
export const EDGE_ROLE_RECEIVER_MEMBER = 2;
export const EDGE_ROLE_QUALIFIED = 4;

const EDGE_ROLE_BIT_BY_NAME: Readonly<Record<EdgeRole, number>> = {
  bare: EDGE_ROLE_BARE,
  "receiver-member": EDGE_ROLE_RECEIVER_MEMBER,
  qualified: EDGE_ROLE_QUALIFIED,
};

/** El bit `EDGE_ROLE_*` de un `EdgeRole`. */
export function edgeRoleBit(role: EdgeRole): number {
  return EDGE_ROLE_BIT_BY_NAME[role];
}

/** `true` si la máscara de `edge.roles` incluye `role`. Una arista sin `roles` (kind que nunca lo lleva) nunca tiene ningún rol. */
export function edgeHasRole(edge: CodeGraphEdge, role: EdgeRole): boolean {
  return ((edge.roles ?? 0) & edgeRoleBit(role)) !== 0;
}

export interface CodeGraphEdge {
  readonly from: string; // CodeGraphNode.id
  readonly to: string; // CodeGraphNode.id
  readonly kind: EdgeKind;
  readonly provenance: Provenance;
  /** Ocurrencias colapsadas. >= 1. */
  readonly weight: number;
  /** Qué etapa la aceptó. Ausente sólo en `contains`. */
  readonly resolvedBy?: ResolutionStageId;
  /**
   * NUEVO, CONTRATO-F8G.md §1.2. OR de bits `EDGE_ROLE_*` — los roles
   * sintácticos con que este par `(from,to)` se usa. Presente SÓLO en
   * aristas nacidas de una `ReferenceFacts` real (`kind: "references" |
   * "calls"`); AUSENTE en `contains`/`imports`/`satisfies`/las 5 tipadas
   * (su rol lo fabrica `build.ts`, sería un artefacto, no una medición) y
   * AUSENTE también en `references`/`calls` hasta que F3 empiece a
   * escribirlo — nunca `0` por defecto: una arista sin evidencia de rol no
   * declara una máscara vacía, no tiene el campo.
   */
  readonly roles?: number;
  /**
   * NUEVO, CONTRATO-F9.md §4.2. SÓLO presente cuando `provenance ===
   * "ambiguous"` — AUSENTE en toda arista no ambigua, nunca `[]`: la
   * ausencia del campo es la señal de "esto no es ambiguo", no un array
   * vacío que un consumidor pueda confundir con "ambigua sin alternativas".
   * Los OTROS destinos posibles (sin incluir el de `to`), ids de nodo, en
   * orden lexicográfico. Longitud 1..`AMBIGUOUS_MAX_TARGETS - 1`
   * (`graph/stages.ts`) — un candidato que sobrevive con más destinos que el
   * tope no se emite como arista en absoluto (ver `graph/stages.ts`'s
   * docstring de la constante).
   */
  readonly alternatives?: readonly string[];
  /**
   * NUEVO, Ola P (P2) — LA ARIDAD POR SITIO DE LLAMADA, pedida por N6 en la
   * Ola O y abierta desde entonces. `CodeGraphNode.arity` es la aridad
   * DECLARADA del símbolo (cuántos parámetros escribió quien lo definió);
   * esto es la otra mitad, la que ninguna arista llevaba: **cuántos
   * argumentos pasó cada sitio de uso** que produjo esta arista.
   *
   * Los conteos DISTINTOS observados, ascendentes, sin repetir — no un solo
   * número: una arista colapsa todos los sitios de un mismo contenedor hacia
   * un mismo destino (`weight`), y esos sitios pueden pasar 1, 2 o 3
   * argumentos al mismo callee (opcionales, sobrecarga, `*args`). Un solo
   * número obligaría a elegir cuál, y elegir sería inventar. Con el conjunto,
   * un consumidor pregunta lo que necesita sin ambigüedad: `max` responde
   * "¿algún llamador llega hasta el parámetro N?" (`unused-variable`), `min`
   * responde "¿alguien lo llama con menos?" y el largo responde "¿los
   * llamadores están de acuerdo?".
   *
   * AUSENTE ≠ cero argumentos: ausente es "ningún sitio de uso de esta arista
   * expuso una lista de argumentos" — o porque no es una llamada (una
   * referencia a un valor, un `extends`), o porque la gramática no resolvió
   * campo `arguments`/`argument_list` ahí (misma señal, y misma brecha
   * declarada, que `ReferenceFacts.isCallee`; Ruby `arr.each { |x| x }` es el
   * caso nombrado). Una llamada SIN argumentos (`foo()`) sí expone una lista
   * vacía y aporta el `0`. Presente sólo en `references`/`calls`.
   */
  readonly callArities?: readonly number[];
}

export interface CodeGraph {
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
  /** Va a pantalla. CONTRATO-F3.md §3.4. */
  readonly resolution: ResolutionStats;
}

/* ── Identidad de nodo — CONTRATO-F3.md §3.2 ──────────────────────────────
 *
 * Mismo formato que `serializeAnchor` de `detect/ids.ts`
 * (`${file}#${symbolPath.join(".")}`), a propósito: un hallazgo del grafo y
 * un hallazgo de un detector anclan al mismo lugar sin traductor.
 *
 * Colisión de dos símbolos homónimos hermanos (mismo `file` + mismo
 * `symbolPath` completo): el contrato pide desempatar con `@n` por orden de
 * aparición, igual que `Anchor.ordinal` — pero `SymbolRef` (`graph/stages.ts`)
 * NO carga un ordinal (es sólo `{file, symbolPath}`), así que la cascada de
 * resolución no puede distinguir CUÁL de los dos hermanos homónimos es el
 * destino real de una referencia — la misma limitación, declarada, que
 * `Anchor.ordinal` ya tiene cuando el nombre solo no alcanza. Por eso estas
 * tres funciones son la ÚNICA fuente de verdad para un id de nodo, usadas
 * tanto por `graph/build.ts` (arma la lista de `nodes`, donde SÍ hace falta
 * que cada id sea único — ahí es donde `@n` se aplica a los duplicados,
 * dejando el PRIMERO en orden de aparición sin sufijo) como por
 * `graph/resolve.ts` (arma las aristas `to`, que SIEMPRE apuntan al id SIN
 * sufijo — el "canónico" — porque `SymbolRef` no puede pedir uno con sufijo).
 */
export function folderNodeId(folder: string): string {
  return `folder:${folder}`;
}

export function fileNodeId(file: string): string {
  return `file:${file}`;
}

/** El id canónico (sin `@n`) de un símbolo — lo que toda arista `to`/`from` usa. */
export function symbolNodeId(file: string, symbolPath: readonly string[]): string {
  return symbolPath.length === 0 ? fileNodeId(file) : `sym:${file}#${symbolPath.join(".")}`;
}

/**
 * CONTRATO-F9.md §2.3 — LA ÚNICA función de traducción `Anchor` → nodo de
 * grafo de toda la ola. `symbolNodeId(file, symbolPath)` ya es exactamente
 * `serializeAnchor` (`detect/ids.ts`) menos el sufijo `@n` — a propósito
 * desde F3, y esto es lo que se cobra: el nodo al que ancla una `Anchor`.
 * Descarta `ordinal`: el grafo no distingue hermanos homónimos (misma
 * limitación ya declarada arriba para `SymbolRef`). Nunca lanza — un
 * `symbolPath` vacío cae a `fileNodeId`, igual que `symbolNodeId`.
 */
export function anchorNodeId(a: Anchor): string {
  return symbolNodeId(a.file, a.symbolPath);
}

/**
 * CONTRATO-F9.md §3.2. Id de un nodo `carrier` — mismo formato que
 * `serializeAnchor`, con el prefijo `carrier:` en vez de nada. `ordinal` es
 * la posición del sitio portador dentro de su símbolo contenedor, en orden
 * sintáctico (lo asigna quien construya el nodo — F3/`portador.ts` — no esta
 * función). Sólo se usa cuando la gramática NO nombra el portador (elemento
 * de array, entrada de mapa, argumento posicional); si lo nombra, el
 * portador ES el nodo `symbol` que ya existe vía `symbolNodeId`, y este
 * constructor no se usa.
 */
export function carrierNodeId(file: string, symbolPath: readonly string[], ordinal: number): string {
  return `carrier:${file}#${symbolPath.join(".")}@${ordinal}`;
}

/**
 * CONTRATO-F9.md §4.5 — la regla de seguridad no negociable: las aristas
 * `ambiguous` quedan FUERA de toda consulta por defecto. Un consumidor que
 * las quiera las pide explícitamente llamando a esta función él mismo (ver
 * `graph/metrics/projection.ts`, que la usa para excluirlas de toda
 * proyección, y `graph/neighborhood.ts`, que excluye su contribución de
 * `Ego.degreeIn`/`degreeOut` aunque `Ego.edges` — el crudo — SÍ las incluya).
 */
export function edgeIsAmbiguous(e: CodeGraphEdge): boolean {
  return e.provenance === "ambiguous";
}
