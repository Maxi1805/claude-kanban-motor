/**
 * `recursive-collection-descent` — OLA AE, frente AE7. **El ancla-FUERZA de
 * Composite.**
 *
 * ────────────────────────────────────────────────────────────────────────
 * 1. LA FUERZA, NO LA ESTRUCTURA
 * ────────────────────────────────────────────────────────────────────────
 *
 * La situación que **Composite** resuelve, escrita como la enuncian sus
 * fuentes (GoF, *Design Patterns*, Composite/Intent: *"compose objects into
 * tree structures … **let clients treat individual objects and compositions
 * of objects uniformly**"*; Kerievsky, *Refactoring to Patterns*, cap. 9:
 * *"Replace One/Many Distinctions with Composite"*):
 *
 * > **el cliente tiene que DISTINGUIR, a mano, la hoja del compuesto — con un
 * > condicional o con dos caminos paralelos — cuando podría tratarlos igual.**
 *
 * Lo que este detector busca es exactamente ese trabajo hecho a mano:
 *
 *   un miembro se llama **a sí mismo** una vez **por cada elemento** de una
 *   colección (el caso "compuesto"), y **decide con un condicional** si hace
 *   eso o si hace otra cosa (el caso "hoja"). Y la misma decisión está
 *   escrita en **VARIOS miembros** del mismo dueño, sobre la misma colección.
 *
 * Composite borra exactamente esa rama: la hoja y el compuesto pasan a
 * responder al mismo mensaje, y el cliente deja de preguntar.
 *
 * *** POR QUÉ NO SON LAS DOS ANCLAS QUE COMPOSITE YA TENÍA ***
 *
 * `Composite` tenía dos anclas y las dos miran **ESTRUCTURA**, no fuerza:
 *
 *   - `distributed-duplication` exige texto LITERALMENTE duplicado en ≥2
 *     archivos. Medido por mí sobre las dos poblaciones (§ informe AE7 §1):
 *     **10 hallazgos crudos en los 13 repos y 50 en `corpus-app/`, y CERO
 *     hipótesis de Composite en las dos** — el ancla está muda desde hace
 *     olas.
 *   - `self-referential-member` mira **el árbol ya armado** (un tipo con un
 *     miembro de su propio tipo). Eso es la estructura que el patrón produce,
 *     no la fuerza que resuelve: un tipo puede nombrarse a sí mismo por un
 *     padre, un siguiente, una vista cacheada o una interfaz fluida, y de
 *     hecho el 100 % de los falsos juzgados en la Ola V eran eso. Y su
 *     `required` **exige una anotación de tipo declarada**, así que es ciego
 *     por construcción en Python, Ruby, JavaScript y Go — los lenguajes donde
 *     un árbol se escribe sin decir el tipo.
 *
 * **NO REEMPLAZO NI APAGO NINGUNA DE LAS DOS.** Las dos siguen exactamente
 * donde estaban, con sus números publicados. Este archivo **SUMA el camino
 * que faltaba**: el que puede hablar sin tipos declarados y el que ancla en la
 * DECISIÓN del cliente, que es la fuerza.
 *
 * ────────────────────────────────────────────────────────────────────────
 * 2. LAS TRES CONDICIONES DE LA RECETA, Y LA INTENCIÓN DE CADA CHEQUEO
 * ────────────────────────────────────────────────────────────────────────
 *
 * | # | chequeo | INTENCIÓN que verifica |
 * |---|---|---|
 * | **(1) FUERZA — la operación se aplica a MUCHOS** | el miembro `M` contiene una llamada a **sí mismo** que está **dentro de un recorrido**: un nodo de bucle de la gramática, o un cuerpo function-like pasado como argumento a un método de un receptor (la iteración funcional de JS/TS/Ruby: `xs.forEach(x => …)`) | *"la operación se aplica a CADA hijo"*. Es lo que separa un árbol de una recursión aritmética: `factorial(n-1)` y `mergesort(a, m)` recursan, pero **nunca dentro de un bucle** — no hay "muchos". Composite existe para tratar UNO y MUCHOS igual; sin MUCHOS no hay nada que unificar. |
 * | **(2) FUERZA — la decisión hoja-vs-compuesto está escrita A MANO** | existe en `M` una bifurcación NO-bucle (if/switch/ternario) con una **rama sin el descenso** — o una **salida temprana** que termina antes de que el recorrido empiece | *"el cliente pregunta ¿es hoja o tiene hijos? antes de recorrer"*. Es LA línea que Composite borra. Sin ella el recorrido es incondicional (`for (c of x.children) f(c)` a secas), el código YA trata uno y muchos igual, y no hay ninguna distinción que unificar: correctamente mudo. |
 * | **(3) ESCALA — la distinción está REPETIDA** | ≥ `miembrosQueDistinguen` miembros DISTINTOS del mismo dueño hacen (1)+(2) sobre la **misma colección** | *"el patrón PAGA"*. Ver el `rationale` del umbral, escrito antes de medir. |
 * | **(4) RESOLUCIÓN VERIFICADA — la puerta de AFUERA (grafo)** | el dueño del recorrido **no** implementa/extiende ya un tipo `T` con ≥2 subtipos donde `T` declare un miembro **homónimo** de alguno de los que distinguen | *"si hoja y compuesto YA comparten un tipo que declara esta operación, el cliente ya podría no distinguir: lo que falta no es el Composite, es usar el que hay"*. Es OTRA refactorización (Replace Conditional with Polymorphism), no ésta. |
 * | **(5) RESOLUCIÓN VERIFICADA — la puerta de ADENTRO (archivo)** | el propio archivo **no** declara ya ≥2 tipos cuyas cabeceras nombren el mismo supertipo que el dueño también nombra | *"la misma pregunta cuando el grafo no resolvió la herencia"*. Hace falta como chequeo propio porque la resolución de `implements`/`extends` de este proyecto no llega en todos los lenguajes, y una jerarquía hoja/compuesto declarada en el MISMO archivo se lee del texto de la cabecera sin depender de eso. Nunca por conjunto de miembros compartidos (prohibido — ver `graph/edges/satisfies-derive.ts`). |
 *
 * **(4) y (5) son la condición que la Ola AD midió como la que más descarta**
 * (AD4: el 91 % de los candidatos que pasaban las otras). Acá están
 * implementadas y su embudo está medido en el informe AE7 §4.
 *
 * ────────────────────────────────────────────────────────────────────────
 * 3. GENERICIDAD — CERO LÉXICO DE DOMINIO
 * ────────────────────────────────────────────────────────────────────────
 *
 * No hay ni una palabra de dominio en este archivo: ni `child`, ni `node`, ni
 * `tree`, ni `parent`. Lo único que se compara contra un texto FIJO es
 * vocabulario de **gramática** (`LOOP_WORD`, el mismo literal que
 * `code-grammar.ts` usa para reconocer un bucle en las 9 gramáticas, y
 * `CALL_NODE_TYPE`, el mismo criterio genérico que `hypotheses/proxy.ts` y
 * `detect/intra-file/lazy-init-repetida.ts` ya declaran). Todo lo demás son
 * comparaciones de un texto del código **contra otro texto del código**: el
 * nombre del miembro contra el nombre del callee, el nombre de la colección
 * de un miembro contra el de otro. **Nunca se infiere por conjunto de
 * miembros.**
 *
 * ────────────────────────────────────────────────────────────────────────
 * 4. LO QUE NO VERIFICA — DECLARADO, NO ESCONDIDO
 * ────────────────────────────────────────────────────────────────────────
 *
 *   a. **Que el receptor del descenso sea del mismo tipo.** El descenso se
 *      reconoce porque el miembro se llama a SÍ MISMO; el grafo de este
 *      proyecto **no resuelve el tipo del receptor** (`graph/resolve.ts#
 *      syntacticRoleStage` rechaza de forma terminal todo `receiver-member`
 *      con calificador no-constante — medido y documentado en
 *      `hypotheses/composite.ts`), así que "el hijo es de mi mismo tipo" es
 *      hoy incontestable. Viaja escrito en el `toConfirm` de la hipótesis.
 *   b. **La forma point-free** (`xs.map(this.walk)`): ahí no hay ninguna
 *      llamada, sólo una referencia. Queda fuera y se declara.
 *   c. **El descenso indirecto** (`M` llama a `N` y `N` llama a `M`): sólo se
 *      reconoce la auto-llamada DIRECTA. Un ciclo de dos saltos necesitaría el
 *      grafo de llamadas dentro del archivo, que sí existe, pero abre la
 *      puerta a cualquier par mutuamente recursivo sin árbol. No se intenta.
 *
 * ────────────────────────────────────────────────────────────────────────
 * 5. LO QUE MIDIÓ ESTE FRENTE — el embudo y la conclusión, en el código y no
 *    sólo en el informe
 * ────────────────────────────────────────────────────────────────────────
 *
 * Sobre los **21 repos completos** (13 bibliotecas + 8 aplicaciones), con la
 * regla de este archivo corrida archivo por archivo:
 *
 * | paso | 13 repos | `corpus-app/` |
 * |---|---:|---:|
 * | miembros function-like con nombre | 129.287 | 93.397 |
 * | **(1a)** con auto-llamada por nombre | 14.205 | 6.735 |
 * | **(1b)** …dentro de un recorrido | **895** (−93,7 %) | **594** (−91,2 %) |
 * | **(2)** …+ la decisión hoja-vs-compuesto | **337** (−62,3 %) | **245** (−58,8 %) |
 * | grupos `(dueño, colección)` | 305 | 214 |
 * | **(3)** escala ≥ 2 | **24** (−92,1 %) | **17** (−92,1 %) |
 * | **(5)** puerta de ADENTRO | **16** (−33,3 %) | **13** (−23,5 %) |
 *
 * **Precisión medida abriendo los 29 archivos reales: 2/16 = 12,5 %
 * [3,5 %, 36,0 %] en bibliotecas y 1/13 = 7,7 % [1,4 %, 33,3 %] en
 * aplicaciones — intervalos SOLAPADOS, sin evidencia de diferencia entre
 * poblaciones.**
 *
 * **LA CONCLUSIÓN NEGATIVA, ESCRITA ACÁ PARA QUE NO SE PIERDA: la condición
 * que no llega en Composite es la RESOLUCIÓN VERIFICADA, y no por
 * implementación.** En Facade se pregunta "¿ya existe la puerta?" sobre el
 * MISMO objeto que el detector encontró; en Composite hay que preguntarlo
 * sobre el **ÁRBOL**, y el grafo no sabe de qué tipo son los elementos del
 * recorrido. Las puertas (4) y (5) sólo pueden preguntar por el **dueño del
 * recorrido**, que es el CLIENTE. **Medido: 5 de los 26 falsos son Composites
 * YA APLICADOS** —el reenvío de un compuesto a sus hijos y el recorrido a mano
 * tienen, por nombre, LA MISMA FORMA— y **4 de esos 5 son Go**, donde la
 * satisfacción de interfaz no se declara en la cabecera del tipo.
 *
 * **LAS DOS REPARACIONES MEDIDAS Y NO APLICADAS** (aplicarlas sería mover un
 * umbral DESPUÉS de ver el resultado): exigir que la decisión sea una RAMA
 * EXPLÍCITA y no sólo una salida temprana corta **10 de 26 falsos y CERO
 * verdaderas**; exigir que todas las operaciones usen un BUCLE de la gramática
 * (no la iteración funcional, que hoy toma cualquier CALLBACK por un
 * recorrido) corta **8 de 26 y CERO verdaderas**. Las dos juntas llevarían la
 * precisión de 3/29 = 10,3 % a 3/15 = 20,0 %.
 *
 * **Y la pregunta que haría medible a este patrón, con su precio:** leer del
 * AST el **tipo DECLARADO del parámetro** sobre cuya colección se desciende y
 * preguntarle al grafo por ESE tipo. Las 3 verdaderas lo tienen declarado
 * (`BsonToken t`, `PluginWrapper.PluginDisableResult oneResult`, `m Params`) y
 * los 5 falsos de "ya aplicado" también: **es una sola pregunta y separa las
 * dos poblaciones enteras.** Es un rediseño del ancla, no un ajuste.
 */
import { walkTree } from "../tree-walk.js";
import { pisoDeclarado } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, EdgeKind } from "../../graph/types.js";

export const RECURSIVE_COLLECTION_DESCENT_KIND = "recursive-collection-descent";

/**
 * Las dos formas de la decisión, tal como viajan en el `role` de cada
 * `RoleLocation`. Exportadas porque `hypotheses/composite.ts` las lee para su
 * discriminador `al-menos-una-rama-explicita`: el contrato entre el detector y
 * la hipótesis queda escrito en una constante compartida y no en dos literales
 * que puedan divergir en silencio — mismo criterio que
 * `inter-file/repeated-collaborator-set.ts` toma con `ROLE_PIECE`/`ROLE_REPEATS`.
 */
export const ROLE_RAMA_EXPLICITA = "rama sin descenso";
export const ROLE_SALIDA_TEMPRANA = "salida temprana";

type ThresholdKey = "miembrosQueDistinguen";

/**
 * ESCALA. **La razón, escrita ANTES de medir:** con UN solo miembro que
 * decide hoja-vs-compuesto, la decisión es UNA rama y la mitigación más
 * barata es dejarla donde está — Composite cuesta un tipo común, un tipo hoja,
 * un tipo compuesto y mover el recorrido: mucha más maquinaria que el
 * problema. El patrón sólo PAGA cuando **cada operación vuelve a pagar el
 * impuesto de decidir**: con DOS operaciones ya hay una regla que se repite y
 * que toda operación futura va a repetir, que es literalmente la forma en que
 * Kerievsky justifica *Replace One/Many Distinctions with Composite*.
 *
 * Y por qué DOS y no TRES, que es lo que `repeated-collaborator-set` (Ola AD)
 * eligió para su propia escala: allá con dos la mitigación más barata era
 * extraer una función compartida y llamarla desde los dos sitios. **Acá eso no
 * sirve**: lo que se repite no es el CUERPO (cada operación hace algo distinto
 * en la hoja) sino la DECISIÓN, y una función compartida no la borra — la
 * mueve. La única mitigación que borra la decisión es el tipo común.
 */
const MIN_MIEMBROS_QUE_DISTINGUEN = 2;

/** Las mismas palabras de gramática con las que `code-grammar.ts` reconoce un
 *  bucle en las 9 gramáticas (`LOOP_WORD`). Copia deliberada: la constante no
 *  se exporta y `loopLike` no queda en `DerivedNodeSets` como categoría propia
 *  (sólo fundida en `branchNodes`/`nestingNodes`), y esta ola no es dueña de
 *  ese archivo compartido. Mismo criterio de duplicación declarada que
 *  `hypotheses/composite.ts` ya toma respecto de
 *  `detect/intra-file/self-referential-member.ts`. */
const LOOP_WORD = /(^|_)(while|until|for|do)(_|$)/;

/** Cualquier nodo "de llamada": Ruby/Python (`call`), JS/TS/Go
 *  (`call_expression`), Java (`method_invocation`), C#
 *  (`invocation_expression`) — el MISMO criterio genérico que
 *  `hypotheses/proxy.ts#isCallLike` y `lazy-init-repetida.ts` ya declaran, en
 *  vez de listar un tipo exacto por lenguaje. */
const CALL_NODE_TYPE = /call|invocation/i;

const IDENTIFICADOR = /[A-Za-z_$][\w$]*/g;

/** Nodos que terminan un camino sin recorrer: la mitad "hoja" de una salida
 *  temprana. Vocabulario de gramática, igual que `LOOP_WORD`. */
const SALIDA_WORD = /(^|_)(return|throw|raise|yield|break|continue)(_|$)/;

function hasField(node: AstNode, field: string): boolean {
  return (node.childForFieldName(field) as AstNode | null) !== null;
}

function hijosNombrados(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function esBucle(node: AstNode, sets: FileUnit["sets"]): boolean {
  return LOOP_WORD.test(node.type) && sets.nestingNodes.has(node.type);
}

/**
 * Bifurcación que DECIDE (if/elsif, rama de switch, ternario) — nunca un
 * bucle ni un manejo de excepción. `branchNodes` los funde a los cuatro; acá
 * hace falta separar, porque un bucle NO es la decisión hoja-vs-compuesto (es
 * el recorrido) y un `catch` tampoco.
 *
 * **El `||` con el campo `condition` es un mecanismo B, no un ensanche:** la
 * forma modificadora de Ruby (`return x if cond`) parsea como `if_modifier`,
 * un tipo de nodo que la sonda de `code-grammar.ts` no produce y que por eso
 * no está en `branchNodes` — medido acá, escribiendo la fixture de Ruby: con
 * sólo `branchNodes` la mitad de los casos de Ruby quedaban mudos por una
 * razón falsa ("no decide"), cuando decide igual. Un nodo con campo
 * `condition` DECIDE por definición de la gramática; los bucles que también lo
 * traen (`while`/`until`) los saca el `!esBucle` de al lado. Es el mismo
 * criterio "por la FORMA del nodo, no por su nombre" que `code-grammar.ts`
 * declara para sus propios fallbacks.
 */
function esBifurcacion(node: AstNode, sets: FileUnit["sets"]): boolean {
  if (esBucle(node, sets) || sets.exceptionNodes.has(node.type)) return false;
  return sets.branchNodes.has(node.type) || hasField(node, "condition");
}

function esLlamada(node: AstNode): boolean {
  return CALL_NODE_TYPE.test(node.type) || hasField(node, "arguments") || hasField(node, "function");
}

/**
 * El texto del callee de una llamada: el receptor y el nombre invocado, sin la
 * lista de argumentos. Se arma de los CAMPOS que la gramática trae —
 * `function` (JS/TS/Vue/Go/Python/C#), `method` + `receiver` (Ruby), `name` +
 * `object` (Java) — y sólo si ninguno está se cae al texto del nodo hasta el
 * primer paréntesis, la misma lectura textual que
 * `lazy-init-repetida.ts#calleeLeadText` hace por el mismo motivo.
 *
 * **MEDIDO, no supuesto:** con sólo el fallback textual, la llamada Ruby
 * `@kids.each do |k| … k.render(out) … end` devolvía como "callee" todo el
 * bloque hasta el primer `(` del CUERPO, y la colección salía `k` (el
 * parámetro del bloque) en vez de `kids`. Por eso el fallback además se
 * recorta a su última línea: un callee nunca cruza un salto de línea.
 */
function textoDelCallee(node: AstNode): string {
  const metodo =
    (node.childForFieldName("function") as AstNode | null) ??
    (node.childForFieldName("method") as AstNode | null) ??
    (node.childForFieldName("name") as AstNode | null);
  if (metodo) {
    const receptor = (node.childForFieldName("object") as AstNode | null) ?? (node.childForFieldName("receiver") as AstNode | null);
    return receptor ? `${receptor.text}.${metodo.text}` : metodo.text;
  }
  const abre = node.text.indexOf("(");
  const lead = abre > 0 ? node.text.slice(0, abre) : node.text;
  return lead.split("\n").pop() ?? lead;
}

/** El ÚLTIMO identificador de una expresión de callee: `this.walk` → `walk`,
 *  `a.b.render()` → `render`, `walk` → `walk`. Comparación de un texto del
 *  código contra otro texto del código, nunca contra una lista fija. */
function ultimoIdentificador(texto: string): string | null {
  const m = texto.match(IDENTIFICADOR);
  return m && m.length > 0 ? m[m.length - 1]! : null;
}

/** El identificador ANTERIOR al último (`this.children.forEach` → `children`):
 *  el receptor sobre el que se aplica el método de iteración. */
function penultimoIdentificador(texto: string): string | null {
  const m = texto.match(IDENTIFICADOR);
  return m && m.length > 1 ? m[m.length - 2]! : null;
}

/**
 * IDENTIDAD DE NODO POR POSICIÓN, NUNCA POR IDENTIDAD DE OBJETO. `n.child(i)`
 * de web-tree-sitter materializa un objeto JS NUEVO en cada llamada, así que
 * `a === b` es falso incluso para el MISMO nodo del árbol — el mismo hecho que
 * `hypotheses/composite.ts#clasificarPosicion` ya documenta como medido ("con
 * la comparación por identidad, `IList<JsonSchema>` dentro de
 * `class JsonSchema` se clasificaba `escalar`"). Encontrado acá de nuevo:
 * con `===` el detector emitía CERO sobre sus propias fixtures.
 */
function claveDeNodo(n: AstNode): string {
  return `${n.type}@${n.startPosition.row}:${n.startPosition.column}-${n.endPosition.row}:${n.endPosition.column}`;
}

function mismoNodo(a: AstNode, b: AstNode): boolean {
  return claveDeNodo(a) === claveDeNodo(b);
}

function cubre(exterior: AstNode, interior: AstNode): boolean {
  const a = exterior.startPosition;
  const b = exterior.endPosition;
  const x = interior.startPosition;
  const y = interior.endPosition;
  const empiezaAntes = a.row < x.row || (a.row === x.row && a.column <= x.column);
  const terminaDespues = b.row > y.row || (b.row === y.row && b.column >= y.column);
  return empiezaAntes && terminaDespues;
}

/** Camino de ancestros desde `raiz` (excluida) hasta `objetivo` (excluido),
 *  de afuera hacia adentro. Se recorre el árbol una vez y se guarda el padre
 *  de cada nodo visitado: `AstNode` no expone `.parent` en este proyecto. */
function caminoHasta(raiz: AstNode, objetivo: AstNode): AstNode[] {
  const camino: AstNode[] = [];
  const bajar = (n: AstNode): boolean => {
    if (mismoNodo(n, objetivo)) return true;
    for (const c of hijosNombrados(n)) {
      if (!cubre(c, objetivo)) continue;
      camino.push(c);
      if (bajar(c)) return true;
      camino.pop();
    }
    return false;
  };
  return bajar(raiz) ? camino : [];
}

/** El recorrido dentro del cual ocurre una llamada, si lo hay. DOS FORMAS,
 *  las dos genéricas:
 *
 *   - **bucle de la gramática** (`for`/`while`/`until`/`do…`): la colección se
 *     lee de la CABECERA (todo el nodo menos su `body`), tomando su último
 *     identificador — `for (const c of node.children)` → `children`,
 *     `for _, c := range n.Children` → `Children`, `for c in self.children:`
 *     → `children`, `foreach (var c in node.Children)` → `Children`.
 *   - **iteración funcional**: un cuerpo function-like que es ARGUMENTO de una
 *     llamada cuyo callee es un acceso a miembro (`xs.forEach(x => …)`,
 *     `xs.each do |x| … end`, `xs.map(x => …)`). La colección es el
 *     penúltimo identificador del callee — `this.children.forEach` →
 *     `children`. **Nunca se compara el nombre del método contra una lista de
 *     nombres de iteración**: alcanza con que sea un método aplicado a un
 *     receptor, que es la forma, no el vocabulario.
 */
interface Recorrido {
  readonly nodo: AstNode;
  readonly coleccion: string;
  readonly forma: "bucle" | "iteracion-funcional";
}

function recorridoDe(camino: readonly AstNode[], sets: FileUnit["sets"]): Recorrido | null {
  for (let i = camino.length - 1; i >= 0; i--) {
    const n = camino[i]!;
    // (a) ITERACIÓN FUNCIONAL — se prueba PRIMERO, y la razón está medida: el
    // bloque `do |x| … end` de Ruby se llama `do_block`, así que la palabra de
    // gramática `do` lo hace pasar por bucle; leerle la "cabecera" devuelve el
    // parámetro del bloque (`k`), no la colección. La colección de un bloque
    // vive en el RECEPTOR de la llamada que lo recibe, nunca adentro de él.
    const tieneParametros = sets.functionNodes.has(n.type) || hasField(n, "parameters");
    if (tieneParametros) {
      const padre = i > 0 ? camino[i - 1]! : null;
      const abuelo = i > 1 ? camino[i - 2]! : null;
      for (const posible of [padre, abuelo]) {
        if (!posible || !esLlamada(posible)) continue;
        const coleccion = penultimoIdentificador(textoDelCallee(posible));
        if (coleccion) return { nodo: n, coleccion, forma: "iteracion-funcional" };
      }
    }
    // (b) BUCLE DE LA GRAMÁTICA.
    if (esBucle(n, sets)) {
      const body = n.childForFieldName("body") as AstNode | null;
      const cabecera = hijosNombrados(n)
        .filter((c) => !(body && (mismoNodo(c, body) || cubre(c, body))))
        .map((c) => c.text)
        .join(" ");
      const coleccion = ultimoIdentificador(cabecera);
      if (coleccion) return { nodo: n, coleccion, forma: "bucle" };
    }
  }
  return null;
}

/**
 * (2) LA DECISIÓN HOJA-VS-COMPUESTO. Dos formas, las dos son "el cliente
 * pregunta antes de recorrer":
 *
 *   - **rama sin descenso**: una bifurcación que CONTIENE el descenso tiene
 *     además una rama (un hijo nombrado que no es la condición) que NO lo
 *     contiene y que no está vacía. `if (hoja) { … } else { recorrer }`.
 *   - **salida temprana**: una bifurcación que NO contiene el descenso,
 *     termina ANTES de que el recorrido empiece, y adentro tiene una salida
 *     (`return`/`throw`/…). `if (hoja) return X;  for (…) recorrer`.
 */
interface Decision {
  readonly nodo: AstNode;
  readonly forma: "rama-sin-descenso" | "salida-temprana";
}

function decisionDe(fnNode: AstNode, autollamada: AstNode, recorrido: AstNode, sets: FileUnit["sets"]): Decision | null {
  let salidaTemprana: Decision | null = null;
  let encontrada: Decision | null = null;
  walkTree(fnNode, (raw) => {
    if (encontrada) return;
    const n = raw as AstNode;
    if (!n.isNamed || !esBifurcacion(n, sets)) return;
    if (cubre(n, autollamada)) {
      const condicion = n.childForFieldName("condition") as AstNode | null;
      for (const rama of hijosNombrados(n)) {
        if (condicion && (mismoNodo(rama, condicion) || cubre(rama, condicion))) continue;
        if (cubre(rama, autollamada)) continue;
        if (hijosNombrados(rama).length === 0 && rama.text.trim().length === 0) continue;
        encontrada = { nodo: n, forma: "rama-sin-descenso" };
        return;
      }
      return;
    }
    if (salidaTemprana) return;
    if (n.endPosition.row > recorrido.startPosition.row) return;
    let tieneSalida = false;
    walkTree(n, (r2) => {
      const m = r2 as AstNode;
      if (SALIDA_WORD.test(m.type)) tieneSalida = true;
    });
    if (tieneSalida) salidaTemprana = { nodo: n, forma: "salida-temprana" };
  });
  return encontrada ?? salidaTemprana;
}

/** Un miembro que hace el descenso recursivo CON su decisión hoja/compuesto. */
interface MiembroQueDistingue {
  readonly nombre: string;
  readonly dueno: string | null;
  readonly coleccion: string;
  readonly formaRecorrido: Recorrido["forma"];
  readonly formaDecision: Decision["forma"];
  readonly startLine: number;
  readonly endLine: number;
  readonly lineaDescenso: number;
  readonly symbolPath: readonly string[];
}

/**
 * Los miembros del archivo que cumplen (1) FUERZA + (2) DECISIÓN. Exportada
 * para el medidor de este frente (`scratchpad-ae7/ae7-embudo.mts`), que
 * necesita contar el embudo sobre el corpus real sin volver a implementar la
 * regla — medir con una segunda implementación sería medir otra cosa (mismo
 * criterio que `hypotheses/composite.ts#analizarFormaDelAncla` declara).
 */
export interface EmbudoDeArchivo {
  /** miembros con nombre (denominador). */
  conNombre: number;
  /** (1a) miembros con al menos una AUTO-LLAMADA. */
  conAutollamada: number;
  /** (1b) …cuya auto-llamada está DENTRO de un recorrido (bucle o iteración funcional). */
  conRecorrido: number;
  /** (2) …y además con la decisión hoja-vs-compuesto escrita a mano. */
  conDecision: number;
}

export function miembrosQueDistinguen(file: FileUnit, embudo?: EmbudoDeArchivo): readonly MiembroQueDistingue[] {
  const out: MiembroQueDistingue[] = [];
  for (const fn of file.functions) {
    const nombre = fn.name;
    if (!nombre) continue;
    if (embudo) embudo.conNombre++;
    let elegido: MiembroQueDistingue | null = null;
    let vistoAutollamada = false;
    let vistoRecorrido = false;
    walkTree(fn.node, (raw) => {
      if (elegido) return;
      const n = raw as AstNode;
      if (!n.isNamed || !esLlamada(n)) return;
      if (ultimoIdentificador(textoDelCallee(n)) !== nombre) return;
      vistoAutollamada = true;
      const camino = caminoHasta(fn.node, n);
      if (camino.length === 0) return;
      const recorrido = recorridoDe(camino, file.sets);
      if (!recorrido) return;
      vistoRecorrido = true;
      const decision = decisionDe(fn.node, n, recorrido.nodo, file.sets);
      if (!decision) return;
      elegido = {
        nombre,
        dueno: fn.metrics.className,
        coleccion: recorrido.coleccion,
        formaRecorrido: recorrido.forma,
        formaDecision: decision.forma,
        startLine: fn.startLine,
        endLine: fn.endLine,
        lineaDescenso: n.startPosition.row + 1,
        symbolPath: fn.symbolPath,
      };
    });
    if (embudo) {
      if (vistoAutollamada) embudo.conAutollamada++;
      if (vistoRecorrido) embudo.conRecorrido++;
      if (elegido) embudo.conDecision++;
    }
    if (elegido) out.push(elegido);
  }
  return out;
}

interface Grupo {
  readonly dueno: string | null;
  readonly coleccion: string;
  readonly miembros: readonly MiembroQueDistingue[];
}

/** (3) ESCALA — se agrupa por (dueño, colección recorrida) y no sólo por
 *  archivo: dos miembros que recorren colecciones DISTINTAS no están
 *  decidiendo sobre el mismo árbol, y unirlos afirmaría una repetición que no
 *  existe. Es la misma distinción que `repeated-collaborator-set` (Ola AD)
 *  midió entre agrupar por ARCHIVO y agrupar por SÍMBOLO. */
export function agrupar(miembros: readonly MiembroQueDistingue[]): readonly Grupo[] {
  const porClave = new Map<string, MiembroQueDistingue[]>();
  for (const m of miembros) {
    const clave = `${m.dueno ?? ""} ${m.coleccion}`;
    const lista = porClave.get(clave);
    if (lista) lista.push(m);
    else porClave.set(clave, [m]);
  }
  const out: Grupo[] = [];
  for (const lista of porClave.values()) {
    const unicos = [...new Map(lista.map((m) => [m.nombre, m])).values()];
    out.push({ dueno: unicos[0]!.dueno, coleccion: unicos[0]!.coleccion, miembros: unicos });
  }
  out.sort((a, b) => (a.miembros[0]?.startLine ?? 0) - (b.miembros[0]?.startLine ?? 0));
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * (4) y (5) — RESOLUCIÓN VERIFICADA
 * ──────────────────────────────────────────────────────────────────────── */

const ARISTAS_DE_PROTOCOLO: ReadonlySet<EdgeKind> = new Set(["implements", "satisfies", "extends"]);

interface VistaDeGrafo {
  /** Tipos class-like declarados en este archivo, por nombre simple. */
  readonly tiposDelArchivo: ReadonlyMap<string, CodeGraphNode>;
  readonly salientes: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** cuántos subtipos declara cada tipo (destino de implements/satisfies/extends). */
  readonly subtiposDe: ReadonlyMap<string, number>;
  readonly nodoPorId: ReadonlyMap<string, CodeGraphNode>;
}

/** Se construye PEREZOSAMENTE y sólo si algún grupo pasó (1)+(2)+(3): recorre
 *  las aristas del repo entero, y pagarlo por archivo sería O(archivos ×
 *  aristas). Mismo cuidado que `hypotheses/composite.ts#CompositeProblem.indice`
 *  documenta para el suyo. */
function vistaDeGrafo(graph: CodeGraph, archivo: string): VistaDeGrafo {
  const tiposDelArchivo = new Map<string, CodeGraphNode>();
  const nodoPorId = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) {
    if (!nodoPorId.has(n.id)) nodoPorId.set(n.id, n);
    if (n.kind !== "symbol" || n.family !== "class-like" || n.file !== archivo) continue;
    const simple = n.symbolPath[n.symbolPath.length - 1];
    if (simple && !tiposDelArchivo.has(simple)) tiposDelArchivo.set(simple, n);
  }
  const salientes = new Map<string, CodeGraphEdge[]>();
  const subtiposDe = new Map<string, number>();
  for (const e of graph.edges) {
    const lista = salientes.get(e.from);
    if (lista) lista.push(e);
    else salientes.set(e.from, [e]);
    if (ARISTAS_DE_PROTOCOLO.has(e.kind)) subtiposDe.set(e.to, (subtiposDe.get(e.to) ?? 0) + 1);
  }
  return { tiposDelArchivo, salientes, subtiposDe, nodoPorId };
}

/**
 * (4) LA PUERTA DE AFUERA. `true` ⇒ el tratamiento uniforme YA está
 * disponible: el dueño del recorrido declara un supertipo `T` con ≥2 subtipos,
 * y `T` declara un miembro con el MISMO nombre que alguno de los que
 * distinguen. Devuelve el nombre del supertipo para poder decirlo.
 */
function puertaYaExistenteEnGrafo(vista: VistaDeGrafo, grupo: Grupo): string | null {
  if (!grupo.dueno) return null;
  const tipo = vista.tiposDelArchivo.get(grupo.dueno);
  if (!tipo) return null;
  const nombres = new Set(grupo.miembros.map((m) => m.nombre));
  for (const e of vista.salientes.get(tipo.id) ?? []) {
    if (!ARISTAS_DE_PROTOCOLO.has(e.kind)) continue;
    if ((vista.subtiposDe.get(e.to) ?? 0) < 2) continue;
    for (const sub of vista.salientes.get(e.to) ?? []) {
      if (sub.kind !== "contains") continue;
      const miembro = vista.nodoPorId.get(sub.to);
      if (!miembro || miembro.kind !== "symbol" || miembro.family !== "function-like") continue;
      const simple = miembro.symbolPath[miembro.symbolPath.length - 1];
      if (simple && nombres.has(simple)) {
        const nombreT = vista.nodoPorId.get(e.to)?.symbolPath.slice(-1)[0] ?? e.to;
        return nombreT;
      }
    }
  }
  return null;
}

/** El texto de la CABECERA de una declaración de tipo: todo lo que precede a
 *  su `body`. Nunca el cuerpo, para no confundir un identificador usado
 *  ADENTRO con una relación de herencia DECLARADA — misma lectura y misma
 *  razón que `hypotheses/composite.ts#encabezadoDeClase`. */
function encabezadoDeTipo(node: AstNode): string {
  const body = node.childForFieldName("body") as AstNode | null;
  const partes: string[] = [];
  for (const c of hijosNombrados(node)) {
    if (body && (mismoNodo(c, body) || cubre(c, body))) break;
    partes.push(c.text);
  }
  return partes.join(" ");
}

/**
 * (5) LA PUERTA DE ADENTRO. `true` ⇒ el propio archivo ya declara la
 * jerarquía: el dueño nombra en su cabecera un tipo `T` que **otro** tipo del
 * mismo archivo también nombra en la suya. Dos tipos que declaran el mismo
 * supertipo ES la mitad hoja/compuesto ya construida, y ahí lo que falta no es
 * el Composite.
 */
export function puertaYaExistenteEnArchivo(file: FileUnit, dueno: string | null): string | null {
  if (!dueno) return null;
  const cabeceras = new Map<string, string>();
  walkTree(file.root, (raw) => {
    const n = raw as AstNode;
    if (!n.isNamed || !file.sets.classNodes.has(n.type)) return;
    const nombre = (n.childForFieldName("name") as AstNode | null)?.text;
    if (!nombre || cabeceras.has(nombre)) return;
    cabeceras.set(nombre, encabezadoDeTipo(n));
  });
  const propia = cabeceras.get(dueno);
  if (propia === undefined) return null;
  const propios = new Set((propia.match(IDENTIFICADOR) ?? []).filter((t) => t !== dueno));
  if (propios.size === 0) return null;
  for (const [otro, cabecera] of cabeceras) {
    if (otro === dueno) continue;
    for (const t of cabecera.match(IDENTIFICADOR) ?? []) {
      if (t !== otro && propios.has(t)) return t;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * El hallazgo
 * ──────────────────────────────────────────────────────────────────────── */

export function computeRecursiveCollectionDescentFindings(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
  const minMiembros = ctx.threshold("miembrosQueDistinguen");
  const grupos = agrupar(miembrosQueDistinguen(file)).filter((g) => g.miembros.length >= minMiembros.value);
  if (grupos.length === 0) return [];

  const graph = ctx.graph ?? null;
  let vistaMemo: VistaDeGrafo | null = null;
  const vista = (): VistaDeGrafo | null => {
    if (!graph) return null;
    return (vistaMemo ??= vistaDeGrafo(graph, file.path));
  };

  const findings: RawFinding[] = [];
  for (const g of grupos) {
    // (4) y (5) — RESOLUCIÓN VERIFICADA: si la puerta ya existe, SILENCIO.
    const v = vista();
    if (v && puertaYaExistenteEnGrafo(v, g)) continue;
    if (puertaYaExistenteEnArchivo(file, g.dueno)) continue;

    const etiqueta = g.dueno ?? file.path;
    const todas: RoleLocation[] = g.miembros.map((m, i) => ({
      file: file.path,
      startLine: m.startLine,
      endLine: m.endLine,
      symbol: m.nombre,
      anchor: { file: file.path, symbolPath: m.symbolPath.length > 0 ? m.symbolPath : [m.nombre], ordinal: i },
      role:
        `decide hoja-vs-compuesto a mano (${m.formaDecision === "rama-sin-descenso" ? ROLE_RAMA_EXPLICITA : ROLE_SALIDA_TEMPRANA}) ` +
        `y desciende sobre \`${m.coleccion}\` (${m.formaRecorrido === "bucle" ? "bucle" : "iteración funcional"}), línea ${m.lineaDescenso}`,
    }));
    const [primera, ...resto] = todas;
    if (!primera) continue;
    const locations: readonly [RoleLocation, ...RoleLocation[]] = [primera, ...resto];

    findings.push({
      title: `"${etiqueta}" decide hoja-vs-compuesto a mano en ${g.miembros.length} operaciones`,
      detail:
        `${g.miembros.length} miembros de \`${etiqueta}\` (${g.miembros.map((m) => `\`${m.nombre}\``).join(", ")}) ` +
        `hacen lo mismo: preguntan con un condicional si hay que descender, y si hay que descender se llaman a sí mismos ` +
        `una vez por cada elemento de \`${g.coleccion}\`. La distinción entre "uno" y "muchos" está escrita a mano en cada ` +
        `una de esas operaciones, y cada operación nueva sobre esta estructura va a tener que volver a escribirla. ` +
        `Ningún tipo común declara todavía esa operación para hoja y compuesto a la vez: no hay forma de tratarlos igual.`,
      trigger: [{ label: "operaciones que deciden hoja-vs-compuesto sobre la misma colección", value: g.miembros.length, threshold: minMiembros }],
      evidence: [
        {
          label: "descensos recursivos dentro de un recorrido",
          value: g.miembros.length,
          note: g.miembros.map((m) => `${m.nombre}: ${m.formaRecorrido} sobre ${m.coleccion}, decisión ${m.formaDecision}`).join(" · "),
        },
        {
          label: "verificación de que el tratamiento uniforme NO existe todavía",
          value: graph ? 2 : 1,
          note: graph
            ? "grafo: el dueño no declara ningún supertipo con >=2 subtipos que declare un miembro homónimo; archivo: ningún otro tipo del archivo declara el mismo supertipo."
            : "sin grafo en esta corrida: sólo se pudo verificar la puerta de ADENTRO (el archivo). La puerta de AFUERA queda sin verificar y así se declara.",
        },
      ],
      locations,
      severity: Math.min(100, 30 + g.miembros.length * 10),
      advice: {
        primary: {
          name: "Replace Implicit Tree with Composite",
          kind: "refactorizacion",
          why: "La estructura de árbol ya existe, pero sólo como convención: cada operación tiene que redescubrirla con un condicional. Darle un tipo la vuelve explícita y saca la decisión de los clientes.",
          source: "https://refactoring.guru/es/design-patterns/composite",
        },
        pattern: {
          name: "Composite",
          kind: "patron_de_diseno",
          why: "Composite existe exactamente para que el cliente no tenga que distinguir un elemento suelto de un grupo: hoja y compuesto responden al mismo mensaje y el recorrido vive dentro del compuesto, no repartido en cada operación.",
          source: "https://refactoring.guru/es/design-patterns/composite",
          caveat:
            "Sólo paga si hoja y compuesto pueden compartir de verdad la MISMA operación. Si el recorrido no es sobre hijos del mismo tipo (una recursión sobre otra estructura, un recorrido plano) el patrón correcto es otro — Iterator o simplemente una función recursiva.",
          cost: "Un tipo común, un tipo hoja y un tipo compuesto, más mover el recorrido adentro del compuesto: se paga una vez y cada operación futura deja de pagar la decisión.",
        },
      },
    });
  }
  return findings;
}

export const detector: IntraFileDetector<ThresholdKey, "recursive-collection-descent"> = {
  id: "recursive-collection-descent",
  kind: "recursive-collection-descent",
  scope: "intra-file",
  title: "Distinción hoja-vs-compuesto hecha a mano",
  // SIN `needs`: las dos formas del recorrido (bucle de la gramática e
  // iteración funcional) y la decisión (`branchNodes`) existen en las 9
  // gramáticas; no hay una capacidad declarada que separe a un lenguaje de
  // otro acá. Mismo criterio que `optional-behavior-flags`/`temporary-field`
  // declaran para el suyo.
  needs: [],
  // RUTEO, no compuerta (ver `types.ts#IntraGraphOptIn`): el detector necesita
  // el grafo para la puerta de AFUERA de la resolución verificada, y sin él
  // degrada solo — verifica sólo la puerta de ADENTRO y lo dice en la
  // evidencia, nunca calla el hallazgo por no haber podido mirar.
  needsGraph: true,
  thresholds: {
    miembrosQueDistinguen: pisoDeclarado(MIN_MIEMBROS_QUE_DISTINGUEN, {
      rationale:
        "Kerievsky, Refactoring to Patterns, cap. 9 (Replace One/Many Distinctions with Composite): el patrón paga cuando la distinción entre uno y muchos está repetida, porque cada operación nueva la vuelve a pagar. Con UNA sola operación que decide hoja-vs-compuesto la mitigación más barata es dejar la rama donde está: Composite cuesta un tipo común, un tipo hoja y un tipo compuesto, mucha más maquinaria que una rama. Y por qué DOS y no TRES (que es lo que `repeated-collaborator-set` eligió para su escala): allá con dos la mitigación más barata era extraer una función compartida; acá eso no sirve, porque lo que se repite no es el CUERPO sino la DECISIÓN, y una función compartida la mueve en vez de borrarla. Es la condición de ESCALA que la Ola AC midió como la que faltaba (AC2: 6 de sus 7 casos con la fuerza correcta eran demasiado chicos).",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return computeRecursiveCollectionDescentFindings(file, ctx);
  },
};
