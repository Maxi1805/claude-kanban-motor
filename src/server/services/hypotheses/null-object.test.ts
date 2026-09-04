/**
 * Tests de `null-object.ts` — CINCO capas, cada una probando algo distinto:
 *
 *  1. `NULL_OBJECT_SPEC` vía `engine.build()` sobre problemas SINTÉTICOS (sin
 *     parsear nada) — el motor: required/discriminadores/escalera/techo, y el
 *     excluder POR CONCEPTO (no global), AHORA ESTRUCTURAL (fan-out
 *     calls=0 + instantiates, sobre un grafo sintético real — ya no
 *     vocabulario de nombre).
 *  2. `scanFile`/`conditionGuard`/`guardReassignsToConstruction` sobre código
 *     REAL parseado con `web-tree-sitter` (vía el arnés compartido
 *     `detect/testing.ts`) — la extracción, incluida la exclusión heredada de
 *     Proxy/memoización y la forma sin clases (Go).
 *  3. `findNullObjectStructuralCandidates` sobre grafos SINTÉTICOS (mismo
 *     estilo que `wrapping-chain.test.ts`) — las dos formas nuevas de esta
 *     ola, COMPLETA y PARCIAL, y los casos negativos (interfaz sin cubrir,
 *     sin sitio de instanciación, miembro con fan-out > 0).
 *  4. `NULL_OBJECT_STRUCTURAL_SPEC` vía `engine.build()` — la escalera de
 *     confianza estructural (ceiling, discriminadores, `clients-call-
 *     without-null-check` con `RepoFunctionUnit[]` fake).
 *  5. `nullObject.build()` end-to-end — la ruta (1) ESTRUCTURAL, que HOY SÍ
 *     produce `ya-aplicado`/`parcial` en producción sin necesitar ningún
 *     árbol vivo (a diferencia de la ruta (2) AST-scatter, que sigue
 *     devolviendo `null` siempre — LÍMITE VIGENTE, sin cambios esta ola).
 */
import { describe, expect, it } from "vitest";

import { build as engineBuild } from "./engine.js";
import {
  buildNullObjectIndex,
  findNullObjectStructuralCandidates,
  groupIntoProblems,
  nullObject,
  NULL_OBJECT_SPEC,
  NULL_OBJECT_STRUCTURAL_SPEC,
  scanFile,
  type CandidateSubstitute,
  type FileScanResult,
  type NullGuardScatterProblem,
  type NullObjectGraphIndex,
} from "./null-object.js";
import type { Finding, RepoFunctionUnit, RepoUnit } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { pisoDeclarado, resolveThreshold } from "../detect/thresholds.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Helpers de grafo sintético — mismo estilo que `wrapping-chain.test.ts`.
 * ──────────────────────────────────────────────────────────────────────── */
const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
}

function method(file: string, classPath: string, name: string, arity: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [classPath, name], { family: "function-like", arity, ...overrides });
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. El motor sobre problemas sintéticos
 * ──────────────────────────────────────────────────────────────────────── */

function occurrence(file: string, memberName: string, strict = true, isMemberAccess = true): NullGuardScatterProblem["occurrences"][number] {
  return { file, memberName, guardedName: "current_user", strict, isMemberAccess, startLine: 1, endLine: 1 };
}

function syntheticProblem(overrides: Partial<NullGuardScatterProblem> = {}): NullGuardScatterProblem {
  return {
    conceptName: "current_user",
    occurrences: [occurrence("a.rb", "greeting"), occurrence("b.rb", "show_plan"), occurrence("c.rb", "record_visit")],
    substitutesInScope: [],
    ...overrides,
  };
}

describe("hypotheses/null-object — identidad", () => {
  it("declara sus tres campos, incluida la segunda ancla (OLA X, B6) y la TERCERA, el ancla-FUERZA (OLA AE, AE10)", () => {
    expect(nullObject.id).toBe("null-object");
    expect(nullObject.pattern).toBe("Null Object");
    // AE10 SUMA `repeated-absence-check` y NO saca ninguna de las dos viejas,
    // aunque su número medido sea flojo (5 hipótesis en los 13 repos y 38 en
    // las 8 aplicaciones de `corpus-app/`, con 0 recomendaciones verdaderas en
    // toda la historia del patrón): esta ola es ADITIVA — el recorte de lo que
    // rinde mal lo decide el usuario, con un criterio acordado.
    expect(nullObject.anchors).toEqual(["distributed-duplication", "duplication", "repeated-absence-check"]);
  });
});

describe("NULL_OBJECT_SPEC — el motor", () => {
  it("menos de 3 unidades distintas ⇒ required no se cumple ⇒ null (ni candidata)", () => {
    const problem = syntheticProblem({ occurrences: [occurrence("a.rb", "greeting"), occurrence("b.rb", "show_plan")] });
    expect(engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)).toBeNull();
  });

  it("3 unidades, todas estrictas ⇒ ausente, confianza calculada (nunca declarada a mano)", () => {
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), syntheticProblem(), null)!;
    expect(outcome.state).toBe("ausente");
    // 3 unidades (no > 3) ⇒ discriminador "four-or-more" NO confirma; "any-strict" SÍ.
    // 1 discriminador confirmado ⇒ escalera "media"; techo "media" ⇒ min = "media".
    expect(outcome.confidence).toBe("media");
    expect(outcome.missingCapabilities).toHaveLength(0);
  });

  it("techo (\"media\") CAPA la escalera aunque los dos discriminadores confirmen", () => {
    const problem = syntheticProblem({
      occurrences: [
        occurrence("a.rb", "greeting"),
        occurrence("b.rb", "show_plan"),
        occurrence("c.rb", "record_visit"),
        occurrence("d.rb", "extra"),
      ],
    });
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)!;
    expect(outcome.confidence).toBe("media"); // NO "alta": el techo de esta hipótesis es "media" (ver ceiling en null-object.ts)
  });

  it("todos los guards son negación truthy (ningún estricto) ⇒ 0 discriminadores confirmados ⇒ \"baja\"", () => {
    const problem = syntheticProblem({
      occurrences: [
        occurrence("a.rb", "greeting", false),
        occurrence("b.rb", "show_plan", false),
        occurrence("c.rb", "record_visit", false),
      ],
    });
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)!;
    expect(outcome.confidence).toBe("baja");
  });

  it("cada check llega con label/passed/why, también cuando NO pasó (columna 'qué no se confirmó y por qué')", () => {
    const problem = syntheticProblem({
      occurrences: [
        occurrence("a.rb", "greeting", false),
        occurrence("b.rb", "show_plan", false),
        occurrence("c.rb", "record_visit", false),
      ],
    });
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)!;
    const anyStrictCheck = outcome.discriminators.find((c) => c.label.includes("ESTRICTA"))!;
    expect(anyStrictCheck.passed).toBe(false);
    expect(anyStrictCheck.why).toMatch(/negación truthy/);
  });

  /** Grafo sintético donde `GuestUser` (guest.rb) tiene 2 miembros con fan-out `calls`=0 y >=1 `instantiates` entrante — la confirmación ESTRUCTURAL que reemplaza a `NULL_SIBLING_PREFIXES`. */
  function structurallyEmptyGuestUserIndex(): NullObjectGraphIndex {
    const guestUser = sym("guest.rb", ["GuestUser"]);
    const greeting = method("guest.rb", "GuestUser", "greeting", 0);
    const name = method("guest.rb", "GuestUser", "name", 0);
    const site = sym("app.rb", ["build_guest"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [guestUser, greeting, name, site],
      [...containsAll(guestUser.id, [greeting.id, name.id]), edge(site.id, guestUser.id, "instantiates")],
    );
    return buildNullObjectIndex(graph);
  }

  it("EXCLUDER ESTRUCTURAL (ya no vocabulario): sustituto con protocolo compartido Y confirmado por el grafo (fan-out calls=0 + instantiates) ⇒ aplicado-eludido, confidence null", () => {
    const substitute: CandidateSubstitute = { unitName: "GuestUser", file: "guest.rb", memberNames: ["greeting", "name"] };
    const problem = syntheticProblem({ substitutesInScope: [substitute] });
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, structurallyEmptyGuestUserIndex())!;
    expect(outcome.state).toBe("aplicado-eludido");
    expect(outcome.confidence).toBeNull(); // no compite en el ranking — es una fuga, no un "hacelo"
    const applied = outcome.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(true);
    expect(applied.why).toContain("GuestUser");
  });

  it("EXCLUDER ESTRUCTURAL: protocolo compartido por NOMBRE pero el candidato NO está confirmado por el grafo (sin nodo, o sin instantiates) ⇒ sigue ausente — ya no alcanza con el nombre solo", () => {
    const substitute: CandidateSubstitute = { unitName: "GuestUser", file: "guest.rb", memberNames: ["greeting", "name"] };
    const problem = syntheticProblem({ substitutesInScope: [substitute] });
    // Sin grafo en esta corrida: el excluder no tiene con qué confirmar estructura.
    const outcomeNoGraph = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)!;
    expect(outcomeNoGraph.state).toBe("ausente");

    // Con grafo, pero GuestUser NUNCA se instancia (sin `instantiates` entrante)
    // — fan-out=0 solo no alcanza, hace falta el sustituto REAL.
    const guestUser = sym("guest.rb", ["GuestUser"]);
    const greeting = method("guest.rb", "GuestUser", "greeting", 0);
    const name = method("guest.rb", "GuestUser", "name", 0);
    const graphSinInstanciar = graphOf([guestUser, greeting, name], containsAll(guestUser.id, [greeting.id, name.id]));
    const outcomeNoInstantiate = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, buildNullObjectIndex(graphSinInstanciar))!;
    expect(outcomeNoInstantiate.state).toBe("ausente");
  });

  it("EXCLUDER ESTRUCTURAL: protocolo compartido por nombre, pero el candidato tiene fan-out `calls` > 0 (NO está vacío) ⇒ sigue ausente — antes (vocabulario) esto habría disparado igual con un nombre neutro", () => {
    const substitute: CandidateSubstitute = { unitName: "GuestUser", file: "guest.rb", memberNames: ["greeting", "name"] };
    const problem = syntheticProblem({ substitutesInScope: [substitute] });
    const guestUser = sym("guest.rb", ["GuestUser"]);
    const greeting = method("guest.rb", "GuestUser", "greeting", 0);
    const name = method("guest.rb", "GuestUser", "name", 0);
    const logger = sym("guest.rb", ["Logger"]);
    const logMethod = method("guest.rb", "Logger", "log", 1);
    const site = sym("app.rb", ["build_guest"], { family: "function-like", arity: 0 });
    // `greeting` SÍ hace algo: llama a Logger.log — fan-out calls = 1, no 0.
    const graph = graphOf(
      [guestUser, greeting, name, logger, logMethod, site],
      [
        ...containsAll(guestUser.id, [greeting.id, name.id]),
        ...containsAll(logger.id, [logMethod.id]),
        edge(greeting.id, logMethod.id, "calls"),
        edge(site.id, guestUser.id, "instantiates"),
      ],
    );
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, buildNullObjectIndex(graph))!;
    expect(outcome.state).toBe("ausente");
  });

  it("P4: ninguna ocurrencia es acceso a atributo (todo parámetros/variables locales) ⇒ required no se cumple ⇒ null — FP medido en click (`value`/`cls`/`cmd`/`message`, defaulting de parámetro sin ninguna relación de dominio)", () => {
    const problem = syntheticProblem({
      conceptName: "value",
      occurrences: [
        occurrence("a.py", "convert_rotation", true, false),
        occurrence("b.py", "convert_flip", true, false),
        occurrence("c.py", "type_cast_value", true, false),
      ],
    });
    expect(engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)).toBeNull();
  });

  it("P4: con AL MENOS UNA ocurrencia de atributo entre parámetros del mismo concepto, sigue siendo candidata (mismo caso que `stripSelfPrefix`)", () => {
    const problem = syntheticProblem({
      occurrences: [occurrence("a.rb", "greeting", true, true), occurrence("b.rb", "show_plan", true, true), occurrence("c.rb", "record_visit", true, false)],
    });
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null);
    expect(outcome).not.toBeNull();
  });

  it("EXCLUDER POR CONCEPTO, no global: un sustituto con nombre neutro pero SIN protocolo compartido no dispara aplicado-eludido", () => {
    // A diferencia de la regla vieja (NULL_SIBLING_PREFIXES sobre TODOS los
    // unitNames del repo, apaga la hipótesis ENTERA), acá una clase "EmptyState"
    // sin relación de protocolo con las unidades guardadas no cuenta.
    const substitute: CandidateSubstitute = { unitName: "EmptyState", file: "ui.rb", memberNames: ["render", "isVisible"] };
    const problem = syntheticProblem({ substitutesInScope: [substitute] });
    const outcome = engineBuild(NULL_OBJECT_SPEC, new Set(), problem, null)!;
    expect(outcome.state).toBe("ausente");
    expect(outcome.confidence).not.toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 2. Extracción sobre código real parseado
 * ──────────────────────────────────────────────────────────────────────── */

const RUBY_PROBE = `
class Shape
  def initialize(name)
    @name = name
  end
  def area(x)
    if x > 0
      1
    else
      2
    end
  end
end
`;

const GO_PROBE = `
package main

type Shape struct {
	Name string
}

func (s *Shape) Area(x int) int {
	if x > 0 {
		return 1
	}
	return 2
}

func NewShape(name string) *Shape {
	return &Shape{Name: name}
}
`;

const JS_PROBE = `
class Shape extends Base {
  constructor(name) {
    super();
    this.name = name;
  }
  area(x) {
    if (x > 0) { return 1; } else { return 2; }
  }
}
`;

async function rubySets() {
  return nodeSetsFor("tree-sitter-ruby.wasm", RUBY_PROBE);
}
async function goSets() {
  return nodeSetsFor("tree-sitter-go.wasm", GO_PROBE);
}
async function jsSets() {
  return nodeSetsFor("tree-sitter-javascript.wasm", JS_PROBE);
}

const RUBY_SCATTERED = `
class DashboardController
  def greeting
    return "Hola, invitado" if @current_user.nil?
    "Hola, #{@current_user.name}"
  end
end

class BillingController
  def show_plan
    return "Sin plan (invitado)" if @current_user.nil?
    @current_user.subscription.plan_name
  end
end

class AuditLogger
  def record_visit(current_user)
    return if current_user.nil?
    log("visit", current_user.id)
  end
end

class ReportGenerator
  def generate(title)
    raise ArgumentError, "title required" if title.nil?
    "Reporte: #{title}"
  end
end
`;

describe("scanFile — extracción sobre código real (Ruby, con clases)", () => {
  it("recoge un guard por clase, agrupado bajo su método contenedor, y NO agrupa por clase (State sí, esto no)", async () => {
    const sets = await rubySets();
    const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_SCATTERED);
    const result = scanFile(root, sets);
    const guardedNames = result.guards.map((g) => g.guardedName.toLowerCase());
    expect(guardedNames.filter((n) => n === "current_user")).toHaveLength(3);
    // El control negativo (`title`, validación de entrada aislada) también se
    // extrae — es `groupIntoProblems` quien lo descarta por no llegar al mínimo.
    expect(guardedNames).toContain("title");
  });

  it("stripSelfPrefix: `@current_user` y `current_user` (parámetro) son el MISMO concepto", async () => {
    const sets = await rubySets();
    const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_SCATTERED);
    const result = scanFile(root, sets);
    const names = new Set(result.guards.map((g) => g.guardedName));
    expect(names.has("current_user")).toBe(true);
    expect([...names].some((n) => n.startsWith("@"))).toBe(false);
  });

  it("P4: `isMemberAccess` distingue atributo (`@current_user`) de parámetro/variable local (`current_user`, `title`)", async () => {
    const sets = await rubySets();
    const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_SCATTERED);
    const result = scanFile(root, sets);
    const byGuarded = new Map(result.guards.map((g) => [`${g.guardedName}#${g.memberName}`, g]));
    expect(byGuarded.get("current_user#greeting")?.isMemberAccess).toBe(true); // @current_user, DashboardController
    expect(byGuarded.get("current_user#show_plan")?.isMemberAccess).toBe(true); // @current_user, BillingController
    expect(byGuarded.get("current_user#record_visit")?.isMemberAccess).toBe(false); // parámetro, AuditLogger
    expect(byGuarded.get("title#generate")?.isMemberAccess).toBe(false); // parámetro, ReportGenerator
  });

  it("las unidades-tipo del archivo quedan disponibles con sus miembros (para el excluder por concepto)", async () => {
    const sets = await rubySets();
    const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_SCATTERED);
    const result = scanFile(root, sets);
    expect(result.units.get("DashboardController")).toContain("greeting");
    expect(result.units.get("BillingController")).toContain("show_plan");
  });
});

const GO_SCATTERED = `
package dashboard

func Greeting(currentUser *User) string {
	if currentUser == nil {
		return "Hola, invitado"
	}
	return "Hola, " + currentUser.Name
}

func ShowPlan(currentUser *User) string {
	if currentUser == nil {
		return "Sin plan (invitado)"
	}
	return currentUser.Subscription.PlanName
}

func RecordVisit(currentUser *User) {
	if currentUser == nil {
		return
	}
	logVisit(currentUser.ID)
}
`;

describe("scanFile — forma SIN clases (Go: funciones sueltas, requisito #4)", () => {
  it("recoge los 3 guards agrupados por FUNCIÓN contenedora, sin ninguna clase involucrada", async () => {
    const sets = await goSets();
    const root = await parseRoot("tree-sitter-go.wasm", GO_SCATTERED);
    const result = scanFile(root, sets);
    const currentUserGuards = result.guards.filter((g) => g.guardedName.toLowerCase() === "currentuser");
    expect(currentUserGuards).toHaveLength(3);
    expect(new Set(currentUserGuards.map((g) => g.memberName))).toEqual(new Set(["Greeting", "ShowPlan", "RecordVisit"]));
    expect(result.units.size).toBe(0); // sin unidades-tipo: el excluder no tiene candidato que ofrecer, no un cero disfrazado
  });
});

const JS_PROXY_FALSE_POSITIVE = `
class ReportBuilder {
  getEngine() {
    if (!this.engine) {
      this.engine = new TemplateEngine();
    }
    return this.engine;
  }
}

class SingleUse {
  getEngine() {
    if (!this.engine) {
      this.engine = new TemplateEngine();
    }
    return this.engine;
  }
}
`;

describe("scanFile — preserva la exclusión de Proxy/memoización (guardReassignsToConstruction)", () => {
  it("un guard cuyo cuerpo REASIGNA el mismo campo a una construcción NO se recoge (es Proxy, no Null Object)", async () => {
    const sets = await jsSets();
    const root = await parseRoot("tree-sitter-javascript.wasm", JS_PROXY_FALSE_POSITIVE);
    const result = scanFile(root, sets);
    expect(result.guards.filter((g) => g.guardedName === "engine")).toHaveLength(0);
  });

  it("P4: `new(Type)` de Go (builtin con paréntesis, no `new Type`) TAMBIÉN cuenta como construcción — FP medido en cobra (`c.flagErrorBuf`, 5 sitios idénticos de memoización)", async () => {
    const sets = await goSets();
    const root = await parseRoot(
      "tree-sitter-go.wasm",
      `
package cobra

func (c *Command) Flags() *FlagSet {
	if c.flagErrorBuf == nil {
		c.flagErrorBuf = new(bytes.Buffer)
	}
	return c.flags
}
`,
    );
    const result = scanFile(root, sets);
    expect(result.guards.filter((g) => g.guardedName === "c.flagErrorBuf")).toHaveLength(0);
  });
});

describe("OLA Y — scanFile descarta el guard que INTERRUMPE (fallar rápido no es un hueco para un objeto neutro)", () => {
  const TS_MINI_PROBE = `class P { m(x: number) { if (x) { return x; } } }`;

  it("TypeScript: `if (!this.client) { throw new Error(...) }` — la forma EXACTA de `nest#unwrap`, 3 clases, juzgada falsa por este frente ⇒ no se recoge", async () => {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_MINI_PROBE);
    const root = await parseRoot(
      "tree-sitter-typescript.wasm",
      `class ClientKafka {\n  unwrap<T>(): T {\n    if (!this.client) {\n      throw new Error('Not initialized.');\n    }\n    return this.client as T;\n  }\n}\n`,
    );
    expect(scanFile(root, sets).guards).toEqual([]);
  });

  it("TypeScript: `if (!x) throw ...` SIN llaves (la consecuencia ES el throw) ⇒ tampoco se recoge", async () => {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_MINI_PROBE);
    const root = await parseRoot("tree-sitter-typescript.wasm", `class A {\n  m() {\n    if (!this.client) throw new Error('x');\n  }\n}\n`);
    expect(scanFile(root, sets).guards).toEqual([]);
  });

  it("Python: `if x is None: raise ...` ⇒ no se recoge", async () => {
    const sets = await nodeSetsFor("tree-sitter-python.wasm", `class P:\n  def m(self, x):\n    if x:\n      return x\n`);
    const root = await parseRoot("tree-sitter-python.wasm", `class A:\n  def m(self):\n    if self.conn is None:\n      raise ValueError("no conn")\n    return self.conn\n`);
    expect(scanFile(root, sets).guards).toEqual([]);
  });

  it("POSITIVO: el guard que DEVUELVE UN SUSTITUTO (no interrumpe) se sigue recogiendo — es el caso del patrón", async () => {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_MINI_PROBE);
    const root = await parseRoot(
      "tree-sitter-typescript.wasm",
      `class A {\n  greeting(): string {\n    if (this.currentUser === null) {\n      return 'Hola, invitado';\n    }\n    return this.currentUser.name;\n  }\n}\n`,
    );
    expect(scanFile(root, sets).guards.map((g) => g.guardedName)).toEqual(["currentUser"]);
  });
});

/**
 * OLA AI, FRENTE AI7 — LOS DOS IDIOMAS DE AUSENCIA QUE `conditionGuard` NO PODÍA
 * VER. Un test por INTENCIÓN, y los dos controles negativos que fijan los
 * anclajes (la forma CONTRARIA y la COMPARACIÓN no se recogen).
 */
describe("OLA AI/AI7 — `not x` (Python) y `x is null` (C#): la misma intención, escrita como su gramática la escribe", () => {
  const PY_PROBE = `class P:\n  def m(self, x):\n    if x:\n      return x\n    else:\n      return None\n`;
  const CS_PROBE = `class P { int m(int x) { if (x > 0) { return x; } else { return 0; } } }`;

  it("INTENCIÓN: en Python, `if not self.conn:` con sustituto es la MISMA guarda de ausencia que `!x`, y antes de esta ola NO producía ninguna occurrence", async () => {
    const sets = await nodeSetsFor("tree-sitter-python.wasm", PY_PROBE);
    const root = await parseRoot("tree-sitter-python.wasm", `class A:\n  def saludo(self):\n    if not self.conn:\n      return "sin conexion"\n    return self.conn.nombre()\n`);
    const guards = scanFile(root, sets).guards;
    expect(guards.map((g) => g.guardedName)).toEqual(["conn"]);
    // `not x` es negación por VERACIDAD, no comparación contra el valor
    // ausente: mismo `strict` que `!x`, su gemela ya cubierta.
    expect(guards[0]!.strict).toBe(false);
  });

  it("INTENCIÓN: en C#, `if (x is null)` es la MISMA guarda de ausencia que `x == null`, y antes de esta ola NO producía ninguna occurrence", async () => {
    const sets = await nodeSetsFor("tree-sitter-c_sharp.wasm", CS_PROBE);
    const root = await parseRoot(
      "tree-sitter-c_sharp.wasm",
      `class A {\n  string Saludo() {\n    if (this.usuario is null) {\n      return "invitado";\n    }\n    return this.usuario.Nombre();\n  }\n}\n`,
    );
    const guards = scanFile(root, sets).guards;
    expect(guards.map((g) => g.guardedName)).toEqual(["usuario"]);
    // Nombra el valor ausente, igual que `x == null` y `x is None`.
    expect(guards[0]!.strict).toBe(true);
  });

  it("CONTROL NEGATIVO: `x is not null` es la guarda CONTRARIA y NO se recoge (el `\\b` del anclaje)", async () => {
    const sets = await nodeSetsFor("tree-sitter-c_sharp.wasm", CS_PROBE);
    const root = await parseRoot(
      "tree-sitter-c_sharp.wasm",
      `class A {\n  string Saludo() {\n    if (this.usuario is not null) {\n      return this.usuario.Nombre();\n    }\n    return "invitado";\n  }\n}\n`,
    );
    expect(scanFile(root, sets).guards).toEqual([]);
  });

  it("CONTROL NEGATIVO: `if not a == b:` es una COMPARACIÓN, no una guarda de ausencia, y NO se recoge (el fin-de-texto del anclaje)", async () => {
    const sets = await nodeSetsFor("tree-sitter-python.wasm", PY_PROBE);
    const root = await parseRoot("tree-sitter-python.wasm", `class A:\n  def m(self, a, b):\n    if not a == b:\n      return "distinto"\n    return a.nombre()\n`);
    expect(scanFile(root, sets).guards).toEqual([]);
  });

  it("ADITIVO: las cuatro formas viejas siguen dando exactamente lo mismo (`x is None` sigue siendo strict, `!x` sigue siendo no-strict)", async () => {
    const sets = await nodeSetsFor("tree-sitter-python.wasm", PY_PROBE);
    const root = await parseRoot("tree-sitter-python.wasm", `class A:\n  def m(self):\n    if self.conn is None:\n      return "sin"\n    return self.conn.nombre()\n`);
    const guards = scanFile(root, sets).guards;
    expect(guards.map((g) => [g.guardedName, g.strict])).toEqual([["conn", true]]);
  });

  it("ADITIVO/RESOLUCIÓN: `if not self.conn: raise ...` sigue descartado — la exclusión de fallar-rápido corre igual sobre la forma nueva", async () => {
    const sets = await nodeSetsFor("tree-sitter-python.wasm", PY_PROBE);
    const root = await parseRoot("tree-sitter-python.wasm", `class A:\n  def m(self):\n    if not self.conn:\n      raise ValueError("no conn")\n    return self.conn\n`);
    expect(scanFile(root, sets).guards).toEqual([]);
  });
});

describe("groupIntoProblems — agrupación multi-archivo, sin agrupar por clase", () => {
  it("junta guards de 3 archivos/clases NO relacionadas en un único problema por concepto", () => {
    const perFile = new Map<string, FileScanResult>([
      ["a.rb", { guards: [{ memberName: "greeting", guardedName: "current_user", strict: true, isMemberAccess: true, startLine: 1, endLine: 1 }], units: new Map() }],
      ["b.rb", { guards: [{ memberName: "show_plan", guardedName: "current_user", strict: true, isMemberAccess: true, startLine: 1, endLine: 1 }], units: new Map() }],
      ["c.rb", { guards: [{ memberName: "record_visit", guardedName: "current_user", strict: false, isMemberAccess: false, startLine: 1, endLine: 1 }], units: new Map() }],
    ]);
    const problems = groupIntoProblems(perFile);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.occurrences).toHaveLength(3);
  });

  it("por debajo del mínimo (2 unidades) no arma ningún problema", () => {
    const perFile = new Map<string, FileScanResult>([
      ["a.rb", { guards: [{ memberName: "greeting", guardedName: "x", strict: true, isMemberAccess: false, startLine: 1, endLine: 1 }], units: new Map() }],
      ["b.rb", { guards: [{ memberName: "show_plan", guardedName: "x", strict: true, isMemberAccess: false, startLine: 1, endLine: 1 }], units: new Map() }],
    ]);
    expect(groupIntoProblems(perFile)).toHaveLength(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 3. `findNullObjectStructuralCandidates` — las dos formas nuevas, sobre
 *    grafos sintéticos (mismo estilo que `wrapping-chain.test.ts`).
 * ──────────────────────────────────────────────────────────────────────── */

describe("findNullObjectStructuralCandidates", () => {
  it("grafo null ⇒ [] (nunca lanza)", () => {
    expect(findNullObjectStructuralCandidates(null)).toEqual([]);
  });

  it("COMPLETA: N implements I, cubre TODOS los miembros de I por (name,arity), fan-out calls=0 en cada uno, >=1 instantiates entrante", () => {
    const file = "logging.ts";
    const iface = sym(file, ["Logger"], { family: "namespace-like" });
    const ifaceLog = method(file, "Logger", "log", 1);
    const ifaceWarn = method(file, "Logger", "warn", 1);
    const nullLogger = sym(file, ["NoOpLogger"]);
    const log = method(file, "NoOpLogger", "log", 1);
    const warn = method(file, "NoOpLogger", "warn", 1);
    const site = sym(file, ["createLogger"], { family: "function-like", arity: 1 });

    const graph = graphOf(
      [iface, ifaceLog, ifaceWarn, nullLogger, log, warn, site],
      [
        ...containsAll(iface.id, [ifaceLog.id, ifaceWarn.id]),
        ...containsAll(nullLogger.id, [log.id, warn.id]),
        edge(nullLogger.id, iface.id, "implements"),
        edge(site.id, nullLogger.id, "instantiates"),
      ],
    );

    const candidates = findNullObjectStructuralCandidates(graph);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      form: "completa",
      nullTypeId: nullLogger.id,
      interfaceId: iface.id,
      viaSatisfies: false,
      instantiationSites: [site.id],
    });
    expect(new Set(candidates[0]!.coveredMembers.map((m) => m.name))).toEqual(new Set(["log", "warn"]));
  });

  it("PARCIAL: fan-out calls=0 + instantiates, pero SIN ninguna arista implements|satisfies — objeto vacío ad hoc", () => {
    const file = "app.rb";
    const guestUser = sym(file, ["GuestUser"]);
    const greeting = method(file, "GuestUser", "greeting", 0);
    const site = sym(file, ["currentUser"], { family: "function-like", arity: 0 });
    const graph = graphOf([guestUser, greeting, site], [...containsAll(guestUser.id, [greeting.id]), edge(site.id, guestUser.id, "instantiates")]);

    const candidates = findNullObjectStructuralCandidates(graph);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ form: "parcial", nullTypeId: guestUser.id, interfaceId: null });
  });

  it("NEGATIVO: implements pero NO cubre todos los miembros de I ⇒ no clasifica (ni completa ni parcial, no se fuerza)", () => {
    const file = "logging.ts";
    const iface = sym(file, ["Logger"], { family: "namespace-like" });
    const ifaceLog = method(file, "Logger", "log", 1);
    const ifaceWarn = method(file, "Logger", "warn", 1);
    const partialLogger = sym(file, ["PartialLogger"]);
    const log = method(file, "PartialLogger", "log", 1); // sólo "log", falta "warn"
    const site = sym(file, ["createLogger"], { family: "function-like", arity: 1 });
    const graph = graphOf(
      [iface, ifaceLog, ifaceWarn, partialLogger, log, site],
      [...containsAll(iface.id, [ifaceLog.id, ifaceWarn.id]), ...containsAll(partialLogger.id, [log.id]), edge(partialLogger.id, iface.id, "implements"), edge(site.id, partialLogger.id, "instantiates")],
    );
    expect(findNullObjectStructuralCandidates(graph)).toEqual([]);
  });

  it("NEGATIVO: sin ningún sitio `instantiates` ⇒ ni completa ni parcial, aunque el resto de la forma esté", () => {
    const file = "app.rb";
    const guestUser = sym(file, ["GuestUser"]);
    const greeting = method(file, "GuestUser", "greeting", 0);
    const graph = graphOf([guestUser, greeting], containsAll(guestUser.id, [greeting.id]));
    expect(findNullObjectStructuralCandidates(graph)).toEqual([]);
  });

  it("NEGATIVO: un miembro con fan-out calls > 0 (no está vacío) ⇒ descalifica al tipo entero, ninguna forma", () => {
    const file = "app.rb";
    const guestUser = sym(file, ["GuestUser"]);
    const greeting = method(file, "GuestUser", "greeting", 0);
    const logger = sym(file, ["Logger"]);
    const logMethod = method(file, "Logger", "log", 1);
    const site = sym(file, ["currentUser"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [guestUser, greeting, logger, logMethod, site],
      [...containsAll(guestUser.id, [greeting.id]), ...containsAll(logger.id, [logMethod.id]), edge(greeting.id, logMethod.id, "calls"), edge(site.id, guestUser.id, "instantiates")],
    );
    expect(findNullObjectStructuralCandidates(graph)).toEqual([]);
  });

  it("interfaz sin miembros propios no participa (nada que 'cubrir') ⇒ cae a PARCIAL si por lo demás califica", () => {
    const file = "app.rb";
    const marker = sym(file, ["Marker"], { family: "namespace-like" }); // interfaz marcadora, 0 miembros propios
    const guestUser = sym(file, ["GuestUser"]);
    const greeting = method(file, "GuestUser", "greeting", 0);
    const site = sym(file, ["currentUser"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [marker, guestUser, greeting, site],
      [...containsAll(guestUser.id, [greeting.id]), edge(guestUser.id, marker.id, "implements"), edge(site.id, guestUser.id, "instantiates")],
    );
    const candidates = findNullObjectStructuralCandidates(graph);
    // Tiene una arista implements ⇒ NO es "ninguna interfaz" ⇒ no cae a PARCIAL
    // (la definición de PARCIAL exige `ifaces.length === 0`); tampoco cubre
    // nada (la interfaz no tiene miembros) ⇒ tampoco COMPLETA. Caso raro,
    // declarado sin clasificar — ver docstring de `findNullObjectStructuralCandidates`.
    expect(candidates).toEqual([]);
  });

  it("`viaSatisfies` es cierto cuando la relación se derivó por satisfies (no implements declarado) — riesgo A9 declarado", () => {
    const file = "logging.ts";
    const iface = sym(file, ["Logger"], { family: "namespace-like" });
    const ifaceLog = method(file, "Logger", "log", 1);
    const ifaceWarn = method(file, "Logger", "warn", 1);
    const nullLogger = sym(file, ["NoOpLogger"]);
    const log = method(file, "NoOpLogger", "log", 1);
    const warn = method(file, "NoOpLogger", "warn", 1);
    const site = sym(file, ["createLogger"], { family: "function-like", arity: 1 });
    const graph = graphOf(
      [iface, ifaceLog, ifaceWarn, nullLogger, log, warn, site],
      [...containsAll(iface.id, [ifaceLog.id, ifaceWarn.id]), ...containsAll(nullLogger.id, [log.id, warn.id]), edge(nullLogger.id, iface.id, "satisfies"), edge(site.id, nullLogger.id, "instantiates")],
    );
    const candidates = findNullObjectStructuralCandidates(graph);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.viaSatisfies).toBe(true);
  });

  /* ──────────────────────────────────────────────────────────────────────
   * REVISIÓN POST-DIAGNÓSTICO DEL EMBUDO (este frente) — precisión de
   * `isStructurallyEmpty`: exclusión de constructor + span trivial. Caso de
   * prueba real: `FakeRackSession` (Rails,
   * `app/controllers/concerns/rack_sessions_fix.rb:3-8`) — 2 miembros
   * (`enabled?`/`destroy`) de 0-2 líneas cada uno, sin constructor propio.
   * ────────────────────────────────────────────────────────────────────── */

  it("caso real (Rails, FakeRackSession): 2 miembros de cuerpo trivial (spans 0 y 2) ⇒ PARCIAL", () => {
    const file = "app/controllers/concerns/rack_sessions_fix.rb";
    const fakeSession = sym(file, ["FakeRackSession"]);
    const enabledMember = method(file, "FakeRackSession", "enabled?", 0, { startLine: 4, endLine: 6 });
    const destroyMember = method(file, "FakeRackSession", "destroy", 0, { startLine: 8, endLine: 8 });
    const site = sym(file, ["set_fake_session"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [fakeSession, enabledMember, destroyMember, site],
      [...containsAll(fakeSession.id, [enabledMember.id, destroyMember.id]), edge(site.id, fakeSession.id, "instantiates")],
    );
    const candidates = findNullObjectStructuralCandidates(graph);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ form: "parcial", nullTypeId: fakeSession.id });
  });

  it("NEGATIVO (span): un miembro con fan-out calls=0 pero cuerpo de MUCHAS líneas (lógica real detrás de llamadas no resueltas, medido en `Folder`/`Lead` de Rails) descalifica al tipo entero", () => {
    const file = "app/models/folder.rb";
    const folder = sym(file, ["Folder"]);
    // `not_empty?`: span trivial (2) — pasaría solo.
    const notEmpty = method(file, "Folder", "not_empty?", 0, { startLine: 79, endLine: 81 });
    // `as_json`: span real (13, medido) — ningún miembro puede superar el piso declarado.
    const asJson = method(file, "Folder", "as_json", 3, { startLine: 60, endLine: 73 });
    const site = sym(file, ["find_folder"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [folder, notEmpty, asJson, site],
      [...containsAll(folder.id, [notEmpty.id, asJson.id]), edge(site.id, folder.id, "instantiates")],
    );
    expect(findNullObjectStructuralCandidates(graph)).toEqual([]);
  });

  it("NEGATIVO (constructor): un tipo cuyo ÚNICO miembro es su constructor (medido en subclases de `Error` del TS de este propio repo: `CommandNotFoundError`, etc.) no cuenta como 'vacío' — construir no es protocolo", () => {
    const file = "command-runner.ts";
    const errType = sym(file, ["CommandNotFoundError"]);
    const ctorMember = method(file, "CommandNotFoundError", "constructor", 1, { startLine: 314, endLine: 317 });
    const site = sym(file, ["run"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [errType, ctorMember, site],
      [...containsAll(errType.id, [ctorMember.id]), edge(site.id, errType.id, "instantiates")],
    );
    expect(findNullObjectStructuralCandidates(graph)).toEqual([]);
  });

  it("constructor + miembros triviales: el constructor se EXCLUYE del cómputo, el resto se evalúa igual (un span grande SÓLO en el constructor no descalifica)", () => {
    const file = "app.ts";
    const nullThing = sym(file, ["NullThing"]);
    // Constructor con cuerpo largo (span 10) — no debe contar.
    const ctorMember = method(file, "NullThing", "constructor", 0, { startLine: 1, endLine: 11 });
    const noop = method(file, "NullThing", "noop", 0, { startLine: 13, endLine: 13 });
    const site = sym(file, ["build"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [nullThing, ctorMember, noop, site],
      [...containsAll(nullThing.id, [ctorMember.id, noop.id]), edge(site.id, nullThing.id, "instantiates")],
    );
    const candidates = findNullObjectStructuralCandidates(graph);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ form: "parcial", nullTypeId: nullThing.id });
    // El constructor no aparece entre los miembros cubiertos — no es protocolo.
    expect(candidates[0]!.coveredMembers.map((m) => m.name)).toEqual(["noop"]);
  });

  it("sin posición (`startLine`/`endLine` ausentes, grafo sintético o de antes de F2) NO descalifica — permisivo cuando no hay dato con qué medir el span", () => {
    const file = "app.rb";
    const guestUser = sym(file, ["GuestUser"]);
    const greeting = method(file, "GuestUser", "greeting", 0); // sin startLine/endLine — igual que el resto de este archivo de test.
    const site = sym(file, ["currentUser"], { family: "function-like", arity: 0 });
    const graph = graphOf([guestUser, greeting, site], [...containsAll(guestUser.id, [greeting.id]), edge(site.id, guestUser.id, "instantiates")]);
    expect(findNullObjectStructuralCandidates(graph)).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola U (N3) — BUG VERIFICADO: "fan-out `calls` = 0" confundía "hace
 * validación defensiva" con "tiene comportamiento". Caso canónico,
 * autodocumentado como Null Object, hoy invisible por esto:
 * `guava/guava/src/com/google/common/io/CharStreams.java:292-349`,
 * `NullWriter.write(char[] cbuf) { checkNotNull(cbuf); }` (javadoc: "simply
 * discards written chars", "singleton writer"). Reproducido acá con un árbol
 * Java real (no la fixture: la forma exacta del bug, `checkNotNull(param)`
 * sin transformar, resultado descartado) — el caso real del corpus queda
 * bloqueado además por la localidad de `restrictToRelated` (necesitaría un
 * `distributed-duplication` cercano a `CharStreams.java`), ver el informe de
 * esta tarea.
 * ──────────────────────────────────────────────────────────────────────── */
describe("findNullObjectStructuralCandidates — con árbol vivo (`fileAt`), la guarda pura ya no descalifica (bug de esta ola)", () => {
  const JAVA_FILE = "a.java";
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

  async function nullWriterFile(memberSource: string): Promise<{ file: ReturnType<typeof fileUnitFrom> }> {
    const sets = await nodeSetsFor("tree-sitter-java.wasm", JAVA_PROBE);
    const root = await parseRoot(
      "tree-sitter-java.wasm",
      `
class NullWriter implements Writer {
${memberSource}
}
`,
    );
    return { file: fileUnitFrom(root, sets, "java", { file: JAVA_FILE }) };
  }

  /** Grafo con `NullWriter` implementando `Writer` (2 miembros: `write(cbuf)` con fan-out=1 vía la llamada de guarda, `flush()` con fan-out=0), instanciado en un sitio — la forma EXACTA de `CharStreams.NullWriter`. `writeStartLine` deja que cada test ubique la línea real de `write` en SU propia fuente (varía con el cuerpo del negativo). */
  function nullWriterGraph(writeStartLine: number): { graph: CodeGraph; index: NullObjectGraphIndex } {
    const iface = sym(JAVA_FILE, ["Writer"], { family: "namespace-like" });
    const ifaceWrite = method(JAVA_FILE, "Writer", "write", 1);
    const ifaceFlush = method(JAVA_FILE, "Writer", "flush", 0);
    const nullWriter = sym(JAVA_FILE, ["NullWriter"]);
    const writeM = method(JAVA_FILE, "NullWriter", "write", 1, { startLine: writeStartLine, endLine: writeStartLine });
    const flushM = method(JAVA_FILE, "NullWriter", "flush", 0, { startLine: writeStartLine + 1, endLine: writeStartLine + 1 });
    const site = sym(JAVA_FILE, ["nullWriter"], { family: "function-like", arity: 0 });
    const graph = graphOf(
      [iface, ifaceWrite, ifaceFlush, nullWriter, writeM, flushM, site],
      [
        ...containsAll(iface.id, [ifaceWrite.id, ifaceFlush.id]),
        ...containsAll(nullWriter.id, [writeM.id, flushM.id]),
        edge(nullWriter.id, iface.id, "implements"),
        edge(site.id, nullWriter.id, "instantiates"),
        // La arista `calls` que HOY (sin este arreglo) descalifica a `write` —
        // el destino no necesita existir como nodo, `callFanOut` sólo cuenta.
        edge(writeM.id, "sym:a.java#checkNotNull", "calls"),
      ],
    );
    return { graph, index: buildNullObjectIndex(graph) };
  }

  it("SIN árbol vivo (`fileAt` ausente, comportamiento de ANTES de esta ola) ⇒ `write` con fan-out=1 descalifica a NullWriter entero — ningún candidato", () => {
    const { graph } = nullWriterGraph(3);
    expect(findNullObjectStructuralCandidates(graph)).toEqual([]);
  });

  it("CON árbol vivo: `write(cbuf) { checkNotNull(cbuf); }` — único argumento, es exactamente el parámetro propio, resultado descartado ⇒ guarda pura: NullWriter SÍ califica, forma COMPLETA (implementa Writer por completo)", async () => {
    const { graph } = nullWriterGraph(3);
    const { file } = await nullWriterFile("  void write(char[] cbuf) { checkNotNull(cbuf); }\n  void flush() { }");
    const candidates = findNullObjectStructuralCandidates(graph, (path) => (path === JAVA_FILE ? file : null));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ form: "completa" });
    expect(candidates[0]!.coveredMembers.map((m) => m.name).sort()).toEqual(["flush", "write"]);
  });

  it("NEGATIVO: la llamada de `write` usa el argumento TRANSFORMADO (no el parámetro propio sin tocar) ⇒ sigue siendo comportamiento real, sigue descalificando — el arreglo no infla falsos positivos", async () => {
    const { graph } = nullWriterGraph(3);
    const { file } = await nullWriterFile("  void write(char[] cbuf) { checkNotNull(cbuf.length); }\n  void flush() { }");
    const candidates = findNullObjectStructuralCandidates(graph, (path) => (path === JAVA_FILE ? file : null));
    expect(candidates).toEqual([]);
  });

  it("NEGATIVO: `write` tiene la llamada de guarda MÁS una mutación propia (`this.count++`) ⇒ ya NO es 'sólo llamadas de guarda' (un statement que ni siquiera es una llamada) — sigue descalificando", async () => {
    const { graph } = nullWriterGraph(3);
    const { file } = await nullWriterFile("  void write(char[] cbuf) { checkNotNull(cbuf); this.count++; }\n  void flush() { }");
    const candidates = findNullObjectStructuralCandidates(graph, (path) => (path === JAVA_FILE ? file : null));
    expect(candidates).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA Y (Y1) — "FAN-OUT `calls` = 0" NO ES "CUERPO VACÍO".
 *
 * Los ocho candidatos que el integrador de la Ola X abrió a mano y juzgó
 * FALSOS caen en tres formas, y las tres se reproducen acá con árbol REAL:
 *   (a) el cuerpo hace algo que el grafo no resuelve — `atomic.AddUint32`
 *       (`AtomicStaler`, hugo), `fmt.Sprintf` (`AccessDeniedError`, hugo),
 *       aritmética (`OptionsPartition`, hugo), un getter que indexa un
 *       arreglo (`KafkaContext`, nest);
 *   (b) el tipo es el PROTOCOLO — `Ticker` (guava) es una clase abstracta con
 *       subclases, `TestSetGenerator` (guava) es una interfaz;
 *   (c) sí es neutro — `return false` / cuerpo vacío / `return nil`, que es lo
 *       único que tiene que seguir pasando.
 * ──────────────────────────────────────────────────────────────────────── */
describe("OLA Y — el CUERPO, no el fan-out: la forma de los falsos medidos en la Ola X", () => {
  const GO_FILE = "s.go";

  /** Grafo con `T` (una sola función `m`, sin interfaz) instanciado en un sitio — la forma PARCIAL, la que produce 281 de las 282 recomendaciones de la Ola X. */
  function tipoConUnMiembro(file: string, startLine: number): CodeGraph {
    const t = sym(file, ["T"], { startLine: 1, endLine: startLine + 1 });
    const m = method(file, "T", "m", 0, { startLine, endLine: startLine });
    const site = sym(file, ["build"], { family: "function-like", arity: 0, startLine: 50, endLine: 51 });
    return graphOf([t, m, site], [...containsAll(t.id, [m.id]), edge(site.id, t.id, "instantiates")]);
  }

  async function goFileAt(src: string) {
    // GO_PROBE (arriba) declara un método CON receptor: sin eso
    // `method_declaration` no entra en `sets.functionNodes` y
    // `findFunctionNodeAt` no encuentra nada — el test pasaría por la razón
    // equivocada (descalificar por no ubicar el miembro, no por su cuerpo).
    const sets = await goSets();
    const root = await parseRoot("tree-sitter-go.wasm", src);
    const unit = fileUnitFrom(root, sets, "go", { file: GO_FILE });
    return (path: string) => (path === GO_FILE ? unit : null);
  }

  it("(a) `atomic.AddUint32(...)` — la forma de `AtomicStaler` (hugo): el grafo no resuelve la llamada, así que fan-out=0, pero el CUERPO hace algo ⇒ ya no califica", async () => {
    const graph = tipoConUnMiembro(GO_FILE, 2);
    const fileAt = await goFileAt(`package p\nfunc (t *T) m() uint32 { return atomic.AddUint32(&t.n, 1) }\n`);
    expect(findNullObjectStructuralCandidates(graph, fileAt)).toEqual([]);
    // Y sin árbol el comportamiento es el de antes: fan-out=0 alcanzaba.
    expect(findNullObjectStructuralCandidates(graph)).toHaveLength(1);
  });

  it("(a) aritmética — la forma de `OptionsPartition` (hugo), el candidato que las 3 coberturas falsas de la Ola X compartían ⇒ ya no califica", async () => {
    const graph = tipoConUnMiembro(GO_FILE, 2);
    const fileAt = await goFileAt(`package p\nfunc (t *T) m() int { return t.a * 2 }\n`);
    expect(findNullObjectStructuralCandidates(graph, fileAt)).toEqual([]);
  });

  it("(a) getter que indexa un arreglo — la forma de `KafkaContext` (nest), seis getters ⇒ ya no califica", async () => {
    const graph = tipoConUnMiembro(GO_FILE, 2);
    const fileAt = await goFileAt(`package p\nfunc (t *T) m() string { return t.args[0] }\n`);
    expect(findNullObjectStructuralCandidates(graph, fileAt)).toEqual([]);
  });

  it("(c) POSITIVO: `return nil` sigue calificando — un cuerpo constante es lo que el patrón ES", async () => {
    const graph = tipoConUnMiembro(GO_FILE, 2);
    const fileAt = await goFileAt(`package p\nfunc (t *T) m() error { return nil }\n`);
    expect(findNullObjectStructuralCandidates(graph, fileAt)).toHaveLength(1);
  });

  it("(c) POSITIVO: cuerpo textualmente vacío sigue calificando", async () => {
    const graph = tipoConUnMiembro(GO_FILE, 2);
    const fileAt = await goFileAt(`package p\nfunc (t *T) m() {}\n`);
    expect(findNullObjectStructuralCandidates(graph, fileAt)).toHaveLength(1);
  });

  it("(c) POSITIVO: `return false` (Java) — la constante llega envuelta en `return_statement`, sin `expression_list`", async () => {
    const JAVA_FILE = "A.java";
    const sets = await nodeSetsFor("tree-sitter-java.wasm", `class P { int m(int x) { return x; } }`);
    const root = await parseRoot("tree-sitter-java.wasm", `class T {\n  boolean m() { return false; }\n}\n`);
    const unit = fileUnitFrom(root, sets, "java", { file: JAVA_FILE });
    const graph = tipoConUnMiembro(JAVA_FILE, 2);
    expect(findNullObjectStructuralCandidates(graph, (p) => (p === JAVA_FILE ? unit : null))).toHaveLength(1);
  });

  it("SIN árbol para ESE archivo (`fileAt` presente pero no resuelve) ⇒ no se afirma 'vacío': descalifica. No se afirma sin mirar.", async () => {
    const graph = tipoConUnMiembro(GO_FILE, 2);
    expect(findNullObjectStructuralCandidates(graph, () => null)).toEqual([]);
  });
});

describe("OLA Y — el PROTOCOLO nunca es el objeto neutro (`isProtocolRootType` / `isDeclaredInterfaceType`)", () => {
  const FILE = "t.go";

  /** `T` califica por lo demás (un miembro sin fan-out, un sitio que lo instancia); `overrides` la convierte en protocolo. */
  function grafoConProtocolo(overrides: Partial<CodeGraphNode>, extraEdges: readonly CodeGraphEdge[] = []): CodeGraph {
    const t = sym(FILE, ["T"], { startLine: 1, endLine: 3, ...overrides });
    const m = method(FILE, "T", "m", 0, { startLine: 2, endLine: 2 });
    const site = sym(FILE, ["build"], { family: "function-like", arity: 0, startLine: 10, endLine: 11 });
    return graphOf([t, m, site], [...containsAll(t.id, [m.id]), edge(site.id, t.id, "instantiates"), ...extraEdges]);
  }

  it("control: sin ninguna marca de protocolo, `T` SÍ es candidato PARCIAL", () => {
    expect(findNullObjectStructuralCandidates(grafoConProtocolo({}))).toHaveLength(1);
  });

  it("alguien lo EXTIENDE (la forma de `guava/Ticker`, clase abstracta con `SystemTicker` debajo) ⇒ no es candidato: es la raíz de la jerarquía", () => {
    const sub = sym("sub.go", ["Sub"], { startLine: 1, endLine: 2 });
    const graph = grafoConProtocolo({});
    const conSub = graphOf([...graph.nodes, sub], [...graph.edges, edge(sub.id, symbolNodeId(FILE, ["T"]), "extends")]);
    expect(findNullObjectStructuralCandidates(conSub)).toEqual([]);
  });

  it("alguien lo IMPLEMENTA (la forma de `guava/TestSetGenerator`) ⇒ no es candidato", () => {
    const impl = sym("impl.go", ["Impl"], { startLine: 1, endLine: 2 });
    const graph = grafoConProtocolo({});
    const conImpl = graphOf([...graph.nodes, impl], [...graph.edges, edge(impl.id, symbolNodeId(FILE, ["T"]), "implements")]);
    expect(findNullObjectStructuralCandidates(conImpl)).toEqual([]);
  });

  it("la GRAMÁTICA lo declaró interfaz (`nodeType: interface_declaration`, Java/C#/TS) ⇒ no es candidato aunque nadie la implemente DENTRO del repo", () => {
    expect(findNullObjectStructuralCandidates(grafoConProtocolo({ nodeType: "interface_declaration" }))).toEqual([]);
  });

  it("la GRAMÁTICA lo declaró interfaz en la forma de Go (`nodeType: type_spec` + `shapeNodeType: interface_type`) ⇒ no es candidato", () => {
    expect(findNullObjectStructuralCandidates(grafoConProtocolo({ nodeType: "type_spec", shapeNodeType: "interface_type" }))).toEqual([]);
  });

  it("`nodeType` de una CLASE no excluye — la exclusión es por la forma declarada, no por tener `nodeType`", () => {
    expect(findNullObjectStructuralCandidates(grafoConProtocolo({ nodeType: "class_declaration" }))).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 4. `NULL_OBJECT_STRUCTURAL_SPEC` vía `engine.build()`
 * ──────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────
 * OLA Y (Y1) — ÁRBOL VIVO PARA LA RUTA (1). Hasta esta ola estos tests
 * pasaban `fileAt: () => null` con el comentario "exactamente el cableado
 * real de hoy". **Esa premisa está falsada desde la Ola G**: R1 (Ola D) hizo
 * que `crossAnalyze` reparse bajo demanda todo archivo tocado por la
 * evidencia de un `Finding` inter-file, y las dos anclas de esta hipótesis
 * SON inter-file. Y ahora importa, porque `memberBodyVerdict` exige ver el
 * cuerpo antes de afirmar que está vacío: sin árbol no hay afirmación.
 * ──────────────────────────────────────────────────────────────────────── */

/** `fileAt` real: parsea cada fuente con su gramática y devuelve el `FileUnit` por ruta. */
async function liveFileAt(sources: Readonly<Record<string, { wasm: string; probe: string; src: string; language: string }>>): Promise<(path: string) => ReturnType<typeof fileUnitFrom> | null> {
  const units = new Map<string, ReturnType<typeof fileUnitFrom>>();
  for (const [path, s] of Object.entries(sources)) {
    const sets = await nodeSetsFor(s.wasm, s.probe);
    const root = await parseRoot(s.wasm, s.src);
    units.set(path, fileUnitFrom(root, sets, s.language, { file: path }));
  }
  return (path) => units.get(path) ?? null;
}

/** `logging.ts` con el cuerpo REAL del método vacío de `NoOpLogger` — las líneas coinciden con las del grafo sintético de `completeCandidateGraph`. */
const LOGGING_TS_SRC = `interface Logger { log(m: string): void; }

class NoOpLogger implements Logger {
  log(m: string) {}
}
`;
const TS_PROBE = `class P { m(x: number) { return x; } }`;

async function loggingFileAt() {
  return liveFileAt({ "logging.ts": { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, src: LOGGING_TS_SRC, language: "typescript" } });
}

function completeCandidateGraph(): { graph: CodeGraph; nullLogger: CodeGraphNode; site: CodeGraphNode; log: CodeGraphNode } {
  const file = "logging.ts";
  const iface = sym(file, ["Logger"], { family: "namespace-like" });
  const ifaceLog = method(file, "Logger", "log", 1);
  // OLA Y (Y1): la ruta (1) exige SOLAPAMIENTO DE RANGO con la evidencia del
  // ancla, así que el tipo nulo y su sitio de sustitución tienen que tener
  // posición declarada para poder solapar con nada.
  const nullLogger = sym(file, ["NoOpLogger"], { startLine: 3, endLine: 5 });
  const log = method(file, "NoOpLogger", "log", 1, { startLine: 4, endLine: 4 });
  const site = sym(file, ["createLogger"], { family: "function-like", arity: 1, startLine: 20, endLine: 24 });
  const graph = graphOf(
    [iface, ifaceLog, nullLogger, log, site],
    [...containsAll(iface.id, [ifaceLog.id]), ...containsAll(nullLogger.id, [log.id]), edge(nullLogger.id, iface.id, "implements"), edge(site.id, nullLogger.id, "instantiates")],
  );
  return { graph, nullLogger, site, log };
}

describe("NULL_OBJECT_STRUCTURAL_SPEC — el motor", () => {
  it("COMPLETA ⇒ ya-aplicado, confidence null (no compite en el ranking) aunque los discriminadores no confirmen", () => {
    const { graph } = completeCandidateGraph();
    const candidate = findNullObjectStructuralCandidates(graph)[0]!;
    const index = buildNullObjectIndex(graph);
    const outcome = engineBuild(NULL_OBJECT_STRUCTURAL_SPEC, new Set(), { candidate, index, functions: [] }, undefined)!;
    expect(outcome.state).toBe("ya-aplicado");
    expect(outcome.confidence).toBeNull();
    const applied = outcome.checks.find((c) => c.role === "applied" && c.passed)!;
    expect(applied.label).toContain("COMPLETA");
  });

  it("PARCIAL ⇒ estado parcial, confidence NO null — compite en el ranking como sugerencia", () => {
    const file = "app.rb";
    const guestUser = sym(file, ["GuestUser"]);
    const greeting = method(file, "GuestUser", "greeting", 0);
    const site1 = sym(file, ["currentUser"], { family: "function-like", arity: 0 });
    const graph = graphOf([guestUser, greeting, site1], [...containsAll(guestUser.id, [greeting.id]), edge(site1.id, guestUser.id, "instantiates")]);
    const candidate = findNullObjectStructuralCandidates(graph)[0]!;
    const index = buildNullObjectIndex(graph);
    const outcome = engineBuild(NULL_OBJECT_STRUCTURAL_SPEC, new Set(), { candidate, index, functions: [] }, undefined)!;
    expect(outcome.state).toBe("parcial");
    expect(outcome.confidence).not.toBeNull();
    const applied = outcome.checks.find((c) => c.role === "applied" && c.passed)!;
    expect(applied.label).toContain("PARCIAL");
  });

  it("discriminador multiple-instantiation-sites: >=2 sitios sube la escalera", () => {
    const { graph, nullLogger } = completeCandidateGraph();
    const secondSite = sym("other.ts", ["fallbackLogger"], { family: "function-like", arity: 0 });
    const graphWithTwoSites: CodeGraph = { ...graph, nodes: [...graph.nodes, secondSite], edges: [...graph.edges, edge(secondSite.id, nullLogger.id, "instantiates")] };
    const candidate = findNullObjectStructuralCandidates(graphWithTwoSites).find((c) => c.form === "parcial" || c.form === "completa")!;
    const index = buildNullObjectIndex(graphWithTwoSites);
    const outcome = engineBuild(NULL_OBJECT_STRUCTURAL_SPEC, new Set(), { candidate, index, functions: [] }, undefined)!;
    const multi = outcome.discriminators.find((d) => d.label.includes("Más de un sitio"))!;
    expect(multi.passed).toBe(true);
  });

  it("discriminador clients-call-without-null-check: llamador real SIN chequeo de ausente en su cadena ⇒ confirma", () => {
    const { graph, log } = completeCandidateGraph();
    const caller = sym("client.ts", ["report"], { family: "function-like", arity: 0 });
    const graphWithCall: CodeGraph = { ...graph, nodes: [...graph.nodes, caller], edges: [...graph.edges, edge(caller.id, log.id, "calls")] };
    const candidate = findNullObjectStructuralCandidates(graphWithCall)[0]!;
    const index = buildNullObjectIndex(graphWithCall);
    const functions: readonly RepoFunctionUnit[] = [
      {
        file: "client.ts",
        language: "typescript",
        name: "report",
        startLine: 1,
        endLine: 3,
        symbolPath: ["report"],
        sets: {
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
        metrics: { branches: 0, chain: 0, cognitive: 0, maxNesting: 0, parameters: 0, chainHasNullCheck: false, chainInstantiates: false, className: null, isConstructor: false, isFactoryLike: false },
      },
    ];
    const outcome = engineBuild(NULL_OBJECT_STRUCTURAL_SPEC, new Set(), { candidate, index, functions }, undefined)!;
    const clientsCheck = outcome.discriminators.find((d) => d.label.includes("chainHasNullCheck"))!;
    expect(clientsCheck.passed).toBe(true);
    expect(clientsCheck.why).toContain("client.ts#report");
  });

  it("discriminador clients-call-without-null-check: `repo.functions` VACÍO (el cableado de producción de hoy) ⇒ no confirma, DECLARADO como no verificado (ni a favor ni en contra)", () => {
    const { graph, log } = completeCandidateGraph();
    const caller = sym("client.ts", ["report"], { family: "function-like", arity: 0 });
    const graphWithCall: CodeGraph = { ...graph, nodes: [...graph.nodes, caller], edges: [...graph.edges, edge(caller.id, log.id, "calls")] };
    const candidate = findNullObjectStructuralCandidates(graphWithCall)[0]!;
    const index = buildNullObjectIndex(graphWithCall);
    const outcome = engineBuild(NULL_OBJECT_STRUCTURAL_SPEC, new Set(), { candidate, index, functions: [] }, undefined)!;
    const clientsCheck = outcome.discriminators.find((d) => d.label.includes("chainHasNullCheck"))!;
    expect(clientsCheck.passed).toBe(false);
    expect(clientsCheck.why).toContain("se pudo resolver");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 5. `nullObject.build()` end-to-end
 * ──────────────────────────────────────────────────────────────────────── */

function fakeThreshold() {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), {
    language: "ruby",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function fakeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    detectorId: "distributed-duplication",
    kind: "distributed-duplication",
    scope: "inter-file",
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 3, threshold: fakeThreshold() }],
    locations: [
      { file: "a.rb", startLine: 1, endLine: 5, role: "copia #1" },
      { file: "b.rb", startLine: 1, endLine: 5, role: "copia #2" },
    ],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<RepoUnit> = {}): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones: [], graph: null, ...overrides };
}

describe("nullObject.build — comportamiento de HOY: ctx.file/ctx.fileAt siempre null en crossAnalyze", () => {
  it("sin NINGÚN árbol vivo (el cableado real hoy) ⇒ null — comportamiento ESPERADO, no un bug latente", () => {
    const ctx: HypothesisContext = {
      file: null,
      fileAt: () => null,
      repo: fakeRepo({ files: [{ path: "a.rb", lines: 10, language: "ruby" }, { path: "b.rb", lines: 10, language: "ruby" }] }),
      capabilities: new Set(),
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
    expect(nullObject.build(fakeFinding(), null, ctx)).toBeNull();
  });
});

describe("nullObject.build — con árboles vivos (futuro), la lógica migrada SÍ encuentra el caso que la regla vieja encontraba", () => {
  it("3 clases no relacionadas con el mismo guard disperso ⇒ hipótesis ausente con sus 3 lugares", async () => {
    const sets = await rubySets();
    const rootA = await parseRoot(
      "tree-sitter-ruby.wasm",
      `class DashboardController
  def greeting
    return "Hola, invitado" if @current_user.nil?
  end
end`,
    );
    const rootB = await parseRoot(
      "tree-sitter-ruby.wasm",
      `class BillingController
  def show_plan
    return "Sin plan" if @current_user.nil?
  end
end`,
    );
    const rootC = await parseRoot(
      "tree-sitter-ruby.wasm",
      `class AuditLogger
  def record_visit(current_user)
    return if current_user.nil?
  end
end`,
    );
    const files = new Map([
      ["a.rb", { path: "a.rb", language: "ruby", lines: 3, root: rootA, sets, functions: [] }],
      ["b.rb", { path: "b.rb", language: "ruby", lines: 3, root: rootB, sets, functions: [] }],
      ["c.rb", { path: "c.rb", language: "ruby", lines: 3, root: rootC, sets, functions: [] }],
    ]);
    const ctx: HypothesisContext = {
      file: null,
      fileAt: (path) => files.get(path) ?? null,
      repo: fakeRepo({ files: [...files.keys()].map((path) => ({ path, lines: 3, language: "ruby" })) }),
      capabilities: new Set(["unidad-tipo-clase"]),
      setsFor: () => sets,
      neighborhood: EMPTY_NEIGHBORHOOD,
      branches: () => null,
    };
    const finding = fakeFinding({ locations: [{ file: "a.rb", startLine: 1, endLine: 3, role: "copia #1" }] });
    const hypothesis = nullObject.build(finding, null, ctx);
    expect(hypothesis).not.toBeNull();
    expect(hypothesis!.pattern).toBe("Null Object");
    expect(hypothesis!.state).toBe("ausente");
    expect(hypothesis!.places).toHaveLength(3);
    expect(hypothesis!.anchorFindingId).toBe("f1");
  });

  /**
   * OLA X (B6) — SEGUNDA ANCLA `duplication`. Mismo escenario que el test de
   * arriba, mismo árbol, misma evidencia — la única diferencia es
   * `kind: "duplication"` en vez de `"distributed-duplication"`. `build()` es
   * genérico sobre `problem: Finding` (no inspecciona `kind` en ningún
   * punto, ver el docstring del módulo): si el ancla nueva está bien
   * declarada en `anchors`, este test tiene que dar EXACTAMENTE el mismo
   * resultado que el de arriba, sin ningún camino de código nuevo.
   */
  it("OLA X (B6) — el ancla `duplication` dispara la MISMA ruta (2) que `distributed-duplication`, sin ninguna rama nueva", async () => {
    const sets = await rubySets();
    const rootA = await parseRoot(
      "tree-sitter-ruby.wasm",
      `class DashboardController
  def greeting
    return "Hola, invitado" if @current_user.nil?
  end
end`,
    );
    const rootB = await parseRoot(
      "tree-sitter-ruby.wasm",
      `class BillingController
  def show_plan
    return "Sin plan" if @current_user.nil?
  end
end`,
    );
    const rootC = await parseRoot(
      "tree-sitter-ruby.wasm",
      `class AuditLogger
  def record_visit(current_user)
    return if current_user.nil?
  end
end`,
    );
    const files = new Map([
      ["a.rb", { path: "a.rb", language: "ruby", lines: 3, root: rootA, sets, functions: [] }],
      ["b.rb", { path: "b.rb", language: "ruby", lines: 3, root: rootB, sets, functions: [] }],
      ["c.rb", { path: "c.rb", language: "ruby", lines: 3, root: rootC, sets, functions: [] }],
    ]);
    const ctx: HypothesisContext = {
      file: null,
      fileAt: (path) => files.get(path) ?? null,
      repo: fakeRepo({ files: [...files.keys()].map((path) => ({ path, lines: 3, language: "ruby" })) }),
      capabilities: new Set(["unidad-tipo-clase"]),
      setsFor: () => sets,
      neighborhood: EMPTY_NEIGHBORHOOD,
      branches: () => null,
    };
    const finding = fakeFinding({
      detectorId: "duplication",
      kind: "duplication",
      locations: [{ file: "a.rb", startLine: 1, endLine: 3, role: "copia #1" }],
    });
    const hypothesis = nullObject.build(finding, null, ctx);
    expect(hypothesis).not.toBeNull();
    expect(hypothesis!.pattern).toBe("Null Object");
    expect(hypothesis!.state).toBe("ausente");
    expect(hypothesis!.places).toHaveLength(3);
    expect(hypothesis!.anchorFindingId).toBe("f1");
  });

  /**
   * OLA G, integrador — BUG 1, LA MITAD QUE SEGUÍA ABIERTA. Esta ruta se creía
   * inerte en producción y por eso su filtro de localidad usaba el VECINDARIO
   * a un salto. No estaba inerte (R1 dejó `ctx.fileAt` resolviendo para todo
   * ancla inter-file, y `distributed-duplication` lo es) y el vecindario, en
   * un repo real, conecta casi cualquier par de archivos: medido, producía 4
   * hipótesis en `corpus/newtonsoft-json` y 4 en `Visability/Frontend` cuyas
   * `places` no tenían NADA que ver con el `where` del hallazgo ancla.
   *
   * El caso de acá es exactamente ése, en miniatura: el concepto disperso
   * (`@current_user`) vive en a.rb/b.rb/c.rb; el hallazgo ancla vive en
   * `otro.rb`, que no tiene ninguna ocurrencia — y un peer del vecindario
   * conecta `otro.rb` con `a.rb`. Antes esto emitía una recomendación sobre
   * a/b/c mostrando `otro.rb` como evidencia; ahora no emite nada.
   */
  it("OLA G — el concepto disperso tiene que tocar un archivo PROPIO del hallazgo ancla: un vínculo por vecindario ya NO alcanza", async () => {
    const sets = await rubySets();
    const src = (klass: string) => `class ${klass}
  def greeting
    return "Hola, invitado" if @current_user.nil?
  end
end`;
    const files = new Map(
      await Promise.all(
        (["a.rb", "b.rb", "c.rb"] as const).map(async (path, i) => {
          const root = await parseRoot("tree-sitter-ruby.wasm", src(`Controller${i}`));
          return [path, { path, language: "ruby", lines: 3, root, sets, functions: [] }] as const;
        }),
      ),
    );
    const finding = fakeFinding({ locations: [{ file: "otro.rb", startLine: 1, endLine: 3, role: "copia #1" }] });
    const peer: Finding = fakeFinding({
      id: "f-peer",
      kind: "unused-symbol",
      locations: [
        { file: "otro.rb", startLine: 10, endLine: 12, role: "n/a" },
        { file: "a.rb", startLine: 1, endLine: 2, role: "n/a" },
      ],
    });
    const ctx: HypothesisContext = {
      file: null,
      fileAt: (path) => files.get(path as "a.rb") ?? null,
      repo: fakeRepo({ files: [...files.keys()].map((path) => ({ path, lines: 3, language: "ruby" })) }),
      capabilities: new Set(["unidad-tipo-clase"]),
      setsFor: () => sets,
      neighborhood: neighborhoodFor(buildNeighborhoodIndex(null, [finding, peer], null), finding),
      branches: () => null,
    };
    expect(nullObject.build(finding, null, ctx)).toBeNull();

    // Segundo escalón del mismo defecto, y el que sobrevivía a "mismo
    // archivo" a secas: el ancla SÍ apunta a `a.rb`, pero a una región (las
    // líneas 40-48) que no contiene ningún guard — el guard está en la línea
    // 3. Es el caso real de `JsonObjectContract.cs` en newtonsoft-json: el
    // archivo coincide, lo duplicado es otra cosa. Si lo que se recomienda
    // extraer es la repetición de un guard, ese guard tiene que estar DENTRO
    // de las copias que el ancla reporta.
    const mismoArchivoOtraRegion = fakeFinding({
      id: "f-lejos",
      locations: [{ file: "a.rb", startLine: 40, endLine: 48, role: "copia #1" }],
    });
    expect(nullObject.build(mismoArchivoOtraRegion, null, { ...ctx, neighborhood: EMPTY_NEIGHBORHOOD })).toBeNull();

    // Control positivo, para que este test no pase por estar todo apagado: el
    // MISMO grafo de archivos, con el ancla sobre la región que sí contiene el
    // guard, sigue emitiendo la hipótesis con sus 3 lugares.
    const sobreLaEvidencia = fakeFinding({
      id: "f-cerca",
      locations: [{ file: "a.rb", startLine: 1, endLine: 5, role: "copia #1" }],
    });
    const viva = nullObject.build(sobreLaEvidencia, null, { ...ctx, neighborhood: EMPTY_NEIGHBORHOOD });
    expect(viva).not.toBeNull();
    expect(viva!.state).toBe("ausente");
    expect(viva!.places).toHaveLength(3);
  });
});

describe("nullObject.build — ruta (1) ESTRUCTURAL: produce ya-aplicado/parcial HOY, en producción, SIN ningún árbol vivo", () => {
  it("grafo real con un candidato COMPLETA, cuerpo vacío VERIFICADO por AST, y el `Finding` ancla SOLAPA EN RANGO con el tipo nulo ⇒ ya-aplicado", async () => {
    const { graph } = completeCandidateGraph();
    const ctx: HypothesisContext = {
      file: null,
      fileAt: await loggingFileAt(),
      repo: fakeRepo({ graph }),
      capabilities: new Set(),
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
    // `graph` llega por el SEGUNDO parámetro, tal como `run.ts` hace con `input.repo.graph` — no por `ctx.file`.
    // OLA Y (Y1): la localidad exige que lo que el ancla reporta como
    // duplicado caiga DENTRO del tipo nulo ("logging.ts" 3-6, ver
    // `completeCandidateGraph`) o dentro de un sitio que lo sustituye — acá la
    // copia #1 (1-5) solapa con el tipo nulo (3-6).
    const finding = fakeFinding({
      locations: [
        { file: "logging.ts", startLine: 1, endLine: 5, role: "copia #1" },
        { file: "other.rb", startLine: 1, endLine: 5, role: "copia #2" },
      ],
    });
    const hypothesis = nullObject.build(finding, graph, ctx);
    expect(hypothesis).not.toBeNull();
    expect(hypothesis!.state).toBe("ya-aplicado");
    expect(hypothesis!.confidence).toBeNull();
  });

  /**
   * REVISIÓN (frente "tres bugs de mecanismo", bug 1) — reemplaza el test
   * "FALLBACK GLOBAL" de la revisión anterior, que afirmaba lo CONTRARIO
   * (`not.toBeNull()`, `state: "ya-aplicado"`) para esta misma forma de
   * escenario. Medido AHORA sobre Rails real con esa preferencia YA en
   * producción (`analyzeRepo` real, ver docstring de `orderByLocality`/
   * `restrictToRelated` más arriba): el único `distributed-duplication` del
   * repo (dos migraciones de índice) SÍ producía una hipótesis "Null Object:
   * parcial", pero sus `places` apuntaban a
   * `app/controllers/concerns/rack_sessions_fix.rb#FakeRackSession` — CERO
   * relación con las migraciones que el `Finding` ancla reporta como
   * evidencia. Verificado a mano abriendo los dos archivos: el razonamiento
   * completo describe un candidato y el `where` que el producto muestra es
   * otro. Es la peor clase de error (apunta a un lugar que no tiene nada que
   * ver, no una recomendación equivocada) — preferible el silencio total de
   * ESTE test a esa ubicación ajena. La localidad vuelve a ser un REQUISITO:
   * sin ningún candidato relacionado con `problem`, `build()` ya no cae al
   * candidato disponible — devuelve `null`.
   */
  it("SIN CANDIDATO RELACIONADO: grafo real con un candidato COMPLETA, el `Finding` ancla NO toca su archivo ni comparte vecindario con él, y NO hay ningún otro candidato relacionado ⇒ null (silencio, nunca una ubicación sin relación con la evidencia)", async () => {
    const { graph } = completeCandidateGraph();
    const ctx: HypothesisContext = {
      file: null,
      fileAt: await loggingFileAt(),
      repo: fakeRepo({ graph }),
      capabilities: new Set(),
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
    // fakeFinding() por defecto: locations en a.rb/b.rb — sin relación con "logging.ts".
    const hypothesis = nullObject.build(fakeFinding(), graph, ctx);
    expect(hypothesis).toBeNull();
  });

  it("REQUISITO DE LOCALIDAD: con un candidato relacionado Y uno sin relación disponibles, gana el relacionado (el sin relación queda FILTRADO, no sólo relegado) aunque aparezca primero en el orden determinista", async () => {
    // El id de cada candidato es `sym:<file>#<Tipo>` (`symbolNodeId`) — el
    // orden determinista de `findNullObjectStructuralCandidates` compara ESE
    // id completo (ambos PARCIAL), así que el nombre de archivo decide: "aaa_"
    // < "zzz_" pone el candidato SIN relación primero si no hubiera preferencia.
    const file = "zzz_related.rb";
    const guestUser = sym(file, ["RelatedGuest"], { startLine: 1, endLine: 4 });
    const greeting = method(file, "RelatedGuest", "greeting", 0, { startLine: 2, endLine: 3 });
    const site = sym(file, ["buildGuest"], { family: "function-like", arity: 0, startLine: 20, endLine: 22 });

    const unrelatedFile = "aaa_unrelated.rb";
    const aaaUnrelated = sym(unrelatedFile, ["UnrelatedGuest"], { startLine: 1, endLine: 4 });
    const unrelatedGreeting = method(unrelatedFile, "UnrelatedGuest", "greeting", 0, { startLine: 2, endLine: 3 });
    const unrelatedSite = sym(unrelatedFile, ["buildOther"], { family: "function-like", arity: 0, startLine: 20, endLine: 22 });

    const graph = graphOf(
      [guestUser, greeting, site, aaaUnrelated, unrelatedGreeting, unrelatedSite],
      [
        ...containsAll(guestUser.id, [greeting.id]),
        edge(site.id, guestUser.id, "instantiates"),
        ...containsAll(aaaUnrelated.id, [unrelatedGreeting.id]),
        edge(unrelatedSite.id, aaaUnrelated.id, "instantiates"),
      ],
    );
    expect(findNullObjectStructuralCandidates(graph).map((c) => c.nullTypeId)).toEqual([aaaUnrelated.id, guestUser.id]);

    const rbSrc = (klass: string) => `class ${klass}\n  def greeting\n  end\nend\n`;
    const ctx: HypothesisContext = {
      file: null,
      fileAt: await liveFileAt({
        [file]: { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, src: rbSrc("RelatedGuest"), language: "ruby" },
        [unrelatedFile]: { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, src: rbSrc("UnrelatedGuest"), language: "ruby" },
      }),
      repo: fakeRepo({ graph }),
      capabilities: new Set(),
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
    const finding = fakeFinding({ locations: [{ file, startLine: 1, endLine: 3, role: "copia #1" }] });
    const hypothesis = nullObject.build(finding, graph, ctx);
    expect(hypothesis).not.toBeNull();
    expect(hypothesis!.places[0]!.file).toBe(file);
  });

  /**
   * *** OLA Y (Y1) — ESTE TEST AFIRMABA LO CONTRARIO Y ERA LA COBERTURA FALSA.
   * Hasta esta ola la ruta (1) aceptaba la localidad por VECINDARIO a un
   * salto: bastaba con que OTRO hallazgo cualquiera compartiera archivo o
   * símbolo para conectar el ancla con el tipo nulo. Medido en repo real (Ola
   * G, para la ruta (2)): ese salto alcanza 941 archivos en newtonsoft, así
   * que "estar relacionado" no restringe nada; y medido por el integrador de
   * la Ola X sobre las 282 recomendaciones que la segunda ancla trajo, produce
   * **0 de 20 verdaderas** — un ancla en `hugolib/hugo_sites.go:380`
   * recomendando formalizar `cache/dynacache/dynacache.go#OptionsPartition`,
   * otro paquete.
   *
   * Ahora la ruta (1) exige lo mismo que la (2) desde la Ola G: SOLAPAMIENTO
   * DE RANGO con la evidencia del propio ancla. El escenario de acá —el ancla
   * en "guard.rb", el tipo nulo en "logging.ts", unidos sólo por un peer— es
   * exactamente el que ya no emite.
   */
  it("OLA Y — el vecindario a un salto ya NO alcanza para la ruta (1): un peer que conecta los dos archivos no basta ⇒ null", async () => {
    const { graph } = completeCandidateGraph();
    const finding = fakeFinding({ locations: [{ file: "guard.rb", startLine: 1, endLine: 5, role: "copia #1" }] });
    const peer: Finding = fakeFinding({
      id: "f-peer",
      kind: "unused-symbol",
      locations: [
        { file: "guard.rb", startLine: 10, endLine: 12, role: "n/a" },
        { file: "logging.ts", startLine: 1, endLine: 2, role: "n/a" },
      ],
    });
    const neighborhoodIndex = buildNeighborhoodIndex(null, [finding, peer], null);
    const ctx: HypothesisContext = {
      file: null,
      fileAt: await loggingFileAt(),
      repo: fakeRepo({ graph }),
      capabilities: new Set(),
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
      neighborhood: neighborhoodFor(neighborhoodIndex, finding),
      branches: () => null,
    };
    expect(nullObject.build(finding, graph, ctx)).toBeNull();

    // Control positivo, para que este test no pase por estar todo apagado: el
    // MISMO grafo y el MISMO vecindario, con el ancla sobre el rango del tipo
    // nulo (logging.ts 3-6), siguen emitiendo.
    const sobreElTipo = fakeFinding({ id: "f-sobre", locations: [{ file: "logging.ts", startLine: 4, endLine: 5, role: "copia #1" }] });
    const viva = nullObject.build(sobreElTipo, graph, ctx);
    expect(viva).not.toBeNull();
    expect(viva!.state).toBe("ya-aplicado");
  });

  it("sin grafo Y sin árboles vivos ⇒ null (ninguna de las dos rutas tiene evidencia)", () => {
    const ctx: HypothesisContext = {
      file: null,
      fileAt: () => null,
      repo: fakeRepo(),
      capabilities: new Set(),
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
    expect(nullObject.build(fakeFinding(), null, ctx)).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * OLA AE (AE10) — LA RUTA DEL ANCLA-FUERZA, `repeated-absence-check`.
 *
 * Los seis tests de acá cubren: el camino nuevo entero (`ausente`), el
 * peldaño `parcial`, los tres `required` que NO aprueban por no poder mirar,
 * el silencio cuando el `variant` no reconstruye ningún candidato, y —el más
 * importante para la regla de esta ola— que EL CAMINO VIEJO SIGUE INTACTO
 * cuando el ancla es una de las dos de siempre.
 * ════════════════════════════════════════════════════════════════════════ */

function clonAE10(file: string, fn: string, texto: string, className: string | null = null): RepoUnit["clones"][number] {
  return {
    fingerprint: `${file}:${fn}`,
    file,
    startLine: 10,
    endLine: 20,
    nodes: 40,
    type: "method_declaration",
    functionName: fn,
    className,
    superclassName: null,
    normalized: texto.replace(/\s+/g, " ").trim(),
  };
}

function protocoloAE10(): CodeGraphNode[] {
  return [
    { ...sym("dominio/socio.ts", ["Socio", "nombreVisible"]), family: "function-like", memberOfClassLike: true, startLine: 1, endLine: 2 },
    { ...sym("dominio/socio.ts", ["Socio", "enlace"]), family: "function-like", memberOfClassLike: true, startLine: 4, endLine: 5 },
  ];
}

function clientesAE10(): RepoUnit["clones"] {
  return [
    clonAE10("web/uno.ts", "uno", "function uno(ctx) { if (ctx.socio == null) { return ''; } return ctx.socio.nombreVisible(); }"),
    clonAE10("web/dos.ts", "dos", "function dos(ctx) { if (ctx.socio == null) { throw new Error('x'); } return ctx.socio.enlace(); }"),
    clonAE10("web/tres.ts", "tres", "function tres(ctx) { if (ctx.socio == null) { fallback(); } return ctx.socio.nombreVisible(); }"),
    clonAE10("web/cuatro.ts", "cuatro", "function cuatro(ctx) { if (ctx.socio == null) { log('sin'); } return ctx.socio.enlace(); }"),
  ];
}

function ctxAE10(repo: RepoUnit): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo,
    capabilities: new Set(),
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

function findingAE10(variant: string): Finding {
  return fakeFinding({
    id: "ae10-1",
    detectorId: "repeated-absence-check",
    kind: "repeated-absence-check",
    variant,
    locations: [{ file: "web/uno.ts", startLine: 10, endLine: 20, role: "chequea la ausencia" }],
  });
}

describe("OLA AE (AE10) — la ruta del ancla-fuerza `repeated-absence-check`", () => {
  it("cuatro clientes en cuatro archivos, sin ningún objeto neutro ⇒ hipótesis `ausente` con sus lugares", () => {
    const graph = graphOf(protocoloAE10(), []);
    const repo = fakeRepo({ clones: clientesAE10(), graph });
    const h = nullObject.build(findingAE10("ctx.socio"), graph, ctxAE10(repo));
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Null Object");
    expect(h!.state).toBe("ausente");
    expect(h!.places.map((p) => p.file).sort()).toEqual(["web/cuatro.ts", "web/dos.ts", "web/tres.ts", "web/uno.ts"]);
    expect(h!.cost).toContain("nombreVisible");
  });

  it("con MEDIA PUERTA (un tipo neutro que ya cubre parte del protocolo) ⇒ `parcial`, no `ausente`", () => {
    const tipo = { ...sym("dominio/neutro.ts", ["SocioNeutro"]), family: "class-like" as const, startLine: 1, endLine: 6 };
    const m1 = { ...sym("dominio/neutro.ts", ["SocioNeutro", "nombreVisible"]), family: "function-like" as const, memberOfClassLike: true, startLine: 2, endLine: 3 };
    const graph = graphOf([...protocoloAE10(), tipo, m1], [edge(tipo.id, m1.id, "contains")]);
    const repo = fakeRepo({ clones: clientesAE10(), graph });
    const h = nullObject.build(findingAE10("ctx.socio"), graph, ctxAE10(repo));
    expect(h!.state).toBe("parcial");
    expect(h!.places.some((p) => p.role.includes("a medias"))).toBe(true);
  });

  it("los `required` NO aprueban por no poder mirar: sin protocolo en el grafo el detector ni construye el candidato ⇒ null", () => {
    const graph = graphOf([sym("otro/cosa.ts", ["algoDistinto"])], []);
    const repo = fakeRepo({ clones: clientesAE10(), graph });
    expect(nullObject.build(findingAE10("ctx.socio"), graph, ctxAE10(repo))).toBeNull();
  });

  it("un `variant` que no reconstruye ningún candidato ⇒ null, no se inventa uno", () => {
    const graph = graphOf(protocoloAE10(), []);
    const repo = fakeRepo({ clones: clientesAE10(), graph });
    expect(nullObject.build(findingAE10("ctx.inexistente"), graph, ctxAE10(repo))).toBeNull();
  });

  it("sin grafo ⇒ null (la ruta nueva no tiene con qué anclar el colaborador)", () => {
    const repo = fakeRepo({ clones: clientesAE10(), graph: null });
    expect(nullObject.build(findingAE10("ctx.socio"), null, ctxAE10(repo))).toBeNull();
  });

  it("EL CAMINO VIEJO SIGUE INTACTO: con el ancla `distributed-duplication` la ruta nueva ni se toca", () => {
    const graph = graphOf(protocoloAE10(), []);
    const repo = fakeRepo({ clones: clientesAE10(), graph });
    // Mismo repo, mismo grafo, mismos clones — pero el `kind` es el viejo, así
    // que `build()` cae en las rutas (1)/(2) de siempre y ahí no hay evidencia.
    expect(nullObject.build(fakeFinding(), graph, ctxAE10(repo))).toBeNull();
  });
});
