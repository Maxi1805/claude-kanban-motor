/**
 * `imports` — IMPORT / require / using, donde el lenguaje lo tiene
 * (CONTRATO-F4.md §2, arista "import"; medición previa en jekyll: 6 aristas
 * de import contra 303 de referencia).
 *
 * RELACIÓN: este ARCHIVO depende de OTRO módulo/archivo/paquete nombrado en
 * un statement de importación de nivel superior. Es un hallazgo DE ARCHIVO
 * (`fromPath: []`), nunca de un símbolo dentro de él — a diferencia de
 * `extends`/`implements`/`mixes-in`, que apuntan desde un símbolo declarante
 * concreto.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO — Y POR QUÉ NO USA `discoverCarrier`:
 * `discoverCarrier`/`probeSlot` (`graph/edges/sentinel.ts`) generalizan
 * `isClassLike` (`hasField('name') && !isFunctionLike`) para localizar el
 * NODO DECLARANTE de `from` y buscar `to` colgando de él — el mecanismo que
 * ya sirve a `extends`/`implements`/`mixes-in`/`instantiates`, todos
 * relaciones SÍMBOLO → SÍMBOLO con un declarante nombrado. Un import NO
 * tiene declarante: no hay ninguna "clase que se llama X" de la cual `to`
 * cuelgue — es un statement de nivel de archivo. Verificado por sonda
 * directa (`scratchpad/probe-imports.mjs` de esta tarea) contra las 8
 * gramáticas: `import_statement`(TS/JS)/`import_declaration`(Java/Go)/
 * `using_directive`(C#) NUNCA exponen un campo `name` que sirva de ancla
 * `from` con sentido semántico de "declarante" (Python es la única
 * excepción accidental — su `import_statement` SÍ expone `name` — pero
 * generalizar a partir de esa coincidencia rompería en los otros 7). Por eso
 * este extractor implementa su PROPIO mecanismo, anclado a sonda centinela
 * de la MISMA forma que `discoverCarrier` (DFS a una hoja de texto conocido,
 * `fieldNameForChild` para el camino de vuelta) pero adaptado a la forma
 * real de un import: nivel de archivo, con el campo que lleva el
 * especificador variando por lenguaje. Cada campo usado abajo (`source`,
 * `module_name`/`name`, `path`) está CITADO — verificado por sonda directa
 * antes de escribir esta lógica, nunca asumido (mismo estándar que
 * `mixin.ts`, que hace lo mismo con `arguments`/`name`/`scope`/`body`).
 *
 * `IMPORT_STATEMENT_WORD` es vocabulario GENÉRICO (nunca nombre de nodo
 * completo), duplicado A PROPÓSITO de `detect/capabilities.ts#IMPORT_WORD`
 * (mismo patrón que `TERNARY_NAME` duplicado entre `code-grammar.ts` y
 * `capabilities.ts`) — y ENSANCHADO: `IMPORT_WORD` está anclado a un sufijo
 * fijo (`_declaration|_statement`) y por sonda directa NO reconoce
 * `using_directive` (sufijo `_directive`) ni `import_from_statement`
 * (Python: tiene `_from_` en el medio, rompe el anclaje de sufijo). La
 * variante de acá pide sólo que `import`/`require`/`using` aparezca como
 * SEGMENTO completo delimitado por `_`/inicio/fin — sin sufijo fijo — y se
 * aplica SÓLO a hijos DIRECTOS de la raíz del archivo (nunca un walk
 * ciego), así que no confunde el statement con `import_spec`/
 * `import_specifier` anidados (que sí contienen el segmento "import" pero
 * nunca son hijos directos de la raíz).
 *
 * SIMPLIFICACIÓN DECLARADA: `toQualifier` queda SIEMPRE `[]` para esta
 * arista. A diferencia de `extends`/`implements` (que apuntan a UN símbolo
 * con un calificador de namespace), un import de módulo completo
 * (`import pkg.mod`, `import "./a/b"`) no tiene un "nombre" distinguible de
 * su "calificador" de forma consistente entre lenguajes — partir el último
 * segmento asumiría que ese segmento es siempre la unidad resolvible, falso
 * para un import de módulo/paquete entero. `toName` lleva el especificador
 * CRUDO COMPLETO tal cual escrito (comillas quitadas si es un string
 * literal). Resolver ese texto a un archivo del repo (relativo, alias,
 * índice implícito, extensión omitida) es trabajo de integración de
 * `build.ts` sobre `EdgeFacts.toName`, fuera de este extractor — que sólo
 * garantiza la extracción exacta del texto, no su resolución.
 *
 * LÍMITES POR LENGUAJE (verificados por sonda directa):
 *  - Ruby: SIN nodo de import — `require`/`require_relative` parsean como
 *    `call` (`[method] identifier "require"` + `[arguments] argument_list`),
 *    el mismo nodo que cualquier otra invocación. **A7 (Ola 11b): eso ya NO
 *    lo deja afuera.** La misma forma de LLAMADA que este archivo ya
 *    reconocía para el `require` de CommonJS (`importCallTarget` abajo)
 *    cubre Ruby sin una sola rama por lenguaje: el criterio es "un nodo de
 *    llamada cuyo campo de nombre de callee es un identificador desnudo del
 *    vocabulario `IMPORT_STATEMENT_WORD` y cuyo primer argumento es un
 *    literal de string". Medido sobre `tests/fixtures/edge-emision/ruby`:
 *    0 → 2 aristas `imports`. Sigue en pie que el autoloading de Rails hace
 *    que muchas dependencias no tengan `require` textual — eso es menos
 *    recall, no cero.
 *  - Sólo se buscan imports como hijos DIRECTOS de la raíz del archivo. Un
 *    `using` de C# envuelto en un `namespace Foo { }` de bloque (estilo
 *    legacy, no file-scoped) queda FUERA — confirmado por sonda directa
 *    (`namespace_declaration` anida `using_directive` dos niveles adentro,
 *    vía su campo `body`). Ampliar a ese caso es una brecha declarada, no
 *    manejada.
 */
import type { EdgeContext, EdgeExtractor, EdgeFacts } from "./types.js";
import type { AstNode } from "../../detect/types.js";

/** Superficie extra que un `AstNode` real expone y la interfaz angosta del
 *  proyecto no declara — mismo cast puntual que `graph/edges/sentinel.ts`
 *  ya documenta para `fieldNameForChild`. */
interface FieldNamedNode extends AstNode {
  fieldNameForChild(index: number): string | null;
}

function fieldName(node: AstNode, index: number): string | null {
  const fa = node as FieldNamedNode;
  return typeof fa.fieldNameForChild === "function" ? fa.fieldNameForChild(index) : null;
}

/**
 * Vocabulario genérico — ver el docstring del módulo. Aplicado SÓLO a hijos
 * directos de la raíz del archivo, nunca en un walk ciego.
 */
const IMPORT_STATEMENT_WORD = /(^|_)(import|require|using)(_|$)/;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.isNamed) out.push(child);
  }
  return out;
}

/** Quita un par de comillas envolventes (`"`/`'`/`` ` ``) si las hay — el
 *  texto de un nodo `string`/`interpreted_string_literal` las incluye en su
 *  propio span. Prueba de FORMA (primer/último carácter), no de lenguaje. */
function stripQuotes(text: string): string {
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first === last && (first === '"' || first === "'" || first === "`")) {
      return text.slice(1, -1);
    }
  }
  return text;
}

/**
 * TS/JS/TSX/Vue (misma sintaxis ES module en las cuatro gramáticas —
 * verificado por sonda directa: `import_statement` con campo `source`
 * idéntico en javascript/typescript/tsx). Cubre tanto el import por defecto
 * (`import Def from "..."`) como el nombrado/alias (`import { A, B as C }
 * from "..."`): en ambos casos el ÚNICO campo relevante para la arista de
 * archivo es `source` — el resto son bindings locales, fuera de alcance
 * (ver SIMPLIFICACIÓN DECLARADA arriba: `toQualifier` no diferencia nombres
 * importados).
 */
function ecmaTarget(stmt: AstNode): AstNode | null {
  return stmt.childForFieldName("source") as AstNode | null;
}

/**
 * Un `import X as Y` bare (SIN `from`) etiqueta su campo `name` con un
 * `aliased_import` — el MISMO nodo contenedor que envuelve un símbolo
 * aliasado dentro de un `from X import A as B` — cuyo propio texto incluye
 * el alias completo (`"collections.abc as cabc"`). Verificado por sonda
 * directa: encontrado como bug real corriendo este extractor contra el
 * corpus (`import collections.abc as cabc` daba `toName` con `" as cabc"`
 * pegado). Se desenvuelve UN nivel por FORMA (¿el nodo tiene, él mismo, un
 * campo `name`? — el mismo campo que ya usamos para llegar hasta acá,
 * reconocido recursivamente, nunca por el nombre de tipo `aliased_import`):
 * un `dotted_name` no tiene campo `name` propio y queda intacto; un
 * `aliased_import` sí, y desenvolverlo da el `dotted_name` real, sin su
 * alias.
 */
function unwrapAliasedTarget(node: AstNode | null): AstNode | null {
  if (!node) return null;
  const inner = node.childForFieldName("name") as AstNode | null;
  return inner ?? node;
}

/**
 * Python: `import_statement` (bare, campo `name`) e `import_from_statement`
 * (campo `module_name` + uno o más campos `name`/`aliased_import` para los
 * símbolos importados). Se prueba `module_name` PRIMERO — presente sólo en
 * el segundo caso — y se cae a `name` sólo si `module_name` está ausente,
 * así nunca se confunde el módulo con un símbolo importado (que también usa
 * el campo `name`, verificado por sonda directa: `from X import Y` etiqueta
 * TANTO el módulo como cada símbolo con nombres de campo que colisionan
 * salvo por este orden de prioridad). Import relativo (`from . import x`):
 * `module_name` resuelve a un nodo `relative_import` sin más contenido que
 * los puntos — se toma su texto crudo tal cual (p.ej. `"."`), sin resolver.
 *
 * LÍMITE declarado, encontrado corriendo contra el corpus real: `from
 * __future__ import annotations` usa una TERCERA forma de statement
 * (`future_import_statement`) que NO expone `module_name` — el pseudo-módulo
 * `__future__` es un token anónimo fijo de esa regla de gramática, sin campo
 * — y caería al `name` (el rasgo importado, p.ej. `"annotations"`), NO al
 * módulo. Se distingue por FORMA, sin leer el texto de ningún keyword: un
 * `import X` bare tiene un solo hijo anónimo (`import`); esta tercera forma
 * tiene dos o más (`from`, el pseudo-módulo, `import`). Con `module_name`
 * ausente Y dos o más hijos anónimos, el módulo no es recuperable por campo:
 * se declara la brecha y NO se emite arista (en vez de apuntar, por error,
 * al rasgo importado). `__future__` nunca resuelve a un archivo real de
 * todos modos, así que la brecha no cuesta cobertura útil.
 */
/**
 * ARREGLADO (frente A2a, ola N — MEDIDO por sonda directa antes del fix,
 * `scratchpad/a2a/probe-shape.mts`): `from . import x, y` — la forma con la
 * que un archivo de inicialización de paquete reexporta sus propios
 * submódulos, o sea EL BARRIL de Python — deja `module_name` en un nodo cuyo
 * texto es SÓLO PUNTOS (`"."`, `".."`). Ese texto viajaba tal cual como
 * `toName` y `resolveImportTarget` lo resolvía al DIRECTORIO del archivo,
 * que nunca es una ruta conocida: la arista se perdía entera y el submódulo
 * quedaba sin consumidor.
 *
 * Cuando el módulo de origen no tiene parte de NOMBRE (sólo el prefijo de
 * nivel), los nombres importados NO son símbolos dentro de un módulo: son,
 * ellos mismos, los módulos hermanos. Se emite un especificador por cada uno,
 * concatenando el prefijo de puntos con el nombre — `.x`, `..y` — que es
 * exactamente la forma que `relativeSegments` ya sabe leer. Criterio de
 * FORMA, no de lenguaje: "el nodo de módulo no aporta ningún carácter que no
 * sea un punto". Si el módulo SÍ tiene nombre (`from .pkg import x`) no
 * cambia nada: sigue devolviendo un solo destino, byte-idéntico.
 *
 * Un nombre importado que resulta ser un SÍMBOLO y no un submódulo
 * (`from . import CONSTANT`, legal cuando el paquete lo reexporta) no
 * empareja ningún archivo y `resolveImportTarget` devuelve `null` — el mismo
 * "nunca se adivina" de siempre, sin arista espuria.
 */
const ONLY_DOTS = /^\.+$/;

function pythonRelativeMemberTargets(stmt: AstNode): { locationNode: AstNode; target: AstNode }[] {
  const moduleName = stmt.childForFieldName("module_name") as AstNode | null;
  if (!moduleName || !ONLY_DOTS.test(moduleName.text)) return [];
  const out: { locationNode: AstNode; target: AstNode }[] = [];
  for (let i = 0; i < stmt.childCount; i++) {
    if (fieldName(stmt, i) !== "name") continue;
    const child = unwrapAliasedTarget(stmt.child(i) as AstNode | null);
    if (child && child.text.length > 0) out.push({ locationNode: stmt, target: child });
  }
  return out;
}

function pythonTarget(stmt: AstNode): AstNode | null {
  const moduleName = stmt.childForFieldName("module_name") as AstNode | null;
  if (moduleName) return moduleName;
  let anonCount = 0;
  for (let i = 0; i < stmt.childCount; i++) {
    const child = stmt.child(i) as AstNode | null;
    if (child && !child.isNamed) anonCount++;
  }
  if (anonCount > 1) return null;
  return unwrapAliasedTarget(stmt.childForFieldName("name") as AstNode | null);
}

/**
 * ¿El texto de este nodo tiene forma de NOMBRE CALIFICADO — uno o más
 * segmentos identificador separados por puntos? Prueba de FORMA sobre el
 * texto, nunca sobre el tipo de nodo (que se llama `scoped_identifier` en
 * Java y `qualified_name` en C#). `\p{L}`/`\p{N}` con la bandera `u` porque
 * ningún lenguaje del corpus restringe sus identificadores a ASCII.
 */
const QUALIFIED_NAME_SHAPE = /^[\p{L}_$][\p{L}\p{N}_$]*(\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u;

/**
 * Java (`import_declaration`) y C# (`using_directive`): ninguno de los dos
 * conecta el statement con el nombre calificado por un CAMPO — es
 * posicional (verificado por sonda directa). Java sólo tiene un hijo
 * nombrado relevante (el `import`/`static` inicial y el `;` final son
 * anónimos). C# en su forma `using Alias = X.Y;` tiene DOS hijos nombrados:
 * `name_equals` (el alias local, precede al target) y el nombre calificado
 * real — de ahí "el ÚLTIMO hijo nombrado", que en la forma simple
 * (`using X.Y;`, un solo hijo nombrado) también es correcto por trivialidad.
 *
 * ARREGLADO (frente A2a, ola N — MEDIDO por sonda directa antes del fix,
 * `scratchpad/a2a/probe-shape.mts`): `import static com.google.common.base.
 * Preconditions.*;` — la forma de import estático COMODÍN, masiva en Java
 * real — parsea con TRES hijos nombrados relevantes: el `scoped_identifier`
 * con el nombre calificado, y DESPUÉS un nodo `asterisk` cuyo texto es
 * literalmente `"*"`. "El último hijo nombrado" agarraba el asterisco y
 * emitía `toName: "*"`, un especificador que ninguna resolución puede usar
 * (`dottedSuffixTarget` lo descarta por su piso de 2 segmentos) — o sea, la
 * arista se perdía entera. Se camina hacia atrás desde el final hasta el
 * primer hijo nombrado cuyo TEXTO tenga forma de nombre calificado
 * (`QUALIFIED_NAME_SHAPE`): el asterisco no la tiene y se saltea; el
 * `name_equals` de C# (`"Alias ="`, con espacio y `=`) tampoco, así que el
 * caso `using Alias = X.Y;` sigue resolviendo al mismo nodo que antes por
 * la vía normal (el último hijo SÍ es el nombre calificado). Byte-idéntico
 * para toda forma en la que el último hijo nombrado ya era el nombre.
 */
function lastNamedChildTarget(stmt: AstNode): AstNode | null {
  const children = namedChildren(stmt);
  for (let i = children.length - 1; i >= 0; i--) {
    if (QUALIFIED_NAME_SHAPE.test(children[i]!.text)) return children[i]!;
  }
  return null;
}

/**
 * Go agrupa imports en un bloque `import (...)` con N `import_spec`
 * hermanos (o, sin paréntesis, un `import_spec` único directo) — ambas
 * formas verificadas por sonda directa. En cualquiera de las dos, cada
 * `import_spec` real (con o sin alias de paquete) expone el campo `path`
 * — nunca `name` (reservado al alias). Caminar TODO el subárbol del
 * statement recolectando cada nodo con campo `path` cubre ambas formas sin
 * distinguir "agrupado" de "simple": la forma simple es, estructuralmente,
 * un grupo de tamaño uno.
 */
/** Devuelve, por cada `import_spec` real dentro del bloque, el par (nodo que
 *  ancla la posición — el propio `import_spec`, nunca el bloque entero — y
 *  el nodo hoja con el especificador). Así un bloque `import (...)` con N
 *  entradas reporta N líneas DISTINTAS, no la misma línea del bloque N veces. */
function goTargets(stmt: AstNode): { locationNode: AstNode; target: AstNode }[] {
  const out: { locationNode: AstNode; target: AstNode }[] = [];
  const visit = (node: AstNode): void => {
    const path = node.childForFieldName("path") as AstNode | null;
    if (path) {
      out.push({ locationNode: node, target: path });
      return; // no bajar más: `path` es la hoja que nos interesa de este `import_spec`.
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(stmt);
  return out;
}

function makeFact(locationNode: AstNode, target: AstNode, overrideName?: string): EdgeFacts {
  const toName = overrideName ?? stripQuotes(target.text);
  return {
    extractorId: importsExtractor.id,
    kind: "imports",
    fromPath: [],
    toName,
    toQualifier: [],
    provenance: "declared",
    startLine: locationNode.startPosition.row + 1,
    endLine: locationNode.endPosition.row + 1,
    via: `${locationNode.type}`,
  };
}

/**
 * Campos con que las 9 gramáticas nombran el CALLEE de una llamada —
 * `function` (JS/TS/TSX/Vue `call_expression`, Python, Go, C#), `method`
 * (Ruby `call`), `name` (Java `method_invocation`). Vocabulario de CAMPOS
 * (forma), no de tipos de nodo ni de lenguajes: el MISMO trío que
 * `graph/references.ts#CALLEE_NAME_FIELDS` ya verificó por sonda directa
 * contra las 9 gramáticas, duplicado acá a propósito por la misma razón por
 * la que este archivo duplica `IMPORT_STATEMENT_WORD` (el split de módulos
 * prohíbe importar entre `graph/edges/*` y `graph/references.ts`).
 */
const CALLEE_NAME_FIELDS = ["function", "method", "name"];

/** El primer campo de argumentos que resuelva — `arguments` (JS/TS/Python/Go/Ruby) o `argument_list` (C#/Java). Mismo par que `references.ts#hasArgumentsField`. */
function argumentsNode(node: AstNode): AstNode | null {
  return (node.childForFieldName("arguments") as AstNode | null) ?? (node.childForFieldName("argument_list") as AstNode | null);
}

/** ¿El texto de este nodo es un literal de string? Prueba de FORMA (primer y último carácter son la MISMA comilla), la misma que `stripQuotes` de arriba — nunca por tipo de nodo, que se llama `string` en Ruby/Python, `string_literal` en Java/C#/Go e `interpreted_string_literal` en Go. */
function isStringLiteral(node: AstNode): boolean {
  const t = node.text;
  if (t.length < 2) return false;
  const first = t[0];
  return t[t.length - 1] === first && (first === '"' || first === "'" || first === "`");
}

/**
 * A7 (Ola 9, F6 para CommonJS; Ola 11b para Ruby) — el import escrito como
 * LLAMADA, no como declaración. Medido en cero en lodash (100% CommonJS, sin
 * un solo `import` ES) y en jekyll (Ruby, sin nodo de import en absoluto).
 *
 * NINGUNA gramática distingue esta forma de cualquier otra llamada
 * (verificado por sonda directa: `const foo = require("bar")` y
 * `require("bar");` en JS parsean SIN ningún nodo propio de import; en Ruby
 * `require "app/document"` es un `call` con `[method] identifier "require"` y
 * `[arguments] argument_list`, indistinguible de `foo.bar "x"`). El criterio
 * es por FORMA y con el vocabulario que este archivo YA declara genérico:
 *
 *   1. el nodo resuelve un campo de nombre de callee (`CALLEE_NAME_FIELDS`);
 *   2. ese callee es un IDENTIFICADOR DESNUDO (`identifier`, nunca un acceso
 *      a miembro) cuyo TEXTO matchea `IMPORT_STATEMENT_WORD` — la MISMA
 *      regex que este archivo aplica a los tipos de nodo, acá aplicada al
 *      nombre de la función; `require`, `require_relative`, `import` (el
 *      `import()` dinámico de ES) y `using` entran; `requireAuth`/
 *      `importData` NO (la regex exige `_` o fin de cadena después del
 *      segmento). Que TODO `require_*` en snake_case entre es DELIBERADO y
 *      verificado contra las formas reales: `require_relative`,
 *      `require_dependency` (Rails) y `require_all` (gem homónimo) son las
 *      tres un import, no tres funciones distintas que casualmente empiezan
 *      igual — y el punto 4 (literal de string) descarta lo que no lo sea;
 *   3. el nodo resuelve un campo de argumentos;
 *   4. el PRIMER argumento con nombre es un LITERAL DE STRING. Sin este
 *      punto, `require File.expand_path("...")` (forma real y frecuente en
 *      Ruby) emitiría un `toName` con el texto de la expresión entera —
 *      basura que ninguna resolución puede usar. Mismo criterio de "un
 *      import, un destino" que el resto de este extractor.
 */
function importCallTarget(node: AstNode): AstNode | null {
  let callee: AstNode | null = null;
  for (const field of CALLEE_NAME_FIELDS) {
    const c = node.childForFieldName(field) as AstNode | null;
    if (c) {
      callee = c;
      break;
    }
  }
  if (!callee || callee.type !== "identifier" || !IMPORT_STATEMENT_WORD.test(callee.text)) return null;
  const args = argumentsNode(node);
  if (!args) return null;
  for (const child of namedChildren(args)) return isStringLiteral(child) ? child : null;
  return null;
}

/**
 * ¿Este tipo de nodo es una LLAMADA? Vocabulario de tipo de nodo de
 * tree-sitter (permitido, ver la regla de genericidad), verificado por sonda
 * directa contra las 9 gramáticas: `call_expression` (JS/TS/TSX/Vue/Go),
 * `call` (Python/Ruby), `method_invocation` (Java), `invocation_expression`
 * (C#). Sirve SÓLO como guarda barata del recorrido profundo de abajo: sin
 * ella, cada nodo del archivo pagaría cinco `childForFieldName` (tres de
 * callee, dos de argumentos) para descartarse.
 */
const CALL_NODE_WORD = /(^|_)(call|invocation)(_|$)/;

/**
 * Los pares (nodo de ubicación, nodo de destino) de TODAS las llamadas de
 * import de nivel superior que `stmt` contiene — ninguna, una, o varias
 * (declaración múltiple). Tres envoltorios, verificados por sonda directa:
 *   - el statement ES la llamada (Ruby: `require "x"` cuelga como `call`
 *     directo de `program`);
 *   - `expression_statement` con la llamada adentro (JS: `require("x");`);
 *   - `const/let/var X = require("spec")` — uno o varios
 *     `variable_declarator` por statement (`const a = require(x), b =
 *     require(y)` es legal) — la llamada cuelga del campo `value` de CADA
 *     declarator, y el declarator (no el statement) es el nodo de ubicación,
 *     para que dos requires en una línea no reporten la misma posición.
 */
function importCallTargets(stmt: AstNode): { locationNode: AstNode; target: AstNode }[] {
  const out: { locationNode: AstNode; target: AstNode }[] = [];
  const direct = importCallTarget(stmt);
  if (direct) return [{ locationNode: stmt, target: direct }];
  if (stmt.type === "expression_statement") {
    for (const child of namedChildren(stmt)) {
      const target = importCallTarget(child);
      if (target) out.push({ locationNode: stmt, target });
    }
    return out;
  }
  if (stmt.type === "lexical_declaration" || stmt.type === "variable_declaration") {
    for (const declarator of namedChildren(stmt)) {
      if (declarator.type !== "variable_declarator") continue;
      const value = declarator.childForFieldName("value") as AstNode | null;
      const target = value ? importCallTarget(value) : null;
      if (target) out.push({ locationNode: declarator, target });
    }
    return out;
  }
  return [];
}

/** Un statement de import de nivel superior no tiene por qué ser único: se
 *  colapsa a un `EdgeFacts` por statement (Go puede aportar varios, uno por
 *  `import_spec` agrupado). `toName` vacío tras quitar comillas (import
 *  malformado / hoja sin texto) se descarta: nunca se emite una arista sin
 *  destino. */
function factsFor(language: string, stmt: AstNode): EdgeFacts[] {
  if (language === "javascript" || language === "typescript" || language === "tsx" || language === "vue") {
    const target = ecmaTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "python") {
    // `from . import x, y` — un destino por nombre importado, ver
    // `pythonRelativeMemberTargets`. El prefijo de puntos del propio nodo de
    // módulo se antepone para que el especificador quede en la forma
    // relativa que `relativeSegments` ya sabe leer.
    const members = pythonRelativeMemberTargets(stmt);
    if (members.length > 0) {
      const dots = (stmt.childForFieldName("module_name") as AstNode).text;
      return members.map(({ locationNode, target }) => makeFact(locationNode, target, `${dots}${target.text}`));
    }
    const target = pythonTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "java" || language === "csharp") {
    const target = lastNamedChildTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "go") {
    return goTargets(stmt)
      .filter(({ target }) => target.text.length > 0)
      .map(({ locationNode, target }) => makeFact(locationNode, target));
  }
  return [];
}

/**
 * La forma DECLARACIÓN (`factsFor`, por lenguaje) y la forma LLAMADA
 * (`importCallTargets`, por forma) se prueban sobre CADA hijo directo de la
 * raíz, en ese orden y sin exclusión mutua por lenguaje. La segunda ya no
 * está acotada a las 4 gramáticas ECMA (Ola 11b): el criterio de
 * `importCallTarget` es de forma pura y una gramática sin llamadas de import
 * en el nivel superior simplemente no matchea nada — que es exactamente lo
 * que pasa hoy con Java, C# y Go, verificado por test.
 */
function collect(root: AstNode, language: string): EdgeFacts[] {
  const out: EdgeFacts[] = [];
  for (let i = 0; i < root.childCount; i++) {
    const stmt = root.child(i) as AstNode | null;
    if (!stmt || !stmt.isNamed) continue;
    if (IMPORT_STATEMENT_WORD.test(stmt.type)) {
      out.push(...factsFor(language, stmt));
      continue;
    }
    // RE-EXPORT (`export ... from "x"`): mismo campo `source`, misma
    // dependencia de módulo — ver `moduleSourceTarget`.
    const source = moduleSourceTarget(stmt);
    if (source && source.text.length > 0) {
      out.push(makeFact(stmt, source));
      continue;
    }
    for (const { locationNode, target } of importCallTargetsDeep(stmt)) {
      if (target.text.length > 0) out.push(makeFact(locationNode, target));
    }
  }
  return out;
}

/**
 * ARREGLADO (frente A2a, ola N): la regla "sólo hijos DIRECTOS de la raíz"
 * dejaba afuera el import escrito como llamada ANIDADA — y esa forma no es
 * un caso raro, es **la causa medida de 12 de los 31 falsos positivos
 * juzgados a mano de `orphan-file`** (`tests/golden/precision/
 * eslint.verdicts.csv`, notas "mapa de lazy-loading"): un módulo índice que
 * mapea nombre → cargador perezoso
 *
 *     module.exports = { "no-sync": () => require("./no-sync"), ... }
 *
 * carga a sus vecinos con un `require` que vive DENTRO de una lambda, dentro
 * de un objeto literal, dentro de una asignación. Cada uno de esos vecinos
 * quedaba, para el grafo, sin un solo consumidor. La misma forma aparece en
 * Ruby (`require` dentro de una clase o de un `begin/rescue`), en Python
 * (`import` diferido dentro de una función para romper un ciclo) y en el
 * `import()` dinámico de ES dentro de un `await`.
 *
 * Un import diferido ES una dependencia de módulo real — sólo que resuelta
 * en tiempo de ejecución en vez de al cargar — así que no hay ninguna razón
 * estructural para contarlo distinto. Se recorre el subárbol entero del
 * statement, con la guarda barata `CALL_NODE_WORD` para no pagar búsquedas
 * de campo en cada nodo, y se DEDUPLICA contra lo que las tres formas de
 * nivel superior ya reportaron (por posición del nodo de destino) para que
 * la ubicación preferida de esas formas — el `variable_declarator`, no el
 * `call_expression` — siga siendo la que se reporta. Comportamiento
 * byte-idéntico para todo archivo que sólo tenga imports de nivel superior.
 */
function importCallTargetsDeep(stmt: AstNode): { locationNode: AstNode; target: AstNode }[] {
  const out = importCallTargets(stmt);
  const seen = new Set(out.map(({ target }) => `${target.startPosition.row}:${target.startPosition.column}`));
  const visit = (node: AstNode): void => {
    if (CALL_NODE_WORD.test(node.type)) {
      const target = importCallTarget(node);
      const key = target ? `${target.startPosition.row}:${target.startPosition.column}` : null;
      if (target && key !== null && !seen.has(key)) {
        seen.add(key);
        out.push({ locationNode: node, target });
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(stmt);
  return out;
}

/**
 * ARREGLADO (frente A2a, ola N) — EL BARRIL DE RE-EXPORT, la RAÍZ 1 de este
 * frente. MEDIDO por sonda directa antes del fix
 * (`scratchpad/a2a/probe-reexport.mts`): `export * from "./x"`,
 * `export * as ns from "./x"`, `export { A } from "./x"` y
 * `export type { A } from "./x"` daban **CERO** aristas `imports` en las
 * cuatro gramáticas ECMA (typescript/javascript/tsx/vue). No por un defecto
 * de la extracción del especificador — el nodo `export_statement` expone el
 * MISMÍSIMO campo `source` que `import_statement`, y `ecmaTarget` ya lo lee
 * — sino porque el filtro de entrada de `collect` sólo miraba tipos de nodo
 * que contuvieran el segmento `import`/`require`/`using`, y `export_statement`
 * no contiene ninguno.
 *
 * El costo estaba medido en las planillas de veredictos: *"apply-decorators.ts
 * SÍ es referenciado, vía `export *` desde decorators/core/index.ts"*,
 * *"el archivo es un barril de puro re-export comodín"*. Y el volumen del
 * fenómeno, contado a mano sobre el corpus: 390 statements de re-export en
 * nest, 355 en vueuse, 19 en preact, 13 en eslint.
 *
 * El criterio es de FORMA pura, no una rama por lenguaje ni por tipo de
 * nodo: **un statement de nivel superior que expone un campo `source` cuyo
 * texto es un literal de string declara una dependencia de módulo.** Da lo
 * mismo si la palabra del statement es "importar" o "reexportar": el archivo
 * de la izquierda depende del de la derecha, que es toda la relación que
 * esta arista modela. Un `export { Z };` sin `from` no tiene campo `source`
 * y no emite nada (verificado por sonda); un `export const q = 1;` tampoco.
 * Ninguna de las otras cinco gramáticas expone un campo `source` en un
 * statement de nivel superior, así que el criterio no las toca — y aunque
 * alguna lo hiciera, la guarda de literal de string mantiene la disciplina
 * de "un import, un destino".
 */
function moduleSourceTarget(stmt: AstNode): AstNode | null {
  const source = stmt.childForFieldName("source") as AstNode | null;
  return source && isStringLiteral(source) ? source : null;
}

/**
 * Fuente centinela por lenguaje. `expect`/`slots` quedan con valores
 * descriptivos: el mecanismo general `discoverCarrier`/`ctx.carriers()` no
 * aplica acá (ver el docstring del módulo) — este extractor no lo consulta
 * en tiempo de ejecución, `extract()` usa las funciones de arriba,
 * verificadas por sonda directa e independientes de `EdgeContext`.
 */
const SENTINEL: Readonly<Record<string, string>> = {
  typescript: 'import { zzzSentNamedZzz } from "zzzSentPathZzz";\n',
  tsx: 'import { zzzSentNamedZzz } from "zzzSentPathZzz";\n',
  javascript: 'import { zzzSentNamedZzz } from "zzzSentPathZzz";\n',
  vue: 'import { zzzSentNamedZzz } from "zzzSentPathZzz";\n',
  python: "import zzzSentBareModZzz\nfrom zzzSentFromModZzz import zzzSentNameZzz\n",
  go: 'package main\nimport (\n\t"zzzSentPlainZzz"\n\tzzzalias "zzzSentPathZzz"\n)\n',
  java: "import com.zzz.pkg.ZzzSentinelClassZzz;\n",
  csharp: "using ZzzSentinelNamespaceZzz.ZzzMemberZzz;\n",
  ruby: 'require "zzz_sent_path_zzz"\nrequire_relative "zzz_sent_rel_zzz"\n',
};

export const importsExtractor: EdgeExtractor<"imports"> = {
  id: "imports",
  kind: "imports",
  title: "Import / require / using",
  /**
   * A7 (Ola 11b): era `["imports"]` y ese gate era el que dejaba a RUBY
   * afuera del todo — medido, no deducido: `deriveCapabilities` deriva
   * `imports` de los TIPOS DE NODO del probe (`detect/capabilities.ts#
   * IMPORT_WORD`), y Ruby no tiene ninguno, así que `ruby.imports === false`
   * y `warmup.ts#extractEdgeFacts` salteaba este extractor entero antes de
   * llamarlo. La capacidad no puede ver un import escrito como LLAMADA, que
   * es justo la forma de Ruby (y la de CommonJS). El gate correcto para este
   * extractor es el que ya tiene puertas adentro y es más preciso: la
   * presencia del lenguaje en `SENTINEL` (`extract` corta con `!(file.language
   * in SENTINEL)`), o sea su propia declaración de aplicabilidad, no una
   * capacidad derivada de una forma sintáctica que este extractor
   * deliberadamente ya no exige.
   */
  needs: [],
  slots: [],
  sentinel: SENTINEL,
  expect: { from: "<archivo>", to: "<especificador crudo>" },
  optional: true,

  extract(file, _ctx: EdgeContext): readonly EdgeFacts[] {
    if (!(file.language in SENTINEL)) return [];
    return collect(file.root, file.language);
  },
};
