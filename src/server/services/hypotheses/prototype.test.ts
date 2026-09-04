import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { nodeSetsFor, parseRoot } from "../detect/testing.js";
import type { Finding, FileUnit, RepoUnit } from "../detect/types.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { hypothesis } from "./prototype.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Arnés — árboles REALES (mismo criterio que `state.test.ts`): los `sets`
 * salen SIEMPRE de una sonda (`nodeSetsFor`), nunca del propio archivo bajo
 * prueba — es exactamente lo que `ctx.setsFor(language)` simula, y es la
 * única forma honesta de ejercitar el caso Ruby ("def initialize" sin
 * paréntesis) sin caer en el Bug C del spike.
 * ──────────────────────────────────────────────────────────────────────── */

const TS_PROBE = `
class Probe {
  field: number;
  constructor(x: number) {
    this.field = x;
  }
  method(y: number): number {
    return y;
  }
}
`;

const RUBY_PROBE = `
class Probe
  def initialize(x)
    @field = x
  end
  def helper(y)
    y
  end
end
`;

const JAVA_PROBE = `
class Probe {
  int field;
  Probe(int x) {
    this.field = x;
  }
  int method(int y) {
    return y;
  }
}
`;

const GO_PROBE = `
package main

type Probe struct {
  X int
}

func (p *Probe) Method(y int) int {
  return y
}
`;

const JS_PROBE = `
class Probe {
  constructor(x) {
    this.field = x;
  }
  helper(y) {
    return y;
  }
}
`;

/** Copia literal del `PYTHON_PROBE` real de `code-analyzer.ts` (mismo criterio que el resto de este archivo: los `sets` salen SIEMPRE de una sonda, nunca del propio archivo bajo prueba). */
const PYTHON_PROBE = `
import os
from typing import Optional, Protocol
from dataclasses import dataclass

class Shape(Base):
    def __init__(self, name, opts=None):
        self.name = name

    def area(self, x, y, z, w, v, u):
        if x > 0:
            return 1
        elif x < 0:
            return 2
        else:
            return 3

    def describe(self, kind):
        match kind:
            case "circle":
                return "circle"
            case "square" | "rect":
                return "square"
            case _:
                return "unknown"

class Multi(Shape, Protocol):
    pass

@dataclass
class Point:
    x: int
    y: int

def annotated(x: int, y: str = "a") -> bool:
    return True
`;

const FAKE_REPO: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };

/** Sólo "unidad-tipo-clase" — Ola 10 (relanzamiento): la forma COMPLETA/PARCIAL(b) de una clase aislada no necesita "herencia" (ver docstring de `prototype.ts`). */
const SOLO_CAPS: readonly Capability[] = ["unidad-tipo-clase"];

/* ────────────────────────────────────────────────────────────────────────
 * Helpers de grafo SINTÉTICO — mismo estilo que
 * `hypotheses/wrapping-chain.test.ts` (grafos mínimos, sin `analyzeRepo`),
 * para ejercitar el camino (2) de `prototype.ts` (grafo puro, sin árbol
 * vivo — el único que corre de verdad en producción para esta ancla).
 * ──────────────────────────────────────────────────────────────────────── */
const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
}

function method(file: string, classPath: string, name: string, arity: number | null, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [classPath, name], { family: "function-like", arity, ...overrides });
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

async function fileUnitForSource(wasm: string, probe: string, source: string, language: string, path: string): Promise<FileUnit> {
  const sets = await nodeSetsFor(wasm, probe);
  const root = await parseRoot(wasm, source);
  return { path, language, lines: root.endPosition.row + 1, root, sets, functions: [] };
}

function ctxWithFiles(
  files: readonly FileUnit[],
  capabilities: readonly Capability[],
  neighborhood: HypothesisContext["neighborhood"] = EMPTY_NEIGHBORHOOD,
): HypothesisContext {
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  return {
    file: null,
    fileAt: (path) => byPath.get(path) ?? null,
    repo: FAKE_REPO,
    capabilities: new Set(capabilities),
    setsFor: (language) => files.find((f) => f.language === language)?.sets ?? {
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    },
    neighborhood,
    branches: () => null,
  };
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), { language: "*", sampleSize: () => 0, corpusP95: () => null });
}

/** OLA X, FRENTE B5 — misma forma que `buildDuplicationFindings` emite (ver
 *  `detect/inter-file/duplication.ts`), tras el re-anclado de
 *  `speculative-abstraction` a `duplication` (ver el docstring de
 *  `prototype.ts`).
 *
 *  OLA AB, FRENTE AB3 — el símbolo/rol YA NO es lo único que
 *  `candidateFiles()`/`findPresetSiblingProblem` ignoran: desde esta ola el
 *  camino 1b (self-cloning-solo) SÍ mira `locations[*].startLine/endLine`
 *  como gate (ver el docstring de `prototype.ts`, sección "OLA AB, FRENTE
 *  AB3"). Por defecto este helper sigue cubriendo TODO el archivo (rango
 *  [1, 100000]) para que los ~25 tests existentes de este archivo —
 *  escritos para probar la DETECCIÓN estructural, no la relevancia de
 *  ubicación — sigan siendo válidos sin tocar cada uno; el segundo
 *  parámetro opcional (`locations`) es lo que usan los tests NUEVOS de la
 *  sección "OLA AB, FRENTE AB3 — el gate de ubicación" para ejercitar el
 *  gate con rangos angostos, deliberadamente. */
function fakeAnchorFinding(file: string, locations?: readonly [{ startLine: number; endLine: number; role: string }, ...{ startLine: number; endLine: number; role: string }[]]): Finding {
  const [first, ...rest] = locations ?? [{ startLine: 1, endLine: 100_000, role: "cobertura del archivo entero (default de este helper)" }];
  return {
    id: "f-dup",
    detectorId: "duplication",
    kind: "duplication",
    scope: "inter-file",
    language: null,
    title: "2 fragmentos de igual estructura de 6 líneas",
    detail: "d",
    trigger: [{ label: "copias", value: 2, threshold: fakeThreshold() }],
    locations: [{ file, ...first }, ...rest.map((l) => ({ file, ...l }))],
    severity: 45,
    advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

const FULL_CAPS: readonly Capability[] = ["unidad-tipo-clase", "herencia"];

describe("prototype hypothesis — forma del registro", () => {
  it("cuelga de duplication, nunca se dispara sola", () => {
    expect(hypothesis.id).toBe("prototype");
    expect(hypothesis.pattern).toBe("Prototype");
    // OLA AE, FRENTE AE12 — `anchors` SUMA el ancla-fuerza nueva y CONSERVA la
    // vieja. El número medido va al lado, para que quien lea sepa por qué se
    // SUMÓ y no se reemplazó: `duplication` da 31 hipótesis en las dos
    // poblaciones y las 31 son `ya-aplicado` — CERO recomendaciones,
    // `ausente` = 0 (informe `ola-ae/informes/AE12.md` §1). Se publica el
    // número y NO se toca el ancla: la ola es ADITIVA.
    expect(hypothesis.anchors).toEqual(["duplication", "repeated-configured-assembly"]);
  });
});

describe("prototype hypothesis — límite de wiring (ctx.fileAt siempre null hoy)", () => {
  it("sin árbol vivo, build() devuelve null (no hay evidencia que reconstruir)", () => {
    const ctx = ctxWithFiles([], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);
    expect(result).toBeNull();
  });
});

describe("prototype hypothesis — TypeScript, ausente (oportunidad clásica)", () => {
  it("≥3 hermanos con presets literales distintos, sin auto-constructor: ausente, confianza alta", async () => {
    const source = `
class Enemy {}
class Goblin extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
}
class Orc extends Enemy {
  constructor() {
    super();
    this.health = 60;
    this.damage = 15;
  }
}
class Troll extends Enemy {
  constructor() {
    super();
    this.health = 100;
    this.damage = 25;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "enemy.ts");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(result!.confidence).toBe("alta"); // three-or-more-siblings + no-extra-behavior confirmados
    expect(result!.missingCapabilities).toEqual([]);
    expect(result!.places.some((p) => p.symbol?.includes("Goblin"))).toBe(true);
    expect(result!.places.some((p) => p.symbol?.includes("Orc"))).toBe(true);
    expect(result!.places.some((p) => p.symbol?.includes("Troll"))).toBe(true);
    const discLabels = result!.discriminators.filter((d) => d.passed).map((d) => d.label);
    expect(discLabels.some((l) => l.includes("three-or-more-siblings") || l.length > 0)).toBe(true);
  });

  it("hermanos IDÉNTICOS (mismos valores): required falla, build() devuelve null", async () => {
    const source = `
class Enemy {}
class Goblin extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
}
class Orc extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "enemy.ts");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);
    expect(result).toBeNull();
  });
});

describe("prototype hypothesis — parcial y ya-aplicado (excluder estructural)", () => {
  it("1/3 hermanos ya se auto-construye: parcial (la regla vieja colapsa esto a silencio total)", async () => {
    const source = `
class Enemy {}
class Goblin extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
  clone() {
    return new Goblin();
  }
}
class Orc extends Enemy {
  constructor() {
    super();
    this.health = 60;
    this.damage = 15;
  }
}
class Troll extends Enemy {
  constructor() {
    super();
    this.health = 100;
    this.damage = 25;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "enemy.ts");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("parcial");
    expect(result!.confidence).not.toBeNull(); // parcial SIGUE compitiendo en el ranking
    const applied = result!.checks.find((c) => c.role === "applied");
    expect(applied?.passed).toBe(true);
    expect(applied?.why).toContain("Goblin");
  });

  it("todos los hermanos ya se auto-construyen: ya-aplicado, confianza null (no compite)", async () => {
    const source = `
class Enemy {}
class Goblin extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
  clone() {
    return new Goblin();
  }
}
class Orc extends Enemy {
  constructor() {
    super();
    this.health = 60;
    this.damage = 15;
  }
  clone() {
    return new Orc();
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "enemy.ts");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    expect(result!.confidence).toBeNull();
  });
});

describe("prototype hypothesis — Ruby, el caso Bug C del spike", () => {
  it("'def initialize' SIN paréntesis se clasifica bien vía ctx.setsFor(sonda), no vía el propio archivo", async () => {
    const source = `
class Enemy
end

class Goblin < Enemy
  def initialize
    @health = 20
    @damage = 5
  end
end

class Orc < Enemy
  def initialize
    @health = 60
    @damage = 15
  end
end

class Troll < Enemy
  def initialize
    @health = 100
    @damage = 25
  end
end
`;
    const file = await fileUnitForSource("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby", "enemy.rb");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.rb"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(result!.confidence).not.toBeNull();
  });
});

describe("prototype hypothesis — Java, constructor por TIPO DE NODO (mecanismo B)", () => {
  it("Java nombra el constructor IGUAL que la clase (Goblin()), nunca 'initialize'/'constructor': reconocido vía sets.constructorNodes, no por nombre", async () => {
    const source = `
class Enemy {
  int health;
  int damage;
}
class Goblin extends Enemy {
  Goblin() {
    this.health = 20;
    this.damage = 5;
  }
}
class Orc extends Enemy {
  Orc() {
    this.health = 60;
    this.damage = 15;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-java.wasm", JAVA_PROBE, source, "java", "Enemy.java");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("Enemy.java"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.missingCapabilities).toEqual([]);
    expect(result!.state).toBe("ausente");
    expect(result!.confidence).not.toBeNull();
  });
});

describe("prototype hypothesis — Go: no aplicable con razón, no un cero disfrazado", () => {
  it("sin classNodes/herencia, no hay candidato: build() devuelve null", async () => {
    const source = `
package main

type Enemy struct {
  Health int
  Damage int
}

type Goblin struct {
  Health int
  Damage int
}
`;
    const file = await fileUnitForSource("tree-sitter-go.wasm", GO_PROBE, source, "go", "enemy.go");
    const ctx = ctxWithFiles([file], []); // Go no declara unidad-tipo-clase/herencia
    const result = hypothesis.build(fakeAnchorFinding("enemy.go"), null, ctx);
    expect(result).toBeNull();
  });
});

describe("prototype hypothesis — capacidad faltante: no-aplicable, nunca un cero disfrazado", () => {
  // Ola 10 (relanzamiento): `needs` perdió "herencia" (ver docstring de
  // `prototype.ts` — la forma COMPLETA/PARCIAL(b) de una clase aislada no la
  // necesita, y TS/JS/Vue/Ruby/Python ya la derivan hoy). El único gate que
  // le queda a esta hipótesis es "unidad-tipo-clase" — se ejercita omitiendo
  // ESA, no "herencia".
  it("sin 'unidad-tipo-clase' en las capacidades (aunque haya candidato real): missingCapabilities no vacío, confidence null", async () => {
    const source = `
class Enemy {}
class Goblin extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
}
class Orc extends Enemy {
  constructor() {
    super();
    this.health = 60;
    this.damage = 15;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "enemy.ts");
    const ctx = ctxWithFiles([file], []); // falta "unidad-tipo-clase" a propósito
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.missingCapabilities).toEqual(["unidad-tipo-clase"]);
    expect(result!.confidence).toBeNull();
  });
});

describe("prototype hypothesis — familia de 1 vía AST (camino 1b, self-cloning-solo)", () => {
  it("clase AISLADA (sin superclase) con auto-constructor: ya-aplicado, no silencio (el gap que abre esta ola)", async () => {
    const source = `
class Shape {
  constructor(color, x, y) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone() {
    return new Shape(this.color, this.x, this.y);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "shape.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("shape.ts"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    expect(result!.confidence).toBeNull();
    const applied = result!.checks.find((c) => c.role === "applied" && c.label.startsWith("self-constructing-member"));
    expect(applied?.passed).toBe(true);
    expect(applied?.why).toContain("Shape#clone");
  });

  it("clase AISLADA sin auto-constructor: sin candidato, build() devuelve null (no inventa un 'ausente' de la nada)", async () => {
    const source = `
class Config {
  constructor(color, x, y) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "config.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("config.ts"), null, ctx);
    expect(result).toBeNull();
  });
});

/**
 * OLA AB, FRENTE AB3 — el gate de ubicación del camino 1b. Regresión directa
 * del defecto que el informe de la ola verifica ABRIENDO ARCHIVOS REALES
 * (`ola-ab/informes/AB3.md`): `guava/ImmutableSet.java` — un `duplication`
 * de 37 líneas en un algoritmo de detección de "hash flooding" (línea 836)
 * reportaba `ya-aplicado` señalando `JdkBackedSetBuilderImpl#copy` (línea
 * 887-931), una clase interna sin relación alguna con el fragmento
 * duplicado. Estas dos fixtures reproducen esa forma en miniatura: DOS
 * clases auto-constructoras en el mismo archivo, una relacionada con el
 * hallazgo (sus líneas caen dentro de lo que el ancla señaló) y otra que
 * no — antes de este arreglo, el camino 1b devolvía la PRIMERA por orden
 * alfabético, sin mirar cuál.
 */
describe("prototype hypothesis — OLA AB, FRENTE AB3 — el gate de ubicación (camino 1b, self-cloning-solo)", () => {
  const source = `
class Helper {
  constructor(x) {
    this.x = x;
  }
  clone() {
    return new Helper(this.x);
  }
}
class Widget {
  constructor(x) {
    this.x = x;
  }
  clone() {
    return new Widget(this.x);
  }
}
`;
  // Helper#clone: líneas 6-8. Widget#clone: líneas 14-16 (contadas 1-based, con el `\n` inicial como línea 1).

  it("el ancla señala las líneas de Widget (NO las de Helper, que es alfabéticamente primera): ya-aplicado sobre Widget, nunca sobre Helper", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "two-classes.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const anchor = fakeAnchorFinding("two-classes.ts", [{ startLine: 13, endLine: 17, role: "copia señalada" }]);
    const result = hypothesis.build(anchor, null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    const applied = result!.checks.find((c) => c.role === "applied" && c.label.startsWith("self-constructing-member"));
    expect(applied?.why).toContain("Widget#clone");
    expect(applied?.why).not.toContain("Helper#clone");
  });

  it("el ancla señala líneas que NO tocan a NINGUNA de las dos clases (el caso real de guava/ImmutableSet.java: la duplicación real está en otra parte del archivo): build() devuelve null, nunca 'ya-aplicado' sobre una clase sin relación", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "two-classes.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    // Rango bien lejos de las dos clases (que terminan en la línea 17) — simula un fragmento duplicado que vive en otra función del mismo archivo, sin relación con ninguna clase auto-constructora.
    const anchor = fakeAnchorFinding("two-classes.ts", [{ startLine: 500, endLine: 510, role: "copia señalada" }]);
    const result = hypothesis.build(anchor, null, ctx);

    expect(result).toBeNull();
  });

  it("el ancla señala las líneas de Helper (la primera alfabéticamente): ya-aplicado sobre Helper — confirma que el gate no rompió el caso donde SÍ corresponde la primera", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "two-classes.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const anchor = fakeAnchorFinding("two-classes.ts", [{ startLine: 5, endLine: 9, role: "copia señalada" }]);
    const result = hypothesis.build(anchor, null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    const applied = result!.checks.find((c) => c.role === "applied" && c.label.startsWith("self-constructing-member"));
    expect(applied?.why).toContain("Helper#clone");
  });
});

describe("prototype hypothesis — regresión del bug encontrado juzgando la muestra del re-anclado a duplication (Ola X)", () => {
  /**
   * OLA X, FRENTE B5 — regresión del bug encontrado juzgando la muestra
   * nueva del re-anclado a `duplication` (ver el docstring de
   * `constructsOwnType`/`stripStringLiterals` en `prototype.ts`): un
   * `__repr__` que devuelve `"ClassName(...)"` como formato de string NO es
   * auto-construcción — verificado real en
   * `sqlalchemy/lib/sqlalchemy/engine/base.py:3137`
   * (`return "Engine(%r)" % (self.url,)`), reproducido acá con una fixture
   * mínima. Antes del arreglo, esto daba `ya-aplicado` (confirmado sólo por
   * TEXTO, el grafo no tiene esa arista) sobre una clase que no clona nada.
   */
  it("__repr__ que devuelve un STRING con el nombre de la clase (\"ClassName(...)\"): NO es self-construction, build() devuelve null", async () => {
    const source = `
class Engine {
  constructor(url) {
    this.url = url;
  }
  repr() {
    return "Engine(" + this.url + ")";
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "engine.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("engine.ts"), null, ctx);
    expect(result).toBeNull();
  });

  /**
   * OLA X, FRENTE B5 — mismo bug, forma Python: un DOCSTRING con un ejemplo
   * de uso (`ClassName(5)`) matcheaba la regex de auto-construcción — real
   * en `sqlalchemy/lib/sqlalchemy/sql/sqltypes.py:751-776`
   * (`Float.__init__`, docstring con `Float(5).with_variant(...)`).
   */
  it("docstring de Python con un ejemplo de uso (\"ClassName(5)\") en un miembro DISTINTO del constructor: NO es self-construction, build() devuelve null", async () => {
    const source = `
class Widget:
    def __init__(self, size):
        self.size = size
    def render(self):
        """Render this widget.

        Example::

            Widget(5).render()
        """
        return self.size
`;
    const file = await fileUnitForSource("tree-sitter-python.wasm", PYTHON_PROBE, source, "python", "widget.py");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("widget.py"), null, ctx);
    expect(result).toBeNull();
  });
});

/**
 * OLA Z, FRENTE Z6 — el segundo medio del mismo bug (`stripComments`, ver el
 * docstring de esa función en `prototype.ts`): `stripStringLiterals` ya
 * sacaba strings pero no comentarios, límite declarado desde la Ola X y
 * medido a escala por Y4 (Ola Y): 7 de 88 `ya-aplicado` juzgados a mano eran
 * exactamente esto. El caso canónico se reproduce acá byte por byte
 * (`guava/.../ImmutableSet.java:508`, `Builder#combine()`): un comentario
 * de bloque menciona "ImmutableSortedSet.Builder (or vice versa)" — el
 * espacio entre `Builder` y `(` alcanza para matchear la llamada desnuda
 * `\bBuilder\s*\(` de `constructsOwnType` sin que `combine()` construya
 * nada.
 */
describe("prototype hypothesis — comentarios (el segundo medio del bug de stripStringLiterals)", () => {
  it("comentario de BLOQUE que menciona \"ClassName (\" con un espacio (el caso real de guava/ImmutableSet.Builder#combine): NO es self-construction, build() devuelve null", async () => {
    const source = `
class Builder {
  Builder(int impl) {
    this.impl = impl;
  }
  Builder combine(Builder other) {
    /*
     * For discussion, see the comment on the field.
     *
     * (And I don't believe there's any situation in which we call x.combine(y) when x is a plain
     * ImmutableSet.Builder but y is an ImmutableSortedSet.Builder (or vice versa). Certainly
     * ImmutableSortedSet.Builder.combine() is written as if its argument will never be a plain
     * ImmutableSet.Builder: It casts immediately to ImmutableSortedSet.Builder.)
     */
    this.impl = merge(this.impl, other.impl);
    return this;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-java.wasm", JAVA_PROBE, source, "java", "Builder.java");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("Builder.java"), null, ctx);
    expect(result).toBeNull();
  });

  it("comentario de LÍNEA (//) que menciona \"ClassName(\": NO es self-construction, build() devuelve null (java)", async () => {
    const source = `
class Widget {
  Widget(int size) {
    this.size = size;
  }
  int render() {
    // see Widget(5) for an example of how this used to be constructed
    return this.size;
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-java.wasm", JAVA_PROBE, source, "java", "Widget.java");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("Widget.java"), null, ctx);
    expect(result).toBeNull();
  });

  it("comentario de LÍNEA (#) que menciona \"ClassName(\": NO es self-construction, build() devuelve null (ruby)", async () => {
    const source = `
class Widget
  def initialize(size)
    @size = size
  end
  def render
    # see Widget(5) for an example
    @size
  end
end
`;
    const file = await fileUnitForSource("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby", "widget.rb");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("widget.rb"), null, ctx);
    expect(result).toBeNull();
  });

  /**
   * LA CONTRAPARTE del arreglo, y por qué el marcador de línea se traduce
   * POR LENGUAJE en vez de aplicarse a ciegas: Python usa `//` como
   * OPERADOR de división entera real, no como comentario. Si `stripComments`
   * tratara `//` como comentario en Python (igual que en la familia
   * C-like), esta llamada de auto-construcción REAL —
   * `Widget(self.size // 2)`, con la división entera ANTES del cierre del
   * paréntesis — igual se detecta hoy porque `constructsOwnType` sólo
   * necesita ver la apertura `Widget(`, pero el propósito de este caso es
   * documentar la elección de diseño con una fixture ejecutable: gatear por
   * lenguaje (`LINE_COMMENT_MARKER`) es lo que garantiza que ningún futuro
   * cambio de la regex empiece a cortar en el `//` de una división real de
   * Python y pierda lo que viene después en la misma línea.
   */
  it("Python: '//' es división entera real, NO comentario — self-construction sigue detectándose", async () => {
    const source = `
class Widget:
    def __init__(self, size):
        self.size = size
    def clone(self):
        return Widget(self.size // 2)
`;
    const file = await fileUnitForSource("tree-sitter-python.wasm", PYTHON_PROBE, source, "python", "widget_clone.py");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("widget_clone.py"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });
});

describe("prototype hypothesis — PARCIAL variante (b): protocolo de hecho, no formalizado", () => {
  it("todos los hermanos se auto-construyen pero con nombre/aridad DISTINTOS: parcial, no ya-aplicado", async () => {
    const source = `
class Enemy {}
class Goblin extends Enemy {
  constructor() {
    super();
    this.health = 20;
    this.damage = 5;
  }
  clone() {
    return new Goblin();
  }
}
class Orc extends Enemy {
  constructor() {
    super();
    this.health = 60;
    this.damage = 15;
  }
  duplicate(count) {
    return new Orc();
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "enemy.ts");
    const ctx = ctxWithFiles([file], FULL_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("enemy.ts"), null, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("parcial");
    expect(result!.confidence).not.toBeNull(); // parcial SIGUE compitiendo en el ranking
    const applied = result!.checks.find((c) => c.role === "applied" && c.label.startsWith("self-constructing-member"));
    expect(applied?.why).toContain("nombres/aridades distintos");
  });
});

describe("prototype hypothesis — camino (2), grafo puro (sin árbol vivo, el único real en producción)", () => {
  it("ctx.fileAt vacío + grafo con instantiates real: ya-aplicado igual (self-constructing-member confirmado por grafo, no por texto)", () => {
    const file = "shape.ts";
    const shape = sym(file, ["Shape"]);
    const clone = method(file, "Shape", "clone", 0, { startLine: 5, endLine: 7 });

    const graph: CodeGraph = {
      nodes: [shape, clone],
      edges: [...containsAll(shape.id, [clone.id]), edge(clone.id, shape.id, "instantiates")],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxWithFiles([], SOLO_CAPS); // SIN árbol vivo — mismo estado que producción para esta ancla
    const result = hypothesis.build(fakeAnchorFinding(file), graph, ctx);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    expect(result!.confidence).toBeNull();
    const applied = result!.checks.find((c) => c.role === "applied" && c.label.startsWith("self-constructing-member"));
    expect(applied?.why).toContain("confirmado por instantiates del grafo");
  });

  it("un cliente EXTERNO llama a `calls` hacia el miembro auto-constructor: evidencia 'client-uses-clone-protocol' pasa (nunca gate)", () => {
    const file = "shape.ts";
    const shape = sym(file, ["Shape"]);
    const clone = method(file, "Shape", "clone", 0);
    const client = method("client.ts", "Client", "make", 1);

    const graph: CodeGraph = {
      nodes: [shape, clone, client],
      edges: [...containsAll(shape.id, [clone.id]), edge(clone.id, shape.id, "instantiates"), edge(client.id, clone.id, "calls")],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxWithFiles([], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding(file), graph, ctx);

    expect(result).not.toBeNull();
    const consumption = result!.checks.find((c) => c.role === "applied" && c.label.startsWith("client-uses-clone-protocol"));
    expect(consumption?.passed).toBe(true);
  });

  it("P implementa I, e I ya declara el mismo (name, arity): discriminador 'clone-protocol-declared' confirmado (reemplaza el chequeo léxico CLONE_PROTOCOL_NAMES)", () => {
    const file = "shape.ts";
    const iface = sym(file, ["Cloneable"], { family: "namespace-like" });
    const ifaceMember = method(file, "Cloneable", "clone", 0);
    const shape = sym(file, ["Shape"]);
    const clone = method(file, "Shape", "clone", 0);

    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, shape, clone],
      edges: [
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(shape.id, [clone.id]),
        edge(clone.id, shape.id, "instantiates"),
        edge(shape.id, iface.id, "implements"),
      ],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxWithFiles([], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding(file), graph, ctx);

    expect(result).not.toBeNull();
    const discriminator = result!.discriminators.find((d) => d.label.startsWith("El/los hermano(s) auto-constructores implementan"));
    expect(discriminator?.passed).toBe(true);
  });

  it("sin ninguna arista instantiates hacia sí mismo: no hay candidato, build() devuelve null", () => {
    const file = "config.ts";
    const config = sym(file, ["Config"]);
    const getColor = method(file, "Config", "getColor", 0);

    const graph: CodeGraph = {
      nodes: [config, getColor],
      edges: [...containsAll(config.id, [getColor.id])],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxWithFiles([], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding(file), graph, ctx);
    expect(result).toBeNull();
  });

  it("aridad > 1 (grafo): NO cuenta como auto-constructor COMPLETA (el encargo exige aridad 0 o 1)", () => {
    const file = "shape.ts";
    const shape = sym(file, ["Shape"]);
    // aridad 3 — por encima del límite que pide el encargo para la forma COMPLETA.
    const build3 = method(file, "Shape", "build3", 3);

    const graph: CodeGraph = {
      nodes: [shape, build3],
      edges: [...containsAll(shape.id, [build3.id]), edge(build3.id, shape.id, "instantiates")],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxWithFiles([], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding(file), graph, ctx);
    expect(result).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola 11a — P4: `ctx.neighborhood` real (`countOfKind`/`ego`), consumido por
 * los dos discriminadores nuevos (`duplication-es-habito-del-repo` —
 * re-anclado Ola X/B5, antes `speculative-abstraction-es-habito-del-repo` —
 * / `construido-en-muchos-sitios`). Mismo grafo puro que el describe de
 * arriba, pero con un `Neighborhood` REAL (`buildNeighborhoodIndex` +
 * `neighborhoodFor`, no `EMPTY_NEIGHBORHOOD`) — sin esto no hay forma de
 * demostrar que el vecindario de verdad mueve la escalera de confianza.
 * ──────────────────────────────────────────────────────────────────────── */
describe("prototype hypothesis — Ola 11a, ctx.neighborhood real (countOfKind/ego)", () => {
  it("countOfKind('duplication'): otro hallazgo del mismo kind en el repo ⇒ discriminador 'habito del repo' confirmado (con EMPTY_NEIGHBORHOOD, este mismo grafo lo deja SIN confirmar)", () => {
    const file = "shape.ts";
    const shape = sym(file, ["Shape"]);
    const clone = method(file, "Shape", "clone", 0);
    const graph: CodeGraph = {
      nodes: [shape, clone],
      edges: [...containsAll(shape.id, [clone.id]), edge(clone.id, shape.id, "instantiates")],
      resolution: EMPTY_RESOLUTION,
    };

    const anchorFinding = fakeAnchorFinding(file);
    // Un SEGUNDO hallazgo `duplication`, en otro archivo — lo que vuelve esto
    // un "hábito del repo" en vez de un caso puntual.
    const otherFinding = fakeAnchorFinding("other.ts");
    const otherFindingWithId: Finding = { ...otherFinding, id: "f-dup-other" };

    // Control: SIN vecindario (EMPTY_NEIGHBORHOOD), el discriminador no puede confirmarse.
    const resultEmpty = hypothesis.build(anchorFinding, graph, ctxWithFiles([], SOLO_CAPS));
    expect(resultEmpty!.discriminators.find((d) => d.label.includes("NO es un caso aislado"))?.passed).toBe(false);

    const index = buildNeighborhoodIndex(graph, [anchorFinding, otherFindingWithId], null);
    const neighborhood = neighborhoodFor(index, anchorFinding);
    expect(neighborhood.countOfKind("duplication")).toBe(1); // el propio `anchorFinding` se excluye — sólo cuenta `otherFindingWithId`.

    const result = hypothesis.build(anchorFinding, graph, ctxWithFiles([], SOLO_CAPS, neighborhood));
    expect(result).not.toBeNull();
    const habitCheck = result!.discriminators.find((d) => d.label.includes("NO es un caso aislado"));
    expect(habitCheck?.passed).toBe(true);
    expect(habitCheck?.why).toContain("HÁBITO");
  });

  it("ego(ancla,1)/instantiates fan-in: 2 sitios distintos construyen Shape ⇒ discriminador 'construido en muchos sitios' confirmado; con sólo el propio clone (fan-in=1), NO se confirma", () => {
    const file = "shape.ts";
    const shape = sym(file, ["Shape"]);
    const clone = method(file, "Shape", "clone", 0);
    // Un SEGUNDO sitio que construye `Shape` directamente, por fuera del propio método `clone`.
    const otherSite = method("factory.ts", "ShapeFactory", "make", 0);
    const graphManySites: CodeGraph = {
      nodes: [shape, clone, otherSite],
      edges: [...containsAll(shape.id, [clone.id]), edge(clone.id, shape.id, "instantiates"), edge(otherSite.id, shape.id, "instantiates")],
      resolution: EMPTY_RESOLUTION,
    };
    const graphSoloSite: CodeGraph = {
      nodes: [shape, clone],
      edges: [...containsAll(shape.id, [clone.id]), edge(clone.id, shape.id, "instantiates")],
      resolution: EMPTY_RESOLUTION,
    };

    const anchorFinding = fakeAnchorFinding(file);

    const manyIndex = buildNeighborhoodIndex(graphManySites, [anchorFinding], null);
    const manyNeighborhood = neighborhoodFor(manyIndex, anchorFinding);
    const ego = manyNeighborhood.ego({ file, symbolPath: ["Shape"] }, 1);
    expect(ego?.nodes.some((n) => n.node.id === otherSite.id)).toBe(true); // confirma que el vecindario de verdad expone el segundo sitio antes de usarlo como evidencia.

    const resultMany = hypothesis.build(anchorFinding, graphManySites, ctxWithFiles([], SOLO_CAPS, manyNeighborhood));
    expect(resultMany).not.toBeNull();
    const manySitesCheck = resultMany!.discriminators.find((d) => d.label.startsWith("`ctx.neighborhood.ego"));
    expect(manySitesCheck?.passed).toBe(true);
    expect(manySitesCheck?.why).toContain("2 sitio(s)");

    const soloIndex = buildNeighborhoodIndex(graphSoloSite, [anchorFinding], null);
    const soloNeighborhood = neighborhoodFor(soloIndex, anchorFinding);
    const resultSolo = hypothesis.build(anchorFinding, graphSoloSite, ctxWithFiles([], SOLO_CAPS, soloNeighborhood));
    expect(resultSolo).not.toBeNull();
    const soloCheck = resultSolo!.discriminators.find((d) => d.label.startsWith("`ctx.neighborhood.ego"));
    expect(soloCheck?.passed).toBe(false);
    expect(soloCheck?.why).toContain("Sólo 1 sitio(s)");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Requisito 4 del encargo — verificación contra las fixtures CANÓNICAS
 * (`tests/fixtures/patterns/prototype/*`, idénticas — verificado con
 * `diff -rq` — al corpus de referencia de la tarea). Fuente embebida
 * literalmente (portabilidad: no depende de una ruta fuera del repo).
 * `ya-aplicado`, NUNCA sugerencia ni silencio, en los 5 lenguajes.
 * ──────────────────────────────────────────────────────────────────────── */
describe("prototype hypothesis — fixtures CANÓNICAS de tests/fixtures/patterns/prototype/ (requisito 4)", () => {
  it("TypeScript: ya-aplicado, nunca silencio", async () => {
    const source = `
class Shape {
  color: string;
  x: number;
  y: number;
  constructor(color: string, x: number, y: number) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone(): Shape {
    return new Shape(this.color, this.x, this.y);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "prototype/typescript.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("prototype/typescript.ts"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });

  it("JavaScript: ya-aplicado, nunca silencio", async () => {
    const source = `
class Shape {
  constructor(color, x, y) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone() {
    return new Shape(this.color, this.x, this.y);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-javascript.wasm", JS_PROBE, source, "javascript", "prototype/javascript.js");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("prototype/javascript.js"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });

  it("Python: ya-aplicado, nunca silencio (llamada DESNUDA `Shape(...)`, sin `new` — la forma que la regex vieja no cubría)", async () => {
    const source = `
class Shape:
    def __init__(self, color, x, y):
        self.color = color
        self.x = x
        self.y = y
    def clone(self):
        return Shape(self.color, self.x, self.y)
`;
    const file = await fileUnitForSource("tree-sitter-python.wasm", PYTHON_PROBE, source, "python", "prototype/python.py");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("prototype/python.py"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });

  it("Ruby: ya-aplicado, nunca silencio", async () => {
    const source = `
class Shape
  def initialize(color, x, y)
    @color = color
    @x = x
    @y = y
  end
  def clone
    Shape.new(@color, @x, @y)
  end
end
`;
    const file = await fileUnitForSource("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby", "prototype/ruby.rb");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("prototype/ruby.rb"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });

  it("Vue (script extraído, parseado como TypeScript — mismo pipeline que code-analyzer.ts#extractVueScript): ya-aplicado, nunca silencio", async () => {
    const source = `
class Shape {
  constructor(color, x, y) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
  clone() {
    return new Shape(this.color, this.x, this.y);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "vue", "prototype/vue.vue");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("prototype/vue.vue"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE12 — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA
 * (`repeated-configured-assembly`), que es el ÚNICO de este patrón capaz de
 * decir `ausente`. Todos los tests de arriba siguen ejercitando el camino
 * viejo (`duplication`) sin un cambio: eso es la mitad de la prueba de que
 * la ola fue aditiva.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Sonda propia del camino nuevo: la de arriba (`TS_PROBE`) no tiene NINGUNA
 * función de nivel superior, así que sus `DerivedNodeSets` no incluyen
 * `function_declaration` y los tres puntos de la fixture viajarían como
 * declaraciones de nivel de archivo, sin `symbolPath` con el que consultar el
 * grafo. La sonda REAL de producción (`code-analyzer.ts#JS_FAMILY_PROBE`) sí
 * trae `function standalone(a, b)`, así que ésta la imita en lo que este
 * camino necesita — no se toca `TS_PROBE`, que es de los ~30 tests del camino
 * viejo.
 */
const AE12_TS_PROBE = `
class Probe {
  field: number;
  constructor(x: number) {
    this.field = x;
  }
  method(y: number): number {
    return y;
  }
}
function standalone(a: number): number {
  return a;
}
`;

const AE12_SOURCE = `
function forA(): Options {
  return new Options(3, 1000, false, "alfa");
}
function forB(): Options {
  return new Options(3, 1000, false, "beta");
}
function forC(): Options {
  return new Options(3, 1000, false, "gamma");
}
`;

/** El `Finding` que emite el detector nuevo — con los rangos reales de los tres sitios. */
function fakeAssemblyFinding(file: string): Finding {
  return {
    id: "f-rca",
    detectorId: "repeated-configured-assembly",
    kind: "repeated-configured-assembly",
    scope: "intra-file",
    language: "typescript",
    title: '3 puntos rearman "Options" con el mismo estado inicial',
    detail: "d",
    trigger: [{ label: "puntos", value: 3, threshold: fakeThreshold() }],
    locations: [
      { file, startLine: 3, endLine: 3, role: "punto que arma" },
      { file, startLine: 6, endLine: 6, role: "punto que rearma" },
      { file, startLine: 9, endLine: 9, role: "punto que rearma" },
    ],
    severity: 45,
    advice: { primary: { name: "Extract Variable", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

function ae12Graph(extraNodes: CodeGraphNode[] = [], extraEdges: CodeGraphEdge[] = []): CodeGraph {
  return {
    nodes: [sym("otro.ts", ["Options"]), ...extraNodes],
    edges: extraEdges,
    resolution: EMPTY_RESOLUTION as never,
  };
}

describe("OLA AE/AE12 — el camino nuevo produce `ausente`, que es lo que el patrón NO podía producir", () => {
  it("tres puntos rearman el mismo objeto y no hay ninguna puerta ⇒ hipótesis `ausente` (RECOMENDACIÓN)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []); // SIN capacidades: el camino nuevo no declara `needs`
    const result = hypothesis.build(fakeAssemblyFinding("a.ts"), ae12Graph(), ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(result!.pattern).toBe("Prototype");
    expect(result!.places).toHaveLength(3);
  });

  it("MEDIA puerta (un punto ya llega a un símbolo que arma el tipo) ⇒ `parcial`, no `ausente`", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const graph = ae12Graph(
      [sym("otro.ts", ["makeOptions"], { family: "function-like" }), sym("a.ts", ["forA"], { family: "function-like" })],
      [
        edge(symbolNodeId("otro.ts", ["makeOptions"]), symbolNodeId("otro.ts", ["Options"]), "instantiates"),
        edge(symbolNodeId("a.ts", ["forA"]), symbolNodeId("otro.ts", ["makeOptions"]), "calls"),
      ],
    );
    const result = hypothesis.build(fakeAssemblyFinding("a.ts"), graph, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("parcial");
  });

  it("sin árbol vivo, el camino nuevo devuelve null — nunca una hipótesis armada sobre lo que no pudo mirar", () => {
    const ctx = ctxWithFiles([], []);
    expect(hypothesis.build(fakeAssemblyFinding("a.ts"), ae12Graph(), ctx)).toBeNull();
  });

  it("el ancla señala líneas que no se solapan con NINGÚN grupo de armado ⇒ null (el gate de ubicación de la Ola AB, aplicado al camino nuevo)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const anchor = { ...fakeAssemblyFinding("a.ts"), locations: [{ file: "a.ts", startLine: 900, endLine: 901, role: "otra cosa" }] as Finding["locations"] };
    expect(hypothesis.build(anchor, ae12Graph(), ctx)).toBeNull();
  });

  it("los tres `required` del camino nuevo están, y el estado los acompaña con sus dos checks `applied`", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const result = hypothesis.build(fakeAssemblyFinding("a.ts"), ae12Graph(), ctx)!;
    const labels = result.checks.map((c) => c.label).join(" | ");
    expect(labels).toContain("PUNTOS distintos");
    expect(labels).toContain("estado inicial común");
    expect(labels).toContain("MINORÍA");
    expect(labels).toContain("puerta-de-armado-compartida");
    // Los tres `required` pasan (si no, no habría hipótesis). El check
    // `applied` de la puerta NO pasa, y eso es exactamente lo que significa
    // `ausente`: no hay ni media puerta.
    expect(result.checks.filter((c) => c.role === "required").every((c) => c.passed)).toBe(true);
    expect(result.checks.filter((c) => c.role === "required")).toHaveLength(3);
    expect(result.checks.find((c) => c.label.includes("puerta-de-armado-compartida"))!.passed).toBe(false);
  });

  it("EL CAMINO VIEJO SIGUE INTACTO: la misma hipótesis, con un ancla `duplication`, da `ya-aplicado` como siempre", async () => {
    const source = `
class Shape {
  constructor(color) {
    this.color = color;
  }
  clone() {
    return new Shape(this.color);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "shape.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("shape.ts"), null, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });
});


/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — el camino de ARMADO entrando por el ancla `duplication`.
 * Un test por INTENCIÓN. Ningún test viejo se toca.
 * ══════════════════════════════════════════════════════════════════════════ */

/** El MISMO cuerpo de AE12, pero anclado por un `duplication` (que es lo que emite el detector inter-file sobre fragmentos repetidos). */
function anclaDuplicationSobreLosTresSitios(file: string): Finding {
  return fakeAnchorFinding(file, [
    { startLine: 2, endLine: 4, role: "copia 1" },
    { startLine: 5, endLine: 7, role: "copia 2" },
    { startLine: 8, endLine: 10, role: "copia 3" },
  ]);
}

/** Vecindario REAL con un hallazgo `repeated-configured-assembly` sobre las MISMAS líneas — el insumo de la compuerta de doble conteo. */
function vecindarioConAnclaFuerza(anchor: Finding, rca: Finding): HypothesisContext["neighborhood"] {
  return neighborhoodFor(buildNeighborhoodIndex(null, [anchor, rca], null), anchor);
}

describe("OLA AI/AI7 — Prototype: el camino de armado sobre el ancla `duplication`", () => {
  it("INTENCIÓN 'el mismo objeto configurado se rearma entero en varios puntos': tres puntos + tipo real en el grafo ⇒ `ausente` (RECOMENDACIÓN, no `ya-aplicado`)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const result = hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), ae12Graph(), ctx);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe("Prototype");
    expect(result!.state).toBe("ausente");
    expect(result!.places).toHaveLength(3);
    // Los `required` son EXACTAMENTE los tres de AE12, sin uno de más.
    expect(result!.checks.filter((c) => c.role === "required")).toHaveLength(3);
  });

  it("INTENCIÓN 'lo que se arma tiene que ser un TIPO de este repo': sin nodo `class-like` con ese nombre ⇒ null (no se recomienda copiar lo que no es un objeto)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const sinTipo: CodeGraph = { nodes: [], edges: [], resolution: EMPTY_RESOLUTION as never };
    expect(hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), sinTipo, ctx)).toBeNull();
  });

  it("INTENCIÓN 'sin grafo no hay RESOLUCIÓN que verificar': `graph` null ⇒ null, la MISMA decisión que toma el detector-ancla", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    expect(hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), null, ctx)).toBeNull();
  });

  it("R1 — INTENCIÓN 'el protocolo de copia YA existe': la clase declara un miembro que la construye ⇒ null (el remedio sería 'usá el que ya hay', otra refactorización)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const clase = sym("otro.ts", ["Options"]);
    const miembro = method("otro.ts", "Options", "clone", 0);
    const graph = ae12Graph(
      [miembro],
      [edge(clase.id, miembro.id, "contains"), edge(miembro.id, clase.id, "instantiates")],
    );
    expect(hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), graph, ctx)).toBeNull();
  });

  it("R2 — INTENCIÓN 'ya hay una puerta compartida': DOS de los puntos ya llegan por `calls` a un símbolo que arma el tipo ⇒ null (lo que se repite es la llamada, no la construcción)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const graph = ae12Graph(
      [
        sym("otro.ts", ["makeOptions"], { family: "function-like" }),
        sym("a.ts", ["forA"], { family: "function-like" }),
        sym("a.ts", ["forB"], { family: "function-like" }),
      ],
      [
        edge(symbolNodeId("otro.ts", ["makeOptions"]), symbolNodeId("otro.ts", ["Options"]), "instantiates"),
        edge(symbolNodeId("a.ts", ["forA"]), symbolNodeId("otro.ts", ["makeOptions"]), "calls"),
        edge(symbolNodeId("a.ts", ["forB"]), symbolNodeId("otro.ts", ["makeOptions"]), "calls"),
      ],
    );
    expect(hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), graph, ctx)).toBeNull();
  });

  it("R2 con MEDIA puerta (un solo punto llega) ⇒ NO se calla: `parcial`, el peldaño que la escalera de AE12 ya tenía", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const graph = ae12Graph(
      [sym("otro.ts", ["makeOptions"], { family: "function-like" }), sym("a.ts", ["forA"], { family: "function-like" })],
      [
        edge(symbolNodeId("otro.ts", ["makeOptions"]), symbolNodeId("otro.ts", ["Options"]), "instantiates"),
        edge(symbolNodeId("a.ts", ["forA"]), symbolNodeId("otro.ts", ["makeOptions"]), "calls"),
      ],
    );
    const result = hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), graph, ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("parcial");
  });

  it("R3 — INTENCIÓN 'el sitio vive DENTRO del propio tipo': ese sitio ES el prototipo ⇒ null", async () => {
    const dentro = `
class Options {
  static forA(): Options {
    return new Options(3, 1000, false, "alfa");
  }
  static forB(): Options {
    return new Options(3, 1000, false, "beta");
  }
  static forC(): Options {
    return new Options(3, 1000, false, "gamma");
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, dentro, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const anchor = fakeAnchorFinding("a.ts", [
      { startLine: 3, endLine: 5, role: "copia 1" },
      { startLine: 6, endLine: 8, role: "copia 2" },
      { startLine: 9, endLine: 11, role: "copia 3" },
    ]);
    expect(hypothesis.build(anchor, ae12Graph(), ctx)).toBeNull();
  });

  it("DOBLE CONTEO — INTENCIÓN '¿es cobertura NUEVA?': si el ancla-fuerza YA nombra este mismo armado, el camino se calla (repetir el remedio colgado de otro id infla el conteo, no lo cubre)", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const anchor = anclaDuplicationSobreLosTresSitios("a.ts");
    const ctx = ctxWithFiles([file], [], vecindarioConAnclaFuerza(anchor, fakeAssemblyFinding("a.ts")));
    expect(hypothesis.build(anchor, ae12Graph(), ctx)).toBeNull();
  });

  it("DOBLE CONTEO — el `repeated-configured-assembly` del vecindario está en OTRAS líneas: no es el mismo armado, y el camino SÍ emite", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const anchor = anclaDuplicationSobreLosTresSitios("a.ts");
    const lejos: Finding = {
      ...fakeAssemblyFinding("a.ts"),
      id: "f-rca-lejos",
      locations: [{ file: "a.ts", startLine: 900, endLine: 901, role: "otro armado" }] as Finding["locations"],
    };
    const ctx = ctxWithFiles([file], [], vecindarioConAnclaFuerza(anchor, lejos));
    expect(hypothesis.build(anchor, ae12Graph(), ctx)!.state).toBe("ausente");
  });

  it("EL GATE DE UBICACIÓN SIGUE VALIENDO: el ancla señala líneas que no solapan >=2 sitios de ningún grupo ⇒ null", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const anchor = fakeAnchorFinding("a.ts", [{ startLine: 2, endLine: 4, role: "una sola copia" }]);
    expect(hypothesis.build(anchor, ae12Graph(), ctx)).toBeNull();
  });

  it("ADITIVIDAD — el camino VIEJO de `duplication` gana: donde hoy dice `ya-aplicado`, sigue diciendo `ya-aplicado` (el camino nuevo sólo corre si el viejo no produjo nada)", async () => {
    const source = `
class Shape {
  constructor(color) {
    this.color = color;
  }
  clone() {
    return new Shape(this.color);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "shape.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    const result = hypothesis.build(fakeAnchorFinding("shape.ts"), ae12Graph(), ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
  });

  it("CRUZA LENGUAJES: la misma regla en Python (llamada DESNUDA `Options(...)`, sin `new`) ⇒ `ausente`", async () => {
    const py = `
def for_a():
    return Options(3, 1000, False, "alfa")
def for_b():
    return Options(3, 1000, False, "beta")
def for_c():
    return Options(3, 1000, False, "gamma")
`;
    const file = await fileUnitForSource("tree-sitter-python.wasm", PYTHON_PROBE, py, "python", "a.py");
    const ctx = ctxWithFiles([file], []);
    const anchor = fakeAnchorFinding("a.py", [
      { startLine: 2, endLine: 3, role: "copia 1" },
      { startLine: 4, endLine: 5, role: "copia 2" },
      { startLine: 6, endLine: 7, role: "copia 3" },
    ]);
    const result = hypothesis.build(anchor, ae12Graph(), ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AJ, FRENTE AJ3 — el camino por COPIAS DEL ANCLA (`armado-copiado`).
 * Un test por INTENCIÓN. Ningún test viejo se toca.
 * ══════════════════════════════════════════════════════════════════════════ */

/** El MISMO armado de AE12, pero REPARTIDO EN TRES ARCHIVOS — la forma que el
 *  ancla `duplication` (inter-file) tiene en el 52,6 % de bibliotecas y el
 *  59,0 % de aplicaciones, y la que el camino de AI7 no puede alcanzar porque
 *  pide >=2 sitios solapados DENTRO DE UN archivo. */
const AJ3_A = `
function forA(): Options {
  return new Options(3, 1000, false, "alfa");
}
`;
const AJ3_B = `
function forB(): Options {
  return new Options(3, 1000, false, "beta");
}
`;
const AJ3_C = `
function forC(): Options {
  return new Options(3, 1000, false, "gamma");
}
`;

/** Un `duplication` con UNA copia por archivo, en tres archivos distintos. */
function anclaDuplicationEnTresArchivos(): Finding {
  return {
    ...fakeAnchorFinding("a.ts"),
    id: "f-dup-multi",
    title: "3 fragmentos idénticos de 3 líneas",
    locations: [
      { file: "a.ts", startLine: 2, endLine: 4, role: "copia 1" },
      { file: "b.ts", startLine: 2, endLine: 4, role: "copia 2" },
      { file: "c.ts", startLine: 2, endLine: 4, role: "copia 3" },
    ] as Finding["locations"],
  };
}

async function tresArchivosAJ3(): Promise<FileUnit[]> {
  return [
    await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AJ3_A, "typescript", "a.ts"),
    await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AJ3_B, "typescript", "b.ts"),
    await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AJ3_C, "typescript", "c.ts"),
  ];
}

describe("OLA AJ/AJ3 — Prototype: el camino por COPIAS DEL ANCLA sobre `duplication`", () => {
  it("EL DEFECTO QUE ESTE FRENTE ARREGLA — INTENCIÓN 'las copias del ancla son los puntos': tres copias EN TRES ARCHIVOS DISTINTOS ⇒ `ausente` (el camino de AI7 no puede: pide >=2 sitios en UN archivo)", async () => {
    const ctx = ctxWithFiles(await tresArchivosAJ3(), []);
    const result = hypothesis.build(anclaDuplicationEnTresArchivos(), ae12Graph(), ctx);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe("Prototype");
    expect(result!.state).toBe("ausente");
    // Los tres puntos viven en TRES archivos: es la generalización, medida en el propio resultado.
    expect(new Set(result!.places.map((p) => p.file)).size).toBe(3);
    // Los `required` son EXACTAMENTE los tres de AE12, sin uno de más.
    expect(result!.checks.filter((c) => c.role === "required")).toHaveLength(3);
    expect(result!.checks.filter((c) => c.role === "required").every((c) => c.passed)).toBe(true);
  });

  it("INTENCIÓN 'el ancla ELIGE el grupo, no lo MIDE': el grupo tiene >=2 copias del ancla cubiertas ⇒ entra; con UNA sola copia cubierta ⇒ null (mismo piso y misma razón que `assemblyGroupFor`)", async () => {
    const ctx = ctxWithFiles(await tresArchivosAJ3(), []);
    const unaSola: Finding = {
      ...anclaDuplicationEnTresArchivos(),
      locations: [{ file: "a.ts", startLine: 2, endLine: 4, role: "una sola copia" }] as Finding["locations"],
    };
    expect(hypothesis.build(unaSola, ae12Graph(), ctx)).toBeNull();
  });

  it("INTENCIÓN 'lo que se arma tiene que ser un TIPO de este repo': sin nodo `class-like` con ese nombre ⇒ null", async () => {
    const ctx = ctxWithFiles(await tresArchivosAJ3(), []);
    const sinTipo: CodeGraph = { nodes: [], edges: [], resolution: EMPTY_RESOLUTION as never };
    expect(hypothesis.build(anclaDuplicationEnTresArchivos(), sinTipo, ctx)).toBeNull();
  });

  it("INTENCIÓN 'sin grafo no hay RESOLUCIÓN que verificar': `graph` null ⇒ null", async () => {
    const ctx = ctxWithFiles(await tresArchivosAJ3(), []);
    expect(hypothesis.build(anclaDuplicationEnTresArchivos(), null, ctx)).toBeNull();
  });

  it("R1 — INTENCIÓN 'el protocolo de copia YA existe': el tipo declara un miembro que lo construye ⇒ null (el remedio sería 'usá el que ya hay')", async () => {
    const ctx = ctxWithFiles(await tresArchivosAJ3(), []);
    const clase = sym("otro.ts", ["Options"]);
    const miembro = method("otro.ts", "Options", "copy", 0);
    const graph = ae12Graph([miembro], [edge(clase.id, miembro.id, "contains"), edge(miembro.id, clase.id, "instantiates")]);
    expect(hypothesis.build(anclaDuplicationEnTresArchivos(), graph, ctx)).toBeNull();
  });

  it("R2 — INTENCIÓN 'ya hay una puerta compartida': DOS puntos llegan por `calls` a un símbolo que arma el tipo ⇒ null; con MEDIA puerta (uno solo) ⇒ `parcial`", async () => {
    const files = await tresArchivosAJ3();
    const puerta = sym("otro.ts", ["makeOptions"], { family: "function-like" });
    const base = [edge(puerta.id, symbolNodeId("otro.ts", ["Options"]), "instantiates")];
    const dos = ae12Graph(
      [puerta, sym("a.ts", ["forA"], { family: "function-like" }), sym("b.ts", ["forB"], { family: "function-like" })],
      [...base, edge(symbolNodeId("a.ts", ["forA"]), puerta.id, "calls"), edge(symbolNodeId("b.ts", ["forB"]), puerta.id, "calls")],
    );
    expect(hypothesis.build(anclaDuplicationEnTresArchivos(), dos, ctxWithFiles(files, []))).toBeNull();

    const media = ae12Graph(
      [puerta, sym("a.ts", ["forA"], { family: "function-like" })],
      [...base, edge(symbolNodeId("a.ts", ["forA"]), puerta.id, "calls")],
    );
    expect(hypothesis.build(anclaDuplicationEnTresArchivos(), media, ctxWithFiles(files, []))!.state).toBe("parcial");
  });

  it("R3 — INTENCIÓN 'el sitio vive DENTRO del propio tipo': ese sitio ES el prototipo ⇒ null", async () => {
    const dentro = `
class Options {
  static forA(): Options {
    return new Options(3, 1000, false, "alfa");
  }
}
`;
    const files = [
      await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, dentro, "typescript", "a.ts"),
      await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AJ3_B, "typescript", "b.ts"),
      await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AJ3_C, "typescript", "c.ts"),
    ];
    const anchor: Finding = {
      ...anclaDuplicationEnTresArchivos(),
      locations: [
        { file: "a.ts", startLine: 3, endLine: 5, role: "copia 1" },
        { file: "b.ts", startLine: 2, endLine: 4, role: "copia 2" },
        { file: "c.ts", startLine: 2, endLine: 4, role: "copia 3" },
      ] as Finding["locations"],
    };
    expect(hypothesis.build(anchor, ae12Graph(), ctxWithFiles(files, []))).toBeNull();
  });

  it("DOBLE CONTEO — INTENCIÓN '¿es cobertura NUEVA?': si el ancla-fuerza ya nombra alguno de estos sitios, el camino se calla", async () => {
    const files = await tresArchivosAJ3();
    const anchor = anclaDuplicationEnTresArchivos();
    const rca: Finding = { ...fakeAssemblyFinding("b.ts"), locations: [{ file: "b.ts", startLine: 3, endLine: 3, role: "punto que arma" }] as Finding["locations"] };
    const ctx = ctxWithFiles(files, [], vecindarioConAnclaFuerza(anchor, rca));
    expect(hypothesis.build(anchor, ae12Graph(), ctx)).toBeNull();
  });

  it("ESCALA — INTENCIÓN 'el patrón tiene que PAGAR': con DOS copias en dos archivos hay 2 puntos, y `rearmado-en-varios-puntos` (>=3, AE12, sin tocar) lo rechaza", async () => {
    const files = (await tresArchivosAJ3()).slice(0, 2);
    const dos: Finding = {
      ...anclaDuplicationEnTresArchivos(),
      locations: [
        { file: "a.ts", startLine: 2, endLine: 4, role: "copia 1" },
        { file: "b.ts", startLine: 2, endLine: 4, role: "copia 2" },
      ] as Finding["locations"],
    };
    expect(hypothesis.build(dos, ae12Graph(), ctxWithFiles(files, []))).toBeNull();
  });

  it("ADITIVIDAD 1 — el camino VIEJO de `duplication` gana: donde hoy dice `ya-aplicado`, sigue diciendo `ya-aplicado`", async () => {
    const source = `
class Shape {
  constructor(color) {
    this.color = color;
  }
  clone() {
    return new Shape(this.color);
  }
}
`;
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript", "shape.ts");
    const ctx = ctxWithFiles([file], SOLO_CAPS);
    expect(hypothesis.build(fakeAnchorFinding("shape.ts"), ae12Graph(), ctx)!.state).toBe("ya-aplicado");
  });

  it("ADITIVIDAD 2 — el camino de AI7 gana sobre el mío: con las tres copias EN UN archivo sigue emitiendo, y una sola vez", async () => {
    const file = await fileUnitForSource("tree-sitter-typescript.wasm", AE12_TS_PROBE, AE12_SOURCE, "typescript", "a.ts");
    const ctx = ctxWithFiles([file], []);
    const result = hypothesis.build(anclaDuplicationSobreLosTresSitios("a.ts"), ae12Graph(), ctx);
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(result!.places).toHaveLength(3);
  });

  it("CRUZA LENGUAJES — la misma regla en Python (llamada DESNUDA `Options(...)`), con las copias en DOS archivos y tres puntos ⇒ `ausente`", async () => {
    const pa = `
def for_a():
    return Options(3, 1000, False, "alfa")
def for_b():
    return Options(3, 1000, False, "beta")
`;
    const pb = `
def for_c():
    return Options(3, 1000, False, "gamma")
`;
    const files = [
      await fileUnitForSource("tree-sitter-python.wasm", PYTHON_PROBE, pa, "python", "a.py"),
      await fileUnitForSource("tree-sitter-python.wasm", PYTHON_PROBE, pb, "python", "b.py"),
    ];
    const anchor: Finding = {
      ...anclaDuplicationEnTresArchivos(),
      locations: [
        { file: "a.py", startLine: 2, endLine: 3, role: "copia 1" },
        { file: "b.py", startLine: 2, endLine: 3, role: "copia 2" },
      ] as Finding["locations"],
    };
    const result = hypothesis.build(anchor, ae12Graph(), ctxWithFiles(files, []));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(new Set(result!.places.map((p) => p.file)).size).toBe(2);
  });
});
