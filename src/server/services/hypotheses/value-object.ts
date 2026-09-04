/**
 * Value Object (Replace Data Value with Object / Replace Primitive with
 * Object) — Ola AG, frente AG5. **Ancla NUEVA sobre `primitive-obsession`,
 * el único kind grande del catálogo que NINGÚN patrón anclaba** (verificado
 * por mí sobre los 18 `hypotheses/*.ts` del árbol de hoy: ni un `anchors`
 * lo nombra). Cero cambios en `detect/**`: este archivo sólo lee lo que
 * `detect/intra-file/primitive-obsession.ts` ya produce y lo que el grafo ya
 * materializa.
 *
 * ── LA INTENCIÓN, EN UNA FRASE ─────────────────────────────────────────────
 * Un dato primitivo lleva consigo reglas —validación, formato, unidad,
 * comparación— y, mientras no tenga tipo propio, esas reglas tienen que
 * volver a escribirse en CADA sitio que lo declara. El remedio nombrado es
 * darle un tipo: un Value Object que las junte en un solo lugar y que, de
 * paso, haga imposible el intercambio silencioso de dos valores del mismo
 * primitivo. Fowler lo pide con una condición explícita, y es la que este
 * archivo mide: *"the same data item is used in more than one place and you
 * find yourself doing the same little bits of work with it in each place"*.
 *
 * ── EL TECHO DEL ANCLA, MEDIDO ANTES DE CONSTRUIR ──────────────────────────
 * Contado por mí sobre las 14 planillas `tests/golden/precision/*.verdicts.csv`
 * con el MISMO filtro de vigencia que `detect/precision/gate.test.ts` aplica
 * (`stillPresent`): `primitive-obsession` mide **11/20 = 55,0 %**
 * [34,2 %, 74,2 %] vigente (19/34 = 55,9 % histórico), por repo
 * newtonsoft-json 6/8 · guava 3/5 · nest 2/4 · vueuse 0/3. **Está POR ENCIMA
 * del piso del 50 % de esa compuerta y no aparece entre los kinds que reporta
 * rotos: el ancla NO topea a esta celda.** Pero 55 % ES su techo — ninguna
 * celda de nivel 2 puede ser más precisa que su ancla de nivel 1.
 *
 * ── EL HECHO DEL GRAFO QUE DECIDE LA FUERZA (la cuarta condición, PRIMERO) ─
 * Nombrado y VERIFICADO antes de escribir la fuerza, que es el paso que tres
 * frentes de la Ola AE se saltaron:
 *
 *   > El grafo materializa un nodo `carrier` por **SITIO DE DECLARACIÓN**
 *   > (Ola R, `graph/edges/declara-tipo.ts` vía el tipo ESCRITO y
 *   > `graph/edges/propaga-tipo.ts` vía el origen del valor), con
 *   > `carrierForm` (`"parameter" | "field" | "local"`), `declaredTypeForm`
 *   > (`"nominal" | "primitive" | "composite"`) y un `symbolPath` que
 *   > TERMINA en el nombre declarado. Con eso se puede preguntar, sobre el
 *   > REPO ENTERO y no sobre una firma: *¿en cuántos sitios de declaración
 *   > distintos este repo escribe ESTE dato como un primitivo desnudo?* y
 *   > *¿en alguno lo escribe con un tipo propio?*
 *
 * Medido, no supuesto (`scratchpad-ag5/sonda-vo.mts`, sólo lectura, pipeline
 * real `analyzeRepo` + `onGraph`): vueuse tiene 5.163 nodos `carrier` sobre
 * 9.662 nodos —360 `parameter`+`primitive`, 423 `field`+`primitive`, 1.174
 * `parameter`+`nominal`—, nest 8.877 sobre 16.517, newtonsoft-json 7.138
 * sobre 10.521, excalidraw 13.015 sobre 22.385. **El hecho existe y es la
 * mitad del grafo**, no una arista del 0,99 % como la que la Ola AF midió
 * para Decorator y correctamente no aterrizó.
 *
 * Y el SEGUNDO hecho, sin el cual todo esto sería inerte (el destino de
 * `strategy.ts#structuralStrategyEvidence` y `decorator.ts#graphOverride`
 * durante olas): **el grafo LLEGA a una hipótesis anclada en un hallazgo
 * `intra-file`.** `hypotheses/run.ts#rebuildHypothesesWithGraph` (Ola V,
 * frente V1) vuelve a llamar `builder.build()` desde `crossAnalyze` con el
 * árbol revivido Y el grafo del repo ya construido; y
 * `findingsNeedingGraphPass` elige a quién revivir **por el REGISTRO**
 * (`b.anchors.includes(finding.kind)`), no por una lista de kinds escrita a
 * mano — así que registrar este patrón basta para que esa pasada alcance a
 * `primitive-obsession`. Leído en `hypotheses/run.ts`, no supuesto.
 *
 * ── LA FUERZA ──────────────────────────────────────────────────────────────
 * El ancla localiza dónde el dato es **intercambiable** (>= 3 parámetros del
 * mismo primitivo en una firma: nada impide pasarlos en el orden equivocado).
 * Eso es el síntoma. La FUERZA —la situación que el patrón resuelve— es que
 * ese mismo dato **ya está desparramado por el repo como primitivo desnudo**:
 * cada uno de esos sitios es un lugar donde la regla del dato hay que
 * volver a escribirla, porque el tipo no la lleva. Es la condición literal de
 * Fowler, y es una pregunta de REPO, que sólo el grafo puede contestar — no
 * una propiedad de la firma, que es lo único que el ancla ve.
 *
 * ── LA ESCALA, CON SU RAZÓN ESCRITA ANTES DE MEDIR ─────────────────────────
 * Un primitivo suelto no paga un Value Object: declarar un tipo, su
 * constructor, su validación y sus conversiones cuesta, y ese costo se
 * amortiza sobre los sitios que lo reusan.
 *
 *   1. **>= `MIN_DECL_SITES` (3) sitios de declaración** del repo escriben ese
 *      dato como primitivo. El 3 es la **Regla de Tres** (Roberts,
 *      popularizada por Fowler): dos ocurrencias toleran coincidencia, la
 *      tercera ya no. **No es un número nuevo:** es exactamente el mismo
 *      número y la misma cita que el propio detector de nivel 1 declara para
 *      su umbral `sameTypeCount` (`primitive-obsession.ts`, `citado(3, …)`),
 *      aplicado a la otra mitad del fenómeno — allá a parámetros dentro de
 *      una firma, acá a sitios de declaración dentro del repo. Un umbral
 *      propio MÁS BAJO que el del ancla sería el desajuste mudo que
 *      `threshold-alignment.test.ts` existe para atrapar.
 *   2. **>= `MIN_DECL_OWNERS` (2) símbolos contenedores distintos.** Si los
 *      tres sitios son los tres parámetros de la MISMA firma, el dato no
 *      salió nunca de ahí y el remedio que paga es el **Introduce Parameter
 *      Object** local, no un tipo del repo: un tipo nuevo que sólo se usa
 *      dentro de una firma no le quita una regla a nadie. Es la línea exacta
 *      entre los dos refactors que `refactoring.guru` lista juntos bajo este
 *      olor, y separarlos es lo que hace que esta celda hable de Value Object
 *      y no de "agrupá estos tres parámetros".
 *
 * ── LA RESOLUCIÓN, VERIFICADA (no disparar donde el tipo YA existe) ────────
 * Dos formas distintas, las dos leídas del MISMO hecho del grafo:
 *
 *   - **`ya-aplicado`** — la clase que declara la función ya guarda TODOS
 *     esos primitivos como CAMPOS propios del mismo nombre. Entonces el tipo
 *     que agrupa esos valores **es esa clase**, y los primitivos están
 *     desnudos únicamente en el borde donde el tipo se CONSTRUYE — que es
 *     donde el constructor de cualquier Value Object los toma, por
 *     definición. Recomendar "envolvé esto en un tipo" ahí sería recomendar
 *     el tipo que ya existe. Esta es la condición 3 de la receta y es la
 *     única razón por la que esta celda puede decir "no", además de la
 *     escala.
 *   - **`parcial`** — el repo YA escribe ese mismo dato con un tipo NOMINAL
 *     en algún otro sitio de declaración: el Value Object existe en alguna
 *     parte y ESTA firma lo esquiva. Sigue siendo una recomendación (y de las
 *     más accionables: el tipo ya está escrito), pero no es "hay que crearlo".
 *
 * **`aplicado-eludido` es inalcanzable acá y lo digo en vez de fabricarlo:**
 * ese estado es una alerta de fuga sobre una abstracción que el propio
 * hallazgo puentea, y el ancla no expone ninguna arista de puenteo. La
 * distinción "el tipo existe y esta firma lo esquiva" ya viaja como `parcial`,
 * que es donde el proyecto la puede leer como recomendación.
 *
 * ── QUÉ NO CUBRE (declarado, no escondido) ─────────────────────────────────
 *   - **Los parámetros de una función ANÓNIMA no cuentan como sitios.**
 *     `graph/edges/declara-tipo.ts` cuelga cada sitio de un `fromPath` de
 *     contenedores CON NOMBRE, y una función anónima no aporta uno. Eso NO
 *     silencia el hallazgo (el conteo mira el repo entero, no esta firma:
 *     medido, `server-redis.ts:128` de nest es una función anónima y sí
 *     recibe hipótesis) — lo que hace es que el conteo de sitios sea un
 *     PISO y nunca un techo, que es el sentido correcto para un umbral. El
 *     único caso que se pierde de verdad es el dato que vive SÓLO dentro de
 *     funciones anónimas: medido en vueuse (`useTransition/index.ts:120`,
 *     `getSlope(t, a1, a2)`), 1 de 7 hallazgos del repo.
 *   - **Sobrecargas.** `graph/build.ts#addNode` se queda con el PRIMER nodo
 *     de un id repetido y `declaraTipoNodeId` no lleva la aridad, así que dos
 *     sobrecargas con un parámetro del mismo nombre colapsan en UN sitio. El
 *     conteo de sitios es por eso un piso, nunca un techo — que es el sentido
 *     correcto para un umbral: nunca infla la escala.
 *   - **La identidad del dato es su NOMBRE normalizado**, no su significado:
 *     dos `value` de conceptos distintos cuentan como el mismo dato. Es
 *     comparación por IDENTIDAD entre dos identificadores extraídos del propio
 *     repo —la misma clase de comparación que `large-class.ts` hace agrupando
 *     por `className` y que el propio `primitive-obsession.ts` hace en
 *     `isPrimitiveTypeNamedIdentifier`—, nunca una lista de vocabulario. La
 *     normalización (minúsculas y guiones bajos de borde) existe porque el
 *     MISMO dato se escribe `processDictionaryKeys` como parámetro y
 *     `ProcessDictionaryKeys` como propiedad en C#, y `_value`/`value` en
 *     TS/C#: es una regla de forma de identificador, no de dominio.
 *   - **La medición de la fuerza no distingue de qué PRIMITIVO es cada sitio**
 *     (`declaredTypeForm` dice "primitivo", no cuál): el `carrier` no lleva el
 *     texto del tipo. Un `count: number` y un `count: string` cuentan como el
 *     mismo dato desnudo. Declarado; el hecho del grafo no da para más y
 *     re-parsear el repo entero para afinarlo costaría más de lo que corrige.
 */
import type { AstNode, Finding, FileUnit, FunctionUnit } from "../detect/types.js";
import type { CodeGraph, CodeGraphNode } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext } from "./types.js";

const PRIMITIVE_OBSESSION_KIND = "primitive-obsession";

/**
 * Sitios de declaración del repo que tienen que escribir el dato como
 * primitivo para que un tipo propio se pague. Ver "LA ESCALA" en el docstring
 * del módulo: es la Regla de Tres, el MISMO número y la MISMA cita que
 * `detect/intra-file/primitive-obsession.ts` declara para su `sameTypeCount`.
 */
const MIN_DECL_SITES = 3;

/**
 * Símbolos contenedores distintos entre esos sitios. Ver "LA ESCALA": con 1
 * el dato nunca salió de la firma y el remedio que paga es Introduce
 * Parameter Object, no un Value Object del repo.
 */
const MIN_DECL_OWNERS = 2;

/**
 * DUPLICACIÓN DELIBERADA ENTRE CAPAS — las dos regex de gramática de
 * `detect/intra-file/primitive-obsession.ts`, copiadas verbatim en vez de
 * importadas porque ese archivo no las exporta y esta ola no es dueña de
 * `detect/**` (mismo criterio, y misma justificación escrita, que
 * `composite.ts#esConstructor` y `extract-method.ts#esConstructor`). SI SE
 * TOCA UNA, SE TOCA LA OTRA: acá se usan para reconstruir EXACTAMENTE el
 * mismo conjunto de parámetros que el detector contó, no un conjunto parecido.
 * Son nombres de NODO DE GRAMÁTICA aplicados idénticamente a los seis
 * lenguajes, nunca una lista de tipos por lenguaje.
 */
const PRIMITIVE_TYPE_WORD = /^(predefined|primitive|integral|floating_point|boolean)_type$/;
const CONTAINER_TYPE_WORD = /^(array|generic|slice|map|object|function|tuple)_(type|name)$/;
/** OLA AW, FRENTE AW2 / guardián: la MISMA lista de tipos tope/fondo que el
 *  detector — ver `primitive-obsession.ts` para el docstring completo y los
 *  falsos abiertos que la motivan. Acá se reconstruye EXACTAMENTE el mismo
 *  conjunto de parámetros que el detector contó, así que las dos listas se
 *  mueven juntas o el conjunto deja de ser el mismo. */
const TOP_TYPE_NAMES: ReadonlySet<string> = new Set(["any", "unknown", "never", "object", "void"]);

/** Igual que `primitive-obsession.ts#findPrimitiveType`: el primer nodo de tipo
 *  primitivo del subárbol, SIN descender dentro de un contenedor — un `int[]`
 *  o un `Map<string,X>` ya es la forma correcta de agrupar primitivos y no
 *  cuenta como "el" tipo del parámetro. */
function findPrimitiveType(node: AstNode): AstNode | null {
  if (node.isNamed) {
    if (PRIMITIVE_TYPE_WORD.test(node.type)) return TOP_TYPE_NAMES.has(node.text.trim()) ? null : node;
    if (CONTAINER_TYPE_WORD.test(node.type)) return null;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child) continue;
    const found = findPrimitiveType(child);
    if (found) return found;
  }
  return null;
}

/** El identificador desnudo de un parámetro — mismo criterio de forma que
 *  `graph/edges/declara-tipo.ts#bareNameOf`, para que el nombre que se busca
 *  acá sea el MISMO con el que el grafo bautizó el sitio: él mismo si ya es
 *  una hoja nombrada, su campo `name`, o el primer hijo nombrado que sea hoja
 *  (`*args` ⇒ `list_splat_pattern` ⇒ `args`). */
function bareNameOf(node: AstNode): string | null {
  if (node.childCount === 0 && node.isNamed) return node.text;
  const nameField = node.childForFieldName("name") as AstNode | null;
  if (nameField && nameField.childCount === 0 && nameField.isNamed) return nameField.text;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c && c.isNamed && c.childCount === 0) return c.text;
  }
  return null;
}

/** La identidad de un dato: su identificador, normalizado por FORMA (bordes de
 *  guión bajo y caja). Ver "QUÉ NO CUBRE" en el docstring del módulo: es
 *  comparación por identidad entre identificadores del propio repo, nunca
 *  vocabulario. */
function conceptKey(name: string): string {
  return name.replace(/^_+|_+$/g, "").toLowerCase();
}

/** La función anclada, ubicada por la MISMA terna con la que
 *  `primitive-obsession.ts` construyó su `Finding` (`fn.startLine`/`fn.endLine`
 *  de `FunctionUnit` directo). Mismo criterio que `extract-method.ts#funcionDelAncla`. */
function funcionDelAncla(file: FileUnit, startLine: number, endLine: number): FunctionUnit | null {
  return file.functions.find((fn) => fn.startLine === startLine && fn.endLine === endLine) ?? null;
}

/**
 * Los NOMBRES de los parámetros que el detector contó: los del tipo primitivo
 * `variant` (el `RawFinding.variant` que `primitive-obsession.ts` llenó con el
 * texto del tipo, y que `detect/run.ts#toFinding` conserva). `null` cuando no
 * hay árbol vivo, no hay ubicación, no se pudo ubicar la función o el hallazgo
 * no trae `variant` — los cuatro casos son "no evaluado", nunca "no cumple
 * pero seguimos".
 */
function nombresDelDato(problem: Finding, ctx: HypothesisContext): readonly string[] | null {
  const file = ctx.file;
  const primera = problem.locations[0];
  if (!file || !primera || file.path !== primera.file) return null;
  const variant = problem.variant;
  if (variant === undefined) return null;
  const fn = funcionDelAncla(file, primera.startLine, primera.endLine);
  if (!fn) return null;
  const paramList = (fn.node.childForFieldName("parameters") ?? fn.node.childForFieldName("parameter_list")) as AstNode | null;
  if (!paramList) return null;

  const nombres: string[] = [];
  for (let i = 0; i < paramList.childCount; i++) {
    const param = paramList.child(i) as AstNode | null;
    if (!param || !param.isNamed) continue;
    const tipo = findPrimitiveType(param);
    if (!tipo || tipo.text.trim() !== variant) continue;
    // El nombre del parámetro es el identificador desnudo que NO es el nodo de
    // tipo: se busca entre los hijos, saltando el propio tipo (misma forma que
    // `declara-tipo.ts` usa para `typed_parameter` de Python).
    for (let j = 0; j < param.childCount; j++) {
      const c = param.child(j) as AstNode | null;
      if (!c || !c.isNamed) continue;
      if (c.startPosition.row === tipo.startPosition.row && c.startPosition.column === tipo.startPosition.column && c.type === tipo.type) continue;
      const bare = bareNameOf(c);
      if (bare !== null) {
        nombres.push(bare);
        break;
      }
    }
  }
  return nombres;
}

/* ────────────────────────────────────────────────────────────────────────
 * EL HECHO DEL GRAFO — el índice de sitios de declaración por dato.
 * ──────────────────────────────────────────────────────────────────────── */

interface SitiosDelDato {
  /** Ids de nodo `carrier` (`parameter`/`field`) que escriben este dato como PRIMITIVO. */
  readonly primitivos: ReadonlySet<string>;
  /** Símbolos contenedores distintos de esos sitios (`archivo#camino.sin.el.nombre`). */
  readonly duenos: ReadonlySet<string>;
  /** Un sitio que escribe este MISMO dato con un tipo NOMINAL, si lo hay — la resolución parcial. */
  readonly nominal: CodeGraphNode | null;
}

type IndiceDeDatos = ReadonlyMap<string, SitiosDelDato>;

/**
 * Memoización por GRAFO — el índice es una función PURA del grafo, y el grafo
 * es el mismo objeto para todos los `build()` de una corrida
 * (`rebuildHypothesesWithGraph` pasa `input.repo.graph`). Sin esto, un repo
 * con 242 hallazgos de este kind (ShareX, medido) recorrería sus ~100.000
 * nodos 242 veces. Un `WeakMap` no retiene el grafo vivo ni cruza corridas.
 */
const INDICE_POR_GRAFO = new WeakMap<CodeGraph, IndiceDeDatos>();

/** Sólo los sitios donde un dato es parte de un CONTRATO (firma) o de un
 *  ESTADO (campo). Un `local` es un temporario de un cuerpo: no es un lugar
 *  donde un tipo iría, así que no cuenta para la escala. */
function esSitioDeContrato(n: CodeGraphNode): boolean {
  return n.carrierForm === "parameter" || n.carrierForm === "field";
}

function indiceDeDatos(graph: CodeGraph): IndiceDeDatos {
  const cacheado = INDICE_POR_GRAFO.get(graph);
  if (cacheado) return cacheado;

  const primitivos = new Map<string, Set<string>>();
  const duenos = new Map<string, Set<string>>();
  const nominal = new Map<string, CodeGraphNode>();

  for (const n of graph.nodes) {
    if (n.kind !== "carrier" || !esSitioDeContrato(n)) continue;
    const declarado = n.symbolPath[n.symbolPath.length - 1];
    if (declarado === undefined) continue;
    const clave = conceptKey(declarado);
    if (clave.length === 0) continue;
    if (n.declaredTypeForm === "primitive") {
      let sitios = primitivos.get(clave);
      if (!sitios) primitivos.set(clave, (sitios = new Set()));
      sitios.add(n.id);
      let owners = duenos.get(clave);
      if (!owners) duenos.set(clave, (owners = new Set()));
      owners.add(`${n.file ?? ""}#${n.symbolPath.slice(0, -1).join(".")}`);
    } else if (n.declaredTypeForm === "nominal" && !nominal.has(clave)) {
      nominal.set(clave, n);
    }
  }

  const salida = new Map<string, SitiosDelDato>();
  for (const [clave, sitios] of primitivos) {
    salida.set(clave, { primitivos: sitios, duenos: duenos.get(clave) ?? new Set(), nominal: nominal.get(clave) ?? null });
  }
  // Un dato que SÓLO aparece con tipo nominal también tiene que ser
  // consultable (es el caso "el tipo ya existe y esta firma lo esquiva").
  for (const [clave, n] of nominal) {
    if (!salida.has(clave)) salida.set(clave, { primitivos: new Set(), duenos: new Set(), nominal: n });
  }
  INDICE_POR_GRAFO.set(graph, salida);
  return salida;
}

/* ────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA Y SUS CHECKS
 * ──────────────────────────────────────────────────────────────────────── */

interface DatoDesparramado {
  readonly nombre: string;
  readonly sitios: number;
  readonly duenos: number;
  readonly nominal: CodeGraphNode | null;
}

interface ValueObjectProblem {
  readonly finding: Finding;
  /** `null` = no se pudo mirar (sin árbol, sin `variant`, función no ubicada). */
  readonly nombres: readonly string[] | null;
  /** Los datos del ancla que alcanzan la escala, de mayor a menor. Vacío si ninguno. */
  readonly desparramados: readonly DatoDesparramado[];
  /** Todos los datos del ancla con su medición, alcancen o no la escala. */
  readonly medidos: readonly DatoDesparramado[];
  /** Campos de la clase que declara la función, por dato — para la resolución. */
  readonly camposPropios: ReadonlySet<string>;
  /** `true` si hubo grafo para medir. `false` ⇒ nada se pudo contar. */
  readonly conGrafo: boolean;
}

function medir(problem: Finding, ctx: HypothesisContext, graph: CodeGraph | null): ValueObjectProblem {
  const nombres = nombresDelDato(problem, ctx);
  if (!graph || nombres === null) {
    return { finding: problem, nombres, desparramados: [], medidos: [], camposPropios: new Set(), conGrafo: graph !== null };
  }
  const indice = indiceDeDatos(graph);
  const medidos: DatoDesparramado[] = [];
  const vistos = new Set<string>();
  for (const nombre of nombres) {
    const clave = conceptKey(nombre);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const s = indice.get(clave);
    medidos.push({ nombre, sitios: s?.primitivos.size ?? 0, duenos: s?.duenos.size ?? 0, nominal: s?.nominal ?? null });
  }
  medidos.sort((a, b) => b.sitios - a.sitios || b.duenos - a.duenos || a.nombre.localeCompare(b.nombre));
  const desparramados = medidos.filter((m) => m.sitios >= MIN_DECL_SITES && m.duenos >= MIN_DECL_OWNERS);

  return {
    finding: problem,
    nombres,
    desparramados,
    medidos,
    camposPropios: camposDeLaClase(graph, problem, ctx),
    conGrafo: true,
  };
}

/**
 * Los CAMPOS que la clase declarante de la función anclada guarda como
 * primitivos, por dato — leídos del MISMO hecho del grafo (`carrier` con
 * `carrierForm: "field"`), nunca del árbol. Vacío cuando la función no vive en
 * una clase o cuando esa clase no declara ningún campo primitivo.
 */
function camposDeLaClase(graph: CodeGraph, problem: Finding, ctx: HypothesisContext): ReadonlySet<string> {
  const primera = problem.locations[0];
  const file = ctx.file;
  if (!primera || !file) return new Set();
  const fn = funcionDelAncla(file, primera.startLine, primera.endLine);
  if (!fn || fn.symbolPath.length < 2) return new Set();
  // El camino de la CLASE es el de la función sin su último segmento — el
  // mismo `symbolPath` con el que `declara-tipo.ts` cuelga los sitios.
  const clase = fn.symbolPath.slice(0, -1).join(".");
  const salida = new Set<string>();
  for (const n of graph.nodes) {
    if (n.kind !== "carrier" || n.carrierForm !== "field" || n.file !== primera.file) continue;
    if (n.symbolPath.slice(0, -1).join(".") !== clase) continue;
    const declarado = n.symbolPath[n.symbolPath.length - 1];
    if (declarado !== undefined) salida.add(conceptKey(declarado));
  }
  return salida;
}

/**
 * REQUIRED — LA ÚNICA PUERTA, y es la fuerza + la escala juntas: al menos uno
 * de los datos que el ancla señala como intercambiables está escrito como
 * primitivo desnudo en >= `MIN_DECL_SITES` sitios de declaración del repo,
 * repartidos en >= `MIN_DECL_OWNERS` símbolos contenedores. Ver "LA FUERZA" y
 * "LA ESCALA" en el docstring del módulo.
 *
 * Las tres ramas que NO pueden mirar devuelven `holds: false` — un `required`
 * que aprueba por no poder evaluar no es un `required`
 * (`no-permissive-required.test.ts`).
 */
const datoDesparramadoPorElRepo: Check<ValueObjectProblem, CodeGraph | null> = {
  id: "dato-desparramado-por-el-repo",
  describe:
    `Alguno de estos datos está escrito como primitivo desnudo en >= ${MIN_DECL_SITES} sitios de declaración del repo ` +
    `(parámetros o campos) repartidos en >= ${MIN_DECL_OWNERS} símbolos distintos — sin eso el dato nunca salió de esta ` +
    "firma y lo que paga es agrupar sus parámetros, no darle un tipo propio al repo.",
  run(problem) {
    if (!problem.conGrafo) {
      return { holds: false, evidence: "Esta corrida no tiene grafo del repo: la pregunta es de repo entero y acá no hay con qué contestarla. No candidata." };
    }
    if (problem.nombres === null) {
      return {
        holds: false,
        evidence:
          "Sin árbol vivo del archivo, sin ubicación, o la función anclada no aparece en `file.functions`: los nombres de los " +
          "parámetros del hallazgo quedan sin identificar. No candidata.",
      };
    }
    if (problem.nombres.length === 0) {
      return { holds: false, evidence: "Ningún parámetro de la firma anclada expone un identificador propio con ese tipo primitivo: no hay dato que buscar en el repo. No candidata." };
    }
    const mejor = problem.medidos[0];
    if (problem.desparramados.length === 0) {
      const detalle = mejor ? `el más extendido es "${mejor.nombre}" con ${mejor.sitios} sitio(s) en ${mejor.duenos} símbolo(s)` : "ninguno tiene sitios medibles";
      return {
        holds: false,
        evidence:
          `Ninguno de los ${problem.nombres.length} datos de esta firma llega a ${MIN_DECL_SITES} sitios de declaración en ` +
          `${MIN_DECL_OWNERS} símbolos distintos (${detalle}): el dato no está desparramado por el repo, así que no hay reglas ` +
          "repetidas que un tipo propio pueda juntar.",
      };
    }
    const d = problem.desparramados[0]!;
    return {
      holds: true,
      evidence:
        `"${d.nombre}" está escrito como primitivo desnudo en ${d.sitios} sitios de declaración del repo, repartidos en ` +
        `${d.duenos} símbolos distintos: en cada uno de esos lugares la regla de ese dato (validación, formato, unidad, ` +
        `comparación) hay que volver a escribirla, porque el tipo no la lleva.` +
        (problem.desparramados.length > 1 ? ` Otros ${problem.desparramados.length - 1} dato(s) de la misma firma cumplen lo mismo.` : ""),
    };
  },
};

/** DISCRIMINADOR — más de un dato de la misma firma está desparramado: el
 *  problema no es un valor suelto sino un grupo que viaja junto. */
const variosDatosDesparramados: Check<ValueObjectProblem, CodeGraph | null> = {
  id: "varios-datos-desparramados",
  describe: "Más de uno de los datos intercambiables de esta firma está desparramado por el repo — no es un valor suelto, es un grupo que viaja junto.",
  run(problem) {
    const n = problem.desparramados.length;
    const holds = n >= 2;
    return {
      holds,
      evidence: holds
        ? `${n} de los ${problem.medidos.length} datos de la firma superan la escala (${problem.desparramados.map((d) => `"${d.nombre}" ${d.sitios}`).join(", ")}).`
        : `Sólo ${n} de los ${problem.medidos.length} datos de la firma supera la escala.`,
    };
  },
};

/** DISCRIMINADOR — el dato está DOS VECES por encima del piso de sitios:
 *  cuanto más desparramado, más lugares reúne el tipo propio. Nunca decisivo:
 *  el `required` ya fija el piso. */
const datoMuyDesparramado: Check<ValueObjectProblem, CodeGraph | null> = {
  id: "dato-muy-desparramado",
  describe: `El dato más extendido de la firma está en >= ${MIN_DECL_SITES * 2} sitios de declaración — el doble del piso que ya exige el required.`,
  run(problem) {
    const d = problem.desparramados[0];
    const holds = (d?.sitios ?? 0) >= MIN_DECL_SITES * 2;
    return {
      holds,
      evidence: d ? `"${d.nombre}": ${d.sitios} sitios (${holds ? ">=" : "<"} ${MIN_DECL_SITES * 2}).` : "Ningún dato de la firma supera la escala: no evaluado.",
    };
  },
};

/** DISCRIMINADOR — la firma tiene MÁS parámetros intercambiables que el piso
 *  del propio ancla (3): cuantos más valores del mismo primitivo seguidos,
 *  más formas de invertirlos sin que el compilador avise. */
const masIntercambiablesQueElPiso: Check<ValueObjectProblem, CodeGraph | null> = {
  id: "mas-intercambiables-que-el-piso",
  describe: "La firma repite el mismo primitivo MÁS veces que el piso del propio ancla — más pares que se pueden invertir en silencio.",
  run(problem) {
    const medida = problem.finding.trigger[0];
    const piso = medida.threshold.value;
    const holds = medida.value > piso;
    return {
      holds,
      evidence: `${medida.value} parámetros del mismo primitivo contra un piso de ${piso}.`,
    };
  },
};

const APPLIED_LABEL =
  "¿La clase que declara esta función ya guarda TODOS esos primitivos como campos propios del mismo nombre — el tipo que " +
  "los agrupa YA es esa clase y los primitivos están desnudos sólo en el borde donde se la construye?";

const PARTIAL_LABEL = "¿El repo ya escribe ese mismo dato con un tipo propio en algún otro sitio de declaración — el Value Object existe y esta firma lo esquiva?";

/**
 * `appliedState` — ver "LA RESOLUCIÓN, VERIFICADA" en el docstring del módulo.
 * El orden importa y es el de la receta: primero se pregunta si el tipo YA
 * está (⇒ no disparar), y recién después si está a medias.
 */
function appliedState(problem: ValueObjectProblem): AppliedStateResult {
  const datos = problem.desparramados;
  const claves = datos.map((d) => conceptKey(d.nombre));
  const todosSonCampos = claves.length > 0 && claves.every((c) => problem.camposPropios.has(c));
  if (todosSonCampos) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: APPLIED_LABEL,
          passed: true,
          why:
            `La clase declarante ya guarda como campos propios los ${claves.length} dato(s) que esta firma recibe sueltos ` +
            `(${datos.map((d) => `"${d.nombre}"`).join(", ")}): el tipo que los agrupa es esa clase, y un constructor de Value ` +
            "Object toma primitivos por definición. Recomendar un tipo acá sería recomendar el que ya existe.",
          role: "applied",
        },
      ],
    };
  }

  const conTipo = datos.find((d) => d.nominal !== null);
  if (conTipo?.nominal) {
    const n = conTipo.nominal;
    return {
      state: "parcial",
      checks: [
        {
          label: PARTIAL_LABEL,
          passed: true,
          why:
            `El repo ya escribe "${conTipo.nombre}" con un tipo propio en ${n.file ?? "otro archivo"}` +
            (n.startLine !== undefined ? `:${n.startLine}` : "") +
            " (sitio de declaración con tipo nominal): el Value Object existe en alguna parte y esta firma lo esquiva, así que " +
            "el trabajo no es crearlo sino usarlo acá.",
          role: "applied",
        },
      ],
    };
  }

  return {
    state: "ausente",
    checks: [
      {
        label: APPLIED_LABEL,
        passed: false,
        why:
          `Ningún sitio de declaración del repo escribe ${datos.length === 1 ? "ese dato" : "esos datos"} con un tipo propio, y la ` +
          "clase declarante tampoco los guarda todos como campos: el tipo que los agruparía no existe todavía.",
        role: "applied",
      },
      {
        label: PARTIAL_LABEL,
        passed: false,
        why: `${datos.map((d) => `"${d.nombre}"`).join(", ")}: todos los sitios de declaración del repo los escriben como primitivos desnudos.`,
        role: "applied",
      },
    ],
  };
}

const SOURCE =
  "Fowler, Refactoring, \"Replace Data Value with Object\" / \"Replace Primitive with Object\" (2.ª ed., cap. 7): " +
  "\"you have a data item that needs additional data or behaviour\" — la señal es que el mismo dato se usa en más de un " +
  "lugar y en cada uno se repiten los mismos pedacitos de trabajo. refactoring.guru/es/smells/primitive-obsession.";

const TO_CONFIRM: readonly string[] = [
  "Confirmar que los sitios que comparten el nombre del dato hablan del MISMO concepto: la identidad acá es el identificador " +
    "normalizado, no el significado — dos `value` de conceptos distintos cuentan como uno solo.",
  "Si el dato es un escalar genuinamente atómico del dominio (un factor de interpolación, una coordenada suelta, un índice), " +
    "envolverlo no compra nada: el orden de los parámetros se arregla con Introduce Parameter Object, que es más barato.",
  "Si la firma está impuesta desde afuera (delega directo a una API de la biblioteca estándar o de un tercero con esa misma " +
    "firma), el tipo propio no puede cruzar ese borde y el remedio no aplica.",
  "Si el código es una ruta caliente donde la asignación importa (una tabla optimizada a mano, un buffer), un tipo por valor " +
    "puede costar más de lo que aporta — verificar antes de envolver.",
  "Si la clase que declara la función es una utilidad SOBRE ese primitivo, el primitivo es el dominio declarado y no hay " +
    "concepto oculto que extraer.",
];

function buildSpec(problem: ValueObjectProblem): HypothesisSpec<ValueObjectProblem, CodeGraph | null> {
  return {
    pattern: "Value Object",
    ceiling: "media",
    needs: ["tipos-explicitos"],
    required: [datoDesparramadoPorElRepo],
    discriminators: [variosDatosDesparramados, datoMuyDesparramado, masIntercambiablesQueElPiso],
    appliedState: () => appliedState(problem),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — LA TRAZA DEL EMBUDO (auditoría de compuertas).
 * Mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace` y `strategy.ts#startStrategyTrace`
 * (Ola AH, AH1): `null` en producción ⇒ costo cero. Los `required` que se
 * re-corren acá son puros. No cambia ningún comportamiento.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ValueObjectTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly withGraph: boolean;
  readonly withFile: boolean;
  /** Cantidad de nombres del dato; `-1` = no se pudo mirar (sin árbol, sin `variant`, función no ubicada). */
  readonly nombres: number;
  readonly medidos: number;
  readonly desparramados: number;
  readonly conGrafo: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
}

let valueObjectTrace: ValueObjectTraceEntry[] | null = null;

export function startValueObjectTrace(): void {
  valueObjectTrace = [];
}

export function takeValueObjectTrace(): readonly ValueObjectTraceEntry[] {
  const t = valueObjectTrace ?? [];
  valueObjectTrace = null;
  return t;
}

function recordValueObjectTrace(
  spec: HypothesisSpec<ValueObjectProblem, CodeGraph | null>,
  vo: ValueObjectProblem,
  problem: Finding,
  graph: CodeGraph | null,
  ctx: HypothesisContext,
  emitted: boolean,
): void {
  const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(vo, graph).holds }));
  const loc = problem.locations[0];
  valueObjectTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    withGraph: graph !== null,
    withFile: ctx.file !== null,
    nombres: vo.nombres?.length ?? -1,
    medidos: vo.medidos.length,
    desparramados: vo.desparramados.length,
    conGrafo: vo.conGrafo,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: spec.appliedState(vo, graph).state,
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "value-object",
  pattern: "Value Object",
  layer: "refactorizacion",
  anchors: [PRIMITIVE_OBSESSION_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext) {
    const vo = medir(problem, ctx, graph);
    const spec = buildSpec(vo);
    const outcome = runEngine(spec, ctx.capabilities, vo, graph);
    if (valueObjectTrace) recordValueObjectTrace(spec, vo, problem, graph, ctx, outcome !== null);
    if (!outcome) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Un tipo nuevo, chico, con el valor adentro y las reglas que hoy están repetidas en cada sitio (validación, formato, " +
        "comparación). Se paga una vez; después cada sitio que hoy escribe el primitivo pasa a escribir el tipo, y el " +
        "compilador deja de aceptar que dos de ellos se inviertan.",
    });
  },
};
