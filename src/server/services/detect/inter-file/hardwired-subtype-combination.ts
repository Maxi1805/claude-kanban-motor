/**
 * `hardwired-subtype-combination` — OLA AE, frente AE3.
 * **EL ANCLA-FUERZA DE ABSTRACT FACTORY.**
 *
 * ─── POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA ──────────────────────────
 *
 * Abstract Factory tenía UNA sola ancla, `parallel-hierarchies`, y esa ancla es
 * la ESTRUCTURA del patrón ya puesto, no la fuerza que el patrón resuelve: dos
 * jerarquías con la misma forma es lo que queda DESPUÉS de aplicar Abstract
 * Factory. Medido por AE3 sobre un volcado propio de las dos poblaciones
 * (13 bibliotecas + las 8 aplicaciones de `corpus-app/`):
 * **18 hipótesis de Abstract Factory, las 18 `parcial`, CERO `ausente`, CERO
 * `ya-aplicado`, CERO `aplicado-eludido`**, y 0/12 + 0/3 juzgadas verdaderas por
 * las olas anteriores. Un ancla cuya población entera cae siempre en el mismo
 * peldaño no informa nada: es el mismo defecto que AD4 midió y arregló dentro de
 * su propia ancla ("un peldaño que contesta siempre lo mismo no informa nada").
 *
 * ─── LA FUERZA QUE ABSTRACT FACTORY RESUELVE, ESCRITA COMO LA RESUELVE ─────
 *
 * *Hay que crear FAMILIAS de objetos que tienen que VARIAR JUNTAS —cambiar de
 * familia obliga a cambiar todos los miembros a la vez— y la elección de la
 * familia está CABLEADA en cada punto de creación.*
 *
 * Es una propiedad del GRAFO —quién instancia qué, y qué combinación elige cada
 * lugar—, no de la forma de dos jerarquías. Dos jerarquías gemelas no dicen nada
 * sobre si alguien tiene que elegir entre ellas; tres clases que cada una crea
 * su propio par (contexto, serializador) y ninguna comparte el creador, sí.
 *
 * ─── LA TRAMPA, Y DÓNDE ESTÁ LA DIFERENCIA ────────────────────────────────
 *
 * "Varios lugares crean variantes distintas de los mismos tipos base" se parece
 * muchísimo a "el Abstract Factory ya está y cada fábrica concreta crea su
 * familia". **La diferencia es si la creación pasa por un MIEMBRO COMÚN**: si
 * todos los lugares redeclaran la misma firma `(nombre, aridad)` y cada uno
 * instancia ahí su propia variante, el método de fábrica de ese hueco YA existe.
 * La condición (6a) de abajo lo pregunta **hueco por hueco**, que es lo que
 * permite distinguir "no está" de "está a medias" con contenido real en vez de
 * con un peldaño vacuo.
 *
 * ─── LAS CONDICIONES, CON LA INTENCIÓN DE CADA UNA ────────────────────────
 *
 * (1) HAY HUECOS DE PRODUCTO — un tipo base con >= `variantes` subtipos
 *     concretos confiables (`extends`/`implements`/`satisfies`).
 *     INTENCIÓN: *"hay algo que PUEDE variar"*. Sin al menos dos alternativas no
 *     hay ninguna elección que hacer y no falta ninguna fábrica.
 *
 * (2) LOS HUECOS SON INDEPENDIENTES — ninguno de los dos es ancestro del otro.
 *     INTENCIÓN: *"son DOS huecos, no una jerarquía vista a dos alturas"*.
 *     **Salió de MEDIR, no de razonar:** los dos primeros candidatos que produjo
 *     la sonda de AE3 en `sqlalchemy` eran `SyntaxExtension`+`ClauseElement` y
 *     `Concatenable`+`TypeEngine` — dos alturas de la misma jerarquía. Descarta
 *     25 de 353 pares en las 13 bibliotecas.
 *
 * (3) EL LUGAR CREA DOS PRODUCTOS DISTINTOS — las alternativas que elige para
 *     los dos huecos son tipos DISTINTOS.
 *     INTENCIÓN: *"el lugar crea una FAMILIA, no un objeto"*. Un tipo que hereda
 *     de las dos bases llena los dos huecos él solo, y ahí hay UNA creación, no
 *     una familia que mantener consistente. **Es el descarte más grande de
 *     todos: 160 de 353 pares en las 13 bibliotecas.**
 *
 * (4) LA ELECCIÓN ESTÁ CABLEADA EN EL LUGAR — cada lugar instancia ÉL MISMO
 *     exactamente UNA alternativa por hueco.
 *     INTENCIÓN: *"la elección está escrita acá, no delegada"*. Un lugar que
 *     instancia DOS alternativas del mismo hueco ya está despachando en runtime:
 *     ése no es un punto cableado, es (media) fábrica.
 *
 * (5) LOS HUECOS VARÍAN JUNTOS — entre los lugares, CADA hueco muestra >= 2
 *     alternativas distintas, y hay >= `familias` combinaciones distintas.
 *     INTENCIÓN: *"es una FAMILIA, no un hueco variable al lado de una
 *     constante"*. **Salió de MEDIR:** en `nest`, `Logger` aparece junto a una
 *     excepción distinta en cada lugar — `Logger` es una constante del sitio, no
 *     un miembro de la familia, y proponer una fábrica para "Logger + excepción"
 *     es ruido. Descarta 13 de los 33 pares que llegan hasta acá.
 *
 * (6) RESOLUCIÓN VERIFICADA: LA FÁBRICA NO EXISTE YA — en sus tres formas, que
 *     el grafo ve distinto y por eso se chequean por separado:
 *     (6a) POR HUECO: un hueco está RESUELTO si existe una firma
 *          `(nombre, aridad)` que TODOS los lugares redeclaran y que en CADA UNO
 *          instancia SU PROPIA alternativa de ese hueco — el método de fábrica de
 *          ese hueco ya está escrito. Si están resueltos TODOS ⇒ **silencio**.
 *          Si están resueltos ALGUNOS ⇒ el hallazgo sale igual, publicando
 *          cuántos, para que la hipótesis diga "a medias" en vez de "no está".
 *          **Tiene que ser POR HUECO y no por par de hermanos, y el caso que lo
 *          prueba está abierto y leído:** en `nest`, `ServerNats` y `ServerRMQ`
 *          comparten `handleMessage/2` (cada uno crea su propio `*Context`) *y*
 *          `initializeSerializer/1` (cada uno crea su propio `*Serializer`), o
 *          sea que ESE par cubre los dos huecos; pero `ServerKafka` y
 *          `ServerMqtt` sólo comparten `initializeSerializer/1`. Con la regla
 *          "algún par cubre los dos huecos" el caso se silencia; con "todos los
 *          lugares, hueco por hueco" queda como MEDIA fábrica, que es lo que el
 *          código dice.
 *     (6b) PUERTA DE ADENTRO: uno de los lugares ya es invocado/referenciado por
 *          >= 2 de los otros. INTENCIÓN: *"si uno de ellos ya fuera la fábrica,
 *          los demás pasarían por él"*. Misma forma que la condición (5a) del
 *          ancla-fuerza de Facade (`repeated-collaborator-set`), y hace falta por
 *          la misma razón: una fábrica escrita como un lugar más tiene, en el
 *          grafo, la misma forma que un lugar que cablea.
 *     (6c) PUERTA DE AFUERA: un lugar AJENO al grupo ya cubre los dos huecos y
 *          ya tiene >= 2 clientes. INTENCIÓN: *"lo que falta es la FÁBRICA, no su
 *          uso"* — si ya hay un creador central, la mitigación es "usá el que ya
 *          hay", que es OTRA refactorización.
 *
 * ─── LA GRANULARIDAD DEL "PUNTO DE CREACIÓN", MEDIDA ANTES DE ELEGIRLA ────
 *
 * El "lugar" es la CLASE dueña del símbolo que instancia, y el ARCHIVO cuando no
 * hay clase dueña. **Las tres granularidades se midieron antes de implementar**
 * (sonda `scratchpad-ae3/ae3-variantes.py`, 13 bibliotecas):
 * función 260 pares → **0** candidatos; clase 353 → **2**; archivo 389 → **1**.
 * **A granularidad de FUNCIÓN la fuerza es invisible, y el caso que lo prueba
 * está abierto:** en `nest`, `ServerKafka` crea `KafkaContext` en `handleMessage`
 * y `KafkaRequestSerializer` en `initializeSerializer` — dos métodos distintos de
 * la misma clase. El cliente que Abstract Factory protege es el que tendría que
 * cambiar al agregar una familia, y esa unidad es la clase, no el método.
 *
 * ─── SÓLO PROCEDENCIA CONFIABLE, Y ESTÁ DICHO ─────────────────────────────
 *
 * Todas las aristas que este detector lee exigen `declared`/`resolved` — el mismo
 * `TRUSTED_PROVENANCE` que `hypotheses/abstract-factory.ts` ya aplica desde la
 * Ola 10, y por la misma razón que ese archivo escribió: la cascada heurística de
 * `path-proximity` domina el 81 % de lo aceptado en guava, así que confiarle a
 * una arista adivinada la decisión de AFIRMAR que dos tipos son variantes del
 * mismo hueco sería el peor lugar para ese ruido. Es una decisión CONSERVADORA y
 * su costo está declarado: un repo cuya resolución de tipos sea mayormente
 * ambigua queda mudo para este detector.
 *
 * ─── QUÉ NO CHEQUEA, DECLARADO ────────────────────────────────────────────
 *
 * La condición (6a) sólo se puede evaluar cuando TODOS los lugares del grupo son
 * clases (una firma `(nombre, aridad)` compartida no existe entre archivos sin
 * clase). Cuando algún lugar cae a granularidad de archivo, `huecosResueltos`
 * queda en 0 y el hallazgo sale como "nada resuelto": es CONSERVADOR en la
 * dirección de emitir de más, y queda declarado.
 *
 * No verifica que los productos de una familia se USEN JUNTOS (que el objeto A de
 * la familia X sólo tenga sentido con el objeto B de la misma X). El grafo no
 * lleva esa relación, y la pregunta viaja al `toConfirm` de la hipótesis. Y los
 * lenguajes cuyo extractor no produce nodos `class-like` con aristas de herencia
 * —Go, medido: 0 tipos instanciados dentro de un hueco en `hugo` sobre 1.249
 * aristas `instantiates`— quedan mudos para este ancla. Es una BRECHA declarada,
 * la misma que `hypotheses/abstract-factory.ts` ya declara en su LÍMITE Nº2.
 */
import type { EdgeKind } from "../../graph/types.js";
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "variantes" | "huecos" | "familias" | "lugares" | "archivosQueEligen" | "huecosPorLugar";

/** Prefijos de `RoleLocation.role` — `hypotheses/abstract-factory.ts` los importa
 *  para recuperar del `Finding` qué ubicación es qué, sin duplicar el literal. */
export const ROLE_HARDWIRES = "cablea la elección de familia";
export const ROLE_SLOT = "hueco de producto";

/** Aristas de subtipo. Las tres son la misma pregunta ("este tipo es una variante
 *  de aquél") escrita como la escribe cada lenguaje; `hypotheses/abstract-factory.ts`
 *  ya trata `implements`/`satisfies` como intercambiables por este motivo. */
const SUBTYPE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["extends", "implements", "satisfies"]);
/** Aristas con semántica de USO, para las puertas (6b)/(6c). Mismas dos mitades
 *  de la cascada de resolución que usa `repeated-collaborator-set`. */
const USE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["calls", "references"]);
const TRUSTED_PROVENANCE: ReadonlySet<string> = new Set(["declared", "resolved"]);

interface Group {
  /** Los dos huecos de producto (ids de nodo de las bases), ordenados. */
  readonly slots: readonly [string, string];
  /** Lugares que cablean, ordenados. */
  readonly sites: readonly string[];
  readonly siteFiles: readonly string[];
  /** Combinaciones distintas realmente elegidas: `"altA\u0000altB" -> lugares`. */
  readonly families: ReadonlyMap<string, readonly string[]>;
  /** Cuántos de los dos huecos ya tienen su método de fábrica compartido (6a). */
  readonly resolvedSlots: number;
  /** La alternativa que cada lugar elige, por hueco: `sitio -> [altA, altB]`. */
  readonly choiceOf: ReadonlyMap<string, readonly [string, string]>;
}

export const detector: InterFileDetector<ThresholdKey, "hardwired-subtype-combination"> = {
  id: "hardwired-subtype-combination",
  kind: "hardwired-subtype-combination",
  scope: "inter-file",
  needsGraph: true,
  title: "Varios lugares eligen, cada uno por su cuenta, una combinación distinta de variantes",
  needs: ["unidad-tipo-clase"],
  // Sin `extends` no hay huecos de producto (un tipo base con variantes) y sin
  // `instantiates` no hay puntos de creación: son los dos insumos sin los cuales
  // este detector no puede encontrar nada, no "encuentra cero". `implements`/
  // `satisfies` AMPLÍAN los huecos y `calls`/`references` sólo AMPLÍAN las
  // puertas de (6b)/(6c) —sin ellas el detector es MÁS estricto, nunca mudo—,
  // así que van declaradas como excluidas a propósito en `needs-edges-audit`.
  needsEdges: ["extends", "instantiates"],
  thresholds: {
    variantes: pisoDeclarado(2, {
      rationale:
        "cuántos subtipos concretos tiene que tener un tipo base para ser un HUECO DE PRODUCTO, o sea algo que puede variar. Con uno solo no hay ninguna elección que hacer y no falta ninguna fábrica: dos es el mínimo aritmético de 'hay alternativa'. Piso de FORMA disfrazado de magnitud, no una calibración contra corpus.",
    }),
    huecos: pisoDeclarado(2, {
      rationale:
        "cuántos huecos de producto tiene que cubrir un mismo lugar para que Abstract Factory pague en vez de Factory Method. Con UN hueco el patrón que resuelve la situación es Factory Method (una sola creación que varía); Abstract Factory existe porque hay que mantener CONSISTENTE la elección entre VARIOS huecos a la vez. Es el mismo MIN_SHARED_SLOTS = 2 que hypotheses/abstract-factory.ts ya usa para esta misma pregunta desde pattern-structural.ts:738 — se reutiliza el número que el proyecto ya tiene en vez de inventar otro.",
    }),
    familias: pisoDeclarado(2, {
      rationale:
        "cuántas combinaciones DISTINTAS tienen que estar realmente elegidas en el código para que haya algo que abstraer. Con UNA sola familia realizada no hay nada que varíe: la fuerza es 'cambiar de familia obliga a cambiar todos los miembros a la vez', y sin dos familias ese cambio no existe todavía. Es la condición de ESCALA que la Ola AC midió como la que le faltaba a su ancla de State (7 máquinas reales, 6 sin nada que pagara el patrón).",
    }),
    lugares: pisoDeclarado(3, {
      rationale:
        "cuántos puntos de creación tienen que cablear la elección para que una jerarquía de fábricas pague. Con DOS la mitigación más barata es una única función `crear(variante)` con un condicional —un Factory Method parametrizado—, no una interfaz de fábrica más una concreta por familia más una interfaz por hueco. Mismo argumento y mismo número con el que la Ola AD fijó `lugares >= 3` para el ancla-fuerza de Facade. Piso de ESCALA declarado, no una magnitud calibrada.",
    }),
    archivosQueEligen: presencia({
      rationale:
        "la elección tiene que CRUZAR el archivo: si los N lugares viven en el mismo archivo, una función privada de ese archivo los unifica sin crear ningún tipo nuevo, y proponer una jerarquía de fábricas ahí sería peor que el problema. No hay magnitud que calibrar — la pregunta es binaria ('¿cruza o no cruza?') y su respuesta mínima es 2.",
    }),
    huecosPorLugar: presupuesto(32, {
      rationale:
        "tope de trabajo, no de detección: el cruce enumera los PARES de huecos que cada lugar cubre, que es cuadrático en esa cantidad. Medido sobre volcados de grafo propios de las 13 bibliotecas, el lugar más poblado cubre 10 huecos (sqlalchemy), así que 32 no recorta nada ahí; está para que un contenedor atípico que instancie medio repositorio no haga cuadrático el paso. Saltearlo sólo puede hacer que un grupo NO se encuentre — nunca inventa uno.",
    }),
  },
  maxFindings: presupuesto(120, {
    rationale:
      "tope de volumen por repo, del mismo orden que el resto del catálogo inter-file. Medido sobre las 13 bibliotecas, el repo que más emite con estos pisos emite UNO, así que hoy no recorta nada — está para que un repositorio atípico no publique cientos de tarjetas del mismo kind.",
  }),
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!graph) return [];

    const variantes = ctx.threshold("variantes");
    const huecos = ctx.threshold("huecos");
    const familias = ctx.threshold("familias");
    const lugares = ctx.threshold("lugares");
    const archivosQueEligen = ctx.threshold("archivosQueEligen");
    const huecosPorLugar = ctx.threshold("huecosPorLugar");

    interface NodeInfo {
      readonly file: string;
      readonly symbolPath: readonly string[];
      readonly family?: string;
      readonly startLine?: number;
      readonly endLine?: number;
      readonly arity?: number | null;
    }
    const nodeById = new Map<string, NodeInfo>();
    for (const n of graph.nodes) {
      if (n.kind !== "symbol") continue;
      if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    }
    const isClassLike = (id: string): boolean => nodeById.get(id)?.family === "class-like";

    // ── (1) HUECOS DE PRODUCTO ──────────────────────────────────────────
    const subtypesOf = new Map<string, Set<string>>();
    const basesOf = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!SUBTYPE_EDGE_KINDS.has(e.kind) || !TRUSTED_PROVENANCE.has(e.provenance)) continue;
      if (e.from === e.to || !isClassLike(e.from) || !isClassLike(e.to)) continue;
      let subs = subtypesOf.get(e.to);
      if (!subs) {
        subs = new Set();
        subtypesOf.set(e.to, subs);
      }
      subs.add(e.from);
      let bases = basesOf.get(e.from);
      if (!bases) {
        bases = new Set();
        basesOf.set(e.from, bases);
      }
      bases.add(e.to);
    }
    const slots = new Set<string>();
    for (const [base, subs] of subtypesOf) if (subs.size >= variantes.value) slots.add(base);
    if (slots.size === 0) return [];

    /** Ancestros transitivos, para la condición (2). El tope de profundidad es de
     *  trabajo: una cadena de herencia más larga que eso no existe en el corpus y
     *  sólo puede hacer que un par NO se descarte, nunca inventar un descarte. */
    const ancestorsCache = new Map<string, ReadonlySet<string>>();
    const ancestorsOf = (id: string): ReadonlySet<string> => {
      const hit = ancestorsCache.get(id);
      if (hit) return hit;
      const out = new Set<string>();
      let frontier: string[] = [id];
      for (let depth = 0; depth < 16 && frontier.length > 0; depth++) {
        const next: string[] = [];
        for (const x of frontier) {
          for (const b of basesOf.get(x) ?? []) {
            if (out.has(b)) continue;
            out.add(b);
            next.push(b);
          }
        }
        frontier = next;
      }
      ancestorsCache.set(id, out);
      return out;
    };

    // ── el LUGAR: la clase dueña del símbolo que instancia; el archivo si no hay ──
    const ownerOf = new Map<string, string>();
    /** `clase -> firma "<nombre>\u0000<aridad>" -> tipos que ese miembro instancia`. */
    const memberProducts = new Map<string, Map<string, Set<string>>>();
    /** `clase -> firmas que declara`. */
    const memberSignaturesOf = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (e.kind !== "contains" || !isClassLike(e.from)) continue;
      ownerOf.set(e.to, e.from);
      const member = nodeById.get(e.to);
      if (!member || member.family !== "function-like") continue;
      const signature = `${member.symbolPath.at(-1) ?? ""}\u0000${member.arity ?? "?"}`;
      let sigs = memberSignaturesOf.get(e.from);
      if (!sigs) {
        sigs = new Set();
        memberSignaturesOf.set(e.from, sigs);
      }
      sigs.add(signature);
    }

    // Sentinel con un byte que ningun id de nodo del grafo contiene, para que un
    // "lugar sin clase duena" nunca colisione con el id de una clase.
    const FILE_SITE = "\u0000file\u0000";
    const siteOf = (symbolId: string): string => {
      const owner = ownerOf.get(symbolId);
      if (owner) return owner;
      const file = nodeById.get(symbolId)?.file ?? symbolId;
      return `${FILE_SITE}${file}`;
    };
    const fileOfSite = (site: string): string =>
      site.startsWith(FILE_SITE) ? site.slice(FILE_SITE.length) : (nodeById.get(site)?.file ?? "");

    // ── (4) qué instancia cada lugar, y con qué miembro ─────────────────
    const productsOfSite = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (e.kind !== "instantiates" || !TRUSTED_PROVENANCE.has(e.provenance) || !isClassLike(e.to)) continue;
      const site = siteOf(e.from);
      let products = productsOfSite.get(site);
      if (!products) {
        products = new Set();
        productsOfSite.set(site, products);
      }
      products.add(e.to);

      const owner = ownerOf.get(e.from);
      const member = nodeById.get(e.from);
      if (!owner || !member || member.family !== "function-like") continue;
      const signature = `${member.symbolPath.at(-1) ?? ""}\u0000${member.arity ?? "?"}`;
      let bySig = memberProducts.get(owner);
      if (!bySig) {
        bySig = new Map();
        memberProducts.set(owner, bySig);
      }
      let made = bySig.get(signature);
      if (!made) {
        made = new Set();
        bySig.set(signature, made);
      }
      made.add(e.to);
    }

    /** `lugar -> hueco -> la ÚNICA alternativa que elige`. Un lugar que instancia
     *  DOS alternativas del mismo hueco no cablea: despacha (condición 4). */
    const choicesOfSite = new Map<string, Map<string, string>>();
    for (const [site, products] of productsOfSite) {
      const perSlot = new Map<string, Set<string>>();
      for (const product of products) {
        for (const base of basesOf.get(product) ?? []) {
          if (!slots.has(base)) continue;
          let picked = perSlot.get(base);
          if (!picked) {
            picked = new Set();
            perSlot.set(base, picked);
          }
          picked.add(product);
        }
      }
      const single = new Map<string, string>();
      for (const [base, picked] of perSlot) if (picked.size === 1) single.set(base, [...picked][0]!);
      if (single.size >= huecos.value) choicesOfSite.set(site, single);
    }
    if (choicesOfSite.size === 0) return [];

    // ── índices para las puertas (6b)/(6c) ──────────────────────────────
    /** `lugar -> lugares que lo usan`. */
    const usersOfSite = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!USE_EDGE_KINDS.has(e.kind) || !TRUSTED_PROVENANCE.has(e.provenance)) continue;
      const target = siteOf(e.to);
      const source = siteOf(e.from);
      if (target === source) continue;
      let users = usersOfSite.get(target);
      if (!users) {
        users = new Set();
        usersOfSite.set(target, users);
      }
      users.add(source);
    }
    // Un lugar que es una CLASE también se usa nombrándola directamente: la
    // arista llega al nodo de la clase, no a un miembro suyo, y `siteOf` de un
    // nodo clase-tipo devuelve su dueño (o el archivo) — nunca la clase misma.
    // Se agrega ese camino aparte para no perder la mitad de los usos.
    for (const e of graph.edges) {
      if (!USE_EDGE_KINDS.has(e.kind) || !TRUSTED_PROVENANCE.has(e.provenance)) continue;
      if (!isClassLike(e.to) || e.from === e.to) continue;
      const source = siteOf(e.from);
      if (source === e.to) continue;
      let users = usersOfSite.get(e.to);
      if (!users) {
        users = new Set();
        usersOfSite.set(e.to, users);
      }
      users.add(source);
    }

    // ── (2)(3)(5) agrupar por PAR de huecos ─────────────────────────────
    const sitesByPair = new Map<string, string[]>();
    for (const [site, choices] of choicesOfSite) {
      const bases = [...choices.keys()].sort();
      if (bases.length > huecosPorLugar.value) continue;
      for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
          const key = `${bases[i]!}\u0000${bases[j]!}`;
          const list = sitesByPair.get(key);
          if (list) list.push(site);
          else sitesByPair.set(key, [site]);
        }
      }
    }

    const groups: Group[] = [];
    for (const [key, allSites] of [...sitesByPair.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const [slotA, slotB] = key.split("\u0000") as [string, string];
      // (2) huecos independientes
      if (ancestorsOf(slotA).has(slotB) || ancestorsOf(slotB).has(slotA)) continue;
      // (3) el lugar crea DOS productos distintos
      const sites = allSites
        .filter((s) => choicesOfSite.get(s)!.get(slotA) !== choicesOfSite.get(s)!.get(slotB))
        .sort();
      if (sites.length < lugares.value) continue;

      const choiceOf = new Map<string, readonly [string, string]>();
      const families = new Map<string, string[]>();
      for (const s of sites) {
        const a = choicesOfSite.get(s)!.get(slotA)!;
        const b = choicesOfSite.get(s)!.get(slotB)!;
        choiceOf.set(s, [a, b]);
        const fkey = `${a}\u0000${b}`;
        const list = families.get(fkey);
        if (list) list.push(s);
        else families.set(fkey, [s]);
      }
      // (5) >= `familias` combinaciones y CADA hueco varía
      if (families.size < familias.value) continue;
      if (new Set([...choiceOf.values()].map((c) => c[0])).size < 2) continue;
      if (new Set([...choiceOf.values()].map((c) => c[1])).size < 2) continue;

      const siteFiles = [...new Set(sites.map(fileOfSite))].sort();
      if (siteFiles.length <= archivosQueEligen.value) continue; // presencia ⇒ `> 1` es `>= 2`

      // ── (6a) RESOLUCIÓN VERIFICADA, POR HUECO ─────────────────────────
      const classSites = sites.filter((s) => isClassLike(s));
      let resolvedSlots = 0;
      if (classSites.length === sites.length && sites.length >= 2) {
        let shared: Set<string> = new Set(memberSignaturesOf.get(sites[0]!) ?? []);
        for (const s of sites.slice(1)) {
          const sigs = memberSignaturesOf.get(s) ?? new Set<string>();
          shared = new Set([...shared].filter((x: string) => sigs.has(x)));
        }
        for (const slot of [slotA, slotB] as const) {
          const covered = [...shared].some((signature) =>
            sites.every((s) => memberProducts.get(s)?.get(signature)?.has(choicesOfSite.get(s)!.get(slot)!) === true),
          );
          if (covered) resolvedSlots++;
        }
      }
      if (resolvedSlots >= 2) continue; // la fábrica ya está puesta para los dos huecos ⇒ silencio

      // ── (6b) PUERTA DE ADENTRO ────────────────────────────────────────
      const siteSet = new Set(sites);
      let doorInside = false;
      for (const s of sites) {
        let n = 0;
        for (const u of usersOfSite.get(s) ?? []) if (u !== s && siteSet.has(u)) n++;
        if (n >= 2) {
          doorInside = true;
          break;
        }
      }
      if (doorInside) continue;

      // ── (6c) PUERTA DE AFUERA ─────────────────────────────────────────
      let doorOutside = false;
      for (const [other, choices] of choicesOfSite) {
        if (siteSet.has(other)) continue;
        if (!choices.has(slotA) || !choices.has(slotB)) continue;
        if ((usersOfSite.get(other)?.size ?? 0) >= 2) {
          doorOutside = true;
          break;
        }
      }
      if (doorOutside) continue;

      groups.push({
        slots: [slotA, slotB],
        sites,
        siteFiles,
        families: new Map([...families].map(([k, v]) => [k, v.slice().sort()] as const)),
        resolvedSlots,
        choiceOf,
      });
    }

    const nameOf = (id: string): string => nodeById.get(id)?.symbolPath.at(-1) ?? id;
    const findings: RawFinding[] = [];
    // El tope de volumen NO se aplica acá: `detect/run.ts#capDetectorFindings`
    // resuelve y aplica `maxFindings` sobre lo que este `run()` devuelve.
    for (const group of groups) {
      const [slotA, slotB] = group.slots;
      const locations: RoleLocation[] = [];
      for (const site of group.sites) {
        const info = nodeById.get(site);
        const [a, b] = group.choiceOf.get(site)!;
        const file = fileOfSite(site);
        const role = `${ROLE_HARDWIRES}: instancia ${nameOf(a)} y ${nameOf(b)} él mismo`;
        locations.push(
          info
            ? { file, startLine: info.startLine ?? 1, endLine: info.endLine ?? info.startLine ?? 1, symbol: info.symbolPath.join("."), role }
            : { file, startLine: 1, endLine: Math.max(1, repo.files.find((f) => f.path === file)?.lines ?? 1), role },
        );
      }
      for (const slot of [slotA, slotB] as const) {
        const info = nodeById.get(slot);
        if (!info) continue;
        const picked = [...new Set(group.sites.map((s) => nameOf(choicesOfSite.get(s)!.get(slot)!)))].sort();
        locations.push({
          file: info.file,
          startLine: info.startLine ?? 1,
          endLine: info.endLine ?? info.startLine ?? 1,
          symbol: info.symbolPath.join("."),
          role: `${ROLE_SLOT}: ${picked.length} variante(s) elegidas entre los lugares — ${picked.join(", ")}`,
        });
      }
      if (locations.length === 0) continue;

      const familyNames = [...group.families.keys()]
        .map((k) => {
          const [a, b] = k.split("\u0000") as [string, string];
          return `${nameOf(a)} + ${nameOf(b)}`;
        })
        .sort();

      findings.push({
        variant: `${slotA}|${slotB}`,
        title: `${group.sites.length} lugares eligen, cada uno por su cuenta, una de ${group.families.size} combinaciones de ${nameOf(slotA)} y ${nameOf(slotB)}`,
        detail:
          `${group.sites.length} lugares distintos, repartidos en ${group.siteFiles.length} archivos, instancian cada uno por su cuenta una variante de "${nameOf(slotA)}" Y una variante de "${nameOf(slotB)}", y las combinaciones elegidas son ${group.families.size}: ${familyNames.join("; ")}. ` +
          `Los dos tipos base son independientes entre sí (ninguno es ancestro del otro) y cada uno muestra al menos dos variantes distintas entre estos lugares, así que la elección VARÍA y varía JUNTA. ` +
          (group.resolvedSlots > 0
            ? `${group.resolvedSlots} de los 2 huecos ya tiene un miembro compartido por todos los lugares que hace esa creación; el otro está cableado.`
            : "Ningún miembro compartido por todos los lugares hace ninguna de las dos creaciones, y ningún otro lugar del repositorio cubre ya las dos.") +
          " Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (una familia de objetos que hay que elegir junta, con la elección escrita en cada punto de creación) — " +
          "si conviene una fábrica, si ya hay media, o si los dos tipos no son en verdad una familia, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "huecos de producto que cada lugar cubre", value: 2, threshold: huecos },
          { label: "combinaciones distintas realmente elegidas", value: group.families.size, threshold: familias },
          { label: "lugares que cablean la elección", value: group.sites.length, threshold: lugares },
          { label: "archivos distintos donde vive la elección", value: group.siteFiles.length, threshold: archivosQueEligen },
        ],
        evidence: [
          {
            label: "variantes del primer hueco",
            value: subtypesOf.get(slotA)?.size ?? 0,
            note: `"${nameOf(slotA)}" (${nodeById.get(slotA)?.file ?? "?"}) — piso ${variantes.value}`,
          },
          {
            label: "variantes del segundo hueco",
            value: subtypesOf.get(slotB)?.size ?? 0,
            note: `"${nameOf(slotB)}" (${nodeById.get(slotB)?.file ?? "?"}) — piso ${variantes.value}`,
          },
          {
            label: "huecos que YA tienen un miembro compartido que los crea",
            value: group.resolvedSlots,
            note: "de 2 — condición de RESOLUCIÓN VERIFICADA por hueco: si fueran los dos, este hallazgo no existiría",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 25 + group.families.size * 4 + group.sites.length * 3),
        advice: {
          primary: {
            name: "Extract Class",
            kind: "refactorizacion",
            why:
              `Los ${group.sites.length} lugares eligen a mano qué variante de "${nameOf(slotA)}" va con qué variante de "${nameOf(slotB)}". ` +
              "Un tipo que haga las dos creaciones juntas deja a cada lugar pidiendo la familia entera en vez de nombrar sus miembros uno por uno.",
            source: "https://refactoring.com/catalog/extractClass.html",
          },
        },
      });
    }

    return findings;
  },
};
