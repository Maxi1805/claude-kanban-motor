/**
 * `self-referential-member` — ancla nueva para Composite (encargo propio:
 * "Composite — ancla ciega a la forma real").
 *
 * EL HUECO QUE CIERRA — medido, no adivinado: el ÚNICO ancla de
 * `hypotheses/composite.ts` era, hasta esta tarea, `distributed-duplication`
 * (código literalmente duplicado en >=2 ARCHIVOS sin conexión). La forma más
 * común de Composite en código real — UNA sola clase con un árbol
 * autorreferencial (`class Folder { children: Folder[] }`,
 * `has_many :children, class_name: 'Folder'`) — nunca duplica texto entre
 * archivos: vive entera en un solo lugar. `distributed-duplication` es
 * estructuralmente ciego a esa forma, así que Composite nunca llegaba a
 * evaluarse ahí. Caso real que expuso el hueco:
 * `<repo privado del usuario>/Backend/app/models/folder.rb` — `has_many
 * :children` (línea 11) + `belongs_to :parent` (línea 10), con
 * `not_empty?`/`ensure_empty` (línea ~79/83) ya usando el vocabulario exacto
 * que `hypotheses/composite.ts#EMPTINESS_WORD`/`CHILDREN_WORD` esperaban, y
 * un recorrido manual de ancestros (`parent_is_not_descendant`, `while
 * ancestor`) que es la forma AD HOC que Composite reemplazaría — cero
 * duplicación entre archivos, así que `distributed-duplication` nunca
 * disparaba ahí.
 *
 * RELACIÓN, ESTRUCTURAL — "un tipo cuyo campo o colección apunta a su propio
 * tipo" (recursión estructural, lo que Composite remedia), NUNCA vocabulario
 * de framework: se probaron y descartaron a propósito nombres como
 * `has_many`/`belongs_to`/`class_name` — son convención de Rails, prohibida
 * por la regla dura del encargo. Lo que este detector mira es SÓLO forma:
 *
 *   1. CAMINO TIPADO (TS/Java/C#/...): un miembro de la clase (campo directo
 *      del cuerpo, NO un método/función, NO una clase anidada) tiene un
 *      campo `type` (`childForFieldName("type")`, la MISMA capacidad
 *      `tipos-explicitos` que ya usa `primitive-obsession.ts`) cuyo subárbol
 *      contiene un nodo cuyo texto normalizado es EXACTAMENTE el nombre de la
 *      propia clase (`children: Folder[]`, `List<Folder> children`, `Folder
 *      parent`) — sea el tipo directo, o envuelto en un arreglo/genérico/
 *      unión. Ningún nombre de nodo de gramática se hardcodea
 *      (`type_identifier` vs `identifier` vs `generic_type>type_arguments`):
 *      un wrapper (`Folder[]`, `List<Folder>`) SIEMPRE trae sintaxis extra en
 *      su propio texto (corchetes, genéricos) que rompe la igualdad EXACTA
 *      con el nombre de la clase, así que sólo el nodo hoja (`Folder`) puede
 *      calzar — la comparación de texto sola ya aísla el nodo correcto, sin
 *      necesitar reconocer la forma del wrapper por nombre.
 *   2. CAMINO SIN TIPOS (Ruby, y cualquier lenguaje dinámico): cuando el
 *      miembro NO tiene campo `type` en absoluto (la macro/llamada de Ruby
 *      nunca lo tiene), se busca — DENTRO del propio miembro, nunca fuera —
 *      un nodo con forma de PAR clave/valor genérico (`childForFieldName`
 *      resuelve TANTO `key` COMO `value` — la MISMA introspección por forma
 *      de campo que `code-grammar.ts#isClassLike`/`isFunctionLike` ya usa,
 *      nunca un nombre de nodo tipo `pair`) cuyo VALOR (nunca la clave) es,
 *      normalizado, el propio nombre de la clase (`class_name: 'Folder'`,
 *      `class_name: :Comment`). Restringir a la forma par clave/valor (no
 *      cualquier string suelto del miembro) es lo que separa "esto declara
 *      una asociación tipada por nombre" de "esta llamada menciona el nombre
 *      de la clase por cualquier otro motivo" (un mensaje de error, un log).
 *
 * NORMALIZACIÓN COMPARTIDA (`normalize`) para AMBOS lados de la comparación
 * (el nombre de la clase Y el texto candidato): quita comillas (`'Folder'`/
 * `"Folder"`), quita el sigilo `:` de un símbolo Ruby (`:Comment` ->
 * `Comment`), y se queda con el ÚLTIMO segmento tras `::` — así
 * `Tags::System` (el literal, cuando la clase vive dentro de `module Tags`)
 * y `System` (el nombre de la propia clase, sin el módulo envolvente) se
 * leen como el MISMO tipo sin reconstruir la ruta de módulos anidados.
 * Confirmado contra los 4 modelos reales de Rails con este vocabulario
 * (verificación a mano, ver el informe de la tarea): `Folder`
 * (`class_name: 'Folder'`), `Hookable` (`class_name: 'Hookable'`), `Comment`
 * (`class_name: :Comment`, símbolo — no string), `Tags::System`
 * (`class_name: 'Tags::System'`, la clase vive en `module Tags`). Dos casos
 * declarados SIN cerrar (falsos negativos, no inventados para forzar
 * recall): `Tag` (el árbol es un self-join MUCHOS-A-MUCHOS vía un modelo
 * `Tags::Relation` intermedio — ningún `class_name` literal dentro de
 * `tag.rb` nombra `'Tag'`) y `Tags::Relation` (no es en sí autorreferencial:
 * sus dos `belongs_to` apuntan a `Tag`, no a sí mismo — correctamente NO
 * detectado, la duplicación real vive un nivel arriba).
 *
 * PRESENCIA, NO MAGNITUD (mismo criterio que `homonymous-delegation.ts`/
 * `inheritance-family.ts`): UN solo miembro autorreferencial ya es la forma
 * cruda que vale la pena que `hypotheses/composite.ts` clasifique — la
 * `presencia(...)` de abajo (R3 — antes `pisoDeclarado(1, ...)`) no inventa
 * un umbral de magnitud: declara que la pregunta es binaria.
 *
 * UN FINDING POR CLASE, NO POR MIEMBRO: si una clase tiene varios miembros
 * autorreferenciales (`Folder` tiene `parent` Y `children`), se agrupan en
 * UN solo `Finding` con una `location` por miembro — mismo reparto que
 * `inheritance-family.ts` (un finding por base, no uno por subclase): evita
 * ruido de findings redundantes sobre la misma clase y le da a
 * `hypotheses/composite.ts` más de un `site` para trabajar.
 *
 * LÍMITE DECLARADO — GO: `needs: ["unidad-tipo-clase"]` (== `sets.classNodes
 * .size > 0`, `detect/capabilities.ts`) reporta `no-aplicable` ahí en vez de
 * "corrió y no encontró nada": Go's `type_declaration` no tiene campo `body`
 * en esta gramática (ver el docstring de `code-grammar.ts`, sección Go), así
 * que `sets.classNodes` deriva VACÍO y la capacidad nunca está presente —
 * mismo límite estructural ya declarado por
 * `inheritance-family.ts`/`large-class.ts`/`refused-bequest.ts`, ahora
 * expresado por el mecanismo correcto (capacidad de lenguaje), no un
 * defecto propio.
 *
 * SE CONFUNDE CON (declarado): un campo que simplemente CITA el nombre de su
 * propia clase por una razón no estructural — un valor por defecto, un
 * mensaje de error armado con el nombre del tipo — puede colar como falso
 * positivo del camino 2 si esa cita ocurre DENTRO de la forma par clave/valor
 * (p.ej. `log_prefix: 'Folder'` sin relación con un árbol). El detector no
 * puede distinguir "este valor declara el tipo del miembro" de "este valor
 * simplemente coincide con el nombre de la clase" — sólo reporta la
 * coincidencia estructural exacta, que `hypotheses/composite.ts` combina con
 * el resto de la escalera antes de ofrecer una confianza.
 *
 * ARREGLO MEDIDO SOBRE EL CORPUS (frente de precisión, 8 lenguajes) — el
 * SESGO DE CORPUS más puro de todo el proyecto: este detector debutó 6 de 6
 * verdaderos, medido SÓLO sobre Ruby y TypeScript. Medido de nuevo sobre
 * guava (Java, 1.971 archivos): 178 hallazgos `self-referential-member`
 * (Composite: ausente) — el 39% del corpus entero — y de 5 verificados a
 * mano, 0 verdaderos. 4 de 5 son EXACTAMENTE `public static final X INSTANCE
 * = new X();` — el modismo Singleton de Java, no una recursión de árbol. La
 * causa: el camino 1 (tipado) exigía sólo "un miembro cuyo tipo es el propio
 * tipo", sin distinguir CAMPO DE INSTANCIA (uno por objeto, lo que Composite
 * necesita) de CONSTANTE ESTÁTICA (una sola, compartida por la clase, sin
 * participar de ningún árbol). Arreglo: `hasStaticModifier` excluye el
 * camino 1 cuando el miembro lleva `static` — sigue siendo una pregunta
 * ESTRUCTURAL (el modificador `static` de la gramática del lenguaje, nunca
 * un nombre de dominio/framework), y el camino 2 (Ruby/dinámico, sin
 * concepto de `static` en esta forma) queda intacto porque ya estaba
 * verificado correcto sobre Ruby. Ver `self-referential-member.test.ts` para
 * el caso Singleton (excluido) junto al de instancia real (`children`/
 * `parent`, sigue detectado).
 *
 * ARREGLO (Ola N, frente A5b) — GENÉRICOS INSTANCIADOS CON OTRO PARÁMETRO DE
 * TIPO (fluent/vista/serialización, no contención): falso medido y con causa
 * escrita en la planilla de veredictos —
 * `Src/Newtonsoft.Json/Linq/IJEnumerable.cs:44`: `IJEnumerable<T>` declara un
 * indexador que devuelve `IJEnumerable<JToken>` — la MISMA interfaz
 * genérica, pero instanciada con OTRO parámetro de tipo (`JToken`, no `T`) —
 * "no es una relación de contención árbol/composite" (nota de la planilla).
 * Confirmado el mismo patrón, medido sobre guava (Java): `RegularImmutable-
 * BiMap<K,V>.inverse` es `RegularImmutableBiMap<V,K>` (parámetros
 * INVERTIDOS, la vista inversa de un bimap), `SingletonImmutableBiMap<K,V>
 * .inverse` ídem, `ImmutableSetMultimap<K,V>`/`ImmutableListMultimap<K,V>`
 * declaran DOS miembros así: `deserializationReplacement` tipado
 * `<?, ?>` (comodines, no `<K,V>`) e `inverse` tipado `<V,K>` (invertido) —
 * los cuatro son vistas/soporte de serialización de la MISMA clase, nunca un
 * hijo de árbol. Camino 1 exigía sólo "algún nodo del subárbol del tipo es,
 * normalizado, el propio nombre de clase" — sin mirar los ARGUMENTOS de tipo
 * cuando ese nombre es el CABEZAL de una instanciación genérica, así que
 * `IJEnumerable<JToken>`/`RegularImmutableBiMap<V,K>` calzaban igual que
 * `Folder<T>` dentro de `class Folder<T>` (una instanciación genuina de SÍ
 * MISMO con su propio parámetro). Arreglo: `classTypeParamNames` lee el
 * campo `type_parameters` de la clase — confirmado por sonda directa
 * UNIFORME en las 3 gramáticas tipadas (TypeScript/Java/C#, pese a que el
 * nodo hijo se llama distinto en cada una: `type_parameter_list` en C#,
 * `type_parameters` en Java/TS — el NOMBRE DE CAMPO es el mismo en las 3).
 * Cuando el nodo que calza con el propio nombre es el CABEZAL de una
 * instanciación genérica (`generic_type` en Java/TS, `generic_name` en C# —
 * confirmado por sonda, ninguno de los dos expone el hijo de argumentos vía
 * `childForFieldName`, así que `findTypeArgsChild` lo busca por TIPO de nodo:
 * `type_arguments` Java/TS, `type_argument_list` C#, mismo mecanismo de
 * "fallback por nombre" que `code-grammar.ts` ya documenta para casos donde
 * el campo no alcanza), sólo cuenta si los argumentos son EXACTAMENTE los
 * propios parámetros de tipo de la clase, en el MISMO orden — cualquier otra
 * instanciación (comodín, tipo concreto, orden invertido) es una vista o
 * transformación del mismo tipo genérico, no una relación de contención.
 * Ver `self-referential-member.test.ts` para el caso excluido (parámetros
 * distintos) junto al control positivo (mismo parámetro, sigue detectado:
 * `Box<T>` dentro de `class Box<T>` no debe dejar de dispararse).
 *
 * EVIDENCIA (Ola N, frente A5b) — 12 de 26 juicios de la planilla cayeron en
 * "dudoso", casi todos con la MISMA nota: "no verificado/no confirmado por
 * tiempo" (`MinMaxPriorityQueue.Heap.otherHeap`, `UnmodifiableNavigableSet
 * .descendingSet`, `ImmutableSortedMap.descendingMap`, `JToken` con 9
 * miembros…) — el juez no tenía forma de saber, sin abrir el archivo, si un
 * miembro autorreferencial es una COLECCIÓN (`children: Folder[]`, señal
 * fuerte de árbol) o un escalar (`parent`/vista cacheada/gemelo — ambiguo
 * incluso para un humano). El hallazgo ya listaba los NOMBRES de los
 * miembros pero no su TIPO declarado. Arreglo: `SelfReferentialHit#typeText`
 * lleva el texto del tipo (vía `tipado`) hasta el `role`/`detail` del
 * `Finding` — un futuro juez ve `"children" (Folder[])` vs `"otherHeap"
 * (Heap)` sin abrir el archivo. No resuelve la ambigüedad semántica (sigue
 * sin inferencia de tipos), pero es evidencia que antes no estaba, la brecha
 * que la planilla señaló repetidas veces.
 */
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "members";

/** Único id de `kind` de este detector — importado por
 *  `hypotheses/composite.ts` para reconocer este ancla sin duplicar el
 *  literal (y sin que `hypotheses/*` invente su propio vocabulario de
 *  `detect/*`). */
export const SELF_REFERENTIAL_MEMBER_KIND = "self-referential-member" as const;

/**
 * Quita comillas (`'Folder'`/`"Folder"`), el sigilo `:` de un símbolo Ruby
 * (`:Comment` -> `Comment`), y se queda con el ÚLTIMO segmento tras `::`
 * (`Tags::System` -> `System`) — la MISMA normalización para el nombre de la
 * clase y para el texto candidato, ver el docstring del módulo.
 */
function normalize(text: string): string {
  const stripped = text.trim().replace(/^:/, "").replace(/^['"]|['"]$/g, "");
  const segments = stripped.split("::");
  return (segments[segments.length - 1] ?? "").trim();
}

/**
 * Java (`modifiers`, un nodo por CAMPO que agrupa TODAS sus palabras clave
 * como hijos anónimos) y C# (`modifier`, un nodo POR palabra) — el propio
 * TEXTO del nodo alcanza para ambos formatos sin tener que descender un
 * nivel más y distinguir cuál de los dos es: partir por espacio y buscar
 * "static" exacto encuentra la palabra tanto en "public static final"
 * (Java, un solo nodo) como en "static" a secas (C#, un nodo por palabra).
 */
const MODIFIER_WRAPPER_NODE_TYPES = new Set(["modifiers", "modifier"]);

/**
 * ¿Este miembro (una declaración de campo) lleva el modificador `static`?
 * Sólo mira los hijos DIRECTOS del propio miembro — nunca desciende al
 * inicializador — para no confundir un `static` real con la palabra
 * apareciendo, por accidente, dentro del valor asignado. Tres formas
 * confirmadas por sonda directa contra las 3 gramáticas tipadas que el
 * camino 1 soporta (Java/C#/TypeScript): Java agrupa todos los modificadores
 * de un campo en UN nodo `modifiers`; C# da a cada modificador su propio
 * nodo `modifier`; TypeScript no envuelve nada — `static` es un hijo
 * anónimo DIRECTO del miembro mismo (`public_field_definition`), sin nodo
 * contenedor en absoluto.
 *
 * POR QUÉ IMPORTA (el hueco que esto cierra, medido sobre guava): en Java,
 * "campo cuyo tipo es el propio tipo que lo declara" es, ante todo, el
 * modismo Singleton — `public static final Folder INSTANCE = new
 * Folder();` — no un hijo de árbol de Composite. La diferencia estructural
 * entre "constante estática compartida por la clase" y "campo de INSTANCIA
 * que cada objeto lleva el suyo" es exactamente el modificador `static`: un
 * Composite real reparte 'uno' y 'muchos' por objeto (`this.children`, un
 * campo de instancia); una constante estática es UNA sola, compartida por
 * la clase entera, y no participa de ningún árbol en tiempo de ejecución.
 * Verificado a mano contra 5 hallazgos reales de guava: 4 son exactamente
 * este modismo (`public static final X INSTANCE = new X();`), 0
 * verdaderos.
 */
function hasStaticModifier(member: AstNode): boolean {
  for (let i = 0; i < member.childCount; i++) {
    const child = member.child(i) as AstNode | null;
    if (!child) continue;
    if (child.type === "static") return true; // TypeScript: hijo anónimo directo, sin envoltorio.
    if (MODIFIER_WRAPPER_NODE_TYPES.has(child.type) && child.text.split(/\s+/).includes("static")) return true;
  }
  return false;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/**
 * ARREGLO (silencio, no falso positivo): a diferencia de Java (que expone
 * "type" directo en `field_declaration`, sólo "name" vive un salto más
 * adentro) y TypeScript/Ruby (sin desenvolvimiento en absoluto), C# no
 * expone NI "type" NI "name" directo en `field_declaration` — un campo
 * simple (`private Folder parent;`, sin llegar a modismo Singleton) vive
 * DOS saltos más adentro: un `variable_declaration` POSICIONAL (sin nombre
 * de campo en absoluto — confirmado por sonda directa: ninguno de sus dos
 * hijos, ni él mismo dentro de `field_declaration`, tiene un `fieldName`
 * asociado) que envuelve un `variable_declarator`, también posicional. Sin
 * este desenvolvimiento, TODO campo simple de C# (a diferencia de una
 * PROPIEDAD, `property_declaration`, que sí expone "type"/"name" directos y
 * ya funcionaba) quedaba invisible para el camino 1 — ni falso positivo ni
 * falso negativo por el modismo Singleton: silencio estructural total sobre
 * la forma de campo más común de C#. Buscar por TIPO de nodo
 * (`variable_declaration`/`variable_declarator`), nunca por nombre de
 * dominio: es la gramática de C#, no una convención de framework.
 */
function csharpFieldShape(member: AstNode): { typeNode: AstNode | null; nameNode: AstNode | null } {
  for (const child of namedChildren(member)) {
    if (child.type !== "variable_declaration") continue;
    const typeNode = child.childForFieldName("type") as AstNode | null;
    const declarator = namedChildren(child).find((c) => c.type === "variable_declarator") ?? null;
    const nameNode = declarator ? (namedChildren(declarator)[0] ?? null) : null;
    return { typeNode, nameNode };
  }
  return { typeNode: null, nameNode: null };
}

/** Camino 1 (tipado): ¿algún nodo del subárbol de `typeNode` es, normalizado,
 *  exactamente el propio nombre de la clase? Ver el docstring del módulo
 *  para por qué un wrapper (arreglo/genérico/unión) no puede calzar por
 *  accidente. */
/**
 * ARREGLO (medido sobre guava): ¿es `n` una referencia CALIFICADA
 * (`Externo.Interno`, un "." anónimo entre dos identificadores)? Estructural
 * — un hijo anónimo cuyo texto es exactamente "." — nunca por nombre de
 * nodo (`scoped_type_identifier` es el que confirma la sonda para Java,
 * pero esta prueba generaliza a cualquier gramática con la misma forma:
 * hijo-hijo-punto, sin necesitar reconocer el tipo de nodo).
 *
 * POR QUÉ IMPORTA: `Builder`/`Node`/`Entry`/`Iterator`… son nombres de clase
 * ANIDADA extremadamente comunes — cada colección inmutable de guava trae
 * su PROPIO `Builder` anidado. Sin este chequeo, un campo de
 * `ImmutableMultimap.Builder` cuyo tipo es `Map<K, ImmutableCollection.
 * Builder<V>>` — una referencia CALIFICADA a un `Builder` de OTRA clase
 * (`ImmutableCollection`), sin relación con `ImmutableMultimap.Builder` —
 * matcheaba por el simple nombre "Builder" del último segmento, dando un
 * falso positivo de autorreferencia entre dos clases anidadas DISTINTAS que
 * sólo comparten el nombre. Verificado a mano contra guava: 6 de 71
 * hallazgos post-arreglo-Singleton citaban "Builder", con exactamente esta
 * forma calificada.
 */
function isQualifiedReference(n: AstNode): boolean {
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c && !c.isNamed && c.text === ".") return true;
  }
  return false;
}

/**
 * Campo de la CLASE que lleva su propia lista de parámetros de tipo —
 * confirmado UNIFORME por sonda directa en las 3 gramáticas tipadas
 * soportadas por el camino 1 (TypeScript/Java/C#): `childForFieldName
 * ("type_parameters")` resuelve en `class_declaration` (Java/TS) Y en
 * `interface_declaration`/`class_declaration` de C# — pese a que el propio
 * nodo hijo se llama distinto en cada gramática (`type_parameters` en
 * Java/TS, `type_parameter_list` en C#): el NOMBRE DE CAMPO es estable, así
 * que no hace falta bifurcar por lenguaje acá.
 */
const CLASS_TYPE_PARAMS_FIELD = "type_parameters";

/**
 * Nodo hijo que lleva los argumentos de una instanciación genérica
 * (`<V, K>` en `RegularImmutableBiMap<V, K>`) — a diferencia de los
 * parámetros de la CLASE (campo uniforme, arriba), este NO tiene un nombre
 * de campo uniforme: confirmado por sonda directa que Java/TypeScript lo
 * exponen como campo `type_arguments` sobre `generic_type`, pero C# NO
 * expone ningún campo para el `type_argument_list` de su `generic_name` (ni
 * `type_arguments` ni `type_argument_list` resuelven vía
 * `childForFieldName` ahí) — mismo mecanismo de "fallback por nombre de
 * nodo" que `code-grammar.ts` ya documenta para casos donde el campo no
 * alcanza (p.ej. `TERNARY_NAME`), nunca vocabulario de dominio.
 */
const TYPE_ARGS_NODE_TYPE = /^type_arguments$|^type_argument_list$/;

/** Los nombres de parámetro de tipo propios de una clase/interfaz (`["K", "V"]`
 *  para `class Foo<K, V>`), en el orden declarado — `[]` si la clase no es
 *  genérica (Ruby, la mayoría de las clases TS/Java/C#, y cualquier gramática
 *  sin este campo). Cada `type_parameter` se normaliza por su PRIMER hijo
 *  nombrado (el identificador puro) para no arrastrar una cota (`T extends
 *  Foo`) dentro de la comparación posicional de abajo. */
function classTypeParamNames(classNode: AstNode): string[] {
  const params = classNode.childForFieldName(CLASS_TYPE_PARAMS_FIELD) as AstNode | null;
  if (!params) return [];
  return namedChildren(params).map((p) => {
    const inner = namedChildren(p)[0] ?? p;
    return normalize(inner.text);
  });
}

/** Los nombres de los argumentos de tipo de una instanciación genérica ya
 *  localizada (`["V", "K"]` para `<V, K>`), en el orden escrito — misma
 *  normalización que el resto del módulo. */
function genericArgNames(argsNode: AstNode): string[] {
  return namedChildren(argsNode).map((a) => normalize(a.text));
}

/** ¿`n` es el nodo hijo de argumentos de tipo de una instanciación genérica
 *  (`findTypeArgsChild` lo busca por TIPO, ver `TYPE_ARGS_NODE_TYPE`)? Busca
 *  entre los hijos NOMBRADOS directos — nunca desciende, un `generic_type`
 *  anidado más adentro tiene su PROPIO hijo de argumentos, no éste. */
function findTypeArgsChild(n: AstNode): AstNode | null {
  for (const c of namedChildren(n)) {
    if (TYPE_ARGS_NODE_TYPE.test(c.type)) return c;
  }
  return null;
}

function typedSelfReference(typeNode: AstNode, ownName: string, classTypeParams: readonly string[]): boolean {
  let found = false;
  const visit = (n: AstNode): void => {
    if (found) return;
    // Una referencia calificada nunca cuenta — ver el docstring de
    // `isQualifiedReference` — y tampoco se desciende dentro de ella: el
    // simple nombre de su último segmento pertenece a OTRA clase, no a la
    // que se está evaluando.
    if (isQualifiedReference(n)) return;

    const argsNode = findTypeArgsChild(n);
    if (argsNode) {
      // `n` es el CABEZAL de una instanciación genérica (`Foo<...>`) — su
      // otro hijo nombrado (el que NO es el nodo de argumentos) es el
      // identificador que se está instanciando.
      const head = namedChildren(n).find((c) => c !== argsNode);
      if (head && normalize(head.text) === ownName) {
        // GENÉRICOS INSTANCIADOS CON OTRO PARÁMETRO DE TIPO — ver el
        // docstring del módulo (IJEnumerable<JToken>/RegularImmutableBiMap
        // <V,K>): sólo cuenta como autorreferencia real si los argumentos
        // son EXACTAMENTE los propios parámetros de tipo de la clase, en el
        // MISMO orden (`Box<T>` dentro de `class Box<T>`) — cualquier otra
        // instanciación (comodín `<?, ?>`, tipo concreto, orden invertido)
        // es una vista/transformación del mismo tipo genérico, nunca se
        // desciende dentro de ella (el simple nombre de un argumento, p.ej.
        // "K" o "JToken", no es el nombre de la propia clase de todos modos).
        const argNames = genericArgNames(argsNode);
        if (classTypeParams.length > 0 && argNames.length === classTypeParams.length && argNames.every((a, i) => a === classTypeParams[i])) {
          found = true;
        }
        return;
      }
      // No es el propio nombre instanciándose (p.ej. `List<Folder>`, donde
      // el cabezal es "List") — cae al chequeo de abajo (no calza el nodo
      // entero) y recorre TODOS los hijos, incluido `argsNode`, para seguir
      // encontrando el propio nombre como ARGUMENTO de otro genérico.
    }

    if (normalize(n.text) === ownName) {
      found = true;
      return;
    }
    for (const c of namedChildren(n)) visit(c);
  };
  visit(typeNode);
  return found;
}

/** Camino 2 (sin tipos): ¿algún par clave/valor genérico DENTRO de `member`
 *  tiene un VALOR (nunca la clave) que, normalizado, es exactamente el propio
 *  nombre de la clase? */
function pairValueSelfReference(member: AstNode, ownName: string): boolean {
  let found = false;
  const visit = (n: AstNode): void => {
    if (found) return;
    const key = n.childForFieldName("key") as AstNode | null;
    const value = n.childForFieldName("value") as AstNode | null;
    if (key && value && normalize(value.text) === ownName) {
      found = true;
      return;
    }
    for (const c of namedChildren(n)) visit(c);
  };
  visit(member);
  return found;
}

interface SelfReferentialHit {
  member: AstNode;
  memberName: string | null;
  via: "tipado" | "literal";
  /** Texto del tipo declarado (vía `tipado` únicamente, p.ej. `"Folder[]"`,
   *  `"Heap"`, `"List<Folder>"`) — evidencia para que un juez distinga una
   *  COLECCIÓN (señal fuerte de árbol) de un escalar (ambiguo: parent/vista/
   *  gemelo) sin abrir el archivo, ver el docstring del módulo ("EVIDENCIA"). */
  typeText: string | null;
}

function findSelfReferentialMembers(
  file: FileUnit,
  classNode: AstNode,
  bodyNode: AstNode,
  ownName: string,
  classTypeParams: readonly string[],
): SelfReferentialHit[] {
  const hits: SelfReferentialHit[] = [];
  for (const member of namedChildren(bodyNode)) {
    // Nunca dentro de un método/función propio (uso normal, no declaración de
    // miembro) ni de una clase anidada (se evalúa por su cuenta en otra
    // pasada del walk exterior).
    if (file.sets.functionNodes.has(member.type) || file.sets.classNodes.has(member.type)) continue;

    const directType = member.childForFieldName("type") as AstNode | null;
    // Sólo se busca la forma de C# (dos saltos posicionales) cuando el
    // campo directo no resolvió — Java/TS ya resuelven acá, y Ruby (sin
    // campo "type" en absoluto) nunca tiene un `variable_declaration` hijo,
    // así que esto es gratis (recorre y no encuentra nada) para los otros 3.
    const csharpShape = directType ? null : csharpFieldShape(member);
    const typeField = directType ?? csharpShape?.typeNode ?? null;
    let via: "tipado" | "literal" | null = null;
    if (typeField) {
      // `static` excluido a propósito, sólo en el camino tipado: el modismo
      // Singleton de Java/C#/TS (`static final X INSTANCE = new X()`) es una
      // constante ÚNICA compartida por la clase, no un campo de instancia
      // que cada objeto lleva el suyo — ver el docstring de
      // `hasStaticModifier` para la medición completa (4 de 5 hallazgos
      // reales de guava eran exactamente este modismo).
      if (typedSelfReference(typeField, ownName, classTypeParams) && !hasStaticModifier(member)) via = "tipado";
    } else if (pairValueSelfReference(member, ownName)) {
      via = "literal";
    }
    if (!via) continue;

    // "name" directo (TypeScript/Ruby-como-camino-2); si no, el "declarator"
    // de Java (`variable_declarator`, un salto adentro); si no, la forma
    // posicional de C# ya resuelta arriba (`csharpShape`).
    const memberName =
      (member.childForFieldName("name") as AstNode | null)?.text ??
      ((member.childForFieldName("declarator") as AstNode | null)?.childForFieldName("name") as AstNode | null)?.text ??
      csharpShape?.nameNode?.text ??
      null;
    hits.push({ member, memberName, via, typeText: via === "tipado" ? (typeField?.text ?? null) : null });
  }
  return hits;
}

export const detector: IntraFileDetector<ThresholdKey, "self-referential-member"> = {
  id: "self-referential-member",
  kind: SELF_REFERENTIAL_MEMBER_KIND,
  scope: "intra-file",
  title: "Miembro cuyo tipo es el propio tipo que lo declara",
  // "unidad-tipo-clase" == `sets.classNodes.size > 0` (`detect/capabilities.ts`)
  // — exactamente lo que Go carece (`type_declaration` no expone `body` en
  // esta gramática, ver code-grammar.ts sección Go): mecanismo 1 de
  // `DetectorBase` (capacidad de lenguaje), preferido sobre `silentIn`
  // (último recurso) porque la ausencia es de CAPACIDAD, no de forma.
  needs: ["unidad-tipo-clase"],
  thresholds: {
    members: presencia({
      rationale:
        "un solo miembro autorreferencial (campo o colección cuyo tipo es el propio tipo que lo declara) ya es la forma estructural cruda de un árbol implícito — la magnitud y el estado exacto los decide hypotheses/composite.ts con su propia escalera, no este umbral.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("members");
    const findings: RawFinding[] = [];

    walkTree(file.root, (node) => {
      if (!node.isNamed || !file.sets.classNodes.has(node.type)) return;
      const classNode = node as AstNode;
      const nameNode = classNode.childForFieldName("name") as AstNode | null;
      const bodyNode = classNode.childForFieldName("body") as AstNode | null;
      if (!nameNode || !bodyNode) return;
      const ownName = normalize(nameNode.text);
      if (!ownName) return;

      const classTypeParams = classTypeParamNames(classNode);
      const hits = findSelfReferentialMembers(file, classNode, bodyNode, ownName, classTypeParams);
      if (hits.length < threshold.value) return;

      const sorted = [...hits].sort((a, b) => a.member.startPosition.row - b.member.startPosition.row);
      // EVIDENCIA (ver docstring del módulo): cada miembro se muestra CON su
      // tipo declarado (`"children": Folder[]`), no sólo el nombre — la
      // brecha que la planilla de veredictos señaló repetidas veces ("no
      // verifiqué cada uno", "no confirmado por tiempo") era exactamente
      // esta: sin el tipo, un juez no puede distinguir a simple vista una
      // COLECCIÓN (señal fuerte de árbol) de un escalar (ambiguo).
      const memberList = sorted.map((h) => `"${h.memberName ?? "(miembro)"}"${h.typeText ? `: ${h.typeText}` : ""}`).join(", ");

      findings.push({
        title: `"${ownName}" declara ${sorted.length} miembro(s) cuyo tipo es el propio tipo "${ownName}"`,
        detail:
          `"${ownName}" tiene ${sorted.length} miembro(s) (${memberList}) cuyo tipo — directo, o envuelto en un arreglo/colección — ` +
          `es "${ownName}" mismo: un árbol/grafo autorreferencial real, no una duplicación de texto entre archivos (el ancla que ` +
          "Composite ya sabía usar). Esto no es un problema en sí mismo: es la evidencia estructural cruda de que este tipo puede " +
          "necesitar tratar 'uno' y 'muchos' de forma uniforme — la clasificación exacta (ya aplicado, ad hoc, o ausente) la hace " +
          "hypotheses/composite.ts, no este detector.",
        trigger: [{ label: "miembros autorreferenciales", value: sorted.length, threshold }],
        locations: sorted.map(
          (h): RoleLocation => ({
            file: file.path,
            startLine: h.member.startPosition.row + 1,
            endLine: h.member.endPosition.row + 1,
            symbol: ownName,
            role: `miembro "${h.memberName ?? "?"}"${h.typeText ? `: ${h.typeText}` : ""} (${h.via}) cuyo tipo es el propio tipo "${ownName}"`,
          }),
        ) as [RoleLocation, ...RoleLocation[]],
        severity: 15,
        advice: {
          primary: {
            name: "Confirm self-referential type is Composite-shaped",
            kind: "patron_de_diseno",
            why:
              "Un tipo con un miembro (campo o colección) de su propio tipo es, estructuralmente, un árbol implícito — la mitad " +
              "de un Composite ya aplicado, ad hoc, o todavía ausente. Confirmar si 'uno' y 'muchos' ya comparten una interfaz, " +
              "o si cada operación distingue el caso hoja del caso compuesto a mano.",
            source: "https://refactoring.guru/design-patterns/composite",
          },
        },
      });
    });

    return findings;
  },
};
