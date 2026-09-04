import { describe, expect, it, vi } from "vitest";

import type { Capability } from "./capabilities.js";
import type { CodeGraph } from "../graph/types.js";
import { pisoDeclarado, presupuesto } from "./thresholds.js";
import { runDetectorSet, runDetectors, type DetectorRunInput } from "./run.js";
import type { FileUnit, FunctionUnit, IntraFunctionDetector, InterFileDetector, RepoUnit } from "./types.js";

function fakeGraph(overrides: Partial<CodeGraph> = {}): CodeGraph {
  return {
    nodes: [],
    edges: [],
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    ...overrides,
  };
}

function fakeNode() {
  return {
    type: "fake",
    isNamed: true,
    childCount: 0,
    child: () => null,
    childForFieldName: () => null,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 1, column: 0 },
    text: "",
  };
}

function fakeFunction(overrides: Partial<FunctionUnit> = {}): FunctionUnit {
  return {
    file: "a.rb",
    language: "ruby",
    name: "foo",
    startLine: 1,
    endLine: 10,
    symbolPath: ["foo"],
    node: fakeNode(),
    sets: { functionNodes: new Set(), classNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), nestingNodes: new Set(), cloneNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(), switchContainerNodes: new Set() },
    metrics: {
      branches: 0,
      chain: 0,
      cognitive: 0,
      maxNesting: 0,
      parameters: 0,
      chainHasNullCheck: false,
      chainInstantiates: false,
      className: null,
      isConstructor: false,
      isFactoryLike: false,
    },
    ...overrides,
  };
}

function fakeFile(functions: FunctionUnit[], language = "ruby"): FileUnit {
  return {
    path: functions[0]?.file ?? "a.rb",
    language,
    lines: 10,
    root: fakeNode(),
    sets: { functionNodes: new Set(), classNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), nestingNodes: new Set(), cloneNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(), switchContainerNodes: new Set() },
    functions,
  };
}

function fakeRepo(overrides: Partial<RepoUnit> = {}): RepoUnit {
  return {
    repoName: "r",
    files: [],
    functions: [],
    clones: [],
    graph: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<DetectorRunInput> = {}): DetectorRunInput {
  return {
    repo: fakeRepo(),
    languages: new Map([["ruby", { capabilities: new Set(), sets: fakeFile([]).sets }]]),
    benchmarks: null,
    ...overrides,
  };
}

function detectorSevereAt(id: string, severity: number, needs: readonly Capability[] = []): IntraFunctionDetector {
  return {
    id,
    scope: "intra-function",
    kind: "long-function",
    title: id,
    needs,
    thresholds: { min: pisoDeclarado(1, { rationale: "test" }) },
    run: (fn, ctx) => {
      const t = ctx.threshold("min");
      return [
        {
          title: id,
          detail: "d",
          trigger: [{ label: "x", value: 1, threshold: t }],
          locations: [{ file: fn.file, startLine: fn.startLine, endLine: fn.endLine, role: "sitio" }],
          severity,
          advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
        },
      ];
    },
  };
}

describe("runDetectorSet", () => {
  it("F1: runDetectors() corre los tres detectores reales del registro contra un input real; sin capacidades ni funciones, no producen hallazgos pero SÍ cobertura", async () => {
    // F1 pobló `DETECTORS` con los primeros tres detectores reales
    // (empty-catch, large-class, repeated-switch) — esta ola YA NO prueba
    // "registro vacío" (eso vive en `registry.test.ts`); prueba que
    // `runDetectors()` (a diferencia de `runDetectorSet()`, que toma un
    // array explícito) de verdad delega en `DETECTORS`.
    const result = await runDetectors(baseInput());
    expect(result.findings).toEqual([]);
    // Deliberadamente `arrayContaining` y no una igualdad exacta: un detector
    // nuevo NO debe tener que editar este test (mismo criterio que
    // `registry.test.ts`). Lo que importa como invariante es que los tres de
    // F1 sigan registrados, no que sean los únicos.
    expect(result.coverage.map((c) => c.detectorId).sort()).toEqual(
      expect.arrayContaining(["empty-catch", "large-class", "repeated-switch"]),
    );
    // Sin capacidad "excepciones"/"unidad-tipo-clase" en el fake input (ver
    // `fakeFile([]).sets`, todos los Sets vacíos), los dos con `needs` no
    // vacío quedan "no-aplicable"; `repeated-switch` (needs: []) sí corre,
    // sobre cero unidades.
    const byId = new Map(result.coverage.map((c) => [c.detectorId, c]));
    expect(byId.get("empty-catch")?.status).toBe("no-aplicable");
    expect(byId.get("large-class")?.status).toBe("no-aplicable");
    expect(byId.get("repeated-switch")?.status).toBe("corrio");
  });

  it("corre un detector intra-function sobre cada función de cada archivo de su lenguaje", async () => {
    const fn = fakeFunction();
    const input = baseInput({ files: [fakeFile([fn])] });
    const detector = detectorSevereAt("d1", 50);
    const { findings, coverage } = await runDetectorSet([detector], input);
    expect(findings).toHaveLength(1);
    expect(findings[0].detectorId).toBe("d1");
    expect(findings[0].scope).toBe("intra-function");
    expect(findings[0].language).toBe("ruby");
    expect(coverage).toEqual([
      { detectorId: "d1", title: "d1", scope: "intra-function", kind: "long-function", language: "ruby", status: "corrio", unitsConsidered: 1, findings: 1 },
    ]);
  });

  it("orden final: severity desc, id asc como desempate — nunca orden de inserción", async () => {
    const fn1 = fakeFunction({ file: "a.rb", symbolPath: ["a"] });
    const fn2 = fakeFunction({ file: "b.rb", symbolPath: ["b"] });
    const input = baseInput({ files: [fakeFile([fn1, fn2])] });
    const low = detectorSevereAt("low-severity", 10);
    const high = detectorSevereAt("high-severity", 90);
    const { findings } = await runDetectorSet([low, high], input);
    expect(findings.map((f) => f.detectorId)).toEqual(["high-severity", "high-severity", "low-severity", "low-severity"]);
    // dentro de la misma severidad, dos hallazgos de "low-severity" (uno por archivo): id asc,
    // por ORDEN DE CODE UNIT (`<`), no `localeCompare` — el mismo criterio que usa el runner.
    const lows = findings.filter((f) => f.detectorId === "low-severity");
    expect(lows[0].id <= lows[1].id).toBe(true);
  });

  it("capacidad faltante ⇒ status 'no-aplicable', nunca 0 hallazgos disfrazado de 'corrio'", async () => {
    const input = baseInput({ files: [fakeFile([fakeFunction()])] });
    const detector = detectorSevereAt("needs-cap", 50, ["herencia"]);
    const { findings, coverage } = await runDetectorSet([detector], input);
    expect(findings).toEqual([]);
    expect(coverage).toEqual([
      {
        detectorId: "needs-cap",
        title: "needs-cap",
        scope: "intra-function",
        kind: "long-function",
        language: "ruby",
        status: "no-aplicable",
        missingCapabilities: ["herencia"],
        unitsConsidered: 0,
        findings: 0,
      },
    ]);
  });

  it("un detector que tira ⇒ status 'error', se descartan SÓLO sus hallazgos, la corrida sigue con los demás", async () => {
    const input = baseInput({ files: [fakeFile([fakeFunction()])] });
    const broken: IntraFunctionDetector = {
      id: "broken",
      scope: "intra-function",
      kind: "long-function",
      title: "broken",
      needs: [],
      thresholds: {},
      run: () => {
        throw new Error("boom");
      },
    };
    const healthy = detectorSevereAt("healthy", 50);
    const { findings, coverage } = await runDetectorSet([broken, healthy], input);
    expect(findings).toHaveLength(1);
    expect(findings[0].detectorId).toBe("healthy");
    const brokenCoverage = coverage.find((c) => c.detectorId === "broken")!;
    expect(brokenCoverage.status).toBe("error");
    expect(brokenCoverage.error).toContain("boom");
  });

  it("inter-file con needsGraph:true y graph:null ⇒ 'sin-grafo', nunca 'cero hallazgos'", async () => {
    const detector: InterFileDetector = {
      id: "cross-file",
      scope: "inter-file",
      kind: "duplication",
      title: "cross-file",
      needs: [],
      needsGraph: true,
      thresholds: {},
      run: () => [],
    };
    const { findings, coverage } = await runDetectorSet([detector], baseInput());
    expect(findings).toEqual([]);
    expect(coverage).toEqual([
      { detectorId: "cross-file", title: "cross-file", scope: "inter-file", kind: "duplication", status: "sin-grafo", unitsConsidered: 0, findings: 0 },
    ]);
  });

  it("inter-file con needs no vacío y NINGÚN lenguaje del repo provee la capacidad ⇒ 'no-aplicable', nunca ejecuta run() (regresión: `needs` era letra muerta para inter-file)", async () => {
    let ran = false;
    const detector: InterFileDetector = {
      id: "cross-file-needs",
      scope: "inter-file",
      kind: "duplication",
      title: "cross-file-needs",
      needs: ["herencia"],
      needsGraph: false,
      thresholds: {},
      run: () => {
        ran = true;
        return [];
      },
    };
    // `baseInput()` sólo declara "ruby" con `capabilities: new Set()` — ningún lenguaje del repo provee "herencia".
    const { findings, coverage } = await runDetectorSet([detector], baseInput());
    expect(ran).toBe(false);
    expect(findings).toEqual([]);
    expect(coverage).toEqual([
      {
        detectorId: "cross-file-needs",
        title: "cross-file-needs",
        scope: "inter-file",
        kind: "duplication",
        status: "no-aplicable",
        missingCapabilities: ["herencia"],
        unitsConsidered: 0,
        findings: 0,
      },
    ]);
  });

  it("inter-file con needs no vacío y AL MENOS UN lenguaje del repo provee la capacidad ⇒ corre (unión, no intersección)", async () => {
    const detector: InterFileDetector = {
      id: "cross-file-needs-ok",
      scope: "inter-file",
      kind: "duplication",
      title: "cross-file-needs-ok",
      needs: ["herencia"],
      needsGraph: false,
      thresholds: {},
      run: () => [],
    };
    const input = baseInput({
      languages: new Map([
        ["ruby", { capabilities: new Set(), sets: fakeFile([]).sets }],
        ["java", { capabilities: new Set<Capability>(["herencia"]), sets: fakeFile([]).sets }],
      ]),
    });
    const { coverage } = await runDetectorSet([detector], input);
    expect(coverage[0]!.status).toBe("corrio");
  });

  it("inter-file con needsGraph:false corre igual sin grafo (duplication de hoy)", async () => {
    const detector: InterFileDetector = {
      id: "dup",
      scope: "inter-file",
      kind: "duplication",
      title: "dup",
      needs: [],
      needsGraph: false,
      thresholds: { min: pisoDeclarado(1, { rationale: "t" }) },
      run: (repo, ctx) => {
        const t = ctx.threshold("min");
        return [
          {
            title: "dup",
            detail: "d",
            trigger: [{ label: "x", value: 1, threshold: t }],
            locations: [{ file: "a.rb", startLine: 1, endLine: 2, role: "copia" }],
            severity: 40,
            advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
          },
        ];
      },
    };
    const { findings, coverage } = await runDetectorSet([detector], baseInput());
    expect(findings).toHaveLength(1);
    expect(findings[0].language).toBeNull();
    expect(coverage[0].status).toBe("corrio");
  });

  describe("sin-aristas / sin-metricas (F5b — DIAGNÓSTICO-5B §5, Problema 3)", () => {
    function edgeDetector(
      needsEdges: readonly ("extends" | "instantiates")[],
      state: { ran: boolean },
      needsGraph = true,
    ): InterFileDetector {
      return {
        id: "needs-edges",
        scope: "inter-file",
        kind: "duplication",
        title: "needs-edges",
        needs: [],
        needsGraph,
        needsEdges,
        thresholds: {},
        run: () => {
          state.ran = true;
          return [];
        },
      };
    }

    it("needsEdges declarado y NINGUNA arista del grafo tiene ese kind ⇒ 'sin-aristas', nunca ejecuta run()", async () => {
      const state = { ran: false };
      const detector = edgeDetector(["instantiates"], state);
      const input = baseInput({ repo: fakeRepo({ graph: fakeGraph({ edges: [{ from: "a", to: "b", kind: "extends", provenance: "declared", weight: 1 }] }) }) });
      const { findings, coverage } = await runDetectorSet([detector], input);
      expect(state.ran).toBe(false);
      expect(findings).toEqual([]);
      expect(coverage).toEqual([
        {
          detectorId: "needs-edges",
          title: "needs-edges",
          scope: "inter-file",
          kind: "duplication",
          status: "sin-aristas",
          missingEdgeKinds: ["instantiates"],
          unitsConsidered: 0,
          findings: 0,
        },
      ]);
    });

    it("needsEdges declarado y graph:null (sin needsGraph forzándolo antes) ⇒ 'sin-aristas' igual, sin tirar", async () => {
      const state = { ran: false };
      const detector = edgeDetector(["extends"], state, false);
      const { coverage } = await runDetectorSet([detector], baseInput());
      expect(coverage[0]!.status).toBe("sin-aristas");
    });

    /*
     * OLA 11b (frente B1) — EL ORDEN ENTRE LOS GATES, fijado por test. Ver el
     * comentario largo de `run.ts#runInterFile`: cuando `needs` y `needsEdges`
     * fallan LOS DOS, gana `no-aplicable`, porque habla del LENGUAJE
     * (permanente) mientras que `sin-aristas` habla sólo de esta corrida
     * (transitoria). Antes de esta ola el orden era el inverso, y eso rompía
     * la aserción que `import-depth-demeter.test.ts` ya hacía sobre un repo
     * sólo-ruby.
     */
    it("needs Y needsEdges fallan los dos ⇒ gana 'no-aplicable' (la capacidad del lenguaje es la respuesta permanente)", async () => {
      let ran = false;
      const detector: InterFileDetector = {
        id: "needs-ambos",
        scope: "inter-file",
        kind: "duplication",
        title: "needs-ambos",
        needs: ["imports"],
        needsGraph: false,
        needsEdges: ["imports"],
        thresholds: {},
        run: () => {
          ran = true;
          return [];
        },
      };
      const { coverage } = await runDetectorSet([detector], baseInput());
      expect(ran).toBe(false);
      expect(coverage[0]!.status).toBe("no-aplicable");
      expect(coverage[0]!.missingCapabilities).toEqual(["imports"]);
    });

    it("needsEdges declarado y el grafo SÍ tiene ese kind ⇒ corre de verdad", async () => {
      const state = { ran: false };
      const detector = edgeDetector(["extends"], state);
      const input = baseInput({ repo: fakeRepo({ graph: fakeGraph({ edges: [{ from: "a", to: "b", kind: "extends", provenance: "declared", weight: 1 }] }) }) });
      const { coverage } = await runDetectorSet([detector], input);
      expect(state.ran).toBe(true);
      expect(coverage[0]!.status).toBe("corrio");
    });

    /**
     * `needsAnyEdge` — LA SEMÁNTICA QUE `needsEdges` NO PODÍA EXPRESAR (Ola
     * 11b, frente B0). `needsEdges` es conjunción (AND): declarado con varios
     * kinds, el runner exige TODOS. Antes de esta ola era el ÚNICO campo, y
     * tres detectores reales que en verdad necesitaban ALTERNATIVA (OR —
     * "cualquiera de estos kinds alcanza") se habían declarado con
     * `needsEdges` igual, porque no había otra forma de declarar un
     * vocabulario cerrado. El runner los apagaba enteros (`sin-aristas`)
     * cada vez que al grafo le faltaba UN SOLO kind de la lista, aunque OTRO
     * kind de esa misma lista, presente, ya bastara para encontrar algo real
     * — 5 hallazgos verdaderos silenciados (ver `speculative-abstraction.ts`/
     * `unstable-dependency.ts`/`parallel-hierarchies.ts`). Este bloque fija
     * la semántica correcta con un detector fake, y el segundo test la ROMPE
     * A PROPÓSITO (declarando el vocabulario como `needsEdges` en vez de
     * `needsAnyEdge`, exactamente el error que se cometió en producción) para
     * dejar registrado qué pasa cuando se confunde: el detector se silencia
     * pese a tener una arista real presente.
     */
    function anyEdgeDetector(needsAnyEdge: readonly ("extends" | "implements" | "satisfies")[], state: { ran: boolean }): InterFileDetector {
      return {
        id: "needs-any-edge",
        scope: "inter-file",
        kind: "duplication",
        title: "needs-any-edge",
        needs: [],
        needsGraph: true,
        needsAnyEdge,
        thresholds: {},
        run: () => {
          state.ran = true;
          return [];
        },
      };
    }

    it("needsAnyEdge declarado con 3 kinds y el grafo tiene SÓLO UNO de ellos ⇒ corre de verdad, no se silencia", async () => {
      const state = { ran: false };
      const detector = anyEdgeDetector(["extends", "implements", "satisfies"], state);
      // Mismo escenario que Rails midió para `speculative-abstraction`: 152
      // aristas `extends`, cero `implements`/`satisfies` (Ruby no tiene esa
      // construcción) — con OR real, esto tiene que correr igual.
      const input = baseInput({ repo: fakeRepo({ graph: fakeGraph({ edges: [{ from: "a", to: "b", kind: "extends", provenance: "declared", weight: 1 }] }) }) });
      const { coverage } = await runDetectorSet([detector], input);
      expect(state.ran).toBe(true);
      expect(coverage[0]!.status).toBe("corrio");
    });

    it("needsAnyEdge declarado y NINGUNO de los kinds está presente ⇒ 'sin-aristas' con la lista COMPLETA (no hay subconjunto más chico que nombrar)", async () => {
      const state = { ran: false };
      const detector = anyEdgeDetector(["extends", "implements", "satisfies"], state);
      const input = baseInput({ repo: fakeRepo({ graph: fakeGraph({ edges: [{ from: "a", to: "b", kind: "references", provenance: "declared", weight: 1 }] }) }) });
      const { findings, coverage } = await runDetectorSet([detector], input);
      expect(state.ran).toBe(false);
      expect(findings).toEqual([]);
      expect(coverage).toEqual([
        {
          detectorId: "needs-any-edge",
          title: "needs-any-edge",
          scope: "inter-file",
          kind: "duplication",
          status: "sin-aristas",
          missingEdgeKinds: ["extends", "implements", "satisfies"],
          unitsConsidered: 0,
          findings: 0,
        },
      ]);
    });

    it("ROTO A PROPÓSITO: el MISMO escenario declarado con needsEdges (conjunción) en vez de needsAnyEdge (alternativa) SÍ se silencia — es exactamente la regresión medida en producción", async () => {
      const state = { ran: false };
      // Mismo vocabulario, mismo grafo (sólo `extends` presente) que el test
      // de arriba — la ÚNICA diferencia es declarar `needsEdges` en vez de
      // `needsAnyEdge`, el error real que cometieron `speculative-
      // abstraction`/`unstable-dependency`/`parallel-hierarchies` antes de
      // esta ola.
      const detectorConjuncionRota: InterFileDetector = {
        id: "needs-edges-conjuncion-rota",
        scope: "inter-file",
        kind: "duplication",
        title: "needs-edges-conjuncion-rota",
        needs: [],
        needsGraph: true,
        needsEdges: ["extends", "implements", "satisfies"],
        thresholds: {},
        run: () => {
          state.ran = true;
          return [];
        },
      };
      const input = baseInput({ repo: fakeRepo({ graph: fakeGraph({ edges: [{ from: "a", to: "b", kind: "extends", provenance: "declared", weight: 1 }] }) }) });
      const { coverage } = await runDetectorSet([detectorConjuncionRota], input);
      // Lo que pasó en producción: `extends` SÍ estaba (152 aristas en Rails,
      // 0 en `src/`), pero como `needsEdges` exige TODOS, `implements`/
      // `satisfies` ausentes bastaban para apagar el detector entero —
      // `sin-aristas`, nunca `run()`. Ver el test anterior para el mismo
      // grafo con el campo correcto (`corrio`).
      expect(state.ran).toBe(false);
      expect(coverage[0]!.status).toBe("sin-aristas");
      expect(coverage[0]!.missingEdgeKinds).toEqual(["implements", "satisfies"]);
    });

    it("needsMetrics declarado y repo.metrics ausente (hoy: SIEMPRE, F3 no cablea el productor) ⇒ 'sin-metricas', nunca ejecuta run()", async () => {
      let ran = false;
      const detector: InterFileDetector = {
        id: "needs-metrics",
        scope: "inter-file",
        kind: "duplication",
        title: "needs-metrics",
        needs: [],
        needsGraph: false,
        needsMetrics: ["pagerank"],
        thresholds: {},
        run: () => {
          ran = true;
          return [];
        },
      };
      const { findings, coverage } = await runDetectorSet([detector], baseInput());
      expect(ran).toBe(false);
      expect(findings).toEqual([]);
      expect(coverage).toEqual([
        {
          detectorId: "needs-metrics",
          title: "needs-metrics",
          scope: "inter-file",
          kind: "duplication",
          status: "sin-metricas",
          missingMetrics: ["pagerank"],
          unitsConsidered: 0,
          findings: 0,
        },
      ]);
    });

    it("needsMetrics declarado y repo.metrics SÍ trae ese id ⇒ corre de verdad", async () => {
      let ran = false;
      const detector: InterFileDetector = {
        id: "needs-metrics-ok",
        scope: "inter-file",
        kind: "duplication",
        title: "needs-metrics-ok",
        needs: [],
        needsGraph: false,
        needsMetrics: ["pagerank"],
        thresholds: {},
        run: () => {
          ran = true;
          return [];
        },
      };
      const input = baseInput({ repo: fakeRepo({ metrics: new Set(["pagerank"]) }) });
      const { coverage } = await runDetectorSet([detector], input);
      expect(ran).toBe(true);
      expect(coverage[0]!.status).toBe("corrio");
    });
  });

  it("maxFindings agotado ⇒ status 'presupuesto-agotado', se conservan los de mayor severidad", async () => {
    const fns = [
      fakeFunction({ file: "a.rb", symbolPath: ["a"] }),
      fakeFunction({ file: "b.rb", symbolPath: ["b"] }),
      fakeFunction({ file: "c.rb", symbolPath: ["c"] }),
    ];
    const input = baseInput({ files: [fakeFile(fns)] });
    const detector: IntraFunctionDetector = {
      ...detectorSevereAt("capped", 10),
      maxFindings: presupuesto(2, { rationale: "test" }),
      run: (fn, ctx) => {
        const t = ctx.threshold("min");
        const severity = fn.file === "a.rb" ? 10 : fn.file === "b.rb" ? 90 : 50;
        return [
          {
            title: "capped",
            detail: "d",
            trigger: [{ label: "x", value: 1, threshold: t }],
            locations: [{ file: fn.file, startLine: 1, endLine: 2, role: "sitio" }],
            severity,
            advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
          },
        ];
      },
    };
    const { findings, coverage } = await runDetectorSet([detector], input);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.severity)).toEqual([90, 50]);
    expect(coverage[0].status).toBe("presupuesto-agotado");
    expect(coverage[0].findings).toBe(2);
  });

  describe("yield intra-detector (Paquete C)", () => {
    // Repro medida: antes de este paquete, `runPerLanguage` sólo cedía el
    // event loop ENTRE detectores (`runDetectorSet`), nunca DENTRO del
    // recorrido de un mismo detector sobre las funciones de un archivo. Un
    // detector síncronamente lento sobre muchas funciones (p.ej.
    // `LocalCache.java` de guava, 448 funciones) bloqueaba de un tirón. Este
    // bloque prueba que ahora cede A MITAD de un detector cuando el trabajo
    // acumulado supera el presupuesto ya declarado en
    // `graph/metrics/budget.ts` (`DEFAULT_METRIC_BUDGET_MS`, 30 ms) — sin
    // reordenar ni perder ningún hallazgo.
    function busyWaitMs(ms: number): void {
      const until = performance.now() + ms;
      while (performance.now() < until) {
        /* spin: simula trabajo síncrono de un detector real */
      }
    }

    function slowDetector(perCallMs: number): IntraFunctionDetector {
      return {
        id: "slow",
        scope: "intra-function",
        kind: "long-function",
        title: "slow",
        needs: [],
        thresholds: { min: pisoDeclarado(1, { rationale: "test" }) },
        run: (fn, ctx) => {
          busyWaitMs(perCallMs);
          const t = ctx.threshold("min");
          return [
            {
              title: "slow",
              detail: "d",
              trigger: [{ label: "x", value: 1, threshold: t }],
              locations: [{ file: fn.file, startLine: fn.startLine, endLine: fn.endLine, role: "sitio" }],
              severity: fn.startLine, // distinto por función, para poder chequear el orden
              advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
            },
          ];
        },
      };
    }

    it("cede el event loop A MITAD de un detector cuando el trabajo acumulado excede el presupuesto (~30ms)", async () => {
      // 6 funciones, ~8ms de trabajo síncrono cada una: al acumular ~30ms
      // (tras la 4ta función) el presupuesto se agota y debe ceder una vez
      // A MITAD del recorrido, antes de terminar las 6.
      const fns = Array.from({ length: 6 }, (_, i) =>
        fakeFunction({ file: `f${i}.rb`, symbolPath: [`f${i}`], startLine: i + 1, endLine: i + 2 }),
      );
      const input = baseInput({ files: [fakeFile(fns)] });
      const immediateSpy = vi.spyOn(global, "setImmediate");
      const { findings } = await runDetectorSet([slowDetector(8)], input);
      // Un único detector: el yield "entre detectores" de `runDetectorSet`
      // aporta exactamente 1 llamada a `setImmediate` al final. Más de 1
      // sólo puede venir del yield NUEVO, intra-detector.
      expect(immediateSpy.mock.calls.length).toBeGreaterThan(1);
      immediateSpy.mockRestore();
      // Ceder a mitad de camino no debe perder NINGÚN hallazgo ni reordenar
      // el recorrido de funciones: 6 funciones -> 6 hallazgos, y el orden
      // final sigue siendo severity desc (acá, startLine desc) como exige
      // `bySeverityDescThenId`.
      expect(findings).toHaveLength(6);
      expect(findings.map((f) => f.severity)).toEqual([6, 5, 4, 3, 2, 1]);
    });

    it("un detector rápido (nunca excede el presupuesto) NO cede de más: sólo el yield final entre detectores", async () => {
      const fns = Array.from({ length: 6 }, (_, i) =>
        fakeFunction({ file: `f${i}.rb`, symbolPath: [`f${i}`], startLine: i + 1, endLine: i + 2 }),
      );
      const input = baseInput({ files: [fakeFile(fns)] });
      const immediateSpy = vi.spyOn(global, "setImmediate");
      const { findings } = await runDetectorSet([slowDetector(0)], input);
      expect(immediateSpy.mock.calls.length).toBe(1);
      immediateSpy.mockRestore();
      expect(findings).toHaveLength(6);
    });
  });
});
