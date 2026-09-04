/**
 * Hipótesis "Singleton" — Ola 10 (CONTRATO-F10.md), reescrita sobre la forma
 * de grafo — reemplaza la versión F6 que decidía por VOCABULARIO de nombre.
 *
 * ANCLA SIN CAMBIOS: `scattered-instantiation` (`detect/inter-file/
 * scattered-instantiation.ts`) — el registro de pendientes es explícito:
 * "ancla propia: no, sigue colgando de su ancla actual". Ese detector sigue
 * haciendo el trabajo caro (grafo, aristas `instantiates` confiables,
 * agrupado por tipo destino) y su piso declarado de 6 archivos distintos
 * (`scattered-instantiation.ts:129`) NO se alcanza ni en guava — por eso, en
 * producción, `build()` de este archivo casi nunca corre. Recalibrar ese
 * piso es un cambio de UMBRAL con medición propia, no algo que este archivo
 * decida (fuera de alcance de esta tarea).
 *
 * ── LAS CUATRO FORMAS (CONTRATO-F10.md, tarea de esta ola), 100% estructurales ──
 *
 *   COMPLETA (`ya-aplicado`, nunca sugiere — regla 1): T declara un miembro
 *   function-like de `arity: 0` con `visibility` pública o ausente (el
 *   accessor); T tiene ≥1 hijo `contains` de `family: "other"` (la ranura de
 *   instancia — un campo/constante de nivel de tipo, nunca por nombre); el
 *   constructor de T (identificado por nombre — ver más abajo, ÚNICA
 *   vocabulario que sobrevive) tiene `visibility` `private`/`internal`; y el
 *   fan-in `instantiates` de T está confinado a su propio archivo (cero
 *   aristas `instantiates` entrantes desde otro archivo).
 *
 *   PARCIAL: el accessor de `arity: 0` existe, PERO el constructor no se
 *   pudo confirmar `private`/`internal` — porque no se identificó ningún
 *   miembro constructor, porque su `visibility` es pública/ausente, o porque
 *   la gramática del lenguaje no expone slot de visibilidad ahí. "La
 *   instancia única es una convención, no una garantía" (texto literal de la
 *   tarea) — el `why` de `ctorCheck` DECLARA cuál de los tres casos es,
 *   nunca adivina cuál es más probable (requisito 3).
 *
 *   AUSENTE: ningún miembro accessor de `arity: 0`/visibilidad pública o
 *   ausente existe en T — la dispersión del propio ancla, sin ningún intento
 *   visible de encapsular la unicidad. *** CAMBIO DE COMPORTAMIENTO respecto
 *   de la versión F6: antes esto era SILENCIO (`build()` devolvía `null`,
 *   vía `required`); ahora es un ESTADO real con sugerencia — regla 1 de la
 *   tarea ("sólo parcial y ausente sugieren", y el motor
 *   (`engine.ts#build`) ya trata `"ausente"` como oportunidad con
 *   confidence no-nula. El `required` de abajo ya NO es "existe un
 *   accessor" — es sólo "T es localizable en el grafo", la precondición
 *   mínima para tener CUALQUIER hecho estructural que consultar. ***
 *
 *   APLICADO-ELUDIDO: como COMPLETA, pero con ≥1 archivo externo que
 *   instancia T directamente pese al constructor privado — alerta de fuga,
 *   tampoco sugiere el patrón (regla 1).
 *
 * ── EL EXCLUDER ESTRUCTURAL QUE REEMPLAZA AL DE VOCABULARIO (requisito 2) ──
 * La versión F6 decidía el accessor por REGEX de nombre (`ACCESSOR_NAME_LOOSE`
 * `/instance/i`, `ACCESSOR_NAME_STRICT` `/^(get[_-]?)?instance$/i`) — el
 * `LAZY_SINGLETON_ACCESSOR` de `pattern-structural.ts:516` que
 * CONTRATO-F10.md §3 (tabla) marca para retiro, con el reemplazo exacto que
 * esta hipótesis implementa: "miembro function-like arity 0 + visibility
 * privada en el constructor + instantiates fan-in confinado al archivo del
 * accessor". Ambas regex se BORRAN — ni siquiera se referencian.
 *
 * ── LA ÚNICA VOCABULARIO QUE SOBREVIVE, Y POR QUÉ ES DISTINTA ──────────────
 * Identificar CUÁL miembro de T es "el constructor" (para leer su
 * `visibility`) exige un nombre porque el grafo no carga el TIPO DE NODO de
 * gramática por símbolo (`graph/types.ts#CodeGraphNode` no tiene `nodeType`)
 * y `ctx.fileAt`/`ctx.file` son SIEMPRE `null` para un ancla `inter-file`
 * como ésta (`run.ts`, mismo límite que `prototype.ts`/`iterator.ts`
 * documentan) — el "mecanismo B" de `prototype.ts` (`sets.constructorNodes`,
 * por TIPO DE NODO) necesita un árbol vivo que acá nunca hay. Sólo queda el
 * "mecanismo A": el nombre del miembro es igual al de la CLASE (Java/C#) o
 * uno de los protocolos NATIVOS del lenguaje/runtime (`constructor`/
 * `__init__`/`initialize`/`new`/`New` — MISMO conjunto `CONSTRUCTOR_NAMES`
 * que `prototype.ts` ya usa sin objeción). Esto NO es la vocabulario de
 * DOMINIO que el requisito 2 pide retirar (`CLONE_METHOD_NAME`,
 * `ITERATOR_PROTOCOL_NAME`, `COLLECTION_FIELD_NAME`, `LISTENER_FIELD_NAME` —
 * convenciones de PROYECTO sobre qué campo/método "hace de" algo) sino un
 * protocolo de lenguaje/runtime (cómo CADA gramática nombra su constructor),
 * la misma categoría que el propio contrato deja en pie para Prototype.
 * BRECHA DECLARADA: si un miembro no-constructor tuviera el mismo nombre que
 * la clase (posible en algún lenguaje dinámico), se leería como constructor
 * — no observado en los 9 lenguajes del corpus, no arreglado acá.
 *
 * ── LA BRECHA DE VISIBILIDAD, DECLARADA POR LENGUAJE (requisito 3) ────────
 * `graph/symbols.ts#computeVisibility` documenta que Ruby/Python/Go/
 * JavaScript (y variantes) NO EXPONEN NINGÚN nodo de visibilidad — ahí
 * `ctorCheck.passed` nunca puede ser `true` (visibility es siempre
 * `undefined`), así que Singleton NUNCA alcanza `ya-aplicado`/
 * `aplicado-eludido` en esos lenguajes: se queda en `parcial` para siempre,
 * con el motivo EXPLÍCITO en `why` ("no expone... campo genérico de
 * visibilidad"), nunca adivinado como falso. Sólo Java/C#/TypeScript/TSX/Vue
 * tienen slot de visibilidad real — el fixture canónico
 * (`fixtures-multi/singleton/typescript.ts`) es, medido, el único de los 6
 * variantes de lenguaje de esa fixture que puede alcanzar `ya-aplicado` con
 * los hechos de hoy (ver `singleton.test.ts`, sección "fixture canónica").
 *
 * ── FORMA EN LENGUAJES SIN CLASES (Go) — BRECHA MÁS PROFUNDA, DECLARADA ───
 * El query de T no exige colgar de una clase — cualquier símbolo `family:
 * "class-like"`/`"namespace-like"` sirve. Pero el idioma REAL de Go
 * (`sync.Once` + variable de PAQUETE + función `GetX` de nivel de paquete,
 * ver `fixtures-multi/singleton/go.go`) no asocia esa función al `struct`
 * como miembro: `graph/build.ts#buildNodesAndContainsForFile` cuelga un
 * símbolo de `container: []` (todo top-level de Go) del nodo ARCHIVO, no del
 * `struct` — mismo hecho, medido, que `prototype.ts` ya documenta para
 * métodos Go ("el receptor vive en un campo, no en anidamiento de AST").
 * Consecuencia: `scanMembers` (que sólo mira hijos `contains` DIRECTOS de T)
 * nunca ve el accessor de un Singleton de Go como miembro de su `struct` —
 * de hecho, para un `struct` de Go, `scanMembers` no ve NINGÚN hijo
 * `contains` en absoluto (ni siquiera los propios CAMPOS del struct quedan
 * anidados bajo su nodo, medido sobre el grafo real de hugo, esta tarea).
 * *** CORREGIDO (esta tarea) — antes esto hacía que Go se quedara SIEMPRE en
 * `ausente` (y "ausente" SUGIERE, regla 1): 7 hipótesis Singleton falsas
 * medidas en hugo sobre structs de VALOR (`PageGroup`, `TemplateDescriptor`,
 * `configKey`, `simpleCommand`, `context`…, ver `TABLA-ARISTAS.md` §6) — la
 * búsqueda de accessor NUNCA PUDO MIRAR ni un solo miembro real de esos
 * tipos, así que "ausente" (que se supone significa "miré y no encontré
 * ningún intento de encapsular") era una afirmación sin base. El nuevo
 * `required` `typeHasAnyMember` (más abajo) exige AL MENOS UN hijo `contains`
 * de cualquier family antes de candidatear siquiera — sin eso, `build()`
 * devuelve `null` (silencio honesto), no `ausente` (sugerencia con evidencia
 * inexistente). Con el grafo de hoy, esto deja a CUALQUIER `struct` de Go sin
 * hipótesis Singleton en absoluto (nunca alcanza ni `parcial` tampoco, mismo
 * hecho de fondo) — declarado, no oculto (ver los tests "forma en lenguaje
 * sin clases"/"réplica directa del caso real" de `singleton.test.ts`) —
 * arreglarlo necesitaría una noción de "función de paquete asociada a un
 * tipo por convención de nombre" (para el accessor) O una arista `contains`
 * real hacia los campos de un struct de Go (para los datos), ninguna de las
 * dos disponible en el grafo hoy. ***
 *
 * SE CONFUNDE CON (heredado, sigue vigente): memoización normal de un objeto
 * caro (Proxy de inicialización perezosa) y con un módulo/objeto de nivel de
 * módulo en JS/Python/Ruby, que YA ES la forma idiomática de instancia única
 * ahí — un accessor de arity 0 en un objeto de configuración cacheado
 * cualquiera también matchearía, de ahí que el `ceiling` no suba de "media".
 *
 * ── OLA 11a (paquete P1): SALIR DEL SILENCIO TOTAL + CONSUMIR `ctx.neighborhood` ──
 * Dos cambios, ninguno de forma:
 *  1. `MIN_SITES_SPEC` de `scattered-instantiation.ts` bajó de 6 a 3 (ver el
 *     rationale ahí) — antes, el ancla de este archivo casi nunca producía un
 *     `Finding`, así que `build()` casi nunca corría. Medido con
 *     `scripts/measure-scattered-instantiation-histogram.mts`: en TODO
 *     `tests/fixtures/patterns/` el máximo real de archivos distintos que
 *     instancian el MISMO tipo (con arista `instantiates` confiable) es 1 —
 *     ni con piso 3 ni con piso 2 el ancla dispara sobre esa fixture; la
 *     fixture de Singleton en particular ni siquiera llega a eso: sus únicas
 *     aristas `instantiates` hacia `AppConfig` son `provenance: "ambiguous"`
 *     (colisión de nombre entre los 6 archivos de lenguaje, cada uno declara
 *     su propio `AppConfig`) y el destino resuelto es `family: "other"`, no
 *     `"class-like"` (el `struct` de Go) — dos motivos AJENOS al piso
 *     (resolución de nombre y clasificación de familia, `graph/resolve.ts`/
 *     `graph/symbols.ts`, fuera de este paquete) que igual impedirían el
 *     disparo aunque el piso fuera 1. Declarado, no escondido: bajar el piso
 *     no hace que este archivo deje de estar mudo sobre `fixtures-multi`
 *     (sigue así por esas otras dos causas); lo que sí cambia es que en un
 *     repo real donde 3+ archivos SÍ instancian confiablemente el mismo tipo
 *     (sin colisión de nombre ni ambigüedad), este archivo ahora puede correr.
 *  2. `build()` cuelga de `scattered-instantiation`, ancla `inter-file` —
 *     `ctx.neighborhood` YA es el índice REAL en la única llamada de
 *     producción (`hypotheses/run.ts#attachHypotheses`, llamada (2), dentro
 *     de `crossAnalyze`, después de `buildNeighborhoodIndex` — a diferencia
 *     de `strategy.ts`/`state.ts`, cuyas anclas son `intra-function`/
 *     `intra-file` y sólo ven vecindario real vía `refresh()`). Por eso este
 *     archivo NO implementa `refresh()`: no hace falta, `build()` ya lee
 *     `ctx.neighborhood` con datos reales la primera y única vez que corre.
 *     Dos discriminadores nuevos (`dispersionNoGeneralizedaEnElRepo`,
 *     `accessorFileConcentratesOtherFindings`, más abajo) — el porqué de cada
 *     uno, en su propio comentario.
 */
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { build, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { Finding, RoleLocation } from "../detect/types.js";
import type { CodeGraph, CodeGraphNode, Visibility } from "../graph/types.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/** Protocolos NATIVOS de constructor por lenguaje/runtime — NO vocabulario de
 *  dominio (ver docstring del módulo). Mismo conjunto que `prototype.ts`. */
const CONSTRUCTOR_NAMES = new Set(["initialize", "constructor", "__init__", "new", "New"]);

function isConstructorName(name: string, className: string): boolean {
  return name === className || CONSTRUCTOR_NAMES.has(name);
}

interface AccessorCandidate {
  readonly name: string;
  readonly startLine?: number;
  readonly endLine?: number;
}

interface ConstructorCandidate {
  readonly name: string;
  readonly visibility: Visibility | undefined;
  readonly startLine?: number;
  readonly endLine?: number;
}

interface SingletonProblem {
  className: string;
  file: string;
  /** Del `Finding` ancla — sólo para el discriminador de dispersión, ya NO para decidir confinamiento (eso es un hecho de grafo, ver abajo). */
  distinctSites: number;
  minSitesThreshold: number;
  /** `null` ⇒ T no es localizable en el grafo (grafo ausente, o sin nodo `class-like`/`namespace-like` con ese nombre en ese archivo) — gate de `required`. */
  typeNodeFound: boolean;
  /** NUEVO — gate de `required` (ver `typeHasAnyMember`): T tiene al menos un miembro (de cualquier family) anidado en el grafo. */
  hasAnyMember: boolean;
  accessorCandidates: readonly AccessorCandidate[];
  instanceSlotCount: number;
  constructorCandidate: ConstructorCandidate | null;
  /** Archivos DISTINTOS de `file` con ≥1 arista `instantiates` confiable hacia T — hecho de GRAFO, no del `Finding` ancla. */
  externalInstantiateFiles: readonly string[];
  languageHasVisibilityCapability: boolean;
}

/** Localiza el nodo `symbol` de T por archivo + último segmento de `symbolPath` — mismo criterio de nombre que `scattered-instantiation.ts#typeName` ya usa para producir el propio `Finding` ancla. */
function findTypeNode(graph: CodeGraph | null, file: string, className: string): CodeGraphNode | null {
  if (!graph) return null;
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.file !== file) continue;
    if (node.family !== "class-like" && node.family !== "namespace-like") continue;
    if (node.symbolPath[node.symbolPath.length - 1] === className) return node;
  }
  return null;
}

interface MemberFacts {
  accessorCandidates: AccessorCandidate[];
  instanceSlotCount: number;
  constructorCandidate: ConstructorCandidate | null;
  /** NUEVO — ver `typeHasAnyMember` más abajo: `true` si T tiene AL MENOS UN
   *  hijo `contains` de tipo `symbol`, de CUALQUIER family — no sólo los que
   *  clasifican como accessor/ranura/constructor. Es la señal cruda que
   *  distingue "miré y no encontré nada" de "no pude mirar en absoluto". */
  hasAnyMember: boolean;
}

/**
 * Recorre los hijos `contains` DIRECTOS de `ownerId` una sola vez, clasificando cada uno en ranura de instancia / constructor / accessor candidato — nunca por nombre salvo para identificar el constructor (ver docstring del módulo).
 *
 * INTENCIÓN del accessor de CAMPO (Ola U, `PLAN-INTENCIONES.md` §1): un Singleton clásico
 * puede exponer su instancia única como CAMPO público (`static final X INSTANCE = new X()`,
 * `WildcardCapturer` de guava) en vez de MÉTODO (`getInstance()`) — son la MISMA forma
 * estructural ("hay un punto de acceso de nivel de tipo a la instancia"), y antes sólo la
 * segunda contaba como accessor, así que el patrón caía a AUSENTE sobre un tipo que ya lo
 * tiene. El campo es DE RESPALDO, nunca compite con un método real: sólo se promueve a
 * candidato (a) si NINGÚN miembro function-like ya calificó como accessor (si hay
 * `getInstance()`, el campo sigue siendo sólo la ranura de instancia, no un candidato extra
 * — preservar `accessor-unico`) y (b) si el constructor identificado está CONFIRMADO
 * `private`/`internal` — un campo público de un tipo con constructor público cualquiera no
 * es evidencia de instancia única, es un dato público común. Por eso la promoción se decide
 * DESPUÉS de recorrer todos los hijos (el constructor puede aparecer, en el grafo, después
 * del campo), nunca durante.
 */
function scanMembers(graph: CodeGraph, nodeById: ReadonlyMap<string, CodeGraphNode>, ownerId: string, className: string): MemberFacts {
  const accessorCandidates: AccessorCandidate[] = [];
  const backupFieldCandidates: AccessorCandidate[] = [];
  let instanceSlotCount = 0;
  let constructorCandidate: ConstructorCandidate | null = null;
  let hasAnyMember = false;

  for (const e of confidentEdges(graph)) {
    if (e.kind !== "contains" || e.from !== ownerId) continue;
    const child = nodeById.get(e.to);
    if (!child || child.kind !== "symbol") continue;
    hasAnyMember = true;
    const name = child.symbolPath[child.symbolPath.length - 1];
    if (name === undefined) continue;

    if (child.family === "other") {
      instanceSlotCount++;
      if (child.visibility === undefined || child.visibility === "public") {
        backupFieldCandidates.push({ name, startLine: child.startLine, endLine: child.endLine });
      }
      continue;
    }
    if (child.family !== "function-like") continue;

    if (isConstructorName(name, className)) {
      if (!constructorCandidate) {
        constructorCandidate = { name, visibility: child.visibility, startLine: child.startLine, endLine: child.endLine };
      }
      continue; // el constructor nunca cuenta además como accessor
    }

    if ((child.arity ?? null) === 0 && (child.visibility === undefined || child.visibility === "public")) {
      accessorCandidates.push({ name, startLine: child.startLine, endLine: child.endLine });
    }
  }

  // El campo es accessor DE RESPALDO: sólo entra si ningún método ya calificó
  // (preserva accessor-unico) y el constructor identificado está CONFIRMADO
  // private/internal (ver docstring de esta función).
  const ctorConfirmedPrivate =
    constructorCandidate !== null && (constructorCandidate.visibility === "private" || constructorCandidate.visibility === "internal");
  if (accessorCandidates.length === 0 && ctorConfirmedPrivate) {
    accessorCandidates.push(...backupFieldCandidates);
  }

  return { accessorCandidates, instanceSlotCount, constructorCandidate, hasAnyMember };
}

/** Aristas `instantiates` CONFIABLES (excluye `inferred`/`ambiguous` — mismo
 *  criterio que `scattered-instantiation.ts#isConfidentInstantiationEdge`,
 *  el propio ancla) que apuntan a `typeNode`, agrupadas por archivo de
 *  origen DISTINTO del de `typeNode`. Hecho de grafo puro — ya NO lee
 *  `problem.siteFiles`/las `locations` del `Finding` ancla. */
function externalInstantiateFiles(graph: CodeGraph, nodeById: ReadonlyMap<string, CodeGraphNode>, typeNode: CodeGraphNode): readonly string[] {
  const files = new Set<string>();
  for (const e of confidentEdges(graph)) {
    if (e.kind !== "instantiates" || e.provenance === "inferred") continue;
    if (e.to !== typeNode.id) continue;
    const from = nodeById.get(e.from);
    if (from && from.file !== typeNode.file) files.add(from.file);
  }
  return [...files].sort();
}

const typeNodeFound: Check<SingletonProblem, CodeGraph | null> = {
  id: "tipo-localizado-en-grafo",
  describe: 'El tipo señalado por el hallazgo ancla tiene un nodo `symbol` de familia "class-like"/"namespace-like" localizable en el grafo — sin esto no hay ningún hecho estructural que consultar.',
  run(problem) {
    return {
      holds: problem.typeNodeFound,
      evidence: problem.typeNodeFound
        ? `Nodo localizado para "${problem.className}" en "${problem.file}".`
        : `No se encontró, en el grafo, un nodo \`symbol\` de familia class-like/namespace-like para "${problem.className}" en "${problem.file}" — sin él no hay miembros, ranuras ni aristas \`instantiates\` que consultar (grafo ausente, o el nombre/archivo no coincide con ningún nodo).`,
    };
  },
};

/**
 * NUEVO — cierra el caso medido en `TABLA-ARISTAS.md` §6 / `RAICES.md`
 * §⇢PENDIENTES 1: hugo, 7 hipótesis Singleton nuevas, las 7 FALSAS sobre
 * structs de VALOR de Go (`PageGroup`, `TemplateDescriptor`, `configKey`,
 * `simpleCommand`, `context`, `pageMapQueryPagesInSection`,
 * `pageMapQueryPagesBelowPath` — verificado a mano abriendo cada archivo,
 * ver el resultado de esta tarea).
 *
 * DIAGNÓSTICO — bug de implementación, no de criterio: `appliedState` (más
 * abajo) YA declara que "AUSENTE" significa "la dispersión existe SIN NINGÚN
 * INTENTO VISIBLE de encapsular la unicidad" — una afirmación que sólo tiene
 * sentido si de verdad se MIRARON los miembros de T y no se encontró ningún
 * accessor. Para un `struct` de Go eso nunca pasó: medido directamente sobre
 * el grafo real de hugo (sonda ad-hoc, esta tarea) los 7 tipos señalados
 * tienen CERO hijos `contains` de cualquier family — ni uno solo, ni
 * siquiera sus propios CAMPOS aparecen anidados (`graph/build.ts` cuelga
 * todo top-level de Go, incluidos los métodos con receptor, del nodo
 * ARCHIVO, no del `struct` — mismo hueco que el docstring del módulo ya
 * documenta para el accessor). "Ausente" ahí no es una búsqueda que
 * terminó en negativo: es una búsqueda que NUNCA PUDO EMPEZAR, indistinguible
 * en los hechos de un tipo de dato puro sin comportamiento (la propia
 * sección "SE CONFUNDE CON" #2 del docstring del módulo). Confirmar
 * "ausente" y sugerir el patrón sobre una búsqueda que nunca miró nada es
 * exactamente el bug: el criterio ("¿hay un intento visible de
 * encapsular?") es correcto, la implementación lo evaluaba como `false`
 * (accessor no encontrado) cuando el hecho real es `desconocido` (no hay
 * NADA que mirar).
 *
 * POR QUÉ ESTO ES UN GATE DE `required`, no un discriminador: un
 * discriminador sólo modula la escalera de confianza (nunca baja de "baja"
 * — `engine.ts#ladderStep(0)`), así que no alcanza para silenciar la
 * sugerencia. Cero miembros visibles no es "poca evidencia a favor": es
 * "no hay evidencia, ni a favor ni en contra" — la misma distinción que
 * `ctorCheck` ya hace explícita en su `why` para "el lenguaje no expone
 * visibilidad" (declarar la incertidumbre, no adivinarla), llevada al
 * extremo en que NINGÚN miembro es visible en absoluto.
 *
 * NO ES un atajo por lenguaje: no pregunta `language === "go"` en ningún
 * lado — pregunta un hecho de grafo (¿tiene T algún hijo `contains`?) que
 * CUALQUIER lenguaje puede fallar si su gramática no ata comportamiento al
 * tipo (hoy eso ocurre siempre en Go por el hueco de arriba, pero el check
 * es el mismo para los 9 lenguajes soportados). Structs de Go con
 * comportamiento SÍ visible (si el grafo alguna vez asocia métodos por
 * receptor) seguirían pasando este gate igual que cualquier otro lenguaje.
 *
 * NO apaga el caso legítimo: `soleAccessorCandidate`/`appliedState` de más
 * abajo siguen exigiendo un accessor real para llegar a "parcial"/
 * "ya-aplicado" — este gate sólo saca del juego a los tipos de los que el
 * grafo no tiene UN SOLO hecho que ofrecer, nunca a los que sí tienen
 * miembros pero les falta el accessor (ver el test "AUSENTE" de
 * `singleton.test.ts`, que sigue sugiriendo con UN miembro no-accessor).
 */
const typeHasAnyMember: Check<SingletonProblem, CodeGraph | null> = {
  id: "tipo-tiene-algun-miembro-visible",
  describe:
    'tipo-tiene-algun-miembro-visible: T tiene al menos un miembro (de cualquier family) anidado bajo su nodo en el grafo (arista `contains`) — sin este mínimo no hay ningún hecho estructural, ni a favor ni en contra, que "ausente" pueda estar afirmando.',
  run(problem) {
    return {
      holds: problem.hasAnyMember,
      evidence: problem.hasAnyMember
        ? `"${problem.className}" tiene al menos un miembro anidado localizable en el grafo — hay hechos que consultar.`
        : `"${problem.className}" no tiene NINGÚN miembro anidado (\`contains\`) localizable en el grafo — indistinguible entre un tipo de datos puro sin comportamiento (ver "SE CONFUNDE CON" en el docstring del módulo) y una limitación estructural de la gramática de este lenguaje (p.ej. Go: los métodos de un struct, asociados por receptor, no son hijos léxicos del struct — ver docstring). Sin ver NINGÚN miembro, "ausente" afirmaría una búsqueda de accessor que nunca pudo hacerse: no hay base para siquiera candidatear Singleton.`,
    };
  },
};

const soleAccessorCandidate: Check<SingletonProblem, CodeGraph | null> = {
  id: "accessor-unico",
  describe: "accessor-unico: hay EXACTAMENTE un miembro candidato a accessor (no varios, lo que sería ambiguo sobre cuál es la vía canónica).",
  run(problem) {
    const n = problem.accessorCandidates.length;
    return {
      holds: n === 1,
      evidence: n === 1 ? `Único candidato: ${problem.accessorCandidates[0]!.name}.` : n === 0 ? "Ningún candidato." : `${n} candidatos — ambigüedad sobre cuál es la vía canónica.`,
    };
  },
};

const dispersionWellAboveFloor: Check<SingletonProblem, CodeGraph | null> = {
  id: "dispersion-muy-por-encima-del-piso",
  describe: "La dispersión reportada por el hallazgo ancla al menos duplica su propio piso declarado.",
  run(problem) {
    const ratio = problem.minSitesThreshold > 0 ? problem.distinctSites / problem.minSitesThreshold : 0;
    return {
      holds: ratio >= 2,
      evidence: `${problem.distinctSites} archivo(s) construyen el tipo directamente según el hallazgo ancla, vs. piso declarado ${problem.minSitesThreshold} (${ratio.toFixed(1)}x).`,
    };
  },
};

/**
 * NUEVO (Ola 11a, P1) — primer consumo real de `ctx.neighborhood` en este
 * archivo. `countOfKind("scattered-instantiation")` cuenta CUÁNTOS OTROS
 * tipos del repo (no éste) tienen su propio hallazgo de instanciación
 * dispersa. Por qué le sirve a Singleton: la MISMA firma estructural
 * ("un tipo, construido directamente, desde varios archivos") también la
 * produce, de forma perfectamente legítima, un repo entero que nunca adoptó
 * un contenedor de inyección de dependencias — ahí CASI TODOS los tipos
 * concretos se instancian dispersos por igual, y el remedio es arquitectural
 * (introducir DI en general), no "ponerle un accessor privado a este tipo en
 * particular". Cuando, en cambio, este tipo es uno de los POCOS con
 * dispersión en un repo donde la mayoría no la tiene, la señal es mucho más
 * específica: ESTE tipo en particular es el candidato a instancia única, no
 * sólo una víctima más de un problema generalizado. Discriminador, no
 * `required`: no descarta nada, sólo pesa cuánto puede confiar la sugerencia
 * en que sea ESTE tipo el que lo necesita.
 */
function dispersionNotGeneralizedAcrossRepo(ctx: HypothesisContext): Check<SingletonProblem, CodeGraph | null> {
  return {
    id: "dispersion-no-generalizada-en-el-repo",
    describe:
      'La dispersión de este tipo no es indistinguible de un problema arquitectural repo-wide — ctx.neighborhood.countOfKind("scattered-instantiation") sobre el resto del repo se mantiene bajo.',
    run(problem) {
      const others = ctx.neighborhood.countOfKind("scattered-instantiation");
      const holds = others <= 2;
      return {
        holds,
        evidence: holds
          ? `${others} otro(s) tipo(s) del repo tienen su propio hallazgo de instanciación dispersa — la dispersión de "${problem.className}" no es un patrón repo-wide; hace más plausible que sea este tipo puntual el que necesita concentrar su construcción.`
          : `${others} otros tipos del repo también tienen instanciación dispersa — puede ser un problema de arquitectura general (ausencia de un contenedor de inyección de dependencias en todo el proyecto), no algo específico de "${problem.className}".`,
      };
    },
  };
}

/**
 * NUEVO (Ola 11a, P1) — segundo consumo. `findingsInFile` sobre el archivo
 * donde vive T (la ranura de instancia candidata) dice si ESE archivo, más
 * allá de este hallazgo puntual, ya concentra otros olores. Por qué le sirve
 * a Singleton: un archivo que además tiene otros hallazgos (alta
 * complejidad, exceso de responsabilidades, otro smell inter-file que
 * también aterriza ahí) es un punto caliente real del repo — la sugerencia
 * de introducir/objetivar la instancia única en ese archivo compite con
 * otros arreglos pendientes en el MISMO lugar, así que vale la pena que la
 * evidencia lo diga explícitamente en vez de que la hipótesis luzca aislada.
 * Discriminador (no gate): un archivo sin otros hallazgos no descarta nada,
 * sólo no aporta esta señal extra.
 */
function accessorFileConcentratesOtherFindings(ctx: HypothesisContext): Check<SingletonProblem, CodeGraph | null> {
  return {
    id: "archivo-concentra-otros-hallazgos",
    describe:
      "El archivo donde vive la ranura de instancia candidata ya concentra OTROS hallazgos del repo (ctx.neighborhood.findingsInFile) — no es un caso aislado.",
    run(problem) {
      const others = ctx.neighborhood.findingsInFile(problem.file);
      const holds = others.length > 0;
      return {
        holds,
        evidence: holds
          ? `"${problem.file}" concentra ${others.length} otro(s) hallazgo(s) además de éste — no es un caso aislado, ese archivo es un punto caliente del repo.`
          : `"${problem.file}" no tiene otros hallazgos registrados en esta corrida — hasta donde ve el vecindario, la dispersión de "${problem.className}" es un caso aislado en ese archivo.`,
      };
    },
  };
}

/**
 * Los cuatro estados, 100% estructurales — ver docstring del módulo. Nunca
 * evalúa nada por nombre salvo lo ya empaquetado en `constructorCandidate`
 * (mecanismo A, calculado antes de llegar acá).
 */
function appliedState(problem: SingletonProblem, _graph: CodeGraph | null): AppliedStateResult {
  const hasAccessor = problem.accessorCandidates.length > 0;
  const accessorCheck = {
    label: 'existe-accessor-arity0 (miembro function-like de aridad 0, visibilidad pública o ausente — evidencia estructural, no de nombre)',
    passed: hasAccessor,
    why: hasAccessor
      ? `${problem.accessorCandidates.length} miembro(s) function-like de aridad 0 y visibilidad pública/ausente en "${problem.className}": ${problem.accessorCandidates.map((a) => a.name).join(", ")}.`
      : `Ningún miembro function-like de aridad 0 con visibilidad pública/ausente en "${problem.className}" — sin él no hay accessor candidato de instancia única (podría ser Factory Method, ya sugerido por el propio hallazgo ancla, o un tipo simple usado en muchos lugares).`,
    role: "applied" as const,
  };

  // Ola 10: sin accessor, esto es AUSENTE (la dispersión sin ningún intento
  // visible de encapsular la unicidad) — ya no es silencio, ver docstring.
  if (!hasAccessor) return { state: "ausente", checks: [accessorCheck] };

  const hasInstanceSlot = problem.instanceSlotCount > 0;
  const instanceSlotCheck = {
    label: 'existe-ranura-de-instancia (>=1 hijo `contains` de family "other" en T — el campo/constante que guardaría la instancia)',
    passed: hasInstanceSlot,
    why: hasInstanceSlot
      ? `${problem.instanceSlotCount} miembro(s) de family "other" (campo/constante de nivel de tipo) en "${problem.className}".`
      : `Ningún miembro de family "other" en "${problem.className}" — el accessor existe pero no hay ranura visible donde guardaría la instancia.`,
    role: "applied" as const,
  };

  const ctor = problem.constructorCandidate;
  const ctorConfirmedPrivate = ctor !== null && (ctor.visibility === "private" || ctor.visibility === "internal");
  const ctorCheck = {
    label: 'constructor-realmente-privado (constructor identificado con visibility private/internal — nunca "ya aplicado" sin esto)',
    passed: ctorConfirmedPrivate,
    why: !problem.languageHasVisibilityCapability
      ? `El lenguaje de "${problem.file}" no expone (en su sonda) ningún campo genérico de visibilidad/modificador — "constructor privado" no es una noción que su gramática distinga aquí; la unicidad, si existe, es convención, no una garantía verificable desde el grafo.`
      : ctor === null
        ? `No se identificó, entre los miembros de "${problem.className}", un constructor (por nombre igual al de la clase, o protocolo nativo ${[...CONSTRUCTOR_NAMES].join("/")}) — no se puede confirmar que la instanciación esté restringida.`
        : ctorConfirmedPrivate
          ? `El constructor de "${problem.className}" ("${ctor.name}") tiene visibility "${ctor.visibility}".`
          : `El constructor de "${problem.className}" ("${ctor.name}") tiene visibility ${ctor.visibility ?? "ausente"} — no es private/internal, así que la unicidad es convención, no garantía.`,
    role: "applied" as const,
  };

  const bypassFiles = problem.externalInstantiateFiles;
  const confinementCheck = {
    label: "instanciacion-confinada (cero aristas `instantiates` entrantes desde OTROS archivos)",
    passed: bypassFiles.length === 0,
    why:
      bypassFiles.length === 0
        ? `Ninguna arista \`instantiates\` confiable hacia "${problem.className}" viene de un archivo distinto de "${problem.file}".`
        : `${bypassFiles.length} archivo(s) instancian "${problem.className}" directamente desde fuera de "${problem.file}": ${bypassFiles.slice(0, 5).join(", ")}${bypassFiles.length > 5 ? ", …" : ""}.`,
    role: "applied" as const,
  };

  const checks = [accessorCheck, instanceSlotCheck, ctorCheck, confinementCheck];
  const completa = hasInstanceSlot && ctorConfirmedPrivate;
  if (!completa) return { state: "parcial", checks };
  return { state: bypassFiles.length > 0 ? "aplicado-eludido" : "ya-aplicado", checks };
}

/**
 * Función (no `const` module-level) porque los dos discriminadores nuevos
 * (Ola 11a, P1) cierran sobre `ctx` para leer `ctx.neighborhood` — mismo
 * motivo por el que `strategy.ts#buildSpec` es una función, no un objeto
 * estático: un `Check<P, G>` no recibe `ctx` en su firma (`run(problem,
 * graph)`, ver `engine.ts`), así que la única forma de que un check consulte
 * el vecindario es capturarlo al construir el spec.
 */
function buildSingletonSpec(ctx: HypothesisContext): HypothesisSpec<SingletonProblem, CodeGraph | null> {
  return {
    pattern: "Singleton",
    // Mismo techo que la versión F6 ya declaraba a mano — evidencia GENÉRICA
    // (aridad/visibilidad de accessor, no el modismo real de memoización en el
    // cuerpo, que acá no hay cómo leer, ver docstring).
    ceiling: "media",
    needs: [],
    required: [typeNodeFound, typeHasAnyMember],
    discriminators: [soleAccessorCandidate, dispersionWellAboveFloor, dispersionNotGeneralizedAcrossRepo(ctx), accessorFileConcentratesOtherFindings(ctx)],
    appliedState,
    toConfirm: [
      "Confirmar que de verdad hace falta EXACTAMENTE una instancia (decisión de dominio) — y considerar inyección de dependencias en vez de Singleton, que la industria trata como antipatrón cuando se abusa de él.",
      "Un miembro de aridad 0 con visibilidad pública/ausente puede ser un getter cualquiera (p.ej. de un objeto de configuración cacheado), no necesariamente un accessor de Singleton — confirmar leyendo el código.",
    ],
    source: "https://refactoring.guru/es/design-patterns/singleton",
  };
}

function targetLocationOf(problem: Finding): RoleLocation {
  return problem.locations.find((l) => l.role.startsWith("tipo construido directamente")) ?? problem.locations[0];
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — LA TRAZA DEL EMBUDO (auditoría de compuertas).
 * Mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace` y `strategy.ts#startStrategyTrace`
 * (Ola AH, AH1): `null` en producción ⇒ costo cero. Los `required` que se
 * re-corren acá son puros. No cambia ningún comportamiento.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface SingletonTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly className: string;
  readonly withGraph: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
}

let singletonTrace: SingletonTraceEntry[] | null = null;

export function startSingletonTrace(): void {
  singletonTrace = [];
}

export function takeSingletonTrace(): readonly SingletonTraceEntry[] {
  const t = singletonTrace ?? [];
  singletonTrace = null;
  return t;
}

function recordSingletonTrace(
  spec: HypothesisSpec<SingletonProblem, CodeGraph | null>,
  internal: SingletonProblem,
  problem: Finding,
  graph: CodeGraph | null,
  emitted: boolean,
): void {
  const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(internal, graph).holds }));
  const loc = problem.locations[0];
  singletonTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    className: internal.className,
    withGraph: graph !== null,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: spec.appliedState(internal, graph).state,
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "singleton",
  pattern: "Singleton",
  layer: "patron",
  anchors: ["scattered-instantiation"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const target = targetLocationOf(problem);
    const className = target.symbol ?? target.file;
    const trigger = problem.trigger[0];

    const typeNode = findTypeNode(graph, target.file, className);
    const nodeById: ReadonlyMap<string, CodeGraphNode> = graph ? new Map(graph.nodes.map((n) => [n.id, n] as const)) : new Map();
    const memberFacts: MemberFacts =
      graph && typeNode
        ? scanMembers(graph, nodeById, typeNode.id, className)
        : { accessorCandidates: [], instanceSlotCount: 0, constructorCandidate: null, hasAnyMember: false };
    const bypassFiles = graph && typeNode ? externalInstantiateFiles(graph, nodeById, typeNode) : [];

    const singletonProblem: SingletonProblem = {
      className,
      file: target.file,
      distinctSites: trigger.value,
      minSitesThreshold: trigger.threshold.value,
      typeNodeFound: typeNode !== null,
      hasAnyMember: memberFacts.hasAnyMember,
      accessorCandidates: memberFacts.accessorCandidates,
      instanceSlotCount: memberFacts.instanceSlotCount,
      constructorCandidate: memberFacts.constructorCandidate,
      externalInstantiateFiles: bypassFiles,
      languageHasVisibilityCapability: ctx.capabilities.has("visibilidad"),
    };

    const spec = buildSingletonSpec(ctx);
    const outcome = build(spec, ctx.capabilities, singletonProblem, graph);
    if (singletonTrace) recordSingletonTrace(spec, singletonProblem, problem, graph, outcome !== null);
    if (!outcome) return null;

    const places: PatternHypothesis["places"] = [
      { file: target.file, startLine: target.startLine, endLine: target.endLine, symbol: className, role: "tipo con posible intención de instancia única" },
      ...singletonProblem.accessorCandidates.map((a) => ({
        file: target.file,
        startLine: a.startLine ?? target.startLine,
        endLine: a.endLine ?? target.endLine,
        symbol: a.name,
        role: "accessor candidato (miembro de aridad 0, visibilidad pública/ausente)",
      })),
      ...(singletonProblem.constructorCandidate
        ? [
            {
              file: target.file,
              startLine: singletonProblem.constructorCandidate.startLine ?? target.startLine,
              endLine: singletonProblem.constructorCandidate.endLine ?? target.endLine,
              symbol: singletonProblem.constructorCandidate.name,
              role: "constructor identificado",
            },
          ]
        : []),
      ...bypassFiles.slice(0, 10).map((f) => ({
        file: f,
        startLine: 1,
        endLine: 1,
        role: "cliente que construye directamente, puenteando el accessor candidato",
      })),
    ];

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Estado global oculto, difícil de testear/paralelizar; Singleton resuelve la unicidad pero introduce acoplamiento implícito.",
    });
  },
};
