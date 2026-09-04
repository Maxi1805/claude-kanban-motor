/**
 * `unused-symbol` — símbolo declarado que NADIE usa, medido sobre el grafo de
 * código (PLAN.md §4.1 catálogo; `inter-file`, `needsGraph: true`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OLA O — LA REESCRITURA DE LA DEFINICIÓN, Y POR QUÉ HIZO FALTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este detector entró a la Ola O como el **#1 del ranking de ruido**: 2.348 de
 * volumen, **2 % de precisión (n=41)**, 2.291 de ruido — el 18 % del ruido de
 * todo el corpus — y como causa medida de que `ranking-acceptance` esté rojo
 * (dominaba más del 25 % del top-200 en jekyll, lodash y preact).
 *
 * La medición de esta ola (`scripts/n1-unused-symbol-probe.mts`, pipeline real)
 * explicó por qué. El detector NO emitía 2.348 hallazgos: emitía **~28.000
 * candidatos** y su propio `presupuesto(200)` por repo los recortaba. guava sola
 * producía **21.587**. Y de esos 21.587, **21.273 (98,5 %) eran MIEMBROS**
 * (`toString` ×616, `equals` ×371, `hashCode` ×384, `size` ×330, `iterator`
 * ×293…). El mismo perfil en todos los repos: newtonsoft-json 1.134/1.134
 * miembros, hugo 734/734, nest 2.186/2.462.
 *
 * ── LA RAÍZ, CITADA DEL CÓDIGO QUE LA PRODUCÍA ─────────────────────────────
 *
 * Un miembro se llama `receptor.miembro(...)`. `graph/references.ts` clasifica
 * ese sitio con `role: "receiver-member"`, y hasta la Ola P
 * `graph/resolve.ts#syntacticRoleStage` lo RECHAZABA salvo que el receptor
 * fuera un `qualifierIsBareConstant`:
 *
 *     if (role === "receiver-member") {
 *       if (qualifierIsBareConstant) return { outcome: "pass" };
 *       return { outcome: "reject", why: "receptor explícito no-constante — sin tipos, la arista no se emite" };
 *     }
 *
 * Y `qualifierIsBareConstant` sólo puede ser `true` **en UNA de las nueve
 * gramáticas**. Cita textual del docstring de `graph/references.ts`, que lo
 * verificó por parse directo de las nueve: *"Only ONE of the 9 supported
 * grammars gives a receiver/qualifier a DIFFERENT NODE TYPE when it is a bare
 * capitalized name: Ruby's own lexer… The other 8 grammars were checked the
 * same way and do NOT offer this for free… `qualifierIsBareConstant` is
 * `receiver.type === "constant"` — true only where Ruby's own grammar already
 * drew the line, `false` everywhere else, on all 8 other languages"*. La etapa
 * `class-member` cierra la otra puerta: un método tampoco se resuelve por
 * nombre desnudo, salvo — otra vez — en Ruby.
 *
 * **Consecuencia, y era estructural, no de umbral: en 8 de los 9 lenguajes
 * soportados NINGUNA llamada a un miembro producía arista.** Por lo tanto
 * "fan-in 0" sobre un miembro no medía que nadie lo use: medía que el grafo no
 * podía verlo. Verificado a mano contra el corpus en la Ola O — de los
 * candidatos que sobrevivían TODOS los filtros previos, `ReadForTypeAndAssert`
 * (3 apariciones textuales), `BuildPath` (5), `call_on_close` (13),
 * `write_metadata` (10), `docs_to_write` (9)… todos genuinamente usados.
 *
 * ── OLA P: LA RAÍZ ESTÁ CERRADA, Y ESTE DETECTOR ES EL PRIMER BENEFICIARIO ──
 *
 * `graph/resolve.ts` ya no rechaza ese caso: lo emite como arista
 * `provenance: "ambiguous"` con los destinos posibles en `alternatives`
 * (etapa `typeless-receiver`). Para este detector eso cambia dos cosas, y las
 * dos EN LA MISMA DIRECCIÓN — más información, no un umbral más alto:
 *
 *   - La PUERTA 1 (`unattributedUse`) pasa a ver los usos de miembro que
 *     antes no existían: un símbolo al que alguien llama `x.foo(...)` en
 *     cualquier parte del repo ya NO se reporta como "sin consumidores",
 *     aunque el grafo siga sin poder decir que ese `x` es de su clase. Menos
 *     falsos, y por la razón correcta.
 *   - La PUERTA 3 (`memberUseSeenIn`) **NO se abre con ellas, y eso se
 *     decidió midiendo**. La predicción que este mismo archivo tenía escrita
 *     era que la puerta se abriría sola en los nueve lenguajes; se probó, y
 *     lo que agrega es ruido casi puro (28/28 falsas en click, 23/23 en
 *     preact, 19/19 en el `JContainer.cs` de newtonsoft-json, todas revisadas
 *     a mano). El motivo está en el bucle de aristas, con la causa raíz
 *     medida: la puerta pregunta POR LENGUAJE y la evidencia nueva es POR
 *     SITIO, y además `graph/build.ts#twinFilesForScope` impide que en
 *     C#/Java se construya siquiera el candidato de una llamada cruzada
 *     dentro del mismo namespace.
 *
 * O sea: toda la ganancia entra por la PUERTA 1, y es grande y de un solo
 * signo — la diferencia entre "no hay consumidor" y "no vi al consumidor",
 * que es la distinción que este detector no podía hacer.
 *
 * ── LA DEFINICIÓN NUEVA ────────────────────────────────────────────────────
 *
 * > Un fan-in de cero sólo es evidencia de "nadie lo usa" cuando la cascada de
 * > resolución PODRÍA haber visto una referencia a ESE símbolo. Donde no
 * > podría, el detector no afirma nada.
 *
 * De ahí salen las cinco puertas de abajo. Ninguna es un umbral de volumen:
 * cada una nombra una razón concreta por la que el cero no es una medición.
 *
 *  1. **USO VISTO PERO NO ATRIBUIBLE** (`unattributedUse`). Si una arista de
 *     consumo AMBIGUA (`provenance: "ambiguous"`, CONTRATO-F9.md §4.1) nombra
 *     al símbolo — como `to` o dentro de `alternatives` — la cascada VIO un uso
 *     y sólo no supo cuál de los N destinos era. Hasta la Ola O el detector
 *     filtraba esas aristas con `confidentEdges` y con eso **fabricaba** el
 *     fan-in cero. Medido entonces: hasta el 13,7 % de los candidatos de
 *     preact. Desde la Ola P esta puerta es además el destino natural de las
 *     ambiguas nuevas de `typeless-receiver` (todo `x.miembro(...)`).
 *
 *  2. **NOMBRE NO DISTINGUIBLE** (`declarationsByName`). Si otro símbolo del
 *     repo declara el MISMO nombre final, la cascada no puede atribuir un uso a
 *     ÉSTE en vez de a su homónimo: `SymbolRef` (`graph/stages.ts`) es sólo
 *     `{file, symbolPath}` — sin ordinal —, `symbolNodeId` colapsa los hermanos
 *     homónimos en un id canónico, y las etapas de la cascada resuelven por
 *     nombre. El cero del homónimo perdedor es un artefacto del desempate. Es
 *     el mismo fenómeno que `graph/resolve.ts` documenta desde el otro lado
 *     (`constructor` con 387 llamadores colapsados en uno solo). Medido:
 *     45–69 % de los candidatos, según el repo.
 *
 *  3. **MIEMBRO NO OBSERVABLE** (`memberUseSeenIn`). Un candidato que es
 *     miembro sólo se reporta si ESTA corrida acreditó al menos un uso con rol
 *     `receiver-member` en SU lenguaje (`edgeHasRole`). Derivado de la corrida,
 *     nunca de una lista de lenguajes escrita a mano — mismo patrón que
 *     `instantiationSeenIn`, y por el mismo motivo: una lista acá habría
 *     quedado vencida en cuanto `resolve.ts` cerrara la brecha. La brecha se
 *     cerró en la Ola P y **la puerta no se abrió con ella**: acreditarla con
 *     aristas AMBIGUAS se probó sobre dos árboles congelados y agrega ruido
 *     casi puro (ver el bucle de aristas, que trae los números y la causa
 *     raíz). Sólo acredita una arista de consumo con rol `receiver-member`
 *     cuyo destino la cascada supo ATRIBUIR. Donde esa señal no aparece, la
 *     puerta sigue callando: **no es un apagado, es la brecha del grafo,
 *     medida y declarada.**
 *
 *     OLA U — UNA arista en la que el sitio de uso está LÉXICAMENTE DENTRO
 *     del tipo que declara el miembro (`this.foo()`, `self.foo`, el
 *     `this.foo = x` del constructor) TAMPOCO abre esta puerta, y es el MISMO
 *     argumento que ya vale para las ambiguas, no uno nuevo: eso acredita que
 *     el OBJETO SE HABLA A SÍ MISMO, una pregunta distinta de la que hace la
 *     PUERTA 3 — "¿esta corrida sabe resolver `receptor.miembro()` HACIA OTRO
 *     OBJETO en este lenguaje?". Esas aristas siguen sumando fan-in
 *     normalmente (no tocan la PUERTA 1 ni el conteo de uso): sólo dejan de
 *     ser el testigo que habilita esta puerta para el resto de los miembros
 *     del lenguaje. La condición es ESTRUCTURAL (`crossesOwner`) y no el
 *     nombre de una etapa de resolución, y eso está medido a un costo
 *     concreto: la ola escribió primero `resolvedBy !== "self-receiver"` y
 *     la puerta se volvió a abrir en la misma ola por un segundo mecanismo de
 *     la misma forma (+282 hallazgos). El detalle, con los números por celda
 *     (kind, lenguaje), está en el docstring de `crossesOwner`.
 *
 *     QUÉ CUENTA COMO MIEMBRO: la FAMILIA DEL DUEÑO, no la profundidad de
 *     `symbolPath` — ver `isMemberOfType`, que documenta el caso medido (en C#
 *     el primer segmento es el namespace, así que con el criterio de
 *     profundidad TODA clase de C# contaba como miembro y esta puerta la
 *     callaba: newtonsoft-json quedaba en UN hallazgo).
 *
 *  4. **SUPERFICIE EXPUESTA** (`exposureOf`) — REBAJA DE CONFIANZA, no
 *     descarte. Un símbolo cuya propia sintaxis lo declara alcanzable desde
 *     fuera del repo (`public`/`protected`, o exportado por la regla de la
 *     especificación del lenguaje) no es verificable: sus consumidores pueden
 *     no estar en el repo analizado. Descartarlo se probó y dejaba java y
 *     csharp en UN hallazgo cada uno (ver `exposureOf`). Es la
 *     versión POR SÍMBOLO del heurístico de repo `libraryRatio`, que se
 *     conserva sólo para los símbolos donde el lenguaje NO da el dato — y ahí
 *     ya sólo como REBAJA DE CONFIANZA, nunca como supresión: suprimir dejaba
 *     al detector emitiendo SÓLO miembros (la única clase de símbolo cuyo uso
 *     el grafo no puede ver) en todo repo con forma de biblioteca, que es el
 *     100 % del corpus. Que la rebaja alcance está medido: de los 314
 *     candidatos de nivel superior de guava, los 15 juzgados a mano dieron
 *     FALSO y los 15 los descarta la PUERTA 2 sola, porque guava duplica su
 *     árbol entero bajo `android/` y cada uno tiene un gemelo homónimo.
 *
 *  5. **RELACIÓN DE TIPO ENTRANTE = USO** (`CONSUMER_EDGE_KINDS`). Antes de
 *     esta ola `extends`/`implements`/`satisfies`/`mixes-in` estaban excluidas
 *     a propósito ("una jerarquía muerta sigue siendo superficie a mantener").
 *     Pero el hallazgo AFIRMA, textualmente, *"Ningún archivo del repo
 *     referencia X"*, y con una subclase en el repo eso es sencillamente falso.
 *     Una jerarquía muerta entera es otro olor (y tiene otros detectores); este
 *     no puede comprarse su volumen mintiendo. Es además la única señal de
 *     nivel de TIPO que el grafo emite hoy, y este detector la estaba tirando.
 *
 * ── LO QUE SIGUE VIGENTE DE LAS OLAS ANTERIORES ────────────────────────────
 *
 * QUÉ CUENTA COMO USO — las cinco aristas "alguien ejecuta/nombra esto":
 * `references`, `calls` (`build.ts#partitionCandidatesByCallee` manda todo
 * candidato en posición de llamada a esta partición, así que una llamada
 * RESUELTA ya no produce `references`), `instantiates`
 * (`graph/edges/instanciacion.ts`), `invokes-indirect` y `carries`. `carries`
 * es la única arista que jamás apunta a un literal función/arrow sin nombre
 * (`portador.ts` sintetiza un nodo `<anon@N>` y `materializeCarrierFacts` le
 * cuelga SIEMPRE un `carries`): sin ella, todo callback anónimo — cuya
 * declaración ES su sitio de uso — mostraba fan-in 0 sin excepción posible.
 * Verificado esta ola: de los 41 candidatos `<anon@N>` juzgados en el corpus,
 * los 41 desaparecieron. `contains` sigue excluida (quien te declara no es
 * quien te usa; contarla apagaría el detector entero).
 *
 * DOS EXCLUSIONES POR ESPECIFICACIÓN DEL LENGUAJE, no por vocabulario:
 * `main` de nivel superior (punto de entrada invocado por el runtime del
 * sistema, nunca por el código analizado) y los métodos especiales de Python
 * (`__nombre__`, https://docs.python.org/3/reference/datamodel.html
 * #special-method-names — el intérprete los invoca por `==`, `len(x)`, `with`,
 * acceso a atributo…, jamás por un sitio de llamada con ese nombre).
 *
 * CONSTRUCTOR DE UNA CLASE USADA: `instanciacion.ts` resuelve `instantiates`
 * contra el nombre de la CLASE, nunca contra el símbolo anidado del
 * constructor, así que TODO constructor cuyo único uso es `ClassName.new(...)`
 * mostraba fan-in 0 por diseño del grafo. Ver `isConstructorLikeMember`.
 * LÍMITE DECLARADO: no sigue la cadena de herencia (un constructor heredado,
 * invocado sólo instanciando una subclase que no lo redeclara, sigue sin
 * arreglo).
 *
 * MIEMBRO APLANADO: `graph/symbols.ts#walk` sólo abre scope para nodos
 * `functionLike`/`classLike`, así que el método con nombre propio de un LITERAL
 * DE OBJETO (`export const detector = { run(repo, ctx) {…} }`) queda con
 * `symbolPath` de un solo segmento — top-level por construcción del grafo
 * aunque esté textualmente anidado. `flattenedContainersOf` lo detecta por
 * rango de líneas y lo trata como el miembro que es.
 *
 * HERMANO HOMÓNIMO (`@2`, `@3`, …): `graph/build.ts` colapsa las declaraciones
 * homónimas hermanas en un id canónico y toda arista apunta SIEMPRE a ese, así
 * que el duplicado muestra fan-in cero sin que eso signifique nada — se excluye
 * de la candidatura.
 *
 * JAVA — la etapa `path-proximity` (heurística, `provenance: "inferred"`)
 * domina el 81 % de las aristas `references` aceptadas en guava y el dataset
 * etiquetado que valida la cascada es sólo de Ruby. Este detector cuenta
 * CUALQUIER `provenance` como uso (la lectura más generosa), así que el riesgo
 * en Java no es reportar de más sino reportar de menos con confianza indebida:
 * los hallazgos sobre `.java` bajan de severidad y lo dicen en `detail`.
 *
 * ALCANCE: sólo familias `function-like`/`class-like`. Se excluye `other`
 * (bindings/constantes, que se consumen por valor serializado sin sitio de
 * referencia sintáctico) y `namespace-like` (contenedores organizacionales).
 */
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import { edgeHasRole, edgeIsAmbiguous, type CodeGraphNode, type EdgeKind } from "../../graph/types.js";
import { repoNameIndex, type DeclSpan } from "./repo-name-index.js";
import type { InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "presence" | "libraryRatio";

/**
 * Las aristas cuyo DESTINO es "el símbolo que alguien está usando" — ver el
 * docstring del módulo, que justifica cada inclusión y cada exclusión. Es una
 * decisión de ESTE detector (qué es un consumidor), no una clasificación
 * general de `EdgeKind`: por eso vive acá y no en `graph/`.
 *
 * Las cuatro últimas son de la Ola O (puerta 5): heredar, implementar,
 * satisfacer o mezclar un tipo ES usarlo, y el texto del hallazgo dice
 * literalmente "ningún archivo del repo lo referencia".
 */
const CONSUMER_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "references",
  "calls",
  "instantiates",
  "invokes-indirect",
  "carries",
  "extends",
  "implements",
  "satisfies",
  "mixes-in",
]);

/** Familias candidatas — ver "ALCANCE" en el docstring del módulo. */
const CANDIDATE_FAMILIES = new Set(["function-like", "class-like"]);

/** Hermano homónimo (`@2`, `@3`, …): nunca es destino de una arista — ver el docstring del módulo. */
function isDuplicateSibling(id: string): boolean {
  return /@\d+$/.test(id);
}

function symbolName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? "?";
}

/** `symbolPath` de un solo segmento ⇒ declarado directamente por el archivo, no por otro símbolo. */
function isTopLevel(node: CodeGraphNode): boolean {
  return node.symbolPath.length === 1;
}

function isEntryPointConvention(node: CodeGraphNode): boolean {
  return isTopLevel(node) && symbolName(node).toLowerCase() === "main";
}

/**
 * ¿Este símbolo sólo se alcanza A TRAVÉS DE OTRO? Es lo que decide la PUERTA 3,
 * y **no** es lo mismo que "`symbolPath` tiene más de un segmento". El criterio
 * es la FAMILIA DEL DUEÑO, y las dos direcciones están medidas:
 *
 * *** NO alcanza con la profundidad. *** En C# `symbolPath[0]` es el NAMESPACE,
 * no la clase — de los 3.802 nodos del grafo de newtonsoft-json, los de un solo
 * segmento son 228 `namespace-like` (+15 que la extracción marca `class-like`,
 * ver el informe), y la primera CLASE real aparece recién en el tercer
 * segmento. Con el criterio de profundidad TODA clase de C# contaba como
 * "miembro", la PUERTA 3 la callaba, y el detector emitía **1** hallazgo en todo
 * el repo (con el criterio de acá: 46). Lo mismo con Ruby: `module Jekyll;
 * class Site` deja a la clase en el segundo segmento.
 *
 * *** Y NO alcanza con mirar sólo las clases. *** Un símbolo declarado dentro de
 * OTRA FUNCIÓN tampoco es alcanzable por su cuenta: sus llamadores están todos
 * dentro del contenedor, y ese es exactamente el punto ciego que `graph/build.ts`
 * documenta como "AUTO-REFERENCIA" (una referencia cuyo `(archivo, scope+nombre)`
 * coincide con una declaración se descarta sin comprobar que sea el sitio de la
 * declaración). Medido: con el criterio "sólo miembros de clase", lodash pasaba
 * de 254 candidatos a **244** — su `lodash.js` es una única función envolvente
 * con cientos de funciones anidadas adentro, todas usadas, todas con fan-in 0.
 *
 * Por eso el criterio es: **tiene dueño, y el dueño no es un namespace**. Un
 * namespace/módulo no OCULTA lo que contiene (una clase adentro de un módulo se
 * nombra por su nombre y la cascada lo resuelve); una clase o una función sí.
 * Cero vocabulario por lenguaje: es `family` del nodo contenedor, el mismo dato
 * que `graph/symbols.ts` ya produce.
 *
 * *** OLA Q — LA TERCERA FORMA DE SER MIEMBRO: EL RECEPTOR ESCRITO. ***
 *
 * Ni la profundidad ni el dueño alcanzan cuando la DECLARACIÓN MISMA escribe su
 * receptor en un campo (`receiver`/`object`) en vez de anidarse dentro del tipo.
 * Ahí la gramática deja el símbolo colgado del archivo — `symbolPath` de UN
 * segmento, sin dueño — y las dos preguntas de arriba responden "no es
 * miembro", cuando el símbolo NO se alcanza por nombre desnudo: se lo llama
 * `receptor.nombre(...)`. Es la BRECHA que este archivo tenía escrita bajo
 * `exposureOf` desde la Ola O, verificada a mano en los dos repos con esa
 * gramática, y la razón de que la regresión de ese lenguaje siguiera abierta.
 *
 * El hecho ya viaja al nodo desde la Ola P (`CodeGraphNode.memberOfClassLike`,
 * copiado verbatim de `SymbolFacts.memberOfClassLike`), y se lee **SÓLO en la
 * rama de nivel superior**, que es donde aporta información. Leerlo también
 * abajo sería una REGRESIÓN medida, no una mejora: `SymbolFacts` lo pone en
 * `true` cuando el contenedor inmediato es `class-like` **o `namespace-like`**,
 * así que una clase declarada directamente dentro de un namespace (toda clase
 * de C#, toda clase dentro de un `module` de Ruby) volvería a contar como
 * miembro y la PUERTA 3 la callaría — exactamente el modo de falla que el
 * párrafo de arriba mide (newtonsoft-json en UN hallazgo). En la rama de nivel
 * superior esa ambigüedad no existe: `symbolPath` de un segmento significa
 * `container` vacío, o sea que NO hay contenedor inmediato con nombre, así que
 * el único disyunto que puede haber puesto el hecho en `true` es el receptor
 * escrito (o un contenedor anónimo, que también oculta al símbolo).
 *
 * AUSENTE ≠ `false`: un nodo sin el hecho calculado (todo literal a mano de un
 * test, y cualquier productor que no lo copie) se comporta EXACTAMENTE como
 * antes de esta ola.
 */
function isMemberOfType(node: CodeGraphNode, owner: CodeGraphNode | null): boolean {
  if (isTopLevel(node)) return node.memberOfClassLike === true;
  return owner !== null && owner.family !== "namespace-like";
}

/** Método especial de Python (`__nombre__`) — invocado por el protocolo del lenguaje, nunca por un sitio de llamada con ese nombre. Ver el docstring del módulo. */
const PYTHON_DUNDER = /^__\w+__$/;
function isPythonDunderMethod(node: CodeGraphNode): boolean {
  return PYTHON_DUNDER.test(symbolName(node));
}

/**
 * Instanciar la clase invoca necesariamente su constructor, así que "la clase
 * se usa" ya es evidencia de "el constructor se usa" — aunque la arista
 * `instantiates` apunte a la clase y nunca al miembro anidado (ver el
 * docstring del módulo). Constructor POR NOMBRE (`CONSTRUCTOR_NAMES`, léxico
 * de gramática) o, en C#, mismo nombre que su propia clase.
 */
function isConstructorLikeMember(node: CodeGraphNode, ownerName: string | undefined): boolean {
  if (isTopLevel(node)) return false;
  const name = symbolName(node);
  if (CONSTRUCTOR_NAMES.has(name.toLowerCase())) return true;
  return ownerName !== undefined && name === ownerName;
}

/**
 * PUERTA 4 — ¿la propia sintaxis del símbolo dice si alguien de AFUERA del
 * repo puede alcanzarlo?
 *
 *  - `"expuesta"`  ⇒ el lenguaje declara que es alcanzable desde afuera. "Nadie
 *    lo usa" no es verificable dentro del repo: sus consumidores pueden no
 *    estar acá. Se reporta con la confianza rebajada y con la razón escrita en
 *    `detail`.
 *
 *    *** MEDIDO: esto DESCARTABA, y descartar era peor que el problema. ***
 *    Con `"expuesta"` como descarte, guava pasaba de 21.587 candidatos a **1**
 *    y newtonsoft-json de 1.134 a **1** — o sea java y csharp mudos, que es
 *    exactamente el modo de falla más caro de la ola anterior. La causa: en
 *    esos dos lenguajes CASI TODO tipo de nivel superior escribe `public`, y
 *    sus miembros ya los filtra la PUERTA 3. Y no hacía falta: los 15 falsos
 *    de guava juzgados a mano ya los descarta la PUERTA 2 sola — los 15 tienen
 *    un gemelo homónimo bajo `android/` (verificado con `find`: 2 archivos con
 *    el mismo nombre para cada uno de los 15).
 *  - `"confinada"` ⇒ el lenguaje declara que sólo se alcanza desde adentro. Si
 *    adentro nadie lo usa, está muerto de verdad: es la evidencia MÁS fuerte
 *    que este detector puede tener.
 *  - `"sin-dato"`  ⇒ la gramática no expone el dato para este símbolo. Cae al
 *    heurístico de repo `libraryRatio`, que es lo único que había antes.
 *
 * TRES FUENTES, las tres de la especificación del lenguaje, ninguna inventada acá:
 *
 *  1. `CodeGraphNode.visibility` (`graph/symbols.ts#computeVisibility`, leída
 *     de los nodos `modifiers`/`accessibility_modifier`/… de la gramática):
 *     `public`/`protected` ⇒ expuesta; `private`/`internal` ⇒ confinada.
 *     AUSENTE ≠ pública — ausente es `"sin-dato"`, tal como ese campo lo
 *     documenta.
 *  2. Go, cuya especificación NO usa un modificador sino la primera letra del
 *     identificador ("An identifier is exported if the first character of the
 *     identifier's name is an upper-case Unicode letter",
 *     https://go.dev/ref/spec#Exported_identifiers). Es una regla de la
 *     ESPECIFICACIÓN, del mismo tipo que el protocolo `__nombre__` de Python
 *     que este archivo ya lee por forma del nombre — no una convención de
 *     capitalización inventada acá, y no vocabulario de dominio. Sin ella Go
 *     no tiene NINGUNA fuente de exposición.
 *
 *     BRECHA CERRADA EN LA OLA Q, y era la peor que le quedaba a este
 *     detector: la gramática de Go declara un método CON RECEPTOR a nivel de
 *     archivo (su receptor vive en un campo `receiver`, no en un ancestro),
 *     así que `symbolPath` le da UN solo segmento y este detector no podía
 *     distinguirlo de una función de paquete — o sea, la PUERTA 3 no lo
 *     alcanzaba. Verificado a mano en los dos repos Go: `doGetOrCreate`,
 *     `pruneRootDirs`, `writeReader`, `isExpired`, `packageFromPath` (hugo) y
 *     `argsMinusFirstX`, `getOut`, `persistentFlag`, `initCompleteCmd`
 *     (cobra) son TODOS métodos con receptor, llamados `p.metodo(...)`, y por
 *     lo tanto falsos. Hoy `isMemberOfType` lee
 *     `CodeGraphNode.memberOfClassLike` en su rama de nivel superior y los
 *     alcanza (ver esa función, que explica por qué SÓLO en esa rama). La
 *     PUERTA 3 sigue decidiendo si se los reporta o no.
 *
 *  3. TypeScript/JavaScript (y Vue por su `<script>`): `CodeGraphNode.exported`
 *     — la regla de módulos de la especificación de ESM, leída del envoltorio
 *     `export` de la propia declaración. Sólo se lee su `false`; ver
 *     `exposureOf`.
 *
 * Las otras gramáticas quedan en `"sin-dato"` cuando no traen modificador, y
 * ahí sigue mandando el heurístico de repo.
 */
type Exposure = "expuesta" | "confinada" | "sin-dato";

/** Primera letra mayúscula Unicode — la regla de exportación de la especificación de Go. */
const UPPERCASE_FIRST = /^\p{Lu}/u;

function exposureOf(node: CodeGraphNode, language: string | undefined): Exposure {
  if (node.visibility === "public" || node.visibility === "protected") return "expuesta";
  if (node.visibility === "private" || node.visibility === "internal") return "confinada";
  // OLA Q — la SEGUNDA fuente de exposición declarada por el lenguaje, ver
  // arriba: un símbolo de nivel superior que el propio archivo NO exporta, en
  // un archivo que SÍ usa la sintaxis de export en otro lado. Es evidencia
  // NEGATIVA y sólo se lee en ese sentido: `exported === true` es el default
  // permisivo de seis de las nueve gramáticas (`graph/symbols.ts` lo
  // documenta), así que no prueba nada y no se lee. `!== true` tampoco sirve:
  // ausente ≠ confinado. Y sólo en la rama de nivel superior, porque el hecho
  // se calcula sobre el envoltorio de la propia declaración: un método de una
  // clase exportada queda igualmente en `false`, y eso no dice nada de la
  // alcanzabilidad del método.
  if (isTopLevel(node) && node.exported === false) return "confinada";
  // Go: la regla de la especificación sólo es CONCLUYENTE en un sentido. Que
  // el identificador empiece en mayúscula prueba que está exportado; que
  // empiece en minúscula NO prueba que el conjunto de llamadores sea chico,
  // porque en Go este detector ni siquiera puede saber si el símbolo es un
  // método (ver la BRECHA MEDIDA arriba). Por eso el no exportado cae a
  // `"sin-dato"` — sin el premio de severidad de una confinación declarada.
  if (language === "go") return UPPERCASE_FIRST.test(symbolName(node)) ? "expuesta" : "sin-dato";
  return "sin-dato";
}

function familyLabel(family: string | undefined): string {
  return family === "class-like" ? "clase" : "función o método";
}

export const detector: InterFileDetector<ThresholdKey, "unused-symbol"> = {
  id: "unused-symbol",
  kind: "unused-symbol",
  scope: "inter-file",
  needsGraph: true,
  title: "Símbolo sin uso",
  needs: [],
  // `needsAnyEdge`, no `needsEdges`: las nueve juegan el MISMO ROL
  // ("consumidor de este símbolo") y el fan-in las combina por UNIÓN, así que
  // con que UNA sola tenga volumen en el repo ya hay señal con la que computar
  // fan-in — es alternativa, no conjunción. Ver
  // `types.ts#InterFileDetector.needsAnyEdge`.
  needsAnyEdge: [
    "references",
    "calls",
    "instantiates",
    "invokes-indirect",
    "carries",
    "extends",
    "implements",
    "satisfies",
    "mixes-in",
  ],
  thresholds: {
    // Presencia, no magnitud: fan-in es 0 o no lo es, no hay "cuánto es
    // demasiado" que umbralizar — mismo patrón que `empty-catch.ts`.
    presence: presencia({
      rationale: "es presencia/ausencia de consumidores (fan-in 0 o no); no hay una magnitud que umbralizar.",
    }),
    libraryRatio: pisoDeclarado(0.5, {
      rationale:
        "sólo se aplica a los símbolos cuya exposición el lenguaje NO declara (ver `exposureOf`): si la MAYORÍA " +
        "(>=50%) de ESOS símbolos de nivel superior no tiene ningún consumidor DENTRO del repo, es más probable " +
        "que el repo sea una biblioteca consumida desde afuera que que la mitad de su superficie sea código " +
        "muerto; heurístico de REPO completo, nunca de un símbolo individual. No calibrado contra el corpus (los " +
        "13 repos son todos bibliotecas: no hay un caso negativo limpio con el que contrastar). Desde la Ola O " +
        "REBAJA la severidad, ya no suprime: suprimir dejaba el detector emitiendo SÓLO miembros — la única " +
        "clase de símbolo cuyo uso el grafo NO puede ver — en todo repo con forma de biblioteca, que es el 100 % " +
        "del corpus (medido: hugo, newtonsoft-json, cobra y la fixture versionada quedaban con cero candidatos " +
        "de nivel superior y cientos de miembros).",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de volumen propio; el tope global de `AnalyzeLimits` ya existe aguas abajo, esto es sólo una defensa " +
      "propia. Ojo al leer el número de volumen de este kind: hasta la Ola O este tope estaba SATURADO en 12 de " +
      "los 13 repos del corpus (guava producía 21.587 candidatos para 200 emitidos), así que el volumen medido " +
      "era el tope, no la producción.",
  }),

  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()`, pero `CodeGraph | null` sigue siendo el tipo
    // declarado y un detector no hace `!` a ciegas sobre algo que su propio
    // tipo dice que puede faltar.
    if (!graph) return [];

    const languageByFile = new Map(repo.files.map((f) => [f.path, f.language]));
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const fileByNode = new Map(graph.nodes.map((n) => [n.id, n.file]));
    const languageOf = (node: CodeGraphNode): string | undefined => languageByFile.get(node.file);

    /**
     * ¿ESTA arista acredita la PUERTA 3, o es el objeto hablándose a sí mismo?
     *
     * INTENCIÓN QUE VERIFICA: *la PUERTA 3 pregunta si esta corrida sabe atribuir el uso de
     * un miembro **DE OTRO objeto**.* Un sitio de uso que está LÉXICAMENTE DENTRO del tipo
     * que declara el miembro (`this.foo()`, `self.foo`, el `this.foo = x` del constructor, y
     * cualquier closure anidada dentro de ese mismo tipo) no contesta esa pregunta: el
     * receptor no es una expresión cuyo tipo la cascada haya tenido que averiguar, es la
     * palabra con la que el lenguaje nombra al objeto propio. Que el objeto se alcance a sí
     * mismo no vuelve medible el cero de un miembro al que sólo se le llama como
     * `otro.foo()`.
     *
     * POR QUÉ ES UNA PROPIEDAD DE LA ARISTA Y NO EL NOMBRE DE UNA ETAPA. La Ola U probó las
     * dos formas. El guardián del grupo grafo cerró este mismo agujero nombrando UNA etapa
     * (`resolvedBy !== "self-receiver"`, la etapa nueva de `graph/resolve.ts`), y la puerta
     * se volvió a abrir EN LA MISMA OLA por OTRO mecanismo con la misma forma: los campos de
     * constructor del hueco #1 (`graph/symbols.ts`) crean el nodo destino de `this.campo = x`
     * y esa referencia la resuelve `global-uniqueness`, no `self-receiver`. Medido por el
     * integrador sobre el corpus, con la puerta abierta por ese segundo mecanismo:
     * `unused-symbol` **883 → 1.165 (+282)**, concentrado en las celdas (kind, lenguaje) que
     * sólo se ven en el cruce — java 6→45, javascript 18→136, typescript 148→263, python
     * 232→242 — y con la precisión medida del kind en **7 %**, o sea **+262 puntos de ruido**
     * y ni un frente que lo reportara. Nombrar etapas es una carrera que este detector
     * pierde; la propiedad estructural la gana de una vez.
     *
     * Medido con esta condición sobre los 13 repos: de las 16.037 aristas FIRMES con rol
     * `receiver-member`, acreditan **418** — 160 en jekyll y 258 en rubocop, todas
     * `bare-constant-receiver` hacia un miembro de OTRO módulo (`Jekyll.logger` desde
     * `Jekyll::Collection`, `RuboCop::PathUtil.pwd` desde `RuboCop::CLI`). Ruby es hoy el
     * único lenguaje del corpus donde "nadie lo llama" es una medición, y eso ya era cierto
     * ANTES de esta ola: la condición RESTITUYE el estado previo en vez de inventar uno.
     *
     * "Léxicamente dentro" = mismo archivo Y el camino del DUEÑO del miembro es prefijo del
     * camino del símbolo que lo usa. El mismo archivo es parte de la pregunta: `Jekyll.logger`
     * usado desde `Jekyll::Collection` comparte el prefijo `Jekyll` pero vive en otro archivo,
     * y ahí el receptor SÍ es una expresión que la cascada tuvo que resolver.
     */
    function crossesOwner(fromId: string, toId: string): boolean {
      const from = nodeById.get(fromId);
      const to = nodeById.get(toId);
      if (!from || !to) return true;
      if (from.file !== to.file) return true;
      const owner = to.symbolPath.slice(0, -1);
      if (owner.length === 0) return true;
      return !owner.every((segment, i) => from.symbolPath[i] === segment);
    }

    /** `archivo\0camino\0de\0símbolo` → nodo, para resolver el DUEÑO directo de
     *  un miembro (un nivel arriba en `symbolPath`, mismo archivo) sin
     *  reinventar la resolución de símbolos — ver `isConstructorLikeMember`. */
    const nodeByPathKey = new Map<string, CodeGraphNode>();
    for (const node of graph.nodes) {
      if (node.kind !== "symbol") continue;
      nodeByPathKey.set(`${node.file} ${node.symbolPath.join(" ")}`, node);
    }
    function ownerOf(node: CodeGraphNode): CodeGraphNode | null {
      if (node.symbolPath.length < 2) return null;
      const ownerPath = node.symbolPath.slice(0, -1);
      return nodeByPathKey.get(`${node.file} ${ownerPath.join(" ")}`) ?? null;
    }

    /** Miembro aplanado — ver "MIEMBRO APLANADO" en el docstring del módulo. */
    const topLevelSymbolsByFile = new Map<string, CodeGraphNode[]>();
    for (const node of graph.nodes) {
      if (node.kind !== "symbol" || !isTopLevel(node)) continue;
      const list = topLevelSymbolsByFile.get(node.file);
      if (list) list.push(node);
      else topLevelSymbolsByFile.set(node.file, [node]);
    }
    function flattenedContainersOf(node: CodeGraphNode): readonly CodeGraphNode[] {
      const start = node.startLine ?? 1;
      const end = node.endLine ?? start;
      const siblings = topLevelSymbolsByFile.get(node.file) ?? [];
      const containers: CodeGraphNode[] = [];
      for (const other of siblings) {
        if (other.id === node.id) continue;
        const oStart = other.startLine ?? 1;
        const oEnd = other.endLine ?? oStart;
        // `strictlyLarger` evita que dos declaraciones con rango idéntico por
        // casualidad se marquen como contenedor la una de la otra.
        const strictlyLarger = oStart < start || oEnd > end;
        if (oStart <= start && oEnd >= end && strictlyLarger) containers.push(other);
      }
      return containers;
    }

    const fanIn = new Map<string, number>();
    /** PUERTA 1 — ids que alguna arista de consumo AMBIGUA nombra (como `to` o como alternativa). */
    const unattributedUse = new Set<string>();
    /**
     * En qué lenguajes ESTA corrida vio de verdad la señal de instanciación.
     * Derivado de la corrida, NO de una lista escrita a mano
     * (`graph/edges/instanciacion.ts` es `optional` y su cobertura por gramática
     * cambia de ola en ola). Sólo gradúa la CONFIANZA de un candidato
     * `class-like`.
     */
    const instantiationSeenIn = new Set<string>();
    /**
     * PUERTA 3 — en qué lenguajes ESTA corrida acreditó de verdad el uso de un
     * MIEMBRO, o sea: llegó al menos una arista de consumo con rol
     * `receiver-member` (`receptor.miembro`) **cuyo destino la cascada supo
     * atribuir**. Mismo patrón derivado-de-la-corrida que
     * `instantiationSeenIn`.
     *
     * OLA P: una arista AMBIGUA no acredita acá, y eso está medido, no
     * supuesto — ver el comentario largo en el bucle de aristas de abajo.
     */
    const memberUseSeenIn = new Set<string>();

    for (const edge of graph.edges) {
      if (!CONSUMER_EDGE_KINDS.has(edge.kind)) continue;
      if (edgeIsAmbiguous(edge)) {
        // CONTRATO-F9.md §4.1: la cascada vio la relación pero no pudo
        // atribuirla a un destino. Es un uso VISTO y no atribuido — no suma
        // fan-in (no sabemos de quién es), pero descalifica a los candidatos
        // que nombra. **Es acá donde entra toda la ganancia de la Ola P**: las
        // aristas que `resolve.ts#typelessReceiverStage` dejó de tirar caen en
        // esta rama y por primera vez descalifican a los miembros que alguien
        // llama por receptor (`x.metodo(...)`). Medido, dos árboles congelados,
        // sólo por este camino: jekyll 200 → 109 ubicaciones (94 falsos fuera,
        // 3 nuevas) y cobra 175 → 69 (107 fuera, 1 nueva).
        unattributedUse.add(edge.to);
        for (const alternative of edge.alternatives ?? []) unattributedUse.add(alternative);
        continue;
      }
      // ── POR QUÉ LA ACREDITACIÓN DE OBSERVABILIDAD SIGUE DEBAJO DEL
      //    `continue`, o sea POR QUÉ UNA ARISTA AMBIGUA NO ABRE LA PUERTA 3 ──
      //
      // La PUERTA 3 decía textualmente que se abriría sola "el día que
      // `graph/resolve.ts` deje de rechazar los receptores no constantes". Ese
      // día llegó (Ola P) y **la predicción resultó falsa, medida**: acreditar
      // `memberUseSeenIn` con aristas ambiguas se probó sobre dos árboles
      // congelados y lo que agrega es ruido casi puro —
      //   click (python) 48 → 74 ubicaciones: las 28 nuevas revisadas A MANO,
      //   las 28 falsas (funciones anidadas llamadas por nombre desnudo,
      //   overrides de clases base de la stdlib, callbacks asignados a un
      //   parámetro); preact (js/ts) 41 → 64: las 23 nuevas, todas falsas
      //   (interfaces de `.d.ts`, componentes internos devueltos como valor,
      //   hooks de herramientas de build); newtonsoft-json (csharp) 46 → 188 de
      //   volumen, con las 19 de `JContainer.cs` revisadas a mano y las 19
      //   falsas (7 implementaciones explícitas de interfaces .NET externas,
      //   4 API pública de biblioteca, 8 usadas dentro del repo).
      //
      // La causa NO es que la puerta esté mal escrita: es que su pregunta es
      // POR LENGUAJE y la evidencia que ahora existe es por SITIO. Una sola
      // arista ambigua en un repo de 1.300 archivos alcanza para declarar
      // "en este lenguaje sí veo llamadas a miembros", y eso no vuelve medible
      // el cero de los otros 40.000 miembros. Y hay una causa raíz medida
      // debajo, que NO vive en este archivo: `graph/build.ts#twinFilesForScope`
      // trata como GEMELO DE ÁRBOL PARALELO a todo archivo que declare el mismo
      // prefijo de `symbolPath` que el scope del sitio de uso — y en C#/Java
      // ese prefijo es el NAMESPACE que cada archivo declara, así que TODO
      // candidato cruzado dentro de un mismo namespace se descarta antes de
      // llegar a la cascada. Repro verificado: `o.ReadTokenFrom(reader, opts)`
      // en `Linq/JObject.cs:434` no produce ni un candidato para
      // `Linq/JContainer.cs#ReadTokenFrom`. Hasta que eso se arregle, "nadie lo
      // llama" en C#/Java no es una medición. Ver "PIDO A OTRO FRENTE" en
      // `ola-p/informes/P1.md`.
      const targetFile = fileByNode.get(edge.to);
      const targetLanguage = targetFile === undefined ? undefined : languageByFile.get(targetFile);
      if (edge.kind === "instantiates") {
        const sourceFile = fileByNode.get(edge.from);
        const sourceLanguage = sourceFile === undefined ? undefined : languageByFile.get(sourceFile);
        if (sourceLanguage) instantiationSeenIn.add(sourceLanguage);
      }
      // OLA U (integrador) — el objeto hablándose a sí mismo NO acredita acá, sea cual sea
      // la etapa que resolvió la arista: ver `crossesOwner`, que trae la medición y el
      // porqué de haber reemplazado el nombre de etapa por la propiedad estructural. La
      // arista sigue sumando fan-in dos líneas más abajo, sin cambios.
      if (targetLanguage && edgeHasRole(edge, "receiver-member") && crossesOwner(edge.from, edge.to)) {
        memberUseSeenIn.add(targetLanguage);
      }
      fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + edge.weight);
    }

    const isCandidateSymbol = (node: CodeGraphNode): boolean =>
      node.kind === "symbol" && !!node.family && CANDIDATE_FAMILIES.has(node.family) && !isDuplicateSibling(node.id);

    /**
     * PUERTA 2 — cuántas declaraciones del repo comparten el nombre final.
     * Cuenta TAMBIÉN los hermanos homónimos (`@n`): son declaraciones reales, y
     * su existencia es justamente lo que vuelve inatribuible una referencia.
     */
    const declarationsByName = new Map<string, number>();
    for (const node of graph.nodes) {
      if (node.kind !== "symbol" || !node.family || !CANDIDATE_FAMILIES.has(node.family)) continue;
      const name = symbolName(node);
      declarationsByName.set(name, (declarationsByName.get(name) ?? 0) + 1);
    }

    // Proporción "forma de biblioteca" — SÓLO sobre los símbolos de nivel
    // superior cuya exposición el lenguaje no declara (`"sin-dato"`): donde sí
    // la declara, `exposureOf` decide por símbolo y este heurístico de repo
    // completo no tiene nada que aportar. Un candidato APLANADO no es
    // superficie de nivel superior de verdad, así que tampoco entra (mismo
    // criterio que ya excluye a `main`).
    let topLevelTotal = 0;
    let topLevelUnused = 0;
    for (const node of graph.nodes) {
      if (!isCandidateSymbol(node) || isMemberOfType(node, ownerOf(node))) continue;
      if (exposureOf(node, languageOf(node)) !== "sin-dato") continue;
      if (isTopLevel(node) && flattenedContainersOf(node).length > 0) continue;
      topLevelTotal++;
      if ((fanIn.get(node.id) ?? 0) === 0) topLevelUnused++;
    }
    const libraryRatio = topLevelTotal > 0 ? topLevelUnused / topLevelTotal : 0;
    const libraryThreshold = ctx.threshold("libraryRatio");
    const looksLikeLibrary = libraryRatio >= libraryThreshold.value;

    const presenceThreshold = ctx.threshold("presence");
    const findings: RawFinding[] = [];

    /**
     * PUERTA 6 — OLA AW · AW6. EL ÍNDICE DE TEXTO DEL REPO. Ver
     * `repo-name-index.ts` para la medición completa; el resumen: de los 159
     * falsos de este detector juzgados a mano, 143 tienen el nombre del
     * símbolo escrito en algún byte del repo fuera de su declaración —
     * decorador de Click, `require` perezoso indexado por string, YAML de
     * RuboCop, `.spec.ts` que `collectFiles` poda, gemelo `android/` de guava.
     * Las cinco puertas anteriores miran el GRAFO, y el grafo no ve ninguno de
     * esos bytes.
     *
     * Sin `repo.dir` el índice queda INERTE y `filesRead` vale 0. La puerta se
     * consulta SÓLO con `filesRead > 0`: sin índice no se aplica y el detector
     * se comporta exactamente como antes de esta ola (todo test que arma un
     * `RepoUnit` literal, y cualquier productor que no pase `dir`).
     */
    const idx = repoNameIndex(repo);
    const indiceActivo = idx.filesRead > 0;

    for (const node of graph.nodes) {
      if (!isCandidateSymbol(node)) continue;
      if ((fanIn.get(node.id) ?? 0) !== 0) continue; // tiene al menos un consumidor: no es candidato
      if (unattributedUse.has(node.id)) continue; // PUERTA 1: uso visto, destino no atribuible
      if (isEntryPointConvention(node)) continue; // punto de entrada del programa, ver docstring
      if (isPythonDunderMethod(node)) continue; // método especial invocado por el protocolo del lenguaje

      const name = symbolName(node);
      if ((declarationsByName.get(name) ?? 0) > 1) continue; // PUERTA 2: nombre no distinguible

      // Instanciar la clase ya cuenta como uso de SU constructor.
      const owner = ownerOf(node);
      if (isConstructorLikeMember(node, owner ? symbolName(owner) : undefined) && owner && (fanIn.get(owner.id) ?? 0) > 0) {
        continue;
      }

      const flattenedContainers = isTopLevel(node) ? flattenedContainersOf(node) : [];
      const isFlattenedMember = flattenedContainers.length > 0;
      // Capa oportunista: si el contenedor aplanado mide fan-in > 0, el
      // contenedor usado ya es evidencia de que el miembro se alcanza a través
      // de él — mismo principio que `isConstructorLikeMember`.
      if (isFlattenedMember && flattenedContainers.some((c) => (fanIn.get(c.id) ?? 0) > 0)) continue;

      // PUERTA 6 — el nombre no aparece en NINGÚN byte del repo fuera del
      // tramo de su propia declaración. Ver el bloque de arriba. Los tramos
      // que NO cuentan son el del propio símbolo y —para un miembro— el de su
      // dueño: una llamada `this.#x()` desde otro método de la misma clase cae
      // FUERA del tramo del miembro y por eso lo apaga, que es exactamente lo
      // que se busca; pero el nombre de una clase escrito en su propio
      // encabezado, o el de un constructor homónimo, cae DENTRO.
      if (indiceActivo) {
        const spans: DeclSpan[] = [];
        const propioArchivo = fileByNode.get(node.id);
        if (propioArchivo !== undefined) {
          spans.push({ file: propioArchivo, startLine: node.startLine ?? 1, endLine: node.endLine ?? node.startLine ?? 1 });
        }
        if (idx.usedOutside(symbolName(node), spans)) continue;
        // PUERTA 7 — LA FORMA DE LA DECLARACIÓN. "Nadie escribe este nombre" no
        // alcanza: hay declaraciones cuyo NOMBRE NO ES SU MANIJA (una propiedad
        // de objeto literal, una exportación por defecto, un tipo puro, una
        // declaración anotada, una redefinición de un miembro heredado). Ver
        // `shapeReason` en `repo-name-index.ts`, que trae el caso real de cada
        // una. Medido: sobre los ocho repos donde se desarrollaron las reglas,
        // la PUERTA 6 sola dejaba 19 propuestas con 12 verdaderas; con la 7,
        // 19 propuestas con 12 verdaderas y 7 falsas menos por las razones que
        // están escritas ahí.
        if (propioArchivo !== undefined) {
          const forma = idx.nameIsNotTheHandle(propioArchivo, node.startLine ?? 1, node.endLine ?? node.startLine ?? 1);
          if (forma !== null) continue;
        }
      }

      const language = languageOf(node);
      const isMember = isFlattenedMember || isMemberOfType(node, owner);
      // PUERTA 3: en este lenguaje esta corrida NUNCA acreditó el uso de un
      // miembro, así que "nadie lo usa" no está medido — está fuera de lo que
      // el grafo puede ver. Ver el docstring del módulo.
      if (isMember && !(language !== undefined && memberUseSeenIn.has(language))) continue;

      // PUERTA 4. Las DOS formas de "sus consumidores pueden no estar en este
      // repo" rebajan la confianza, NO descartan — ver `exposureOf` para por
      // qué descartar era peor que el problema que resolvía.
      const exposure = exposureOf(node, language);
      const reachableFromOutside = exposure === "expuesta" || (exposure === "sin-dato" && !isMember && looksLikeLibrary);

      const isJava = language === "java";
      const isClassLike = node.family === "class-like";
      /** Clase candidata EN UN LENGUAJE donde la señal de instanciación no se observó — ver `instantiationSeenIn`. */
      const classLikeWithoutInstantiationSignal = isClassLike && !(language !== undefined && instantiationSeenIn.has(language));
      const startLine = node.startLine ?? 1;
      const endLine = node.endLine ?? startLine;
      const sizeLines = Math.max(1, endLine - startLine + 1);

      // Base + tamaño. Un MIEMBRO parte más abajo que un símbolo de nivel
      // superior: aunque su lenguaje acredite ALGÚN uso por receptor, la
      // mayoría de los receptores sigue sin resolver.
      let severity = (isMember ? 30 : 55) + Math.min(15, Math.floor(sizeLines / 10));
      // Exposición confinada por la propia sintaxis: nadie de afuera del repo
      // puede alcanzarlo, así que "adentro nadie lo usa" es la evidencia más
      // fuerte que este detector puede tener.
      if (exposure === "confinada") severity += 10;
      if (reachableFromOutside) severity = Math.max(15, severity - 15);
      if (classLikeWithoutInstantiationSignal) severity = Math.max(15, severity - 15);
      if (isJava) severity = Math.max(15, severity - 20); // brecha de path-proximity en Java, confianza reducida
      severity = Math.min(100, severity);

      const detailParts = [
        `Ningún archivo del repo referencia "${name}" (${familyLabel(node.family)}); si nada lo usa, cada cambio ` +
          "que lo toca es mantenimiento sin beneficio, y quien lea el código tiene que evaluarlo igual para " +
          "descartarlo como irrelevante.",
      ];
      if (exposure === "confinada") {
        detailParts.push(
          "El propio lenguaje lo declara alcanzable SÓLO desde adentro (visibilidad confinada o identificador no " +
            "exportado), así que no puede tener consumidores fuera de este repo: aquí no hay nada que consultar " +
            "afuera antes de borrarlo.",
        );
      }
      if (isMember) {
        detailParts.push(
          "Confianza reducida: es un miembro, y el grafo no hace inferencia de tipos, así que una llamada a " +
            'través de una instancia ("variable.método()") queda registrada como "hay un uso de un miembro con ' +
            'este nombre, sin saber de qué clase" — nunca como una relación firme hacia este símbolo. Lo que este ' +
            "hallazgo sí afirma es que en todo el repo no aparece ningún uso, ni firme ni ambiguo, de un miembro " +
            "con este nombre.",
        );
      }
      if (isFlattenedMember) {
        detailParts.push(
          `"${name}" está declarado dentro de otra declaración de este mismo archivo (` +
            `${symbolName(flattenedContainers[0]!)}) que el grafo no anida — se trata con la misma confianza ` +
            "reducida que un miembro real.",
        );
      }
      if (classLikeWithoutInstantiationSignal) {
        detailParts.push(
          'Confianza reducida: instanciar esta clase ("Clase.new(...)"/"new Clase()") SÍ cuenta como uso, pero en ' +
            "este análisis no aterrizó ni una sola relación de instanciación escrita en " +
            `${language ?? "este lenguaje"} — así que "nadie la instancia" no está verificado, sólo no observado.`,
        );
      }
      if (exposure === "expuesta") {
        detailParts.push(
          "Confianza reducida: el propio lenguaje lo declara alcanzable desde afuera (visibilidad pública o " +
            "identificador exportado), así que sus consumidores pueden vivir fuera de este repo — antes de " +
            "borrarlo hay que mirar quién lo importa desde afuera, cosa que este análisis no ve.",
        );
      } else if (reachableFromOutside) {
        detailParts.push(
          "Confianza reducida: este repo tiene forma de biblioteca (la mayoría de sus símbolos de nivel superior " +
            "no tiene consumidores dentro del repo) y este lenguaje no declara si el símbolo está expuesto, así " +
            "que no puede descartarse que lo consuma alguien fuera del repo sin revisar el caso.",
        );
      }
      if (isJava) {
        detailParts.push(
          "Severidad reducida: en Java la etapa heurística de resolución (`path-proximity`) domina las " +
            "aristas aceptadas y no está validada contra un dataset etiquetado — este veredicto es menos " +
            "confiable que en un lenguaje donde la cascada resuelve mayormente por reglas estructurales.",
        );
      }

      findings.push({
        title: `"${name}" no tiene consumidores en el repo`,
        detail: detailParts.join(" "),
        trigger: [{ label: "consumidores dentro del repo", value: 0, threshold: presenceThreshold }],
        evidence: [{ label: "profundidad de anidamiento", value: node.symbolPath.length - 1 }],
        locations: [
          {
            file: node.file,
            startLine,
            endLine,
            symbol: name,
            role: isMember ? "miembro sin consumidores" : "símbolo de nivel superior sin consumidores",
            anchor: { file: node.file, symbolPath: node.symbolPath },
          },
        ],
        severity,
        advice: {
          primary: {
            name: "Eliminar código muerto",
            kind: "refactorizacion",
            why:
              "Un símbolo que nadie referencia añade superficie a mantener sin aportar valor; si de verdad hace " +
              "falta conservarlo (API pública externa, invocación por convención o reflexión), documentar " +
              "explícitamente por qué es más barato que dejarlo como código muerto sin marcar.",
            source: "https://refactoring.guru/es/smells/dead-code",
          },
        },
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // PUERTA 8 — CONVENCIÓN DE CARPETA. El resultado más caro de esta ola, y
    // sale de UN repo: `redmine`.
    //
    // Con las PUERTAS 6 y 7 puestas, doce repos emitían entre 0 y 12
    // propuestas cada uno. `redmine` emitía **101, y las 101 falsas**: 60
    // `*Controller` de `app/controllers/`, 200 migraciones de `db/migrate/` y
    // los `*Helper` de `app/helpers/`. Rails no escribe ninguno de esos
    // nombres en ningún lado — los CONSTRUYE: `resources :news` se vuelve
    // `NewsController` por inflexión, el runner de migraciones camelza el
    // nombre del ARCHIVO, y `ActionView` incluye los helpers recorriendo el
    // directorio. Ninguna compuerta de texto puede ver un nombre que no está
    // escrito.
    //
    // EL HECHO QUE SÍ SE VE: **el nombre del símbolo es la camelización del
    // nombre de su propio archivo** (`news_controller.rb` → `NewsController`,
    // `007_create_journals.rb` → `CreateJournals`, `my_helper.rb` →
    // `MyHelper`). Cuando eso pasa, la MANIJA es la RUTA: cualquier cargador
    // que recorra el directorio lo encuentra sin nombrarlo. Es el mismo hecho
    // que ya usa `orphan-file` con su gemelo, y no tiene ni una palabra de
    // vocabulario: es comparar dos cadenas del propio árbol.
    //
    // *** POR QUÉ SE EXIGEN TRES EN EL MISMO DIRECTORIO, Y NO UNO. *** En Java
    // y C# "archivo = clase" es la REGLA DEL LENGUAJE, no una convención de
    // carga: sin el umbral, la regla dejaría MUDO a todo candidato de nivel
    // superior en esos dos lenguajes — exactamente la falla del `SELF_PREFIX`
    // de `state.ts` que esta ola tiene prohibido repetir. El umbral la limita
    // a un directorio que es, ENTERO, una carpeta cargada por convención.
    // Medido: `redmine` 101 → 3, y ni una propuesta se movió en los otros
    // doce repos (guava y newtonsoft-json incluidos).
    // ═════════════════════════════════════════════════════════════════════
    if (indiceActivo) return porConvencionDeCarpeta(findings);
    return findings;
  },
};

/** Umbral de la PUERTA 8 — ver el bloque que la explica en `run()`. */
const CANDIDATOS_PARA_CONVENCION = 3;

/** `news_controller` → `NewsController`; `007_create_journals` → `CreateJournals`. Se descarta un prefijo numérico (el sello de una migración). */
function camelizar(base: string): string {
  return base
    .replace(/^\d+[_-]/, "")
    .split(/[_-]/)
    .filter((w) => w.length > 0)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}

/** Nombre del archivo sin directorio y sin la primera extensión. */
function claveDeArchivo(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.indexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}


/**
 * PUERTA 8 — CONVENCIÓN DE CARGA POR RUTA. Ver el bloque que la explica en
 * `run()`. Son DOS coordenadas independientes, y las dos salieron de medir:
 *
 *  (a) EL NOMBRE DEL SÍMBOLO ES LA CAMELIZACIÓN DEL NOMBRE DEL ARCHIVO, Y ESA
 *      CAMELIZACIÓN UNIÓ PALABRAS — `news_controller.rb` → `NewsController`,
 *      `007_create_journals.rb` → `CreateJournals`, `assistants_controller.rb`
 *      → `Api::V1::…::AssistantsController`, `no_p_allowed.rb` → `NoPAllowed`.
 *      Ahí la MANIJA es la RUTA: el cargador arma el nombre desde el archivo y
 *      nadie lo escribe. Medido: `redmine` 165 → 1, `chatwoot` 196 → 0,
 *      `rubocop` 200 → 0.
 *
 *      *** LAS DOS RESTRICCIONES SON ARREGLOS MEDIDOS, NO ADORNOS. ***
 *      · **Tiene que haber UNIDO PALABRAS** (`_`/`-` en el nombre del archivo).
 *        Sin eso, "archivo = clase" —que en Java y C# es la REGLA DEL LENGUAJE,
 *        no una convención de carga— dejaría MUDOS a esos dos lenguajes: medido,
 *        `ShareX` pasaba de 58 propuestas a 19, y entre las apagadas estaban
 *        `FileBin`, `TaskEx`, `TablessControl` y `PointAnimation`, las cuatro
 *        VERDADERAS. Es la misma falla del `SELF_PREFIX` de `state.ts` que esta
 *        ola tiene prohibido repetir.
 *      · **El archivo tiene que tener UN SOLO punto.** Un nombre COMPUESTO
 *        (`external-svc.entity.ts`, `foo.service.ts`) es una convención de
 *        MÓDULO, no de cargador. Sin esta restricción se apagaba
 *        `ExternalSvc` (`nest`), que está en el snapshot de recall
 *        (`tests/golden/precision/recall/nest.recall.json`) como VERDADERA.
 *
 *  (b) MISMO NOMBRE DE ARCHIVO EN TRES O MÁS DIRECTORIOS DISTINTOS — Django
 *      busca `apps.py` en cada aplicación instalada (`netbox` declara siete
 *      `*Config`, uno por app, los siete falsos), Java busca
 *      `package-info.java` en cada paquete, Go busca `doc.go`. Los TRES
 *      DIRECTORIOS son también un arreglo medido: contando sólo "tres archivos
 *      con el mismo nombre" se apagaban las tres funciones muertas de
 *      `excalidraw/packages/math/src/rectangle.ts`, tres candidatas del MISMO
 *      archivo y las tres verdaderas.
 */
function porConvencionDeCarpeta(findings: readonly RawFinding[]): RawFinding[] {
  const nombreEsLaRuta = (f: RawFinding): boolean => {
    const loc = f.locations[0];
    const symbol = loc.symbol;
    if (symbol === undefined) return false;
    const base = loc.file.slice(loc.file.lastIndexOf("/") + 1);
    if ((base.match(/\./g) ?? []).length !== 1) return false; // nombre compuesto ⇒ convención de módulo
    const clave = claveDeArchivo(loc.file);
    if (!clave.includes("_") && !clave.slice(1, -1).includes("-")) return false; // no unió palabras
    const ultimo = symbol.slice(Math.max(symbol.lastIndexOf("::"), symbol.lastIndexOf(".")) + 1).replace(/^:/, "");
    return ultimo === camelizar(clave);
  };
  const directoriosPorArchivo = new Map<string, Set<string>>();
  for (const f of findings) {
    const p = f.locations[0].file;
    const base = p.slice(p.lastIndexOf("/") + 1);
    let set = directoriosPorArchivo.get(base);
    if (!set) {
      set = new Set();
      directoriosPorArchivo.set(base, set);
    }
    set.add(p.slice(0, Math.max(0, p.lastIndexOf("/"))));
  }
  return findings.filter((f) => {
    const p = f.locations[0].file;
    const base = p.slice(p.lastIndexOf("/") + 1);
    if ((directoriosPorArchivo.get(base)?.size ?? 0) >= CANDIDATOS_PARA_CONVENCION) return false;
    return !nombreEsLaRuta(f);
  });
}
