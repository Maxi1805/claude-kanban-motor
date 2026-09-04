/**
 * `instanciacion` — instanciación de objetos (CONTRATO-F4.md §2, arista
 * tipada `instantiates` del catálogo de aristas del grafo).
 *
 * RELACIÓN: A construye un objeto de tipo B. Es la señal que ancla Factory
 * Method (PLAN.md, fila "Instanciación directa dispersa" / "Factory Method").
 * Hoy `code-analyzer.ts` la aproxima con una regex de texto sobre los brazos
 * de una cadena de condicionales (`ladderInstantiatesTypes`,
 * `/\bnew\s+([A-Z][A-Za-z0-9_]*)|\b([A-Z][A-Za-z0-9_:]*)\.new\b/`), que EXIGE
 * mayúscula inicial en el nombre construido — falla con constructores en
 * minúscula. Medido en el corpus de esta tarea: `lodash/test/test.js` tiene
 * `new bound(...)` y `new Ctor(...)` (variables locales que referencian un
 * constructor), invisibles para esa regex pero capturados acá porque el AST
 * no distingue por mayúscula/minúscula. Esta arista NO toca `chainInstantiates`
 * (que sigue siendo el supresor que ya es — fuera de alcance de esta tarea).
 *
 * *** DERIVACIÓN POR SONDA CENTINELA (requisito duro del proyecto) ***: el
 * único slot (`instantiation-site`) se resuelve por lenguaje vía
 * `discoverCarrier`/`edgeProfile` (`./sentinel.js`) sobre el par centinela
 * `expect.from`/`expect.to` de `sentinel` (abajo) — nunca se escribe
 * `"new_expression"` / `"object_creation_expression"` / `"composite_literal"`
 * a mano en ningún `if`/`switch`: esos tipos de nodo SALEN de correr la sonda
 * y quedan sólo en `carrier.steps` (dato), no en el código fuente de este
 * archivo. Consumo del `CarrierPath`: como la relación vive dentro de una
 * expresión anidada (no es un campo directo del símbolo `from`, a diferencia
 * de `extends`/`implements`/`mixes-in`), sólo los DOS ÚLTIMOS pasos del
 * camino descubierto son invariantes de un lugar a otro del archivo real —
 * el resto del camino (cómo se llega desde `F` hasta ahí) es un artefacto de
 * ESTA fuente centinela particular, no una propiedad general del lenguaje.
 * `ownerType` = tipo del nodo que posee el campo objetivo (penúltimo paso);
 * `targetField` = nombre de ese campo (último paso). Verificado a mano
 * (`scratchpad/f4-instantiates/verify-sentinel.mjs`, esta tarea) contra las 4
 * gramáticas donde se declara sonda originalmente: siempre resuelve a
 * `new_expression.constructor` (familia JS/TS) o
 * `object_creation_expression.type` (Java/C#) o `composite_literal.type`
 * (Go), sin que ninguno de esos strings aparezca escrito como constante en
 * este módulo. Ruby y Python (agregados esta ola, ver abajo) reutilizan el
 * MISMO mecanismo para descubrir su `ownerType`/`targetField` — la única
 * diferencia es que, para esos dos, el par `expect` por sí solo no alcanza
 * para decidir si el sitio encontrado es una instanciación real (ver
 * "LÉXICO DE DOMINIO vs. GRAMÁTICA" y "LÍMITES DECLARADOS POR LENGUAJE").
 *
 * *** LÉXICO DE DOMINIO vs. NOMBRE DE CAMPO/TIPO DE NODO DE LA GRAMÁTICA —
 * la distinción que esta ola corrige (la justificación anterior de este
 * docstring, para Ruby, las mezclaba; quedó reemplazada) ***
 *   - LÉXICO DE DOMINIO (PROHIBIDO, sin excepción): nombres propios de un
 *     framework, una librería o la convención de un ecosistema — `blank?`
 *     de Rails, el prefijo `use` de Vue, los nombres de método `create`/
 *     `build`/`find` de ActiveRecord. Ninguno de estos se escribe en la
 *     lógica de extracción de este archivo, y `Foo.create`/`Foo.build`/
 *     `Foo.find` deliberadamente NO cuentan como instanciación acá (ver
 *     Ruby, abajo) — no porque se los reconozca y descarte por nombre, sino
 *     porque su mensaje no es el que sí se reconoce (`new`, ver próximo
 *     punto).
 *   - NOMBRE DE CAMPO O DE TIPO DE NODO DE LA GRAMÁTICA DE UN LENGUAJE
 *     (PERMITIDO): el campo `method` de un nodo `call` en la gramática de
 *     Ruby, el campo `function` de un `call` en la de Python. Esto NO es
 *     dominio: es el lenguaje — vale para cualquier repo escrito en ese
 *     lenguaje (un `call.method` de Sinatra es el mismo campo que uno de
 *     Rails), y es exactamente lo que Semgrep y CodeQL escriben
 *     explícitamente en sus queries. Este archivo usa esta segunda
 *     categoría, a propósito, donde el mecanismo genérico de un solo par
 *     `expect.from`/`expect.to` no alcanza (ver LÍMITES DECLARADOS POR
 *     LENGUAJE): `isRubyConstructorMessage`/`isRubyConstantReceiver` abajo
 *     leen `childForFieldName("method")`/`childForFieldName("receiver")`
 *     directo, sin pasar por `discoverCarrier` para ESE campo puntual,
 *     porque la sonda sólo puede recuperar UN campo por extractor y acá
 *     hacen falta dos (el campo que da el NOMBRE del tipo construido, que
 *     SÍ sigue viniendo de la sonda genérica, y el campo que confirma que
 *     el mensaje es "new", que no).
 *
 * LÍMITES DECLARADOS POR LENGUAJE (verificados con
 * `revision2/probe/edges/07-instantiation.mjs`, reservado a esta ola, y con
 * `scratchpad/f4-instantiates/probe.mjs` sobre el corpus, esta ola):
 *  - Python: `SentinelType(1, 2)` (instanciación) y `some_function(1, 2)`
 *    (llamada común) son EL MISMO nodo (`call`, campo `function`, hijo
 *    `identifier`) — el campo por sí solo no distingue las dos lecturas. Se
 *    resuelve cruzando el destino contra `file.sets.classNodes` (el mismo
 *    campo genérico `name` que `mixin.ts#collect` ya usa para lo mismo):
 *    sólo cuenta como instanciación un `Foo(...)` cuyo callee es un
 *    identificador DESNUDO que coincide con una clase DECLARADA EN ESTE
 *    MISMO ARCHIVO — "usá lo que el grafo ya sabe del destino (`family:
 *    "class-like"`) en vez de una heurística de mayúscula inicial sola",
 *    igual criterio que ya usa el resto del grafo (`graph/symbols.ts`) para
 *    decidir qué es `class-like`. Ver SIMPLIFICACIONES DECLARADAS para el
 *    costo de recall que esto tiene (clases importadas de otro archivo no
 *    se reconocen).
 *  - Ruby: `SentinelType.new(1, 2)` es un `call` con campo `receiver` (que
 *    SÍ lleva el nombre del tipo — la sonda genérica lo recupera igual que
 *    recupera `constructor`/`type` en JS/Java/Go) y un campo `method` cuyo
 *    texto literal debe ser "new" — el mensaje de construcción del propio
 *    Ruby (`Class#new`, biblioteca estándar, nunca de un framework:
 *    `Foo.create`/`Foo.build`/`Foo.find` de ActiveRecord tienen la MISMA
 *    forma de nodo y quedan afuera únicamente porque su `method` no dice
 *    "new"). Antes de esta ola no se registraba sonda para Ruby porque el
 *    mecanismo de un solo par `expect.from`/`expect.to` no puede recuperar
 *    DOS campos (`receiver` y `method`) a la vez; se resuelve leyendo
 *    `method` directo (ver LÉXICO DE DOMINIO vs. GRAMÁTICA arriba: el
 *    nombre de ese campo es gramática, no dominio). Ver SIMPLIFICACIONES
 *    DECLARADAS para el receptor DINÁMICO (`klass.new`), que queda afuera.
 *  - Go: `composite_literal` cubre struct literals Y slice/array/map
 *    literals con la MISMA forma de nodo (`type` + `body`); se excluye el
 *    caso en que el campo `type` es él mismo un tipo COMPUESTO (`isWrapperTypeShape`
 *    abajo: expone `element`/`key`/`length`, los campos genéricos de
 *    slice/array/map — prueba de FORMA, nunca de nombre de tipo de nodo) —
 *    así arma `SentinelType{...}` pero no `[]int{...}` ni `map[K]V{...}`.
 *
 * *** DOS DEFECTOS MEDIDOS Y CERRADOS EN LA OLA P (frente P3) — los dos
 * hacían que la arista existiera en el papel y NO llegara al grafo: ***
 *
 *   1. ARGUMENTOS DE TIPO Y CALIFICACIÓN EN `toName`. Hasta esta ola `toName`
 *      era el TEXTO CRUDO del campo descubierto por la sonda, así que
 *      `new PriorityQueue<Integer>()` viajaba como `"PriorityQueue<Integer>"`
 *      y `new a.B()` como `"a.B"`. `graph/build.ts#buildTypedEdgeCandidatesForFile`
 *      busca ese texto en el índice por NOMBRE (`byName.get(ef.toName)`) y
 *      con cero candidatos descarta el hecho sin siquiera entrar a la
 *      cascada — o sea: TODA instanciación genérica o calificada se producía
 *      y se tiraba en silencio. Verificado por sonda directa sobre las 4
 *      gramáticas con nodo dedicado (`scratchpad/p3/probe2.mts`): java
 *      `object_creation_expression.type` = `generic_type` («PriorityQueue<Integer>»),
 *      csharp = `generic_name` («List<int>»), go `composite_literal.type` =
 *      `qualified_type` («pkg.Type»), y la familia JS/TS ya escapaba sola
 *      porque su gramática pone los argumentos de tipo en un campo APARTE
 *      (`new_expression.type_arguments`, `constructor` queda desnudo).
 *      `peelTypeReference` (abajo) pela lo mismo que ya pelaban
 *      `herencia.ts#qualifiedNameOf` e `interfaz-declarada.ts#stripGenericsAndQualify`
 *      para la MISMA pregunta, con la misma vara: si lo que queda no es un
 *      identificador de programa, no se emite nada (antes se emitía basura
 *      irresoluble).
 *
 *   2. `fromPath` NO ERA EL SCOPE LÉXICO QUE USA EL RESTO DEL GRAFO. El
 *      `fromPath` salía de `file.functions` (las unidades función del
 *      analizador), que aplana la clase ANÓNIMA: para
 *      `new Visitor() { void visit() { new Helper(); } }` daba
 *      `["Uses","visit"]`, mientras `graph/references.ts` (que ve el MISMO
 *      identificador `Helper` como referencia `bare`) reporta
 *      `scope: ["Uses","make","visit"]` y `graph/symbols.ts` declara el
 *      símbolo bajo ese mismo camino. Medido de punta a punta con
 *      `analyzeRepo` sobre un repo Java mínimo (`scratchpad/p3/mini-graph.mts`):
 *      la arista `instantiates` salía con `from` = `sym:src/Uses.java#Uses.visit`,
 *      un id que NO CORRESPONDE A NINGÚN NODO del grafo, mientras la
 *      `references` gemela salía con `from` = `sym:src/Uses.java#Uses.make.visit`.
 *      Las dos nacen del MISMO identificador y tienen que coincidir: el
 *      consumidor `detect/inter-file/concrete-over-abstraction.ts` cancela
 *      su evidencia comparando el par `(from, to)` de las dos, y con los
 *      `from` desalineados la cancelación no ocurría nunca dentro de una
 *      clase anónima ni en un inicializador de campo (`class A { Helper h =
 *      new Helper(); }`, que daba `fromPath: []` en vez de `["A"]`). El
 *      arreglo replica, literal, el mecanismo de `references.ts` (pila de
 *      scope sobre `sets.functionNodes`/`sets.classNodes` + campo `name`,
 *      con `splitQualifiedSegments` para el namespace compuesto) en vez de
 *      leer `file.functions`.
 *
 * SIMPLIFICACIONES DECLARADAS: `toName` ya no es el texto crudo (ver el punto
 * 1 de arriba) pero SIGUE sin resolverse acá — `graph/resolve.ts` decide
 * después si el par (nombre, calificador) ata a un símbolo real. Un receptor
 * Ruby calificado (`Sub::Gadget.new`) sigue la MISMA regla que el resto:
 * `toName` = `"Gadget"`, `toQualifier` = `["Sub"]`.
 *   - Ruby: sólo un receptor CONSTANTE dispara — desnudo (`Foo`) o
 *     calificado (`Foo::Bar`, mismo par de campos genéricos `scope`/`name`
 *     que `herencia.ts`/`mixin.ts` ya usan para lo mismo). Un receptor
 *     DINÁMICO (`klass.new`, una variable local que referencia una clase —
 *     el mismo fenómeno que motivó capturar `new bound(...)` en JS, ver el
 *     párrafo inicial de este docstring) NO se reconoce acá: sin un campo
 *     que distinga "variable" de "constante" salvo por FORMA LÉXICA
 *     (mayúscula inicial — el propio lexer de Ruby ya resuelve esa
 *     ambigüedad antes de llegar acá, no es una convención de este
 *     proyecto; mismo principio que la nota de `mixin.ts` sobre
 *     `RUBY_REFERENCE_LEAF_TYPES`), se prefiere precisión sobre recall:
 *     `self.new` tampoco dispara (`self` no es del tipo `constant`).
 *   - Python: sólo clases declaradas EN EL MISMO ARCHIVO cuentan como
 *     destino válido (ver LÍMITES DECLARADOS POR LENGUAJE arriba) — una
 *     clase importada de otro módulo no es visible para un extractor que
 *     corre POR ARCHIVO (CONTRATO-F4.md §2.5); misma limitación de alcance
 *     que `mixin.ts` ya declara para su propio `toName`.
 */
import type { AstNode, FileUnit } from "../../detect/types.js";
import { declaredReceiverTypeName, fileLevelTypeNames } from "../symbols.js";
import type { EdgeContext, EdgeExtractor, EdgeFacts } from "./types.js";

const SLOT_INSTANTIATION_SITE = "instantiation-site" as const;

/**
 * Sonda por lenguaje: una clase `F` cuyo método construye `SentinelType`. La
 * clase (no la función) ancla `expect.from` porque `discoverCarrier` sólo
 * localiza declarantes NO función-like (`hasField('name') && !isFunctionLike`,
 * `sentinel.ts`) — un `function f() {…}`/`def f`/`func f()` con campo `body`
 * Y `parameters` queda excluido por diseño. La profundidad del camino entre
 * la clase y `SentinelType` no importa: sólo se usan sus dos últimos pasos
 * (ver docstring del módulo). Ruby y Python declaran la MISMA forma
 * canónica (`SentinelType.new(...)` / `SentinelType(...)`) que exige el
 * "Trabajo" de esta ola — verificado por sonda directa
 * (`scratchpad/f4-instantiates/probe.mjs`) antes de escribir la lógica de
 * `extract`, nunca asumido.
 */
const SENTINEL: Readonly<Record<string, string>> = {
  typescript: "class F { m() { const x = new SentinelType(1, 2); } }",
  tsx: "class F { m() { const x = new SentinelType(1, 2); } }",
  vue: "class F { m() { const x = new SentinelType(1, 2); } }",
  javascript: "class F { m() { const x = new SentinelType(1, 2); } }",
  java: "class F { void m() { Object x = new SentinelType(1); } }",
  csharp: "class F { void M() { var x = new SentinelType(1, 2); } }",
  go: 'package main\nvar F = SentinelType{Name: "a"}\n',
  ruby: "class F\n  def m\n    x = SentinelType.new(1, 2)\n  end\nend\n",
  python: "class F:\n    def m(self):\n        x = SentinelType(1, 2)\n",
};

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

/** Go: tipo COMPUESTO (slice/array/map) — prueba de FORMA (expone alguno de
 *  los campos genéricos de envoltorio), nunca un nombre de tipo de nodo
 *  (`slice_type`/`array_type`/`map_type`) escrito a mano. Verificado por
 *  sonda directa: `slice_type` expone `element`, `array_type` expone
 *  `element`+`length`, `map_type` expone `key`+`value`
 *  (`scratchpad/f4-instantiates/verify-go-negative.mjs`, esta tarea). */
function isWrapperTypeShape(node: AstNode): boolean {
  return hasField(node, "element") || hasField(node, "key") || hasField(node, "length");
}

/** Ruby: el mensaje que `Class#new` (núcleo de Ruby, no de ningún framework)
 *  usa para construir — ver "LÉXICO DE DOMINIO vs. GRAMÁTICA" en el
 *  docstring del módulo para por qué esto no es lo mismo que nombrar
 *  `create`/`build`/`find` de ActiveRecord (esos SÍ serían dominio; este es
 *  el protocolo de construcción del propio lenguaje). */
const RUBY_CONSTRUCTOR_MESSAGE = "new";

/** Ruby: el campo `method` de un `call` (gramática de Ruby) debe decir
 *  literalmente "new". Es el ÚNICO chequeo que el mecanismo de sonda de un
 *  solo par `expect.from`/`expect.to` no puede recuperar por sí mismo (ya
 *  usa ese par para el campo `receiver`, que SÍ da el nombre del tipo) — se
 *  lee directo, con el nombre de campo que la propia gramática de Ruby ya
 *  usa (ver docstring del módulo). */
function isRubyConstructorMessage(callNode: AstNode): boolean {
  const method = callNode.childForFieldName("method") as AstNode | null;
  return method !== null && method.childCount === 0 && method.text === RUBY_CONSTRUCTOR_MESSAGE;
}

/** Ruby: receptor CONSTANTE — desnudo (`Foo`, tipo de nodo `constant`) o
 *  calificado (`Foo::Bar`, nodo `scope_resolution` con el mismo par de
 *  campos genéricos `scope`/`name` que `herencia.ts#qualifiedNameOf` y
 *  `mixin.ts#qualifiedNameOf` ya usan para lo mismo). Nunca una variable
 *  (`klass.new`) ni `self.new` — ver SIMPLIFICACIONES DECLARADAS. */
function isRubyConstantReceiver(node: AstNode): boolean {
  if (node.childCount === 0) return node.type === "constant";
  if (node.type !== "scope_resolution") return false;
  const name = node.childForFieldName("name") as AstNode | null;
  return name !== null && name.childCount === 0 && name.type === "constant";
}

/** Python: nombres de clase declarados EN ESTE ARCHIVO — el campo genérico
 *  `name` de cualquier nodo cuyo TIPO está en `file.sets.classNodes` (mismo
 *  mecanismo que `mixin.ts#collect` ya usa para recorrer unidades
 *  tipo-clase). Es, a propósito, el reemplazo que pide esta ola de una
 *  heurística de mayúscula inicial sola: cruza el destino contra lo que el
 *  grafo ya deriva como `family: "class-like"` (`graph/symbols.ts`) para
 *  este mismo archivo. */
function declaredClassNames(root: AstNode, classNodes: ReadonlySet<string>): ReadonlySet<string> {
  const out = new Set<string>();
  const visit = (node: AstNode): void => {
    if (node.isNamed && classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text;
      if (name) out.add(name);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

/**
 * El chequeo ADICIONAL, por lenguaje, que la sonda genérica de un solo campo
 * no puede expresar sola (ver LÍMITES DECLARADOS POR LENGUAJE en el
 * docstring del módulo). `true` incondicional para los lenguajes cuyo
 * `ownerType` YA es un nodo DEDICADO a instanciación (`new_expression`/
 * `object_creation_expression`/`composite_literal`: nunca comparte forma
 * con una llamada común), donde no hace falta ninguna ayuda extra —
 * comportamiento IDÉNTICO al que este extractor tenía antes de esta ola
 * para esos lenguajes.
 */
function passesLanguageGuard(
  language: string,
  ownerNode: AstNode,
  target: AstNode,
  declaredClasses: ReadonlySet<string> | null,
): boolean {
  if (language === "ruby") return isRubyConstantReceiver(target) && isRubyConstructorMessage(ownerNode);
  if (language === "python") return target.childCount === 0 && declaredClasses !== null && declaredClasses.has(target.text);
  return true;
}

/** Copia LOCAL de `graph/symbols.ts#splitQualifiedSegments` / `graph/references.ts`
 *  (misma función, mismo separador — `herencia.ts` e `interfaz-declarada.ts`
 *  llevan la suya por el mismo motivo: los módulos de esa ola no se importan
 *  entre sí). Un namespace COMPUESTO (`namespace A.B {...}`) es UN SOLO nodo
 *  cuyo `.text` trae los puntos adentro; el resto del grafo empuja un frame
 *  POR SEGMENTO. No-op para un identificador simple. */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

/** Guarda genérica de forma: lo que queda después de pelar tiene que parecer
 *  un identificador de programa de verdad — misma vara (y misma expresión)
 *  que `herencia.ts#IDENTIFIER_RE`. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Un grupo de ARGUMENTOS DE TIPO al final del texto: `<...>` (java, csharp,
 *  la familia JS/TS) o `[...]` (python). Es puntuación de gramática, no
 *  vocabulario de dominio — el mismo par de delimitadores que ya pela
 *  `interfaz-declarada.ts#stripGenericsAndQualify` para la misma pregunta. */
const TYPE_ARGUMENT_SUFFIX = /(?:<[\s\S]*>|\[[\s\S]*\])\s*$/;

/**
 * Pela argumentos de tipo y calificación del TEXTO de la referencia a un tipo
 * y devuelve `{name, qualifier}` sólo si el resultado es un identificador
 * limpio — ver el punto 1 de "DOS DEFECTOS MEDIDOS" en el docstring del
 * módulo. `null` para cualquier cosa que no reduzca a un nombre referenciable
 * (una expresión, un literal, una forma que este extractor no generaliza):
 * antes esas se emitían igual y morían sin ruido en `graph/build.ts`; ahora
 * no se emiten, que es lo mismo para el grafo y honesto para el censo de
 * aristas.
 */
function peelTypeReference(raw: string): { name: string; qualifier: readonly string[] } | null {
  const stripped = raw.replace(TYPE_ARGUMENT_SUFFIX, "").trim();
  const parts = stripped.split(/::|\./).map((p) => p.trim());
  if (parts.length === 0) return null;
  if (!parts.every((p) => IDENTIFIER_RE.test(p))) return null;
  return { name: parts[parts.length - 1]!, qualifier: parts.slice(0, -1) };
}

/**
 * *** EL SITIO DE CONSTRUCCIÓN, COMO PREGUNTA REUTILIZABLE — Ola R, frente
 * "cadena de identidad" (`cadena-identidad.ts`). SIN cambio de comportamiento
 * para esta arista: `extract` de abajo llama a esta función exactamente donde
 * antes tenía este mismo encadenamiento escrito en línea. ***
 *
 * POR QUÉ SE EXPORTA en vez de copiarse: la arista `stores` responde "dónde
 * QUEDA lo que se construye" y `instantiates` responde "quién lo construye".
 * Las dos preguntas se contestan sobre EL MISMO sitio sintáctico, así que
 * tienen que estar de acuerdo sobre qué cuenta como construcción — si no, un
 * consumidor que cuenta "¿se construyó exactamente una vez?" con
 * `instantiates` y pregunta "¿y dónde quedó?" con `stores` recibe dos censos
 * que no cuadran. El proyecto ya pagó el costo de la misma lógica copiada en
 * varios módulos (`splitQualifiedSegments`, `IDENTIFIER_RE`, `qualifiedNameOf`
 * viven duplicados en cuatro extractores y su docstring lo declara); acá la
 * duplicación NO es cosmética: sería una divergencia de censo.
 *
 * `null` = "este nodo no es un sitio de construcción reconocido" — incluye el
 * caso "sí lo es sintácticamente pero el guardián de lenguaje lo rechaza"
 * (Ruby sin mensaje `new`, Python cuyo callee no es una clase declarada acá,
 * Go cuyo `type` es un envoltorio slice/array/map). Quien la llame NO debe
 * descender dentro de un nodo de tipo `ownerType` que devolvió `null`: eso
 * sería reinterpretar como construcción algo que esta función ya juzgó que no
 * lo es.
 */
export function constructedTypeAt(
  node: AstNode,
  language: string,
  ownerType: string,
  targetField: string,
  declaredClasses: ReadonlySet<string> | null,
): { readonly name: string; readonly qualifier: readonly string[] } | null {
  if (!node.isNamed || node.type !== ownerType) return null;
  const target = node.childForFieldName(targetField) as AstNode | null;
  if (!target || isWrapperTypeShape(target)) return null;
  if (!passesLanguageGuard(language, node, target, declaredClasses)) return null;
  return peelTypeReference(target.text);
}

/**
 * El cruce que SÓLO Python necesita (ver LÍMITES DECLARADOS POR LENGUAJE):
 * los nombres de clase declarados en ESTE archivo. `null` para todo otro
 * lenguaje — `constructedTypeAt` ni lo mira. Exportado por el mismo motivo
 * que `constructedTypeAt`: el guardián de Python es parte de la definición de
 * "construcción", no un detalle de este extractor.
 */
export function declaredClassNamesFor(file: FileUnit): ReadonlySet<string> | null {
  return file.language === "python" ? declaredClassNames(file.root, file.sets.classNodes) : null;
}

export const extractor: EdgeExtractor<"instantiates"> = {
  id: "instanciacion",
  kind: "instantiates",
  title: "Instanciación",
  // Ninguna `Capability` existente describe "el lenguaje puede construir
  // objetos" (es universal); el gate real es por lenguaje vía `sentinel` +
  // `optional`, igual criterio que `mixin.ts` para su propio caso.
  needs: [],
  slots: [SLOT_INSTANTIATION_SITE],
  sentinel: SENTINEL,
  expect: { from: "F", to: "SentinelType" },
  // Ningún lenguaje soportado queda hoy sin sonda (ruby/python se agregaron
  // esta ola); se deja `true` por si un lenguaje futuro no la declara.
  optional: true,

  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[] {
    if (!(file.language in SENTINEL)) return []; // no-aplicable: ver LÍMITES POR LENGUAJE
    const [carrier] = ctx.carriers(SLOT_INSTANTIATION_SITE);
    if (!carrier || carrier.steps.length === 0) return [];
    const last = carrier.steps[carrier.steps.length - 1]!;
    if (last.field === null) return []; // sólo relaciones ancladas a un campo nombrado
    const targetField = last.field;
    const ownerType = carrier.steps.length >= 2 ? carrier.steps[carrier.steps.length - 2]!.nodeType : carrier.ownerType;

    // Sólo Python necesita este cruce (ver LÍMITES DECLARADOS POR LENGUAJE);
    // para el resto queda `null` y `passesLanguageGuard` ni lo mira.
    const declaredClasses = declaredClassNamesFor(file);

    const out: EdgeFacts[] = [];
    // Pila de SCOPE LÉXICO, idéntica a la de `graph/references.ts` (mismo par
    // de conjuntos `functionNodes`/`classNodes`, mismo campo `name`, mismo
    // `splitQualifiedSegments`) — ver el punto 2 de "DOS DEFECTOS MEDIDOS" en
    // el docstring del módulo: la arista `instantiates` y la `references` que
    // nacen del MISMO identificador tienen que reportar el MISMO origen, y
    // `file.functions` (lo que este extractor leía antes) aplana la clase
    // anónima y no ve el nivel de clase.
    //
    // GUARDIÁN OLA P (grupo grafo) — arreglado el PIDO de P4.md ("no aprendió
    // el receptor"): esta pila es la 4.ª copia del mismo patrón que
    // `references.ts`/`symbols.ts` ya tienen, y hasta acá le faltaba la mitad
    // de AGRUPAMIENTO que P4 cerró en esas dos — un método con receptor
    // (Go `func (c *Command) Init() {…}`) empujaba SÓLO su propio nombre
    // (`fromPath: ["Init"]`), nunca el tipo receptor (`Command`). Medido por
    // P4: 524 aristas `instantiates` colgadas en hugo (44 % de las
    // `instantiates` resueltas de Go — el `from` no correspondía a NINGÚN
    // nodo real del grafo) y 1 en cobra. Mismo mecanismo que
    // `references.ts` línea ~751: el receptor se empuja ANTES que los
    // segmentos del nombre propio, y sólo desde nivel de archivo
    // (`scopeStack.length === 0`), para que `fromPath` quede idéntico al
    // `container` + `name` que `symbols.ts` calcula del lado de la
    // declaración — la promesa que sostiene la cancelación de
    // `concrete-over-abstraction` (la `instantiates` y la `references`
    // gemelas tienen que reportar el MISMO origen, ver arriba).
    const scopeStack: string[] = [];
    const tiposDeArchivo = fileLevelTypeNames(file.root, file.sets);
    const visit = (node: AstNode): void => {
      {
        // Ola R: el encadenamiento de guardias que estaba escrito acá se movió
        // VERBATIM a `constructedTypeAt` (arriba) para que `stores` conteste
        // sobre el MISMO sitio — mismo resultado, mismo orden de chequeos.
        const peeled = constructedTypeAt(node, file.language, ownerType, targetField, declaredClasses);
        if (peeled) {
          const startLine = node.startPosition.row + 1;
          const endLine = node.endPosition.row + 1;
          out.push({
            extractorId: extractor.id,
            kind: "instantiates",
            fromPath: [...scopeStack],
            toName: peeled.name,
            toQualifier: peeled.qualifier,
            provenance: "declared",
            startLine,
            endLine,
            via: `${ownerType}.${targetField}`,
          });
        }
      }
      let pushedCount = 0;
      if (node.isNamed && file.sets.functionNodes.has(node.type)) {
        if (scopeStack.length === 0) {
          const receiverType = declaredReceiverTypeName(node);
          if (receiverType !== null && tiposDeArchivo.has(receiverType)) {
            scopeStack.push(receiverType);
            pushedCount++;
          }
        }
      }
      if (node.isNamed && (file.sets.functionNodes.has(node.type) || file.sets.classNodes.has(node.type))) {
        const nameNode = node.childForFieldName("name") as AstNode | null;
        if (nameNode) {
          const segments = splitQualifiedSegments(nameNode.text);
          for (const seg of segments) scopeStack.push(seg);
          pushedCount += segments.length;
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
