/**
 * `value-object.test.ts` — Ola AG, frente AG5.
 *
 * QUÉ INTENCIÓN VERIFICA CADA CHEQUEO, escrito acá arriba para que se lea de
 * corrido (el encargo lo pide explícitamente):
 *
 *   1. **"sin grafo no es candidata"** — la pregunta que decide esta celda es
 *      de REPO ("¿en cuántos sitios este repo escribe este dato como
 *      primitivo?"), y sin grafo no hay con qué contestarla. Un `required`
 *      que aprobara ahí sería decoración
 *      (`no-permissive-required.test.ts`).
 *   2. **"sin árbol vivo no es candidata"** — sin `ctx.file` no se pueden
 *      identificar los nombres de los parámetros del hallazgo, y sin nombres
 *      no hay dato que buscar en el grafo.
 *   3. **"el dato que no salió de la firma no dispara"** — la ESCALA: si el
 *      dato sólo existe en esta firma, el remedio que paga es Introduce
 *      Parameter Object, no un tipo del repo. Verifica el piso de
 *      `MIN_DECL_OWNERS` (símbolos contenedores) por separado del de
 *      `MIN_DECL_SITES`.
 *   4. **"el dato con pocos sitios no dispara"** — la otra mitad de la
 *      ESCALA: la Regla de Tres, el mismo número que el ancla ya cita.
 *   5. **"el dato desparramado dispara y dice `ausente`"** — la FUERZA: el
 *      caso positivo, con la evidencia nombrando los sitios reales.
 *   6. **"un `local` no cuenta como sitio"** — un temporario de un cuerpo no
 *      es un lugar donde un tipo iría; sólo parámetros y campos cuentan.
 *   7. **"el tipo que ya existe en otro sitio da `parcial`, no `ausente`"** —
 *      la RESOLUCIÓN a medias: el Value Object existe y esta firma lo esquiva.
 *   8. **"la clase que ya guarda esos primitivos como campos da
 *      `ya-aplicado`"** — la RESOLUCIÓN VERIFICADA de la receta: no disparar
 *      donde el tipo propio ya está. El constructor de un Value Object toma
 *      primitivos por definición.
 *   9. **"un primitivo dentro de un contenedor no cuenta como el tipo del
 *      parámetro"** — la misma corrección de precisión que el detector de
 *      nivel 1 ya hizo (`number[]`/`Map<string,X>` YA son la forma correcta
 *      de agrupar primitivos); acá se verifica que la reconstrucción de
 *      nombres la respeta y no inventa un parámetro que el detector no contó.
 *  10. **"la normalización del identificador es de FORMA, no de dominio"** —
 *      `processDictionaryKeys` (parámetro) y `ProcessDictionaryKeys` (campo)
 *      son el mismo dato; `_value` y `value` también.
 *  11. **"una función anónima no puede evaluarse"** — el falso negativo
 *      DECLARADO (sus parámetros no producen nodo `carrier`), probado para
 *      que deje de ser un hueco silencioso.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { citado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileUnit, RoleLocation } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import type { CodeGraph, CodeGraphNode } from "../graph/types.js";
import { hypothesis as valueObject } from "./value-object.js";
import type { HypothesisContext } from "./types.js";

const TS_WASM = "tree-sitter-typescript.wasm";
/** Sonda de LENGUAJE (nunca del archivo bajo análisis — CONTRATO-F6.md §1.7):
 *  tiene que ejercitar las tres formas function-like de la familia TS
 *  (declaración suelta, método, flecha) o `functionNodes` sale incompleto y
 *  `file.functions` queda vacío para las formas que falten — misma trampa que
 *  el Bug C del spike. */
const TS_SETS_PROBE = `
function typed(a: number, b: string): number { if (a > 0) { for (const y of []) { typed(a, b); } } try { typed(a, b); } catch (e) { typed(a, b); } return a; }
class C {
  constructor(n: string) {}
  m(x: number): void { typed(x, ""); }
}
const arrow = (a: string): string => a;
`;

async function unitFrom(source: string, file: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(TS_WASM, TS_SETS_PROBE), parseRoot(TS_WASM, source)]);
  return fileUnitFrom(root, sets, "typescript", { file });
}

function threshold(): Threshold {
  return resolveThreshold(citado(3, { work: "test", rule: "regla de tres" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function loc(file: string, startLine: number, endLine: number, symbol: string): RoleLocation {
  return { file, startLine, endLine, symbol, role: "función con parámetros del mismo primitivo" };
}

function poFinding(file: string, startLine: number, endLine: number, symbol: string, variant: string, count: number): Finding {
  return {
    id: "po-1",
    detectorId: "primitive-obsession",
    kind: "primitive-obsession",
    scope: "intra-file",
    language: "typescript",
    variant,
    title: `"${symbol}" recibe ${count} parámetros de tipo primitivo "${variant}"`,
    detail: "d",
    trigger: [{ label: `parámetros de tipo "${variant}"`, value: count, threshold: threshold() }],
    locations: [loc(file, startLine, endLine, symbol)],
    severity: 70,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function carrier(
  file: string,
  symbolPath: readonly string[],
  carrierForm: "parameter" | "field" | "local",
  declaredTypeForm: "primitive" | "nominal" | "composite",
): CodeGraphNode {
  return {
    id: `carrier:${file}#${symbolPath.join(".")}@0`,
    kind: "carrier",
    file,
    symbolPath,
    carrierForm,
    declaredTypeForm,
    startLine: 1,
    endLine: 1,
  };
}

function graphOf(nodes: readonly CodeGraphNode[]): CodeGraph {
  return { nodes, edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function ctxFor(file: FileUnit | null): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(["tipos-explicitos"]),
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Un archivo con UNA función de 3 `string` intercambiables, en la línea 2.
 * ──────────────────────────────────────────────────────────────────────── */
const SRC = `
export function registerRoute(moduleName: string, globalPrefix: string, modulePath: string): void {
  console.log(moduleName, globalPrefix, modulePath);
}
`;
const FILE = "src/router.ts";

/** Sitios de OTROS símbolos que escriben `modulePath` como primitivo — el
 *  dato desparramado por el repo. */
function sitiosDesparramados(): CodeGraphNode[] {
  return [
    carrier("src/a.ts", ["buildA", "modulePath"], "parameter", "primitive"),
    carrier("src/b.ts", ["B", "modulePath"], "field", "primitive"),
    carrier("src/c.ts", ["buildC", "modulePath"], "parameter", "primitive"),
  ];
}

describe("Value Object · primitive-obsession", () => {
  it("1. sin grafo no es candidata — la pregunta que decide esta celda es de REPO", async () => {
    const file = await unitFrom(SRC, FILE);
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), null, ctxFor(file));
    expect(h).toBeNull();
  });

  it("2. sin árbol vivo no es candidata — sin nombres de parámetro no hay dato que buscar", () => {
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(sitiosDesparramados()), ctxFor(null));
    expect(h).toBeNull();
  });

  it("3. ESCALA: un dato que no salió de la firma (1 solo símbolo contenedor) no dispara", async () => {
    const file = await unitFrom(SRC, FILE);
    // Tres sitios, pero los TRES del mismo símbolo: es Introduce Parameter
    // Object, no un Value Object del repo.
    const nodes = [
      carrier(FILE, ["registerRoute", "modulePath"], "parameter", "primitive"),
      carrier(FILE, ["registerRoute", "globalPrefix"], "parameter", "primitive"),
      carrier(FILE, ["registerRoute", "moduleName"], "parameter", "primitive"),
    ];
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h).toBeNull();
  });

  it("4. ESCALA: un dato con menos sitios que la Regla de Tres no dispara", async () => {
    const file = await unitFrom(SRC, FILE);
    const nodes = [carrier("src/a.ts", ["buildA", "modulePath"], "parameter", "primitive"), carrier("src/b.ts", ["B", "modulePath"], "field", "primitive")];
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h).toBeNull();
  });

  it("5. FUERZA: el dato desparramado dispara, dice `ausente` y nombra los sitios", async () => {
    const file = await unitFrom(SRC, FILE);
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(sitiosDesparramados()), ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Value Object");
    expect(h!.state).toBe("ausente");
    const req = h!.checks.find((c) => c.role === "required");
    expect(req?.passed).toBe(true);
    expect(req?.why).toContain("modulePath");
    expect(req?.why).toContain("3 sitios");
  });

  it("6. un `local` no cuenta como sitio de declaración — no es un lugar donde un tipo iría", async () => {
    const file = await unitFrom(SRC, FILE);
    const nodes = [
      carrier("src/a.ts", ["buildA", "modulePath"], "local", "primitive"),
      carrier("src/b.ts", ["buildB", "modulePath"], "local", "primitive"),
      carrier("src/c.ts", ["buildC", "modulePath"], "local", "primitive"),
    ];
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h).toBeNull();
  });

  it("7. RESOLUCIÓN a medias: si el repo ya escribe ese dato con un tipo propio, es `parcial`", async () => {
    const file = await unitFrom(SRC, FILE);
    const nodes = [...sitiosDesparramados(), carrier("src/d.ts", ["D", "modulePath"], "field", "nominal")];
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h!.state).toBe("parcial");
    const applied = h!.checks.filter((c) => c.role === "applied");
    expect(applied.some((c) => c.passed && c.why.includes("src/d.ts"))).toBe(true);
  });

  it("8. RESOLUCIÓN VERIFICADA: si la clase declarante ya guarda esos primitivos como campos, es `ya-aplicado`", async () => {
    const src = `
class RoutePath {
  constructor(moduleName: string, globalPrefix: string, modulePath: string) {}
}
`;
    const f = "src/route-path.ts";
    const file = await unitFrom(src, f);
    const nodes = [
      // el dato está desparramado (pasa el required)…
      carrier("src/a.ts", ["buildA", "modulePath"], "parameter", "primitive"),
      carrier("src/b.ts", ["B", "modulePath"], "field", "primitive"),
      carrier("src/c.ts", ["buildC", "modulePath"], "parameter", "primitive"),
      carrier("src/a.ts", ["buildA", "globalPrefix"], "parameter", "primitive"),
      carrier("src/b.ts", ["B", "globalPrefix"], "field", "primitive"),
      carrier("src/c.ts", ["buildC", "globalPrefix"], "parameter", "primitive"),
      carrier("src/a.ts", ["buildA", "moduleName"], "parameter", "primitive"),
      carrier("src/b.ts", ["B", "moduleName"], "field", "primitive"),
      carrier("src/c.ts", ["buildC", "moduleName"], "parameter", "primitive"),
      // …pero la clase declarante YA los guarda como campos propios.
      carrier(f, ["RoutePath", "moduleName"], "field", "primitive"),
      carrier(f, ["RoutePath", "globalPrefix"], "field", "primitive"),
      carrier(f, ["RoutePath", "modulePath"], "field", "primitive"),
    ];
    const h = valueObject.build(poFinding(f, 3, 3, "constructor", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("9. un primitivo DENTRO de un contenedor no cuenta como el tipo del parámetro", async () => {
    const src = `
export function f(a: string, items: string[], m: ReadonlyMap<string, string>): void {}
`;
    const f = "src/f.ts";
    const file = await unitFrom(src, f);
    // Sólo `a` es un string suelto: si `items`/`m` contaran, el required
    // encontraría datos que el detector nunca contó.
    const nodes = [
      carrier("src/x.ts", ["x1", "a"], "parameter", "primitive"),
      carrier("src/y.ts", ["Y", "a"], "field", "primitive"),
      carrier("src/z.ts", ["z1", "a"], "parameter", "primitive"),
      carrier("src/x.ts", ["x1", "items"], "parameter", "primitive"),
      carrier("src/y.ts", ["Y", "items"], "field", "primitive"),
      carrier("src/z.ts", ["z1", "items"], "parameter", "primitive"),
    ];
    const h = valueObject.build(poFinding(f, 2, 2, "f", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h).not.toBeNull();
    const req = h!.checks.find((c) => c.role === "required");
    // El único dato reconstruido es `a`; `items` no viaja al conteo.
    expect(req!.why).toContain('"a"');
    expect(req!.why).not.toContain("items");
  });

  it("10. la normalización del identificador es de FORMA: `_modulePath` y `ModulePath` son el mismo dato", async () => {
    const file = await unitFrom(SRC, FILE);
    const nodes = [
      carrier("src/a.ts", ["buildA", "ModulePath"], "parameter", "primitive"),
      carrier("src/b.ts", ["B", "_modulePath"], "field", "primitive"),
      carrier("src/c.ts", ["buildC", "modulepath"], "parameter", "primitive"),
    ];
    const h = valueObject.build(poFinding(FILE, 2, 4, "registerRoute", "string", 3), graphOf(nodes), ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("11. HUECO DECLARADO: una función anónima no produce sitios y por eso no es candidata", async () => {
    const src = `
const g = (a: string, b: string, c: string) => a + b + c;
`;
    const f = "src/anon.ts";
    const file = await unitFrom(src, f);
    // EL MECANISMO EXACTO DEL HUECO: `graph/edges/declara-tipo.ts` cuelga cada
    // sitio de un `fromPath` de contenedores CON NOMBRE, y una función anónima
    // no aporta uno — así que en producción los parámetros `a`/`b`/`c` de esta
    // flecha NO producen ningún nodo `carrier`. Con el grafo así (sitios de
    // otros datos, ninguno de éstos), el dato mide 0 sitios y el required no
    // aprueba.
    const h = valueObject.build(poFinding(f, 2, 2, "función anónima", "string", 3), graphOf(sitiosDesparramados()), ctxFor(file));
    expect(h).toBeNull();

    // Y la prueba de que lo que falta es EL SITIO y no otra cosa: con los
    // mismos datos registrados como sitios (lo que pasa cuando la función SÍ
    // tiene nombre), la misma firma sí es candidata.
    const conSitios = [
      carrier("src/x.ts", ["x1", "a"], "parameter", "primitive"),
      carrier("src/y.ts", ["Y", "a"], "field", "primitive"),
      carrier("src/z.ts", ["z1", "a"], "parameter", "primitive"),
    ];
    expect(valueObject.build(poFinding(f, 2, 2, "función anónima", "string", 3), graphOf(conSitios), ctxFor(file))).not.toBeNull();
  });
});
