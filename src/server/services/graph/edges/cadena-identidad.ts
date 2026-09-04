/**
 * `cadena-identidad` — la arista `stores`, el eslabón que faltaba de
 * **`construye → guarda → lee`** (Ola R, frente R3; DECISION-TIPOS-Y-FLUJO.md
 * §1, "Relación 2").
 *
 * ── QUÉ PREGUNTA CONTESTA, Y POR QUÉ HOY NO SE PODÍA CONTESTAR ─────────────
 *
 * `instantiates` dice **quién construye qué** y se corta ahí: no dice dónde
 * queda el resultado. Con eso, dos preguntas estructurales que el catálogo de
 * patrones tiene escritas quedan sin poder formularse siquiera:
 *
 *   - **Singleton**: *"¿existe un tipo construido EXACTAMENTE UNA VEZ, cuyo
 *     resultado queda en un binding de nivel de módulo o clase, y que se LEE
 *     — no se reconstruye — desde varios puntos?"*
 *   - **Proxy**: *"¿un colaborador construido UNA SOLA VEZ (memoizado) detrás
 *     de un accessor?"*
 *
 * Esta arista aporta el eslabón del medio: `binding → símbolo class-like`,
 * *"el valor que este binding guarda fue CONSTRUIDO en su propia
 * inicialización, y es de este tipo"*. Los otros dos eslabones YA EXISTEN:
 * `instantiates` cuenta cuántas veces se construye el tipo (el "exactamente
 * una vez"), y las `references`/`calls` que entran al nodo del binding son las
 * lecturas.
 *
 * *** EL TERCER ESLABÓN NO SE IMPLEMENTA PORQUE ESTÁ MEDIDO QUE YA ESTÁ. ***
 * No es una suposición: se contó, sobre el pipeline de producción
 * (`analyzeRepo` + `onGraph`), cuántos nodos `symbol` con `family: "other"`
 * (los bindings) tienen al menos una arista entrante que no sea `contains`, y
 * desde cuántos ORÍGENES DISTINTOS:
 *
 *   | repo   | bindings | con ≥1 lectura | con ≥2 orígenes distintos |
 *   |--------|---------:|---------------:|--------------------------:|
 *   | cobra  |       57 |      56 (98 %) |                27 (47 %)  |
 *   | nest   |      405 |     351 (87 %) |               269 (66 %)  |
 *   | click  |      373 |     252 (68 %) |               194 (52 %)  |
 *   | preact |      216 |     181 (84 %) |                80 (37 %)  |
 *   | jekyll |      130 |     108 (83 %) |                24 (18 %)  |
 *
 * Una arista `reads` nueva habría sido una copia de `references` con otro
 * nombre. La regla del proyecto ("subir verdaderos vale tanto como bajar
 * falsos, pero medí antes de agregar") se aplica también a la forma del
 * grafo: un `EdgeKind` que duplica a otro es ruido permanente.
 *
 * ── LAS TRES REGLAS DE LA RELACIÓN NUEVA, Y CÓMO SE CUMPLEN ACÁ ────────────
 *
 * 1. **MULTIVALUADA.** Un binding inicializado con dos orígenes distintos
 *    (`x = cond ? new A() : new B()`, o el mismo nombre asignado en dos
 *    lugares del mismo contenedor) NO colapsa a un tipo: el grupo entero se
 *    emite como UNA arista con `provenance: "ambiguous"`, `to` = el primer
 *    destino en orden lexicográfico y el resto en `alternatives` — el
 *    vocabulario que `CodeGraphEdge` ya tiene, sin inventar uno nuevo. Ver
 *    `markAmbiguousStores`, y `graph/types.ts#edgeIsAmbiguous`: una arista
 *    ambigua queda FUERA de toda consulta por defecto, así que un consumidor
 *    que pregunta "¿qué guarda este binding?" recibe *nada* en vez de una
 *    respuesta inventada — que es el `no sé` explícito de la regla 2.
 *
 * 2. **`NO SÉ` EXPLÍCITO.** Un binding sin arista `stores` no significa "no
 *    guarda nada": significa "su inicialización no es una construcción que
 *    este grafo pueda atribuir a una declaración del repo" — un literal, una
 *    fábrica, un valor de librería externa. La distinción se sostiene sobre el
 *    hecho de que el NODO del binding existe igual (lo mina `graph/symbols.ts`
 *    con `family: "other"`), así que "miré y no hay construcción" y "no hay
 *    binding" son estados distintos y visibles.
 *
 * 3. **PROHIBIDO INFERIR POR CONJUNTO DE MIEMBROS.** Acá no hay ninguna
 *    comparación estructural: el tipo sale del NOMBRE ESCRITO en el sitio de
 *    construcción, resuelto por la MISMA cascada de 9 etapas de
 *    `graph/resolve.ts` que resuelve todo lo demás. Ninguna arista de este
 *    módulo nace de "estos miembros coinciden".
 *
 * ── DE DÓNDE SALE CADA TIPO DE NODO (sonda centinela, nada escrito a mano) ──
 *
 * El módulo necesita saber DOS cosas por gramática, y las dos salen de la
 * sonda (`./sentinel.js#discoverCarrier`) sobre la fuente centinela de abajo,
 * nunca de un `switch` por lenguaje:
 *
 *   a. **el tipo de nodo del DECLARADOR de binding** (`variable_declarator`,
 *      `var_spec`, `assignment`, …), y
 *   b. **el sitio de construcción dentro de esa inicialización** — su tipo de
 *      nodo y el campo que lleva el nombre del tipo.
 *
 * Con DOS anclas, en este orden, porque ninguna sola cubre las 9 gramáticas
 * (verificado por sonda directa contra las 9, `scratchpad/r3/probe-sentinel2.mts`):
 *
 *   - **ancla en el binding** (`discoverCarrier(root, BINDING, CTOR)`) cuando
 *     la gramática le da a su declarador un campo `name` — así lo encuentra
 *     `findDeclaring`, que exige `hasField('name') && !isFunctionLike`.
 *     Recupera typescript/tsx/vue/javascript/java/go.
 *   - **ancla en la declaración nombrada que lo envuelve** (`F`), en dos
 *     pasos (`F → BINDING` y `F → CTOR`), cuando no: el `assignment` de
 *     Python y Ruby lleva su nombre en `left`, no en `name`. El declarador es
 *     entonces el PENÚLTIMO paso del camino `F → BINDING`, y el tramo
 *     declarador→constructor es el sufijo del camino `F → CTOR` a partir de
 *     ahí. Los dos caminos tienen que compartir el prefijo hasta el
 *     declarador; si no lo comparten, no se inventa nada y el lenguaje queda
 *     sin sonda.
 *
 * Lo recuperado, medido, para las 9 gramáticas (`declarador · profundidad ·
 * nodo de construcción · campo del tipo`):
 *
 *   | lenguaje   | declarador           | prof. | construcción               | campo       |
 *   |------------|----------------------|------:|----------------------------|-------------|
 *   | typescript | `variable_declarator`|     1 | `new_expression`           | `constructor` |
 *   | tsx        | `variable_declarator`|     1 | `new_expression`           | `constructor` |
 *   | vue        | `variable_declarator`|     1 | `new_expression`           | `constructor` |
 *   | javascript | `variable_declarator`|     1 | `new_expression`           | `constructor` |
 *   | java       | `variable_declarator`|     1 | `object_creation_expression`| `type`       |
 *   | csharp     | `variable_declarator`|     2 | `object_creation_expression`| `type`       |
 *   | go         | `var_spec`           |     2 | `composite_literal`        | `type`       |
 *   | ruby       | `assignment`         |     1 | `call`                     | `receiver`  |
 *   | python     | `assignment`         |     1 | `call`                     | `function`  |
 *
 * **LA PROFUNDIDAD TAMBIÉN ES DERIVADA, no un número elegido a ojo**, y es la
 * guarda de precisión más importante del módulo: es la cantidad de pasos que
 * la sonda midió entre el declarador y el nodo de construcción EN ESA
 * gramática. Con ella, `X = Foo(1)` (profundidad 1 en Python) emite y
 * `X = [Foo()]` (profundidad 2) NO — el binding guarda una lista, no un
 * `Foo`. Con un tope fijo de 2 para todos los lenguajes, ese segundo caso
 * habría emitido una arista falsa; con el tope derivado por gramática, C# y
 * Go (que SÍ necesitan 2 pasos, por su `equals_value_clause` y su
 * `expression_list`) siguen andando sin abrirle la puerta a Python.
 *
 * ── QUÉ ES `from`, Y POR QUÉ NO PUEDE SER OTRA COSA ────────────────────────
 *
 * `from` es SIEMPRE un nodo `symbol` con `family: "other"`: los bindings NO
 * LOCALES que `graph/symbols.ts` ya mina. Una variable local no es nodo del
 * grafo (`GraphNodeKind` no la tiene), así que no puede ser extremo de
 * ninguna arista — y `graph/edge-endpoints.test.ts` existe justamente para
 * que nadie "resuelva" eso colgando una arista de un id inexistente (tres
 * tandas de aristas colgadas medidas en la Ola P: 423 + 524 + 22).
 *
 * De ahí sale el ÚNICO trozo de vocabulario de este archivo que NO viene de
 * la sonda, y viene con su razón:
 *
 * *** `BINDING_DECLARATOR_TYPES` y la regla de nombre `name ?? left` están
 * REFLEJADOS, no derivados. *** `graph/symbols.ts` los usa para decidir qué
 * declarador se convierte en nodo y cómo se llama; `graph/references.ts`
 * lleva su propia copia por el mismo motivo, y su docstring declara el riesgo
 * de divergencia en vez de esconderlo ("Both copies carry this same paragraph
 * so a `git grep` on either name finds the other"). Ésta es la TERCERA copia y
 * lleva el mismo párrafo: si alguien cambia el vocabulario en un archivo y no
 * en los otros, una declaración y la arista que debería salir de ella se
 * desincronizan en silencio. No se deriva de la sonda a propósito: la
 * pregunta acá no es "¿qué llama la gramática un binding?" sino "¿de qué
 * declaradores hay NODO en el grafo?", y esa respuesta la fija `symbols.ts`,
 * no la gramática. Ninguno de los tres archivos exporta el símbolo, así que
 * importarlo exigiría editar `symbols.ts`, que no es de este frente.
 *
 * ── LÍMITES DECLARADOS, TODOS MEDIDOS ─────────────────────────────────────
 *
 *  - **C# emite CERO, y la causa NO está acá.** `variable_declarator` está en
 *    el vocabulario reflejado, pero el de C# lleva su identificador en
 *    posición 0 SIN campo, así que la regla `name ?? left` de `symbols.ts`
 *    devuelve `null` y **el nodo del binding nunca se crea**. Medido de punta
 *    a punta: newtonsoft-json tiene **0** nodos `symbol` con `family:
 *    "other"` en todo el repo. Este módulo hereda el cero por construcción
 *    (sin nodo `from` no emite, que es lo correcto: la alternativa sería una
 *    arista colgada). Ver `graph/edge-kinds.ts#stores` y el PIDO del informe.
 *  - **Los campos de clase de TypeScript/JavaScript tampoco son nodos.** La
 *    sonda los recupera como `public_field_definition`/`field_definition`, y
 *    ninguno de los dos está en el vocabulario reflejado, así que
 *    `symbols.ts` no los minta. En TS/JS la población de `stores` son los
 *    bindings de nivel de módulo (`const x = new T()`), que es la forma en
 *    que esos lenguajes escriben un singleton de módulo de todos modos.
 *  - **Un campo asignado dentro de un método** (`this.x = new Y()` en un
 *    constructor, `@cache = {}` en Ruby, `self.conn = Conn()` en Python) NO
 *    lo cubre esta arista: el `assignment` está dentro de un scope
 *    function-like, así que `symbols.ts` lo trata como local y no hay nodo.
 *    Ésa es la vía de PROPAGACIÓN DESDE EL ORIGEN de la otra relación de esta
 *    ola (`declares-type`, DECISION-TIPOS-Y-FLUJO.md §1 "Relación 1"), no de
 *    ésta.
 *  - **`instantiates` y `stores` se refieren AL MISMO sitio sintáctico**, y
 *    por eso el juicio de "¿esto es una construcción?" NO está copiado acá:
 *    se importa (`constructedTypeAt` de `./instanciacion.js`). Dos censos que
 *    no cuadran serían peor que la duplicación de código — un consumidor que
 *    cuenta construcciones con una arista y pregunta dónde quedaron con la
 *    otra necesita que las dos digan lo mismo.
 */
import type { AstNode, FileUnit } from "../../detect/types.js";
import { declaredReceiverTypeName, fileLevelTypeNames } from "../symbols.js";
import { AMBIGUOUS_MAX_TARGETS } from "../stages.js";
import type { CodeGraphEdge } from "../types.js";
import { constructedTypeAt, declaredClassNamesFor } from "./instanciacion.js";
import { discoverCarrier, type CarrierPath, type CarrierStep } from "./sentinel.js";
import type { EdgeContext, EdgeExtractor, EdgeFacts } from "./types.js";

const SLOT_IDENTITY_BINDING = "identity-binding-site" as const;

/** Los tres nombres que la sonda busca en la fuente centinela. Nunca aparecen en código real: son el ancla. */
const SENTINEL_BINDING = "sentinelBinding";
const SENTINEL_CTOR = "SentinelCtor";
const SENTINEL_OUTER = "F";

/**
 * Fuente centinela por lenguaje: un binding NO LOCAL cuya inicialización es
 * una construcción. Cada una está escrita en la forma que la gramática de ESE
 * lenguaje usa para un binding que `graph/symbols.ts` sí minta como nodo — por
 * eso typescript/javascript declaran un `const` de nivel de módulo y no un
 * campo de clase (ver LÍMITES DECLARADOS). Verificadas una por una contra las
 * 9 gramáticas reales antes de escribir la lógica de `extract`
 * (`scratchpad/r3/probe-sentinel2.mts`), nunca asumidas.
 */
const SENTINEL: Readonly<Record<string, string>> = {
  typescript: "const sentinelBinding = new SentinelCtor(1);\n",
  tsx: "const sentinelBinding = new SentinelCtor(1);\n",
  vue: "const sentinelBinding = new SentinelCtor(1);\n",
  javascript: "const sentinelBinding = new SentinelCtor(1);\n",
  java: "class F { static Object sentinelBinding = new SentinelCtor(1); }",
  csharp: "class F { static object sentinelBinding = new SentinelCtor(1); }",
  go: "package main\n\nvar sentinelBinding = SentinelCtor{}\n",
  ruby: "class F\n  sentinelBinding = SentinelCtor.new(1)\nend\n",
  python: "class F:\n    sentinelBinding = SentinelCtor(1)\n",
};

/**
 * *** COPIA REFLEJADA de `graph/symbols.ts` y `graph/references.ts` — ver el
 * párrafo "QUÉ ES `from`" del docstring del módulo. *** El riesgo de
 * divergencia es real y se declara en vez de esconderse: si una futura
 * edición cambia el vocabulario de un archivo sin cambiar los otros, una
 * declaración y el sitio que debería resolver a ella (o, acá, la arista que
 * debería salir de ella) se desincronizan en silencio. Las tres copias llevan
 * este mismo párrafo para que un `git grep` sobre el nombre encuentre a las
 * otras dos.
 */
const BINDING_DECLARATOR_TYPES = new Set(["variable_declarator", "assignment", "var_spec", "const_spec", "type_spec"]);

/** Reflejo de `graph/symbols.ts#isBlankName` — mismo párrafo de divergencia que arriba. */
function isBlankName(name: string): boolean {
  return /^_+$/.test(name);
}

/**
 * Reflejo de la regla de nombre de `graph/symbols.ts` para un declarador de
 * binding (`childForFieldName("name") ?? childForFieldName("left")`) — mismo
 * párrafo de divergencia. Es lo que decide el ÚLTIMO segmento del
 * `symbolPath` del nodo, o sea el id del extremo `from`: si acá se leyera otro
 * campo, la arista apuntaría a un nodo que no existe.
 */
function bindingNameNode(node: AstNode): AstNode | null {
  return (node.childForFieldName("name") ?? node.childForFieldName("left")) as AstNode | null;
}

/** Copia LOCAL de `graph/symbols.ts#splitQualifiedSegments` — mismo motivo por el que
 *  `herencia.ts`/`interfaz-declarada.ts`/`instanciacion.ts` llevan la suya: un namespace
 *  COMPUESTO (`namespace A.B {…}`, `class Foo::Bar`) es UN nodo cuyo `.text` trae los
 *  separadores adentro, y el resto del grafo empuja un frame POR SEGMENTO. */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

function sameStep(a: CarrierStep, b: CarrierStep): boolean {
  return a.field === b.field && a.index === b.index && a.nodeType === b.nodeType;
}

/**
 * LA SONDA DE ESTE EXTRACTOR — ver "DE DÓNDE SALE CADA TIPO DE NODO" en el
 * docstring del módulo. Devuelve UN `CarrierPath` sintético cuyo `ownerType`
 * es el **declarador de binding** y cuyos `steps` son el tramo
 * **declarador → … → campo que lleva el nombre del tipo construido**. Con eso
 * solo, `extract` deriva las tres cosas que necesita y ninguna se escribe a
 * mano: la profundidad máxima (`steps.length - 1`), el tipo de nodo de la
 * construcción (`steps[len-2]`) y el campo del tipo (`steps[len-1].field`).
 *
 * `carriers: []` cuando la sonda no recupera la forma — el lenguaje queda sin
 * arista y lo dice, nunca se adivina un tipo de nodo.
 */
export function warmUp(_language: string, root: AstNode): { readonly carriers: readonly CarrierPath[] } {
  // Ancla 1: el propio binding, cuando su declarador expone campo `name`.
  const direct = discoverCarrier(root, SENTINEL_BINDING, SENTINEL_CTOR);
  if (direct && direct.steps.length >= 2) return { carriers: [direct] };

  // Ancla 2: la declaración nombrada que lo envuelve, en dos pasos.
  const toBinding = discoverCarrier(root, SENTINEL_OUTER, SENTINEL_BINDING);
  const toCtor = discoverCarrier(root, SENTINEL_OUTER, SENTINEL_CTOR);
  if (!toBinding || !toCtor) return { carriers: [] };
  if (toBinding.steps.length < 2 || toCtor.steps.length <= toBinding.steps.length) return { carriers: [] };
  const declIndex = toBinding.steps.length - 2;
  // Los dos caminos tienen que pasar por el MISMO declarador: si el prefijo no
  // coincide, la sonda encontró dos cosas distintas y no hay nada que derivar.
  for (let i = 0; i <= declIndex; i++) {
    const a = toBinding.steps[i];
    const b = toCtor.steps[i];
    if (!a || !b || !sameStep(a, b)) return { carriers: [] };
  }
  const steps = toCtor.steps.slice(declIndex + 1);
  if (steps.length < 2) return { carriers: [] };
  return {
    carriers: [
      {
        ownerType: toBinding.steps[declIndex]!.nodeType,
        steps,
        positional: steps.some((s) => s.field === null),
      },
    ],
  };
}

/** Un frame de scope léxico, reflejo del `ScopeFrame` de `graph/symbols.ts`: un
 *  frame ANÓNIMO (nombre `null`) no aporta segmento al camino pero SÍ cuenta
 *  como el scope más cercano — que es lo que decide si un binding es local. */
interface ScopeFrame {
  readonly name: string | null;
  readonly functionLike: boolean;
}

export const extractor: EdgeExtractor<"stores"> = {
  id: "cadena-identidad",
  kind: "stores",
  title: "Cadena de identidad (construye → guarda)",
  // Ninguna `Capability` de `detect/capabilities.ts` describe "este lenguaje
  // puede guardar un objeto construido en un binding" — el gate real es que la
  // sonda recupere la forma, y eso se mide solo (cero hechos), mismo criterio
  // que `instanciacion.ts`.
  needs: [],
  slots: [SLOT_IDENTITY_BINDING],
  sentinel: SENTINEL,
  // `expect` es el par que `sentinel.ts#edgeProfile` usa cuando alguien pide el
  // perfil genérico; la derivación REAL la hace `warmUp` de arriba, que necesita
  // DOS anclas y el mecanismo genérico sólo admite una (mismo motivo por el que
  // `herencia.ts` e `interfaz-declarada.ts` exportan su propio `warmUp`).
  expect: { from: SENTINEL_BINDING, to: SENTINEL_CTOR },
  optional: true,

  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[] {
    if (!(file.language in SENTINEL)) return []; // no-aplicable: sin sonda declarada para este lenguaje
    const [carrier] = ctx.carriers(SLOT_IDENTITY_BINDING);
    if (!carrier || carrier.steps.length < 2) return [];
    // El grafo sólo tiene NODO para los declaradores del vocabulario reflejado
    // — si la sonda recuperó otra forma, emitir sería colgar la arista.
    if (!BINDING_DECLARATOR_TYPES.has(carrier.ownerType)) return [];
    const ctorStep = carrier.steps[carrier.steps.length - 2]!;
    const typeStep = carrier.steps[carrier.steps.length - 1]!;
    if (typeStep.field === null) return []; // sólo relaciones ancladas a un campo nombrado
    const ctorType = ctorStep.nodeType;
    const typeField = typeStep.field;
    /** Pasos entre el declarador y el nodo de construcción, DERIVADOS por la sonda — ver el docstring del módulo. */
    const maxDepth = carrier.steps.length - 1;

    const declaredClasses = declaredClassNamesFor(file);
    const out: EdgeFacts[] = [];

    /**
     * Los tipos construidos que quedan en ESTE binding. Se baja desde el
     * declarador y se para en seco en tres formas, cada una por su razón:
     *   - un nodo de CONSTRUCCIÓN (`ctorType`): lo que hay adentro son sus
     *     argumentos, y esos los guarda ÉL, no este binding. Se para incluso
     *     si `constructedTypeAt` lo rechaza (Go `[]int{…}`, Ruby sin mensaje
     *     `new`, Python cuyo callee no es una clase de este archivo):
     *     reinterpretar el interior de algo que ya se juzgó "no es una
     *     construcción" sería contradecir ese juicio.
     *   - un nodo FUNCTION-LIKE: un `new T()` dentro de una lambda se
     *     construye cuando la lambda corre, no cuando el binding se inicializa.
     *   - otro DECLARADOR de binding: lo suyo lo guarda él.
     *
     * *** HASTA DÓNDE SE BAJA — la guarda de precisión del módulo. *** Los
     * primeros `maxDepth` niveles son los que la SONDA midió entre el
     * declarador y el nodo de construcción en ESTA gramática (1 en
     * java/python/ruby/la familia JS-TS, 2 en C# y Go, que interponen un
     * `equals_value_clause`/`expression_list`). Un nivel MÁS, y sólo por hijos
     * alcanzados por NOMBRE DE CAMPO:
     *
     *   - un hijo con nombre de campo es un ROL NOMBRADO de la expresión
     *     (`consequence`/`alternative` de un ternario, `right` de una
     *     asignación): sigue siendo candidato a ser EL valor del binding, y es
     *     exactamente el caso multivaluado — `x = cond ? new A() : new B()` —
     *     que la regla 1 existe para representar;
     *   - un hijo POSICIONAL es un ELEMENTO de algo (elemento de lista, entrada
     *     de mapa, argumento de una llamada): lo guarda ESE algo, no el
     *     binding. Por eso `X = [Foo()]` en Python NO emite (el `call` es
     *     posicional dentro del `list`) y `x = foo(new Bar())` tampoco (el
     *     `new Bar()` es posicional dentro de `arguments`).
     *
     * FALSO CONOCIDO Y DECLARADO de ese nivel extra: `x = (new A()).b` emite
     * `x stores A` — `object` es un campo nombrado del acceso a miembro. Se
     * acepta a cambio del caso multivaluado, que es el que la ola pide
     * representar; queda escrito acá para que la próxima medición lo busque en
     * vez de redescubrirlo.
     */
    const collect = (
      node: AstNode,
      depth: number,
      found: Map<string, { name: string; qualifier: readonly string[] }>,
    ): void => {
      if (depth > maxDepth) return;
      const fieldAware = node as AstNode & { fieldNameForChild?: (index: number) => string | null };
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i) as AstNode | null;
        if (!child || !child.isNamed) continue;
        const level = depth + 1;
        if (level > maxDepth) {
          const field = typeof fieldAware.fieldNameForChild === "function" ? fieldAware.fieldNameForChild(i) : null;
          if (field === null) continue; // posicional más allá de lo que la gramática mide: es elemento de otro, no el valor del binding
        }
        if (child.type === ctorType) {
          const peeled = constructedTypeAt(child, file.language, ctorType, typeField, declaredClasses);
          if (peeled) found.set([...peeled.qualifier, peeled.name].join("."), peeled);
          continue;
        }
        if (file.sets.functionNodes.has(child.type)) continue;
        if (BINDING_DECLARATOR_TYPES.has(child.type)) continue;
        collect(child, level, found);
      }
    };

    // Pila de SCOPE LÉXICO, reflejo del recorrido de `graph/symbols.ts` (mismo
    // early-return sobre nodos no nombrados, mismo empuje de UN frame POR
    // SEGMENTO, mismo frame anónimo cuando la declaración no tiene nombre,
    // mismo receptor escrito empujado sólo desde nivel de archivo). Tiene que
    // ser el MISMO recorrido: `fromPath` de una arista y el `symbolPath` del
    // nodo del binding se comparan como strings, sin traductor.
    const scopeStack: ScopeFrame[] = [];
    const tiposDeArchivo = fileLevelTypeNames(file.root, file.sets);

    const visit = (node: AstNode): void => {
      if (!node.isNamed) return;
      const functionLike = file.sets.functionNodes.has(node.type);
      const classLike = !functionLike && file.sets.classNodes.has(node.type);
      let pushedCount = 0;

      if (functionLike || classLike) {
        const nameNode = node.childForFieldName("name") as AstNode | null;
        if (functionLike && scopeStack.length === 0) {
          const receiverType = declaredReceiverTypeName(node);
          if (receiverType !== null && tiposDeArchivo.has(receiverType)) {
            scopeStack.push({ name: receiverType, functionLike: false });
            pushedCount++;
          }
        }
        const segments: readonly (string | null)[] = nameNode ? splitQualifiedSegments(nameNode.text) : [null];
        for (const seg of segments) scopeStack.push({ name: seg, functionLike });
        pushedCount += segments.length;
      } else if (BINDING_DECLARATOR_TYPES.has(node.type)) {
        // `isLocal` de `graph/symbols.ts`, verbatim: un binding cuyo scope más
        // cercano es function-like NO es nodo del grafo.
        const immediate = scopeStack[scopeStack.length - 1];
        if (immediate?.functionLike !== true) {
          const nameNode = bindingNameNode(node);
          if (nameNode && !isBlankName(nameNode.text)) {
            const found = new Map<string, { name: string; qualifier: readonly string[] }>();
            collect(node, 0, found);
            if (found.size > 0) {
              const container = scopeStack.filter((f): f is ScopeFrame & { name: string } => f.name !== null).map((f) => f.name);
              const fromPath = [...container, nameNode.text];
              const startLine = node.startPosition.row + 1;
              const endLine = node.endPosition.row + 1;
              for (const peeled of found.values()) {
                out.push({
                  extractorId: extractor.id,
                  kind: "stores",
                  fromPath,
                  toName: peeled.name,
                  toQualifier: peeled.qualifier,
                  provenance: "declared",
                  startLine,
                  endLine,
                  via: `${node.type}->${ctorType}.${typeField}`,
                });
              }
            }
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i) as AstNode | null;
        if (child) visit(child);
      }
      for (let i = 0; i < pushedCount; i++) scopeStack.pop();
    };
    visit(file.root);
    return out;
  },
};

/**
 * LA REGLA 1 (MULTIVALUADA), aplicada sobre las aristas YA RESUELTAS — no
 * sobre los hechos crudos, porque `EdgeFacts` no lleva destino resuelto y
 * `graph/build.ts` descarta su `provenance` a propósito (la decide la cascada,
 * ver el bloque "punto A" de ese archivo). Post-grafo, igual que
 * `deriveSatisfiesEdges`/`deriveCarriesEdges`.
 *
 * Un binding con DOS orígenes distintos no es un binding de dos tipos: es un
 * binding del que **no se sabe** cuál de los dos guarda en un punto dado. Se
 * colapsa a UNA sola arista con `provenance: "ambiguous"`, `to` = el primer
 * destino en orden lexicográfico y el resto en `alternatives` — exactamente la
 * forma que `CodeGraphEdge.alternatives` documenta y que
 * `graph/types.ts#edgeIsAmbiguous` deja fuera de toda consulta por defecto. Un
 * grupo que supera `AMBIGUOUS_MAX_TARGETS` no se emite en absoluto, misma
 * disciplina que la cascada ("más destinos que el tope no es información, es
 * la ausencia de información").
 *
 * PURA y estable: si ningún binding tiene más de un destino devuelve la lista
 * tal cual, sin copiarla. Ignora todo `kind` que no sea `stores`.
 */
export function markAmbiguousStores(edges: readonly CodeGraphEdge[]): readonly CodeGraphEdge[] {
  const targetsByFrom = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.kind !== "stores") continue;
    let s = targetsByFrom.get(e.from);
    if (!s) targetsByFrom.set(e.from, (s = new Set()));
    s.add(e.to);
  }
  let hasMulti = false;
  for (const s of targetsByFrom.values()) {
    if (s.size > 1) {
      hasMulti = true;
      break;
    }
  }
  if (!hasMulti) return edges;

  const out: CodeGraphEdge[] = [];
  const emittedGroup = new Set<string>();
  for (const e of edges) {
    if (e.kind !== "stores") {
      out.push(e);
      continue;
    }
    const targets = [...(targetsByFrom.get(e.from) ?? new Set<string>())].sort();
    if (targets.length <= 1) {
      out.push(e);
      continue;
    }
    if (emittedGroup.has(e.from)) continue; // el grupo ya se colapsó en su primera arista
    emittedGroup.add(e.from);
    if (targets.length > AMBIGUOUS_MAX_TARGETS) continue; // sin información: no se emite
    const chosen = targets[0]!;
    const weight = edges.reduce((acc, o) => (o.kind === "stores" && o.from === e.from ? acc + o.weight : acc), 0);
    out.push({
      ...e,
      to: chosen,
      weight,
      provenance: "ambiguous",
      alternatives: targets.filter((t) => t !== chosen),
    });
  }
  return out;
}
