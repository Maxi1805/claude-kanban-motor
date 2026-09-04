import { describe, expect, it } from "vitest";

import { detector, findDependencyCycles } from "./dependency-cycle.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import {
  EDGE_ROLE_BARE,
  EDGE_ROLE_QUALIFIED,
  EDGE_ROLE_RECEIVER_MEMBER,
  fileNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type Provenance,
} from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: no hace falta tree-sitter en absoluto —
 * el detector sólo lee `RepoUnit.graph` (nodos+aristas planas), así que este
 * test construye el grafo a mano, igual que `duplication.test.ts` construye
 * su `RepoUnit` a mano. Por la misma razón que `duplication`, "≥3 lenguajes
 * que emiten" no aplica: el detector no clasifica por lenguaje (`ctx.language`
 * es el centinela `"*"` en producción, ver `run.ts`), opera sobre la forma
 * del grafo entre archivos, sin importar en qué lenguaje esté cada uno.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, provenance: Provenance = "declared", kind: CodeGraphEdge["kind"] = "references"): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind, provenance, weight: 1 };
}

/**
 * Una arista `references` tal como la arma `resolve.ts` para un candidato
 * ACEPTADO — con `resolvedBy` y `roles`, los dos campos que
 * `isBareGlobalUniquenessEdge` (A3b, ver el docstring del módulo) lee. Sin
 * `overrides.roles`, el campo queda AUSENTE (nunca `0` por defecto — mismo
 * invariante que `resolve.ts`, ver `CodeGraphEdge.roles`'s docstring).
 */
function resolvedEdge(
  from: string,
  to: string,
  overrides: { provenance?: Provenance; resolvedBy?: CodeGraphEdge["resolvedBy"]; roles?: number; kind?: CodeGraphEdge["kind"] } = {},
): CodeGraphEdge {
  return {
    from: fileNodeId(from),
    to: fileNodeId(to),
    kind: overrides.kind ?? "references",
    provenance: overrides.provenance ?? "resolved",
    weight: 1,
    ...(overrides.resolvedBy !== undefined ? { resolvedBy: overrides.resolvedBy } : {}),
    ...(overrides.roles !== undefined ? { roles: overrides.roles } : {}),
  };
}

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes: files.map(fileNode),
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function repoWith(files: readonly string[], edges: readonly CodeGraphEdge[], lines = 10): RepoUnit {
  return {
    repoName: "test",
    files: files.map((path) => ({ path, lines, language: "typescript" })),
    functions: [],
    clones: [],
    graph: graphOf(files, edges),
  };
}

describe("dependency-cycle", () => {
  it("dos archivos en carpetas distintas que se referencian mutuamente: SCC de tamaño 2, cruza carpeta", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["a/Foo.ts", "b/Bar.ts"],
      [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
    expect(findings[0]!.title).toContain("Foo.ts");
    expect(findings[0]!.title).toContain("Bar.ts");
    expect(findings[0]!.evidence![0]!.value).toBe(2); // 2 carpetas distintas ⇒ cruza carpeta
    expect(findings[0]!.locations[0]!.role).toBe("primer miembro del ciclo");
    expect(findings[0]!.locations[1]!.role).toBe("miembro #2 del ciclo");
    expect(findings[0]!.detail).toContain("arquitectónica accidental");
  });

  it("control negativo: dependencia en un solo sentido no es un ciclo", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts")]);
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(0);
  });

  it("REDEFINICIÓN (frente de precisión, agosto 2026): dos archivos en la MISMA carpeta que se referencian mutuamente ya NO es un hallazgo", () => {
    // Antes de esta ola esto emitía con severidad más baja. Medido sobre
    // hallazgos frescos en 4 lenguajes (ver el docstring del módulo,
    // "REDEFINICIÓN"): el ÚNICO verdadero positivo de 17 juzgados cruzaba
    // carpeta; el 100% de los pares same-folder juzgados eran falsos (pares
    // de clases utilitarias hermanas de guava, fixtures de `forwardRef` de
    // nest, componente+demo de vueuse). `crossesFolderBoundary` pasa de
    // amortiguador de severidad a condición de emisión.
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["obs/Subject.ts", "obs/Observer.ts"],
      [edge("obs/Subject.ts", "obs/Observer.ts"), edge("obs/Observer.ts", "obs/Subject.ts")],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(0);
  });

  describe("NAMESPACING, NO CICLO (Ola O): un archivo y su propio subdirectorio homónimo no es un ciclo arquitectónico", () => {
    it("un archivo 'foo.rb' y 'foo/bar.rb' (subdirectorio homónimo) que se referencian mutuamente NO es un hallazgo (repro rubocop: hash_transform_method.rb ↔ hash_transform_method/autocorrection.rb)", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["lib/mixin/hash_transform_method.rb", "lib/mixin/hash_transform_method/autocorrection.rb"],
        [
          edge("lib/mixin/hash_transform_method.rb", "lib/mixin/hash_transform_method/autocorrection.rb"),
          edge("lib/mixin/hash_transform_method/autocorrection.rb", "lib/mixin/hash_transform_method.rb"),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(0);
    });

    it("un hub + DOS archivos de su propio subdirectorio (ciclo de 3, sin ningún miembro ajeno) también es namespacing puro (repro rubocop: node_pattern_groups.rb + node_pattern_groups/{ast_processor,ast_walker}.rb)", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["lib/internal_affairs/node_pattern_groups.rb", "lib/internal_affairs/node_pattern_groups/ast_processor.rb", "lib/internal_affairs/node_pattern_groups/ast_walker.rb"],
        [
          edge("lib/internal_affairs/node_pattern_groups.rb", "lib/internal_affairs/node_pattern_groups/ast_processor.rb"),
          edge("lib/internal_affairs/node_pattern_groups/ast_processor.rb", "lib/internal_affairs/node_pattern_groups/ast_walker.rb"),
          edge("lib/internal_affairs/node_pattern_groups/ast_walker.rb", "lib/internal_affairs/node_pattern_groups.rb"),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(0);
    });

    it("control negativo: un tercer miembro AJENO al par hub/subdirectorio SÍ sigue evaluándose (esta exclusión no perdona acoplamiento real sólo porque una arista tenga la forma hub/subdir)", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["lib/mixin/foo.rb", "lib/mixin/foo/bar.rb", "lib/otro/Ajeno.rb"],
        [
          edge("lib/mixin/foo.rb", "lib/mixin/foo/bar.rb"),
          edge("lib/mixin/foo/bar.rb", "lib/otro/Ajeno.rb"),
          edge("lib/otro/Ajeno.rb", "lib/mixin/foo.rb"),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(3);
    });

    it("control negativo: dos archivos hermanos que NO son hub/subdirectorio (mismo stem no aplica) siguen reportándose si cruzan carpeta", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("un archivo con un PREFIJO de nombre igual al directorio, pero NO exactamente el mismo stem, no cuenta como hub (evita falso negativo por coincidencia parcial de nombre: 'foobar.rb' no es hub de 'foo/')", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["lib/foobar.rb", "lib/foo/bar.rb"],
        [edge("lib/foobar.rb", "lib/foo/bar.rb"), edge("lib/foo/bar.rb", "lib/foobar.rb")],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });
  });

  it("provenance 'inferred' NO cuenta para cerrar un ciclo: la brecha de Java (path-proximity) se excluye a propósito", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["a/Foo.ts", "b/Bar.ts"],
      [edge("a/Foo.ts", "b/Bar.ts", "declared"), edge("b/Bar.ts", "a/Foo.ts", "inferred")],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(0);
  });

  it("provenance 'ambiguous' NO cuenta para cerrar un ciclo: CONTRATO-F9.md §4.5, fuera de toda consulta por defecto", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["a/Foo.ts", "b/Bar.ts"],
      [edge("a/Foo.ts", "b/Bar.ts", "declared"), edge("b/Bar.ts", "a/Foo.ts", "ambiguous")],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(0);
  });

  it("provenance 'resolved' SÍ cuenta (alta confianza, no sólo 'declared') — con roles, la forma real que produce `resolve.ts`", () => {
    // `resolve.ts` SIEMPRE calcula `roles` vía `roleMaskFor` para todo `kind: "references"`
    // aceptado (ver "REFERENCIA SIN NINGÚN ROL" en el docstring del módulo) — una arista
    // `resolved` real nunca llega sin `roles` salvo el caso `decl-name` que ese mismo bloque
    // excluye a propósito (ver el test siguiente). Por eso este fixture usa `resolvedEdge`
    // con un rol real en vez del `edge()` genérico (que antes de esta ola omitía `roles` sin
    // que la producción real pudiera producir esa forma).
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["a/Foo.ts", "b/Bar.ts"],
      [edge("a/Foo.ts", "b/Bar.ts", "declared"), resolvedEdge("b/Bar.ts", "a/Foo.ts", { roles: EDGE_ROLE_QUALIFIED })],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(1);
  });

  describe("REFERENCIA SIN NINGÚN ROL (Ola O): 'references'/'resolved' sin ningún bit de rol no cierra un ciclo — decl-name puro, el caso lodash sobreviviente", () => {
    it("una arista 'references'/'resolved' SIN 'roles' en absoluto NO cierra un ciclo (repro del ciclo #1 de lodash tras A3b: 'overArg' es el nombre de la propia declaración de función en _baseConvert.js, no un uso)", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [edge("a/Foo.ts", "b/Bar.ts", "declared"), resolvedEdge("b/Bar.ts", "a/Foo.ts")], // sin overrides.roles ⇒ roles ausente
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(0);
    });

    it("NO exige 'resolvedBy: global-uniqueness' (a diferencia de isBareGlobalUniquenessEdge): un decl-name aceptado en CUALQUIER etapa posterior también carece de roles y también se excluye", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [edge("a/Foo.ts", "b/Bar.ts", "declared"), resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "qualified-name" })],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(0);
    });

    it("provenance 'declared' sin roles SÍ cuenta: la exclusión es específica de 'resolved' porque en producción 'references' nunca es 'declared' (ver el docstring del módulo) — no penaliza fixtures que usan 'declared' como valor genérico de arista confiable", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")]);
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("un solo bit de rol presente (aunque sea distinto de 'bare') ya alcanza para NO excluir: sólo 'roles === undefined' dispara esta exclusión", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [edge("a/Foo.ts", "b/Bar.ts", "declared"), resolvedEdge("b/Bar.ts", "a/Foo.ts", { roles: EDGE_ROLE_RECEIVER_MEMBER })],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("severidad acotada cuando un ciclo cierra por una arista confiable pero tiene mucho ruido 'resolved sin roles' (decl-name) alrededor del mismo par", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const noise = Array.from({ length: 10 }, () => resolvedEdge("a/Foo.ts", "b/Bar.ts")); // sin roles
      const repo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts"), ...noise]);
      const confidentRepo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")]);
      const findings = findDependencyCycles(repo, threshold);
      const confidentFindings = findDependencyCycles(confidentRepo, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBeLessThanOrEqual(35);
      expect(findings[0]!.severity).toBeLessThan(confidentFindings[0]!.severity);
      expect(findings[0]!.detail).toContain("Confianza reducida");
    });
  });

  it("severidad acotada (P5, criterio unificado) cuando la MAYORÍA de las aristas entre los miembros del ciclo son 'inferred'", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    // El ciclo se cierra con 1 declared en cada sentido (igual que los tests de arriba: SÍ cuenta), pero hay
    // además 10 aristas 'inferred' extra entre el mismo par (no cierran el ciclo por sí solas, pero sí hacen
    // que la MAYORÍA de TODAS las aristas entre a/Foo.ts y b/Bar.ts -- cualquier provenance -- sean 'inferred'.
    const noise = Array.from({ length: 10 }, () => edge("a/Foo.ts", "b/Bar.ts", "inferred"));
    const repo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts"), ...noise]);
    const confidentRepo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")]);
    const findings = findDependencyCycles(repo, threshold);
    const confidentFindings = findDependencyCycles(confidentRepo, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBeLessThanOrEqual(35);
    expect(findings[0]!.severity).toBeLessThan(confidentFindings[0]!.severity);
    expect(findings[0]!.detail).toContain("Confianza reducida");
  });

  it("ciclo de 3 archivos (A→B→C→A): un hallazgo, tamaño 3, miembros ordenados alfabéticamente", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["a/A.ts", "b/B.ts", "c/C.ts"],
      [edge("a/A.ts", "b/B.ts"), edge("b/B.ts", "c/C.ts"), edge("c/C.ts", "a/A.ts")],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(3);
    expect(findings[0]!.locations.map((l) => l.file)).toEqual(["a/A.ts", "b/B.ts", "c/C.ts"]);
  });

  it("un self-loop (archivo que se referencia a sí mismo) NUNCA cuenta como ciclo entre archivos", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(["a/A.ts", "b/B.ts"], [edge("a/A.ts", "a/A.ts"), edge("a/A.ts", "b/B.ts")]);
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(0);
  });

  it("aristas 'contains' se ignoran: una jerarquía carpeta→archivo no es una dependencia", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo = repoWith(
      ["a/A.ts", "b/B.ts"],
      [edge("a/A.ts", "b/B.ts", "declared", "contains"), edge("b/B.ts", "a/A.ts", "declared", "contains")],
    );
    const findings = findDependencyCycles(repo, threshold);
    expect(findings).toHaveLength(0);
  });

  it("sin grafo (RepoUnit.graph === null): la función devuelve vacío, nunca lanza — el runner es quien reporta 'sin-grafo'", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };
    expect(findDependencyCycles(repo, threshold)).toHaveLength(0);
  });

  it("el borde del umbral (citado, Arcan SCC>=2) se pide a testContext: no hay número suelto en el test", () => {
    const threshold = testContext(detector, "*").threshold("minCycleSize");
    expect(threshold.value).toBe(2);
    expect(threshold.label).toContain("Arcan");
  });

  it("el detector declara needsGraph:true y needs:[] (no depende de ninguna capacidad de lenguaje)", () => {
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual([]);
    expect(detector.scope).toBe("inter-file");
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const repo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")]);
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });

  describe("GLOBAL-UNIQUENESS DESNUDO (A3b): 'resolved/global-uniqueness' sin receptor ni calificador no cierra un ciclo — el caso lodash", () => {
    it("una arista 'resolved/global-uniqueness' puramente 'bare' NO cierra un ciclo (repro del ciclo #1 de lodash: colisión de nombre genérico entre declaraciones locales sin relación)", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [
          edge("a/Foo.ts", "b/Bar.ts", "declared"),
          resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "global-uniqueness", roles: EDGE_ROLE_BARE }),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(0);
    });

    it("control positivo: la MISMA arista, pero con rol 'qualified' (receptor explícito, p.ej. rubocop 'OrderedGemCorrector.correct'), SÍ cierra el ciclo", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [
          edge("a/Foo.ts", "b/Bar.ts", "declared"),
          resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "global-uniqueness", roles: EDGE_ROLE_QUALIFIED }),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("control positivo: rol 'receiver-member' (p.ej. Python 'self.generator()') tampoco se excluye — mismo límite ya declarado, sin regresión", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [
          edge("a/Foo.ts", "b/Bar.ts", "declared"),
          resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "global-uniqueness", roles: EDGE_ROLE_RECEIVER_MEMBER }),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("una arista con roles MIXTOS (bare Y qualified colapsados en la misma arista, alguna ocurrencia SÍ tuvo receptor) no se excluye: sólo se excluye cuando TODAS las ocurrencias fueron 'bare'", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [
          edge("a/Foo.ts", "b/Bar.ts", "declared"),
          resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "global-uniqueness", roles: EDGE_ROLE_BARE | EDGE_ROLE_QUALIFIED }),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("'bare' resuelto por OTRA etapa que no es 'global-uniqueness' (p.ej. 'qualified-name', evidencia real de alcance léxico) no se excluye", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [
          edge("a/Foo.ts", "b/Bar.ts", "declared"),
          resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "qualified-name", roles: EDGE_ROLE_BARE }),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("'resolved/global-uniqueness' sin campo 'roles' en absoluto (kind sin rol, p.ej. 'instantiates') no se excluye: conservador por falta de evidencia, no por presunción de inocencia", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/Foo.ts", "b/Bar.ts"],
        [
          edge("a/Foo.ts", "b/Bar.ts", "declared"),
          resolvedEdge("b/Bar.ts", "a/Foo.ts", { resolvedBy: "global-uniqueness", kind: "instantiates" }), // sin roles
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
    });

    it("severidad acotada cuando un ciclo cierra por una arista confiable pero tiene mucho ruido 'bare + global-uniqueness' alrededor del mismo par", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const noise = Array.from({ length: 10 }, () =>
        resolvedEdge("a/Foo.ts", "b/Bar.ts", { resolvedBy: "global-uniqueness", roles: EDGE_ROLE_BARE }),
      );
      // El ciclo se cierra con dos aristas 'declared' confiables (no dependen del ruido para existir),
      // pero el ruido "bare" hace que la MAYORÍA de TODAS las aristas del par sean de baja confianza.
      const repo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts"), ...noise]);
      const confidentRepo = repoWith(["a/Foo.ts", "b/Bar.ts"], [edge("a/Foo.ts", "b/Bar.ts"), edge("b/Bar.ts", "a/Foo.ts")]);
      const findings = findDependencyCycles(repo, threshold);
      const confidentFindings = findDependencyCycles(confidentRepo, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBeLessThanOrEqual(35);
      expect(findings[0]!.severity).toBeLessThan(confidentFindings[0]!.severity);
      expect(findings[0]!.detail).toContain("Confianza reducida");
    });
  });

  describe("EL CICLO MÍNIMO, NO EL SCC ENTERO (Ola O): el hallazgo es el ciclo más corto dentro del componente, no el componente completo", () => {
    it("un componente de 5 archivos donde sólo 2 forman el ciclo real (los otros 3 son alcanzables por un camino de ida, sin vuelta corta) reporta SÓLO esos 2, no los 5", () => {
      // b/B.ts <-> c/C.ts es el único ciclo real. a/A.ts, d/D.ts, e/E.ts son
      // alcanzables desde y hacia ese par (por eso Tarjan los agrupa en el
      // MISMO componente fuertemente conexo: A -> B -> D -> E -> A, y B <-> C
      // por separado) pero ninguno de los tres es parte del camino MÁS CORTO
      // de vuelta — la definición de "SCC" los incluye, la de "ciclo mínimo" no.
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/A.ts", "b/B.ts", "c/C.ts", "d/D.ts", "e/E.ts"],
        [
          edge("a/A.ts", "b/B.ts"),
          edge("b/B.ts", "c/C.ts"),
          edge("c/C.ts", "b/B.ts"),
          edge("b/B.ts", "d/D.ts"),
          edge("d/D.ts", "e/E.ts"),
          edge("e/E.ts", "a/A.ts"),
        ],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(2);
      expect(findings[0]!.locations.map((l) => l.file)).toEqual(["b/B.ts", "c/C.ts"]);
      expect(findings[0]!.title).toContain("B.ts");
      expect(findings[0]!.title).toContain("C.ts");
      // el `locations` (lo accionable) son los 2 del ciclo mínimo, no los 5 del componente
      // — el contexto del tangle mayor, cuando corresponde, va en `detail`/`evidence`
      // (verificado por separado en el test siguiente), nunca infla `locations`.
      expect(findings[0]!.locations).toHaveLength(2);
    });

    it("cuando el ciclo mínimo extraído es MÁS CHICO que su componente conexo, el detail y la evidencia lo dicen explícitamente, sin esconder el tangle mayor", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/A.ts", "b/B.ts", "c/C.ts", "d/D.ts"],
        [edge("a/A.ts", "b/B.ts"), edge("b/B.ts", "a/A.ts"), edge("a/A.ts", "c/C.ts"), edge("c/C.ts", "d/D.ts"), edge("d/D.ts", "a/A.ts")],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(2); // a/A.ts <-> b/B.ts es el mínimo
      expect(findings[0]!.detail).toContain("ciclo MÍNIMO");
      expect(findings[0]!.detail).toContain("4 archivos");
      const componentEv = findings[0]!.evidence!.find((e) => e.label.includes("componente conexo mayor"));
      expect(componentEv?.value).toBe(4);
    });

    it("cuando el ciclo mínimo ES el componente entero (nada que recortar), no se menciona ningún tangle mayor — mismo comportamiento que antes de esta ola para SCC ya chicos", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      const repo = repoWith(
        ["a/A.ts", "b/B.ts", "c/C.ts"],
        [edge("a/A.ts", "b/B.ts"), edge("b/B.ts", "c/C.ts"), edge("c/C.ts", "a/A.ts")],
      );
      const findings = findDependencyCycles(repo, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(3);
      expect(findings[0]!.detail).not.toContain("ciclo MÍNIMO");
      expect(findings[0]!.evidence!.some((e) => e.label.includes("componente conexo mayor"))).toBe(false);
    });

    it("determinismo: dos corridas sobre el MISMO grafo (con más de un ciclo mínimo de igual longitud posible) devuelven byte-idénticos los mismos miembros", () => {
      const threshold = testContext(detector, "*").threshold("minCycleSize");
      // Dos pares 2-ciclo independientes unidos por un puente en cada sentido: dos ciclos
      // mínimos de longitud 2 igualmente válidos compiten (a<->b y c<->d), más el propio
      // puente. El resultado tiene que ser estable entre corridas, cualquiera sea el que gane.
      const repo = repoWith(
        ["a/A.ts", "b/B.ts", "c/C.ts", "d/D.ts"],
        [edge("a/A.ts", "b/B.ts"), edge("b/B.ts", "a/A.ts"), edge("b/B.ts", "c/C.ts"), edge("c/C.ts", "d/D.ts"), edge("d/D.ts", "c/C.ts"), edge("d/D.ts", "a/A.ts")],
      );
      const run1 = findDependencyCycles(repo, threshold);
      const run2 = findDependencyCycles(repo, threshold);
      expect(run1).toEqual(run2);
      expect(run1).toHaveLength(1);
      expect(run1[0]!.trigger[0]!.value).toBe(2);
    });
  });
});
