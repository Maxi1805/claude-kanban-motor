/**
 * *** RECUPERADO (Ola W, frente W2) ***. La Ola V (V3, ver más abajo)
 * corrigió el `required` de forma real (34→21 recomendaciones reales, 0 %,
 * ver historial abajo) pero el arreglo exigió, ADEMÁS de "manejadores
 * ligados a un disparador", un portador con `invokes-indirect` confirmado —
 * y esa arista es escasísima (41 en TODO el grafo de guava, medido por V3).
 * Resultado: el patrón pasó de 34 a **0 hipótesis en los 13 repos**
 * (`ola-v/informes/INTEGRADOR.md` §2, "Command: enmudeció"). Cobertura
 * perdida, no precisión ganada.
 *
 * EL CRITERIO CORRECTO (encargo de la Ola W, ya estaba bien planteado desde
 * la Ola 11b — `PLAN-INTENCIONES.md` §10, "diseño ya estructural... nunca se
 * verificó contra población real"): *¿existe una interfaz I con >= 2
 * implementadores, un miembro común por (nombre, aridad) — SIN filtrar por
 * vocabulario execute/run —, y un invocador real: o una llamada polimórfica
 * a través de I, o un PORTADOR (cola/lista) que sostiene >= 2 implementaciones
 * distintas y se invoca indirectamente?* Esa terna YA estaba implementada
 * (`findCommandAbstraction`, abajo) — pero SÓLO se usaba para decidir
 * `ya-aplicado`/`aplicado-eludido` (¿el patrón YA existe, en TODO el repo?).
 * El camino AUSENTE/PARCIAL (`required`) nunca la consultaba: colgaba de una
 * heurística MÁS DÉBIL e independiente ("manejadores ligados a un
 * disparador"), la que V3 endureció hasta silenciar el patrón entero.
 *
 * EL ARREGLO (Ola W2): `required` reconoce la MISMA terna interfaz+miembro
 * común, pero ANCLADA a los manejadores de ESTE hallazgo — nunca una
 * interfaz cualquiera del repo (ver `commandInterfaceEvidence`, y la nota de
 * por qué NO se reutiliza el `findCommandAbstraction` GLOBAL para esto, más
 * abajo) — SIN exigir el invocador confirmado en este paso (el invocador
 * decide `parcial` vs. lo que ya deciden `ya-aplicado`/`aplicado-eludido` en
 * `appliedState`, nunca si el patrón APLICA): interfaz+miembro común REAL
 * (implements/satisfies verdaderos, nunca inferidos por conjunto de
 * miembros — regla dura del encargo) entre >= 2 DUEÑOS de los manejadores
 * duplicados ya es evidencia de que un protocolo compartido existe y sólo
 * falta formalizar la invocación — la forma PARCIAL exacta que Command debe
 * reconocer. Cuando NINGÚN protocolo conecta los manejadores de este
 * hallazgo, se cae al heurístico de la Ola V (manejadores ligados a un
 * disparador + portador con invocación indirecta) — sigue sin encontrar nada
 * en el corpus medido (ver informe W2), pero queda como camino
 * estructuralmente válido, sin tocar.
 *
 * ── HISTORIAL (Ola V, frente V3) ───────────────────────────────────────────
 * Medido por primera vez contra población real en la Ola U: 34 hipótesis, 21
 * recomendaciones reales (11 `ausente` + 10 `parcial`), **0 % de precisión
 * (n=8, Wilson [0 %, 32 %])** — CERO verdaderas, y 2 de los 8 juicios son
 * `problema-si-patrón-no` (duplicación real, remedio Extract Function, NO
 * Command — `eslint/lib/rules/keyword-spacing.js:533`). El ancla
 * (`duplication`) mide 66 % de precisión: el ancla acierta, la hipótesis no.
 *
 * LA CAUSA, verificada corriendo el analizador real (`u-int-detalle-
 * hipotesis.mts`) sobre `eslint/lib/rules/keyword-spacing.js:533` y
 * `arrow-spacing.js:129`, y confirmada contra una muestra ampliada de 13
 * casos (eslint, sqlalchemy, rubocop, hugo, rails, y el propio analizador
 * contra sí mismo — CERO verdaderas en las 13): el `required`
 * (`atLeastTwoHandlersBoundToTrigger`) exigía sólo "≥2 manejadores
 * ENTREGADOS COMO VALOR a un portador y nunca llamados por nombre" —
 * `carries` entrante sin `calls` entrante. Esa firma es CIERTA para
 * CUALQUIER callback registrado en CUALQUIER framework, no sólo para un
 * Command real: el objeto que devuelve `create()` en una regla de ESLint
 * (`return { ForOfStatement: checkSpacingForForOfStatement, ... }`,
 * `keyword-spacing.js:637`) hace que CADA handler sea "entregado como valor,
 * nunca llamado por nombre" — lo invoca el motor de recorrido de ESLint,
 * invisible al grafo — y el patrón lo confundía con una cola de comandos. La
 * pista del plan (intención §10: "un PORTADOR que sostiene ≥2
 * implementaciones distintas y SE INVOCA INDIRECTAMENTE") ya describía la
 * evidencia que faltaba — pero sólo se exigía para el estado COMPLETO
 * (`findCommandAbstraction`/`carrierInvokerFor`, con su `invokes-indirect`
 * obligatorio); el camino AUSENTE/PARCIAL (`!abstraction` en `appliedState`)
 * nunca la pedía. Un caso mostraba encima un SEGUNDO bug independiente
 * (`eslint/lib/rules/arrow-spacing.js:129`, verdict "falso"): las "2
 * ubicaciones duplicadas" resolvían AL MISMO nodo de función (`spaces`,
 * citado dos veces) — nunca dos manejadores DISTINTOS.
 *
 * EL ARREGLO: `atLeastTwoHandlersBoundToTrigger` ahora exige, además de la
 * firma "carries sin calls", que un PORTADOR REAL agrupe ≥2 manejadores
 * DISTINTOS (por id de nodo, no por ubicación — cierra el bug de
 * `arrow-spacing.js` gratis: dos ubicaciones que resuelven al mismo nodo NO
 * cuentan como 2) Y que ese portador reciba ≥1 `invokes-indirect` —
 * exactamente el mismo criterio que `carrierInvokerFor` ya exigía para el
 * estado COMPLETO, ahora aplicado TAMBIÉN a la recomendación. Ver
 * `distinctHandlerCarrier` más abajo. Efecto medido (ver informe V3): el
 * volumen de recomendaciones reales cae fuerte porque `invokes-indirect` es
 * escaso en el corpus (41 aristas en TODO el grafo de guava) — es la
 * consecuencia esperada de exigir evidencia real de "cola/lista" en vez de
 * "parece un callback": Command debería ser RARO, no debería colgar de casi
 * cualquier duplicación de manejadores.
 *
 * Lo que NO se tocó: el estado COMPLETO (`findCommandAbstraction`) sigue
 * produciendo 13 `aplicado-eludido` falsos por una causa AJENA a este
 * archivo — `graph/edges/satisfies-derive.ts:430-431` infiere `satisfies`
 * por coincidencia PARCIAL de miembros y fabrica interfaces sin relación
 * real (`sqlalchemy/.../postgresql/array.py:50`,
 * `rubocop/lib/rubocop/cop/generator.rb:198`) — PIDO A OTRO FRENTE, no es de
 * `command.ts`.
 *
 * ── LO ANTERIOR (Ola 10/11b), SIN CAMBIOS DE FONDO ─────────────────────────
 * Hipótesis "Command" — F6 (migración original de `pattern-behavioral.ts`),
 * reescrita en Ola 10 (CONTRATO-F10.md, encargo de esta tarea) para que el
 * excluder de "ya aplicado" deje de mirar VOCABULARIO y mire ESTRUCTURA.
 *
 * ── ANCLA (sin cambios) ──────────────────────────────────────────────────
 * `duplication` / `distributed-duplication` — ver el razonamiento original
 * (refactoring.guru, §Problem) más abajo, sin tocar. El `required` sigue
 * siendo `atLeastTwoHandlersBoundToTrigger`, pero desde la Ola 11b (D2) lo
 * contesta el GRAFO y no un vocabulario de eventos del DOM: ver el bloque
 * "MANEJADOR LIGADO A UN DISPARADOR, POR ESTRUCTURA" más abajo, que reemplaza
 * a `TRIGGER_NAME`/`TRIGGER_SUFFIX`. Ambos anclas son `inter-file`: `Finding.language`
 * es `null` y `attachHypotheses` las procesa en la llamada (2), DENTRO de
 * `crossAnalyze` — el momento en que `repo.graph` YA es el grafo real del
 * repo (`hypotheses/run.ts`, docstring de `attachHypotheses`). Consecuencia
 * feliz, medida por lectura de `code-analyzer.ts:1854`: esta reescritura deja
 * de depender de `RepoUnit.functions` (hardcodeado `[]` en producción,
 * `code-analyzer.ts:1854` — la brecha que la versión anterior de este mismo
 * archivo declaraba como "estados ya-aplicado/aplicado-eludido
 * ESTRUCTURALMENTE INALCANZABLES hoy") y pasa a depender de `RepoUnit.graph`,
 * que SÍ está poblado en esa llamada. El excluder nuevo es alcanzable en
 * producción, no sólo en el test.
 *
 * ── EL EXCLUDER VIEJO, VOCABULARIO PURO (lo que esta tarea reemplaza) ─────
 * Antes: `abstractionLevel` agrupaba `RepoUnit.functions` por tipo contenedor
 * y buscaba un nombre que matcheara `COMMAND_METHOD_NAME =
 * /^(execute|run|invoke|call)$/i` + `UNDO_METHOD_NAME = /^(undo|redo)$/i` —
 * el mismo vocabulario cerrado que `pattern-behavioral.ts:728/729` sigue
 * usando para `TRIGGER_NAME`/`TRIGGER_SUFFIX` en la REGLA VIEJA (que corre en
 * paralelo, C3 del registro, y no tiene grafo con qué reemplazarlo). Un tipo
 * con un único método público, sin importar su nombre, jamás producía
 * `ya-aplicado` si ese nombre no estaba en la lista cerrada.
 *
 * ── EL REEMPLAZO ESTRUCTURAL ───────────────────────────────────────────────
 * `findCommandAbstraction` (abajo) busca, sobre `RepoUnit.graph`, la TERNA
 * que el encargo especifica — nunca por nombre:
 *
 *   1. Una interfaz `I` con `implements|satisfies` de >= 2 nodos distintos
 *      (`implementersByInterface`).
 *   2. Un miembro común a TODOS esos implementadores, mismo `(name, arity)`
 *      exacto en cada uno (`memberSignatures`, `commonMemberOfLeastArity`) —
 *      cuando hay más de un candidato común, se elige el de MENOR aridad
 *      (desempate alfabético, determinístico). Nunca se filtra por
 *      `execute`/`undo`/`run`/`invoke`/`call`: el nombre real es lo que sea.
 *   3. Un invocador real: O bien una arista `calls` confidente hacia
 *      `sym:I.<miembro>` (llamado polimórfico a través del tipo interfaz —
 *      `viaCalls`), O bien un portador (`carrier`) con `carries` hacia >= 2
 *      de los miembros concretos de los implementadores (fan-in real: el
 *      MISMO portador puede sostener distintos comandos en distintos
 *      momentos/ramas) MÁS >= 1 arista `invokes-indirect` entrante a ese
 *      portador (`viaCarrier` — "la lista/cola de comandos" del encargo).
 *
 * Sin (3), la interfaz+miembro común por sí solos NO alcanzan para
 * `ya-aplicado`: hay una interfaz con forma de Command pero ninguna
 * evidencia de que alguien la invoque a través de ella — ese caso se declara
 * en el `why` del check (visible cuando aparece) y el patrón cae a evaluar
 * PARCIAL/AUSENTE sobre los manejadores de ESTE hallazgo, nunca se inventa
 * un estado intermedio nuevo.
 *
 * Todas las aristas se leen vía `confidentEdges` (excluye `provenance:
 * "ambiguous"` — CONTRATO-F9.md §4.5, mismo criterio que `wrapping-chain.ts`
 * y los 17 detectores `inter-file`).
 *
 * ── PARCIAL, MEDIDO POR FIRMA (reemplaza el vocabulario también acá; Ola V
 * exige además el portador ANTES de llegar a esta rama, ver más abajo) ─────
 * Antes, PARCIAL era "algún tipo define execute-like sin undo/redo" (mismo
 * vocabulario). Ahora: de los manejadores de ESTE hallazgo ligados a un
 * disparador (`triggerBoundLocations`, sin cambios), se ubica su nodo real
 * en el grafo (`nodeForClone`, por archivo+nombre — mejor esfuerzo,
 * declarado) y se compara su `arity`. Desde la Ola V, `required`
 * (`atLeastTwoHandlersBoundToTrigger`) ya EXIGIÓ un portador real (`carries`
 * fan-in≥2 de manejadores DISTINTOS + `invokes-indirect`≥1) para llegar
 * hasta acá — ver el docstring de ese check y "*** CORREGIDO (Ola V) ***"
 * arriba. Con eso ya confirmado, lo único que separa PARCIAL de AUSENTE es
 * la FIRMA: `>= 2` manejadores con la MISMA aridad, sin ninguna interfaz
 * común encontrada (paso 1 de arriba vacío) ⇒ `parcial` (más barato
 * formalizar: ya comparten firma). Aridad distinta ⇒ `ausente` (falta más
 * diseño). Si la aridad de algún manejador no se puede derivar (sin grafo, o
 * el símbolo no se ubica) ⇒ NO se afirma "misma firma": cae a `ausente`, con
 * el motivo declarado en el check, nunca adivinado (requisito 3 del
 * encargo).
 *
 * ── AUSENTE (sin cambios) ─────────────────────────────────────────────────
 * Lo de siempre: `required` (`atLeastTwoHandlersBoundToTrigger`) se cumplió
 * pero ni la interfaz-completa ni la firma-compartida aplican.
 *
 * ── `aplicado-eludido`, REESCRITO ESTRUCTURALMENTE ────────────────────────
 * Con la abstracción COMPLETA encontrada, `handlersDelegateToAbstraction`
 * reemplaza el viejo `COMMAND_CALL_TEXT` (regex `/\b(execute|run|invoke|
 * call)\s*\(/i` sobre `clone.normalized`) por una arista real: ¿el nodo de
 * CADA manejador de este hallazgo tiene una arista `calls`/`invokes-indirect`
 * confidente hacia alguno de los miembros concretos de los implementadores,
 * el miembro de la interfaz, o el portador que probó el invocador? Si NO se
 * puede ubicar el nodo del manejador en el grafo (mismo mejor-esfuerzo de
 * `nodeForClone`), se trata como NO delegante — declarado en el `why`, nunca
 * escondido: ninguna de las dos salidas posibles (`ya-aplicado`/
 * `aplicado-eludido`) es una sugerencia (regla 1 del encargo), así que
 * default a la lectura más cautelosa (alerta de fuga) no genera un falso
 * "hacé esto" — sólo puede sonar una alerta de más.
 *
 * ── `needs: []`, SIN CAMBIOS ───────────────────────────────────────────────
 * La forma entera (disparador, interfaz, miembro común, portador) no exige
 * clases por nombre de capacidad — `memberSignatures`/`implements`/
 * `satisfies` ya existen o no existen en el grafo, sin gate de lenguaje
 * adicional. Ver "FORMA EN LENGUAJES SIN CLASES" más abajo.
 *
 * ── RIESGO DECLARADO (satisfies en C#, A9) ────────────────────────────────
 * Igual que `wrapping-chain.ts`: `satisfies` aporta 2.961 aristas en
 * newtonsoft-json (15,6% del grafo) con un umbral nunca verificado sobre ese
 * repo. Toda interfaz encontrada acá vía `satisfies` (no `implements`) lo
 * declara en el `why` del check de existencia (`viaSatisfies`).
 *
 * ── MEDIDO SOBRE EL CORPUS (Ola 10, `scripts/measure-command-states.mts`) ──
 * Ver el resultado de la tarea para el detalle por repo — declarado acá qué
 * NO se re-verificó: el fan-in de `carries` hacia miembros NOMBRADOS de
 * implementadores concretos (a diferencia del anónimo `<anon@n>` que
 * `portador.ts` sintetiza para closures) depende de que exista una arista
 * `carries` con `to` en un nodo `symbol` con nombre real — hoy eso sólo
 * ocurre para el mecanismo Forma 3(a)/portador con nombre
 * (`invocacion-indirecta.ts`/`portador.ts`, campos `self.foo`), no para
 * "una lista que guarda instancias de objetos Command". La ruta `viaCarrier`
 * puede quedar tan inerte en este corpus como `findWrappingChains` — medido,
 * no escondido, ver el resultado de la tarea.
 */
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { ROLE_OPERATION, ROLE_SITE, ROLE_TREATMENT } from "../detect/inter-file/invariant-scaffold-varying-call.js";
import type { CloneCandidate, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../graph/types.js";
import { build as engineBuild, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisCheck } from "./types.js";

/**
 * ── "MANEJADOR LIGADO A UN DISPARADOR", POR ESTRUCTURA (Ola 11b, D2) ──────
 *
 * Hasta la Ola 11a esta pregunta la contestaban dos vocabularios de UI:
 * `TRIGGER_NAME = /^(on|handle)[_A-Z]/i` y
 * `TRIGGER_SUFFIX = /(click|shortcut|keypress|keydown|keyup)$/i`. El segundo
 * es una de las tres constantes que el usuario nombró como prohibidas: cinco
 * nombres de evento del DOM, que no describen ninguna relación — describen un
 * framework. Un manejador de Rails (`after_save`), de un bus de mensajes
 * (`consume_order_created`) o de un job (`perform`) no los matchea, y una
 * función llamada `onboardUser` los matchea sin ser manejador de nada.
 *
 * QUÉ HACE ESTRUCTURALMENTE UN MANEJADOR LIGADO A UN DISPARADOR: no lo llama
 * nadie por su nombre — se lo ENTREGA a otro, que decide cuándo correrlo. En
 * el grafo eso son dos hechos simultáneos sobre el nodo del manejador:
 *
 *   (a) le entra al menos una arista `carries` — el invocable llegó a un
 *       portador (un campo, una ranura de argumento, una tabla de despacho):
 *       alguien lo registró COMO VALOR; y
 *   (b) NO le entra ninguna arista `calls` confidente — nadie en el repo lo
 *       invoca por su nombre.
 *
 * (a) sin (b) es una función normal que además se pasa por ahí. (b) sin (a)
 * es código muerto o un punto de entrada del proceso. Las dos juntas son
 * exactamente "alguien más decide cuándo esto corre", sin nombrar ni un
 * evento, ni un framework, ni un prefijo. Es la misma Forma 4 por valor
 * (`carries`/`invokes-indirect`) que esta hipótesis ya usa en `viaCarrier`.
 *
 * ── DÓNDE PUEDE HABLAR TODAVÍA EL VOCABULARIO, Y POR QUÉ ──────────────────
 * El grafo decide SIEMPRE que puede: hay grafo Y el nodo del manejador se
 * ubica (`nodeForClone`). El test por nombre queda como respaldo declarado
 * para el único caso en que el grafo no puede contestar nada — sin
 * `repo.graph` (la pasada per-file de `analyzeFile`, donde el grafo del repo
 * todavía no existe: brecha ESTRUCTURAL ya declarada en `code-analyzer.ts`)
 * o con el símbolo sin ubicar. Cada `Check` dice en su evidencia por cuál de
 * las dos vías se resolvió cada lugar, así que la mezcla nunca queda
 * escondida. En producción, dentro de `crossAnalyze`, la vía normal es el
 * grafo.
 *
 * ── MEDIDO, NO SUPUESTO (sin corpus en disco; `tests/fixtures/patterns`) ───
 * Los 9 hallazgos `duplication`/`distributed-duplication` de la fixture dan
 * `carriesIn = 0` en TODOS sus manejadores ubicables, así que el criterio
 * nuevo produce el MISMO veredicto que el viejo: 0 de 9 pasan el `required`,
 * antes y después. No es un cambio de números, es un cambio de criterio. Y el
 * mecanismo no está inerte: en esa misma fixture hay 16 nodos `function-like`
 * con `carries` entrante y CERO `calls` entrante — el predicado tiene
 * población real (15 de esos 16 son closures anónimos pasados como argumento,
 * que nunca son el `functionName` de un clon; el 16º es un miembro con nombre).
 * Recall en repos reales: NO MEDIDO (el corpus no está en disco).
 */
const COMMAND_MIN_TRIGGER_HANDLERS = 2;

/** Respaldo declarado — ver el bloque de arriba: sólo corre cuando el grafo no puede contestar. */
const TRIGGER_NAME_FALLBACK = /^(on|handle)[_A-Z]/i;

function nameSuggestsTrigger(name: string | null): boolean {
  return name !== null && TRIGGER_NAME_FALLBACK.test(name);
}

function findClone(repo: RepoUnit, loc: RoleLocation): CloneCandidate | null {
  return repo.clones.find((c) => c.file === loc.file && c.startLine === loc.startLine && c.endLine === loc.endLine) ?? null;
}

interface BoundHandler {
  location: RoleLocation;
  clone: CloneCandidate;
  /** Por cuál vía se resolvió: el grafo, o el respaldo por nombre. */
  via: "grafo" | "nombre";
}

/**
 * El veredicto estructural para UN manejador, o `null` cuando el grafo no
 * puede contestar (sin grafo, o símbolo sin ubicar) y hay que caer al
 * respaldo por nombre.
 */
function graphSaysBoundToTrigger(index: Index | null, clone: CloneCandidate): boolean | null {
  if (!index) return null;
  const node = nodeForClone(index, clone);
  if (!node) return null;
  const inbound = index.edgesTo.get(node.id) ?? [];
  const registeredAsValue = inbound.some((e) => e.kind === "carries");
  const calledByName = inbound.some((e) => e.kind === "calls");
  return registeredAsValue && !calledByName;
}

function triggerBoundLocations(problem: Finding, repo: RepoUnit): BoundHandler[] {
  const index = repo.graph ? indexFor(repo.graph) : null;
  const out: BoundHandler[] = [];
  for (const location of problem.locations) {
    const clone = findClone(repo, location);
    if (!clone) continue;
    const structural = graphSaysBoundToTrigger(index, clone);
    if (structural === true) out.push({ location, clone, via: "grafo" });
    else if (structural === null && nameSuggestsTrigger(clone.functionName)) out.push({ location, clone, via: "nombre" });
  }
  return out;
}

function describeNames(bound: readonly BoundHandler[]): string {
  return bound.map((b) => `${b.clone.functionName} (vía ${b.via})`).join(", ");
}

/**
 * INTENCIÓN QUE VERIFICA ESTE CHEQUEO (required, Ola V): Command encapsula
 * una solicitud como OBJETO que se puede pasar, ENCOLAR o deshacer — así que
 * no alcanza con que ≥2 manejadores estén "entregados como valor y nunca
 * llamados por nombre" (esa firma también describe la tabla de despacho de
 * CUALQUIER framework, invocada por un motor invisible al grafo, ver
 * docstring del módulo). Hace falta, ADEMÁS, un PORTADOR real que agrupe ≥2
 * manejadores DISTINTOS (por nodo, no por ubicación) Y que ese portador
 * reciba ≥1 `invokes-indirect` — la evidencia de que ALGO en el repo YA
 * trata a esos manejadores como piezas intercambiables, ejecutadas DESPUÉS,
 * a través de un mismo punto de indirección (la "cola/lista de comandos" del
 * encargo). Sin esa segunda mitad, "no llamado por nombre" no distingue
 * Command de "no hay patrón acá, el remedio es Extract Function".
 */
function distinctHandlerCarrier(index: Index, bound: readonly BoundHandler[]): CarrierInvoker {
  const ids = new Set<string>();
  for (const b of bound) {
    if (b.via !== "grafo") continue; // el respaldo por nombre no tiene nodo que ubicar con certeza — no cuenta para el portador.
    const node = nodeForClone(index, b.clone);
    if (node) ids.add(node.id);
  }
  if (ids.size < 2) {
    return {
      found: false,
      carrierId: null,
      evidence: `Menos de 2 manejadores DISTINTOS confirmados por grafo (${ids.size}) — no hay con qué formar un portador real (dos ubicaciones que resuelven al MISMO nodo no cuentan como dos manejadores).`,
    };
  }
  return carrierInvokerFor(index, ids);
}

/**
 * Ola W2: este check quedó como CAMINO DE RESPALDO — ver `commandRequiredCheck`
 * más abajo, hoy registrado en `buildSpec.required`. Sin cambios de código:
 * sigue siendo el heurístico de la Ola V (manejadores ligados a un
 * disparador + portador con invocación indirecta), que el nuevo required
 * consulta SÓLO cuando `commandInterfaceEvidence` no encuentra ningún
 * protocolo compartido REAL entre los dueños de los manejadores de este
 * hallazgo.
 */
const atLeastTwoHandlersBoundToTrigger: Check<Finding, RepoUnit> = {
  id: "at-least-two-handlers-bound-to-trigger",
  describe:
    `Al menos ${COMMAND_MIN_TRIGGER_HANDLERS} manejadores DISTINTOS entregados como valor a un portador (sin ser ` +
    "llamados por nombre) Y un PORTADOR REAL que los agrupa (`carries` fan-in≥2) Y recibe ≥1 `invokes-indirect` — " +
    "sin el portador invocado, 'no llamado por nombre' describe por igual la tabla de despacho de un framework " +
    "(ver docstring del módulo). Sin grafo, respaldo declarado por nombre (sin verificación de portador posible).",
  run(problem, repo) {
    const bound = triggerBoundLocations(problem, repo);
    const index = repo.graph ? indexFor(repo.graph) : null;
    if (!index) {
      // Sin grafo: no hay forma de verificar un portador real — respaldo
      // declarado, sólo el mínimo de manejadores por nombre (ver docstring).
      return {
        holds: bound.length >= COMMAND_MIN_TRIGGER_HANDLERS,
        evidence:
          bound.length > 0
            ? `Sin grafo: ${bound.length}/${problem.locations.length} lugares son manejadores ligados a un disparador por nombre (respaldo declarado, portador no verificable): ${describeNames(bound)}.`
            : `Sin grafo y ninguno de los ${problem.locations.length} lugares duplicados matchea el respaldo por nombre.`,
      };
    }
    const carrier = distinctHandlerCarrier(index, bound);
    return {
      holds: carrier.found,
      evidence: carrier.found
        ? `${bound.length}/${problem.locations.length} lugares son manejadores ligados a un disparador (${describeNames(bound)}) Y ${carrier.evidence}`
        : `${bound.length}/${problem.locations.length} lugares son manejadores ligados a un disparador (asignados como valor, no llamados por nombre: ${describeNames(bound)}), pero SIN portador real que los agrupe y reciba invocación indirecta — ${carrier.evidence} Asignado a un despachador de framework invisible al grafo no alcanza (medido: eslint/lib/rules/keyword-spacing.js:533).`,
    };
  },
};

/**
 * INTENCIÓN QUE VERIFICA ESTE CHEQUEO (required, Ola W2 — ver "*** RECUPERADO
 * ***" en el docstring del módulo): decide si Command APLICA acá. Primero
 * intenta la terna del encargo ANCLADA a los manejadores de ESTE hallazgo
 * (`commandInterfaceEvidence`: interfaz real con >= 2 implementadores DUEÑOS
 * de estos manejadores + miembro común por (nombre, aridad), sin filtrar por
 * vocabulario execute/run) — si la encuentra, Command aplica sin más (el
 * invocador real decide `parcial` vs. `ya-aplicado`/`aplicado-eludido` más
 * abajo, en `appliedState`, nunca acá: required sólo pregunta si el patrón
 * es la mitigación correcta, no si ya está completo). Si NINGÚN protocolo
 * compartido conecta a estos manejadores, cae al heurístico de la Ola V
 * (`atLeastTwoHandlersBoundToTrigger`, sin cambios de código): manejadores
 * ligados a un disparador + portador real con invocación indirecta.
 */
const commandRequiredCheck: Check<Finding, CommandProblemGraph> = {
  id: "interfaz-compartida-o-manejador-ligado-a-disparador",
  describe:
    `Al menos ${COMMAND_MIN_TRIGGER_HANDLERS} manejadores duplicados con evidencia REAL de Command: o una interfaz ` +
    "compartida real (implements/satisfies + miembro común por nombre/aridad, sin vocabulario) entre los dueños de " +
    "los manejadores, o manejadores ligados a un disparador (carries sin calls) con un portador real que los agrupa " +
    "y recibe invocación indirecta (ver docstring del módulo).",
  run(problem, ctx) {
    if (ctx.graph) {
      const index = indexFor(ctx.graph);
      const handlerIds = handlerNodeIdsOf(index, ctx.repo, problem);
      const iface = commandInterfaceEvidence(index, handlerIds);
      if (iface) {
        return {
          holds: true,
          evidence: `${iface.evidence} (manejadores de este hallazgo resueltos en el grafo: ${handlerIds.size}/${problem.locations.length}).`,
        };
      }
    }
    return atLeastTwoHandlersBoundToTrigger.run(problem, ctx.repo);
  },
};

const allHandlersBoundToTrigger: Check<Finding, RepoUnit> = {
  id: "all-handlers-bound-to-trigger",
  describe: "TODOS los lugares duplicados (no sólo dos) son manejadores ligados a un trigger.",
  run(problem, repo) {
    const bound = triggerBoundLocations(problem, repo);
    const holds = bound.length > 0 && bound.length === problem.locations.length;
    return {
      holds,
      evidence: `${bound.length}/${problem.locations.length} lugares duplicados son manejadores ligados a un trigger.`,
    };
  },
};

const handlersSpanMultipleFiles: Check<Finding, RepoUnit> = {
  id: "handlers-span-multiple-files",
  describe: 'Los manejadores ligados a trigger están en archivos DISTINTOS — el caso canónico "botón Copiar + Ctrl+C".',
  run(problem, repo) {
    const bound = triggerBoundLocations(problem, repo);
    const files = new Set(bound.map((b) => b.location.file));
    return {
      holds: files.size >= 2,
      evidence:
        files.size >= 2
          ? `Manejadores ligados a trigger en ${files.size} archivos distintos: ${[...files].join(", ")}.`
          : `Todos los manejadores ligados a trigger están en el mismo archivo${files.size === 1 ? ` (${[...files][0]})` : ""}.`,
    };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Índice de grafo — mismo criterio que `wrapping-chain.ts`: `confidentEdges`
 * (excluye `ambiguous`), memoizado por identidad de `graph` (`WeakMap`) para
 * no reconstruirlo por cada `Finding` de la misma corrida — command.ts se
 * llama una vez por hallazgo `duplication`/`distributed-duplication`, y un
 * repo grande (guava) puede tener miles.
 * ──────────────────────────────────────────────────────────────────────── */
interface Index {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** targetId (miembro concreto) -> portadores con `carries` hacia él. */
  readonly carriersByTarget: ReadonlyMap<string, readonly string[]>;
  /** portadorId -> conjunto de targets a los que le llega un `carries`. */
  readonly carrierTargets: ReadonlyMap<string, ReadonlySet<string>>;
  /** Ola W2 — memberId -> ownerId, leído de la MISMA arista `contains` que
   *  `edgesFrom`/`edgesTo` ya indexan (nunca reconstruido a mano): quién
   *  DECLARA a cada miembro, la mitad que faltaba para anclar
   *  `commandInterfaceEvidence` a los manejadores de UN hallazgo en vez de a
   *  "cualquier interfaz del repo". */
  readonly ownerByMember: ReadonlyMap<string, string>;
}

function buildIndex(graph: CodeGraph): Index {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  const carriersByTarget = new Map<string, string[]>();
  const carrierTargets = new Map<string, Set<string>>();
  const ownerByMember = new Map<string, string>();

  for (const e of confidentEdges(graph)) {
    const from = edgesFrom.get(e.from);
    if (from) from.push(e);
    else edgesFrom.set(e.from, [e]);

    const to = edgesTo.get(e.to);
    if (to) to.push(e);
    else edgesTo.set(e.to, [e]);

    if (e.kind === "carries") {
      const byTarget = carriersByTarget.get(e.to);
      if (byTarget) byTarget.push(e.from);
      else carriersByTarget.set(e.to, [e.from]);

      const targets = carrierTargets.get(e.from);
      if (targets) targets.add(e.to);
      else carrierTargets.set(e.from, new Set([e.to]));
    }
    if (e.kind === "contains" && !ownerByMember.has(e.to)) ownerByMember.set(e.to, e.from);
  }
  return { nodeById, edgesFrom, edgesTo, carriersByTarget, carrierTargets, ownerByMember };
}

const indexCache = new WeakMap<CodeGraph, Index>();
function indexFor(graph: CodeGraph): Index {
  const cached = indexCache.get(graph);
  if (cached) return cached;
  const built = buildIndex(graph);
  indexCache.set(graph, built);
  return built;
}

function asGraphIndex(index: Index): GraphIndex {
  return {
    nodeById: (id) => index.nodeById.get(id) ?? null,
    edgesFrom: (id) => index.edgesFrom.get(id) ?? [],
    edgesTo: (id) => index.edgesTo.get(id) ?? [],
  };
}

/** Id del miembro `name` de `ownerId`, leído de la MISMA arista `contains`
 *  que `memberSignatures` ya recorrió — nunca reconstruido a mano. */
function memberNodeId(index: Index, ownerId: string, name: string): string | null {
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) {
      return target.id;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Paso 1+2 — interfaz I con >= 2 implementadores que redeclaran el MISMO
 * miembro (name, arity) — nunca por nombre execute/undo (requisito 2).
 * ──────────────────────────────────────────────────────────────────────── */
const INTERFACE_EDGE_KINDS = new Set(["implements", "satisfies"]);

interface Implementer {
  readonly id: string;
  readonly viaSatisfies: boolean;
}

function implementersByInterface(index: Index): Map<string, Implementer[]> {
  const map = new Map<string, Implementer[]>();
  for (const edges of index.edgesFrom.values()) {
    for (const e of edges) {
      if (!INTERFACE_EDGE_KINDS.has(e.kind)) continue;
      const list = map.get(e.to) ?? [];
      list.push({ id: e.from, viaSatisfies: e.kind === "satisfies" });
      map.set(e.to, list);
    }
  }
  return map;
}

interface CommonMember {
  readonly name: string;
  readonly arity: number | null;
}

/** El miembro `(name, arity)` común a TODOS los `implementers` — de MENOR
 *  aridad cuando hay más de un candidato común, desempate alfabético. `null`
 *  si ningún miembro es común a todos (no hay contrato compartido real). */
function commonMemberOfLeastArity(index: Index, implementers: readonly Implementer[]): CommonMember | null {
  const gi = asGraphIndex(index);
  const perImplementer = implementers.map((im) => memberSignatures(gi, im.id));
  if (perImplementer.some((sigs) => sigs.length === 0)) return null;

  let common: CommonMember[] = perImplementer[0]!.map((s) => ({ name: s.name, arity: s.arity }));
  for (const sigs of perImplementer.slice(1)) {
    common = common.filter((c) => sigs.some((s) => s.name === c.name && s.arity === c.arity));
  }
  if (common.length === 0) return null;

  const withKnownArity = common.filter((c) => c.arity !== null);
  const pool = withKnownArity.length > 0 ? withKnownArity : common;
  pool.sort((a, b) => (a.arity ?? Number.POSITIVE_INFINITY) - (b.arity ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name));
  return pool[0]!;
}

/* ────────────────────────────────────────────────────────────────────────
 * Paso 3 — invocador real: calls directo a `sym:I.<miembro>`, o portador con
 * `carries` fan-in >= 2 hacia los miembros concretos + `invokes-indirect`
 * fan-in >= 1 (la lista/cola de comandos).
 * ──────────────────────────────────────────────────────────────────────── */
function hasConfidentCallInto(index: Index, targetId: string): boolean {
  return (index.edgesTo.get(targetId) ?? []).some((e) => e.kind === "calls");
}

interface CarrierInvoker {
  readonly found: boolean;
  readonly carrierId: string | null;
  readonly evidence: string;
}

/** Portador cuyo `carries` toca >= 2 ids de `targetIds` Y que recibe >= 1
 *  `invokes-indirect` — la "cola/lista de comandos" del encargo. */
function carrierInvokerFor(index: Index, targetIds: ReadonlySet<string>): CarrierInvoker {
  const candidateCarriers = new Set<string>();
  for (const id of targetIds) for (const carrierId of index.carriersByTarget.get(id) ?? []) candidateCarriers.add(carrierId);

  for (const carrierId of candidateCarriers) {
    const targets = index.carrierTargets.get(carrierId) ?? new Set<string>();
    let matched = 0;
    for (const t of targets) if (targetIds.has(t)) matched++;
    if (matched < 2) continue;
    const invokesIn = (index.edgesTo.get(carrierId) ?? []).filter((e) => e.kind === "invokes-indirect");
    if (invokesIn.length >= 1) {
      return {
        found: true,
        carrierId,
        evidence: `Portador "${carrierId}" porta ${matched} miembro(s) distinto(s) de los implementadores y recibe ${invokesIn.length} invocación(es) indirecta(s) — la cola/lista de comandos.`,
      };
    }
  }
  return { found: false, carrierId: null, evidence: "Ningún portador agrupa ≥2 miembros de los implementadores con ≥1 invocación indirecta hacia él." };
}

interface CommandAbstraction {
  readonly interfaceId: string;
  readonly implementers: readonly Implementer[];
  readonly member: CommonMember;
  /** implementerId -> id del nodo símbolo de su miembro concreto. Sólo los implementadores donde se pudo ubicar. */
  readonly implementerMemberIds: ReadonlyMap<string, string>;
  readonly interfaceMemberId: string | null;
  readonly viaCalls: boolean;
  readonly viaCarrier: boolean;
  readonly carrierId: string | null;
  readonly viaSatisfies: boolean;
  readonly evidence: string;
}

/**
 * La terna completa del encargo — `null` si ninguna interfaz del grafo la
 * satisface (incluida la posibilidad de que exista interfaz+miembro común
 * pero SIN invocador confirmado: eso no es "completa", ver docstring del
 * módulo). Determinístico: interfaces recorridas en orden de id.
 */
function findCommandAbstraction(graph: CodeGraph | null): CommandAbstraction | null {
  if (!graph) return null;
  const index = indexFor(graph);
  const byInterface = implementersByInterface(index);

  for (const interfaceId of [...byInterface.keys()].sort()) {
    const implementers = byInterface.get(interfaceId)!;
    if (implementers.length < 2) continue;

    const member = commonMemberOfLeastArity(index, implementers);
    if (!member) continue;

    const implementerMemberIds = new Map<string, string>();
    for (const im of implementers) {
      const id = memberNodeId(index, im.id, member.name);
      if (id) implementerMemberIds.set(im.id, id);
    }
    if (implementerMemberIds.size < 2) continue;

    const interfaceMemberId = memberNodeId(index, interfaceId, member.name);
    const viaCalls = interfaceMemberId !== null && hasConfidentCallInto(index, interfaceMemberId);
    const carrier = carrierInvokerFor(index, new Set(implementerMemberIds.values()));

    if (!viaCalls && !carrier.found) continue; // interfaz+miembro común sin invocador confirmado: no alcanza, ver docstring.

    const viaSatisfies = implementers.some((im) => im.viaSatisfies);
    return {
      interfaceId,
      implementers,
      member,
      implementerMemberIds,
      interfaceMemberId,
      viaCalls,
      viaCarrier: carrier.found,
      carrierId: carrier.carrierId,
      viaSatisfies,
      evidence: `Interfaz "${interfaceId}" con ${implementers.length} implementadores que redeclaran "${member.name}"/aridad ${member.arity ?? "desconocida"} — invocador confirmado ${viaCalls ? `vía calls directo a sym:${interfaceId}.${member.name}` : carrier.evidence}.${viaSatisfies ? " (al menos un implementador resuelto por `satisfies`, no `implements` — riesgo A9 declarado.)" : ""}`,
    };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Ola W2 — interfaz+miembro común ANCLADA a los manejadores de UN hallazgo,
 * para decidir `required` (¿aplica Command?) y `parcial` (¿hay protocolo
 * real sin invocador todavía?) SIN depender de `findCommandAbstraction`
 * (búsqueda GLOBAL, pensada sólo para "¿el patrón YA existe en TODO el
 * repo?" — usarla acá acoplaría el veredicto de UN hallazgo de duplicación a
 * una interfaz sin relación, que podría existir en cualquier otra parte del
 * repo; ver el docstring del módulo). Reusa `implementersByInterface`/
 * `commonMemberOfLeastArity` (las mismas dos funciones de los pasos 1+2 de
 * `findCommandAbstraction`) — nunca inferido por conjunto de miembros
 * (regla dura del encargo): sólo se leen aristas `implements`/`satisfies`
 * REALES.
 * ──────────────────────────────────────────────────────────────────────── */
interface InterfaceEvidence {
  readonly interfaceId: string;
  readonly implementers: readonly Implementer[];
  readonly member: CommonMember;
  readonly sharingOwners: ReadonlySet<string>;
  readonly viaSatisfies: boolean;
  readonly evidence: string;
}

/** Los ids de OWNER (clase/tipo) de cada nodo en `nodeIds`, vía `ownerByMember` — nunca adivinado por nombre. */
function ownersOf(index: Index, nodeIds: Iterable<string>): Set<string> {
  const owners = new Set<string>();
  for (const id of nodeIds) {
    const owner = index.ownerByMember.get(id);
    if (owner) owners.add(owner);
  }
  return owners;
}

/**
 * `null` si ningún interfaz real (`implements`/`satisfies`) conecta a >= 2
 * de los DUEÑOS de `handlerNodeIds` con un miembro común por (nombre,
 * aridad). Determinístico: interfaces recorridas en orden de id, igual que
 * `findCommandAbstraction`. A propósito NO exige invocador acá — eso lo
 * decide el caller (`required` lo acepta como evidencia de que Command
 * APLICA; `appliedState` lo usa para `parcial` cuando `findCommandAbstraction`
 * global no confirmó invocador en ningún lado — ver la prueba de
 * consistencia en el docstring del módulo).
 */
function commandInterfaceEvidence(index: Index, handlerNodeIds: ReadonlySet<string>): InterfaceEvidence | null {
  const owners = ownersOf(index, handlerNodeIds);
  if (owners.size < 2) return null;

  const byInterface = implementersByInterface(index);
  for (const interfaceId of [...byInterface.keys()].sort()) {
    const implementers = byInterface.get(interfaceId)!;
    const sharingOwners = new Set(implementers.map((im) => im.id).filter((id) => owners.has(id)));
    if (sharingOwners.size < 2) continue;

    const member = commonMemberOfLeastArity(index, implementers);
    if (!member) continue;

    const viaSatisfies = implementers.some((im) => sharingOwners.has(im.id) && im.viaSatisfies);
    return {
      interfaceId,
      implementers,
      member,
      sharingOwners,
      viaSatisfies,
      evidence:
        `Interfaz "${interfaceId}" con ${implementers.length} implementador(es), de los cuales >= 2 (${[...sharingOwners].join(", ")}) ` +
        `son DUEÑOS de manejadores duplicados de ESTE hallazgo, y redeclaran "${member.name}"/aridad ${member.arity ?? "desconocida"} — ` +
        `protocolo compartido REAL (implements/satisfies), no inferido por conjunto de miembros.` +
        (viaSatisfies ? " (al menos un implementador resuelto por `satisfies`, no `implements` — riesgo A9 declarado.)" : ""),
    };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Manejadores de ESTE hallazgo ↔ su nodo en el grafo — mejor esfuerzo, sin
 * asumir que `CloneCandidate` trae un id de nodo (no lo trae).
 * ──────────────────────────────────────────────────────────────────────── */
function nodeForClone(index: Index, clone: CloneCandidate): CodeGraphNode | null {
  if (!clone.functionName) return null;
  let best: CodeGraphNode | null = null;
  for (const node of index.nodeById.values()) {
    if (node.kind !== "symbol" || node.family !== "function-like") continue;
    if (node.file !== clone.file) continue;
    if (node.symbolPath[node.symbolPath.length - 1] !== clone.functionName) continue;
    if (node.startLine === clone.startLine) return node;
    if (best === null) best = node;
  }
  return best;
}

/** Ola W2 — ids de nodo de TODOS los manejadores de `problem.locations`
 *  (a diferencia de `distinctHandlerCarrier`, que sólo mira los YA filtrados
 *  por `triggerBoundLocations` — acá se quiere CUALQUIER manejador
 *  duplicado, esté o no "ligado a un disparador", porque la evidencia de
 *  interfaz compartida es independiente de esa heurística). */
function handlerNodeIdsOf(index: Index, repo: RepoUnit, problem: Finding): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const loc of problem.locations) {
    const clone = findClone(repo, loc);
    if (!clone) continue;
    const node = nodeForClone(index, clone);
    if (node) ids.add(node.id);
  }
  return ids;
}

/** `true` si el nodo `handlerId` llama (directo o vía portador) a alguno de `targetIds`. */
function handlerDelegatesTo(index: Index, handlerId: string, targetIds: ReadonlySet<string>): boolean {
  return (index.edgesFrom.get(handlerId) ?? []).some((e) => (e.kind === "calls" || e.kind === "invokes-indirect") && targetIds.has(e.to));
}

/* ════════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE6 — EL CAMINO DEL ANCLA-FUERZA `invariant-scaffold-varying-call`
 *
 * TODO lo que sigue hasta el próximo separador es CÓDIGO NUEVO detrás de
 * `problem.kind === "invariant-scaffold-varying-call"`. **No toca ni un
 * `required`, ni un discriminador, ni una rama de `appliedState` del camino
 * viejo** (el de `duplication`/`distributed-duplication`), que queda
 * exactamente como estaba: esta ola es ADITIVA.
 *
 * POR QUÉ LAS CONSULTAS SON CRUDAS Y NO PASAN POR `indexFor`. `indexFor` se
 * construye sobre `confidentEdges`, que descarta por contrato
 * (`CONTRATO-F9.md` §4.5) toda arista `provenance: "ambiguous"`. El detector de
 * este ancla CUENTA las ambiguas —mismo criterio y mismo argumento que
 * `repeated-collaborator-set` y que `outgoingCallCount` de `facade.ts`: la
 * existencia de la llamada es un hecho del CÓDIGO y sólo su DESTINO es lo que
 * el resolutor no supo fijar—, así que preguntarle al índice confidente si el
 * sitio invoca su operación devolvería "no" para hallazgos que EXISTEN. Es
 * exactamente el defecto que AD4 midió y arregló en su propio camino de
 * entrada (72 hallazgos → 1 hipótesis con el índice confidente). Estas
 * consultas crudas las usa SÓLO este camino.
 * ════════════════════════════════════════════════════════════════════════ */

/** Cuántos colaboradores tiene que tener el tratamiento para que copiarlo
 *  duela — el MISMO piso que el detector declara en su umbral `tratamiento`.
 *  Se repite acá como constante nombrada porque el `required` lo vuelve a
 *  preguntar sobre el `Finding` ya construido, no sobre el grafo. */
const COMMAND_MIN_TREATMENT = 3;

/** Las ubicaciones de un `Finding` de este ancla, repartidas por su rol. */
interface ScaffoldRoles {
  readonly sites: readonly RoleLocation[];
  readonly operations: readonly RoleLocation[];
  readonly treatment: readonly RoleLocation[];
}

function scaffoldRoles(problem: Finding): ScaffoldRoles {
  const sites: RoleLocation[] = [];
  const operations: RoleLocation[] = [];
  const treatment: RoleLocation[] = [];
  for (const loc of problem.locations) {
    if (loc.role?.startsWith(ROLE_SITE)) sites.push(loc);
    else if (loc.role?.startsWith(ROLE_OPERATION)) operations.push(loc);
    else if (loc.role?.startsWith(ROLE_TREATMENT)) treatment.push(loc);
  }
  return { sites, operations, treatment };
}

/** El nodo del grafo de una `RoleLocation` que el detector escribió con
 *  `symbol = symbolPath.join(".")` y la línea real del símbolo — nunca
 *  adivinado por nombre suelto. */
function nodeForRole(graph: CodeGraph, loc: RoleLocation): CodeGraphNode | null {
  for (const n of graph.nodes) {
    if (n.kind !== "symbol") continue;
    if (n.file !== loc.file) continue;
    if (n.symbolPath.join(".") !== loc.symbol) continue;
    if ((n.startLine ?? 1) !== loc.startLine) continue;
    return n;
  }
  return null;
}

/** `from -> to` en CRUDO (ambiguas incluidas), para los kinds pedidos. */
function rawTargetsOf(graph: CodeGraph, fromId: string, kinds: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const e of graph.edges) if (e.from === fromId && kinds.has(e.kind)) out.add(e.to);
  return out;
}

const CALL_LIKE: ReadonlySet<string> = new Set(["calls", "invokes-indirect"]);

/**
 * INTENCIÓN QUE VERIFICA ESTE CHEQUEO (required, AE6): *"la operación está
 * FIJADA en el código de cada copia, no recibida"*. Es la mitad de la fuerza
 * que se puede volver a preguntar acá: si el sitio recibiera la operación como
 * dato —que es la mitigación— no habría una arista `calls` desde el sitio hacia
 * un símbolo concreto propio. El ancla lo decidió armando el grupo; este check
 * lo vuelve a preguntar sitio por sitio sobre el grafo crudo, y si NO lo puede
 * confirmar devuelve `holds: false` — nunca "no pude mirar, apruebo".
 */
const weldedOperationCheck: Check<Finding, CommandProblemGraph> = {
  id: "operacion-soldada-en-cada-copia",
  describe:
    "Cada lugar que repite el tratamiento tiene una arista `calls` CRUDA hacia su propia operación — la operación está " +
    "escrita en el código de esa copia, no recibida como dato. Sin grafo o sin poder ubicar los nodos, NO se afirma.",
  run(problem, ctx) {
    const graph = ctx.graph;
    if (!graph) return { holds: false, evidence: "Sin grafo del repo: no se puede confirmar que cada lugar invoque su operación por su cuenta." };
    const { sites, operations } = scaffoldRoles(problem);
    if (sites.length === 0 || operations.length === 0) {
      return { holds: false, evidence: "El hallazgo no trae ubicaciones con rol de lugar y de operación — no hay qué confirmar." };
    }
    const opIds = new Set<string>();
    for (const op of operations) {
      const n = nodeForRole(graph, op);
      if (n) opIds.add(n.id);
    }
    let confirmed = 0;
    for (const s of sites) {
      const n = nodeForRole(graph, s);
      if (!n) continue;
      const targets = rawTargetsOf(graph, n.id, CALL_LIKE);
      for (const t of targets) {
        if (opIds.has(t)) {
          confirmed++;
          break;
        }
      }
    }
    const holds = confirmed === sites.length && sites.length > 0;
    return {
      holds,
      evidence: holds
        ? `Los ${sites.length} lugares invocan su propia operación por una arista directa (${opIds.size} operaciones ubicadas en el grafo): la operación está soldada a cada copia.`
        : `Sólo ${confirmed}/${sites.length} lugares tienen una arista confirmada hacia su operación (${opIds.size}/${operations.length} operaciones ubicadas) — no se afirma "operación soldada" sin confirmarla.`,
    };
  },
};

/**
 * INTENCIÓN (required, AE6): *"lo que se copia alrededor de cada llamada es un
 * TRATAMIENTO, no una llamada más"*. Con menos de `COMMAND_MIN_TREATMENT`
 * colaboradores compartidos no hay nada que izar: la copia es gratis y no
 * existe el problema que Command resuelve.
 */
const treatmentHasSizeCheck: Check<Finding, CommandProblemGraph> = {
  id: "tratamiento-con-tamano",
  describe: `El tratamiento invariante tiene al menos ${COMMAND_MIN_TREATMENT} colaboradores — copiarlo cuesta algo. Con menos, el remedio es inline.`,
  run(problem) {
    const { treatment } = scaffoldRoles(problem);
    return {
      holds: treatment.length >= COMMAND_MIN_TREATMENT,
      evidence: `${treatment.length} colaborador(es) invariante(s) alrededor de cada operación (piso ${COMMAND_MIN_TREATMENT}).`,
    };
  },
};

/**
 * INTENCIÓN (required, AE6): *"Command es la mitigación MÁS BARATA
 * disponible"*. Si toda la repetición vive dentro de un archivo, un ayudante
 * privado que reciba la operación como parámetro la borra sin crear ningún
 * tipo: proponer un protocolo y un invocador ahí sería más caro que el
 * problema.
 */
const repetitionCrossesFileCheck: Check<Finding, CommandProblemGraph> = {
  id: "la-repeticion-cruza-el-archivo",
  describe: "Los lugares que repiten el tratamiento viven en al menos 2 archivos distintos — un ayudante privado no los puede unificar.",
  run(problem) {
    const { sites } = scaffoldRoles(problem);
    const files = new Set(sites.map((s) => s.file));
    return {
      holds: files.size >= 2,
      evidence:
        files.size >= 2
          ? `Los ${sites.length} lugares viven en ${files.size} archivos distintos: ${[...files].join(", ")}.`
          : `Los ${sites.length} lugares viven en un solo archivo — un ayudante privado los unifica sin crear ningún tipo.`,
    };
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AM · FRENTE AM3 — K3: "UN CIERRE NO SE PUEDE REIFICAR SIN EXTRAERLO PRIMERO"
 *
 * QUÉ RECONOCE (forma, puro AST, ningún nombre): **TODOS** los lugares que
 * repiten el tratamiento son funciones ANIDADAS dentro de otra función — es
 * decir, para cada uno existe, en el árbol vivo de su propio archivo, OTRA
 * función que lo contiene estrictamente por rango de líneas.
 * QUÉ NO reconoce: un miembro de un tipo (un método de Java/C#/Ruby/Python/TS: la
 * clase que lo contiene NO es una función), una función de nivel superior (Go, JS
 * de módulo), ni un grupo donde AL MENOS UNO de los lugares es de esas dos formas.
 *
 * POR QUÉ (la fuerza, no un síntoma): Command reifica la operación en un objeto
 * con un método, y para eso los lugares que hoy la repiten tienen que poder
 * INVOCAR ese objeto desde donde están. Cuando los tres/cuatro lugares son
 * cierres definidos dentro de otra función, la operación no se puede izar sin
 * EXTRAER antes cada cierre a una unidad propia: el remedio disponible ahí es
 * otro, y Command no es la mitigación más barata — la misma clase de argumento
 * que `repetitionCrossesFileCheck` ya usa ("si todo vive en un archivo, un
 * ayudante privado lo borra sin crear ningún tipo").
 *
 * POLARIDAD: este `required` sostiene por DEFECTO y sólo deja de sostener con
 * evidencia POSITIVA — todos los lugares ubicados en un árbol vivo, y todos
 * anidados. Sin árbol vivo, o con algún lugar sin ubicar, SOSTIENE: es la única
 * polaridad admisible cuando el chequeo QUITA producto en vez de agregarlo (la
 * regla ① de la ola: ninguna propuesta juzgada verdadera puede perderse). No es
 * el caso que `no-permissive-required.test.ts` prohíbe —un `required` que aprueba
 * por no poder mirar y así deja pasar una candidata sin confirmar—: acá "no
 * pude mirar" devuelve el comportamiento EXACTO de antes de este frente.
 *
 * MEDIDO CONTRA EL BANCO ENTERO de la celda (35 hallazgos = 22 recomendaciones en
 * bibliotecas + 13 en aplicaciones, TODAS juzgadas): apaga **4 — 3 FALSAS en
 * bibliotecas (`eslint` `no-empty.js:102`, `no-extra-bind.js:80`,
 * `lines-around-directive.js:149`) y 1 FALSA en aplicaciones (`Ghost`
 * `koenig-lexical/demo/DemoApp.tsx:229`) — y CERO verdaderas y CERO
 * `problema-si-patrón-no` en las dos poblaciones.** La variante laxa ("≥1 lugar
 * anidado" en vez de "todos") apagaba 6 y también CERO verdaderas; se publica en
 * `ola-am/informes/AM3.md` y NO se aterriza: con un solo lugar no anidado la
 * operación sí tiene dónde colgarse.
 * ═══════════════════════════════════════════════════════════════════════ */

/** ¿La función que empieza en `startLine` de `file` está contenida ESTRICTAMENTE
 *  por otra función del mismo archivo? `null` = no se pudo ubicar en el árbol
 *  vivo (nunca se lee como "sí"). */
function siteIsNestedFunction(ctx: HypothesisContext, loc: RoleLocation): boolean | null {
  const unit = ctx.file?.path === loc.file ? ctx.file : ctx.fileAt(loc.file);
  if (!unit) return null;
  const own = unit.functions.find((f) => f.file === loc.file && f.startLine === loc.startLine);
  if (!own) return null;
  return unit.functions.some((f) => f !== own && f.file === loc.file && f.startLine < own.startLine && f.endLine >= own.endLine);
}

function sitesAreNotAllClosures(ctx: HypothesisContext): Check<Finding, CommandProblemGraph> {
  return {
    id: "algun-lugar-puede-alojar-la-operacion",
    describe:
      "Al menos uno de los lugares que repiten el tratamiento es un miembro de un tipo o una función de nivel superior — " +
      "no una función ANIDADA dentro de otra. Si TODOS son cierres, reificar la operación exige extraerlos antes, y " +
      "Command no es la mitigación disponible.",
    run(problem) {
      const { sites } = scaffoldRoles(problem);
      if (sites.length === 0) return { holds: true, evidence: "El hallazgo no trae ubicaciones con rol de lugar: esta forma no aplica." };
      const verdicts = sites.map((s) => siteIsNestedFunction(ctx, s));
      const nested = verdicts.filter((v) => v === true).length;
      const unresolved = verdicts.filter((v) => v === null).length;
      const holds = !(unresolved === 0 && nested === sites.length);
      return {
        holds,
        evidence: holds
          ? `${sites.length - nested} de ${sites.length} lugares son un miembro de un tipo o una función de nivel superior: la operación tiene dónde colgarse.`
          : `Los ${sites.length} lugares son funciones ANIDADAS dentro de otra función (cierres): la operación no se puede reificar sin extraerlos antes.`,
      };
    },
  };
}

/**
 * DISCRIMINADOR (nunca gate): *"no hay ancestro donde subir el tratamiento"*.
 * Si los dueños de los lugares son HERMANOS de una jerarquía, la mitigación más
 * barata es subir el tratamiento al ancestro (Pull Up / Template Method) y no
 * hacer viajar la operación. Es la clase entera de falso que AD4 dejó escrita
 * sin implementar; acá se implementa, **se mide y VIAJA** — no apaga el
 * hallazgo, porque como compuerta habría dado la respuesta equivocada en el
 * caso medido de los `J{Array,Constructor,Property}.Load` de newtonsoft-json,
 * que son `static` y en C# NO se pueden subir al ancestro.
 */
const noCommonAncestorCheck: Check<Finding, CommandProblemGraph> = {
  id: "sitios-sin-ancestro-comun",
  describe:
    "Los dueños de los lugares NO comparten ancestro (`extends`/`mixes-in`): no hay dónde subir el tratamiento, así que hacer viajar la operación es la mitigación disponible.",
  run(problem) {
    const evidence = (problem.evidence ?? []).find((e) => e.label.includes("comparten ancestro"));
    const siblings = (evidence?.value ?? 0) === 1;
    return {
      holds: !siblings,
      evidence: siblings
        ? "Los dueños de los lugares SÍ comparten ancestro — la mitigación más barata puede ser subir el tratamiento al ancestro (Pull Up / Template Method) en vez de reificar la operación."
        : "Ningún ancestro común entre los dueños de los lugares: no hay dónde subir el tratamiento.",
    };
  },
};

/**
 * DISCRIMINADOR (nunca gate) — **acá vive el hecho que la escalera de estado
 * NO puede usar**: `findCommandAbstraction` encuentra en el repo una
 * abstracción Command COMPLETA (interfaz con ≥2 implementadores + miembro común
 * + invocador confirmado). Eso NO dice nada sobre si el patrón está aplicado a
 * ESTAS operaciones —el detector ya probó que no lo está (5b, 5c)— y medido
 * sobre los 21 repos resultó ser una propiedad del REPO y nunca del hallazgo
 * (ver la escalera, abajo). Lo único verdadero que se puede decir con ese hecho
 * es lo que dice este discriminador: **reificar operaciones es idiomático en
 * este repo**, así que introducirlo acá es más barato y más consistente que
 * inventar una forma nueva.
 */
function repoAlreadyReifiesOperations(): Check<Finding, CommandProblemGraph> {
  return {
    id: "el-repo-ya-reifica-operaciones",
    describe:
      "El repo YA tiene en otro lado una abstracción Command completa (interfaz con ≥2 implementadores, miembro común e invocador confirmado): reificar una operación es idiomático acá, no una forma ajena al código.",
    run(_problem, ctx) {
      const abstraction = findCommandAbstraction(ctx.graph);
      return {
        holds: abstraction !== null,
        evidence: abstraction
          ? `${abstraction.evidence} Este hallazgo NO pasa por ella (el ancla exige que estas operaciones no compartan protocolo ni portador), pero prueba que el repo ya sabe reificar operaciones.`
          : "El repo no tiene ninguna abstracción Command completa: introducir una acá sería la primera, y eso la hace más cara.",
      };
    },
  };
}

/** DISCRIMINADOR: cuántas copias del tratamiento borra el patrón. Con 4+ lugares
 *  el invocador único ya ahorra tres copias, y cada operación nueva pasa a
 *  costar un valor en vez de otra copia. */
const fourOrMoreSitesCheck: Check<Finding, CommandProblemGraph> = {
  id: "cuatro-o-mas-lugares",
  describe: "Cuatro o más lugares repiten el tratamiento — el invocador único borra al menos tres copias, no una.",
  run(problem) {
    const { sites } = scaffoldRoles(problem);
    return { holds: sites.length >= 4, evidence: `${sites.length} lugares repiten el tratamiento.` };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, decidida ANTES de medir.
 *
 * - **`ya-aplicado` es INALCANZABLE desde acá y lo digo con todas las letras**,
 *   con el mismo criterio con el que AC3 y AD4 lo dijeron de sus propias
 *   anclas: el detector EXIGE, para emitir, que no exista protocolo compartido
 *   entre los dueños de las operaciones (5b) ni portador con invocación
 *   indirecta (5c) — o sea, exige que Command NO esté puesto sobre estas
 *   operaciones. **Que este camino no produzca `ya-aplicado` NO lo acredita.**
 *   Lo que sí es mérito medible, y de otra naturaleza, es que el DETECTOR se
 *   calle cuando el patrón ya está, y hay tres tests que exigen ese silencio.
 * - **`aplicado-eludido` TAMBIÉN es INALCANZABLE, y esto CAMBIÓ MIDIENDO — es
 *   el defecto que este frente se encontró y arregló.** La primera versión de
 *   esta escalera devolvía `aplicado-eludido` cuando `findCommandAbstraction`
 *   —una búsqueda GLOBAL: "¿hay ALGUNA interfaz en este repo con ≥2
 *   implementadores, un miembro común y un invocador?"— encontraba algo y
 *   ninguno de los lugares pasaba por ella. **Medido sobre los 21 repos, ese
 *   peldaño resultó ser una propiedad del REPO y nunca del hallazgo:** guava
 *   12 de 12, newtonsoft-json 2 de 2, rubocop 1 de 1, sqlalchemy 1 de 1,
 *   jenkins 1 de 1 — **el 100 % en cada repo donde la búsqueda global encuentra
 *   algo, y el 0 % en cada repo donde no** (eslint, nest, gitea, Ghost). Un
 *   peldaño que contesta siempre lo mismo dentro de un repo no informa nada:
 *   es exactamente el defecto que AD4 midió y corrigió en su propia escalera, y
 *   es la MISMA falla —anclar en una estructura que está en otra parte— que
 *   este frente le midió a las anclas viejas de Command (52 % de todo lo que
 *   producen es `aplicado-eludido`).
 *   **Y no puede ser de otra manera por construcción:** el detector ya verificó
 *   que estas operaciones NO comparten protocolo (5b) y que NINGÚN portador las
 *   sostiene (5c) — o sea que Command **no está aplicado sobre ellas**, así que
 *   "aplicado y eludido" no es una lectura posible de ESTE grupo.
 *   El hecho no se pierde: **viaja como DISCRIMINADOR**
 *   (`el-repo-ya-reifica-operaciones`), donde dice lo único que puede decir con
 *   verdad — que reificar operaciones es idiomático en este repo, así que
 *   introducirlo acá es barato y consistente.
 *   **El cambio sólo puede AGREGAR recomendaciones, nunca quitar ninguna**, y
 *   no favorece al frente: las 17 que reclasifica estaban fuera del denominador
 *   de precisión y ahora entran, la mayoría como FALSAS (§4 del informe AE6).
 * - **`parcial`**: al menos una de las operaciones YA recibe una arista
 *   `carries` — alguien en el repo ya la trata como VALOR, aunque no haya
 *   portador con invocación indirecta (si lo hubiera, el detector no habría
 *   emitido). Media puerta: el código ya sabe pasar esa operación como dato.
 * - **`ausente`**: el resto.
 */
function scaffoldAppliedState(problem: Finding, ctx: CommandProblemGraph): AppliedStateResult {
  const graph = ctx.graph;
  const { operations } = scaffoldRoles(problem);

  const existsCheck: PatternHypothesisCheck = {
    label: "Las operaciones de este hallazgo ya viajan como dato (protocolo compartido real, o portador con invocación indirecta)",
    passed: false,
    why:
      "El ancla EXIGE lo contrario para emitir: ninguna interfaz real (implements/satisfies + miembro común por nombre y aridad) conecta a los dueños de estas operaciones, y ningún portador sostiene ≥2 de ellas recibiendo `invokes-indirect`. " +
      "Por eso este camino no puede terminar en `ya-aplicado` ni en `aplicado-eludido`, y eso NO es mérito suyo: es una consecuencia de su construcción.",
  };

  if (graph) {
    const carried: string[] = [];
    for (const op of operations) {
      const n = nodeForRole(graph, op);
      if (!n) continue;
      if (graph.edges.some((e) => e.kind === "carries" && e.to === n.id)) carried.push(op.symbol ?? n.symbolPath.join("."));
    }
    if (carried.length > 0) {
      return {
        state: "parcial",
        checks: [
          existsCheck,
          {
            label: "Al menos una de las operaciones YA se pasa como valor en algún lugar del repo (`carries`), sin portador con invocación indirecta",
            passed: true,
            why: `${carried.length}/${operations.length} operaciones ya viajan como valor en otra parte (${carried.join(", ")}) — el código ya sabe tratarlas como dato; falta el punto de indirección que las ejecute, y falta acá.`,
          },
        ],
      };
    }
  }

  return {
    state: "ausente",
    checks: [
      existsCheck,
      {
        label: "Alguna de las operaciones ya se pasa como valor en algún lugar del repo (`carries`)",
        passed: false,
        why: graph
          ? `Ninguna de las ${operations.length} operaciones recibe una arista \`carries\` en ningún lado del repo: hoy sólo se las invoca por nombre, desde el único lugar que copió el tratamiento a su alrededor.`
          : "Sin grafo del repo no se puede afirmar que alguna operación ya viaje como valor — no se supone media puerta que no se vio.",
      },
    ],
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * appliedState
 * ──────────────────────────────────────────────────────────────────────── */
interface CommandProblemGraph {
  readonly repo: RepoUnit;
  readonly graph: CodeGraph | null;
}

function appliedState(problem: Finding, ctx: CommandProblemGraph): AppliedStateResult {
  // AE6 — el ancla-fuerza tiene su propia escalera; el camino viejo sigue
  // exactamente igual debajo, sin una sola rama tocada.
  if (problem.kind === "invariant-scaffold-varying-call") return scaffoldAppliedState(problem, ctx);

  const bound = triggerBoundLocations(problem, ctx.repo);
  const abstraction = findCommandAbstraction(ctx.graph);

  const existsCheck: PatternHypothesisCheck = {
    label: "Existe una interfaz I con ≥2 implementadores que redeclaran el mismo miembro (de menor aridad común, nunca por nombre) Y un invocador confirmado (calls a la interfaz, o portador+invokes-indirect)",
    passed: abstraction !== null,
    why: abstraction
      ? abstraction.evidence
      : "Ninguna interfaz del grafo tiene ≥2 implementadores con un miembro común Y un invocador confirmado (calls directo a la interfaz o portador con fan-in≥2 de `carries` + ≥1 `invokes-indirect`) — puede haber interfaz sin invocador probado, o ninguna interfaz común: ambos casos caen acá, sin adivinar cuál.",
  };

  if (!abstraction) {
    // Ola W2 — ANTES de caer al criterio viejo de firma (que sólo mira
    // `bound`, los manejadores ligados a un disparador): ¿hay un protocolo
    // REAL (implements/satisfies + miembro común) que conecte a los dueños
    // de los manejadores duplicados de ESTE hallazgo, aunque no tenga
    // invocador confirmado? Si `abstraction` es `null` (arriba), NINGÚN
    // interfaz del grafo tiene invocador confirmado — así que si
    // `commandInterfaceEvidence` encuentra una acá, por construcción NO
    // tiene invocador (si lo tuviera, `findCommandAbstraction`, que corre la
    // MISMA búsqueda global con la MISMA regla de invocador, ya la habría
    // encontrado y `abstraction` no sería `null`). Evidencia más fuerte que
    // "misma aridad": un protocolo REAL, no inferido por conjunto de
    // miembros — más barato formalizar detrás de él que diseñar uno nuevo.
    const ifaceIndex = ctx.graph ? indexFor(ctx.graph) : null;
    const interfaceEvidence = ifaceIndex ? commandInterfaceEvidence(ifaceIndex, handlerNodeIdsOf(ifaceIndex, ctx.repo, problem)) : null;
    if (interfaceEvidence) {
      return {
        state: "parcial",
        checks: [
          existsCheck,
          {
            label: "Protocolo compartido REAL (implements/satisfies + miembro común) entre los dueños de los manejadores duplicados, sin invocador confirmado",
            passed: true,
            why: `${interfaceEvidence.evidence} Sin invocador confirmado (ni calls directo a la interfaz, ni portador con invokes-indirect) — más barato formalizar detrás de este protocolo ya existente que diseñar uno desde cero.`,
          },
        ],
      };
    }
    if (ctx.graph === null || bound.length < 2) {
      return {
        state: "ausente",
        checks: [
          existsCheck,
          { label: "Firma común (misma aridad) entre los manejadores de este hallazgo", passed: false, why: "Sin grafo real o menos de 2 manejadores ligados a trigger — no hay con qué derivar aridad estructuralmente." },
        ],
      };
    }
    const index = indexFor(ctx.graph);
    const handlerNodes = bound.map((b) => nodeForClone(index, b.clone));
    if (handlerNodes.some((n) => n === null)) {
      return {
        state: "ausente",
        checks: [
          existsCheck,
          {
            label: "Firma común (misma aridad) entre los manejadores de este hallazgo",
            passed: false,
            why: "El nodo del grafo de al menos un manejador no se pudo ubicar (archivo+nombre) — no se afirma 'misma firma' sin confirmarla estructuralmente.",
          },
        ],
      };
    }
    const arities = handlerNodes.map((n) => n!.arity ?? null);
    const sameArity = arities.every((a) => a === arities[0]) && arities[0] !== null;
    // NOTA Ola V: antes de acá, `atLeastTwoHandlersBoundToTrigger` (required)
    // YA exigió un portador real (carries fan-in≥2 + invokes-indirect≥1) —
    // ver su docstring. Lo que distingue PARCIAL de AUSENTE, entonces, ya NO
    // es "¿hay portador?" (siempre lo hay, si llegamos hasta acá) sino
    // "¿los manejadores YA comparten firma?": misma aridad ⇒ más barato
    // formalizarlos detrás de un miembro común (parcial); aridad distinta ⇒
    // falta más diseño antes de unificarlos (ausente).
    return {
      state: sameArity ? "parcial" : "ausente",
      checks: [
        existsCheck,
        {
          label: "Firma común (misma aridad) entre los manejadores de este hallazgo, sin interfaz común todavía",
          passed: sameArity,
          why: sameArity
            ? `Los ${bound.length} manejadores comparten aridad ${arities[0]} — misma firma estructural, sin interfaz común (implements/satisfies ausente); el required ya confirmó evidencia de portador+invocación indirecta para este grupo.`
            : `Los manejadores tienen aridad distinta entre sí (${arities.join(", ")}) — el required ya confirmó evidencia de portador+invocación indirecta, pero sin firma común hace falta más diseño antes de unificarlos detrás de un miembro común.`,
        },
      ],
    };
  }

  // Abstracción completa encontrada: decide ya-aplicado vs. aplicado-eludido para ESTE hallazgo.
  const targetIds = new Set<string>(abstraction.implementerMemberIds.values());
  if (abstraction.interfaceMemberId) targetIds.add(abstraction.interfaceMemberId);
  if (abstraction.carrierId) targetIds.add(abstraction.carrierId);

  const index = ctx.graph ? indexFor(ctx.graph) : null;
  const delegates =
    index !== null &&
    bound.length > 0 &&
    bound.every((b) => {
      const node = nodeForClone(index, b.clone);
      return node !== null && handlerDelegatesTo(index, node.id, targetIds);
    });

  const bypassCheck: PatternHypothesisCheck = {
    label: "Los manejadores duplicados de ESTE hallazgo delegan en la abstracción (no la puentean)",
    passed: delegates,
    why: delegates
      ? "El nodo de cada manejador tiene una arista calls/invokes-indirect confidente hacia el miembro de la abstracción: SÍ delegan."
      : "Al menos un manejador no tiene arista confidente hacia la abstracción (o su nodo no se pudo ubicar en el grafo) — se trata como puenteo hasta confirmar lo contrario, nunca se asume delegación sin evidencia.",
  };
  return { state: delegates ? "ya-aplicado" : "aplicado-eludido", checks: [existsCheck, bypassCheck] };
}

/* ────────────────────────────────────────────────────────────────────────
 * Ola 11a — P4: `duplication`/`distributed-duplication` son AMBOS `inter-file`
 * (`Finding.language` siempre `null`), así que ÉSTA es la llamada (2) de
 * `hypotheses/run.ts` (desde `crossAnalyze`): `ctx.neighborhood` llega REAL,
 * sin necesitar `refresh()` — mismo hecho que `abstract-factory.ts`/
 * `prototype.ts` ya explotan. Dos discriminadores nuevos, NUNCA gate (no
 * tocan `appliedState`/`state`, sólo la escalera de confianza).
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * El mismo cierre que `strategy.ts#crossRepetitionDiscriminator` logra con
 * `findingsOfKind("repeated-switch")`: contar cuántos OTROS hallazgos del
 * MISMO `kind` (`duplication`/`distributed-duplication`) hay en el resto del
 * repo (`ctx.neighborhood.countOfKind`). El número mueve la conclusión: si
 * este mismo tipo de duplicación de manejadores ligados a trigger se repite
 * en más lugares, es un HÁBITO real del código (más peso para Command real,
 * no una coincidencia puntual de dos nombres de función).
 */
function repeatedAcrossRepo(ctx: HypothesisContext): Check<Finding, CommandProblemGraph> {
  return {
    id: "repetido-en-el-repo",
    describe:
      "`ctx.neighborhood.countOfKind(problem.kind)`: al menos otro hallazgo del MISMO kind (duplication/distributed-duplication) en el resto del repo — esta duplicación de manejadores ligados a trigger es un hábito repetido, no un caso puntual.",
    run(problem) {
      const count = ctx.neighborhood.countOfKind(problem.kind);
      const holds = count >= 1;
      return {
        holds,
        evidence: holds
          ? `${count} otro(s) hallazgo(s) de "${problem.kind}" en el resto del repo (vecindario) — el número mueve la conclusión: esta duplicación de manejadores ligados a trigger es un HÁBITO repetido del código, más compatible con Command real que con una coincidencia puntual.`
          : `Ningún otro hallazgo de "${problem.kind}" en el resto del repo (vecindario) — hasta donde el vecindario ve, este es un caso AISLADO de manejadores duplicados.`,
      };
    },
  };
}

/** `Finding.kind`s que, si aparecen en el archivo de un manejador, son compatibles con "este sitio ya concentra el despacho de varias acciones" (una tabla/switch que decide QUÉ acción correr, no sólo la duplicación misma). */
const DISPATCH_CONCENTRATION_KINDS: ReadonlySet<string> = new Set(["duplication", "distributed-duplication", "repeated-switch", "conditional-chain"]);

/**
 * `ctx.neighborhood.findingsInFile` del archivo de alguno de los manejadores
 * ligados a trigger de ESTE hallazgo — ¿ese archivo YA tiene, en el
 * vecindario, otro hallazgo compatible con "acá ya se concentra el despacho
 * de varias acciones" (otra duplicación, un switch/cadena repetida)? Si sí,
 * el sitio que repite no parte de cero: ya actúa parcialmente como
 * despachador, lo que hace más barato formalizarlo en Command. NUNCA gate —
 * evidencia adicional para la escalera, igual que `repeatedAcrossRepo`.
 */
function invokerConcentratesDispatch(ctx: HypothesisContext): Check<Finding, CommandProblemGraph> {
  return {
    id: "invocador-concentra-despacho",
    describe:
      "`ctx.neighborhood.findingsInFile` del archivo de algún manejador ligado a trigger: ya tiene otro hallazgo (duplication/distributed-duplication/repeated-switch/conditional-chain) — el sitio que repite ya concentra despacho de varias acciones, no parte de cero.",
    run(problem, graph) {
      const bound = triggerBoundLocations(problem, graph.repo);
      const files = [...new Set(bound.map((b) => b.location.file))];
      for (const file of files) {
        const nearby = ctx.neighborhood.findingsInFile(file);
        const concentrator = nearby.find((f) => f.id !== problem.id && DISPATCH_CONCENTRATION_KINDS.has(f.kind));
        if (concentrator) {
          return {
            holds: true,
            evidence: `"${file}" (archivo de un manejador ligado a trigger) ya tiene otro hallazgo del vecindario ("${concentrator.title}", kind "${concentrator.kind}") — el sitio que repite ya concentra despacho de varias acciones, más barato formalizarlo en Command.`,
          };
        }
      }
      return {
        holds: false,
        evidence:
          files.length > 0
            ? `Ninguno de los archivo(s) de los manejadores ligados a trigger (${files.join(", ")}) tiene, en el vecindario, otro hallazgo que sugiera que ya concentra despacho.`
            : "Sin manejadores ligados a trigger que examinar — no hay archivo de invocador para consultar el vecindario.",
      };
    },
  };
}

/**
 * P4 (Ola 11a): `repeatedAcrossRepo`/`invokerConcentratesDispatch` necesitan
 * `ctx` (vecindario real) — mismo patrón que `abstract-factory.ts#buildSpec`/
 * `strategy.ts#buildSpec`/`prototype.ts#buildSpec`: el spec se arma por
 * invocación de `build()`, no como objeto module-level.
 */
function buildSpec(ctx: HypothesisContext, problem: Finding): HypothesisSpec<Finding, CommandProblemGraph> {
  // AE6 — EL CAMINO DEL ANCLA-FUERZA. Spec propio, con sus tres `required` y
  // sus tres discriminadores; el spec viejo queda intacto abajo.
  if (problem.kind === "invariant-scaffold-varying-call") {
    return {
      pattern: "Command",
      ceiling: "alta",
      needs: [],
      required: [weldedOperationCheck, treatmentHasSizeCheck, repetitionCrossesFileCheck, sitesAreNotAllClosures(ctx)],
      discriminators: [noCommonAncestorCheck, fourOrMoreSitesCheck, repoAlreadyReifiesOperations(), repeatedAcrossRepo(ctx)],
      appliedState,
      toConfirm: [
        "¿El tratamiento RODEA a la llamada (algo antes y algo después: encolar, registrar, deshacer, reintentar), o son colaboradores sueltos que aparecen en los tres cuerpos? EL DETECTOR NO PUEDE VERLO: las aristas `calls` del grafo colapsan las ocurrencias en `weight` y NO llevan posición, así que se verificó el mismo CONJUNTO de colaboradores, nunca su orden.",
        "¿Las operaciones son de verdad piezas intercambiables del mismo trabajo, o comparten aridad por casualidad?",
        "¿Alcanza con que el tratamiento reciba la operación como parámetro (Command como función), o hace falta un objeto con estado (para deshacer, reintentar o encolar)?",
      ],
      source: "https://refactoring.guru/design-patterns/command",
    };
  }
  return {
    pattern: "Command",
    ceiling: "alta", // mismo techo que la migración F6 original.
    needs: [], // sin cambios: la forma no exige clase por capacidad de lenguaje, ver docstring del módulo.
    required: [commandRequiredCheck], // Ola W2 — ver su docstring: interfaz+miembro común ANCLADA, o el heurístico de la Ola V como respaldo.
    discriminators: [
      { id: allHandlersBoundToTrigger.id, describe: allHandlersBoundToTrigger.describe, run: (p, g) => allHandlersBoundToTrigger.run(p, g.repo) },
      { id: handlersSpanMultipleFiles.id, describe: handlersSpanMultipleFiles.describe, run: (p, g) => handlersSpanMultipleFiles.run(p, g.repo) },
      repeatedAcrossRepo(ctx),
      invokerConcentratesDispatch(ctx),
    ],
    appliedState,
    toConfirm: [
      "¿Los manejadores implementan la MISMA operación de negocio, o coinciden por casualidad en los nombres de llamada?",
      "¿Hace falta undo/redo o cola de comandos, o alcanza con extraer una función compartida?",
    ],
    source: "https://refactoring.guru/design-patterns/command",
  };
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
  id: "command",
  pattern: "Command",
  layer: "patron",
  // AE6 — el array SUMÓ el ancla-fuerza `invariant-scaffold-varying-call` y
  // conservó las dos viejas (48 hipótesis, 0 `ausente`).
  //
  // OLA AL (AL1) — SE SACA `duplication`. Se saca del array —explícito y
  // auditable— en vez de silenciarla con un discriminador, que escondería la
  // decisión. Medido sobre el volcado del 21-08, con el 100 % de la población
  // viva juzgada en las DOS poblaciones (yo juzgué las 8 que faltaban
  // abriendo el archivo real, 5 en biblioteca y 3 en aplicación):
  //
  //   · nivel 2: 13 recomendaciones en biblioteca y 15 en aplicación, las 28
  //     juzgadas, **0 verdaderas** (0/8 y 0/11, más 9 `problema-si-patrón-no`).
  //   · costo en cobertura: **0 huérfanos** en las dos poblaciones.
  //   · el diagnóstico ya estaba escrito en el docstring de este módulo desde
  //     la Ola V ("`duplication` mide 66 % de precisión: el ancla acierta, la
  //     hipótesis no") y las 28 lo confirman: donde la duplicación es real el
  //     remedio es genéricos, un módulo compartido o un Parameter-Object —los
  //     9 `problema-si-patrón-no`—, y donde no lo es, la forma repetida ES el
  //     contrato (endpoints, `render()` de React, el preámbulo de un proxy).
  //     No falta un umbral: falta el andamio invariante con ranura.
  //
  // `distributed-duplication` y `invariant-scaffold-varying-call` NO se tocan,
  // y el `build` queda intacto: `distributed-duplication` recorre el MISMO
  // camino y sigue publicando.
  anchors: ["distributed-duplication", "invariant-scaffold-varying-call"],
  build(problem, graph, ctx) {
    const spec = buildSpec(ctx, problem);
    const cpg = { repo: ctx.repo, graph };
    const outcome = engineBuild(spec, ctx.capabilities, problem, cpg);
    if (ai6TraceEnabled()) {
      ai6Record(problem.kind === "invariant-scaffold-varying-call" ? "invariant-scaffold" : "duplication", spec, problem, problem, cpg, ctx, graph !== null, outcome !== null);
    }
    if (!outcome) return null;

    // AE6 — el camino del ancla-fuerza apunta a los LUGARES que repiten el
    // tratamiento y a la OPERACIÓN soldada en cada uno; `triggerBoundLocations`
    // (que lee `repo.clones`) no aplica, porque este ancla no nace de un clon.
    if (problem.kind === "invariant-scaffold-varying-call") {
      const { sites, operations } = scaffoldRoles(problem);
      const scaffoldPlaces: PatternHypothesis["places"] = [
        ...sites.map((s) => ({ file: s.file, startLine: s.startLine, endLine: s.endLine, role: `lugar que repite el tratamiento — ${s.symbol ?? ""}` })),
        ...operations.map((o) => ({ file: o.file, startLine: o.startLine, endLine: o.endLine, role: `operación soldada a una copia del tratamiento — ${o.symbol ?? ""}` })),
      ];
      return toPatternHypothesis(spec, outcome, {
        anchorFindingId: problem.id,
        places: scaffoldPlaces.length > 0 ? scaffoldPlaces : problem.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, role: l.role ?? "" })),
        cost:
          `Un valor invocable (o un objeto con un miembro) por cada una de las ${operations.length} operaciones, más UN invocador que escriba el tratamiento una sola vez. ` +
          "Se justifica si se espera que aparezcan más operaciones, o si el tratamiento tiene que crecer (registro, reintento, deshacer): cada agregado cuesta un valor en vez de otra copia.",
      });
    }

    const bound = triggerBoundLocations(problem, ctx.repo);
    // Ola W2 — el camino de interfaz compartida (`commandInterfaceEvidence`)
    // puede confirmar `required` con `bound` VACÍO (manejadores invocados
    // polimórficamente no son necesariamente "ligados a un disparador": ese
    // concepto es del heurístico viejo, no de la terna interfaz+miembro
    // común) — sin este respaldo, `places` quedaría vacío y la hipótesis no
    // tendría dónde apuntar.
    const places: PatternHypothesis["places"] =
      bound.length > 0
        ? bound.map((b, i) => ({
            file: b.location.file,
            startLine: b.location.startLine,
            endLine: b.location.endLine,
            role: `manejador "${b.clone.functionName}" ligado a un trigger${i === 0 ? "" : " (duplicado)"}`,
          }))
        : problem.locations.map((loc, i) => ({
            file: loc.file,
            startLine: loc.startLine,
            endLine: loc.endLine,
            role: `implementador duplicado${i === 0 ? "" : " (copia)"}${loc.role ? ` — ${loc.role}` : ""}`,
          }));

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Un objeto/función por operación (con el miembro común encontrado, y su contraparte de deshacer si aplica) más el registro de qué trigger invoca cuál — se justifica si son ≥2 triggers reales y se espera que aparezcan más.",
    });
  },
};
