/**
 * `primitive-obsession` — Obsesión por tipos primitivos (PLAN.md §2.2/§4.1
 * "Obsesión por primitivos | archivo | Sólo con tipos explícitos | nodo de
 * tipo primitivo. En dinámicos: no aplicable, declarado").
 *
 * RELACIÓN (qué mide, sin jerga de AST): dentro de la firma de UNA función,
 * cuántos parámetros comparten el MISMO tipo primitivo dedicado de la
 * gramática (p.ej. tres parámetros `number`, o cuatro `int`). Fowler describe
 * el olor cualitativamente — "usar un dato primitivo para algo que merece su
 * propio tipo" — sin fijar un número; el umbral concreto de esta
 * implementación es una decisión propia (`pisoDeclarado`, ver abajo), no algo
 * que el libro cite.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la clasificación "primitivo" no mira el
 * NOMBRE del tipo (nada de listas `["int", "string", "número", ...]` por
 * lenguaje). Mira si el propio parser dedica a ese tipo un NODO DE GRAMÁTICA
 * PROPIO para "tipo primitivo del lenguaje" — confirmado por sonda directa
 * contra los seis árboles reales: TypeScript nombra `predefined_type` a
 * `number`/`string`/`boolean`/…; Java nombra `integral_type`/
 * `floating_point_type`/`boolean_type` a sus primitivos de palabra clave;
 * C# nombra `predefined_type` a los suyos. Una referencia a un tipo
 * DECLARADO (una clase, una interfaz, `Widget`) nunca cae en ninguno de esos
 * nombres: la gramática la resuelve como `type_identifier` (TS/Java) o
 * `identifier` (C#) — un nodo estructuralmente distinto, no el mismo nodo con
 * otro texto. `PRIMITIVE_TYPE_WORD` es UNA regex compartida aplicada
 * IDÉNTICAMENTE a los seis lenguajes (mismo estilo que `TERNARY_NAME`/
 * `EXCEPTION_WORD` de `code-grammar.ts`), no una lista por lenguaje: lo único
 * que compara texto es la CLAVE DE AGRUPACIÓN entre dos parámetros ya
 * clasificados como primitivos ("¿este `predefined_type` dice lo mismo que
 * aquél?"), exactamente el mismo tipo de comparación que `large-class` ya
 * hace agrupando por `className` — comparar dos textos por igualdad no es
 * "vocabulario", es identidad.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - Sólo mira PARÁMETROS de función, no campos/atributos de una clase (la
 *     otra mitad clásica del olor — "una clase que sólo tiene campos
 *     primitivos"). Detectar campos exigiría resolver declaraciones de
 *     miembro, que hoy no forma parte de `FileUnit`/`DerivedNodeSets`; se
 *     declara como alcance futuro, no como bug.
 *   - Cuenta REPETICIÓN del mismo tipo dentro de UNA firma, no "esta función
 *     tiene algún parámetro primitivo" (eso dispararía en casi cualquier
 *     función real y no discriminaría nada — ver FALSOS POSITIVOS).
 *   - Busca el nodo de tipo primitivo en TODO el subárbol del parámetro, no
 *     sólo en su campo `type` directo. Ver el falso positivo de colecciones
 *     más abajo: es la contrapartida deliberada de esa simplificación.
 *
 * LÍMITES DECLARADOS POR LENGUAJE (confirmados por sonda directa, no
 * adivinados):
 *   - Ruby, Python (sin anotaciones) y JavaScript: la capacidad
 *     `tipos-explicitos` (`detect/capabilities.ts`) ya es `false` para estos
 *     tres tal como los prueba hoy `code-analyzer.ts` (sus `probeSource` no
 *     ejercitan ninguna anotación de tipo) — el `needs` de abajo los deja
 *     fuera con `no-aplicable`, nunca con "cero hallazgos". Es EL caso de
 *     prueba central de este detector: ver `no aplicable sin
 *     tipos-explicitos` en el test, por lenguaje.
 *   - Go: SÍ tiene `tipos-explicitos` (todo parámetro declara su tipo), pero
 *     su gramática no dedica NINGÚN nodo propio a "tipo primitivo": `int`,
 *     `string` y un `struct` propio como `Shape` resuelven, los tres, como el
 *     mismo `type_identifier` — confirmado por sonda directa. Sin un nodo que
 *     los distinga, este detector no puede separar "primitivo" de "tipo
 *     propio" en Go y por lo tanto NUNCA encuentra nada ahí, aun con
 *     parámetros primitivos repetidos genuinos — límite real del lenguaje (Go
 *     no tiene palabras clave de tipo, son identificadores predeclarados),
 *     documentado y probado (`Go: límite declarado`), no un `needs` (la
 *     capacidad existe de verdad).
 *   - Python con anotaciones de tipo (`def f(x: int) -> int`) tiene el mismo
 *     límite que Go y por la misma razón: `type -> identifier`, sin nodo
 *     dedicado para `int`/`str` — no distinguible de una anotación con una
 *     clase propia. No se declara un `needs` distinto para este caso: cuando
 *     Python SÍ usa anotaciones, la capacidad es verdadera y el detector
 *     corre, pero estructuralmente no encuentra nada — mismo patrón que Go.
 *   - Java: sólo los primitivos de PALABRA CLAVE (`int`, `boolean`, `double`,
 *     …) tienen nodo propio (`integral_type`/`floating_point_type`/
 *     `boolean_type`). `String`, el ejemplo de obsesión por primitivos más
 *     citado en la literatura, es en Java una CLASE de `java.lang`, no una
 *     palabra clave — su nodo es `type_identifier`, indistinguible de
 *     cualquier tipo propio. Java pierde ese caso de verdad (probado:
 *     `Java: límite declarado — String no es detectable`), no por un defecto
 *     de este detector sino porque la propia gramática no lo distingue.
 *   - C# sí distingue `string`: en su gramática es un alias de palabra clave
 *     con nodo propio `predefined_type`, igual que `int`/`bool` — a
 *     diferencia de Java, C# SÍ detecta la obsesión por `string` repetido.
 *     Contraste real entre dos lenguajes con sintaxis parecida, no una
 *     inconsistencia de este detector.
 *
 * FALSOS POSITIVOS CONOCIDOS (qué forma legítima se confunde con esto, y con
 * qué patrón bien aplicado):
 *   - Forma legítima que se confunde: operaciones matemáticas/geométricas
 *     genuinamente atómicas con varios números independientes por diseño —
 *     `lerp(a: number, b: number, t: number)`, `clamp(value: number, min:
 *     number, max: number)`. Tres `number` no siempre son "en realidad un
 *     Vector3 o un Range disfrazado"; a veces son, de verdad, tres escalares
 *     sin relación estructural entre sí. El detector no puede distinguir
 *     "estos tres números son un Rango" de "estos tres números son
 *     independientes" — sólo cuenta la repetición, que es la señal de
 *     entrada, no la conclusión.
 *
 * JUICIO DE PRECISIÓN (frente de nivel 1, agosto 2026), FALSO POSITIVO
 * ENCONTRADO Y ARREGLADO: un parámetro de colección genérica sobre un
 * primitivo (`items: number[]`, `weights: Array<number>`, `m:
 * ReadonlyMap<string, X>`) ya ES la forma correcta de agrupar varios
 * primitivos relacionados, y sin embargo, ANTES de este arreglo, como el
 * detector buscaba el nodo primitivo en TODO el subárbol del parámetro (no
 * sólo en su campo `type` directo), un `predefined_type`/`integral_type`
 * anidado dentro de un tipo de arreglo o genérico también contaba para el
 * conteo. Confirmado con DOS casos reales en `src/` (el propio analizador):
 * `coupling-without-abstraction.ts#inferredRatioForCandidate(proj, clients:
 * readonly string[], a: string, b: string)` — sólo `a`/`b` son strings
 * sueltos de verdad (2, bajo el piso de 3); `concrete-over-abstraction.ts
 * #collectConsumers(graph, bId: string, bFile: string, memberIdToName:
 * ReadonlyMap<string,string>, nodeById: ReadonlyMap<string,CodeGraphNode>)`
 * — sólo `bId`/`bFile` son strings sueltos (2); en los dos casos el
 * hallazgo entero dependía de contar un `Map`/`Array` como si fuera "otro
 * string más", y ninguno de los dos es intercambiable con un string suelto
 * (el compilador rechaza pasar un `ReadonlyMap<string,string>` donde se
 * espera un `string`, así que la premisa del propio hallazgo — "nada impide
 * pasarlos en el orden equivocado sin que el compilador se queje" — es
 * FALSA para esos dos parámetros). `findPrimitiveType` (abajo) ahora deja de
 * DESCENDER en cuanto encuentra un nodo "contenedor" (`array_type`/
 * `generic_type`/`generic_name`/`slice_type`/`map_type` — confirmado por
 * sonda directa contra las 6 gramáticas,
 * `scratchpad/precision-front/probe-container-types.mjs`): un primitivo que
 * sólo aparece COMO ARGUMENTO DE TIPO de un contenedor ya no cuenta como "el"
 * tipo del parámetro. Esto SÍ es la misma clase de regex genérica de nombre
 * de nodo de gramática que `PRIMITIVE_TYPE_WORD` (nunca vocabulario de
 * dominio) — la limitación previa ("exigiría vocabulario por lenguaje") no
 * era cierta: los nombres de nodo de un contenedor son tan "gramática del
 * lenguaje" como los del primitivo mismo.
 *
 * JUICIO DE PRECISIÓN (Ola N→O), FALSO POSITIVO ENCONTRADO Y ARREGLADO —
 * CLASE UTILITARIA *DE* PRIMITIVOS: `LongMath.powMod(long a, long p, long
 * m)`, `Shorts.rotate(short[], int distance, int fromIndex, int toIndex)`,
 * `Doubles.constrainToRange(double value, double min, double max)`
 * (guava) — tres funciones matemáticas puras juzgadas FALSAS, con la MISMA
 * nota en las tres: "el primitivo ES el dominio de la clase". La firma del
 * caso, medida en las tres: el método vive en una clase cuyo propio NOMBRE
 * es el tipo primitivo repetido (o su plural, o un compuesto que empieza
 * con él — `LongMath`/`Shorts`/`Doubles`/`Ints`/`Booleans`), y el archivo
 * ENTERO es una biblioteca de operaciones SOBRE ese primitivo. Ahí, varios
 * parámetros del mismo tipo no son un Value Object oculto (el `long`/`int`/
 * `double` no representa ningún concepto propio del dominio que el tipo
 * esconda) — SON el dominio declarado de esa clase, tan explícito como el
 * nombre lo dice. Contraste con el verdadero positivo re-juzgado en la misma
 * tanda, `RelationshipTester.assertUnrelated(int groupNumber, int
 * itemNumber, int unrelatedGroupNumber, int unrelatedItemNumber)`: la clase
 * NO se llama como el primitivo, y los 4 `int` sí esconden un concepto real
 * (una referencia a ítem) que invertir en silencio cambia el significado.
 * `isPrimitiveNamedUtilityClass` (abajo) filtra el primer caso sin tocar el
 * segundo: compara el NOMBRE de la clase que declara la función (dato que
 * `FunctionUnit.symbolPath` ya trae, nunca una lista de nombres de clase
 * conocidos) contra el propio tipo primitivo repetido — comparación de dos
 * identificadores EXTRAÍDOS del archivo bajo análisis entre sí, la misma
 * clase de comparación por identidad que el resto del catálogo ya usa
 * (`trailingIdentifier` en `flag-accumulator.ts`, agrupar por `className` en
 * `large-class.ts`), no una lista de vocabulario fijo.
 *
 * DOS AJUSTES QUE EL CASO MEDIDO OBLIGÓ A AGREGAR (los tres juicios citados
 * arriba, mirados en el archivo real):
 *   1. `Shorts.rotate(short[] array, int distance, int fromIndex, int
 *      toIndex)` dispara por "int" (3 veces: distance/fromIndex/toIndex), NO
 *      por "short" -- el nombre de la clase (`Shorts`) coincide con el
 *      primitivo que es EL DOMINIO de la clase (arreglos de `short`), no con
 *      el primitivo que dispara ESTE hallazgo puntual. La comparación no
 *      puede ser "¿el nombre de la clase coincide con el tipo repetido
 *      ACÁ?" -- tiene que ser "¿el nombre de la clase coincide con ALGUNO de
 *      los tipos primitivos que este detector reconoce?" (`PRIMITIVE_TYPE_
 *      NAMES`, la MISMA familia cerrada de 8 palabras clave de Java que
 *      `PRIMITIVE_TYPE_WORD` ya reconoce por nodo de gramática -- nunca
 *      vocabulario de dominio, es la lista de tipos primitivos del lenguaje
 *      mismo). Una utilidad de bajo nivel sobre arreglos de UN primitivo usa
 *      naturalmente OTROS primitivos (índices, conteos, desplazamientos) en
 *      sus propios métodos, y eso sigue siendo idiomático para la familia.
 *   2. `LongMath.powMod` NO está declarado directamente en la clase
 *      `LongMath`: vive en `MillerRabinTester`, un `enum` PRIVADO anidado
 *      dentro del mismo archivo (implementación interna del test de
 *      primalidad de Miller-Rabin) -- `FunctionUnit.symbolPath` sólo captura
 *      UN nivel de anidamiento, así que el nombre de clase inmediato
 *      (`MillerRabinTester`) no menciona "long" en absoluto. La convención
 *      de Java de UN tipo público por archivo (`LongMath.java` declara
 *      `public final class LongMath`) hace que el NOMBRE DEL ARCHIVO sea la
 *      señal correcta cuando la clase inmediata no alcanza: se prueba el
 *      nombre de clase inmediato Y el nombre de archivo (sin extensión)
 *      contra la misma familia de 8 palabras clave -- cualquiera de los dos
 *      que matchee alcanza.
 */
import type { ProbeNode } from "../../code-grammar.js";
import { citado } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "sameTypeCount";

/**
 * Nombres de nodo que distintas gramáticas dedican a "tipo primitivo del
 * lenguaje" — confirmado por sonda directa (ver el docstring del módulo):
 * `predefined_type` (TypeScript/TSX/JavaScript vía TS, C#), `integral_type`/
 * `floating_point_type`/`boolean_type` (Java). UNA regex compartida, aplicada
 * IDÉNTICAMENTE a todo lenguaje — nunca una lista de nombres de tipo por
 * lenguaje.
 */
const PRIMITIVE_TYPE_WORD = /^(predefined|primitive|integral|floating_point|boolean)_type$/;

/**
 * Nombres de nodo que distintas gramáticas dedican a "tipo CONTENEDOR"
 * (arreglo/genérico/mapa) — confirmado por sonda directa
 * (`scratchpad/precision-front/probe-container-types.mjs`): `array_type`
 * (TS/Java), `generic_type` (TS/Java/Python), `generic_name` (C#),
 * `slice_type`/`map_type` (Go). Ver el docstring del módulo, JUICIO DE
 * PRECISIÓN: un primitivo que sólo aparece como ARGUMENTO DE TIPO de uno de
 * estos contenedores no es "el" tipo del parámetro.
 */
const CONTAINER_TYPE_WORD = /^(array|generic|slice|map|object|function|tuple)_(type|name)$/;

/**
 * OLA AW, FRENTE AW2 — LAS TRES PALABRAS NUEVAS (`object`/`function`/`tuple`) y
 * por qué son la MISMA clase de arreglo que la Ola N ya hizo con
 * `array|generic|slice|map`, no una excepción nueva.
 *
 * El arreglo original decía: *"un primitivo que sólo aparece COMO ARGUMENTO DE
 * TIPO de un contenedor ya no cuenta como «el» tipo del parámetro"*, porque la
 * premisa del hallazgo —*"nada impide pasarlos en el orden equivocado sin que
 * el compilador se queje"*— es FALSA para ese parámetro. La lista quedó corta:
 * un tipo OBJETO literal (`{path?: string}`), un tipo FUNCIÓN
 * (`(t: number) => void`) y una TUPLA (`readonly [number, number]`) esconden
 * un primitivo adentro exactamente igual que un `Array<string>`, y el
 * compilador rechaza igual pasar un `string` donde se espera `{path?: string}`.
 *
 * NO ES UNA HIPÓTESIS: son seis falsos ABIERTOS Y VERIFICADOS del banco de
 * juicios, todos con la misma nota («ARTEFACTO DEL DETECTOR DE NIVEL 1»):
 *   · `nest · server-grpc.ts:225` — `grpcMethod: {path?: string}`;
 *   · `nest · validate-each.util.ts:16` — `context: {name: string}`;
 *   · `gitea · notification.ts:42` — `callback: (timeout: number, …) => void`;
 *   · `excalidraw · sizeHelpers.ts:86` — `viewTransformations: {zoom: Zoom; …}`;
 *   · `Ghost · mysql-manager.ts:30` — `options: {stripe?: {secretKey: string…}}`;
 *   · `vueuse · createProjection/index.ts:5` — `from/to: readonly [number, number]`.
 *
 * Confirmado por sonda DIRECTA contra los `.wasm` reales
 * (`scratchpad-aw2/sonda-contenedores.mts`, Ola AW): `object_type`/
 * `function_type` (TypeScript y TSX), `tuple_type` (TypeScript, TSX y C#; en
 * TS/TSX cuelga de un `readonly_type` que NO hay que nombrar porque el
 * recorrido lo atraviesa). `nullable_type` de C# (`int?`) queda
 * DELIBERADAMENTE afuera: un `int?` SÍ es el primitivo, envuelto por la
 * gramática y no por el programador.
 */

/**
 * OLA AW, FRENTE AW2 — LOS TIPOS TOPE/FONDO, que la gramática marca como
 * `predefined_type` pero NO son un dato primitivo: son la AUSENCIA de tipo.
 *
 * `any`, `unknown`, `never`, `object` y `void` son palabras del lenguaje
 * —la misma clase de lista cerrada que `PRIMITIVE_TYPE_NAMES` ya declara con
 * las 8 palabras clave de Java, nunca vocabulario de dominio— y la gramática
 * de TypeScript les da el MISMO nodo (`predefined_type`) que a `string` o
 * `number`. Contarlas infla el hallazgo con firmas donde no hay ningún dato
 * que envolver. Tres falsos ABIERTOS Y VERIFICADOS del banco:
 *   · `nest · http-adapter.ts:124` — `listen(port: any, hostname?: any, callback?: any)`,
 *     la firma de implementación de dos sobrecargas;
 *   · `gitea · fomantic.ts:17` y `fomantic/dropdown.ts:86` — callbacks con
 *     firma impuesta por Fomantic UI, tres `any`;
 *   · `excalidraw · restore.ts:145` — `restoreLinearElementPoints(points: unknown,
 *     width: unknown, height: unknown)`, deserialización defensiva.
 * Un Value Object no se puede declarar sobre `any`: no hay dato, hay un hueco.
 */
const TOP_TYPE_NAMES: ReadonlySet<string> = new Set(["any", "unknown", "never", "object", "void"]);

/**
 * Busca el primer nodo cuyo tipo es un "tipo primitivo" dedicado de la
 * gramática, sin DESCENDER dentro de un nodo contenedor (ver
 * `CONTAINER_TYPE_WORD`) — un primitivo envuelto en un arreglo/genérico/mapa
 * no cuenta como "el" tipo del parámetro (JUICIO DE PRECISIÓN, ver docstring
 * del módulo). `null` en cuanto se cruza un contenedor, o cuando el
 * parámetro no tiene anotación de tipo, o su tipo es una referencia
 * (`type_identifier`/`identifier`) a algo declarado en otro lado, o cuando el
 * nodo primitivo es en realidad un TIPO TOPE/FONDO (`TOP_TYPE_NAMES`).
 */
function findPrimitiveType(node: ProbeNode): AstNode | null {
  if (node.isNamed) {
    if (PRIMITIVE_TYPE_WORD.test(node.type)) return TOP_TYPE_NAMES.has((node as AstNode).text.trim()) ? null : (node as AstNode);
    if (CONTAINER_TYPE_WORD.test(node.type)) return null;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const found = findPrimitiveType(child);
    if (found) return found;
  }
  return null;
}

/**
 * Devuelve el texto fuente del primer tipo primitivo suelto del parámetro
 * (`"number"`, `"int"`, `"boolean"`, …), o `null` — ver `findPrimitiveType`.
 * El cast a `AstNode` ocurre UNA vez, en la hoja, sólo cuando de verdad hace
 * falta `.text` (misma regla que `empty-catch.ts`).
 */
function primitiveTypeText(paramNode: ProbeNode): string | null {
  const found = findPrimitiveType(paramNode);
  return found ? found.text.trim() : null;
}

/**
 * Las 8 palabras clave de tipo primitivo de Java — la única gramática donde este
 * detector midió el caso de "clase utilitaria DE primitivos" (ver "JUICIO DE
 * PRECISIÓN" y "DOS AJUSTES..." en el docstring del módulo). NUNCA vocabulario de
 * dominio: son las mismas 8 palabras que `PRIMITIVE_TYPE_WORD` ya reconoce por NODO
 * de gramática (`integral_type`/`floating_point_type`/`boolean_type`), acá
 * enumeradas por su TEXTO porque hace falta comparar el nombre de una clase contra
 * CUALQUIERA de ellas (no sólo contra el tipo puntual que dispara un hallazgo dado —
 * ver `Shorts.rotate` en "DOS AJUSTES...").
 */
const PRIMITIVE_TYPE_NAMES = ["byte", "short", "int", "long", "float", "double", "boolean", "char"];

/**
 * ¿`name` (nombre de clase o de archivo) está NOMBRADO por ALGUNO de los tipos
 * primitivos de `PRIMITIVE_TYPE_NAMES` — `LongMath`/`Longs` para `"long"`,
 * `Shorts` para `"short"`, `Doubles` para `"double"`? Exige frontera de palabra
 * real (mayúscula siguiente, plural `s` seguido de mayúscula o fin de cadena, o
 * coincidencia exacta): `Int` no matchea `IntersectionUtils` (el resto,
 * `ersectionUtils`, no arranca con mayúscula ni es sólo `s`), pero sí matchea
 * `IntMath`/`Ints`/`Int`.
 */
function isPrimitiveTypeNamedIdentifier(name: string, typeName: string): boolean {
  const capitalized = typeName.charAt(0).toUpperCase() + typeName.slice(1);
  if (!name.startsWith(capitalized)) return false;
  const rest = name.slice(capitalized.length);
  const afterPlural = rest.startsWith("s") ? rest.slice(1) : rest;
  return afterPlural === "" || /^[A-Z]/.test(afterPlural);
}

/** ¿`name` es, ella misma, una utilidad DE primitivos (`Shorts`/`LongMath`/…) —
 *  ver "JUICIO DE PRECISIÓN"? Prueba contra TODOS los tipos primitivos
 *  reconocidos, no sólo el que dispara el hallazgo puntual. */
function isPrimitiveNamedUtilityClass(name: string | undefined): boolean {
  if (!name) return false;
  return PRIMITIVE_TYPE_NAMES.some((typeName) => isPrimitiveTypeNamedIdentifier(name, typeName));
}

/** Nombre de archivo sin directorio ni extensión — la convención de Java de UN
 *  tipo público por archivo hace que esto sea la señal correcta cuando el
 *  método vive en una clase/enum PRIVADA anidada (ver "DOS AJUSTES...", caso
 *  `LongMath.java#MillerRabinTester#powMod`: la clase inmediata no menciona el
 *  primitivo, pero el archivo sí). */
function fileBaseNameWithoutExt(path: string): string {
  const slash = path.lastIndexOf("/");
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

export const detector: IntraFileDetector<ThresholdKey, "primitive-obsession"> = {
  id: "primitive-obsession",
  kind: "primitive-obsession",
  scope: "intra-file",
  title: "Obsesión por tipos primitivos",
  needs: ["tipos-explicitos"],
  thresholds: {
    // R3 (auditoría de umbrales inventados): Fowler no fija un número para
    // este olor específico, pero el corte "dos puede ser coincidencia, tres
    // ya no" es la Regla de Tres (Roberts, popularizada por Fowler,
    // "Refactoring: Improving the Design of Existing Code", 1999) — el mismo
    // razonamiento que ya motiva `coupling-without-abstraction.ts#MIN_CLIENTS_SPEC`
    // y `scattered-instantiation.ts#MIN_SITES_SPEC`, acá aplicado a parámetros
    // del mismo tipo en vez de a sitios de código. Antes `pisoDeclarado(3, …)`,
    // mismo valor.
    sameTypeCount: citado(3, {
      work: "Fowler, Refactoring: Improving the Design of Existing Code (1999)",
      rule: "Regla de Tres (Roberts): dos ocurrencias toleran coincidencia, la tercera ya no",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("sameTypeCount");
    const findings: RawFinding[] = [];

    for (const fn of file.functions) {
      const paramList = fn.node.childForFieldName("parameters") ?? fn.node.childForFieldName("parameter_list");
      if (!paramList) continue;

      const byType = new Map<string, number>();
      for (let i = 0; i < paramList.childCount; i++) {
        const param = paramList.child(i);
        if (!param || !param.isNamed) continue;
        const typeName = primitiveTypeText(param);
        if (typeName === null) continue;
        byType.set(typeName, (byType.get(typeName) ?? 0) + 1);
      }

      // ARREGLO (Ola O, ver "JUICIO DE PRECISIÓN"/"DOS AJUSTES..." en el docstring del
      // módulo): si la clase inmediata O el archivo que declara `fn` está NOMBRADO
      // por CUALQUIER tipo primitivo (`LongMath`/`Shorts`/`Doubles`), es una utilidad
      // DE primitivos — el primitivo ES el dominio declarado de esa clase, no un dato
      // ajeno sin envolver, así que NINGÚN parámetro primitivo repetido en NINGUNO de
      // sus métodos cuenta como obsesión (no sólo el que coincide con el nombre).
      const className = fn.symbolPath.length > 1 ? fn.symbolPath[0] : undefined;
      const isUtilityClass = isPrimitiveNamedUtilityClass(className) || isPrimitiveNamedUtilityClass(fileBaseNameWithoutExt(fn.file));

      for (const [typeName, count] of byType) {
        if (count < threshold.value) continue;
        if (isUtilityClass) continue;

        findings.push({
          variant: typeName,
          title: `"${fn.name ?? "función anónima"}" recibe ${count} parámetros de tipo primitivo "${typeName}"`,
          detail:
            `Varios parámetros del mismo tipo primitivo ("${typeName}") en una sola firma son intercambiables entre sí: ` +
            "nada impide pasarlos en el orden equivocado sin que el compilador se queje, y el significado de cada uno vive sólo en el nombre del parámetro, no en su tipo. " +
            "Un tipo propio (un Value Object) hace ese error imposible y documenta la relación entre esos valores en un solo lugar.",
          trigger: [{ label: `parámetros de tipo "${typeName}"`, value: count, threshold }],
          locations: [
            {
              file: fn.file,
              startLine: fn.startLine,
              endLine: fn.endLine,
              symbol: fn.name ?? undefined,
              role: `función con ${count} parámetros del mismo tipo primitivo (${typeName})`,
            },
          ],
          severity: Math.min(100, 40 + count * 10),
          advice: {
            primary: {
              name: "Introduce Parameter Object / Replace Data Value with Object",
              kind: "refactorizacion",
              why: "Agrupar los valores primitivos relacionados en un tipo propio hace el orden de los parámetros irrelevante y da un único lugar donde poner la validación y el comportamiento que hoy está disperso.",
              source: "https://refactoring.guru/es/smells/primitive-obsession",
            },
          },
        });
      }
    }

    return findings;
  },
};
