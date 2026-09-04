/**
 * `mixes-in` — mixin / composición de módulos (CONTRATO-F4.md §2, arista
 * "mixin", el caso difícil del catálogo).
 *
 * RELACIÓN: una unidad tipo-clase (clase o módulo) incorpora el
 * comportamiento de OTRA unidad tipo-clase declarada en otro lugar del
 * código, sin herencia de clase base — el mecanismo de Ruby
 * `include`/`extend`/`prepend` es el único representante real entre los 9
 * lenguajes soportados (ver LÍMITES POR LENGUAJE).
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: en Ruby, `include HubspotModule` y
 * `authorize Deal, policy_class: X` producen literalmente el MISMO nodo
 * `call`, con los MISMOS campos (`method`, `arguments`) — el nombre del
 * método (`include` vs `authorize`) es la única diferencia superficial, y
 * usarlo violaría el requisito duro del proyecto. Este extractor NUNCA lee
 * `stmt.childForFieldName("method")`; distingue por FORMA:
 *
 *   1. El nodo candidato es un ESTATEMENT DIRECTO del cuerpo de una unidad
 *      tipo-clase (`file.sets.classNodes`) — no anidado dentro de un método
 *      ni de un bloque. Esto sale gratis de recorrer sólo los hijos
 *      NOMBRADOS DIRECTOS del campo genérico `body` (el mismo campo que
 *      `code-grammar.ts#isClassLike` ya usa para decidir "esto es una
 *      unidad tipo-clase"): un `include` dentro de un `def` queda a dos
 *      niveles de distancia del `body` de la clase (pasa por el `body` del
 *      método), así que nunca es un hijo directo y el filtro lo excluye sin
 *      necesitar reconocer "método"/"bloque" por nombre.
 *   2. El nodo candidato expone un campo genérico `arguments` (el MISMO
 *      campo, con el MISMO nombre, que usan `call`/`call_expression`/
 *      `method_invocation`/`invocation_expression` en las 6 gramáticas
 *      donde se verificó por sonda directa — ver `mixin.test.ts`) cuyo ÚNICO
 *      hijo nombrado es una referencia DESNUDA (ver `isBareReferenceLike`
 *      abajo: ni pareja clave/valor —lo que descarta `policy_class: X`—, ni
 *      una invocación anidada). Ambos filtros son de ARIDAD y FORMA, nunca
 *      de vocabulario.
 *
 * SONDA CENTINELA: `SENTINEL.ruby` declara `SentinelHostClass` incluyendo
 * `SentinelSideModule`; `discoverCarrier` (mismo mecanismo de
 * `graph/edges/sentinel.ts`) recupera el camino real desde el nodo
 * declarante hasta el nombre centinela — confirmado por sonda directa
 * (`mixin-probe/dump*.mjs`, scratchpad de esta tarea) antes de escribir esta
 * lógica, nunca asumido. La negativa (`authorize Deal, policy_class: X`,
 * dentro de `mixin.test.ts`) se usó para verificar que el filtro de aridad y
 * de pareja clave/valor SÍ la excluye — sin nombrar `authorize` en ningún
 * lado del código de producción.
 *
 * SIMPLIFICACIÓN DECLARADA: este extractor NO verifica que `toName` resuelva
 * a un `module` (nunca a una `class`) declarado en el repo — esa
 * verificación cruza archivos, y un extractor corre POR ARCHIVO
 * (CONTRATO-F4.md §2.5). La cascada de resolución existente tampoco puede
 * aplicarla hoy (`SymbolFamily` no distingue `class`/`module`: ambos son
 * `"class-like"`, ver `graph/symbols.ts`). La medición previa
 * (`revision2/1c-aristas.md` §4) usó esa verificación cruzada y midió
 * precisión 1,00/recall 0,39; este extractor mide, SIN ella, sólo con los
 * dos filtros estructurales de arriba, sobre el corpus real — ver el reporte
 * final de la tarea para el número honesto.
 *
 * CAUSA DE LA FUGA jekyll (7/20, 35%) VS. rubocop (1269/1317, 96%) — esta
 * ola, frente "el extractor no ve": NO es un defecto de extracción. Corriendo
 * `extract()` directamente (vía `analyzeFile`) sobre los 17 archivos reales
 * de jekyll que declaran los 20 `include`/`extend`/`prepend` NO
 * auto-referenciales (los 6 `extend self`/`include self` del corpus son
 * correctamente excluidos, ver arriba — "control positivo/negativo... self"),
 * este extractor emite las 20 `EdgeFacts` correctas, una por statement, con
 * `toName` exacto — CONFIRMADO, no supuesto (ver `mixin.test.ts`, "jekyll:
 * las 20 declaraciones reales..."). La fuga ocurre DESPUÉS, en
 * `graph/resolve.ts` (fuera de mi alcance, y correcto que así sea): de esos
 * 20 `toName`, **13 nombran un módulo que NO está declarado en NINGÚN lugar
 * del árbol de jekyll** — 10 × `Forwardable`, 1 × `Comparable`, 1 ×
 * `Enumerable` (los tres son módulos del núcleo/stdlib de Ruby, nunca
 * definidos por la propia app) y 1 × `Liquid::StandardFilters` (de la
 * gem externa `liquid`, tampoco parte del repo analizado). La cascada de
 * resolución, que sólo enlaza contra símbolos DECLARADOS EN EL REPO
 * analizado (mismo principio ya documentado para `imports`: "un
 * paquete/módulo externo no tiene archivo que resolver y NO se intenta
 * adivinar uno"), no tiene con qué materializar esos 13 en una arista real
 * del grafo — y ADIVINAR un nodo para un módulo que no existe en el árbol
 * sería peor que omitirlo. Los otros 7 (`URLFilters`, `GroupingFilters`,
 * `DateFilters`, `Convertible` ×2, y `Jekyll::Filters::URLFilters` calificado
 * ×2) SÍ están declarados dentro de jekyll (`lib/jekyll/filters/*.rb`,
 * `lib/jekyll/convertible.rb`) y SÍ resuelven — son, byte a byte, los 7 que
 * mide el censo. **rubocop es el control que confirma la causa**: de sus
 * 1317 `include`/`extend`/`prepend` reales, sólo 3 nombran un módulo del
 * núcleo de Ruby (`Forwardable`/`Comparable`/`Enumerable`) — el resto son sus
 * PROPIOS módulos auxiliares (`RuboCop::Cop::AutoCorrector` ×499,
 * `RuboCop::Cop::RangeHelp` ×217, `RuboCop::Cop::ConfigurableEnforcedStyle`
 * ×104, todos declarados en `lib/rubocop/cop/mixin/*.rb`), así que casi todo
 * resuelve. Mismo mecanismo, mismo lenguaje — la diferencia de captura es de
 * COMPOSICIÓN DE CADA REPO (cuánto de lo que mezcla es propio vs. de
 * afuera), la misma categoría 3 ("el repo no la usa [de la forma
 * resoluble]") que ya documenta TABLA-ARISTAS.md para `extends`/`implements`
 * en otros lenguajes — no un hueco de este extractor.
 *
 * LÍMITES POR LENGUAJE: de los 9 lenguajes soportados, sólo Ruby tiene este
 * problema (confirmado por sonda directa sobre las otras 8 gramáticas,
 * `mixin-probe/dump-lang-fields.mjs`): Java/C#/Go no tienen mixins de
 * módulo; Python/JS/TS/TSX/Vue no permiten (o no usan idiomáticamente) un
 * statement de invocación desnudo como hijo directo del cuerpo de una clase
 * — sus cuerpos de clase sólo aceptan declaraciones de miembro. `optional:
 * true` documenta esto: la ausencia en 8/9 lenguajes es del LENGUAJE, no una
 * falla del extractor. Un `include`/`extend`/`prepend` envuelto en un
 * condicional (`include X if cond`, Ruby `if_modifier`) es una brecha
 * DECLARADA, no manejada: el nodo intermedio reutiliza el mismo campo
 * genérico `body` para envolver el `call`, así que sería indistinguible de
 * "un nivel más de anidamiento genuino" sin una regla ad hoc — ver
 * `mixin.test.ts`, que lo documenta con una fixture explícita en vez de
 * esconderlo.
 */
import type { EdgeContext, EdgeExtractor, EdgeFacts } from "./types.js";
import type { AstNode } from "../../detect/types.js";
import type { EdgeKind } from "../types.js";

const SENTINEL: Readonly<Record<string, string>> = {
  ruby: `
module SentinelSideModule
end

class SentinelHostClass
  include SentinelSideModule
end
`,
};

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

/** Pareja clave/valor (Ruby `pair` en un hash literal: `policy_class: X`) —
 *  prueba de FORMA, no del nombre de nodo `pair`: cualquier nodo que exponga
 *  AMBOS campos genéricos `key` y `value` es una entrada de mapa, nunca una
 *  referencia desnuda. */
function isKeyValueLike(node: AstNode): boolean {
  return hasField(node, "key") && hasField(node, "value");
}

/** Invocación anidada (`send(:include, X)`, `foo(bar())`) — mismo campo
 *  genérico `arguments` que `isInvocationLike` de abajo. */
function isInvocationLike(node: AstNode): boolean {
  return hasField(node, "arguments");
}

/**
 * REFINAMIENTO MEDIDO (reportado en la tarea con las dos corridas,
 * antes/después): el filtro de aridad+posición solo, medido sobre jekyll,
 * da precisión 0,48 / recall 0,97 (35 aciertos, 38 falsos positivos, 1 falso
 * negativo sobre 36 `include`/`extend`/`prepend` reales — ver el reporte
 * final). El folclore de Ruby `attr_reader :x`, `private_constant :X`,
 * `safe true`, `mutable false`, `delegate_method :x`, `priority :low` tiene
 * EXACTAMENTE la misma forma posicional (un statement directo del cuerpo con
 * un único argumento desnudo) que `include`/`extend`/`prepend` — el filtro
 * de forma no alcanza a distinguirlos.
 *
 * La diferencia real, confirmada por sonda directa (`mixin-probe/dump*.mjs`,
 * scratchpad de esta tarea) y NUNCA por nombre de método: en los 36 casos
 * reales del corpus, el argumento es SIEMPRE una REFERENCIA (`constant`,
 * `self`, o `scope_resolution` — un camino calificado de constantes),
 * mientras que cada falso positivo pasa un LITERAL (`simple_symbol` para
 * `:x`, `true`/`false` para los booleanos) — tree-sitter-ruby ya distingue
 * estos DOS REPERTORIOS como tipos de nodo propios, por la ORTOGRAFÍA que
 * el lenguaje mismo exige (mayúscula inicial ⇒ constante; `:` ⇒ símbolo;
 * palabra reservada ⇒ `self`/`true`/`false`) — no es una convención de este
 * proyecto, es cómo el lexer de Ruby ya tenía que resolver la ambigüedad
 * antes de llegar acá. Mismo principio y mismo nivel de justificación que
 * `TERNARY_NAME`/`CONSTRUCTOR_NODE_WORD` en `code-grammar.ts`: confirmado
 * por sonda directa, documentado, nunca asumido — y, a diferencia de un
 * nombre de MÉTODO, esta lista nunca podría confundir `include X` con
 * `authorize X` (ambos pasan una `constant`); sólo distingue REFERENCIA de
 * LITERAL, categoría estructural, no vocabulario semántico.
 *
 * Esta lista es, a propósito, Ruby-específica: el `SENTINEL` de este
 * extractor sólo tiene entrada `ruby` (ver LÍMITES POR LENGUAJE), así que no
 * hace falta una versión por lenguaje todavía — si algún día se agrega un
 * lenguaje al `SENTINEL`, este repertorio necesita su propia sonda, igual
 * que cualquier otro campo de `sentinel: Record<lang,string>`.
 */
const RUBY_REFERENCE_LEAF_TYPES: ReadonlySet<string> = new Set(["constant", "self", "scope_resolution"]);

/**
 * Referencia DESNUDA: una hoja de tipo referencia (ver `RUBY_REFERENCE_LEAF_TYPES`
 * arriba) o una cadena calificada pura (`A::B::C`, campos genéricos
 * `scope`/`name` anidados, el mismo par de campos que
 * `graph/symbols.ts`/`graph/references.ts` ya usan para calificar un
 * nombre). Rechaza cualquier forma con estructura de pareja clave/valor, de
 * invocación anidada, o de LITERAL (símbolo/booleano/cadena/número).
 */
function isBareReferenceLike(node: AstNode): boolean {
  if (isKeyValueLike(node) || isInvocationLike(node)) return false;
  if (node.childCount === 0) return RUBY_REFERENCE_LEAF_TYPES.has(node.type);
  if (!RUBY_REFERENCE_LEAF_TYPES.has(node.type)) return false;
  const name = node.childForFieldName("name") as AstNode | null;
  if (!name) return false;
  const scope = node.childForFieldName("scope") as AstNode | null;
  return scope ? isBareReferenceLike(scope) : true;
}

function qualifiedNameOf(node: AstNode): { toName: string; toQualifier: readonly string[] } {
  if (node.childCount === 0) return { toName: node.text, toQualifier: [] };
  const name = (node.childForFieldName("name") as AstNode | null)?.text ?? node.text;
  const scope = node.childForFieldName("scope") as AstNode | null;
  if (!scope) return { toName: name, toQualifier: [] };
  const inner = qualifiedNameOf(scope);
  return { toName: name, toQualifier: [...inner.toQualifier, inner.toName] };
}

function fromStatement(stmt: AstNode, hostPath: readonly string[]): EdgeFacts | null {
  if (!isInvocationLike(stmt)) return null;
  const args = stmt.childForFieldName("arguments") as AstNode | null;
  if (!args) return null;
  const named: AstNode[] = [];
  for (let i = 0; i < args.childCount; i++) {
    const child = args.child(i) as AstNode | null;
    if (child && child.isNamed) named.push(child);
  }
  if (named.length !== 1) return null;
  const [argNode] = named;
  if (!isBareReferenceLike(argNode)) return null;
  // `extend self` / `include self`: la hoja `self` DESNUDA (arity=1, sin
  // `scope`/`name`, ver `isBareReferenceLike`) apunta a LA MISMA unidad que
  // declara el statement — nunca a "otra unidad declarada en otro lugar"
  // (ver RELACIÓN en el docstring del módulo). El chequeo va acá, no dentro
  // de `isBareReferenceLike`, porque ese `self` también aparece como `scope`
  // legítimo de una cadena calificada (`self::Foo`, campo `scope` de
  // `scope_resolution`) — ahí SÍ señala otra unidad (`Foo`) y no debe
  // rechazarse; sólo el `self` COMO ARGUMENTO COMPLETO es un self-loop.
  // Confirmado por reproducción sobre el corpus real (jekyll
  // `lib/jekyll/utils.rb`, `lib/jekyll/utils/win_tz.rb`: `module X; extend
  // self`) antes de este fix, ver `mixin.test.ts`.
  if (argNode.type === "self") return null;
  const { toName, toQualifier } = qualifiedNameOf(argNode);
  if (!toName) return null;
  return {
    extractorId: mixinExtractor.id,
    kind: "mixes-in" as EdgeKind,
    fromPath: [...hostPath],
    toName,
    toQualifier,
    provenance: "declared",
    startLine: stmt.startPosition.row + 1,
    endLine: stmt.endPosition.row + 1,
    via: `${stmt.type}.arguments[0]`,
  };
}

function collect(root: AstNode, classNodes: ReadonlySet<string>): EdgeFacts[] {
  const out: EdgeFacts[] = [];
  const stack: string[] = [];

  const visit = (node: AstNode): void => {
    let pushed = false;
    if (node.isNamed && classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? null;
      if (name !== null) {
        stack.push(name);
        pushed = true;
      }
      const body = node.childForFieldName("body") as AstNode | null;
      if (body) {
        for (let i = 0; i < body.childCount; i++) {
          const stmt = body.child(i) as AstNode | null;
          if (!stmt || !stmt.isNamed) continue;
          const fact = fromStatement(stmt, stack);
          if (fact) out.push(fact);
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
    if (pushed) stack.pop();
  };
  visit(root);
  return out;
}

export const mixinExtractor: EdgeExtractor<"mixes-in"> = {
  id: "mixes-in",
  kind: "mixes-in",
  title: "Mixin / composición de módulo",
  // Ambas están estructuralmente implicadas por el mecanismo (unidad tipo-clase
  // cuyo cuerpo incorpora otra unidad tipo-clase vía un concepto de módulo),
  // no auto-chequeadas dentro de `extract` — igual que un `Detector`, el gate
  // de `needs` es responsabilidad de quien orqueste la corrida, no del propio
  // extractor (ver `run.ts`, que hace lo mismo para los detectores).
  needs: ["unidad-tipo-clase", "modulos"],
  slots: ["mixin-call-argument"],
  sentinel: SENTINEL,
  expect: { from: "SentinelHostClass", to: "SentinelSideModule" },
  optional: true,

  extract(file, _ctx: EdgeContext): readonly EdgeFacts[] {
    // Excepción sancionada por la plantilla del proyecto: decidir por
    // `language` (dato de primera clase de la unidad), documentada acá. De
    // los 9 lenguajes soportados sólo Ruby trae sonda — ver LÍMITES POR
    // LENGUAJE en el docstring del módulo.
    if (!(file.language in SENTINEL)) return [];
    return collect(file.root, file.sets.classNodes);
  },
};
