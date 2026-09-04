/**
 * `abstract-factory` — migración de `detectAbstractFactoryOpportunities`
 * (`pattern-structural.ts:722`) al motor de hipótesis (CONTRATO-F6.md,
 * Contrato 1/3). Tarea de una sola regla: NADA de `registry.ts` fuera de
 * las dos líneas propias, NADA de `engine.ts`/`types.ts`/`run.ts`.
 *
 * OLA "required no permisivo" — tres ramas de `required` (`noMirrorTree
 * Duplicate`/`crossFamilyRelation`/`noSharedAncestor`) daban `holds: true`
 * cuando faltaba grafo o no se podían reubicar las raíces de familia,
 * citando "no se re-verifica"/"se confía en la garantía estructural" — un
 * excluder no verificado no está demostrado, así que se invirtieron a
 * `holds: false`. Las tres son defensivas en la práctica (`parallel-
 * hierarchies` es `inter-file`, así que `graph` es real en toda llamada de
 * producción hoy, y `canonicalFilesOf` siempre devuelve un elemento por
 * familia) — el cambio no movió ningún número medido en el corpus, pero deja
 * el default correcto para cuando esa garantía deje de sostenerse.
 *
 * ─── El ancla, y por qué es LIMPIA ─────────────────────────────────────
 * `parallel-hierarchies` (`detect/inter-file/parallel-hierarchies.ts`)
 * agrupa componentes DISJUNTAS del grafo `extends`/`implements` que
 * comparten forma (mismo tamaño, misma cantidad de raíces, misma secuencia
 * de ramificación) y NO tienen ningún ancestro común entre sí — que es
 * exactamente lo que la regla vieja exigía a mano: ≥2 unidades con ≥2
 * "huecos de producto" compartidos (`sharedSlots.length >= 2`), tipos
 * concretos DISTINTOS por hueco, y `a.unit.superclass !== b.unit.superclass`
 * (sin superclase compartida). La ausencia de ancestro común ya la
 * garantiza el propio ancla por construcción (dos componentes conexas
 * distintas del grafo de herencia NUNCA comparten una arista que las una);
 * este archivo la re-verifica igual contra el grafo (`noSharedAncestor`)
 * en vez de confiar ciegamente en esa garantía, para que el excluder de
 * "ya unificadas" sea un CHECK con evidencia, no una suposición.
 *
 * ─── LÍMITE DECLARADO Nº1 — "slots" es una lectura estructural, no de
 *     nombre de método ─────────────────────────────────────────────────
 * La regla vieja comparaba NOMBRES de método de fábrica (`factorySlots`,
 * texto de cuerpo) para decidir qué "hueco de producto" comparten dos
 * unidades. Esta migración NO tiene esa vía: `ctx.file`/`ctx.fileAt` son
 * SIEMPRE `null` para un `Finding` `inter-file` (`Finding.language` es
 * siempre `null` para `parallel-hierarchies` — ver `detect/run.ts
 * #runInterFile`, que llama `toFinding(detector, r, "inter-file", null)`
 * incondicionalmente), así que ningún árbol vivo llega a `build()` — es la
 * misma limitación que documenta `hypotheses/run.ts` para TODA la ola.
 * `slotsPerFamily` es el proxy disponible: "miembros por jerarquía" del
 * propio ancla (cuántos tipos concretos tiene cada familia), que mide
 * SOLAPAMIENTO ESTRUCTURAL (mismo tamaño/forma), no identidad de nombre de
 * método. Es una lectura MÁS DÉBIL que la vieja (puede aceptar dos familias
 * del mismo tamaño que no comparten ningún hueco de producto real, sólo
 * coincidencia de forma) — `toConfirm` lo decía explícito, y es exactamente
 * el tipo de brecha que la tarea pide declarar, no esconder detrás de un
 * cero.
 *
 * ACTUALIZADO — P4 (falso positivo cross-fixture, corpus de 101 fixtures):
 * la brecha de arriba dejó de ser sólo declarada. `crossFamilyRelation`
 * (`required`, más abajo) exige al menos una arista real —consumidor
 * externo compartido o referencia directa entre miembros— que conecte las
 * dos familias antes de aceptar la candidata; sin eso, dos familias sin
 * relación real del mismo tamaño (medido: `GUIFactory` de
 * `abstract_factory/javascript.js` con `DataMiner` de
 * `template_method/javascript.js`, CERO aristas entre los dos archivos) ya
 * NO pasan. Sigue siendo una lectura estructural, no de nombre de método
 * (ver el propio check) — lo que cambió es que ahora hace falta ALGO más
 * que la coincidencia de forma para siquiera llegar a `toConfirm`.
 *
 * ─── LÍMITE DECLARADO Nº2 — Go queda fuera ENTERO, no silenciado ───────
 * La regla vieja necesitaba `derivedFromReceiver` (dos unidades sintéticas
 * agrupadas por receptor de método, `pattern-structural.ts:151`) para NO
 * confundir el tipado estructural de Go con una oportunidad — confirmado
 * contra la fixture `go.go` donde, sin esa exclusión, un Abstract Factory
 * bien aplicado marcaba falso positivo. Esta migración no reproduce esa
 * lógica porque no hace falta: `classNodesOf` (el productor de nodos
 * `family: "class-like"` que alimenta el grafo) deriva VACÍO para Go
 * (`code-grammar.ts`, `type_spec` no expone `body`; ya documentado en
 * `parallel-hierarchies.ts`: "Go: `classNodes` sale vacío... este detector
 * no encuentra familias en Go"). Sin nodos clase-tipo, el ancla NUNCA emite
 * una familia en Go, así que esta hipótesis nunca ve Go — no por un
 * excluder que decida "ya aplicado", sino porque el ancla mismo es mudo ahí.
 * Es una BRECHA (Go pierde cualquier Abstract Factory real escrito con
 * `struct`+`interface`), no una exclusión con evidencia — declarada, no
 * escondida. `needs: ["unidad-tipo-clase"]` documenta la misma idea del
 * lado de las capacidades: ausente ⇒ `missingCapabilities`, no-aplicable
 * con razón.
 *
 * ─── EL EXCLUDER DE "YA APLICADO" — con grafo, nunca con AST ───────────
 * Con las raíces de cada familia ubicadas en el grafo, se busca un nodo
 * cliente que referencie/instancie DIRECTAMENTE una raíz de CADA familia
 * (`references`/`instantiates`, sólo procedencia `declared`/`resolved` —
 * NUNCA `inferred`: `parallel-hierarchies.ts` ya documenta que la cascada
 * heurística de `path-proximity` domina el 81% de lo aceptado en guava, así
 * que confiarle a una arista adivinada la decisión de SILENCIAR una
 * oportunidad sería el peor lugar para ese ruido).
 *
 * ─── OLA 10 (CONTRATO-F10.md) — LAS TRES FORMAS, no dos ─────────────────
 * Antes de esta ola, "un coordinador referencia/instancia TODAS las
 * familias" bastaba para `ya-aplicado`. Eso describe un SITIO que conoce
 * todas las variantes (una función `createFactory(os)` con un `if/else`,
 * por ejemplo) — no describe el patrón GoF: no hay ningún tipo `F` que las
 * fábricas concretas implementen, y por lo tanto ningún cliente que dependa
 * SÓLO de `F` sin conocer los tipos concretos. Confundir esas dos cosas era
 * el falso positivo que el usuario ya rechazó dos veces: "ya-aplicado"
 * tiene que ser información positiva verificada, no un sinónimo de
 * "alguien parece coordinar esto".
 *
 * Las tres formas, con los hechos de grafo que las distinguen HOY
 * (`implements`/`satisfies`, `memberSignatures`, `instantiates`,
 * `calls`/`references` — ninguno existía cuando esta regla se escribió):
 *
 *   - **COMPLETA** (`findCompletaMatch`, más abajo): existe `F` — una de las
 *     raíces de familia que el propio ancla ya reportó — con ≥2 tipos que
 *     la `implements`/`satisfies` (las fábricas concretas), `F` tiene ≥2
 *     miembros function-like (`memberSignatures`) que CADA concreta
 *     redeclara con la misma `(name, arity)`, cada miembro redeclarado
 *     instancia ≥1 producto de su propia familia y los conjuntos de
 *     productos por familia son DISJUNTOS, y existe ≥1 cliente con
 *     `calls`/`references` hacia `F` que NO instancia ningún producto
 *     concreto directamente. Esto NUNCA sugiere: produce `ya-aplicado`
 *     (o `aplicado-eludido` si además hay otro sitio que puentea la fábrica
 *     instanciando un producto directo) — es la estructura GoF completa,
 *     verificada, no una coincidencia de forma.
 *   - **PARCIAL**: `findCompletaMatch` no encuentra esa estructura, pero SÍ
 *     hay un coordinador que referencia/instancia TODAS las familias
 *     directamente (el `ya-aplicado` de ANTES de esta ola) — un sitio que
 *     sabe de todas las variantes, sin que ninguna raíz de familia tenga una
 *     interfaz común con miembros redeclarados: no hay tipo de fábrica,
 *     sólo un lugar que las conoce. Sugiere, con `toConfirm` pidiendo
 *     confirmar que de verdad conviene formalizarlo.
 *   - **AUSENTE**: lo de siempre — ninguna de las dos señales de arriba.
 *
 * **Declarado, no adivinado (requisito de la tarea):** con sólo las raíces
 * que el ancla reporta como candidato a `F`, este archivo NO puede, en
 * general, distinguir "esta raíz es de verdad una interfaz de fábrica" de
 * "es una base cualquiera con una sola implementación" salvo por el propio
 * chequeo estructural — por eso cada rama de fallback (PARCIAL/AUSENTE) trae
 * un check `role: "applied"` fijo que dice EXPLÍCITAMENTE que la forma
 * COMPLETA se buscó y no se confirmó, en vez de callarlo. El `ceiling`
 * ("media") ya reflejaba esta misma incertidumbre desde antes de esta ola
 * (LÍMITE Nº1) y no se toca: la nueva búsqueda de `F` estrecha la
 * incertidumbre (ahora hay una vía real a `ya-aplicado`), no la resuelve
 * del todo (Go/C# pierden `implements` por los límites ya declarados de sus
 * extractores, así que `F` puede existir en el código real y no ser
 * visible acá — ver LÍMITE DECLARADO Nº2).
 */
import type { Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { ROLE_HARDWIRES, ROLE_SLOT } from "../detect/inter-file/hardwired-subtype-combination.js";
import { canonicalFile, detectMirrorTrees, type MirrorTrees } from "../detect/mirror-tree.js";
import { memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { build as engineBuild, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft, PatternState } from "./types.js";

/** Mismo piso que la regla vieja: `pattern-structural.ts:738`, `sharedSlots.length < 2 → continue`. */
const MIN_SHARED_SLOTS = 2;
/** Discriminador: más solapamiento que el mínimo — familia de productos más rica. */
const RICH_SLOT_OVERLAP = 3;
/**
 * NUNCA `"inferred"` — ver docstring del módulo. `parallel-hierarchies.ts`
 * ya usa el mismo criterio para su propio cross-check de Bridge.
 */
const TRUSTED_PROVENANCE: ReadonlySet<string> = new Set(["declared", "resolved"]);

export interface AbstractFactoryProblem {
  /** Cuántas familias con la MISMA forma reportó el ancla (`trigger[0].value`). */
  familyCount: number;
  /** "miembros por jerarquía" — proxy estructural de "huecos de producto compartidos" (LÍMITE Nº1). */
  slotsPerFamily: number;
  /** "raíces por jerarquía". */
  rootsPerFamily: number;
  /** El propio ancla ya sospechó una composición cruzada entre AL MENOS un par de familias (posible Bridge). */
  bridgeLikely: boolean;
  /** Raíz de cada familia, en el orden que emitió el ancla. */
  families: readonly { file: string; symbol: string }[];
  /**
   * `canonicalFile` (`detect/mirror-tree.ts`) del archivo de cada raíz, MISMO
   * orden que `families` — `[]` hasta que `hypothesis.build` lo completa con
   * `ctx.repo.clones` (ver `mirrorTreesFor`/`canonicalFilesOf` más abajo).
   * Señal INDEPENDIENTE de `distinctFamilyNames`: mirror-tree exige sufijo de
   * ruta compartido (≥3 segmentos) Y solapamiento real de fingerprints
   * (≥50%), calibrado contra el propio recorte de guava — detecta la copia de
   * ÁRBOL (jre/android) por CONTENIDO, no por coincidencia de nombre, así que
   * cubre el caso donde dos raíces de nombre distinto son igual el mismo
   * archivo duplicado. NO reemplaza `distinctFamilyNames`: el par
   * `LongAddable` (`cache/`/`hash/`, ver docstring de esa función) tiene
   * sufijo de ruta de sólo 1 segmento (padres distintos), así que
   * `mirror-tree` no lo empareja — sigue haciendo falta el nombre para ESE caso.
   */
  mirrorCanonicalFiles: readonly string[];
}

/** Texto EXACTO que `parallel-hierarchies.ts` agrega a `detail` cuando `bridgeLikely` es `true` — ver su código fuente. */
const BRIDGE_LIKELY_MARKER = "compatible con una implementación a propósito del patrón Bridge";

function extractProblem(finding: Finding): AbstractFactoryProblem | null {
  const families = finding.locations
    .filter((l): l is RoleLocation & { symbol: string } => typeof l.symbol === "string" && l.symbol.length > 0)
    .map((l) => ({ file: l.file, symbol: l.symbol }));
  if (families.length < 2) return null; // defensivo: el ancla exige `minGroupSize >= 2`, esto no debería ejecutarse nunca en producción.

  return {
    familyCount: finding.trigger[0].value,
    slotsPerFamily: finding.evidence?.find((e) => e.label === "miembros por jerarquía")?.value ?? 0,
    rootsPerFamily: finding.evidence?.find((e) => e.label === "raíces por jerarquía")?.value ?? 0,
    bridgeLikely: BRIDGE_LIKELY_MARKER.length > 0 && finding.detail.includes(BRIDGE_LIKELY_MARKER),
    families,
    mirrorCanonicalFiles: [], // lo completa `hypothesis.build` — `extractProblem` no ve `ctx.repo`.
  };
}

/**
 * Cachea `detectMirrorTrees` por `RepoUnit` (identidad de objeto: el mismo
 * `RepoUnit` vive toda la corrida de `attachHypotheses` sobre UN repo) — sin
 * esto, cada `Finding` de `parallel-hierarchies` (22 en el recorte de guava)
 * recorrería `repo.clones` entero de nuevo para el mismo resultado.
 */
const mirrorTreesCache = new WeakMap<RepoUnit, MirrorTrees>();
function mirrorTreesFor(repo: RepoUnit): MirrorTrees {
  let trees = mirrorTreesCache.get(repo);
  if (!trees) {
    trees = detectMirrorTrees(repo.clones);
    mirrorTreesCache.set(repo, trees);
  }
  return trees;
}

function canonicalFilesOf(families: AbstractFactoryProblem["families"], trees: MirrorTrees): readonly string[] {
  return families.map((f) => canonicalFile(trees, f.file));
}

function classLikeNodeAt(graph: CodeGraph, file: string, symbol: string): CodeGraphNode | undefined {
  return graph.nodes.find(
    (n) => n.kind === "symbol" && n.family === "class-like" && n.file === file && n.symbolPath[n.symbolPath.length - 1] === symbol,
  );
}

/**
 * OLA 10 — nodos con una arista `implements`/`satisfies` CONFIABLE (mismo
 * `TRUSTED_PROVENANCE` que el resto del archivo) y no ambigua hacia
 * `targetId`. Es el reemplazo estructural de "se llama *Factory" (ver
 * `familyRootIsInterfaceLike` y `findCompletaMatch` más abajo, los dos
 * únicos llamadores) — y también la definición de "fábrica concreta" que
 * usa la forma COMPLETA: quien implementa/satisface `targetId`.
 */
function implementersOf(graph: CodeGraph, targetId: string): readonly string[] {
  const out = new Set<string>();
  for (const e of graph.edges) {
    if ((e.kind === "implements" || e.kind === "satisfies") && e.to === targetId && e.from !== targetId && TRUSTED_PROVENANCE.has(e.provenance)) {
      out.add(e.from);
    }
  }
  return [...out];
}

/* ────────────────────────────────────────────────────────────────────────
 * required — TODOS deben cumplirse o no hay ni siquiera candidata
 * ──────────────────────────────────────────────────────────────────────── */

const atLeastTwoFamilies: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "at-least-two-families",
  describe: "El ancla reporta ≥2 familias de tipos con la misma forma (mismo tamaño/raíces/ramificación).",
  run(problem) {
    return {
      holds: problem.familyCount >= 2 && problem.families.length >= 2,
      evidence: `${problem.familyCount} familia(s) con la misma forma reportadas por \`parallel-hierarchies\`.`,
    };
  },
};

const sharedSlotsFloor: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "shared-slots-floor",
  describe: `Cada familia comparte ≥${MIN_SHARED_SLOTS} miembros (proxy de huecos de producto) — mismo piso que la regla vieja.`,
  run(problem) {
    return {
      holds: problem.slotsPerFamily >= MIN_SHARED_SLOTS,
      evidence: `${problem.slotsPerFamily} miembro(s) por jerarquía.`,
    };
  },
};

/**
 * AGREGADO TRAS VERIFICACIÓN MANUAL (ver el resultado final de la tarea): de
 * 5 oportunidades leídas a mano contra el código real de `guava`/`click`, 3
 * resultaron ser el MISMO archivo (byte a byte) duplicado entre los árboles
 * `android/guava*` y `guava*` del propio repo (p.ej. `TestStringListGenerator
 * .java`), o la MISMA interfaz copiada a mano entre dos paquetes
 * (`LongAddable` en `cache`/`hash`) — en los tres casos, AMBAS raíces de
 * familia tienen el MISMO nombre de símbolo. Un Abstract Factory real
 * distingue variantes de un mismo hueco de producto con nombres DISTINTOS
 * (`WinButton`/`MacButton`, no `Button`/`Button`): dos raíces con nombre
 * IDÉNTICO son mucho más compatibles con "el mismo tipo, duplicado" que con
 * "dos tipos concretos distintos". No elimina el otro modo de falso
 * positivo medido (dos familias de dominios no relacionados que coinciden
 * en forma por casualidad, p.ej. `_WindowsConsoleRawIOBase` vs `Parameter`
 * en `click`) — ESE queda como LÍMITE DECLARADO Nº1, no lo resuelve ningún
 * check barato: hace falta saber si las familias son un mismo "hueco de
 * producto", y eso es justamente lo que el ancla no mide.
 */
const distinctFamilyNames: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "distinct-family-names",
  describe: "Las raíces de familia NO repiten el mismo nombre de símbolo entre sí (si lo hicieran, es más compatible con el mismo tipo duplicado que con variantes concretas distintas).",
  run(problem) {
    const names = problem.families.map((f) => f.symbol);
    const distinct = new Set(names);
    return {
      holds: distinct.size === names.length,
      evidence:
        distinct.size === names.length
          ? `${names.length} raíces, todas con nombre distinto: ${names.join(", ")}.`
          : `Al menos dos raíces comparten el mismo nombre de símbolo (${names.join(", ")}) — compatible con el mismo tipo duplicado (p.ej. un fork android/desktop), no con variantes concretas de una familia.`,
    };
  },
};

/**
 * P4 (precisión medida en corpus): reusa `detect/mirror-tree.ts` — YA
 * calibrado contra el mismo par jre/android de guava que motivó
 * `distinctFamilyNames` arriba, con una señal más fuerte (solapamiento real
 * de fingerprints, no coincidencia de nombre). Complementa, no reemplaza: ver
 * el comentario de `mirrorCanonicalFiles` en la interfaz de arriba para el
 * caso (`LongAddable`) que sólo el nombre cubre.
 */
const noMirrorTreeDuplicate: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "no-mirror-tree-duplicate",
  describe:
    "Las raíces de familia no viven en archivos que `mirror-tree` identifica como copias casi byte-idénticas entre sí (mismo árbol de fuente duplicado bajo otra raíz, p.ej. guava jre/android) — señal por solapamiento real de fingerprints, no por nombre.",
  run(problem) {
    const canon = problem.mirrorCanonicalFiles;
    if (canon.length !== problem.families.length) {
      // OLA "required no permisivo" — INVERTIDO de `holds: true`. Antes: sin
      // datos de mirror-tree, este excluder se daba por cumplido sin
      // evidencia ("no se re-verifica"). Un excluder no verificado no está
      // demostrado, y no demostrado es no cumplido (mismo criterio que
      // `appliedState`, abajo, ya aplica cuando falta el grafo). Defensivo
      // en la práctica: `canonicalFilesOf` usa `.map` sobre `families`, así
      // que esta rama es inalcanzable con el cableado de hoy — pero si algún
      // día deja de estarlo, el default seguro es "no confirmado", nunca
      // "aprobado por no poder mirar".
      return {
        holds: false,
        evidence: "Sin datos de `mirror-tree` disponibles para esta corrida: no se puede confirmar que las raíces de familia NO sean copias de árbol duplicadas — no demostrado, se trata como no cumplido.",
      };
    }
    const distinct = new Set(canon);
    return {
      holds: distinct.size === canon.length,
      evidence:
        distinct.size === canon.length
          ? `${canon.length} raíz(ces), cada una en un archivo canónico distinto — sin copias de árbol detectadas entre ellas.`
          : "Al menos dos raíces de familia viven en archivos que `mirror-tree` identifica como copias casi idénticas del mismo árbol fuente (mismo archivo canónico, p.ej. el backend jre/android de guava) — no son variantes reales, es el mismo código duplicado.",
    };
  },
};

/**
 * P4 (falso positivo cross-fixture, medido con `analyzeRepo` real sobre las
 * 101 fixtures de `tests/fixtures/patterns`): convierte el LÍMITE DECLARADO
 * Nº1 del docstring del módulo (repetido en `toConfirm[0]` de más abajo) en
 * un excluder de verdad, en vez de dejarlo como advertencia sin efecto.
 * `parallel-hierarchies` empareja por FORMA (tamaño+raíces+ramificación),
 * no por relación real — medido: `GUIFactory`/`WinFactory`/`MacFactory`
 * (`abstract_factory/javascript.js`, Abstract Factory YA bien aplicado) y
 * `DataMiner`/`CsvDataMiner`/`LogDataMiner` (`template_method/javascript.js`,
 * fixture de OTRO patrón, dominio sin ninguna relación) matchean por tener
 * la misma forma (1 raíz, 2 miembros) — CERO aristas conectan los dos
 * archivos en el grafo (verificado a mano). Exige que las familias se
 * TOQUEN en el grafo: comparten un consumidor EXTERNO (alguien que use a
 * AMBAS sin ser miembro de ninguna) o un miembro de una referencia
 * directamente a un miembro de la otra — "dos familias que no se tocan en
 * el grafo no son una familia de productos".
 *
 * "externo" es la parte no trivial: una subclase que hereda de su propia
 * raíz genera, además de la arista `extends`, una arista `references` HACIA
 * esa raíz (`WinFactory extends GUIFactory` referencia `GUIFactory` por
 * nombre) — sin excluir a los propios miembros de la familia, ESE ruido por
 * sí solo ya alcanza para que dos familias sin relación real parezcan tener
 * "un cliente" cada una (contaminando además el `parcial` de `appliedState`
 * más abajo, que es justo el estado que emitió este falso positivo).
 * `familyMembersOf` reconstruye el árbol de herencia de cada raíz para
 * poder filtrar ese ruido antes de buscar evidencia real.
 *
 * Sólo `declared`/`resolved` (`TRUSTED_PROVENANCE`, igual criterio que el
 * resto del archivo) — asume el grafo YA LLEGA FILTRADO de aristas
 * ambiguas (P1: las aristas ambiguas dejan de contar en la resolución); acá
 * no se vuelve a excluir `ambiguous` a mano por redundancia con esa etapa,
 * sólo se sigue sin confiar en `inferred` por la misma razón que el resto
 * del archivo (`path-proximity` domina el 81% de lo aceptado en guava).
 *
 * Única vía para pasar SIN arista propia en este grafo: `problem.bridgeLikely`
 * — el propio `parallel-hierarchies.ts` ya hace su propio barrido de
 * referencias cruzadas por ARCHIVO (no por símbolo) y lo deja en `detail`;
 * una segunda fuente, independiente de esta re-verificación por grafo, de
 * la misma pregunta.
 */
function familyMembersOf(inheritanceEdges: readonly Pick<CodeGraphEdge, "from" | "to">[], rootId: string): ReadonlySet<string> {
  const members = new Set<string>([rootId]);
  let frontier: readonly string[] = [rootId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const e of inheritanceEdges) {
      if (frontier.includes(e.to) && !members.has(e.from)) {
        members.add(e.from);
        next.push(e.from);
      }
    }
    frontier = next;
  }
  return members;
}

/** Aristas con SEMÁNTICA de uso — nunca `contains`/`imports`/`satisfies`/`affects`/`carries`/`invokes-indirect` (estructurales, no "esto usa aquello"). */
const RELATION_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["references", "instantiates", "calls"]);

/**
 * P4 (Ola 11a) — TERCERA vía de evidencia, vía `ctx.neighborhood`, ADITIVA a
 * (a)/(b) de `crossFamilyRelationHolds` (nunca los reemplaza: si el grafo
 * crudo ya encontró relación, esto ni se llama — ver el `||` corto-circuito
 * abajo). El ancla es `inter-file` (`Finding.language` siempre `null`), así
 * que ÉSTA es la única llamada de `build()` de las 17 hipótesis con
 * `repo.graph` y `ctx.neighborhood` REALES (`hypotheses/run.ts`, llamada (2)
 * desde `crossAnalyze`) — no hace falta `refresh()`.
 *
 * Dos consultas, cada una una forma de "las familias se tocan" que la
 * exploración cruda de `graph.edges` (a)/(b) no cubre:
 *   (c) `findingsAtSymbol`/`findingsInFile`: alguna raíz de familia y algún
 *       archivo de OTRA familia aparecen como `location` de un MISMO
 *       `Finding` — dos familias que comparten un hallazgo real (p.ej. una
 *       `duplication` que cruza los dos archivos) están relacionadas aunque
 *       el grafo `extends`/`references`/`instantiates`/`calls` no tenga
 *       todavía una arista directa entre sus símbolos (huecos de resolución
 *       por lenguaje, ver LÍMITE Nº2 del docstring del módulo).
 *   (d) `ego(ancla, 2)`: vecindad indexada a 2 saltos de la raíz de una
 *       familia — cubre una CADENA (raíz A → intermediario → miembro de B)
 *       que (a) no ve (sólo mira aristas DIRECTAS raíz-a-raíz o miembro-a-
 *       miembro) y que (b) tampoco ve si el intermediario no es "cliente
 *       directo" de NINGUNA de las dos raíces (p.ej. lo alcanza en 2 saltos
 *       desde adentro de la familia). Ya viene con las aristas `ambiguous`
 *       excluidas de los candidatos (`neighborhood.ts#topCandidates`); se
 *       exige además `TRUSTED_PROVENANCE` en la arista que conecta al vecino
 *       encontrado — mismo criterio que (a)/(b), nunca `inferred` decidiendo
 *       un excluder.
 */
function neighborhoodRelationHolds(
  ctx: HypothesisContext,
  problem: AbstractFactoryProblem,
  rootIds: readonly string[],
  membersByFamily: readonly ReadonlySet<string>[],
): boolean {
  // (c) hallazgo compartido: alguna raíz/archivo de familia i aparece en un
  // Finding que TAMBIÉN toca el archivo de otra familia j.
  for (let i = 0; i < problem.families.length; i++) {
    const family = problem.families[i]!;
    const nearby = [
      ...ctx.neighborhood.findingsAtSymbol({ file: family.file, symbolPath: [family.symbol] }),
      ...ctx.neighborhood.findingsInFile(family.file),
    ];
    for (const f of nearby) {
      const touchedFiles = new Set(f.locations.map((l) => l.file));
      for (let j = 0; j < problem.families.length; j++) {
        if (j !== i && touchedFiles.has(problem.families[j]!.file)) return true;
      }
    }
  }

  // (d) vecindad a 2 saltos (grafo, ya indexado): la raíz de una familia
  // alcanza, por una arista confiable, a un miembro de OTRA familia.
  for (let i = 0; i < rootIds.length; i++) {
    const family = problem.families[i]!;
    const ego = ctx.neighborhood.ego({ file: family.file, symbolPath: [family.symbol] }, 2);
    if (!ego) continue;
    const trustedEdgeEndpoints = new Set<string>();
    for (const e of ego.edges) {
      if (!TRUSTED_PROVENANCE.has(e.provenance)) continue;
      trustedEdgeEndpoints.add(e.from);
      trustedEdgeEndpoints.add(e.to);
    }
    for (const { node: n } of ego.nodes) {
      if (!trustedEdgeEndpoints.has(n.id)) continue; // alcanzado sólo por una arista no confiable en esta ventana — no cuenta.
      for (let j = 0; j < membersByFamily.length; j++) {
        if (j !== i && membersByFamily[j]!.has(n.id)) return true;
      }
    }
  }

  return false;
}

function crossFamilyRelationHolds(ctx: HypothesisContext, problem: AbstractFactoryProblem, graph: CodeGraph, rootIds: readonly string[]): boolean {
  if (problem.bridgeLikely) return true; // señal independiente, ya calculada por el propio ancla.

  const inheritanceEdges = graph.edges.filter((e) => (e.kind === "extends" || e.kind === "implements") && TRUSTED_PROVENANCE.has(e.provenance));
  const membersByFamily = rootIds.map((id) => familyMembersOf(inheritanceEdges, id));

  // (a) una arista de uso conecta DIRECTAMENTE un miembro de una familia con un miembro de otra.
  for (const e of graph.edges) {
    if (!RELATION_EDGE_KINDS.has(e.kind) || !TRUSTED_PROVENANCE.has(e.provenance)) continue;
    const fromFamily = membersByFamily.findIndex((m) => m.has(e.from));
    const toFamily = membersByFamily.findIndex((m) => m.has(e.to));
    if (fromFamily !== -1 && toFamily !== -1 && fromFamily !== toFamily) return true;
  }

  // (b) un consumidor EXTERNO (no miembro de NINGUNA familia) referencia/instancia raíces de >=2 familias distintas.
  const externalClientsByFamily = rootIds.map((id, i) => {
    const clients = directTrustedClientsOf(graph, id);
    return [...clients].filter((c) => !membersByFamily[i]!.has(c));
  });
  for (let i = 0; i < externalClientsByFamily.length; i++) {
    for (let j = i + 1; j < externalClientsByFamily.length; j++) {
      if (externalClientsByFamily[i]!.some((c) => externalClientsByFamily[j]!.includes(c))) return true;
    }
  }

  // (c)/(d) — vecindario real (`ctx.neighborhood`): MÁS evidencia positiva,
  // nunca un relajo de lo que (a)/(b) ya exigen (ver `neighborhoodRelationHolds`).
  return neighborhoodRelationHolds(ctx, problem, rootIds, membersByFamily);
}

function crossFamilyRelation(ctx: HypothesisContext): Check<AbstractFactoryProblem, CodeGraph | null> {
  return {
    id: "cross-family-relation",
    describe:
      "Las familias se TOCAN — comparten un consumidor externo, un miembro de una referencia directamente a un miembro de la otra (grafo crudo), un hallazgo real en común, o una vecindad a 2 saltos (`ctx.neighborhood`, Ola 11a) — LÍMITE Nº1 convertido en excluder: `parallel-hierarchies` empareja por forma, no por relación real; ver P4.",
    run(problem, graph) {
      if (!graph) {
        // OLA "required no permisivo" — INVERTIDO. Antes: sin grafo, este
        // excluder ("las familias se tocan") se daba por cumplido citando
        // "la garantía estructural del propio ancla" — pero la garantía del
        // ancla es sólo "sin ancestro común" (eso lo re-verifica
        // `noSharedAncestor`), nunca "las familias están relacionadas"; acá
        // no había evidencia real, sólo un nombre prestado. Mismo criterio
        // conservador que `appliedState` (abajo) ya aplica cuando falta el
        // grafo. Defensivo en la práctica: `parallel-hierarchies` es
        // `inter-file`, así que `graph` es real en toda llamada de
        // producción — esto es el default seguro si eso cambiara.
        return {
          holds: false,
          evidence: "Sin grafo disponible para re-verificar si las familias se tocan: no demostrado, se trata como no cumplido (nunca se asume relación sin evidencia).",
        };
      }
      const rootIds = problem.families.map((f) => classLikeNodeAt(graph, f.file, f.symbol)?.id).filter((id): id is string => Boolean(id));
      if (rootIds.length < problem.families.length) {
        // OLA "required no permisivo" — INVERTIDO, mismo argumento: sin poder
        // reubicar todas las raíces no hay evidencia sólida para AFIRMAR
        // relación, así que el excluder no está demostrado.
        return {
          holds: false,
          evidence: "No se pudieron reubicar todas las raíces de familia en el grafo: sin evidencia sólida de relación entre las familias, no demostrado.",
        };
      }
      const holds = crossFamilyRelationHolds(ctx, problem, graph, rootIds);
      return {
        holds,
        evidence: holds
          ? "Se encontró evidencia de relación real entre las familias: consumidor compartido, referencia directa entre miembros, un hallazgo del vecindario que toca ambos archivos, una vecindad a 2 saltos, o el propio ancla ya detectó una referencia cruzada entre archivos."
          : "Ninguna arista del grafo (directa o a 2 saltos por `ctx.neighborhood.ego`) ni ningún hallazgo del vecindario conecta estas familias entre sí — compatible con coincidencia de forma entre dominios sin relación real, no con una familia de productos.",
      };
    },
  };
}

const noSharedAncestor: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "no-shared-ancestor",
  describe:
    'Ninguna arista extends/implements conecta estas familias directamente — versión estructural, re-verificada contra el grafo, de "a.superclass !== b.superclass" (la regla vieja).',
  run(problem, graph) {
    if (!graph) {
      // OLA "required no permisivo" — INVERTIDO. Antes: sin grafo, se daba
      // por cumplido "confiando en la garantía estructural del propio
      // ancla" — pero esa garantía (componentes disjuntas de `extends`/
      // `implements`) es del ancla `parallel-hierarchies` en SU corrida, no
      // de este grafo acá; sin grafo no hay forma de re-verificarla, y
      // re-verificar es justamente lo que este check existe para hacer (ver
      // el docstring del módulo, líneas 15-20). No demostrado, no cumplido —
      // mismo criterio que `appliedState` ya aplica. Defensivo en la
      // práctica: `parallel-hierarchies` es `inter-file`, `graph` es real
      // siempre en producción.
      return {
        holds: false,
        evidence: "Sin grafo disponible para re-verificar ausencia de ancestro común: no demostrado, se trata como no cumplido.",
      };
    }
    const rootIds = problem.families.map((f) => classLikeNodeAt(graph, f.file, f.symbol)?.id).filter((id): id is string => Boolean(id));
    const crossing = graph.edges.some((e) => (e.kind === "extends" || e.kind === "implements") && rootIds.includes(e.from) && rootIds.includes(e.to));
    return {
      holds: !crossing,
      evidence: crossing
        ? "Se encontró una arista extends/implements directa entre las raíces reportadas: ya están unificadas, no es una oportunidad."
        : "Ninguna arista extends/implements directa entre las raíces de familia reportadas.",
    };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * discriminators — cada uno confirmado sube un peldaño de la escalera
 * ──────────────────────────────────────────────────────────────────────── */

const richSlotOverlap: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "rich-slot-overlap",
  describe: `Más de ${MIN_SHARED_SLOTS} miembros compartidos (≥${RICH_SLOT_OVERLAP}) — familia de productos más rica que el mínimo.`,
  run(problem) {
    return { holds: problem.slotsPerFamily >= RICH_SLOT_OVERLAP, evidence: `${problem.slotsPerFamily} miembro(s) por jerarquía.` };
  },
};

/**
 * OLA 10 (CONTRATO-F10.md, requisito 2): reemplaza el discriminador léxico
 * `*Factory/*Builder/*Creator/*Provider` (vocabulario de nombre) por la
 * forma ESTRUCTURAL que el propio contrato pide: "la raíz de familia con
 * ≥2 `implements`/`satisfies` entrantes". Una raíz con ≥2 implementaciones
 * confiables es de verdad un tipo con múltiples variantes concretas — más
 * compatible con una interfaz de fábrica real que con una base cualquiera
 * extendida una sola vez (que sería ≤1 implementador, o ninguno si el
 * "root" es simplemente el único miembro de una jerarquía chata). Sigue
 * siendo discriminador, NUNCA required: `findCompletaMatch` (más abajo) ya
 * exige esta misma condición como parte de la forma COMPLETA, así que este
 * chequeo dispara sobre todo en el caso PARCIAL (hay coordinador, pero no
 * memberSignatures/instantiates suficientes para confirmar COMPLETA) — ahí
 * SÍ aporta información nueva sobre "cuán compatible con fábrica" es la
 * forma, sin decidir el estado.
 */
const familyRootIsInterfaceLike: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "family-root-is-interface-like",
  describe:
    "Estructural (reemplaza vocabulario *Factory/*Builder/*Creator/*Provider): alguna raíz de familia tiene ≥2 aristas implements/satisfies ENTRANTES — es de verdad un tipo con múltiples implementaciones, no sólo una base extendida una vez.",
  run(problem, graph) {
    if (!graph) return { holds: false, evidence: "Sin grafo disponible para re-verificar." };
    for (const family of problem.families) {
      const root = classLikeNodeAt(graph, family.file, family.symbol);
      if (!root) continue;
      const count = implementersOf(graph, root.id).length;
      if (count >= 2) {
        return { holds: true, evidence: `"${family.symbol}" tiene ${count} tipo(s) que la implements/satisfies directamente — compatible con una interfaz de fábrica real.` };
      }
    }
    return { holds: false, evidence: "Ninguna raíz de familia tiene ≥2 aristas implements/satisfies entrantes confiables." };
  },
};

const singleRootPerFamily: Check<AbstractFactoryProblem, CodeGraph | null> = {
  id: "single-root-per-family",
  describe: "Cada familia tiene una única raíz — una línea de producto limpia, la forma más común de Abstract Factory.",
  run(problem) {
    return { holds: problem.rootsPerFamily === 1, evidence: `${problem.rootsPerFamily} raíz(ces) por jerarquía.` };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * appliedState — EL EXCLUDER OBLIGATORIO, con grafo
 * ──────────────────────────────────────────────────────────────────────── */

function directTrustedClientsOf(graph: CodeGraph, rootId: string): ReadonlySet<string> {
  const clients = new Set<string>();
  for (const e of graph.edges) {
    if ((e.kind === "references" || e.kind === "instantiates") && e.to === rootId && TRUSTED_PROVENANCE.has(e.provenance)) clients.add(e.from);
  }
  return clients;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA 10 — la forma COMPLETA (CONTRATO-F10.md): `F` con ≥2 fábricas
 * concretas (`implements`/`satisfies`), ≥2 miembros redeclarados
 * (`memberSignatures`), productos disjuntos por familia (`instantiates`), y
 * un cliente que use `F` sin instanciar ningún producto concreto.
 * ──────────────────────────────────────────────────────────────────────── */

/** Firma mínima de `GraphIndex` que `memberSignatures` necesita, sobre un índice armado UNA vez por llamada a `findCompletaMatch` — mismo adaptador que ya usa `hypotheses/wrapping-chain.ts`. */
interface MemberIndex {
  nodeById(id: string): CodeGraphNode | null;
  edgesFrom(id: string): readonly CodeGraphEdge[];
}

function buildMemberIndex(graph: CodeGraph): MemberIndex {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of graph.edges) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
  }
  return { nodeById: (id) => nodeById.get(id) ?? null, edgesFrom: (id) => edgesFrom.get(id) ?? [] };
}

/** Id del nodo símbolo `ownerId.<name>/<arity>` — leído de la MISMA arista `contains` que `memberSignatures` ya recorrió, nunca reconstruido a mano (mismo criterio que `hypotheses/wrapping-chain.ts#memberNodeId`). */
function memberNodeId(index: MemberIndex, ownerId: string, name: string, arity: number | null): string | null {
  for (const e of index.edgesFrom(ownerId)) {
    if (e.kind !== "contains") continue;
    const t = index.nodeById(e.to);
    if (t?.kind === "symbol" && t.family === "function-like" && t.symbolPath[t.symbolPath.length - 1] === name && (t.arity ?? null) === arity) {
      return t.id;
    }
  }
  return null;
}

export interface CompletaMatch {
  /** El nodo de `F` — una de las raíces de familia que el propio ancla reportó. */
  readonly interfaceId: string;
  readonly interfaceSymbol: string;
  /** Las fábricas concretas — `implementersOf(graph, interfaceId)`, ≥2. */
  readonly concreteIds: readonly string[];
  /** Los ≥2 miembros de `F` que CADA concreta redeclara con la misma `(name, arity)`. */
  readonly sharedMembers: readonly { readonly name: string; readonly arity: number | null }[];
  /** El cliente con calls/references hacia `F` y CERO instantiates hacia cualquier producto concreto. */
  readonly clientId: string;
  /** Otros sitios que instancian un producto concreto SIN pasar por ninguna fábrica ni por `clientId` — puenteo. */
  readonly bypassers: readonly string[];
}

/**
 * Busca la forma COMPLETA entre las raíces de familia que `parallel-hierarchies`
 * ya reportó (nunca escanea el grafo entero buscando una interfaz al azar:
 * `F` tiene que ser una de las raíces que el propio ancla ya identificó como
 * "una jerarquía con la misma forma que otra" — ver el docstring del
 * módulo). `null` ⇒ ninguna raíz de familia arma la cadena completa; eso NO
 * significa "ausente" a secas, lo decide `appliedState` combinando esto con
 * el resto de la evidencia (ver ahí el fallback a PARCIAL/AUSENTE).
 */
function findCompletaMatch(problem: AbstractFactoryProblem, graph: CodeGraph): CompletaMatch | null {
  const index = buildMemberIndex(graph);

  for (const family of problem.families) {
    const f = classLikeNodeAt(graph, family.file, family.symbol);
    if (!f) continue;

    const concretes = implementersOf(graph, f.id).filter((id) => index.nodeById(id)?.family === "class-like");
    if (concretes.length < 2) continue;

    const fMembers = memberSignatures(index, f.id);
    if (fMembers.length < 2) continue;

    const membersByConcrete = new Map(concretes.map((c) => [c, memberSignatures(index, c)] as const));
    const sharedMembers = fMembers.filter((fm) =>
      concretes.every((c) => membersByConcrete.get(c)!.some((cm) => cm.name === fm.name && cm.arity === fm.arity)),
    );
    if (sharedMembers.length < 2) continue;

    const productsByConcrete = new Map<string, ReadonlySet<string>>();
    // Los miembros REDECLARADOS de cada concreta (`sym:Concreta.createX`) —
    // no las propias `concretes` (ids de la CLASE): la arista `instantiates`
    // real sale del MIEMBRO, nunca del dueño. Sin este conjunto, el
    // excluder de "puenteo" de abajo confundiría "la fábrica instanciando su
    // propio producto, como corresponde" con una fuga.
    const legitMemberIds = new Set<string>();
    let everyoneInstantiates = true;
    for (const c of concretes) {
      const products = new Set<string>();
      for (const m of sharedMembers) {
        const memberId = memberNodeId(index, c, m.name, m.arity);
        if (!memberId) continue;
        legitMemberIds.add(memberId);
        for (const e of index.edgesFrom(memberId)) {
          if (e.kind === "instantiates" && TRUSTED_PROVENANCE.has(e.provenance)) products.add(e.to);
        }
      }
      if (products.size === 0) {
        everyoneInstantiates = false;
        break;
      }
      productsByConcrete.set(c, products);
    }
    if (!everyoneInstantiates) continue;

    const entries = [...productsByConcrete.entries()];
    let disjoint = true;
    outer: for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        for (const p of entries[i]![1]) {
          if (entries[j]![1].has(p)) {
            disjoint = false;
            break outer;
          }
        }
      }
    }
    if (!disjoint) continue;

    const allProducts = new Set<string>();
    for (const s of productsByConcrete.values()) for (const p of s) allProducts.add(p);

    const clientsOfF = new Set<string>();
    for (const e of graph.edges) {
      if (
        (e.kind === "references" || e.kind === "calls") &&
        e.to === f.id &&
        e.from !== f.id &&
        !concretes.includes(e.from) &&
        !legitMemberIds.has(e.from) &&
        TRUSTED_PROVENANCE.has(e.provenance)
      ) {
        clientsOfF.add(e.from);
      }
    }

    const instantiatesAnyProduct = (nodeId: string): boolean =>
      index.edgesFrom(nodeId).some((e) => e.kind === "instantiates" && TRUSTED_PROVENANCE.has(e.provenance) && allProducts.has(e.to));

    const clientId = [...clientsOfF].find((c) => !instantiatesAnyProduct(c));
    if (!clientId) continue; // hay interfaz+productos, pero ningún cliente confirmado usándola SIN los tipos concretos — no se adivina COMPLETA sin esa evidencia.

    const bypassers = new Set<string>();
    for (const e of graph.edges) {
      if (
        e.kind === "instantiates" &&
        TRUSTED_PROVENANCE.has(e.provenance) &&
        allProducts.has(e.to) &&
        !concretes.includes(e.from) &&
        !legitMemberIds.has(e.from) &&
        e.from !== clientId
      ) {
        bypassers.add(e.from);
      }
    }

    return { interfaceId: f.id, interfaceSymbol: family.symbol, concreteIds: concretes, sharedMembers, clientId, bypassers: [...bypassers] };
  }
  return null;
}

/**
 * Requisito 3 de la tarea: declarar, no adivinar, cuando la forma COMPLETA
 * no se pudo confirmar — este check viaja SIEMPRE en las ramas PARCIAL/
 * AUSENTE (nunca en COMPLETA, que trae su propia evidencia positiva), así
 * que el `why` de "por qué no es ya-aplicado" queda explícito en vez de
 * inferirse por ausencia.
 */
function noCompletaEvidenceCheck() {
  return {
    label: "forma COMPLETA (interfaz F + miembros redeclarados + productos disjuntos + cliente limpio) NO confirmada",
    passed: false,
    why:
      "Se buscó una raíz de familia que sea implementada por ≥2 fábricas concretas con ≥2 miembros redeclarados, cada uno instanciando productos disjuntos, más un cliente que use sólo la interfaz — no se encontró esa cadena completa con los hechos de este grafo. No se adivina 'ya-aplicado' sin ella: el estado de abajo es el que la evidencia restante sostiene.",
    role: "applied" as const,
  };
}

function appliedState(problem: AbstractFactoryProblem, graph: CodeGraph | null): AppliedStateResult {
  if (!graph) {
    // Defensivo: `parallel-hierarchies` exige `needsGraph: true`, así que un
    // `Finding` de este `kind` no debería existir con `graph === null` — el
    // mismo trato defensivo que `run(repo, ctx)` de ese detector ya declara
    // para su propio `if (!graph) return [];`. Conservador: `ausente`, sin
    // poder confirmar NI descartar una fábrica ya existente.
    return {
      state: "ausente",
      checks: [
        {
          label: "grafo disponible para evaluar excluders",
          passed: false,
          why: "Sin grafo en esta corrida (no debería ocurrir: el ancla exige grafo) — se reporta `ausente` de forma conservadora.",
          role: "applied",
        },
      ],
    };
  }

  // OLA 10 — primero se busca la forma COMPLETA: información positiva, NUNCA
  // una sugerencia (requisito 1). Sólo si no se confirma se cae al fallback
  // de abajo (el `ya-aplicado` de ANTES de esta ola, ahora PARCIAL — ver el
  // docstring del módulo).
  const completa = findCompletaMatch(problem, graph);
  if (completa) {
    const state: PatternState = completa.bypassers.length > 0 ? "aplicado-eludido" : "ya-aplicado";
    const memberList = completa.sharedMembers.map((m) => `${m.name}/${m.arity ?? "?"}`).join(", ");
    return {
      state,
      checks: [
        {
          label: `interfaz de fábrica "${completa.interfaceSymbol}" con ≥2 fábricas concretas (implements/satisfies) y ≥2 miembros redeclarados`,
          passed: true,
          why: `${completa.concreteIds.length} tipo(s) implementan/satisfacen "${completa.interfaceSymbol}" redeclarando los mismos miembros (${memberList}): la estructura GoF COMPLETA, no una coincidencia de forma.`,
          role: "applied",
        },
        {
          label: "cada fábrica concreta instancia productos DISJUNTOS de su propia familia",
          passed: true,
          why: `${completa.concreteIds.length} fábrica(s) concreta(s), cada una con ≥1 \`instantiates\` hacia un producto propio, sin superposición entre familias.`,
          role: "applied",
        },
        {
          label: "existe un cliente que usa la interfaz sin instanciar ningún producto concreto directamente",
          passed: true,
          why: "Al menos un cliente tiene calls/references hacia la interfaz de fábrica y CERO instantiates hacia cualquiera de los productos concretos: el cliente queda protegido de los tipos concretos, la garantía central del patrón. Sugerir acá sería recomendar Abstract Factory sobre un Abstract Factory ya aplicado — el falso positivo que el usuario ya rechazó.",
          role: "applied",
        },
        {
          label: "algún OTRO sitio puentea la fábrica instanciando un producto concreto directamente",
          passed: completa.bypassers.length > 0,
          why:
            completa.bypassers.length > 0
              ? `${completa.bypassers.length} sitio(s) más instancian un producto concreto sin pasar por ninguna fábrica: ${completa.bypassers.slice(0, 3).join(", ")} — la abstracción existe pero tiene fugas (aplicado-eludido).`
              : "Ningún otro sitio instancia un producto concreto por fuera de las fábricas — sin fugas conocidas.",
          role: "applied",
        },
      ],
    };
  }

  const rootIds = problem.families.map((f) => classLikeNodeAt(graph, f.file, f.symbol)?.id).filter((id): id is string => Boolean(id));

  if (rootIds.length < problem.families.length) {
    return {
      state: "ausente",
      checks: [
        noCompletaEvidenceCheck(),
        {
          label: "raíces de familia re-ubicadas en el grafo",
          passed: false,
          why: `Sólo ${rootIds.length}/${problem.families.length} raíces de familia se encontraron como nodos clase-tipo en el grafo de esta corrida — no se puede evaluar el excluder con confianza.`,
          role: "applied",
        },
      ],
    };
  }

  const clientsByFamily = rootIds.map((id) => directTrustedClientsOf(graph, id));
  const allClients = new Set<string>();
  for (const s of clientsByFamily) for (const c of s) allClients.add(c);

  const coordinators = [...allClients].filter((client) => clientsByFamily.every((s) => s.has(client)));

  if (coordinators.length === 0) {
    const partial = clientsByFamily.some((s) => s.size > 0) || problem.bridgeLikely;
    const state: PatternState = partial ? "parcial" : "ausente";
    return {
      state,
      checks: [
        noCompletaEvidenceCheck(),
        {
          label: "coordinador que referencia/instancia TODAS las familias",
          passed: false,
          why: partial
            ? "Hay clientes que referencian ALGUNA de las familias (o el propio ancla ya sospechó una composición cruzada, posible Bridge), pero ninguno referencia TODAS: la unificación existe a medias."
            : "Ningún cliente del grafo (con procedencia declared/resolved) referencia/instancia ninguna de estas familias directamente.",
          role: "applied",
        },
      ],
    };
  }

  // OLA 10: un coordinador que referencia/instancia TODAS las familias, SIN
  // que `findCompletaMatch` haya confirmado una interfaz común con miembros
  // redeclarados, es la forma PARCIAL del contrato — "un sitio que sabe de
  // todas, no un tipo de fábrica" — nunca `ya-aplicado`/`aplicado-eludido`
  // (eso quedó reservado para la forma COMPLETA, arriba). El puenteo sigue
  // siendo evidencia útil (dispersión), pero ya no cambia el estado: sin
  // interfaz que puentear, "puentear" y "coordinar sin interfaz" son la
  // misma dispersión vista desde dos lados.
  const bypassers = [...allClients].filter((client) => !coordinators.includes(client));
  return {
    state: "parcial",
    checks: [
      noCompletaEvidenceCheck(),
      {
        label: "coordinador que referencia/instancia TODAS las familias, SIN interfaz F común",
        passed: true,
        why: `${coordinators.length} nodo(s) referencian/instancian una raíz de CADA familia, pero ninguna raíz tiene una interfaz implementada en común con miembros redeclarados (ver el check de forma COMPLETA de arriba): hay un sitio que conoce todas las variantes, no un tipo de fábrica — PARCIAL, no ya-aplicado.`,
        role: "applied",
      },
      {
        label: "(informativo) algún cliente además puentea el coordinador",
        passed: bypassers.length > 0,
        why:
          bypassers.length > 0
            ? `${bypassers.length} cliente(s) más instancian/referencian una familia sin pasar por el coordinador: ${bypassers.slice(0, 3).join(", ")} — no cambia el estado (ya es PARCIAL sin interfaz F), es evidencia adicional de dispersión.`
            : "Ningún otro cliente referencia estas familias por fuera del coordinador encontrado.",
        role: "applied",
      },
    ],
  };
}

/**
 * P4 (Ola 11a): `crossFamilyRelation` necesita `ctx` (vecindario real) — el
 * spec se arma por invocación, mismo patrón que `strategy.ts#buildSpec`, en
 * vez de un objeto module-level que no podría cerrar sobre un `ctx` distinto
 * por `Finding`. El resto de los checks no necesita `ctx`: siguen siendo
 * consts module-level, reusadas tal cual.
 */
function buildSpec(ctx: HypothesisContext): HypothesisSpec<AbstractFactoryProblem, CodeGraph | null> {
  return {
    pattern: "Abstract Factory",
    ceiling: "media", // mismo techo que la regla vieja (pattern-structural.ts:744 declaraba esa misma confianza a mano) — provisional (K2).
    needs: ["unidad-tipo-clase"],
    required: [atLeastTwoFamilies, sharedSlotsFloor, noSharedAncestor, distinctFamilyNames, noMirrorTreeDuplicate, crossFamilyRelation(ctx)],
    discriminators: [richSlotOverlap, familyRootIsInterfaceLike, singleRootPerFamily],
    appliedState,
    toConfirm: [
      // P4 (ex-LÍMITE Nº1): la coincidencia de forma/tamaño DEJÓ de bastar —
      // `crossFamilyRelation` (`required`) exige evidencia real de que las
      // familias se tocan antes de siquiera ser candidata. Lo que queda por
      // confirmar a mano es más fino: relación real ≠ MISMA familia de
      // productos (podrían relacionarse por otra razón, p.ej. composición).
      "¿Estas familias realmente forman UNA familia de productos que se usan juntos, más allá de la relación en el grafo que ya se confirmó (`cross-family-relation`)?",
      "¿Se prevén MÁS variantes de familia? Con dos fijas y estables, la fábrica abstracta puede no valer el costo (mismo texto que la regla vieja).",
    ],
    source: "https://refactoring.guru/es/design-patterns/abstract-factory",
  };
}


/* ════════════════════════════════════════════════════════════════════════
 * OLA AE (frente AE3) — EL CAMINO DEL ANCLA-FUERZA `hardwired-subtype-combination`.
 *
 * TODO lo que sigue es CÓDIGO NUEVO detrás de un `if (problem.kind === ...)`
 * en `build()`: no toca ni un `required`, ni un discriminador, ni una rama de
 * `appliedState`, ni un umbral del camino de `parallel-hierarchies`. Lo único
 * que cambia arriba es que el array `anchors` SUMA una entrada.
 *
 * POR QUÉ HAY UN CAMINO NUEVO Y NO UN PARCHE AL VIEJO, con el número que lo
 * motiva: medido por AE3 sobre las dos poblaciones (13 bibliotecas + las 8
 * aplicaciones de `corpus-app/`), las 18 hipótesis que `parallel-hierarchies`
 * produce caen las 18 en `parcial` — `ausente` CERO, `ya-aplicado` CERO,
 * `aplicado-eludido` CERO. La causa está leída en el código: `ausente` sólo es
 * alcanzable si NINGUNA raíz de familia tiene un solo cliente directo, y una
 * raíz de jerarquía sin un solo `references`/`instantiates` entrante no existe
 * en un repositorio real. Un peldaño que contesta siempre lo mismo no informa
 * nada. **No se toca: esta ola es ADITIVA y el número se publica.**
 * ════════════════════════════════════════════════════════════════════════ */

export interface HardwiredCombinationProblem {
  /** Cuántas combinaciones distintas de variantes están realmente elegidas. */
  familias: number;
  /** Cuántos lugares cablean la elección. */
  lugares: number;
  /** En cuántos archivos distintos viven esos lugares. */
  archivos: number;
  /** Cuántos de los huecos ya tienen un creador compartido por TODOS los lugares. */
  huecosResueltos: number;
  /** Los lugares que cablean, tal como los reportó el ancla. */
  sitios: readonly { file: string; symbol: string | null }[];
  /** Los huecos de producto (los tipos base). */
  huecos: readonly { file: string; symbol: string | null }[];
}

function extractHardwired(finding: Finding): HardwiredCombinationProblem | null {
  const sitios = finding.locations.filter((l) => l.role.startsWith(ROLE_HARDWIRES)).map((l) => ({ file: l.file, symbol: l.symbol ?? null }));
  const huecos = finding.locations.filter((l) => l.role.startsWith(ROLE_SLOT)).map((l) => ({ file: l.file, symbol: l.symbol ?? null }));
  // Defensivo: el ancla siempre emite las dos clases de ubicación (lo exigen
  // dos de sus tests). Si un `Finding` llegara sin ellas, no hay problema que
  // construir — nunca se inventa uno.
  if (sitios.length === 0 || huecos.length < 2) return null;
  const value = (label: string): number => finding.trigger.find((t) => t.label.startsWith(label))?.value ?? 0;
  return {
    familias: value("combinaciones distintas"),
    lugares: value("lugares que cablean"),
    archivos: value("archivos distintos"),
    huecosResueltos: finding.evidence?.find((e) => e.label.startsWith("huecos que YA"))?.value ?? 0,
    sitios,
    huecos,
  };
}

/**
 * Consulta CRUDA sobre `graph.edges` — a propósito, y por la misma razón
 * MEDIDA que obligó a AD4 a hacerlo en `hypotheses/facade.ts`: `projectGraph`
 * descarta por contrato (`CONTRATO-F9.md` §4.5) toda arista con
 * `provenance: "ambiguous"`, y una hipótesis que consulte por esa vía queda
 * estructuralmente ciega en los repositorios donde la resolución es
 * mayormente ambigua. Acá se lee el grafo tal cual, y se exige `declared`/
 * `resolved` explícitamente — el mismo `TRUSTED_PROVENANCE` del resto de este
 * archivo.
 */
function filesThatInstantiate(graph: CodeGraph): ReadonlySet<string> {
  const out = new Set<string>();
  const fileOf = new Map<string, string>();
  for (const n of graph.nodes) if (n.kind === "symbol" && !fileOf.has(n.id)) fileOf.set(n.id, n.file);
  for (const e of graph.edges) {
    if (e.kind !== "instantiates" || !TRUSTED_PROVENANCE.has(e.provenance)) continue;
    const f = fileOf.get(e.from);
    if (f) out.add(f);
  }
  return out;
}

/** Piso de lugares del camino nuevo — el MISMO número y la MISMA razón que el
 *  piso `lugares` del ancla (`detect/inter-file/hardwired-subtype-combination.ts`):
 *  con dos puntos de creación la mitigación barata es una función `crear(variante)`
 *  con un condicional, no una jerarquía de fábricas. */
const HARDWIRED_MIN_SITES = 3;

const familiaDeProductos: Check<HardwiredCombinationProblem, CodeGraph | null> = {
  id: "familia-de-productos",
  describe:
    "Lo que hay que crear es una FAMILIA: ≥2 huecos de producto independientes, y ≥2 combinaciones distintas realmente elegidas en el código (con una sola combinación no hay nada que varíe).",
  run(problem) {
    const holds = problem.huecos.length >= MIN_SHARED_SLOTS && problem.familias >= 2;
    return {
      holds,
      evidence: holds
        ? `${problem.huecos.length} huecos de producto y ${problem.familias} combinaciones distintas elegidas.`
        : `${problem.huecos.length} hueco(s) y ${problem.familias} combinación(es): sin dos huecos el patrón que paga es Factory Method, y sin dos combinaciones no hay nada que varíe.`,
    };
  },
};

const eleccionCableadaEnVariosLugares: Check<HardwiredCombinationProblem, CodeGraph | null> = {
  id: "eleccion-cableada-en-varios-lugares",
  describe: `La elección de familia está escrita a mano en ≥${HARDWIRED_MIN_SITES} lugares — con dos, una función \`crear(variante)\` con un condicional la borra sin crear ninguna jerarquía.`,
  run(problem) {
    return {
      holds: problem.lugares >= HARDWIRED_MIN_SITES,
      evidence: `${problem.lugares} lugar(es) instancian los productos ellos mismos.`,
    };
  },
};

const eleccionCruzaElArchivo: Check<HardwiredCombinationProblem, CodeGraph | null> = {
  id: "eleccion-cruza-el-archivo",
  describe:
    "La elección CRUZA el archivo: si los lugares vivieran todos en el mismo archivo, una función privada los unificaría sin crear ningún tipo nuevo y la fábrica sería más cara que el problema.",
  run(problem) {
    return { holds: problem.archivos >= 2, evidence: `${problem.archivos} archivo(s) distintos contienen los lugares que cablean.` };
  },
};

function creacionEnElLugarMismo(): Check<HardwiredCombinationProblem, CodeGraph | null> {
  return {
    id: "creacion-en-el-lugar-mismo",
    describe:
      "Re-verificado contra el grafo CRUDO: cada lugar reportado contiene él mismo al menos una instanciación confiable (`declared`/`resolved`) — la elección está escrita ahí, no delegada.",
    run(problem, graph) {
      if (!graph) {
        // Nunca "no pude mirar, apruebo": el ancla es `inter-file` y exige
        // grafo, así que esta rama es defensiva; el default seguro es no
        // demostrado. Mismo criterio que el resto de este archivo desde la
        // ola "required no permisivo".
        return { holds: false, evidence: "Sin grafo disponible para re-verificar dónde vive la creación: no demostrado, se trata como no cumplido." };
      }
      const withCreation = filesThatInstantiate(graph);
      const missing = problem.sitios.filter((s) => !withCreation.has(s.file));
      return {
        holds: missing.length === 0,
        evidence:
          missing.length === 0
            ? `Los ${problem.sitios.length} lugares tienen al menos una instanciación confiable propia en el grafo.`
            : `${missing.length} de ${problem.sitios.length} lugares no muestran ninguna instanciación confiable propia en este grafo (${missing.map((m) => m.file).slice(0, 3).join(", ")}): no demostrado.`,
      };
    },
  };
}

const muchasFamilias: Check<HardwiredCombinationProblem, CodeGraph | null> = {
  id: "muchas-familias",
  describe: "Más de dos combinaciones distintas elegidas — cuantas más familias hay, más trabajo ahorra la fábrica y menos discutible es su costo.",
  run(problem) {
    return { holds: problem.familias >= 3, evidence: `${problem.familias} combinaciones distintas.` };
  },
};

const ningunHuecoResuelto: Check<HardwiredCombinationProblem, CodeGraph | null> = {
  id: "ningun-hueco-resuelto",
  describe: "NINGÚN hueco tiene todavía un creador compartido por todos los lugares — no hay media fábrica escrita que aproveche.",
  run(problem) {
    return {
      holds: problem.huecosResueltos === 0,
      evidence: `${problem.huecosResueltos} de ${problem.huecos.length} huecos ya tienen un miembro compartido que los crea.`,
    };
  },
};

const eleccionMuyDispersa: Check<HardwiredCombinationProblem, CodeGraph | null> = {
  id: "eleccion-muy-dispersa",
  describe: "La elección vive en ≥3 archivos distintos — cuanto más repartida, más caro es agregar una familia sin fábrica.",
  run(problem) {
    return { holds: problem.archivos >= 3, evidence: `${problem.archivos} archivos distintos.` };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, y lo que NO puede decir, dicho con
 * todas las letras (mismo criterio con el que AC3 y AD4 lo dijeron de las
 * suyas): `ya-aplicado` y `aplicado-eludido` son INALCANZABLES desde acá, y no
 * es mérito. El ancla EXIGE que ningún creador compartido cubra TODOS los
 * huecos —si lo cubriera, el detector se calla y no hay `Finding`—, así que
 * "ya aplicado" y "este hallazgo existe" son incompatibles por construcción.
 * Lo que sí es mérito medible, y de otra naturaleza, es que el DETECTOR se
 * calle cuando la fábrica ya está: tres tests suyos exigen ese silencio.
 */
function hardwiredAppliedState(problem: HardwiredCombinationProblem): AppliedStateResult {
  if (problem.huecosResueltos > 0) {
    return {
      state: "parcial",
      checks: [
        {
          label: "media fábrica: algún hueco ya tiene un creador compartido por todos los lugares",
          passed: true,
          why: `${problem.huecosResueltos} de ${problem.huecos.length} huecos ya se crean desde un miembro con la MISMA firma en todos los lugares; el resto está cableado en cada uno. La mitigación es COMPLETAR la fábrica, no inventarla de cero.`,
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "ningún creador compartido, ni adentro ni afuera del grupo",
        passed: false,
        why: "Ningún miembro con la misma firma en todos los lugares crea ninguno de los huecos, ningún lugar del grupo es usado por los demás, y ningún lugar ajeno cubre ya los dos huecos con clientes propios (las tres condiciones de RESOLUCIÓN VERIFICADA del ancla). No hay fábrica ni media fábrica que aprovechar.",
        role: "applied",
      },
    ],
  };
}

function buildHardwiredSpec(): HypothesisSpec<HardwiredCombinationProblem, CodeGraph | null> {
  return {
    pattern: "Abstract Factory",
    ceiling: "media", // mismo techo que el camino viejo — ver el `ceiling` de `buildSpec`.
    needs: ["unidad-tipo-clase"],
    required: [familiaDeProductos, eleccionCableadaEnVariosLugares, eleccionCruzaElArchivo, creacionEnElLugarMismo()],
    discriminators: [muchasFamilias, ningunHuecoResuelto, eleccionMuyDispersa],
    appliedState: (problem) => hardwiredAppliedState(problem),
    toConfirm: [
      "¿Los productos de cada combinación se usan JUNTOS de verdad (el de un hueco sólo tiene sentido con el del otro de la misma familia)? El grafo no lleva esa relación y el ancla no la verifica: es la única parte de la fuerza que queda para leer a mano.",
      "¿Se prevén MÁS familias? Con las que ya están fijas y estables, la fábrica abstracta puede no valer el costo (mismo texto que la regla vieja).",
    ],
    source: "https://refactoring.guru/es/design-patterns/abstract-factory",
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
  id: "abstract-factory",
  pattern: "Abstract Factory",
  layer: "patron",
  // OLA AE (AE3): el array SUMÓ `hardwired-subtype-combination`.
  //
  // OLA AL (AL1) — SE SACA `parallel-hierarchies`. Se saca del array
  // —explícito y auditable— en vez de silenciarla con un discriminador, que
  // escondería la decisión. El motivo, medido sobre el volcado del 21-08 y
  // con el 100 % de la población viva juzgada en las DOS poblaciones:
  //
  //   · nivel 2: 12 recomendaciones en biblioteca y 6 en aplicación, las 18
  //     juzgadas, **0 verdaderas** (0/12 y 0/6).
  //   · nivel 1: el ancla `parallel-hierarchies` mide **0 de 14** verdaderos
  //     en biblioteca — la celda está TOPEADA por su ancla: no hay problema
  //     real del otro lado del que colgar una propuesta.
  //   · costo en cobertura: **0 huérfanos** en las dos poblaciones — ningún
  //     hallazgo de nivel 1 juzgado `verdadero` se queda sin NINGUNA
  //     recomendación por esta salida.
  //
  // `hardwired-subtype-combination` —el ancla-fuerza de AE3— NO se toca, y
  // `build` sigue tratando `parallel-hierarchies` exactamente igual: no se
  // borró una sola línea del camino, sólo se lo dejó de alimentar.
  anchors: ["hardwired-subtype-combination"],
  build(problem: Finding, graph, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (problem.kind === "hardwired-subtype-combination") {
      const hardwired = extractHardwired(problem);
      if (!hardwired) {
        if (ai6TraceEnabled()) ai6Record("hardwired-subtype-combination", null, problem, null, null, ctx, graph !== null, false, "extractHardwired-null");
        return null;
      }
      const spec = buildHardwiredSpec();
      const outcome = engineBuild(spec, ctx.capabilities, hardwired, graph);
      if (ai6TraceEnabled()) ai6Record("hardwired-subtype-combination", spec, problem, hardwired, graph, ctx, graph !== null, outcome !== null);
      if (!outcome) return null;
      return toPatternHypothesis(spec, outcome, {
        anchorFindingId: problem.id,
        places: problem.locations,
        cost:
          "Una interfaz de fábrica + una fábrica concreta por familia + una interfaz por hueco de producto; sólo vale la pena si se prevén MÁS familias, no para las que ya están fijas y estables.",
      });
    }
    const extracted = extractProblem(problem);
    if (!extracted) {
      if (ai6TraceEnabled()) ai6Record("parallel-hierarchies", null, problem, null, null, ctx, graph !== null, false, "extractProblem-null");
      return null;
    }
    const withMirrors: AbstractFactoryProblem = { ...extracted, mirrorCanonicalFiles: canonicalFilesOf(extracted.families, mirrorTreesFor(ctx.repo)) };
    const spec = buildSpec(ctx);
    const outcome = engineBuild(spec, ctx.capabilities, withMirrors, graph);
    if (ai6TraceEnabled()) ai6Record("parallel-hierarchies", spec, problem, withMirrors, graph, ctx, graph !== null, outcome !== null);
    if (!outcome) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Una interfaz de fábrica + una interfaz por hueco de producto; sólo vale la pena si se prevén MÁS variantes de familia, no para dos fijas y estables.",
    });
  },
};
