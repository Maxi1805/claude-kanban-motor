/**
 * `optional-construction-combinations` — OLA AE, frente AE4. EL ANCLA-FUERZA DE
 * **Builder**.
 *
 * ─── POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA ──────────────────────────
 *
 * Builder tenía dos anclas —`long-parameter-list` y `data-clump`— y las dos son
 * SÍNTOMAS de forma de firma. Medido por AE4 sobre los volcados del día de las
 * dos poblaciones (13 bibliotecas + `corpus-app/`, 8 aplicaciones):
 * **1.045 hallazgos crudos de las dos anclas producen 103 hipótesis**, y el
 * triaje vigente (INTEGRADOR de la Ola AD, §5.2) le mide a la primaria
 * **3/34 = 8,8 % [3,0 %, 23,0 %]** en bibliotecas y **0/9** en aplicaciones.
 *
 * **Por qué falla, dicho como lo dice el patrón:** una firma larga NO es la
 * situación que Builder resuelve. Un constructor de 6 parámetros al que TODOS
 * los sitios le pasan los 6 no tiene ninguna opcionalidad: su remedio es un
 * Parameter Object (un `record`, un `dataclass`, un struct de opciones), y un
 * Builder ahí es sobre-ingeniería — es literalmente lo que el `cost` de
 * `hypotheses/builder.ts` ya dice en prosa y lo que ninguna de sus dos anclas
 * puede verificar. **La opcionalidad es la fuerza; el largo de la firma es un
 * síntoma correlacionado.**
 *
 * ─── LA FUERZA QUE BUILDER RESUELVE, ESCRITA COMO LA RESUELVE EL PATRÓN ────
 *
 * *La construcción de una entidad admite MUCHAS COMBINACIONES de pasos
 * opcionales, y la combinatoria está resuelta A MANO en cada punto de
 * construcción: los sitios que construyen el MISMO tipo le pasan cantidades
 * DISTINTAS de argumentos, y las diferencias son varias y anchas. Nadie
 * acumula la configuración — cada sitio vuelve a enumerar la suya.*
 *
 * Es una propiedad de los SITIOS DE USO —cuántos pasos omite cada uno—, no de
 * la declaración. Dos constructores con la misma firma de 9 parámetros son
 * casos OPUESTOS según los llame todo el mundo igual (Parameter Object) o cada
 * quien distinto (Builder), y sólo el sitio de uso lo sabe.
 *
 * ─── LA TRAMPA, Y DÓNDE ESTÁ LA DIFERENCIA ────────────────────────────────
 *
 * "Muchas formas de construir lo mismo" se parece muchísimo a "ya hay una
 * fábrica/Builder y cada quien la usa a su manera". **La diferencia es si
 * alguien ACUMULA**: si existiera una puerta que junta la configuración, los
 * sitios pasarían por ella (y entonces la combinatoria estaría adentro de la
 * puerta, no repartida entre los sitios). Las dos condiciones de RESOLUCIÓN
 * VERIFICADA de abajo atacan esa trampa por sus dos formas.
 *
 * ─── LAS CINCO CONDICIONES, CON LA INTENCIÓN DE CADA UNA ──────────────────
 *
 * (1) HAY UNA PUERTA DE CONSTRUCCIÓN — el destino es un tipo (`class-like`
 *     invocado como función: `T(...)`, el único idioma de construcción de
 *     Python/Ruby/JS y el literal compuesto de Go) o un MIEMBRO CONSTRUCTOR de
 *     un tipo (la gramática le da nodo propio —`constructor_declaration`— o le
 *     da un nombre mandado —`CONSTRUCTOR_NAMES` de `code-grammar.ts`).
 *     INTENCIÓN: *"lo que se arma es una ENTIDAD, no cualquier función con
 *     argumentos opcionales"*. Sin esta compuerta esto sería un detector de
 *     "función llamada con distintas cantidades de argumentos", cuyo remedio
 *     es un objeto de parámetros o una sobrecarga, nunca un Builder. Es un
 *     hecho de la GRAMÁTICA y del grafo, jamás del nombre del tipo.
 *
 * (2) LA OPCIONALIDAD ES REAL Y MEDIDA, NO SUPUESTA — los sitios invocan esa
 *     puerta con >= `combinaciones` cantidades DISTINTAS de argumentos.
 *     INTENCIÓN: *"los pasos opcionales de verdad se omiten, y se omiten de
 *     formas DISTINTAS"*. Es exactamente lo que las dos anclas viejas no
 *     pueden ver: la declaración dice cuántos parámetros HAY, los sitios dicen
 *     cuántos se USAN. La evidencia sale de `CodeGraphEdge.callArities` —
 *     "cuántos argumentos pasó cada sitio de uso", el hecho que la Ola P (P2)
 *     agregó al grafo y que ninguna hipótesis de patrón consumía todavía.
 *
 * (3) LA COMBINATORIA ES ANCHA — el rango (máximo − mínimo) de esas cantidades
 *     es >= `pasosOpcionales`.
 *     INTENCIÓN: *"hay VARIAS ranuras opcionales, no una"*. Con una o dos
 *     ranuras opcionales el remedio nativo del lenguaje (un valor por defecto,
 *     una sobrecarga más, un objeto de parámetros) es más barato que un
 *     Builder, y proponerlo sería sobre-ingeniería.
 *
 * (4) LA COMBINATORIA ESTÁ REPARTIDA — >= `lugares` símbolos DISTINTOS
 *     construyen por esa puerta.
 *     INTENCIÓN: *"la combinatoria la resuelve MUCHA gente, cada una por su
 *     cuenta"*. Con DOS sitios la mitigación más barata es una segunda fábrica
 *     o un valor por defecto: la fuerza está pero el patrón no paga. Es la
 *     condición de ESCALA que la Ola AC midió como la que le faltaba a su
 *     ancla de State, con el mismo piso y la misma razón que AD4 escribió para
 *     su `lugares`.
 *
 * (5) RESOLUCIÓN VERIFICADA: NADIE ACUMULA TODAVÍA — en sus DOS formas, que el
 *     grafo ve distinto y por eso se chequean por separado:
 *     (5a) ninguno de los sitios es INVOCADO por >= 2 de los otros sitios del
 *          mismo grupo. INTENCIÓN: *"la fábrica compartida no existe ya"* — si
 *          uno de ellos fuera la puerta que junta la configuración, los demás
 *          pasarían por él. Hace falta como chequeo propio porque una fábrica
 *          que embudó la construcción tiene, en el grafo, exactamente la misma
 *          forma que un sitio más: lo único que la distingue es si los otros
 *          pasan por ella.
 *     (5b) no existe ya un BUILDER para ese tipo: un `class-like` `B` distinto
 *          de `T` con >= `BUILDER_MIN_SETTERS` miembros `function-like` de
 *          aridad 1 y >= 1 miembro de aridad 0 con una arista `instantiates`
 *          hacia `T`. INTENCIÓN: *"el patrón no está ya puesto"*. **NO es una
 *          definición nueva: es LA MISMA forma COMPLETA que
 *          `hypotheses/builder.ts#evaluateGraphShape` ya usa desde la Ola 10/11
 *          para decidir `ya-aplicado`** (los setters de aridad 1 y el `build()`
 *          de aridad 0 que instancia el Producto), reusada acá en vez de
 *          inventar una segunda.
 *
 * ─── LAS ARISTAS AMBIGUAS **NO** CUENTAN, Y LA RAZÓN ESTÁ MEDIDA ──────────
 *
 * Al revés que en `repeated-collaborator-set` (Ola AD), acá las aristas
 * `provenance: "ambiguous"` se EXCLUYEN, y la razón es que se midió el trueque
 * en vez de suponerlo: sobre `sqlalchemy`, contando TODAS las aristas hay 33
 * puertas con >= 3 cantidades distintas y contando sólo las NO ambiguas quedan
 * 21 — y lo que se cae son homónimos mal resueltos, no evidencia
 * (`BsonReader.Read` de `newtonsoft-json`, aridad declarada 0, "observada" con
 * 0/1/2/3 argumentos desde 40 llamadores: la cascada resolvió a ese nodo todas
 * las llamadas a un método `Read` cualquiera del repo). AD4 midió lo contrario
 * para su ancla (sin las ambiguas emitía CERO en los 16 repos) y por eso las
 * incluyó. **Las dos decisiones son la misma regla —medir el trueque— con
 * resultados opuestos, y las dos quedan escritas con su número.**
 *
 * ─── LA MITAD QUE ESTE DETECTOR NO PUEDE VER, Y QUIÉN LA VE ───────────────
 *
 * La fuerza de Builder tiene DOS mitades y este detector sólo puede medir una.
 * La otra —*"el ensamblado tiene lógica real entre pasos, no es sólo asignar
 * los argumentos a campos"*— la verifica `hypotheses/builder.ts#
 * ensamblaEnLaPuerta`, que inspecciona el ÁRBOL VIVO del constructor del tipo
 * (`ctx.fileAt`) reusando `assemblySignalFor`, el discriminador que ese archivo
 * tiene medido desde la Ola 12. **Un detector `inter-file` no recibe árboles**
 * (`detect/types.ts#RepoUnit`), así que la separación no es una preferencia: es
 * el reparto que la arquitectura obliga. Consecuencia declarada y buscada: este
 * detector emite MÁS hallazgos que hipótesis produce Builder — su selectividad
 * es menor que 1, al revés de lo que le pasa a un ancla dedicada
 * (`repeated-collaborator-set` y `optional-behavior-flags` miden 100 %).
 *
 * Los DOS casos reales que obligaron a escribir esa segunda mitad, abiertos por
 * AE4 antes de medir ninguna precisión: `netbox/utilities/forms/rendering.py#
 * FieldSet` (`__init__(self, *items, name=None)`: el rango de argumentos es
 * VARIÁDICO, no opcionalidad) y `netbox/utilities/views.py#ViewTab` (seis
 * asignaciones a campos y nada más). Los dos tienen la opcionalidad
 * perfectamente medida en los sitios, y los dos son el caso que
 * `hypotheses/builder.ts` ya decidió en la Ola 12, con siete casos juzgados a
 * mano, que **NO es Builder**.
 *
 * ─── QUÉ NO CHEQUEA, DECLARADO Y MEDIDO ───────────────────────────────────
 *
 * 1. **EL ORDEN.** La fuerza de Builder tiene dos mitades ("pasos opcionales"
 *    y "orden significativo") y este detector sólo puede ver la primera: las
 *    aristas del grafo COLAPSAN las ocurrencias en `weight` y no llevan
 *    posición (`graph/types.ts#CodeGraphEdge`), la misma medición que AD4 y
 *    AC3 ya publicaron. Brecha declarada, no cerrada.
 * 2. **LOS LENGUAJES CON `new`.** `callArities` viaja SÓLO en aristas
 *    `references`/`calls`, y `new T(...)` produce una arista `instantiates`,
 *    que NO lo lleva. Medido por AE4 sobre 12 repos: **cero aristas
 *    `instantiates` con `callArities` en los 12**, contra 559 puertas con
 *    argumentos observados en `sqlalchemy` (Python) y 137 en `hugo` (Go). O
 *    sea: este detector VE la construcción de Python/Ruby/Go (donde construir
 *    es llamar) y es CIEGO a la de Java/C#/TypeScript/JavaScript (donde
 *    construir es `new`). No es una decisión de este archivo y no se puede
 *    arreglar acá: está declarado en el informe AE4 como pedido a quien sea
 *    dueño de `graph/build.ts`. Lo declaro como brecha y NO como `silentIn`,
 *    porque la FORMA —construir la misma entidad con combinaciones distintas—
 *    existe perfectamente en esos lenguajes; lo que falta es el hecho en el
 *    grafo, no la forma en el código.
 *
 * ─── POR QUÉ `inter-file` Y NO `intra-*` ──────────────────────────────────
 *
 * La unidad del hallazgo es el conjunto de SITIOS DE CONSTRUCCIÓN de un tipo,
 * que están repartidos por todo el repositorio: ninguna granularidad más chica
 * puede verlos juntos. No hace falta el árbol para nada de lo que se chequea.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import type { CodeGraphNode } from "../../graph/types.js";
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "combinaciones" | "pasosOpcionales" | "lugares" | "sitiosPorPuerta";

/**
 * Prefijos de `RoleLocation.role` con los que este ancla marca cada ubicación.
 * `hypotheses/builder.ts` los importa para recuperar, del `Finding`, cuál
 * ubicación es la PUERTA de construcción y cuáles los SITIOS que la usan — el
 * mismo reparto explícito que `repeated-collaborator-set` dejó escrito, para
 * que no haya un literal duplicado en dos archivos.
 */
export const ROLE_DOOR = "puerta de construcción";
export const ROLE_SITE = "sitio que construye";

/**
 * El nodo de gramática con el que Java/C# declaran un constructor. Mismo
 * literal que `code-grammar.ts#CONSTRUCTOR_NODE_WORD` reconoce (allí como
 * regex, para el walker); acá como conjunto, porque lo que se compara es el
 * `CodeGraphNode.nodeType` ya extraído — es vocabulario de GRAMÁTICA, no de
 * dominio.
 */
const CONSTRUCTOR_NODE_TYPES: ReadonlySet<string> = new Set(["constructor_declaration"]);

/**
 * Cuántos setters de aridad 1 hacen falta para reconocer un Builder YA PUESTO,
 * condición (5b). **No es un número nuevo:** es exactamente el `>= 3 miembros
 * function-like de aridad 1` que `hypotheses/builder.ts` (docstring del módulo,
 * "LAS TRES FORMAS", forma COMPLETA) ya exige desde la Ola 10/11 para decidir
 * `ya-aplicado`. Se reusa el número que el proyecto ya tiene para esta misma
 * pregunta en vez de inventar otro.
 */
const BUILDER_MIN_SETTERS = 3;

interface Door {
  /** El nodo por el que se construye (la clase invocada, o el miembro constructor). */
  readonly doorId: string;
  /** El tipo construido. */
  readonly typeId: string;
  /** Cantidades DISTINTAS de argumentos observadas en los sitios, ascendentes. */
  readonly argCounts: readonly number[];
  /** Símbolos distintos que construyen por esta puerta. */
  readonly sites: readonly string[];
}

export const detector: InterFileDetector<ThresholdKey, "optional-construction-combinations"> = {
  id: "optional-construction-combinations",
  kind: "optional-construction-combinations",
  scope: "inter-file",
  needsGraph: true,
  title: "La misma entidad, construida con combinaciones distintas en cada sitio",
  needs: [],
  // La evidencia de este detector ES la lista de argumentos de cada sitio de
  // construcción, y ese hecho (`callArities`) viaja SÓLO en aristas `calls`
  // (`graph/types.ts#CodeGraphEdge.callArities`, "presente sólo en
  // references/calls"). Sin `calls` este detector no tiene insumo y no puede
  // encontrar nada — no "encuentra cero". `instantiates` y `contains` se leen
  // también, pero sólo RETIRAN candidatos (5b) o resuelven el dueño de un
  // miembro: van en `DELIBERATELY_EXCLUDED` de `needs-edges-audit.test.ts`.
  needsEdges: ["calls"],
  thresholds: {
    combinaciones: pisoDeclarado(3, {
      rationale:
        "cuántas cantidades DISTINTAS de argumentos tienen que observarse en los sitios para que haya COMBINATORIA y no un interruptor. Con DOS cantidades distintas hay exactamente UN bloque opcional que se prende y se apaga, y eso lo resuelve un valor por defecto o una sobrecarga mas — la mitigacion mas barata, no un Builder. TRES es el minimo en que coexisten tres formas de construccion distintas y la combinatoria deja de poder escribirse como una escalera de sobrecargas. Piso de ESCALA declarado, no una magnitud calibrada contra un corpus.",
    }),
    pasosOpcionales: pisoDeclarado(3, {
      rationale:
        "cuantas RANURAS opcionales tiene que haber (el rango maximo-minimo de argumentos observados) para que un Builder pague. Con una o dos ranuras opcionales las combinaciones son 2 o 4 y se enumeran a mano: el remedio nativo del lenguaje (un valor por defecto, un objeto de parametros, una sobrecarga mas) cuesta menos que una clase nueva. Con TRES son ocho, y ahi es donde el propio consejo que este proyecto ya publica para Builder deja de aplicar al objeto de parametros ('conviene cuando hay varias combinaciones validas de argumentos; con una sola, un objeto de parametros alcanza', detect/intra-function/long-parameter-list.ts). Piso de ESCALA declarado.",
    }),
    lugares: pisoDeclarado(3, {
      rationale:
        "cuantos SITIOS distintos tienen que resolver la combinatoria por su cuenta para que un punto unico de construccion pague. Con DOS la mitigacion mas barata es una segunda fabrica o un valor por defecto compartido entre los dos sitios: la fuerza esta pero el patron no paga. Es la condicion de ESCALA que la Ola AC midio como la que le faltaba a su ancla de State (7 maquinas de estados reales, solo 1 justificaba el patron), con el mismo piso y la misma razon que la Ola AD escribio para el `lugares` de repeated-collaborator-set.",
    }),
    sitiosPorPuerta: presupuesto(4000, {
      rationale:
        "tope de trabajo, no de deteccion: al recorrer los sitios de una puerta muy popular (un tipo base construido en miles de lugares) el cruce con la condicion (5a) se vuelve cuadratico. Saltear una puerta con mas sitios que el tope solo puede hacer que NO se encuentre — nunca inventa una —, y una puerta construida desde miles de sitios es, por definicion, lo contrario de la combinatoria privada que este detector busca.",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de volumen por repo, del mismo orden que el resto del catalogo inter-file. Esta para que un repo atipico no publique miles de tarjetas del mismo kind; con estos pisos ningun repo de las dos poblaciones se acerca.",
  }),
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!graph) return [];

    const combinaciones = ctx.threshold("combinaciones");
    const pasosOpcionales = ctx.threshold("pasosOpcionales");
    const lugares = ctx.threshold("lugares");
    const sitiosPorPuerta = ctx.threshold("sitiosPorPuerta");

    const nodeById = new Map<string, CodeGraphNode>();
    for (const n of graph.nodes) {
      if (n.kind !== "symbol") continue;
      if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    }

    /** `miembro -> su dueño class-like` y `dueño -> sus miembros`. */
    const ownerOf = new Map<string, string>();
    const membersOf = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (e.kind !== "contains") continue;
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      if (!from || !to || from.family !== "class-like") continue;
      if (!ownerOf.has(e.to)) ownerOf.set(e.to, e.from);
      const list = membersOf.get(e.from);
      if (list) list.push(e.to);
      else membersOf.set(e.from, [e.to]);
    }

    /** (1) ¿este nodo es una PUERTA DE CONSTRUCCIÓN? ⇒ el tipo que construye. */
    const constructedType = (node: CodeGraphNode): string | null => {
      if (node.family === "class-like") return node.id; // `T(...)` / `T{...}`
      if (node.family !== "function-like") return null;
      const last = node.symbolPath.at(-1);
      if (last === undefined) return null;
      const isCtor = (node.nodeType !== undefined && CONSTRUCTOR_NODE_TYPES.has(node.nodeType)) || CONSTRUCTOR_NAMES.has(last.toLowerCase());
      if (!isCtor) return null;
      return ownerOf.get(node.id) ?? null;
    };

    /** `puerta -> cantidades de argumentos observadas` y `puerta -> sitios`. */
    const argCountsOf = new Map<string, Set<number>>();
    const sitesOf = new Map<string, Set<string>>();
    /** `símbolo -> símbolos que lo invocan` (para (5a)). */
    const callersOf = new Map<string, Set<string>>();
    /** `símbolo -> tipos que instancia` (para (5b)). */
    const instantiatesOf = new Map<string, Set<string>>();

    for (const e of graph.edges) {
      if (e.kind === "instantiates") {
        let inst = instantiatesOf.get(e.from);
        if (!inst) {
          inst = new Set();
          instantiatesOf.set(e.from, inst);
        }
        inst.add(e.to);
        continue;
      }
      if (e.kind !== "calls") continue;

      let callers = callersOf.get(e.to);
      if (!callers) {
        callers = new Set();
        callersOf.set(e.to, callers);
      }
      callers.add(e.from);

      // (2) la evidencia de opcionalidad: SÓLO aristas NO ambiguas — ver el
      // docstring del módulo, "LAS ARISTAS AMBIGUAS NO CUENTAN".
      if (e.provenance === "ambiguous") continue;
      if (!e.callArities || e.callArities.length === 0) continue;
      if (!nodeById.has(e.from)) continue;

      let counts = argCountsOf.get(e.to);
      if (!counts) {
        counts = new Set();
        argCountsOf.set(e.to, counts);
      }
      for (const a of e.callArities) counts.add(a);

      let sites = sitesOf.get(e.to);
      if (!sites) {
        sites = new Set();
        sitesOf.set(e.to, sites);
      }
      sites.add(e.from);
    }

    /** (5b) ¿ya existe un Builder para `typeId`? Devuelve el nodo de `B`. */
    const existingBuilder = (typeId: string): string | null => {
      for (const [b, members] of membersOf) {
        if (b === typeId) continue;
        let setters = 0;
        for (const m of members) {
          const node = nodeById.get(m);
          if (node?.family === "function-like" && node.arity === 1) setters++;
        }
        if (setters < BUILDER_MIN_SETTERS) continue;
        for (const m of members) {
          const node = nodeById.get(m);
          if (node?.family !== "function-like" || node.arity !== 0) continue;
          if (instantiatesOf.get(m)?.has(typeId)) return b;
        }
      }
      return null;
    };

    const surviving: Door[] = [];
    for (const [doorId, counts] of argCountsOf) {
      const node = nodeById.get(doorId);
      if (!node) continue;
      const typeId = constructedType(node); // (1)
      if (typeId === null) continue;

      const argCounts = [...counts].sort((a, b) => a - b);
      if (argCounts.length < combinaciones.value) continue; // (2)
      if (argCounts[argCounts.length - 1]! - argCounts[0]! < pasosOpcionales.value) continue; // (3)

      const sites = [...(sitesOf.get(doorId) ?? [])].sort();
      if (sites.length < lugares.value) continue; // (4)
      if (sites.length > sitiosPorPuerta.value) continue; // presupuesto de trabajo

      // (5a) ¿alguno de los sitios ya embudó la construcción de los demás?
      const siteSet = new Set(sites);
      let funnel = false;
      for (const s of sites) {
        let reached = 0;
        for (const c of callersOf.get(s) ?? []) if (c !== s && siteSet.has(c)) reached++;
        if (reached >= 2) {
          funnel = true;
          break;
        }
      }
      if (funnel) continue;

      if (existingBuilder(typeId)) continue; // (5b)

      surviving.push({ doorId, typeId, argCounts, sites });
    }

    surviving.sort((a, b) => b.argCounts.length - a.argCounts.length || b.sites.length - a.sites.length || (a.doorId < b.doorId ? -1 : 1));

    const findings: RawFinding[] = [];
    // El tope de volumen NO se aplica acá: `detect/run.ts#capDetectorFindings`
    // resuelve y aplica `maxFindings` sobre lo que este `run()` devuelve.
    for (const door of surviving) {
      const doorNode = nodeById.get(door.doorId)!;
      const typeNode = nodeById.get(door.typeId);
      const typeName = typeNode?.symbolPath.join(".") ?? door.typeId;
      const spread = door.argCounts[door.argCounts.length - 1]! - door.argCounts[0]!;

      const locations: RoleLocation[] = [
        {
          file: doorNode.file,
          startLine: doorNode.startLine ?? 1,
          endLine: doorNode.endLine ?? doorNode.startLine ?? 1,
          symbol: doorNode.symbolPath.join("."),
          role: `${ROLE_DOOR}: se la invoca con ${door.argCounts.length} cantidades distintas de argumentos (${door.argCounts.join(", ")})`,
        },
      ];
      for (const site of door.sites) {
        const node = nodeById.get(site);
        if (!node) continue;
        locations.push({
          file: node.file,
          startLine: node.startLine ?? 1,
          endLine: node.endLine ?? node.startLine ?? 1,
          symbol: node.symbolPath.join("."),
          role: `${ROLE_SITE}: elige por su cuenta qué pasos opcionales pasa`,
        });
      }

      findings.push({
        variant: door.typeId,
        title: `${typeName} se construye de ${door.argCounts.length} formas distintas en ${door.sites.length} sitios`,
        detail:
          `Los ${door.sites.length} sitios que construyen "${typeName}" le pasan ${door.argCounts.length} cantidades DISTINTAS de argumentos (${door.argCounts.join(", ")}): ` +
          `hay al menos ${spread} ranuras que unos sitios llenan y otros omiten. La combinatoria la resuelve cada sitio por su cuenta y nadie la acumula — ` +
          "ningún sitio del grupo embudó a los demás y no hay ningún tipo con setters y un método sin argumentos que construya éste. " +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (una entidad con muchas combinaciones válidas de construcción, resueltas a mano en cada punto) — " +
          "si conviene un Builder, si alcanza un objeto de parámetros, o si las combinaciones son deliberadas, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "combinaciones distintas de argumentos observadas", value: door.argCounts.length, threshold: combinaciones },
          { label: "ranuras opcionales (rango de argumentos)", value: spread, threshold: pasosOpcionales },
          { label: "sitios que construyen por esta puerta", value: door.sites.length, threshold: lugares },
        ],
        evidence: [
          { label: "cantidades de argumentos observadas", value: door.argCounts.length, note: door.argCounts.join(", ") },
          {
            label: "parámetros declarados en la puerta",
            value: doorNode.arity ?? -1,
            note:
              doorNode.arity === undefined || doorNode.arity === null
                ? "la gramática no expuso lista de parámetros para esta puerta — no se sabe, distinto de aridad cero"
                : "la declaración dice cuántos parámetros HAY; las cantidades de arriba dicen cuántos se USAN",
          },
          {
            label: "sitios que ya pasan por otro sitio del grupo",
            value: 0,
            note: "condición de RESOLUCIÓN VERIFICADA: si alguno hubiera embudado a los demás, este hallazgo no existiría",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 20 + door.argCounts.length * 5 + door.sites.length * 2),
        advice: {
          // El refactor barato y mecánico primero, el patrón después y como
          // opcional: mismo reparto que `long-parameter-list.ts` (la otra ancla
          // de este patrón) y lo que `RawFinding.advice` pide literalmente.
          primary: {
            name: "Introduce Parameter Object",
            kind: "refactorizacion",
            why:
              `Los ${door.sites.length} sitios que construyen "${typeName}" eligen cada uno qué ranuras llenar. ` +
              "Agrupar las ranuras opcionales en un solo objeto de opciones es el paso más barato y no exige un tipo nuevo por entidad.",
            source: "https://refactoring.guru/es/smells/long-parameter-list",
          },
          pattern: {
            name: "Builder",
            kind: "patron_de_diseno",
            why:
              `"${typeName}" se construye hoy de ${door.argCounts.length} formas distintas desde ${door.sites.length} sitios, con hasta ${spread} ranuras opcionales. ` +
              "Un objeto que acumule los pasos elegidos y valide al final deja a cada sitio con la combinación que necesita y sin conocer las demás.",
            source: "https://refactoring.guru/es/design-patterns/builder",
            caveat:
              "Si las combinaciones son pocas y estables, una escalera de fábricas con nombre (o un objeto de parámetros) cuesta menos que un Builder.",
            cost: "Agrega un tipo por cada entidad construida y aleja la construcción del propio tipo.",
          },
        },
      });
    }

    return findings;
  },
};
