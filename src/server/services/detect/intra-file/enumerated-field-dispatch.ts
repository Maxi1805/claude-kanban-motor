/**
 * `enumerated-field-dispatch` — un campo propio con ALFABETO CERRADO del que
 * dependen las ramas de varios miembros del mismo tipo (Ola AC, frente AC2).
 *
 * ════════════════════════════════════════════════════════════════════════
 * *** DESREGISTRADO A PROPÓSITO — MEDIDO Y RETIRADO POR R1 EN LA MISMA OLA ***
 * ════════════════════════════════════════════════════════════════════════
 *
 * **Este detector NO está en `detect/registry.ts` y no corre en producción.**
 * No es un olvido: es el resultado de la medición para la que se escribió.
 *
 *   - Población COMPLETA sobre las dos poblaciones oficiales: **28 hallazgos**
 *     (13 repos: 23; `corpus-app/`: 5), de los que **20 llegan a ser
 *     recomendación** de State y 8 salen `aplicado-eludido`.
 *   - **Las 28 juzgadas a mano, abriendo el archivo real: 1 verdadera.**
 *     Precisión de las recomendaciones **1/20 = 5,0 % [0,9 %, 23,6 %]**.
 *   - R1 (`ola-ac/CONTEXTO.md` §4): celda con n≥12 y precisión <20 % **deja de
 *     emitir**. Encenderla el mismo día que se mide por debajo del piso sería
 *     exactamente lo que esta ola le reprocha a la anterior.
 *
 * **Se conserva, con sus 30 tests verdes, por dos razones concretas:** (a) el
 * experimento es el entregable del frente y tiene que poder re-medirse desde
 * el árbol, no desde un informe; (b) los seis defectos de gramática que su
 * construcción destapó —y que están congelados en tests acá— valen para
 * CUALQUIER detector futuro que mire asignaciones (§3 de `AC2.md`).
 *
 * **Para volver a encenderlo hacen falta DOS líneas y ninguna otra:** el
 * `import`+entrada en `detect/registry.ts`, la entrada en
 * `detect/impact.ts#DETECTOR_IMPACT` (tier `mantenibilidad`, mismo criterio
 * que `repeated-switch`/`type-switch`) y el ancla en
 * `hypotheses/state.ts#anchors`. Quien lo haga tiene que pagar el
 * re-asentado del nivel 1 (censo golden + snapshots de recall), porque agrega
 * un kind nuevo.
 *
 * EL RESULTADO, PARA QUE NO SE REPITA EL INTENTO SIN LEERLO: el ancla **SÍ**
 * encuentra máquinas de estados implícitas reales —7 de 28, contra
 * prácticamente ninguna del ancla-síntoma que reemplazaba— pero en 6 de esas 7
 * el patrón sigue estando mal, porque la máquina tiene 2–4 estados y ramas de
 * una línea. **La FUERZA es necesaria y no suficiente: falta la ESCALA.**
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE KIND — la FUERZA, no el síntoma
 * ────────────────────────────────────────────────────────────────────────
 *
 * El catálogo tenía un ancla para State (`temporary-field`) que mira un
 * SÍNTOMA: "existe un campo que a veces está vacío". Medido sobre la salida
 * completa: 178 recomendaciones, 7 verdaderas de 48 juicios (14,6 %), y las
 * tres familias de falso que se repiten son cachés perezosas, cursores de
 * iterador y acumuladores — todas cumplen "el campo a veces está vacío" y
 * NINGUNA es una máquina de estados.
 *
 * La SITUACIÓN que el patrón State resuelve no es "un campo se vacía". Es:
 * **el comportamiento del objeto cambia según un valor interno de un conjunto
 * cerrado, y la decisión está escrita a mano, repartida en varios miembros.**
 * Este detector nombra esa situación y nada más. Es deliberadamente
 * INDEPENDIENTE de si el patrón está puesto o no: la situación existe igual —
 * decidir si la resolución está AUSENTE es trabajo de la capa de hipótesis
 * (`hypotheses/state.ts#appliedState`), nunca de este archivo. Anclar en la
 * FORMA del patrón ya aplicado (una jerarquía de estados, un protocolo
 * compartido) encontraría los patrones que ya están, que es exactamente lo
 * contrario de lo que se busca.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FORMA QUE SE BUSCA — tres condiciones, cada una con su intención
 * ────────────────────────────────────────────────────────────────────────
 *
 * Un campo `F` de una unidad-tipo `C` dispara cuando se cumplen las TRES:
 *
 *   (1) **ALFABETO CERRADO.** *Todas* las asignaciones a `F` dentro de los
 *       cuerpos de miembros de `C` escriben un valor CONSTANTE (un literal, o
 *       un nombre que no es ni parámetro, ni variable local, ni campo propio
 *       — la forma de un miembro de enumeración o de una constante de
 *       módulo), y hay al menos `valoresDistintos` valores DISTINTOS.
 *
 *       INTENCIÓN: separar un DISCRIMINANTE de un DATO. Un campo que recibe
 *       el resultado de una llamada (`this.cache = compute()`), una variable
 *       local (`this.current = node`) o una expresión calculada NO tiene un
 *       alfabeto: es un dato. Ésta es la condición que descarta, por forma y
 *       no por vocabulario, las tres familias de falso que el ancla-síntoma
 *       producía. Y `<2` valores distintos no es una alternancia: es una
 *       inicialización.
 *
 *   (2) **TRANSICIÓN DESPUÉS DE CONSTRUIR.** Al menos una de esas
 *       asignaciones constantes ocurre en un miembro que NO es el
 *       constructor.
 *
 *       INTENCIÓN: separar State de Strategy, que es la confusión que este
 *       patrón tiene declarada desde su primera versión. Si el valor se fija
 *       una sola vez al construir, la elección está cableada en quien llama —
 *       eso es Strategy. State exige que el objeto CAMBIE su propio valor
 *       durante su vida. Es la misma pregunta que
 *       `hypotheses/state.ts#transitionCheck` hacía como discriminador
 *       *después*; acá es parte de la forma, medida por AST y no adivinada
 *       por texto.
 *
 *   (3) **DECISIÓN REPARTIDA.** `F` se lee dentro de la CONDICIÓN de una rama
 *       (el campo `condition` de cualquier nodo que lo tenga: if/while/
 *       ternario; o el discriminante de un contenedor de switch) en al menos
 *       `miembrosQueDeciden` miembros DISTINTOS de `C`.
 *
 *       INTENCIÓN: "las transiciones están desparramadas en condicionales
 *       sobre ese estado" — la segunda mitad de la fuerza. Un único sitio de
 *       decisión es un despacho local (y su respuesta suele ser una tabla o
 *       una función, no una jerarquía); dos o más miembros preguntando por el
 *       mismo campo es la dispersión que el patrón resuelve, y es la misma
 *       relación que `refactoring.guru/design-patterns/state` describe como
 *       el problema ("conditionals in every method").
 *
 * QUÉ **NO** ES — las exclusiones, cada una por forma:
 *
 *   - **Una caché / inicialización perezosa** (`this.x = null` … `this.x =
 *     build()`): `build()` no es constante ⇒ el alfabeto no está cerrado.
 *   - **Un cursor o un puntero de lista** (`this.current = node`): `node` es
 *     una variable local o un parámetro ⇒ no es constante.
 *   - **Un acumulador** (`this.buf = []`, `this.buf = this.buf.concat(x)`):
 *     construcción y llamada ⇒ no es constante.
 *   - **Un valor de configuración fijo** (asignado sólo en el constructor):
 *     falla (2). Es el discriminante de Strategy.
 *   - **Un campo con un solo valor constante** (una bandera que sólo se
 *     enciende): falla (1) por `valoresDistintos`.
 *   - **Un contador** (`this.n = 0` … `this.n += k`): el operador compuesto
 *     nunca fija un valor del alfabeto ⇒ el alfabeto no está cerrado.
 *   - **Un campo leído en un único miembro**: falla (3). No hay dispersión
 *     que resolver.
 *   - **Una variable local con el mismo nombre**: no se mira nunca. Sólo
 *     accesos por receptor propio (`this.`/`self.`/`@`/receptor de Go) o
 *     identificadores desnudos que la unidad-tipo DECLARA como campo, con la
 *     regla de sombreado por parámetro — el mismo mecanismo por AST que
 *     `temporary-field.ts` ya usa.
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD
 * ────────────────────────────────────────────────────────────────────────
 *
 * Cero léxico de dominio: ni una lista de nombres de campo, de clase, de
 * método ni de valor. Las listas de texto son **vocabulario de gramática**,
 * aplicado idénticamente a los 9 lenguajes: `SELF_WORDS` (`this`/`self`, la
 * misma de `temporary-field.ts`/`lazy-init-repetida.ts`), `CONSTRUCTOR_NAMES`
 * (importada de `code-grammar.ts`), `CALL_OR_COMPUTATION_NODE` (las familias
 * de nodo que hacen que una expresión NO sea constante) y
 * `SWITCH_SUBJECT_FIELDS` (los nombres de campo con los que las gramáticas
 * cuelgan el sujeto de un switch — el mismo trío que `hypotheses/state.ts` ya
 * usa). La capa por lenguaje no decide nada: `file.sets` viene de
 * `code-grammar.ts` y este archivo sólo lo consulta.
 *
 * DUPLICACIÓN DECLARADA: `namedChildren`, `objectOf`, `memberNameOf`,
 * `selfFieldNameOf`, `goReceiverOf`, `declaredFieldNames`, `parameterNamesOf`
 * y `findAllDescendants` son la misma copia adaptada que `temporary-field.ts`
 * ya declara frente a `lazy-init-repetida.ts` — `detect/*` no puede importar
 * de `hypotheses/*` (capas invertidas) y no existe un módulo de primitivas
 * compartido entre detectores. Se copia y se dice, igual que esos archivos.
 *
 * PATRÓN AL QUE ALIMENTA: **State** (`hypotheses/state.ts`, ancla
 * `enumerated-field-dispatch`).
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import { pisoDeclarado } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "miembrosQueDeciden" | "valoresDistintos";

/** Mismo vocabulario que `temporary-field.ts#SELF_WORDS`. */
const SELF_WORDS = new Set(["this", "self"]);
/** Ruby: `@x` es un único token con sigilo, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const COMMENT_NODE_TYPE = /comment/i;

/**
 * Tipos de nodo que DECLARAN campos dentro del cuerpo de una unidad-tipo —
 * vocabulario de gramática, idéntico al de `temporary-field.ts`. Sólo sirve
 * para reconocer el identificador DESNUDO de Java/C# como campo propio.
 */
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;

/**
 * Las familias de nodo que hacen que una expresión NO sea una constante:
 * una llamada, una construcción, un cálculo, una asignación, una espera, una
 * función anónima o un contenedor literal. La lista es de FAMILIAS de
 * gramática, no de nombres de tipo puntuales, y por eso está escrita como
 * palabras dentro del nombre del nodo (la misma técnica que `SWITCH_WORD` y
 * `LOOP_WORD` de `code-grammar.ts`).
 *
 * `conditional`/`ternary` entran acá, pero con una salida propia: ver
 * `TERNARY_NODE_TYPE` y `isConstantValue`. Una expresión condicional cuyas DOS
 * ramas son constantes (`x = flag ? A : B`) elige DENTRO del alfabeto y aporta
 * sus dos valores; una cuyas ramas no lo son, no.
 */
const CALL_OR_COMPUTATION_NODE =
  /(^|_)(call|invocation|creation|new|binary|unary|update|assignment|augmented|await|yield|ternary|conditional|lambda|arrow|function|closure|array|object|dictionary|hash|list|slice|comprehension|spread|subscript|index)(_|$)/;

/**
 * Los nombres de campo con los que las gramáticas cuelgan el SUJETO de un
 * contenedor de switch — el mismo trío que `hypotheses/state.ts` ya usa para
 * la misma pregunta, duplicado a propósito (capas separadas).
 */
const SWITCH_SUBJECT_FIELDS = ["value", "subject", "condition"];

/** Un identificador cualquiera, en cualquier gramática soportada. */
const IDENTIFIER_NODE_TYPE = /identifier$/;

/**
 * La expresión condicional (ternario) de cada gramática — `ternary_expression`
 * en JS/TS/Java, `conditional_expression` en C#/Python, `conditional` a secas
 * en Ruby. Mismo criterio y mismo sufijo opcional que `code-grammar.ts`
 * documenta para `TERNARY_NAME`, duplicado a propósito (capas separadas).
 *
 * Existe por un caso MEDIDO, no por simetría: el ejemplo canónico del patrón
 * en el corpus asigna su campo de estado con
 * `campo = bandera ? Enum.A : Enum.B` en UNO de sus doce sitios, y tratar esa
 * forma como "valor calculado" borraba la máquina de estados entera. Elegir
 * entre dos constantes es elegir DENTRO del alfabeto: aporta las dos.
 */
const TERNARY_NODE_TYPE = /^(ternary|conditional)(_expression)?$/;

/**
 * Los nodos que ESCRIBEN algo, por familia de gramática. Hace falta además de
 * los campos `left`/`right`: en JS/Java/C#/Go un `binary_expression` (`a === b`)
 * TAMBIÉN expone `left` y `right`, así que un detector que sólo mire esos dos
 * campos lee cada comparación como una asignación — medido escribiendo este
 * archivo: con esa forma, toda condición `this.mode === "x"` entraba como
 * escritura y rompía el alfabeto de su propio campo.
 */
const ASSIGNMENT_NODE_TYPE = /(^|_)(assignment|assign)(_|$)/;

/**
 * El incremento/decremento, que NINGUNA gramática escribe como una asignación:
 * `inc_statement`/`dec_statement` en Go, `update_expression` en JS/TS/Java,
 * unario postfijo/prefijo en C#. Escribe el campo sin fijar un valor del
 * alfabeto — se comprueba además que el texto contenga `++`/`--`, porque el
 * unario postfijo de C# cubre también otras formas.
 */
const UPDATE_NODE_TYPE = /(^|_)(inc|dec|update|postfix_unary|prefix_unary)(_|$)/;

/**
 * Los nodos que INTRODUCEN un nombre local: la asignación (Python/Ruby crean
 * el local al asignar), la declaración corta de Go (`x := …`, un
 * `short_var_declaration` con `left`/`right` y SIN campo `name`), las
 * declaraciones con declarador (Java/C#/JS/TS/Go `var`) y las cabeceras de
 * bucle (`for x of …`, `for x in …`, `range` de Go).
 *
 * Medido escribiendo este archivo, y eran falsos de verdad: sin
 * `short_var_declaration` acá, `c.max = nameLen` con `nameLen := len(...)`
 * unas líneas más arriba se leía como un valor CONSTANTE, y tres acumuladores
 * de máximo entraban como alfabeto cerrado; sin `parameter`, el parámetro de
 * un `catch (Excepcion x)` tampoco se veía como local y `campo = x` entraba
 * como constante.
 */
const LOCAL_BINDING_NODE_TYPE = /(^|_)(assignment|assign|declaration|declarator|spec|for|range|clause|pattern|parameter)(_|$)/;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}

function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
}

function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isAssignmentLike(node: AstNode): boolean {
  return hasField(node, "left") && hasField(node, "right");
}

/**
 * El operador de una asignación, buscado por TRES vías porque las gramáticas
 * no coinciden — medido, no supuesto: en C# `assignment_expression` NO expone
 * un campo `operator`; lo cuelga como HIJO NOMBRADO de tipo
 * `assignment_operator`, así que leer sólo el campo devuelve `undefined` y un
 * `+=` pasa por asignación simple. Ese era un falso real:
 * `_charsUsed += charsRead` (un contador de buffer) entraba como si fijara un
 * valor del alfabeto. Las tres vías, en orden: el campo `operator`, un hijo
 * NOMBRADO cuyo tipo contiene "operator", y el token ANÓNIMO inmediatamente
 * ANTERIOR al `right`.
 *
 * La tercera vía busca hacia ATRÁS desde `right`, no hacia adelante desde el
 * principio, y eso también salió de un falso medido: la asignación ANOTADA de
 * Python (`self.x: bool = False`) cuelga DOS tokens anónimos —el `:` de la
 * anotación y el `=`— y el primero en orden de documento es el `:`. Leerlo
 * como operador convertía toda inicialización tipada en "valor calculado" y
 * borraba el campo entero del alfabeto.
 */
function assignmentOperatorOf(node: AstNode): string {
  const byField = node.childForFieldName("operator") as AstNode | null;
  if (byField) return byField.text;
  for (const c of namedChildren(node)) {
    if (/operator/.test(c.type)) return c.text;
  }
  const right = node.childForFieldName("right") as AstNode | null;
  let end = node.childCount;
  if (right) {
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i) as AstNode | null;
      if (c && c.startPosition.row === right.startPosition.row && c.startPosition.column === right.startPosition.column) {
        end = i;
        break;
      }
    }
  }
  for (let i = end - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c && !c.isNamed && /^[^\w\s]+$/.test(c.text)) return c.text;
  }
  return "=";
}

function unwrapSingleChild(node: AstNode): AstNode {
  const kids = namedChildren(node);
  return kids.length === 1 ? unwrapSingleChild(kids[0]!) : node;
}

function objectOf(node: AstNode): AstNode | null {
  for (const f of OBJECT_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && c !== obj) return c.text;
  }
  return null;
}

/**
 * ¿`node` nombra un campo del propio objeto? Las mismas tres vías por AST que
 * `temporary-field.ts#selfFieldNameOf`, ninguna léxica: el token con sigilo de
 * Ruby, un acceso cuyo receptor está en `selfNames` (`this`/`self`/receptor de
 * Go), o un identificador DESNUDO que la unidad-tipo declara como campo.
 */
function selfFieldNameOf(node: AstNode, selfNames: ReadonlySet<string>, declaredFields: ReadonlySet<string>): string | null {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  const obj = objectOf(node);
  if (obj && selfNames.has(obj.text)) return memberNameOf(node);
  if (IDENTIFIER_NODE_TYPE.test(node.type) && declaredFields.has(node.text)) return node.text;
  return null;
}

/** Único vehículo de Go para "campo propio"/"unidad-tipo dueña": el `receiver` de un método libre. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

/** Los nombres que `classNode` DECLARA como campos — igual que `temporary-field.ts`. */
function declaredFieldNames(classNode: AstNode): Set<string> {
  const names = new Set<string>();
  const decls: AstNode[] = [];
  findAllDescendants(classNode, (n) => FIELD_DECL_NODE_TYPE.test(n.type), 3, decls);
  for (const decl of decls) {
    const declarators: AstNode[] = [];
    findAllDescendants(decl, (n) => /declarator$/.test(n.type), 3, declarators);
    if (declarators.length > 0) {
      for (const d of declarators) {
        const name = (d.childForFieldName("name") as AstNode | null)?.text ?? namedChildren(d)[0]?.text ?? null;
        if (name) names.add(name);
      }
      continue;
    }
    const name = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
    if (name) names.add(name);
  }
  return names;
}

/** Los parámetros de `fnNode` — regla de sombreado, igual que `temporary-field.ts`. */
function parameterNamesOf(fnNode: AstNode): Set<string> {
  const names = new Set<string>();
  const paramsNode =
    (fnNode.childForFieldName("parameters") as AstNode | null) ??
    namedChildren(fnNode).find((c) => /parameter/i.test(c.type)) ??
    null;
  if (!paramsNode) return names;
  const idents: AstNode[] = [];
  findAllDescendants(paramsNode, (n) => IDENTIFIER_NODE_TYPE.test(n.type), 4, idents);
  for (const id of idents) names.add(id.text);
  return names;
}

/**
 * Los nombres que ESTE cuerpo introduce como locales. Se cosechan por FORMA, no
 * por gramática puntual: el lado `left` de cualquier nodo que tenga `left`
 * (asignación en Python/Ruby/JS, `for x in …`, `x := …` de Go) cuando es un
 * identificador desnudo, más el `name` de cualquier declarador/declaración.
 *
 * Sobre-cosechar acá sólo puede volver al detector MÁS estricto (un valor cuyo
 * nombre coincide con un local deja de contar como constante), nunca más
 * permisivo — que es la dirección segura para un ancla que se mide por
 * precisión.
 */
function localNamesOf(body: AstNode): Set<string> {
  const names = new Set<string>();
  const binders: AstNode[] = [];
  findAllDescendants(body, (n) => LOCAL_BINDING_NODE_TYPE.test(n.type), 12, binders);
  for (const n of binders) {
    // `left` (asignación, `:=`, cabecera de bucle) o `name` (declarador).
    // Se cosechan TODOS los identificadores del subárbol izquierdo a poca
    // profundidad, no sólo el primero: Go y Python escriben la asignación
    // múltiple (`a, b := …`, `a, b = …`) como una lista.
    let cosechado = false;
    for (const field of ["left", "name"]) {
      const side = n.childForFieldName(field) as AstNode | null;
      if (!side) continue;
      cosechado = true;
      const idents: AstNode[] = [];
      findAllDescendants(side, (x) => IDENTIFIER_NODE_TYPE.test(x.type), 3, idents);
      for (const id of idents) names.add(id.text);
    }
    // Respaldo por PRIMER HIJO NOMBRADO — el mismo que
    // `temporary-field.ts#declaredFieldNames` ya necesita, y por la misma
    // razón medida: el `variable_declarator` de C# no expone campo `name`
    // (`int count = …` cuelga `count` como primer hijo a secas), así que sin
    // este respaldo `count` no se reconocía como local y `_charsUsed = count`
    // entraba como valor constante. Sólo se acepta si ese hijo ES un
    // identificador: nunca se cosecha un tipo, un bloque ni una lista.
    if (!cosechado) {
      const first = namedChildren(n)[0];
      if (first && IDENTIFIER_NODE_TYPE.test(first.type)) names.add(first.text);
    }
  }
  return names;
}

/**
 * Los valores CONSTANTES que `node` aporta al alfabeto, o `null` si no aporta
 * ninguno porque el valor es calculado. Ver la condición (1) del docstring.
 *
 * Un valor simple pasa TRES pruebas, todas de forma:
 *
 *   a. ningún descendiente pertenece a una familia de nodo que calcule, llame
 *      o construya (`CALL_OR_COMPUTATION_NODE`);
 *   b. no es un acceso a un campo del propio objeto (un campo copiado a otro
 *      campo no es un valor del alfabeto: es un dato que viaja);
 *   c. su identificador RAÍZ —el primero en orden de documento, que es el que
 *      ancla la expresión— no es un parámetro ni un nombre local ni el nombre
 *      del receptor.
 *
 * Un literal no tiene identificadores: pasa (c) por vacío, que es lo correcto.
 * `Estado.INICIAL` tiene raíz `Estado`, que no es local ni parámetro: pasa.
 * `otro.campo` con `otro` parámetro: falla (c). `nodo` local: falla (c).
 *
 * Y UNA FORMA COMPUESTA: la expresión condicional (`bandera ? A : B`). Elegir
 * entre dos constantes es elegir DENTRO del alfabeto, así que aporta las dos —
 * ver `TERNARY_NODE_TYPE` para el caso medido que lo obliga. Si alguna rama no
 * es constante, la expresión entera no aporta nada.
 */
function constantValuesOf(
  node: AstNode,
  selfNames: ReadonlySet<string>,
  declaredFields: ReadonlySet<string>,
  locals: ReadonlySet<string>,
): string[] | null {
  if (TERNARY_NODE_TYPE.test(node.type)) {
    // NINGUNA de las siete gramáticas expone un campo `condition` en su
    // ternario (verificado por sonda directa contra los `.wasm`), y el orden
    // NO es el mismo en todas: JS/TS/Java/C#/Ruby ponen el sujeto primero
    // (`cond ? A : B`) y Python en el medio (`A if cond else B`). Así que no
    // se identifica el sujeto por posición: se acepta que A LO SUMO UN hijo
    // nombrado no sea constante —ése es el sujeto— y se exigen al menos dos
    // que sí lo sean. Un sujeto que además fuera constante sólo puede sumar
    // un valor de más al alfabeto, que es un piso: nunca puede crear un
    // hallazgo donde no había forma.
    const ramas = namedChildren(node);
    const out: string[] = [];
    let noConstantes = 0;
    for (const rama of ramas) {
      const vals = constantValuesOf(unwrapSingleChild(rama), selfNames, declaredFields, locals);
      if (!vals) {
        noConstantes++;
        if (noConstantes > 1) return null;
        continue;
      }
      out.push(...vals);
    }
    return out.length >= 2 ? out : null;
  }
  const offenders: AstNode[] = [];
  findAllDescendants(node, (n) => CALL_OR_COMPUTATION_NODE.test(n.type), 10, offenders);
  if (offenders.length > 0) return null;
  if (selfFieldNameOf(node, selfNames, declaredFields) !== null) return null;
  // El PROPIO OBJETO no es un valor del alfabeto. Falso medido: un portador de
  // instancia única (`campo = this` en un método, `campo = null` en otro) daba
  // dos "constantes" porque `this` no es un `identifier` en ninguna gramática
  // y por lo tanto pasaba la prueba (c) por vacío, igual que un literal.
  if (selfNames.has(node.text.trim())) return null;
  const idents: AstNode[] = [];
  findAllDescendants(node, (n) => IDENTIFIER_NODE_TYPE.test(n.type) || n.type === RUBY_IVAR_TYPE, 10, idents);
  const root = idents[0];
  if (!root) return [node.text.trim()];
  if (root.type === RUBY_IVAR_TYPE) return null;
  if (locals.has(root.text) || selfNames.has(root.text) || declaredFields.has(root.text)) return null;
  return [node.text.trim()];
}

/** Una asignación al campo, con lo único que decide: ¿el valor es constante y cuál es? */
interface Write {
  field: string;
  methodName: string;
  isConstructor: boolean;
  startLine: number;
  endLine: number;
  /** Los valores del alfabeto que ESTA asignación aporta; `null` cuando el
   *  valor NO es constante — una sola de éstas rompe el alfabeto. Es una LISTA
   *  y no un valor porque una expresión condicional entre constantes aporta
   *  las dos (ver `constantValuesOf`). */
  values: string[] | null;
}

/** Un miembro que DECIDE: lee el campo dentro de la condición de una rama. */
interface Decision {
  field: string;
  methodName: string;
  startLine: number;
  endLine: number;
}

function isConstructorMethod(fnNode: AstNode, methodName: string, file: FileUnit): boolean {
  if (file.sets.constructorNodes.has(fnNode.type)) return true;
  return CONSTRUCTOR_NAMES.has(methodName);
}

/**
 * Los subárboles que una gramática usa como CONDICIÓN de una rama dentro de
 * `body`: el campo `condition` de cualquier nodo que lo tenga (if/while/
 * ternario, en las 9 gramáticas) y el sujeto de un contenedor de switch (que
 * cada gramática cuelga de `value`, `subject` o `condition`).
 *
 * Se mira sólo el SUJETO, nunca el cuerpo de la rama: leer el campo DENTRO de
 * un `if` no es decidir por él.
 */
function conditionSubtrees(body: AstNode, switchContainerNodes: ReadonlySet<string>): AstNode[] {
  const out: AstNode[] = [];
  const all: AstNode[] = [];
  findAllDescendants(body, () => true, 14, all);
  for (const node of all) {
    const cond = node.childForFieldName("condition") as AstNode | null;
    if (cond) out.push(cond);
    if (!switchContainerNodes.has(node.type)) continue;
    for (const f of SWITCH_SUBJECT_FIELDS) {
      const subject = node.childForFieldName(f) as AstNode | null;
      if (subject) {
        out.push(subject);
        break;
      }
    }
  }
  return out;
}

interface Group {
  className: string;
  field: string;
  writes: Write[];
  decisions: Decision[];
}

export function computeEnumeratedFieldDispatchFindings(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
  const memberThreshold = ctx.threshold("miembrosQueDeciden");
  const valueThreshold = ctx.threshold("valoresDistintos");
  const groups = new Map<string, Group>();

  const visit = (node: AstNode, cls: { name: string; key: string; fields: ReadonlySet<string> } | null): void => {
    let nextCls = cls;
    if (file.sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, key: `${name}@${node.startPosition.row}`, fields: declaredFieldNames(node) };
    } else if (file.sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let methodCls = nextCls;
      if (goReceiver) {
        selfNames.add(goReceiver.paramName);
        methodCls = { name: goReceiver.typeName, key: `receiver:${goReceiver.typeName}`, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && methodCls) {
        const isCtor = isConstructorMethod(node, methodName, file);
        const shadowed = parameterNamesOf(node);
        const visibleFields = new Set([...methodCls.fields].filter((f) => !shadowed.has(f)));
        const locals = new Set([...localNamesOf(body), ...shadowed]);

        const groupFor = (field: string): Group => {
          const key = `${methodCls.key}::${field}`;
          const group = groups.get(key) ?? { className: methodCls.name, field, writes: [], decisions: [] };
          groups.set(key, group);
          return group;
        };

        // (1)+(2) — el alfabeto y la transición.
        const assigns: AstNode[] = [];
        findAllDescendants(body, (n) => ASSIGNMENT_NODE_TYPE.test(n.type) && isAssignmentLike(n), 12, assigns);
        for (const assign of assigns) {
          const leftRaw = (assign.childForFieldName("left") as AstNode | null) ?? null;
          const rightRaw = (assign.childForFieldName("right") as AstNode | null) ?? null;
          if (!leftRaw || !rightRaw) continue;
          const left = unwrapSingleChild(leftRaw);
          const right = unwrapSingleChild(rightRaw);
          const field = selfFieldNameOf(left, selfNames, visibleFields);
          if (!field) continue;
          // Un operador compuesto (`+=`, `||=`) actualiza sobre el valor previo:
          // nunca fija un valor del alfabeto. Se lee del campo genérico
          // `operator`, no por lenguaje.
          const operator = assignmentOperatorOf(assign);
          const simple = operator === "=" || operator === ":=";
          const values = simple ? constantValuesOf(right, selfNames, visibleFields, locals) : null;
          groupFor(field).writes.push({
            field,
            methodName,
            isConstructor: isCtor,
            startLine: assign.startPosition.row + 1,
            endLine: assign.endPosition.row + 1,
            values,
          });
        }

        // (1) bis — el INCREMENTO/DECREMENTO también escribe el campo, y nunca
        // fija un valor del alfabeto: actualiza sobre el valor previo, igual
        // que `+=`. Va aparte porque ninguna gramática lo escribe como una
        // asignación (`inc_statement`/`dec_statement` en Go,
        // `update_expression` en JS/TS/Java, unario postfijo/prefijo en C#).
        // Falso medido sin esto: el CONTADOR de lookahead de un lexer
        // (`campo = 1|2|3` más `campo++`/`campo--`) entraba como alfabeto
        // cerrado de tres valores.
        const updates: AstNode[] = [];
        findAllDescendants(body, (n) => UPDATE_NODE_TYPE.test(n.type) && /(\+\+|--)/.test(n.text), 12, updates);
        for (const upd of updates) {
          const target = unwrapSingleChild((upd.childForFieldName("argument") as AstNode | null) ?? namedChildren(upd)[0] ?? upd);
          const field = selfFieldNameOf(target, selfNames, visibleFields);
          if (!field) continue;
          groupFor(field).writes.push({
            field,
            methodName,
            isConstructor: isCtor,
            startLine: upd.startPosition.row + 1,
            endLine: upd.endPosition.row + 1,
            values: null,
          });
        }

        // (3) — la decisión repartida.
        for (const cond of conditionSubtrees(body, file.sets.switchContainerNodes)) {
          const reads: AstNode[] = [];
          findAllDescendants(cond, (n) => selfFieldNameOf(n, selfNames, visibleFields) !== null, 10, reads);
          const seen = new Set<string>();
          for (const read of reads) {
            const field = selfFieldNameOf(read, selfNames, visibleFields);
            if (!field || seen.has(field)) continue;
            seen.add(field);
            groupFor(field).decisions.push({
              field,
              methodName,
              startLine: cond.startPosition.row + 1,
              endLine: cond.endPosition.row + 1,
            });
          }
        }
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(file.root, null);

  // ANCLA CON ORDINAL — misma razón exacta que `temporary-field.ts` documenta:
  // `ids.ts#deriveAnchor` sólo mira `[clase, método]`, así que dos campos
  // distintos de la MISMA clase decididos en el MISMO método colapsarían en un
  // solo `Finding.id`. El ordinal es el índice del campo entre los campos que
  // disparan en SU clase, ordenados por nombre.
  const findings: RawFinding[] = [];
  const qualifying: { key: string; group: Group }[] = [];
  for (const [key, group] of groups) {
    if (group.writes.length === 0) continue;
    // (1) — el alfabeto tiene que estar CERRADO: una sola asignación no
    // constante y el campo deja de ser un discriminante.
    if (group.writes.some((w) => w.values === null)) continue;
    const values = new Set(group.writes.flatMap((w) => w.values as string[]));
    if (values.size < valueThreshold.value) continue;
    // (2) — transición fuera del constructor.
    if (!group.writes.some((w) => !w.isConstructor)) continue;
    // (3) — decisión repartida.
    const deciders = new Set(group.decisions.map((d) => d.methodName));
    if (deciders.size < memberThreshold.value) continue;
    qualifying.push({ key, group });
  }

  const fieldsByClass = new Map<string, string[]>();
  for (const { key, group } of qualifying) {
    const classKey = key.slice(0, key.lastIndexOf("::"));
    const list = fieldsByClass.get(classKey) ?? [];
    list.push(group.field);
    fieldsByClass.set(classKey, list);
  }
  for (const list of fieldsByClass.values()) list.sort();

  for (const { key, group } of qualifying) {
    const classKey = key.slice(0, key.lastIndexOf("::"));
    const siblings = fieldsByClass.get(classKey) ?? [group.field];
    const ordinal = siblings.length > 1 ? siblings.indexOf(group.field) : undefined;
    const values = [...new Set(group.writes.flatMap((w) => w.values as string[]))].sort();
    const deciders = [...new Set(group.decisions.map((d) => d.methodName))].sort();
    const writers = [...new Set(group.writes.map((w) => w.methodName))].sort();
    const transitions = group.writes.filter((w) => !w.isConstructor);

    const anchorOf = (methodName: string) => ({
      file: file.path,
      symbolPath: [group.className, methodName],
      ...(ordinal != null ? { ordinal } : {}),
    });

    const decisionPlaces: RoleLocation[] = [];
    const seenDeciders = new Set<string>();
    for (const d of group.decisions) {
      if (seenDeciders.has(d.methodName)) continue;
      seenDeciders.add(d.methodName);
      decisionPlaces.push({
        file: file.path,
        startLine: d.startLine,
        endLine: d.endLine,
        symbol: d.methodName,
        anchor: anchorOf(d.methodName),
        role: `decide según \`${group.field}\` (\`${group.className}#${d.methodName}\`)`,
      });
    }
    const writePlaces: RoleLocation[] = transitions.map((w) => ({
      file: file.path,
      startLine: w.startLine,
      endLine: w.endLine,
      symbol: w.methodName,
      anchor: anchorOf(w.methodName),
      role: `asigna \`${group.field}\` = ${(w.values ?? []).join(" | ")} (\`${group.className}#${w.methodName}\`)`,
    }));

    const [first, ...rest] = [...decisionPlaces, ...writePlaces].sort((a, b) => a.startLine - b.startLine);
    if (!first) continue;

    findings.push({
      title: `\`${group.className}.${group.field}\` decide el comportamiento de ${deciders.length} miembros y toma ${values.length} valores constantes`,
      detail:
        `El campo \`${group.field}\` de \`${group.className}\` recibe ${values.length} valores constantes distintos ` +
        `(${values.join(", ")}) y NINGÚN valor calculado, se reasigna fuera del constructor en ${transitions.length} ` +
        `sitio(s) —así que el objeto cambia su propio valor durante su vida— y ${deciders.length} miembros distintos ` +
        `(${deciders.join(", ")}) ramifican leyéndolo en la condición. Es una máquina de estados escrita a mano: el ` +
        "comportamiento depende de un valor interno de un conjunto cerrado, y la decisión está repetida en cada miembro " +
        "que la necesita, así que agregar un valor obliga a tocarlos todos.",
      trigger: [
        { label: "miembros que ramifican sobre el campo", value: deciders.length, threshold: memberThreshold },
        { label: "valores constantes distintos", value: values.length, threshold: valueThreshold },
      ],
      evidence: [
        { label: "miembros que reasignan el campo", value: writers.length, note: writers.join(", ") },
        { label: "reasignaciones fuera del constructor", value: transitions.length },
        { label: "valores del alfabeto", value: values.length, note: values.join(", ") },
      ],
      locations: [first, ...rest],
      severity: Math.min(100, 35 + deciders.length * 10 + values.length * 5),
      advice: {
        primary: {
          name: "Replace Conditional with Polymorphism",
          kind: "refactorizacion",
          why: "Cada miembro que pregunta por el mismo campo repite la misma tabla de decisión: mover el cuerpo de cada rama al tipo que representa ese valor deja un solo lugar donde agregar un valor nuevo.",
          source: "https://refactoring.guru/es/replace-conditional-with-polymorphism",
        },
        pattern: {
          name: "State",
          kind: "patron_de_diseno",
          why: "Un campo con un conjunto cerrado de valores que el propio objeto reasigna, y del que dependen las ramas de varios miembros, ES una máquina de estados implícita: State la vuelve explícita, con un tipo por valor y la transición dentro de esos tipos.",
          source: "https://refactoring.guru/es/design-patterns/state",
          caveat:
            "Sólo aplica si las ramas cambian COMPORTAMIENTO. Si cada rama sólo devuelve un dato distinto (una tabla de traducción), la respuesta es una tabla, no una jerarquía.",
          cost: "Una clase por valor más la lógica de transición mudada a esas clases: con dos valores estables y ramas de una línea es más estructura que beneficio.",
        },
      },
    });
  }
  return findings;
}

export const detector: IntraFileDetector<ThresholdKey, "enumerated-field-dispatch"> = {
  id: "enumerated-field-dispatch",
  kind: "enumerated-field-dispatch",
  scope: "intra-file",
  title: "Campo enumerado que decide el comportamiento",
  // SIN `needs: ["unidad-tipo-clase"]`, misma razón exacta que
  // `temporary-field.ts`/`lazy-init-repetida.ts` documentan: la forma "dueño de
  // campos" se reconoce por DOS vías independientes — la gramática
  // (`classNodes`) y el receptor de método de Go — y Go no declara esa
  // capacidad pese a tener la forma.
  needs: [],
  thresholds: {
    miembrosQueDeciden: pisoDeclarado(2, {
      rationale:
        "Con UN solo miembro que ramifica sobre el campo no hay dispersión que resolver: la decisión está en un lugar y ahí una tabla o una función alcanzan. El problema que State nombra —refactoring.guru/design-patterns/state, sección Problem: 'conditionals in every method'— aparece cuando la MISMA decisión está repetida en más de un miembro, porque entonces agregar un valor obliga a tocarlos todos. Dos es el mínimo en el que la palabra 'repetida' significa algo; es el mismo piso que hypotheses/state.ts usa desde su primera versión (STATE_MIN_METHODS).",
    }),
    valoresDistintos: pisoDeclarado(2, {
      rationale:
        "Un campo con UN solo valor constante no es un alfabeto: es una inicialización o una bandera que se enciende y no se apaga, y no hay comportamiento alterno que elegir. Dos valores distintos es el mínimo en el que existe una alternativa, y por lo tanto lo mínimo que puede llamarse estado. No es un piso calibrado dentro de un rango: por debajo la forma no existe.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return computeEnumeratedFieldDispatchFindings(file, ctx);
  },
};
