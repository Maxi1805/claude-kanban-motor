/**
 * `repeated-collaborator-set` — OLA AD, frente AD4. EL ANCLA-FUERZA DE FACADE.
 *
 * ─── POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA ──────────────────────────
 *
 * Facade tenía dos anclas —`fanout-without-cohesion` y `god-component`— y las
 * dos son SÍNTOMAS de tamaño y dispersión. Medido por AD4 sobre un volcado
 * propio de las dos poblaciones (13 bibliotecas + `corpus-app/`):
 * **288 hipótesis de Facade, de las que 244 terminan `aplicado-eludido`,
 * 31 `ya-aplicado`, 13 `parcial` y CERO `ausente`.** Un ancla que no puede
 * emitir `ausente` NUNCA descubre dónde FALTA el patrón: descubre dónde el
 * patrón YA ESTÁ (un archivo con fan-out alto es una fachada de facto) y como
 * mucho quién la puentea. Es exactamente el modo de falla que la Ola AC
 * diagnosticó: el síntoma no predice el patrón.
 *
 * ─── LA FUERZA QUE FACADE RESUELVE, ESCRITA COMO LA RESUELVE EL PATRÓN ─────
 *
 * *Un grupo de clientes tiene que coordinar VARIAS piezas de un subsistema, la
 * MISMA coordinación una y otra vez, y esa coordinación vive REPETIDA del lado
 * del cliente en vez de detrás de una sola puerta.*
 *
 * Es una propiedad del GRAFO —quién llama a quién y desde cuántos lugares—, no
 * del tamaño de un archivo. Un archivo enorme con fan-out alto no dice nada
 * sobre si alguien repite una coordinación; tres funciones cortas en tres
 * archivos distintos que invocan exactamente los mismos cinco símbolos de
 * cinco módulos distintos, sí.
 *
 * ─── LA TRAMPA, Y DÓNDE ESTÁ LA DIFERENCIA ────────────────────────────────
 *
 * "Muchos clientes llaman a las mismas piezas" se parece muchísimo a "ya hay
 * una fachada y todos la usan". **La diferencia es DÓNDE VIVE LA
 * COORDINACIÓN**: repetida dentro de cada cliente ⇒ falta la puerta; en un
 * solo lugar que los clientes llaman ⇒ la puerta ya está. Dos condiciones de
 * abajo atacan esa trampa desde los dos lados: la (2) exige que cada cliente
 * invoque las piezas ÉL MISMO (si hubiera una puerta y la usaran, cada cliente
 * llamaría a UN símbolo, no a cuatro de cuatro archivos distintos), y la (5)
 * exige, además y explícitamente, que no exista ya un archivo que coordine el
 * núcleo ENTERO.
 *
 * ─── LAS CINCO CONDICIONES, CON LA INTENCIÓN DE CADA UNA ──────────────────
 *
 * (1) HAY UN SUBSISTEMA DETRÁS DE LA PUERTA — el núcleo abarca >= `piezas`
 *     ARCHIVOS distintos, ninguno de ellos el del cliente.
 *     INTENCIÓN: *"lo que hay que tapar es un SUBSISTEMA, no una pieza"*. Una
 *     puerta delante de UN archivo es un Proxy o un Adapter, no un Facade:
 *     Facade existe porque el cliente tiene que conocer VARIAS piezas a la
 *     vez. Reusa `FACADE_MIN_COLLABORATORS` (4), el número que este proyecto
 *     ya usa para esta misma pregunta (`hypotheses/facade.ts`,
 *     `pattern-structural.ts`), en vez de inventar uno nuevo.
 *
 * (2) LA MISMA COORDINACIÓN ESTÁ ESCRITA N VECES — >= `lugares` símbolos
 *     `function-like` distintos invocan, cada uno por su cuenta, TODOS los
 *     símbolos del núcleo.
 *     INTENCIÓN: *"la coordinación está REPETIDA, y es la MISMA"*. Las dos
 *     mitades importan y ninguna sobra. Que esté repetida es lo que hace que
 *     una puerta pague. Que sea la MISMA —el mismo conjunto de SÍMBOLOS
 *     invocados, no sólo los mismos archivos— es lo que separa "estos
 *     clientes repiten una receta" de "estos clientes usan la misma
 *     biblioteca de formas distintas". **Medido, y es la diferencia entre un
 *     ancla y ruido:** a granularidad de ARCHIVO, los 20 dialectos de
 *     `sqlalchemy` "coordinan" los mismos cuatro módulos de `sql/` en decenas
 *     de combinaciones — pero cada uno escribe una consulta DISTINTA con el
 *     mismo vocabulario, y ahí no falta ninguna puerta. A granularidad de
 *     SÍMBOLO esos casos desaparecen. Es la misma distinción que la condición
 *     (3) de `intra-file/homonymous-divergent-sequence.ts` ("sin pasos
 *     COMUNES son dos algoritmos que comparten un nombre genérico").
 *
 * (3) LA REPETICIÓN CRUZA EL ARCHIVO — esos símbolos viven en >=
 *     `archivosQueRepiten` archivos distintos.
 *     INTENCIÓN: *"la puerta es la mitigación MÁS BARATA disponible"*. Si toda
 *     la repetición vive dentro de UN archivo, una función privada de ese
 *     archivo (Extract Function) la borra y no cuesta nada: proponer un módulo
 *     nuevo ahí sería caro y peor. Un módulo nuevo sólo paga cuando la
 *     repetición está repartida entre archivos que no pueden compartir un
 *     ayudante privado.
 *
 * (4) LAS PIEZAS SE CONOCEN ENTRE SÍ — el subgrafo que inducen los archivos
 *     del núcleo (aristas `calls`/`references` en cualquier sentido) es
 *     CONEXO.
 *     INTENCIÓN: *"son UN subsistema, no responsabilidades sueltas"*. Facade
 *     tapa un conjunto de piezas RELACIONADAS; un conjunto de piezas ajenas
 *     entre sí que alguien coordina junto es un problema de Mediator o de
 *     Extract Class, y taparlo con una fachada esconde un God Object detrás de
 *     una API prolija. `hypotheses/facade.ts` ya hace exactamente esta
 *     pregunta en prosa, en su primer `toConfirm` ("¿son en verdad un
 *     subsistema coherente, o son responsabilidades sin relación entre sí?");
 *     esta condición la contesta con el grafo en vez de dejársela al lector.
 *
 * (5) RESOLUCIÓN VERIFICADA: LA PUERTA NO EXISTE YA — en sus DOS formas, que
 *     el grafo ve distinto y por eso se chequean por separado:
 *     (5a) ninguno de los lugares que repiten es INVOCADO desde otro archivo
 *          del mismo grupo. INTENCIÓN: *"si uno de ellos ya fuera la puerta, los demás lo
 *          llamarían en vez de repetir"*. Hace falta como chequeo propio porque
 *          una puerta escrita como UN SOLO símbolo que coordina el subsistema
 *          entero tiene, en el grafo, exactamente la misma forma que un lugar
 *          más que repite: lo único que las distingue es si los demás pasan por
 *          ella.
 *     (5b) ningún archivo AJENO al grupo y ajeno a las propias piezas invoca ya
 *          TODAS las piezas del núcleo estando referenciado por >= 2 archivos.
 *          INTENCIÓN: *"la puerta tampoco existe afuera"*.
 *     Juntas son la tercera condición de la receta de la Ola AC (RESOLUCIÓN
 *     VERIFICADA), la que AC3 midió que le faltaba a su ancla (26 de 60
 *     disparaban sobre un Template Method ya aplicado). **Medida por AD4 sobre
 *     los 16 repos: descarta el 91 % de los candidatos que pasan las
 *     condiciones (1)-(4)** — 429 → 40 en las 13 bibliotecas y 788 → 77 en
 *     `corpus-app/`.
 *
 * ─── QUÉ NO CHEQUEA, DECLARADO Y MEDIDO: EL ORDEN ─────────────────────────
 *
 * La fuerza dice "la MISMA secuencia". Este detector verifica el MISMO
 * CONJUNTO, no el mismo ORDEN, y la razón está medida, no supuesta: las
 * aristas `calls` del grafo COLAPSAN las ocurrencias en `weight` y no llevan
 * posición (`graph/types.ts#CodeGraphEdge`), así que **el grafo no puede
 * expresar una secuencia** — la misma medición que `intra-file/
 * homonymous-divergent-sequence.ts` publicó en la Ola AC. El orden sólo se lee
 * del árbol vivo, y acá los cuerpos que habría que comparar están en archivos
 * DISTINTOS: ninguna granularidad de este analizador entrega los árboles de
 * varios archivos a la vez (`detect/types.ts`: un detector `inter-file` recibe
 * `RepoUnit`, que ya liberó los árboles). Brecha declarada y no cerrada.
 *
 * ─── LAS ARISTAS AMBIGUAS CUENTAN, Y ESTÁ MEDIDO ──────────────────────────
 *
 * Una arista `calls` con `provenance: "ambiguous"` cuenta como invocación.
 * **Medido por AD4 sobre los 16 repos: excluyéndolas, este detector emite CERO
 * en los 16.** Es el mismo argumento que `hypotheses/facade.ts` ya escribió
 * para `outgoingCallCount` ("la existencia de la llamada es un hecho del
 * CÓDIGO y sólo su DESTINO es lo que el resolutor no supo fijar", con
 * `JsonSerializerInternalReader.cs`: 184 de 184 llamadas cruzadas ambiguas en
 * C#). Lo ambiguo VIAJA COMO AMBIGUO: cada hallazgo publica, en su evidencia,
 * cuántos de sus pasos apoyan en al menos una arista NO ambigua.
 *
 * ─── POR QUÉ `inter-file` Y NO `intra-file` ───────────────────────────────
 *
 * La unidad del hallazgo es un GRUPO de clientes repartidos en varios
 * archivos: la condición (3) exige que la repetición cruce el archivo, así que
 * ninguna granularidad más chica puede verla. No hace falta el árbol para
 * nada de lo que se chequea — todo sale de `calls`/`references`.
 */
import type { EdgeKind } from "../../graph/types.js";
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "piezas" | "lugares" | "archivosQueRepiten" | "llamadoresPorPaso";

/**
 * Prefijos de `RoleLocation.role` con los que este ancla marca cada ubicación.
 * `hypotheses/facade.ts` los importa para recuperar, del `Finding`, cuáles
 * ubicaciones son los CLIENTES que repiten y cuáles las PIEZAS del subsistema
 * — el mismo reparto que `homonymous-divergent-sequence` dejó implícito en sus
 * roles, acá explícito para que no haya un literal duplicado en dos archivos.
 */
export const ROLE_REPEATS = "repite la coordinación";
export const ROLE_PIECE = "pieza del subsistema";

/** Aristas que testimonian que dos archivos se conocen, para la condición (4).
 *  `calls` y `references` son las dos mitades (callee / no-callee) de la MISMA
 *  cascada de resolución (`graph/build.ts#relabelKind`), así que cualquiera de
 *  las dos vale como testimonio. */
const ACQUAINTANCE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["calls", "references"]);

interface Core {
  /** Ids de símbolo del núcleo, ordenados. */
  readonly steps: readonly string[];
  /** Archivos distintos que aportan al menos un paso. */
  readonly pieceFiles: readonly string[];
  /** Ids de símbolo de los clientes que invocan TODOS los pasos. */
  readonly callers: readonly string[];
  readonly callerFiles: readonly string[];
  /** Cuántos pasos apoyan en al menos una arista NO ambigua. */
  readonly confidentSteps: number;
}

export const detector: InterFileDetector<ThresholdKey, "repeated-collaborator-set"> = {
  id: "repeated-collaborator-set",
  kind: "repeated-collaborator-set",
  scope: "inter-file",
  needsGraph: true,
  title: "El mismo conjunto de colaboradores, coordinado de nuevo en cada cliente",
  needs: [],
  // La coordinación ES un conjunto de llamadas: sin `calls` este detector no
  // tiene insumo y no puede encontrar nada (no "encuentra cero"). `references`
  // se lee también, pero sólo AMPLÍA el testimonio de la condición (4) y de la
  // popularidad de una puerta ya existente: sin ella la cohesión se lee sólo
  // de `calls` — más estricta, nunca muda. Declarado en
  // `needs-edges-audit.test.ts#DELIBERATELY_EXCLUDED`.
  needsEdges: ["calls"],
  thresholds: {
    piezas: pisoDeclarado(4, {
      rationale:
        "cuántos ARCHIVOS distintos del subsistema tiene que tocar un cliente para que una puerta pague. Una puerta delante de UNA pieza es un Proxy/Adapter, no un Facade: Facade existe porque el cliente tiene que conocer VARIAS a la vez. Es el mismo FACADE_MIN_COLLABORATORS (4) que hypotheses/facade.ts y pattern-structural.ts ya usan para decidir 'esto es un subsistema y no una pieza suelta'; se reutiliza el número que el proyecto ya tiene para esta misma pregunta en vez de inventar uno.",
    }),
    lugares: pisoDeclarado(3, {
      rationale:
        "cuántos lugares distintos tienen que repetir la MISMA coordinación para que un módulo nuevo pague. Con DOS la mitigación más barata es extraer una función compartida y llamarla desde los dos sitios (Extract Function), no abrir una puerta al subsistema: la fuerza está pero el patrón no paga. Es la condición de ESCALA que la Ola AC midió como la que le faltaba a su ancla de State (7 máquinas de estados reales, sólo 1 justificaba el patrón). Piso de ESCALA declarado, no una magnitud calibrada contra un corpus.",
    }),
    archivosQueRepiten: presencia({
      rationale:
        "la repetición tiene que CRUZAR el archivo: si los N lugares viven en el mismo archivo, una función privada de ese archivo los unifica sin crear nada. No hay magnitud que calibrar — la pregunta es binaria ('¿cruza o no cruza?') y su respuesta mínima es 2.",
    }),
    llamadoresPorPaso: presupuesto(400, {
      rationale:
        "tope de trabajo, no de detección: al cruzar candidatos por el índice invertido `paso -> quién lo invoca`, un paso invocado por más de 400 candidatos haría el cruce cuadrático sobre el repo entero (gitea: 1.969 candidatos). Saltearlo sólo puede hacer que un núcleo NO se encuentre — nunca inventa uno —, y un paso tan universal es, por definición, lo contrario de la coordinación privada que este detector busca.",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de volumen por repo, del mismo orden que el resto del catálogo inter-file. Medido: el repo más poblado de las dos poblaciones (gitea) emite 51 con estos pisos, así que el tope no recorta nada hoy — está para que un repo atípico no publique miles de tarjetas del mismo kind.",
  }),
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!graph) return [];

    const piezas = ctx.threshold("piezas");
    const lugares = ctx.threshold("lugares");
    const archivosQueRepiten = ctx.threshold("archivosQueRepiten");
    const llamadoresPorPaso = ctx.threshold("llamadoresPorPaso");

    const nodeById = new Map<string, { file: string; symbolPath: readonly string[]; family?: string; startLine?: number; endLine?: number }>();
    for (const n of graph.nodes) {
      if (n.kind !== "symbol") continue;
      if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    }

    /** `símbolo function-like -> conjunto de símbolos que invoca en OTRO archivo`. */
    const stepsOf = new Map<string, Set<string>>();
    /** `"<llamador>\u0000<paso>"` cuya arista NO es ambigua. La confianza es del
     *  PAR, no del paso: que OTRO archivo alcance ese mismo símbolo con una
     *  arista resuelta no dice nada sobre la invocación de ESTE llamador. */
    const confidentPairs = new Set<string>();
    /** `archivo -> archivos que lo invocan/referencian` (para la puerta y su uso). */
    const callerFilesOf = new Map<string, Set<string>>();
    /** `archivo -> archivos que ese archivo invoca` (para la cohesión del núcleo). */
    const acquaintedFiles = new Map<string, Set<string>>();
    /** `archivo -> archivos de OTROS archivos que invoca` (para detectar la puerta ajena, 5b). */
    const calledFilesOfFile = new Map<string, Set<string>>();
    /** `símbolo -> archivos desde los que lo invocan` (para la puerta de adentro, 5a). */
    const callerSymbolFilesOf = new Map<string, Set<string>>();

    for (const e of graph.edges) {
      if (!ACQUAINTANCE_EDGE_KINDS.has(e.kind)) continue;
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      if (!from || !to || from.file === to.file) continue;

      let refs = callerFilesOf.get(to.file);
      if (!refs) {
        refs = new Set();
        callerFilesOf.set(to.file, refs);
      }
      refs.add(from.file);

      let acq = acquaintedFiles.get(from.file);
      if (!acq) {
        acq = new Set();
        acquaintedFiles.set(from.file, acq);
      }
      acq.add(to.file);

      if (e.kind !== "calls") continue;

      let called = calledFilesOfFile.get(from.file);
      if (!called) {
        called = new Set();
        calledFilesOfFile.set(from.file, called);
      }
      called.add(to.file);

      let incoming = callerSymbolFilesOf.get(e.to);
      if (!incoming) {
        incoming = new Set();
        callerSymbolFilesOf.set(e.to, incoming);
      }
      incoming.add(from.file);

      if (from.family !== "function-like") continue;
      let steps = stepsOf.get(e.from);
      if (!steps) {
        steps = new Set();
        stepsOf.set(e.from, steps);
      }
      steps.add(e.to);
      if (e.provenance !== "ambiguous") confidentPairs.add(`${e.from}\u0000${e.to}`);
    }

    const fileOfStep = (id: string): string => nodeById.get(id)?.file ?? "";

    // (1) candidatos: un cliente que toca >= `piezas` archivos distintos
    const candidates = new Map<string, ReadonlySet<string>>();
    for (const [caller, steps] of stepsOf) {
      const files = new Set<string>();
      for (const s of steps) files.add(fileOfStep(s));
      if (files.size >= piezas.value) candidates.set(caller, steps);
    }
    if (candidates.size === 0) return [];

    // índice invertido `paso -> candidatos que lo invocan`, para no cruzar
    // TODOS los pares de candidatos del repo.
    const callersOfStep = new Map<string, string[]>();
    for (const [caller, steps] of candidates) {
      for (const s of steps) {
        const list = callersOfStep.get(s);
        if (list) list.push(caller);
        else callersOfStep.set(s, [caller]);
      }
    }

    // (2) núcleos: intersecciones de pares que siguen abarcando >= `piezas` archivos
    const cores = new Map<string, Core>();
    const orderedCandidates = [...candidates.keys()].sort();
    for (const c1 of orderedCandidates) {
      const mine = candidates.get(c1)!;
      const neighbours = new Set<string>();
      for (const s of mine) {
        const list = callersOfStep.get(s);
        if (!list || list.length > llamadoresPorPaso.value) continue;
        for (const other of list) neighbours.add(other);
      }
      neighbours.delete(c1);
      for (const c2 of [...neighbours].sort()) {
        if (c2 <= c1) continue;
        const theirs = candidates.get(c2)!;
        const shared: string[] = [];
        for (const s of mine) if (theirs.has(s)) shared.push(s);
        const pieceFiles = new Set<string>();
        for (const s of shared) pieceFiles.add(fileOfStep(s));
        if (pieceFiles.size < piezas.value) continue;
        shared.sort();
        const key = shared.join(" ");
        if (cores.has(key)) continue;

        const sharedSet = new Set(shared);
        const callers: string[] = [];
        for (const [caller, steps] of candidates) {
          let all = true;
          for (const s of sharedSet) {
            if (!steps.has(s)) {
              all = false;
              break;
            }
          }
          if (all) callers.push(caller);
        }
        callers.sort();
        const callerFiles = [...new Set(callers.map((c) => nodeById.get(c)?.file ?? ""))].sort();
        cores.set(key, {
          steps: shared,
          pieceFiles: [...pieceFiles].sort(),
          callers,
          callerFiles,
          confidentSteps: shared.filter((step) => callers.some((c) => confidentPairs.has(`${c}\u0000${step}`))).length,
        });
      }
    }

    /** (4) el subgrafo de los archivos del núcleo es CONEXO. */
    const cohesive = (files: readonly string[]): boolean => {
      const index = new Map(files.map((f, i) => [f, i]));
      const parent = files.map((_, i) => i);
      const find = (a: number): number => {
        let x = a;
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]!]!;
          x = parent[x]!;
        }
        return x;
      };
      for (const f of files) {
        for (const other of acquaintedFiles.get(f) ?? []) {
          const j = index.get(other);
          if (j === undefined) continue;
          const a = find(index.get(f)!);
          const b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
      const roots = new Set(files.map((_, i) => find(i)));
      return roots.size === 1;
    };

    /** (5a) ¿alguno de los lugares que repiten INVOCA a otro del mismo grupo?
     *  Si uno de ellos ya fuera la puerta, los demás lo llamarían en vez de
     *  repetir: que uno llame a otro es evidencia POSITIVA de que la
     *  coordinación ya está concentrada en ese otro. Es la forma de la puerta
     *  que (5b) no puede ver, porque una puerta escrita como UN SOLO símbolo
     *  que coordina el subsistema entero tiene, en el grafo, exactamente la
     *  misma forma que un lugar más que repite — lo único que las distingue es
     *  si los demás pasan por ella. */
    const doorInsideGroup = (core: Core): string | null => {
      for (const caller of core.callers) {
        const fromFiles = callerSymbolFilesOf.get(caller);
        if (!fromFiles) continue;
        const own = nodeById.get(caller)?.file ?? "";
        for (const other of core.callerFiles) if (other !== own && fromFiles.has(other)) return caller;
      }
      return null;
    };

    /** (5b) ¿ya existe un archivo AJENO que coordine el núcleo ENTERO y que alguien use? */
    const existingDoor = (core: Core): string | null => {
      const excluded = new Set<string>([...core.callerFiles, ...core.pieceFiles]);
      const contenders = new Set<string>();
      for (const f of core.pieceFiles) for (const caller of callerFilesOf.get(f) ?? []) contenders.add(caller);
      for (const candidate of [...contenders].sort()) {
        if (excluded.has(candidate)) continue;
        const called = calledFilesOfFile.get(candidate);
        if (!called) continue;
        if (!core.pieceFiles.every((f) => called.has(f))) continue;
        if ((callerFilesOf.get(candidate)?.size ?? 0) < 2) continue;
        return candidate;
      }
      return null;
    };

    const surviving: Core[] = [];
    for (const core of cores.values()) {
      if (core.callers.length < lugares.value) continue; // (2)
      if (core.callerFiles.length <= archivosQueRepiten.value) continue; // (3): presencia ⇒ `> 1` es `>= 2`
      if (!cohesive(core.pieceFiles)) continue; // (4)
      if (doorInsideGroup(core)) continue; // (5a)
      if (existingDoor(core)) continue; // (5b)
      surviving.push(core);
    }

    // Un núcleo contenido en otro, con los mismos clientes (o menos), es el
    // MISMO problema visto más chico: se conserva el más grande. Mismo criterio
    // de "una candidata por causa" que `homonymous-divergent-sequence` aplica
    // por (miembro + declarantes).
    surviving.sort((a, b) => b.steps.length - a.steps.length || b.callers.length - a.callers.length || (a.steps.join() < b.steps.join() ? -1 : 1));
    const maximal: Core[] = [];
    for (const core of surviving) {
      const stepSet = new Set(core.steps);
      const callerSet = new Set(core.callers);
      const contained = maximal.some(
        (kept) =>
          kept.steps.length > core.steps.length &&
          core.steps.every((s) => kept.steps.includes(s)) &&
          [...callerSet].every((c) => kept.callers.includes(c)) &&
          stepSet.size < kept.steps.length,
      );
      if (!contained) maximal.push(core);
    }

    const findings: RawFinding[] = [];
    // El tope de volumen NO se aplica acá: `detect/run.ts#capDetectorFindings`
    // resuelve y aplica `maxFindings` sobre lo que este `run()` devuelve, que es
    // donde el proyecto cuenta el presupuesto y registra el truncamiento.
    for (const core of maximal) {
      const nameOf = (id: string): string => nodeById.get(id)?.symbolPath.at(-1) ?? id;
      const locations: RoleLocation[] = [];
      for (const caller of core.callers) {
        const node = nodeById.get(caller);
        if (!node) continue;
        locations.push({
          file: node.file,
          startLine: node.startLine ?? 1,
          endLine: node.endLine ?? node.startLine ?? 1,
          symbol: node.symbolPath.join("."),
          role: `${ROLE_REPEATS}: invoca los ${core.steps.length} pasos del núcleo (${core.pieceFiles.length} archivos) por su cuenta`,
        });
      }
      for (const file of core.pieceFiles) {
        const stepsHere = core.steps.filter((s) => fileOfStep(s) === file).map(nameOf).sort();
        const summary = repo.files.find((f) => f.path === file);
        locations.push({
          file,
          startLine: 1,
          endLine: Math.max(1, summary?.lines ?? 1),
          role: `${ROLE_PIECE}: aporta ${stepsHere.length} paso(s) que todos repiten — ${stepsHere.join(", ")}`,
        });
      }
      if (locations.length === 0) continue;

      const stepNames = core.steps.map(nameOf).sort();
      findings.push({
        variant: core.pieceFiles.join(","),
        title: `${core.callers.length} lugares repiten la misma coordinación de ${core.pieceFiles.length} archivos`,
        detail:
          `${core.callers.length} símbolos distintos, repartidos en ${core.callerFiles.length} archivos, invocan cada uno TODOS estos ${core.steps.length} pasos: ${stepNames.join(", ")}. ` +
          `Los pasos vienen de ${core.pieceFiles.length} archivos que se conocen entre sí (${core.pieceFiles.join(", ")}), y NINGÚN archivo del repositorio los coordina hoy a los ${core.pieceFiles.length}. ` +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (la misma coordinación de varias piezas, escrita de nuevo en cada lugar que la necesita) — " +
          "si conviene una puerta única, si ya hay una a medias, o si las piezas no son en verdad un subsistema, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "archivos del subsistema que cada lugar tiene que coordinar", value: core.pieceFiles.length, threshold: piezas },
          { label: "lugares que repiten la misma coordinación", value: core.callers.length, threshold: lugares },
          { label: "archivos distintos donde vive la repetición", value: core.callerFiles.length, threshold: archivosQueRepiten },
        ],
        evidence: [
          { label: "pasos del núcleo", value: core.steps.length, note: stepNames.join(", ") },
          {
            label: "pasos con al menos una arista NO ambigua",
            value: core.confidentSteps,
            note: `de ${core.steps.length}; el resto apoya sólo en aristas cuya resolución quedó ambigua — lo ambiguo viaja como ambiguo`,
          },
          { label: "archivos que ya coordinan el núcleo entero", value: 0, note: "condición de RESOLUCIÓN VERIFICADA: si hubiera uno, este hallazgo no existiría" },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 25 + core.pieceFiles.length * 3 + core.callers.length * 2),
        advice: {
          primary: {
            name: "Extract Class",
            kind: "refactorizacion",
            why:
              `Los ${core.steps.length} pasos (${stepNames.join(", ")}) están escritos completos en ${core.callers.length} lugares distintos. ` +
              `Un módulo que los ejecute una sola vez deja a cada lugar con una llamada en vez de ${core.steps.length}.`,
            source: "https://refactoring.com/catalog/extractClass.html",
          },
        },
      });
    }

    return findings;
  },
};
