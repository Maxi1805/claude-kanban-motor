/**
 * `hypotheses/factory-method.ts` — Ola 10, CONTRATO-F10.md.
 *
 * Reemplaza el test de la Ola 9 (que ejercitaba `FACTORY_NAME_LIKE`, el
 * vocabulario ya retirado del archivo bajo prueba). Las tres formas viven
 * en `appliedState`/`computeAstFamily`/`computeGraphFamily`: acá se
 * ejercitan con árboles REALES (`fileUnitFrom`/`nodeSetsFor`/`parseRoot`,
 * mismo arnés que `prototype.test.ts`/`null-object.test.ts`) para la
 * fuente que de verdad corre en producción para esta ancla (ver el
 * docstring del módulo: `ctx.fileAt(mismo archivo)` SÍ tiene árbol vivo
 * cuando `conditional-chain` es la ancla, a diferencia de las anclas
 * inter-file de esas dos hipótesis), y con un `CodeGraph` sintético
 * (mismo estilo que `wrapping-chain.test.ts`) para la fuente por grafo,
 * hoy inerte en producción pero conservada y probada.
 *
 * VERIFICACIÓN CONTRA LA FIXTURE CANÓNICA (requisito 4 del encargo): el
 * grupo "fixture canónica real" lee, sin modificarlo, el archivo real de
 * `tests/fixtures/patterns/factory_method_override/*` — la MISMA fixture
 * de las 101 canónicas de patrones ya aplicados — y arma un `Finding`
 * SINTÉTICO de `conditional-chain` (`variant: "instantiates"`) apuntando a
 * uno de sus métodos reales, exactamente como `prototype.test.ts#
 * fakeAnchorFinding`/`null-object.test.ts` ya hacen para sus propias
 * anclas inter-file. Es la única forma honesta de probar esto: medido por
 * sonda (`analyzeRepo` real sobre esa fixture, ver el resultado final de
 * la tarea), esta fixture NO tiene ningún condicional de ≥5 ramas — es
 * código ya bien aplicado, sin el olor que `conditional-chain` busca — así
 * que el detector real NUNCA dispara ahí. Con el ancla no propia
 * (CONTRATO-F10.md: "sigue colgando de su ancla actual"), la única forma
 * de ejercitar el excluder ESTRUCTURAL contra esta fixture real es
 * sintetizar el hallazgo ancla, igual que ya hacen las dos hipótesis
 * hermanas. No se modifica ningún archivo de `tests/fixtures/patterns/` ni
 * de `tests/fixtures/patterns-positive/` (ambos comparten dueño con otros
 * consumidores — `tests/golden/fixtures-multi.census.json` congela sus
 * conteos).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS, type LanguageDecl } from "../code-analyzer.js";
import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileUnit, FunctionUnit, RepoFunctionUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { hypothesis } from "./factory-method.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Arnés compartido
 * ──────────────────────────────────────────────────────────────────────── */
function fakeThreshold(value = 5): Threshold {
  return resolveThreshold(pisoDeclarado(value, { rationale: "test" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

const EMPTY_SETS = {
  functionNodes: new Set<string>(),
  branchNodes: new Set<string>(),
  chainNodes: new Set<string>(),
  cloneNodes: new Set<string>(),
  classNodes: new Set<string>(),
  nestingNodes: new Set<string>(),
  constructorNodes: new Set<string>(),
  exceptionNodes: new Set<string>(),
  switchContainerNodes: new Set<string>(),
};

function ctxWithFiles(
  files: readonly FileUnit[],
  capabilities: readonly Capability[] = [],
  repoFunctions: readonly RepoFunctionUnit[] = [],
): HypothesisContext {
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  return {
    file: null,
    fileAt: (p) => byPath.get(p) ?? null,
    repo: { repoName: "r", files: [], functions: repoFunctions, clones: [], graph: null },
    capabilities: new Set(capabilities),
    setsFor: (language) => files.find((f) => f.language === language)?.sets ?? EMPTY_SETS,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/** `RepoFunctionUnit` (repo-wide, sin `node`) que hace de par de un
 *  `FunctionUnit` real — necesario para que `clean-type-dispatch` pueda leer
 *  `chainHasNullCheck` (`toChainProblem#findMatchingFunction` empareja por
 *  archivo+líneas contra `ctx.repo.functions`). */
function repoFunctionFor(fn: FunctionUnit, metricOverrides: Partial<FunctionUnit["metrics"]> = {}): RepoFunctionUnit {
  return {
    file: fn.file,
    language: fn.language,
    name: fn.name,
    startLine: fn.startLine,
    endLine: fn.endLine,
    symbolPath: fn.symbolPath,
    sets: fn.sets,
    metrics: { ...fn.metrics, ...metricOverrides },
  };
}

/** `Finding` sintético de `conditional-chain`, sub-forma `instantiates` — sólo
 *  el `variant` importa para el `required` del motor; el resto es forma. */
function chainFinding(file: string, fn: Pick<FunctionUnit, "startLine" | "endLine" | "name">, chainLength = 5): Finding {
  return {
    id: "f-chain",
    detectorId: "conditional-chain",
    kind: "conditional-chain",
    variant: "instantiates",
    scope: "intra-function",
    language: "typescript",
    title: `${fn.name} elige qué clase instanciar entre ${chainLength} ramas`,
    detail: "d",
    trigger: [{ label: "tipos construidos", value: chainLength, threshold: fakeThreshold() }],
    locations: [{ file, startLine: fn.startLine, endLine: fn.endLine, symbol: fn.name ?? "(anónima)", role: "selector de tipo a instanciar" }],
    severity: 50,
    advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

/**
 * `Finding` sintético de `repeated-switch` (OLA X, B6) — a diferencia de
 * `chainFinding`, el ancla apunta al RANGO DEL SWITCH (`loc`), casi nunca
 * igual al rango del método que lo envuelve; sin `variant` (ese campo es
 * exclusivo de `conditional-chain`) — el `required` nuevo lee
 * `instantiatesEvidence`, calculado en `toChainProblem` a partir del CUERPO
 * de la función que contiene este rango (`smallestContaining`).
 */
function repeatedSwitchFinding(file: string, loc: { startLine: number; endLine: number; symbol?: string }, occurrences = 2): Finding {
  return {
    id: "f-switch",
    detectorId: "repeated-switch",
    kind: "repeated-switch",
    scope: "intra-file",
    language: "typescript",
    title: `"kind" se decide con switch en ${occurrences} lugares distintos de este archivo`,
    detail: "d",
    trigger: [{ label: "apariciones", value: occurrences, threshold: fakeThreshold() }],
    locations: [{ file, startLine: loc.startLine, endLine: loc.endLine, symbol: loc.symbol, role: "primer switch sobre este discriminante" }],
    severity: 50,
    advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function methodOf(file: FileUnit, className: string, name: string): FunctionUnit {
  const fn = file.functions.find((f) => f.metrics.className === className && f.name === name);
  if (!fn) throw new Error(`fixture inválida: no se encontró ${className}#${name}`);
  return fn;
}

/** Mismo probe que producción resuelve para "typescript" (`LANGUAGE_DECLS`) —
 *  incluye una función suelta de nivel superior además de una clase, a
 *  diferencia de un probe mínimo hecho a mano: sin eso, `sets.functionNodes`
 *  nunca aprende el tipo de nodo `function_declaration` y toda función suelta
 *  del test (los escenarios "sin clase") desaparecería de `file.functions`. */
const TS_DECL = LANGUAGE_DECLS.find((d) => d.id === "typescript")!;

async function tsFile(source: string, filePath = "probe.ts"): Promise<FileUnit> {
  const sets = await nodeSetsFor(TS_DECL.wasm, TS_DECL.probeSource);
  const root = await parseRoot(TS_DECL.wasm, source);
  return fileUnitFrom(root, sets, "typescript", { file: filePath });
}

describe("hypotheses/factory-method — identidad", () => {
  /**
   * OLA AE (frente AE8) — el array `anchors` SUMA la tercera, con el número
   * medido al lado para que nadie la lea como un capricho: sobre volcados
   * propios de las DOS poblaciones (13 bibliotecas + 8 aplicaciones de
   * `corpus-app/`), **977 hallazgos de las dos anclas viejas producen 7
   * hipótesis de Factory Method — 970 mueren en `isInstantiatesVariant`, el
   * 99,3 %**, por la causa que W1 midió en 0/186 y que sigue aguas arriba
   * (`code-analyzer.ts#ladderInstantiatesTypes`, PIDO sin dueño). Las dos
   * viejas NO se tocan: esta ola es aditiva.
   */
  it("declara sus tres campos, con las TRES anclas (la tercera SUMA, no reemplaza)", () => {
    expect(hypothesis.id).toBe("factory-method");
    expect(hypothesis.pattern).toBe("Factory Method");
    expect(hypothesis.anchors).toEqual(["conditional-chain", "repeated-switch", "homonymous-divergent-construction"]);
  });
});

describe("hypotheses/factory-method — required", () => {
  it("variant !== 'instantiates' ⇒ null, ni siquiera candidata", async () => {
    const file = await tsFile(`function pick(x: number) { return x; }`);
    const fn = file.functions[0]!;
    const finding = { ...chainFinding("probe.ts", fn), variant: "ladder" };
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));
    expect(h).toBeNull();
  });
});

describe("hypotheses/factory-method — AUSENTE (función suelta, sin clase)", () => {
  it("cadena plana que instancia tipos, sin familia de tipos alrededor ⇒ ausente, confianza alta", async () => {
    const source = `
function createShape(kind: string): Shape {
  if (kind === "circle") return new Circle();
  else if (kind === "square") return new Square();
  else if (kind === "triangle") return new Triangle();
  else if (kind === "hexagon") return new Hexagon();
  else return new Pentagon();
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "createShape")!;
    const finding = chainFinding("probe.ts", fn, 5);
    const h = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).toBe("alta");
    const applied = h!.checks.find((c) => c.role === "applied" && c.label.includes("redeclara"));
    expect(applied?.passed).toBe(false);
  });
});

describe("hypotheses/factory-method — OLA X (B6): segunda ancla `repeated-switch`", () => {
  it("switch repetido cuyo cuerpo construye ≥2 tipos distintos entre sus case ⇒ ausente (required confirmado por conteo local, sin conditional-chain)", async () => {
    const source = `
function pickShape(kind: string): Shape {
  switch (kind) {
    case "circle":
      return new Circle();
    case "square":
      return new Square();
    default:
      return new Pentagon();
  }
}
`;
    const file = await tsFile(source);
    // Rango del propio switch (líneas 3-10), NO el rango de la función (2-11)
    // — exactamente la forma real de `repeated-switch` (ver docstring del
    // módulo, "CÓMO SE RESUELVE LA FUNCIÓN").
    const finding = repeatedSwitchFinding("probe.ts", { startLine: 3, endLine: 10, symbol: "pickShape" });
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    const requiredCheck = h!.checks.find((c) => c.role === "required");
    expect(requiredCheck?.passed).toBe(true);
    expect(requiredCheck?.why).toMatch(/3 tipos distintos/);
  });

  it("switch repetido cuyo cuerpo NO construye ≥2 tipos distintos (sin `new`, o uno solo) ⇒ null, ni siquiera candidata", async () => {
    const source = `
function pickLabel(kind: string): string {
  switch (kind) {
    case "circle":
      return "circle-label";
    case "square":
      return "square-label";
    default:
      return "other-label";
  }
}
`;
    const file = await tsFile(source);
    const finding = repeatedSwitchFinding("probe.ts", { startLine: 3, endLine: 10, symbol: "pickLabel" });
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));
    expect(h).toBeNull();
  });

  it("switch repetido DENTRO de un método de clase, sin familia alrededor ⇒ ausente, y el `functionName`/owner se resuelven por CONTENCIÓN (no por igualdad de rango)", async () => {
    const source = `
class ShapeFactory {
  pickShape(kind: string): Shape {
    switch (kind) {
      case "circle":
        return new Circle();
      case "square":
        return new Square();
      default:
        return new Pentagon();
    }
  }
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "pickShape")!;
    // El rango del switch (interior del método) es un SUBRANGO del método,
    // nunca igual — si `toChainProblem` siguiera usando igualdad exacta acá
    // (como hace para `conditional-chain`), esto no resolvería ninguna
    // función y el required fallaría por falta de evidencia.
    const finding = repeatedSwitchFinding("probe.ts", { startLine: fn.startLine + 1, endLine: fn.endLine - 1, symbol: "pickShape" });
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });
});

describe("hypotheses/factory-method — PARCIAL forma (a): redeclarado sin base común", () => {
  it("2 tipos SIN relación de herencia, mismo (nombre,aridad), cada uno construyendo su propio producto ⇒ parcial", async () => {
    const source = `
class WindowsDialog {
  createButton(): Button {
    return new WindowsButton();
  }
}
class WebDialog {
  createButton(): Button {
    return new WebButton();
  }
}
`;
    const file = await tsFile(source);
    const anchor = methodOf(file, "WindowsDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull(); // parcial SÍ compite en el ranking
    const applied = h!.checks.find((c) => c.role === "applied" && c.label.includes("redeclara"));
    expect(applied?.passed).toBe(true);
    expect(applied?.why).toMatch(/2 tipo/);
    // Sin base común: no se agrega el segundo check ("comparten una base común")
    expect(h!.checks.some((c) => c.label.includes("base común"))).toBe(false);
  });
});

describe("hypotheses/factory-method — COMPLETA (ya-aplicado): base abstracta + ≥2 subtipos", () => {
  it("Dialog abstracto + WindowsDialog/WebDialog/BuggyDialog, cada Si construye un producto distinto, base no construye nada ⇒ ya-aplicado, confianza null", async () => {
    const source = `
abstract class Dialog {
  abstract createButton(): Button;
}
class WindowsDialog extends Dialog {
  createButton(): Button {
    return new WindowsButton();
  }
}
class WebDialog extends Dialog {
  createButton(): Button {
    return new WebButton();
  }
}
class BuggyDialog extends Dialog {
  createButton(): Button {
    this.logCreation();
    return new WindowsButton();
  }
}
`;
    const file = await tsFile(source);
    const anchor = methodOf(file, "BuggyDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull(); // ya-aplicado no compite
    const baseCheck = h!.checks.find((c) => c.label.includes("base común"));
    expect(baseCheck?.passed).toBe(true);
    expect(baseCheck?.why).toContain("Dialog");
  });

  it("nunca produce una sugerencia (checks.role incluye 'applied' confirmando la base, no una oportunidad)", async () => {
    const source = `
abstract class Dialog {
  abstract createButton(): Button;
}
class WindowsDialog extends Dialog {
  createButton(): Button {
    return new WindowsButton();
  }
}
class WebDialog extends Dialog {
  createButton(): Button {
    return new WebButton();
  }
}
`;
    const file = await tsFile(source);
    const anchor = methodOf(file, "WindowsDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.state).not.toBe("parcial");
    expect(h!.state).not.toBe("ausente");
  });
});

describe("hypotheses/factory-method — base común que SÍ construye ⇒ no es COMPLETA", () => {
  it("base con cuerpo propio que también construye un producto ⇒ redeclarado sube el check, pero la base no es abstracta ⇒ parcial", async () => {
    const source = `
class Dialog {
  createButton(): Button {
    return new DefaultButton();
  }
}
class WindowsDialog extends Dialog {
  createButton(): Button {
    return new WindowsButton();
  }
}
class WebDialog extends Dialog {
  createButton(): Button {
    return new WebButton();
  }
}
`;
    const file = await tsFile(source);
    const anchor = methodOf(file, "WindowsDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    const baseCheck = h!.checks.find((c) => c.label.includes("base común"));
    expect(baseCheck?.passed).toBe(false);
    expect(baseCheck?.why).toMatch(/también construye/i);
  });
});

describe("hypotheses/factory-method — chain-is-whole-method: brecha declarada, no un false silencioso", () => {
  it("siempre no confirmado hoy, con evidencia explícita", async () => {
    const source = `
function createShape(kind: string): Shape {
  if (kind === "circle") return new Circle();
  else if (kind === "square") return new Square();
  else if (kind === "triangle") return new Triangle();
  else return new Pentagon();
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "createShape")!;
    const finding = chainFinding("probe.ts", fn);
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));
    const wholeMethod = h!.checks.find((c) => c.label.includes("solo la cadena"));
    expect(wholeMethod?.passed).toBe(false);
    expect(wholeMethod?.why).toMatch(/No evaluable/);
  });
});

describe("hypotheses/factory-method — discriminadores", () => {
  it("three-or-more-branches y clean-type-dispatch confirmados ⇒ confianza alta (caso ausente)", async () => {
    const source = `
function createShape(kind: string): Shape {
  if (kind === "circle") return new Circle();
  else if (kind === "square") return new Square();
  else if (kind === "triangle") return new Triangle();
  else if (kind === "hexagon") return new Hexagon();
  else return new Pentagon();
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "createShape")!;
    const h = hypothesis.build(
      chainFinding("probe.ts", fn, 5),
      null,
      ctxWithFiles([file], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]),
    );
    expect(h!.confidence).toBe("alta");
  });

  it("chainLength justo en 2 (mínimo estructural) baja la escalera de three-or-more-branches", async () => {
    const source = `function createShape(kind: string): Shape { if (kind === "a") return new A(); else return new B(); }`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "createShape")!;
    const h = hypothesis.build(
      chainFinding("probe.ts", fn, 2),
      null,
      ctxWithFiles([file], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]),
    );
    expect(h!.confidence).toBe("media"); // sólo clean-type-dispatch confirmado (three-or-more-branches falla: 2<3)
  });

  it("sin RepoFunctionUnit que empareje (archivo+líneas): clean-type-dispatch no confirmado, evidencia explícita", async () => {
    const source = `function createShape(kind: string): Shape { if (kind === "a") return new A(); else return new B(); }`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "createShape")!;
    const h = hypothesis.build(chainFinding("probe.ts", fn, 5), null, ctxWithFiles([file]));
    const dispatchCheck = h!.discriminators.find((c) => c.label.includes("nulo/ausente"));
    expect(dispatchCheck?.passed).toBe(false);
    expect(dispatchCheck?.why).toMatch(/No se pudo emparejar/);
  });
});

describe("hypotheses/factory-method — capacidades y costo", () => {
  it("no declara capacidades: funciona igual en lenguajes sin clases (needs: [])", async () => {
    const source = `function pick(kind: string) { if (kind === "a") return new A(); else return new B(); }`;
    const file = await tsFile(source);
    const fn = file.functions[0]!;
    const h = hypothesis.build(chainFinding("probe.ts", fn), null, ctxWithFiles([file], []));
    expect(h).not.toBeNull();
    expect(h!.missingCapabilities).toEqual([]);
  });

  it("cost menciona la alternativa sin clases (Go/Ruby/Python/JS)", async () => {
    const source = `function pick(kind: string) { if (kind === "a") return new A(); else return new B(); }`;
    const file = await tsFile(source);
    const fn = file.functions[0]!;
    const h = hypothesis.build(chainFinding("probe.ts", fn), null, ctxWithFiles([file]));
    expect(h!.cost).toMatch(/NewX|Hash|dict/);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * El camino por GRAFO — sintético, mismo estilo que `wrapping-chain.test.ts`.
 * `ownerId` (necesario para invocar `computeGraphFamily`) sale de
 * `matchInFile.symbolPath` — así que ESTE camino también necesita
 * `ctx.fileAt` con árbol vivo para resolver el owner, aunque la evidencia
 * de familia (extends/instantiates/memberSignatures) venga del grafo, no
 * del AST. Confirma que el camino sigue vivo y probado, tal como el
 * docstring del módulo declara ("conservado para una ola futura").
 * ──────────────────────────────────────────────────────────────────────── */
const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function graphSym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
}
function graphMethod(file: string, classPath: string, name: string, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return graphSym(file, [classPath, name], { family: "function-like", arity: 0, ...overrides });
}
function graphEdge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "declared", weight: 1, ...overrides };
}

describe("hypotheses/factory-method — camino por grafo (sintético, hoy inerte en producción)", () => {
  it("extends + memberSignatures + instantiates confirma COMPLETA vía grafo (family gana sobre el AST)", async () => {
    const file = "probe.ts";
    // Árbol vivo mínimo — sólo para resolver `ownerId` (mismo nombre/aridad que el grafo).
    const source = `
class BuggyDialog extends Dialog {
  createButton(): Button {
    this.logCreation();
    return new WindowsButton();
  }
}
`;
    const treeFile = await tsFile(source, file);

    const dialog = graphSym(file, ["Dialog"]);
    const windows = graphSym(file, ["WindowsDialog"]);
    const buggy = graphSym(file, ["BuggyDialog"]);
    const dialogM = graphMethod(file, "Dialog", "createButton");
    const windowsM = graphMethod(file, "WindowsDialog", "createButton");
    const buggyM = graphMethod(file, "BuggyDialog", "createButton");
    // Dos productos DISTINTOS — `distinctProducts >= 2` es lo que exige
    // `appliedState`; si ambos siblings construyeran el MISMO producto, la
    // familia se encontraría pero `redeclared` seguiría en `false`.
    const windowsButton = graphSym(file, ["WindowsButton"]);
    const webButton = graphSym(file, ["WebButton"]);

    const graph: CodeGraph = {
      nodes: [dialog, windows, buggy, dialogM, windowsM, buggyM, windowsButton, webButton],
      edges: [
        graphEdge(windows.id, dialog.id, "extends"),
        graphEdge(buggy.id, dialog.id, "extends"),
        graphEdge(dialog.id, dialogM.id, "contains"),
        graphEdge(windows.id, windowsM.id, "contains"),
        graphEdge(buggy.id, buggyM.id, "contains"),
        graphEdge(windowsM.id, windowsButton.id, "instantiates"),
        graphEdge(buggyM.id, webButton.id, "instantiates"),
        // dialogM (la base) NO tiene `instantiates` saliente — abstracta.
      ],
      resolution: EMPTY_RESOLUTION,
    };

    const finding = chainFinding(file, methodOf(treeFile, "BuggyDialog", "createButton"));
    const h = hypothesis.build(finding, graph, ctxWithFiles([treeFile]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola 11a (P3) — el puenteo, expresado como DISCRIMINADOR (nunca `state`).
 * Ver el docstring del módulo, sección "`aplicado-eludido` NO se produce...".
 * ──────────────────────────────────────────────────────────────────────── */
describe("hypotheses/factory-method — cliente-externo-saltea-base (Ola 11a, discriminador de puenteo)", () => {
  const source = `
abstract class Dialog {
  abstract createButton(): Button;
}
class WindowsDialog extends Dialog {
  createButton(): Button {
    return new WindowsButton();
  }
}
class BuggyDialog extends Dialog {
  createButton(): Button {
    this.logCreation();
    return new WebButton();
  }
}
`;

  function buggyFamilyGraph(withExternalCaller: boolean): { graph: CodeGraph; file: string } {
    const file = "probe.ts";
    const dialog = graphSym(file, ["Dialog"]);
    const windows = graphSym(file, ["WindowsDialog"]);
    const buggy = graphSym(file, ["BuggyDialog"]);
    const dialogM = graphMethod(file, "Dialog", "createButton");
    const windowsM = graphMethod(file, "WindowsDialog", "createButton");
    const buggyM = graphMethod(file, "BuggyDialog", "createButton");
    const windowsButton = graphSym(file, ["WindowsButton"]);
    const webButton = graphSym(file, ["WebButton"]);
    const externalCaller = graphSym(file, ["externalCaller"], { family: "function-like", arity: 0 });

    const edges: CodeGraphEdge[] = [
      graphEdge(windows.id, dialog.id, "extends"),
      graphEdge(buggy.id, dialog.id, "extends"),
      graphEdge(dialog.id, dialogM.id, "contains"),
      graphEdge(windows.id, windowsM.id, "contains"),
      graphEdge(buggy.id, buggyM.id, "contains"),
      graphEdge(windowsM.id, windowsButton.id, "instantiates"),
      graphEdge(buggyM.id, webButton.id, "instantiates"),
    ];
    if (withExternalCaller) edges.push(graphEdge(externalCaller.id, buggyM.id, "calls"));

    return {
      file,
      graph: {
        nodes: [dialog, windows, buggy, dialogM, windowsM, buggyM, windowsButton, webButton, externalCaller],
        edges,
        resolution: EMPTY_RESOLUTION,
      },
    };
  }

  it("build() con este ancla SIEMPRE recibe graph:null en producción ⇒ el discriminador declara 'no evaluable', nunca false fingido", async () => {
    const file = await tsFile(source);
    const anchor = methodOf(file, "BuggyDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const h = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(anchor)]));

    expect(h!.state).toBe("ya-aplicado"); // decidido por build() con árbol vivo — nunca cambia.
    const bypassCheck = h!.discriminators.find((c) => c.label.includes("cliente EXTERNO"));
    expect(bypassCheck?.passed).toBe(false);
    expect(bypassCheck?.why).toMatch(/no evaluable|sin grafo/);
  });

  it("un cliente EXTERNO con 'calls' directo a BuggyDialog#createButton, visto por build() con grafo sintético ⇒ discriminador confirmado, state SIGUE 'ya-aplicado'", async () => {
    const file = await tsFile(source);
    const anchor = methodOf(file, "BuggyDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const { graph } = buggyFamilyGraph(true);
    const h = hypothesis.build(finding, graph, ctxWithFiles([file], [], [repoFunctionFor(anchor)]));

    expect(h!.state).toBe("ya-aplicado"); // el puenteo NUNCA cambia el estado — sólo se expresa como discriminador.
    const bypassCheck = h!.discriminators.find((c) => c.label.includes("cliente EXTERNO"));
    expect(bypassCheck?.passed).toBe(true);
    expect(bypassCheck?.why).toContain("externalCaller");
    expect(bypassCheck?.why).toContain("calls");
  });

  it("sin cliente externo (sólo la base y los hermanos) ⇒ discriminador NO confirmado, con grafo real", async () => {
    const file = await tsFile(source);
    const anchor = methodOf(file, "BuggyDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const { graph } = buggyFamilyGraph(false);
    const h = hypothesis.build(finding, graph, ctxWithFiles([file], [], [repoFunctionFor(anchor)]));

    const bypassCheck = h!.discriminators.find((c) => c.label.includes("cliente EXTERNO"));
    expect(bypassCheck?.passed).toBe(false);
    expect(bypassCheck?.why).toMatch(/ninguna arista/);
  });

  it("refresh(): sin grafo real todavía ⇒ null, nada que mejorar (mismo corte temprano que strategy.ts)", async () => {
    const file = await tsFile(source);
    const anchor = methodOf(file, "BuggyDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    const existing = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(anchor)]))!;

    expect(hypothesis.refresh!(existing, finding, null, ctxWithFiles([]))).toBeNull();
  });

  it("refresh(): SIN árbol vivo (ctx.fileAt siempre null, como en producción real vía crossAnalyze) pero con `matchRepo` ⇒ ownerId SÍ resuelve y el discriminador confirma el puenteo, sin tocar state/checks de `existing`", async () => {
    const file = await tsFile(source);
    const anchor = methodOf(file, "BuggyDialog", "createButton");
    const finding = chainFinding("probe.ts", anchor);
    // `existing` construido con árbol vivo (build() real de producción para este ancla).
    const existing = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(anchor)]))!;
    expect(existing.state).toBe("ya-aplicado");

    const { graph } = buggyFamilyGraph(true);
    // ctx SIN archivos vivos (`ctxWithFiles([])`) — `ctx.fileAt` siempre `null`,
    // EXACTAMENTE como `hypotheses/run.ts#refreshHypotheses` cablea `refresh()`
    // en producción. Sólo `ctx.repo.functions` (RepoFunctionUnit, sin árbol)
    // está disponible — el fallback nuevo de `toChainProblem#ownerId`.
    const refreshCtx = ctxWithFiles([], [], [repoFunctionFor(anchor)]);
    const refreshed = hypothesis.refresh!(existing, finding, graph, refreshCtx);

    expect(refreshed).not.toBeNull();
    expect(refreshed!.state).toBe(existing.state); // contrato: refresh() NUNCA toca state.
    expect(refreshed!.checks).toEqual(existing.checks); // ni los checks required/applied.
    const bypassCheck = refreshed!.discriminators.find((c) => c.label.includes("cliente EXTERNO"));
    expect(bypassCheck?.passed).toBe(true);
    expect(bypassCheck?.why).toContain("externalCaller");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Fixture canónica REAL — requisito 4. Lee (sin modificar) el archivo real
 * de `tests/fixtures/patterns/factory_method_override/*`. Ver docstring
 * del módulo para por qué el ancla es sintética.
 * ──────────────────────────────────────────────────────────────────────── */
const FIXTURE_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "..", "tests", "fixtures", "patterns", "factory_method_override");

function declFor(id: string): LanguageDecl {
  const d = LANGUAGE_DECLS.find((x) => x.id === id);
  if (!d) throw new Error(`sin LanguageDecl para "${id}"`);
  return d;
}

async function realFixtureFile(id: string, fileName: string): Promise<FileUnit> {
  const decl = declFor(id);
  const raw = await fs.readFile(path.join(FIXTURE_DIR, fileName), "utf8");
  const source = decl.extractScript ? (decl.extractScript(raw) ?? raw) : raw;
  const sets = await nodeSetsFor(decl.wasm, decl.probeSource, decl.extraCloneNodes, decl.functionExclusions);
  const root = await parseRoot(decl.wasm, source);
  return fileUnitFrom(root, sets, id, { file: fileName });
}

describe("hypotheses/factory-method — fixture canónica REAL (tests/fixtures/patterns/factory_method_override, sin modificar)", () => {
  // Python queda AFUERA de esta lista a propósito — ver el test dedicado más
  // abajo: en esa fixture específica no alcanza "ya-aplicado" (producto
  // externo, hueco declarado), y merece su propia explicación, no un mismo
  // molde genérico que escondería la diferencia.
  const cases: { id: string; fileName: string; method: string }[] = [
    { id: "typescript", fileName: "typescript.ts", method: "createButton" },
    { id: "javascript", fileName: "javascript.js", method: "createButton" },
    { id: "vue", fileName: "vue.vue", method: "createButton" },
    { id: "ruby", fileName: "ruby.rb", method: "create_button" },
  ];

  for (const { id, fileName, method } of cases) {
    it(`${id}: BuggyDialog#${method}, ancla sintética ⇒ ya-aplicado (la jerarquía Dialog/WindowsDialog/WebDialog ya está bien aplicada)`, async () => {
      const file = await realFixtureFile(id, fileName);
      const anchor = methodOf(file, "BuggyDialog", method);
      const finding = { ...chainFinding(fileName, anchor), language: id };
      const h = hypothesis.build(finding, null, ctxWithFiles([file]));

      expect(h).not.toBeNull();
      expect(h!.state).toBe("ya-aplicado");
      expect(h!.confidence).toBeNull();
    });
  }

  it("python: 'ya-aplicado' NO se alcanza en ESTA fixture — el producto (WindowsButton/WebButton) es una clase EXTERNA, no declarada en el archivo, y Python no tiene palabra clave de construcción (hueco YA DECLARADO en graph/edges/instanciacion.ts, heredado de prototype.ts#CONSTRUCTS_TYPE) — measured ausente, NUNCA null/silencio", async () => {
    const file = await realFixtureFile("python", "python.py");
    const anchor = methodOf(file, "BuggyDialog", "create_button");
    const finding = { ...chainFinding("python.py", anchor), language: "python" };
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    const applied = h!.checks.find((c) => c.role === "applied" && c.label.includes("redeclara"));
    expect(applied?.passed).toBe(false);
  });

  // ROOT-CAUSE FIX (frente "Go: extends/implements/mixes-in/satisfies, una
  // sola causa", `code-grammar.ts#GO_TYPE_SPEC_WORD`/`GO_METHOD_SPEC_WORD`):
  // `file.functions[0]` in this fixture is NOT a receiver method any more in
  // effect — it is `CreateButton() Button`, the METHOD SIGNATURE declared
  // directly inside `type Dialog interface { CreateButton() Button }`
  // (confirmed by reading `go.go`: that signature is the first thing the
  // walk visits, before either concrete `WindowsDialog`/`WebDialog` struct).
  // `Dialog`'s `type_spec` is now class-like and the signature itself is now
  // function-like (see those two constants' docs), so `code-analyzer.ts`'s
  // `walkFile` correctly attributes `className: "Dialog"` to it — a genuine
  // improvement, not a regression: an interface's method IS lexically
  // nested inside its declaring interface in Go, unlike a receiver-based
  // concrete method (`func (d WindowsDialog) CreateButton() ...`), which
  // still is NOT (`graph/symbols.ts`'s own documented "DECLARED GAP 1" —
  // receiver association was never lexical nesting to begin with, and this
  // fix does not touch that separate gap). Anchoring on the first function
  // whose `className` is STILL `null` keeps this test's original intent
  // (demonstrate the receiver-association gap) accurate instead of
  // coincidentally relying on index 0.
  it("go: sin classNodes/className para un método CON RECEPTOR (Go no vincula método-con-receptor a su struct — LÍMITE DECLARADO en `graph/symbols.ts`, distinto del gap de `code-grammar.ts` ya cerrado): ausente, nunca ya-aplicado ni null disfrazado", async () => {
    const file = await realFixtureFile("go", "go.go");
    // El PRIMER método con receptor real (no la firma de interfaz, que ahora
    // sí lleva `className: "Dialog"` — ver arriba): `WindowsDialog.
    // CreateButton`, `className` sigue `null` por el gap de asociación por
    // receptor, no por ausencia de unidad-tipo-clase (Go SÍ la tiene ahora).
    const fn = file.functions.find((f) => f.metrics.className === null)!;
    expect(fn).toBeDefined();
    expect(fn.metrics.className).toBeNull();
    const finding = { ...chainFinding("go.go", fn), language: "go" };
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));
    // `needs: []` no excluye a Go (build() no devuelve null): sin clase
    // asociada a ESTE método no hay familia que reportar, así que el estado
    // real es "ausente", no "silencio".
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.missingCapabilities).toEqual([]);
  });

  it("go: la firma de una interfaz (`Dialog.CreateButton`) SÍ lleva `className` ahora — confirma el fix de `code-grammar.ts` sin decidir nada sobre factory-method en sí", async () => {
    const file = await realFixtureFile("go", "go.go");
    const signature = file.functions[0]!;
    expect(signature.metrics.className).toBe("Dialog");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * OLA AE (frente AE8) — EL CAMINO DE ENTRADA DE LA TERCERA ANCLA,
 * `homonymous-divergent-construction`.
 *
 * Todo lo de acá abajo ejercita SÓLO el camino nuevo. El camino viejo tiene su
 * propio test al final de este bloque ("el camino viejo sigue intacto"), que es
 * la prueba por MEDICIÓN de que la tercera ancla no le sacó nada.
 * ═══════════════════════════════════════════════════════════════════════════ */

function ae8Node(file: string, symbolPath: readonly string[], family: CodeGraphNode["family"], startLine = 10): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family, startLine, endLine: startLine + 30 };
}

function ae8Edge(from: CodeGraphNode, to: CodeGraphNode, kind: CodeGraphEdge["kind"]): CodeGraphEdge {
  return { from: from.id, to: to.id, kind, provenance: "resolved", weight: 1 };
}

interface Ae8Scenario {
  readonly graph: CodeGraph;
  readonly finding: Finding;
}

/**
 * Dos hermanos (`a.ts#Alpha.render`, `b.ts#Beta.render`) bajo `base.ts#Creator`.
 * Los dos ejecutan los mismos tres pasos y cada uno construye lo suyo.
 */
function ae8Scenario(opts: {
  readonly ancestorDeclaresMember?: boolean;
  readonly ancestorHasCreationMember?: boolean;
  readonly copiesDelegateToHook?: boolean;
  readonly sameProducts?: boolean;
  readonly steps?: readonly string[];
} = {}): Ae8Scenario {
  const creator = ae8Node("base.ts", ["Creator"], "class-like", 1);
  const stepNodes = (opts.steps ?? ["prepare", "validate", "publish"]).map((s, i) => ae8Node("util.ts", [s], "function-like", 100 + i));
  const alpha = ae8Node("a.ts", ["Alpha"], "class-like", 5);
  const beta = ae8Node("b.ts", ["Beta"], "class-like", 5);
  const alphaM = ae8Node("a.ts", ["Alpha", "render"], "function-like", 10);
  const betaM = ae8Node("b.ts", ["Beta", "render"], "function-like", 10);
  const alphaProduct = ae8Node("products.ts", ["AlphaWidget"], "class-like", 1);
  const betaProduct = ae8Node("products.ts", ["BetaWidget"], "class-like", 20);

  const nodes: CodeGraphNode[] = [creator, ...stepNodes, alpha, beta, alphaM, betaM, alphaProduct, betaProduct];
  const edges: CodeGraphEdge[] = [
    ae8Edge(alpha, creator, "extends"),
    ae8Edge(beta, creator, "extends"),
    ae8Edge(alpha, alphaM, "contains"),
    ae8Edge(beta, betaM, "contains"),
    ae8Edge(alphaM, alphaProduct, "instantiates"),
    ae8Edge(betaM, opts.sameProducts ? alphaProduct : betaProduct, "instantiates"),
    ...stepNodes.flatMap((s) => [ae8Edge(alphaM, s, "calls"), ae8Edge(betaM, s, "calls")]),
  ];
  if (opts.ancestorDeclaresMember) {
    const baseM = ae8Node("base.ts", ["Creator", "render"], "function-like", 2);
    nodes.push(baseM);
    edges.push(ae8Edge(creator, baseM, "contains"));
  }
  if (opts.ancestorHasCreationMember) {
    const hook = ae8Node("base.ts", ["Creator", "makeWidget"], "function-like", 50);
    nodes.push(hook);
    edges.push(ae8Edge(creator, hook, "contains"), ae8Edge(hook, alphaProduct, "instantiates"));
    // La DELEGACIÓN es opcional a propósito: el gancho que existe pero que
    // nadie usa no resuelve nada (ver `noExistingCreationPoint`, defecto
    // medido en guava).
    if (opts.copiesDelegateToHook) edges.push(ae8Edge(alphaM, hook, "calls"));
  }

  const graph: CodeGraph = { nodes, edges, resolution: EMPTY_RESOLUTION as never };
  const finding: Finding = {
    id: "f-hdc",
    detectorId: "homonymous-divergent-construction",
    kind: "homonymous-divergent-construction",
    variant: "render",
    scope: "inter-file",
    language: null,
    title: "2 hermanos repiten \"render\" y sólo cambian qué construyen",
    detail: "d",
    trigger: [{ label: "hermanos", value: 2, threshold: fakeThreshold(1) }],
    locations: [
      { file: "a.ts", startLine: 10, endLine: 40, symbol: "Alpha.render", role: "redeclara el procedimiento y elige el producto: construye AlphaWidget y ejecuta 3 paso(s)" },
      { file: "b.ts", startLine: 10, endLine: 40, symbol: "Beta.render", role: "redeclara el procedimiento y elige el producto: construye BetaWidget y ejecuta 3 paso(s)" },
      { file: "base.ts", startLine: 1, endLine: 31, symbol: "Creator", role: "ancestro común: reúne a los 2 tipos que redeclaran \"render\"" },
    ],
    severity: 50,
    advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "y", source: "z" } },
  };
  return { graph, finding };
}

describe("hypotheses/factory-method — ancla `homonymous-divergent-construction` (OLA AE, AE8)", () => {
  it("la forma completa, sin ancestro que declare el homónimo ⇒ `ausente`", () => {
    const { graph, finding } = ae8Scenario();
    const h = hypothesis.build(finding, graph, ctxWithFiles([]));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.checks.filter((c) => c.role === "required").every((c) => c.passed)).toBe(true);
  });

  it("el ancestro YA declara el mismo miembro ⇒ `parcial`: hay dónde vive el procedimiento, falta aislar la creación", () => {
    const { graph, finding } = ae8Scenario({ ancestorDeclaresMember: true });
    const h = hypothesis.build(finding, graph, ctxWithFiles([]));
    expect(h!.state).toBe("parcial");
  });

  it("sin grafo NINGÚN `required` aprueba por no poder mirar ⇒ null, ni siquiera candidata", () => {
    const { finding } = ae8Scenario();
    expect(hypothesis.build(finding, null, ctxWithFiles([]))).toBeNull();
  });

  it("los dos hermanos construyen EXACTAMENTE lo mismo ⇒ null (la creación no varía: Pull Up Method, no Factory Method)", () => {
    const { graph, finding } = ae8Scenario({ sameProducts: true });
    expect(hypothesis.build(finding, graph, ctxWithFiles([]))).toBeNull();
  });

  it("ESCALA: sin procedimiento duplicado que subir ⇒ null (ese miembro YA ES un punto de creación)", () => {
    const { graph, finding } = ae8Scenario({ steps: ["prepare"] });
    expect(hypothesis.build(finding, graph, ctxWithFiles([]))).toBeNull();
  });

  it("RESOLUCIÓN VERIFICADA: una copia YA DELEGA en el miembro de creación dedicado del ancestro ⇒ null", () => {
    const { graph, finding } = ae8Scenario({ ancestorHasCreationMember: true, copiesDelegateToHook: true });
    expect(hypothesis.build(finding, graph, ctxWithFiles([]))).toBeNull();
  });

  /**
   * DEFECTO MEDIDO Y CORREGIDO — la contraprueba de la anterior. La primera
   * versión del `required` fallaba con sólo comprobar que el ancestro
   * DECLARARA algún miembro de creación dedicado, sin exigir que las copias
   * pasaran por él: medido sobre el corpus, en guava el ancestro
   * `AbstractNavigableMap` declara `navigableKeySet` y `descendingMap` (dos
   * miembros chicos que construyen algo y no tienen nada que ver con `subMap`)
   * y con eso **7 de los 8 hallazgos del ancla se quedaban sin hipótesis**.
   */
  it("el ancestro declara un gancho pero NINGUNA copia pasa por él ⇒ sigue emitiendo: un gancho que nadie usa no resuelve nada", () => {
    const { graph, finding } = ae8Scenario({ ancestorHasCreationMember: true });
    const h = hypothesis.build(finding, graph, ctxWithFiles([]));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("`refresh()` no toca esta ancla (es inter-file; `refreshHypotheses` nunca la alcanza)", () => {
    const { graph, finding } = ae8Scenario();
    const h = hypothesis.build(finding, graph, ctxWithFiles([]))!;
    expect(hypothesis.refresh!(h, finding, graph, ctxWithFiles([]))).toBeNull();
  });

  it("nombra el costo en términos del punto de creación, no de una cadena de condicionales", () => {
    const { graph, finding } = ae8Scenario();
    const h = hypothesis.build(finding, graph, ctxWithFiles([]))!;
    expect(h.cost).toContain("creación");
  });

  it("EL CAMINO VIEJO SIGUE INTACTO: un `conditional-chain` con `variant` distinto de 'instantiates' sigue dando null", async () => {
    const source = `
class Router {
  pick(kind: string) {
    if (kind === "a") return 1;
    else if (kind === "b") return 2;
    else if (kind === "c") return 3;
    else if (kind === "d") return 4;
    else return 5;
  }
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "pick")!;
    const finding = { ...chainFinding("probe.ts", fn), variant: "ladder" };
    expect(hypothesis.build(finding, null, ctxWithFiles([file]))).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI6 — LA TERCERA VÍA DE `is-instantiates-variant`.
 *
 * El defecto que estos tests fijan (ver `chainArbolEvidence` en el módulo):
 * el `required` leía UNA BANDERA de aguas arriba
 * (`code-analyzer.ts#ladderInstantiatesTypes`) cuyo reconocedor de
 * construcción es sólo `new X` / `X.new`. **En Go y en Python esa bandera no
 * puede ser `true` nunca**, así que el `required` era imposible de satisfacer
 * por construcción para esos dos lenguajes. La vía nueva contesta la MISMA
 * pregunta con el MISMO código que la otra ancla del archivo ya usa
 * (`distinctConstructedTypes` sobre el cuerpo vivo).
 *
 * Un test por INTENCIÓN, y dos de ellos son los que se ponen rojos si el
 * defecto vuelve a existir.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/factory-method — OLA AI (AI6): la tercera vía de `is-instantiates-variant`", () => {
  const GO_DECL = LANGUAGE_DECLS.find((d) => d.id === "go")!;

  async function goFile(source: string, filePath = "probe.go", metrics: Partial<FunctionUnit["metrics"]> = {}): Promise<FileUnit> {
    const sets = await nodeSetsFor(GO_DECL.wasm, GO_DECL.probeSource);
    const root = await parseRoot(GO_DECL.wasm, source);
    return fileUnitFrom(root, sets, "go", { file: filePath, metrics });
  }

  /** EL CASO DEL DEFECTO: Go. `&T{…}` y `NewT(…)` son las DOS formas de
   *  construir del lenguaje, y NINGUNA de las dos la reconoce
   *  `ladderInstantiatesTypes`, así que el hallazgo sólo puede llegar acá con
   *  `variant: "ladder"`. */
  it("Go — escalera `ladder` cuyo cuerpo construye 2 tipos distintos (`&T{}` / `NewT()`) ⇒ SÍ candidata", async () => {
    const source = `
package main

func pickShape(kind string) Shape {
	if kind == "circle" {
		return &Circle{}
	} else if kind == "square" {
		return NewSquare()
	} else if kind == "triangle" {
		return &Triangle{}
	}
	return &Pentagon{}
}
`;
    const file = await goFile(source);
    const fn = file.functions.find((f) => f.name === "pickShape")!;
    const finding = { ...chainFinding("probe.go", fn, 4), variant: "ladder", language: "go" };
    const h = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]));

    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    const req = h!.checks.find((c) => c.label.includes("≥2 tipos DISTINTOS"));
    expect(req?.passed).toBe(true);
    expect(req?.why).toContain("tipos");
  });

  /** ESCALA: un solo tipo construido no es "elegir CUÁL construir". */
  it("un solo tipo construido en todo el cuerpo ⇒ NO candidata (la escalera decide SI construir, no CUÁL)", async () => {
    const source = `
package main

func maybeShape(kind string) Shape {
	if kind == "circle" {
		return &Circle{}
	} else if kind == "none" {
		return nil
	} else if kind == "other" {
		return nil
	}
	return nil
}
`;
    const file = await goFile(source);
    const fn = file.functions.find((f) => f.name === "maybeShape")!;
    const finding = { ...chainFinding("probe.go", fn, 4), variant: "ladder", language: "go" };
    expect(hypothesis.build(finding, null, ctxWithFiles([file]))).toBeNull();
  });

  /** RESOLUCIÓN VERIFICADA: el propio detector-ancla declara que si la
   *  función YA ES una fábrica, "la escalera YA ES el método de creación". */
  it("la función YA ES una fábrica (`isFactoryLike`) ⇒ NO candidata, aunque construya 2 tipos distintos", async () => {
    const source = `
package main

func NewShape(kind string) Shape {
	if kind == "circle" {
		return &Circle{}
	} else if kind == "square" {
		return &Square{}
	} else if kind == "triangle" {
		return &Triangle{}
	}
	return &Pentagon{}
}
`;
    const file = await goFile(source, "probe.go", { isFactoryLike: true });
    const fn = file.functions.find((f) => f.name === "NewShape")!;
    const finding = { ...chainFinding("probe.go", fn, 4), variant: "ladder", language: "go" };
    expect(hypothesis.build(finding, null, ctxWithFiles([file]))).toBeNull();
  });

  /** SIN ÁRBOL VIVO NO SE APRUEBA — nunca "no pude mirar, apruebo". */
  it("sin árbol vivo del archivo ⇒ NO candidata (la vía nueva no aprueba por ausencia de evidencia)", async () => {
    const source = `
package main

func pickShape(kind string) Shape {
	if kind == "circle" {
		return &Circle{}
	} else if kind == "square" {
		return &Square{}
	} else if kind == "triangle" {
		return &Triangle{}
	}
	return &Pentagon{}
}
`;
    const file = await goFile(source);
    const fn = file.functions.find((f) => f.name === "pickShape")!;
    const finding = { ...chainFinding("probe.go", fn, 4), variant: "ladder", language: "go" };
    // `ctxWithFiles([])` ⇒ `fileAt` devuelve `null` para cualquier ruta.
    expect(hypothesis.build(finding, null, ctxWithFiles([]))).toBeNull();
  });

  /** TypeScript con `new X` — el lenguaje donde la bandera SÍ es alcanzable,
   *  pero donde `constructed.size === arms.length` la baja igual en cuanto
   *  UNA rama no construye. La vía nueva la levanta. */
  it("TS — `ladder` con una rama que NO construye (lo que baja la bandera de aguas arriba) ⇒ SÍ candidata por la vía nueva", async () => {
    const source = `
class Router {
  pick(kind: string) {
    if (kind === "circle") return new Circle();
    else if (kind === "square") return new Square();
    else if (kind === "nothing") return null;
    else if (kind === "other") return null;
    else return null;
  }
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "pick")!;
    const finding = { ...chainFinding("probe.ts", fn, 5), variant: "ladder" };
    const h = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  /** EL CAMINO VIEJO, BYTE A BYTE: con la bandera puesta, la evidencia sigue
   *  siendo la del detector, no la del árbol — incluso cuando el cuerpo no
   *  tiene ninguna construcción reconocible. */
  it("con `variant: 'instantiates'` la evidencia sigue siendo la del detector, no la del árbol", async () => {
    const source = `
class Router {
  pick(kind: string) {
    if (kind === "a") return makeA();
    else if (kind === "b") return makeB();
    else if (kind === "c") return makeC();
    else if (kind === "d") return makeD();
    else return makeE();
  }
}
`;
    const file = await tsFile(source);
    const fn = file.functions.find((f) => f.name === "pick")!;
    const finding = chainFinding("probe.ts", fn, 5); // variant: "instantiates"
    const h = hypothesis.build(finding, null, ctxWithFiles([file], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]));
    expect(h).not.toBeNull();
    const req = h!.checks.find((c) => c.label.includes("≥2 tipos DISTINTOS"));
    expect(req?.passed).toBe(true);
    expect(req?.why).toContain('Sub-forma "instantiates" confirmada');
  });

  /** La segunda ancla del archivo no se movió: `repeated-switch` sigue
   *  entrando por su propia rama, con su propia evidencia. */
  it("`repeated-switch` sigue usando SU rama (la evidencia nombra el switch, no la cadena)", async () => {
    const source = `
function pickShape(kind: string): Shape {
  switch (kind) {
    case "circle":
      return new Circle();
    case "square":
      return new Square();
    default:
      return new Pentagon();
  }
}
`;
    const file = await tsFile(source);
    const finding = repeatedSwitchFinding("probe.ts", { startLine: 3, endLine: 10, symbol: "pickShape" });
    const h = hypothesis.build(finding, null, ctxWithFiles([file]));
    expect(h).not.toBeNull();
    const req = h!.checks.find((c) => c.label.includes("≥2 tipos DISTINTOS"));
    expect(req?.why).toContain("El switch repetido");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI6 — LA CUARTA VÍA: EL HECHO DEL GRAFO.
 *
 * Fija la premisa que este archivo daba por cierta y dejó de serlo: que
 * `build()` de esta ancla intra-function siempre recibe `graph: null`.
 * `hypotheses/run.ts#rebuildHypothesesWithGraph` lo llama con el grafo REAL,
 * y ES esa llamada la que publica. La vía por grafo cubre lo que el texto no
 * puede — Python (`Foo(...)` cruzado contra `classNodes`), Go
 * (`composite_literal`) y `new x` en minúscula — porque la arista
 * `instantiates` se deriva por sonda centinela por lenguaje, no por regex.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/factory-method — OLA AI (AI6): la cuarta vía, el hecho del grafo", () => {
  /** El cuerpo NO tiene ninguna de las 4 formas de `RETURN_CONSTRUCTS` — es
   *  el idioma de Python: `Circle()` a secas. Sólo el grafo lo sabe. */
  const PY_LIKE_TS = `
class Router {
  pick(kind: string) {
    if (kind === "circle") return makeCircle();
    else if (kind === "square") return makeSquare();
    else if (kind === "tri") return makeTri();
    else if (kind === "hex") return makeHex();
    else return makePent();
  }
}
`;

  /** `tsFile` no expone `metrics`; para el caso `isFactoryLike` hace falta,
   *  así que se arma el `FileUnit` con el mismo arnés, una línea más abajo. */
  async function tsFileConMetrics(source: string, filePath: string, metrics: Partial<FunctionUnit["metrics"]>): Promise<FileUnit> {
    const sets = await nodeSetsFor(TS_DECL.wasm, TS_DECL.probeSource);
    const root = await parseRoot(TS_DECL.wasm, source);
    return fileUnitFrom(root, sets, "typescript", { file: filePath, metrics });
  }

  async function escenario(opts: { tipos: number; isFactoryLike?: boolean }) {
    const file = "probe.ts";
    const treeFile = opts.isFactoryLike ? await tsFileConMetrics(PY_LIKE_TS, file, { isFactoryLike: true }) : await tsFile(PY_LIKE_TS, file);
    const fn = treeFile.functions.find((f) => f.name === "pick")!;
    const router = graphSym(file, ["Router"]);
    const pick = graphMethod(file, "Router", "pick");
    const productos = ["Circle", "Square", "Tri"].slice(0, opts.tipos).map((n) => graphSym(file, [n]));
    const graph: CodeGraph = {
      nodes: [router, pick, ...productos],
      edges: [graphEdge(router.id, pick.id, "contains"), ...productos.map((p) => graphEdge(pick.id, p.id, "instantiates"))],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = { ...chainFinding(file, fn, 5), variant: "ladder" };
    return hypothesis.build(finding, graph, ctxWithFiles([treeFile], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]));
  }

  it("cuerpo SIN ninguna forma sintáctica de construcción, pero 2 aristas `instantiates` a tipos distintos ⇒ SÍ candidata", async () => {
    const h = await escenario({ tipos: 2 });
    expect(h).not.toBeNull();
    const req = h!.checks.find((c) => c.label.includes("≥2 tipos DISTINTOS"));
    expect(req?.passed).toBe(true);
    expect(req?.why).toContain("GRAFO");
  });

  it("una sola arista `instantiates` ⇒ NO candidata (mismo piso de escala que las otras dos vías)", async () => {
    expect(await escenario({ tipos: 1 })).toBeNull();
  });

  it("`isFactoryLike` ⇒ NO candidata, también por la vía del grafo", async () => {
    expect(await escenario({ tipos: 3, isFactoryLike: true })).toBeNull();
  });

  it("sin grafo (la primera pasada de `run.ts`) ⇒ NO candidata: la vía no aprueba por ausencia de evidencia", async () => {
    const file = "probe.ts";
    const treeFile = await tsFile(PY_LIKE_TS, file);
    const fn = treeFile.functions.find((f) => f.name === "pick")!;
    const finding = { ...chainFinding(file, fn, 5), variant: "ladder" };
    expect(hypothesis.build(finding, null, ctxWithFiles([treeFile]))).toBeNull();
  });

  it("el nodo de la función no está en el grafo ⇒ NO candidata (no se afirma nada sobre un nodo que no se ubicó)", async () => {
    const file = "probe.ts";
    const treeFile = await tsFile(PY_LIKE_TS, file);
    const fn = treeFile.functions.find((f) => f.name === "pick")!;
    const otro = graphSym("otro.ts", ["Otro"]);
    const graph: CodeGraph = { nodes: [otro], edges: [], resolution: EMPTY_RESOLUTION };
    const finding = { ...chainFinding(file, fn, 5), variant: "ladder" };
    expect(hypothesis.build(finding, graph, ctxWithFiles([treeFile]))).toBeNull();
  });

  it("aristas `instantiates` hacia el MISMO tipo dos veces ⇒ NO candidata (tipos DISTINTOS, no ocurrencias)", async () => {
    const file = "probe.ts";
    const treeFile = await tsFile(PY_LIKE_TS, file);
    const fn = treeFile.functions.find((f) => f.name === "pick")!;
    const router = graphSym(file, ["Router"]);
    const pick = graphMethod(file, "Router", "pick");
    const circle = graphSym(file, ["Circle"]);
    const graph: CodeGraph = {
      nodes: [router, pick, circle],
      edges: [
        graphEdge(router.id, pick.id, "contains"),
        graphEdge(pick.id, circle.id, "instantiates"),
        graphEdge(pick.id, circle.id, "instantiates"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = { ...chainFinding(file, fn, 5), variant: "ladder" };
    expect(hypothesis.build(finding, graph, ctxWithFiles([treeFile]))).toBeNull();
  });

  it("la vía del ÁRBOL sigue teniendo prioridad sobre la del grafo (evidencia por texto, no por arista)", async () => {
    const file = "probe.ts";
    const source = `
class Router {
  pick(kind: string) {
    if (kind === "a") return new Circle();
    else if (kind === "b") return new Square();
    else if (kind === "c") return null;
    else if (kind === "d") return null;
    else return null;
  }
}
`;
    const treeFile = await tsFile(source, file);
    const fn = treeFile.functions.find((f) => f.name === "pick")!;
    const router = graphSym(file, ["Router"]);
    const pick = graphMethod(file, "Router", "pick");
    const graph: CodeGraph = {
      nodes: [router, pick],
      edges: [graphEdge(router.id, pick.id, "contains")],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = { ...chainFinding(file, fn, 5), variant: "ladder" };
    const h = hypothesis.build(finding, graph, ctxWithFiles([treeFile], [], [repoFunctionFor(fn, { chainHasNullCheck: false })]));
    expect(h).not.toBeNull();
    const req = h!.checks.find((c) => c.label.includes("≥2 tipos DISTINTOS"));
    expect(req?.why).toContain("cuerpo vivo");
  });
});
