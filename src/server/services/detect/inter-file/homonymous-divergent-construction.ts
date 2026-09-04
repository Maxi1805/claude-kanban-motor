/**
 * `homonymous-divergent-construction` — OLA AE, frente AE8.
 * **EL ANCLA-FUERZA DE FACTORY METHOD.**
 *
 * ─── POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA ──────────────────────────
 *
 * Factory Method tenía dos anclas —`conditional-chain` y `repeated-switch`— y
 * las dos son SÍNTOMAS sintácticos ("una escalera larga", "el mismo
 * discriminante decidido dos veces"). Ninguna nombra la situación que el
 * patrón resuelve, así que toda la semántica cae sobre un único `required`
 * (`hypotheses/factory-method.ts#isInstantiatesVariant`), y ése mata casi
 * todo. **Medido por AE8 sobre volcados propios de las dos poblaciones (13
 * bibliotecas + 8 aplicaciones de `corpus-app/`): 977 hallazgos ancla, 7
 * hipótesis de Factory Method. 970 mueren en ese `required` — el 99,3 %.**
 * Es la misma causa que el frente W1 midió en 0 de 186 sobre tres repos y que
 * A2 reprodujo: `code-analyzer.ts#ladderInstantiatesTypes` exige que TODAS las
 * ramas de la escalera construyan un tipo distinto, y con cadenas de 8, 14 o
 * 29 ramas esa conjunción no se cumple casi nunca. **Esa función es de nivel 1
 * y sigue sin dueño tres olas después; este detector NO la toca: entra por
 * otro lado.**
 *
 * A diferencia de Facade (`repeated-collaborator-set`, AD4) y de
 * `Decorator · homonymous-delegation`, la patología de Factory Method **no**
 * es "no puede decir `ausente`": de sus 7 hipótesis, 6 son `ausente` y 1
 * `parcial`. **Su patología es no tener población.**
 *
 * ─── LA FUERZA QUE FACTORY METHOD RESUELVE, ESCRITA COMO LA RESUELVE ──────
 *
 * GoF: *"define an interface for creating an object, but let subclasses decide
 * which class to instantiate — Factory Method lets a class defer instantiation
 * to subclasses"*. Escrita como situación:
 *
 * *Varios tipos emparentados escriben, cada uno por su cuenta, el MISMO
 * procedimiento, y lo ÚNICO que varía entre ellos es QUÉ TIPO CONCRETO
 * CONSTRUYEN. La decisión de "qué crear" está soldada adentro del
 * procedimiento en vez de estar aislada en un punto de creación redefinible,
 * así que cada variante nueva obliga a copiar el procedimiento entero.*
 *
 * Es una propiedad del GRAFO (quién hereda de quién, quién declara qué
 * miembro, qué construye cada uno), no una forma sintáctica de un cuerpo. Y es
 * FUERZA y no ESTRUCTURA: la situación existe tanto si el patrón está puesto
 * como si no — lo que cambia es DÓNDE VIVE la decisión.
 *
 * El nombre es paralelo, a propósito, al `homonymous-divergent-sequence` de
 * AC3 (la fuerza de Template Method), porque es su hermana exacta: allá lo que
 * diverge entre hermanos es la SECUENCIA de pasos, acá lo que diverge es la
 * CONSTRUCCIÓN.
 *
 * ─── LAS CINCO CONDICIONES, CON LA INTENCIÓN DE CADA UNA ──────────────────
 *
 * (1) HAY UN ARRIBA DONDE EL GANCHO PUEDE VIVIR — >= `hermanos` tipos declaran
 *     el mismo ancestro (aristas `extends`/`mixes-in`/`implements`/
 *     `satisfies`).
 *     INTENCIÓN: *"la mitigación tiene dónde aterrizar"*. Sin un ancestro
 *     común no hay "en vez de estar arriba": la mitigación sería otra (Extract
 *     Class, Strategy), no diferir la creación a los subtipos.
 *
 * (2) EL MISMO MIEMBRO ESTÁ ESCRITO N VECES — >= `hermanos` de esos hermanos
 *     declaran un miembro con el MISMO nombre, y ese nombre no es el de un
 *     constructor (`code-grammar.ts#CONSTRUCTOR_NAMES`).
 *     INTENCIÓN: *"es la MISMA operación, escrita más de una vez"*. El mismo
 *     nombre en hermanos de una familia es la evidencia de forma de que las
 *     dos declaraciones ocupan el mismo lugar del contrato — el mismo
 *     argumento que `intra-file/homonymous-divergent-sequence.ts` (2) ya
 *     escribió. Los constructores quedan afuera porque **un constructor no se
 *     puede redefinir como gancho**: la mitigación ahí es otra (inyectar el
 *     producto), no un Factory Method.
 *
 * (3) LO QUE VARÍA ES LA CREACIÓN — cada una de esas declaraciones construye
 *     al menos un tipo concreto (arista `instantiates` saliente), hay >=
 *     `productos` tipos construidos DISTINTOS entre todas, y **los conjuntos
 *     construidos NO son todos iguales**.
 *     INTENCIÓN: *"lo que cambia entre los hermanos es QUÉ SE CREA"*, que es
 *     literalmente lo que el patrón difiere a los subtipos. Es lo que separa
 *     Factory Method de Template Method (donde lo que varía es un PASO) y de
 *     Pull Up Method (donde no varía nada y el método entero sube). **Las tres
 *     mitades hacen falta y ninguna sobra, y la tercera está MEDIDA: sin ella,
 *     los notificadores de gitea pasan con las dos copias construyendo
 *     exactamente `{EventSource, Permission}` — ahí no varía nada.**
 *
 * (4) ESCALA — EL PROCEDIMIENTO DUPLICADO PAGA: cada declaración invoca >=
 *     `pasosPorCopia` símbolos, y >= `pasosComunes` de esos símbolos son
 *     invocados por TODAS.
 *     INTENCIÓN: *"hay un procedimiento duplicado que la mitigación sube al
 *     ancestro"*. Es LA condición de escala de este ancla y ataca de frente el
 *     modo de falla que AC2 documentó (7 máquinas de estados REALES, 6 con
 *     ramas de una línea): **un miembro que sólo construye no tiene
 *     procedimiento que subir, y encima YA ES un punto de creación
 *     redefinible** — proponerle Factory Method sería proponérselo a un
 *     Factory Method. La mitad "pasos comunes" es la que separa "el mismo
 *     procedimiento" de "dos algoritmos que comparten un nombre genérico",
 *     misma distinción y mismo número que
 *     `homonymous-divergent-sequence.ts` (3).
 *
 * (5) RESOLUCIÓN VERIFICADA — EL PUNTO DE CREACIÓN REDEFINIBLE NO EXISTE YA:
 *     la familia no tiene ya OTRO miembro homónimo `c != m`, declarado por >=2
 *     hermanos, que construya y que NO tenga procedimiento propio (< `pasos
 *     PorCopia` llamadas) — o sea un método de creación DEDICADO — al que las
 *     declaraciones de `m` DELEGUEN.
 *     INTENCIÓN: *"si el gancho ya existiera, la propuesta correcta sería 'usá
 *     el que hay', que es OTRA refactorización"*. Es la tercera condición de la
 *     receta de la Ola AC.
 *
 * **Y LA MITAD DE LA RESOLUCIÓN QUE NO ES UNA CONDICIÓN SINO UNA PROPIEDAD, Y
 * SE DECLARA EN VEZ DE ACREDITARSE:** la forma canónica de "Factory Method ya
 * aplicado" —el ancestro tiene el procedimiento UNA vez y los hermanos sólo
 * redefinen el gancho— es **imposible de emitir por construcción**, porque (2)
 * exige que >=2 hermanos DECLAREN el procedimiento y (4) exige que ese
 * procedimiento tenga pasos propios. Que este ancla no dispare sobre un
 * Factory Method aplicado **no la acredita**: es cero por construcción, con el
 * mismo criterio con el que AC3 y AD4 lo dijeron de las suyas.
 *
 * ─── LAS ARISTAS AMBIGUAS CUENTAN, Y ESTÁ MEDIDO ──────────────────────────
 *
 * Censo propio de AE8 sobre los 21 volcados de grafo: de las aristas `calls`,
 * **134.029 son `ambiguous` contra 80.307 `resolved`**; de las `satisfies`,
 * **15.664 `ambiguous` + 7.034 `inferred` y CERO `resolved`**. Excluirlas
 * apagaría el detector entero en Go y le sacaría el 62 % de los pasos al
 * resto. Mismo argumento que `hypotheses/facade.ts#outgoingCallCount` y que
 * `inter-file/repeated-collaborator-set.ts` ya escribieron: *la existencia de
 * la llamada es un hecho del CÓDIGO y sólo su DESTINO es lo que el resolutor no
 * supo fijar*. **Lo ambiguo VIAJA COMO AMBIGUO:** cada hallazgo publica, en su
 * evidencia, cuántos de sus pasos comunes apoyan en al menos una arista NO
 * ambigua y de qué procedencia es la arista de familia.
 *
 * ─── QUÉ NO CHEQUEA, DECLARADO ────────────────────────────────────────────
 *
 * NO compara los CUERPOS. La fuerza dice "el MISMO procedimiento"; este
 * detector verifica el mismo CONJUNTO de símbolos invocados, no el mismo orden
 * ni el mismo texto. La razón es la misma que AC3 y AD4 midieron: las aristas
 * `calls` colapsan las ocurrencias en `weight` y no llevan posición, y los
 * cuerpos a comparar están en archivos DISTINTOS — un detector `inter-file`
 * recibe `RepoUnit`, que ya liberó los árboles (`detect/types.ts`). Queda
 * escrito en el `toConfirm` de la hipótesis.
 *
 * ─── POR QUÉ `inter-file` Y NO `intra-file` ───────────────────────────────
 *
 * La unidad del hallazgo es un grupo de hermanos que, en Java/C#/Go/Ruby, casi
 * nunca viven en el mismo archivo (medido: de los 41 grupos que este detector
 * encuentra, la enorme mayoría reparte sus declaraciones en 2-4 archivos).
 * `intra-file/homonymous-divergent-sequence.ts` declara esa misma brecha como
 * su límite; acá no existe porque todo sale del grafo.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import type { CodeGraphNode, EdgeKind } from "../../graph/types.js";
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "hermanos" | "productos" | "pasosPorCopia" | "pasosComunes";

/**
 * Prefijos de `RoleLocation.role` con los que este ancla marca cada ubicación.
 * `hypotheses/factory-method.ts` los importa para recuperar, del `Finding`,
 * cuáles ubicaciones son las DECLARACIONES que redeclaran el procedimiento y
 * cuál es el ANCESTRO — el mismo reparto explícito que `repeated-collaborator-
 * set.ts` estrenó, para que no haya un literal duplicado en dos archivos.
 */
export const ROLE_REDECLARES = "redeclara el procedimiento y elige el producto";
export const ROLE_ANCESTOR = "ancestro común";

/** Aristas "es-un": cualquiera de las cuatro hace familia. NO se restringe a
 *  la herencia de IMPLEMENTACIÓN (`extends`/`mixes-in`) como hace
 *  `homonymous-divergent-sequence.ts`, y la razón es que acá el ancestro
 *  nombra la FAMILIA (quién querría decidir distinto), no carga el cuerpo
 *  subido: `hypotheses/factory-method.ts#cost` ya declara EN PRODUCCIÓN que la
 *  mitigación en un lenguaje sin herencia de implementación es "una función
 *  constructora dedicada (`NewX`) o un mapa de funciones constructoras". El
 *  hallazgo publica de qué tipo es la arista para que la lectura sea
 *  auditable. */
const FAMILY_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["extends", "implements", "mixes-in", "satisfies"]);

interface Declaration {
  /** Id de nodo del miembro. */
  readonly id: string;
  readonly owner: string;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly symbol: string;
  /** Ids de los tipos que este miembro construye. */
  readonly products: ReadonlySet<string>;
  /** Ids de los símbolos que este miembro invoca. */
  readonly steps: ReadonlySet<string>;
}

interface Group {
  readonly key: string;
  readonly memberName: string;
  readonly decls: readonly Declaration[];
  /** Etiquetas legibles de los ancestros que reúnen a estos hermanos. */
  readonly bases: readonly string[];
  readonly baseIds: readonly string[];
  readonly familyEdgeKinds: readonly string[];
  /** ¿alguna arista de familia del grupo NO es ambigua? */
  readonly confidentFamily: boolean;
  readonly productNames: readonly string[];
  readonly commonSteps: readonly string[];
  /** Pasos comunes que apoyan, en al menos una declaración, en una arista `calls` NO ambigua. */
  readonly confidentCommonSteps: number;
}

export const detector: InterFileDetector<ThresholdKey, "homonymous-divergent-construction"> = {
  id: "homonymous-divergent-construction",
  kind: "homonymous-divergent-construction",
  scope: "inter-file",
  needsGraph: true,
  title: "Hermanos que repiten el mismo procedimiento y sólo cambian qué construyen",
  needs: [],
  // CONJUNCIÓN REAL, las dos: sin `instantiates` no hay forma de saber QUÉ
  // construye cada hermano (condición 3) y sin `calls` no hay forma de saber
  // si hay un procedimiento duplicado que subir (condición 4). Faltando
  // cualquiera de las dos este detector no puede encontrar nada — no
  // "encuentra cero". `contains` es la arista estructural de fondo y va en
  // `needs-edges-audit.test.ts#DELIBERATELY_EXCLUDED`.
  needsEdges: ["instantiates", "calls"],
  // ALTERNATIVA: alcanza con UNA de las cuatro para que exista "familia".
  // Ruby no tiene `implements`/`satisfies`, Go no tiene `extends`/`mixes-in`;
  // declararlas en conjunción apagaría el detector entero en cada uno de esos
  // lenguajes — la regresión exacta que `types.ts#needsAnyEdge` documenta.
  needsAnyEdge: ["extends", "implements", "mixes-in", "satisfies"],
  thresholds: {
    hermanos: presencia({
      rationale:
        "con UNA sola declaración no hay nada repetido que subir: la forma que este detector busca ('el mismo miembro escrito N veces, cada uno construyendo lo suyo') no existe por debajo de dos. Mismo MIN_DISTINCT_UNITS (2) que hypotheses/template-method.ts ya exige para reconocer una familia y mismo criterio que homonymous-divergent-sequence.ts#unidades; no hay magnitud que calibrar, la pregunta es binaria.",
    }),
    productos: presencia({
      rationale:
        "por debajo de DOS tipos construidos distintos no hay variación de creación que diferir: si todos los hermanos construyen lo mismo, la mitigación correcta es subir el método entero (Pull Up Method), no dejar un gancho de creación. Piso de FORMA, binario, no una magnitud calibrada.",
    }),
    pasosPorCopia: pisoDeclarado(3, {
      rationale:
        "ES EL UMBRAL DE ESCALA DE ESTE ANCLA: cuánto procedimiento tiene que haber duplicado en cada hermano para que subirlo al ancestro pague. Mismo MIN_SEQUENCE_LEN (3) que hypotheses/template-method.ts hereda de la vía vieja para decidir que un cuerpo 'tiene secuencia de llamadas' suficiente como para compararse — se reutiliza el número que el proyecto ya usa para esta misma pregunta en vez de inventar uno. Sin él vuelve el modo de falla que la Ola AC midió sobre State (7 máquinas de estados reales, 6 con ramas de una línea): un miembro que sólo construye no tiene procedimiento que subir y ADEMÁS ya es, él mismo, un punto de creación redefinible.",
    }),
    pasosComunes: pisoDeclarado(2, {
      rationale:
        "un solo paso compartido puede ser incidental (un logger, una llamada al ancestro); con dos, 'los hermanos hacen el MISMO procedimiento' empieza a significar algo y no 'comparten un vocabulario'. Mismo número y misma razón que homonymous-divergent-sequence.ts#pasosComunes. Piso de FORMA.",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de volumen por repo, del mismo orden que el resto del catálogo inter-file. Medido sobre las dos poblaciones: el repo más poblado (guava) emite 7 con estos pisos, así que el tope no recorta nada hoy — está para que un repo atípico no publique miles de tarjetas del mismo kind.",
  }),
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!graph) return [];

    const hermanos = ctx.threshold("hermanos");
    const productos = ctx.threshold("productos");
    const pasosPorCopia = ctx.threshold("pasosPorCopia");
    const pasosComunes = ctx.threshold("pasosComunes");

    const nodeById = new Map<string, CodeGraphNode>();
    for (const n of graph.nodes) if (n.kind === "symbol" && !nodeById.has(n.id)) nodeById.set(n.id, n);

    /** `dueño -> nombre de miembro -> ids de las declaraciones` (aristas `contains`). */
    const membersOf = new Map<string, Map<string, string[]>>();
    /** `ancestro -> subtipos` + de qué kind es la arista y si alguna NO es ambigua. */
    const subtypesOf = new Map<string, Set<string>>();
    const familyKindsOf = new Map<string, Set<string>>();
    const familyConfident = new Set<string>();
    const productsOf = new Map<string, Set<string>>();
    const stepsOf = new Map<string, Set<string>>();
    const confidentStepPairs = new Set<string>();

    for (const e of graph.edges) {
      if (e.kind === "contains") {
        const owner = nodeById.get(e.from);
        const member = nodeById.get(e.to);
        if (!owner || !member || member.family !== "function-like") continue;
        const name = member.symbolPath[member.symbolPath.length - 1];
        if (!name) continue;
        let byName = membersOf.get(e.from);
        if (!byName) {
          byName = new Map();
          membersOf.set(e.from, byName);
        }
        const list = byName.get(name);
        if (list) list.push(e.to);
        else byName.set(name, [e.to]);
        continue;
      }
      if (FAMILY_EDGE_KINDS.has(e.kind)) {
        let subs = subtypesOf.get(e.to);
        if (!subs) {
          subs = new Set();
          subtypesOf.set(e.to, subs);
        }
        subs.add(e.from);
        let kinds = familyKindsOf.get(e.to);
        if (!kinds) {
          kinds = new Set();
          familyKindsOf.set(e.to, kinds);
        }
        kinds.add(e.kind);
        if (e.provenance !== "ambiguous") familyConfident.add(e.to);
        continue;
      }
      if (e.kind === "instantiates") {
        let prods = productsOf.get(e.from);
        if (!prods) {
          prods = new Set();
          productsOf.set(e.from, prods);
        }
        prods.add(e.to);
        continue;
      }
      if (e.kind === "calls") {
        let steps = stepsOf.get(e.from);
        if (!steps) {
          steps = new Set();
          stepsOf.set(e.from, steps);
        }
        steps.add(e.to);
        if (e.provenance !== "ambiguous") confidentStepPairs.add(`${e.from} ${e.to}`);
      }
    }

    const nameOf = (id: string): string => nodeById.get(id)?.symbolPath.at(-1) ?? id;

    const declarationOf = (id: string, owner: string): Declaration | null => {
      const node = nodeById.get(id);
      if (!node) return null;
      return {
        id,
        owner,
        file: node.file,
        startLine: node.startLine ?? 1,
        endLine: node.endLine ?? node.startLine ?? 1,
        symbol: node.symbolPath.join("."),
        products: productsOf.get(id) ?? new Set<string>(),
        steps: stepsOf.get(id) ?? new Set<string>(),
      };
    };

    const groups = new Map<string, Group>();

    for (const [baseId, subs] of subtypesOf) {
      if (subs.size <= hermanos.value) continue; // (1) `presencia` ⇒ `> 1` es `>= 2`

      // Los miembros de creación DEDICADOS que la familia YA tiene — la
      // condición (5). Un miembro homónimo declarado por >=2 hermanos, que
      // construye en todos ellos y que en NINGUNO tiene procedimiento propio,
      // ES un punto de creación redefinible.
      const hookIds = new Set<string>();
      const declaredNames = new Map<string, number>();
      for (const sub of subs) {
        for (const name of membersOf.get(sub)?.keys() ?? []) declaredNames.set(name, (declaredNames.get(name) ?? 0) + 1);
      }
      for (const [name, count] of declaredNames) {
        if (count < 2 || CONSTRUCTOR_NAMES.has(name)) continue;
        const ids: string[] = [];
        for (const sub of subs) for (const id of membersOf.get(sub)?.get(name) ?? []) ids.push(id);
        const constructing = ids.filter((id) => (productsOf.get(id)?.size ?? 0) > 0);
        if (constructing.length < 2) continue;
        if (constructing.every((id) => (stepsOf.get(id)?.size ?? 0) < pasosPorCopia.value)) {
          for (const id of constructing) hookIds.add(id);
        }
      }

      for (const [name, count] of declaredNames) {
        // (2) el mismo miembro, escrito N veces, y no es un constructor
        if (count <= hermanos.value || CONSTRUCTOR_NAMES.has(name)) continue;
        const decls: Declaration[] = [];
        for (const sub of [...subs].sort()) {
          for (const id of membersOf.get(sub)?.get(name) ?? []) {
            const d = declarationOf(id, sub);
            if (d) decls.push(d);
          }
        }
        // (3) cada una construye algo
        const constructing = decls.filter((d) => d.products.size > 0);
        if (constructing.length <= hermanos.value) continue;
        const allProducts = new Set<string>();
        for (const d of constructing) for (const p of d.products) allProducts.add(p);
        if (allProducts.size <= productos.value) continue;
        // (3, tercera mitad) la creación DIVERGE: no todas construyen lo mismo
        const signatures = new Set(constructing.map((d) => [...d.products].sort().join(" ")));
        if (signatures.size < 2) continue;
        // (4) escala: procedimiento propio en cada copia y procedimiento COMÚN
        if (constructing.some((d) => d.steps.size < pasosPorCopia.value)) continue;
        let common: Set<string> | null = null;
        for (const d of constructing) {
          if (common === null) common = new Set(d.steps);
          else for (const s of [...common]) if (!d.steps.has(s)) common.delete(s);
        }
        if (!common || common.size < pasosComunes.value) continue;
        // (5) RESOLUCIÓN VERIFICADA: ninguna copia delega en un gancho ya existente
        if (hookIds.size > 0 && constructing.some((d) => [...d.steps].some((s) => hookIds.has(s)))) continue;

        const key = constructing
          .map((d) => d.id)
          .sort()
          .join(" ");
        const baseLabel = nodeById.get(baseId)?.symbolPath.at(-1) ?? baseId;
        const existing = groups.get(key);
        if (existing) {
          groups.set(key, {
            ...existing,
            bases: [...new Set([...existing.bases, baseLabel])].sort(),
            baseIds: [...new Set([...existing.baseIds, baseId])].sort(),
            familyEdgeKinds: [...new Set([...existing.familyEdgeKinds, ...(familyKindsOf.get(baseId) ?? [])])].sort(),
            confidentFamily: existing.confidentFamily || familyConfident.has(baseId),
          });
          continue;
        }
        const commonList = [...common].sort();
        groups.set(key, {
          key,
          memberName: name,
          decls: constructing,
          bases: [baseLabel],
          baseIds: [baseId],
          familyEdgeKinds: [...(familyKindsOf.get(baseId) ?? [])].sort(),
          confidentFamily: familyConfident.has(baseId),
          productNames: [...new Set([...allProducts].map(nameOf))].sort(),
          commonSteps: commonList,
          confidentCommonSteps: commonList.filter((s) => constructing.some((d) => confidentStepPairs.has(`${d.id} ${s}`))).length,
        });
      }
    }

    const findings: RawFinding[] = [];
    // El tope de volumen NO se aplica acá: `detect/run.ts#capDetectorFindings`
    // resuelve y aplica `maxFindings` sobre lo que este `run()` devuelve.
    for (const group of [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
      const locations: RoleLocation[] = group.decls.map((d) => ({
        file: d.file,
        startLine: d.startLine,
        endLine: d.endLine,
        symbol: d.symbol,
        role: `${ROLE_REDECLARES}: construye ${[...d.products].map(nameOf).sort().join(", ")} y ejecuta ${d.steps.size} paso(s)`,
      }));
      for (const baseId of group.baseIds) {
        const node = nodeById.get(baseId);
        if (!node) continue;
        locations.push({
          file: node.file,
          startLine: node.startLine ?? 1,
          endLine: node.endLine ?? node.startLine ?? 1,
          symbol: node.symbolPath.join("."),
          role: `${ROLE_ANCESTOR}: reúne a los ${group.decls.length} tipos que redeclaran "${group.memberName}"`,
        });
      }
      if (locations.length === 0) continue;

      const commonNames = group.commonSteps.map(nameOf).sort();
      findings.push({
        variant: group.memberName,
        title: `${group.decls.length} hermanos repiten "${group.memberName}" y sólo cambian qué construyen`,
        detail:
          `${group.decls.length} tipos de la familia ${group.bases.map((b) => `"${b}"`).join(" / ")} declaran cada uno su propio "${group.memberName}". ` +
          `Los ${group.decls.length} ejecutan al menos ${pasosPorCopia.value} pasos y comparten ${commonNames.length} (${commonNames.join(", ")}), ` +
          `pero cada uno construye lo suyo: ${group.productNames.join(", ")}. ` +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (el mismo procedimiento escrito una vez por hermano, con la elección del tipo construido soldada adentro) — " +
          "si conviene aislar la creación en un punto redefinible, si ya hay uno a medias, o si los procedimientos no son en verdad el mismo, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "hermanos que redeclaran el mismo miembro construyendo lo suyo", value: group.decls.length, threshold: hermanos },
          { label: "tipos concretos distintos construidos entre ellos", value: group.productNames.length, threshold: productos },
          { label: "pasos comunes a TODAS las copias", value: commonNames.length, threshold: pasosComunes },
        ],
        evidence: [
          { label: "pasos por copia (mínimo)", value: Math.min(...group.decls.map((d) => d.steps.size)), note: `piso exigido: ${pasosPorCopia.value}` },
          {
            label: "pasos comunes con al menos una arista NO ambigua",
            value: group.confidentCommonSteps,
            note: `de ${commonNames.length}; el resto apoya sólo en aristas 'calls' cuya resolución quedó ambigua — lo ambiguo viaja como ambiguo`,
          },
          {
            label: "ancestros que reúnen al grupo",
            value: group.bases.length,
            note: `${group.bases.join(", ")} — por ${group.familyEdgeKinds.join("/")}${group.confidentFamily ? "" : " (toda la evidencia de familia quedó ambigua)"}`,
          },
          {
            label: "puntos de creación dedicados que la familia ya tiene y estas copias usan",
            value: 0,
            note: "condición de RESOLUCIÓN VERIFICADA: si hubiera uno al que estas copias delegaran, este hallazgo no existiría",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 25 + group.decls.length * 5 + group.productNames.length * 3),
        advice: {
          primary: {
            name: "Extract Method",
            kind: "refactorizacion",
            why:
              `En cada uno de los ${group.decls.length} hermanos, la construcción de ${group.productNames.join(" / ")} está mezclada con los ${commonNames.length} pasos que todos repiten. ` +
              "Aislar la construcción en un miembro propio dentro de cada hermano deja el procedimiento comparable — y visible — antes de decidir dónde vive.",
            source: "https://refactoring.com/catalog/extractFunction.html",
          },
        },
      });
    }

    return findings;
  },
};
