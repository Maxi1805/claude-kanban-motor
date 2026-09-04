/**
 * *** OLA X, FRENTE B5 — EL ANCLA CAMBIA DE `speculative-abstraction` A
 * `duplication` *** El resto de este docstring (abajo) describe la lógica
 * ESTRUCTURAL de las tres formas, que no cambia una línea: `distinctPresets`/
 * `findPresetSiblingProblem`/`findSoloPrototypeCandidateFromGraph` nunca leen
 * nada del `Finding` ancla salvo `locations[*].file` (`candidateFiles()`,
 * al final del archivo) — el propio `prototype.test.ts` ya lo dejaba escrito
 * ("el (target, origin) que nombra NO se reutiliza como evidencia de
 * Prototype: sólo importa que `locations[*].file` apunte al archivo que el
 * test quiere que se examine"). Cambiar el ancla es, mecánicamente, cambiar
 * QUÉ ARCHIVOS se le ofrecen a esa lógica para examinar — nunca la lógica.
 *
 * POR QUÉ `speculative-abstraction` ERA UN ANCLA MALA, medido, no supuesto
 * (`COBERTURA-NIVEL-2.md`/`PLAN-INTENCIONES.md`, cierre Ola V/W, reproducido
 * de nuevo esta ola sobre click/nest/rubocop con el código sin tocar): sus
 * 44 hipótesis históricas en 13 repos son TODAS `ya-aplicado` — cero
 * recomendaciones — y **0 % de precisión en 17 juicios** [0 %, 18 %] al
 * nivel del PATRÓN. A nivel del SMELL, `speculative-abstraction` mide
 * "interfaz con un único implementador" — **una forma ESTRUCTURAL de
 * jerarquía ya completa**, no un smell de "acá falta copiar en vez de
 * reconstruir". Es, en el vocabulario del CONTEXTO de esta ola, casi
 * literalmente el caso que la regla "prohibido anclar en estructura" nombra
 * ("una interfaz con dos o más implementadores" es el ejemplo citado; UN
 * implementador es la misma familia de error, sólo del lado opuesto del
 * conteo). Reproducido en disco esta ola (`click`/`nest`/`rubocop`,
 * `dump-hallazgos.mts`): de 25 hallazgos `speculative-abstraction` en los
 * tres repos, sólo 3 producen SIQUIERA una hipótesis (el resto muere en
 * `distinctPresets`/candidateFiles sin encontrar ni una familia de hermanos
 * ni un auto-constructor), y las 3 son `ya-aplicado`.
 *
 * POR QUÉ `duplication` ES EL SMELL CORRECTO: la intención de Prototype (ver
 * más abajo, "crear un objeto nuevo COPIANDO uno existente, en vez de
 * reconstruirlo desde cero") tiene como smell-de-ausencia EXACTO "el mismo
 * ensamblado/preset de campos, copiado a mano en vez de clonado" — que es,
 * letra por letra, lo que `duplication.ts` ya detecta con fingerprinting
 * estructural (Baxter et al.) y, desde la Ola N (frente A4b), reconoce
 * explícitamente la forma "familia de CONTRATO" (hermanos que
 * implementan/extienden/satisfacen el MISMO símbolo — ver su docstring,
 * "OLA N, FRENTE A4b") — la MISMA población que `findPresetSiblingProblem`
 * busca por su cuenta agrupando por `superclass` textual, pero medida por un
 * detector con base real: 66 % de precisión (n=32) contra el 11 % (n=27) de
 * `speculative-abstraction`, y un volumen 6-7× mayor en los tres repos de
 * prueba (nest: 132 vs. 19; rubocop: 34 vs. 4; click: 9 vs. 2 — medido esta
 * ola, `dump-hallazgos.mts`). `duplication` es un SMELL, no una forma
 * estructural completa: señala código repetido que HOY existe y punto —
 * nunca "esta interfaz ya tiene dos implementadores", que sería estructura.
 *
 * REEMPLAZA, no agrega: mantener `speculative-abstraction` además no perdía
 * nada (era compatible), pero tampoco sumaba — su única contribución medida
 * son `ya-aplicado`, que no es cobertura (`w-cobertura-nivel2.mts`, regla 1
 * de la Ola W) — así que agregarlo de vuelta sería costo puro (otro barrido
 * `buildGraphFacts` por hallazgo, ver el cambio de caché más abajo) sin
 * beneficio medido. Si una ola futura mide que la forma "interfaz con un
 * único implementador" SÍ aporta algo distinto de `duplication`, agregarla
 * de vuelta es un cambio de una palabra en `anchors` — no una reescritura.
 *
 * COSTO — DOS cambios, no uno, y el segundo lo pidió la medición del primero.
 * (a) `buildGraphFacts` PASA A MEMOIZARSE POR IDENTIDAD DE GRAFO (ver más
 * abajo, mismo criterio que Ola V ya aplicó a `confidentEdges`): con
 * `speculative-abstraction` (volumen chico, 468 en el censo histórico) un
 * recorrido de grafo completo por hallazgo-ancla no dolía; con `duplication`
 * (volumen 3.107) sí — es EXACTAMENTE el antipatrón "un índice reconstruido
 * por hipótesis candidata" que `CONTEXTO.md` nombra (170 s de sobrecosto
 * medidos en la Ola V con tres índices así). (b) Con (a) puesto, medí el
 * costo real sobre `sqlalchemy` (el repo más denso en clases del subconjunto
 * de prueba) y seguía en **488 s** (contra 146 s sin el ancla nueva) — el
 * cuello real no era `buildGraphFacts`, era `findClassNode`/
 * `findSoloPrototypeCandidateFromGraph`, que recorrían `nodeById.values()`
 * — TODOS los nodos del grafo del repo — en cada llamada, para filtrar sólo
 * los 1-3 archivos que la ancla nombra. `GraphFacts` gana un segundo índice,
 * `classNodesByFile` (construido en la MISMA pasada de `graph.nodes` que ya
 * hacía (a), sin recorrido adicional), y las dos funciones pasan a leerlo en
 * vez de recorrer/filtrar/ordenar el grafo entero por llamada. Con las dos
 * cachés puestas: **ver el número final en el informe** (`ola-x/informes/
 * B5.md`) — medido, no estimado, sobre el mismo repo y el mismo hardware.
 *
 * ── OLA AB, FRENTE AB3 — EL GATE DE UBICACIÓN DEL CAMINO 1b (self-cloning-
 * solo), Y LA PREGUNTA "¿appliedState dice la verdad?" ──────────────────────
 * El encargo de la ola: 228 hipótesis históricas sobre los 13 repos (279 con
 * `corpus-app/`), **100 % `ya-aplicado`, CERO recomendaciones** — y la
 * pregunta previa a "¿se puede mejorar la precisión?": ¿el `ya-aplicado` es
 * HONESTO, o llama "ya aplicado" a código sin relación con el hallazgo que
 * lo ancló? Re-contado esta ola sobre un volcado del día (`w-cobertura-
 * nivel2`-compatible, `x-b1-dump-arbitraje.mts`): **el 100 % de las 237+
 * hipótesis muestreadas sale por el camino "self-cloning-solo"** (0 por
 * "hermanos-preset") — o sea que la ÚNICA función que corre en producción
 * hoy para esta ancla es el fallback (1b) de más abajo (y, cuando (1b) no
 * resuelve, el camino (2) puro-grafo, sin tocar esta ola — ver su docstring).
 *
 * EL DEFECTO, verificado ABRIENDO ARCHIVOS REALES, no leyendo el detector:
 * (1b), tal como estaba, ignoraba POR COMPLETO en qué línea el ancla
 * `duplication` señaló su copia — recorría TODAS las clases del archivo
 * (orden alfabético) y devolvía la primera con constructor + CUALQUIER
 * miembro auto-constructor, sin importar si ese miembro tenía algo que ver
 * con el fragmento duplicado. Dos casos, con `id` de hallazgo y línea real:
 * `guava/guava/src/com/google/common/collect/ImmutableSet.java` —
 * `duplication:0Cy7CnFQ6JjQsIkp` ("2 fragmentos idénticos de 37 líneas",
 * `ImmutableSetHashFloodingDetectionBenchmark.java:152` ↔ `ImmutableSet.
 * java:836`, el algoritmo `hashFloodingDetected`) reportaba `ya-aplicado`
 * señalando `JdkBackedSetBuilderImpl#copy` en la línea 887-931 — una clase
 * interna DISTINTA, sin relación alguna con el algoritmo de detección de
 * flooding que el hallazgo señaló. `sqlalchemy/lib/sqlalchemy/orm/
 * decl_api.py` — los dos `duplication` de ese archivo apuntan a las líneas
 * 546 y 1417/1436; la hipótesis reportaba `ya-aplicado` sobre
 * `_stateful_declared_attr#_stateful` en la línea 470-479, otra vez sin
 * relación con el fragmento señalado. **El patrón se repitió en el 100 % de
 * la muestra abierta a mano** (guava ×2, sqlalchemy, cobra, newtonsoft-json,
 * nest — ver el informe de la ola, `ola-ab/informes/AB3.md`, con cita
 * archivo:línea de cada caso). Además, varios de los "miembros auto-
 * constructores" que este camino elegía eran MÉTODOS DE FÁBRICA ESTÁTICOS
 * (`JsonReaderException.Create`, `ExternalContextCreator.fromContainer`) —
 * el defecto semántico que el `toConfirm` de este archivo ya declaraba sin
 * gatear (ver más abajo, "3/3 positivos reales de guava eran fábricas
 * estáticas") — pero el defecto de UBICACIÓN es el que domina: sin él, la
 * pregunta de fábrica-vs-clon ni siquiera llega a plantearse, porque el
 * miembro reportado no tiene relación con el hallazgo en absoluto.
 *
 * EL ARREGLO: `anchorRanges` (`build()`, vía `anchorRangesInFile`) — los
 * rangos [startLine,endLine] que el propio `Finding` ancla señaló en ESE
 * archivo — pasa a ser un GATE (no evidencia) en (1b): sólo cuenta como
 * auto-constructor un miembro cuyo cuerpo se SOLAPA con una de esas líneas
 * (`overlapsAnyRange`). Alcance DELIBERADAMENTE ACOTADO: (1a) hermanos-
 * preset no se toca (nunca disparó en la población medida — 0/237 — así que
 * restringirlo no está medido, y esta ola no extrapola sobre lo no medido,
 * regla de método 1 de `CONTEXTO.md`); el camino (2) puro-grafo tampoco se
 * toca (nodos sintéticos de grafo no siempre traen `startLine`/`endLine` —
 * ver `graph/types.ts#CodeGraphNode` — y es sólo el respaldo de cuando (1)
 * no resuelve ningún archivo, no la vía dominante desde R1). El
 * antes/después medido, con el mismo volcado del día, está en el informe.
 *
 * Prototype — Ola 10 (relanzamiento), CONTRATO-F10.md, "las tres formas de
 * un patrón, el tuyo y nada más". Reemplaza/extiende la migración F6 previa
 * (`pattern-structural.ts#detectPrototypeOpportunities`, ver el historial de
 * este archivo para el razonamiento original de esa migración, que sigue
 * válido para la forma AUSENTE).
 *
 * ── LAS TRES FORMAS, TAL COMO LAS PIDE EL ENCARGO ─────────────────────────
 *
 *   AUSENTE   — "Lo de hoy": `speculative-abstraction` como ancla + ≥2
 *               hermanos que comparten superclase textual, ambos con
 *               constructor, y difieren en ≥2 campos-preset literales
 *               (`distinct-presets`, SIN CAMBIOS respecto de F6).
 *
 *   COMPLETA  — NUEVA, vía GRAFO: P (class-like) declara un miembro
 *               function-like `m` de aridad 0 o 1 cuyo cuerpo tiene
 *               `sym:P.m --instantiates--> sym:P` (auto-construcción,
 *               NUNCA por nombre — reemplaza el `CLONE_METHOD_NAME` de la
 *               vía vieja, ver más abajo). Se enriquece (nunca se EXIGE,
 *               ver la nota de ambigüedad más abajo) con: (a) ≥1 cliente
 *               que usa `calls` hacia `sym:P.m` en vez de `instantiates`
 *               hacia `P` directamente, y (b) si existe `I` con
 *               `implements|satisfies` desde `P` que declara ese mismo
 *               `(name, arity)` (vía `memberSignatures`), el protocolo de
 *               clonado queda FORMALIZADO — reemplaza el chequeo léxico
 *               `CLONE_PROTOCOL_NAMES` (clone/dup/Clone/__copy__/
 *               __deepcopy__/initialize_copy) que tenía esta misma versión
 *               F6 del archivo.
 *
 *   PARCIAL   — dos variantes, ambas reconocidas:
 *               (a) "el parcial de hoy": entre los hermanos de una MISMA
 *                   familia (`bySuperclass`), ≥1 ya se auto-construye y ≥1
 *                   no (`withClone` entre 1 y n-1) — sin cambios de F6.
 *               (b) NUEVA: TODOS los hermanos se auto-construyen, pero con
 *                   `(name, arity)` DISTINTOS entre sí y sin una interfaz
 *                   común que los unifique — el protocolo existe DE HECHO
 *                   pero no está formalizado (cada hermano inventó su
 *                   propio nombre de método de clonado).
 *
 * ── LA AMBIGÜEDAD DEL ENCARGO, RESUELTA Y DECLARADA (requisito 3) ─────────
 * El texto del encargo describe COMPLETA con tres cláusulas separadas por
 * `;`: la auto-construcción, el uso por un cliente vía `calls`, y (sólo
 * ésta con "si") la interfaz común. Leídas como TRES REQUISITOS DUROS, la
 * forma sería irreproducible sobre la fixture canónica de este patrón
 * (`tests/fixtures/patterns/prototype/*`): una clase `Shape` AISLADA, sin
 * ningún cliente en el mismo archivo y sin interfaz alguna — verificado
 * leyendo los 5 archivos antes de escribir una línea de código. Exigir
 * cliente+interfaz como GATE haría que el requisito 4 del encargo ("tu
 * hipótesis tiene que dar `ya-aplicado` sobre la tuya, jamás silencio")
 * fuera estructuralmente imposible de cumplir sobre esa fixture. Se
 * resuelve así, declarado, no adivinado: la auto-construcción estructural
 * es el ÚNICO gate de `appliedState` (igual que ya lo era en F6, ahora vía
 * grafo en vez de sólo texto); el uso por un cliente y la interfaz común
 * son EVIDENCIA — un check `applied` informativo y un discriminador,
 * respectivamente — nunca condiciones de las que depender para no caer en
 * silencio. Mismo criterio que este archivo ya aplicaba en F6 para
 * `named-like-clone-protocol` ("discriminador, nunca un requisito").
 *
 * ── EL EXCLUDER DEJA DE MIRAR VOCABULARIO (requisito 2) ───────────────────
 * F6 ya había resuelto la mitad de esto: `self-constructing-member`
 * (`constructedType`/`CONSTRUCTS_TYPE`) mira si el CUERPO construye una
 * instancia de la MISMA clase — estructural, no una lista de nombres. Lo
 * que SÍ era léxico en F6 era el discriminador `named-like-clone-protocol`
 * (`CLONE_PROTOCOL_NAMES`: clone/dup/Clone/__copy__/__deepcopy__/
 * initialize_copy) — reemplazado acá por `clone-protocol-declared`, que
 * consulta `implements|satisfies` + `memberSignatures` (el hecho que pide
 * el encargo) en vez de una lista de sinónimos.
 *
 * Además, `self-constructing-member` mismo se refuerza: antes sólo miraba
 * el TEXTO del cuerpo (`CONSTRUCTS_TYPE`, una regex). Ahora consulta
 * PRIMERO la arista `instantiates` real del grafo
 * (`sym:P.m --instantiates--> sym:P`, vía `graph: CodeGraph`) — la vía que
 * pide el encargo — y usa el texto como RESPALDO, nunca al revés: esta
 * misma ola midió (`wrapping-chain.ts`, `composite.ts`) que la resolución
 * de aristas por RECEPTOR falla en producción en los 8 repos; `instantiates`
 * es una relación por NOMBRE (más simple), así que se espera mejor tasa de
 * acierto, pero no perfecta, y el texto es la red de seguridad declarada
 * (nunca oculta) para cuando el grafo no la resuelve. `CONSTRUCTS_TYPE`
 * también gana una forma más: la llamada DESNUDA `Shape(...)` (sin `new`),
 * el único idioma de auto-construcción que Python conoce — sin ella, la
 * fixture canónica de Python jamás pasaba (verificado: la regex vieja no
 * tiene ninguna alternativa sin `new`/`.new`/`New`/`&`).
 *
 * ── SEGUNDO PROBLEMA QUE ESTO ABRE Y CIERRA: LA FAMILIA DE TAMAÑO 1 ───────
 * La arquitectura F6 (`findPresetSiblingProblem`) exige ≥2 hermanos que
 * comparten una MISMA superclase textual — no hay forma de que una clase
 * AISLADA (sin `extends`, como la fixture canónica) entre siquiera al
 * `required` (`distinct-presets` nunca puede ser cierto con una única
 * combinación posible). La forma COMPLETA del encargo, en cambio, describe
 * una ÚNICA clase `P` — no una familia. Se resuelve con un segundo camino,
 * independiente del agrupamiento por superclase:
 *   1. `findPresetSiblingProblem` (AST, sin cambios de fondo) intenta
 *      primero el agrupamiento por hermanos; si no encuentra nada, cae a un
 *      fallback de "familia de 1": cualquier clase con constructor Y un
 *      miembro auto-constructor (grafo o texto) es un candidato válido por
 *      sí sola. `distinct-presets` se redefine para dar por cumplida esta
 *      condición cuando `siblings.length <= 1` (no hay hermanos con quién
 *      comparar presets — no es la vía de la duplicación, es reconocimiento
 *      estructural directo).
 *   2. `findSoloPrototypeCandidateFromGraph` — NUEVO, funciona SIN árbol
 *      vivo (a diferencia de (1)), consultando `graph: CodeGraph`
 *      directamente. Hasta R1 (`RAICES.md`) era el único de los dos que
 *      podía correr de verdad en producción para esta ancla, porque
 *      `ctx.fileAt` era SIEMPRE `null` acá (ver "LÍMITE HEREDADO", más
 *      abajo — R1 lo cerró, ya no describe el árbol de hoy). `build()`
 *      intenta (1) primero (con árbol vivo, ahora real en producción
 *      también) y cae a (2) si no hay árbol para ningún archivo candidato.
 *
 * `needs` PIERDE `"herencia"`: la forma COMPLETA/PARCIAL(b) de una clase
 * aislada NO necesita que el lenguaje tenga herencia en absoluto — es
 * self-construcción, ortogonal a subclases. Mantenerlo como requisito sólo
 * bloqueaba genéricamente cualquier lenguaje sin ese concepto (aunque HOY,
 * verificado, TypeScript/JavaScript/Vue/Ruby/Python sí lo derivan — el bug
 * de `deriveCapabilities` que la versión F6 de este archivo documentaba ya
 * está resuelto en `detect/capabilities.ts` vía `HERITAGE_WORD`/
 * `hasPositionalChildOfType`, verificado leyendo ese archivo antes de
 * escribir esto). La vía AUSENTE (hermanos por superclase) sigue sin poder
 * disparar en un lenguaje sin herencia real en el código analizado, porque
 * `c.superclass` nunca se puebla ahí — el gate de capacidad ya no hacía
 * falta para eso, la propia extracción ya lo filtra.
 *
 * ── LÍMITE HEREDADO DE `run.ts`, IGUAL QUE EN F6 — CERRADO POR R1 ─────────
 * HASTA R1 (`RAICES.md`): `ctx.fileAt`/`ctx.file` eran SIEMPRE `null` en el
 * cableado de `crossAnalyze` para esta ancla (`speculative-abstraction` es
 * `inter-file`), así que el camino (1) de arriba SIEMPRE devolvía `null` en
 * producción — no una regresión de esta tarea, la MISMA que F6 ya
 * documentaba, y sólo el camino (2) (`findSoloPrototypeCandidateFromGraph`)
 * podía producir una hipótesis real.
 *
 * DESDE R1: `crossAnalyze` reparsea bajo demanda (`code-analyzer.ts#
 * resolveLiveFileUnit`) cada archivo que la evidencia de un `Finding`
 * `inter-file` toca, y `hypotheses/run.ts` ya no fuerza `ctx.file` a `null`
 * por `finding.language` — el camino (1) corre con árbol vivo en producción.
 * Medido sobre el Rails (466 archivos, 4 `speculative-abstraction`
 * vigentes): las 7 `candidateFiles` resuelven con árbol vivo las 7 veces.
 * Sigue dando 0 candidatos ahí (ninguna tiene hermanos-preset reales por
 * AST ni por grafo), pero ahora es un resultado de CONTENIDO — el camino
 * miró con datos reales y no encontró — no de plomería.
 *
 * ── VERIFICACIÓN CONTRA LAS 101 FIXTURES CANÓNICAS (requisito 4) ──────────
 * `tests/fixtures/patterns/prototype/*` (idéntico, verificado con `diff -rq`,
 * al corpus de referencia de la tarea) es una única clase `Shape` AISLADA en
 * los 5 lenguajes, sin cliente ni interfaz en el archivo — por diseño de la
 * fixture, el ancla real `speculative-abstraction` JAMÁS tiene una ubicación
 * en ese archivo (no hay ningún `extends`/`implements` ahí), así que ni
 * siquiera el camino (2) puede alcanzarla corriendo `analyzeRepo` de punta a
 * punta sobre `tests/fixtures/patterns/` completo (confirmado: no hay clave
 * `prototype/*.ts|patron:Prototype` en `tests/golden/fixtures-multi.census.json`
 * hoy, y ningún finding de `speculative-abstraction` nombra un archivo de
 * `prototype/`). Esto es una propiedad de la FIXTURE (deliberadamente
 * aislada) y del detector ancla, no un defecto de este archivo — declarado,
 * no escondido. La verificación (`prototype.test.ts`, describe "fixtures
 * canónicas") invoca `hypothesis.build()` DIRECTAMENTE con un ancla sintética
 * apuntando al archivo de la fixture (mismo patrón que el resto de este
 * archivo ya usaba en F6 para probar la lógica aislada de su wiring de
 * producción) — 5/5 lenguajes dan `ya-aplicado`, nunca sugerencia ni null.
 *
 * ── `aplicado-eludido`: SIGUE SIN PRODUCIRSE, DECLARADO (sin cambios) ─────
 * Ver la nota que F6 ya dejó: haría falta inspeccionar los ARGUMENTOS de un
 * sitio de instanciación externo, dato que ninguna arista tipada carga hoy.
 *
 * ── FORMA EN LENGUAJES SIN CLASES (sin cambios de fondo) ──────────────────
 * `needs: ["unidad-tipo-clase"]`. Go queda no-aplicable: `type X struct` no
 * resuelve `hasField(node, "body")` en `code-grammar.ts#isClassLike`
 * (verificado leyendo ese archivo), así que Go nunca deriva
 * `"unidad-tipo-clase"` — no hace falta el gate de herencia para excluirlo,
 * ya lo excluye el único gate que le queda a esta hipótesis.
 */
import { walkTree } from "../detect/tree-walk.js";
import {
  ASSEMBLY_SITE_BUDGET,
  MIN_COINCIDENT_SLOTS,
  MIN_REBUILDING_PLACES,
  REPEATED_CONFIGURED_ASSEMBLY_KIND,
  assembledInsideOwnType,
  assemblyGraphFacts,
  assemblySitesOf,
  constructionSiteCount,
  copyProtocolExists,
  groupAssemblies,
  sharedAssemblyDoorReach,
  symbolNodeIdOf,
  type AssemblyGroup,
  type AssemblySite,
  type AssemblySlot,
} from "../detect/intra-file/repeated-configured-assembly.js";
import type { Anchor, AstNode, Finding, FileUnit, RoleLocation } from "../detect/types.js";
import type { DerivedNodeSets } from "../code-grammar.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { anchorNodeId, memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type GraphIndex } from "../graph/types.js";
import { build as engineBuild, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft, PatternState } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Vocabulario NATIVO del protocolo de constructor (mismo estatus que en F6:
 * `initialize`/`constructor`/`__init__` son mandatos del lenguaje/runtime,
 * no una convención de proyecto — NO es lo que el requisito 2 pide
 * reemplazar). El vocabulario de NOMBRES DE MÉTODO DE CLONADO
 * (`CLONE_PROTOCOL_NAMES` en la versión F6 de este archivo) SÍ era lo que
 * había que reemplazar, y se retira más abajo — ver `clone-protocol-declared`.
 * ──────────────────────────────────────────────────────────────────────── */
const CONSTRUCTOR_NAMES = new Set(["initialize", "constructor", "__init__", "new", "New"]);
const LITERAL_VALUE = /^(?:"[^"]*"|'[^']*'|`[^`]*`|-?\d+(?:\.\d+)?|true|false|nil|null|None|nullptr)$/i;
const FIELD_ASSIGN = /(?:\bthis\.|\bself\.|@|\b[a-z][a-zA-Z0-9]*\.)(\w+)\s*=\s*([^\n;]+)/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * OLA AB, FRENTE AB3 — ¿[start,end] se solapa con alguno de los rangos de
 * línea que el hallazgo-ANCLA (`duplication`) señaló en ESTE archivo?
 * Intervalo cerrado en ambos extremos (mismo criterio que el resto del
 * archivo usa para `startLine`/`endLine`). Ver el docstring de
 * `anchorRangesInFile` (más abajo, junto a `build()`) para POR QUÉ existe:
 * sin esto, el camino "familia de 1" (self-cloning-solo) reportaba CUALQUIER
 * clase ya-auto-constructora del archivo, sin relación con el fragmento que
 * el ancla señaló — verificado abriendo código real, no supuesto (ver el
 * informe de la ola).
 */
function overlapsAnyRange(start: number, end: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([s, e]) => start <= e && end >= s);
}

/**
 * OLA X, FRENTE B5 — BUG DE RAÍZ ENCONTRADO JUZGANDO LA MUESTRA NUEVA (regla
 * de la ola: "toda ola que suma población la juzga"), NO INTRODUCIDO por el
 * re-anclado pero SÍ multiplicado por él: `constructsOwnType` corría su regex
 * sobre `bodyText` CRUDO, sin distinguir código real de texto entre comillas.
 * Verificado abriendo el archivo real, dos casos, los dos con
 * `viaGraph: false` ("confirmado por texto — el grafo no tenía o no resolvió
 * esta arista", la prueba de que era la vía de texto la que mentía, no el
 * grafo): `sqlalchemy/lib/sqlalchemy/engine/base.py:3137` —
 * `def __repr__(self): return "Engine(%r)" % (self.url,)` — la cadena de
 * formato "Engine(" matcheaba `\bEngine\s*\(` sin que `Engine` construyera
 * nada; y `sqlalchemy/lib/sqlalchemy/sql/sqltypes.py:751-776` — el DOCSTRING
 * de `Float.__init__` incluye un ejemplo de uso, `Float(5).with_variant(...)`,
 * que matcheaba igual. Con `speculative-abstraction` (volumen chico) esto
 * pasaba pocas veces; con `duplication` (camino "self-cloning-solo", el que
 * más corre con el ancla nueva) una muestra de 10 hallazgos al azar de
 * `sqlalchemy` mostró la MISMA forma en los 10: el "miembro auto-constructor"
 * reportado nunca era el que de verdad razonaba sobre construcción, sino
 * cualquier método cuyo docstring/return-de-string mencionara el nombre de la
 * clase seguido de `(` — casi garantizado en Python, donde `__repr__`/
 * `__str__`/docstrings de estilo Sphinx nombran la clase constantemente.
 *
 * ARREGLO: `stripStringLiterals` reemplaza el CONTENIDO de toda cadena
 * (comillas simples/dobles/triples de Python, backticks) por relleno que no
 * puede matchear `ClassName(` — la regex de `constructsOwnType` corre sobre
 * el resultado, nunca sobre el texto crudo. No es AST-aware (no distingue un
 * COMENTARIO de código real — `#`, `//`, y el bloque `/` + `*` … `*` + `/` de
 * C-like siguen sin cubrirse, declarado, no escondido), pero cubre el caso
 * medido y dominante: las dos formas que motivaron el bug (docstring,
 * `__repr__`) son SIEMPRE cadenas.
 */
const STRING_LITERAL = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;

function stripStringLiterals(text: string): string {
  return text.replace(STRING_LITERAL, (m) => "·".repeat(m.length));
}

/**
 * OLA Z, FRENTE Z6 — EL SEGUNDO MEDIO DEL MISMO BUG, medido por Y4 (Ola Y):
 * el propio docstring de `stripStringLiterals` (arriba) ya declaraba el
 * límite ("no distingue un COMENTARIO de código real") como conocido y no
 * cubierto. Y4 lo midió a escala sobre los 88 `ya-aplicado` que juzgó a
 * mano: **7 de 88** son exactamente este defecto, con el caso canónico
 * verificado archivo:línea — `guava/.../ImmutableSet.java:508`,
 * `Builder#combine()`: el comentario de bloque
 * `/* ... ImmutableSortedSet.Builder (or vice versa). Certainly ... *\/`
 * matchea `\bBuilder\s*\(` (el espacio entre `Builder` y `(` alcanza —
 * `constructsOwnType` acepta `\s*`) sin que `combine()` construya nada.
 * `viaGraph: false` en el veredicto de Y4 es la prueba de que era la vía de
 * TEXTO la que mentía, mismo patrón que el bug de strings que esta función
 * hermana ya cerró.
 *
 * MISMO MECANISMO que `stripStringLiterals`: reemplaza el CONTENIDO del
 * comentario por relleno que no puede matchear `ClassName(`, corre DESPUÉS
 * de `stripStringLiterals` (nunca antes — un comentario con una URL
 * `http://...` en un STRING ya quedó en puntos por la pasada anterior, así
 * que su `//` no dispara acá; al revés, aplicar comentarios primero
 * arriesgaría cortar una cadena real que contuviera literalmente `//`).
 *
 * MARCADORES POR LENGUAJE, traducción y no decisión (mismo criterio que
 * `constructsOwnType` ya aplica para `&X{}`/`NewX(`/la llamada desnuda de
 * Python, un poco más abajo): `//` y el bloque `/` + `*` … `*` + `/` son
 * universales en la familia C-like que este archivo soporta
 * (java/csharp/go/javascript/typescript/tsx/vue) — pero Python usa `//`
 * como OPERADOR real de división entera (`a // b`), así que tratarlo como
 * comentario ahí cambiaría un falso POSITIVO conocido por un falso
 * NEGATIVO nuevo. `#` cubre python/ruby (ninguno de los dos tiene bloque
 * `/* *\/`; Ruby usa `=begin`/`=end`, fuera de alcance, declarado, no
 * escondido — igual de "no AST-aware" que el resto de este mecanismo). Sólo
 * los 9 lenguajes que `language-coverage.ts#LANGUAGES_MEASURED` mide están
 * en la tabla — `code-analyzer.ts` también declara `rust`/`elixir`
 * (comentarios `//`/`/* *\/` y `#` respectivamente, la misma familia), pero
 * ninguno de los dos tiene población de Prototype en el corpus/`corpus-app`
 * medido, así que agregarlos sería una traducción SIN un caso real contra
 * el cual verificarla — declarado, no cubierto, en vez de adivinado.
 */
const LINE_COMMENT_MARKER: Readonly<Record<string, string>> = {
  python: "#",
  ruby: "#",
  java: "//",
  csharp: "//",
  go: "//",
  javascript: "//",
  typescript: "//",
  tsx: "//",
  vue: "//",
};
const BLOCK_COMMENT_LANGUAGES = new Set(["java", "csharp", "go", "javascript", "typescript", "tsx", "vue"]);
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

function stripComments(text: string, language: string): string {
  let out = text;
  if (BLOCK_COMMENT_LANGUAGES.has(language)) {
    out = out.replace(BLOCK_COMMENT, (m) => "·".repeat(m.length));
  }
  const marker = LINE_COMMENT_MARKER[language];
  if (marker) {
    const re = new RegExp(`${escapeRegExp(marker)}[^\\n]*`, "g");
    out = out.replace(re, (m) => "·".repeat(m.length));
  }
  return out;
}

/**
 * ¿El cuerpo de un miembro construye una instancia de SU PROPIA clase
 * (`className`)? RESPALDO textual del hecho de grafo `instantiates` (ver
 * `analyzeMember` más abajo) — nunca la vía primaria cuando el grafo está
 * disponible y resuelve. Cuatro formas sintácticas, TODAS ancladas al mismo
 * `className` exacto (nunca un nombre genérico adivinado): `new X(`,
 * `X.new`, `NewX(` (idioma Go, aunque `instantiates` no cubre Go como
 * "class-like" — se deja por si acaso una gramática lo expone distinto),
 * `&X{` (Go struct literal) y, NUEVO respecto de F6, la llamada DESNUDA
 * `X(` — el único idioma de auto-construcción que Python conoce (`Shape(...)`,
 * sin `new`). Como las cuatro alternativas exigen el nombre EXACTO de la
 * clase (vía `escapeRegExp` + `\b`), la forma desnuda no es un riesgo de
 * "cualquier llamada a función parece un constructor": sólo dispara cuando
 * el identificador llamado es idéntico al de la clase contenedora. OLA X,
 * FRENTE B5: corre sobre `stripStringLiterals(bodyText)`, no sobre el texto
 * crudo — ver el docstring de esa función para el bug que esto cierra. OLA
 * Z, FRENTE Z6: y sobre `stripComments(…, language)` a continuación — ver
 * el docstring de esa función hermana para el segundo medio del mismo bug.
 */
function constructsOwnType(bodyText: string, className: string, language: string): boolean {
  const n = escapeRegExp(className);
  const re = new RegExp(`\\bnew\\s+${n}\\s*\\(|\\b${n}\\.new\\b|\\bNew${n}\\s*\\(|&${n}\\s*\\{|\\b${n}\\s*\\(`);
  return re.test(stripComments(stripStringLiterals(bodyText), language));
}

/**
 * Un miembro es constructor por DOS mecanismos independientes (mismo
 * criterio que `code-analyzer.ts#isConstructor`, replicado acá, sin cambios
 * de F6): (A) por NOMBRE (Ruby `initialize`, JS/TS/Vue `constructor`, Python
 * `__init__`); (B) por TIPO DE NODO (`sets.constructorNodes`, Java/C#'s
 * `constructor_declaration`, que nombran el constructor IGUAL que la clase).
 */
function isConstructorMember(member: RawMember, sets: DerivedNodeSets): boolean {
  return sets.constructorNodes.has(member.nodeType) || CONSTRUCTOR_NAMES.has(member.name);
}

function fieldAssignments(bodyText: string): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  FIELD_ASSIGN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIELD_ASSIGN.exec(bodyText))) {
    const field = m[1];
    const value = m[2];
    if (field && value) out.push({ field, value: value.trim() });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * HECHOS DE GRAFO — la vía que pide el encargo para la forma COMPLETA.
 * Mismo estilo que `hypotheses/wrapping-chain.ts`: un índice liviano sobre
 * `confidentEdges(graph)` (CONTRATO-F9.md §4.5: las `ambiguous` quedan
 * fuera de toda consulta por defecto), construido UNA vez por invocación de
 * `build()`, nunca cacheado entre invocaciones.
 * ──────────────────────────────────────────────────────────────────────── */
interface GraphFacts {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** Entrantes — necesario para "¿un cliente EXTERNO llama a este miembro?", que `wrapping-chain.ts` no necesitaba (sólo miraba salientes). */
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /**
   * OLA X, FRENTE B5 — segundo índice, mismo motivo que la memoización de
   * arriba: nodos `class-like` agrupados por `file`. Sin esto, `findClassNode`
   * y `findSoloPrototypeCandidateFromGraph` recorrían `nodeById.values()`
   * ENTERO (TODOS los nodos del grafo del repo, no sólo los del archivo
   * candidato) en cada llamada — con `speculative-abstraction` eso pasaba
   * pocas veces por corrida; con `duplication` pasa una vez por cada
   * hallazgo-ancla cuyo camino (1) no encontró nada, medido caro en
   * `sqlalchemy` (299 s vs. 146 s de referencia sin este índice, misma
   * corrida, mismo hardware). Construido en la MISMA pasada de `graph.nodes`
   * que ya hacía `buildGraphFacts`, sin recorrido adicional.
   */
  readonly classNodesByFile: ReadonlyMap<string, readonly CodeGraphNode[]>;
}

/**
 * OLA X, FRENTE B5 — memoizado por IDENTIDAD del grafo, mismo criterio que
 * `confident-edges.ts#CACHE` (Ola V): esto es una función PURA de
 * `graph.nodes`/`graph.edges`, y ningún `CodeGraph` ya ensamblado se muta en
 * sitio (mismo hecho que ese archivo ya documenta y en el que se apoya).
 * Antes de este cambio, `build()` reconstruía `GraphFacts` UNA VEZ POR
 * ARCHIVO CANDIDATO examinado (`findPresetSiblingProblem` la llama una vez,
 * `findSoloPrototypeCandidateFromGraph` otra) — con el ancla `speculative-
 * abstraction` (volumen histórico 468) el costo no se notaba; con `duplication`
 * (volumen 3.107, el nuevo ancla — ver el docstring del módulo) recorrer TODO
 * `graph.nodes`/`confidentEdges(graph)` por cada hallazgo-ancla es exactamente
 * el antipatrón "índice reconstruido por hipótesis candidata" que el CONTEXTO
 * de esta ola nombra (170 s de sobrecosto medidos en la Ola V con tres índices
 * así). `WeakMap` ⇒ la entrada muere con el grafo, cero retención entre
 * corridas — mismo argumento que el archivo hermano.
 */
const GRAPH_FACTS_CACHE = new WeakMap<CodeGraph, GraphFacts>();

function buildGraphFacts(graph: CodeGraph): GraphFacts {
  const cached = GRAPH_FACTS_CACHE.get(graph);
  if (cached) return cached;

  const nodeById = new Map<string, CodeGraphNode>();
  const classNodesByFile = new Map<string, CodeGraphNode[]>();
  for (const n of graph.nodes) {
    if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    if (n.kind === "symbol" && n.family === "class-like") {
      const list = classNodesByFile.get(n.file) ?? [];
      list.push(n);
      classNodesByFile.set(n.file, list);
    }
  }

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const from = edgesFrom.get(e.from) ?? [];
    from.push(e);
    edgesFrom.set(e.from, from);
    const to = edgesTo.get(e.to) ?? [];
    to.push(e);
    edgesTo.set(e.to, to);
  }
  const facts: GraphFacts = { nodeById, edgesFrom, edgesTo, classNodesByFile };
  GRAPH_FACTS_CACHE.set(graph, facts);
  return facts;
}

/** `GraphIndex` mínimo que `memberSignatures` necesita, sobre el `GraphFacts` local — mismo patrón que `wrapping-chain.ts#asGraphIndex`. */
function asGraphIndex(gf: GraphFacts): GraphIndex {
  return {
    nodeById: (id: string) => gf.nodeById.get(id) ?? null,
    edgesFrom: (id: string) => gf.edgesFrom.get(id) ?? [],
  };
}

/**
 * Nodo `class-like` de `file` cuyo ÚLTIMO segmento de `symbolPath` es
 * `className` — nunca se reconstruye el id a mano (un `symbolPath` puede
 * llevar namespace por delante). OLA X, FRENTE B5: busca en
 * `classNodesByFile.get(file)` (sólo las clases DE ESE ARCHIVO), no en
 * `nodeById.values()` entero (ver el docstring de `GraphFacts`).
 */
function findClassNode(gf: GraphFacts, file: string, className: string): CodeGraphNode | null {
  for (const n of gf.classNodesByFile.get(file) ?? []) {
    if (n.symbolPath[n.symbolPath.length - 1] === className) return n;
  }
  return null;
}

/** Nodo símbolo del miembro `name` de `classId`, leído de la MISMA arista `contains` que `memberSignatures` recorre — igual criterio que `wrapping-chain.ts#memberNodeId`. */
function findMemberNode(gf: GraphFacts, classId: string, name: string): CodeGraphNode | null {
  for (const e of gf.edgesFrom.get(classId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = gf.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) {
      return target;
    }
  }
  return null;
}

function hasEdgeKindTo(gf: GraphFacts, fromId: string, kind: EdgeKind, toId: string): boolean {
  return (gf.edgesFrom.get(fromId) ?? []).some((e) => e.kind === kind && e.to === toId);
}

/**
 * ¿Existe un `calls` HACIA `memberId` cuyo origen NO sea la propia clase
 * `classId` (ni un descendiente suyo por `contains`, p.ej. otro método de
 * la MISMA clase que se delega a sí mismo)? Ésta es la evidencia
 * ">=1 cliente usa calls hacia sym:P.m" del encargo — EVIDENCIA/enriquecimiento
 * (ver el docstring del módulo sobre por qué nunca es un gate).
 */
function hasExternalCallerTo(gf: GraphFacts, memberId: string, classId: string): boolean {
  const classNode = gf.nodeById.get(classId);
  const ownPath = classNode?.symbolPath ?? [];
  return (gf.edgesTo.get(memberId) ?? []).some((e) => {
    if (e.kind !== "calls") return false;
    const origin = gf.nodeById.get(e.from);
    if (!origin || !classNode) return false;
    if (origin.file !== classNode.file) return true; // otro archivo: sin duda externo
    if (ownPath.length === 0) return true; // clase de nivel de módulo sin symbolPath propio: cualquier otro símbolo es externo
    const isSelfOrDescendant = origin.symbolPath.length >= ownPath.length && ownPath.every((seg, i) => origin.symbolPath[i] === seg);
    return !isSelfOrDescendant;
  });
}

/**
 * ¿`classId` implementa/satisface una interfaz `I` que YA declara un miembro
 * con este mismo `(memberName, memberArity)` (vía `memberSignatures`)?
 * REEMPLAZA el chequeo léxico `CLONE_PROTOCOL_NAMES` (clone/dup/Clone/
 * __copy__/__deepcopy__/initialize_copy) de la versión F6 de este archivo —
 * requisito 2 del encargo, aplicado a MI patrón. `memberArity === null`
 * (aridad no resuelta) relaja el chequeo a sólo nombre, declarado en el
 * `evidence` del discriminador que lo consume.
 */
function interfaceDeclaresSameMember(gf: GraphFacts, classId: string, memberName: string, memberArity: number | null): boolean {
  const gi = asGraphIndex(gf);
  for (const e of gf.edgesFrom.get(classId) ?? []) {
    if (e.kind !== "implements" && e.kind !== "satisfies") continue;
    const sigs = memberSignatures(gi, e.to);
    if (sigs.some((s) => s.name === memberName && (memberArity === null || s.arity === null || s.arity === memberArity))) return true;
  }
  return false;
}

/** Resultado combinado (grafo + texto) de analizar UN miembro candidato de UNA clase. */
interface MemberVerdict {
  readonly selfConstructs: boolean;
  /** `true` ⇒ confirmado por la arista `instantiates` real del grafo (la vía que pide el encargo). `false` con `selfConstructs: true` ⇒ sólo el respaldo textual lo confirmó. */
  readonly viaGraph: boolean;
  readonly arity: number | null;
  readonly hasExternalCaller: boolean;
  readonly protocolDeclared: boolean;
}

const NO_GRAPH_VERDICT_BASE = { viaGraph: false, arity: null, hasExternalCaller: false, protocolDeclared: false } as const;

/**
 * El análisis unificado de UN miembro candidato — grafo primero, texto de
 * respaldo SIEMPRE disponible (no sólo cuando el grafo está ausente): esta
 * misma ola midió que la resolución de aristas por receptor falla en
 * producción (`wrapping-chain.ts`), así que el texto actúa de red de
 * seguridad ante una arista `instantiates` que el grafo no pudo resolver —
 * nunca al revés (el grafo no puede DESCARTAR lo que el texto confirma).
 */
function analyzeMember(gf: GraphFacts | null, file: string, className: string, member: RawMember, language: string): MemberVerdict {
  const viaText = constructsOwnType(member.bodyText, className, language);
  if (!gf) return { selfConstructs: viaText, ...NO_GRAPH_VERDICT_BASE };

  const classNode = findClassNode(gf, file, className);
  if (!classNode) return { selfConstructs: viaText, ...NO_GRAPH_VERDICT_BASE };

  const memberNode = findMemberNode(gf, classNode.id, member.name);
  if (!memberNode) return { selfConstructs: viaText, ...NO_GRAPH_VERDICT_BASE };

  const arity = memberNode.arity ?? null;
  // COMPLETA exige aridad 0 o 1 (el encargo, verbatim) — sólo cuando el grafo
  // SÍ sabe la aridad; si no la sabe (`null`), no se adivina, no se filtra.
  const arityOk = arity === null || arity === 0 || arity === 1;
  const viaGraph = arityOk && hasEdgeKindTo(gf, memberNode.id, "instantiates", classNode.id);
  return {
    selfConstructs: viaGraph || viaText,
    viaGraph,
    arity,
    hasExternalCaller: hasExternalCallerTo(gf, memberNode.id, classNode.id),
    protocolDeclared: interfaceDeclaresSameMember(gf, classNode.id, member.name, arity),
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Extracción AST — clases + miembros directos. Sin cambios de fondo
 * respecto de F6 (`extractClasses`/`collectMembers`/`extractSuperclassName`),
 * salvo que ya no calcula `constructedType` acá (se movió a `analyzeMember`).
 * ──────────────────────────────────────────────────────────────────────── */
interface RawMember {
  name: string;
  bodyText: string;
  startLine: number;
  endLine: number;
  nodeType: string;
}

interface RawClass {
  name: string;
  superclass: string | null;
  startLine: number;
  endLine: number;
  members: RawMember[];
}

function extractSuperclassName(node: AstNode): string | null {
  const direct = (node.childForFieldName("superclass") as AstNode | null)?.text;
  if (direct) {
    const cleaned = direct
      .replace(/^[<:]\s*/, "")
      .replace(/^extends\s+/, "")
      .trim();
    return cleaned || null;
  }
  const plural = (node.childForFieldName("superclasses") as AstNode | null)?.text;
  if (plural) {
    const inner = /\(([^)]+)\)/.exec(plural)?.[1] ?? plural;
    return inner.split(",")[0]?.trim() || null;
  }
  const bases = (node.childForFieldName("bases") as AstNode | null)?.text;
  if (bases) {
    const first = bases.replace(/^:\s*/, "").split(",")[0]?.trim();
    return first || null;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && /heritage/i.test(child.type)) {
      const m = /extends\s+([A-Za-z_$][\w$.]*)/.exec((child as AstNode).text);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function collectMembers(node: AstNode, sets: DerivedNodeSets, into: RawMember[]): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child) continue;
    if (sets.classNodes.has(child.type)) continue; // clase anidada: unidad propia, no miembro de ésta
    if (sets.functionNodes.has(child.type)) {
      const name = (child.childForFieldName("name") as AstNode | null)?.text ?? "(anónimo)";
      const body = (child.childForFieldName("body") as AstNode | null) ?? child;
      into.push({
        name,
        bodyText: body.text,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
        nodeType: child.type,
      });
      continue; // no bajar dentro del cuerpo de un método buscando más miembros
    }
    collectMembers(child, sets, into);
  }
}

function extractClasses(root: AstNode, sets: DerivedNodeSets): RawClass[] {
  const units: RawClass[] = [];
  walkTree(root, (node) => {
    if (!node.isNamed || !sets.classNodes.has(node.type)) return;
    const real = node as AstNode;
    const name = (real.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
    const members: RawMember[] = [];
    const body = (real.childForFieldName("body") as AstNode | null) ?? real;
    collectMembers(body, sets, members);
    units.push({
      name,
      superclass: extractSuperclassName(real),
      startLine: real.startPosition.row + 1,
      endLine: real.endPosition.row + 1,
      members,
    });
  });
  return units;
}

/* ────────────────────────────────────────────────────────────────────────
 * El problema tipado que ve el motor
 * ──────────────────────────────────────────────────────────────────────── */
interface SiblingUnit {
  name: string;
  ctorName: string;
  ctorStartLine: number;
  ctorEndLine: number;
  literalFields: ReadonlyMap<string, string>;
  hasExtraMembers: boolean;
  /** `null` ⇒ ningún miembro (aparte del constructor) se auto-construye. */
  selfConstructingMemberName: string | null;
  /** `null` = aridad no resuelta por el grafo (AST-only, o grafo sin ese dato). */
  selfConstructingMemberArity: number | null;
  /** `true` ⇒ confirmado por `sym:P.m --instantiates--> sym:P` real del grafo, no sólo por texto. */
  selfConstructingViaGraph: boolean;
  /** Evidencia — nunca gate, ver docstring del módulo. */
  hasExternalCaller: boolean;
  /** Evidencia — reemplaza `named-like-clone-protocol` (léxico). */
  protocolDeclaredViaInterface: boolean;
}

interface PrototypeProblem {
  file: string;
  /** Origen del candidato — determina el texto de `places`/`why`, no la lógica de `appliedState`. */
  origin: "hermanos-preset" | "self-cloning-solo";
  superclassName: string;
  superclassStartLine: number;
  superclassEndLine: number;
  /** ≥1: para `origin === "self-cloning-solo"` es SIEMPRE exactamente 1 (la propia clase, sin familia). */
  siblings: readonly SiblingUnit[];
  sharedLiteralFields: readonly string[];
}

type PrototypeGraph = CodeGraph | null;

/**
 * Construye el `SiblingUnit` de una clase ya sabida candidata (tiene ctor), a partir del análisis de miembro.
 *
 * `anchorRanges`, OLA AB/AB3: `null` ⇒ SIN restricción (camino 1a,
 * hermanos-preset — la familia entera ya se sabe candidata por compartir
 * superclase y presets distintos; restringir por línea ahí no está medido y
 * no se toca esta ola, ver el informe). Un array (aunque vacío) ⇒ SÓLO
 * cuenta como auto-constructor un miembro cuyo cuerpo se solapa con alguno
 * de esos rangos — la vía que usa el camino 1b (self-cloning-solo, ver
 * `findPresetSiblingProblem`).
 */
function buildSiblingUnit(c: RawClass, ctor: RawMember, gf: GraphFacts | null, file: string, language: string, literalFields: ReadonlyMap<string, string>, anchorRanges: readonly (readonly [number, number])[] | null): SiblingUnit {
  const nonCtorMembers = c.members.filter((m) => m !== ctor);
  let selfCtorMember: RawMember | null = null;
  let verdict: MemberVerdict | null = null;
  for (const m of nonCtorMembers) {
    if (anchorRanges && !overlapsAnyRange(m.startLine, m.endLine, anchorRanges)) continue;
    const v = analyzeMember(gf, file, c.name, m, language);
    if (v.selfConstructs) {
      selfCtorMember = m;
      verdict = v;
      break;
    }
  }
  const hasExtraMembers = nonCtorMembers.some((m) => m !== selfCtorMember);
  return {
    name: c.name,
    ctorName: ctor.name,
    ctorStartLine: ctor.startLine,
    ctorEndLine: ctor.endLine,
    literalFields,
    hasExtraMembers,
    selfConstructingMemberName: selfCtorMember?.name ?? null,
    selfConstructingMemberArity: verdict?.arity ?? null,
    selfConstructingViaGraph: verdict?.viaGraph ?? false,
    hasExternalCaller: verdict?.hasExternalCaller ?? false,
    protocolDeclaredViaInterface: verdict?.protocolDeclared ?? false,
  };
}

/**
 * Camino (1), AST — busca PRIMERO la forma "hermanos con presets" (AUSENTE,
 * sin cambios de fondo respecto de F6); si no encuentra ninguna familia así,
 * cae al fallback "familia de 1" (self-cloning-solo): cualquier clase con
 * constructor y un miembro auto-constructor (grafo o texto) es un candidato
 * por sí sola — la forma COMPLETA del encargo sobre una clase AISLADA como
 * la fixture canónica de este patrón.
 *
 * `anchorRanges`, OLA AB/AB3 — SÓLO se aplica al fallback (1b), ver su
 * docstring de más abajo y el de `overlapsAnyRange`/`anchorRangesInFile`.
 */
function findPresetSiblingProblem(classes: readonly RawClass[], file: string, language: string, sets: DerivedNodeSets, graph: PrototypeGraph, anchorRanges: readonly (readonly [number, number])[]): PrototypeProblem | null {
  const gf = graph ? buildGraphFacts(graph) : null;

  // ── (1a) hermanos-preset, por superclase textual compartida ──
  const bySuperclass = new Map<string, RawClass[]>();
  for (const c of classes) {
    if (!c.superclass) continue;
    const list = bySuperclass.get(c.superclass) ?? [];
    list.push(c);
    bySuperclass.set(c.superclass, list);
  }

  const superclassNames = [...bySuperclass.keys()].sort();
  for (const superclassName of superclassNames) {
    const siblingsRaw = bySuperclass.get(superclassName)!;
    if (siblingsRaw.length < 2) continue;

    const perUnit = siblingsRaw.map((c) => {
      const ctor = c.members.find((m) => isConstructorMember(m, sets));
      const assigns = ctor ? fieldAssignments(ctor.bodyText) : [];
      const literalEntries = assigns.filter((a) => LITERAL_VALUE.test(a.value));
      const literalFields = new Map(literalEntries.map((a) => [a.field, a.value] as const));
      return { c, ctor, literalFields };
    });
    if (perUnit.some((p) => !p.ctor || p.literalFields.size === 0)) continue;

    let common = new Set(perUnit[0]!.literalFields.keys());
    for (const p of perUnit.slice(1)) common = new Set([...common].filter((f) => p.literalFields.has(f)));
    if (common.size < 2) continue;
    const sharedLiteralFields = [...common].sort();

    const superclassUnit = classes.find((c) => c.name === superclassName);
    const siblings: SiblingUnit[] = perUnit.map(({ c, ctor, literalFields }) => buildSiblingUnit(c, ctor!, gf, file, language, literalFields, null));

    return {
      file,
      origin: "hermanos-preset",
      superclassName,
      superclassStartLine: superclassUnit?.startLine ?? siblingsRaw[0]!.startLine,
      superclassEndLine: superclassUnit?.endLine ?? siblingsRaw[0]!.endLine,
      siblings,
      sharedLiteralFields,
    };
  }

  // ── (1b) fallback "familia de 1" — self-cloning-solo, vía AST ──
  //
  // OLA AB, FRENTE AB3 — `anchorRanges` PASA A SER UN GATE ACÁ, no sólo
  // evidencia. ANTES: cualquier clase del archivo con ctor + UN miembro
  // auto-constructor EN CUALQUIER PARTE del archivo calificaba — sin mirar
  // si ese miembro tenía algo que ver con el fragmento que `duplication`
  // señaló. Medido abriendo código real (228 hipótesis históricas, 100 %
  // `ya-aplicado`, informe de la ola): el miembro reportado nunca coincidía
  // con las líneas del hallazgo-ancla en NINGUNO de los casos abiertos a
  // mano (`guava/ImmutableSet.java` — el auto-constructor reportado,
  // `JdkBackedSetBuilderImpl#copy`, no tiene relación con la duplicación de
  // 37 líneas del algoritmo de detección de "hash flooding" que ancló el
  // hallazgo; `sqlalchemy/decl_api.py` — mismo patrón con
  // `_stateful_declared_attr#_stateful` contra un `duplication` a 76/946
  // líneas de distancia). El gate exige que el propio miembro
  // auto-constructor se solape con una línea que el ANCLA señaló en este
  // archivo — la única forma de que "ya-aplicado" responda la pregunta que
  // el hallazgo hace, en vez de una pregunta distinta sobre el archivo.
  const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of sortedClasses) {
    const ctor = c.members.find((m) => isConstructorMember(m, sets));
    if (!ctor) continue;
    const nonCtorMembers = c.members.filter((m) => m !== ctor);
    const hasSelfConstruct = nonCtorMembers.some((m) => overlapsAnyRange(m.startLine, m.endLine, anchorRanges) && analyzeMember(gf, file, c.name, m, language).selfConstructs);
    if (!hasSelfConstruct) continue;

    const sibling = buildSiblingUnit(c, ctor, gf, file, language, new Map(), anchorRanges);
    return {
      file,
      origin: "self-cloning-solo",
      superclassName: c.name,
      superclassStartLine: c.startLine,
      superclassEndLine: c.endLine,
      siblings: [sibling],
      sharedLiteralFields: [],
    };
  }

  return null;
}

/**
 * Camino (2), GRAFO PURO — sin árbol vivo (a diferencia del camino (1)):
 * hasta R1 (`RAICES.md`) era el único que podía correr de verdad en
 * producción para esta ancla, porque `ctx.fileAt` era siempre `null` acá
 * pero `repo.graph` sí era real en `crossAnalyze`. Desde R1 el camino (1)
 * también corre con árbol vivo (ver docstring del módulo), así que éste
 * queda como RESPALDO cuando (1) no encuentra nada — sigue siendo la única
 * vía posible cuando no hay árbol (tests que llaman `build()` sin harness
 * de archivo, o un archivo cuyo reparseo bajo demanda falló). Escanea
 * directamente los nodos `class-like` del grafo cuyo archivo está entre
 * `filePaths` (los que nombra el ancla — reusado sólo para decidir QUÉ
 * mirar, igual que en F6), busca un miembro con `instantiates` hacia su
 * propia clase, y arma el mismo `PrototypeProblem` de "familia de 1" que
 * (1b) — sin texto de respaldo (no hay `bodyText` sin árbol), así que el
 * idioma sin sentinela de `instantiates` (Ruby/Python, ver
 * `graph/edges/instanciacion.ts`) no puede alcanzarse por ESTE camino
 * cuando (1) tampoco resolvió — declarado, no oculto.
 *
 * OLA X, FRENTE B5 — `classNodes` sale de `classNodesByFile` (ver el
 * docstring de `GraphFacts`), nunca de `[...gf.nodeById.values()].filter(...)`:
 * esta función es la que más se ejecuta con el ancla nueva (`duplication`,
 * volumen 6-7× mayor), y era la que más costaba — recorría y filtraba TODOS
 * los nodos del grafo del repo en cada llamada, cuando `filePaths` (los
 * archivos que nombra el hallazgo-ancla) son típicamente 1-3. Medido: 299 s
 * en `sqlalchemy` sin este índice, contra 146 s de referencia sin el ancla
 * nueva — con el índice puesto, ver el número final en el informe.
 *
 * OLA AB, FRENTE AB3 — MISMO GATE que (1b) (ver su docstring y el del
 * módulo, sección "OLA AB, FRENTE AB3"), y por la MISMA razón medida: sin
 * él, este camino reintroduce el defecto que (1b) arregla cada vez que (1)
 * no resuelve un candidato relevante para ALGÚN archivo mientras SÍ resuelve
 * el árbol vivo (medido en `cobra`: con el gate de (1b) puesto, (1) rechaza
 * correctamente `Command#InitDefaultHelpCmd` por no solaparse con ningún
 * `duplication` de `command.go` — pero como (1) termina devolviendo `null`
 * para TODOS los archivos candidatos, `build()` cae acá, que sin este mismo
 * gate volvía a encontrar el MISMO `InitDefaultHelpCmd` por el camino de
 * grafo puro). `anchorRangesByFile` viaja por archivo (esta función itera
 * `filePaths`, plural). `memberNode.startLine`/`endLine` PUEDEN faltar (nodo
 * sintético de grafo sin posición — no pasa en producción, sólo en fixtures
 * de test armadas a mano): sin línea, no hay evidencia para RECHAZAR, así
 * que viaja como el resto de este archivo trata lo ambiguo — sin filtrar
 * (mismo criterio que `arityOk` unas líneas más abajo en `analyzeMember`).
 */
function findSoloPrototypeCandidateFromGraph(graph: CodeGraph, filePaths: readonly string[], anchorRangesByFile: ReadonlyMap<string, readonly (readonly [number, number])[]>): PrototypeProblem | null {
  if (filePaths.length === 0) return null;
  const gf = buildGraphFacts(graph);
  const gi = asGraphIndex(gf);

  const classNodes = filePaths
    .flatMap((f) => gf.classNodesByFile.get(f) ?? [])
    .sort((a, b) => (a.file === b.file ? a.symbolPath.join(".").localeCompare(b.symbolPath.join(".")) : a.file.localeCompare(b.file)));

  for (const classNode of classNodes) {
    const members = memberSignatures(gi, classNode.id);
    const ranges = anchorRangesByFile.get(classNode.file) ?? [];
    for (const m of members) {
      if (m.arity !== null && m.arity !== 0 && m.arity !== 1) continue; // COMPLETA exige aridad 0 o 1
      const memberNode = findMemberNode(gf, classNode.id, m.name);
      if (!memberNode) continue;
      if (memberNode.startLine !== undefined && memberNode.endLine !== undefined && ranges.length > 0 && !overlapsAnyRange(memberNode.startLine, memberNode.endLine, ranges)) continue;
      if (!hasEdgeKindTo(gf, memberNode.id, "instantiates", classNode.id)) continue;

      const className = classNode.symbolPath[classNode.symbolPath.length - 1] ?? "(anónima)";
      const sibling: SiblingUnit = {
        name: className,
        ctorName: "(constructor, no resuelto sin árbol)",
        ctorStartLine: classNode.startLine ?? 1,
        ctorEndLine: classNode.startLine ?? classNode.endLine ?? 1,
        literalFields: new Map(),
        hasExtraMembers: false,
        selfConstructingMemberName: m.name,
        selfConstructingMemberArity: m.arity,
        selfConstructingViaGraph: true,
        hasExternalCaller: hasExternalCallerTo(gf, memberNode.id, classNode.id),
        protocolDeclaredViaInterface: interfaceDeclaresSameMember(gf, classNode.id, m.name, m.arity),
      };
      return {
        file: classNode.file,
        origin: "self-cloning-solo",
        superclassName: className,
        superclassStartLine: classNode.startLine ?? 1,
        superclassEndLine: classNode.endLine ?? classNode.startLine ?? 1,
        siblings: [sibling],
        sharedLiteralFields: [],
      };
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Checks
 * ──────────────────────────────────────────────────────────────────────── */
const distinctPresets: Check<PrototypeProblem, PrototypeGraph> = {
  id: "distinct-presets",
  describe: "Los hermanos difieren en al menos uno de los campos-preset compartidos (no son duplicados idénticos) — vacuamente cumplido para un candidato de una sola clase.",
  run(problem) {
    if (problem.siblings.length <= 1) {
      return {
        holds: true,
        evidence:
          "Candidato de una sola clase (reconocimiento estructural directo — vía self-constructing-member, no la vía de duplicación de hermanos-preset): no hay familia con la que comparar presets, así que esta condición no aplica y se da por cumplida.",
      };
    }
    const combos = problem.siblings.map((s) => problem.sharedLiteralFields.map((f) => s.literalFields.get(f)).join("|"));
    const distinctCount = new Set(combos).size;
    const distinct = distinctCount > 1;
    return {
      holds: distinct,
      evidence: distinct
        ? `${distinctCount} combinación(es) distinta(s) de (${problem.sharedLiteralFields.join(", ")}) entre ${problem.siblings.length} hermanos.`
        : `Los ${problem.siblings.length} hermanos fijan EXACTAMENTE los mismos valores de (${problem.sharedLiteralFields.join(", ")}) — son duplicados, no presets distintos; Extract Superclass alcanza, Prototype no aporta acá.`,
    };
  },
};

const threeOrMoreSiblings: Check<PrototypeProblem, PrototypeGraph> = {
  id: "three-or-more-siblings",
  describe: "≥3 hermanos con el mismo preset shape (más allá del mínimo de 2).",
  run(problem) {
    return { holds: problem.siblings.length >= 3, evidence: `${problem.siblings.length} hermano(s).` };
  },
};

const noExtraBehavior: Check<PrototypeProblem, PrototypeGraph> = {
  id: "no-extra-behavior",
  describe: "Ningún hermano tiene métodos propios más allá del constructor y (si lo tiene) su miembro auto-constructor — son presets puros o clones limpios, no clases con comportamiento real sin relación.",
  run(problem) {
    const withExtra = problem.siblings.filter((s) => s.hasExtraMembers);
    return {
      holds: withExtra.length === 0,
      evidence:
        withExtra.length === 0
          ? "Ningún hermano agrega métodos propios además del constructor/auto-constructor."
          : `${withExtra.length} hermano(s) con métodos propios además del constructor/auto-constructor: ${withExtra.map((s) => s.name).join(", ")} — evidencia más débil (podría ser una subclase con comportamiento genuino, no sólo un preset/clon).`,
    };
  },
};

/**
 * NUEVO — reemplaza `named-like-clone-protocol` (léxico: `CLONE_PROTOCOL_NAMES`
 * = clone/dup/Clone/__copy__/__deepcopy__/initialize_copy) de la versión F6
 * de este archivo. Requisito 2 del encargo: consulta `implements|satisfies`
 * + `memberSignatures` (el hecho de grafo que el encargo pide) en vez de una
 * lista de sinónimos de nombre.
 */
const cloneProtocolDeclared: Check<PrototypeProblem, PrototypeGraph> = {
  id: "clone-protocol-declared",
  describe:
    "El/los hermano(s) auto-constructores implementan/satisfacen una interfaz común que YA declara ese mismo (name, arity) — el protocolo de clonado está FORMALIZADO estructuralmente, no sólo aplicado ad hoc. Reemplaza el chequeo léxico anterior (CLONE_PROTOCOL_NAMES).",
  run(problem) {
    const withClone = problem.siblings.filter((s) => s.selfConstructingMemberName !== null);
    const declared = withClone.filter((s) => s.protocolDeclaredViaInterface);
    return {
      holds: declared.length > 0,
      evidence:
        declared.length > 0
          ? `${declared.map((s) => `${s.name}#${s.selfConstructingMemberName}`).join(", ")} implementa(n)/satisface(n) una interfaz que ya declara ese mismo miembro — protocolo de clonado formalizado.`
          : "Ningún hermano auto-constructor tiene, en el grafo, una interfaz común que declare ese mismo (nombre, aridad) — el protocolo, si existe, no está formalizado.",
    };
  },
};

/**
 * El excluder ESTRUCTURAL — decide `state`. Sin cambios de FORMA respecto
 * de F6 (0/N ⇒ `ausente`; N/N ⇒ `ya-aplicado`/`parcial` según consistencia;
 * en el medio ⇒ `parcial`), pero la N/N ahora se subdivide: si TODOS los
 * hermanos se auto-construyen pero con `(name, arity)` DISTINTOS entre sí,
 * el protocolo existe DE HECHO y no está formalizado/unificado — es la
 * variante (b) de PARCIAL que pide el encargo, no `ya-aplicado`.
 */
function appliedState(problem: PrototypeProblem): AppliedStateResult {
  const withClone = problem.siblings.filter((s) => s.selfConstructingMemberName !== null);

  let state: PatternState;
  if (withClone.length === 0) {
    state = "ausente";
  } else if (withClone.length < problem.siblings.length) {
    state = "parcial";
  } else {
    const first = withClone[0]!;
    const consistent = withClone.every(
      (s) =>
        s.selfConstructingMemberName === first.selfConstructingMemberName &&
        (s.selfConstructingMemberArity === null || first.selfConstructingMemberArity === null || s.selfConstructingMemberArity === first.selfConstructingMemberArity),
    );
    state = consistent ? "ya-aplicado" : "parcial";
  }

  const structuralCheck = {
    label: "self-constructing-member (algún hermano ya se auto-construye — instantiates hacia sí mismo en el grafo, con texto como respaldo declarado)",
    passed: withClone.length > 0,
    why:
      withClone.length > 0
        ? `${withClone.length}/${problem.siblings.length} hermano(s) ya tienen un miembro (aparte del constructor) que construye una instancia de SU PROPIA clase: ${withClone
            .map((s) => `${s.name}#${s.selfConstructingMemberName}${s.selfConstructingViaGraph ? " (confirmado por instantiates del grafo)" : " (confirmado por texto — el grafo no tenía o no resolvió esta arista)"}`)
            .join(", ")}.` +
          (state === "parcial" && withClone.length === problem.siblings.length
            ? ` Todos los hermanos se auto-construyen pero con nombres/aridades distintos entre sí (${withClone.map((s) => `${s.selfConstructingMemberName}/${s.selfConstructingMemberArity ?? "?"}`).join(", ")}) — el protocolo existe de hecho, no está unificado.`
            : "")
        : "Ningún hermano tiene un miembro (aparte del constructor) que construya una instancia de su propia clase.",
    role: "applied" as const,
  };

  // Evidencia, NUNCA gate (ver el docstring del módulo sobre la ambigüedad
  // del encargo) — informa si ALGÚN cliente ya consume el protocolo vía
  // `calls` en vez de instanciar `P` directamente.
  const consumptionCheck = {
    label: "client-uses-clone-protocol (¿un cliente EXTERNO invoca el miembro auto-constructor vía calls, en vez de instanciar P directamente?)",
    passed: withClone.some((s) => s.hasExternalCaller),
    why: withClone.some((s) => s.hasExternalCaller)
      ? `Al menos un cliente externo llama al miembro auto-constructor de ${withClone
          .filter((s) => s.hasExternalCaller)
          .map((s) => s.name)
          .join(", ")} vía \`calls\` — el protocolo de clonado no es sólo capacidad sin usar.`
      : "Ningún cliente externo detectado (en el grafo disponible) invocando el miembro auto-constructor — puede ser evidencia incompleta (grafo parcial) o capacidad todavía sin consumidores.",
    role: "applied" as const,
  };

  return { state, checks: [structuralCheck, consumptionCheck] };
}

/**
 * Ola 11a — P4, RE-ANCLADO Ola X/B5 de `speculative-abstraction` a
 * `duplication` (ver el docstring del módulo) — el ancla sigue siendo
 * `inter-file` (`Finding.language` siempre `null`), así que ÉSTA sigue
 * siendo la llamada (2) de `hypotheses/run.ts` (desde `crossAnalyze`):
 * `ctx.neighborhood` llega REAL (no `EMPTY_NEIGHBORHOOD`), sin necesitar
 * `refresh()` — mismo hecho que `abstract-factory.ts` ya explota para
 * `crossFamilyRelation`.
 *
 * `countOfKind("duplication")` (sin contar este mismo `Finding`, ver
 * `neighborhood.ts#countOfKind`) responde la MISMA pregunta que antes hacía
 * sobre `speculative-abstraction`, con el ancla nueva: ¿este fragmento
 * copiado es un caso puntual, o el repo TIENE el hábito de duplicar código en
 * vez de extraer una abstracción compartida? Un hábito repetido es más
 * compatible con "acá también conviene colapsar en Prototype/clonado" que un
 * caso aislado, que podría ser una única coincidencia. NUNCA gate —
 * discriminador, mismo trato que el resto de la escalera de este archivo.
 */
function duplicationIsHabit(ctx: HypothesisContext): Check<PrototypeProblem, PrototypeGraph> {
  return {
    id: "duplication-es-habito-del-repo",
    describe:
      "El ancla `duplication` NO es un caso aislado: `ctx.neighborhood.countOfKind` encuentra al menos otro hallazgo del mismo kind en el repo — más compatible con un hábito real del código que con una coincidencia puntual.",
    run() {
      const count = ctx.neighborhood.countOfKind("duplication");
      const holds = count >= 1;
      return {
        holds,
        evidence: holds
          ? `${count} otro(s) hallazgo(s) de 'duplication' en el resto del repo (vecindario, sin contar éste) — el número mueve la lectura: este fragmento repetido es un HÁBITO del código, no un caso puntual, así que colapsarlo en Prototype/clonado es más defendible.`
          : "Ningún otro hallazgo de 'duplication' en el resto del repo (vecindario) — hasta donde el vecindario ve, este es un caso AISLADO de duplicación, no un hábito repetido del código.",
      };
    },
  };
}

/**
 * Ola 11a — P4: `ego(ancla, 1)` (vecindad indexada a 1 salto) cuenta cuántos
 * sitios DISTINTOS construyen `P` (`instantiates`, `TRUSTED_PROVENANCE`,
 * mismo criterio de confianza que `confidentEdges` ya aplica al resto del
 * archivo — nunca `ambiguous`/`inferred` decidiendo un discriminador). El
 * número mueve la conclusión en el sentido que pide el encargo: si sólo el
 * propio miembro auto-constructor construye `P` (fan-in = 1, "en uno solo"),
 * la abstracción puede sobrar — nadie MÁS se beneficia de clonar en vez de
 * construir. Si hay ≥2 sitios (el auto-constructor + al menos otro que
 * construye `P` directamente), el tipo se construye en efecto en varios
 * lugares — candidato real a colapsar esos sitios detrás de un clonado.
 * Complementa (no duplica) `client-uses-clone-protocol`: ese check mira
 * `calls` hacia el MIEMBRO auto-constructor (¿ya lo usan?); éste mira
 * `instantiates` hacia LA CLASE misma (¿cuántos sitios la construyen,
 * usen o no el miembro?).
 */
function constructedAtManySites(ctx: HypothesisContext): Check<PrototypeProblem, PrototypeGraph> {
  return {
    id: "construido-en-muchos-sitios",
    describe:
      "`ctx.neighborhood.ego(ancla, 1)`: ≥2 sitios distintos construyen (`instantiates`) el tipo directamente — candidato real a colapsar en un clonado, no una abstracción que sobra por usarse en un único sitio.",
    run(problem) {
      const anchor: Anchor = { file: problem.file, symbolPath: [problem.superclassName] };
      const ego = ctx.neighborhood.ego(anchor, 1);
      if (!ego) {
        return {
          holds: false,
          evidence: `sin vecindad de grafo disponible para "${problem.superclassName}" (\`ego\` devolvió null: sin grafo, o el ancla no tiene nodo) — no se pudo medir cuántos sitios lo construyen.`,
        };
      }
      const pId = anchorNodeId(anchor);
      const constructors = new Set<string>();
      for (const e of ego.edges) {
        if (e.kind !== "instantiates" || e.to !== pId || e.from === pId) continue;
        if (e.provenance === "ambiguous" || e.provenance === "inferred") continue; // mismo criterio de confianza que `confidentEdges` — nunca decidiendo un discriminador con ruido.
        constructors.add(e.from);
      }
      const holds = constructors.size >= 2;
      return {
        holds,
        evidence: holds
          ? `${constructors.size} sitio(s) distintos construyen "${problem.superclassName}" directamente (instantiates, ego a 1 salto) — el número mueve la conclusión: hay más de un lugar que se beneficiaría de clonar en vez de construir, no sólo el propio miembro auto-constructor.`
          : `Sólo ${constructors.size} sitio(s) construye(n) "${problem.superclassName}" directamente en la vecindad medida (ego a 1 salto) — si es nada más el propio miembro auto-constructor, la abstracción puede sobrar: ningún otro sitio del vecindario se beneficiaría de clonar en vez de construir.`,
      };
    },
  };
}

/**
 * P4 (Ola 11a): `speculativeAbstractionIsHabit`/`constructedAtManySites`
 * necesitan `ctx` (vecindario real) — mismo patrón que
 * `abstract-factory.ts#buildSpec`/`strategy.ts#buildSpec`: el spec se arma
 * por invocación de `build()`, no como objeto module-level.
 */
function buildSpec(ctx: HypothesisContext): HypothesisSpec<PrototypeProblem, PrototypeGraph> {
  return {
  pattern: "Prototype",
  // Mismo techo que F6 ya declaraba a mano (`pattern-structural.ts:642` en su momento).
  ceiling: "alta",
  // Perdió "herencia" respecto de F6 — ver docstring del módulo: la forma
  // COMPLETA/PARCIAL(b) (clase aislada) no depende de la herencia en absoluto.
  needs: ["unidad-tipo-clase"],
  required: [distinctPresets],
  discriminators: [threeOrMoreSiblings, noExtraBehavior, cloneProtocolDeclared, duplicationIsHabit(ctx), constructedAtManySites(ctx)],
  appliedState,
  toConfirm: [
    "Confirmar que de verdad son sólo presets (sin comportamiento propio real) y que STI/herencia no es ya la solución idiomática del framework (p.ej. ActiveRecord STI funcionando bien no es un problema a resolver).",
    "Si además existen ejes ORTOGONALES de variación (p.ej. tema × forma, no una única familia lineal de presets), la solución correcta podría ser Abstract Factory, no Prototype.",
    // NUEVO — encontrado verificando A MANO 3/3 positivos reales de guava
    // (`CycleDetectingLockFactory#newInstance`, `ClassPath#from`,
    // `TypeResolver#covariantly`): los tres son MÉTODOS DE FÁBRICA ESTÁTICOS
    // (Effective Java Item 1) que construyen una instancia FRESCA a partir de
    // parámetros — ninguno copia el ESTADO de una instancia existente. El
    // grafo no distingue "self-constructing member" (la forma que exige el
    // encargo) de "static factory method": ambos tienen EXACTAMENTE la misma
    // forma `sym:P.m --instantiates--> sym:P`, porque `instantiates` no lleva
    // si los argumentos de la llamada vienen de `this`/`self` (copia) o de
    // parámetros externos (fábrica). Confirmar leyendo el cuerpo si además
    // copia campos de OTRA instancia — si no, es más Factory Method que
    // Prototype, aunque estructuralmente indistinguible con los hechos de
    // grafo disponibles hoy.
    "Confirmar que el miembro auto-constructor copia el ESTADO de una instancia existente (this/self), no sólo construye una instancia nueva a partir de parámetros — un método de fábrica estático (Effective Java Item 1) tiene la MISMA forma de grafo (sym:P.m --instantiates--> sym:P) y no es distinguible de Prototype con los hechos disponibles hoy (verificado: 3/3 positivos reales de guava eran fábricas estáticas, no clonado de instancia).",
  ],
  source: "https://refactoring.guru/es/design-patterns/prototype",
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE12 — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA
 * (`repeated-configured-assembly`). **NO TOCA NI UNA LÍNEA DEL CAMINO VIEJO**:
 * todo lo de abajo vive detrás de `if (problem.kind ===
 * REPEATED_CONFIGURED_ASSEMBLY_KIND)` en `build()`, con su propio tipo de
 * problema, sus propios `required`, sus propios discriminadores y su propia
 * escalera de estado. El array `anchors` SUMA; no retira `duplication`.
 *
 * POR QUÉ EXISTE: el ancla `duplication` de este archivo produce, medido sobre
 * las dos poblaciones, **31 hipótesis y CERO recomendaciones — las 31
 * `ya-aplicado`, `ausente` = 0** (ver el informe `ola-ae/informes/AE12.md`,
 * §1, y el docstring del detector nuevo para la lectura en el código de por
 * qué es imposible por construcción). Este camino es el que puede decir
 * `ausente`.
 *
 * LA HIPÓTESIS NO LE CREE AL DETECTOR: re-deriva los grupos de armado desde el
 * ÁRBOL VIVO del archivo (`ctx.fileAt`) con las MISMAS funciones que el
 * detector exporta y el MISMO presupuesto, y elige el grupo cuyos sitios se
 * SOLAPAN con las líneas que el hallazgo-ancla señaló — el mismo mecanismo de
 * `anchorRanges` que la Ola AB tuvo que introducir acá mismo porque el camino
 * viejo reportaba un miembro sin relación con el fragmento anclado. Si no hay
 * árbol vivo, o si ningún grupo se solapa, devuelve `null`: nunca una
 * hipótesis armada sobre lo que no pudo mirar.
 * ════════════════════════════════════════════════════════════════════════ */

interface RebuiltAssemblyProblem {
  readonly file: string;
  readonly typeName: string;
  /** Puntos DISTINTOS que rearman (unidad `function-like` que envuelve, o declaración de nivel superior). */
  readonly places: readonly string[];
  readonly slotCount: number;
  /** Ranuras con el valor IDÉNTICO en todos los puntos — el estado inicial compartido. */
  readonly coincident: readonly { readonly key: string; readonly value: string }[];
  readonly varyingKeys: readonly string[];
  readonly siteLines: readonly (readonly [number, number])[];
  readonly ownerSymbolPaths: readonly (readonly string[])[];
  /**
   * Cuántos de los puntos llegan por `calls` a un símbolo ajeno que ya
   * construye el tipo. 0 ⇒ no hay ninguna puerta de armado; 1 ⇒ hay MEDIA
   * puerta. **≥2 es inalcanzable acá**: el detector se calla en ese caso
   * (condición R2, RESOLUCIÓN VERIFICADA).
   */
  readonly doorReach: number;
  /** Símbolos distintos del repo entero que construyen (`instantiates`) este tipo. */
  readonly constructionSitesInRepo: number;
  /** `true` ⇒ el grafo estuvo disponible para contestar `doorReach`/`constructionSitesInRepo`. */
  readonly graphSeen: boolean;
}

const rebuiltAtSeveralPlaces: Check<RebuiltAssemblyProblem, PrototypeGraph> = {
  id: "rearmado-en-varios-puntos",
  describe:
    "El MISMO armado configurado se vuelve a escribir entero en al menos tres PUNTOS distintos del archivo (unidades function-like distintas, o declaraciones de nivel superior distintas) — no en tres filas de una misma tabla de datos, que es un solo punto.",
  run(problem) {
    const holds = problem.places.length >= MIN_REBUILDING_PLACES;
    return {
      holds,
      evidence: holds
        ? `${problem.places.length} puntos distintos rearman "${problem.typeName}" por su cuenta: ${problem.places.join(", ")}.`
        : `Sólo ${problem.places.length} punto(s) rearma(n) "${problem.typeName}" — con menos de ${MIN_REBUILDING_PLACES} la mitigación más barata es extraer una función de construcción compartida, no abrir un prototipo clonable.`,
    };
  },
};

const sharedInitialState: Check<RebuiltAssemblyProblem, PrototypeGraph> = {
  id: "estado-inicial-compartido",
  describe:
    "Al menos tres ranuras del armado llevan EXACTAMENTE el mismo valor en todos los puntos — hay un estado inicial común, que es lo que un prototipo lleva puesto y una copia hereda sin volver a escribirlo.",
  run(problem) {
    const holds = problem.coincident.length >= MIN_COINCIDENT_SLOTS;
    return {
      holds,
      evidence: holds
        ? `${problem.coincident.length} de ${problem.slotCount} ranuras coinciden en los ${problem.places.length} puntos: ${problem.coincident.map((c) => `${c.key}=${c.value}`).join(", ")}.`
        : `Sólo ${problem.coincident.length} ranura(s) coincide(n) en todos los puntos — con menos de ${MIN_COINCIDENT_SLOTS} lo compartido es un VALOR, no un ESTADO, y una constante compartida sale más barata que un prototipo con su decisión de copia profunda vs. superficial.`,
    };
  },
};

const minorityVariation: Check<RebuiltAssemblyProblem, PrototypeGraph> = {
  id: "variacion-minoritaria",
  describe:
    "Algo varía entre los puntos, y lo que varía es la MINORÍA de las ranuras — son copias CONFIGURADAS (variaciones chicas sobre un mismo estado inicial), ni duplicados exactos ni un constructor con argumentos.",
  run(problem) {
    const varying = problem.varyingKeys.length;
    const holds = varying >= 1 && varying * 2 <= problem.slotCount;
    if (varying === 0) {
      return {
        holds: false,
        evidence: `Ninguna ranura varía entre los ${problem.places.length} puntos: son duplicados EXACTOS, y su mitigación es Extract Constant/Method — Prototype existe para copias configuradas, o sea para variaciones.`,
      };
    }
    return {
      holds,
      evidence: holds
        ? `${varying} de ${problem.slotCount} ranuras varían (${problem.varyingKeys.join(", ")}) — la minoría: el resto es estado inicial idéntico.`
        : `${varying} de ${problem.slotCount} ranuras varían (${problem.varyingKeys.join(", ")}) — la MAYORÍA: no hay un "mismo estado inicial" que copiar, lo que hay es un constructor con argumentos.`,
    };
  },
};

const wideAssembly: Check<RebuiltAssemblyProblem, PrototypeGraph> = {
  id: "armado-ancho",
  describe: "El armado fija cuatro o más ranuras: cuantas más ranuras tiene el objeto, más trabajo ahorra copiarlo en vez de volver a escribirlo entero.",
  run(problem) {
    return { holds: problem.slotCount >= 4, evidence: `${problem.slotCount} ranura(s) configuradas por armado.` };
  },
};

const manyRebuildingPlaces: Check<RebuiltAssemblyProblem, PrototypeGraph> = {
  id: "cuatro-o-mas-puntos",
  describe: "Cuatro o más puntos rearman el mismo objeto — más puntos, más trabajo que el prototipo ahorra y más lugares que se desincronizan cuando el estado inicial cambia.",
  run(problem) {
    return { holds: problem.places.length >= 4, evidence: `${problem.places.length} punto(s) que rearman.` };
  },
};

const builtBeyondThisFile: Check<RebuiltAssemblyProblem, PrototypeGraph> = {
  id: "tipo-construido-mas-alla-de-estos-puntos",
  describe:
    "El tipo se construye en el repo desde MÁS símbolos que los puntos de este archivo (`instantiates` del grafo) — el objeto ya armado tendría clientes fuera de acá, no sólo los puntos que dispararon el hallazgo.",
  run(problem) {
    if (!problem.graphSeen) {
      return { holds: false, evidence: "Sin grafo disponible para contar los sitios de construcción del tipo en el repo — este discriminador no suma." };
    }
    const holds = problem.constructionSitesInRepo > problem.places.length;
    return {
      holds,
      evidence: `${problem.constructionSitesInRepo} símbolo(s) del repo construyen "${problem.typeName}" (instantiates), contra ${problem.places.length} punto(s) en este archivo.`,
    };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, y por qué tiene sólo DOS peldaños.
 *
 * `parcial` (existe MEDIA puerta: exactamente uno de los puntos ya llega por
 * `calls` a un símbolo ajeno que construye el tipo, y los demás rearman) →
 * `ausente` (no hay ninguna).
 *
 * **`ya-aplicado` y `aplicado-eludido` son INALCANZABLES desde este camino, y
 * lo digo con todas las letras, con el mismo criterio con el que AC3 y AD4 lo
 * dijeron de sus propias anclas: son cero POR CONSTRUCCIÓN.** El detector se
 * calla cuando el tipo ya declara un miembro que lo construye (R1), cuando
 * alguno de los sitios vive dentro del propio tipo (R3) y cuando dos o más
 * puntos ya pasan por una puerta compartida (R2) — o sea, exactamente en los
 * casos que producirían esos dos estados. **Que este camino no produzca
 * `ya-aplicado` NO lo acredita.** Lo que sí es mérito medible, y de otra
 * naturaleza, es que el DETECTOR se calle cuando el prototipo ya está, y hay
 * tests que exigen ese silencio.
 */
function assemblyAppliedState(problem: RebuiltAssemblyProblem): AppliedStateResult {
  const state: PatternState = problem.doorReach >= 1 ? "parcial" : "ausente";
  return {
    state,
    checks: [
      {
        label: "puerta-de-armado-compartida (¿ya hay un símbolo ajeno que arma este tipo y al que alguno de los puntos ya llega?)",
        passed: problem.doorReach >= 1,
        why:
          problem.doorReach >= 1
            ? `${problem.doorReach} de los ${problem.places.length} puntos ya llega por \`calls\` a un símbolo que construye "${problem.typeName}": media puerta existe, y los demás puntos la esquivan rearmando.`
            : `Ninguno de los ${problem.places.length} puntos llega a un símbolo ajeno que construya "${problem.typeName}": no hay ni media puerta — el objeto ya armado del que copiar no existe en ninguna parte.`,
        role: "applied" as const,
      },
      {
        label: "estado-inicial-repetido (¿cuánto del objeto se vuelve a escribir en cada punto?)",
        passed: problem.coincident.length >= MIN_COINCIDENT_SLOTS,
        why: `${problem.coincident.length} de ${problem.slotCount} ranuras se escriben idénticas en los ${problem.places.length} puntos; ${problem.varyingKeys.length} cambia(n).`,
        role: "applied" as const,
      },
    ],
  };
}

function buildAssemblySpec(): HypothesisSpec<RebuiltAssemblyProblem, PrototypeGraph> {
  return {
    pattern: "Prototype",
    ceiling: "alta",
    // SIN `needs`, a diferencia del camino viejo (que declara
    // `unidad-tipo-clase`): la compuerta de "esto es un TIPO" de este camino es
    // un hecho MEDIDO del grafo de este repo (el nombre resuelve a un símbolo
    // `class-like` real), no una capacidad declarada por lenguaje. Declarar la
    // capacidad dejaría a Go —cuyo `type X struct` sí produce nodos
    // `class-like` en el grafo (`code-grammar.ts#GO_TYPE_SPEC_WORD`) pero que
    // no deriva `unidad-tipo-clase`— en silencio por una razón falsa.
    needs: [],
    required: [rebuiltAtSeveralPlaces, sharedInitialState, minorityVariation],
    discriminators: [wideAssembly, manyRebuildingPlaces, builtBeyondThisFile],
    appliedState: assemblyAppliedState,
    toConfirm: [
      "Confirmar que las ranuras que coinciden son de verdad ESTADO del objeto y no argumentos que casualmente se repiten (p.ej. el mismo nombre de variable pasado en todos lados): el prototipo sólo paga si lo que se copia es configuración.",
      "Confirmar que las variaciones son independientes entre sí. Si lo que cambia son EJES ortogonales (tema × forma), la solución correcta puede ser Abstract Factory, y si es una única familia lineal de presets, una subclase por preset puede alcanzar.",
      "BRECHA DECLARADA DE GRANULARIDAD: este ancla sólo ve la repetición DENTRO de un archivo. Si el mismo armado se repite además en otros archivos, el caso es más fuerte que lo que este hallazgo muestra — y si el objeto ya armado existe en otro archivo sin que el grafo lo relacione, puede ser más débil. Confirmar mirando el repo, no sólo este archivo.",
      "Confirmar que el tipo permite copiar: si sus campos son inmutables y baratos de construir, un constructor con valores por omisión es más simple que un prototipo, y la decisión de copia profunda vs. superficial no hace falta.",
    ],
    source: "https://refactoring.guru/es/design-patterns/prototype",
  };
}

/**
 * Elige el grupo de armado que el hallazgo-ANCLA nombra: el que más sitios
 * tiene solapados con las líneas que el ancla señaló en este archivo. Exige
 * **al menos dos** sitios solapados — con uno solo no hay forma de saber que
 * es el grupo correcto, y la Ola AB midió acá mismo lo que cuesta elegir mal
 * (el 100 % de una muestra abierta a mano reportaba un miembro sin relación
 * con el fragmento anclado). `null` ⇒ no se pudo elegir, y la hipótesis no se
 * construye.
 */
function assemblyGroupFor(file: FileUnit, anchorRanges: readonly (readonly [number, number])[]): AssemblyGroup | null {
  const sites = assemblySitesOf(file.root, file.sets, ASSEMBLY_SITE_BUDGET);
  let best: AssemblyGroup | null = null;
  let bestOverlap = 0;
  for (const group of groupAssemblies(sites)) {
    const overlap = group.sites.filter((s) => overlapsAnyRange(s.startLine, s.endLine, anchorRanges)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = group;
    }
  }
  return bestOverlap >= 2 ? best : null;
}

function buildRebuiltAssembly(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const tz = nuevaTrazaPrototype(problem, graph, "armado");
  let sinGrupo = 0;
  let murioEnRequired: string | null = null;
  for (const path of candidateFiles(problem)) {
    const file: FileUnit | null = ctx.fileAt(path);
    if (!file) continue;
    if (tz) tz.archivosConArbol++;
    const group = assemblyGroupFor(file, anchorRangesInFile(problem, path));
    if (!group) {
      sinGrupo++;
      continue;
    }

    const ownerSymbolPaths = group.sites.map((s) => s.ownerSymbolPath).filter((p) => p.length > 0);
    const ownerIds = [...new Set(ownerSymbolPaths.map((p) => symbolNodeIdOf(path, p)))];
    const facts = graph ? assemblyGraphFacts(graph) : null;

    const assembly: RebuiltAssemblyProblem = {
      file: path,
      typeName: group.typeName,
      places: group.places,
      slotCount: group.slotKeys.length,
      coincident: group.coincident.map((c) => ({ key: c.key, value: c.value })),
      varyingKeys: group.varyingKeys,
      siteLines: group.sites.map((s) => [s.startLine, s.endLine] as const),
      ownerSymbolPaths,
      doorReach: facts ? sharedAssemblyDoorReach(facts, group.typeName, ownerIds) : 0,
      constructionSitesInRepo: facts ? constructionSiteCount(facts, group.typeName) : 0,
      graphSeen: facts !== null,
    };

    const spec = buildAssemblySpec();
    const outcome = engineBuild(spec, ctx.capabilities, assembly, graph);
    if (tz) {
      tz.checks = spec.required.map((ch) => ({ id: ch.id, holds: ch.run(assembly, graph).holds }));
      tz.appliedState = spec.appliedState(assembly, graph).state;
    }
    if (!outcome) {
      if (tz) murioEnRequired = tz.checks.find((ch) => !ch.holds)?.id ?? "required";
      continue;
    }

    const places: readonly RoleLocation[] = group.sites.map((s, i) => ({
      file: path,
      startLine: s.startLine,
      endLine: s.endLine,
      symbol: s.ownerSymbolPath.length > 0 ? s.ownerSymbolPath.join(".") : group.typeName,
      role:
        i === 0
          ? `armado completo de "${group.typeName}" — candidato a PROTOTIPO del que los demás se copien`
          : `otro punto que vuelve a armar "${group.typeName}" entero, repitiendo las ${group.coincident.length} ranuras que ya coincidían`,
    }));

    const hipotesis = toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Obliga a decidir, campo por campo, si la copia es profunda o superficial, y a mantener vivo un objeto ya armado del que los demás copian: más indirección que repetir el constructor, y se paga cuando el estado inicial compartido cambia.",
    });
    cerrarTrazaPrototype(tz, "emitido");
    return hipotesis;
  }
  cerrarTrazaPrototype(tz, murioEnRequired ?? (tz && tz.archivosConArbol === 0 ? "sin-arbol-vivo" : "sin-grupo-de-armado"));
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * build()
 * ──────────────────────────────────────────────────────────────────────── */
function candidateFiles(problem: Finding): readonly string[] {
  return [...new Set(problem.locations.map((l) => l.file))];
}

/**
 * OLA AB, FRENTE AB3 — los rangos [startLine,endLine] que el hallazgo-ANCLA
 * señaló en `path` (puede ser más de uno: `duplication` reporta un lugar por
 * copia). Alimenta el gate nuevo de `findPresetSiblingProblem` (camino 1b) —
 * ver su docstring para la medición que lo justifica. Nunca vacío para un
 * `path` que salió de `candidateFiles(problem)`, porque ESE `path` existe
 * precisamente porque alguna `location` lo nombra.
 */
function anchorRangesInFile(problem: Finding, path: string): readonly (readonly [number, number])[] {
  return problem.locations.filter((l) => l.file === path).map((l) => [l.startLine, l.endLine] as const);
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — LA TRAZA DEL EMBUDO (auditoría de compuertas).
 * Mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace` y `strategy.ts#startStrategyTrace`
 * (Ola AH, AH1): `null` en producción ⇒ costo cero. Los `required` que se
 * re-corren acá son puros. No cambia ningún comportamiento — sólo registra,
 * en cada punto de salida, EN QUÉ ETAPA murió el candidato (la pregunta que
 * el volcado no puede contestar: publica sólo lo que sobrevive).
 * ══════════════════════════════════════════════════════════════════════════ */

export interface PrototypeTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly ruta: string;
  readonly withGraph: boolean;
  /** Etapa exacta en la que se cortó: `"emitido"` si llegó a producir hipótesis. */
  murioEn: string;
  /** Archivos-candidato del ancla y cuántos revivieron con árbol. */
  readonly archivos: number;
  archivosConArbol: number;
  checks: readonly { readonly id: string; readonly holds: boolean }[];
  appliedState: string | null;
  /** `PrototypeProblem.origin` del candidato elegido — sólo en la ruta `duplicacion`. */
  origen: string | null;
  /** ¿`ctx.neighborhood` llega REAL en la pasada que publica? Hallazgos del vecindario en el archivo del ancla. */
  vecinosEnArchivo: number;
  /** De ésos, cuántos son `repeated-configured-assembly` — el hecho que decide si una ruta nueva sobre `duplication` sería DOBLE CONTEO. */
  vecinosRCA: number;
  /** Grupos de armado que el archivo del ancla ofrece, y cuántos solapan >=2 rangos del ancla. */
  gruposDeArmado: number;
  gruposSolapados: number;
  /**
   * OLA AI (AI7) — EL EMBUDO DEL CAMINO DE ARMADO, compuerta por compuerta.
   * Una entrada por ARCHIVO-candidato que llegó a `buildAssemblyFromDuplication`,
   * con el nombre de la compuerta que lo mató (o `"emitido"`). Es la pregunta
   * que la auditoría de esta ola pide contestar con un conteo y no con una
   * lectura: ¿cuántos candidatos ENTRAN a cada `required` y cuántos MUEREN en él?
   */
  armadoMuertes: string[];
  /**
   * OLA AJ (AJ3) — LA SONDA DEL CAMINO NUEVO (`armado-copiado`), y la
   * verificación de la CONDICIÓN 4 de la receta. Sólo registra: `null` en
   * producción ⇒ costo cero. `copiasMuerte` es la compuerta exacta que mató
   * al candidato (o `"emitir"`), calculada por la MISMA función que decide en
   * el camino real, así que sonda y camino no pueden divergir.
   */
  copiasMuerte: string;
  copiasGrupos: number;
  /** Copias del ancla, archivos que nombra y archivos que revivieron con árbol. */
  copiasUbicaciones: number;
  copiasArchivos: number;
  /** Del grupo elegido (o del mejor ofrecido si ninguno pasó): la foto que decide la escala. */
  copiasMejorCopias: number;
  copiasMejorPuntos: number;
  /** Los mismos puntos, contando SÓLO los sitios que caen dentro de las copias del ancla — la lectura de la primera versión de este camino, que se publica al lado de la corregida (ADENDA 1 del criterio). */
  copiasMejorPuntosSoloCopias: number;
  copiasMejorCoincidentes: number;
  copiasMejorVariables: number;
  copiasMejorRanuras: number;
  copiasMejorTipo: string;
  /** LOS DOS HECHOS DE GRAFO DE LA CONDICIÓN 4, sobre el mejor grupo ofrecido. */
  copiasTipoEnGrafo: boolean;
  copiasProtocoloDeCopia: boolean;
  copiasEstado: string;
}

let prototypeTrace: PrototypeTraceEntry[] | null = null;

export function startPrototypeTrace(): void {
  prototypeTrace = [];
}

export function takePrototypeTrace(): readonly PrototypeTraceEntry[] {
  const t = prototypeTrace ?? [];
  prototypeTrace = null;
  return t;
}

function nuevaTrazaPrototype(problem: Finding, graph: CodeGraph | null, ruta: string): PrototypeTraceEntry | null {
  if (!prototypeTrace) return null;
  const loc = problem.locations[0];
  return {
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    ruta,
    withGraph: graph !== null,
    murioEn: "",
    archivos: candidateFiles(problem).length,
    archivosConArbol: 0,
    checks: [],
    appliedState: null,
    origen: null,
    vecinosEnArchivo: 0,
    vecinosRCA: 0,
    gruposDeArmado: 0,
    gruposSolapados: 0,
    armadoMuertes: [],
    copiasMuerte: "",
    copiasGrupos: 0,
    copiasUbicaciones: problem.locations.length,
    copiasArchivos: candidateFiles(problem).length,
    copiasMejorCopias: 0,
    copiasMejorPuntos: 0,
    copiasMejorPuntosSoloCopias: 0,
    copiasMejorCoincidentes: 0,
    copiasMejorVariables: 0,
    copiasMejorRanuras: 0,
    copiasMejorTipo: "",
    copiasTipoEnGrafo: false,
    copiasProtocoloDeCopia: false,
    copiasEstado: "",
  };
}

function cerrarTrazaPrototype(t: PrototypeTraceEntry | null, murioEn: string): void {
  if (!t) return;
  t.murioEn = murioEn;
  prototypeTrace?.push(t);
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — EL CAMINO DE ARMADO SOBRE EL ANCLA `duplication`.
 *
 * **NO TOCA NI UNA LÍNEA DEL CAMINO VIEJO NI DEL DE AE12**: ni un `required`,
 * ni un discriminador, ni una rama de `appliedState`, ni un umbral. Corre
 * SÓLO cuando el camino de `duplication` que ya existía no produjo nada
 * (las dos salidas en las que hoy devuelve `null`), y usa el `HypothesisSpec`
 * de AE12 **tal cual**, sin cambiarle un byte.
 *
 * ─── POR QUÉ, Y CONTRA QUÉ NÚMERO ────────────────────────────────────────
 * `Prototype · repeated-configured-assembly` es la celda mejor medida de este
 * patrón —50 % sobre n=4 en bibliotecas y un TECHO de ancla del 100 % (4/4
 * LIB, 2/2 APP, medido por este frente sobre las 21 planillas con el filtro de
 * vigencia)— y su problema no es la compuerta: es que su ancla emite **4
 * hallazgos en 13 bibliotecas y 5 en 8 aplicaciones**. Con n=4 el intervalo no
 * decide nada. Lo que falta es POBLACIÓN, no precisión.
 *
 * Y al lado, sobre el MISMO patrón, el ancla `duplication` emite 1.089 y 2.366
 * hallazgos y produce **31 hipótesis, las 31 `ya-aplicado`, CERO
 * recomendaciones** (medido por AE12, re-contado por este frente sobre el
 * volcado del día: 19 LIB + 12 APP, todas `ya-aplicado`). El `ausente` es
 * inalcanzable por ahí **por construcción**, y se puede leer en el código: los
 * DOS buscadores que llegan a producir un candidato en producción —
 * `findPresetSiblingProblem` rama (1b) y `findSoloPrototypeCandidateFromGraph`—
 * exigen, cada uno, un miembro que YA se auto-construye
 * (`analyzeMember(...).selfConstructs` / `instantiates` hacia la propia clase),
 * y `appliedState` sólo dice `ausente` cuando `withClone.length === 0`. Las dos
 * condiciones son incompatibles: el candidato existe *porque* el clon ya está.
 *
 * ─── LAS CUATRO CONDICIONES DE LA RECETA, ESCRITAS ANTES DE MEDIR ────────
 *
 * 1. **FUERZA** — la situación que Prototype resuelve no es "hay código
 *    repetido" (eso es Extract Method/Function) sino "el MISMO objeto
 *    configurado se vuelve a armar entero, con el mismo estado inicial, en
 *    varios puntos". Un hallazgo de `duplication` cuyo fragmento duplicado ES
 *    un armado configurado del mismo tipo es, literalmente, esa situación —
 *    la MISMA que el detector `repeated-configured-assembly` reconoce, vista
 *    por otro ancla. Este camino no afloja la definición: la re-deriva del
 *    árbol vivo con `assemblySitesOf`/`groupAssemblies`, las funciones que el
 *    propio detector exporta, y exige el MISMO grupo.
 *
 * 2. **ESCALA** — los TRES `required` de AE12, sin tocar: >= 3 puntos
 *    distintos que rearman, >= 3 ranuras con valor idéntico en todos, y la
 *    variación en MINORÍA. No se agrega ni se relaja un umbral.
 *
 * 3. **RESOLUCIÓN VERIFICADA** — y acá está la diferencia real con el camino
 *    de AE12: aquél no re-verifica R1/R2/R3 porque el DETECTOR ya se calló en
 *    esos casos. Entrando por `duplication` ese silencio no existe, así que
 *    este camino aplica las TRES compuertas con las MISMAS funciones
 *    exportadas del detector (`assembledInsideOwnType`, `copyProtocolExists`,
 *    `sharedAssemblyDoorReach >= 2`) más su compuerta de construcción
 *    (`classNodesByName`). Y una CUARTA que el detector no necesita: si el
 *    ancla-fuerza YA nombra este mismo armado en este archivo, este camino se
 *    calla — repetir el mismo remedio colgado de otro `id` no es cobertura,
 *    es doble conteo (el `required` que AH3 tuvo que escribir por lo mismo).
 *
 * 4. **EL HECHO QUE LA DECIDE, VERIFICADO ANTES DE ESCRIBIR** — sonda
 *    `scripts/ai7-embudo.mts` sobre los repos volcados, con la traza de este
 *    módulo: (i) `ctx.fileAt(path)` revive con árbol vivo el archivo de un
 *    hallazgo `duplication` (es lo que ya sostiene al camino viejo), (ii) el
 *    `graph` llega no nulo en la pasada que publica —sin él no hay R1/R2/R3 y
 *    este camino se calla, igual que el detector—, (iii) `ctx.neighborhood`
 *    llega REAL en esa pasada, que es lo que permite la compuerta de doble
 *    conteo, y (iv) el archivo ofrece grupos de armado que solapan >= 2 sitios
 *    con la evidencia del ancla. Los cuatro se miden en la traza
 *    (`archivosConArbol`, `withGraph`, `vecinosEnArchivo`, `gruposSolapados`)
 *    ANTES de que este camino emita nada. Si (iv) hubiera dado cero, la
 *    conclusión era negativa y este camino no se aterrizaba.
 *
 * ─── LO QUE ESTE CAMINO NO PUEDE DECIR, EN VOZ ALTA ──────────────────────
 * `ya-aplicado`/`aplicado-eludido` siguen siendo INALCANZABLES, igual que en
 * AE12 y por la misma razón: `assemblyAppliedState` sólo tiene dos peldaños, y
 * las tres compuertas de resolución de arriba silencian exactamente los casos
 * que los producirían. **Que no diga `ya-aplicado` no lo acredita.**
 * ══════════════════════════════════════════════════════════════════════════ */

/** Memoización por ARCHIVO — `groupAssemblies(assemblySitesOf(...))` es función pura del árbol, y un mismo `FileUnit` recibe muchas consultas (un `duplication` por copia). Mismo criterio que `GRAPH_FACTS_CACHE`/`ASSEMBLY_FACTS_CACHE`: `WeakMap`, no retiene nada vivo ni cruza corridas. */
const GRUPOS_POR_ARCHIVO = new WeakMap<FileUnit, readonly AssemblyGroup[]>();

function gruposDeArmadoDe(file: FileUnit): readonly AssemblyGroup[] {
  const cacheado = GRUPOS_POR_ARCHIVO.get(file);
  if (cacheado) return cacheado;
  const grupos = groupAssemblies(assemblySitesOf(file.root, file.sets, ASSEMBLY_SITE_BUDGET));
  GRUPOS_POR_ARCHIVO.set(file, grupos);
  return grupos;
}

/**
 * El grupo de armado que el hallazgo-ANCLA nombra, con el MISMO criterio y el
 * MISMO piso que `assemblyGroupFor` (>= 2 sitios solapados con la evidencia
 * del ancla): con un solo sitio solapado no hay forma de saber que es el grupo
 * correcto — la medición de la Ola AB, acá mismo, mostró lo que cuesta elegir
 * mal. Se escribe aparte para no tocar `assemblyGroupFor`, que es del camino
 * de AE12, y para poder pasar por la caché de arriba.
 */
function grupoDeArmadoDelAncla(file: FileUnit, anchorRanges: readonly (readonly [number, number])[]): AssemblyGroup | null {
  let best: AssemblyGroup | null = null;
  let bestOverlap = 0;
  for (const group of gruposDeArmadoDe(file)) {
    const overlap = group.sites.filter((s) => overlapsAnyRange(s.startLine, s.endLine, anchorRanges)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = group;
    }
  }
  return bestOverlap >= 2 ? best : null;
}

/** ¿El ancla-FUERZA ya nombra este mismo armado en este archivo? — la compuerta de DOBLE CONTEO (condición 3, cuarta parte). Se consulta por KIND, no por archivo: `findingsOfKind` no pasa por el truncado a 256 pares por severidad de `findingsInFile`, y este kind tiene tope 200 por repo. */
function elAnclaFuerzaYaLoNombra(ctx: HypothesisContext, path: string, group: AssemblyGroup): boolean {
  return ctx.neighborhood
    .findingsOfKind(REPEATED_CONFIGURED_ASSEMBLY_KIND)
    .some((f) => f.locations.some((l) => l.file === path && group.sites.some((s) => l.startLine <= s.endLine && s.startLine <= l.endLine)));
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AJ, FRENTE AJ3 — EL CAMINO QUE PUEDE DECIR `ausente` SOBRE
 * `duplication`: **LAS COPIAS DEL PROPIO ANCLA SON LOS PUNTOS.**
 *
 * ─── EL DEFECTO, LEÍDO EN EL CÓDIGO, EN DOS MITADES ──────────────────────
 *
 * (a) EL DIAGNÓSTICO DE AI7, verificado por mí línea por línea: el camino de
 *     `duplication` **no puede emitir `ausente` por construcción**.
 *     `appliedState` dice `ausente` ⟺ `withClone.length === 0`, y los dos
 *     únicos buscadores que producen candidato en producción exigen, cada
 *     uno, un miembro que YA se auto-construye (`findPresetSiblingProblem`,
 *     rama 1b: `if (!hasSelfConstruct) continue;`;
 *     `findSoloPrototypeCandidateFromGraph`:
 *     `if (!hasEdgeKindTo(gf, memberNode.id, "instantiates", classNode.id)) continue;`).
 *     **El candidato existe PORQUE el clon ya está.** El tercero (1a,
 *     hermanos-preset) sí podría decir `ausente`, y por eso nunca disparó: en
 *     los 21 repos las 39 hipótesis del ancla salen las 39 por las otras dos
 *     ramas, y las 39 son `ya-aplicado` (re-contado por mí, §1 del informe).
 *
 * (b) **Y POR QUÉ EL CAMINO DE ARMADO DE AI7 MIDIÓ CERO — el defecto de FORMA
 *     que este frente arregla, y que es del mismo tipo que el que la Ola AH3
 *     encontró en `extract-method.ts`:** `buildAssemblyFromDuplication` entra
 *     por `grupoDeArmadoDelAncla(file, anchorRangesInFile(problem, path))`,
 *     que exige **≥2 sitios de armado del mismo grupo solapados con los
 *     rangos del ancla DENTRO DE UN SOLO ARCHIVO**. Pero `duplication` es un
 *     ancla INTER-FILE y nombra **un rango por copia**: cuando las copias
 *     viven en archivos distintos —**52,6 % de los 1.089 hallazgos de
 *     biblioteca y 59,0 % de los 2.366 de aplicación, medido por mí sobre el
 *     volcado del día**— `anchorRangesInFile` devuelve UN rango para ese
 *     archivo, y pedir ≥2 sitios solapados con él equivale a pedir que **un
 *     mismo fragmento duplicado contenga el mismo armado dos veces**. Eso es
 *     otro fenómeno. **Para esa mitad de la población la compuerta es
 *     imposible por construcción, y es justo la mitad donde el ancla trae la
 *     evidencia más fuerte: la repetición ya probada por el detector.**
 *
 * ─── LA RECETA, LAS CUATRO CONDICIONES, ESCRITAS ANTES DE MEDIR ──────────
 * (`scratchpad-aj3/CRITERIO.md`, fechado antes de la primera corrida.)
 *
 * 1. **FUERZA** — la situación que Prototype resuelve: *un objeto YA
 *    CONFIGURADO tiene que volver a producirse, y el código vuelve a correr
 *    el armado entero en vez de copiar una instancia que ya lleva ese estado
 *    puesto.* El ancla prueba, por huella estructural, que el MISMO fragmento
 *    está escrito N veces; el sitio de armado adentro prueba que el fragmento
 *    **construye y configura un tipo**; `coincident` prueba que las copias
 *    llevan **el mismo estado inicial**; `varyingKeys` prueba que son copias
 *    **configuradas** y no duplicados exactos (cuyo remedio es Extract
 *    Method/Constant, no Prototype).
 *
 * 2. **ESCALA** — **ni un umbral nuevo.** Se reusan los TRES `required` de
 *    AE12 (`rebuiltAtSeveralPlaces` ≥3 puntos, `sharedInitialState` ≥3
 *    ranuras coincidentes, `minorityVariation`) con sus constantes
 *    exportadas y sin cambiar un byte, y la única compuerta de entrada propia
 *    —el grupo tiene que cubrir **≥2 copias DISTINTAS del ancla**— es el
 *    MISMO piso (2) y la MISMA razón que `assemblyGroupFor` y
 *    `grupoDeArmadoDelAncla` ya usan ("con un solo sitio solapado no hay
 *    forma de saber que es el grupo correcto" — la Ola AB midió acá mismo lo
 *    que cuesta elegir mal). **No se baja ningún número: se generaliza la
 *    UNIDAD, de "sitios dentro de un archivo" a "copias del ancla, estén
 *    donde estén".**
 *
 * 3. **RESOLUCIÓN VERIFICADA** — las TRES compuertas del detector, con SUS
 *    funciones exportadas y no con una reimplementación (`assembledInsideOwnType`,
 *    `copyProtocolExists`, `sharedAssemblyDoorReach >= 2`), más la de doble
 *    conteo contra el ancla-fuerza, más el hecho de que este camino **corre
 *    sólo donde el camino viejo ya devolvió `null`**: jamás pisa un
 *    `ya-aplicado`.
 *
 * 4. **EL HECHO DEL GRAFO QUE LA DECIDE** — `copyProtocolExists(facts,
 *    typeName)`: *¿algún nodo `class-like` llamado T declara (`contains`) un
 *    miembro `function-like` que `instantiates` T?* **Es el hecho que separa
 *    `ausente` ("nadie sabe copiar T") de "el protocolo está y lo eluden"**, y
 *    el que hace que este camino pueda decir lo que el viejo no puede.
 *    **Verificado con una sonda ANTES de cablear la emisión** — el resultado
 *    se publica en el informe salga como salga.
 *
 * ─── LO QUE ESTE CAMINO NO PUEDE DECIR, EN VOZ ALTA ──────────────────────
 * `ya-aplicado`/`aplicado-eludido` son INALCANZABLES acá, igual que en AE12 y
 * en AI7 y por la misma razón: `assemblyAppliedState` tiene dos peldaños y las
 * tres compuertas de resolución silencian exactamente los casos que los
 * producirían. **Que no diga `ya-aplicado` no lo acredita.**
 * ══════════════════════════════════════════════════════════════════════════ */

/** Memoización por ARCHIVO de los SITIOS crudos — `assemblySitesOf` es función pura del árbol, y un mismo `FileUnit` recibe muchas consultas (un `duplication` por copia). Mismo criterio que `GRUPOS_POR_ARCHIVO`: `WeakMap`, no retiene nada vivo ni cruza corridas. */
const SITIOS_POR_ARCHIVO = new WeakMap<FileUnit, readonly AssemblySite[]>();

function sitiosDeArmadoDe(file: FileUnit): readonly AssemblySite[] {
  const cacheado = SITIOS_POR_ARCHIVO.get(file);
  if (cacheado) return cacheado;
  const sitios = assemblySitesOf(file.root, file.sets, ASSEMBLY_SITE_BUDGET);
  SITIOS_POR_ARCHIVO.set(file, sitios);
  return sitios;
}

interface SitioCopiado {
  readonly file: string;
  readonly site: AssemblySite;
  /** Índice de la COPIA del ancla (posición en `problem.locations`) que este sitio solapa, o `-1` si el sitio es del mismo grupo pero cae fuera de las copias — cuenta para la ESCALA, no para la cobertura del ancla. */
  readonly copia: number;
}

interface GrupoCopiado {
  readonly typeName: string;
  readonly slotKeys: readonly string[];
  readonly sitios: readonly SitioCopiado[];
  /** Copias DISTINTAS del ancla que este grupo cubre — la unidad de escala que el ancla SÍ trae. */
  readonly copias: number;
  /** Puntos DISTINTOS que rearman, calificados POR ARCHIVO (dos archivos pueden tener el mismo `owner`). */
  readonly places: readonly string[];
  readonly coincident: readonly AssemblySlot[];
  readonly varyingKeys: readonly string[];
}

/**
 * Los grupos de armado que las COPIAS del ancla ofrecen, agrupados **a través
 * de los archivos** con la MISMA clave que `groupAssemblies` (`typeName` +
 * conjunto ORDENADO de nombres de ranura) y el MISMO cálculo de
 * `coincident`/`varyingKeys`. No se llama a `groupAssemblies` directamente
 * porque su `places` sale de `site.owner` sin archivo, y dos archivos
 * distintos pueden traer el mismo `owner` (`@3` de nivel superior, o dos
 * métodos homónimos): eso colapsaría dos puntos REALES en uno y ROMPERÍA la
 * condición de escala en la dirección peligrosa (menos puntos de los que hay
 * ⇒ nada; nunca más).
 *
 * Un mismo SITIO no puede contar dos veces aunque el ancla nombre dos rangos
 * que lo tocan: se deduplica por `(archivo, línea inicial, línea final)` y se
 * queda con la primera copia que lo reclama.
 */
function gruposCopiadosDelAncla(problem: Finding, ctx: HypothesisContext): readonly GrupoCopiado[] {
  const porArchivo = new Map<string, readonly AssemblySite[]>();
  for (const path of candidateFiles(problem)) {
    const file: FileUnit | null = ctx.fileAt(path);
    if (!file) continue;
    porArchivo.set(path, sitiosDeArmadoDe(file));
  }
  if (porArchivo.size === 0) return [];

  const claveDe = (site: AssemblySite): string => [site.typeName, ...[...site.slots.map((x) => x.key)].sort()].join(" | ");

  // EL ANCLA ELIGE EL GRUPO; EL GRUPO MIDE LA ESCALA — ver la ADENDA 1 de
  // `scratchpad-aj3/CRITERIO.md`. Primero se ve QUÉ claves de armado tocan las
  // copias del ancla (y CUÁNTAS copias toca cada una), y recién después se
  // junta el grupo COMPLETO de esa clave en los archivos que el ancla nombra:
  // `rearmado-en-varios-puntos` pregunta cuántos puntos rearman el tipo, que
  // es una propiedad del CÓDIGO, no de cuántos de esos puntos el ancla llegó a
  // nombrar. Es el mismo reparto que `assemblyGroupFor`/`grupoDeArmadoDelAncla`
  // ya hacen (seleccionan por solapamiento, miden con `group.places`).
  const copiasPorClave = new Map<string, Set<number>>();
  problem.locations.forEach((l, i) => {
    for (const site of porArchivo.get(l.file) ?? []) {
      if (site.startLine > l.endLine || site.endLine < l.startLine) continue;
      const id = claveDe(site);
      const set = copiasPorClave.get(id) ?? new Set<number>();
      set.add(i);
      copiasPorClave.set(id, set);
    }
  });
  if (copiasPorClave.size === 0) return [];

  const porClave = new Map<string, SitioCopiado[]>();
  for (const [path, sitios] of porArchivo) {
    for (const site of sitios) {
      const id = claveDe(site);
      if (!copiasPorClave.has(id)) continue;
      const lista = porClave.get(id) ?? [];
      // `copia` = la ubicación del ancla que este sitio solapa, o -1 si el sitio
      // pertenece al grupo pero cae fuera de las copias (cuenta para la ESCALA,
      // no para la cobertura del ancla).
      const copia = problem.locations.findIndex((l) => l.file === path && site.startLine <= l.endLine && site.endLine >= l.startLine);
      lista.push({ file: path, site, copia });
      porClave.set(id, lista);
    }
  }

  const out: GrupoCopiado[] = [];
  for (const [id, lista] of [...porClave.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const vistos = new Set<string>();
    const sitios: SitioCopiado[] = [];
    for (const s of lista) {
      const k = `${s.file}:${s.site.startLine}-${s.site.endLine}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      sitios.push(s);
    }
    const primero = sitios[0];
    if (!primero) continue;
    const slotKeys = [...primero.site.slots.map((x) => x.key)].sort();
    const coincident: AssemblySlot[] = [];
    const varyingKeys: string[] = [];
    for (const key of slotKeys) {
      const values = new Set(sitios.map((s) => s.site.slots.find((x) => x.key === key)?.value ?? ""));
      if (values.size === 1) coincident.push({ key, value: [...values][0] ?? "" });
      else varyingKeys.push(key);
    }
    out.push({
      typeName: primero.site.typeName,
      slotKeys,
      sitios,
      copias: (copiasPorClave.get(id) ?? new Set<number>()).size,
      places: [...new Set(sitios.map((s) => `${s.file}#${s.site.owner}`))].sort(),
      coincident,
      varyingKeys,
    });
  }
  // Determinista: más copias del ancla cubiertas primero, después más puntos,
  // y el nombre del tipo como desempate final.
  return out.sort((a, b) => b.copias - a.copias || b.places.length - a.places.length || a.typeName.localeCompare(b.typeName));
}

/** `assembledInsideOwnType` (R3) pide un `AssemblyGroup`: se lo damos con SUS mismos campos, para usar SU función exportada y no una reimplementación. */
function comoGrupoDeArmado(grupo: GrupoCopiado): AssemblyGroup {
  return {
    typeName: grupo.typeName,
    slotKeys: grupo.slotKeys,
    sites: grupo.sitios.map((s) => s.site),
    places: grupo.places,
    coincident: grupo.coincident,
    varyingKeys: grupo.varyingKeys,
  };
}

/** La compuerta de DOBLE CONTEO, versión multi-archivo: ¿el ancla-FUERZA ya nombra alguno de los sitios de este grupo, en el archivo donde vive? Mismo criterio y misma consulta por KIND que `elAnclaFuerzaYaLoNombra`. */
function elAnclaFuerzaYaNombraAlgunaCopia(ctx: HypothesisContext, grupo: GrupoCopiado): boolean {
  const fuertes = ctx.neighborhood.findingsOfKind(REPEATED_CONFIGURED_ASSEMBLY_KIND);
  return grupo.sitios.some((s) => fuertes.some((f) => f.locations.some((l) => l.file === s.file && l.startLine <= s.site.endLine && s.site.startLine <= l.endLine)));
}

/** El `HypothesisSpec` de AE12 con los MISMOS `required`, los MISMOS discriminadores y el MISMO `appliedState` —los mismos objetos, no copias— y un solo `toConfirm` reescrito: el de AE12 declara una brecha de granularidad ("este ancla sólo ve la repetición DENTRO de un archivo") que **en este camino no existe**, porque las copias vienen del ancla y pueden estar en archivos distintos. Dejar ahí una advertencia falsa sería peor que reescribirla. */
function buildArmadoCopiadoSpec(): HypothesisSpec<RebuiltAssemblyProblem, PrototypeGraph> {
  const base = buildAssemblySpec();
  return {
    ...base,
    toConfirm: [
      ...base.toConfirm.filter((t) => !t.startsWith("BRECHA DECLARADA DE GRANULARIDAD")),
      "GRANULARIDAD DE ESTE CAMINO: los puntos son las COPIAS que el hallazgo `duplication` ya probó idénticas, y pueden vivir en archivos distintos. Confirmar que las copias son de verdad el MISMO armado y no dos usos casualmente parecidos de la misma biblioteca.",
    ],
  };
}

interface ResultadoCopias {
  /** `"emitir"` si pasó todas las compuertas; si no, el nombre de la que lo mató. */
  readonly muerte: string;
  readonly grupo: GrupoCopiado | null;
  readonly assembly: RebuiltAssemblyProblem | null;
  readonly gruposOfrecidos: number;
  readonly doorReach: number;
}

/**
 * TODA la decisión del camino en UN solo lugar: la sonda que verifica la
 * condición 4 y el camino que emite llaman a ESTA función, así que no pueden
 * divergir. No emite nada — devuelve la decisión y el problema tipado.
 */
function evaluarArmadoCopiado(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): ResultadoCopias {
  const vacio = (muerte: string, gruposOfrecidos = 0): ResultadoCopias => ({ muerte, grupo: null, assembly: null, gruposOfrecidos, doorReach: 0 });
  // Sin grafo no se puede verificar la RESOLUCIÓN, y sin verificarla este
  // camino no cumple la receta. Se calla — la MISMA decisión, y por la misma
  // razón, que toma el detector `repeated-configured-assembly` en su `run`.
  if (!graph) return vacio("sin-grafo");
  const facts = assemblyGraphFacts(graph);
  const grupos = gruposCopiadosDelAncla(problem, ctx);
  if (grupos.length === 0) return vacio("sin-sitio-de-armado-en-las-copias");

  let ultima = "sin-sitio-de-armado-en-las-copias";
  for (const grupo of grupos) {
    // ESCALA (entrada): el grupo tiene que cubrir >=2 copias DISTINTAS del
    // ancla — con una sola no hay forma de saber que es el grupo que el ancla
    // nombra (mismo piso y misma razón que `assemblyGroupFor`).
    if (grupo.copias < 2) {
      ultima = "menos-de-dos-copias-del-ancla-cubiertas";
      continue;
    }
    // COMPUERTA DE CONSTRUCCIÓN — lo que se arma tiene que ser un TIPO de este
    // repo. Hecho del grafo, calcado del detector.
    if (!facts.classNodesByName.has(grupo.typeName)) {
      ultima = "el-tipo-armado-no-es-una-clase-del-repo";
      continue;
    }
    // (3) RESOLUCIÓN VERIFICADA — las tres compuertas del detector, con SUS
    // funciones exportadas.
    if (assembledInsideOwnType(comoGrupoDeArmado(grupo))) {
      ultima = "R3-armado-dentro-del-propio-tipo";
      continue;
    }
    if (copyProtocolExists(facts, grupo.typeName)) {
      ultima = "R1-protocolo-de-copia-ya-existe";
      continue;
    }
    const ownerIds = [...new Set(grupo.sitios.filter((s) => s.site.ownerSymbolPath.length > 0).map((s) => symbolNodeIdOf(s.file, s.site.ownerSymbolPath)))];
    const doorReach = sharedAssemblyDoorReach(facts, grupo.typeName, ownerIds);
    if (doorReach >= 2) {
      ultima = "R2-puerta-compartida-ya-existe";
      continue;
    }
    if (elAnclaFuerzaYaNombraAlgunaCopia(ctx, grupo)) {
      ultima = "doble-conteo-con-el-ancla-fuerza";
      continue;
    }

    const primero = grupo.sitios[0]!;
    const assembly: RebuiltAssemblyProblem = {
      file: primero.file,
      typeName: grupo.typeName,
      places: grupo.places,
      slotCount: grupo.slotKeys.length,
      coincident: grupo.coincident.map((c) => ({ key: c.key, value: c.value })),
      varyingKeys: grupo.varyingKeys,
      siteLines: grupo.sitios.map((s) => [s.site.startLine, s.site.endLine] as const),
      ownerSymbolPaths: grupo.sitios.map((s) => s.site.ownerSymbolPath).filter((q) => q.length > 0),
      doorReach,
      constructionSitesInRepo: constructionSiteCount(facts, grupo.typeName),
      graphSeen: true,
    };

    const spec = buildArmadoCopiadoSpec();
    const outcome = engineBuild(spec, ctx.capabilities, assembly, graph);
    if (!outcome) {
      ultima = `required:${spec.required.find((c) => !c.run(assembly, graph).holds)?.id ?? "?"}`;
      continue;
    }
    return { muerte: "emitir", grupo, assembly, gruposOfrecidos: grupos.length, doorReach };
  }
  return { muerte: ultima, grupo: null, assembly: null, gruposOfrecidos: grupos.length, doorReach: 0 };
}

/**
 * EL CAMINO. `evaluarArmadoCopiado` ya decidió; acá sólo se arma la hipótesis.
 * Corre **después** del camino de AI7 y **sólo** cuando el camino viejo de
 * `duplication` ya devolvió `null`: estrictamente aditivo.
 */
function buildArmadoCopiado(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const r = evaluarArmadoCopiado(problem, graph, ctx);
  if (r.muerte !== "emitir" || !r.grupo || !r.assembly) return null;
  const grupo = r.grupo;
  const spec = buildArmadoCopiadoSpec();
  const outcome = engineBuild(spec, ctx.capabilities, r.assembly, graph);
  if (!outcome) return null;

  const places: readonly RoleLocation[] = grupo.sitios.map((s, i) => ({
    file: s.file,
    startLine: s.site.startLine,
    endLine: s.site.endLine,
    symbol: s.site.ownerSymbolPath.length > 0 ? s.site.ownerSymbolPath.join(".") : grupo.typeName,
    role:
      i === 0
        ? `armado completo de "${grupo.typeName}" — candidato a PROTOTIPO del que los demás se copien`
        : `otro punto que vuelve a armar "${grupo.typeName}" entero, repitiendo las ${grupo.coincident.length} ranuras que ya coincidían`,
  }));

  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places,
    cost: "Obliga a decidir, campo por campo, si la copia es profunda o superficial, y a mantener vivo un objeto ya armado del que los demás copian: más indirección que repetir el constructor, y se paga cuando el estado inicial compartido cambia.",
  });
}

/**
 * LA SONDA — sólo con la traza puesta (`null` en producción ⇒ costo cero).
 * Llama a `evaluarArmadoCopiado`, la MISMA función que decide en el camino
 * real, y deja en la traza (a) la compuerta exacta donde murió y (b) los DOS
 * HECHOS DE GRAFO de la condición 4 sobre el mejor grupo ofrecido:
 * `classNodesByName.has(tipo)` y `copyProtocolExists(tipo)`. **No emite nada
 * y no cambia ninguna decisión.**
 */
function sondaCopias(tz: PrototypeTraceEntry, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): void {
  const r = evaluarArmadoCopiado(problem, graph, ctx);
  tz.copiasMuerte = r.muerte;
  tz.copiasGrupos = r.gruposOfrecidos;
  const grupo = r.grupo ?? gruposCopiadosDelAncla(problem, ctx)[0] ?? null;
  if (!grupo) return;
  tz.copiasMejorCopias = grupo.copias;
  tz.copiasMejorPuntos = grupo.places.length;
  tz.copiasMejorPuntosSoloCopias = new Set(grupo.sitios.filter((x) => x.copia >= 0).map((x) => `${x.file}#${x.site.owner}`)).size;
  tz.copiasMejorCoincidentes = grupo.coincident.length;
  tz.copiasMejorVariables = grupo.varyingKeys.length;
  tz.copiasMejorRanuras = grupo.slotKeys.length;
  tz.copiasMejorTipo = grupo.typeName;
  if (!graph) return;
  const facts = assemblyGraphFacts(graph);
  tz.copiasTipoEnGrafo = facts.classNodesByName.has(grupo.typeName);
  tz.copiasProtocoloDeCopia = tz.copiasTipoEnGrafo && copyProtocolExists(facts, grupo.typeName);
  if (r.assembly) tz.copiasEstado = buildArmadoCopiadoSpec().appliedState(r.assembly, graph).state;
}

function buildAssemblyFromDuplication(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext, tz?: PrototypeTraceEntry | null): PatternHypothesisDraft | null {
  const muere = (razon: string): void => {
    tz?.armadoMuertes.push(razon);
  };
  // Sin grafo no se puede verificar la RESOLUCIÓN, y sin verificarla este
  // camino no cumple la receta. Se calla — la MISMA decisión, y por la misma
  // razón, que toma el detector `repeated-configured-assembly` en su `run`.
  if (!graph) {
    muere("sin-grafo");
    return null;
  }
  const facts = assemblyGraphFacts(graph);

  for (const path of candidateFiles(problem)) {
    const file: FileUnit | null = ctx.fileAt(path);
    if (!file) {
      muere("sin-arbol-vivo");
      continue;
    }
    const group = grupoDeArmadoDelAncla(file, anchorRangesInFile(problem, path));
    if (!group) {
      muere("sin-grupo-de-armado-solapado");
      continue;
    }

    // COMPUERTA DE CONSTRUCCIÓN — lo que se arma tiene que ser un TIPO de este
    // repo, no cualquier llamada con argumentos. Hecho del grafo, calcado del
    // detector.
    if (!facts.classNodesByName.has(group.typeName)) {
      muere("el-tipo-armado-no-es-una-clase-del-repo");
      continue;
    }

    // (3) RESOLUCIÓN VERIFICADA — las tres compuertas del detector, con SUS
    // funciones exportadas, no con una reimplementación.
    if (assembledInsideOwnType(group)) {
      muere("R3-armado-dentro-del-propio-tipo");
      continue; // R3 — el sitio vive dentro del propio tipo: ESE sitio es el prototipo.
    }
    if (copyProtocolExists(facts, group.typeName)) {
      muere("R1-protocolo-de-copia-ya-existe");
      continue; // R1 — el protocolo de copia ya existe.
    }
    const ownerIds = [...new Set(group.sites.filter((s) => s.ownerSymbolPath.length > 0).map((s) => symbolNodeIdOf(path, s.ownerSymbolPath)))];
    const doorReach = sharedAssemblyDoorReach(facts, group.typeName, ownerIds);
    if (doorReach >= 2) {
      muere("R2-puerta-compartida-ya-existe");
      continue; // R2 — dos o más puntos ya pasan por una puerta compartida.
    }

    // La cuarta, propia de entrar por otro ancla: no repetir lo que el
    // ancla-fuerza ya dice.
    if (elAnclaFuerzaYaLoNombra(ctx, path, group)) {
      muere("doble-conteo-con-el-ancla-fuerza");
      continue;
    }

    const assembly: RebuiltAssemblyProblem = {
      file: path,
      typeName: group.typeName,
      places: group.places,
      slotCount: group.slotKeys.length,
      coincident: group.coincident.map((c) => ({ key: c.key, value: c.value })),
      varyingKeys: group.varyingKeys,
      siteLines: group.sites.map((s) => [s.startLine, s.endLine] as const),
      ownerSymbolPaths: group.sites.map((s) => s.ownerSymbolPath).filter((q) => q.length > 0),
      doorReach,
      constructionSitesInRepo: constructionSiteCount(facts, group.typeName),
      graphSeen: true,
    };

    // EL MISMO `HypothesisSpec` DE AE12, SIN UN BYTE DE DIFERENCIA.
    const spec = buildAssemblySpec();
    const outcome = engineBuild(spec, ctx.capabilities, assembly, graph);
    if (!outcome) {
      muere(`required:${spec.required.find((c) => !c.run(assembly, graph).holds)?.id ?? "?"}`);
      continue;
    }
    muere("emitido");

    const places: readonly RoleLocation[] = group.sites.map((s, i) => ({
      file: path,
      startLine: s.startLine,
      endLine: s.endLine,
      symbol: s.ownerSymbolPath.length > 0 ? s.ownerSymbolPath.join(".") : group.typeName,
      role:
        i === 0
          ? `armado completo de "${group.typeName}" — candidato a PROTOTIPO del que los demás se copien`
          : `otro punto que vuelve a armar "${group.typeName}" entero, repitiendo las ${group.coincident.length} ranuras que ya coincidían`,
    }));

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Obliga a decidir, campo por campo, si la copia es profunda o superficial, y a mantener vivo un objeto ya armado del que los demás copian: más indirección que repetir el constructor, y se paga cuando el estado inicial compartido cambia.",
    });
  }
  return null;
}

export const hypothesis: HypothesisBuilder = {
  id: "prototype",
  pattern: "Prototype",
  layer: "patron",
  // OLA X, FRENTE B5 — ver el docstring del módulo para la medición completa
  // de por qué `speculative-abstraction` se retira (44/44 histórico
  // `ya-aplicado`, 0 % de precisión en 17 juicios) y por qué `duplication` es
  // el smell correcto (66 % de precisión, 6-7× el volumen, y ya reconoce la
  // forma "familia de contrato" que este archivo busca por su cuenta).
  // OLA AE, FRENTE AE12 — **SUMA**, no reemplaza. `duplication` sigue
  // exactamente donde estaba, con su reparto de estados publicado (31
  // hipótesis, 31 `ya-aplicado`, CERO recomendaciones) y sin tocar una línea
  // de su camino: esta ola es ADITIVA. `repeated-configured-assembly` es el
  // ancla-fuerza nueva, la única de este patrón que puede producir `ausente`
  // — ver el bloque "OLA AE, FRENTE AE12" más arriba y el docstring del
  // detector homónimo.
  anchors: ["duplication", REPEATED_CONFIGURED_ASSEMBLY_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    // CAMINO NUEVO — enteramente aparte: no comparte ni un `required`, ni un
    // discriminador, ni una rama de `appliedState` con el camino de abajo.
    if (problem.kind === REPEATED_CONFIGURED_ASSEMBLY_KIND) return buildRebuiltAssembly(problem, graph, ctx);

    const tz = nuevaTrazaPrototype(problem, graph, "duplicacion");
    if (tz) {
      // AI7 — verificación de los HECHOS que decidirían una ruta nueva sobre
      // este mismo ancla, ANTES de escribir una línea de esa ruta: ¿llega el
      // vecindario real?, ¿hay ya un `repeated-configured-assembly` sobre el
      // mismo archivo (doble conteo)?, ¿ofrece el archivo grupos de armado que
      // solapen la evidencia del ancla? Sólo lectura, sólo con la traza puesta.
      for (const path of candidateFiles(problem)) {
        const vecinos = ctx.neighborhood.findingsInFile(path);
        tz.vecinosEnArchivo += vecinos.length;
        tz.vecinosRCA += vecinos.filter((f) => f.kind === REPEATED_CONFIGURED_ASSEMBLY_KIND).length;
        const file = ctx.fileAt(path);
        if (!file) continue;
        const rangos = anchorRangesInFile(problem, path);
        const grupos = gruposDeArmadoDe(file);
        tz.gruposDeArmado += grupos.length;
        tz.gruposSolapados += grupos.filter((g) => g.sites.filter((si) => overlapsAnyRange(si.startLine, si.endLine, rangos)).length >= 2).length;
      }
      // OLA AJ (AJ3) — la sonda del camino nuevo. Sólo registra.
      sondaCopias(tz, problem, graph, ctx);
    }
    let prototypeProblem: PrototypeProblem | null = null;

    // Camino (1), AST — R1 (`RAICES.md`) cerró el bloqueo que tenía esto
    // SIEMPRE en `null`: `ctx.fileAt` ya resuelve para esta ancla inter-file
    // (`crossAnalyze` reparsea bajo demanda cada archivo que la evidencia de
    // un `Finding` inter-file toca — `code-analyzer.ts#resolveLiveFileUnit`).
    // El mecanismo es del TIPO de ancla (`inter-file`), no de CUÁL — sigue
    // aplicando intacto tras el re-anclado de Ola X/B5 (`speculative-
    // abstraction` → `duplication`, ver el docstring del módulo). Medido
    // entonces sobre el Rails (466 archivos): las 4 `speculative-abstraction`
    // vigentes tenían sus 7 `candidateFiles` resolviendo con árbol vivo, las
    // 4 veces — antes de R1, esto no corría NUNCA en producción.
    for (const path of candidateFiles(problem)) {
      const file: FileUnit | null = ctx.fileAt(path);
      if (!file) continue;
      if (tz) tz.archivosConArbol++;
      const sets = ctx.setsFor(file.language); // NUNCA `file.sets`/`deriveNodeSets` — mismo Bug C de F6.
      const classes = extractClasses(file.root, sets);
      const found = findPresetSiblingProblem(classes, path, file.language, sets, graph, anchorRangesInFile(problem, path));
      if (found) {
        prototypeProblem = found;
        break;
      }
    }

    // Camino (2), GRAFO PURO — antes de R1 era el único que corría de
    // verdad en producción para esta ancla (el grafo ya era real en
    // `crossAnalyze` desde antes; lo que faltaba era el árbol del camino 1).
    // OLA AB/AB3: mismo gate de ubicación que (1) — ver el docstring de
    // `findSoloPrototypeCandidateFromGraph`.
    if (!prototypeProblem && graph) {
      const paths = candidateFiles(problem);
      const anchorRangesByFile = new Map(paths.map((p) => [p, anchorRangesInFile(problem, p)] as const));
      prototypeProblem = findSoloPrototypeCandidateFromGraph(graph, paths, anchorRangesByFile);
    }

    // Escalón "1,5" del embudo (`ORDEN-DE-ATAQUE.md`, "EL EMBUDO DE
    // HIPÓTESIS"): la búsqueda interna de candidato de ESTA hipótesis, antes
    // de llegar a `required`/`engineBuild`. `null` acá es un resultado de
    // CONTENIDO (ninguno de los dos caminos encontró un candidato
    // estructural), no de plomería — R1 garantiza que ambos caminos corrieron
    // con datos reales antes de llegar a este punto.
    if (!prototypeProblem) {
      // OLA AI (AI7) — el camino viejo no encontró candidato: ANTES esto era
      // `return null` y acá terminaba todo. Ahora prueba el camino de armado
      // (arriba). La lógica del camino viejo no cambia en un byte: lo único
      // que cambia es QUÉ se devuelve cuando el viejo ya decidió que no tiene
      // nada — de `null` a "lo que diga el camino nuevo, que también puede ser
      // `null`". Estrictamente aditivo.
      const porArmado = buildAssemblyFromDuplication(problem, graph, ctx, tz);
      // OLA AJ (AJ3) — y si el camino de AI7 tampoco tiene nada, el camino por
      // COPIAS DEL ANCLA. Mismo criterio de aditividad que AI7 aplicó al suyo:
      // el de más abajo sólo corre donde el de más arriba ya devolvió `null`.
      const porCopias = porArmado ?? buildArmadoCopiado(problem, graph, ctx);
      cerrarTrazaPrototype(
        tz,
        porArmado ? "emitido-por-armado" : porCopias ? "emitido-por-copias" : tz && tz.archivosConArbol === 0 && graph === null ? "sin-arbol-ni-grafo" : "sin-candidato-estructural",
      );
      return porCopias;
    }

    const spec = buildSpec(ctx);
    const outcome = engineBuild(spec, ctx.capabilities, prototypeProblem, graph);
    if (tz) {
      tz.checks = spec.required.map((ch) => ({ id: ch.id, holds: ch.run(prototypeProblem, graph).holds }));
      tz.appliedState = spec.appliedState(prototypeProblem, graph).state;
      tz.origen = prototypeProblem.origin;
    }
    if (!outcome) {
      // Mismo criterio que la salida de arriba: el camino viejo ya decidió que
      // no emite, y recién ahí entra el nuevo.
      const porArmado = buildAssemblyFromDuplication(problem, graph, ctx, tz);
      const porCopias = porArmado ?? buildArmadoCopiado(problem, graph, ctx);
      cerrarTrazaPrototype(tz, porArmado ? "emitido-por-armado" : porCopias ? "emitido-por-copias" : (tz?.checks.find((ch) => !ch.holds)?.id ?? "required"));
      return porCopias;
    }

    const problemFile = prototypeProblem.file;
    const baseRole = prototypeProblem.origin === "hermanos-preset" ? "clase base común" : "clase autoconstructora aislada (sin familia de hermanos — reconocimiento estructural directo)";
    const places: readonly RoleLocation[] = [
      {
        file: problemFile,
        startLine: prototypeProblem.superclassStartLine,
        endLine: prototypeProblem.superclassEndLine,
        symbol: prototypeProblem.superclassName,
        role: baseRole,
      },
      ...prototypeProblem.siblings.map((s) => ({
        file: problemFile,
        startLine: s.ctorStartLine,
        endLine: s.ctorEndLine,
        symbol: `${s.name}#${s.ctorName}`,
        role: s.selfConstructingMemberName
          ? `${prototypeProblem.origin === "hermanos-preset" ? "hermano preset" : "clase"} que YA se auto-construye (${s.selfConstructingMemberName})${s.hasExternalCaller ? ", con al menos un cliente externo que ya lo usa" : ""}`
          : "hermano que sólo fija valores iniciales distintos (candidato a colapsar en un prototipo clonable)",
      })),
    ];

    const hipotesis = toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Añade un método clone/dup por jerarquía y obliga a pensar en copia profunda vs. superficial de cada campo.",
    });
    cerrarTrazaPrototype(tz, "emitido");
    return hipotesis;
  },
};
