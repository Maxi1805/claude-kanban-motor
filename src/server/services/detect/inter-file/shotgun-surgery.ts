/**
 * `shotgun-surgery` — cirugía con escopeta: un concepto desparramado en
 * muchas unidades, de modo que un cambio obliga a tocar muchos archivos.
 *
 * DEFINICIÓN, con fuente: Fowler & Beck acuñan el nombre y la definición en
 * "Refactoring: Improving the Design of Existing Code" (Addison-Wesley,
 * 1999), capítulo 3 "Bad Smells in Code": "cada vez que hacés un tipo de
 * cambio, tenés que hacer muchos cambios pequeños en muchas clases
 * diferentes" — la firma opuesta a Divergent Change (una clase que cambia
 * por muchas razones distintas). Lanza & Marinescu, "Object-Oriented Metrics
 * in Practice" (Springer, 2006) §7.3.4, la OPERACIONALIZAN a nivel de
 * método con dos números: CM ("Changing Methods", cuántos métodos DISTINTOS
 * llaman al método estudiado) y CC ("Changing Classes", en cuántas clases
 * DISTINTAS residen esos llamadores), con la estrategia "CM > FEW **and**
 * CC > FEW" — el AND es la parte no negociable: un método muy llamado
 * dentro de UNA sola clase (alta CM, CC=1) es cohesión normal, no shotgun
 * surgery.
 *
 * RELACIÓN (sin jerga de AST), y por qué este archivo NO cita un número de
 * Lanza & Marinescu para CM/CC: el libro define la ESTRATEGIA de detección
 * (dos umbrales relacionados por AND) pero el valor concreto de "FEW" en su
 * herramienta (iPlasma/inFusion) no se pudo verificar con precisión aquí —
 * citar un número que no se pudo confirmar sería inventar una cita (regla
 * del brief). Los dos umbrales de este detector son por eso `pisoDeclarado`,
 * no `citado`: el NÚMERO es una elección razonada propia, la FORMA (dos
 * umbrales, AND, no OR) sí es la de la fuente.
 *
 * Traducción de CM/CC a este grafo (`RepoUnit.graph`, aristas `references`):
 * para un símbolo T `function-like` (método o función — ver "SIMPLIFICACIONES
 * DECLARADAS"), CM(T) = cantidad de símbolos ORIGEN distintos con una arista
 * `references` hacia T; CC(T) = cantidad de ARCHIVOS distintos entre esos
 * orígenes, EXCLUYENDO el propio archivo de T (una llamada intra-archivo no
 * obliga a tocar otro archivo — no es la firma que este smell describe).
 * Dispara sólo si CM >= minCallers **y** CC >= minFiles, igual criterio AND
 * que la fuente.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el criterio es un conteo de aristas
 * `references` agrupadas por (símbolo destino) y (archivo del símbolo
 * origen) — cero vocabulario de dominio, ningún nombre de nodo de gramática.
 *
 * *** CON QUÉ SE CONFUNDE — LA OBSERVACIÓN MÁS VALIOSA DE ESTE DETECTOR ***
 * El USO NORMAL DE UNA UTILIDAD COMPARTIDA BIEN DISEÑADA produce EXACTAMENTE
 * la misma firma estructural: una función de logging, un helper de
 * formateo, un validador común — cualquier abstracción reutilizable exitosa
 * tiene, por diseño, muchos llamadores en muchos archivos distintos (CM y CC
 * altos los dos). Ese es el caso SANO que Lanza & Marinescu no separan del
 * smell con un tercer número: ninguno existe en este grafo (sin historia de
 * git, sin saber si esos N archivos cambian JUNTOS cuando cambia T, o si T
 * es estable y son ellos los que cambian por separado). La diferencia real
 * entre "concepto mal ubicado que arrastra N archivos cada vez que cambia" y
 * "utilidad compartida que N archivos consumen sin que eso implique nada
 * sobre CÓMO cambia" es de INTENCIÓN y de HISTORIA DE CAMBIOS, ninguna de
 * las dos observable desde `CodeGraph`. Por eso el `detail` de cada hallazgo
 * lo dice explícitamente y el catálogo lo trata como HIPÓTESIS, nunca como
 * afirmación: alto CM+CC es condición NECESARIA de shotgun surgery pero no
 * suficiente, y la propia definición de Fowler ("cada cambio de CONCEPTO
 * toca muchos archivos") no es verificable sin ver un cambio real.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Sólo símbolos `family: "function-like"` (funciones y métodos) — el caso
 *    que Fowler/Lanza & Marinescu definen. `class-like` queda afuera a
 *    propósito: una clase muy instanciada/extendida por muchos archivos es
 *    una firma distinta (más cercana a acoplamiento arquitectónico que a
 *    "un cambio de concepto obliga a tocar muchos lugares"), y mezclarla
 *    aquí diluiría el criterio AND de la fuente.
 *  - Un hallazgo por SÍMBOLO destino, no un agregado por "concepto" (no hay
 *    forma estructural de saber si dos símbolos distintos son el "mismo
 *    concepto" sin nombres/semántica — sería la lista de vocabulario que la
 *    regla 4 prohíbe). Si el mismo concepto real está partido en 3 símbolos
 *    hermanos, este detector emite 3 hallazgos independientes, no 1.
 *  - Hermanos homónimos (`@2`, `@3`, id con sufijo — ver `unused-symbol.ts`)
 *    excluidos como CANDIDATOS (mismo criterio: nunca son destino real de
 *    una arista `references`, que siempre apunta al id canónico).
 *  - Auto-referencia (`edge.from === edge.to`, recursión directa) no cuenta
 *    como llamador: no aporta ni CM ni CC.
 *
 * *** PROVENANCE — POR QUÉ SE EXCLUYE `inferred`, Y OJO CON JAVA/guava ***
 * CONTRATO-F5.md §4.4 fija la regla: si una arista `inferred` es evidencia
 * POSITIVA de acoplamiento (como acá — cada arista es un "esto depende de
 * aquello"), lo conservador es EXCLUIRLA, mismo criterio que ya elige el
 * detector hermano `dependency-cycle.ts` para el mismo tipo de riesgo. Este
 * detector cuenta sólo `references` con provenance `declared`/`resolved`.
 * `RunContext`/`InterFileDetector` de HOY (P3 de CONTRATO-F5 no aterrizó
 * todavía — ver "LÍMITE DE PROCESO" abajo) no exponen `trustedEdge`/
 * `provenanceMix`, así que el filtro se aplica a mano, igual patrón que
 * `dependency-cycle.ts#isConfidentDependencyEdge`.
 * CONSECUENCIA MEDIDA para Java/guava: la etapa heurística `path-proximity`
 * (`provenance: "inferred"`) domina el 81% de las aristas `references`
 * ACEPTADAS en guava (Ola 3) — RE-MEDIDO por el frente "lenguaje cableado a
 * mano" (agosto 2026) con el grafo de Ola K (`imports` de Java 15→5.632 en
 * el medio, que aparentemente ayuda a la cascada de `references` a resolver
 * por regla en vez de caer a `path-proximity` con más frecuencia que antes):
 * bajó a **51,7%** (28.417 `inferred` de 54.932 aristas `references`
 * aceptadas — `scratchpad/lang-hardcode-frente/measure-refs-provenance.mts
 * corpus/guava java`), pero SIGUE siendo mayoría, y SIGUE siendo específico
 * de Java: el mismo script sobre `corpus/click` (Python) da apenas 1,0% (9
 * de 865) — la asimetría entre lenguajes que este párrafo describe sigue
 * vigente, mejoró pero no desapareció, así que excluir `inferred` sigue
 * haciendo que este detector sea sistemáticamente MENOS SENSIBLE en Java
 * que en un lenguaje donde la cascada resuelve mayormente por reglas
 * estructurales — un CM/CC real puede quedar por debajo del umbral
 * simplemente porque sus aristas verdaderas nunca llegaron a
 * `declared`/`resolved`. Es una pérdida de RECALL a propósito (falso
 * negativo posible), nunca una ganancia de PRECISIÓN inventada: lo
 * conservador acá es no afirmar acoplamiento sobre una resolución
 * heurística sin dataset etiquetado que la valide.
 *
 * LA FRASE ADICIONAL EN `detail` PARA JAVA (`isJava`, más abajo) SE
 * MANTUVO — mismo frente y misma revisión de arriba: a diferencia de la
 * severidad de `orphan-file.ts` (retirada, ver su docstring), acá el texto
 * es puramente informativo — nunca cambia `severity`, `trigger` ni qué
 * símbolos se reportan, así que no hay "número" que pueda empeorar o
 * mejorar al sacarla (medido: el `score` de ranking no la lee). Se
 * mantiene porque el hecho que describe SIGUE siendo cierto (párrafo de
 * arriba, re-medido) y porque la muestra juzgada a mano de este kind
 * (`tests/golden/precision/*.verdicts.csv`, 16/16 falsos en 6 lenguajes)
 * no tiene NINGÚN caso de Java/C# — no hay evidencia, en ninguna
 * dirección, de que este texto ayude o estorbe a un lector; su costo de
 * mantenerlo es cero (no gatea nada) y su costo de sacarlo sería perder
 * una explicación real y todavía vigente.
 *
 * LÍMITE DE PROCESO, declarado (regla 6): CONTRATO-F5.md §4.2/§4.3 diseña
 * `RepoUnit.metrics`/`GraphMetrics`/`metricValues` y los campos
 * `needsEdges`/`needsMetrics` de `InterFileDetector` para que un detector
 * declare qué aristas necesita y reciba `sin-aristas`/`sin-metricas` del
 * runner en vez de "cero hallazgos". Verificado antes de escribir este
 * archivo: ninguno de los dos existe todavía en `detect/types.ts`/
 * `detect/run.ts` (el agente "P3" de esa ola no aterrizó en este árbol).
 * Este detector no puede declarar `needsEdges: ["references"]` porque ese
 * campo no existe en `InterFileDetector` hoy — sólo `needsGraph: true`.
 * CONSECUENCIA: un repo cuyo grafo no tenga NINGUNA arista `references` (o
 * ninguna con provenance `declared`/`resolved`) hace que este detector
 * devuelva `[]`, indistinguible de "no hay shotgun surgery" — el mismo hueco
 * que `dependency-cycle.ts` ya declara para "no encontró ciclos" vs "no hay
 * ciclos". No es un defecto propio: es la misma limitación heredada del
 * grafo, declarada acá en vez de escondida.
 *
 * Por la misma razón (P3 no aterrizó), este detector NO importa
 * `graph/metrics/*` en absoluto: no hay ninguna de las 6 métricas
 * registradas (`scc`/`connected-components`/`pagerank`/`instability`/
 * `clustering`/`louvain`) que calcule "cuántos símbolos y archivos distintos
 * referencian a este símbolo" — es un conteo nuevo, de la misma naturaleza
 * que el fan-in que `unused-symbol.ts`/`dependency-cycle.ts` ya calculan de
 * forma independiente sobre `graph.edges` sin recomputar ningún algoritmo
 * (Tarjan, PageRank, Louvain, …) que ya exista ahí — este detector sigue el
 * mismo patrón, no una excepción.
 *
 * *** LA COLISIÓN DE NOMBRES DEL RESOLVEDOR — ESTADO REAL DESPUÉS DE N9
 *     (Ola O). Este bloque describía tres casos como "brecha ajena
 *     confirmada, reportada, no tocada"; dos están CERRADOS en el
 *     resolvedor y el tercero se acotó. Se reescribe en vez de borrarse:
 *     quien lea este archivo tiene que poder saber qué sigue vivo. ***
 *
 * CERRADO (1) — LA DECLARACIÓN LEÍDA COMO USO. `graph/resolve.ts` aceptaba
 * candidatos de rol `decl-name` (el nombre de la propia declaración, o un
 * binding plano) como si fueran referencias, contra lo que ya decían
 * `graph/types.ts` y `graph/references.ts`. Era la fuente del caso que abrió
 * el frente — `constructor` con 387 llamadores en 358 archivos en `nest`,
 * 361 de esas aristas `decl-name`, todas hacia el `constructor` de una clase
 * ANÓNIMA — y también del `run` de `rubocop` (CM=27/CC=26, juzgado falso a
 * mano con el diagnóstico correcto: "colisión de resolución") y de los hubs
 * de `Style`/`Lint`/`Layout` (la reapertura de módulo de Ruby leída como 301
 * referencias al primero). `syntactic-role` ahora lo rechaza.
 *
 * CERRADO (2) — EL MÉTODO CON RECEPTOR EXPLÍCITO, ALCANZABLE POR NOMBRE
 * DESNUDO. El caso `string` de `cobra` que este bloque describía es el mismo
 * que se midió, mucho más grande, en `hugo`: `func (t *Tree) error(err
 * error)` acumulaba CM=1726/CC=330 — el hub falso más grande de todo el
 * corpus — porque `graph/symbols.ts` daba `memberOfClassLike: false` a todo
 * método cuya asociación con su tipo viaja por un campo `receiver` en vez de
 * por anidamiento léxico. Con ese hecho corregido, `class-member` (N1-a) los
 * descarta como a cualquier otro método. La FORMA del bug era la que este
 * bloque nombraba (un nombre que coincide con vocabulario del lenguaje
 * infla su CM/CC), pero la causa no era la falta de una lista de builtins —
 * que además está prohibida: era un hecho faltante en el grafo.
 *
 * ACOTADO (3) — el `stop` de `vueuse` (CM=57/CC=35, con decenas de archivos
 * declarando su propio `const stop = …` local) tenía 25 de sus 56 aristas en
 * rol `decl-name`: esa mitad se fue con (1). Lo que QUEDA vivo, y hay que
 * decirlo, es el caso en que un nombre BINDEADO POR UN IMPORT a un módulo
 * EXTERNO resuelve a un homónimo local del repo — medido en `sqlalchemy`:
 * `Any` (CM=3493), `int` (524), `Tuple` (432), `Sequence` (403) y
 * `annotations` (228 — el `from __future__ import annotations` de 227
 * archivos) resuelven todos a un símbolo homónimo del propio repo. El
 * resolvedor no puede hoy distinguir "el especificador del import no se
 * resolvió porque apunta AFUERA del repo" de "no se resolvió porque el
 * resolvedor de imports no cubre esa convención": `from typing import Any`
 * (afuera) e `import { Type } from '@nestjs/common'` (adentro, alias de
 * monorepo) son indistinguibles desde `graph/references.ts`. Ver
 * `ola-o/informes/N9.md`, sección "PIDO A OTRO FRENTE".
 *
 * UN TERCER MECANISMO — NUEVO, DISTINTO DE (1) Y DE (3), medido por el
 * frente P9 (Ola P), FUERA DE ALCANCE de este archivo (`graph/symbols.ts`,
 * no `graph/build.ts`, así que tampoco es lo que cierra P2). El caso
 * `constructor` de `nest` SIGUE vivo, pero mucho más chico: 387→**26**
 * llamadores, 358→**5** archivos (medido con `scripts/dump-hallazgos.mts`
 * sobre el árbol de hoy, con los cambios de N9 ya adentro). El target sigue
 * siendo `packages/common/utils/merge-with-values.util.ts:9` —
 * `const Type = class extends Metatype { constructor(...args) {
 * super(...args); } }`, una clase ANÓNIMA (nunca `decl-name`, así que (1) no
 * la toca). La causa, verificada leyendo `graph/symbols.ts#extractSymbols`
 * (línea `const container = scopeStack.filter((f): f is … => f.name !==
 * null)…`, no supuesta): un `ScopeFrame` de un contenedor ANÓNIMO (clase o
 * función sin nombre) se empuja al `scopeStack` con `name: null` — correcto
 * para `memberOfClassLike` (N9, "brecha 1"), pero el cálculo de `container`
 * (línea siguiente) FILTRA esos frames `null` antes de armar la lista de
 * nombres calificados. Un `constructor` anidado dentro de una clase anónima
 * que a su vez vive dentro de OTRA función anónima (el caso real: una
 * arrow function que retorna otra arrow function que arma la clase) queda
 * sin NINGÚN ancestro nombrado que aportar, así que su `container` es `[]`
 * y su `symbolPath` es el nombre PELADO `["constructor"]` — indistinguible,
 * para el resolvedor, del `constructor` de cualquier otra clase anónima con
 * la misma forma en cualquier otro archivo. No es el mismo bug que (1)
 * (que rechazaba `decl-name`, un ROL de candidato) ni el mismo que (3) (un
 * especificador de import no resuelto): es un tercer hueco, en la
 * CONSTRUCCIÓN del nombre calificado. PIDO A OTRO FRENTE (dueño de
 * `graph/symbols.ts`): que `container` conserve una marca para un ancestro
 * anónimo real (p.ej. una posición/índice sintético) en vez de saltarlo en
 * silencio, para que dos clases anónimas de dos archivos DISTINTOS nunca
 * terminen con el mismo `symbolPath` pelado.
 */
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";
import type { FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minCallers" | "minFiles";

/** Ver "SIMPLIFICACIONES DECLARADAS": sólo función/método, no clase. */
const CANDIDATE_FAMILIES = new Set(["function-like"]);

/** Hermano homónimo (`@2`, `@3`, …): nunca destino real de una arista `references` — ver `unused-symbol.ts`. */
function isDuplicateSibling(id: string): boolean {
  return /@\d+$/.test(id);
}

function symbolName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? "?";
}

/**
 * CM: Lanza & Marinescu §7.3.4 ("Changing Methods") — cuántos símbolos
 * DISTINTOS llaman a este. No calibrado contra el corpus (los repos del
 * corpus, todos bibliotecas, no dan un caso negativo limpio para separar
 * "varios llamadores" de "muchos llamadores" — mismo problema que
 * `unused-symbol.ts#libraryRatio` documenta): "unos pocos" (2-3) es
 * indistinguible de un helper puntual con dos usos; 6 llamadores distintos
 * ya es "muchas partes del código lo invocan", el rango donde CM/CC empieza
 * a decir algo.
 */
const MIN_CALLERS_SPEC = pisoDeclarado(6, {
  rationale:
    "Lanza & Marinescu fijan la ESTRATEGIA (CM > FEW), no un número verificable acá; 6 llamadores distintos es " +
    "el piso a partir del cual 'varios sitios lo usan' deja de ser indistinguible de un helper con dos o tres " +
    "usos puntuales — declarado a mano, no derivado del corpus (los 8 repos son bibliotecas, sin caso negativo " +
    "limpio con el que calibrar empíricamente, mismo problema que ya documenta `unused-symbol.ts`).",
});

/**
 * CC: Lanza & Marinescu §7.3.4 ("Changing Classes") — en cuántos ARCHIVOS
 * distintos (más allá del propio) residen esos llamadores. El AND con
 * `minCallers` es la parte no negociable de la fuente: sin este segundo
 * umbral, un símbolo con 6 llamadores todos en el MISMO archivo pasaría el
 * filtro y sería cohesión normal, no shotgun surgery.
 */
const MIN_FILES_SPEC = pisoDeclarado(4, {
  rationale:
    "misma razón que `minCallers`: el AND con CC es lo que distingue 'muy usado dentro de una unidad cohesiva' " +
    "de 'un cambio obliga a tocar el resto del repo'; 4 archivos distintos (más allá del propio) es el piso " +
    "declarado, no derivado del corpus por la misma falta de caso negativo limpio.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(60, {
  rationale:
    "un panel legible no lista de forma útil más de unas pocas decenas de símbolos con acoplamiento disperso a " +
    "la vez; es tope de volumen, no umbral de detección.",
});

/** Sólo `references` con provenance de confianza — ver 'PROVENANCE' en el docstring del módulo.
 *  Excluye también `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por defecto — mismo
 *  valor literal que `edgeIsAmbiguous` de `graph/types.ts` compara, repetido acá porque esta firma
 *  es estructural, más laxa que `CodeGraphEdge`, y no calza con el parámetro de esa función). */
function isConfidentReferenceEdge(edge: { kind: string; provenance: string }): boolean {
  return edge.kind === "references" && edge.provenance !== "inferred" && edge.provenance !== "ambiguous";
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * testear sin `RunContext`, mismo patrón que los 3 detectores hermanos.
 */
export function buildShotgunSurgeryFindings(
  files: readonly FileSummary[],
  graph: CodeGraph,
  minCallers: Threshold,
  minFiles: Threshold,
): RawFinding[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const languageByFile = new Map(files.map((f) => [f.path, f.language]));

  // destino -> conjunto de símbolos ORIGEN distintos que lo referencian.
  const callersOf = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!isConfidentReferenceEdge(edge)) continue;
    if (edge.from === edge.to) continue; // auto-referencia/recursión: no aporta CM ni CC
    let set = callersOf.get(edge.to);
    if (!set) {
      set = new Set();
      callersOf.set(edge.to, set);
    }
    set.add(edge.from);
  }

  const findings: RawFinding[] = [];

  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || !node.family || !CANDIDATE_FAMILIES.has(node.family)) continue;
    if (isDuplicateSibling(node.id)) continue;

    const callers = callersOf.get(node.id);
    if (!callers || callers.size === 0) continue;

    const callerFiles = new Set<string>();
    const callerFileList: string[] = [];
    for (const callerId of callers) {
      const callerFile = nodeById.get(callerId)?.file;
      if (callerFile && callerFile !== node.file && !callerFiles.has(callerFile)) {
        callerFiles.add(callerFile);
        callerFileList.push(callerFile);
      }
    }

    const cm = callers.size;
    const cc = callerFiles.size;
    if (cm < minCallers.value || cc < minFiles.value) continue; // AND, no OR — ver docstring

    const name = symbolName(node);
    const startLine = node.startLine ?? 1;
    const endLine = node.endLine ?? startLine;
    const language = languageByFile.get(node.file);
    const isJava = language === "java";

    callerFileList.sort();
    const sampleFiles = callerFileList.slice(0, 5);

    const severity = Math.min(100, 25 + cc * 7 + Math.min(20, cm));

    const detailParts = [
      `"${name}" es invocado desde ${cm} sitios distintos repartidos en ${cc} archivos además del suyo propio ` +
        `(${sampleFiles.join(", ")}${callerFileList.length > sampleFiles.length ? ", …" : ""}); si el concepto ` +
        "que representa cambia, hay evidencia de que el cambio no se queda en un lugar — tocarlo obliga, en " +
        "principio, a revisar cada uno de esos archivos.",
      "HIPÓTESIS, no afirmación: esta misma firma (muchos llamadores, en muchos archivos) es EXACTAMENTE la que " +
        "produce una utilidad compartida bien diseñada y ampliamente reutilizada — no hay forma de distinguir " +
        "las dos cosas sin ver cómo cambió este símbolo en el pasado, algo que este grafo no tiene. Alto CM+CC " +
        "es necesario para shotgun surgery, no suficiente.",
    ];
    if (isJava) {
      detailParts.push(
        "Confianza reducida en este archivo `.java`: sólo se cuentan aristas `references` `declared`/`resolved` " +
          "(se excluyen las heurísticas `inferred`, que dominan la resolución en Java); el CM/CC real puede ser " +
          "mayor que el medido aquí.",
      );
    }

    findings.push({
      title: `"${name}" concentra ${cm} llamadores en ${cc} archivos distintos`,
      detail: detailParts.join(" "),
      trigger: [
        { label: "llamadores distintos (CM)", value: cm, threshold: minCallers },
        { label: "archivos distintos involucrados (CC)", value: cc, threshold: minFiles },
      ],
      locations: [
        {
          file: node.file,
          startLine,
          endLine,
          symbol: name,
          role: "símbolo cuyo cambio dispersa el impacto sobre otros archivos",
        },
      ],
      severity,
      advice: {
        primary: {
          name: "Move Method / Inline Class",
          kind: "refactorizacion",
          why:
            "Si de verdad es un concepto disperso (no una utilidad estable), consolidarlo en una única unidad " +
            "reduce a un lugar el costo de cada cambio futuro; si resulta ser una utilidad compartida legítima, " +
            "esta firma sólo confirma que está bien reutilizada y no requiere acción.",
          source: "https://refactoring.guru/es/smells/shotgun-surgery",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "shotgun-surgery"> = {
  id: "shotgun-surgery",
  kind: "shotgun-surgery",
  scope: "inter-file",
  needsGraph: true,
  title: "Cirugía con escopeta",
  needs: [],
  /**
   * OLA 11b, frente B1 — LAS CELDAS MUDAS. Esto es LO QUE EL DOCSTRING DE
   * ESTE MÓDULO PIDE, textual: "Este detector no puede declarar
   * `needsEdges: ["references"]` porque ese campo no existe en
   * `InterFileDetector` hoy". Esa justificación quedó VENCIDA: el campo
   * existe en `detect/types.ts` y `run.ts#runInterFile` lo implementa
   * (reporta `sin-aristas` con los kinds faltantes, sin llamar a `run()`).
   * Verificado antes de escribir esta línea, no deducido.
   *
   * EFECTO MEDIDO SOBRE FIXTURES: NINGUNO — `tests/fixtures/patterns` tiene
   * 214 aristas `references` y la compuerta no dispara. Cierra el hueco que
   * el propio docstring declara ("indistinguible de 'no hay shotgun
   * surgery'"), no un síntoma observado hoy.
   */
  needsEdges: ["references"],
  thresholds: {
    minCallers: MIN_CALLERS_SPEC,
    minFiles: MIN_FILES_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // antes de llamar a `run()` — ver el mismo comentario en `orphan-file.ts`.
    if (!graph) return [];
    return buildShotgunSurgeryFindings(repo.files, graph, ctx.threshold("minCallers"), ctx.threshold("minFiles"));
  },
};
