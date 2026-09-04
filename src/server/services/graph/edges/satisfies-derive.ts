/**
 * ROOT-CAUSE FIX (frente "Go: extends/implements/mixes-in/satisfies, una
 * sola causa") — VERIFICADO, NO TOCADO: `satisfies` para Go era 0 no por un
 * defecto de ESTE archivo sino porque `graph/types.ts#memberSignatures`
 * filtra a `family === "class-like"` (nunca alcanzada por ningún nodo de Go
 * — `code-grammar.ts`'s `classNodes` derivaba vacío) y a miembros `family
 * === "function-like"` (Go's `method_spec`, la firma de método de una
 * interfaz, nunca tenía ese `family` porque nunca tiene `body`). Ambos
 * arreglados en `code-grammar.ts` (`GO_TYPE_SPEC_WORD`/
 * `GO_METHOD_SPEC_WORD`) — el algoritmo de ESTE archivo no cambió una
 * línea, y no hacía falta: una vez que `graph/symbols.ts` produce nodos
 * `class-like` con miembros `function-like` reales para Go (interfaces
 * embebiendo interfaces, con sus firmas de método), este derivador ya sabía
 * compararlos. Confirmado sobre el corpus real, no hipotético: hugo pasó de
 * `satisfies=0` a `satisfies=10`, los 10 verificados a mano contra el código
 * Go real (p.ej. `modules/module.go#Module` satisface a `hugofs/
 * fileinfo.go#Module` — ambas interfaces `Module`, la primera tiene, con la
 * MISMA aridad, cada método que la segunda exige: `Path()`, `Dir()`,
 * `IsGoMod()`, `Version()`, más otros de más). cobra (mucho menos material —
 * ~1 interfaz real) sigue en 0, consistente con el tamaño medido del repo,
 * no con un defecto — ver el resultado final de la tarea.
 *
 * `satisfies`, DERIVADO — CONTRATO-F8G.md §3.2. Stub aterrizado por
 * Cimientos (el "enganche": import + llamada desde `graph/build.ts`,
 * devolviendo `[]` hasta que F4 lo llene) — implementado acá por F4.
 *
 * QUÉ HACE: con `arity` en el nodo (CONTRATO-F8G.md §2) y las aristas
 * `contains` que el grafo ya tiene, el perfil estructural de un tipo
 * (conjunto `name+arity` de sus miembros, vía `memberSignatures` de
 * `../types.js`) sale SIN AST. `interfaz-estructural.ts` (que hacía un
 * segundo bootstrap de web-tree-sitter, ver el historial de `edges/warmup.ts`)
 * queda RETIRADO (borrado, no arreglado — sacado de `edges/registry.ts`;
 * nunca estuvo cableado en `warmup.ts`, ver ese archivo).
 *
 * QUÉ ES "SATISFACER" ACÁ, y en qué se diferencia del extractor retirado:
 * el extractor AST distinguía "interfaz declarada" de "tipo concreto" por
 * FORMA de gramática (`interface_declaration` vs `class_declaration` en TS;
 * `interface_type` vs `struct_type` en Go). El grafo NO tiene esa
 * distinción — `SymbolFamily` sólo conoce `"class-like"`, sin diferenciar
 * "esto es una interfaz" (`symbols.ts`, ver su propio comentario: no hay
 * refinamiento de `class-like` para eso). Así que la relación se generaliza,
 * a propósito, a cualquier PAR de tipos `class-like` distintos donde el
 * conjunto de miembros de uno es superconjunto del otro: "A satisface a B"
 * significa "A tiene, con la MISMA aridad, todo lo que B tiene" — sea B una
 * interfaz declarada, una clase concreta, o un struct. Es una relación MÁS
 * amplia que la del extractor AST (que sólo apuntaba a una interfaz
 * reconocida), consistente con `provenance: "inferred"` en los dos casos:
 * ninguno es una aserción del programa, ambos son hipótesis estructural.
 *
 * ARIDAD DESCONOCIDA (`arity: null`, F2 no corrió sobre ese símbolo, o el
 * lenguaje no expone lista de parámetros ahí) NUNCA participa de una firma
 * — ni del lado del objetivo (un miembro que no se puede verificar no exige
 * nada) ni del lado del candidato (no se puede afirmar que iguala una
 * aridad que no se conoce). Tratar `null` como una aridad más colisionaría
 * TODOS los miembros de aridad desconocida entre sí, afirmando
 * satisfacción sin evidencia — exactamente lo que este módulo se niega a
 * hacer. Consecuencia medida y esperada: mientras F2 no produzca `arity`
 * real (día 0 de esta ola), TODO tipo tiene cero firmas conocidas y esta
 * función devuelve `[]` siempre — el mismo comportamiento observable que el
 * stub, por construcción del algoritmo, no por un caso especial escrito a
 * mano.
 *
 * RENDIMIENTO — PROHIBIDA la comparación par a par (43 707 símbolos en
 * guava son 9,5·10⁸ pares si se compararan todos contra todos). Índice
 * invertido: `firma(name+arity) -> ids de tipo que la tienen`, construido en
 * UNA pasada O(tipos × miembros). Por cada tipo OBJETIVO, se identifica su
 * firma REQUERIDA menos frecuente (el "posting list" más chico) — cualquier
 * candidato real tiene que aparecer ahí, así que sólo esos candidatos se
 * verifican completos contra el resto de las firmas requeridas. Nunca se
 * compara un tipo contra todos los demás.
 *
 * PRESUPUESTO: `graph/build.ts#buildGraph` tiene que seguir 100% síncrona
 * (invariante documentado ahí — `build-incremental.test.ts` depende de la
 * equivalencia byte-a-byte con `buildGraphIncremental`), así que esta
 * función es pura y síncrona, nunca `forEachChunked`/async — decisión de
 * Cimientos, reportada en su resultado. CONTRATO-F8G.md §5, tabla, pide
 * "`satisfies` derivado... ninguna tajada > 30 ms" — MÁS LAXO que los 8 ms de
 * `INCREMENTAL_YIELD_BUDGET_MS` (ese es el presupuesto de CEDER entre
 * archivos, no aplica acá porque esto no corre por archivo). Esta ola
 * encontró que la lectura LITERAL de esa tabla — un techo de reloj de pared
 * dentro de la función — es un defecto: la MISMA entrada da resultados
 * DISTINTOS según qué tan cargada esté la máquina (ver SATISFIES_WORK_BUDGET
 * arriba, con la reproducción). El techo se aplica ahora en UNIDADES DE
 * TRABAJO — determinista para una entrada dada, sin importar la máquina —
 * preservando la intención real de CONTRATO-F8G.md §5 (acotar el costo de
 * una tajada síncrona, cobertura parcial nunca corrompida) sin heredar su
 * dependencia del reloj.
 *
 * MEDIDO, NO HIPOTÉTICO — el hallazgo de rendimiento más importante de este
 * archivo, y una brecha declarada que sigue abierta (contexto histórico,
 * previo al cambio de esta ola; sigue siendo la razón de fondo por la que
 * hace falta ALGÚN techo, no sólo cuál unidad usarlo). En la máquina de esa
 * tarea (compartida, con el resto del sistema corriendo — ver las reglas de
 * memoria del proyecto), un microbenchmark AISLADO (sin `analyzeRepo`
 * alrededor) midió: `new Map()` + 46 496 `.set()` (un `nodeById` ingenuo
 * sobre TODOS los nodos de guava) tarda ~13 ms en frío ÉL SOLO; UN solo
 * recorrido de las 58 496 `contains` con un `Set.has`/`Map.get-o-set` por
 * arista (exactamente el trabajo de la fase 1 de abajo) tarda ~27 ms en frío,
 * ~12 ms en caliente — ambas cifras, bajo el viejo techo de 30 ms, ya se
 * comían el presupuesto ANTES de llegar a comparar una sola firma; bajo el
 * techo nuevo, esas mismas 58 496 `contains` son "sólo" 58 496 unidades de
 * trabajo, comparables a las 50 000 de SATISFIES_WORK_BUDGET — guava sigue
 * cortando en cobertura parcial (mismo resultado práctico, `(satisfies,
 * java)` sigue con waiver — ver `tests/golden/edge-coverage-waivers.json`),
 * pero ahora por TAMAÑO, no por qué tan rápido corrió el reloj esta vez.
 * Filtrar primero (`classLikeIds`/`neededNodeIds` de abajo, en vez de indexar
 * TODO el repo antes de filtrar nada) reduce cuánto hay que indexar, pero NO
 * cambia el costo del PRIMER recorrido completo de `containsEdges` en sí.
 * Cortar a mitad de una fase deja cobertura PARCIAL, nunca corrompida: un
 * tipo sin firma calculada simplemente no participa ni como objetivo ni como
 * candidato (mismo resultado observable que si no existiera todavía).
 */
import { memberSignatures, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../types.js";

/**
 * CONTRATO-F8G.md §5 exige un techo para esta derivación específicamente
 * (más laxo que `INCREMENTAL_YIELD_BUDGET_MS`), pero expresado ahí en
 * MILISEGUNDOS. Acá se aplica en UNIDADES DE TRABAJO — una "unidad" es una
 * iteración de cualquiera de los 4 recorridos de abajo (una `contains`
 * revisada en fase 1, un nodo revisado en fase 1, un tipo procesado en fase
 * 2, un tipo objetivo visitado en fase 3) — porque un techo de reloj de
 * pared hace que la MISMA entrada (mismo repo, mismo código) dé un resultado
 * distinto según qué tan cargada esté la máquina en el momento de la
 * corrida: en un proceso de análisis estático eso es un defecto de diseño,
 * no un número mal calibrado. Medido y reproducido: con 30ms,
 * newtonsoft-json (14 004 `contains`, 12 882 nodos, 1829 tipos — 30 544
 * pasos combinados para completar las 4 fases enteras) daba 0 aristas
 * `satisfies` en una corrida en frío aislada (nada más corriendo en la
 * máquina) — no sólo bajo contención, como ya estaba documentado para guava.
 * El propio recorrido real, no el reloj, decide cuánto se alcanza a hacer;
 * en esta máquina y con este código, 30 544 pasos alcanzan para cubrir
 * newtonsoft-json entero. El techo de abajo deja ~64% de margen sobre eso
 * (mismo repo, mismo resultado, en cualquier máquina) y sigue acotando
 * repos de escala guava (bastante más grande) a cobertura parcial — que es
 * lo que ya tenía waiver ahí, sin este cambio.
 */
export const SATISFIES_WORK_BUDGET = 50_000;

/**
 * ARISTAS#1 (hallazgo hay-que-arreglar): un tipo cuyo ÚNICO miembro propio es
 * un dunder genérico (`__repr__`, `__init__`, `next`...) tenía firma requerida
 * de tamaño 1 — descartada antes sólo si era 0 (`required.size === 0`) — y
 * CUALQUIER otro tipo con un miembro de mismo nombre+aridad la "satisfacía".
 * Medido sobre click del corpus: 159 aristas `satisfies`, 106 (67%) apuntan a
 * 7 tipos cuyo único miembro propio es ese patrón (`Sentinel`, `IntParamType`,
 * `FloatParamType`, `_ParsingState`, `Exit`, `_NumberParamTypeBase`, y uno
 * más) — comprobado leyendo `types.py`/`parser.py`/`_utils.py` del corpus:
 * los 6 verificados tienen, cada uno, EXACTAMENTE un miembro propio.
 *
 * Exigir DOS O MÁS miembros de nombre+aridad distintos para participar como
 * OBJETIVO (nunca como candidato — un candidato con un solo miembro extra de
 * más no rompe nada, sigue pudiendo satisfacer a otro) es una firma
 * ESTRUCTURAL — tamaño de un conjunto — no una lista de nombres de dunders:
 * no hay ningún nombre de miembro escrito acá, así que la Ola 10 puede seguir
 * retirando vocabulario en otros archivos sin que este umbral dependa de él.
 * `memberSignatures`/`contains` sólo ven miembros DIRECTOS (`graph/types.ts`
 * está CONGELADO — ver CONTRATO-F8G.md/la nota de esta tarea); sumar
 * miembros HEREDADOS ahí arriba de la cadena `extends`/`implements`/
 * `mixes-in` habría sido la otra palanca posible, pero esas aristas no
 * las recibe esta función (sólo `containsEdges`) — plomearlas exigiría
 * cambiar la firma de `deriveSatisfiesEdges` y sus DOS call sites en
 * `graph/build.ts`, que no es un archivo de este paquete. Con el umbral de
 * tamaño solo, los 6 tipos verificados quedan excluidos igual (cada uno con
 * firma propia de tamaño 1, no 2+), así que no hizo falta esa segunda
 * palanca para resolver el hallazgo reproducido.
 */
const MIN_REQUIRED_SIGNATURE_SIZE = 2;

/**
 * LA PROCEDENCIA DE LA ARISTA — Ola Q (F1), y es lo único que cambió del
 * ALGORITMO de este archivo: qué `provenance` lleva cada arista derivada.
 *
 * EL DEFECTO, MEDIDO, NO SUPUESTO. Esta función deriva "A satisface a B" por
 * CONTENCIÓN de conjuntos de firma. La contención es una relación que puede
 * darse EN LAS DOS DIRECCIONES a la vez: si los dos tipos tienen EXACTAMENTE
 * el mismo conjunto de firmas conocidas, la fase 3 emite `A satisfies B` Y
 * `B satisfies A`, las dos con la MISMA evidencia y las dos con
 * `provenance: "inferred"`. Un consumidor que lea una de esas dos como
 * "B es el contrato, A lo implementa" está leyendo una DIRECCIÓN que esta
 * función no midió: la eligió el orden del arreglo. A lo sumo una de las dos
 * puede ser una afirmación "es-un"; esta derivación no sabe cuál, y hasta
 * esta ola no tenía cómo decirlo.
 *
 * Medido sobre el grafo de producción de tres repos del corpus (volcado
 * propio de esta ola con `scripts/q1-dump-grafo.mts`, ver el informe de F1
 * para la huella exacta — un volcado SE VENCE, esto aísla un delta, no
 * publica un absoluto):
 *
 *   | repo       | aristas `satisfies` | de conjuntos IGUALES (las dos direcciones) |
 *   |------------|--------------------:|-------------------------------------------:|
 *   | hugo       |                 648 |                                 302 (46,6%) |
 *   | nest       |               1.150 |                                 578 (50,3%) |
 *   | sqlalchemy |               1.339 |                                 402 (30,0%) |
 *
 * Casos verificados leyendo el código: `Locker`/`doNotCopy` de hugo (las dos
 * direcciones emitidas), `Engineer`/`Manager` de sqlalchemy (dos HERMANOS,
 * ninguno implementa al otro), `CatsController`/`CatsService` de nest (un
 * controlador y un servicio, en las dos direcciones).
 *
 * QUÉ SE HACE, Y QUÉ NO. No se borra la arista: la contención es un hecho
 * estructural CIERTO y hay consumidores que sólo preguntan "¿estos dos tipos
 * tienen la misma forma?". Lo que se agrega es la PROCEDENCIA, con el
 * vocabulario que el grafo ya tiene (`Provenance`, `graph/types.ts`):
 *
 *   - `"inferred"` — contención ESTRICTA (el candidato tiene firmas que el
 *     objetivo no exige). La dirección la fija la evidencia: el conjunto más
 *     chico es el que se puede leer como requisito.
 *   - `"ambiguous"` — conjuntos IGUALES. Es exactamente la definición que
 *     `Provenance` le da a ese valor ("la cascada sobrevivió con más de un
 *     destino posible y, en vez de descartarla, se conserva"): acá sobrevive
 *     con más de una LECTURA posible y se conserva igual. `CONTRATO-F9.md
 *     §4.5` (`edgeIsAmbiguous`/`confidentEdges`) hace el resto: queda fuera
 *     de toda consulta por defecto, y el consumidor que la quiera la pide.
 *
 * SIN `alternatives`, A PROPÓSITO. `CodeGraphEdge.alternatives` enumera OTROS
 * `to` posibles del MISMO `from`; acá la incertidumbre no es sobre el
 * destino (el par de tipos está perfectamente determinado) sino sobre la
 * DIRECCIÓN. Rellenar `alternatives` con el otro extremo diría algo falso.
 * Una arista `ambiguous` sin `alternatives` ya es una forma válida y probada
 * del tipo — ver `graph/resolve.test.ts`, "con UN solo destino la arista sale
 * igual, ambiguous y SIN `alternatives` (nunca `[]`)".
 *
 * LÍMITE DECLARADO, NO ESCONDIDO — y es el que más le importa a quien cuente
 * implementadores: esta derivación es INCOMPLETA en la dirección que fabrica
 * "único". Un tipo cuyo conjunto de firmas el grafo no ve entero (miembros
 * embebidos de un tipo externo al repo, aridad desconocida, o el corte por
 * `SATISFIES_WORK_BUDGET`) simplemente no aparece como candidato: el objetivo
 * pierde implementadores, nunca gana. Verificado sobre hugo:
 * `watcher/filenotify/filenotify.go#FileWatcher` tiene DOS implementadores en
 * el código (`filePoller` y `fsNotifyWatcher`) y esta derivación ve UNO,
 * porque el segundo embebe un tipo de fuera del repo. Por eso un conteo
 * "exactamente 1" leído sobre esta relación no es sólido — ver
 * `detect/inter-file/speculative-abstraction.ts`, que es quien lo hacía.
 */

/**
 * `steps` es UN contador compartido entre las 4 fases (igual que el `deadline`
 * de reloj de pared que reemplaza: un solo presupuesto para toda la función,
 * no uno por fase) — comparar un entero no tiene el costo de `performance.now()`,
 * así que se revisa en CADA iteración, sin necesidad de la tira que antes
 * hacía falta para no pagar el costo del reloj a cada paso.
 */
function pastBudget(steps: number): boolean {
  return steps >= SATISFIES_WORK_BUDGET;
}

/**
 * LO QUE ESTA DERIVACIÓN DEVUELVE, Y POR QUÉ NO ES SÓLO UNA LISTA DE ARISTAS.
 *
 * Hasta el cierre de la Ola R esta función devolvía `readonly CodeGraphEdge[]`
 * a secas, así que **agotar el presupuesto y devolver menos aristas era
 * indistinguible de "este repo no tiene ninguna"**. Es exactamente la
 * confusión que el proyecto ya combatió en el nivel 1 con `sin-aristas`,
 * `sin-grafo` y `sin-metricas`: *"no pude mirar"* nunca puede parecerse a
 * *"miré y no hay"*.
 *
 * Costó una regresión real: `corpus/sqlalchemy` pasó de 1.339 aristas
 * `satisfies` a **cero** y movió seis kinds, y nadie lo vio hasta el cruce por
 * (kind, lenguaje) del integrador — dos olas después de que el techo existiera.
 *
 * `cobertura: "parcial"` NO significa que las aristas devueltas sean dudosas:
 * cortar a mitad de una fase deja cobertura parcial, nunca corrompida (un tipo
 * sin firma calculada simplemente no participa). Significa que **puede faltar**
 * alguna, y que un consumidor que concluya "no hay relación" a partir de esta
 * corrida estaría concluyendo de más.
 */
export interface SatisfiesDerivation {
  readonly edges: readonly CodeGraphEdge[];
  readonly cobertura: "completa" | "parcial";
  /** Unidades de trabajo consumidas. Compararlo con `SATISFIES_WORK_BUDGET` dice cuánto margen quedaba. */
  readonly pasos: number;
}

function sigKey(name: string, arity: number): string {
  return `${name}/${arity}`;
}

/** El conjunto de firmas `name/arity` de aridad CONOCIDA de un tipo — ver el docstring del módulo: `null` nunca entra a una firma. */
function knownSignatures(index: GraphIndex, ownerId: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const m of memberSignatures(index, ownerId)) {
    if (m.arity === null) continue;
    out.add(sigKey(m.name, m.arity));
  }
  return out;
}

/**
 * Deriva las aristas `satisfies` del grafo YA armado (nodos + `contains`
 * acumuladas hasta este punto de `build.ts`) — sin AST, sin comparación par
 * a par. Ver el docstring del módulo para la definición exacta de
 * "satisface" y las garantías de rendimiento/presupuesto.
 */
export function deriveSatisfiesEdges(
  nodes: readonly CodeGraphNode[],
  containsEdges: readonly CodeGraphEdge[],
): SatisfiesDerivation {
  let steps = 0;
  // NUNCA MÁS EN SILENCIO. Ver `SatisfiesDerivation`: agotarse y devolver menos
  // aristas era indistinguible de "este repo no tiene ninguna", y esa confusión
  // es la que costó las 1.339 aristas de sqlalchemy sin que nadie se enterara.
  let agotado = false;

  const types = nodes.filter((n) => n.kind === "symbol" && n.family === "class-like");
  const classLikeIds = new Set(types.map((t) => t.id));

  // Fase 1: agrupar `contains` por `from` — SÓLO las que salen de un tipo
  // `class-like` (`memberSignatures` nunca mira ninguna otra). Indexar TODOS
  // los nodos del repo (archivos, carpetas, símbolos sueltos) que
  // `nodeById` jamás va a resolver es plata tirada — medido: en guava,
  // `Map.set` de los 46 496 nodos completos cuesta, sola, más que el
  // presupuesto entero (ver el docstring del módulo). Filtrar PRIMERO y
  // construir el mapa de nodos SÓLO para los `to` que en verdad hacen falta
  // reduce esa población de "todo el repo" a "lo que cuelga de un tipo",
  // que es varias veces más chico.
  // EL PRESUPUESTO SE COBRA POR TRABAJO HECHO, NUNCA POR SALTEO — regresión
  // medida y aislada al cierre de la Ola R. Estas dos guardas estaban ANTES
  // del filtro, y eso hacía que el presupuesto se consumiera recorriendo
  // población que no puede aportar un solo miembro: `contains` que no salen de
  // un `class-like`, y nodos que no son destino de ninguna de ellas.
  //
  // Consecuencia medida con A/B aislado sobre `corpus/sqlalchemy` al aterrizar
  // `declares-type`/`stores`: los nodos `carrier` nuevos llevaron el conteo de
  // 20.316 a 37.051 (+82 %) y los pasos de esta función de 40.756 a 57.491
  // —por encima del techo de 50.000— y las aristas `satisfies` del repo
  // pasaron de **1.339 a CERO**, EN SILENCIO. Seis kinds se movieron por eso
  // (`duplication` +11, `unused-symbol` −13, `argument-mutation` +3,
  // `god-component`, `fanout-without-cohesion`, `speculative-abstraction`) sin
  // que ningún frente lo reportara: se vio sólo cruzando el censo por
  // (kind, lenguaje), mirando las celdas que SUBEN.
  //
  // La causa no es que el techo esté bajo: es que medía el TAMAÑO DEL GRAFO en
  // vez del TRABAJO DE ESTA DERIVACIÓN. Un `Set.has` que descarta no es el
  // costo que este techo existe para acotar — lo caro son las firmas de la
  // fase 2 y la verificación de candidatos de la fase 3. Con la guarda después
  // del filtro, agregar nodos de un `kind` que esta función NUNCA mira no
  // puede volver a apagarla, y el techo sigue acotando repos grandes por su
  // población REAL de tipos y miembros, que es lo que se quiso acotar.
  const byFrom = new Map<string, CodeGraphEdge[]>();
  const neededNodeIds = new Set<string>();
  for (let i = 0; i < containsEdges.length; i++) {
    const e = containsEdges[i]!;
    if (!classLikeIds.has(e.from)) continue; // salteo barato: no es trabajo de esta derivación, no se cobra.
    if (pastBudget(steps++)) {
      agotado = true; // cobertura parcial: las `contains` restantes no aportan miembros esta corrida.
      break;
    }
    const list = byFrom.get(e.from);
    if (list) list.push(e);
    else byFrom.set(e.from, [e]);
    neededNodeIds.add(e.to);
  }

  const byId = new Map<string, CodeGraphNode>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (!neededNodeIds.has(n.id)) continue; // salteo barato: ningún `class-like` lo contiene — no se cobra.
    if (pastBudget(steps++)) {
      agotado = true; // cobertura parcial: nodos restantes no resuelven — sus dueños quedan con firma incompleta.
      break;
    }
    byId.set(n.id, n);
  }
  const index: GraphIndex = {
    nodeById: (id) => byId.get(id) ?? null,
    edgesFrom: (id) => byFrom.get(id) ?? [],
  };

  // Fase 2: firma por tipo + índice invertido — O(tipos × miembros), revisado cada tipo (ver `pastBudget`).
  const sigsByType = new Map<string, ReadonlySet<string>>();
  const bySignature = new Map<string, string[]>();
  for (let i = 0; i < types.length; i++) {
    if (pastBudget(steps++)) {
      agotado = true; // cobertura parcial: tipos restantes no participan ni como objetivo ni como candidato.
      break;
    }
    const t = types[i]!;
    const sigs = knownSignatures(index, t.id);
    sigsByType.set(t.id, sigs);
    for (const s of sigs) {
      const list = bySignature.get(s);
      if (list) list.push(t.id);
      else bySignature.set(s, [t.id]);
    }
  }

  // Fase 3: por tipo OBJETIVO, sólo se verifican completos los candidatos de
  // su firma menos frecuente — nunca comparación par a par.
  const edges: CodeGraphEdge[] = [];
  for (let i = 0; i < types.length; i++) {
    const target = types[i]!;
    const required = sigsByType.get(target.id);
    if (!required) {
      agotado = true; // la fase 2 se cortó antes de llegar a este tipo (y todos los que siguen, mismo orden).
      break;
    }
    if (required.size < MIN_REQUIRED_SIGNATURE_SIZE) continue; // firma insuficiente para ser un OBJETIVO verificable — ver ARISTAS#1 en la constante de arriba.
    if (pastBudget(steps++)) {
      agotado = true;
      break;
    }

    let rarest: string | null = null;
    let rarestCount = Infinity;
    for (const s of required) {
      const count = bySignature.get(s)?.length ?? 0;
      if (count < rarestCount) {
        rarestCount = count;
        rarest = s;
      }
    }
    if (rarest === null) continue;

    for (const candidateId of bySignature.get(rarest) ?? []) {
      if (candidateId === target.id) continue;
      const have = sigsByType.get(candidateId);
      if (!have) continue;
      let ok = true;
      for (const s of required) {
        if (!have.has(s)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // LA PROCEDENCIA — ver el bloque "LA PROCEDENCIA DE LA ARISTA" arriba.
      // `required ⊆ have` ya está verificado, así que tamaños iguales ⇒
      // conjuntos IGUALES ⇒ la fase 3 emite también la arista inversa con la
      // misma evidencia: la dirección no la mide esta función.
      const provenance = have.size === required.size ? "ambiguous" : "inferred";
      edges.push({ from: candidateId, to: target.id, kind: "satisfies", provenance, weight: 1 });
    }
  }
  return { edges, cobertura: agotado ? "parcial" : "completa", pasos: steps };
}
