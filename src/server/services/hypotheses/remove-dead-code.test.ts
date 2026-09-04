/**
 * `remove-dead-code.test.ts` — OLA AX, ATERRIZAJE. **EL TEST QUE FALTABA.**
 *
 * `remove-dead-code.ts` entró al árbol construido por AS5 y re-medido por AX2
 * **sin un `.test.ts` propio**, y el contrato del registro
 * (`hypotheses/registry.ts`, primer párrafo) exige los dos: *"una hipótesis
 * nueva = un archivo propio (`<patron>.ts`) + un `<patron>.test.ts` propio +
 * DOS líneas contiguas"*. Sin él, la familia se registraba con la mitad del
 * contrato.
 *
 * ── LA REGLA CON LA QUE ESTÁ ESCRITO, Y NO ES UN ADORNO ────────────────────
 * **CADA `required` SE PRUEBA CONTRA UNA LÍNEA BASE QUE LO HACE FALLAR.** Un
 * caso que pasa con el `required` puesto Y sin él no prueba nada: prueba que
 * el resto del camino funciona. Por eso cada uno de los SIETE `required` de
 * los tres caminos tiene acá un caso donde ese chequeo —y sólo ése— cae, y el
 * `build` devuelve `null`. El caso "FUERZA" del mismo camino es idéntico
 * salvo por la variable que se movió, así que el `null` sólo puede venir del
 * chequeo bajo prueba.
 *
 *   camino A · `unreachable-code`  → `tramoVisible`,
 *                                    `nadaDelTramoSeUsaAfuera`,
 *                                    `hayUnSaltoAntes`
 *   camino B · `unused-symbol`     → `sinNingunaAristaEntrante`
 *   camino C · `unused-variable`   → `esVariableLocal`,
 *                                    `inicializadorSinEfecto`,
 *                                    `invisibleEnTodoElArchivo`
 *
 * ── LOS SEIS LENGUAJES, Y POR QUÉ SOBRE EL CAMINO B ────────────────────────
 * La cobertura por lenguaje se paga sobre el camino B **porque el camino B es
 * la familia**: sobre los 21 repos, `unused-symbol` produce **280** hallazgos
 * en los seis lenguajes, `unreachable-code` **8**, y `unused-variable`
 * **CERO** (su detector se desregistró en la Ola AW; ver `detect/registry.ts`
 * y `ola-ax/informes/AX2.md` §8.2). Medir "los seis lenguajes" sobre un camino
 * con 8 sujetos o sobre uno con 0 sería medir donde no hay nada.
 * El reparto real de los 280: ruby 146 · csharp 62 · python 22 · typescript
 * 21 · javascript 15 · go 12 · java 1.
 *
 * ── LA DECISIÓN DE LA OLA QUE ESTE ARCHIVO CONGELA ─────────────────────────
 * **La compuerta de visibilidad NO es un `required`.** Medida: **11,1 % (2/18)
 * con ella contra 47,2 % sin ella**, y `sin-dato` en **309 de 309** candidatos
 * de ruby/python/typescript/javascript. Los casos `B5` a `B9` fijan eso con
 * aserciones: un símbolo de Ruby, uno de Go (en las dos formas), uno de Python
 * y uno de C# público **EMITEN** — con la compuerta como `required` los cinco
 * eran silencio.
 *
 * **Y `B9` MIDE LO QUE AX2 §16.3 DEJÓ DECLARADO Y SIN MEDIR:** el
 * discriminador SÍ separa al confinado (2 discriminadores confirmados) del
 * expuesto (1), pero **la ETIQUETA de confianza NO los separa**: el
 * `ceiling: "media"` del camino B aplasta `ladderStep(1)` y `ladderStep(2)` en
 * el mismo `media` (`engine.ts:124-132`). La única frontera que la etiqueta
 * distingue en este camino es CERO discriminadores (`baja`) contra uno o más
 * (`media`). Consecuencia útil: **la degradación no le baja la etiqueta a
 * ninguna propuesta que antes pasara la compuerta.**
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { derivado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileUnit } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { hypothesis as removeDeadCode } from "./remove-dead-code.js";
import type { HypothesisContext } from "./types.js";

/* ── sondas de gramática, una por lenguaje ──────────────────────────────── */

const JS_PROBE = `
function suelta(a, b) { if (a > 0) { for (const y of []) { suelta(a, b); } } try { suelta(a, b); } catch (e) { suelta(a, b); } return a; }
class C { constructor(n) {} m(x) { suelta(x, 1); } }
const arrow = (a) => a;
`;
const TS_PROBE = `
function typed(a: number, b: string): number { if (a > 0) { for (const y of []) { typed(a, b); } } try { typed(a, b); } catch (e) { typed(a, b); } return a; }
class C { constructor(n: string) {} m(x: number): void { typed(x, ""); } }
const arrow = (a: string): string => a;
`;
const RUBY_PROBE = `
def suelta(a, b); a; end
class C
  def initialize(n); @n = n; end
  def m(x)
    begin
      suelta(x, 1)
    rescue => e
      raise e
    ensure
      1
    end
  end
end
`;

async function unitFrom(wasm: string, probe: string, language: string, source: string, file: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file });
}

const CAPS = new Set<Capability>([
  "unidad-tipo-clase", "tipos-explicitos", "herencia", "interfaz", "imports",
  "excepciones", "ternario", "nodo-constructor", "visibilidad", "genericos", "modulos",
]);

function ctxFor(file: FileUnit | null): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: CAPS,
    setsFor: () =>
      file?.sets ?? {
        functionNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), cloneNodes: new Set(),
        classNodes: new Set(), nestingNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(),
        switchContainerNodes: new Set(),
      },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

function unThreshold(): Threshold {
  return resolveThreshold(
    derivado({ floor: 1, stat: "p95", of: "wmc", floorSource: { work: "n/a", rule: "presencia" } }),
    { language: "typescript", sampleSize: () => 0, corpusP95: () => null },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CAMINO B — `unused-symbol`. LA FAMILIA REAL: 280 de los 288 sujetos.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Calca la forma que `unused-symbol.ts#buildFinding` produce: el `anchor`
 *  con `{file, symbolPath}` es lo único con que la hipótesis encuentra el
 *  nodo en el grafo (`analyzeUnusedSymbol` → `symbolNodeId`). */
function usFinding(file: string, symbolPath: readonly string[], language: string): Finding {
  const name = symbolPath[symbolPath.length - 1] ?? "?";
  return {
    id: `unused-symbol:${name}`,
    detectorId: "unused-symbol",
    kind: "unused-symbol",
    scope: "inter-file",
    language,
    title: `"${name}" no tiene consumidores en el repo`,
    detail: "d",
    trigger: [{ label: "consumidores dentro del repo", value: 0, threshold: unThreshold() }],
    locations: [
      {
        file,
        startLine: 3,
        endLine: 7,
        symbol: name,
        role: symbolPath.length > 1 ? "miembro sin consumidores" : "símbolo de nivel superior sin consumidores",
        anchor: { file, symbolPath },
      },
    ],
    severity: 50,
    advice: { primary: { name: "Eliminar código muerto", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

function symNode(file: string, symbolPath: readonly string[], extra: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    startLine: 3,
    endLine: 7,
    ...extra,
  };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], provenance: CodeGraphEdge["provenance"] = "resolved"): CodeGraphEdge {
  return { from, to, kind, provenance, weight: 1 };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[] = []): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

/** El caso que se repite en toda la sección: un símbolo confinado, sin una
 *  sola arista entrante. Devuelve `[finding, graph]` para que cada caso mueva
 *  UNA variable y nada más. */
function casoConfinado(language: string, file: string, symbolPath: readonly string[], extra: Partial<CodeGraphNode> = {}) {
  const node = symNode(file, symbolPath, { visibility: "private", ...extra });
  return { finding: usFinding(file, symbolPath, language), graph: graphOf([node]), id: node.id };
}

describe("Remove Dead Code · camino B (`unused-symbol`) — la familia que de verdad emite", () => {
  it("B0. registro: id, patrón y las TRES anclas de los tres caminos", () => {
    expect(removeDeadCode.id).toBe("remove-dead-code");
    expect(removeDeadCode.pattern).toBe("Remove Dead Code");
    expect([...removeDeadCode.anchors].sort()).toEqual(["unreachable-code", "unused-symbol", "unused-variable"]);
  });

  it("B1. FUERZA: un símbolo confinado sin ninguna arista entrante emite una propuesta `ausente`", () => {
    const { finding, graph } = casoConfinado("typescript", "src/a.ts", ["muerto"]);
    const h = removeDeadCode.build(finding, graph, ctxFor(null));
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Remove Dead Code");
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    const req = h!.checks.filter((c) => c.role === "required");
    expect(req).toHaveLength(1);
    expect(req[0]!.passed).toBe(true);
  });

  it("B2. LÍNEA BASE de `sinNingunaAristaEntrante`: UNA arista `calls` entrante y la propuesta desaparece", () => {
    // Idéntico a B1 salvo por la arista. Si `sinNingunaAristaEntrante` no
    // existiera, este caso emitiría igual que B1 — que es lo que hace que el
    // caso pruebe el chequeo y no el resto del camino.
    const { finding, graph, id } = casoConfinado("typescript", "src/a.ts", ["muerto"]);
    const llamador = symNode("src/b.ts", ["llama"]);
    const conArista = graphOf([...graph.nodes, llamador], [edge(llamador.id, id, "calls")]);
    expect(removeDeadCode.build(finding, conArista, ctxFor(null))).toBeNull();
  });

  it("B3. una arista AMBIGUA también silencia: el chequeo es 'ninguna relación', no 'ninguna confiable'", () => {
    const { finding, graph, id } = casoConfinado("typescript", "src/a.ts", ["muerto"]);
    const otro = symNode("src/b.ts", ["quizas"]);
    const conArista = graphOf([...graph.nodes, otro], [edge(otro.id, id, "references", "ambiguous")]);
    expect(removeDeadCode.build(finding, conArista, ctxFor(null))).toBeNull();
  });

  it("B4. `contains` y `affects` NO cuentan como uso — sin esta exclusión el camino B emitiría CERO en todo el corpus", () => {
    const { finding, graph, id } = casoConfinado("typescript", "src/a.ts", ["muerto"]);
    const archivo = symNode("src/a.ts", []);
    const conArtefactos = graphOf(
      [...graph.nodes, archivo],
      [edge(archivo.id, id, "contains", "declared"), edge(archivo.id, id, "affects", "declared")],
    );
    expect(removeDeadCode.build(finding, conArtefactos, ctxFor(null))).not.toBeNull();
  });

  /* ── LA DECISIÓN DE LA OLA: LA COMPUERTA DE VISIBILIDAD NO ES `required` ── */

  it("B5. RUBY — un método sin modificador de visibilidad (`sin-dato`) EMITE. Con la compuerta como `required` era silencio, y Ruby es el 52 % de la población", () => {
    // `exposureOf` no puede devolver `confinada` para Ruby: no hay modificador
    // que la gramática exponga y sus métodos no son de nivel superior.
    const finding = usFinding("app/models/site.rb", ["Site", "muerto"], "ruby");
    const graph = graphOf([symNode("app/models/site.rb", ["Site", "muerto"])]);
    const h = removeDeadCode.build(finding, graph, ctxFor(null));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    // La compuerta sigue viva, pero como DISCRIMINADOR que no pasa.
    const disc = h!.discriminators.find((d) => d.label.includes("inalcanzable desde fuera del repo"));
    expect(disc).toBeDefined();
    expect(disc!.passed).toBe(false);
    expect(disc!.why).toMatch(/la gramática no declara la visibilidad/);
  });

  it("B6. GO — un identificador en minúscula sale `sin-dato` por la rama de Go y EMITE igual", () => {
    const finding = usFinding("hugo/pkg/a.go", ["muerto"], "go");
    const graph = graphOf([symNode("hugo/pkg/a.go", ["muerto"])]);
    expect(removeDeadCode.build(finding, graph, ctxFor(null))).not.toBeNull();
  });

  it("B7. GO — un identificador en MAYÚSCULA es `expuesta` (exportado por la especificación del lenguaje) y EMITE igual, con la advertencia en `toConfirm`", () => {
    const finding = usFinding("hugo/pkg/a.go", ["Muerto"], "go");
    const graph = graphOf([symNode("hugo/pkg/a.go", ["Muerto"])]);
    const h = removeDeadCode.build(finding, graph, ctxFor(null));
    expect(h).not.toBeNull();
    const disc = h!.discriminators.find((d) => d.label.includes("inalcanzable desde fuera del repo"));
    expect(disc!.passed).toBe(false);
    expect(disc!.why).toMatch(/alcanzable desde afuera/);
    expect(h!.toConfirm[0]).toMatch(/API pública consumida desde FUERA del repo/);
  });

  it("B8. PYTHON — un método de clase nunca llega a `confinada` y EMITE", () => {
    const finding = usFinding("netbox/dcim/models.py", ["Device", "muerto"], "python");
    const graph = graphOf([symNode("netbox/dcim/models.py", ["Device", "muerto"])]);
    expect(removeDeadCode.build(finding, graph, ctxFor(null))).not.toBeNull();
  });

  it("B9. CSHARP — la compuerta degradada SÍ separa al confinado del expuesto en los discriminadores… y la ETIQUETA de confianza NO los separa. Medido, no supuesto", () => {
    const priv = removeDeadCode.build(
      usFinding("ShareX/A.cs", ["A", "Muerto"], "csharp"),
      graphOf([symNode("ShareX/A.cs", ["A", "Muerto"], { visibility: "private" })]),
      ctxFor(null),
    );
    const pub = removeDeadCode.build(
      usFinding("ShareX/A.cs", ["A", "Muerto"], "csharp"),
      graphOf([symNode("ShareX/A.cs", ["A", "Muerto"], { visibility: "public" })]),
      ctxFor(null),
    );
    expect(priv).not.toBeNull();
    expect(pub).not.toBeNull();

    // LO QUE LA DEGRADACIÓN SÍ CONSERVA: las dos EMITEN —con la compuerta
    // como `required` la pública era silencio— y el discriminador las
    // distingue, que es la señal que el consumidor puede leer.
    const confirmados = (h: NonNullable<typeof priv>): number => h.discriminators.filter((d) => d.passed).length;
    expect(confirmados(priv!)).toBe(2);
    expect(confirmados(pub!)).toBe(1);

    // LO QUE **NO** CONSERVA, Y HAY QUE DECIRLO: la ETIQUETA es la MISMA. El
    // `ceiling: "media"` del camino B tapa el escalón — `ladderStep(1) =
    // "media"` y `ladderStep(2) = "alta"`, y `minConfidence("media", …)` los
    // aplasta a los dos en `media` (`engine.ts:124-132`). O sea: la única
    // frontera que la etiqueta de este camino distingue es CERO discriminadores
    // (`baja`, ver B14) contra UNO O MÁS (`media`).
    //
    // ESTO ES EXACTAMENTE LO QUE AX2 §16.3 DEJÓ ESCRITO Y SIN MEDIR: la
    // EMISIÓN de la degradación es idéntica a la de su medición (que usó el
    // interruptor `medirSinCompuertaDeVisibilidad`), pero la CONFIANZA no
    // estaba re-medida. Acá queda medida: **la degradación no le baja la
    // etiqueta a ninguna propuesta que antes pasara la compuerta.**
    expect(pub!.confidence).toBe("media");
    expect(priv!.confidence).toBe("media");
  });

  it("B10. JAVA — `private` escrito da `confinada` y emite (java aporta 1 de los 280, y no queda mudo)", () => {
    const finding = usFinding("jenkins/core/src/main/java/hudson/A.java", ["A", "muerto"], "java");
    const graph = graphOf([symNode("jenkins/core/src/main/java/hudson/A.java", ["A", "muerto"], { visibility: "private" })]);
    expect(removeDeadCode.build(finding, graph, ctxFor(null))).not.toBeNull();
  });

  it("B11. JAVASCRIPT — nivel superior no exportado da `confinada` por la tercera rama de `exposureOf`", () => {
    const finding = usFinding("lodash/lodash.js", ["muerto"], "javascript");
    const graph = graphOf([symNode("lodash/lodash.js", ["muerto"], { exported: false })]);
    const h = removeDeadCode.build(finding, graph, ctxFor(null));
    expect(h).not.toBeNull();
    const disc = h!.discriminators.find((d) => d.label.includes("inalcanzable desde fuera del repo"));
    expect(disc!.passed).toBe(true);
  });

  it("B12. LOS SEIS LENGUAJES EMITEN, y ninguno queda mudo — el censo de AX2 §11.1 en una aserción", () => {
    const seis: readonly (readonly [string, string, readonly string[]])[] = [
      ["ruby", "app/models/site.rb", ["Site", "muerto"]],
      ["csharp", "ShareX/A.cs", ["A", "Muerto"]],
      ["python", "netbox/models.py", ["Device", "muerto"]],
      ["typescript", "src/a.ts", ["muerto"]],
      ["javascript", "lodash/lodash.js", ["muerto"]],
      ["go", "hugo/pkg/a.go", ["muerto"]],
    ];
    const mudos = seis.filter(([lang, file, sp]) => removeDeadCode.build(usFinding(file, sp, lang), graphOf([symNode(file, sp)]), ctxFor(null)) === null);
    expect(mudos.map(([l]) => l)).toEqual([]);
  });

  it("B13. el símbolo que no está en el grafo de esta corrida EMITE IGUAL — el precio declarado del 1:1 con el ancla", () => {
    // No es un descuido: `sinNingunaAristaEntrante` cuenta aristas, y un nodo
    // ausente tiene cero. Es lo que hace que la familia sea un pasa-manos 1:1
    // de su ancla (280 hallazgos → 280 propuestas, AX2 §15.1). Queda escrito
    // acá para que nadie lo redescubra como si fuera un hallazgo nuevo: la
    // compuerta que antes lo tapaba era la de visibilidad, y su costo medido
    // fue apagar cuatro lenguajes.
    const finding = usFinding("src/a.ts", ["fantasma"], "typescript");
    expect(removeDeadCode.build(finding, graphOf([]), ctxFor(null))).not.toBeNull();
  });

  it("B14. sin grafo no hay camino B: `analyzeUnusedSymbol` no puede afirmar nada y la familia igual propone — se deja MEDIDO, no supuesto", () => {
    const finding = usFinding("src/a.ts", ["fantasma"], "typescript");
    const h = removeDeadCode.build(finding, null, ctxFor(null));
    expect(h).not.toBeNull();
    expect(h!.confidence).toBe("baja");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * CAMINO A — `unreachable-code`. 8 sujetos en 21 repos; los tres `required`
 * son la RE-VERIFICACIÓN de la afirmación del ancla.
 * ═══════════════════════════════════════════════════════════════════════════ */

function unrFinding(file: string, startLine: number, endLine: number, language: string): Finding {
  return {
    id: "unreachable-code:1",
    detectorId: "unreachable-code",
    kind: "unreachable-code",
    scope: "intra-function",
    language,
    title: "Código inalcanzable",
    detail: "d",
    trigger: [{ label: "sentencias muertas", value: 1, threshold: unThreshold() }],
    locations: [{ file, startLine, endLine, role: "tramo inalcanzable" }],
    severity: 60,
    advice: { primary: { name: "Eliminar código muerto", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

/** El `return` de la línea 3 saca el flujo; las líneas 4-5 son el tramo. */
const JS_MUERTO = `
function f(a) {
  return a;
  console.log("uno");
  console.log("dos");
}
`;

/** Mismo esqueleto, pero el tramo DECLARA `b` y `b` se lee después. */
const JS_MUERTO_QUE_DECLARA = `
function f(a) {
  return a;
  const b = 2;
  console.log(b);
}
`;

/** Sin ningún salto anterior: es la forma de los DOS falsos de `preact` que
 *  proponían borrar el retorno normal de la función. */
const JS_SIN_SALTO = `
function f(a) {
  const x = a + 1;
  console.log(x);
  console.log("dos");
}
`;

describe("Remove Dead Code · camino A (`unreachable-code`)", () => {
  it("A1. FUERZA: tramo ubicado, sin nombres que escapen, con un salto anterior en el mismo bloque → emite", async () => {
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", JS_MUERTO, "src/f.js");
    const h = removeDeadCode.build(unrFinding("src/f.js", 4, 5, "javascript"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Remove Dead Code");
    expect(h!.state).toBe("ausente");
    expect(h!.checks.filter((c) => c.role === "required")).toHaveLength(3);
  });

  it("A2. LÍNEA BASE de `tramoVisible`: sin árbol vivo no hay nada que verificar y no es candidata", () => {
    expect(removeDeadCode.build(unrFinding("src/f.js", 4, 5, "javascript"), null, ctxFor(null))).toBeNull();
  });

  it("A3. LÍNEA BASE de `tramoVisible` (2): un rango que no cae dentro de ninguna función viva tampoco es candidata", async () => {
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", JS_MUERTO, "src/f.js");
    expect(removeDeadCode.build(unrFinding("src/f.js", 900, 901, "javascript"), null, ctxFor(file))).toBeNull();
  });

  it("A4. LÍNEA BASE de `nadaDelTramoSeUsaAfuera`: el tramo declara `b` y `b` se lee fuera del tramo → silencio", async () => {
    // Mismo archivo que A1 salvo el contenido del tramo: la declaración se iza
    // y el resto de la función depende de ella. Borrarlo rompería el código.
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", JS_MUERTO_QUE_DECLARA, "src/f.js");
    expect(removeDeadCode.build(unrFinding("src/f.js", 4, 4, "javascript"), null, ctxFor(file))).toBeNull();
  });

  it("A5. LÍNEA BASE de `hayUnSaltoAntes`: sin un salto hermano y anterior, la afirmación del ancla no se re-verifica → silencio (los dos falsos de `preact`)", async () => {
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", JS_SIN_SALTO, "src/f.js");
    expect(removeDeadCode.build(unrFinding("src/f.js", 4, 5, "javascript"), null, ctxFor(file))).toBeNull();
  });

  it("A6. RUBY — un `rescue`/`ensure` de método NO es código inalcanzable: es un manejador, y se alcanza cuando el cuerpo levanta", async () => {
    const RUBY_RESCUE = `
class C
  def m(x)
    return x
  rescue => e
    log(e)
    raise
  end
end
`;
    const file = await unitFrom("tree-sitter-ruby.wasm", RUBY_PROBE, "ruby", RUBY_RESCUE, "app/c.rb");
    // Los tres casos medidos en `redmine` proponían borrar el manejo de
    // errores de un método. `HANDLER_WORD` los ataja.
    expect(removeDeadCode.build(unrFinding("app/c.rb", 5, 7, "ruby"), null, ctxFor(file))).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * CAMINO C — `unused-variable`. **SU ANCLA ESTÁ DESREGISTRADA (Ola AW)**, así
 * que en producción emite CERO. Se prueba igual: el código está en el árbol y
 * un `required` sin caso que lo tumbe es un `required` sin evidencia.
 * ═══════════════════════════════════════════════════════════════════════════ */

function uvFinding(file: string, line: number, symbol: string, variant: "parametro" | "variable-local"): Finding {
  return {
    id: `unused-variable:${symbol}`,
    detectorId: "unused-variable",
    kind: "unused-variable",
    scope: "intra-function",
    language: "typescript",
    variant,
    title: `"${symbol}" se declara y nunca se lee`,
    detail: "d",
    trigger: [{ label: "lecturas", value: 0, threshold: unThreshold() }],
    locations: [{ file, startLine: line, endLine: line, symbol, role: "declaración sin lecturas" }],
    severity: 40,
    advice: { primary: { name: "Eliminar código muerto", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

/** `sinUso` se declara con un literal y no vuelve a aparecer en el archivo. */
const TS_INERTE = `
function f(a: number): number {
  const sinUso = 1;
  return a;
}
`;

/** El inicializador EJECUTA algo: borrar la línea borra la llamada. */
const TS_CON_EFECTO = `
function f(a: number): number {
  const sinUso = hacerAlgo();
  return a;
}
`;

/** El mismo nombre reaparece en otra función del archivo — la forma exacta
 *  del falso de `eslint/docs/_examples/.../example.js`. */
const TS_NOMBRE_REPETIDO = `
function f(a: number): number {
  const sinUso = 1;
  return a;
}
function g(): number {
  const sinUso = 2;
  return sinUso;
}
`;

describe("Remove Dead Code · camino C (`unused-variable`) — ancla desregistrada, código igual bajo prueba", () => {
  it("C1. FUERZA: variable local, inicializador inerte, nombre que no reaparece → emite", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", TS_INERTE, "src/f.ts");
    const h = removeDeadCode.build(uvFinding("src/f.ts", 3, "sinUso", "variable-local"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.checks.filter((c) => c.role === "required")).toHaveLength(3);
  });

  it("C2. LÍNEA BASE de `esVariableLocal`: un PARÁMETRO no se borra — la firma es un contrato con quien llama y con quien hereda", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", TS_INERTE, "src/f.ts");
    // Única variable movida respecto de C1: la `variant` que publica el detector.
    expect(removeDeadCode.build(uvFinding("src/f.ts", 3, "sinUso", "parametro"), null, ctxFor(file))).toBeNull();
  });

  it("C3. LÍNEA BASE de `inicializadorSinEfecto`: `const x = hacerAlgo();` no es una línea que se borre — borrarla borra la llamada", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", TS_CON_EFECTO, "src/f.ts");
    expect(removeDeadCode.build(uvFinding("src/f.ts", 3, "sinUso", "variable-local"), null, ctxFor(file))).toBeNull();
  });

  it("C4. LÍNEA BASE de `invisibleEnTodoElArchivo`: el nombre reaparece en otra función del archivo → silencio", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", TS_NOMBRE_REPETIDO, "src/f.ts");
    expect(removeDeadCode.build(uvFinding("src/f.ts", 3, "sinUso", "variable-local"), null, ctxFor(file))).toBeNull();
  });

  it("C5. sin árbol vivo no es candidata", () => {
    expect(removeDeadCode.build(uvFinding("src/f.ts", 3, "sinUso", "variable-local"), null, ctxFor(null))).toBeNull();
  });
});

describe("Remove Dead Code · la disciplina de este archivo, verificada", () => {
  it("D1. no hay forma de `ya-aplicado` en ninguno de los tres caminos: el remedio es la eliminación, y si ya se hubiera hecho no habría hallazgo", async () => {
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", JS_MUERTO, "src/f.js");
    const a = removeDeadCode.build(unrFinding("src/f.js", 4, 5, "javascript"), null, ctxFor(file))!;
    const b = removeDeadCode.build(...(() => {
      const c = casoConfinado("typescript", "src/a.ts", ["muerto"]);
      return [c.finding, c.graph, ctxFor(null)] as const;
    })())!;
    for (const h of [a, b]) {
      expect(h.state).toBe("ausente");
      const applied = h.checks.filter((c) => c.role === "applied");
      expect(applied).toHaveLength(1);
      expect(applied[0]!.passed).toBe(false);
    }
  });

  it("D2. un `kind` que no es ninguna de las tres anclas devuelve `null` sin tocar nada", () => {
    const ajeno = { ...usFinding("src/a.ts", ["x"], "typescript"), kind: "large-class" as Finding["kind"] };
    expect(removeDeadCode.build(ajeno, graphOf([]), ctxFor(null))).toBeNull();
  });
});
