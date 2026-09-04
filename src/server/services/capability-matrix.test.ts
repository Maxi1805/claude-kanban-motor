/**
 * F5 CONTRATO-F5.md §CONTRATO 3 — el mecanismo anti-sonda-incompleta
 * (mecanismo 1: "matriz capacidad × lenguaje, congelada y con motivo
 * obligatorio").
 *
 * QUÉ BUG DE FAMILIA ATACA ESTE ARCHIVO — cuatro veces medido antes de este
 * test existir, y un quinto encontrado escribiéndolo (ver abajo): el
 * analizador sólo conoce las construcciones que su sonda (`*_PROBE` en
 * `code-analyzer.ts`) ejercita, y nada impedía estructuralmente que una
 * sonda nueva, o una existente editada sin cuidado, dejara una construcción
 * del lenguaje sin ejercitar — el silencio es exactamente el fallo: la
 * capacidad deriva `false`, el detector que la `needs` queda "no aplicable"
 * para ese lenguaje, y nada en CI lo nota.
 *
 * EL MECANISMO: este archivo deriva la tabla REAL (9 lenguajes × 11
 * capacidades) de los probes de PRODUCCIÓN — importados literalmente de
 * `LANGUAGE_DECLS` (código-analyzer.ts), nunca retipeados ni re-extraídos
 * por regex del texto fuente — y la compara contra `FROZEN_MATRIX` de abajo.
 * Dos maneras de fallar:
 *   1. La tabla real difiere de la congelada: alguien tocó una sonda o la
 *      derivación y el resultado cambió sin que este archivo se actualizara
 *      — se rompe con un mensaje que dice EXACTAMENTE qué celda cambió.
 *   2. Una celda `false` no tiene motivo, o su motivo es
 *      `sonda-incompleta`/`derivacion-incompleta` sin `waiver` (una
 *      justificación escrita, no vacía): no se puede dejar una construcción
 *      sin ejercitar EN SILENCIO — hay que escribir, con todas las letras,
 *      por qué sigue faltando y por qué no se arregló acá.
 *
 * Los cinco bugs que este mecanismo habría atrapado si hubiera existido
 * antes de escribir cada sonda (los cuatro del planteo de la tarea + uno
 * encontrado auditando estas nueve sondas con esta misma herramienta):
 *   1. Ternario de Ruby: el nodo se llama `conditional`, el regex pedía
 *      `_expression`. `code-grammar.ts#TERNARY_NAME` arreglado (Ola F1/F5);
 *      la COPIA en `detect/capabilities.ts` (BUG 5) tenía el mismo defecto —
 *      cerrado en P6 (Ola F5): `TERNARY_NAME` de `detect/capabilities.ts`
 *      ahora acepta el sufijo `_expression` opcional, igual que su gemelo de
 *      `code-grammar.ts`. `ruby.ternario` abajo es `T()`, ya sin waiver.
 *   2. Java/C# sin ningún ternario en la sonda: arreglado en esta ola
 *      (`JAVA_PROBE`/`CSHARP_PROBE` ya tenían `x > 0 ? 1 : 2`, confirmado
 *      abajo con `ternario: true` en ambos).
 *   3. JS_FAMILY_PROBE sin una sola anotación de tipo: arreglado con
 *      `TS_FAMILY_PROBE` (una función tipada agregada encima de JS).
 *   4. JAVA_PROBE sin `interface`/`enum`/`record`: arreglado en esta ola —
 *      medido `false` antes, `true` ahora (`java.interfaz`).
 *   5. NUEVO, encontrado auditando con este mismo mecanismo: agregar
 *      `record` a JAVA_PROBE/CSHARP_PROBE sin más habría clasificado el
 *      record COMO FUNCIÓN (su encabezado posicional resuelve el mismo
 *      campo `parameters` que un constructor) y nunca como tipo — arreglado
 *      en `code-grammar.ts` (`RECORD_NODE_WORD`, chequeado ANTES que
 *      `isFunctionLike`), no en la sonda: la sonda tenía razón en agregar
 *      `record`, la DERIVACIÓN tenía el punto ciego. Confirmado con
 *      `record_declaration` en `classNodes`, nunca en `functionNodes`, para
 *      java y csharp (ver `code-grammar.test.ts` / prueba manual del F5).
 *
 * QUÉ NO ARREGLA ESTE ARCHIVO: `visibilidad` en la familia JS/TS/Java/C#
 * (BUG 7 — `modifiers` es un hijo SIN nombre de campo en esas gramáticas, así
 * que `MODIFIER_FIELDS` de `detect/capabilities.ts` nunca lo ve, aunque la
 * sonda SÍ tiene `public`/`private` escritos) y `nodo-constructor` en Python
 * (no-existe, es convención de nombre, no un bug). BUG 7 es un bug de
 * DERIVACIÓN, vive en `detect/capabilities.ts`, fuera de los archivos de
 * esta tarea (`code-analyzer.ts`, `code-grammar.ts`) — queda documentado acá
 * como `derivacion-incompleta` con su waiver, para que la compuerta lo
 * recuerde hasta que otro agente lo cierre, en vez de que se pierda en un
 * comentario de scratchpad. BUG 6 (`herencia`, mismo motivo) SE CERRÓ en F6
 * — ver `HERENCIA_JS_FAMILY`, retirada, más abajo.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LANGUAGE_DECLS } from "./code-analyzer.js";
import { deriveNodeSets } from "./code-grammar.js";
import { deriveCapabilities, type Capability } from "./detect/capabilities.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}

function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Las 11 capacidades declaradas por `detect/capabilities.ts#Capability`, en
 *  el mismo orden que ese archivo — si alguien agrega una capacidad ahí y no
 *  acá, `ALL_CAPS.length` diverge del tipo y TypeScript lo marca en la fila
 *  `satisfies`, no en tiempo de ejecución. */
const ALL_CAPS = [
  "unidad-tipo-clase",
  "herencia",
  "interfaz",
  "tipos-explicitos",
  "imports",
  "excepciones",
  "ternario",
  "nodo-constructor",
  "visibilidad",
  "genericos",
  "modulos",
] as const satisfies readonly Capability[];

type MotivoFalse =
  /** La construcción NO EXISTE en el lenguaje (o no existe como nodo de
   *  gramática distinguible — p. ej. Ruby's `require` es una llamada a
   *  método común, no un nodo de import dedicado). Permanente, no requiere
   *  arreglo futuro. */
  | "no-existe-en-el-lenguaje"
  /** La construcción existe y la SONDA no la ejercita. Este motivo NUNCA
   *  debería sobrevivir esta ola: si aparece, es un gap real sin cerrar y el
   *  `waiver` tiene que explicar por qué no se cerró. */
  | "sonda-incompleta"
  /** La sonda SÍ ejercita la construcción y el DERIVADOR (`detect/
   *  capabilities.ts`, fuera de los archivos de esta tarea) no la ve —
   *  ningún cambio de sonda lo arregla. */
  | "derivacion-incompleta";

interface Cell {
  expected: boolean;
  /** Obligatorio cuando `expected === false`. */
  motivo?: MotivoFalse;
  /** Obligatorio cuando `motivo` es `sonda-incompleta` o
   *  `derivacion-incompleta`: la justificación escrita que el CONTRATO-F5
   *  exige para no dejar una construcción sin ejercitar EN SILENCIO. */
  waiver?: string;
}

const T = (): Cell => ({ expected: true });
const F = (motivo: MotivoFalse, waiver?: string): Cell => ({ expected: false, motivo, waiver });

const NO_EXISTE = (why: string) => F("no-existe-en-el-lenguaje", why);
const DERIVACION = (why: string) => F("derivacion-incompleta", why);

/**
 * BUG 6 — CERRADO en F6 (integración). `class_heritage` (JS/TS/TSX/vue) es
 * un hijo SIN nombre de campo, pero `detect/capabilities.ts` ahora resuelve
 * `herencia` con `hasAnyField(...) || hasPositionalChildOfType(...)`
 * (`HERITAGE_WORD`, hijo posicional, no recursivo — ver `capabilities.ts` y
 * su `capabilities.test.ts`, que trae su propia tabla `HERENCIA_ESPERADA`
 * parseando la sonda real con la gramática real). Las 4 filas de esta
 * familia (typescript/tsx/javascript/vue) pasan de `HERENCIA_JS_FAMILY`
 * (`derivacion-incompleta`) a `T()` — medido, no supuesto: `capability-
 * matrix.test.ts` en sí mismo es la compuerta que lo confirma fila por fila.
 */

/** BUG 7 — mismo motivo en JS/TS/Java/C#: `modifiers`/accesibilidad es un
 *  hijo SIN nombre de campo. */
const VISIBILIDAD_MODIFIERS_UNNAMED = (lang: string, evidencia: string) =>
  DERIVACION(
    `BUG 7 — la sonda de ${lang} SÍ tiene ${evidencia}: confirmado por probe directo que el ` +
      "modificador de acceso/visibilidad llega como hijo SIN nombre de campo (`modifiers`/" +
      "`accessibility_modifier`/`modifier`, según la gramática), nunca como el campo `modifiers`/" +
      "`visibility` que `MODIFIER_FIELDS` de `detect/capabilities.ts` busca. Arreglo fuera de " +
      "alcance de esta tarea (`detect/capabilities.ts`): reportado, no tocado.",
  );

/**
 * LA MATRIZ CONGELADA. Derivada de una corrida real de `checkreal.mts`
 * (F5, este scratchpad) sobre `LANGUAGE_DECLS` después de las nueve sondas
 * arregladas — no a mano, no antes de correr nada.
 */
const FROZEN_MATRIX: Record<string, Partial<Record<Capability, Cell>>> = {
  ruby: {
    "unidad-tipo-clase": T(),
    herencia: T(), // F5: `class Shape < Base` agregado — antes ausente en la sonda (sonda-incompleta, ya cerrado).
    interfaz: NO_EXISTE("Ruby no tiene `interface`/`protocol`/`trait`; los mixins (`include`/`extend`) son un hijo SIN nodo de tipo dedicado (una llamada `call` común)."),
    "tipos-explicitos": NO_EXISTE("Ruby no tiene anotación de tipo inline en su gramática core (RBS vive fuera del árbol de sintaxis de un .rb)."),
    imports: NO_EXISTE("`require`/`require_relative` parsean como una llamada a método (`call`), no como un nodo de import dedicado — mismo patrón estructural que el constructor de Ruby (convención de nombre, no nodo propio)."),
    excepciones: T(),
    // BUG 5 cerrado (P6, Ola F5): la sonda tiene `x > 0 ? 1 : 2` (nodo `conditional`,
    // bare, confirmado por probe directo — `conditional` no aparece en ningún otro
    // lugar del árbol). `detect/capabilities.ts#TERNARY_NAME` ahora acepta el sufijo
    // `_expression` opcional, igual que `code-grammar.ts#TERNARY_NAME` (F1). Antes
    // `false` vía DERIVACION con waiver; el waiver queda obsoleto y se borra.
    ternario: T(),
    "nodo-constructor": T(),
    visibilidad: NO_EXISTE("`private`/`protected` son llamadas a método sin argumentos (o identificadores sueltos), no un campo de modificador sobre el nodo siguiente."),
    genericos: NO_EXISTE("Ruby no tiene genéricos de tiempo de compilación."),
    modulos: T(),
  },
  typescript: {
    "unidad-tipo-clase": T(),
    herencia: T(), // F6: BUG 6 cerrado — `capabilities.ts#hasPositionalChildOfType` ahora ve `class_heritage`.
    interfaz: T(), // F5: `interface Describable { ... }` agregado — antes ausente (sonda-incompleta, ya cerrado).
    "tipos-explicitos": T(),
    imports: T(), // F5: `import { helper } from "./helper"` agregado.
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": T(),
    visibilidad: VISIBILIDAD_MODIFIERS_UNNAMED("typescript", "`public readonly label: string;` / `private secret: number`"),
    genericos: T(), // F5: `function identity<T>(x: T): T` agregado.
    modulos: T(), // F5: `namespace Utils { ... }` agregado — `internal_module` matchea el vocabulario genérico.
  },
  tsx: {
    "unidad-tipo-clase": T(),
    herencia: T(), // F6: BUG 6 cerrado — `capabilities.ts#hasPositionalChildOfType` ahora ve `class_heritage`.
    interfaz: T(),
    "tipos-explicitos": T(),
    imports: T(),
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": T(),
    visibilidad: VISIBILIDAD_MODIFIERS_UNNAMED("tsx", "`public readonly label: string;` / `private secret: number`"),
    genericos: T(),
    modulos: T(),
  },
  vue: {
    "unidad-tipo-clase": T(),
    herencia: T(), // F6: BUG 6 cerrado — `capabilities.ts#hasPositionalChildOfType` ahora ve `class_heritage`.
    interfaz: T(),
    "tipos-explicitos": T(),
    imports: T(),
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": T(),
    visibilidad: VISIBILIDAD_MODIFIERS_UNNAMED("vue (usa TS_FAMILY_PROBE)", "`public readonly label: string;` / `private secret: number`"),
    genericos: T(),
    modulos: T(),
  },
  javascript: {
    "unidad-tipo-clase": T(),
    herencia: T(), // F6: BUG 6 cerrado — `capabilities.ts#hasPositionalChildOfType` ahora ve `class_heritage`.
    interfaz: NO_EXISTE("JS plano no tiene `interface` — sólo la familia TS lo tiene, correctamente excluido de JS_FAMILY_PROBE (javascript.wasm no puede parsear sintaxis TS de todos modos)."),
    "tipos-explicitos": NO_EXISTE("JS plano no tiene anotación de tipo — sólo `TS_FAMILY_PROBE` agrega una función tipada por encima de este mismo probe."),
    imports: T(), // F5: `import { helper } from "./helper"` agregado.
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": T(),
    visibilidad: DERIVACION(
      "BUG 7 (variante JS) — la sonda SÍ tiene `static create()`/`get value()`/`set value()`/campo " +
        "`#secret`: `static`/`get`/`set` llegan como hijos sin nombre de campo (mismo mecanismo que " +
        "`public`/`private` en TS), y `#privado` es un prefijo de IDENTIFICADOR, no un campo de " +
        "modificador. Arreglo fuera de alcance (`detect/capabilities.ts`).",
    ),
    genericos: NO_EXISTE("JS plano no tiene genéricos."),
    modulos: NO_EXISTE("El sistema de módulos de JS plano es `import`/`export`, no una declaración `namespace`/`module`/`package` — ese vocabulario sólo lo ejercita `namespace` de TS."),
  },
  python: {
    "unidad-tipo-clase": T(),
    herencia: T(),
    interfaz: NO_EXISTE("`Protocol`/ABC son convención de biblioteca vía herencia (`class Multi(Shape, Protocol)`), invisible a la gramática como nodo de interfaz dedicado."),
    "tipos-explicitos": T(), // F5: `def annotated(x: int, y: str = "a") -> bool` agregado — antes NI UNA anotación en toda la sonda.
    imports: T(), // F5: `import os` agregado — `import_statement` matchea el vocabulario genérico (no así `import_from_statement`, que no matchea, pero basta uno).
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": NO_EXISTE("`__init__` es una convención de NOMBRE sobre un `function_definition` común — Python no tiene un nodo de gramática propio para constructor, igual que Ruby/JS/TS (documentado ya en `detect/capabilities.ts`, no es un bug nuevo)."),
    visibilidad: NO_EXISTE("Python no tiene palabras clave de visibilidad; la convención es el prefijo `_`/`__` en el NOMBRE, no un campo de modificador."),
    genericos: T(), // F5: `def first[T](items: list[T]) -> T` (PEP 695) agregado — `function_definition`/`class_definition` exponen `type_parameters`.
    modulos: T(),
  },
  go: {
    // ROOT-CAUSE FIX (frente "Go: extends/implements/mixes-in/satisfies, una
    // sola causa"): `type_spec` (Go's ONE node type for every `type X ...`
    // declaration) never exposed `body`, so `classNodes` derived EMPTY for Go
    // regardless of how many structs/interfaces a repo declared — the exact
    // gap this cell used to document. `code-grammar.ts#GO_TYPE_SPEC_WORD`
    // (mechanism B, matched on `type_spec`'s own dedicated node-type name,
    // same standing as `RECORD_NODE_WORD`/`CONSTRUCTOR_NODE_WORD`) now admits
    // it: `name`+`type` fields, never `body`, structurally distinct from
    // Go's `var_spec`/`const_spec`/`field_declaration`/`parameter_declaration`
    // (which share the same two-field shape but are NOT type declarations)
    // only by matching `type_spec`'s own grammar name. `classNodes` is no
    // longer empty for Go — measured `{"type_spec"}` against the production
    // probe — so `unidad-tipo-clase` flips to true. This is what unblocks
    // `graph/edges/interfaz-declarada.ts`'s already-written Go `SENTINEL`
    // (`file.sets.classNodes.has(path.ownerType)` was its only gate) and
    // `graph/edges/satisfies-derive.ts`'s `family === "class-like"` filter.
    "unidad-tipo-clase": T(),
    herencia: NO_EXISTE("Go no tiene herencia; el struct embebido (`type Named struct { Shape; Label string }`) es semánticamente distinto y no resuelve `INHERITANCE_FIELDS`."),
    interfaz: T(),
    "tipos-explicitos": T(),
    imports: T(), // F5: `import "fmt"` agregado.
    excepciones: NO_EXISTE("Go no tiene try/catch; el idioma `if err != nil`/`panic`/`recover` no matchea el vocabulario `rescue|except|catch|with|using` — decisión de diseño del lenguaje, no una sonda incompleta."),
    ternario: NO_EXISTE("Go deliberadamente NO tiene operador ternario (decisión de diseño documentada del lenguaje)."),
    // Casi un falso positivo tras el fix de arriba: `method_spec` (la firma de
    // método de una interfaz, `Area() int`, ahora function-like vía
    // `code-grammar.ts#GO_METHOD_SPEC_WORD` — necesario para que
    // `satisfies-derive.ts` tenga firmas de interfaz que comparar) SÓLO
    // aparece con ámbito "tipo", nunca suelta, exactamente la forma que
    // `hasDedicatedConstructorNode` busca — pero es una firma sin `body`, no
    // un constructor. `detect/capabilities.ts`'s guarda `seenBodyless` (nueva)
    // lo excluye: un candidato "sólo dentro de un tipo" que además se vio
    // ALGUNA VEZ sin `body` no cuenta, porque un constructor real (Java/C#'s
    // `constructor_declaration`) siempre tiene uno. Medido: sigue `false`.
    "nodo-constructor": NO_EXISTE("Go no tiene constructores; `NewXxx` es convención de nombre de función común, sin nodo de gramática propio."),
    visibilidad: NO_EXISTE("Go usa capitalización del identificador (exportado/no exportado), no palabras clave de modificador."),
    genericos: T(), // F5: `func Identity[T any](x T) T` agregado — `type_parameters` field.
    modulos: T(),
  },
  java: {
    "unidad-tipo-clase": T(),
    herencia: T(),
    interfaz: T(), // F5: `interface Describable { ... }` agregado — BUG 4 del planteo original, cerrado esta ola.
    "tipos-explicitos": T(),
    imports: T(), // F5: `import java.util.List;` agregado.
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": T(), // F5: al agregar `Runnable lambda = () -> ...` (nested dentro de un método), `lambda_expression` queda "visto fuera de tipo" y desbloquea la heurística relacional de `hasDedicatedConstructorNode` para `constructor_declaration` — BUG 9 cerrado como efecto lateral correcto de una sonda-incompleta real (Java sin lambda), no tocando `detect/capabilities.ts`.
    visibilidad: VISIBILIDAD_MODIFIERS_UNNAMED("java", "`private String name;` y `public` en cada miembro"),
    genericos: T(), // F5: `class Box<T> { ... }` agregado.
    modulos: T(), // F5: `package com.example;` agregado.
  },
  csharp: {
    "unidad-tipo-clase": T(),
    herencia: T(),
    interfaz: T(), // F5: `interface IDescribable { ... }` agregado.
    "tipos-explicitos": T(),
    imports: T(),
    excepciones: T(),
    ternario: T(),
    "nodo-constructor": T(), // F5: mismo mecanismo que Java — `(x) => { return x + 1; }` (lambda CON paréntesis y cuerpo de bloque) sí expone `parameters`+`body`, a diferencia de `n => n % 2 == 0` (lambda simple, sin campo `parameters`), y desbloquea la heurística.
    visibilidad: VISIBILIDAD_MODIFIERS_UNNAMED("csharp", "`private string name;` y `public` en cada miembro"),
    genericos: T(), // F5: `class Box<T> { ... }` agregado.
    modulos: T(), // F5: namespace `MyApp` envolviendo todo — ya estaba antes de esta ola (BUG 8 documentaba sólo el import, no el namespace).
  },
  // D3 (Ola 11b) — Rust. Fila MEDIDA con `scripts/probe-lang-caps.mts rust`
  // sobre `RUST_PROBE` y `tree-sitter-rust.wasm`, no escrita a mano: 4 SI
  // (unidad-tipo-clase, interfaz, tipos-explicitos, genericos), 7 no.
  rust: {
    "unidad-tipo-clase": T(), // `struct_item`/`trait_item`/`enum_item` exponen `body`+`name`.
    herencia: NO_EXISTE(
      "Rust no tiene herencia de implementación: `impl Trait for Type` es adopción de interfaz (ya cubierta por `interfaz`), y los supertraits (`trait A: B`) son un límite de trait, no una superclase. Ningún nodo de tipo resuelve `INHERITANCE_FIELDS` ni un hijo posicional `HERITAGE_WORD` — medido.",
    ),
    interfaz: T(), // `trait_item` matchea `INTERFACE_WORD` (`trait`) sin agregar nada al vocabulario.
    "tipos-explicitos": T(), // `field_declaration`/`let_declaration`/`impl_item` resuelven el campo `type`.
    imports: DERIVACION(
      "La sonda SÍ tiene `use std::collections::HashMap;`. El nodo es `use_declaration` y " +
        "`IMPORT_WORD` (`detect/capabilities.ts:32`) es /(^|_)(import|require|using)(_declaration|_statement)?$/ " +
        "— trae `using` (C#) pero no `use`. Agregar `use` al vocabulario es exactamente la entrada de " +
        "léxico que D3 prohíbe: se REPORTA como hueco del vocabulario genérico, no se tapa acá.",
    ),
    excepciones: NO_EXISTE(
      "Rust no tiene try/catch: el manejo de error es `Result`/`?`/`match`, sin ningún nodo que matchee `rescue|except|catch|with|using`. Misma clase de ausencia real que Go.",
    ),
    ternario: NO_EXISTE(
      "Rust deliberadamente no tiene operador ternario; `if cond { a } else { b }` es un `if_expression` común (decisión de diseño documentada del lenguaje, igual que Go).",
    ),
    "nodo-constructor": NO_EXISTE(
      "Rust no tiene constructores: `fn new(...) -> Self` es una función asociada común dentro de un `impl`, sin nodo de gramática propio — misma situación que `NewXxx` en Go.",
    ),
    visibilidad: DERIVACION(
      "La sonda SÍ tiene `pub fn`/`pub struct`/`pub mod`. `pub` llega como hijo POSICIONAL " +
        "(`visibility_modifier`) sin nombre de campo, nunca como el campo `modifiers`/`visibility` que " +
        "`MODIFIER_FIELDS` busca — misma variante de BUG 7 que java/csharp/typescript/tsx/vue. Arreglo " +
        "fuera de alcance de D3 (`detect/capabilities.ts`): reportado, no tocado.",
    ),
    genericos: T(), // `pub fn identity<T>(x: T) -> T` — `function_item` resuelve `type_parameters`.
    modulos: DERIVACION(
      "La sonda SÍ tiene `pub mod utils { … }`. El nodo es `mod_item` y `MODULE_WORD` " +
        "(`detect/capabilities.ts:33`) es /(^|_)(module|namespace|package)(_declaration)?$/ — no cubre la " +
        "abreviatura `mod`. Mismo hueco de vocabulario que `imports` de arriba, misma decisión: se reporta.",
    ),
  },
  // D3 (Ola 11b) — Elixir. Fila MEDIDA con `scripts/probe-lang-caps.mts elixir`
  // sobre `ELIXIR_PROBE` y `tree-sitter-elixir.wasm`: 1 SI de 11. NO es una
  // sonda incompleta (la sonda ejercita defmodule/def/defp/guardas/case/cond/
  // if/for/try-rescue/use/import/alias/@behaviour/defstruct): es que la
  // gramática NO EXPONE NI UN CAMPO `body`/`parameters`/`name`/`condition`/
  // `alternative` en NINGÚN nodo — todo Elixir parsea como `call` (campo
  // único: `target`) más `do_block`/`arguments`/`stab_clause`. Verificado
  // volcando tipo→campos con `scripts/probe-rust-elixir.mts --dump`.
  elixir: {
    "unidad-tipo-clase": DERIVACION(
      "La sonda SÍ tiene `defmodule Circle do … end` y `defstruct`. `defmodule` parsea como `call` " +
        "(target=`defmodule`) + `do_block`, y `do_block` NO es un campo `body` — `isClassLike` " +
        "(`code-grammar.ts`) exige `body`+`name` y ningún nodo de esta gramática resuelve ninguno de los " +
        "dos. `classNodes` deriva VACÍO, medido.",
    ),
    herencia: NO_EXISTE(
      "Elixir no tiene herencia (ni clases). La composición es `use`/`import`/`@behaviour`, semánticamente mixin/interfaz, no superclase.",
    ),
    interfaz: DERIVACION(
      "La sonda SÍ tiene `@behaviour Notifier` y `@callback` — el equivalente exacto de una interfaz. " +
        "Pero `@behaviour` es un `unary_operator` sobre un `call`, no un nodo cuyo TIPO matchee " +
        "`INTERFACE_WORD` (`interface|protocol|trait`), y ningún nodo resuelve `INTERFACE_FIELDS`. " +
        "Verlo exigiría mirar el NOMBRE del atributo de módulo, que es léxico por lenguaje: no se hace.",
    ),
    "tipos-explicitos": NO_EXISTE(
      "Elixir es dinámico; los typespecs (`@spec`/`@callback`) son atributos de módulo (llamadas), no anotaciones de tipo en un campo `type`/`return_type` del árbol.",
    ),
    imports: DERIVACION(
      "La sonda SÍ tiene `use Shape`, `import Enum, only: [reduce: 3]` y `alias Shape, as: Base`. Los " +
        "tres parsean como `call` — el TIPO de nodo es `call` en los tres casos, nunca `import_statement`/" +
        "`use_declaration`, así que `IMPORT_WORD` (que testea el tipo de nodo) no puede verlos. Distinguirlos " +
        "exigiría mirar el TEXTO del `target`, que es léxico por lenguaje: no se hace.",
    ),
    // ÚNICA capacidad que sale SI: `rescue_block` matchea `EXCEPTION_WORD` por
    // NOMBRE de tipo (mecanismo B), el único de los dos mecanismos que
    // sobrevive en esta gramática.
    excepciones: T(),
    ternario: NO_EXISTE("Elixir no tiene operador ternario; usa `if/else`, que además es una macro, no una construcción sintáctica propia."),
    "nodo-constructor": NO_EXISTE(
      "Elixir no tiene constructores ni clases; `%Struct{}` es un literal y `new/1` es convención de nombre sobre una función común.",
    ),
    visibilidad: DERIVACION(
      "La sonda SÍ distingue `def` (público) de `defp` (privado) — la visibilidad está en el TARGET de la " +
        "llamada, no en un campo `modifiers`/`visibility`. Misma familia que BUG 7, agravada: acá ni " +
        "siquiera hay un hijo posicional de tipo modificador que mirar.",
    ),
    genericos: NO_EXISTE("Elixir no tiene genéricos de tiempo de compilación."),
    modulos: DERIVACION(
      "La sonda SÍ tiene tres `defmodule`. El nodo es `call` (target=`defmodule`), nunca un tipo que " +
        "matchee `MODULE_WORD` (`module|namespace|package`) — la palabra `module` está en el TEXTO del " +
        "target, no en el tipo de nodo. Mismo motivo estructural que `imports`/`unidad-tipo-clase`.",
    ),
  },
};

describe("capability-matrix — mecanismo anti-sonda-incompleta (CONTRATO-F5 §Contrato 3, mecanismo 1)", () => {
  it("cada lenguaje declarado en LANGUAGE_DECLS tiene una fila en FROZEN_MATRIX", () => {
    const missing = LANGUAGE_DECLS.map((d) => d.id).filter((id) => !(id in FROZEN_MATRIX));
    expect(missing, `lenguajes en LANGUAGE_DECLS sin fila en FROZEN_MATRIX: ${missing.join(", ")}`).toEqual([]);
  });

  it("FROZEN_MATRIX no tiene filas huérfanas (un lenguaje que ya no existe en LANGUAGE_DECLS)", () => {
    const known = new Set(LANGUAGE_DECLS.map((d) => d.id));
    const orphaned = Object.keys(FROZEN_MATRIX).filter((id) => !known.has(id));
    expect(orphaned, `filas de FROZEN_MATRIX sin lenguaje real: ${orphaned.join(", ")}`).toEqual([]);
  });

  it("toda celda declarada cubre las 11 capacidades, ni una de más ni una de menos", () => {
    const problems: string[] = [];
    for (const [lang, row] of Object.entries(FROZEN_MATRIX)) {
      const keys = Object.keys(row);
      const missing = ALL_CAPS.filter((c) => !keys.includes(c));
      const extra = keys.filter((k) => !(ALL_CAPS as readonly string[]).includes(k));
      if (missing.length) problems.push(`${lang}: faltan ${missing.join(",")}`);
      if (extra.length) problems.push(`${lang}: sobran ${extra.join(",")}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("toda celda `false` tiene motivo, y todo motivo sonda-incompleta/derivacion-incompleta tiene un waiver escrito y no trivial", () => {
    const problems: string[] = [];
    for (const [lang, row] of Object.entries(FROZEN_MATRIX)) {
      for (const cap of ALL_CAPS) {
        const cell = row[cap];
        if (!cell) continue;
        if (cell.expected === false) {
          if (!cell.motivo) {
            problems.push(`${lang}.${cap}: false sin motivo`);
            continue;
          }
          if (cell.motivo === "sonda-incompleta" || cell.motivo === "derivacion-incompleta") {
            if (!cell.waiver || cell.waiver.trim().length < 20) {
              problems.push(`${lang}.${cap}: motivo "${cell.motivo}" sin waiver escrito (o demasiado corto) — no se puede dejar en silencio`);
            }
          }
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("ningún motivo es sonda-incompleta al día de hoy — esta ola cerró todo lo que era arreglable en la sonda", () => {
    const stillIncomplete: string[] = [];
    for (const [lang, row] of Object.entries(FROZEN_MATRIX)) {
      for (const cap of ALL_CAPS) {
        if (row[cap]?.motivo === "sonda-incompleta") stillIncomplete.push(`${lang}.${cap}`);
      }
    }
    expect(stillIncomplete, `sonda-incompleta sin cerrar: ${stillIncomplete.join(", ")}`).toEqual([]);
  });

  it.each(LANGUAGE_DECLS)("$id: la tabla REAL (derivada de la sonda de producción) coincide con FROZEN_MATRIX, capacidad por capacidad", async (decl) => {
    const { Parser, Language } = await loadRuntime();
    const parser = new Parser();
    const lang = await Language.load(wasmPath(decl.wasm));
    parser.setLanguage(lang);
    const tree = parser.parse(decl.probeSource);
    expect(tree.rootNode.hasError, `la sonda de "${decl.id}" no parsea limpio — ver decl.probeSource`).toBe(false);

    const sets = deriveNodeSets(tree.rootNode, decl.extraCloneNodes, decl.functionExclusions);
    const actual = deriveCapabilities(tree.rootNode, sets);

    const row = FROZEN_MATRIX[decl.id];
    expect(row, `"${decl.id}" no tiene fila en FROZEN_MATRIX`).toBeDefined();

    const diffs: string[] = [];
    for (const cap of ALL_CAPS) {
      const expected = row![cap]?.expected;
      const got = actual.has(cap);
      if (expected !== got) {
        diffs.push(`${cap}: esperado ${expected}, medido ${got}`);
      }
    }
    expect(
      diffs,
      `"${decl.id}" cambió respecto a FROZEN_MATRIX (la sonda o la derivación se movieron sin actualizar este archivo):\n${diffs.join("\n")}`,
    ).toEqual([]);
  });
});
