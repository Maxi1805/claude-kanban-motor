/**
 * `invariant-scaffold-varying-call` — OLA AE, frente AE6. EL ANCLA-FUERZA DE
 * COMMAND.
 *
 * ─── POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA ──────────────────────────
 *
 * Command tenía dos anclas —`duplication` y `distributed-duplication`— y las
 * dos son SÍNTOMAS: miden que dos cuerpos se parecen, que es una propiedad del
 * TEXTO y no dice absolutamente nada sobre si una operación necesita viajar
 * como dato. Medido por AE6 sobre volcados propios del día, en las dos
 * poblaciones (13 bibliotecas + las 8 aplicaciones de `corpus-app/`):
 *
 *   **48 hipótesis de Command, de las que 25 terminan `aplicado-eludido`,
 *   23 `parcial`, 0 `ya-aplicado` y CERO `ausente`.**
 *
 * Un ancla que no puede emitir `ausente` NUNCA descubre dónde FALTA el patrón.
 * Es la tercera vez que el proyecto mide esta patología (Facade 0/288, AD4;
 * `Decorator · homonymous-delegation` 0/111, Ola AC). Y hay un segundo número
 * del mismo censo: de las dos anclas, **`distributed-duplication` produce CERO
 * hipótesis de Command en las dos poblaciones** (10 hallazgos crudos en
 * bibliotecas, 69 en aplicaciones, 0 hipótesis).
 *
 * **Las dos anclas viejas siguen exactamente donde estaban.** Esta ola es
 * ADITIVA: acá se SUMA un camino, no se apaga ninguno.
 *
 * ─── LA FUERZA QUE COMMAND RESUELVE, ESCRITA COMO LA RESUELVE EL PATRÓN ────
 *
 * *El MISMO tratamiento, escrito de nuevo alrededor de CADA operación.* Varios
 * lugares comparten un conjunto INVARIANTE de colaboradores —el tratamiento
 * que rodea la llamada— y lo único que cambia entre un lugar y el siguiente es
 * CUÁL operación se invoca. Hoy esa operación está SOLDADA al código de cada
 * copia (una llamada directa), así que el tratamiento se copia una vez por
 * operación. Para escribir el tratamiento UNA sola vez, la operación tiene que
 * poder VIAJAR COMO DATO — encolarse, deshacerse, reintentarse, registrarse —,
 * que es exactamente lo que Command hace al reificar la solicitud.
 *
 * Es una propiedad del GRAFO —quién invoca a quién—, no del parecido entre dos
 * cuerpos. Dos funciones pueden ser textualmente casi idénticas sin que ninguna
 * operación necesite viajar (el remedio ahí es Extract Function), y tres
 * funciones que no se parecen en nada en el texto pueden compartir el mismo
 * tratamiento invariante alrededor de tres operaciones distintas.
 *
 * ─── LAS DOS TRAMPAS, Y DÓNDE ESTÁ CADA DIFERENCIA ────────────────────────
 *
 * **(a) Contra Facade.** "Varios lugares invocan el mismo conjunto de
 * símbolos" es, letra por letra, el ancla `repeated-collaborator-set` de AD4.
 * La diferencia es LA RANURA VARIABLE: en Facade los lugares repiten el
 * conjunto ENTERO y no hay nada que varíe, así que la mitigación es UNA puerta
 * que ejecute todo. Acá cada lugar invoca, ADEMÁS del tratamiento común, una
 * operación PROPIA que ningún otro lugar del grupo invoca — y por eso la
 * mitigación no es tapar el conjunto sino hacer que esa una pieza viaje. La
 * condición (2) exige la ranura y es lo que separa un ancla de la otra.
 *
 * **(b) Contra Strategy / Visitor.** Si lo que varía es un SUB-ALGORITMO
 * entero (cada lugar difiere en tres o cuatro llamadas propias), lo que falta
 * es una familia de algoritmos, no una solicitud reificada. Por eso la ranura
 * tiene tamaño UNO: **exactamente un símbolo propio por lugar**. Medido sobre
 * los volcados de grafo heredados de AC3, y es la mitad del embudo: pasar de
 * "≥1 símbolo propio" a "exactamente 1" descarta el 91,2 % de los grupos en las
 * 11 bibliotecas medidas (784 → 69) y el 89,5 % en gitea (2.270 → 238).
 *
 * ─── LAS CONDICIONES, CON LA INTENCIÓN DE CADA UNA ────────────────────────
 *
 * (1) TRATAMIENTO INVARIANTE — >= `tratamiento` símbolos distintos invocados
 *     por TODOS los lugares del grupo.
 *     INTENCIÓN: *"lo que se copia alrededor de cada llamada es un
 *     TRATAMIENTO, no una llamada más"*. Con un solo colaborador compartido no
 *     hay nada que izar: la copia es gratis y no existe el problema.
 *
 * (2) RANURA VARIABLE DE TAMAÑO UNO — cada lugar invoca EXACTAMENTE UN símbolo
 *     que ningún otro lugar del grupo invoca.
 *     INTENCIÓN: *"lo único que cambia entre copia y copia es CUÁL operación
 *     se invoca"*. Las dos mitades cortan las dos trampas de arriba: que HAYA
 *     ranura separa Command de Facade; que la ranura tenga tamaño UNO separa
 *     Command de Strategy/Visitor.
 *
 * (3) LAS OPERACIONES SON INTERCAMBIABLES — las operaciones propias tienen
 *     todas la MISMA aridad, y conocida.
 *     INTENCIÓN: *"un solo miembro puede alojarlas a todas"*. Si las
 *     operaciones no comparten firma, no hay un `execute(...)` posible sin
 *     antes rediseñarlas, y la mitigación deja de ser Command. Es la misma
 *     pregunta que `hypotheses/command.ts` ya hace por aridad para separar
 *     `parcial` de `ausente`, contestada acá antes de emitir.
 *
 * (4) LA REPETICIÓN CRUZA EL ARCHIVO — los lugares viven en >=
 *     `archivosQueRepiten` archivos distintos.
 *     INTENCIÓN: *"el patrón es la mitigación MÁS BARATA disponible"*. Dentro
 *     de un solo archivo, un ayudante privado que reciba la operación como
 *     parámetro borra la repetición sin crear ningún tipo: proponer Command
 *     ahí sería más caro que el problema.
 *
 * (5) RESOLUCIÓN VERIFICADA: LA OPERACIÓN NO VIAJA YA COMO DATO — en sus TRES
 *     formas, que el grafo ve distinto y por eso se chequean por separado:
 *
 *     (5a) ningún lugar del grupo es INVOCADO por otro lugar del grupo.
 *          INTENCIÓN: *"si uno de ellos ya fuera el invocador genérico, los
 *          demás pasarían por él en vez de repetir"*. Hace falta como chequeo
 *          propio porque un invocador único y "un lugar más que repite" tienen
 *          en el grafo exactamente la misma forma: lo único que los distingue
 *          es si los demás pasan por él. Mismo argumento que la (5a) de
 *          `repeated-collaborator-set`.
 *     (5b) NO existe ya un protocolo compartido REAL entre los DUEÑOS de >= 2
 *          de las operaciones: una interfaz con aristas `implements`/
 *          `satisfies` REALES de >= 2 de esos dueños, y un miembro común por
 *          (nombre, aridad).
 *          INTENCIÓN: *"si las operaciones ya son objetos intercambiables,
 *          Command YA ESTÁ y la mitigación es usarlo, no introducirlo"*. Nunca
 *          inferido por conjunto de miembros — regla dura del proyecto: sólo se
 *          leen aristas reales. Es la MISMA terna (interfaz + miembro común por
 *          nombre y aridad) que `hypotheses/command.ts#commandInterfaceEvidence`
 *          ya usa; acá se contesta antes de emitir.
 *     (5c) NINGÚN portador sostiene ya >= 2 de las operaciones (`carries`) y
 *          recibe >= 1 `invokes-indirect`.
 *          INTENCIÓN: *"la cola/lista de comandos ya existe"*. Es literalmente
 *          la definición que `hypotheses/command.ts#carrierInvokerFor` ya
 *          escribió para el estado COMPLETO de Command: si un portador agrupa
 *          las operaciones y alguien lo invoca indirectamente, la operación YA
 *          viaja como dato y no falta nada.
 *
 * ─── LO QUE **NO** ES COMPUERTA, Y POR QUÉ ────────────────────────────────
 *
 * *Los dueños de los lugares comparten ancestro* (`extends`/`mixes-in`) es la
 * clase entera de falso que AD4 dejó escrita sin implementar: si los lugares
 * son HERMANOS de una jerarquía, el tratamiento ya tiene casa y la mitigación
 * barata es subirlo al ancestro (Pull Up / Template Method), no hacer viajar la
 * operación. **Se mide y VIAJA como discriminador de la hipótesis, no como
 * compuerta del detector**, por dos razones medidas: (i) como compuerta
 * descartaba 3 de los 9 grupos de biblioteca de la sonda, y uno de ellos son
 * los `J{Array,Constructor,Property}.Load` de newtonsoft-json, que son
 * `static` — en C# subirlos al ancestro **no es una opción**, así que la
 * compuerta habría dado la respuesta equivocada; (ii) esta ola es ADITIVA y se
 * prefiere que la información viaje a que un candidato desaparezca.
 *
 * ─── QUÉ NO CHEQUEA, DECLARADO: EL ORDEN Y EL "ALREDEDOR" ─────────────────
 *
 * La fuerza dice que el tratamiento RODEA a la llamada (algo antes, algo
 * después: encolar, registrar, deshacer). Este detector verifica el mismo
 * CONJUNTO de colaboradores, no su POSICIÓN respecto de la operación, y la
 * razón está medida y es la misma que publicaron AC3 y AD4: las aristas `calls`
 * COLAPSAN las ocurrencias en `weight` y no llevan posición
 * (`graph/types.ts#CodeGraphEdge`), así que el grafo **no puede expresar una
 * secuencia**; y los cuerpos que habría que comparar están en archivos
 * DISTINTOS, mientras que un detector `inter-file` recibe un `RepoUnit` que ya
 * liberó los árboles (`detect/types.ts#RepoFunctionUnit`). Brecha declarada y
 * no cerrada; viaja en el `toConfirm` de la hipótesis.
 *
 * ─── LAS ARISTAS AMBIGUAS CUENTAN, Y VIAJAN COMO AMBIGUAS ─────────────────
 *
 * Una arista `calls` con `provenance: "ambiguous"` cuenta como invocación,
 * mismo criterio y mismo argumento que `repeated-collaborator-set` (la
 * existencia de la llamada es un hecho del CÓDIGO; sólo su DESTINO quedó sin
 * fijar). Cada hallazgo publica cuántos de sus colaboradores del tratamiento
 * apoyan en al menos una arista NO ambigua, y si la operación de cada lugar lo
 * hace: lo ambiguo viaja como ambiguo.
 *
 * ─── POR QUÉ `inter-file` ─────────────────────────────────────────────────
 *
 * La unidad del hallazgo es un GRUPO de lugares repartidos en varios archivos
 * (condición 4), así que ninguna granularidad más chica puede verlo. No hace
 * falta el árbol: todo sale de `calls`/`contains`/`implements`/`satisfies`/
 * `extends`/`mixes-in`/`carries`/`invokes-indirect`.
 */
import type { EdgeKind } from "../../graph/types.js";
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "tratamiento" | "lugares" | "archivosQueRepiten" | "llamadoresPorPaso";

/**
 * Prefijos de `RoleLocation.role` con los que este ancla marca cada ubicación.
 * `hypotheses/command.ts` los importa para recuperar, del `Finding`, cuáles
 * ubicaciones son los LUGARES que repiten y cuál es la OPERACIÓN soldada en
 * cada uno — mismo criterio que `repeated-collaborator-set` estrenó, para que
 * no haya un literal duplicado en dos archivos.
 */
export const ROLE_SITE = "repite el tratamiento";
export const ROLE_OPERATION = "operación soldada";
export const ROLE_TREATMENT = "colaborador del tratamiento";

const INTERFACE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["implements", "satisfies"]);
const ANCESTOR_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["extends", "mixes-in"]);

interface Grupo {
  /** Ids de símbolo del tratamiento invariante, ordenados. */
  readonly treatment: readonly string[];
  /** `[lugar, operación soldada]`, ordenado por lugar. */
  readonly sites: readonly (readonly [string, string])[];
  readonly siteFiles: readonly string[];
  /** Aridad común de las operaciones. */
  readonly arity: number;
  /** Cuántos colaboradores del tratamiento apoyan en >= 1 arista NO ambigua. */
  readonly confidentTreatment: number;
  /** Cuántas operaciones apoyan en una arista NO ambigua. */
  readonly confidentOperations: number;
  /** Los dueños `class-like` de los lugares comparten ancestro (para el discriminador). */
  readonly siblingSites: boolean;
}

export const detector: InterFileDetector<ThresholdKey, "invariant-scaffold-varying-call"> = {
  id: "invariant-scaffold-varying-call",
  kind: "invariant-scaffold-varying-call",
  scope: "inter-file",
  needsGraph: true,
  title: "El mismo tratamiento, escrito de nuevo alrededor de cada operación",
  needs: [],
  // El tratamiento y la operación SON llamadas: sin `calls` este detector no
  // tiene insumo y no puede encontrar nada (no "encuentra cero"). Las otras
  // seis clases de arista que lee (`contains`, `implements`, `satisfies`,
  // `extends`, `mixes-in`, `carries`, `invokes-indirect`) sólo pueden RETIRAR
  // candidatos (condición 5) o anotar el discriminador de hermandad: sin ellas
  // el detector es más generoso, nunca mudo. Declarado en
  // `needs-edges-audit.test.ts#DELIBERATELY_EXCLUDED`.
  needsEdges: ["calls"],
  thresholds: {
    tratamiento: pisoDeclarado(3, {
      rationale:
        "cuántos colaboradores DISTINTOS tiene que compartir el tratamiento para que copiarlo duela. Con UNO el 'tratamiento' es una llamada más: no hay nada que izar y la copia es gratis. Con DOS sigue siendo más barato copiar que diseñar un protocolo y un invocador. TRES colaboradores idénticos alrededor de cada llamada es donde las copias empiezan a divergir y donde escribir el tratamiento UNA vez paga. Piso de ESCALA declarado, escrito ANTES de medir; NO se reutiliza COMMAND_MIN_TRIGGER_HANDLERS (2) porque ése cuenta otra cosa (manejadores, no colaboradores del tratamiento).",
    }),
    lugares: pisoDeclarado(3, {
      rationale:
        "cuántos lugares tienen que repetir el tratamiento para que Command pague. Con DOS la mitigación más barata es extraer UNA función que reciba la operación como parámetro y llamarla dos veces: se borra UNA copia, y Command cobra un protocolo + un tipo por operación + un invocador. Con TRES se borran DOS copias y, sobre todo, cada operación NUEVA pasa a costar +1 tipo en vez de +1 copia del tratamiento. Es la condición de ESCALA que la Ola AC midió que le faltaba a su ancla de State (7 máquinas de estados reales, 6 de ellas con ramas de una línea). Piso de ESCALA declarado, escrito ANTES de medir.",
    }),
    archivosQueRepiten: presencia({
      rationale:
        "la repetición tiene que CRUZAR el archivo: si los N lugares viven en el mismo archivo, un ayudante privado de ese archivo que reciba la operación como parámetro los unifica sin crear ningún tipo. No hay magnitud que calibrar — la pregunta es binaria ('¿cruza o no cruza?') y su respuesta mínima es 2.",
    }),
    llamadoresPorPaso: presupuesto(400, {
      rationale:
        "tope de TRABAJO, no de detección: al cruzar candidatos por el índice invertido `colaborador -> quién lo invoca`, un colaborador invocado por más de 400 candidatos haría el cruce cuadrático sobre el repo entero. Saltearlo sólo puede hacer que un grupo NO se encuentre — nunca inventa uno —, y un colaborador tan universal es, por definición, lo contrario del tratamiento privado que este detector busca. Mismo número y misma razón que `repeated-collaborator-set`.",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de VOLUMEN por repo, del mismo orden que el resto del catálogo inter-file. Medido sobre los volcados de grafo heredados: el repo más poblado de las dos poblaciones (gitea) queda en un dígito con estos pisos, así que el tope no recorta nada hoy — está para que un repo atípico no publique miles de tarjetas del mismo kind.",
  }),
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!graph) return [];

    const tratamiento = ctx.threshold("tratamiento");
    const lugares = ctx.threshold("lugares");
    const archivosQueRepiten = ctx.threshold("archivosQueRepiten");
    const llamadoresPorPaso = ctx.threshold("llamadoresPorPaso");

    interface Sym {
      readonly id: string;
      readonly file: string;
      readonly symbolPath: readonly string[];
      readonly family?: string;
      readonly startLine?: number;
      readonly endLine?: number;
      readonly arity?: number | null;
    }
    const nodeById = new Map<string, Sym>();
    for (const n of graph.nodes) {
      if (n.kind !== "symbol") continue;
      if (!nodeById.has(n.id)) nodeById.set(n.id, n as unknown as Sym);
    }

    /** `símbolo function-like -> conjunto de símbolos que invoca`. */
    const callees = new Map<string, Set<string>>();
    /** `símbolo -> símbolos que lo invocan` (para la condición 5a). */
    const callersOf = new Map<string, Set<string>>();
    /** `"<llamador> <invocado>"` cuya arista NO es ambigua. La confianza es
     *  del PAR: que OTRO alcance el mismo símbolo con una arista resuelta no
     *  dice nada sobre la invocación de ESTE llamador. */
    const confidentPairs = new Set<string>();
    /** `miembro -> dueño`, leído de la MISMA arista `contains`. */
    const ownerByMember = new Map<string, string>();
    /** `dueño -> miembros`. */
    const membersOf = new Map<string, string[]>();
    /** `interfaz -> implementadores` (`implements`/`satisfies` REALES). */
    const implementersOf = new Map<string, Set<string>>();
    /** `tipo -> ancestros directos` (`extends`/`mixes-in`). */
    const ancestorsOf = new Map<string, Set<string>>();
    /** `símbolo -> portadores que lo llevan como valor` (`carries`). */
    const carriersOf = new Map<string, Set<string>>();
    /** `portador -> símbolos que lleva`. */
    const carriedBy = new Map<string, Set<string>>();
    /** portadores que reciben >= 1 `invokes-indirect`. */
    const indirectlyInvoked = new Set<string>();

    const add = (m: Map<string, Set<string>>, k: string, v: string): void => {
      const s = m.get(k);
      if (s) s.add(v);
      else m.set(k, new Set([v]));
    };

    for (const e of graph.edges) {
      if (e.kind === "calls") {
        const from = nodeById.get(e.from);
        if (!from || from.family !== "function-like" || !nodeById.has(e.to)) continue;
        add(callees, e.from, e.to);
        add(callersOf, e.to, e.from);
        if (e.provenance !== "ambiguous") confidentPairs.add(`${e.from} ${e.to}`);
        continue;
      }
      if (e.kind === "contains") {
        if (!ownerByMember.has(e.to)) ownerByMember.set(e.to, e.from);
        const list = membersOf.get(e.from);
        if (list) list.push(e.to);
        else membersOf.set(e.from, [e.to]);
        continue;
      }
      if (INTERFACE_EDGE_KINDS.has(e.kind)) {
        add(implementersOf, e.to, e.from);
        continue;
      }
      if (ANCESTOR_EDGE_KINDS.has(e.kind)) {
        add(ancestorsOf, e.from, e.to);
        continue;
      }
      if (e.kind === "carries") {
        add(carriersOf, e.to, e.from);
        add(carriedBy, e.from, e.to);
        continue;
      }
      if (e.kind === "invokes-indirect") indirectlyInvoked.add(e.to);
    }

    // (1) candidatos: un lugar necesita, como mínimo, el tratamiento entero MÁS
    // su operación propia. Menos que eso no puede formar un grupo.
    const candidates = new Map<string, ReadonlySet<string>>();
    for (const [site, cs] of callees) if (cs.size >= tratamiento.value + 1) candidates.set(site, cs);
    if (candidates.size < lugares.value) return [];

    // índice invertido `colaborador -> candidatos que lo invocan`, para no
    // cruzar TODOS los pares de candidatos del repo.
    const callersOfStep = new Map<string, string[]>();
    for (const [site, cs] of candidates) {
      for (const c of cs) {
        const list = callersOfStep.get(c);
        if (list) list.push(site);
        else callersOfStep.set(c, [site]);
      }
    }

    /** Firmas `(nombre, aridad)` de los miembros `function-like` de un tipo. */
    const signaturesOf = (owner: string): Set<string> => {
      const out = new Set<string>();
      for (const m of membersOf.get(owner) ?? []) {
        const n = nodeById.get(m);
        if (n && n.family === "function-like") out.add(`${n.symbolPath[n.symbolPath.length - 1]} ${n.arity ?? "?"}`);
      }
      return out;
    };

    /** Cierre transitivo de ancestros, con tope de profundidad implícito por el
     *  conjunto `seen` (un ciclo en la jerarquía no cuelga el recorrido). */
    const ancestorClosure = (t: string): Set<string> => {
      const seen = new Set<string>([t]);
      const stack = [t];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const a of ancestorsOf.get(cur) ?? []) {
          if (seen.has(a)) continue;
          seen.add(a);
          stack.push(a);
        }
      }
      return seen;
    };

    // (2) semillas: la intersección de un par de candidatos, si llega al piso.
    const grupos = new Map<string, Grupo | null>();
    const ordered = [...candidates.keys()].sort();
    for (const s1 of ordered) {
      const mine = candidates.get(s1)!;
      const neighbours = new Set<string>();
      for (const c of mine) {
        const list = callersOfStep.get(c);
        if (!list || list.length > llamadoresPorPaso.value) continue;
        for (const other of list) neighbours.add(other);
      }
      neighbours.delete(s1);
      for (const s2 of [...neighbours].sort()) {
        if (s2 <= s1) continue;
        const theirs = candidates.get(s2)!;
        const seed: string[] = [];
        for (const c of mine) if (theirs.has(c)) seed.push(c);
        if (seed.length < tratamiento.value) continue;
        seed.sort();
        const key = seed.join(" ");
        if (grupos.has(key)) continue;
        grupos.set(key, null);

        // todos los candidatos que invocan el tratamiento semilla entero
        const members: string[] = [];
        for (const [site, cs] of candidates) {
          let all = true;
          for (const c of seed) {
            if (!cs.has(c)) {
              all = false;
              break;
            }
          }
          if (all) members.push(site);
        }
        if (members.length < lugares.value) continue;
        members.sort();

        // el tratamiento REAL es la intersección de TODOS los miembros, no sólo
        // la del par semilla: así el hallazgo publica el invariante completo.
        const treatment = new Set(seed);
        for (const m of members) for (const c of treatment) if (!candidates.get(m)!.has(c)) treatment.delete(c);
        if (treatment.size < tratamiento.value) continue;

        // (2) RANURA VARIABLE DE TAMAÑO UNO: el símbolo propio de cada lugar,
        // exclusivo respecto de TODOS los otros miembros del grupo.
        const sites: (readonly [string, string])[] = [];
        for (const m of members) {
          const own: string[] = [];
          for (const c of candidates.get(m)!) {
            if (treatment.has(c)) continue;
            let exclusive = true;
            for (const other of members) {
              if (other === m) continue;
              if (candidates.get(other)!.has(c)) {
                exclusive = false;
                break;
              }
            }
            if (exclusive) {
              own.push(c);
              if (own.length > 1) break;
            }
          }
          if (own.length === 1) sites.push([m, own[0]!] as const);
        }
        if (sites.length < lugares.value) continue;

        // (3) OPERACIONES INTERCAMBIABLES: misma aridad conocida.
        const arities = new Set<number | null>();
        for (const [, op] of sites) arities.add(nodeById.get(op)?.arity ?? null);
        if (arities.size !== 1 || arities.has(null)) continue;
        const arity = [...arities][0]!;

        // (4) la repetición cruza el archivo
        const siteFiles = [...new Set(sites.map(([m]) => nodeById.get(m)?.file ?? ""))].sort();
        if (siteFiles.length <= archivosQueRepiten.value) continue; // presencia ⇒ `> 1` es `>= 2`

        // (5a) ningún lugar del grupo es invocado por otro lugar del grupo
        const siteIds = new Set(sites.map(([m]) => m));
        let doorInside = false;
        for (const id of siteIds) {
          for (const caller of callersOf.get(id) ?? []) {
            if (caller !== id && siteIds.has(caller)) {
              doorInside = true;
              break;
            }
          }
          if (doorInside) break;
        }
        if (doorInside) continue;

        // (5b) sin protocolo compartido REAL entre los dueños de >= 2 operaciones
        const opOwners = new Set<string>();
        for (const [, op] of sites) {
          const owner = ownerByMember.get(op);
          if (owner && nodeById.get(owner)?.family === "class-like") opOwners.add(owner);
        }
        let protocolExists = false;
        if (opOwners.size >= 2) {
          for (const [, impls] of implementersOf) {
            let sharing = 0;
            for (const i of impls) if (opOwners.has(i)) sharing++;
            if (sharing < 2) continue;
            const per = [...impls].map(signaturesOf);
            if (per.some((p) => p.size === 0)) continue;
            const [first, ...rest] = per;
            let common = false;
            for (const sig of first!) {
              if (rest.every((p) => p.has(sig))) {
                common = true;
                break;
              }
            }
            if (common) {
              protocolExists = true;
              break;
            }
          }
        }
        if (protocolExists) continue;

        // (5c) ningún portador sostiene >= 2 operaciones y recibe invocación indirecta
        const opIds = new Set(sites.map(([, op]) => op));
        let carrierExists = false;
        const contenders = new Set<string>();
        for (const op of opIds) for (const carrier of carriersOf.get(op) ?? []) contenders.add(carrier);
        for (const carrier of contenders) {
          if (!indirectlyInvoked.has(carrier)) continue;
          let matched = 0;
          for (const t of carriedBy.get(carrier) ?? []) if (opIds.has(t)) matched++;
          if (matched >= 2) {
            carrierExists = true;
            break;
          }
        }
        if (carrierExists) continue;

        // discriminador (no compuerta): ¿los dueños de los LUGARES son hermanos?
        const siteOwners: string[] = [];
        for (const [m] of sites) {
          const owner = ownerByMember.get(m);
          if (owner && nodeById.get(owner)?.family === "class-like") siteOwners.push(owner);
        }
        let siblingSites = false;
        for (let i = 0; i < siteOwners.length && !siblingSites; i++) {
          for (let j = i + 1; j < siteOwners.length; j++) {
            const a = siteOwners[i]!;
            const b = siteOwners[j]!;
            if (a === b) continue;
            const ca = ancestorClosure(a);
            for (const x of ancestorClosure(b)) {
              if (ca.has(x)) {
                siblingSites = true;
                break;
              }
            }
            if (siblingSites) break;
          }
        }

        const treatmentList = [...treatment].sort();
        grupos.set(key, {
          treatment: treatmentList,
          sites,
          siteFiles,
          arity,
          confidentTreatment: treatmentList.filter((c) => sites.some(([m]) => confidentPairs.has(`${m} ${c}`))).length,
          confidentOperations: sites.filter(([m, op]) => confidentPairs.has(`${m} ${op}`)).length,
          siblingSites,
        });
      }
    }

    // UNA CANDIDATA POR CAUSA: el refactor es el CONJUNTO DE LUGARES. Dos
    // tratamientos distintos sobre los mismos lugares son el mismo trabajo
    // visto dos veces; se conserva el del tratamiento más grande. Y un conjunto
    // de lugares contenido en otro ya conservado es el mismo problema visto más
    // chico. Mismo criterio que `repeated-collaborator-set`.
    const alive = [...grupos.values()].filter((g): g is Grupo => g !== null);
    alive.sort((a, b) => b.sites.length - a.sites.length || b.treatment.length - a.treatment.length || (a.treatment.join() < b.treatment.join() ? -1 : 1));
    const kept: Grupo[] = [];
    for (const g of alive) {
      const ids = new Set(g.sites.map(([m]) => m));
      const contained = kept.some((k) => {
        const theirs = new Set(k.sites.map(([m]) => m));
        if (theirs.size < ids.size) return false;
        for (const id of ids) if (!theirs.has(id)) return false;
        return theirs.size > ids.size || k.treatment.length >= g.treatment.length;
      });
      if (!contained) kept.push(g);
    }

    const nameOf = (id: string): string => nodeById.get(id)?.symbolPath.at(-1) ?? id;
    const findings: RawFinding[] = [];
    // El tope de volumen NO se aplica acá: `detect/run.ts#capDetectorFindings`
    // resuelve y aplica `maxFindings` sobre lo que este `run()` devuelve.
    for (const g of kept) {
      const locations: RoleLocation[] = [];
      for (const [site, op] of g.sites) {
        const n = nodeById.get(site);
        if (!n) continue;
        locations.push({
          file: n.file,
          startLine: n.startLine ?? 1,
          endLine: n.endLine ?? n.startLine ?? 1,
          symbol: n.symbolPath.join("."),
          role: `${ROLE_SITE}: invoca los ${g.treatment.length} colaboradores comunes y, como única diferencia, ${nameOf(op)}`,
        });
      }
      for (const [, op] of g.sites) {
        const n = nodeById.get(op);
        if (!n) continue;
        locations.push({
          file: n.file,
          startLine: n.startLine ?? 1,
          endLine: n.endLine ?? n.startLine ?? 1,
          symbol: n.symbolPath.join("."),
          role: `${ROLE_OPERATION}: aridad ${g.arity}, invocada directamente desde un solo lugar del grupo`,
        });
      }
      for (const c of g.treatment) {
        const n = nodeById.get(c);
        if (!n) continue;
        locations.push({
          file: n.file,
          startLine: n.startLine ?? 1,
          endLine: n.endLine ?? n.startLine ?? 1,
          symbol: n.symbolPath.join("."),
          role: `${ROLE_TREATMENT}: los ${g.sites.length} lugares lo invocan por su cuenta`,
        });
      }
      if (locations.length === 0) continue;

      const treatmentNames = g.treatment.map(nameOf).sort();
      const opNames = g.sites.map(([, op]) => nameOf(op));
      findings.push({
        variant: g.sites.map(([m]) => m).join(","),
        title: `${g.sites.length} lugares repiten el mismo tratamiento y sólo cambian de operación`,
        detail:
          `${g.sites.length} símbolos distintos, en ${g.siteFiles.length} archivos, invocan cada uno los MISMOS ${g.treatment.length} colaboradores ` +
          `(${treatmentNames.join(", ")}) y difieren en EXACTAMENTE UN símbolo invocado: ${opNames.join(", ")} — las ${g.sites.length} operaciones tienen la misma aridad (${g.arity}), ` +
          `así que un solo miembro podría alojarlas. Hoy cada operación está SOLDADA a su copia del tratamiento: ninguna interfaz real conecta a sus dueños y ningún portador las sostiene con invocación indirecta. ` +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (el mismo tratamiento escrito de nuevo alrededor de cada operación) — " +
          "si conviene reificar la operación, si alcanza con un parámetro, o si los lugares son hermanos y el tratamiento debería subir al ancestro, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "colaboradores del tratamiento invariante", value: g.treatment.length, threshold: tratamiento },
          { label: "lugares que repiten el tratamiento", value: g.sites.length, threshold: lugares },
          { label: "archivos distintos donde vive la repetición", value: g.siteFiles.length, threshold: archivosQueRepiten },
        ],
        evidence: [
          { label: "operaciones distintas, una por lugar", value: g.sites.length, note: opNames.join(", ") },
          { label: "aridad común de las operaciones", value: g.arity, note: "un solo miembro puede alojarlas a todas" },
          {
            label: "colaboradores del tratamiento con al menos una arista NO ambigua",
            value: g.confidentTreatment,
            note: `de ${g.treatment.length}; el resto apoya sólo en aristas cuya resolución quedó ambigua — lo ambiguo viaja como ambiguo`,
          },
          {
            label: "operaciones con arista NO ambigua",
            value: g.confidentOperations,
            note: `de ${g.sites.length}`,
          },
          {
            label: "los dueños de los lugares comparten ancestro",
            value: g.siblingSites ? 1 : 0,
            note: g.siblingSites
              ? "SÍ — el tratamiento ya tiene casa: la mitigación más barata puede ser subirlo al ancestro (Pull Up / Template Method) en vez de hacer viajar la operación"
              : "NO — no hay ancestro común donde subir el tratamiento",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 25 + g.treatment.length * 3 + g.sites.length * 4),
        advice: {
          primary: {
            name: "Command",
            kind: "patron_de_diseno",
            why:
              `El tratamiento (${treatmentNames.join(", ")}) está escrito ${g.sites.length} veces, una por operación. ` +
              `Si la operación viajara como dato —un valor invocable o un objeto con un miembro de aridad ${g.arity}— el tratamiento se escribiría UNA vez y cada operación nueva costaría un valor en vez de otra copia.`,
            source: "https://refactoring.guru/design-patterns/command",
          },
        },
      });
    }

    return findings;
  },
};
