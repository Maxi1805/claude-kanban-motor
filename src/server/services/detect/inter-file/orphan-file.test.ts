import { describe, expect, it } from "vitest";

import { buildOrphanFileFindings, detector } from "./orphan-file.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import {
  fileNodeId,
  symbolNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type Provenance,
} from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: no hace falta tree-sitter en absoluto —
 * el detector sólo lee `RepoUnit.graph` (nodos+aristas planas) y
 * `RepoUnit.files` (resumen por archivo), así que este test construye el
 * grafo a mano, igual que `dependency-cycle.test.ts`/`duplication.test.ts`.
 * Por la misma razón, "≥3 lenguajes que emiten" no aplica: el detector no
 * clasifica por lenguaje en absoluto (la reducción de severidad para Java
 * se retiró — ver "OJO CON JAVA / guava, LA COMPENSACIÓN SE RETIRÓ" en el
 * docstring del módulo), `ctx.language` es el centinela `"*"` en producción.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function symbolNode(
  file: string,
  symbolPath: readonly string[],
): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "function-like",
  };
}

/**
 * A2a (ola N): desde que el detector exige una DECLARACIÓN NOMBRABLE para
 * considerar candidato a un archivo (ver `filesDeclaringNameableSymbols` y
 * la RAÍZ 2 del frente), un fixture de "archivo huérfano" tiene que traer
 * también su símbolo — un archivo que no declara nada ya no es candidato, a
 * propósito. Este helper arma el par nodo-de-archivo + nodo-de-símbolo con un
 * nombre derivado de la ruta, para no repetirlo en cada caso.
 */
function declaringFileNodes(file: string, name = "Declarado"): CodeGraphNode[] {
  return [fileNode(file), symbolNode(file, [name])];
}

function edge(
  from: string,
  to: string,
  overrides: Partial<
    Pick<CodeGraphEdge, "kind" | "provenance" | "weight">
  > = {},
): CodeGraphEdge {
  return {
    from,
    to,
    kind: overrides.kind ?? "references",
    provenance: overrides.provenance ?? "declared",
    weight: overrides.weight ?? 1,
  };
}

function graphOf(
  nodes: readonly CodeGraphNode[],
  edges: readonly CodeGraphEdge[],
): CodeGraph {
  return {
    nodes,
    edges,
    resolution: {
      candidates: 0,
      resolved: 0,
      droppedAmbiguous: 0,
      unresolved: 0,
      byStage: [],
    },
  };
}

function fileSummary(path: string, language = "typescript", lines = 10) {
  return { path, lines, language };
}

function repoWith(
  files: readonly ReturnType<typeof fileSummary>[],
  graph: CodeGraph | null,
): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

describe("orphan-file", () => {
  it("javascript: un archivo sin ninguna arista hacia/desde el resto del repo es un hallazgo", () => {
    const files = [fileSummary("a.js"), fileSummary("b.js")];
    const graph = graphOf(
      [
        ...declaringFileNodes("a.js", "Alfa"),
        ...declaringFileNodes("b.js", "Beta"),
      ],
      [],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const findings = buildOrphanFileFindings(
      files,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(findings).toHaveLength(2);
    expect(findings[0]!.trigger[0]!.value).toBe(1);
    expect(findings[0]!.locations[0]!.role).toBe(
      "archivo sin conexión con el resto del repositorio",
    );
    expect(findings.map((f) => f.locations[0]!.file).sort()).toEqual([
      "a.js",
      "b.js",
    ]);
  });

  it("javascript control negativo: dos archivos que se referencian entre sí no son huérfanos", () => {
    const files = [fileSummary("a.js"), fileSummary("b.js")];
    const graph = graphOf(
      [symbolNode("a.js", ["run"]), symbolNode("b.js", ["helper"])],
      [edge(symbolNodeId("a.js", ["run"]), symbolNodeId("b.js", ["helper"]))],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const findings = buildOrphanFileFindings(
      files,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(findings).toHaveLength(0);
  });

  it("una arista que sólo referencia a `contains` no cuenta como conexión: el archivo sigue siendo huérfano", () => {
    const files = [fileSummary("a.js"), fileSummary("folder/b.js")];
    const graph = graphOf(
      [
        ...declaringFileNodes("a.js", "Alfa"),
        ...declaringFileNodes("folder/b.js", "Beta"),
      ],
      [edge("folder:folder", fileNodeId("folder/b.js"), { kind: "contains" })],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const findings = buildOrphanFileFindings(
      files,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(findings).toHaveLength(2);
  });

  it("referencia INTRA-archivo (dos símbolos del MISMO archivo) no cuenta como conexión con el resto del repo", () => {
    const files = [fileSummary("solo.js")];
    const graph = graphOf(
      [symbolNode("solo.js", ["a"]), symbolNode("solo.js", ["b"])],
      [edge(symbolNodeId("solo.js", ["a"]), symbolNodeId("solo.js", ["b"]))],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const findings = buildOrphanFileFindings(
      files,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.file).toBe("solo.js");
  });

  it("una arista `inferred` SÍ cuenta como conexión (lectura conservadora, ver docstring): el archivo deja de ser huérfano", () => {
    const files = [
      fileSummary("a.java", "java"),
      fileSummary("b.java", "java"),
    ];
    const graph = graphOf(
      [symbolNode("a.java", ["A"]), symbolNode("b.java", ["B"])],
      [
        edge(symbolNodeId("a.java", ["A"]), symbolNodeId("b.java", ["B"]), {
          provenance: "inferred" as Provenance,
        }),
      ],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const findings = buildOrphanFileFindings(
      files,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(findings).toHaveLength(0);
  });

  it("una arista `ambiguous` SÍ cuenta como conexión — OLA R, FRENTE R4: para una afirmación de AUSENCIA (nadie referencia a este archivo), una arista `ambiguous` sigue siendo evidencia de que ALGO real del repo referencia ALGO de este archivo, aunque no se sepa cuál de los destinos posibles es el correcto. CONTRATO-F9.md §4.5 ('fuera de toda consulta por defecto') protege al consumidor que usa una arista como evidencia POSITIVA de un hallazgo; este detector hace lo contrario, mismo razonamiento que ya aplica a `inferred` (ver 'OJO CON JAVA' en el docstring del módulo)", () => {
    const files = [
      fileSummary("a.java", "java"),
      fileSummary("b.java", "java"),
    ];
    const graph = graphOf(
      [symbolNode("a.java", ["A"]), symbolNode("b.java", ["B"])],
      [
        edge(symbolNodeId("a.java", ["A"]), symbolNodeId("b.java", ["B"]), {
          provenance: "ambiguous" as Provenance,
        }),
      ],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const findings = buildOrphanFileFindings(
      files,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(findings).toHaveLength(0);
  });

  it('java: MISMA severidad que en cualquier otro lenguaje — la reducción por `language === "java"` se retiró (frente "lenguaje cableado a mano"): medido en guava que empujaba los hallazgos de Java reales, no falsos, más cerca del corte de `maxFindings`, en la dirección contraria al riesgo real (falsos NEGATIVOS, no falsos positivos) que el propio docstring documenta; y la muestra juzgada a mano (16/16 falsos en 7 lenguajes) no muestra a Java con una tasa de error distinta a la del resto — ver el docstring del módulo', () => {
    const filesJava = [fileSummary("A.java", "java")];
    const filesJs = [fileSummary("a.js", "javascript")];
    const graph = graphOf(declaringFileNodes("A.java", "Declarado"), []);
    const graphJs = graphOf(declaringFileNodes("a.js", "Declarado"), []);
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    const javaFindings = buildOrphanFileFindings(
      filesJava,
      graph,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    const jsFindings = buildOrphanFileFindings(
      filesJs,
      graphJs,
      threshold,
      mirrorRatioMin,
      mirrorRatioMax,
    );
    expect(javaFindings[0]!.severity).toBe(jsFindings[0]!.severity);
    expect(javaFindings[0]!.detail).toBe(jsFindings[0]!.detail);
    expect(javaFindings[0]!.detail).not.toContain("path-proximity");
  });

  // A2a (ola N) — RAÍZ 2 del frente: "se entra por convención, no por
  // referencia". Ver `filesDeclaringNameableSymbols` en el módulo.
  describe("declaración nombrable como precondición (RAÍZ 2)", () => {
    it("un archivo SIN ninguna declaración no es candidato: no hay nada que pueda estar muerto", () => {
      const files = [fileSummary("doc-de-paquete.go", "go")];
      const graph = graphOf([fileNode("doc-de-paquete.go")], []);
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      expect(
        buildOrphanFileFindings(
          files,
          graph,
          threshold,
          mirrorRatioMin,
          mirrorRatioMax,
        ),
      ).toHaveLength(0);
    });

    it("un archivo cuya ÚNICA declaración no es nombrable (patrón de desestructuración) tampoco es candidato", () => {
      const files = [fileSummary("configuracion.js", "javascript")];
      const graph = graphOf(
        [
          fileNode("configuracion.js"),
          symbolNode("configuracion.js", ["{ devices }"]),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      expect(
        buildOrphanFileFindings(
          files,
          graph,
          threshold,
          mirrorRatioMin,
          mirrorRatioMax,
        ),
      ).toHaveLength(0);
    });

    it("mezcla: alcanza UNA declaración nombrable para que el archivo vuelva a ser candidato", () => {
      const files = [fileSummary("configuracion.js", "javascript")];
      const graph = graphOf(
        [
          fileNode("configuracion.js"),
          symbolNode("configuracion.js", ["{ devices }"]),
          symbolNode("configuracion.js", ["armar"]),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      const findings = buildOrphanFileFindings(
        files,
        graph,
        threshold,
        mirrorRatioMin,
        mirrorRatioMax,
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain('"armar"');
      expect(findings[0]!.title).not.toContain("devices");
    });

    it("un nombre con `?`/`!` o con parámetros de tipo SÍ es nombrable — la prueba mira sólo los caracteres que ninguna referencia puede llevar", () => {
      const files = [
        fileSummary("a.rb", "ruby"),
        fileSummary("B.cs", "csharp"),
      ];
      const graph = graphOf(
        [
          fileNode("a.rb"),
          symbolNode("a.rb", ["valido?"]),
          fileNode("B.cs"),
          symbolNode("B.cs", ["Espacio", "Lista<T>"]),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      expect(
        buildOrphanFileFindings(
          files,
          graph,
          threshold,
          mirrorRatioMin,
          mirrorRatioMax,
        ),
      ).toHaveLength(2);
    });

    it("una declaración ANIDADA en un bloque de espacio de nombres cuenta igual: exigir profundidad 1 apagaría el detector para esos lenguajes", () => {
      const files = [fileSummary("Escritor.cs", "csharp")];
      const graph = graphOf(
        [
          fileNode("Escritor.cs"),
          symbolNode("Escritor.cs", ["Espacio.Nombres", "Escritor"]),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      const findings = buildOrphanFileFindings(
        files,
        graph,
        threshold,
        mirrorRatioMin,
        mirrorRatioMax,
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain('"Escritor"');
    });

    it("las declaraciones sin uso viajan como evidencia y en el título, con corte a tres y cuenta del resto", () => {
      const files = [fileSummary("muerto.ts")];
      const graph = graphOf(
        [
          fileNode("muerto.ts"),
          ...["Uno", "Dos", "Tres", "Cuatro", "Cinco"].map((n) =>
            symbolNode("muerto.ts", [n]),
          ),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      const findings = buildOrphanFileFindings(
        files,
        graph,
        threshold,
        mirrorRatioMin,
        mirrorRatioMax,
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toBe(
        '"muerto.ts" declara "Uno", "Dos", "Tres" y 2 más y nada en el repositorio lo usa',
      );
      expect(findings[0]!.evidence).toContainEqual({
        label: "declaraciones sin ningún uso en el repo",
        value: 5,
      });
    });
  });

  // frente P9, Ola P — ver "ARCHIVO ESPEJO" en el docstring del módulo.
  describe("archivo espejo", () => {
    it("dos archivos DISTINTOS que declaran, cada uno, EL MISMO nombre calificado no cuentan como huérfanos — caso real hugo's vars_regular.go/vars_extended.go (dos variantes de build tag, ambas declaran `var IsExtended`)", () => {
      const files = [
        fileSummary("vars_regular.go", "go"),
        fileSummary("vars_extended.go", "go"),
      ];
      const graph = graphOf(
        [
          fileNode("vars_regular.go"),
          symbolNode("vars_regular.go", ["IsExtended"]),
          fileNode("vars_extended.go"),
          symbolNode("vars_extended.go", ["IsExtended"]),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      const findings = buildOrphanFileFindings(
        files,
        graph,
        threshold,
        mirrorRatioMin,
        mirrorRatioMax,
      );
      expect(findings).toHaveLength(0);
    });

    it("control: un archivo sin ningún gemelo real (nombres propios distintos en todos lados) sigue disparando igual que antes del arreglo", () => {
      const files = [fileSummary("a.go", "go"), fileSummary("b.go", "go")];
      const graph = graphOf(
        [
          fileNode("a.go"),
          symbolNode("a.go", ["Uno"]),
          fileNode("b.go"),
          symbolNode("b.go", ["Dos"]),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      const findings = buildOrphanFileFindings(
        files,
        graph,
        threshold,
        mirrorRatioMin,
        mirrorRatioMax,
      );
      expect(findings).toHaveLength(2);
    });

    it("control: dos archivos GRANDES que sólo comparten un puñado de nombres genéricos (ratioMin y ratioMax por debajo del piso) SIGUEN disparando", () => {
      // "huerfano.go" declara 1 nombre compartido + 2 propios (3 en total); "grande.go" (CONECTADO, no huérfano
      // él mismo) declara el nombre compartido + 30 propios: intersección=1, ratioMin=1/3≈33% (bajo el piso de
      // 50%) y ratioMax=1/31≈3% (muy bajo el piso de 30%).
      const files = [
        fileSummary("huerfano.go", "go"),
        fileSummary("grande.go", "go"),
      ];
      const grandeNames = Array.from({ length: 30 }, (_, i) => `Propio${i}`);
      const graph = graphOf(
        [
          fileNode("huerfano.go"),
          symbolNode("huerfano.go", ["Compartido"]),
          symbolNode("huerfano.go", ["SoloA1"]),
          symbolNode("huerfano.go", ["SoloA2"]),
          fileNode("grande.go"),
          symbolNode("grande.go", ["Compartido"]),
          ...grandeNames.map((n) => symbolNode("grande.go", [n])),
        ],
        [],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const mirrorRatioMin = testContext(detector, "*").threshold(
        "mirrorRatioMin",
      );
      const mirrorRatioMax = testContext(detector, "*").threshold(
        "mirrorRatioMax",
      );
      const findings = buildOrphanFileFindings(
        files,
        graph,
        threshold,
        mirrorRatioMin,
        mirrorRatioMax,
      );
      expect(findings.map((f) => f.locations[0]!.file)).toContain(
        "huerfano.go",
      );
    });
  });

  it("el borde del umbral (piso declarado, presencia no magnitud) se pide a testContext: el valor es 1", () => {
    const threshold = testContext(detector, "*").threshold("presence");
    const mirrorRatioMin = testContext(detector, "*").threshold(
      "mirrorRatioMin",
    );
    const mirrorRatioMax = testContext(detector, "*").threshold(
      "mirrorRatioMax",
    );
    expect(threshold.value).toBe(1);
  });

  it("sin grafo: detector.run devuelve [] de forma defensiva (run.ts ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const repo = repoWith([fileSummary("a.js")], null);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const files = [fileSummary("a.js")];
    const graph = graphOf(declaringFileNodes("a.js"), []);
    const repo = repoWith(files, graph);
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });

  it("control negativo: un repo donde todos los archivos están conectados no produce hallazgos", () => {
    const files = [
      fileSummary("a.js"),
      fileSummary("b.js"),
      fileSummary("c.js"),
    ];
    const graph = graphOf(
      [
        symbolNode("a.js", ["x"]),
        symbolNode("b.js", ["y"]),
        symbolNode("c.js", ["z"]),
      ],
      [
        edge(symbolNodeId("a.js", ["x"]), symbolNodeId("b.js", ["y"])),
        edge(symbolNodeId("b.js", ["y"]), symbolNodeId("c.js", ["z"])),
      ],
    );
    const repo = repoWith(files, graph);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });
});
