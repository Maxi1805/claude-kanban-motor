/**
 * `extract-class.test.ts` — Ola AS, frente AS3.
 *
 * QUÉ INTENCIÓN VERIFICA CADA CHEQUEO:
 *
 *   1. **"sin árbol vivo no es candidata"** — la partición en racimos es un
 *      hecho del texto; sin texto, `holds: false`.
 *   2. **"la clase cohesiva NO dispara"** — el caso que hunde a este ancla:
 *      "la clase es grande" es un síntoma de TAMAÑO. Si todos los métodos
 *      quedan encadenados por campos compartidos, no hay nada que extraer, y
 *      ésa es la diferencia con `Template Method · large-class` (0 de 27).
 *   3. **"dos racimos disjuntos SÍ disparan, y la propuesta nombra los
 *      campos y los métodos del racimo a extraer"** — la FUERZA.
 *   4. **"un racimo chico de menos de 3 métodos no paga"** — el piso de
 *      `MIN_METODOS_RACIMO`: un tipo nuevo tan chico agrega más indirección
 *      que orden. Es la parte "cuándo NO conviene" del catálogo.
 *   5. **"las llamadas entre racimos bajan la confianza"** — el
 *      discriminador: si la clase nueva va a seguir llamando a la vieja, la
 *      frontera no es limpia.
 *   6. **"la coincidencia de nombres NO es una confirmación"** — la trampa de
 *      la Ola AP pide mirar si la solución ya existe, y este camino lo mira;
 *      pero MEDIDO sobre los 13 repos de biblioteca, sus 3 confirmaciones eran
 *      las 3 falsas (un builder que copia su configuración al producto, una
 *      subclase que redefine las mismas banderas). Se conserva la evidencia y
 *      se retira la afirmación — y con eso esta familia queda estructuralmente
 *      incapaz de borrarle su propuesta a ninguno de los 19 patrones.
 *   7. **RUBY** — los campos se leen de `@x` sin receptor explícito.
 *   8. **JAVA** — el caso que dejaría muda a media familia si se leyeran
 *      sólo los accesos con receptor: en Java un campo se escribe DESNUDO la
 *      mayor parte del tiempo, y la vía "nombre declarado por la clase" es la
 *      que lo salva. Trampa 1, ya pagada.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { derivado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileUnit } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import type { CodeGraph, CodeGraphNode } from "../graph/types.js";
import { hypothesis as extractClass, startExtractClassTrace, takeExtractClassTrace } from "./extract-class.js";
import { autoReferenciaDe, esAutoReferencia } from "./move-member.js";
import type { HypothesisContext } from "./types.js";

const TS_PROBE = `
function typed(a: number, b: string): number { if (a > 0) { for (const y of []) { typed(a, b); } } try { typed(a, b); } catch (e) { typed(a, b); } return a; }
class C { constructor(n: string) {} m(x: number): void { typed(x, ""); } }
const arrow = (a: string): string => a;
`;
const RUBY_PROBE = `
def suelta(a, b); a; end
class C
  def initialize(n); @n = n; end
  def m(x); suelta(x, 1); end
end
l = lambda { |z| z }
`;
const JS_PROBE = `
function suelta(a, b) { if (a > 0) { for (const y of []) { suelta(a, b); } } try { suelta(a, b); } catch (e) { suelta(a, b); } return a; }
class C { constructor(n) {} m(x) { suelta(x, 1); } }
const arrow = (a) => a;
const clasica = function (a) { return a; };
`;
const PY_PROBE = `
def suelta(a, b):
    return a
class C:
    def __init__(self, n):
        self.n = n
    def m(self, x):
        return suelta(x, 1)
g = lambda z: z
`;
const CSHARP_PROBE = `
class C {
  int f;
  public int P { get => f; set { f = value; } }
  C(int n) { this.f = n; }
  void N() { System.Func<int,int> g = (int y) => { return y + 1; }; }
  int M(int x) { if (x > 0) { for (int i = 0; i < 1; i++) { } } try { M(x); } catch (System.Exception e) { } return x; }
}
`;
const JAVA_PROBE = `
class C {
  int f;
  C(int n) { this.f = n; }
  int m(int x) { if (x > 0) { for (int i = 0; i < 1; i++) { } } try { m(x); } catch (Exception e) { } return x; }
}
`;

const GO_PROBE = `
type C struct { f int }
func (c *C) m(x int) int { if x > 0 { for i := 0; i < 1; i++ { } }; return c.f }
`;

async function unitFrom(wasm: string, probe: string, language: string, source: string, file: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file });
}

function threshold(): Threshold {
  return resolveThreshold(
    derivado({ floor: 47, stat: "p95", of: "wmc", floorSource: { work: "Lanza & Marinescu", rule: "God Class — WMC" } }),
    { language: "typescript", sampleSize: () => 0, corpusP95: () => null },
  );
}

function lcFinding(file: string, startLine: number, endLine: number, symbol: string, miembros: number): Finding {
  return {
    id: "lc-1",
    detectorId: "large-class",
    kind: "large-class",
    scope: "intra-file",
    language: "typescript",
    title: `"${symbol}" concentra ${miembros} métodos`,
    detail: "d",
    trigger: [{ label: "métodos", value: miembros, threshold: threshold() }],
    locations: [{ file, startLine, endLine, symbol, role: "clase con exceso de miembros" }],
    severity: 80,
    advice: { primary: { name: "Extract Class", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

function ctxFor(file: FileUnit | null): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(["unidad-tipo-clase", "tipos-explicitos", "herencia", "interfaz", "imports", "excepciones", "ternario", "nodo-constructor", "visibilidad", "genericos", "modulos"]),
    setsFor: () => file?.sets ?? {
      functionNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), cloneNodes: new Set(),
      classNodes: new Set(), nestingNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

function graphOf(nodes: readonly CodeGraphNode[]): CodeGraph {
  return { nodes, edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

const FILE = "src/big.ts";

/** Ocho métodos, todos encadenados por campos compartidos: grande pero cohesiva. */
const COHESIVA = `
class Big {
  a = 1; b = 2; c = 3;
  m1(): number { return this.a + this.b; }
  m2(): number { return this.b + this.c; }
  m3(): number { return this.c + this.a; }
  m4(): number { return this.a; }
  m5(): number { return this.b; }
  m6(): number { return this.c; }
  m7(): number { return this.a + this.c; }
  m8(): number { return this.b + this.a; }
}
`;

/** Ocho métodos en DOS racimos que no comparten ni un campo. */
const PARTIDA = `
class Big {
  red = 1; port = 2; host = 3;
  cacheKey = 4; cacheTtl = 5; cacheHits = 6;
  connect(): number { return this.red + this.port; }
  disconnect(): number { return this.port + this.host; }
  reconnect(): number { return this.host + this.red; }
  send(): number { return this.port; }
  cacheGet(): number { return this.cacheKey + this.cacheTtl; }
  cachePut(): number { return this.cacheTtl + this.cacheHits; }
  cacheEvict(): number { return this.cacheHits + this.cacheKey; }
  cacheStats(): number { return this.cacheHits; }
}
`;

describe("Extract Class · large-class", () => {
  it("1. sin árbol vivo no es candidata — los racimos son un hecho del texto", () => {
    expect(extractClass.build(lcFinding(FILE, 2, 13, "Big", 48), null, ctxFor(null))).toBeNull();
  });

  it("2. la clase GRANDE pero COHESIVA no dispara — 'es grande' es un síntoma de tamaño, no una fuerza", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", COHESIVA, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 13, "Big", 48), null, ctxFor(file));
    expect(h).toBeNull();
  });

  it("3. FUERZA: dos racimos sin campo en común disparan y la propuesta nombra campos y métodos", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", PARTIDA, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 15, "Big", 48), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Extract Class");
    expect(h!.state).toBe("ausente");
    const req = h!.checks.find((c) => c.role === "required");
    expect(req?.passed).toBe(true);
    expect(req?.why).toMatch(/[Rr]acimo conexo al nivel t = 1/);
    // LA SUSTANCIA NUEVA DE LA OLA AT: la propuesta publica la PUREZA, que es la medida
    // gradual, y el precio exacto en accesos que cruzan. `pureza 100 %` es el absoluto viejo.
    expect(req?.why).toMatch(/PUREZA 100\.0 %/);
    expect(req?.why).toMatch(/sólo 0 cruzarían la frontera/);
    expect(h!.places[0]?.role).toMatch(/racimo a extraer/);
    expect(h!.places.length).toBeGreaterThan(1);
  });

  it("4. un racimo de menos de 3 métodos no paga un tipo nuevo — 'cuándo NO conviene'", async () => {
    const src = `
class Big {
  a = 1; b = 2; c = 3; solo = 9;
  m1(): number { return this.a + this.b; }
  m2(): number { return this.b + this.c; }
  m3(): number { return this.c + this.a; }
  m4(): number { return this.a; }
  m5(): number { return this.b; }
  m6(): number { return this.c; }
  aparte(): number { return this.solo; }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, FILE);
    expect(extractClass.build(lcFinding(FILE, 2, 12, "Big", 48), null, ctxFor(file))).toBeNull();
  });

  it("5. las llamadas entre racimos bajan la confianza (discriminador), no apagan la propuesta", async () => {
    const src = PARTIDA.replace("cacheStats(): number { return this.cacheHits; }", "cacheStats(): number { this.send(); return this.cacheHits; }");
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 15, "Big", 48), null, ctxFor(file));
    expect(h).not.toBeNull();
    const d = h!.discriminators.find((c) => c.label.startsWith("Los dos racimos tampoco"));
    expect(d?.passed).toBe(false);
  });

  it("6. el tipo con los MISMOS NOMBRES no confirma nada: sigue `ausente`, con la coincidencia como evidencia", async () => {
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", PARTIDA, FILE);
    const nodos: CodeGraphNode[] = ["cacheKey", "cacheTtl", "cacheHits", "red", "port", "host"].map((m, i) => ({
      id: `sym:src/cache.ts#Cache.${m}`,
      kind: "symbol" as const,
      file: "src/cache.ts",
      symbolPath: ["Cache", m],
      startLine: i + 1,
      endLine: i + 1,
    }));
    const h = extractClass.build(lcFinding(FILE, 2, 15, "Big", 48), graphOf(nodos), ctxFor(file));
    expect(h).not.toBeNull();
    // MEDIDO: las 3 confirmaciones que este camino produjo sobre los 13 repos
    // de biblioteca eran las 3 falsas (un builder que copia, una subclase que
    // redefine). Se conserva el dato, se retira la afirmación — y con eso esta
    // familia NO PUEDE borrarle su propuesta a ningún patrón de los 19
    // (`engine.ts#arbitrateRivalHypotheses` sólo retira ante un estado
    // confirmado).
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    const aplicado = h!.checks.find((c) => c.role === "applied");
    expect(aplicado?.passed).toBe(false);
    expect(aplicado?.why).toContain("Cache");
  });

  it("7. RUBY: los campos se leen de `@x`, sin receptor explícito", async () => {
    const src = `
class Big
  def connect; @red + @port; end
  def disconnect; @port + @host; end
  def reconnect; @host + @red; end
  def send_it; @port; end
  def cache_get; @cache_key + @cache_ttl; end
  def cache_put; @cache_ttl + @cache_hits; end
  def cache_evict; @cache_hits + @cache_key; end
  def cache_stats; @cache_hits; end
end
`;
    const file = await unitFrom("tree-sitter-ruby.wasm", RUBY_PROBE, "ruby", src, "lib/big.rb");
    const h = extractClass.build(lcFinding("lib/big.rb", 2, 12, "Big", 48), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.role === "required")?.why).toMatch(/cache_/);
  });

  it("8. JAVA: el campo DESNUDO cuenta — sin esta vía, media familia quedaría muda (trampa ya pagada)", async () => {
    const src = `
class Big {
  int red; int port; int host;
  int cacheKey; int cacheTtl; int cacheHits;
  int connect() { return red + port; }
  int disconnect() { return port + host; }
  int reconnect() { return host + red; }
  int send() { return port; }
  int cacheGet() { return cacheKey + cacheTtl; }
  int cachePut() { return cacheTtl + cacheHits; }
  int cacheEvict() { return cacheHits + cacheKey; }
  int cacheStats() { return cacheHits; }
}
`;
    const file = await unitFrom("tree-sitter-java.wasm", JAVA_PROBE, "java", src, "Big.java");
    const h = extractClass.build(lcFinding("Big.java", 2, 14, "Big", 48), null, ctxFor(file));
    expect(h, "Java no puede quedar mudo: sus campos se escriben sin receptor").not.toBeNull();
    expect(h!.checks.find((c) => c.role === "required")?.why).toMatch(/cache/i);
  });

  it("9. AT1: la componente REAL no es la segunda por tamaño — mirar sólo `racimos[1]` deja muda a la familia", async () => {
    // Componentes por tamaño: [6 métodos de `a/b/c`], [2 métodos de `ruido`], [4 métodos de `cache*`].
    // La Ola AS miraba SÓLO la segunda (los 2 de `ruido`), que no llega al piso de 3 métodos, y
    // devolvía `null` — con un racimo de 4 métodos y 3 campos, perfecto y disjunto, ahí al lado.
    const src = `
class Big {
  a = 1; b = 2; c = 3; ruido1 = 7; ruido2 = 8;
  cacheKey = 4; cacheTtl = 5; cacheHits = 6;
  m1(): number { return this.a + this.b; }
  m2(): number { return this.b + this.c; }
  m3(): number { return this.c + this.a; }
  m4(): number { return this.a + this.c; }
  m5(): number { return this.b + this.a; }
  m6(): number { return this.c + this.b; }
  n1(): number { return this.ruido1 + this.ruido2; }
  n2(): number { return this.ruido2 + this.ruido1; }
  cacheGet(): number { return this.cacheKey + this.cacheTtl; }
  cachePut(): number { return this.cacheTtl + this.cacheHits; }
  cacheEvict(): number { return this.cacheHits + this.cacheKey; }
  cacheStats(): number { return this.cacheHits + this.cacheTtl; }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 20, "Big", 48), null, ctxFor(file));
    expect(h, "el racimo de caché está ahí aunque no sea la SEGUNDA componente por tamaño").not.toBeNull();
    const req = h!.checks.find((c) => c.role === "required");
    expect(req?.passed).toBe(true);
    expect(req?.why).toMatch(/cacheKey/);
    expect(req?.why).not.toMatch(/ruido/);
  });

  it("10. AT1 · LA ESCALERA: un campo-cubo que TODOS tocan pega la clase a t = 1 y la suelta a t = 2", async () => {
    // `log` lo tocan los ocho métodos: a t = 1 hay UNA sola componente y la Ola AS es muda.
    // A t = 2 ("comparten al menos DOS campos") la clase se parte en los dos racimos reales.
    const src = `
class Big {
  log = 0;
  red = 1; port = 2; host = 3; peer = 9;
  cacheKey = 4; cacheTtl = 5; cacheHits = 6; cacheAge = 10;
  connect(): number { return this.log + this.red + this.port + this.host + this.peer; }
  disconnect(): number { return this.log + this.port + this.host + this.red + this.peer; }
  reconnect(): number { return this.log + this.host + this.red + this.port + this.peer; }
  send(): number { return this.log + this.port + this.red + this.host + this.peer; }
  cacheGet(): number { return this.log + this.cacheKey + this.cacheTtl + this.cacheHits + this.cacheAge; }
  cachePut(): number { return this.log + this.cacheTtl + this.cacheHits + this.cacheKey + this.cacheAge; }
  cacheEvict(): number { return this.log + this.cacheHits + this.cacheKey + this.cacheTtl + this.cacheAge; }
  cacheStats(): number { return this.log + this.cacheHits + this.cacheTtl + this.cacheKey + this.cacheAge; }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 16, "Big", 48), null, ctxFor(file));
    expect(h, "la escalera tiene que soltar la clase en t = 2 pese al campo-cubo `log`").not.toBeNull();
    const req = h!.checks.find((c) => c.role === "required");
    expect(req?.why).toMatch(/nivel t = 2/);
    // El campo-cubo se queda del lado del resto y su acceso CRUZA: la pureza lo dice y no lo esconde.
    expect(req?.why).toMatch(/PUREZA 9\d\.\d %/);
    expect(req?.why).not.toMatch(/PUREZA 100/);
  });

  it("11. AT1: un corte SUCIO (pureza por debajo de 0,90) no se emite, y la evidencia dice el precio", async () => {
    // Dos racimos de 3, pero cada método toca ADEMÁS los dos campos del otro lado: la frontera
    // no existe. El mejor corte queda muy por debajo del piso y la familia calla.
    const src = `
class Big {
  x1 = 1; x2 = 2; y1 = 3; y2 = 4;
  m1(): number { return this.x1 + this.y1; }
  m2(): number { return this.x1 + this.x2 + this.y2; }
  m3(): number { return this.x2 + this.y1 + this.y2; }
  m4(): number { return this.y1 + this.x1; }
  m5(): number { return this.y2 + this.x2 + this.y1; }
  m6(): number { return this.y1 + this.y2 + this.x1 + this.x2; }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, FILE);
    expect(extractClass.build(lcFinding(FILE, 2, 10, "Big", 48), null, ctxFor(file))).toBeNull();
  });

  it("12. AT1: TCC es DISCRIMINADOR, no compuerta — el fixture canónico de dos racimos mide 0,357 > 1/3", async () => {
    // LA CORRECCIÓN CENTRAL DE ESTA OLA. `TCC < 1/3` (Lanza & Marinescu, God Class) es
    // aritméticamente una condición de TRES O MÁS racimos: dos racimos internamente completos
    // de k métodos tienen TCC hasta (k-1)/(2k-1), o sea 0,40 a 0,50, SIEMPRE por encima de 1/3.
    // Si TCC fuera `required`, el propio ejemplo de manual de `Extract Class` no se emitiría.
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", PARTIDA, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 15, "Big", 48), null, ctxFor(file));
    expect(h, "el ejemplo canónico de Extract Class NO puede morir en el umbral de God Class").not.toBeNull();
    const tccCheck = h!.discriminators.find((c) => c.label.startsWith("TCC por debajo"));
    expect(tccCheck, "TCC tiene que estar entre los discriminadores, nunca entre los required").toBeDefined();
    expect(tccCheck!.passed, "0,357 > 1/3: el discriminador NO se cumple, y la propuesta igual sale").toBe(false);
    expect(tccCheck!.why).toMatch(/35\.7 %/);
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA AU · FRENTE AU3 — EL MODELO DE CAMPOS
   * AT1 midió que el 35 % de las propuestas de esta familia traía entre sus
   * "campos" algo que no es un campo, y lo dejó como la compuerta que ahora
   * limita a la familia. Los tres tests de abajo fijan la regla que lo tapa:
   * **un campo es un nombre que la clase DECLARA O ESCRIBE.**
   * ══════════════════════════════════════════════════════════════════════ */

  it("13. AU3 · EL LÍMITE DECLARADO: `self.class` de Ruby SIGUE contando como campo, y acá está por qué", async () => {
    // ESTE TEST FIJA UNA LIMITACIÓN CONOCIDA, NO UNA GARANTÍA. Se escribe al revés a
    // propósito: si alguien la arregla, este test se pone rojo y le avisa que puede
    // borrarlo. Sin él, el límite queda sólo en un informe y se pierde en dos olas.
    //
    // EL CASO REAL: `jekyll/lib/jekyll/document.rb` — el racimo `draft?`/`inspect`/
    // `trigger_hooks` sale entero de `self.class`, que es `Object#class` de Ruby.
    //
    // POR QUÉ NO SE PUEDE TAPAR CON LA REGLA DE §1.3 DEL INFORME AU3: la regla que
    // separa el dato del método es CÓMO SE USA EL NOMBRE — blanco de llamada
    // (`this.assertEqual(1)`, un método heredado) contra valor (`this.instance.set(…)`,
    // un campo heredado de verdad, `AbstractHttpAdapter.instance`). **`self.class` se
    // usa como VALOR**, igual que `this.instance`, así que cae del lado del dato.
    //
    // Y no hay diferencia estructural que agarrar: sondeado en
    // `scratchpad-au3/probe-selfclass.mts`, tree-sitter parsea el miembro de
    // `self.class` como `<identifier>"class"` y el de `self.foo` como
    // `<identifier>"foo"` — el MISMO nodo. Lo único que los separa es saber que
    // `class` pertenece al protocolo del objeto raíz de Ruby, que no está en lo que el
    // analizador carga. Taparlo pediría una lista de palabras POR LENGUAJE, que es
    // exactamente la trampa que `SELF_PREFIX` de `state.ts` pagó dejando a Go mudo en
    // cuatro anclas durante varias olas. **Se prefiere el límite declarado al hardcodeo.**
    const src = `
class Big
  def connect; @red + @port; end
  def disconnect; @port + @host; end
  def reconnect; @host + @red; end
  def send_it; @port + @red; end
  def draft?; self.class.name; end
  def inspect_it; self.class.to_s + @label.to_s; end
  def trigger_hooks; self.class.hooks(@label); end
end
`;
    const file = await unitFrom("tree-sitter-ruby.wasm", RUBY_PROBE, "ruby", src, "lib/big.rb");
    const h = extractClass.build(lcFinding("lib/big.rb", 2, 12, "Big", 48), null, ctxFor(file));
    const why = h?.checks.find((c) => c.role === "required")?.why ?? "";
    expect(why, "LÍMITE CONOCIDO: `class` es el builtin de Ruby y todavía entra como campo").toMatch(/draft\?/);
    expect(why, "y arrastra al racimo entero con él").toMatch(/trigger_hooks/);
  });

  it("14. AU3: el miembro HEREDADO leído por `this.` no es un campo de esta clase — no está en lo que el analizador carga", async () => {
    // El caso real: `netbox/GraphQLTestCase` emitía un racimo pegado por
    // `assertEqual`/`assertIn`/`assertTrue`, que son de `TestCase`, no suyos; y
    // `nest/ExpressAdapter#getInstance`, `jenkins/AbstractBuild#getAction`. Un nombre que
    // esta clase NUNCA declara ni escribe vive en la clase base — y la clase base no
    // está en lo que el analizador carga. Es la misma regla que hundió a `Remove Dead Code`.
    const src = `
class Big extends Base {
  red = 1; port = 2; host = 3;
  connect(): number { return this.red + this.port; }
  disconnect(): number { return this.port + this.host; }
  reconnect(): number { return this.host + this.red; }
  send(): number { return this.port + this.host; }
  checkA(): void { this.assertEqual(1); this.assertIn(2); }
  checkB(): void { this.assertIn(1); this.assertTrue(2); }
  checkC(): void { this.assertTrue(1); this.assertEqual(2); }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, FILE);
    const h = extractClass.build(lcFinding(FILE, 2, 12, "Big", 48), null, ctxFor(file));
    expect(h?.checks.find((c) => c.role === "required")?.why ?? "", "assertEqual/assertIn/assertTrue son de la clase base").not.toMatch(/checkA|checkB|checkC/);
  });

  it("15. AU3 · C#: el lambda pasado como ARGUMENTO adentro de un `set` de propiedad no es un miembro", async () => {
    // EL CASO REAL, con archivo y línea: `ShareX/Presentation/ApplicationSettings/
    // ApplicationSettingsViewModel.cs:231,247,257,269` — cuatro `set` de propiedad que
    // hacen `SetSetting(..., x => Settings.ThemeOptions.X = x)`. La familia emitía una
    // propuesta cuyos CUATRO "métodos" eran esos lambdas.
    //
    // POR QUÉ EL CHEQUEO VIEJO NO LO AGARRABA, y por eso este fixture es de C# y no de
    // TypeScript: el chequeo viejo excluye un lambda si otra FUNCIÓN de `file.functions`
    // lo contiene, y el `accessor_declaration` de C# NO es un nodo función — el lambda
    // queda huérfano y pasa por miembro. En TypeScript el mismo lambda está adentro de
    // un método, que sí es función, así que un fixture de TypeScript NO prueba nada acá.
    const src = `
class Big {
  int red; int port; int host; int cacheKey; int cacheTtl; int cacheHits;
  int Connect() { return red + port; }
  int Disconnect() { return port + host; }
  int Reconnect() { return host + red; }
  int Send() { return port + red; }
  public int A { set { SetSetting(v, value, x => { cacheKey = x; cacheTtl = x; }); } }
  public int B { set { SetSetting(v, value, x => { cacheTtl = x; cacheHits = x; }); } }
  public int C { set { SetSetting(v, value, x => { cacheHits = x; cacheKey = x; }); } }
}
`;
    const file = await unitFrom("tree-sitter-c_sharp.wasm", CSHARP_PROBE, "csharp", src, "Big.cs");
    const h = extractClass.build(lcFinding("Big.cs", 2, 12, "Big", 48), null, ctxFor(file));
    expect(h, "los tres lambdas son argumentos de `SetSetting(...)`: no son un racimo de métodos").toBeNull();
  });
  it("16. AU3 · RUBY: `@otro.campo` es un campo de OTRO objeto — el defecto que ninguna ola había nombrado", async () => {
    // ENCONTRADO EN ESTA OLA, juzgando `chatwoot/app/services/data_imports/importer.rb`:
    // una propuesta de 6 métodos sobre 90 cuyos TRES campos eran `items`, `mappings` y
    // `truncated_parts_error_code` — o sea `@data_import.items`, `@data_import.mappings`
    // y `@source.truncated_parts_error_code`. Miembros de OTROS objetos, los tres.
    //
    // LA CAUSA, con línea: `esAutoReferencia` (move-member.ts:192) devuelve `true` para
    // CUALQUIER `instance_variable`, así que en Ruby la base `@lo_que_sea` de un acceso
    // cuenta como "uno mismo" y su miembro entra como campo propio. Es más grave que
    // `self.class`: `self.class` aporta UN nombre, esto aporta la superficie entera de
    // cada colaborador. La regla "un campo es un nombre que la clase declara o escribe"
    // lo tapa sin tocar `esAutoReferencia`, que otras familias usan con otro sentido.
    const src = `
class Big
  def initialize(s); @source = s; @red = 1; @port = 2; @host = 3; end
  def connect; @red + @port; end
  def disconnect; @port + @host; end
  def reconnect; @host + @red; end
  def send_it; @port + @red; end
  def stats_a; @source.items.count + @source.mappings.count; end
  def stats_b; @source.mappings.count + @source.errors.count; end
  def stats_c; @source.errors.count + @source.items.count; end
end
`;
    const file = await unitFrom("tree-sitter-ruby.wasm", RUBY_PROBE, "ruby", src, "lib/big.rb");
    const h = extractClass.build(lcFinding("lib/big.rb", 2, 12, "Big", 48), null, ctxFor(file));
    expect(h?.checks.find((c) => c.role === "required")?.why ?? "", "`items`/`mappings`/`errors` son de @source, no de Big").not.toMatch(/stats_a|stats_b|stats_c/);
  });

  it("17. AW1 · LA RAÍZ: `esAutoReferencia` deja de decir que `@colaborador` es UNO MISMO", async () => {
    // EL DEFECTO, con archivo y línea, guardado en
    // `claude-kanban-docs/PENDIENTE-MODELO-DE-CAMPOS.md`: `move-member.ts#esAutoReferencia`
    // devolvía `true` para CUALQUIER nodo `instance_variable`. Consecuencia medida: en
    // Ruby, la superficie entera de cada colaborador entraba como campos de la clase.
    //
    // ESTE TEST ES SOBRE LA RAÍZ, no sobre el síntoma: el test 16 comprueba que la
    // PROPUESTA no sale; éste comprueba que la FUNCIÓN contesta lo que su nombre
    // pregunta. Sin él, el arreglo se podría deshacer en `extract-class.ts` sin que
    // nada se ponga en rojo, que es exactamente cómo el defecto sobrevivió seis olas.
    const [sets, root] = await Promise.all([
      nodeSetsFor("tree-sitter-ruby.wasm", RUBY_PROBE),
      parseRoot("tree-sitter-ruby.wasm", "class C\n  def m; @otro.campo + @propio; end\nend\n"),
    ]);
    void sets;
    const encontrados: { tipo: string; texto: string; auto: boolean; clase: string | null }[] = [];
    const rec = (n: any): void => {
      if (n.isNamed && /^(instance|class)_variable$/.test(n.type)) {
        encontrados.push({
          tipo: n.type,
          texto: n.text,
          auto: esAutoReferencia(n, "ruby", new Set()),
          clase: autoReferenciaDe(n, "ruby", new Set()),
        });
      }
      for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) rec(c); }
    };
    rec(root);
    expect(encontrados.length, "el fixture tiene `@otro` y `@propio`: si no hay ivars el test es vacío").toBeGreaterThanOrEqual(2);
    for (const e of encontrados) {
      expect(e.auto, `\`${e.texto}\` es un CAMPO de uno mismo, no uno mismo`).toBe(false);
      expect(e.clase, `\`${e.texto}\` tiene que seguir siendo reconocible como campo propio`).toBe("campo-propio");
    }
  });

  it("18. AW1 · la mitad de ESCRITURA del defecto: `@otro.x = 1` no declara `x` como campo propio", async () => {
    // AU3 filtró la LECTURA de `@otro.x` (la etiqueta `ivar-mem`) pero dejó la
    // ESCRITURA: `camposEscritosPorSiMismo` usaba `esAutoReferencia` y por eso
    // `@otro.x = 1` metía `x` en la lista blanca `declaraOEscribe`, desde donde el
    // miembro ajeno volvía a colarse como campo POR LA PUERTA DE ATRÁS.
    //
    // Los tres `stats_*` sólo se tocan entre sí a través de miembros de `@source`, y
    // acá además se los ESCRIBE, que es la vía que el filtro de AU3 no cubría.
    const src = `
class Big
  def initialize(s); @source = s; @red = 1; @port = 2; @host = 3; end
  def connect; @red + @port; end
  def disconnect; @port + @host; end
  def reconnect; @host + @red; end
  def send_it; @port + @red; end
  def stats_a; @source.items = 1; @source.mappings = 2; end
  def stats_b; @source.mappings = 3; @source.errors = 4; end
  def stats_c; @source.errors = 5; @source.items = 6; end
end
`;
    const file = await unitFrom("tree-sitter-ruby.wasm", RUBY_PROBE, "ruby", src, "lib/big2.rb");
    const h = extractClass.build(lcFinding("lib/big2.rb", 2, 12, "Big", 48), null, ctxFor(file));
    const why = h?.checks.find((c) => c.role === "required")?.why ?? "";
    expect(why, "`items`/`mappings`/`errors` se le ESCRIBEN a @source: son campos de @source").not.toMatch(/stats_a|stats_b|stats_c/);
  });

  it("19. AW1 · JS: el `this` REENLAZADO adentro de un callback no es el de la clase", async () => {
    // EL SEGUNDO DEFECTO, con archivo y línea: `Ghost/email-event-processor.js:334` hace
    // `recipientQuery.where(function () { this.orWhere(...) })` — el `this` de knex, no
    // el de la clase. `where` y `orWhere` entraban como campos de `EmailEventProcessor`.
    //
    // La distinción es de la GRAMÁTICA y no una lista de lenguajes: una `arrow_function`
    // CIERRA sobre el `this` de afuera y una `function_expression` ABRE el suyo. Acá los
    // tres `q_*` sólo comparten `bagA`/`bagB`/`bagC` a través de `function () { ... }`.
    const src = `
class Big {
  red = 1; port = 2; host = 3; bagA = 4; bagB = 5; bagC = 6;
  connect() { return this.red + this.port; }
  disconnect() { return this.port + this.host; }
  reconnect() { return this.host + this.red; }
  sendIt() { return this.port + this.red; }
  qA(q) {
    q.where(function () { return this.bagA + this.bagB; });
  }
  qB(q) {
    q.where(function () { return this.bagB + this.bagC; });
  }
  qC(q) {
    q.where(function () { return this.bagC + this.bagA; });
  }
}
`;
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", src, "src/big.js");
    const h = extractClass.build(lcFinding("src/big.js", 2, 18, "Big", 48), null, ctxFor(file));
    const why = h?.checks.find((c) => c.role === "required")?.why ?? "";
    expect(why, "`bagA`/`bagB`/`bagC` son del `this` del callback, no del de Big").not.toMatch(/qA|qB|qC/);
  });

  it("20. AW1 · JS: la función FLECHA sí cierra sobre el `this` de la clase — el arreglo no es un hachazo", async () => {
    // La compuerta del test 19 tiene que ser ESTRECHA. Si tirara todo `this` adentro de
    // cualquier función anidada, se llevaría puesto el caso más común de JS/TS moderno
    // (`xs.map(x => this.campo)`) y dejaría media familia muda — la trampa 1, otra vez.
    // Mismo fixture que el 19 con `=>` en vez de `function ()`: la propuesta SÍ sale.
    const src = `
class Big {
  red = 1; port = 2; host = 3; bagA = 4; bagB = 5; bagC = 6;
  connect() { return this.red + this.port; }
  disconnect() { return this.port + this.host; }
  reconnect() { return this.host + this.red; }
  sendIt() { return this.port + this.red; }
  qA(q) {
    q.where(() => this.bagA + this.bagB);
  }
  qB(q) {
    q.where(() => this.bagB + this.bagC);
  }
  qC(q) {
    q.where(() => this.bagC + this.bagA);
  }
}
`;
    const file = await unitFrom("tree-sitter-javascript.wasm", JS_PROBE, "javascript", src, "src/big3.js");
    const h = extractClass.build(lcFinding("src/big3.js", 2, 18, "Big", 48), null, ctxFor(file));
    const why = h?.checks.find((c) => c.role === "required")?.why ?? "";
    expect(why, "con `=>` el `this` es el de la clase: el racimo bagA/bagB/bagC es real").toMatch(/qA, qB, qC/);
  });

  it("21. AW1 · PYTHON: un `def` ANIDADO no reenlaza `self` — la regla del test 19 no se puede aplicar a ciegas", async () => {
    // LA TRAMPA 1 DEL ENCARGO, EN LA DIRECCIÓN CONTRARIA. La regla del test 19
    // ("estar adentro de una función que abre su propio enlace") es correcta para
    // `this`, que es un NODO DEDICADO cuyo enlace fija la llamada. Pero en Python la
    // auto-referencia es un NOMBRE LIGADO —el parámetro `self`—, y un `def` anidado
    // lo CAPTURA por clausura: `def inner(): return self.c` es el `self` del método.
    //
    // `function_definition` está en el `functionNodes` de Python y NO casa con
    // `CIERRA_SOBRE_SELF_NODE_WORD`, así que sin el segundo factor
    // (`SELF_NODE_TYPE.test(base)`) esta regla le comería a Python todo `self.x`
    // adentro de un `def` anidado y dejaría el lenguaje medio mudo. Sondeado, no
    // supuesto: `scratchpad-aw1/probe-rebind.mts` imprime `functionNodes` de las seis
    // gramáticas y en Python la auto-referencia no aparece como tipo de nodo.
    const src = `
class Big(Base):
    def __init__(self):
        self.red = 1
        self.port = 2
        self.host = 3

    def connect(self):
        return self.red + self.port

    def disconnect(self):
        return self.port + self.host

    def reconnect(self):
        return self.host + self.red

    def send_it(self):
        return self.port + self.red

    def q_a(self):
        def inner():
            return self.bag_a + self.bag_b
        return inner()

    def q_b(self):
        def inner():
            return self.bag_b + self.bag_c
        return inner()

    def q_c(self):
        def inner():
            return self.bag_c + self.bag_a
        return inner()
`;
    const file = await unitFrom("tree-sitter-python.wasm", PY_PROBE, "python", src, "big.py");
    const h = extractClass.build(lcFinding("big.py", 2, 33, "Big", 48), null, ctxFor(file));
    const why = h?.checks.find((c) => c.role === "required")?.why ?? "";
    expect(why, "el `self` de un `def` anidado ES el de la clase: el racimo q_a/q_b/q_c es real").toMatch(/q_a, q_b, q_c/);
  });

  it("22. AW1 · LA TERCERA PUERTA: el `this` de una CLASE ANIDADA no declara campos de la de afuera", async () => {
    // MISMO DEFECTO, TERCERA PUERTA. `camposDeclarados` ya paraba en la clase anidada
    // ("sus campos son suyos"), pero `camposEscritosPorSiMismo` usaba `walk`, que baja a
    // TODO el subárbol — clases anidadas incluidas —, así que el `this.x = …` del
    // constructor de la anidada metía `x` en la lista blanca `declaraOEscribe` de la de
    // AFUERA. Desde ahí, `otro.x` en un método de la de afuera contaba como campo propio
    // por la vía `bare`.
    //
    // TESTIGO REAL, con archivo y línea: `guava/…/util/concurrent/Monitor.java`. Su clase
    // anidada `Guard` (307) declara `final Condition condition` (310) y su constructor hace
    // `this.condition = monitor.lock.newCondition()` (321). La traza de AU3 da
    // `declaraOEscribe` de `Monitor` = ["activeGuards","condition","fair","lock","monitor"]
    // — `condition` y `monitor` son campos de `Guard`. Y NO es cosmético: `await`,
    // `awaitNanos` y `awaitUninterruptibly` entran al racimo SÓLO por `guard.condition`.
    //
    // El fixture reproduce esa forma: `connect`/`disconnect`/`reconnect` tocan los campos
    // propios y `waitOn`/`waitNanos`/`waitUn` tocan SÓLO `g.slot` y `g.mark`, que son
    // campos de la ANIDADA. Verificado con `scratchpad-aw1/probe-java.mts`: sin el corte
    // el volcado da `racimos [3,3,1]` y EMITE "3 métodos (waitOn, waitNanos, waitUn) sobre
    // 2 campos (mark, slot)"; con el corte da `racimos [3,1]` y no emite.
    const src = `
class Big {
  static class Slot {
    Object slot; Object mark; Object owner;
    Slot(Big owner) { this.owner = owner; this.slot = new Object(); this.mark = new Object(); }
  }
  int red; int port; int host; Object queue; Object lock;
  int connect() { return this.red + this.port; }
  int disconnect() { return this.port + this.host; }
  int reconnect() { return this.host + this.red; }
  void hold(Slot g) { this.queue = g; this.lock = g; }
  void waitOn(Slot g) { g.slot.toString(); g.mark.toString(); }
  void waitNanos(Slot g) { g.slot.hashCode(); g.mark.hashCode(); }
  void waitUn(Slot g) { g.slot.equals(g.mark); }
}
`;
    const file = await unitFrom("tree-sitter-java.wasm", JAVA_PROBE, "java", src, "Big.java");
    const h = extractClass.build(lcFinding("Big.java", 2, 16, "Big", 48), null, ctxFor(file));
    const why = h?.checks.find((c) => c.role === "required")?.why ?? "";
    expect(why, "`slot` es campo de la clase ANIDADA: no puede unir waitOn/waitNanos/waitUn").not.toMatch(/waitOn|waitNanos|waitUn/);
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA AX — la CUARTA PUERTA, GO, y la COMPUERTA DEL HUB
   * ══════════════════════════════════════════════════════════════════════ */

  it("23. AX1 · LA CUARTA PUERTA (TS): un método escrito como PROPIEDAD DE CLASE no es un campo", async () => {
    // TESTIGO REAL, con archivo y línea: `excalidraw/…/element/linearElementEditor.ts`
    // declara `static getEditorMidPoints = (…) => {…}` (787) y
    // `static getSegmentMidpointHitCoords = (…) => {…}` (838). `functionNodes` no
    // reconoce `public_field_definition` como función, así que `camposDeclarados` los
    // metía en `campos` por la rama del `name` — y desde ahí UNÍAN a todo método que los
    // llamara. El racimo que se emitió son SIETE manejadores de puntero pegados por DOS
    // NOMBRES DE MÉTODO ESTÁTICO, que no son estado compartido de ninguna clase.
    //
    // Verificado con `scratchpad-ax1/probe-prop.mts`: antes del arreglo
    // `declaraOEscribe = [a1,a2,b1,b2,hit,mid]` y racimos `[3,3]`; después,
    // `[a1,a2,b1,b2]` y racimos `[3,2,1]`.
    const src = `
class Ed {
  a1 = 1; a2 = 2; b1 = 3; b2 = 4;
  static mid = (p: any) => { return p; };
  static hit = (p: any) => { return p; };
  h1(p: any) { return Ed.mid(p) + this.a1; }
  h2(p: any) { return Ed.mid(p) + this.a2; }
  h3(p: any) { return Ed.hit(p) + this.a1; }
  k1(p: any) { return this.b1; }
  k2(p: any) { return this.b2; }
  k3(p: any) { return this.b1 + this.b2; }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, "ed.ts");
    startExtractClassTrace();
    extractClass.build(lcFinding("ed.ts", 2, 13, "Ed", 48), null, ctxFor(file));
    const t = takeExtractClassTrace();
    expect(t[0]?.declaraOEscribe, "`mid`/`hit` son MÉTODOS escritos como propiedad, no campos").not.toContain("mid");
    expect(t[0]?.declaraOEscribe).not.toContain("hit");
  });

  it("24. AX1 · LA CUARTA PUERTA (C#): la lambda cuelga de `equals_value_clause`, y un `= list.Select(x => x)` SÍ es un campo", async () => {
    // La forma de C# (y de Java) no es la de TS: la función no está en un campo de
    // gramática del declarador, está adentro de un `equals_value_clause`. Por eso la
    // regla atraviesa hasta DOS envoltorios de UN SOLO hijo nombrado.
    //
    // Y la segunda mitad es la que hace que la regla no sea un hachazo: un inicializador
    // que CONTIENE una lambda adentro de una llamada (`= list.Select(x => x)`) es un
    // CAMPO de verdad, y el envoltorio ahí tiene más de un hijo nombrado, así que no se
    // atraviesa. Las dos mitades en el mismo fixture.
    const src = `
class Ed {
  int a1; int a2; int b1; int b2;
  System.Func<int,int> mid = (p) => p;
  int[] cache = list.Select(x => x).ToArray();
  int h1(int p) { return mid(p) + this.a1; }
  int h2(int p) { return mid(p) + this.a2; }
  int h3(int p) { return mid(p) + this.a1; }
  int k1() { return this.b1; }
  int k2() { return this.b2; }
  int k3() { return this.b1 + this.b2; }
}
`;
    const file = await unitFrom("tree-sitter-c_sharp.wasm", CSHARP_PROBE, "csharp", src, "Ed.cs");
    startExtractClassTrace();
    extractClass.build(lcFinding("Ed.cs", 2, 13, "Ed", 48), null, ctxFor(file));
    const t = takeExtractClassTrace();
    expect(t[0]?.declaraOEscribe, "`mid` es un método escrito como propiedad").not.toContain("mid");
    expect(t[0]?.declaraOEscribe, "`cache` es un CAMPO: la lambda está adentro de una llamada, no ES el inicializador").toContain("cache");
  });

  it("25. AX1 · GO YA NO ESTÁ MUDO: el tipo del RECEPTOR agrupa los métodos que `className` no agrupa", async () => {
    // AW1 §4 dejó a Go con CERO métodos con campos en TODOS sus sujetos, y localizó la
    // causa en `porNombre` (exige `symbolClase !== null`). MEDIDO ACÁ, ESA CAUSA NO
    // ALCANZA: con el ancla `large-class`, que SÍ trae símbolo, Go seguía en cero, porque
    // `FunctionMetrics.className` es `null` para TODO método de Go — el walker lo deriva
    // del anidamiento y en Go el método NO está anidado en el tipo
    // (`scratchpad-ax1/probe-go.mts`). El arreglo le pregunta a la gramática por el campo
    // `receiver` y le saca el TIPO. Sin este test, Go vuelve a quedar mudo sin que nada se
    // ponga en rojo — que es cómo sobrevivió varias olas.
    const src = `
type Ed struct { a1 int; a2 int; b1 int; b2 int }
func (e *Ed) h1() int { return e.a1 }
func (e *Ed) h2() int { return e.a2 + e.a1 }
func (e *Ed) h3() int { return e.a1 + e.a2 }
func (e *Ed) k1() int { return e.b1 }
func (e *Ed) k2() int { return e.b2 + e.b1 }
func (e *Ed) k3() int { return e.b1 + e.b2 }
`;
    const file = await unitFrom("tree-sitter-go.wasm", GO_PROBE, "go", src, "ed.go");
    startExtractClassTrace();
    extractClass.build(lcFinding("ed.go", 2, 9, "Ed", 48), null, ctxFor(file));
    const t = takeExtractClassTrace();
    expect(t[0]?.metodosConCampos, "los 6 métodos del tipo `Ed` son suyos aunque vivan fuera de su span").toBe(6);
    expect(t[0]?.racimos, "dos racimos de 3, y sin el arreglo la traza da `metodosConCampos = 0`").toEqual([3, 3]);
  });

  it("26. AX1 · LA COMPUERTA DEL HUB, pre-registrada: el racimo que pega UN campo que usa toda la clase queda MARCADO", async () => {
    // Pre-registrada en `ola-ax/informes/AX1.md` §0, ANTES de mirar un sujeto. Los dos
    // conjuntos son hechos del archivo: (a) el campo lo tocan >= la mitad de los métodos
    // con campos de la clase, y (b) sacándoselo el racimo deja de ser una componente de
    // >= 3 métodos.
    //
    // El fixture reproduce la forma que AW1 §6.2 nombró en seis lenguajes (`PreviewImage`
    // en el viewmodel de ShareX, `httpServer` en el adaptador de nest, `loaded_path` en el
    // `Config` de rubocop): `p1..p4` NO comparten nada entre sí salvo `bus` — cada uno
    // tiene su propio `x_i` —, así que el racimo emitido existe SÓLO porque `bus` los une.
    // `s1..s4` sí comparten `q` y `r` de verdad y son el contraste dentro del mismo
    // fixture: son la mitad que NO se propone.
    //
    // Los candidatos a hub se toman de los campos que PEGAN el racimo (los que tocan >= 2
    // de sus métodos), NO de `corte.campos` — la corrección de §0.6.
    const src = `
class Big {
  bus = 1; q = 2; r = 3; x1 = 4; x2 = 5; x3 = 6; x4 = 7;
  s1() { return this.q + this.r; }
  s2() { return this.q + this.r; }
  s3() { return this.q + this.r; }
  s4() { return this.q + this.r; }
  p1() { return this.bus + this.x1; }
  p2() { return this.bus + this.x2; }
  p3() { return this.bus + this.x3; }
  p4() { return this.bus + this.x4; }
}
`;
    const file = await unitFrom("tree-sitter-typescript.wasm", TS_PROBE, "typescript", src, "big.ts");
    startExtractClassTrace();
    extractClass.build(lcFinding("big.ts", 2, 13, "Big", 48), null, ctxFor(file));
    const e = takeExtractClassTrace()[0];
    expect(e?.emitted, "sin la compuerta la propuesta SALE: pureza 100 %, 4 métodos, 5 campos").toBe(true);
    expect(e?.hubDelCorte, "`bus` es el único campo que toca más de un método del racimo").toBe("bus");
    expect(e?.metodosMedidos).toBe(8);
    expect(e?.usoClaseHub, "4 de los 8 métodos con campos de la clase — exactamente el piso de 0,50").toBe(4);
    expect(e?.sobreviveSinHub, "sin `bus` cada `p_i` queda solo con su `x_i`: cuatro componentes de 1").toBe(false);
  });

  it("27. AX1 · LA QUINTA PUERTA (Java): una CONSTANTE ESTÁTICA no es estado de instancia", async () => {
    // TESTIGO REAL, con archivo y línea: `jenkins/core/src/main/java/hudson/model/Run.java`
    // emite un racimo de 23 de 60 métodos sobre `ARTIFACTS, DELETE, UPDATE, description,
    // displayName, id`, y `DELETE` (2566) y `UPDATE` (2567) son
    // `public static final Permission`. Dos métodos que leen la MISMA CONSTANTE no
    // comparten estado: no hay objeto escondido que extraer. Sin la puerta, la constante
    // pega `setDisplayName` con `setDescription` con `delete`.
    //
    // Medido con `scratchpad-ax1/probe-static.mts` sobre las tres gramáticas que tienen
    // la palabra: antes, `declaraOEscribe = [DELETE,UPDATE,a1,a2,b1,b2]` y racimos `[6]`;
    // después, `[a1,a2,b1,b2]` y racimos `[3,2,1]`. En JS/Python/Ruby/Go es un no-op.
    const src = `
class Ed {
  public static final int DELETE = 1;
  public static final int UPDATE = 2;
  private int a1; private int a2; private int b1; private int b2;
  int h1() { return DELETE + this.a1; }
  int h2() { return DELETE + this.a2; }
  int h3() { return UPDATE + this.a1; }
  int k1() { return DELETE + this.b1; }
  int k2() { return UPDATE + this.b2; }
  int k3() { return this.b1 + this.b2; }
}
`;
    const file = await unitFrom("tree-sitter-java.wasm", JAVA_PROBE, "java", src, "Ed.java");
    startExtractClassTrace();
    extractClass.build(lcFinding("Ed.java", 2, 12, "Ed", 48), null, ctxFor(file));
    const t = takeExtractClassTrace();
    expect(t[0]?.declaraOEscribe, "`DELETE` es una CONSTANTE DE CLASE, no estado de instancia").not.toContain("DELETE");
    expect(t[0]?.declaraOEscribe).not.toContain("UPDATE");
    expect(t[0]?.estaticos, "se ETIQUETA, no se descarta: viaja en la traza").toContain("DELETE");
    expect(t[0]?.declaraOEscribe, "y `final` NO cuenta: los campos de instancia siguen enteros").toContain("a1");
    expect(t[0]?.declaraOEscribe).toContain("b2");
    expect((t[0]?.racimos ?? []).length, "sin la constante la clase se parte en más de una componente").toBeGreaterThan(1);
  });
});
