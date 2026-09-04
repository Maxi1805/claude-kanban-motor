/**
 * Tests de `decorator.ts` — la migración de `pattern-wrapping.ts#buildDecorator`
 * al motor de hipótesis.
 *
 * Carga de tree-sitter: réplica mínima del pool ya usado por
 * `pattern-wrapping.test.ts` (no exportado desde ahí) — mismo runtime
 * (`web-tree-sitter`), mismas gramáticas (`tree-sitter-wasms`).
 *
 * Cada test construye un `HypothesisContext` con un `ctx.file` REAL (árbol
 * vivo, no simulado) — es la única forma honesta de probar `required`/
 * `discriminators`/`appliedState`, que miran FORMA de AST, no sólo lo que ya
 * trae el `Finding`.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets } from "../code-grammar.js";
import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { AstNode, FileUnit, Finding, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD, buildNeighborhoodIndex, neighborhoodFor } from "../graph/neighborhood.js";
import { hypothesis as decorator, __internals } from "./decorator.js";
import { refreshHypotheses } from "./run.js";
import type { HypothesisContext } from "./types.js";

const require = createRequire(import.meta.url);

/* ── Pool mínimo de tree-sitter (idéntico en espíritu a pattern-wrapping.test.ts) ── */
interface TSNode {
  type: string;
  isNamed: boolean;
  childCount: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  child(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
  text: string;
}
interface TSParser {
  setLanguage(language: unknown): void;
  parse(source: string): { rootNode: TSNode };
}
interface TSRuntime {
  Parser: { new (): TSParser };
  Language: { load(path: string): Promise<unknown> };
}

let runtime: TSRuntime | null = null;
async function loadRuntime(): Promise<TSRuntime> {
  if (runtime) return runtime;
  const wtsMod = require("web-tree-sitter");
  const Parser = wtsMod.Parser ?? wtsMod.default ?? wtsMod;
  await Parser.init();
  const Language = Parser.Language ?? wtsMod.Language;
  runtime = { Parser, Language };
  return runtime;
}

function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}

const parsers = new Map<string, Promise<TSParser>>();
function getParser(wasm: string): Promise<TSParser> {
  let p = parsers.get(wasm);
  if (!p) {
    p = (async () => {
      const { Parser, Language } = await loadRuntime();
      const language = await Language.load(wasmPath(wasm));
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
    parsers.set(wasm, p);
  }
  return p;
}

async function parse(wasm: string, source: string): Promise<TSNode> {
  const parser = await getParser(wasm);
  return parser.parse(source).rootNode;
}

function extractVueScript(source: string): string {
  const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(source);
  return m ? m[1]! : "";
}

interface LangRow {
  language: string;
  wasm: string;
  extract: (source: string) => string;
  probeSource: string;
}

const LANGS: LangRow[] = [
  {
    language: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    extract: (s) => s,
    // OLA AD (AD3): la sonda ejercita además `if/else`, lazo y `switch`. El
    // ancla nueva deriva su conjunto "if-like" de `chainNodes ∩ nestingNodes
    // − switchContainerNodes` (nunca de una lista escrita a mano), y una sonda
    // sin `if` deja esos tres conjuntos VACÍOS — el detector quedaría mudo por
    // la sonda, no por el código. Las sondas de producción
    // (`code-analyzer.ts#TS_FAMILY_PROBE`) sí los ejercitan; ésta ahora también.
    probeSource:
      "class Probe { method(x: number) { if (x) { return 1; } else { return 2; } for (const v of [x]) { void v; } switch (x) { case 1: return 1; default: return 0; } } }\nfunction probeFn(x: number) { return x; }\n",
  },
  {
    language: "vue",
    wasm: "tree-sitter-typescript.wasm",
    extract: extractVueScript,
    // OLA AD (AD3): la sonda ejercita además `if/else`, lazo y `switch`. El
    // ancla nueva deriva su conjunto "if-like" de `chainNodes ∩ nestingNodes
    // − switchContainerNodes` (nunca de una lista escrita a mano), y una sonda
    // sin `if` deja esos tres conjuntos VACÍOS — el detector quedaría mudo por
    // la sonda, no por el código. Las sondas de producción
    // (`code-analyzer.ts#TS_FAMILY_PROBE`) sí los ejercitan; ésta ahora también.
    probeSource:
      "class Probe { method(x: number) { if (x) { return 1; } else { return 2; } for (const v of [x]) { void v; } switch (x) { case 1: return 1; default: return 0; } } }\nfunction probeFn(x: number) { return x; }\n",
  },
  { language: "ruby", wasm: "tree-sitter-ruby.wasm", extract: (s) => s, probeSource: "class Probe\n  def method(x)\n    x\n  end\nend\n" },
  // OLA U (N4) — Java entra a esta suite por el caso que `PLAN-INTENCIONES.md`
  // §6 nombra: la familia `Forwarding*` de guava, invisible entera hasta esta
  // ola porque su colaborador se expone por ACCESSOR (`delegate()`), no por
  // campo.
  {
    language: "java",
    wasm: "tree-sitter-java.wasm",
    extract: (s) => s,
    // OLA AK (AK6): la sonda ejercita además `if/else`, lazo y `switch`, por la
    // MISMA razón exacta que la Ola AD documentó en la fila de TypeScript de
    // más arriba — el conjunto "if-like" se DERIVA de `chainNodes ∩
    // nestingNodes − switchContainerNodes`, y una sonda sin `if` deja esos tres
    // conjuntos vacíos: el ancla `optional-behavior-flags` quedaba muda en Java
    // por la SONDA, no por el código. Las sondas de producción sí los
    // ejercitan; ésta ahora también. Los dos tests de Java que ya existían usan
    // `classDelegationLevel`, que no mira ninguno de esos tres conjuntos.
    // Y un CONSTRUCTOR con un campo: sin él, `constructor_declaration` no entra
    // en `functionNodes` y la inyección `this.campo = parámetro` —la condición
    // (1) del detector, "la capacidad la elige quien construye"— es invisible
    // para toda la gramática. La sonda de producción (`code-analyzer.ts#JAVA_PROBE`)
    // ya lo trae; ésta no lo traía.
    probeSource:
      "class Probe { private int f; Probe(int f) { this.f = f; } int method(int x) { if (x > 0) { return 1; } else { return 2; } for (int i = 0; i < x; i++) { } switch (x) { case 1: return 1; default: return 0; } } }\n",
  },
  // OLA U (N4) — Python entra por el docstring: es la gramática donde la
  // documentación es, literalmente, una sentencia del cuerpo.
  {
    language: "python",
    wasm: "tree-sitter-python.wasm",
    extract: (s) => s,
    // OLA AP (AP3): la sonda de Python ejercita ahora `if/elif/else`, lazo y
    // `match`, por la MISMA razón que AD3 dejó escrita para TypeScript/Vue: los
    // conjuntos "if-like" se DERIVAN de `chainNodes ∩ nestingNodes −
    // switchContainerNodes` y una sonda sin `if` los deja VACÍOS — el chequeo de
    // capacidades quedaría mudo POR LA SONDA, no por el código. La sonda de
    // producción (`code-analyzer.ts#PYTHON_PROBE`) sí los ejercita; ésta
    // no lo hacía, y por eso ningún test de capacidades de este archivo había
    // podido correr en Python.
    probeSource:
      "class Probe:\n    def method(self, x):\n        if x > 0:\n            return 1\n        elif x < 0:\n            return 2\n        else:\n            return 3\n\n    def loop(self, xs):\n        for v in xs:\n            print(v)\n\ndef probe_fn(x):\n    return x\n",
  },
  {
    language: "go",
    wasm: "tree-sitter-go.wasm",
    extract: (s) => s,
    probeSource: "package p\ntype T struct{}\nfunc (t *T) Method(x int) int {\n\treturn x\n}\nfunc ProbeFn(x int) int {\n\treturn x\n}\n",
  },
];

const nodeSets = new Map<string, DerivedNodeSets>();

beforeAll(async () => {
  for (const row of LANGS) {
    const root = await parse(row.wasm, row.probeSource);
    nodeSets.set(row.language, deriveNodeSets(root as unknown as import("../code-grammar.js").ProbeNode));
  }
}, 30_000);

/** Ubica, en `root`, el nodo función-como cuyo campo `name` matchea `fnName` —
 *  para no tener que contar líneas a mano en cada fixture. */
function findFunctionSpan(root: TSNode, sets: DerivedNodeSets, fnName: string): { startLine: number; endLine: number } {
  let found: { startLine: number; endLine: number } | null = null;
  const visit = (node: TSNode): void => {
    if (found) return;
    if (sets.functionNodes.has(node.type) && node.childForFieldName("name")?.text === fnName) {
      found = { startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) visit(c);
    }
  };
  visit(root);
  if (!found) throw new Error(`fixture inválida: no se encontró la función "${fnName}"`);
  return found;
}

/** Igual que `findFunctionSpan`, pero para el nodo de CLASE cuyo campo
 *  `name` matchea `className` — para los tests de anclas ESTRUCTURALES
 *  (large-class/refused-bequest), cuya ubicación es el span de la clase
 *  entera, no de una función. */
function findClassSpan(root: TSNode, sets: DerivedNodeSets, className: string): { startLine: number; endLine: number } {
  let found: { startLine: number; endLine: number } | null = null;
  const visit = (node: TSNode): void => {
    if (found) return;
    if (sets.classNodes.has(node.type) && node.childForFieldName("name")?.text === className) {
      found = { startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) visit(c);
    }
  };
  visit(root);
  if (!found) throw new Error(`fixture inválida: no se encontró la clase "${className}"`);
  return found;
}

/** Igual que `findClassSpan`, pero devuelve el NODO — lo que
 *  `__internals.classDelegationLevel` necesita para evaluar una clase sin
 *  pasar por `build()` (mismo uso que el resto de `__internals`). */
function findClassNode(root: TSNode, sets: DerivedNodeSets, className: string): TSNode {
  let found: TSNode | null = null;
  const visit = (node: TSNode): void => {
    if (found) return;
    if (sets.classNodes.has(node.type) && node.childForFieldName("name")?.text === className) {
      found = node;
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) visit(c);
    }
  };
  visit(root);
  if (!found) throw new Error(`fixture inválida: no se encontró la clase "${className}"`);
  return found;
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function fakeFinding(language: string, file: string, startLine: number, endLine: number, symbol: string): Finding {
  return {
    id: `f-${symbol}`,
    detectorId: "boolean-flag-param",
    kind: "boolean-flag-param",
    scope: "intra-function",
    language,
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 1, threshold: fakeThreshold() }],
    locations: [{ file, startLine, endLine, symbol, role: "problema" }],
    severity: 45,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function fakeRepo(): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones: [], graph: null };
}

async function contextFor(language: string, source: string, fnName: string): Promise<{ ctx: HypothesisContext; finding: Finding }> {
  const row = LANGS.find((r) => r.language === language)!;
  const root = await parse(row.wasm, row.extract(source));
  const sets = nodeSets.get(language)!;
  const span = findFunctionSpan(root, sets, fnName);
  const file: FileUnit = {
    path: `fixture.${language}`,
    language,
    lines: root.text.split("\n").length,
    root: root as unknown as AstNode,
    sets,
    functions: [],
  };
  const finding = fakeFinding(language, file.path, span.startLine, span.endLine, fnName);
  const ctx: HypothesisContext = {
    file,
    fileAt: () => null,
    repo: fakeRepo(),
    capabilities: new Set<Capability>(),
    setsFor: (l: string) => nodeSets.get(l) ?? sets,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
  return { ctx, finding };
}

/** Igual que `contextFor`, pero para las anclas ESTRUCTURALES
 *  (large-class/refused-bequest): la ubicación del `Finding` es el span de
 *  la CLASE (no de una función), y su `kind`/`detectorId` es el que se pasa. */
async function contextForClass(language: string, source: string, className: string, kind: string): Promise<{ ctx: HypothesisContext; finding: Finding }> {
  const row = LANGS.find((r) => r.language === language)!;
  const root = await parse(row.wasm, row.extract(source));
  const sets = nodeSets.get(language)!;
  const span = findClassSpan(root, sets, className);
  const file: FileUnit = {
    path: `fixture.${language}`,
    language,
    lines: root.text.split("\n").length,
    root: root as unknown as AstNode,
    sets,
    functions: [],
  };
  const finding: Finding = {
    id: `f-${className}`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-file",
    language,
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 1, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine: span.startLine, endLine: span.endLine, symbol: className, role: "problema" }],
    severity: 45,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
  const ctx: HypothesisContext = {
    file,
    fileAt: () => null,
    repo: fakeRepo(),
    capabilities: new Set<Capability>(),
    setsFor: (l: string) => nodeSets.get(l) ?? sets,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
  return { ctx, finding };
}

/**
 * Ola 11a (P2) — igual que `contextFor`, pero el `Finding` ancla tiene
 * `kind: "homonymous-delegation"` (`detect/intra-file/homonymous-
 * delegation.ts`): ubicación de FUNCIÓN (no de clase, a diferencia de
 * `contextForClass` — necesario para que la forma FUNCIONAL, sin nodo de
 * clase, tenga una unidad dueña que `locateFunctionAndClass` pueda ubicar).
 */
async function contextForDelegationAnchor(language: string, source: string, fnName: string): Promise<{ ctx: HypothesisContext; finding: Finding }> {
  const row = LANGS.find((r) => r.language === language)!;
  const root = await parse(row.wasm, row.extract(source));
  const sets = nodeSets.get(language)!;
  const span = findFunctionSpan(root, sets, fnName);
  const file: FileUnit = {
    path: `fixture.${language}`,
    language,
    lines: root.text.split("\n").length,
    root: root as unknown as AstNode,
    sets,
    functions: [],
  };
  const finding: Finding = {
    id: `f-${fnName}`,
    detectorId: "homonymous-delegation",
    kind: "homonymous-delegation",
    scope: "intra-file",
    language,
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 1, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine: span.startLine, endLine: span.endLine, symbol: fnName, role: "problema" }],
    severity: 15,
    advice: { primary: { name: "x", kind: "patron_de_diseno", why: "y", source: "z" } },
  };
  const ctx: HypothesisContext = {
    file,
    fileAt: () => null,
    repo: fakeRepo(),
    capabilities: new Set<Capability>(),
    setsFor: (l: string) => nodeSets.get(l) ?? sets,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
  return { ctx, finding };
}

/* ────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────── */

// (a) Oportunidad canónica — 3 capas independientes sobre un acumulador
// LOCAL (no campo propio), sin clase envolvente (forma funcional). Mismo
// espíritu que DECORATOR_OPPORTUNITY de pattern-wrapping.test.ts, pero con
// banderas booleanas literales (para que también coincida de verdad con
// `boolean-flag-param`, el ancla — property-flags como `order.isPremium` NO
// activan ese detector, sólo el parámetro booleano crudo).
const TS_OPPORTUNITY = `
function computePrice(base: number, isPremium: boolean, hasInsurance: boolean, needsShipping: boolean): number {
  let total = base;
  if (isPremium) {
    total = total * 1.2;
  }
  if (hasInsurance) {
    total = total + 10;
  }
  if (needsShipping) {
    total = total + 5;
  }
  return total;
}
function applyDiscount(price: number, hasCoupon: boolean): number {
  let total = price;
  if (hasCoupon) {
    total = total - 5;
  }
  return total;
}
`;

// (b) Control: 3 guardas, pero DOS comparten el mismo identificador final de
// condición (`mode`) — preserva textualmente el check de independencia
// original: "si todas testearan la MISMA variable serían ramas de un
// discriminante único" (Strategy/State), no capas ortogonales.
const TS_SAME_DISCRIMINANT = `
function computeRate(mode: boolean, extra: boolean): number {
  let total = 1;
  if (mode) {
    total = total * 2;
  }
  if (!mode) {
    total = total * 3;
  }
  if (extra) {
    total = total + 1;
  }
  return total;
}
`;

// (c) Clase que YA compone con otra instancia del mismo protocolo (campo
// `inner: Priced`, ≥2 métodos reenviados) Y TODAVÍA centraliza el
// embellecimiento en `compute()` — el excluder obligatorio debe reportar
// `ya-aplicado` (no "ausente", que es lo que la regla vieja diría hoy).
const TS_ALREADY_COMPOSED = `
interface Priced { compute(): number; describe(): string; }
class PriceCalculator implements Priced {
  private inner: Priced;
  private order: Order;
  constructor(order: Order, inner: Priced) {
    this.order = order;
    this.inner = inner;
  }
  compute(): number {
    let total = this.inner.compute();
    if (this.order.isPremium) {
      total = total * 1.2;
    }
    if (this.order.hasInsurance) {
      total = total + 10;
    }
    if (this.order.needsShipping) {
      total = total + 5;
    }
    return total;
  }
  describe(): string {
    return this.inner.describe();
  }
}
`;

// (d) Misma forma, pero SÓLO un método reenviado (`compute`, no `describe`)
// — evidencia débil de composición, debe quedar `parcial`, no `ya-aplicado`.
const TS_PARTIALLY_COMPOSED = `
interface Priced { compute(): number; describe(): string; }
class PriceCalculator implements Priced {
  private inner: Priced;
  private order: Order;
  constructor(order: Order, inner: Priced) {
    this.order = order;
    this.inner = inner;
  }
  compute(): number {
    let total = this.inner.compute();
    if (this.order.isPremium) {
      total = total * 1.2;
    }
    if (this.order.hasInsurance) {
      total = total + 10;
    }
    if (this.order.needsShipping) {
      total = total + 5;
    }
    return total;
  }
  describe(): string {
    return this.inner.describe();
  }
  label(): string {
    return "price";
  }
  currency(): string {
    return "USD";
  }
  precision(): number {
    return 2;
  }
}
`;

// (e) Ruby, acumulador CAMPO PROPIO (`@total`) — discriminador
// "acumulador-es-campo-propio" debe confirmar, y sin clase que componga.
const RUBY_OWN_FIELD = `
class PriceCalculator
  def initialize(base, is_premium, has_insurance, needs_shipping)
    @total = base
    @is_premium = is_premium
    @has_insurance = has_insurance
    @needs_shipping = needs_shipping
  end

  def compute
    if @is_premium
      @total = @total * 1.2
    end
    if @has_insurance
      @total = @total + 10
    end
    if @needs_shipping
      @total = @total + 5
    end
    @total
  end
end
`;

// (f) Forma funcional (Vue/TS) — la unidad dueña es el ARCHIVO (sin clase):
// otra función del mismo módulo ya tiene la forma de wrapper de orden
// superior (reenvía ≥2 métodos de su propio parámetro) — excluder de
// `ya-aplicado` por la ruta "sin clase".
const VUE_FILE_WIDE_COMPOSED = `<script setup lang="ts">
function useColorDecorator(shape: Shape) {
  return {
    area: () => shape.area(),
    describe: () => shape.describe(),
  };
}
function computePrice(order: Order): number {
  let total = order.base;
  if (order.isPremium) {
    total = total * 1.2;
  }
  if (order.hasInsurance) {
    total = total + 10;
  }
  if (order.needsShipping) {
    total = total + 5;
  }
  return total;
}
</script>
<template><div /></template>
`;

// (g) Función trivial — no candidata (menos de 3 capas): `build` debe dar `null`.
const TS_TOO_FEW_LAYERS = `
function computeShort(a: boolean, b: boolean): number {
  let total = 0;
  if (a) {
    total = total + 1;
  }
  if (b) {
    total = total + 2;
  }
  return total;
}
`;

// (h) ANCLA ESTRUCTURAL — clase LIMPIA (sin ningún acumulador/bandera, como
// el ColorDecorator canónico) que YA compone con ≥2 reenvíos homónimos: el
// camino de entrada de esta tarea (large-class/refused-bequest) debe llegar
// a `ya-aplicado` SIN que exista ningún olor de acumulador en la unidad.
const TS_STRUCTURAL_FULL = `
interface Priced { compute(): number; describe(): string; }
class PriceCalculator implements Priced {
  private inner: Priced;
  constructor(inner: Priced) {
    this.inner = inner;
  }
  compute(): number {
    return this.inner.compute();
  }
  describe(): string {
    return this.inner.describe();
  }
}
`;

// (i) Misma idea, pero UN solo reenvío homónimo QUE ADEMÁS AGREGA
// COMPORTAMIENTO ⇒ parcial (sigue compitiendo con confianza). OLA U (N4): el
// "agrega comportamiento" no es adorno del ejemplo — es la cláusula que separa
// Decorator de Middle-man. La MISMA clase sin el `* this.rate` es el control
// negativo de abajo (`TS_STRUCTURAL_MIDDLE_MAN`).
const TS_STRUCTURAL_PARTIAL = `
interface Priced { compute(): number; describe(): string; }
class PriceCalculator implements Priced {
  private inner: Priced;
  private rate: number;
  constructor(inner: Priced, rate: number) {
    this.inner = inner;
    this.rate = rate;
  }
  compute(): number {
    const base = this.inner.compute();
    return base * this.rate;
  }
  describe(): string {
    return this.inner.describe();
  }
  label(): string {
    return "price";
  }
  currency(): string {
    return "USD";
  }
  precision(): number {
    return 2;
  }
}
`;

// (i-bis) OLA U (N4) — CONTROL NEGATIVO NUEVO: la MISMA clase, el MISMO
// reenvío homónimo al MISMO colaborador inyectado, pero sin agregar NADA. Es
// un intermediario (Middle-man/Proxy), no una envoltura a medio hacer:
// recomendar Decorator acá es recomendar el patrón equivocado. Es la forma
// medida 32 veces en `corpus/sqlalchemy` antes de esta ola, TODAS emitidas
// como `parcial` (p.ej. `lib/sqlalchemy/pool/base.py:1186 cursor ⇒
// dbapi_connection.cursor()`, `lib/sqlalchemy/engine/base.py:3139 dispose ⇒
// pool.dispose()`).
const TS_STRUCTURAL_MIDDLE_MAN = `
interface Priced { compute(): number; describe(): string; }
class PriceCalculator implements Priced {
  private inner: Priced;
  constructor(inner: Priced) {
    this.inner = inner;
  }
  compute(): number {
    return this.inner.compute();
  }
  describe(): string {
    return this.inner.describe();
  }
  label(): string {
    return "price";
  }
  currency(): string {
    return "USD";
  }
  precision(): number {
    return 2;
  }
}
`;

// (i-ter) OLA U (N4) — CONTROL NEGATIVO de la CLÁUSULA 0 (protocolo
// compartido): UN solo nombre de miembro compartido con el colaborador, aunque
// ese miembro agregue comportamiento. `Engine.dispose` y `Pool.dispose` se
// llaman igual y `Engine` no es un `Pool` — coincidencia de nombre, no
// protocolo. Forma medida 27 veces en `corpus/sqlalchemy` (p.ej.
// `lib/sqlalchemy/engine/base.py:3139`, `lib/sqlalchemy/sql/schema.py:1600
// to_metadata`, ésta última juzgada FALSA a mano en esta misma ola).
const TS_UN_SOLO_NOMBRE = `
interface Priced { compute(): number; describe(): string; }
class Engine {
  private inner: Priced;
  private rate: number;
  constructor(inner: Priced, rate: number) {
    this.inner = inner;
    this.rate = rate;
  }
  compute(): number {
    const base = this.inner.compute();
    return base * this.rate;
  }
  label(): string {
    return "engine";
  }
  currency(): string {
    return "USD";
  }
}
`;

// (j) Clase SIN NINGUNA delegación (control negativo): ni acumulador ni
// reenvío homónimo — el `required` estructural debe rechazarla (`null`).
const TS_STRUCTURAL_NONE = `
class ReportGenerator {
  private logger: Logger;
  constructor(logger: Logger) {
    this.logger = logger;
  }
  generate(): void {
    this.logger.info("generating");
  }
}
`;

// (k) IDIOMA-FRAMEWORK (control negativo, ola de precisión posterior a la
// Ola D — caso real: Admin::RemindersController#update de Rails). Reenvío
// homónimo REAL (`this.resource.update()` dentro de `update()`), pero el
// campo NUNCA se asigna desde un parámetro propio: se asigna en un método
// SIN parámetros (idiom "buscar el recurso y cachearlo en un campo", el
// equivalente TS de `before_action :set_resource`), nunca inyectado como
// `ColorDecorator` inyecta `shape` por constructor. Sin inyección
// confirmada, el reenvío homónimo no es evidencia de composición real.
const TS_IDIOM_NO_INJECTION = `
class RemindersController {
  private resource: Reminder;
  setResource(): void {
    this.resource = Reminder.find(this.params.id);
  }
  update(): void {
    this.resource.update(this.params);
  }
}
`;

// (l) Mismo caso real que (k), Ruby (la forma exacta juzgada falsa por la
// Ola D: `@resource` asignado por un callback sin parámetros propios,
// `update` reenvía homónimamente a `@resource.update`).
const RUBY_IDIOM_NO_INJECTION = `
class RemindersController
  def set_resource
    @resource = Reminder.find(params[:id])
  end

  def update
    @resource.update(params)
  end
end
`;

// (m) ANCLA-EQUIVOCADA (control negativo, ola de precisión posterior a la
// Ola D — caso real: `schema-script.ts#toGraph`/`census.ts#censusOf`, etc.).
// Mapper puro: retorna un objeto literal COPIANDO PROPIEDADES (lectura, sin
// llamada) del parámetro capturado, con las MISMAS claves que el nombre
// "invocado" exigiría (`id`/`describe`). Antes, `source.id` (lectura de
// propiedad) matcheaba textualmente igual que `shape.area()` (llamada real).
const TS_MAPPER_PROPERTY_READ = `
function toGraph(source) {
  return {
    id: source.id,
    describe: source.describe,
  };
}
`;

// (n) ANCLA-EQUIVOCADA (control negativo, caso real
// `graph/edges/warmup.ts#warmUpLanguage`): 3 guardas independientes, cada
// una con su PROPIO `for...of` cuya variable de bucle comparte nombre
// (`slot`) — nunca hay un acumulador compartido. `for_in_statement` expone
// los mismos campos `left`/`right` que una asignación real.
const TS_LOOP_VAR_NOT_ACCUMULATOR = `
function warmUpLanguage(language) {
  if (a) {
    for (const slot of extractorA.slots) carriersBySlot.set(slot, x);
  }
  if (b) {
    for (const slot of extractorB.slots) carriersBySlot.set(slot, x);
  }
  if (c) {
    for (const slot of extractorC.slots) carriersBySlot.set(slot, x);
  }
}
`;

// (o) ANCLA-EQUIVOCADA (control negativo, caso real
// `graph/edges/imports.ts#factsFor`): dispatch por `language`, sin ningún
// acumulador real. El `binary_expression` de la comparación ternaria
// (`target && target.text.length > 0`) comparte campos `left`/`right` con
// una asignación real.
const TS_DISPATCH_NOT_ACCUMULATOR = `
function factsFor(language, stmt) {
  if (language === "typescript") {
    const target = ecmaTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "python") {
    const target = pythonTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "go") {
    const target = goTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  return [];
}
`;

// (p) ANCLA-EQUIVOCADA (control negativo, caso real
// `dashboardable.rb#build_search_result`): `matched_in << 'x' if guard`
// (Ruby, Array#<<, nodo "binary") NO es una reasignación — comparte campos
// `left`/`right` con una asignación real, pero `matched_in` nunca se
// REASIGNA, sólo se MUTA.
const RUBY_APPEND_NOT_ACCUMULATOR = `
def build_search_result(response, query)
  matched_in = []
  matched_in << 'email' if response.email.downcase.include?(query)
  matched_in << 'user_name' if name_matches?(response, query)
  matched_in << 'answer_value' if answer_matches?(response, query)
  matched_in
end
`;

describe("Decorator — hipótesis", () => {
  it("required + discriminadores: emite oportunidad (ausente) con 3 capas independientes, receptores distintos y sin composición previa", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_OPPORTUNITY, "computePrice");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    expect(h!.ceiling).toBe("media");
    expect(h!.anchorFindingId).toBe(finding.id);
    expect(h!.places.length).toBe(3);
    const requiredChecks = h!.checks.filter((c) => c.role === "required");
    expect(requiredChecks.every((c) => c.passed)).toBe(true);
    // discriminador de receptores distintos debería confirmar (3 flags distintas)
    const receiverDisc = h!.discriminators.find((d) => d.label.includes("receptores"));
    expect(receiverDisc?.passed).toBe(true);
  });

  it("el control negativo del mismo archivo (applyDiscount, 1 sola capa) no produce hipótesis", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_OPPORTUNITY, "applyDiscount");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("required de independencia: 3 guardas pero 2 comparten el mismo identificador final ⇒ ni siquiera candidata", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_SAME_DISCRIMINANT, "computeRate");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("menos de 3 capas ⇒ ni siquiera candidata", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_TOO_FEW_LAYERS, "computeShort");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("ANCLA-EQUIVOCADA (caso real warmUpLanguage, ola de precisión posterior a la Ola D): la variable de un `for...of` anidado en 3 guardas independientes no es un acumulador compartido ⇒ ni siquiera candidata", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_LOOP_VAR_NOT_ACCUMULATOR, "warmUpLanguage");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("ANCLA-EQUIVOCADA (caso real factsFor, ola de precisión posterior a la Ola D): un dispatch por `language` con declaración local + comparación en cada rama no es un acumulador ⇒ ni siquiera candidata", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_DISPATCH_NOT_ACCUMULATOR, "factsFor");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("ANCLA-EQUIVOCADA (Ruby, caso real build_search_result): `matched_in << 'x' if guard` (Array#<<, nodo \"binary\") no es una reasignación — sin acumulador que envolver ⇒ ni siquiera candidata", async () => {
    const { ctx, finding } = await contextFor("ruby", RUBY_APPEND_NOT_ACCUMULATOR, "build_search_result");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("excluder obligatorio: la clase ya compone (≥2 reenvíos) ⇒ estado ya-aplicado, sin confianza", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_ALREADY_COMPOSED, "compute");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
    const appliedCheck = h!.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.passed).toBe(true);
  });

  it("composición débil (reenvíos homónimos que NO son la mayoría, con comportamiento agregado) ⇒ parcial, sigue compitiendo con confianza", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_PARTIALLY_COMPOSED, "compute");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
  });

  it("Ruby: acumulador de campo propio (@total) sin clase que componga ⇒ ausente, discriminador de campo propio confirma", async () => {
    const { ctx, finding } = await contextFor("ruby", RUBY_OWN_FIELD, "compute");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    const ownFieldDisc = h!.discriminators.find((d) => d.label.includes("campo propio"));
    expect(ownFieldDisc?.passed).toBe(true);
  });

  it("forma funcional (sin clase): otra función del archivo ya es un wrapper de orden superior ⇒ ya-aplicado por la ruta de archivo", async () => {
    const { ctx, finding } = await contextFor("vue", VUE_FILE_WIDE_COMPOSED, "computePrice");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ctx.file null (límite documentado de esta ola) ⇒ build devuelve null, nunca falsea una oportunidad", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_OPPORTUNITY, "computePrice");
    const ctxSinArbol: HypothesisContext = { ...ctx, file: null };
    expect(decorator.build(finding, null, ctxSinArbol)).toBeNull();
  });

  it("nunca declara aplicado-eludido (esta migración no usa el grafo)", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_ALREADY_COMPOSED, "compute");
    const h = decorator.build(finding, null, ctx);
    expect(h!.state).not.toBe("aplicado-eludido");
  });

  /**
   * OLA AL (AL1) — LA LISTA BAJA DE OCHO A SIETE, Y ES LA ÚNICA VEZ QUE ESTE
   * ARRAY RESTA. Sale `boolean-flag-param`, con el número que lo justifica,
   * medido sobre el volcado del 21-08 y con el 100 % de la población viva
   * juzgada en las DOS poblaciones: 8 recomendaciones en biblioteca y 4 en
   * aplicación, las 12 juzgadas, **0 verdaderas**. El costo, declarado y no
   * escondido: UN hallazgo de nivel 1 juzgado `verdadero`
   * (`hugo helpers/url.go:110 · RelURL`) se queda sin ninguna recomendación.
   *
   * LAS OTRAS SIETE SIGUEN, y este test es el contrato que impide que un
   * frente futuro saque una sin darse cuenta. Dos de ellas tienen una
   * propuesta juzgada VERDADERA en aplicaciones —`homonymous-delegation`
   * (`gitea modules/proxyprotocol/conn.go:56`) y `optional-behavior-flags`
   * (`jenkins .../FileChannelWriter.java:29`)— así que sacarlas costaría
   * producto medido, no cero.
   */
  /**
   * OLA AY (frente AY4) — LA LISTA BAJA DE SIETE A CINCO. Salen `long-parameter-list` y
   * `large-class`, y el número que lo justifica es un CENSO, no una muestra: sus tres celdas
   * vivas suman 13 propuestas, las 13 JUZGADAS, **0 verdaderas**, 12 falsas y 1
   * `problema-si-patrón-no`. Las 2 que faltaban las juzgué abriendo el archivo real
   * (sqlalchemy `sql/compiler.py#_label_select_column`, 13 parámetros, y
   * `dialects/oracle/base.py#__init__`, 10) y las dos son `falso`: una lista larga de
   * parámetros no se arregla envolviendo la unidad, se arregla con `Parameter Object` — que
   * es otra hipótesis del catálogo y SIGUE anclada en ese mismo `kind`.
   *
   * COSTO EN NIVEL 1: **cero**, verificado leyendo los consumidores. `long-parameter-list` lo
   * siguen anclando `builder.ts` y `parameter-object.ts`; `large-class`, `extract-class.ts` y
   * `template-method.ts`. Ningún hallazgo se queda sin hipótesis.
   *
   * `refused-bequest` SE QUEDA, y por eso `STRUCTURAL_ANCHOR_KINDS` no se tocó: el camino
   * estructural sigue vivo por ese ancla, que AY4 no midió y no tocó.
   */
  it("anchors declarados: los 2 de olor que quedan, el estructural `refused-bequest`, el de delegación (Ola 11a P2) y el de FUERZA (optional-behavior-flags, Ola AD AD3) — SIN `boolean-flag-param` (AL1, 0/12) y SIN `long-parameter-list`/`large-class` (AY4, 0/13)", () => {
    expect(decorator.anchors).toEqual(["flag-accumulator", "boolean-complexity", "refused-bequest", "homonymous-delegation", "optional-behavior-flags"]);
    expect(decorator.anchors).not.toContain("boolean-flag-param");
    expect(decorator.anchors).not.toContain("long-parameter-list");
    expect(decorator.anchors).not.toContain("large-class");
  });

  it("anclado por flag-accumulator (el detector propio, ver detect/intra-function/flag-accumulator.ts): mismo resultado que anclado por boolean-flag-param — build() no distingue por el kind del Finding ancla, sólo por la forma del árbol", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_OPPORTUNITY, "computePrice");
    const flagAccumulatorFinding: Finding = { ...finding, detectorId: "flag-accumulator", kind: "flag-accumulator" };
    const h = decorator.build(flagAccumulatorFinding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.anchorFindingId).toBe(flagAccumulatorFinding.id);
  });

  /* ── Ancla ESTRUCTURAL (large-class/refused-bequest) — Problema 2 del registro de pendientes ── */

  it("ancla ESTRUCTURAL (large-class) sobre una clase LIMPIA (sin acumulador) que ya compone con ≥2 reenvíos homónimos ⇒ ya-aplicado, sin confianza — la clasificación por estructura entra SIN necesitar el olor del acumulador", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_STRUCTURAL_FULL, "PriceCalculator", "large-class");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
    expect(h!.places[0]!.symbol).toBe("PriceCalculator");
  });

  it("ancla ESTRUCTURAL (refused-bequest) sobre la MISMA clase limpia: mismo resultado — el camino de entrada no depende de CUÁL ancla estructural disparó", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_STRUCTURAL_FULL, "PriceCalculator", "refused-bequest");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ancla ESTRUCTURAL (large-class) con UN solo reenvío homónimo QUE AGREGA COMPORTAMIENTO ⇒ parcial, sigue compitiendo con confianza", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_STRUCTURAL_PARTIAL, "PriceCalculator", "large-class");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
  });

  it("OLA U (N4) — INTENCIÓN 'implementa el MISMO protocolo': UN solo nombre de miembro compartido con el colaborador (aunque agregue comportamiento) es coincidencia de nombre, no protocolo ⇒ ni siquiera candidata (null)", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_UN_SOLO_NOMBRE, "Engine", "large-class");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("OLA U (N4) — INTENCIÓN 'al menos uno hace algo MÁS que reenviar': el MISMO reenvío homónimo al MISMO colaborador inyectado, pero sin agregar nada, es un INTERMEDIARIO (Middle-man/Proxy) ⇒ ni siquiera candidata (null) — el remedio de un middle-man es sacarlo, no formalizarlo con Decorator", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_STRUCTURAL_MIDDLE_MAN, "PriceCalculator", "large-class");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("ancla ESTRUCTURAL (large-class) sobre una clase SIN ninguna delegación (ni acumulador ni reenvío homónimo) ⇒ ni siquiera candidata (null) — el required estructural evita ruido de cualquier clase grande sin relación con Decorator", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_STRUCTURAL_NONE, "ReportGenerator", "large-class");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────
   * OLA U (N4) — EL COLABORADOR EXPUESTO POR ACCESSOR (`PLAN-INTENCIONES.md`
   * §6). Excerpt LITERAL de `corpus/guava/guava/src/com/google/common/collect/
   * ForwardingList.java:60-90` (la declaración `protected abstract List<E>
   * delegate();` de la línea 68 y cuatro de sus reenvíos), más la subclase
   * concreta que el propio javadoc de guava describe ("Subclasses should
   * override one or more methods to modify the behavior of the backing list
   * … per the decorator pattern").
   * ──────────────────────────────────────────────────────────────────── */
  const JAVA_FORWARDING_LIST = `
public abstract class ForwardingList<E> extends ForwardingCollection<E> implements List<E> {
  protected ForwardingList() {}

  @Override
  protected abstract List<E> delegate();

  @Override
  public void add(int index, E element) {
    delegate().add(index, element);
  }

  @Override
  public E get(int index) {
    return delegate().get(index);
  }

  @Override
  public int indexOf(Object element) {
    return delegate().indexOf(element);
  }

  @Override
  public ListIterator<E> listIterator() {
    return delegate().listIterator();
  }
}
`;

  it("OLA U (N4) — ACCESSOR: `delegate().m(...)` con `delegate()` declarado abstracto en la misma clase ES un colaborador propio (guava ForwardingList) — el idioma de Java/C#, invisible entero hasta esta ola", async () => {
    const row = LANGS.find((r) => r.language === "java")!;
    const root = await parse(row.wasm, JAVA_FORWARDING_LIST);
    const sets = nodeSets.get("java")!;
    const cls = findClassNode(root, sets, "ForwardingList");
    const level = __internals.classDelegationLevel(cls as unknown as AstNode, sets, new Set(["this"]));
    expect(level.level).toBe("full");
    expect(level.evidence).toContain("`delegate`");
    expect(level.evidence).toContain("la MAYORÍA");
  });

  it("OLA U (N4) — control negativo del accessor: el MISMO `delegate().m(...)` cuando `delegate` NO está declarado en la clase (viene de afuera) no cuenta como colaborador propio", async () => {
    const source = JAVA_FORWARDING_LIST.replace("  @Override\n  protected abstract List<E> delegate();\n", "");
    const row = LANGS.find((r) => r.language === "java")!;
    const root = await parse(row.wasm, source);
    const sets = nodeSets.get("java")!;
    const cls = findClassNode(root, sets, "ForwardingList");
    expect(__internals.classDelegationLevel(cls as unknown as AstNode, sets, new Set(["this"])).level).toBe("none");
  });

  it("OLA U (N4) — un DOCSTRING no es comportamiento: el mismo reenvío puro con documentación adelante sigue siendo un intermediario (caso real medido: corpus/sqlalchemy lib/sqlalchemy/engine/base.py:3139 `dispose ⇒ self.pool.dispose()`)", async () => {
    const source = `
class Engine:
    def __init__(self, pool):
        self.pool = pool

    def dispose(self, close=True):
        """Dispose of the connection pool used by this Engine.

        A new connection pool is created immediately after the old one has
        been disposed.
        """
        self.pool.dispose()

    def recreate(self):
        """Recreate the pool."""
        self.pool.recreate()

    def name(self):
        return "engine"
`;
    const row = LANGS.find((r) => r.language === "python")!;
    const root = await parse(row.wasm, source);
    const sets = nodeSets.get("python")!;
    const cls = findClassNode(root, sets, "Engine");
    const level = __internals.classDelegationLevel(cls as unknown as AstNode, sets, new Set(["self"]));
    expect(level.level).toBe("none");
    expect(level.evidence).toContain("intermediario");
  });

  it("OLA U (N4) — Go, protocolo EMBEBIDO: con `afero.File` embebido el envoltorio expone el protocolo entero, así que 2 reenvíos que agregan comportamiento son la MAYORÍA ⇒ ya-aplicado (caso real: corpus/hugo hugofs/hashing_fs.go:77-95 `hashingFile`)", async () => {
    const source = `
package hugofs

type hashingFile struct {
	hashReceiver FileHashReceiver
	h            hash.Hash64
	afero.File
}

func NewHashingFile(f afero.File) afero.File {
	return &hashingFile{File: f, h: xxhash.New()}
}

func (h *hashingFile) Write(p []byte) (n int, err error) {
	n, err = h.File.Write(p)
	if err != nil {
		return
	}
	return h.h.Write(p)
}

func (h *hashingFile) Close() error {
	h.hashReceiver.OnFileClose(h.Name(), h.h.Sum64())
	return h.File.Close()
}

func (h *hashingFile) Name() string {
	return "hashingFile"
}
`;
    const row = LANGS.find((r) => r.language === "go")!;
    const root = await parse(row.wasm, source);
    const sets = nodeSets.get("go")!;
    const level = __internals.goDelegationLevel(root as unknown as AstNode, sets, "hashingFile");
    expect(level.level).toBe("full");
    expect(level.evidence).toContain("la MAYORÍA");
  });

  it("OLA U (N4) — reenvío ATRAPA-TODO (`__getattr__`): la unidad expone el protocolo COMPLETO sin escribirlo, así que UN solo miembro homónimo que ADEMÁS agrega comportamiento ya es Decorator aplicado (excerpt literal de corpus/click src/click/_compat.py:455-473 `_AtomicFile`)", async () => {
    const source = `
class _AtomicFile:
    def __init__(self, f, tmp_filename, real_filename):
        self._f = f
        self._tmp_filename = tmp_filename
        self._real_filename = real_filename
        self.closed = False

    def name(self):
        return self._real_filename

    def close(self, delete=False):
        if self.closed:
            return
        self._f.close()
        os.replace(self._tmp_filename, self._real_filename)
        self.closed = True

    def __getattr__(self, name):
        return getattr(self._f, name)
`;
    const row = LANGS.find((r) => r.language === "python")!;
    const root = await parse(row.wasm, source);
    const sets = nodeSets.get("python")!;
    const cls = findClassNode(root, sets, "_AtomicFile");
    const level = __internals.classDelegationLevel(cls as unknown as AstNode, sets, new Set(["self"]));
    expect(level.level).toBe("full");
  });

  it("ancla ESTRUCTURAL con ctx.file null ⇒ build devuelve null (mismo límite documentado que el resto del archivo)", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_STRUCTURAL_FULL, "PriceCalculator", "large-class");
    const ctxSinArbol: HypothesisContext = { ...ctx, file: null };
    expect(decorator.build(finding, null, ctxSinArbol)).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────
   * Ola 11a (P2) — ancla `homonymous-delegation` (`detect/intra-file/
   * homonymous-delegation.ts`): cierra el hueco declarado más arriba en
   * esta suite ("una clase LIMPIA... nunca llegaba a ningún estado — 0
   * hipótesis") para el caso donde NINGÚN ancla de olor NI large-class/
   * refused-bequest dispara (la clase es chica y limpia, como
   * `ColorDecorator` sobre la fixture canónica de
   * `tests/fixtures/patterns/decorator/`). A diferencia de las anclas
   * ESTRUCTURALES (ubicadas por CLASE completa), ésta se ubica por FUNCIÓN
   * — ver `contextForDelegationAnchor` — para cubrir también la forma
   * FUNCIONAL (sin clase).
   * ──────────────────────────────────────────────────────────────────── */
  it("ancla `homonymous-delegation` sobre una clase CHICA (sin acumulador, sin large-class/refused-bequest) que ya compone con ≥2 reenvíos homónimos ⇒ ya-aplicado, sin confianza", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_FULL, "compute");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ancla `homonymous-delegation` con UN solo reenvío homónimo ⇒ parcial, sigue compitiendo con confianza", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_PARTIAL, "compute");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
  });

  it("ancla `homonymous-delegation`, forma FUNCIONAL (Vue, sin clase): useColorDecorator reenvía ≥2 claves homónimas a su parámetro capturado ⇒ ya-aplicado (mira el PROPIO cuerpo, no excluye el ancla como fileWideDelegationLevel)", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("vue", VUE_FILE_WIDE_COMPOSED, "useColorDecorator");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
    expect(h!.places[0]!.symbol).toBe("useColorDecorator");
  });

  it("ancla `homonymous-delegation`, Go (receptor): d.shape.Area() dentro de func (d *ColorDecorator) Area() y Describe() ⇒ ya-aplicado — el campo se inyecta vía composite literal en NewColorDecorator, como la fixture canónica", async () => {
    const source = `
package shapes

type ColorDecorator struct {
	shape Shape
}

func NewColorDecorator(shape Shape) *ColorDecorator {
	return &ColorDecorator{shape: shape}
}

func (d *ColorDecorator) Area() float64 {
	return d.shape.Area()
}

func (d *ColorDecorator) Describe() string {
	return d.shape.Describe()
}
`;
    const { ctx, finding } = await contextForDelegationAnchor("go", source, "Area");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ancla `homonymous-delegation` sin ninguna delegación confirmada por árbol vivo ⇒ ni siquiera candidata (null) — el required de delegación evita una hipótesis vacía", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_NONE, "generate");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("ancla `homonymous-delegation` con ctx.file null ⇒ build devuelve null (mismo límite documentado que el resto del archivo)", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_FULL, "compute");
    const ctxSinArbol: HypothesisContext = { ...ctx, file: null };
    expect(decorator.build(finding, null, ctxSinArbol)).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────
   * Ola de precisión posterior a la Ola D — frente Decorator. Regresión de
   * los dos arreglos: A) IDIOMA-FRAMEWORK (reenvío homónimo real, pero el
   * campo nunca se inyecta desde un parámetro propio — `classInjectsField`/
   * `goInjectsField`); B) ANCLA-EQUIVOCADA (lectura de propiedad confundida
   * con llamada — `CALL_NODE_TYPE`). Ver el docstring del módulo,
   * "*** ARREGLADO ***", y el de cada función para el caso real medido.
   * ──────────────────────────────────────────────────────────────────── */
  it("IDIOMA-FRAMEWORK (TS, caso real Admin::RemindersController#update): reenvío homónimo real, pero `resource` se asigna en un método SIN parámetros propios (nunca inyectado) ⇒ ni siquiera candidata (null)", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_IDIOM_NO_INJECTION, "update");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("IDIOMA-FRAMEWORK (Ruby, mismo caso real): `@resource` asignado por un callback sin parámetros propios (`set_resource`), `update` reenvía homónimamente a `@resource.update` ⇒ ni siquiera candidata (null)", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("ruby", RUBY_IDIOM_NO_INJECTION, "update");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("ANCLA-EQUIVOCADA (caso real `schema-script.ts#toGraph`): mapper puro que COPIA propiedades (lectura, sin llamada) del parámetro con las mismas claves — antes matcheaba igual que `shape.area()` ⇒ ni siquiera candidata (null)", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_MAPPER_PROPERTY_READ, "toGraph");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola 11a (P2) — CONSUMO real de `ctx.neighborhood`: 0 de 17 hipótesis lo
 * leían antes de esta ola salvo `strategy.ts` (1/17) — `decorator.ts` es
 * uno de los 16 restantes que esta tarea conecta. `refresh()` (llamado por
 * `hypotheses/run.ts#refreshHypotheses` desde `crossAnalyze`, DESPUÉS de
 * construir el `NeighborhoodIndex` real) recalcula
 * `otros-envoltorios-en-el-repo` — la escalera de discriminadores, nunca
 * `state`. Mismo espíritu que `strategy.test.ts`'s bloque de `refresh()`.
 * ──────────────────────────────────────────────────────────────────────── */
describe("Decorator — hipótesis — Ola 11a: refresh() consume ctx.neighborhood real", () => {
  it("refresh() con EMPTY_NEIGHBORHOOD (nada que ver): el discriminador 'otros-envoltorios-en-el-repo' no confirma", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_PARTIAL, "compute");
    const built = decorator.build(finding, null, ctx)!;
    expect(built.state).toBe("parcial");
    const refreshed = decorator.refresh!(built, finding, null, ctx)!;
    const disc = refreshed.discriminators.find((d) => d.label.includes("envolturas"))!;
    expect(disc.passed).toBe(false);
    expect(disc.why).toContain("ningún otro archivo");
  });

  it("refresh() con OTRO archivo del vecindario mostrando 'homonymous-delegation' (1 caso, muy por debajo del techo de convención): el discriminador SÍ confirma, sin volver a tocar el árbol", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_PARTIAL, "compute");
    const built = decorator.build(finding, null, ctx)!;
    expect(built.state).toBe("parcial");
    // OLA BA — mismo estampado que `run.ts#conCapa`: la capa sale del builder, nunca del draft.
    finding.hypotheses = [{ ...built, layer: decorator.layer }];

    const sibling: Finding = {
      id: "f-sibling",
      detectorId: "homonymous-delegation",
      kind: "homonymous-delegation",
      scope: "intra-file",
      language: "typescript",
      title: "t",
      detail: "d",
      trigger: [{ label: "m", value: 1, threshold: fakeThreshold() }],
      locations: [{ file: "other.ts", startLine: 1, endLine: 3, symbol: "Wrapper", role: "problema" }],
      severity: 15,
      advice: { primary: { name: "x", kind: "patron_de_diseno", why: "y", source: "z" } },
    };

    const index = buildNeighborhoodIndex(null, [finding, sibling], null);
    refreshHypotheses({
      findings: [finding],
      repo: { repoName: "fixture", files: [], functions: [], clones: [], graph: null },
      languages: new Map([["typescript", { capabilities: new Set<Capability>(), sets: nodeSets.get("typescript")! }]]),
      neighborhoodIndex: index,
    });

    const refreshed = finding.hypotheses![0]!;
    const disc = refreshed.discriminators.find((d) => d.label.includes("envolturas"))!;
    expect(disc.passed).toBe(true);
    expect(disc.why).toContain("1 caso");
    // `state`/`checks` (decididos por `build()` con árbol vivo) viajan INTACTOS — `refresh()` nunca los toca.
    expect(refreshed.state).toBe(built.state);
    expect(refreshed.checks).toEqual(built.checks);
    // Verificación cruzada, sin pasar por decorator.ts: el vecindario real ve al hermano.
    expect(neighborhoodFor(index, finding).countOfKind("homonymous-delegation")).toBe(1);
  });

  it("refresh() con state 'ya-aplicado' (no compite por confianza) ⇒ null, sin reconstruir nada", async () => {
    const { ctx, finding } = await contextForDelegationAnchor("typescript", TS_STRUCTURAL_FULL, "compute");
    const built = decorator.build(finding, null, ctx)!;
    expect(built.state).toBe("ya-aplicado");
    expect(decorator.refresh!(built, finding, null, ctx)).toBeNull();
  });
  /* ────────────────────────────────────────────────────────────────────
   * OLA W (W4) — EL PROTOCOLO EXTERNO. Excerpt LITERAL de
   * `corpus/hugo/hugofs/filename_filter_fs.go` (el constructor de `:29`, el
   * struct de `:38` y cuatro de sus quince métodos): el caso que la Ola V
   * aisló como la causa del 0 % de precisión sobre las RECOMENDACIONES de
   * Decorator — un Decorator YA APLICADO reportado como *"se beneficiaría de
   * formalizarse con Decorator"*, porque 3 reenvíos sobre 15 miembros no son
   * "la mayoría" aunque los otros doce SOBRESCRIBAN el comportamiento (que es
   * lo que un decorador de filtrado hace).
   * ──────────────────────────────────────────────────────────────────── */
  const GO_PROTOCOLO_EXTERNO = `
package hugofs

func newFilenameFilterFs(fs afero.Fs, base string, filter *hglob.FilenameFilter) afero.Fs {
	return &filenameFilterFs{
		fs:     fs,
		base:   base,
		filter: filter,
	}
}

type filenameFilterFs struct {
	base string
	fs   afero.Fs

	filter *hglob.FilenameFilter
}

func (fs *filenameFilterFs) Open(name string) (afero.File, error) {
	fi, err := fs.fs.Stat(name)
	if err != nil {
		return nil, err
	}
	if !fs.filter.Match(name, fi.IsDir()) {
		return nil, os.ErrNotExist
	}
	return fs.fs.Open(name)
}

func (fs *filenameFilterFs) Stat(name string) (os.FileInfo, error) {
	fi, err := fs.fs.Stat(name)
	if err != nil {
		return nil, err
	}
	if !fs.filter.Match(name, fi.IsDir()) {
		return nil, os.ErrNotExist
	}
	return fi, nil
}

func (fs *filenameFilterFs) Chmod(n string, m os.FileMode) error {
	return syscall.EPERM
}

func (fs *filenameFilterFs) ReadDir(name string) ([]os.FileInfo, error) {
	panic("not implemented")
}

func (fs *filenameFilterFs) Remove(n string) error {
	return syscall.EPERM
}

func (fs *filenameFilterFs) Rename(o, n string) error {
	return syscall.EPERM
}

func (fs *filenameFilterFs) Name() string {
	return "FinameFilterFS"
}
`;

  it("OLA W (W4) — PROTOCOLO EXTERNO (caso real corpus/hugo hugofs/filename_filter_fs.go:29,38,49): el campo NO está embebido y sólo 2 de 7 miembros escritos reenvían, pero el constructor recibe un `afero.Fs` y devuelve un `afero.Fs` — la sustituibilidad está DECLARADA, no contada ⇒ ya-aplicado (antes: `parcial`, o sea recomendar Decorator sobre un Decorator)", async () => {
    const row = LANGS.find((r) => r.language === "go")!;
    const root = await parse(row.wasm, GO_PROTOCOLO_EXTERNO);
    const sets = nodeSets.get("go")!;
    const level = __internals.goDelegationLevel(root as unknown as AstNode, sets, "filenameFilterFs");
    expect(level.level).toBe("full");
    expect(level.evidence).toContain("afero.Fs".slice(6)); // `Fs`, el nombre base del protocolo
    expect(level.evidence).toContain("no se declara en este archivo");
  });

  it("OLA W (W4) — CONTROL NEGATIVO del protocolo externo: el MISMO archivo, pero declarando `Fs` adentro ⇒ el protocolo SÍ tiene miembros contables y manda el conteo de la Ola U ⇒ vuelve a `partial` (no se recomienda por conformidad lo que se puede medir por conteo)", async () => {
    const source = GO_PROTOCOLO_EXTERNO.replace("package hugofs\n", "package hugofs\n\ntype Fs interface {\n\tOpen(name string) (File, error)\n\tStat(name string) (os.FileInfo, error)\n}\n");
    const row = LANGS.find((r) => r.language === "go")!;
    const root = await parse(row.wasm, source);
    const sets = nodeSets.get("go")!;
    expect(__internals.goDelegationLevel(root as unknown as AstNode, sets, "filenameFilterFs").level).toBe("partial");
  });

  it("OLA W (W4) — CONTROL NEGATIVO de la cláusula 2: el mismo struct con protocolo externo pero SIN ningún reenvío que agregue comportamiento sigue siendo un intermediario ⇒ `none` (la conformidad declarada no rescata un Middle-man)", async () => {
    const source = GO_PROTOCOLO_EXTERNO
      .replace(/func \(fs \*filenameFilterFs\) Open[\s\S]*?\n}\n/, "func (fs *filenameFilterFs) Open(name string) (afero.File, error) {\n\treturn fs.fs.Open(name)\n}\n")
      .replace(/func \(fs \*filenameFilterFs\) Stat[\s\S]*?\n}\n/, "func (fs *filenameFilterFs) Stat(name string) (os.FileInfo, error) {\n\treturn fs.fs.Stat(name)\n}\n");
    const row = LANGS.find((r) => r.language === "go")!;
    const root = await parse(row.wasm, source);
    const sets = nodeSets.get("go")!;
    expect(__internals.goDelegationLevel(root as unknown as AstNode, sets, "filenameFilterFs").level).toBe("none");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AD (AD3) — EL ANCLA DE FUERZA `optional-behavior-flags` Y EL CAMINO
 * POR EL QUE ESTA HIPÓTESIS PUEDE, POR PRIMERA VEZ, DECIR `ausente`.
 *
 * El defecto que arregla está medido y escrito: para `homonymous-delegation`
 * el estado `ausente` es INALCANZABLE POR CONSTRUCCIÓN (0 de 111 hipótesis,
 * en las dos poblaciones) porque su `required` exige que el reenvío YA esté.
 * Estos tests fijan las dos mitades del arreglo: que `ausente` se alcanza, y
 * que la resolución se sigue verificando (una unidad que YA compone termina
 * en `ya-aplicado`, no en una recomendación).
 * ──────────────────────────────────────────────────────────────────────── */

const TS_CAPACIDADES_SIN_ENVOLTURA = `
class Report {
  private withHeader: boolean;
  private withTotals: boolean;
  constructor(withHeader: boolean, withTotals: boolean) {
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  render(out: string[]): void {
    if (this.withHeader) { out.push("head"); }
    if (this.withTotals) { out.push("total"); }
  }
  describe(out: string[]): void {
    if (this.withHeader) { out.push("h"); }
  }
}
`;

const TS_CAPACIDADES_YA_ENVUELTAS = `
class LoggingReport {
  private inner: LoggingReport;
  private withHeader: boolean;
  private withTotals: boolean;
  constructor(inner: LoggingReport, withHeader: boolean, withTotals: boolean) {
    this.inner = inner;
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  render(out: string[]): void {
    if (this.withHeader) { out.push("head"); }
    if (this.withTotals) { out.push("total"); }
    this.inner.render(out);
  }
  describe(out: string[]): void {
    if (this.withHeader) { out.push("h"); }
    this.inner.describe(out);
  }
}
`;

describe("Decorator — Ola AD (AD3): el ancla de FUERZA `optional-behavior-flags`", () => {
  it("LA PROPIEDAD QUE ESTA OLA AGREGA — dos capacidades opcionales y NINGUNA envoltura ⇒ `ausente`, el estado que el ancla vieja no puede alcanzar", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_CAPACIDADES_SIN_ENVOLTURA, "Report", "optional-behavior-flags");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("RESOLUCIÓN VERIFICADA — la MISMA unidad, pero ya componiendo con otra instancia del mismo protocolo ⇒ `ya-aplicado`, no una recomendación", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_CAPACIDADES_YA_ENVUELTAS, "LoggingReport", "optional-behavior-flags");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });

  it("el required RE-DERIVA del árbol vivo y no le cree al detector: una clase sin capacidades opcionales no produce hipótesis aunque llegue con este kind", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_ALREADY_COMPOSED, "PriceCalculator", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("NO QUITA NADA: el camino de `homonymous-delegation` sigue intacto — la misma fixture ya compuesta sigue dando `ya-aplicado` por su propio camino", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_ALREADY_COMPOSED, "compute");
    const delegationFinding: Finding = { ...finding, detectorId: "homonymous-delegation", kind: "homonymous-delegation" };
    const h = decorator.build(delegationFinding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AK, FRENTE AK6 — **UNA CAPACIDAD ES UN INTERRUPTOR, NO UN DATO.**
 *
 * El `required` nuevo (`capacidad-es-interruptor-no-dato`) exige que el campo
 * de la capacidad NO aparezca, dentro de la unidad dueña, fuera de la
 * CONDICIÓN de una guarda. La intención, completa, está en el docstring de
 * `capabilityFieldsReadAsValue`; estos tests fijan sus cuatro bordes:
 * reconoce el interruptor, rechaza el dato, cuenta con el MISMO piso de
 * siempre, y no confunde el PARÁMETRO del constructor con el campo.
 * ──────────────────────────────────────────────────────────────────────── */

/** La MISMA `Report` de la Ola AD, más un miembro que LEE las dos banderas
 *  como valor. Nada del olor cambia: siguen siendo 2 capacidades embelleciendo
 *  2 miembros. Lo que cambia es que un envoltorio ya no se las puede llevar. */
const TS_CAPACIDADES_QUE_SON_DATO = `
class Report {
  private withHeader: boolean;
  private withTotals: boolean;
  constructor(withHeader: boolean, withTotals: boolean) {
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  render(out: string[]): void {
    if (this.withHeader) { out.push("head"); }
    if (this.withTotals) { out.push("total"); }
  }
  describe(out: string[]): void {
    if (this.withHeader) { out.push("h"); }
  }
  toInfo(out: string[]): void {
    out.push(String(this.withHeader));
    out.push(String(this.withTotals));
  }
}
`;

/** Una sola de las dos viaja como dato ⇒ queda UNA capacidad interruptor, por
 *  debajo del piso de siempre (`MIN_CAPABILITIES`). Ningún número nuevo. */
const TS_UNA_INTERRUPTOR_UNA_DATO = `
class Report {
  private withHeader: boolean;
  private withTotals: boolean;
  constructor(withHeader: boolean, withTotals: boolean) {
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  render(out: string[]): void {
    if (this.withHeader) { out.push("head"); }
    if (this.withTotals) { out.push("total"); }
  }
  describe(out: string[]): void {
    if (this.withHeader) { out.push("h"); }
  }
  toInfo(out: string[]): void {
    out.push(String(this.withTotals));
  }
}
`;

/** LA FORMA DE LA ÚNICA VERDADERA CONOCIDA DE ESTA CELDA
 *  (`jenkins · hudson/util/FileChannelWriter.java:29`, juzgada por `ola-ad/AD3.json`),
 *  reducida a su gramática: Java nombra el campo DESNUDO, así que el
 *  PARÁMETRO del constructor tiene exactamente el mismo texto que el campo.
 *  Sin la regla de sombreado (`parámetro tapa campo dentro de su miembro`,
 *  la misma que el detector ya aplica) este test saldría `null` y el
 *  discriminador habría silenciado la única verdadera. */
const JAVA_INTERRUPTORES_CON_PARAMETRO_HOMONIMO = `
class ForcingWriter {
  private final boolean forceOnFlush;
  private final boolean forceOnClose;
  ForcingWriter(boolean forceOnFlush, boolean forceOnClose) {
    this.forceOnFlush = forceOnFlush;
    this.forceOnClose = forceOnClose;
  }
  public void flush() {
    if (forceOnFlush) { force(); }
  }
  public void close() {
    if (forceOnClose) { force(); }
  }
  private void force() { }
}
`;

describe("Decorator — Ola AK (AK6): una capacidad es un INTERRUPTOR, no un DATO", () => {
  it("NO QUITA NADA DEL CASO CORRECTO — las dos banderas de `Report` sólo aparecen en la condición de una guarda ⇒ la hipótesis de la Ola AD sigue igual", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_CAPACIDADES_SIN_ENVOLTURA, "Report", "optional-behavior-flags");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    const check = h!.checks.find((c) => c.label.includes("INTERRUPTORES"));
    expect(check?.passed).toBe(true);
  });

  it("LA PROPIEDAD NUEVA — la MISMA unidad, con un miembro que además LEE las dos banderas como valor ⇒ null: el envoltorio no se puede llevar un campo que la unidad usa como dato", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_CAPACIDADES_QUE_SON_DATO, "Report", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("EL PISO ES EL DE SIEMPRE (`MIN_CAPABILITIES`), no un número nuevo — con UNA sola capacidad interruptor la unidad no llega", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_UNA_INTERRUPTOR_UNA_DATO, "Report", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("SOMBREADO — el PARÁMETRO del constructor homónimo del campo (la gramática de Java, y la forma exacta de la única verdadera conocida de esta celda) NO cuenta como lectura del campo", async () => {
    const { ctx, finding } = await contextForClass("java", JAVA_INTERRUPTORES_CON_PARAMETRO_HOMONIMO, "ForcingWriter", "optional-behavior-flags");
    const h = decorator.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("NO TOCA LAS OTRAS SIETE ANCLAS — el check es un no-op fuera de `optional-behavior-flags`", async () => {
    const { ctx, finding } = await contextFor("typescript", TS_ALREADY_COMPOSED, "compute");
    const delegationFinding: Finding = { ...finding, detectorId: "homonymous-delegation", kind: "homonymous-delegation" };
    const h = decorator.build(delegationFinding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.label.includes("INTERRUPTORES"))?.passed).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AP, FRENTE AP3 — **EL PASO QUE LA GUARDA GOBIERNA NO ES UNA LECTURA
 * COMO VALOR**, y hasta hoy lo era.
 *
 * LA INTENCIÓN, completa, está en el docstring de `capabilityFieldsReadAsValue`:
 * una capacidad que es un COLABORADOR OPCIONAL tiene que USARSE dentro del paso
 * que su propia guarda gobierna, y ese uso está fuera de la `condition` — así
 * que todo colaborador opcional quedaba descalificado POR CONSTRUCCIÓN, que es
 * exactamente el caso canónico de Decorator. Estos tests fijan los cuatro
 * bordes de la regla nueva: reconoce el colaborador guardado, NO protege a un
 * campo distinto del que la guarda menciona, sigue rechazando la lectura fuera
 * de toda guarda (el borde que AK6 fijó, intacto), y anda en más de una
 * gramática.
 * ──────────────────────────────────────────────────────────────────────── */

/** LA FORMA DEL CASO TESTIGO, reducida a su gramática
 *  (`corpus/nest/packages/platform-fastify/adapters/fastify-adapter.ts:268-277`):
 *  dos colaboradores opcionales, cada uno LEÍDO dentro del paso que su propia
 *  guarda gobierna. Antes de AP3 esto daba `null`. */
const TS_COLABORADORES_OPCIONALES_GUARDADOS = `
class Pipeline {
  private onBefore?: (x: number) => void;
  private onAfter?: (x: number) => void;
  constructor(onBefore?: (x: number) => void, onAfter?: (x: number) => void) {
    this.onBefore = onBefore;
    this.onAfter = onAfter;
  }
  run(x: number): void {
    if (this.onBefore) { this.onBefore(x); }
    this.work(x);
    if (this.onAfter) { this.onAfter(x); }
  }
  replay(x: number): void {
    if (this.onBefore) { this.onBefore(x); }
  }
  private work(x: number): void { void x; }
}
`;

/** LA GUARDA TIENE QUE SER SOBRE EL MISMO CAMPO. `onAfter` se lee dentro de una
 *  guarda sobre `onBefore`: eso NO lo protege — sigue siendo un dato que la
 *  unidad transporta, y la unidad se queda con UNA sola capacidad interruptor,
 *  por debajo del piso de siempre. */
const TS_GUARDA_DE_OTRO_CAMPO = `
class Pipeline {
  private onBefore?: (x: number) => void;
  private onAfter?: (x: number) => void;
  constructor(onBefore?: (x: number) => void, onAfter?: (x: number) => void) {
    this.onBefore = onBefore;
    this.onAfter = onAfter;
  }
  run(x: number): void {
    if (this.onBefore) { this.onBefore(x); this.onAfter; }
    this.work(x);
  }
  replay(x: number): void {
    if (this.onBefore) { this.onBefore(x); }
    if (this.onAfter) { this.work(x); }
  }
  private work(x: number): void { void x; }
}
`;

/** EL BORDE DE AK6, INTACTO: los mismos dos colaboradores guardados, MÁS un
 *  miembro que los lee fuera de toda guarda. Ahí el envoltorio no se los puede
 *  llevar y la unidad sigue sin llegar. */
const TS_COLABORADORES_GUARDADOS_Y_ADEMAS_DATO = `
class Pipeline {
  private onBefore?: (x: number) => void;
  private onAfter?: (x: number) => void;
  constructor(onBefore?: (x: number) => void, onAfter?: (x: number) => void) {
    this.onBefore = onBefore;
    this.onAfter = onAfter;
  }
  run(x: number): void {
    if (this.onBefore) { this.onBefore(x); }
    if (this.onAfter) { this.onAfter(x); }
  }
  replay(x: number): void {
    if (this.onBefore) { this.onBefore(x); }
  }
  describe(out: unknown[]): void {
    out.push(this.onBefore);
    out.push(this.onAfter);
  }
}
`;

/** LA MISMA FORMA EN OTRA GRAMÁTICA — Python, `self.x`, que es donde vive la
 *  mitad de la población medida (`sqlalchemy`). */
const PY_COLABORADORES_OPCIONALES_GUARDADOS = `
class Pipeline:
    def __init__(self, on_before=None, on_after=None):
        self.on_before = on_before
        self.on_after = on_after

    def run(self, x):
        if self.on_before:
            self.on_before(x)
        self.work(x)
        if self.on_after:
            self.on_after(x)

    def replay(self, x):
        if self.on_before:
            self.on_before(x)

    def work(self, x):
        return x
`;

/* ────────────────────────────────────────────────────────────────────────
 * **Y EL DESENLACE, QUE ES LO QUE ESTOS CUATRO TESTS FIJAN HOY: la rama quedó
 * CONSTRUIDA, MEDIDA Y DESCONECTADA (`decorator.ts#AP3_PASO_GOBERNADO = false`).**
 * Prendida emite 5 recomendaciones nuevas sobre el corpus entero —las 5
 * `ausente`, las 5 en bibliotecas (`nest` 1 · `sqlalchemy` 4)— y las 5 se
 * juzgaron abriendo el archivo real: **0 verdaderas** (Wilson [0,0 %, 43,4 %]).
 * El porqué de cada juicio está en el docstring de `capabilityFieldsReadAsValue`
 * y en `ola-ap/veredictos/AP3.json`.
 *
 * POR ESO ESTOS TESTS ASSERTAN `null` EN LOS CUATRO: es lo que producción hace
 * hoy, y es lo que tiene que seguir haciendo mientras la rama esté apagada. Las
 * cuatro fixtures se conservan enteras a propósito: son los cuatro bordes de la
 * regla (reconoce el colaborador guardado; NO protege a un campo distinto del
 * que la guarda menciona; sigue rechazando la lectura fuera de toda guarda —el
 * borde de AK6, intacto—; y la misma forma en otra gramática). **Quien prenda la
 * rama en una ola próxima da vuelta dos `toBeNull()` por `not.toBeNull()` y
 * tiene los cuatro bordes ya escritos.**
 * ──────────────────────────────────────────────────────────────────────── */

describe("Decorator — Ola AP (AP3): el paso que la guarda gobierna, CONSTRUIDO Y DESCONECTADO", () => {
  it("CON LA RAMA APAGADA — dos colaboradores opcionales leídos dentro del paso que su propia guarda gobierna siguen contando como DATO ⇒ null (es la conducta de AK6, sin cambios)", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_COLABORADORES_OPCIONALES_GUARDADOS, "Pipeline", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("EL LÍMITE — una guarda sobre OTRO campo no protege: `if (this.a) { this.b }` deja a `b` como dato y la unidad se queda por debajo del piso de siempre", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_GUARDA_DE_OTRO_CAMPO, "Pipeline", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("EL BORDE DE AK6 SIGUE EN PIE — los mismos colaboradores guardados, más una lectura FUERA de toda guarda ⇒ null", async () => {
    const { ctx, finding } = await contextForClass("typescript", TS_COLABORADORES_GUARDADOS_Y_ADEMAS_DATO, "Pipeline", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });

  it("NO ES UNA GRAMÁTICA — la misma forma en Python (`self.x`) da la misma respuesta que en TypeScript", async () => {
    const { ctx, finding } = await contextForClass("python", PY_COLABORADORES_OPCIONALES_GUARDADOS, "Pipeline", "optional-behavior-flags");
    expect(decorator.build(finding, null, ctx)).toBeNull();
  });
});
