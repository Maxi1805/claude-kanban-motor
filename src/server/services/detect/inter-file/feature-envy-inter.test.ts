import { describe, expect, it } from "vitest";

import {
  fileNodeId,
  symbolNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type Provenance,
} from "../../graph/types.js";
import { runDetectorSet } from "../run.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import {
  buildFeatureEnvyInterFindings,
  detector,
} from "./feature-envy-inter.js";

/**
 * `inter-file`, `needsGraph: true`: igual que `unused-symbol.test.ts`/
 * `orphan-file.test.ts`, este detector corre enteramente sobre `CodeGraph` —
 * "≥3 lenguajes que emiten" no aplica, el grafo se construye a mano y
 * `language` sólo importa para la reducción de severidad en Java.
 */

function symNode(file: string, symbolPath: readonly string[]): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "function-like",
  };
}

function refEdge(
  fromFile: string,
  fromSymbolPath: readonly string[],
  toFile: string,
  toSymbolPath: readonly string[],
  provenance: Provenance = "resolved",
  weight = 1,
): CodeGraphEdge {
  return {
    from: symbolNodeId(fromFile, fromSymbolPath),
    to: symbolNodeId(toFile, toSymbolPath),
    kind: "references",
    provenance,
    weight,
  };
}

const EMPTY_STATS = {
  candidates: 0,
  resolved: 0,
  droppedAmbiguous: 0,
  unresolved: 0,
  byStage: [],
};

function graphOf(
  nodes: readonly CodeGraphNode[],
  edges: readonly CodeGraphEdge[],
): CodeGraph {
  return { nodes, edges, resolution: EMPTY_STATS };
}

function fileSummary(
  path: string,
  language = "typescript",
  lines = 20,
): FileSummary {
  return { path, lines, language };
}

function repoWith(
  files: readonly FileSummary[],
  graph: CodeGraph | null,
): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/**
 * `a.ts` referencia 4 símbolos DISTINTOS de `b.ts` (ATFD=4, por encima del
 * umbral publicado FEW=2) y sólo 1 evento propio (LAA=1/5=0.2, por debajo de
 * ONE_THIRD=1/3), toda la concentración foránea en `b.ts` (dominance=1.0) —
 * caso positivo de manual de referencia.
 */
function enviousGraph(): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [
    symNode("a.ts", ["run"]),
    symNode("a.ts", ["helperLocal"]),
    symNode("b.ts", ["one"]),
    symNode("b.ts", ["two"]),
    symNode("b.ts", ["three"]),
    symNode("b.ts", ["four"]),
  ];
  const edges: CodeGraphEdge[] = [
    refEdge("a.ts", ["run"], "b.ts", ["one"]),
    refEdge("a.ts", ["run"], "b.ts", ["two"]),
    refEdge("a.ts", ["run"], "b.ts", ["three"]),
    refEdge("a.ts", ["run"], "b.ts", ["four"]),
    refEdge("a.ts", ["run"], "a.ts", ["helperLocal"]),
  ];
  return { nodes, edges };
}

/**
 * Archivos de relleno SIN ninguna arista — igual razón que `filler()` en
 * `coupling-without-abstraction.test.ts`: `maxUbiquitousFanInRatio` (JUICIO
 * DE PRECISIÓN, ver el docstring del módulo) mide el fan-in del archivo
 * dominante como PROPORCIÓN del total de archivos, así que un repo de
 * fixture con sólo 2 archivos convierte a "b.ts" (fan-in=1) en "ubicuo"
 * (1/2 = 50%) por el tamaño artificialmente chico, no por ser de verdad
 * infraestructura compartida.
 */
const FILLER: FileSummary[] = Array.from({ length: 20 }, (_, i) =>
  fileSummary(`filler${i}.ts`),
);

const FILES: FileSummary[] = [
  fileSummary("a.ts"),
  fileSummary("b.ts"),
  ...FILLER,
];

describe("feature-envy-inter", () => {
  it("javascript/typescript: un archivo que referencia más símbolos de otro que propios es un hallazgo, con rol", async () => {
    const { nodes, edges } = enviousGraph();
    const repo = repoWith(FILES, graphOf(nodes, edges));
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.file).toBe("a.ts");
    expect(findings[0]!.locations[0]!.role).toBe(
      "archivo con más referencias foráneas que propias",
    );
    expect(findings[0]!.title).toContain("b.ts");
    expect(findings[0]!.trigger[0]!.value).toBe(4);
  });

  it("control negativo: un archivo que usa mayormente sus propios símbolos no dispara nada", async () => {
    const nodes: CodeGraphNode[] = [
      symNode("a.ts", ["run"]),
      symNode("a.ts", ["ownOne"]),
      symNode("a.ts", ["ownTwo"]),
      symNode("a.ts", ["ownThree"]),
      symNode("b.ts", ["helper"]),
    ];
    const edges: CodeGraphEdge[] = [
      refEdge("a.ts", ["run"], "a.ts", ["ownOne"]),
      refEdge("a.ts", ["run"], "a.ts", ["ownTwo"]),
      refEdge("a.ts", ["run"], "a.ts", ["ownThree"]),
      refEdge("a.ts", ["run"], "b.ts", ["helper"]),
    ];
    const repo = repoWith(FILES, graphOf(nodes, edges));
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
  });

  it("control negativo: tráfico foráneo repartido entre varios archivos, sin uno dominante, no dispara (orquestador)", async () => {
    // cli.ts referencia TRES archivos externos por igual (3 símbolos distintos cada uno, ATFD=3 > FEW=2 y LAA=0 <
    // ONE_THIRD si se mirara un solo proveedor) pero NINGUNO alcanza el 50% de "dominance": es un archivo
    // orquestador típico (junta varios módulos por diseño), no un caso de envidia hacia uno en particular.
    const nodes: CodeGraphNode[] = [
      symNode("cli.ts", ["run"]),
      symNode("d.ts", ["a"]),
      symNode("d.ts", ["b"]),
      symNode("d.ts", ["c"]),
      symNode("e.ts", ["a"]),
      symNode("e.ts", ["b"]),
      symNode("e.ts", ["c"]),
      symNode("f.ts", ["a"]),
      symNode("f.ts", ["b"]),
      symNode("f.ts", ["c"]),
    ];
    const edges: CodeGraphEdge[] = [
      refEdge("cli.ts", ["run"], "d.ts", ["a"]),
      refEdge("cli.ts", ["run"], "d.ts", ["b"]),
      refEdge("cli.ts", ["run"], "d.ts", ["c"]),
      refEdge("cli.ts", ["run"], "e.ts", ["a"]),
      refEdge("cli.ts", ["run"], "e.ts", ["b"]),
      refEdge("cli.ts", ["run"], "e.ts", ["c"]),
      refEdge("cli.ts", ["run"], "f.ts", ["a"]),
      refEdge("cli.ts", ["run"], "f.ts", ["b"]),
      refEdge("cli.ts", ["run"], "f.ts", ["c"]),
    ];
    const repo = repoWith(
      [
        fileSummary("cli.ts"),
        fileSummary("d.ts"),
        fileSummary("e.ts"),
        fileSummary("f.ts"),
      ],
      graphOf(nodes, edges),
    );
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.file === "cli.ts")).toBe(false);
  });

  it("no duplica la señal de feature-envy-intra: referencias puramente intra-archivo nunca producen un hallazgo acá", async () => {
    // Todo el tráfico es DENTRO de a.ts (mismo archivo origen y destino): sin
    // arista cruzando a OTRO archivo, `foreignEventsTotal` es 0 y este
    // detector no tiene nada que medir — sea cual sea el ATFD/LAA "interno",
    // ese caso es exclusivamente territorio de `feature-envy-intra`.
    const nodes: CodeGraphNode[] = [
      symNode("a.ts", ["run"]),
      symNode("a.ts", ["one"]),
      symNode("a.ts", ["two"]),
      symNode("a.ts", ["three"]),
    ];
    const edges: CodeGraphEdge[] = [
      refEdge("a.ts", ["run"], "a.ts", ["one"]),
      refEdge("a.ts", ["run"], "a.ts", ["two"]),
      refEdge("a.ts", ["run"], "a.ts", ["three"]),
    ];
    const repo = repoWith([fileSummary("a.ts")], graphOf(nodes, edges));
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings).toHaveLength(0);
  });

  it("una arista `inferred` NO cuenta como evidencia (a diferencia de orphan-file/unused-symbol): se excluye del cálculo", async () => {
    const nodes: CodeGraphNode[] = [
      symNode("a.java", ["run"]),
      symNode("b.java", ["one"]),
      symNode("b.java", ["two"]),
      symNode("b.java", ["three"]),
      symNode("b.java", ["four"]),
    ];
    // Mismo caso "envidioso" que `enviousGraph()`, pero TODAS las aristas foráneas son `inferred`.
    const edges: CodeGraphEdge[] = [
      refEdge("a.java", ["run"], "b.java", ["one"], "inferred"),
      refEdge("a.java", ["run"], "b.java", ["two"], "inferred"),
      refEdge("a.java", ["run"], "b.java", ["three"], "inferred"),
      refEdge("a.java", ["run"], "b.java", ["four"], "inferred"),
    ];
    const repo = repoWith(
      [fileSummary("a.java", "java"), fileSummary("b.java", "java")],
      graphOf(nodes, edges),
    );
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings).toHaveLength(0);
  });

  it("java: severidad reducida frente al mismo caso resuelto por declared/resolved en otro lenguaje", async () => {
    const { nodes: jNodes, edges: jEdges } = enviousGraph();
    const javaRepo = repoWith(
      [fileSummary("a.ts", "java"), fileSummary("b.ts", "java"), ...FILLER],
      graphOf(jNodes, jEdges),
    );
    const javaFindings = detector.run(javaRepo, testContext(detector, "*"));

    const { nodes: tNodes, edges: tEdges } = enviousGraph();
    const tsRepo = repoWith(FILES, graphOf(tNodes, tEdges));
    const tsFindings = detector.run(tsRepo, testContext(detector, "*"));

    expect(javaFindings[0]!.severity).toBeLessThan(tsFindings[0]!.severity);
    expect(javaFindings[0]!.detail).toContain("path-proximity");
  });

  it("borde del umbral ATFD (piso citado FEW=2): justo encima dispara, justo en el umbral no", async () => {
    const atfd = testContext(detector, "*").threshold("atfd").value; // 2
    const distinctAtThreshold = atfd; // ATFD == umbral: NO dispara (regla es ">", no ">=")
    const distinctAboveThreshold = atfd + 1; // ATFD > umbral: dispara

    function buildFile(distinctForeign: number): RepoUnit {
      const nodes: CodeGraphNode[] = [
        symNode("a.ts", ["run"]),
        symNode("a.ts", ["own"]),
      ];
      const edges: CodeGraphEdge[] = [
        refEdge("a.ts", ["run"], "a.ts", ["own"]),
      ]; // 1 evento propio
      for (let i = 0; i < distinctForeign; i++) {
        nodes.push(symNode("b.ts", [`fn${i}`]));
        edges.push(refEdge("a.ts", ["run"], "b.ts", [`fn${i}`])); // LAA baja siempre (1 propio / muchos foráneos)
      }
      return repoWith(FILES, graphOf(nodes, edges));
    }

    const at = buildFeatureEnvyInterFindings(
      buildFile(distinctAtThreshold).files,
      buildFile(distinctAtThreshold).graph!,
      testContext(detector, "*").threshold("atfd"),
      testContext(detector, "*").threshold("laa"),
      testContext(detector, "*").threshold("dominance"),
      testContext(detector, "*").threshold("maxUbiquitousFanInRatio"),
      testContext(detector, "*").threshold("mirrorRatioMin"),
      testContext(detector, "*").threshold("mirrorRatioMax"),
    );
    const above = buildFeatureEnvyInterFindings(
      buildFile(distinctAboveThreshold).files,
      buildFile(distinctAboveThreshold).graph!,
      testContext(detector, "*").threshold("atfd"),
      testContext(detector, "*").threshold("laa"),
      testContext(detector, "*").threshold("dominance"),
      testContext(detector, "*").threshold("maxUbiquitousFanInRatio"),
      testContext(detector, "*").threshold("mirrorRatioMin"),
      testContext(detector, "*").threshold("mirrorRatioMax"),
    );

    expect(at).toHaveLength(0);
    expect(above).toHaveLength(1);
  });

  it("sin grafo: el runner reporta 'sin-grafo', nunca 'cero hallazgos'", async () => {
    const repo = repoWith(FILES, null);
    const { coverage, findings } = await runDetectorSet([detector], {
      repo,
      languages: new Map([
        ["typescript", { capabilities: new Set(), sets: {} as never }],
      ]),
      benchmarks: null,
      only: ["feature-envy-inter"],
    });
    expect(findings).toHaveLength(0);
    const own = coverage.find((c) => c.detectorId === "feature-envy-inter")!;
    expect(own.status).toBe("sin-grafo");
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura buildFeatureEnvyInterFindings", () => {
    const { nodes, edges } = enviousGraph();
    const repo = repoWith(FILES, graphOf(nodes, edges));
    const ctx = testContext(detector, "*");
    const viaRun = detector.run(repo, ctx);
    const viaBuild = buildFeatureEnvyInterFindings(
      repo.files,
      repo.graph!,
      ctx.threshold("atfd"),
      ctx.threshold("laa"),
      ctx.threshold("dominance"),
      ctx.threshold("maxUbiquitousFanInRatio"),
      ctx.threshold("mirrorRatioMin"),
      ctx.threshold("mirrorRatioMax"),
    );
    expect(viaRun).toEqual(viaBuild);
  });

  it("JUICIO DE PRECISIÓN: un archivo dominante que es, él mismo, infraestructura ubicua (fan-in global alto) NO dispara, aunque ATFD/LAA/dominance den positivo — caso real encontrado en `src/`/`cobra`/`click` (un módulo de tipos, `completions.go`, `core.py`)", async () => {
    // "shared.ts" es referenciado por MUCHOS archivos del repo (fan-in global
    // alto) además de por "a.ts" — igual que `detect/types.ts` en `src/` o
    // `completions.go` en `cobra`: cualquier archivo chico lo referencia más
    // que a sí mismo, sin que eso sea envidia real.
    const manyClients = Array.from({ length: 18 }, (_, i) => `client${i}.ts`);
    const nodes: CodeGraphNode[] = [
      symNode("a.ts", ["run"]),
      symNode("a.ts", ["ownOne"]),
      symNode("shared.ts", ["one"]),
      symNode("shared.ts", ["two"]),
      symNode("shared.ts", ["three"]),
      symNode("shared.ts", ["four"]),
      ...manyClients.map((c) => symNode(c, ["fn"])),
    ];
    const edges: CodeGraphEdge[] = [
      refEdge("a.ts", ["run"], "a.ts", ["ownOne"]),
      refEdge("a.ts", ["run"], "shared.ts", ["one"]),
      refEdge("a.ts", ["run"], "shared.ts", ["two"]),
      refEdge("a.ts", ["run"], "shared.ts", ["three"]),
      refEdge("a.ts", ["run"], "shared.ts", ["four"]),
      // El resto del repo TAMBIÉN depende de shared.ts — eso es lo que lo hace ubicuo.
      ...manyClients.map((c) => refEdge(c, ["fn"], "shared.ts", ["one"])),
    ];
    const repo = repoWith(
      [
        fileSummary("a.ts"),
        fileSummary("shared.ts"),
        ...manyClients.map((c) => fileSummary(c)),
      ],
      graphOf(nodes, edges),
    );
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
  });

  it("JUICIO DE PRECISIÓN, control: el mismo caso pero SIN que shared.ts sea ubicuo (fan-in bajo) sigue disparando igual que antes del arreglo", async () => {
    const { nodes, edges } = enviousGraph();
    const repo = repoWith(FILES, graphOf(nodes, edges)); // FILES ya incluye FILLER de sobra, y nada más referencia a "b.ts"
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
  });

  it("presupuesto propio: el volumen de hallazgos se puede topear vía maxFindings", () => {
    expect(detector.maxFindings).toBeDefined();
  });

  describe("JUICIO DE PRECISIÓN — HERENCIA ENTRE ARCHIVOS", () => {
    it("una subclase que hereda del archivo dominante NO dispara, aunque ATFD/LAA/dominance den positivo — caso real `newtonsoft-json`'s `JsonTextWriterAsyncTests : TestFixtureBase`", async () => {
      const { nodes, edges } = enviousGraph(); // a.ts referencia 4 símbolos distintos de b.ts, dominance=1
      const extendsEdge: CodeGraphEdge = {
        from: symbolNodeId("a.ts", ["Sub"]),
        to: symbolNodeId("b.ts", ["Base"]),
        kind: "extends",
        provenance: "declared",
        weight: 1,
      };
      const nodesWithClasses: CodeGraphNode[] = [
        ...nodes,
        {
          id: symbolNodeId("a.ts", ["Sub"]),
          kind: "symbol",
          file: "a.ts",
          symbolPath: ["Sub"],
          family: "class-like",
        },
        {
          id: symbolNodeId("b.ts", ["Base"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["Base"],
          family: "class-like",
        },
      ];
      const repo = repoWith(
        FILES,
        graphOf(nodesWithClasses, [...edges, extendsEdge]),
      );
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
    });

    it("control: el mismo caso pero SIN arista `extends` hacia el archivo dominante sigue disparando igual que antes del arreglo", async () => {
      const { nodes, edges } = enviousGraph();
      const repo = repoWith(FILES, graphOf(nodes, edges)); // sin extends: ya cubierto por el resto de la suite, repetido acá para el contraste directo
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });

    it("control: una arista `extends` hacia un archivo QUE NO ES el dominante no filtra nada", async () => {
      const { nodes, edges } = enviousGraph(); // dominante real es b.ts
      const extendsEdge: CodeGraphEdge = {
        from: symbolNodeId("a.ts", ["Sub"]),
        to: symbolNodeId("otro.ts", ["Base"]),
        kind: "extends",
        provenance: "declared",
        weight: 1,
      };
      const nodesWithClasses: CodeGraphNode[] = [
        ...nodes,
        {
          id: symbolNodeId("a.ts", ["Sub"]),
          kind: "symbol",
          file: "a.ts",
          symbolPath: ["Sub"],
          family: "class-like",
        },
        {
          id: symbolNodeId("otro.ts", ["Base"]),
          kind: "symbol",
          file: "otro.ts",
          symbolPath: ["Base"],
          family: "class-like",
        },
      ];
      const repo = repoWith(
        FILES,
        graphOf(nodesWithClasses, [...edges, extendsEdge]),
      );
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });

    it("implements funciona igual que extends", async () => {
      const { nodes, edges } = enviousGraph();
      const implementsEdge: CodeGraphEdge = {
        from: symbolNodeId("a.ts", ["Sub"]),
        to: symbolNodeId("b.ts", ["IBase"]),
        kind: "implements",
        provenance: "declared",
        weight: 1,
      };
      const nodesWithClasses: CodeGraphNode[] = [
        ...nodes,
        {
          id: symbolNodeId("a.ts", ["Sub"]),
          kind: "symbol",
          file: "a.ts",
          symbolPath: ["Sub"],
          family: "class-like",
        },
        {
          id: symbolNodeId("b.ts", ["IBase"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["IBase"],
          family: "class-like",
        },
      ];
      const repo = repoWith(
        FILES,
        graphOf(nodesWithClasses, [...edges, implementsEdge]),
      );
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
    });
  });

  describe("JUICIO DE PRECISIÓN (frente P9, Ola P) — SIN LÓGICA PROPIA QUE MOVER", () => {
    it('un archivo cuyo único símbolo propio es `family: "other"` (barril de re-export/módulo de constantes) NO dispara, aunque ATFD/LAA/dominance den positivo — caso real `sqlalchemy`\'s `pool/__init__.py`/`dialects/mysql/__init__.py`', async () => {
      const nodesSinLogica: CodeGraphNode[] = [
        {
          id: symbolNodeId("a.ts", ["REEXPORTED"]),
          kind: "symbol",
          file: "a.ts",
          symbolPath: ["REEXPORTED"],
          family: "other",
        },
        symNode("b.ts", ["one"]),
        symNode("b.ts", ["two"]),
        symNode("b.ts", ["three"]),
        symNode("b.ts", ["four"]),
      ];
      const edgesSinLogica: CodeGraphEdge[] = [
        refEdge("a.ts", ["REEXPORTED"], "b.ts", ["one"]),
        refEdge("a.ts", ["REEXPORTED"], "b.ts", ["two"]),
        refEdge("a.ts", ["REEXPORTED"], "b.ts", ["three"]),
        refEdge("a.ts", ["REEXPORTED"], "b.ts", ["four"]),
      ];
      const repo = repoWith(FILES, graphOf(nodesSinLogica, edgesSinLogica));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
    });

    it("un archivo SIN ningún símbolo propio (0 nodos, sólo tráfico saliente desde el nodo de archivo) tampoco dispara — caso real `pool/__init__.py`: 0 nodos symbol, 21 aristas `references` con `from` en el nodo de archivo", async () => {
      const nodesSoloB: CodeGraphNode[] = [
        { id: fileNodeId("a.ts"), kind: "file", file: "a.ts", symbolPath: [] },
        symNode("b.ts", ["one"]),
        symNode("b.ts", ["two"]),
        symNode("b.ts", ["three"]),
        symNode("b.ts", ["four"]),
      ];
      const edgesDesdeArchivo: CodeGraphEdge[] = [
        {
          from: fileNodeId("a.ts"),
          to: symbolNodeId("b.ts", ["one"]),
          kind: "references",
          provenance: "resolved",
          weight: 1,
        },
        {
          from: fileNodeId("a.ts"),
          to: symbolNodeId("b.ts", ["two"]),
          kind: "references",
          provenance: "resolved",
          weight: 1,
        },
        {
          from: fileNodeId("a.ts"),
          to: symbolNodeId("b.ts", ["three"]),
          kind: "references",
          provenance: "resolved",
          weight: 1,
        },
        {
          from: fileNodeId("a.ts"),
          to: symbolNodeId("b.ts", ["four"]),
          kind: "references",
          provenance: "resolved",
          weight: 1,
        },
      ];
      const repo = repoWith(FILES, graphOf(nodesSoloB, edgesDesdeArchivo));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
    });

    it("control: el mismo caso pero CON un símbolo `function-like` propio sigue disparando igual que antes del arreglo", async () => {
      const { nodes, edges } = enviousGraph(); // a.ts ya declara "run"/"helperLocal", ambos function-like
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });
  });

  describe("JUICIO DE PRECISIÓN (frente P9, Ola P) — TODO LO REFERENCIADO ES DATO, NO COMPORTAMIENTO", () => {
    it('si TODOS los símbolos distintos referenciados en el archivo dominante son `family: "other"` (constantes), NO dispara — caso real `nest`\'s `inject.decorator.ts` referenciando `PARAMTYPES_METADATA`/… de `constants.ts`', async () => {
      const nodes: CodeGraphNode[] = [
        symNode("a.ts", ["run"]),
        symNode("a.ts", ["ownOne"]),
        {
          id: symbolNodeId("b.ts", ["ONE"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["ONE"],
          family: "other",
        },
        {
          id: symbolNodeId("b.ts", ["TWO"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["TWO"],
          family: "other",
        },
        {
          id: symbolNodeId("b.ts", ["THREE"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["THREE"],
          family: "other",
        },
      ];
      const edges: CodeGraphEdge[] = [
        refEdge("a.ts", ["run"], "a.ts", ["ownOne"]),
        refEdge("a.ts", ["run"], "b.ts", ["ONE"]),
        refEdge("a.ts", ["run"], "b.ts", ["TWO"]),
        refEdge("a.ts", ["run"], "b.ts", ["THREE"]),
      ];
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
    });

    it("control: si AL MENOS UNO de los símbolos referenciados es `function-like`, sigue disparando (no todo es dato)", async () => {
      const { nodes, edges } = enviousGraph(); // b.ts declara one/two/three/four, todos function-like por defecto
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });

    it("control: si `family` está AUSENTE en algún destino, no se afirma nada y sigue disparando (sesgo hacia el falso negativo)", async () => {
      const nodes: CodeGraphNode[] = [
        symNode("a.ts", ["run"]),
        symNode("a.ts", ["ownOne"]),
        {
          id: symbolNodeId("b.ts", ["one"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["one"],
        }, // sin family
        {
          id: symbolNodeId("b.ts", ["two"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["two"],
        },
        {
          id: symbolNodeId("b.ts", ["three"]),
          kind: "symbol",
          file: "b.ts",
          symbolPath: ["three"],
        },
      ];
      const edges: CodeGraphEdge[] = [
        refEdge("a.ts", ["run"], "a.ts", ["ownOne"]),
        refEdge("a.ts", ["run"], "b.ts", ["one"]),
        refEdge("a.ts", ["run"], "b.ts", ["two"]),
        refEdge("a.ts", ["run"], "b.ts", ["three"]),
      ];
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });
  });

  describe("JUICIO DE PRECISIÓN (frente P9, Ola P) — ARCHIVO ESPEJO", () => {
    /** `a.ts`/`b.ts` declaran, cada uno, casi el mismo conjunto de nombres calificados — mismo patrón que `guava`'s `AbstractFutureState.java` duplicado en `android/guava/` y `guava/`. */
    function mirrorNodes(
      sharedCount: number,
      ownlyA: number,
      onlyB: number,
    ): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
      const nodes: CodeGraphNode[] = [symNode("a.ts", ["run"])];
      const edges: CodeGraphEdge[] = [];
      for (let i = 0; i < sharedCount; i++) {
        nodes.push(
          symNode("a.ts", [`Shared.m${i}`]),
          symNode("b.ts", [`Shared.m${i}`]),
        );
        edges.push(refEdge("a.ts", ["run"], "b.ts", [`Shared.m${i}`]));
      }
      for (let i = 0; i < ownlyA; i++)
        nodes.push(symNode("a.ts", [`onlyA${i}`]));
      for (let i = 0; i < onlyB; i++)
        nodes.push(symNode("b.ts", [`onlyB${i}`]));
      return { nodes, edges };
    }

    it("dos archivos con overlap alto de nombres calificados (ratioMin y ratioMax por encima del piso) NO disparan — caso real `guava` (0,96/0,85 medido) e `hugo` (1,0/1,0)", async () => {
      const { nodes, edges } = mirrorNodes(4, 0, 0); // a.ts y b.ts declaran EXACTAMENTE los mismos 4 nombres (+ "run")
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(false);
    });

    it("control: dos archivos GRANDES que sólo comparten un puñado de nombres genéricos (ratioMin y ratioMax por debajo del piso) SIGUEN disparando", async () => {
      // a.ts declara "run" + 3 nombres propios + 3 compartidos (7 en total); b.ts declara los 3 compartidos +
      // 30 propios (33 en total). intersección=3, ratioMin=3/7≈43% (ya debajo del piso de 50%) y ratioMax=3/33≈9%
      // (muy debajo del piso de 30%): ninguno de los dos umbrales se cruza, ATFD=3 sigue > FEW=2.
      const { nodes, edges } = mirrorNodes(3, 3, 30);
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });

    it("control: el caso envidioso de manual (`enviousGraph`, sin nombres en común) sigue disparando igual que antes del arreglo", async () => {
      const { nodes, edges } = enviousGraph();
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });
  });

  // OLA R, FRENTE R4 — ver "MISMO DIRECTORIO — LA PREGUNTA CORRECTA" en el
  // docstring del módulo.
  describe("mismo directorio", () => {
    it("un archivo que envidia a su vecino de carpeta (misma subcarpeta) NO dispara — es la misma unidad de encapsulamiento, no dos módulos distintos", async () => {
      const a = "pkg/a.ts";
      const b = "pkg/b.ts";
      const nodes: CodeGraphNode[] = [
        symNode(a, ["run"]),
        symNode(a, ["helperLocal"]),
        symNode(b, ["one"]),
        symNode(b, ["two"]),
        symNode(b, ["three"]),
        symNode(b, ["four"]),
      ];
      const edges: CodeGraphEdge[] = [
        refEdge(a, ["run"], b, ["one"]),
        refEdge(a, ["run"], b, ["two"]),
        refEdge(a, ["run"], b, ["three"]),
        refEdge(a, ["run"], b, ["four"]),
        refEdge(a, ["run"], a, ["helperLocal"]),
      ];
      const files: FileSummary[] = [fileSummary(a), fileSummary(b), ...FILLER];
      const repo = repoWith(files, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === a)).toBe(false);
    });

    it("control: la MISMA forma envidiosa, pero en carpetas DISTINTAS, sigue disparando igual que antes del arreglo", async () => {
      const a = "moduleA/a.ts";
      const b = "moduleB/b.ts";
      const nodes: CodeGraphNode[] = [
        symNode(a, ["run"]),
        symNode(a, ["helperLocal"]),
        symNode(b, ["one"]),
        symNode(b, ["two"]),
        symNode(b, ["three"]),
        symNode(b, ["four"]),
      ];
      const edges: CodeGraphEdge[] = [
        refEdge(a, ["run"], b, ["one"]),
        refEdge(a, ["run"], b, ["two"]),
        refEdge(a, ["run"], b, ["three"]),
        refEdge(a, ["run"], b, ["four"]),
        refEdge(a, ["run"], a, ["helperLocal"]),
      ];
      const files: FileSummary[] = [fileSummary(a), fileSummary(b), ...FILLER];
      const repo = repoWith(files, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === a)).toBe(true);
    });

    it("control: dos archivos AMBOS en la raíz del repo (sin subcarpeta) NO cuentan como 'mismo directorio' — la raíz no es una unidad de encapsulamiento deliberada, sigue disparando igual que `enviousGraph()` sin el arreglo", async () => {
      const { nodes, edges } = enviousGraph(); // "a.ts"/"b.ts", ambos en la raíz
      const repo = repoWith(FILES, graphOf(nodes, edges));
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.some((f) => f.locations[0]!.file === "a.ts")).toBe(true);
    });
  });
});
