/**
 * `parallel-hierarchies` — JERARQUÍAS PARALELAS MANTENIDAS A MANO (PLAN.md
 * §4.1 catálogo; CONTRATO-F5.md Contrato 4, detector `inter-file` sobre el
 * grafo de tipos).
 *
 * RELACIÓN (qué mide, sin jerga de AST): dos o más FAMILIAS de tipos —
 * grupos de unidades tipo-clase conectadas entre sí por herencia
 * (`extends`) o implementación de interfaz (`implements`) — que NO
 * comparten ningún ancestro (son componentes DISTINTAS del grafo de
 * herencia/implementación: ninguna arista `extends`/`implements` cruza de
 * una a la otra) y que tienen la MISMA FORMA (mismo tamaño, misma cantidad
 * de raíces, y el mismo patrón de ramificación en cada nivel). Cada vez que
 * alguien agrega un miembro a una de las familias, casi con seguridad hace
 * falta agregar el miembro espejo en la otra — mantenimiento manual
 * duplicado que el compilador no puede exigir porque no hay ningún tipo
 * compartido que las una.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la "forma" de una familia se calcula
 * exclusivamente a partir del grafo de aristas `extends`/`implements` ya
 * tipadas (`graph/edges/herencia.ts`, `graph/edges/interfaz-declarada.ts`):
 * tamaño de la componente, cantidad de raíces (nodos sin arista saliente
 * dentro de la componente) y la SECUENCIA ORDENADA de cuántos hijos
 * directos tiene cada nodo. Cero nombres de clase, cero nombres de método,
 * cero vocabulario de dominio — dos familias con nombres totalmente
 * distintos pero la misma forma matchean igual que dos con nombres
 * parecidos.
 *
 * SIMPLIFICACIONES DECLARADAS:

 * RAÍZ MEDIDA (Ola AW, frente AW5) — LA FORMA SOLA NO ES EVIDENCIA DE NADA, Y
 * EL ARREGLO ES LA CORRESPONDENCIA DE NOMBRES. Los 14 hallazgos VIVOS de este
 * detector se juzgaron a mano abriendo los archivos: **0 verdaderos**, los 14
 * por la misma causa. `shapeOf` compara una FIRMA DE GRADOS (tamaño + cantidad
 * de raíces + patrón de ramificación) y nada más, así que empareja familias de
 * dominios ajenos que coinciden en la forma más común de la OO:
 * `_WindowsConsoleRawIOBase/Reader/Writer` (consola de Windows) con
 * `Parameter/Option/Argument` (la API de parámetros de click);
 * `ReadSeekCloserProvider` (io) con `Vector` (geometría);
 * `RpcExceptionFilter` (interfaz de UN método) con `ConsoleLogger` (100+
 * líneas); `JsonException` (4 constructores, idioma .NET) con
 * `CamelCaseNamingStrategy`; `SampleElements` (datos de test) con
 * `MapMakerInternalMap`. Ningún umbral arregla una coincidencia.
 *
 * (Los OTROS ocho juicios de la planilla ya estaban MUERTOS: eran el bug de
 * "se empareja consigo mismo" y los grupos de N>2, que la Ola P (P7) cerró de
 * verdad con `dedupeSameFileComponents` + el filtro `list.length === 2`. Ese
 * trabajo no se repite.)
 *
 * EL HECHO QUE SÍ DEFINE EL OLOR. Fowler lo define por el MANTENIMIENTO
 * ESPEJO: "cada vez que hacés una subclase de una clase, tenés que hacer una
 * subclase de la otra". Lo que hace VERIFICABLE esa frase —y lo que este
 * detector nunca miró— es la CORRESPONDENCIA DE NOMBRES entre los subtipos de
 * las dos familias: `Engineer`/`Salesman` contra
 * `EngineerPayCalculator`/`SalesmanPayCalculator`. Es un HECHO (los nombres
 * están en `symbolPath` de cada nodo del grafo), es VISIBLE en lo que el
 * analizador ya carga (ni tipos ni historia de git) y es SUFICIENTE para que
 * sea un PROBLEMA y no sólo una forma: si los discriminadores se espejan,
 * agregar uno obliga a agregar el otro, que es exactamente el daño.
 *
 * NO ES UN ATAJO POR VOCABULARIO. Cero palabras de dominio cableadas: se
 * parten los identificadores por sus propias fronteras (`_`, `-` y mayúscula
 * intermedia — las dos convenciones que los 7 lenguajes comparten), se
 * descuenta lo que TODOS los miembros de una familia comparten (el sufijo de
 * familia: `Provider`, `PayCalculator`) y se compara lo que queda, que es
 * literalmente el discriminador que el programador tuvo que escribir dos
 * veces. La compuerta es PURAMENTE SUSTRACTIVA: no agrega ni un hallazgo.
 *
 *  - **Forma = firma de grados, no isomorfismo de árbol completo.** Se
 *    compara `(tamaño, cantidad de raíces, secuencia ordenada de
 *    cantidad-de-hijos por nodo)`, no una comparación recursiva nodo a nodo
 *    de la forma completa. Es una aproximación barata y suficiente para el
 *    caso común (familias tipo "un tipo base con N subtipos hoja"); dos
 *    familias con la MISMA secuencia de grados pero un árbol internamente
 *    distinto (multiset de grados igual, forma real distinta) matchearían
 *    como falso positivo — riesgo declarado, no medido en el corpus por
 *    separado del resultado final de esta tarea.
 *  - **Alcance de arista: sólo `extends`/`implements`.** `mixes-in`
 *    (composición de módulo, Ruby `include`) e `instantiates` (uso, no
 *    herencia) quedan fuera a propósito: esas dos no son relaciones "es-un"
 *    entre tipos, así que agregarlas al grafo de agrupación fusionaría
 *    familias que no comparten ninguna forma real de herencia. `satisfies`
 *    (implementación ESTRUCTURAL, sin declarar) también queda fuera: hoy
 *    ningún archivo de `graph/edges/` la emite todavía (verificado por grep:
 *    `interfaz-estructural.ts` existe pero, igual que el resto de las 6
 *    aristas tipadas, no fluye a producción — ver "BRECHA DE
 *    INFRAESTRUCTURA" más abajo), y aunque emitiera, el brief la asigna a
 *    otro problema (herencia estructural silenciosa), no a este.
 *  - **Componentes triviales excluidas.** Una componente de tamaño 1 (una
 *    clase sin ninguna arista `extends`/`implements` hacia/desde otra) no
 *    es una "familia": se excluye antes de agrupar (ver `minHierarchySize`
 *    más abajo).
 *  - **Cross-check de Bridge por ARCHIVO, no por símbolo exacto.** Para
 *    decidir si dos familias candidatas están unidas por una composición a
 *    propósito (ver "CON QUÉ SE CONFUNDE"), se busca cualquier arista
 *    `references`/`instantiates` que cruce entre un archivo de la familia A
 *    y un archivo de la familia B — no se exige que el símbolo exacto que
 *    la compone sea el nodo raíz. Es una lectura más generosa (menos falsos
 *    "no hay composición"), a propósito: lo conservador acá es no acusar de
 *    duplicación ciega algo que podría ser Bridge bien aplicado.
 *
 * CON QUÉ SE CONFUNDE — BRIDGE BIEN APLICADO, A PROPÓSITO. *** Esta es la
 * advertencia central del catálogo para este problema: *** el patrón
 * Bridge (Gamma et al., GoF) es LITERALMENTE dos jerarquías paralelas
 * (Abstracción/Implementación) diseñadas a propósito para variar de forma
 * independiente, unidas por una referencia de COMPOSICIÓN (la abstracción
 * guarda una referencia al objeto de implementación) en vez de por
 * herencia compartida. Estructuralmente, un Bridge bien aplicado y una
 * duplicación por mantenimiento manual producen la MISMA firma que este
 * detector mide: dos componentes del grafo de herencia, sin ancestro
 * común, con la misma forma. La única señal disponible en este grafo para
 * distinguirlos es la composición: si existe una arista `references`/
 * `instantiates` que cruza de un archivo de una familia a un archivo de la
 * otra, es compatible con Bridge (la abstracción USA la implementación a
 * propósito) y el hallazgo baja de severidad y lo dice en `detail`
 * explícitamente en vez de descartarse — este detector no tiene manera de
 * mirar SI esa referencia vive en un campo declarado en el constructor
 * (la forma canónica de Bridge) o es incidental, así que la salida es
 * siempre una HIPÓTESIS con confianza, nunca una afirmación.
 *
 * LÍMITES POR LENGUAJE (medidos citando los propios extractores, no
 * supuestos):
 *  - **Provenance siempre `declared`**: tanto `herencia.ts` como
 *    `interfaz-declarada.ts` emiten SIEMPRE `provenance: "declared"` (la
 *    sintaxis lo dice explícitamente; ninguno de los dos pasa por la
 *    cascada heurística de `resolve.ts`). *** OJO CON JAVA, resuelto a
 *    favor: *** a diferencia de `dependency-cycle`/`orphan-file`/
 *    `unused-symbol` (que dependen de aristas `references`, donde
 *    `path-proximity` —heurística, `inferred`— domina el 81% de lo
 *    aceptado en guava), este detector NO usa `references` para construir
 *    sus familias, así que ese riesgo específico de Java NO aplica acá. Sí
 *    se usa `references`/`instantiates` para el cross-check de Bridge
 *    (ver arriba), y ahí sí puede colarse una arista `inferred`: por eso
 *    ese cross-check es puramente para BAJAR confianza, nunca para subirla
 *    ni para descartar un hallazgo.
 *  - **Go**: `classNodes` sale vacío para esta gramática (`code-grammar.ts`,
 *    límite ya documentado ahí: `type_spec` no expone campo `body`) — sin
 *    unidades tipo-clase no hay nodos candidatos, así que este detector no
 *    encuentra familias en Go. Indistinguible de "no hay jerarquías", igual
 *    que el resto del catálogo que depende de `classNodes`.
 *  - **C#**: `herencia.ts` documenta que `class X : Base, IFoo` es AMBIGUO
 *    por diseño del lenguaje (misma lista para clase base e interfaces, sin
 *    campo que las distinga) y por eso NO EMITE ninguna arista `extends`
 *    para C# ("una arista falsa es peor que una ausente", cita textual de
 *    ese archivo). `implements` en C# queda sujeto al mismo mecanismo de
 *    ambigüedad en `interfaz-declarada.ts`. Este detector hereda esa
 *    ausencia sin poder compensarla (archivo ajeno, regla 6): en C# sólo
 *    puede formar familias con la porción de la relación que SÍ se anima a
 *    emitir cada extractor.
 *
 * *** CORREGIDO — este párrafo afirmaba una brecha de infraestructura que
 * ya no existe, verificado de nuevo: *** `code-analyzer.ts` (bloque
 * `graphFiles`, comentario propio "P5-ARISTAS — la línea exacta que faltaba
 * desde la Ola 5") pasa `f.edges` a `buildGraphIncremental`, y
 * `graph/build.ts` importa y usa `EDGE_EXTRACTORS` para traducirlas. Hoy,
 * en producción, `repo.graph.edges` SÍ contiene aristas `extends`/
 * `implements`. Consecuencia MEDIDA (censo congelado,
 * `tests/golden/*.census.json`): este detector reporta 82 hallazgos en los
 * 8 repos del corpus (guava 80, click 2) — no los 0 que este párrafo
 * predecía. Juzgado en esta ola (Ola H4) el único caso de click
 * (`_winconsole.py`/`core.py`): FALSO — dos jerarquías sin relación
 * semántica que sólo coinciden en la forma más común posible (1 base + 2
 * hijos), riesgo ya declarado arriba en "SIMPLIFICACIONES DECLARADAS"
 * (forma = firma de grados, no isomorfismo real). Ese riesgo de colisión
 * por frecuencia estadística, no un cableado ausente, es la brecha real que
 * queda para este detector.
 *
 * RAÍZ MEDIDA — SE EMPAREJABA CONSIGO MISMO (bug de precisión, Ola N→O):
 * juzgados a mano 5 hallazgos de guava, 3 mostraban el MISMO NOMBRE DE
 * ARCHIVO dos veces como si fueran "familia 1" y "familia 2"
 * (`DerivedCollectionGenerators.java, DerivedCollectionGenerators.java`).
 * Investigado con el censo completo (`dump-hallazgos.mts` sobre
 * `corpus/guava`, 22 hallazgos): NO es un bug de la componente conexa (dos
 * componentes nunca comparten un nodo) — es que `guava/` tiene un árbol de
 * fuente ESPEJADO completo bajo `android/guava*` (backport del mismo código
 * para el build de Android): `android/guava-testlib/.../DerivedGenerator.java`
 * y `guava-testlib/.../DerivedGenerator.java` son DOS ARCHIVOS con la MISMA
 * interfaz `DerivedGenerator` y los MISMOS 10 implementadores, palabra por
 * palabra. De los 22 hallazgos medidos, la enorme mayoría son exactamente
 * esto: `WrappedCollection`/`CharSource`/`CharMatcher`/`ByteSource`/`Hasher`/
 * `ForwardingObject`/… cada uno aparece UNA vez bajo `android/` y otra vez,
 * IDÉNTICO, sin el prefijo — dos copias de LA MISMA familia, no dos familias
 * diseñadas independientemente que casualmente coinciden en forma. El
 * detector las contaba como "2 jerarquías paralelas" cuando en realidad hay
 * UNA sola, duplicada por el proceso de build — el caso de uso exacto para el
 * que existe `duplication`/`distributed-duplication`, no éste.
 *
 * ARREGLO: `dedupeMirroredComponents` colapsa, DENTRO de un mismo grupo de
 * forma idéntica, las componentes que ADEMÁS comparten el mismo CONJUNTO de
 * `symbolPath` de sus miembros (no sólo el tamaño/raíces/ramificación) — ver
 * su docstring. Es estructural (compara identificadores YA extraídos del
 * grafo entre sí, la misma clase de comparación que `shapeOf`/`fieldKeyOf`
 * ya hacen en este mismo catálogo), no un caso especial de "Android": no
 * menciona ese nombre en ningún lado, así que colapsa CUALQUIER árbol de
 * fuente espejado (un vendorizado, una copia de build, un fork interno), no
 * sólo el de guava. Riesgo aceptado y declarado: dos familias GENUINAMENTE
 * independientes que por coincidencia reusaran el mismo conjunto exacto de
 * nombres de símbolo (no sólo la misma forma) colapsarían igual — mucho más
 * improbable que la colisión de forma sola ya declarada arriba, y un precio
 * razonable por dejar de contar una duplicación de árbol completo como si
 * fueran dos diseños paralelos.
 *
 * Además, `exampleNames` (más abajo) mostraba SIEMPRE el nombre de archivo
 * PELADO (`fileNameOf`, sin directorio) — la causa directa de que el texto
 * del hallazgo mostrara el mismo nombre dos veces incluso cuando los DOS
 * archivos completos eran distintos (`android/.../X.java` vs `.../X.java`):
 * perdía la única información que los distinguía. Ahora, si los nombres
 * pelados de los ejemplos mostrados COLISIONAN, se muestra la ruta completa
 * de los tres en vez del nombre pelado — defensa en profundidad para
 * cualquier colisión de nombre de archivo que el dedupe de arriba no cubra
 * (dos familias realmente distintas que sólo comparten nombre de archivo).
 *
 * SEGUNDA CAUSA MEDIDA (Ola P, frente P7) — el arreglo de arriba dejó el kind
 * en 0 % de precisión igual (`tests/golden/precision/*.verdicts.csv`, n=5,
 * dos olas seguidas). Los 5 hallazgos vivos juzgados HOY tienen, los cinco,
 * la MISMA raíz medida en sus notas, aunque con dos síntomas distintos:
 *
 *  1. **Todavía "el mismo archivo dos veces"** (`guava:E6GMv1yffp61a172`,
 *     nota: *"SIGUE EMPAREJANDOSE CONSIGO MISMO... el MISMO archivo dos
 *     veces, con ruta completa... El dedupe por conjunto de symbolPath de
 *     N11 no alcanza cuando las dos 'jerarquias' son dos clases anidadas
 *     DISTINTAS del MISMO archivo"*) — `AbstractMapBasedMultimap.java`
 *     declara varias clases anidadas sin relación entre sí (`KeySet`,
 *     `WrappedCollection`, `AsMap`…) que coinciden en forma por pura
 *     coincidencia de tamaño, y como NO comparten símbolos
 *     `dedupeMirroredComponents` no las toca. `dedupeSameFileComponents`
 *     (nuevo, más abajo) cierra esto: colapsa, dentro de un grupo de forma
 *     idéntica, las componentes que comparten archivo aunque no compartan
 *     símbolo — dos "familias" que ni siquiera son unidades de compilación
 *     distintas no son el fenómeno que este detector busca.
 *  2. **Colisión de forma A ESCALA, medida con el grafo de HOY**: sobre
 *     guava (`scripts/p7-probe-parallel.mts corpus/guava guava`, 173
 *     componentes >= `minHierarchySize`), 11 firmas de forma se repiten, y
 *     7 de esas 11 lo hacen en grupos de 3 a 23 componentes — la firma
 *     "raíz + 2 hojas" (tamaño 3) sola empareja 23 clases de dominios
 *     TOTALMENTE ajenos (`Optional`, `CacheLoader`, `Funnel`,
 *     `ToDoubleRounder`, `Invokable`, `TimeLimiter`, `Monitor.Guard`…). Tres
 *     de los cinco hallazgos judged (`FuMyFRba3bJMNuoP` 11 vías,
 *     `RP-MSDnZOhAb8XID` 10 vías, `bOcS8yieO143b3BH` — hoy 8 vías, tamaño 5)
 *     son exactamente esto, con la nota del juez explícita: *"la forma de
 *     grados no es isomorfismo real"*. Un grupo de N>2 familias con la misma
 *     forma pequeña es el idioma más común de Java/OO ("una clase con varias
 *     implementaciones anidadas"), no evidencia de una PAREJA mantenida a
 *     mano — y la propia guía de refactor del hallazgo ("Move Method / Move
 *     Field… hasta que UNA DE LAS DOS deje de necesitar…") ya asume una
 *     pareja, nunca un grupo de N. El filtro nuevo exige EXACTAMENTE 2
 *     componentes por firma (ver el bloque `.filter(([, list]) => list.length
 *     === 2)` en `buildParallelHierarchiesFindings`).
 *
 * RIESGO ACEPTADO, NO EL CIERRE DEL PROBLEMA: el quinto hallazgo judged
 * (`click:dBrhUDZQNIETK-VC`, `_WindowsConsoleRawIOBase`/`Parameter`) YA ERA
 * un par exacto (2 componentes) y sigue siendo falso — *"coincidencia
 * estructural de una forma ubicua... no evidencia de que deban variar en
 * paralelo"*. Un par genuino en una firma pequeña y común sigue sin poder
 * distinguirse de una coincidencia con la información que este grafo trae
 * hoy (tamaño + raíces + secuencia de grados, sin isomorfismo real ni
 * ninguna señal de "estos dos se diseñaron juntos" más allá de la
 * composición ya cubierta por el cross-check de Bridge). Declarado, no
 * escondido: ver "SIMPLIFICACIONES DECLARADAS" arriba.
 */
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphEdge } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "minHierarchySize" | "minGroupSize";

/** Una componente de tamaño 1 (clase sin ninguna arista extends/implements) no es una familia — ver "SIMPLIFICACIONES DECLARADAS". */
const MIN_HIERARCHY_SIZE_SPEC = pisoDeclarado(3, {
  rationale:
    "una familia de tamaño 2 (un tipo base y un único subtipo) es el uso más común y más legítimo de herencia simple; " +
    "exigir al menos 3 miembros (base + 2 subtipos, o una cadena de 3) filtra ese caso trivial y ubicuo sin descartar " +
    "una familia con ramificación real, que es la forma que de verdad se puede confundir con otra.",
});

/** R3 (auditoría de umbrales inventados): "N unidades" del catálogo es
 *  binario por definición del nombre del patrón ("jerarquías PARALELAS" ya
 *  exige plural), no un piso elegido a mano — mismo caso que motivó
 *  `presencia()`. Antes `pisoDeclarado(2, …)`. */
const MIN_GROUP_SIZE_SPEC = presencia({
  rationale:
    "\"jerarquías paralelas\" es, por definición, más de una jerarquía; 2 es el mínimo para que el patrón exista.",
});

const MAX_FINDINGS_SPEC = presupuesto(30, {
  rationale: "un panel legible no muestra de forma útil más de unas pocas decenas de familias paralelas a la vez; es un tope de volumen, no de detección.",
});

interface ClassNode {
  readonly id: string;
  readonly file: string;
  readonly symbolPath: readonly string[];
  readonly startLine: number;
  readonly endLine: number;
}

function classNodesOf(graph: CodeGraph): Map<string, ClassNode> {
  const out = new Map<string, ClassNode>();
  for (const n of graph.nodes) {
    if (n.kind === "symbol" && n.family === "class-like") {
      out.set(n.id, {
        id: n.id,
        file: n.file,
        symbolPath: n.symbolPath,
        startLine: n.startLine ?? 1,
        endLine: n.endLine ?? n.startLine ?? 1,
      });
    }
  }
  return out;
}

/** Sólo `extends`/`implements` — ver "SIMPLIFICACIONES DECLARADAS". Ambos extremos deben ser
 *  unidades tipo-clase conocidas del grafo. Excluye `ambiguous` (CONTRATO-F9.md §4.5: fuera de
 *  toda consulta por defecto) — "sabemos que hay relación, no cuál" no debe formar una jerarquía. */
function isIsaEdge(e: CodeGraphEdge, classNodes: ReadonlyMap<string, ClassNode>): boolean {
  return (
    (e.kind === "extends" || e.kind === "implements") &&
    e.provenance !== "ambiguous" &&
    e.from !== e.to &&
    classNodes.has(e.from) &&
    classNodes.has(e.to)
  );
}

interface IsaAdjacency {
  /** supertipo -> conjunto de subtipos directos. */
  readonly children: ReadonlyMap<string, ReadonlySet<string>>;
  /** subtipo -> conjunto de supertipos directos. */
  readonly parents: ReadonlyMap<string, ReadonlySet<string>>;
}

function buildIsaAdjacency(graph: CodeGraph, classNodes: ReadonlyMap<string, ClassNode>): IsaAdjacency {
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!isIsaEdge(e, classNodes)) continue;
    if (!children.has(e.to)) children.set(e.to, new Set());
    children.get(e.to)!.add(e.from);
    if (!parents.has(e.from)) parents.set(e.from, new Set());
    parents.get(e.from)!.add(e.to);
  }
  return { children, parents };
}

/** Componentes conexas (no dirigidas) del grafo `extends`/`implements` — participantes únicamente, nunca clases aisladas sin ninguna arista. */
function connectedComponents(adj: IsaAdjacency): string[][] {
  const participants = new Set<string>([...adj.children.keys(), ...adj.parents.keys()]);
  for (const set of adj.children.values()) for (const id of set) participants.add(id);
  for (const set of adj.parents.values()) for (const id of set) participants.add(id);

  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of participants) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    const comp: string[] = [];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      comp.push(cur);
      const neighbors = new Set<string>([...(adj.children.get(cur) ?? []), ...(adj.parents.get(cur) ?? [])]);
      for (const nb of neighbors) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    comps.push(comp.sort());
  }
  return comps;
}

interface HierarchyShape {
  readonly size: number;
  readonly rootCount: number;
  /** Secuencia ORDENADA de cantidad-de-hijos-directos por nodo — la aproximación declarada a isomorfismo de árbol. */
  readonly signature: string;
  readonly roots: readonly string[];
}

function shapeOf(comp: readonly string[], adj: IsaAdjacency): HierarchyShape {
  const roots = comp.filter((id) => (adj.parents.get(id)?.size ?? 0) === 0);
  const degrees = comp.map((id) => adj.children.get(id)?.size ?? 0).sort((a, b) => a - b);
  return {
    size: comp.length,
    rootCount: roots.length,
    signature: `${comp.length}|${roots.length}|${degrees.join(",")}`,
    roots: roots.sort(),
  };
}

function fileNameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Conjunto ORDENADO de `symbolPath` (clase base + subtipos, punto-separado) de una
 *  componente — la identidad de una familia por SÍMBOLO, no por forma. Ver "RAÍZ
 *  MEDIDA — SE EMPAREJABA CONSIGO MISMO" en el docstring del módulo. */
function memberSignature(comp: readonly string[], classNodes: ReadonlyMap<string, ClassNode>): string {
  return comp
    .map((id) => classNodes.get(id)!.symbolPath.join("."))
    .sort()
    .join("|");
}

/**
 * Colapsa, DENTRO de un mismo grupo de forma idéntica, las componentes que ADEMÁS
 * comparten el mismo CONJUNTO de nombres de símbolo de sus miembros — ver "RAÍZ
 * MEDIDA — SE EMPAREJABA CONSIGO MISMO" en el docstring del módulo: misma forma +
 * mismos símbolos no es "dos familias independientes que coinciden en forma", es LA
 * MISMA familia copiada palabra por palabra en un árbol de fuente espejado.
 * Determinístico (se queda con la componente cuyo archivo raíz ordena primero
 * alfabéticamente) — cuál de las dos copias sobrevive no importa, sólo que sea
 * siempre la misma para no introducir no-determinismo en el orden de `Map`.
 */
function dedupeMirroredComponents(list: readonly string[][], classNodes: ReadonlyMap<string, ClassNode>): string[][] {
  const bestByMembers = new Map<string, string[]>();
  for (const comp of list) {
    const key = memberSignature(comp, classNodes);
    const prev = bestByMembers.get(key);
    if (!prev) {
      bestByMembers.set(key, comp);
      continue;
    }
    const prevFile = classNodes.get(prev[0]!)!.file;
    const compFile = classNodes.get(comp[0]!)!.file;
    if (compFile < prevFile) bestByMembers.set(key, comp);
  }
  return [...bestByMembers.values()];
}

/** Conjunto de archivos DISTINTOS tocados por cualquier miembro de la componente. */
function filesOf(comp: readonly string[], classNodes: ReadonlyMap<string, ClassNode>): ReadonlySet<string> {
  return new Set(comp.map((id) => classNodes.get(id)!.file));
}

/**
 * SEGUNDA CAUSA MEDIDA (Ola P, frente P7) — ver "SEGUNDA CAUSA MEDIDA" en el
 * docstring del módulo. Colapsa, DENTRO de un mismo grupo de forma idéntica,
 * las componentes que comparten AL MENOS UN ARCHIVO con otra componente del
 * MISMO grupo — dos "familias" que ni siquiera son unidades de compilación
 * separadas no son "dos jerarquías escaladas por el repo que alguien tiene
 * que sincronizar a mano": son estructura interna de un mismo archivo (dos
 * clases anidadas sin relación, coincidiendo en forma). `dedupeMirroredComponents`
 * ya cubre el caso en que ADEMÁS comparten símbolos (mismo árbol espejado);
 * éste cubre el caso en que NO comparten símbolos pero sí el archivo —
 * exactamente "el mismo archivo dos veces" que seguía viéndose después de
 * aquel arreglo (`AbstractMapBasedMultimap.java` listado dos veces con dos
 * clases anidadas DISTINTAS, `KeySet`/`WrappedCollection`, cada una
 * coincidiendo en forma con la otra). Unión por archivo compartido
 * (transitiva: si A comparte archivo con B y B con C, las tres colapsan
 * juntas), determinístico igual que `dedupeMirroredComponents` (gana la de
 * archivo raíz menor alfabéticamente).
 */
function dedupeSameFileComponents(list: readonly string[][], classNodes: ReadonlyMap<string, ClassNode>): string[][] {
  if (list.length <= 1) return [...list];
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const fileSets = list.map((comp) => filesOf(comp, classNodes));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      let shares = false;
      for (const f of fileSets[i]!) if (fileSets[j]!.has(f)) { shares = true; break; }
      if (shares) union(i, j);
    }
  }
  const bestByCluster = new Map<number, string[]>();
  for (let i = 0; i < list.length; i++) {
    const root = find(i);
    const comp = list[i]!;
    const prev = bestByCluster.get(root);
    if (!prev) {
      bestByCluster.set(root, comp);
      continue;
    }
    const prevFile = classNodes.get(prev[0]!)!.file;
    const compFile = classNodes.get(comp[0]!)!.file;
    if (compFile < prevFile) bestByCluster.set(root, comp);
  }
  return [...bestByCluster.values()];
}

/** ¿Alguna arista `references`/`instantiates` cruza entre un archivo de `filesA` y uno de `filesB`?
 *  Ver "CON QUÉ SE CONFUNDE". Excluye `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por
 *  defecto, sin excepción para el sentido "generoso" de esta lectura — no sabemos a qué apunta,
 *  así que tampoco es evidencia válida de composición). */
function hasCompositionLink(graph: CodeGraph, filesA: ReadonlySet<string>, filesB: ReadonlySet<string>): boolean {
  const fileOf = new Map<string, string>();
  for (const n of graph.nodes) fileOf.set(n.id, n.file);
  for (const e of graph.edges) {
    if (e.kind !== "references" && e.kind !== "instantiates") continue;
    if (e.provenance === "ambiguous") continue;
    const fFrom = fileOf.get(e.from);
    const fTo = fileOf.get(e.to);
    if (fFrom === undefined || fTo === undefined || fFrom === fTo) continue;
    if ((filesA.has(fFrom) && filesB.has(fTo)) || (filesA.has(fTo) && filesB.has(fFrom))) return true;
  }
  return false;
}

/** Único lugar que arma los `RawFinding[]` — separado de `detector.run` para poder testear sin `RunContext`, mismo patrón que los 3 detectores hermanos. */

/** Parte un identificador por `_`, `-` y frontera de mayúscula. Sin ninguna
 *  palabra cableada: sólo las dos convenciones de escritura que las 7
 *  gramáticas comparten. Tokens de una sola letra se descartan (`T`, `K`, `V`
 *  de un genérico no discriminan nada). */
function nameTokens(name: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const chunk of name.split(/[^A-Za-z0-9]+/)) {
    if (!chunk) continue;
    const spaced = chunk.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
    for (const token of spaced.split(" ")) {
      const low = token.toLowerCase();
      if (low.length >= 2) out.add(low);
    }
  }
  return out;
}

/** Discriminador de cada miembro: sus tokens MENOS los que comparte con TODOS
 *  los demás miembros de su propia familia (el prefijo/sufijo de la familia). */
function memberDiscriminators(comp: readonly string[], classNodes: ReadonlyMap<string, ClassNode>): ReadonlySet<string>[] {
  const perMember = comp.map((id) => {
    const node = classNodes.get(id)!;
    return nameTokens(node.symbolPath[node.symbolPath.length - 1] ?? "");
  });
  let shared: Set<string> | null = null;
  for (const set of perMember) {
    if (shared === null) shared = new Set(set);
    else for (const token of [...shared]) if (!set.has(token)) shared.delete(token);
  }
  const common = shared ?? new Set<string>();
  return perMember.map((set) => new Set([...set].filter((token) => !common.has(token))));
}

/**
 * ¿Los subtipos de las dos familias se ESPEJAN por nombre? Ver "RAÍZ MEDIDA
 * (Ola AW, frente AW5)" en el docstring del módulo. Emparejamiento INYECTIVO
 * (cada miembro de B se consume a lo sumo una vez) sobre "comparten al menos
 * un token discriminador".
 *
 * DELIBERADAMENTE `>= 2` parejas Y `>= tamaño - 1`: una sola coincidencia de
 * token entre dos familias de 3 es ruido (dos clases cualesquiera pueden
 * compartir la palabra `base`); que se espejen CASI TODOS los miembros es la
 * firma del mantenimiento a mano que Fowler describe. El `- 1` deja pasar la
 * raíz, que casi nunca lleva discriminador (`PayCalculator` no es
 * `EnginerPayCalculator`).
 */
function mirrorsByName(
  compA: readonly string[],
  compB: readonly string[],
  classNodes: ReadonlyMap<string, ClassNode>,
): boolean {
  const discA = memberDiscriminators(compA, classNodes).filter((set) => set.size > 0);
  const discB = memberDiscriminators(compB, classNodes).filter((set) => set.size > 0);
  const consumed = new Set<number>();
  let pairs = 0;
  for (const a of discA) {
    for (let j = 0; j < discB.length; j++) {
      if (consumed.has(j)) continue;
      let shares = false;
      for (const token of a) if (discB[j]!.has(token)) { shares = true; break; }
      if (shares) { consumed.add(j); pairs++; break; }
    }
  }
  return pairs >= 2 && pairs >= Math.min(compA.length, compB.length) - 1;
}

export function buildParallelHierarchiesFindings(
  repo: RepoUnit,
  graph: CodeGraph,
  minHierarchySize: Threshold,
  minGroupSize: Threshold,
): RawFinding[] {
  const classNodes = classNodesOf(graph);
  if (classNodes.size === 0) return [];

  const adj = buildIsaAdjacency(graph, classNodes);
  const comps = connectedComponents(adj).filter((c) => c.length >= minHierarchySize.value);
  // `minGroupSize.value` es 1 (`presencia()`, R3): `<= 1` descarta "0 o 1 familia", `> 1` (más abajo) es exactamente "2 o más".
  if (comps.length <= minGroupSize.value) return [];

  const bySignature = new Map<string, string[][]>();
  for (const comp of comps) {
    const sig = shapeOf(comp, adj).signature;
    const list = bySignature.get(sig);
    if (list) list.push(comp);
    else bySignature.set(sig, [comp]);
  }
  // Ver "RAÍZ MEDIDA — SE EMPAREJABA CONSIGO MISMO": dos componentes con la misma
  // forma Y los mismos símbolos son un árbol de fuente espejado, no dos familias
  // independientes — se colapsan ANTES de decidir si el grupo sigue teniendo ≥2
  // familias reales. Ver "SEGUNDA CAUSA MEDIDA": lo mismo para dos componentes que
  // ni comparten símbolos pero SÍ archivo (dos clases anidadas sin relación,
  // coincidencia de forma dentro de un mismo archivo) — se colapsan también, en el
  // mismo paso, antes de contar cuántas familias reales quedan.
  for (const [sig, list] of bySignature) {
    bySignature.set(sig, dedupeSameFileComponents(dedupeMirroredComponents(list, classNodes), classNodes));
  }

  const findings: RawFinding[] = [];

  const groups = [...bySignature.entries()]
    .filter(([, list]) => list.length > minGroupSize.value)
    // SEGUNDA CAUSA MEDIDA (Ola P, frente P7) — ver el docstring del módulo.
    // Más de 2 componentes compartiendo la MISMA firma no es evidencia de
    // "un par de jerarquías mantenidas en paralelo": medido sobre guava (grafo
    // de hoy, 173 componentes >= minHierarchySize), 7 de las 11 firmas que se
    // repiten lo hacen en grupos de 3 a 23 componentes tomadas de dominios
    // TOTALMENTE ajenos entre sí (p.ej. la firma "root + 2 hojas" empareja
    // `Optional`, `CacheLoader`, `Funnel`, `ToDoubleRounder`, `Invokable`,
    // `TimeLimiter`… 23 veces) — es el idioma más común de Java/OO ("una
    // clase con varias implementaciones anidadas"), no una pareja diseñada a
    // propósito. La propia guía de refactor de este hallazgo ("Move Method /
    // Move Field… hasta que UNA DE LAS DOS deje de necesitar…") ya asume una
    // PAREJA, nunca un grupo de N — este filtro alinea el criterio con lo que
    // el propio detector aconseja. Riesgo aceptado y declarado: una pareja
    // GENUINA en una firma pequeña y común sigue sin poder distinguirse de una
    // coincidencia — ver "SIMPLIFICACIONES DECLARADAS" arriba, ahora medido
    // (no sólo pares grandes chocan: `_WindowsConsoleRawIOBase`/`Parameter`
    // de click, tamaño 3, es un par y sigue siendo falso).
    .filter(([, list]) => list.length === 2)
    // OLA AW (AW5) — COMPUERTA DE CORRESPONDENCIA DE NOMBRES. Ver "RAÍZ MEDIDA
    // (Ola AW, frente AW5)" en el docstring del módulo: la firma de grados sola
    // midió 0 de 14. Sustractiva: sólo retira los pares cuya única evidencia
    // era coincidir en la forma.
    .filter(([, list]) => mirrorsByName(list[0]!, list[1]!, classNodes))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  for (const [, group] of groups) {
    const shape = shapeOf(group[0]!, adj);
    const sortedGroup = group
      .map((comp) => ({ comp, shape: shapeOf(comp, adj) }))
      .sort((a, b) => {
        const fa = a.shape.roots[0] ? classNodes.get(a.shape.roots[0])!.file : "";
        const fb = b.shape.roots[0] ? classNodes.get(b.shape.roots[0])!.file : "";
        return fa < fb ? -1 : fa > fb ? 1 : 0;
      });

    let bridgeLikely = false;
    for (let i = 0; i < sortedGroup.length && !bridgeLikely; i++) {
      const filesA = new Set(sortedGroup[i]!.comp.map((id) => classNodes.get(id)!.file));
      for (let j = i + 1; j < sortedGroup.length && !bridgeLikely; j++) {
        const filesB = new Set(sortedGroup[j]!.comp.map((id) => classNodes.get(id)!.file));
        if (hasCompositionLink(graph, filesA, filesB)) bridgeLikely = true;
      }
    }

    const roleLocations: RoleLocation[] = sortedGroup.map(({ comp, shape: s }, i) => {
      const rootId = s.roots[0] ?? comp[0]!;
      const root = classNodes.get(rootId)!;
      return {
        file: root.file,
        startLine: root.startLine,
        endLine: root.endLine,
        symbol: root.symbolPath[root.symbolPath.length - 1],
        role: `familia ${i + 1} de ${sortedGroup.length} (${s.size} miembros, ${s.rootCount} raíz${s.rootCount === 1 ? "" : "es"})`,
      };
    });
    const [firstLocation, ...restLocations] = roleLocations;
    if (!firstLocation) continue; // inalcanzable: sortedGroup.length > minGroupSize.value (1) >= 1

    // Ver "Además, `exampleNames`..." en el docstring del módulo: si el nombre PELADO
    // de dos ejemplos colisiona (dos archivos distintos con el mismo nombre base en
    // carpetas distintas), mostrar la ruta completa de los tres en vez del nombre
    // pelado — nunca mostrar el mismo texto dos veces para dos archivos DISTINTOS.
    const exampleFiles = sortedGroup.slice(0, 3).map(({ comp }) => classNodes.get(comp[0]!)!.file);
    const exampleBasenames = exampleFiles.map(fileNameOf);
    const basenamesCollide = new Set(exampleBasenames).size < exampleBasenames.length;
    const exampleNames = (basenamesCollide ? exampleFiles : exampleBasenames).join(", ");

    const severityBase = 35 + Math.min(30, (sortedGroup.length - 2) * 10) + Math.min(20, shape.size * 3);
    const severity = Math.max(15, Math.min(100, bridgeLikely ? severityBase - 25 : severityBase));

    findings.push({
      title: `${sortedGroup.length} jerarquías con la misma forma (${shape.size} miembros cada una) y sin ancestro común`,
      detail:
        `Estas familias de tipos (por ejemplo: ${exampleNames}) tienen el mismo tamaño, la misma cantidad de raíces ` +
        "y el mismo patrón de ramificación, pero ninguna arista de herencia o de implementación de interfaz las conecta " +
        "entre sí: quien agrega un miembro a una probablemente tiene que agregar el miembro espejo en la otra a mano, " +
        "y nada en el lenguaje lo va a exigir ni a avisar si se olvida." +
        (bridgeLikely
          ? " Se encontró al menos una referencia cruzada entre archivos de estas familias, compatible con una " +
            "implementación a propósito del patrón Bridge (una jerarquía de abstracción compuesta con una jerarquía " +
            "de implementación, cada una libre de variar): verificar que exista una composición real antes de asumir " +
            "que es mantenimiento manual duplicado — severidad reducida en consecuencia."
          : " No se encontró ninguna referencia cruzada entre archivos de estas familias, lo que hace menos probable " +
            "que sea una composición a propósito (Bridge) y más probable que sea duplicación de mantenimiento — pero " +
            "esta señal por sí sola no lo demuestra: revisar el código antes de unificar."),
      trigger: [{ label: "jerarquías con la misma forma", value: sortedGroup.length, threshold: minGroupSize }],
      evidence: [
        { label: "miembros por jerarquía", value: shape.size },
        { label: "raíces por jerarquía", value: shape.rootCount },
      ],
      locations: [firstLocation, ...restLocations],
      severity,
      advice: {
        primary: {
          name: "Move Method / Move Field",
          kind: "refactorizacion",
          why:
            "Mover miembros de una jerarquía a la otra (o hacer que una referencie a la otra en vez de espejarla) " +
            "hasta que una de las dos deje de necesitar una subclase propia por cada elemento es el camino mecánico " +
            "que Fowler describe para colapsar jerarquías paralelas — pero primero hay que confirmar que no sea un " +
            "Bridge bien aplicado (ver el detalle de este hallazgo).",
          source: "https://refactoring.guru/es/smells/parallel-inheritance-hierarchies",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "parallel-hierarchies"> = {
  id: "parallel-hierarchies",
  kind: "parallel-hierarchies",
  scope: "inter-file",
  needsGraph: true,
  title: "Jerarquías paralelas",
  // Ver docstring del módulo: mismo criterio que `dependency-cycle`/`orphan-file`/
  // `unused-symbol` (los 3 detectores `inter-file` de referencia): ninguno declara
  // una capacidad de lenguaje porque la señal es puramente de FORMA del grafo, no
  // de gramática. Un repo sin ninguna unidad tipo-clase (`classNodesOf` vacío)
  // simplemente no tiene candidatos — mismo tipo de límite ya declarado para Go.
  needs: [],
  // CORREGIDO EN LA OLA 11b (frente B0) — esto vivía mal declarado como
  // `needsEdges` (conjunción) desde la Ola A3. `isIsaEdge` es un vocabulario
  // CERRADO — sólo `extends`/`implements` cuentan como relación "es-un" (ver
  // "SIMPLIFICACIONES DECLARADAS" arriba: `mixes-in`/`instantiates`/
  // `satisfies` quedan afuera a propósito) — pero `buildIsaAdjacency` los usa
  // como UNIÓN (`isIsaEdge` acepta `e.kind === "extends" || e.kind ===
  // "implements"`, sin exigir que los dos coexistan): una componente conexa
  // puede formarse enteramente con `extends` (Rails: 152 aristas, sin una
  // sola `implements` — Ruby no tiene esa construcción) o enteramente con
  // `implements`. Los dos juegan el MISMO ROL ("arista es-un" para agrupar
  // familias), así que con que UNO SOLO esté presente ya hay candidatos
  // reales — es alternativa, no conjunción. `references`/`instantiates` del
  // cross-check de Bridge siguen sin declararse (sólo AJUSTAN confianza,
  // nunca gatillan). Ver `types.ts#InterFileDetector.needsAnyEdge`, "CÓMO NO
  // VOLVER A CONFUNDIRLO". (Sobre el Rails medido, esto NO cambia el
  // resultado — sigue dando 0 incluso con el gate neutralizado del todo, una
  // incógnita abierta de otro frente, no de éste; ver ORDEN-DE-ATAQUE.md.)
  needsAnyEdge: ["extends", "implements"],
  thresholds: {
    minHierarchySize: MIN_HIERARCHY_SIZE_SPEC,
    minGroupSize: MIN_GROUP_SIZE_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — este `return []` nunca debería ejecutarse en
    // producción, pero `CodeGraph | null` sigue siendo el tipo declarado.
    if (!graph) return [];
    return buildParallelHierarchiesFindings(repo, graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
  },
};
