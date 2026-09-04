/**
 * *** CORREGIDO (Ola V, frente V3) ***. Medido por primera vez contra
 * población real en la Ola U: 28 hipótesis, las 28 `ausente` (recomendación
 * real), **0 % de precisión (n=8, Wilson [0 %, 32 %])** — CERO verdaderas. El
 * ancla (`duplication`) mide 66 % de precisión: el ancla acierta, la
 * hipótesis no. El plan (§11) daba el bug mayor por resuelto ("el falso
 * mayor en C# ya se arregló... gap residual menor") — la medición real dice
 * que el gap residual es TODO el volumen.
 *
 * LA CAUSA, verificada corriendo el analizador real contra
 * `guava/android/guava/src/com/google/common/primitives/Floats.java:209`
 * (`falso`: "Floats.min/max recorren un float[] con índice... el recorrido
 * no expone ninguna colección propia del tipo") y
 * `ck-analyzer/.../graph/edges/herencia.ts:166` (`problema-si-patrón-no`: un
 * helper de diffing que compara DOS secuencias, sobre un array `readonly`
 * público ya iterable nativamente): el `required` (`hasManualCursorIndexing`)
 * es puramente SINTÁCTICO — un cursor `i++`/`i+=1` indexando `algo[i]`, sin
 * importar QUIÉN es "algo". Cuando no hay evidencia de protocolo
 * FORMALIZADO (`classifyStructure` devolvía `"none"`), `appliedState`
 * asumía por defecto que la recomendación correcta era `ausente`
 * ("introducir Iterator") — pero "sin evidencia de que YA esté aplicado" no
 * es lo mismo que "el tipo tiene una representación interna que ocultar". En
 * `Floats.min(float... array)`, `array` es un PARÁMETRO de un método
 * ESTÁTICO: la colección no es un campo de `Floats` que el tipo deba
 * encapsular, es un dato que el LLAMADOR ya posee — no hay "representación
 * interna" de nada. La intención del patrón (Iterator oculta la
 * representación interna DE UN TIPO) nunca se verificaba antes de recomendar.
 *
 * EL ARREGLO: nuevo `StructuralKind = "not-applicable"` en
 * `classifyStructure` — cuando la clase existe Y el miembro que contiene el
 * recorrido manual (`traversalMemberName`) SÍ está registrado en el grafo
 * como miembro propio pero con aridad `> 0` (toma parámetros: la colección
 * la entrega el llamador, no es un campo propio), la copia queda
 * DESCALIFICADA — nunca cuenta para `ausente`. Nuevo `required`
 * (`notAllCopiesDisqualified`): si TODAS las copias confirmadas quedan
 * descalificadas así, `build()` devuelve `null` (ni siquiera candidata) en
 * vez de recomendar Iterator sobre un parámetro. Deliberadamente CONSERVADOR:
 * sólo descalifica con evidencia POSITIVA (miembro encontrado con aridad
 * `> 0`); si el miembro no se ubica en absoluto (dato AUSENTE, no negativo),
 * sigue cayendo en `"none"` como antes — no se toca el camino
 * `className === null` (closures/Vue, ver "CON QUÉ SE CONFUNDE" más abajo),
 * que ya tenía un caso canónico real (`vue.vue`) respaldando el default
 * conservador vigente.
 *
 * ── LO ANTERIOR (esta tarea previa), SIN CAMBIOS DE FONDO ──────────────────
 * *** CORREGIDO (esta tarea) — "protocolo formalizado" pasó a exigir que el
 * miembro de aridad 0 que se cruza contra una interfaz de ≥2 implementadores
 * sea, PUNTUALMENTE, el mismo miembro (`CloneCandidate.functionName`) que
 * contiene el recorrido manual duplicado — antes se aceptaba CUALQUIER
 * miembro propio de aridad 0 de la clase, sin relación con el recorrido que
 * disparó el ancla. Medido: 6 hipótesis Iterator falsas en newtonsoft-json
 * (`JsonTextReader.HasLineInfo`, interfaz `IJsonLineInfo` — información de
 * línea, no iteración) pasaban por "protocolo confirmado" por pura
 * coincidencia de que la clase implementa esa interfaz por otro motivo. Ver
 * "LA CONEXIÓN QUE FALTABA" en `findTraversalMember` más abajo para el
 * detalle, y `TABLA-ARISTAS.md` §6 / `RAICES.md` §⇢PENDIENTES 1 para la
 * medición original. ***
 *
 * Iterator — Ola 10, CONTRATO-F10.md §2/§3: las TRES FORMAS de un patrón
 * como hechos de grafo, no como vocabulario. Migra el excluder de
 * `ITERATOR_PROTOCOL_MEMBER_NAME` (lista fija next/hasNext/each/__iter__/
 * __next__/Next, leída contra `RepoUnit.functions` — SIEMPRE `[]` en
 * producción, ver abajo) a los hechos estructurales que el grafo sí tiene
 * hoy: `implements`/`satisfies`, `memberSignatures` con aridad, y
 * `references(role receiver-member)`. El `required`/ancla (`duplication`/
 * `distributed-duplication`, texto de `CloneCandidate.normalized`) NO
 * cambia — sigue siendo la re-lectura de una duplicación real, declarada
 * insuficiente por sí sola (ver la nota "ancla propia: no" de la tarea; el
 * detector genuinamente independiente — colección expuesta con fan-in
 * `references(receiver-member)` ≥3 desde archivos distintos — es un
 * detector NUEVO, fuera de este alcance).
 *
 * ─── LAS TRES FORMAS (CONTRATO-F10.md, tarea Iterator) ─────────────────────
 * COMPLETA (⇒ `ya-aplicado`, NUNCA sugiere): `T` declara, en el MISMO
 * miembro que contiene el recorrido manual duplicado (`CloneCandidate.
 * functionName` — no un miembro cualquiera de `T`, ver "*** CORREGIDO ***"
 * arriba), un método function-like de aridad 0 (`memberSignatures`) que
 * pertenece a una interfaz `I` con ≥2 `implements|satisfies` ENTRANTES (T
 * más al menos otro implementador real) cuyos miembros comunes
 * (`memberSignatures(I)`) también tienen aridad 0 — el protocolo está
 * FORMALIZADO para ESE recorrido puntual, no es un nombre conocido adivinado
 * por vocabulario. Y ningún cliente EXTERNO tiene
 * `references(role receiver-member)` hacia el miembro-colección de `T`
 * (`family: "other"`) — el recorrido queda encapsulado.
 * PARCIAL (⇒ `parcial`, SÍ sugiere: cerrar la fuga): el protocolo está
 * formalizado (mismo hecho que COMPLETA) pero la colección SÍ tiene
 * `references(role receiver-member)` desde algún cliente externo — fuga de
 * encapsulación.
 * AUSENTE (⇒ `ausente`, SÍ sugiere): sin evidencia de protocolo formalizado
 * en el grafo (sin clase, sin interfaz con ≥2 implementadores, sin miembro
 * de aridad 0 en común) — el `required` de abajo (cursor propio duplicado)
 * ya detectó el olor; sin más, se sugiere introducir Iterator.
 * `aplicado-eludido` (COMPLETA + puenteado) NUNCA se produce acá — ver "con
 * qué se confunde" (1), sin cambios respecto de la versión anterior.
 *
 * ─── POR QUÉ ESTO ES UN REEMPLAZO REAL, NO SÓLO OTRO NOMBRE ────────────────
 * La versión anterior leía `ctx.repo.functions`, que `code-analyzer.ts`
 * arma LITERALMENTE `[]` siempre ("ningún detector inter-file de hoy lee
 * repo.functions") — el excluder NUNCA tenía evidencia real en producción,
 * sólo en el test sintético. `ctx.repo.graph`, en cambio, SÍ es el grafo
 * real en la llamada de producción de esta hipótesis: `code-analyzer.ts`
 * nombra explícitamente a `iterator` (junto a `abstract-factory`/
 * `composite`/`singleton`/`template-method`) como una de las hipótesis
 * `inter-file` que "necesitan `repo.graph` real" en su `attachHypotheses`
 * dentro de `crossAnalyze` — este archivo ahora aprovecha eso por primera
 * vez.
 *
 * ─── LA BRECHA QUE QUEDA, DECLARADA (no escondida) ─────────────────────────
 * El miembro-colección de `T` (family `"other"`) sólo existe como NODO
 * propio del grafo cuando la gramática lo declara con un tipo de nodo que
 * `graph/symbols.ts#BINDING_DECLARATOR_TYPES` reconoce (`variable_declarator`/
 * `assignment`/`var_spec`/`const_spec`/`type_spec`) Y su scope inmediato NO
 * es function-like — es decir, sólo bindings a nivel de CLASE/MÓDULO, nunca
 * un campo asignado dentro del constructor (`this.numbers = numbers;` en el
 * `constructor`/`initialize`/`__init__` — el idiom MÁS COMÚN de inicializar
 * un campo en 6 de los 9 lenguajes soportados, verificado leyendo
 * `graph/symbols.ts#extractSymbols`: la asignación vive DENTRO de un nodo
 * function-like, así que `isLocal` la excluye a propósito). Ni un campo de
 * struct de Go (`numbers []int` dentro de `type X struct {}`) ni un
 * `property_declaration` de C# (`declared GAP #3` del propio
 * `graph/symbols.ts`) producen ese nodo tampoco. Consecuencia medida en el
 * diseño de este archivo, no adivinada: cuando el nodo de campo NO existe,
 * "ningún cliente tiene `references(receiver-member)` hacia él" es
 * TÉCNICAMENTE cierto (no hay nada que referenciar) pero NO VERIFICABLE como
 * encapsulación real — este módulo elige, a propósito (ver la Regla 1 de la
 * tarea: "COMPLETA nunca sugiere" pesa más que la duda sobre un campo que
 * el grafo no puede ver todavía), tratar "protocolo formalizado + campo sin
 * nodo propio" como `ya-aplicado` con la brecha citada en el `why`, en vez
 * de negarse a decidir. Cuando el nodo SÍ existe, la fuga (o su ausencia) se
 * verifica de verdad, sin adivinar.
 *
 * `viaSatisfies` (CONTRATO-F10.md §3, nota 2 / PENDIENTES.md A9): declarado
 * en el `why` cuando el protocolo se resolvió por `satisfies` (estructural)
 * en vez de `implements` (declarado) — el umbral de `satisfies` en C# nunca
 * se verificó contra newtonsoft-json (2.961 aristas, 15,6% del grafo).
 *
 * ─── CEILING: sigue "media", nunca "alta" ──────────────────────────────────
 * Dos motivos que se suman, ninguno resuelto por esta migración: (a) el
 * riesgo `satisfies`/A9 recién citado, (b) la brecha del campo sin nodo
 * propio (arriba) hace que, en la práctica, la rama "encapsulación
 * verificada de verdad" sea la MENOS común de las tres ramas de COMPLETA —
 * la mayoría de los casos reales caen en "sin nodo de campo, asumido".
 *
 * ─── CON QUÉ SE CONFUNDE (sin cambios respecto de la versión anterior) ─────
 * (1) Un Iterator YA aplicado cuyo cursor vive en una clase iteradora
 * APARTE de la que tiene el campo agregado: `aplicado-eludido` seguiría sin
 * producirse acá — necesitaría la Forma 4 de `invocacion-indirecta.ts`
 * (nodo de iteración + portador invocado adentro), declarada no disponible
 * en CONTRATO-F10.md para esta tarea. (2) Composite (recorrido de
 * ESTRUCTURA ANIDADA en vez de una colección PLANA): el `required` de acá
 * (texto) no distingue `this.items[i]` de `this.children[i]` con la misma
 * forma recursiva. `toConfirm` lo dice.
 */
import type { CloneCandidate, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import {
  EXPOSED_CONTAINER_TRAVERSAL_KIND,
  MIN_CLIENT_FILES,
  exposedContainerCandidatesOf,
  halfDoorMembersOf,
  type ExposedContainerCandidate,
} from "../detect/intra-file/exposed-container-traversal.js";
import { edgeHasRole, memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex, type MemberSignature } from "../graph/types.js";
import { build as engineBuild, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * El `required`: cursor propio (`i++`/`i += 1`/`i = i + 1`) indexando ALGUNA
 * expresión entre corchetes con ESE MISMO nombre — sintaxis de operador,
 * genérica entre los 9 lenguajes, sin lista de nombres de campo. Sin
 * cambios de fondo respecto de la versión anterior, salvo DOS ajustes:
 * (a) `indexed` ahora acepta el incremento DENTRO de los corchetes
 * (`numbers[i++]`, el idiom real de TS/JS/Go/Vue en el corpus canónico —
 * verificado: la versión anterior sólo reconocía `numbers[i]` con el
 * incremento en una sentencia APARTE, y por eso nunca reconocía el cuerpo
 * real `return this.numbers[this.i++];` de las fixtures canónicas de
 * Iterator); (b) captura el identificador INMEDIATAMENTE anterior al `[`
 * (`collectionName`) — el último segmento del miembro-colección, el mismo
 * formato que `MemberSignature.name`/el último segmento de `symbolPath`, así
 * que se puede buscar directo como nodo del grafo (family `"other"`).
 * ──────────────────────────────────────────────────────────────────────── */
const CURSOR_INCREMENT = /\b([A-Za-z_]\w*)\s*(?:\+\+|\+=\s*1\b)|\b([A-Za-z_]\w*)\s*=\s*\2\s*\+\s*1\b/g;

function hasManualCursorIndexing(bodyText: string): { holds: boolean; cursorVar?: string; collectionName?: string | null } {
  CURSOR_INCREMENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CURSOR_INCREMENT.exec(bodyText))) {
    const cursorVar = m[1] ?? m[2];
    if (!cursorVar) continue;
    // `<colección>[<qualifier.>?cursorVar<++ / += 1 opcional>]` — la
    // colección es el identificador bare INMEDIATAMENTE antes del `[`
    // (nunca `this`/`self`/el receptor: esos quedan afuera por el propio
    // patrón, que exige que no haya un `.` entre el nombre capturado y el
    // `[`). El incremento opcional DENTRO de los corchetes cubre
    // `numbers[i++]`; sin él, `numbers[i]` (incremento en otra sentencia)
    // sigue matcheando igual que antes.
    const indexed = new RegExp(`([A-Za-z_]\\w*)\\s*\\[\\s*(?:[\\w.]*\\.)?\\b${cursorVar}\\b(?:\\+\\+|\\s*\\+=\\s*1\\b)?\\s*\\]`);
    const hit = indexed.exec(bodyText);
    if (hit) return { holds: true, cursorVar, collectionName: hit[1] ?? null };
  }
  return { holds: false };
}

/* ────────────────────────────────────────────────────────────────────────
 * Los hechos estructurales — un índice liviano sobre `ctx.repo.graph`,
 * construido UNA vez por `build()` (nunca recalculado por copia
 * duplicada). Mismo estilo que `wrapping-chain.ts#buildIndex`: nodos por id
 * y por archivo, aristas por `from` Y por `to` (acá sí hace falta el
 * fan-in, a diferencia de `wrapping-chain.ts`) sobre `confidentEdges`
 * (CONTRATO-F9.md §4.5: las aristas `ambiguous` quedan afuera de toda
 * consulta por defecto).
 * ──────────────────────────────────────────────────────────────────────── */
interface GraphFacts {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly nodesByFile: ReadonlyMap<string, readonly CodeGraphNode[]>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

/** OLA V (integrador) — cacheado por identidad de `CodeGraph`, el mismo idiom
 *  que `builder.ts#GRAPH_INDEX_CACHE` y `facade.ts#VIEW_CACHE`.
 *  *Intención del caché:* estos índices son una propiedad **DEL GRAFO**, no del
 *  hallazgo que pregunta. *Por qué hizo falta:* con el grafo cableado a las
 *  hipótesis (Ola V, V1), `build()` de este patrón lo rehacía una vez por
 *  hallazgo-ancla — O(nodos+aristas) del repo entero cada vez. Medido con
 *  `node --cpu-prof` sobre `corpus/hugo`: **3,9 s de 101 s**. */
const FACTS_CACHE = new WeakMap<CodeGraph, GraphFacts>();

function buildGraphFacts(graph: CodeGraph): GraphFacts {
  const cached = FACTS_CACHE.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, CodeGraphNode>();
  const nodesByFile = new Map<string, CodeGraphNode[]>();
  for (const n of graph.nodes) {
    if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    const list = nodesByFile.get(n.file);
    if (list) list.push(n);
    else nodesByFile.set(n.file, [n]);
  }
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const fl = edgesFrom.get(e.from);
    if (fl) fl.push(e);
    else edgesFrom.set(e.from, [e]);
    const tl = edgesTo.get(e.to);
    if (tl) tl.push(e);
    else edgesTo.set(e.to, [e]);
  }
  const facts: GraphFacts = { nodeById, nodesByFile, edgesFrom, edgesTo };
  FACTS_CACHE.set(graph, facts);
  return facts;
}

/** `GraphIndex` mínimo que `memberSignatures` necesita, sobre `GraphFacts`. */
function asGraphIndex(facts: GraphFacts): GraphIndex {
  return { nodeById: (id) => facts.nodeById.get(id) ?? null, edgesFrom: (id) => facts.edgesFrom.get(id) ?? [] };
}

/** El nodo `class-like`/`namespace-like` de `className` en `file` — búsqueda acotada a los nodos de ESE archivo, no de todo el grafo. */
function findClassNode(facts: GraphFacts, file: string, className: string): CodeGraphNode | null {
  for (const node of facts.nodesByFile.get(file) ?? []) {
    if (node.kind !== "symbol") continue;
    if (node.family !== "class-like" && node.family !== "namespace-like") continue;
    if (node.symbolPath[node.symbolPath.length - 1] === className) return node;
  }
  return null;
}

function classInterfaceEdges(facts: GraphFacts, classId: string): readonly { interfaceId: string; viaSatisfies: boolean }[] {
  const out: { interfaceId: string; viaSatisfies: boolean }[] = [];
  for (const e of facts.edgesFrom.get(classId) ?? []) {
    if (e.kind === "implements" || e.kind === "satisfies") out.push({ interfaceId: e.to, viaSatisfies: e.kind === "satisfies" });
  }
  return out;
}

/** Ids DISTINTOS que `implements|satisfies` hacia `interfaceId` — el fan-in que decide "¿hay ≥2 implementadores reales?". */
function implementerIds(facts: GraphFacts, interfaceId: string): ReadonlySet<string> {
  const froms = new Set<string>();
  for (const e of facts.edgesTo.get(interfaceId) ?? []) {
    if (e.kind === "implements" || e.kind === "satisfies") froms.add(e.from);
  }
  return froms;
}

function zeroArityMemberNames(gi: GraphIndex, ownerId: string): ReadonlySet<string> {
  return new Set(memberSignatures(gi, ownerId).filter((m) => m.arity === 0).map((m) => m.name));
}

interface TraversalMemberEvidence {
  readonly memberName: string;
  readonly interfaceId: string;
  readonly implementerCount: number;
  readonly viaSatisfies: boolean;
}

/**
 * El reemplazo estructural de `ITERATOR_PROTOCOL_NAME` (CONTRATO-F10.md
 * §3): `classId` declara, en el miembro EXACTO que contiene el recorrido
 * manual detectado (`traversalMemberName`, ver abajo), un método propio de
 * aridad 0 que ADEMÁS pertenece a una interfaz con ≥2 implementadores
 * (`classId` más al menos otro real) cuyos miembros comunes también son de
 * aridad 0 — el protocolo de iteración está FORMALIZADO por el grafo, sin
 * mirar ningún nombre de dominio. `null` ⇒ sin evidencia (sin interfaz
 * calificada, o ninguna coincide con ESE miembro).
 *
 * LA CONEXIÓN QUE FALTABA (bug de implementación, medido en
 * `TABLA-ARISTAS.md` §6 / `RAICES.md` §⇢PENDIENTES 1): la versión anterior
 * buscaba CUALQUIER miembro propio de aridad 0 de `classId` que coincidiera
 * con CUALQUIER interfaz de ≥2 implementadores — sin relación alguna con el
 * recorrido manual (`i++`/indexado) que el `required` de este archivo ya
 * detectó. Caso real, verificado abriendo el código: newtonsoft-json,
 * `JsonTextReader` — el `required` encuentra el cursor manual duplicado en
 * (por ejemplo) su lectura de buffer interno, pero el criterio anterior
 * reportaba «protocolo confirmado: JsonTextReader.HasLineInfo pertenece a
 * una interfaz con 4 implementadores» — `HasLineInfo()` es
 * `IJsonLineInfo.HasLineInfo()`, una interfaz de INFORMACIÓN DE LÍNEA (`bool
 * HasLineInfo(); int LineNumber { get; } int LinePosition { get; }`, ver
 * `Src/Newtonsoft.Json/IJsonLineInfo.cs`), CERO relación con iteración —
 * `JsonTextReader` sólo la implementa POR OTRO MOTIVO, y el criterio viejo
 * no tenía forma de distinguir "esta interfaz formaliza EL MISMO recorrido
 * que disparó el ancla" de "esta clase implementa, de pura casualidad,
 * alguna interfaz cualquiera con un getter booleano de aridad 0". 6 casos
 * así en newtonsoft-json, los 6 con la misma forma de coincidencia espuria.
 *
 * EL ARREGLO: restringir la búsqueda al miembro cuyo NOMBRE es
 * `traversalMemberName` — `CloneCandidate.functionName`, la función
 * encerrante real del fragmento duplicado que `hasManualCursorIndexing` ya
 * confirmó como recorrido manual (mismo dato, no una heurística nueva). Un
 * protocolo de iteración real tiene forma reconocible: avanzar-y-obtener (un
 * método que hace las dos cosas) o devolver algo recorrible — nunca "un
 * método sin argumentos" a secas; exigir que sea EL MISMO método que el
 * cursor manual implementa es la forma más barata de acercarse a esa forma
 * sin inventar vocabulario de nombres de protocolo (`next`/`hasNext`/etc.,
 * prohibido por CONTRATO-F10.md §3). `traversalMemberName === null`
 * (`CloneCandidate.functionName` ausente — código no encerrado por ninguna
 * función reconocida) ⇒ sin conexión verificable, sin evidencia: `null`.
 */
function findTraversalMember(facts: GraphFacts, classId: string, traversalMemberName: string | null): TraversalMemberEvidence | null {
  if (traversalMemberName === null) return null;
  const gi = asGraphIndex(facts);
  const ownMember = ownZeroArityMember(gi, classId, traversalMemberName);
  if (!ownMember) return null; // el miembro que contiene el cursor manual no es, él mismo, un método propio de aridad 0 — nada que conectar con un protocolo.
  for (const { interfaceId, viaSatisfies } of classInterfaceEdges(facts, classId)) {
    const implementers = implementerIds(facts, interfaceId);
    if (implementers.size < 2) continue; // T solo no alcanza — hace falta OTRO implementador real (CONTRATO-F10.md §0.4, el mismo criterio que la terna de envoltura).
    const ifaceZeroArity = zeroArityMemberNames(gi, interfaceId);
    if (ifaceZeroArity.has(ownMember.name)) {
      return { memberName: ownMember.name, interfaceId, implementerCount: implementers.size, viaSatisfies };
    }
  }
  return null;
}

/** El miembro PROPIO de `classId` llamado `name`, sólo si su aridad es EXACTAMENTE 0 — helper compartido entre `findTraversalMember` (interfaz) y `classifyStructure` (descalificación, Ola V). `name === null` ⇒ `undefined` (nada que buscar). */
function ownZeroArityMember(gi: GraphIndex, classId: string, name: string | null): MemberSignature | undefined {
  if (name === null) return undefined;
  return memberSignatures(gi, classId).find((m) => m.name === name && m.arity === 0);
}

/** El miembro PROPIO de `classId` llamado `name`, CUALQUIER aridad — a diferencia de `ownZeroArityMember`, no filtra por aridad: existe para poder DISTINGUIR "el miembro no está registrado en absoluto" (dato AUSENTE) de "el miembro está registrado pero toma parámetros" (evidencia POSITIVA de que NO es un recorrido interno auto-contenido). Ver "not-applicable" en `classifyStructure`. */
function ownMemberAnyArity(gi: GraphIndex, classId: string, name: string): MemberSignature | undefined {
  return memberSignatures(gi, classId).find((m) => m.name === name);
}

/** El miembro-colección de `classId` (family `"other"`) cuyo último segmento de `symbolPath` es `fieldName` — `null` si el campo no tiene nodo propio (ver la brecha declarada en el docstring del módulo). */
function findFieldNode(facts: GraphFacts, classId: string, fieldName: string): CodeGraphNode | null {
  for (const e of facts.edgesFrom.get(classId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = facts.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "other" && target.symbolPath[target.symbolPath.length - 1] === fieldName) {
      return target;
    }
  }
  return null;
}

/** Archivos DISTINTOS con `references(role receiver-member)` hacia `fieldNode`, EXCLUYENDO el auto-acceso de `ownerClassId` (sus propios miembros — `this.items` dentro de un método de la propia clase no es un "cliente"). */
function externalReferencingFiles(facts: GraphFacts, fieldNode: CodeGraphNode, ownerClassId: string): ReadonlySet<string> {
  const ownerNode = facts.nodeById.get(ownerClassId);
  const ownerPath = ownerNode?.symbolPath ?? [];
  const files = new Set<string>();
  for (const e of facts.edgesTo.get(fieldNode.id) ?? []) {
    if (e.kind !== "references" || !edgeHasRole(e, "receiver-member")) continue;
    const fromNode = facts.nodeById.get(e.from);
    if (!fromNode) continue;
    const isOwnMember =
      ownerNode !== undefined && fromNode.file === ownerNode.file && ownerPath.length > 0 && ownerPath.every((seg, i) => fromNode.symbolPath[i] === seg);
    if (isOwnMember) continue;
    files.add(fromNode.file);
  }
  return files;
}

/**
 * `"not-applicable"` — Ola V, NUEVO. Evidencia POSITIVA de que la intención
 * del patrón no aplica a ESTA copia: no es "protocolo no confirmado
 * todavía" (`"none"`, sigue habilitando `ausente`), es "no hay
 * representación interna que un tipo pueda ocultar acá, así que recomendar
 * Iterator no tiene sentido estructural" — ver docstring del módulo,
 * "*** CORREGIDO (Ola V) ***". Nunca cuenta para `complete`/`partial`/
 * `ausente`; si TODAS las copias caen acá, `notAllCopiesDisqualified`
 * (`required`) hace que `build()` devuelva `null`.
 */
type StructuralKind = "complete" | "partial" | "none" | "not-applicable";
interface StructuralEvidence {
  readonly kind: StructuralKind;
  readonly why: string;
}

/**
 * Clasifica UNA copia (una clase `className` en `file`, con
 * `traversalMemberName` = el nombre del método que de verdad contiene el
 * recorrido manual duplicado — `CloneCandidate.functionName` — y
 * `collectionName` extraído del texto del clon) contra las CUATRO formas —
 * `"none"` ⇒ sin evidencia, dato AUSENTE (mismo default seguro que la
 * versión anterior con `repo.functions` vacío: sigue habilitando `ausente`),
 * `"not-applicable"` ⇒ evidencia POSITIVA de que Iterator no aplica acá
 * (Ola V, ver docstring del módulo), `"complete"`/`"partial"` ⇒ protocolo
 * formalizado, encapsulado o con fuga respectivamente. Ver el docstring del
 * módulo para la brecha declarada del campo sin nodo propio y para "LA
 * CONEXIÓN QUE FALTABA" (por qué `traversalMemberName` conecta el protocolo
 * al MISMO recorrido que disparó el ancla, no a cualquier miembro de la
 * clase).
 */
function classifyStructure(
  facts: GraphFacts | null,
  file: string,
  className: string | null,
  traversalMemberName: string | null,
  collectionName: string | null,
): StructuralEvidence {
  if (!facts) return { kind: "none", why: "sin grafo del repo en esta corrida (ctx.repo.graph es null): no hay hechos estructurales que consultar." };
  if (!className) {
    return { kind: "none", why: "el clon no tiene className (estilo funcional/receptor sin clase, o el nodo de clase no quedó anidado léxicamente) — sin clase que buscar en el grafo." };
  }
  const classNode = findClassNode(facts, file, className);
  if (!classNode) return { kind: "none", why: `no se encontró un nodo de clase/namespace "${className}" en el grafo de "${file}".` };

  /*
   * INTENCIÓN QUE VERIFICA ESTE CHEQUEO (Ola V): Iterator existe para
   * ocultar la REPRESENTACIÓN INTERNA DE UN TIPO — el recorrido manual
   * tiene que vivir en un miembro PROPIO de ESE tipo que NO reciba la
   * colección como parámetro. Si el miembro que contiene el cursor manual
   * SÍ está registrado en el grafo con aridad `> 0`, lo que se recorre es
   * un dato que el LLAMADOR ya posee (un parámetro de función) — no un
   * campo del tipo — así que no hay nada que el tipo deba encapsular:
   * "introducí un Iterator acá" no tiene sentido estructural. Medido:
   * `guava/.../Floats.java:211` (`min(float... array)`) — `array` es un
   * parámetro de un método ESTÁTICO, no un campo de `Floats`; ANTES de este
   * chequeo, el resultado caía en `ausente` por defecto. Deliberadamente
   * CONSERVADOR: sólo descalifica con evidencia POSITIVA (`ownMemberAnyArity`
   * encontró el miembro Y su aridad es `> 0`, nunca `null`/desconocida) —
   * si el miembro no está registrado en absoluto, es un dato AUSENTE, no
   * negativo, y sigue cayendo en `"none"` más abajo (ver
   * `findTraversalMember`), igual que antes de esta ola.
   */
  if (traversalMemberName !== null) {
    const gi = asGraphIndex(facts);
    const anyArityMember = ownMemberAnyArity(gi, classNode.id, traversalMemberName);
    if (anyArityMember && anyArityMember.arity !== null && anyArityMember.arity > 0) {
      return {
        kind: "not-applicable",
        why: `"${className}.${traversalMemberName}" (el método que contiene el recorrido manual) toma ${anyArityMember.arity} parámetro(s) — la colección recorrida la entrega el LLAMADOR, no es un campo propio de "${className}": no hay representación interna que Iterator pueda ocultar acá.`,
      };
    }
  }

  const traversal = findTraversalMember(facts, classNode.id, traversalMemberName);
  if (!traversal) {
    return {
      kind: "none",
      why:
        traversalMemberName === null
          ? `no se pudo identificar, a partir del clon, qué método contiene el recorrido manual (CloneCandidate.functionName ausente) — sin saber CUÁL miembro es, no hay forma verificable de conectar un protocolo formalizado con ESTE recorrido en particular.`
          : `"${className}.${traversalMemberName}" (el método que de verdad contiene el recorrido manual detectado) no es, en el grafo, un miembro propio de aridad 0 que además pertenezca a una interfaz con ≥2 implementadores cuyo miembro común de aridad 0 lo incluya — sin protocolo de iteración formalizado para ESE recorrido (otros miembros de "${className}" pueden pertenecer a interfaces sin relación, ver "LA CONEXIÓN QUE FALTABA" en el docstring del módulo).`,
    };
  }
  const satisfiesNote = traversal.viaSatisfies
    ? " (resuelto vía 'satisfies', no 'implements' — riesgo A9 declarado: el umbral de satisfies nunca se verificó contra newtonsoft-json/C#)"
    : "";
  const base = `protocolo confirmado: "${className}.${traversal.memberName}" pertenece a una interfaz con ${traversal.implementerCount} implementadores${satisfiesNote}`;

  if (!collectionName) {
    return { kind: "complete", why: `${base}; no se pudo extraer el nombre de la colección del texto del clon para verificar encapsulación — asumida por falta de evidencia en contra.` };
  }
  const fieldNode = findFieldNode(facts, classNode.id, collectionName);
  if (!fieldNode) {
    return {
      kind: "complete",
      why: `${base}; el campo "${collectionName}" no tiene nodo propio en el grafo (brecha declarada: asignación dentro del constructor, campo de struct de Go, o property_declaration de C# — ninguno capturado por graph/symbols.ts) — encapsulación no verificable, asumida por falta de evidencia en contra.`,
    };
  }
  const externalFiles = externalReferencingFiles(facts, fieldNode, classNode.id);
  if (externalFiles.size === 0) {
    return { kind: "complete", why: `${base}; la colección "${collectionName}" no tiene references(role receiver-member) desde ningún cliente externo — recorrido encapsulado.` };
  }
  const sample = [...externalFiles].slice(0, 3).join(", ");
  return {
    kind: "partial",
    why: `${base}; pero la colección "${collectionName}" tiene references(role receiver-member) desde ${externalFiles.size} archivo(s) externo(s) (${sample}${externalFiles.size > 3 ? ", ..." : ""}) — encapsulación a medias.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * El problema tipado que ve el motor — precomputado UNA vez en `build()`.
 * ──────────────────────────────────────────────────────────────────────── */
interface MatchedCopy {
  location: RoleLocation;
  clone: CloneCandidate;
  cursorVar: string;
  collectionName: string | null;
  structural: StructuralEvidence;
}

interface IteratorProblem {
  finding: Finding;
  totalLocations: number;
  matched: readonly MatchedCopy[];
  crossFile: boolean; // kind === "distributed-duplication"
}

type IteratorGraph = CodeGraph | null;

const hasSomeMatch: Check<IteratorProblem, IteratorGraph> = {
  id: "manual-cursor-traversal-confirmed",
  describe: "Al menos una de las copias duplicadas es un recorrido manual: un cursor propio (i++ / i+=1) indexando alguna estructura (algo[i]).",
  run(problem) {
    if (problem.matched.length > 0) {
      const detail = problem.matched.map((m) => `${m.location.file}:${m.location.startLine} (cursor "${m.cursorVar}")`).join(", ");
      return { holds: true, evidence: `${problem.matched.length}/${problem.totalLocations} copias con cursor propio: ${detail}.` };
    }
    return {
      holds: false,
      evidence: `Ninguna de las ${problem.totalLocations} copias (vía CloneCandidate.normalized) tiene la forma de cursor propio + indexado.`,
    };
  },
};

const atLeastTwoCopies: Check<IteratorProblem, IteratorGraph> = {
  id: "at-least-two-copies",
  describe: "El Finding ancla (duplication/distributed-duplication) ya exige ≥2 copias — se re-confirma acá, no se re-descubre.",
  run(problem) {
    return { holds: problem.totalLocations >= 2, evidence: `${problem.totalLocations} copias en el Finding ancla.` };
  },
};

/**
 * INTENCIÓN QUE VERIFICA ESTE CHEQUEO (required, Ola V): Iterator sólo tiene
 * sentido cuando existe UN TIPO cuya representación interna se pueda ocultar
 * — si TODAS las copias confirmadas quedaron `"not-applicable"` (el miembro
 * que contiene el cursor manual toma la colección como PARÁMETRO, no como
 * campo propio: ver `classifyStructure`), no hay ningún tipo candidato en
 * juego y recomendar "introducí un Iterator" no tiene sentido estructural —
 * distinto de "protocolo no confirmado todavía" (`"none"`), que SÍ sigue
 * habilitando `ausente`. Medido: sin este chequeo,
 * `guava/.../Floats.java:209` (`min`/`max`, arrays recibidos por parámetro)
 * emitía `ausente` — 1 de las 8 muestras juzgadas en la Ola U, `falso`.
 */
const notAllCopiesDisqualified: Check<IteratorProblem, IteratorGraph> = {
  id: "no-todas-las-copias-descalificadas-estructuralmente",
  describe:
    "Si TODAS las copias confirmadas tienen el recorrido manual en un miembro que RECIBE la colección como parámetro (no un campo propio del tipo), no hay ninguna representación interna que ocultar — Iterator no es aplicable, no sólo 'no confirmado todavía'.",
  run(problem) {
    const disqualified = problem.matched.filter((m) => m.structural.kind === "not-applicable");
    const holds = problem.matched.length === 0 || disqualified.length < problem.matched.length;
    return {
      holds,
      evidence: holds
        ? `${problem.matched.length - disqualified.length}/${problem.matched.length} copia(s) confirmada(s) NO descalificada(s) estructuralmente.`
        : `Las ${disqualified.length} copia(s) confirmada(s) tienen el recorrido manual en un miembro que RECIBE la colección como parámetro (no un campo propio) — sin ninguna representación interna que ocultar: ${problem.matched.map((m) => m.structural.why).join(" | ")}`,
    };
  },
};

const ruleOfThreeCopies: Check<IteratorProblem, IteratorGraph> = {
  id: "rule-of-three-copies",
  describe: "≥3 copias del recorrido — 'regla de tres': dos ocurrencias todavía podrían ser coincidencia, tres ya son un patrón repetido.",
  run(problem) {
    return { holds: problem.totalLocations >= 3, evidence: `${problem.totalLocations} copias.` };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Ola 11a (P5, registro de pendientes — "1 de 17 lee ctx.neighborhood") —
 * los dos discriminadores nuevos que consumen el vecindario DIRECTO, sin
 * `refresh()`: el ancla (`duplication`/`distributed-duplication`) es
 * inter-file, así que la ÚNICA llamada de producción a `build()`
 * (hypotheses/run.ts, llamada (2), dentro de `crossAnalyze`) ya recibe
 * `ctx.neighborhood` REAL — no hace falta esperar a una segunda pasada.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `ctx.neighborhood.findingsInFile` — el recorrido manual convive con OTROS
 * hallazgos en el mismo archivo (el bloque ya está señalado por otra razón),
 * lo que el encargo pide para ver "si el recorrido a mano coexiste con otros
 * olores del mismo bloque" — hoy invisible sin vecindario. Nunca decisivo.
 */
function coexistingSmellsCheck(ctx: HypothesisContext): Check<IteratorProblem, IteratorGraph> {
  return {
    id: "coexiste-con-otros-hallazgos-en-el-archivo",
    describe: "ctx.neighborhood.findingsInFile: el recorrido manual convive con otros hallazgos en el mismo archivo (el bloque ya está señalado por otra razón).",
    run(problem) {
      if (problem.matched.length === 0) {
        return { holds: false, evidence: "Ninguna copia con clon resuelto: no hay archivo de referencia para consultar el vecindario." };
      }
      const file = problem.matched[0]!.location.file;
      const peers = ctx.neighborhood.findingsInFile(file);
      return {
        holds: peers.length > 0,
        evidence:
          peers.length > 0
            ? `${peers.length} otro(s) hallazgo(s) en "${file}" visible(s) por ctx.neighborhood.findingsInFile: ${peers
                .slice(0, 3)
                .map((p) => p.kind)
                .join(", ")}${peers.length > 3 ? ", ..." : ""}.`
            : `Ningún otro hallazgo en "${file}" según ctx.neighborhood.findingsInFile — el recorrido manual está aislado en ese archivo.`,
      };
    },
  };
}

/**
 * `ctx.neighborhood.findingsOfKind` — el MISMO recorrido manual (cursor +
 * indexado) aparece en OTRO `Finding` de `duplication`/`distributed-
 * duplication`, no sólo entre las copias de ESTE — la repetición cruzada
 * ENTRE hallazgos (no entre locations de un mismo hallazgo, que
 * `crossFileDiscriminator`/`ruleOfThreeCopies` ya cubren) es, según el
 * encargo, "la señal fuerte de que hace falta un Iterator compartido", y
 * hoy esta hipótesis no la podía ver.
 */
function repeatedAcrossFindingsCheck(ctx: HypothesisContext, repo: RepoUnit): Check<IteratorProblem, IteratorGraph> {
  return {
    id: "mismo-recorrido-en-otro-hallazgo",
    describe: "ctx.neighborhood.findingsOfKind: el mismo recorrido manual (cursor + indexado) aparece en OTRO hallazgo de duplicación, no sólo entre las copias de éste.",
    run(problem) {
      const others = ctx.neighborhood.findingsOfKind(problem.finding.kind);
      for (const other of others) {
        for (const otherLoc of other.locations) {
          const otherClone = findCloneFor(repo, otherLoc);
          if (!otherClone) continue;
          if (hasManualCursorIndexing(otherClone.normalized).holds) {
            return {
              holds: true,
              evidence: `otro hallazgo "${other.id}" (${otherLoc.file}:${otherLoc.startLine}) visible por ctx.neighborhood.findingsOfKind muestra el mismo recorrido manual — repetición cruzada ENTRE hallazgos, no sólo dentro de éste.`,
            };
          }
        }
      }
      return {
        holds: false,
        evidence: `ningún otro hallazgo de kind "${problem.finding.kind}" visible por ctx.neighborhood.findingsOfKind muestra la misma forma de recorrido manual.`,
      };
    },
  };
}

const crossFileDiscriminator: Check<IteratorProblem, IteratorGraph> = {
  id: "cross-file-duplication",
  describe:
    "La duplicación es DISTRIBUIDA (archivos sin conexión de grafo entre sí), no sólo dentro de un archivo — ahí Extract Method local no alcanza, hace falta una abstracción compartida.",
  run(problem) {
    return {
      holds: problem.crossFile,
      evidence: problem.crossFile
        ? "Finding ancla es distributed-duplication: las copias están en archivos sin conexión entre sí."
        : "Finding ancla es duplication (mismo archivo): Extract Method local podría alcanzar sin introducir un Iterator — ver toConfirm.",
    };
  },
};

const identicalTextDiscriminator: Check<IteratorProblem, IteratorGraph> = {
  id: "identical-text-copies",
  describe: "Las copias confirmadas son texto IDÉNTICO (normalized), no sólo misma estructura — evidencia más fuerte de reinvención literal del recorrido.",
  run(problem) {
    if (problem.matched.length < 2) {
      return { holds: false, evidence: "Menos de 2 copias con clon resuelto: no hay con qué comparar texto." };
    }
    const first = problem.matched[0]!.clone.normalized;
    const identical = problem.matched.every((m) => m.clone.normalized === first);
    return {
      holds: identical,
      evidence: identical ? "Las copias confirmadas comparten EXACTAMENTE el mismo texto normalizado." : "Las copias confirmadas difieren en texto (misma estructura, distintos nombres/literales).",
    };
  },
};

/**
 * Excluder — fusiona la evidencia estructural de TODAS las copias
 * confirmadas: ninguna con evidencia ⇒ `ausente` (mismo default seguro que
 * antes); TODAS con evidencia y las TRES formas encapsuladas ⇒
 * `ya-aplicado`; alguna con fuga (o mezcla) ⇒ `parcial`. `aplicado-eludido`
 * no se produce acá — ver docstring del módulo.
 */
function appliedState(problem: IteratorProblem): AppliedStateResult {
  // "not-applicable" (Ola V) NUNCA cuenta como evidencia — ver docstring del
  // módulo y `notAllCopiesDisqualified` (required): si TODAS fueran
  // "not-applicable" no habría llegado hasta acá.
  const withEvidence = problem.matched.filter((m) => m.structural.kind === "complete" || m.structural.kind === "partial");
  if (withEvidence.length === 0) {
    const relevant = problem.matched.find((m) => m.structural.kind !== "not-applicable") ?? problem.matched[0];
    const why = relevant?.structural.why ?? "sin copias con clon resuelto.";
    return {
      state: "ausente",
      checks: [
        {
          label: "protocolo-de-iteración-formalizado",
          passed: false,
          why: `Sin evidencia estructural en ninguna copia confirmada: ${why}`,
          role: "applied",
        },
      ],
    };
  }
  const partial = withEvidence.filter((m) => m.structural.kind === "partial");
  const allEncapsulated = partial.length === 0;
  const detail = withEvidence.map((m) => `${m.location.file}: ${m.structural.why}`).join(" | ");
  const check = {
    label: "protocolo-de-iteración-formalizado",
    passed: true,
    why: allEncapsulated
      ? `${withEvidence.length}/${problem.matched.length} copia(s) con protocolo formalizado y encapsulado: ${detail}`
      : `${partial.length}/${withEvidence.length} copia(s) con protocolo formalizado muestran fuga de encapsulación: ${detail}`,
    role: "applied" as const,
  };
  return allEncapsulated ? { state: "ya-aplicado", checks: [check] } : { state: "parcial", checks: [check] };
}

/**
 * Ola 11a: la especificación era un `const` porque ninguno de sus checks
 * necesitaba `ctx` — los dos discriminadores nuevos de vecindario sí lo
 * necesitan (cierran sobre `ctx.neighborhood`/`repo`), así que pasa a ser
 * una fábrica, mismo patrón que `strategy.ts#buildSpec`/`composite.ts#buildSpec`.
 */
function buildIteratorSpec(ctx: HypothesisContext, repo: RepoUnit): HypothesisSpec<IteratorProblem, IteratorGraph> {
  return {
    pattern: "Iterator",
    // Ver docstring del módulo, "CEILING": el riesgo `satisfies`/A9 y la
    // brecha del campo sin nodo propio (asignación en constructor, struct de
    // Go, property_declaration de C#) siguen sin resolverse ⇒ "media", nunca
    // "alta".
    ceiling: "media",
    needs: [],
    required: [hasSomeMatch, atLeastTwoCopies, notAllCopiesDisqualified],
    discriminators: [
      ruleOfThreeCopies,
      crossFileDiscriminator,
      identicalTextDiscriminator,
      coexistingSmellsCheck(ctx),
      repeatedAcrossFindingsCheck(ctx, repo),
    ],
    appliedState,
    toConfirm: [
      "Confirmar que la colección recorrida es PLANA (una lista/array), no una estructura anidada (árbol, lista de listas) — ese caso es Composite, no Iterator.",
      "Confirmar que el cursor de cada copia recorre la MISMA forma de colección (no dos colecciones distintas que casualmente comparten el modismo de índice).",
      "Si el Finding ancla es 'duplication' (mismo archivo) y no 'distributed-duplication', evaluar si Extract Method local alcanza antes de introducir un Iterator completo.",
      "Si el estado es 'ya-aplicado' pero el `why` cita 'campo sin nodo propio' (brecha declarada, ver docstring): confirmar A MANO que ningún cliente externo accede directo a la colección antes de descartar el refactor — el grafo no pudo verificarlo.",
    ],
    source: "https://refactoring.guru/es/design-patterns/iterator",
  };
}

function findCloneFor(repo: RepoUnit, location: RoleLocation): CloneCandidate | null {
  return (
    repo.clones.find((c) => c.file === location.file && c.startLine === location.startLine && c.endLine === location.endLine) ?? null
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * EL CAMINO DE ENTRADA DEL ANCLA-FUERZA — Ola AE, frente AE9
 *
 * TODO lo que sigue hasta `export const hypothesis` es CÓDIGO NUEVO detrás de
 * `if (problem.kind === EXPOSED_CONTAINER_TRAVERSAL_KIND)`. No toca ni un
 * `required`, ni un discriminador, ni una rama de `appliedState`, ni un umbral
 * del camino viejo (`duplication`/`distributed-duplication`): el array
 * `anchors` SUMA el ancla nueva y conserva las dos viejas. Esta ola es
 * ADITIVA.
 *
 * POR QUÉ EXISTE, con el número que lo motiva (medido por AE9 sobre volcados
 * propios del día, las DOS poblaciones): **las dos anclas viejas producen 14
 * hipótesis en 21 repos —10 en biblioteca, 4 en aplicación—, las 14 `ausente`,
 * con 0 de 10 juzgadas verdaderas en toda la historia del proyecto.** Iterator
 * no tiene la patología de Facade (no poder decir `ausente`): tiene la
 * contraria — sólo dice `ausente`, casi nunca habla, y cuando habla se
 * equivoca. La causa es que su ancla es la DUPLICACIÓN, un síntoma; la fuerza
 * que Iterator resuelve es *la representación interna de un tipo recorrida a
 * mano desde afuera*. Ver el docstring de
 * `detect/intra-file/exposed-container-traversal.ts` para las cinco
 * condiciones y la intención de cada una.
 * ════════════════════════════════════════════════════════════════════════ */

interface ExposedProblem {
  readonly finding: Finding;
  /** `null` = no había árbol vivo / grafo para re-verificar la forma. Nunca "se asume que sí". */
  readonly candidate: ExposedContainerCandidate | null;
  /** Miembros propios del dueño que ya tocan el contenedor: media puerta escrita. */
  readonly halfDoor: readonly string[];
}

/**
 * INTENCIÓN QUE VERIFICA ESTE CHEQUEO: *"el recorrido posicional de un
 * contenedor AJENO sigue estando ahí, leído del ÁRBOL VIVO de esta corrida"*.
 * Mismo criterio de "no confiar ciegamente en el detector" que
 * `decorator.ts` aplica sobre `capabilityUnitsOf`. Si no se pudo mirar
 * (`ctx.file` nulo o sin grafo) ⇒ `holds: false`, NUNCA "no pude mirar,
 * apruebo".
 */
const traversalStillThere: Check<ExposedProblem, IteratorGraph> = {
  id: "recorrido-posicional-de-contenedor-ajeno",
  describe:
    "Re-verificado contra el árbol vivo: hay un subíndice con cursor propio (i++ / i+=1) sobre un acceso a miembro cuyo receptor NO es this/self — el cliente recorre por POSICIÓN la representación de otro tipo.",
  run(problem) {
    const c = problem.candidate;
    if (!c) {
      return { holds: false, evidence: "No se pudo re-verificar la forma contra el árbol vivo (sin archivo vivo o sin grafo en esta corrida)." };
    }
    const detail = c.sites.map((s) => `${s.enclosing ?? "(nivel de archivo)"}:${s.startLine} (${s.receiver}.${c.member}[${s.cursor}])`).join(", ");
    return { holds: true, evidence: `${c.sites.length} sitio(s) de recorrido posicional sobre "${c.member}": ${detail}.` };
  },
};

/**
 * INTENCIÓN: *"hay un TIPO cuya representación se está filtrando, y vive en
 * OTRO archivo"*. Sin dueño no hay representación interna de nadie que ocultar
 * — es la misma pregunta que la Ola V tuvo que agregarle a este módulo con
 * `not-applicable`, hecha acá con el grafo en vez de con la aridad.
 */
const containerHasOwner: Check<ExposedProblem, IteratorGraph> = {
  id: "contenedor-con-dueno-en-otro-archivo",
  describe: "El contenedor recorrido es un miembro de un tipo declarado en OTRO archivo — hay una representación interna ajena que ocultar, y la frontera que se cruza es real.",
  run(problem) {
    const c = problem.candidate;
    if (!c) return { holds: false, evidence: "Sin re-verificación: no se pudo identificar el dueño del contenedor." };
    return {
      holds: true,
      evidence:
        `"${c.member}" es miembro de "${c.ownerName}" (${c.ownerFile})` +
        (c.ambiguousOwner ? ` — RESOLUCIÓN AMBIGUA${c.ownerAlternatives > 0 ? ` (${c.ownerAlternatives} destino(s) alternativo(s))` : ""}` : " — resolución no ambigua") +
        ".",
    };
  },
};

/**
 * INTENCIÓN: **ESCALA** — *"cambiar la representación obliga a tocar a
 * varios"*. Es la condición que la Ola AC midió que falta cuando un ancla no
 * paga (AC2: 7 casos con la fuerza correcta, 6 demasiado chicos).
 */
const representationIsAContract: Check<ExposedProblem, IteratorGraph> = {
  id: "representacion-conocida-por-varios-clientes",
  describe: "La representación cruda ya es un contrato de hecho: el contenedor lo alcanzan >= 3 archivos distintos que no son el del dueño, así que cambiarlo es una cirugía de escopeta.",
  run(problem) {
    const c = problem.candidate;
    if (!c) return { holds: false, evidence: "Sin re-verificación: no hay cuenta de archivos cliente." };
    return {
      holds: c.clientFiles.length >= MIN_CLIENT_FILES,
      evidence: `${c.clientFiles.length} archivo(s) cliente distinto(s) (piso ${MIN_CLIENT_FILES}): ${c.clientFiles.slice(0, 5).join(", ")}${c.clientFiles.length > 5 ? ", ..." : ""}.`,
    };
  },
};

/** Más de un sitio en ESTE archivo = el recorrido ya está repetido acá adentro, no es un uso aislado. */
const repeatedInThisFile: Check<ExposedProblem, IteratorGraph> = {
  id: "recorrido-repetido-en-este-archivo",
  describe: "El mismo contenedor ajeno se recorre en más de un sitio de este archivo — la forma de recorrerlo ya se copió.",
  run(problem) {
    const n = problem.candidate?.sites.length ?? 0;
    return { holds: n > 1, evidence: `${n} sitio(s) de recorrido en este archivo.` };
  },
};

/**
 * Lo ambiguo VIAJA COMO AMBIGUO: este discriminador no aprueba ni desaprueba
 * nada, publica cuánto vale la resolución del dueño. Medido por AE9: **el
 * 74,9 % de las aristas `references(receiver-member)` de los 13 repos son
 * ambiguas**, así que exigir resolución no ambigua apagaría el ancla entera.
 */
const ownerResolutionIsFirm: Check<ExposedProblem, IteratorGraph> = {
  id: "resolucion-del-dueno-no-ambigua",
  describe: "El grafo llegó al dueño del contenedor por una arista NO ambigua (el resolutor supo fijar el destino), y además este archivo tiene alguna arista no ambigua hacia el archivo del dueño.",
  run(problem) {
    const c = problem.candidate;
    if (!c) return { holds: false, evidence: "Sin re-verificación." };
    const firm = !c.ambiguousOwner && c.confidentlyLinked;
    return {
      holds: firm,
      evidence: firm
        ? "Dueño resuelto sin ambigüedad y con enlace confidente entre los dos archivos."
        : `Dueño ${c.ambiguousOwner ? "resuelto por arista AMBIGUA" : "resuelto sin ambigüedad"}; enlace no ambiguo entre los dos archivos: ${c.confidentlyLinked ? "sí" : "NO"}. Confirmar a mano de quién es el contenedor.`,
    };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, y por qué tiene sólo dos peldaños.
 *
 * `parcial` — el dueño YA tiene algún miembro propio que lee el contenedor:
 * hay media puerta escrita (alguien adentro ya sabe recorrerlo) y lo que falta
 * es publicarla y que los clientes pasen por ahí.
 * `ausente` — ni eso: la forma de recorrer esa representación sólo la conocen
 * los clientes.
 *
 * `ya-aplicado` y `aplicado-eludido` son INALCANZABLES por este camino, y lo
 * digo con todas las letras, con el mismo criterio con que AD4 y AC3 lo
 * dijeron de las suyas: **son cero POR CONSTRUCCIÓN**, no por mérito. El
 * detector exige acceso posicional CRUDO desde afuera, que es incompatible con
 * "el recorrido ya está encapsulado", y sus condiciones (5a)/(5b) ya silencian
 * el caso en que el dueño formaliza un protocolo o publica una puerta que los
 * clientes usan. Lo que SÍ es mérito medible, y de otra naturaleza, es ese
 * silencio — y hay tests que lo exigen.
 */
function exposedAppliedState(problem: ExposedProblem): AppliedStateResult {
  const c = problem.candidate;
  if (problem.halfDoor.length > 0) {
    return {
      state: "parcial",
      checks: [
        {
          label: "puerta-de-recorrido-del-dueño",
          passed: true,
          why: `"${c?.ownerName ?? "el dueño"}" ya tiene ${problem.halfDoor.length} miembro(s) propio(s) que leen "${c?.member ?? "el contenedor"}" (${problem.halfDoor.slice(0, 4).join(", ")}), pero ningún cliente pasa por ahí: media puerta escrita y sin usar.`,
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "puerta-de-recorrido-del-dueño",
        passed: false,
        why: `Ningún miembro propio de "${c?.ownerName ?? "el dueño"}" lee "${c?.member ?? "el contenedor"}": la forma de recorrer esa representación sólo la conocen los clientes.`,
        role: "applied",
      },
    ],
  };
}

function buildExposedSpec(): HypothesisSpec<ExposedProblem, IteratorGraph> {
  return {
    pattern: "Iterator",
    // Mismo techo que el camino viejo, y por una razón NUEVA que se suma a las
    // suyas: el 74,9 % de las aristas `receiver-member` del corpus son
    // ambiguas, así que el DUEÑO del contenedor puede estar mal identificado.
    ceiling: "media",
    needs: [],
    required: [traversalStillThere, containerHasOwner, representationIsAContract],
    discriminators: [repeatedInThisFile, ownerResolutionIsFirm],
    appliedState: exposedAppliedState,
    toConfirm: [
      "Confirmar que el contenedor recorrido es de verdad una SECUENCIA (una lista/array) y no un mapa indexado por un entero que además se incrementa — sin sistema de tipos, la única evidencia disponible es que alguien lo indexa con un cursor.",
      "Confirmar A MANO de quién es el contenedor si el chequeo `resolucion-del-dueno-no-ambigua` no se sostuvo: el 74,9 % de las aristas `references(receiver-member)` del corpus son ambiguas, así que el grafo puede haber elegido un homónimo (medido: `processed_source.tokens` de rubocop cae en una clase sin relación porque el dueño real vive en otra gema).",
      "Si los clientes hacen ACCESO ALEATORIO por posición (buscar el k-ésimo) y no un recorrido secuencial, un iterador no los cubre: la respuesta correcta es otra API.",
      "Si el contenedor es una estructura ANIDADA (árbol, lista de listas) el problema es Composite antes que Iterator — el mismo `toConfirm` que el camino viejo de este patrón ya escribe.",
    ],
    source: "https://refactoring.guru/es/design-patterns/iterator",
  };
}

function buildExposedHypothesis(problem: Finding, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const file = ctx.file;
  const graph = ctx.repo.graph;
  let candidate: ExposedContainerCandidate | null = null;
  if (file && graph) {
    const head = problem.locations[0];
    const all = exposedContainerCandidatesOf(file, graph, MIN_CLIENT_FILES);
    candidate = all.find((c) => c.sites.some((s) => s.startLine === head?.startLine)) ?? null;
  }
  const halfDoor = candidate && graph ? halfDoorMembersOf(graph, candidate.ownerId, candidate.containerId) : [];

  const spec = buildExposedSpec();
  const exposedProblem = { finding: problem, candidate, halfDoor };
  const outcome = engineBuild(spec, ctx.capabilities, exposedProblem, graph);
  if (ai6TraceEnabled()) ai6Record("exposed-container-traversal", spec, problem, exposedProblem, graph, ctx, graph !== null, outcome !== null);
  if (!outcome) return null;

  const places: readonly RoleLocation[] = candidate
    ? candidate.sites.map((s, i) => ({
        file: problem.locations[0]?.file ?? "",
        startLine: s.startLine,
        endLine: s.endLine,
        symbol: s.enclosing ?? undefined,
        role:
          i === 0
            ? `recorrido posicional de "${s.receiver}.${candidate.member}" (cursor "${s.cursor}")`
            : `otro recorrido posicional del mismo contenedor (cursor "${s.cursor}")`,
      }))
    : [problem.locations[0]!];

  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places,
    cost: "Publicar el recorrido en el dueño (protocolo nativo del lenguaje o un tipo iterador) y cambiar cada cliente: más indirección que un `for` con índice, y se paga cuando la representación cambia o cuando aparece una segunda forma de recorrer.",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA AI, FRENTE AI6 — LA TRAZA DEL EMBUDO. Mismo mecanismo, misma forma y
 * mismo default que `strategy.ts#startStrategyTrace` (Ola AH) y que
 * `engine.ts#startArbitrationTrace`: ningún `process.env` en el camino de
 * análisis, se prende llamando `startAi6Trace()` desde un script de medición
 * y se apaga sola al leerla. `null` (el default de producción) ⇒ costo cero:
 * ni una rama de más por hallazgo, ni un check de más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE — `engine.ts#build` devuelve `null`
 * en cuanto UN `required` no se sostiene, y con él se pierde CUÁL no se
 * sostuvo. La pregunta de esta ola ("¿hay un `required` que, para un
 * subconjunto identificable de su entrada, no se pueda satisfacer POR
 * CONSTRUCCIÓN?") no es respondible sin el resultado de CADA `required`
 * también en los hallazgos que no emiten. Con la traza prendida se re-corren
 * los `required` y `appliedState` de esta hipótesis (son puros: leen
 * `problem`/`graph`/`ctx` y no escriben nada) para registrar el resultado
 * por check y el estado que la hipótesis HABRÍA tenido.
 * ──────────────────────────────────────────────────────────────────────── */

export interface Ai6TraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly language: string | null;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  /** `locations[0].role` — el detector escribe ahí la sub-forma (p.ej. `(tipado)`/`(literal)`). */
  readonly role: string;
  /** Cuál de los caminos del archivo corrió (un archivo puede tener specs distintos por ancla). */
  readonly camino: string;
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene; `null` si todos se sostienen. Con `spec === null` (muerte ANTES del motor) lleva el motivo, prefijado `pre-spec:`. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando un `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  readonly emitted: boolean;
}

let ai6Trace: Ai6TraceEntry[] | null = null;

export function startAi6Trace(): void {
  ai6Trace = [];
}

export function takeAi6Trace(): readonly Ai6TraceEntry[] {
  const t = ai6Trace ?? [];
  ai6Trace = null;
  return t;
}

export function ai6TraceEnabled(): boolean {
  return ai6Trace !== null;
}

function ai6Record<P, G>(
  camino: string,
  spec: HypothesisSpec<P, G> | null,
  problem: Finding,
  p: P,
  g: G,
  ctx: HypothesisContext,
  graphPresent: boolean,
  emitted: boolean,
  motivo?: string,
): void {
  if (!ai6Trace) return;
  const loc = problem.locations[0];
  const checks = spec
    ? spec.required.map((c) => {
        const r = c.run(p, g);
        return { id: c.id, holds: r.holds, why: r.evidence };
      })
    : [];
  ai6Trace.push({
    findingId: problem.id,
    kind: problem.kind,
    language: problem.language,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    symbol: loc?.symbol ?? "",
    role: loc?.role ?? "",
    camino,
    withGraph: graphPresent,
    withFile: ctx.file !== null,
    checks,
    diesAt: spec ? (checks.find((c) => !c.holds)?.id ?? null) : `pre-spec:${motivo ?? "?"}`,
    // `appliedState` sólo se evalúa cuando TODOS los `required` se sostienen —
    // que es exactamente cuando producción también lo evalúa. Evaluarlo
    // siempre (la forma de `strategy.ts#recordStrategyTrace`) multiplicaba por
    // ~2 el costo de guava: `command.ts#appliedState` recorre el grafo del
    // repo y el ancla `duplication` tiene 1.089 hallazgos en ese repo, de los
    // que 1.067 mueren en el primer `required`. Medido: 4,7 min → 8,3 min.
    appliedState: spec ? (checks.every((c) => c.holds) ? spec.appliedState(p, g).state : "(no evaluado: murió en un required)") : "(sin spec)",
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "iterator",
  pattern: "Iterator",
  layer: "patron",
  // La Ola AE (AE9) SUMÓ el ancla-fuerza `exposed-container-traversal` y
  // conservó las dos viejas, midiendo entonces 0/10 verdaderas.
  //
  // OLA AL (AL1) — SE SACA `duplication`. Se saca del array —explícito y
  // auditable— en vez de silenciarla con un discriminador, que escondería la
  // decisión. Medido sobre el volcado del 21-08, con el 100 % de la población
  // viva juzgada en las DOS poblaciones (yo juzgué las 17 que faltaban
  // abriendo el archivo real, 7 en biblioteca y 10 en aplicación):
  //
  //   · nivel 2: 16 recomendaciones en biblioteca y 14 en aplicación, las 30
  //     juzgadas, **0 verdaderas** (0/15 y 0/13, más 2 `problema-si-patrón-no`).
  //   · costo en cobertura: **0 huérfanos** en las dos poblaciones.
  //   · la figura, repetida en las 30: lo que se recorre es un PARÁMETRO, una
  //     variable LOCAL o un arreglo primitivo de respaldo cuyo tipo YA extiende
  //     `AbstractList` — o sea que Iterator ya está aplicado. Falta la fuerza
  //     del patrón (un cliente que recorre la representación interna de otro
  //     tipo), no un umbral.
  //
  // `distributed-duplication` y `exposed-container-traversal` NO se tocan, y
  // el `build` de duplicación queda intacto: sigue sirviendo a
  // `distributed-duplication`, que comparte todo el camino.
  anchors: ["distributed-duplication", EXPOSED_CONTAINER_TRAVERSAL_KIND],
  build(problem: Finding, _graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (problem.kind === EXPOSED_CONTAINER_TRAVERSAL_KIND) return buildExposedHypothesis(problem, ctx);
    const facts = ctx.repo.graph ? buildGraphFacts(ctx.repo.graph) : null;
    const matched: MatchedCopy[] = [];
    for (const location of problem.locations) {
      const clone = findCloneFor(ctx.repo, location);
      if (!clone) continue;
      const cursor = hasManualCursorIndexing(clone.normalized);
      if (!cursor.holds || !cursor.cursorVar) continue;
      const collectionName = cursor.collectionName ?? null;
      matched.push({
        location,
        clone,
        cursorVar: cursor.cursorVar,
        collectionName,
        structural: classifyStructure(facts, clone.file, clone.className, clone.functionName, collectionName),
      });
    }

    const iteratorProblem: IteratorProblem = {
      finding: problem,
      totalLocations: problem.locations.length,
      matched,
      crossFile: problem.kind === "distributed-duplication",
    };

    const spec = buildIteratorSpec(ctx, ctx.repo);
    const outcome = engineBuild(spec, ctx.capabilities, iteratorProblem, ctx.repo.graph);
    if (ai6TraceEnabled()) ai6Record("duplication", spec, problem, iteratorProblem, ctx.repo.graph, ctx, ctx.repo.graph !== null, outcome !== null);
    if (!outcome) return null;

    const places: readonly RoleLocation[] =
      matched.length > 0
        ? matched.map((m, i) => ({ ...m.location, role: i === 0 ? "recorrido manual (primera copia confirmada)" : `copia adicional #${i + 1}` }))
        : [problem.locations[0]];

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Una clase/objeto iterador más por cada forma de recorrido; overkill si en la práctica sólo hay un consumidor y las copias se resuelven con Extract Method.",
    });
  },
};
