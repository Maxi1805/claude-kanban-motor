/**
 * La matriz de cobertura de aristas — CONTRATO-F9.md §5.1. El punto de
 * diseño que hace que la compuerta (F6) atrape los seis casos conocidos
 * (A7: `imports` en 4 lenguajes; A8: `calls` en C#; y los 4 bugs de sonda)
 * de una vez: la matriz es **(EdgeKind × lenguaje)**, NO (extractor ×
 * lenguaje). Tres de los seis casos son `kind`s que NINGÚN `EdgeExtractor`
 * de `graph/edges/registry.ts` produce — `imports` sale de
 * `graph/imports-target.ts`, `calls` de la partición callee/no-callee de
 * `graph/build.ts`, `satisfies` de `graph/edges/satisfies-derive.ts` — así
 * que una matriz organizada por extractor los deja fuera por construcción.
 *
 * Este archivo es SÓLO el vocabulario + las 12 entradas (una por `EdgeKind`,
 * exhaustivo — `Record<EdgeKind, EdgeKindSpec>` no compila si falta una).
 * `needs`/`producer` están rellenos con lo que YA es verdad hoy (leído de
 * cada extractor: `herencia.ts#needs`, `imports.ts#needs`, etc. — ver el
 * comentario de cada entrada). `absentIn` queda VACÍO a propósito: el
 * contrato exige que cada razón venga con una RUTA DE FIXTURE que la
 * demuestre (§5.1: "una razón sin fixture no cuenta"), y F0 no corrió
 * ninguna corrida de corpus para verificar ninguna. Poblarlo con las 6
 * celdas conocidas (más las que aparezcan) es trabajo de F6 — hasta
 * entonces, toda celda muda mide como `mudo-sin-razon` (una violación
 * correcta y esperada: es exactamente lo que `edge-coverage-waivers.json`
 * de F6 existe para blanquear con su propia razón+fixture).
 *
 * *** CASO DECLARADO, no escondido: `"carries"`. *** El contrato (§3.3)
 * describe DOS mecanismos para el mismo `kind` — `carries-derive.ts` (forma
 * 1, deriva del grafo ya armado, sin AST, mismo patrón que
 * `satisfies-derive.ts`) y `portador.ts` (forma 2, extractor normal con
 * centinela por lenguaje). `EdgeKindSpec.producer` sólo admite UN valor: se
 * eligió `"extractor"` porque es el mecanismo cuya cobertura por lenguaje
 * depende de un centinela concreto por gramática (lo que esta compuerta
 * mide), mientras que la forma derivada corre siempre que el grafo tenga
 * `references`. Si esto resulta insuficiente cuando F3 aterrice, es una
 * decisión de F6 (dueño de esta compuerta) ensanchar `producer` a una unión
 * — reportado acá para que no sorprenda.
 */
import type { Capability } from "../detect/capabilities.js";
import type { EdgeKind } from "./types.js";

export interface EdgeKindSpec {
  readonly kind: EdgeKind;
  /** Quién la emite, para saber a quién culpar de una celda muda. */
  readonly producer: "extractor" | "cascade" | "derived" | "attach";
  /** Qué capacidad de `detect/capabilities.ts` exige. Vacío = todas (nunca `no-aplicable` por capacidad). */
  readonly needs: readonly Capability[];
  /**
   * Lenguaje → por qué esta construcción NO EXISTE ahí. Cada razón exige una
   * ruta de fixture que la demuestre (§5.1) — F0 no verificó ninguna, así
   * que este mapa arranca VACÍO en todas las entradas; F6 lo puebla con
   * fixture en mano.
   */
  readonly absentIn: Readonly<Record<string, string>>;
}

export const EDGE_KIND_SPECS: Readonly<Record<EdgeKind, EdgeKindSpec>> = {
  // Estructural — de `graph/build.ts#buildNodesAndContains`, sobre `symbols`. Ningún lenguaje carece de "contiene": vacío no es una opción real.
  contains: { kind: "contains", producer: "derived", needs: [], absentIn: {} },
  // La cascada de 9 etapas (`resolve.ts`) sobre TODO candidato no-callee.
  references: { kind: "references", producer: "cascade", needs: [], absentIn: {} },
  // `graph/edges/herencia.ts#extractor.needs` — verbatim.
  // absentIn.csharp RETIRADO esta ola (frente "el extractor no ve"): C# ya
  // NO es un cero de lenguaje entero. `class X : Base, IFoo` sigue
  // compartiendo `base_list` sin campo que distinga clase base de
  // interfaces, pero la aridad REAL de cada declaración (medida, no
  // adivinada) acota la ambigüedad: una lista de UN candidato SÍ se reclama
  // acá (residual medido, ver herencia.ts §"AMBIGÜEDAD DECLARADA — C#");
  // una lista de 2+ deja la posición 0 sin reclamar (esa sí sigue siendo
  // genuinamente ambigua). Fixture: `herencia.test.ts` — "csharp: lista de
  // UN solo candidato" / "csharp: lista de 2+ candidatos".
  extends: { kind: "extends", producer: "extractor", needs: ["herencia"], absentIn: {} },
  // `graph/edges/interfaz-declarada.ts#extractor.needs` — verbatim.
  // absentIn.csharp RETIRADO esta ola, MISMA razón que `extends` de arriba
  // (misma `base_list` compartida, mismo mecanismo de aridad): las
  // posiciones 1..N de una lista de 2+ son interfaz con certeza estructural
  // (a lo sumo una clase base, y si existe va primero) — se reclaman. Una
  // lista de UN candidato es de `herencia.ts`, no de acá. Fixture:
  // `interfaz-declarada.test.ts` — "csharp: lista de 2+ candidatos" / "csharp:
  // lista de UN solo candidato".
  implements: { kind: "implements", producer: "extractor", needs: ["interfaz"], absentIn: {} },
  // `graph/edges/mixin.ts#extractor.needs` — verbatim.
  // absentIn poblado por F6 (Ola 9) para los 8 lenguajes sin sonda de mixin
  // registrada — `mixin.ts` documenta (línea ~257) que de los 9 lenguajes
  // soportados SÓLO Ruby trae sonda: `include`/`extend`/`prepend` son un
  // statement de invocación desnudo (arity=1) directo en el cuerpo de una
  // clase/módulo, una FORMA que sólo la gramática de Ruby distingue de
  // cualquier otra llamada — las demás gramáticas o no tienen esa forma
  // sintáctica (un cuerpo de clase que admite un statement de invocación
  // suelto) o no tienen mixins como construcción del lenguaje en absoluto.
  // Fixture: `mixin.test.ts` — "no aplicable en javascript: ningún cuerpo de
  // clase admite un statement de invocación desnudo — 0 hallazgos" (línea
  // ~210) y "no aplicable en python: sin sonda registrada" (línea ~230);
  // typescript/tsx/vue comparten la misma familia de gramática ECMA que
  // javascript (mismo tipo de nodo de cuerpo de clase); go/java/csharp no
  // tienen mixins como construcción en absoluto.
  "mixes-in": {
    kind: "mixes-in",
    producer: "extractor",
    needs: ["unidad-tipo-clase", "modulos"],
    absentIn: {
      typescript: "Sin sonda de mixin registrada — mismo cuerpo de clase ECMA que javascript, ningún statement de invocación desnudo en esa posición. Ver mixin.ts línea ~257 y mixin.test.ts:210.",
      tsx: "Sin sonda de mixin registrada — misma gramática ECMA que javascript. Ver mixin.ts línea ~257 y mixin.test.ts:210.",
      vue: "Sin sonda de mixin registrada — misma gramática ECMA que javascript (el <script> se parsea como TS). Ver mixin.ts línea ~257 y mixin.test.ts:210.",
      javascript: "Ningún cuerpo de clase admite un statement de invocación desnudo en esa posición — verificado, 0 hallazgos incluso forzando la corrida. Ver mixin.test.ts:210.",
      python: "Sin sonda de mixin registrada — Python no tiene include/extend/prepend como construcción del lenguaje. Ver mixin.ts línea ~257 y mixin.test.ts:230.",
      go: "Go no tiene mixins como construcción del lenguaje (ni `unidad-tipo-clase` real — ver FROZEN_MATRIX de capability-matrix.test.ts). Ver mixin.ts línea ~257.",
      java: "Java no tiene include/extend/prepend como construcción del lenguaje (composición de interfaces por otra vía, no por esta forma). Ver mixin.ts línea ~257.",
      csharp: "C# no tiene include/extend/prepend como construcción del lenguaje. Ver mixin.ts línea ~257.",
    },
  },
  // `graph/edges/instanciacion.ts#extractor.needs` — verbatim (vacío: cualquier lenguaje con un nodo de instanciación reconocible).
  instantiates: { kind: "instantiates", producer: "extractor", needs: [], absentIn: {} },
  // `graph/imports-target.ts` — resolución de ruta de import, NO la cascada de 9 etapas ni un `EdgeExtractor` registrado.
  // `needs` era `["imports"]`, copia verbatim de `graph/edges/imports.ts#extractor.needs`, y lo sigue siendo: ese extractor
  // lo bajó a `[]` en la Ola 11b porque la capacidad `imports` se deriva de TIPOS DE NODO y no puede ver un import escrito
  // como LLAMADA (el `require` de Ruby y el de CommonJS) — ver el comentario largo en ese archivo. Consecuencia deliberada
  // acá: ninguna celda `(imports, lenguaje)` queda ya en `no-aplicable` por capacidad; la que no emita tiene que declarar su
  // razón en `absentIn` o en `edge-coverage-waivers.json`, que es la disciplina que esta compuerta existe para forzar.
  imports: { kind: "imports", producer: "derived", needs: [], absentIn: {} },
  // `graph/edges/satisfies-derive.ts` — deriva de `contains` ya armado, sin AST, sin capacidad propia (comparación estructural de miembros).
  satisfies: { kind: "satisfies", producer: "derived", needs: [], absentIn: {} },
  // Partición callee/no-callee de los MISMOS candidatos de `references` (CONTRATO-F8G.md §3.1) — misma cascada. A8 vive acá: C# en cero.
  calls: { kind: "calls", producer: "cascade", needs: [], absentIn: {} },
  // CONTRATO-F9.md §2.2 — `attachFindingNodes`, sobre la lista de `Finding` ya calculada. No depende de AST ni de capacidad de lenguaje.
  affects: { kind: "affects", producer: "attach", needs: [], absentIn: {} },
  // CONTRATO-F9.md §3 — ver la nota de arriba sobre el productor elegido. `needs: []` provisional: F3 todavía no aterrizó, no hay evidencia para angostarlo.
  carries: { kind: "carries", producer: "extractor", needs: [], absentIn: {} },
  "invokes-indirect": { kind: "invokes-indirect", producer: "extractor", needs: [], absentIn: {} },
  // Ola R (R1) — `graph/edges/declara-tipo.ts#extractor`, un `EdgeExtractor`
  // registrado normal (corre en producción vía `warmup.ts#extractEdgeFacts`).
  // `needs: []` verbatim de ese archivo: ninguna `Capability` de
  // `detect/capabilities.ts` describe "este lenguaje escribe el tipo de sus
  // declaraciones", así que el gate real es que la gramática tenga el campo
  // `type` — se mide sola, cero hechos, igual criterio que `instanciacion`.
  //
  // *** `absentIn` VACIADO EN LA OLA R (R2), Y NO ES UN AFLOJE: ES LO
  // CONTRARIO. *** R1 declaró acá `ruby` y `javascript` como
  // `sin-construccion` porque ninguna de esas dos gramáticas tiene dónde
  // escribir un tipo — cierto, y sigue siendo cierto para la VÍA 1. Pero
  // `absentIn` es una propiedad del KIND, no de una vía, y desde R2 este kind
  // tiene una SEGUNDA vía (`graph/edges/propaga-tipo.ts`: el tipo se propaga
  // desde el ORIGEN del valor — `x = Foo()`, `@cache = {}`), que existe
  // precisamente para esos dos lenguajes. Medido en producción: jekyll 46
  // aristas y 213 sitios, rubocop 64 y 1.488 (ruby); eslint 40 aristas y
  // 1.405 sitios, preact 2 y 162 (javascript). Dejar la razón puesta habría
  // hecho que la compuerta contestara `sin-construccion` con `n: 0` para dos
  // celdas que EMITEN — o sea, habría ESCONDIDO emisión real detrás de una
  // excusa de lenguaje, que es justo lo que este campo existe para impedir.
  // Con `absentIn` vacío, las dos celdas tienen que sostenerse solas: si un
  // día dejan de emitir, la compuerta las marca `mudo-sin-razon`.
  "declares-type": { kind: "declares-type", producer: "extractor", needs: [], absentIn: {} },
  // Ola R (R3) — `graph/edges/cadena-identidad.ts#extractor`, un
  // `EdgeExtractor` registrado normal. `needs: []` verbatim de ese archivo,
  // por el mismo motivo que `instanciacion`: ninguna `Capability` describe
  // "este lenguaje puede construir objetos y guardarlos en un binding".
  //
  // *** CASO DECLARADO, NO ESCONDIDO: C# mide CERO y la causa NO está en este
  // extractor. *** `absentIn` queda VACÍO a propósito, porque la razón de C#
  // no es "esta construcción no existe en el lenguaje" (existe: `class F {
  // static object x = new T(); }`) sino que `graph/symbols.ts` no MINTA el
  // nodo del binding: su regla de nombre es `childForFieldName("name") ??
  // childForFieldName("left")`, y el `variable_declarator` de C# lleva su
  // identificador en posición 0, SIN campo. Medido de punta a punta sobre el
  // corpus (newtonsoft-json: 0 nodos `symbol` con `family: "other"` en todo
  // el repo, contra 57 en cobra / 405 en nest / 373 en click / 130 en
  // jekyll). Sin nodo `from` no puede haber arista sin colgarla, y una arista
  // colgada es exactamente el defecto que `graph/edge-endpoints.test.ts`
  // existe para impedir. Poner acá una razón `absentIn` para C# sería
  // blanquear con "el lenguaje no lo tiene" un agujero que SÍ se arregla —
  // ver el PIDO A OTRO FRENTE de `ola-r/informes/R3.md`.
  stores: { kind: "stores", producer: "extractor", needs: [], absentIn: {} },
};
