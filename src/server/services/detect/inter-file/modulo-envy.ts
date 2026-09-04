/**
 * `modulo-envy` — ENVIDIA DE LAS CARACTERÍSTICAS CON ATRIBUCIÓN POR MÓDULO.
 * Ola AW, frente AW4. Es ATFD/LAA de Lanza & Marinescu (*Object-Oriented
 * Metrics in Practice*, Springer 2006, cap. 4: "Feature Envy — ATFD > FEW ∧
 * LAA < ONE THIRD") con la unidad de atribución que el usuario propuso:
 *
 *   > "Si ves el archivo de donde viene, podemos asumir que el método o el
 *   >  dato es de la clase que viene de ese archivo."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO Y NO ES UN CAMBIO DENTRO DE `feature-envy-intra`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `feature-envy-intra.ts` contesta "¿de qué otra unidad lee este método más
 * que de la suya?" desde el AST DE UN SOLO ARCHIVO, y para nombrar la unidad
 * destino tiene que RESOLVER EL TIPO del proveedor (su punto (O), Ola R:
 * "el tipo del proveedor tiene que resolver a una clase de ESTE repo").
 * MEDIDO por esa misma ola: `declaredTypeAtSite` contesta `no-fact` en
 * **239 de 315** sitios (ruby 216/220, python 17/20, javascript 1/1). La
 * consecuencia, medida en la Ola AU sobre 10 repos: el detector emite en
 * **3 de 6 lenguajes y en 3 de 10 repos** — cero en Go, cero en Python, cero
 * en JavaScript.
 *
 * Este archivo hace la MISMA pregunta por otro camino: no pregunta de qué
 * TIPO es el proveedor, sino **QUÉ ARCHIVO DECLARA EL SÍMBOLO QUE ESTE
 * MÉTODO ALCANZA** — el extremo `to` de una arista `references`/`calls`/
 * `instantiates` que la cascada de `graph/resolve.ts` YA resolvió, más la
 * arista `contains` que dice qué archivo lo declara. Ninguna de las cuatro
 * pide tipos.
 *
 * *** NO REEMPLAZA NI TOCA `feature-envy-intra`/`feature-envy-inter`. *** Va
 * al lado. Los dos siguen registrados con sus 180 tests; este detector no
 * lee, importa ni modifica un solo símbolo de ellos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA UNIDAD DE ATRIBUCIÓN — Y POR QUÉ NO ES LA MISMA EN LOS SEIS LENGUAJES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * "Un archivo = una clase" es cierto en Java y C# (un tipo público por
 * archivo, impuesto por el compilador en Java) y aproximadamente cierto en
 * Ruby y Python (un archivo = un módulo, que ES una unidad de
 * encapsulamiento). **En Go es FALSO por diseño: la unidad es el PAQUETE, y
 * un archivo `.go` suelto no significa nada** — dos archivos del mismo
 * paquete comparten identificadores no exportados sin ninguna ceremonia.
 *
 * La regla de este archivo NO nombra un lenguaje (trampa 1 de la ola: el
 * `SELF_PREFIX = /^(?:self\.|this\.|@)/` de `state.ts` dejó Go mudo durante
 * cuatro olas). Es de FORMA, y se lee del propio grafo:
 *
 *   **UNIDAD DE UN ARCHIVO = ese archivo, SI declara al menos una entidad
 *   `class-like` en el nivel superior; si no declara ninguna, su unidad es la
 *   CARPETA que lo contiene.**
 *
 * El hecho es "este archivo declara un tipo nombrado en el que un método
 * podría vivir", y sale de `CodeGraphNode.family === "class-like"` — la misma
 * familia de gramática que `god-component.ts#declaresBehaviour` ya lee — con
 * la ÚNICA exclusión de las clases anidadas dentro de una `function-like`,
 * que son locales. **NO se exige nivel superior: exigirlo dejaba mudos a
 * ruby, C# y python, ver el comentario de `unitByFile`.** Un archivo de funciones
 * sueltas (el caso normal en Go, y también el `utils.ts` de TypeScript o el
 * `helpers.py` de Python) NO es un destino de `Move Method`: no hay nada
 * adentro que reciba el método. Su unidad es el paquete.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL RESCATE DE LA AMBIGÜEDAD — la ganancia propia de la vía de módulo
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `CONTRATO-F9.md §4.5` deja las aristas `ambiguous` fuera de toda consulta
 * por defecto: la cascada sobrevivió con más de un destino posible y no se
 * puede afirmar CUÁL símbolo es. **Pero la pregunta de este detector no es
 * cuál símbolo: es qué MÓDULO.** Si los N candidatos de una arista ambigua
 * caen todos en el MISMO archivo (o en la misma unidad), la atribución por
 * módulo es INEQUÍVOCA aunque el símbolo no lo sea — es exactamente el
 * mismo argumento por el que `projectGraph` puede colapsar dos símbolos del
 * mismo archivo. Una arista ambigua cuyos candidatos se reparten entre
 * unidades distintas se DESCARTA, como manda el contrato.
 *
 * La fracción rescatada se publica en `evidence` de cada hallazgo, nunca se
 * esconde.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS SEIS CORRECCIONES QUE `feature-envy-intra` YA PAGÓ Y ACÁ NO SE VUELVEN
 * A PAGAR — cada una con el punto de su docstring del que sale
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. **(C)+(G) EL UMBRAL VA SOBRE EL PROVEEDOR DOMINANTE, NO SOBRE LA SUMA.**
 *     Con ATFD 4 repartido 2+1+1 no hay a dónde mudarse y el consejo no
 *     nombra nada. Acá ATFD = miembros distintos de la unidad DOMINANTE, y
 *     LAA = propios / (propios + miembros del DOMINANTE) — las dos mitades
 *     de la regla hablan de la MISMA unidad, que es lo que el título afirma.
 *  2. **(I) MIEMBROS DISTINTOS, NO EVENTOS.** `writer.push(1)` +
 *     `writer.push(2)` es UN miembro invocado dos veces. Los dos lados de
 *     LAA cuentan lo mismo. (El grafo ya colapsa ocurrencias en `weight`,
 *     así que acá se cuenta por arista, no por peso.)
 *  3. **(N) NO MEDIR NO ES MEDIR CERO.** Con CERO miembros propios el
 *     numerador de LAA no vale 0: no se pudo medir, `LAA < 1/3` se cumple
 *     por construcción y lo que queda es "ATFD > FEW" — la regla que midió
 *     3 % de precisión. Un método sin ningún acceso propio NO se emite.
 *  4. **(F) UN CONSTRUCTOR NO TIENE A DÓNDE MUDARSE.** Se descarta por
 *     `FunctionMetrics.isConstructor`, que `code-analyzer.ts` ya resuelve por
 *     nodo de gramática dedicado o por `CONSTRUCTOR_NAMES` — sin ninguna
 *     decisión por lenguaje acá.
 *  5. **(D) LAS FUNCIONES ANIDADAS NO SON MÉTODOS.** Un lambda dentro de otra
 *     función no es una unidad que se pueda mudar de módulo: sus parámetros
 *     los ata el protocolo de quien la invoca. Se descarta cuando el
 *     contenedor inmediato del símbolo es otra `function-like`.
 *  7. **(T) EL NOMBRE DEL TIPO NO ES UN MIEMBRO** — corrección propia de esta
 *     ola, medida sobre los once primeros hallazgos reales. Ver
 *     `MEMBER_FAMILIES` más abajo.
 *  6. **(K) SIN NOMBRE NO HAY MÉTODO QUE MUDAR.** Un símbolo `function-like`
 *     sin nombre no se emite: el hallazgo no nombraría nada accionable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CON QUÉ SE CONFUNDE — léase antes de bajar un umbral
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  - **MAPEADORES Y POBLADORES.** Un `toDTO(user)` toca diez campos ajenos
 *    porque ÉSE es su trabajo, y son la mitad de los falsos vivos del
 *    detector por clase (medido en la Ola AU: 6 de 18). La forma es
 *    estructuralmente idéntica a la envidia real. La compuerta que este
 *    archivo aplica es la del punto (S)/(S-bis) de la Ola AU generalizada al
 *    módulo: **la unidad destino tiene que declarar comportamiento** — si el
 *    archivo destino no declara ni una `function-like`, es una interfaz o un
 *    struct de datos y no puede recibir un método.
 *  - **BARRILES / `index.ts`.** Un archivo que sólo re-exporta concentra
 *    decenas de símbolos ajenos; un método que usa tres cosas de un barril
 *    parecería envidiarlo. Un barril no declara `class-like` en el nivel
 *    superior, así que la regla de unidad de arriba ya lo colapsa a su
 *    carpeta; además se exige que la unidad destino declare comportamiento.
 *  - **EL CLIENTE DE LA UTILIDAD DE SU PROPIO SUBSISTEMA.** Es la forma que
 *    dejó a `feature-envy-inter` en 0 de 46. Se mide y se publica el efecto
 *    de exigir que la unidad destino esté en OTRA carpeta.
 *
 * LÍMITE DECLARADO, y es el mismo que el detector por clase tiene: **un
 * miembro HEREDADO de una superclase de otro archivo no se cuenta como
 * propio.** La arista sale hacia el archivo donde el miembro se declara, que
 * es el de la superclase, así que un método que usa mucho estado heredado
 * lee `own` bajo y `ATFD` alto contra su propia superclase. Por eso se
 * descarta el candidato cuyo módulo dominante es un ANCESTRO del módulo
 * propio (arista `extends`/`implements`/`mixes-in` entre las dos unidades):
 * "mudá el método a tu propia superclase" no es un consejo.
 */
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import { edgeIsAmbiguous, symbolNodeId } from "../../graph/types.js";
import { citado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minForeignMembers" | "maxLocality";

/**
 * FEW = 2 y ONE THIRD = 1/3, verbatim de la estrategia de detección de
 * Feature Envy de Lanza & Marinescu — la MISMA fuente y los MISMOS dos
 * números que `feature-envy-intra.ts` ya cita. Este archivo no inventa
 * umbrales: cambia la UNIDAD sobre la que se miden, no la regla.
 */
const MIN_FOREIGN_SPEC = citado(2, {
  work: "Lanza & Marinescu, Object-Oriented Metrics in Practice (Springer, 2006), cap. 4",
  rule: "Feature Envy: ATFD > FEW, con FEW = 2",
  url: "https://link.springer.com/book/10.1007/3-540-39538-5",
});

const MAX_LOCALITY_SPEC = citado(1 / 3, {
  work: "Lanza & Marinescu, Object-Oriented Metrics in Practice (Springer, 2006), cap. 4",
  rule: "Feature Envy: LAA < ONE THIRD",
  url: "https://link.springer.com/book/10.1007/3-540-39538-5",
});

const MAX_FINDINGS_SPEC = presupuesto(60, {
  rationale:
    "tope de VOLUMEN, no de detección: un panel no se lee de forma útil con cientos de métodos a la vez, y una " +
    "familia que emite miles al 40 % es peor producto que una que emite doscientos al 70 %.",
});

/** Las tres aristas que testimonian "este cuerpo alcanza aquel símbolo". Juegan
 *  el MISMO rol (alternativa, no conjunción) — ver `needsAnyEdge`. */
const REACH_EDGE_KINDS: ReadonlySet<string> = new Set(["references", "calls", "instantiates"]);

/**
 * (T) QUÉ CUENTA COMO "MIEMBRO" — la corrección más cara de este archivo, y
 * salió de abrir los primeros once hallazgos reales, no de un umbral.
 *
 * ATFD es *Access To Foreign **Data***: cuenta atributos y métodos ajenos que
 * el cuerpo toca. **EL NOMBRE DEL TIPO NO ES UNO DE ELLOS.** Medido en los
 * once primeros hallazgos de la Ola AW:
 *
 *   · click `_is_incomplete_option` — "5 miembros de core.py": `Context`,
 *     `Option` y `Parameter` son TRES NOMBRES DE CLASE usados en anotaciones y
 *     en `isinstance`; los datos ajenos de verdad son DOS (`count`, `is_flag`).
 *   · click `wrap_text` — "3 miembros de _textwrap.py": uno es la clase
 *     `TextWrapper`. Sin ella el ATFD real es 2 y **el hallazgo no existe**.
 *   · jekyll `launch_browser` — "4 miembros de platforms.rb": uno es el módulo
 *     `Platforms`, que es el QUALIFIER de los otros tres.
 *
 * Un nombre de tipo mencionado N veces inflaba el ATFD en 1 por cada tipo, y
 * "mudá el método a donde está el tipo que anotás" no es un consejo. Se
 * cuentan sólo `function-like` (métodos) y `other` (campos, constantes) —
 * nunca `class-like` ni `namespace-like`, ni del lado propio ni del ajeno,
 * porque LAA compara las dos mitades y tienen que contar lo mismo.
 */
const MEMBER_FAMILIES: ReadonlySet<string> = new Set(["function-like", "other"]);

/**
 * (F-bis) El protocolo de construcción nativo, por LÉXICO y no por rama de
 * lenguaje — el MISMO conjunto y la misma justificación que
 * `hypotheses/singleton.ts#CONSTRUCTOR_NAMES`, que ya lo usa junto con la
 * regla "el nombre del miembro es igual al nombre de la clase". Existe porque
 * `repo.functions` llega vacío en la pasada `inter-file`; ver `(F-bis)` en
 * `moduleEnvyCandidates`.
 */
const CONSTRUCTOR_NAMES: ReadonlySet<string> = new Set(["initialize", "constructor", "__init__", "new", "New"]);

/** Aristas nominales "es-un": un módulo que es ANCESTRO del propio no es un
 *  destino de `Move Method`. Ver "LÍMITE DECLARADO" en el docstring. */
const NOMINAL_EDGE_KINDS: ReadonlySet<string> = new Set(["extends", "implements", "mixes-in", "satisfies"]);

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/**
 * LA UNIDAD DE ATRIBUCIÓN, por FORMA y nunca por lenguaje — ver el docstring
 * del módulo. Devuelve el id de unidad de cada ARCHIVO del grafo.
 */
export function unitByFile(graph: CodeGraph): ReadonlyMap<string, string> {
  // TRAMPA 1 DE LA OLA, PAGADA ACÁ Y MEDIDA (Ola AW, censo de 11 repos): la
  // primera versión de esta función exigía `symbolPath.length === 1`, o sea
  // "class-like en el NIVEL SUPERIOR del archivo". Eso NO es una regla de
  // forma: es un hardcodeo de lenguaje disfrazado, porque en todo lenguaje
  // con envoltorio de espacio de nombres la clase NUNCA está en el nivel
  // superior. Medido sobre 4.367 archivos: ruby declara 1.126 `class-like` y
  // sólo **13** en el nivel superior (`RuboCop::CachedData` tiene
  // `symbolPath` de largo 2 porque `module RuboCop` lo envuelve); C# 336 y
  // sólo **14** (por `namespace`); python 95 y **17**. Con el gate de nivel
  // superior el detector daba unidad de CARPETA a casi todo ruby, C#,
  // JavaScript y Vue —o sea, quedaba mudo en cuatro de los seis lenguajes,
  // exactamente la falla del `SELF_PREFIX` de `state.ts`—.
  //
  // La regla correcta es de forma y no menciona ningún lenguaje: **el archivo
  // declara un tipo si tiene alguna entidad `class-like` que NO esté anidada
  // dentro de una `function-like`.** Una clase declarada adentro de una
  // función es un local: no es el tipo del archivo. Un `module`/`namespace`
  // envolvente no descalifica a nada.
  const familyByNodeId = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family === undefined) continue;
    familyByNodeId.set(n.id, n.family);
  }
  const declaresType = new Set<string>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol") continue;
    if (n.family !== "class-like") continue;
    const path = n.symbolPath ?? [];
    let insideFunction = false;
    for (let cut = 1; cut < path.length; cut++) {
      if (familyByNodeId.get(symbolNodeId(n.file, path.slice(0, cut))) === "function-like") {
        insideFunction = true;
        break;
      }
    }
    if (insideFunction) continue;
    declaresType.add(n.file);
  }
  const out = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind !== "file") continue;
    out.set(n.file, declaresType.has(n.file) ? `file:${n.file}` : `folder:${dirnameOf(n.file)}`);
  }
  return out;
}

/** ¿La unidad destino declara COMPORTAMIENTO? Un struct de datos, una interfaz
 *  de TS o un barril no reciben un método. Generalización al módulo del punto
 *  (S)/(S-bis) de la Ola AU. */
function unitsWithBehaviour(graph: CodeGraph, unitOf: ReadonlyMap<string, string>): ReadonlySet<string> {
  const out = new Set<string>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "function-like") continue;
    const u = unitOf.get(n.file);
    if (u) out.add(u);
  }
  return out;
}

export interface ModuleEnvyCandidate {
  readonly symbolId: string;
  readonly file: string;
  readonly symbolPath: readonly string[];
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly ownUnit: string;
  readonly dominantUnit: string;
  /** Archivo del dominante que más miembros aporta — para poder ubicarlo. */
  readonly dominantFile: string;
  readonly ownMembers: number;
  readonly foreignMembers: number;
  readonly laa: number;
  readonly providers: number;
  readonly members: readonly string[];
  readonly rescuedAmbiguous: number;
  readonly droppedAmbiguous: number;
}

/**
 * EL CÁLCULO, separado de `run` para poder testearlo sin `RunContext` — mismo
 * patrón que `buildUnstableDependencyFindings`. No aplica NINGÚN umbral: sólo
 * mide. Los umbrales viven en `run`.
 */
export function moduleEnvyCandidates(repo: RepoUnit, graph: CodeGraph): readonly ModuleEnvyCandidate[] {
  const unitOf = unitByFile(graph);
  const withBehaviour = unitsWithBehaviour(graph, unitOf);
  const byId = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  // Constructores y anidamiento — los dos hechos que `feature-envy-intra` ya
  // paga, leídos de donde el analizador ya los tiene.
  //
  // (F-bis) POR QUÉ ESTA COMPUERTA NO PUEDE APOYARSE SÓLO EN `repo.functions`,
  // Y ES UN DEFECTO DE PRODUCCIÓN QUE ESTE ARCHIVO NO PUEDE ARREGLAR SOLO:
  // `code-analyzer.ts:2388` arma el `RepoUnit` de la pasada `inter-file` con
  // **`functions: []` HARDCODEADO**. En producción `repo.functions` llega
  // SIEMPRE VACÍO a todo detector `inter-file`, así que `f.metrics.isConstructor`
  // no filtra absolutamente nada. Es el MISMO defecto que `middle-man.ts` ya
  // documenta desde la Ola Z (ahí mata el 100 % de sus candidatos: `if (!fn)
  // continue`) y que `hypotheses/iterator.ts` cita textualmente. Tres archivos
  // lo rodean; la raíz sigue en `code-analyzer.ts`, que es compartido y no es
  // de este frente.
  //
  // Acá se lo rodea con un hecho que SÍ está en el grafo y no menciona ningún
  // lenguaje por su nombre: un constructor es un miembro de una `class-like`
  // cuyo nombre es **el nombre de su propia clase** (Java, C#, PHP, C++) o una
  // de las palabras del protocolo nativo — el MISMO léxico que
  // `hypotheses/singleton.ts` ya usa con la misma justificación escrita.
  const isConstructor = new Set<string>();
  for (const f of repo.functions) {
    if (f.metrics.isConstructor) isConstructor.add(symbolNodeId(f.file, f.symbolPath));
  }
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "function-like") continue;
    const path = n.symbolPath ?? [];
    if (path.length < 2) continue;
    const name = path[path.length - 1]!;
    if (CONSTRUCTOR_NAMES.has(name) || name === path[path.length - 2]) isConstructor.add(n.id);
  }

  // Ancestros nominales, a grano UNIDAD.
  const ancestorsOfUnit = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!NOMINAL_EDGE_KINDS.has(e.kind)) continue;
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    const uf = unitOf.get(from.file);
    const ut = unitOf.get(to.file);
    if (!uf || !ut || uf === ut) continue;
    let s = ancestorsOfUnit.get(uf);
    if (!s) {
      s = new Set();
      ancestorsOfUnit.set(uf, s);
    }
    s.add(ut);
  }

  // Alcances por símbolo emisor.
  type Reach = { unit: string; file: string; member: string; rescued: boolean };
  const reaches = new Map<string, Reach[]>();
  const dropped = new Map<string, number>();
  for (const e of graph.edges) {
    if (!REACH_EDGE_KINDS.has(e.kind)) continue;
    const from = byId.get(e.from);
    if (!from || from.kind !== "symbol") continue;
    const to = byId.get(e.to);
    if (!to || to.kind !== "symbol") continue;
    if (!to.family || !MEMBER_FAMILIES.has(to.family)) continue; // (T) el NOMBRE DEL TIPO no es un miembro
    let rescued = false;
    if (edgeIsAmbiguous(e)) {
      const cands = [e.to, ...(e.alternatives ?? [])].map((id) => byId.get(id));
      const units = new Set<string>();
      let missing = false;
      for (const c of cands) {
        if (!c) {
          missing = true;
          break;
        }
        const u = unitOf.get(c.file);
        if (!u) {
          missing = true;
          break;
        }
        units.add(u);
      }
      if (missing || units.size !== 1) {
        dropped.set(e.from, (dropped.get(e.from) ?? 0) + 1);
        continue;
      }
      rescued = true;
    }
    const unit = unitOf.get(to.file);
    if (!unit) continue;
    const member = (to.symbolPath?.length ?? 0) > 0 ? to.symbolPath[to.symbolPath.length - 1]! : to.file;
    let arr = reaches.get(e.from);
    if (!arr) {
      arr = [];
      reaches.set(e.from, arr);
    }
    arr.push({ unit, file: to.file, member, rescued });
  }

  const out: ModuleEnvyCandidate[] = [];
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "function-like") continue;
    const name = (n.symbolPath?.length ?? 0) > 0 ? n.symbolPath[n.symbolPath.length - 1]! : "";
    if (name === "") continue; // (K) sin nombre no hay método que mudar
    if (isConstructor.has(n.id)) continue; // (F)
    if ((n.symbolPath?.length ?? 0) > 1) {
      const parent = byId.get(symbolNodeId(n.file, n.symbolPath.slice(0, -1)));
      if (parent && parent.family === "function-like") continue; // (D)
    }
    const reach = reaches.get(n.id);
    if (!reach) continue;
    const ownUnit = unitOf.get(n.file);
    if (!ownUnit) continue;

    const own = new Set<string>();
    const foreign = new Map<string, Map<string, Set<string>>>(); // unidad -> archivo -> miembros
    let rescued = 0;
    for (const r of reach) {
      if (r.rescued) rescued++;
      if (r.unit === ownUnit) {
        own.add(r.member);
        continue;
      }
      let byFile = foreign.get(r.unit);
      if (!byFile) {
        byFile = new Map();
        foreign.set(r.unit, byFile);
      }
      let ms = byFile.get(r.file);
      if (!ms) {
        ms = new Set();
        byFile.set(r.file, ms);
      }
      ms.add(r.member);
    }
    if (own.size === 0) continue; // (N) no medir no es medir cero
    const ancestors = ancestorsOfUnit.get(ownUnit);

    let domUnit = "";
    let domMembers = new Set<string>();
    let domFile = "";
    for (const [unit, byFile] of foreign) {
      if (ancestors?.has(unit)) continue; // límite declarado: no se muda a la propia superclase
      if (!withBehaviour.has(unit)) continue; // (S)/(S-bis) al módulo
      const all = new Set<string>();
      let best = "";
      let bestN = 0;
      for (const [file, ms] of byFile) {
        for (const m of ms) all.add(m);
        if (ms.size > bestN || (ms.size === bestN && file < best)) {
          best = file;
          bestN = ms.size;
        }
      }
      if (all.size > domMembers.size || (all.size === domMembers.size && unit < domUnit)) {
        domUnit = unit;
        domMembers = all;
        domFile = best;
      }
    }
    if (domUnit === "" || domMembers.size === 0) continue;

    out.push({
      symbolId: n.id,
      file: n.file,
      symbolPath: n.symbolPath,
      name,
      startLine: n.startLine ?? 1,
      endLine: n.endLine ?? n.startLine ?? 1,
      ownUnit,
      dominantUnit: domUnit,
      dominantFile: domFile,
      ownMembers: own.size,
      foreignMembers: domMembers.size,
      laa: own.size / (own.size + domMembers.size),
      providers: foreign.size,
      members: [...domMembers].sort(),
      rescuedAmbiguous: rescued,
      droppedAmbiguous: dropped.get(n.id) ?? 0,
    });
  }
  out.sort((a, b) => b.foreignMembers - a.foreignMembers || a.symbolId.localeCompare(b.symbolId));
  return out;
}

function unitLabel(unitId: string): string {
  if (unitId.startsWith("file:")) return unitId.slice("file:".length);
  const folder = unitId.slice("folder:".length);
  return folder === "" ? "(raíz del repositorio)" : `${folder}/ (paquete)`;
}

function severityOf(c: ModuleEnvyCandidate): number {
  return Math.max(20, Math.min(85, Math.round(30 + c.foreignMembers * 6 + (1 - c.laa) * 20)));
}

export function buildModuleEnvyFindings(
  repo: RepoUnit,
  graph: CodeGraph,
  minForeign: Threshold,
  maxLocality: Threshold,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const c of moduleEnvyCandidates(repo, graph)) {
    if (c.foreignMembers <= minForeign.value) continue;
    if (c.laa >= maxLocality.value) continue;
    findings.push({
      variant: c.dominantUnit,
      title: `"${c.name}" usa ${c.foreignMembers} miembros de "${unitLabel(c.dominantUnit)}" y ${c.ownMembers} de su propio módulo`,
      detail:
        `El cuerpo de "${c.name}" alcanza ${c.foreignMembers} miembros distintos declarados en ` +
        `"${unitLabel(c.dominantUnit)}" (${c.members.slice(0, 8).join(", ")}${c.members.length > 8 ? ", …" : ""}) ` +
        `contra ${c.ownMembers} de su propio módulo: la localidad de acceso es ${c.laa.toFixed(2)}. ` +
        `La unidad se atribuye por el ARCHIVO que declara cada símbolo alcanzado (aristas ` +
        `\`contains\` + \`references\`/\`calls\`/\`instantiates\` del grafo), no por el tipo del receptor — ` +
        `así que esto se verifica abriendo los dos archivos. ANTES DE ACTUAR: si esta función es un MAPEADOR ` +
        `o un POBLADOR (su trabajo ES leer los campos de la otra unidad para construir otra cosa), la forma es ` +
        `la misma y el consejo no aplica — ver el docstring de este detector.`,
      trigger: [
        {
          label: "miembros distintos del módulo dominante (ATFD)",
          value: c.foreignMembers,
          threshold: minForeign,
        },
        {
          label: "localidad de acceso (LAA)",
          value: Number(c.laa.toFixed(2)),
          threshold: maxLocality,
        },
      ],
      evidence: [
        { label: "miembros distintos del propio módulo", value: c.ownMembers },
        { label: "módulos ajenos alcanzados en total", value: c.providers },
        { label: "aristas ambiguas rescatadas por atribución de módulo", value: c.rescuedAmbiguous },
        { label: "aristas ambiguas descartadas (candidatos en módulos distintos)", value: c.droppedAmbiguous },
      ],
      locations: [
        {
          file: c.file,
          startLine: c.startLine,
          endLine: c.endLine,
          symbol: c.symbolPath.join("."),
          role: "método que usa más miembros de otro módulo que del propio",
        },
        {
          file: c.dominantFile,
          startLine: 1,
          endLine: 1,
          role: "módulo cuyos miembros usa",
        },
      ],
      severity: severityOf(c),
      advice: {
        primary: {
          name: "Move Method",
          kind: "refactorizacion",
          why:
            "Si el cuerpo trabaja sobre los datos de otra unidad, vive más cerca de ellos ahí: el método se " +
            "mueve al módulo cuyos miembros usa y el acoplamiento entre los dos módulos baja.",
          source: "https://refactoring.com/catalog/moveFunction.html",
        },
      },
    });
  }
  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "modulo-envy"> = {
  id: "modulo-envy",
  kind: "modulo-envy",
  scope: "inter-file",
  needsGraph: true,
  title: "Envidia de otro módulo",
  needs: [],
  // ALTERNATIVA, no conjunción: los tres kinds juegan el MISMO rol ("este
  // cuerpo alcanza aquel símbolo") y `REACH_EDGE_KINDS.has(e.kind)` los usa
  // como unión. Ver `types.ts#InterFileDetector.needsAnyEdge`.
  needsAnyEdge: ["references", "calls", "instantiates"],
  thresholds: {
    minForeignMembers: MIN_FOREIGN_SPEC,
    maxLocality: MAX_LOCALITY_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  // Dos métodos que envidian el MISMO módulo son el mismo problema de raíz
  // visto desde dos lugares — mismo criterio que `unstable-dependency`.
  groupKey: (f) => f.variant,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    if (!graph) return [];
    return buildModuleEnvyFindings(repo, graph, ctx.threshold("minForeignMembers"), ctx.threshold("maxLocality"));
  },
};
