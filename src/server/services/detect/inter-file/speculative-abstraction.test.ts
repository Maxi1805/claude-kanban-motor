import { describe, expect, it } from "vitest";

import { buildSpeculativeAbstractionFindings, detector } from "./speculative-abstraction.js";
import { testContext } from "../testing.js";
import type { CloneCandidate, RepoUnit } from "../types.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: no hace falta tree-sitter — el detector
 * sólo lee `RepoUnit.graph` (nodos+aristas planas), así que este test
 * construye el grafo a mano, igual que `dependency-cycle.test.ts`/
 * `orphan-file.test.ts`. Por la misma razón, "≥3 lenguajes que emiten" no
 * aplica: el detector no clasifica por lenguaje en absoluto (a diferencia de
 * `orphan-file`/`unused-symbol`, que sí reducen severidad en Java por la
 * brecha de `path-proximity`) — ver el docstring del módulo: esas tres
 * aristas (`extends`/`implements`/`satisfies`) NUNCA pasan por la cascada de
 * `resolve.ts`, así que esa brecha en particular no las alcanza.
 */
function symbolNode(
  file: string,
  symbolPath: readonly string[],
  overrides: Partial<Pick<CodeGraphNode, "family" | "startLine" | "endLine" | "nodeType" | "shapeNodeType">> = {},
): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: overrides.family ?? "class-like",
    startLine: overrides.startLine,
    endLine: overrides.endLine,
    // Ola S (S1): AUSENTES por default a propósito — un grafo de antes de esta
    // ola no trae la forma gramatical, y el detector tiene que comportarse
    // exactamente igual ahí (ver "ausente ≠ interfaz" más abajo).
    nodeType: overrides.nodeType,
    shapeNodeType: overrides.shapeNodeType,
  };
}

function edge(
  from: string,
  to: string,
  overrides: Partial<Pick<CodeGraphEdge, "kind" | "provenance" | "weight">> = {},
): CodeGraphEdge {
  return {
    from,
    to,
    kind: overrides.kind ?? "implements",
    provenance: overrides.provenance ?? "declared",
    weight: overrides.weight ?? 1,
  };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function repoWith(graph: CodeGraph | null): RepoUnit {
  return { repoName: "test", files: [], functions: [], clones: [], graph };
}

const PRESENCE = () => testContext(detector, "*").threshold("presence");

describe("speculative-abstraction", () => {
  it("interfaz con un único implementador (arista `implements`) es un hallazgo", () => {
    const iface = symbolNode("src/Shape.ts", ["Shape"]);
    const impl = symbolNode("src/Circle.ts", ["Circle"]);
    const graph = graphOf([iface, impl], [edge(impl.id, iface.id, { kind: "implements" })]);

    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("Shape");
    expect(findings[0]!.title).toContain("Circle");
    expect(findings[0]!.trigger[0]!.value).toBe(1);
    expect(findings[0]!.locations[0]!.role).toBe("interfaz con un solo implementador");
    expect(findings[0]!.locations[1]!.role).toBe("único implementador");
  });

  it("clase base con una única subclase (arista `extends`) es un hallazgo, y el rol dice 'clase base'", () => {
    const base = symbolNode("src/Animal.ts", ["Animal"]);
    const sub = symbolNode("src/Dog.ts", ["Dog"]);
    const graph = graphOf([base, sub], [edge(sub.id, base.id, { kind: "extends" })]);

    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("clase base con un solo implementador");
  });

  it("AUTO-BUCLE (Ola P): una arista `extends` de un nodo a SÍ MISMO no lo vuelve su propio implementador", () => {
    // Repro real medido: `click/_textwrap.py` declara
    // `class TextWrapper(textwrap.TextWrapper)`; el calificador `textwrap` es
    // ajeno al repo y la única declaración de ese NOMBRE dentro del repo es la
    // propia clase, así que `graph/build.ts#buildTypedEdgeCandidatesForFile`
    // (que, a diferencia de `buildCandidatesForFile`, no filtra la
    // auto-referencia) resuelve el candidato contra sí mismo. Sin esta guarda
    // el hallazgo sale literalmente como `"TextWrapper" tiene un único
    // implementador: "TextWrapper"`.
    const self = symbolNode("src/TextWrapper.py", ["TextWrapper"]);
    const graph = graphOf([self], [edge(self.id, self.id, { kind: "extends" })]);
    expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
  });

  it("AUTO-BUCLE: un auto-bucle NO enmascara a un implementador real distinto", () => {
    const base = symbolNode("src/Base.py", ["Base"]);
    const impl = symbolNode("src/Impl.py", ["Impl"]);
    const graph = graphOf([base, impl], [edge(base.id, base.id, { kind: "extends" }), edge(impl.id, base.id, { kind: "extends" })]);
    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("Impl");
  });

  it("control negativo: una interfaz con DOS implementadores distintos no es un hallazgo", () => {
    const iface = symbolNode("src/Shape.ts", ["Shape"]);
    const circle = symbolNode("src/Circle.ts", ["Circle"]);
    const square = symbolNode("src/Square.ts", ["Square"]);
    const graph = graphOf(
      [iface, circle, square],
      [edge(circle.id, iface.id, { kind: "implements" }), edge(square.id, iface.id, { kind: "implements" })],
    );

    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(0);
  });

  it("control negativo: una interfaz sin ningún implementador no es un hallazgo (es otro problema: orphan-file/unused-symbol)", () => {
    const iface = symbolNode("src/Unused.ts", ["Unused"]);
    const graph = graphOf([iface], []);

    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(0);
  });

  it("una arista `implements` `ambiguous` NO cuenta como implementador: CONTRATO-F9.md §4.5, fuera de toda consulta por defecto", () => {
    const iface = symbolNode("src/Shape.ts", ["Shape"]);
    const impl = symbolNode("src/Circle.ts", ["Circle"]);
    const graph = graphOf([iface, impl], [edge(impl.id, iface.id, { kind: "implements", provenance: "ambiguous" })]);

    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(0);
  });

  it("dos aristas del MISMO origen hacia el mismo destino (`implements` + `satisfies` redundantes) cuentan como UN implementador, no dos", () => {
    const iface = symbolNode("src/Shape.ts", ["Shape"]);
    const impl = symbolNode("src/Circle.ts", ["Circle"]);
    const graph = graphOf(
      [iface, impl],
      [edge(impl.id, iface.id, { kind: "implements" }), edge(impl.id, iface.id, { kind: "satisfies", provenance: "inferred" })],
    );

    const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
    expect(findings).toHaveLength(1);
  });

  /**
   * Ola Q (F1) — el cambio de definición. Ver "UNA ARISTA ESTRUCTURAL NO
   * SOSTIENE UNA AFIRMACIÓN NOMINAL" en el docstring del módulo. Antes de
   * esta ola el caso de abajo emitía el hallazgo con 10 puntos menos de
   * severidad; nombrar la duda en el `detail` no arregla una afirmación que
   * la evidencia no sostiene.
   */
  it("un implementador que llega SÓLO por `satisfies` (coincidencia estructural) NO produce hallazgo; el mismo par por `implements` (declarado) SÍ", () => {
    const iface1 = symbolNode("src/A.ts", ["A"]);
    const impl1 = symbolNode("src/B.ts", ["B"]);
    const declared = buildSpeculativeAbstractionFindings(
      graphOf([iface1, impl1], [edge(impl1.id, iface1.id, { kind: "implements" })]),
      PRESENCE(),
    );
    expect(declared).toHaveLength(1);

    const iface2 = symbolNode("src/C.ts", ["C"]);
    const impl2 = symbolNode("src/D.ts", ["D"]);
    const structural = buildSpeculativeAbstractionFindings(
      graphOf([iface2, impl2], [edge(impl2.id, iface2.id, { kind: "satisfies", provenance: "inferred" })]),
      PRESENCE(),
    );
    expect(structural).toHaveLength(0);
  });

  /**
   * La regla es ASIMÉTRICA a propósito, y la asimetría está medida: si en vez
   * de prohibirle ESTABLECER se le sacara la arista del CONTEO, un objetivo
   * con dos implementadores bajaría a uno y aparecerían hallazgos NUEVOS de la
   * misma familia fabricada (medido en nest: `MqttBroadcastController`/
   * `NatsBroadcastController`/`RedisBroadcastController` "implementados" por
   * `RMQBroadcastController`). Este test fija la mitad que evita eso.
   */
  it("`satisfies` REFUTA la unicidad aunque no la establezca: un segundo origen estructural deja al objetivo con 2 implementadores y no se emite nada", () => {
    const iface = symbolNode("src/Shape2.ts", ["Shape2"]);
    const declaredImpl = symbolNode("src/Circle2.ts", ["Circle2"]);
    const structuralImpl = symbolNode("src/Square2.ts", ["Square2"]);
    const soloDeclarado = graphOf([iface, declaredImpl], [edge(declaredImpl.id, iface.id, { kind: "implements" })]);
    expect(buildSpeculativeAbstractionFindings(soloDeclarado, PRESENCE())).toHaveLength(1);

    const conEstructural = graphOf(
      [iface, declaredImpl, structuralImpl],
      [
        edge(declaredImpl.id, iface.id, { kind: "implements" }),
        edge(structuralImpl.id, iface.id, { kind: "satisfies", provenance: "inferred" }),
      ],
    );
    expect(buildSpeculativeAbstractionFindings(conEstructural, PRESENCE())).toHaveLength(0);
  });

  describe("satisfies redundante con la familia ya declarada (bug real, ver docstring del módulo)", () => {
    it("un ANCESTRO no cuenta como 'implementador' de su propio descendiente vía `satisfies` (click/exceptions.py: ClickException/NoArgsIsHelpError)", () => {
      // Ancestor -> Middle (extends) -> Descendant (extends): Ancestor "satisface"
      // trivialmente la forma casi vacía de Descendant (duck typing), pero es el
      // MISMO linaje, no un segundo implementador. La cadena `extends` en sí
      // produce DOS hallazgos REALES e independientes (Ancestor con único
      // implementador Middle; Middle con único implementador Descendant) — lo
      // que este caso verifica es que NO aparece un TERCERO (Descendant con
      // "implementador" Ancestor) sostenido únicamente por el `satisfies` espurio.
      const ancestor = symbolNode("src/exceptions.py", ["ClickException"]);
      const middle = symbolNode("src/exceptions.py", ["UsageError"]);
      const descendant = symbolNode("src/exceptions.py", ["NoArgsIsHelpError"]);
      const graph = graphOf(
        [ancestor, middle, descendant],
        [
          edge(middle.id, ancestor.id, { kind: "extends" }),
          edge(descendant.id, middle.id, { kind: "extends" }),
          edge(ancestor.id, descendant.id, { kind: "satisfies", provenance: "inferred" }),
        ],
      );
      const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
      expect(findings).toHaveLength(2); // los dos eslabones REALES de la cadena `extends`, nada más
      expect(findings.some((f) => f.title.includes("NoArgsIsHelpError") && f.title.includes("ClickException"))).toBe(false);
    });

    it("un par YA unido por `extends` directo no gana evidencia extra de un `satisfies` redundante entre el MISMO par (click/types.py: FloatRange/_NumberRangeBase)", () => {
      const base = symbolNode("src/types.py", ["_NumberRangeBase"]);
      const sub = symbolNode("src/types.py", ["FloatRange"]);
      const graph = graphOf(
        [base, sub],
        [edge(sub.id, base.id, { kind: "extends" }), edge(sub.id, base.id, { kind: "satisfies", provenance: "inferred" })],
      );
      const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
      expect(findings).toHaveLength(1);
      // El único kind que sostiene el hallazgo es `extends` (declarado) — el
      // `satisfies` redundante nunca llegó a agregarse al Set de kinds, así que
      // NO debería verse degradado a severidad "sólo estructural".
      expect(findings[0]!.detail).not.toContain("SATISFACCIÓN ESTRUCTURAL");
    });

    it("dos HERMANOS bajo un ancestro común no se 'implementan' entre sí vía `satisfies` (sqlalchemy: _SaveUpdateState/_DeleteState bajo _PostSortRec)", () => {
      const common = symbolNode("src/unitofwork.py", ["_PostSortRec"]);
      const siblingA = symbolNode("src/unitofwork.py", ["_SaveUpdateState"]);
      const siblingB = symbolNode("src/unitofwork.py", ["_DeleteState"]);
      const graph = graphOf(
        [common, siblingA, siblingB],
        [
          edge(siblingA.id, common.id, { kind: "extends" }),
          edge(siblingB.id, common.id, { kind: "extends" }),
          // Duck typing: ambos hermanos comparten forma (mismo contrato del ancestro) — no es que uno "implemente" al otro.
          edge(siblingB.id, siblingA.id, { kind: "satisfies", provenance: "inferred" }),
        ],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });

    /**
     * REESCRITO en la Ola Q (F1). El "control positivo" de la Ola O fijaba que
     * un `satisfies` entre dos tipos SIN relación de familia declarada seguía
     * generando el hallazgo — que es exactamente el "caso 4" que el docstring
     * daba por residual y que resultó ser la regla entera. La propiedad que
     * este bloque tiene que seguir protegiendo es OTRA, y sigue viva: el
     * descarte por familia (`familyUnionFind`) no puede tragarse un
     * `implements` DECLARADO entre el mismo par.
     */
    it("control positivo: el descarte por familia sólo alcanza a `satisfies` — un `implements` declarado entre dos tipos sin otra relación SIGUE generando el hallazgo", () => {
      const iface = symbolNode("src/Shape.ts", ["Shape"]);
      const impl = symbolNode("src/Circle.ts", ["Circle"]);
      const declaradas = graphOf([iface, impl], [edge(impl.id, iface.id, { kind: "implements" })]);
      expect(buildSpeculativeAbstractionFindings(declaradas, PRESENCE())).toHaveLength(1);

      // Y la contrapartida: la MISMA forma sostenida sólo por coincidencia
      // estructural no afirma nada (Ola Q, ver el docstring del módulo).
      const estructural = graphOf([iface, impl], [edge(impl.id, iface.id, { kind: "satisfies", provenance: "inferred" })]);
      expect(buildSpeculativeAbstractionFindings(estructural, PRESENCE())).toHaveLength(0);
    });

    it("la conectividad de familia es TRANSITIVA e ignora dirección: A extends B, C extends B ⇒ un `satisfies` A→C también se descarta", () => {
      const b = symbolNode("src/B.ts", ["B"]);
      const a = symbolNode("src/A.ts", ["A"]);
      const c = symbolNode("src/C.ts", ["C"]);
      const graph = graphOf(
        [b, a, c],
        [edge(a.id, b.id, { kind: "extends" }), edge(c.id, b.id, { kind: "extends" }), edge(a.id, c.id, { kind: "satisfies", provenance: "inferred" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });

    it("`mixes-in` también arma familia (no sólo `extends`/`implements`): un `satisfies` redundante con un mixin compartido se descarta igual", () => {
      const mixin = symbolNode("src/Mixin.rb", ["Sortable"]);
      const a = symbolNode("src/A.rb", ["A"]);
      const c = symbolNode("src/C.rb", ["C"]);
      const graph = graphOf(
        [mixin, a, c],
        [
          edge(a.id, mixin.id, { kind: "mixes-in" }),
          edge(c.id, mixin.id, { kind: "mixes-in" }),
          edge(a.id, c.id, { kind: "satisfies", provenance: "inferred" }),
        ],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });
  });

  describe("el candidato es él mismo destino de una `instantiates` confiable (Ola O, CON QUÉ SE CONFUNDE (3))", () => {
    it("implementador anónimo oculto: una `instantiates` sobre el candidato descarta el hallazgo aunque el implementador CON NOMBRE siga siendo único (guava/TypeVisitor)", () => {
      const iface = symbolNode("android/guava/reflect/TypeVisitor.java", ["TypeVisitor"]);
      const impl = symbolNode("android/guava/reflect/TypeResolver.java", ["TypeMappingIntrospector"]);
      const anonSite = symbolNode("android/guava/reflect/TypeResolver.java", ["populateTypeMappings"], { family: "function-like" });
      const graph = graphOf(
        [iface, impl, anonSite],
        [edge(impl.id, iface.id, { kind: "implements" }), edge(anonSite.id, iface.id, { kind: "instantiates" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });

    it("el descarte NO depende de que la `instantiates` venga de un archivo distinto al del implementador con nombre", () => {
      const iface = symbolNode("src/A.ts", ["A"]);
      const impl = symbolNode("src/B.ts", ["B"]);
      const anonSiteSameFile = symbolNode("src/B.ts", ["helper"], { family: "function-like" });
      const graph = graphOf(
        [iface, impl, anonSiteSameFile],
        [edge(impl.id, iface.id), edge(anonSiteSameFile.id, iface.id, { kind: "instantiates" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });

    it("abstracción ya útil por sí sola: una clase base directamente instanciada en otro punto del repo no es un hallazgo, aunque tenga una única subclase real (click/IntParamType-IntRange)", () => {
      const base = symbolNode("src/click/types.py", ["IntParamType"]);
      const sub = symbolNode("src/click/types.py", ["IntRange"]);
      const moduleLevel = symbolNode("src/click/types.py", ["INT"], { family: "function-like" });
      const graph = graphOf(
        [base, sub, moduleLevel],
        [edge(sub.id, base.id, { kind: "extends" }), edge(moduleLevel.id, base.id, { kind: "instantiates" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });

    it("una `instantiates` `inferred` (path-proximity, p.ej. guava/TypeVisitor con dos copias del árbol) SÍ descarta el candidato — ver 'POR QUÉ ACEPTA INFERRED' en el docstring del módulo", () => {
      const iface = symbolNode("src/A.ts", ["A"]);
      const impl = symbolNode("src/B.ts", ["B"]);
      const otherSite = symbolNode("src/C.ts", ["helper"], { family: "function-like" });
      const graph = graphOf(
        [iface, impl, otherSite],
        [edge(impl.id, iface.id), edge(otherSite.id, iface.id, { kind: "instantiates", provenance: "inferred" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(0);
    });

    it("control negativo: una `instantiates` `ambiguous` (CONTRATO-F9.md §4.5, fuera de toda consulta por defecto) NO descarta el candidato", () => {
      const iface = symbolNode("src/A.ts", ["A"]);
      const impl = symbolNode("src/B.ts", ["B"]);
      const otherSite = symbolNode("src/C.ts", ["helper"], { family: "function-like" });
      const graph = graphOf(
        [iface, impl, otherSite],
        [edge(impl.id, iface.id), edge(otherSite.id, iface.id, { kind: "instantiates", provenance: "ambiguous" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(1);
    });

    it("control negativo: una `instantiates` hacia un tipo DISTINTO del candidato no lo afecta", () => {
      const iface = symbolNode("src/A.ts", ["A"]);
      const impl = symbolNode("src/B.ts", ["B"]);
      const other = symbolNode("src/C.ts", ["C"]);
      const site = symbolNode("src/D.ts", ["helper"], { family: "function-like" });
      const graph = graphOf(
        [iface, impl, other, site],
        [edge(impl.id, iface.id), edge(site.id, other.id, { kind: "instantiates" })],
      );
      expect(buildSpeculativeAbstractionFindings(graph, PRESENCE())).toHaveLength(1);
    });
  });

  it("severidad: un único implementador cuyo archivo vive en una ruta de test/doble pesa MENOS que uno en producción", () => {
    const iface1 = symbolNode("src/A.ts", ["A"]);
    const impl1 = symbolNode("src/B.ts", ["B"]);
    const production = buildSpeculativeAbstractionFindings(
      graphOf([iface1, impl1], [edge(impl1.id, iface1.id)]),
      PRESENCE(),
    );

    const iface2 = symbolNode("src/A.ts", ["A"]);
    const testDouble = symbolNode("test/mocks/FakeA.ts", ["FakeA"]);
    const asDouble = buildSpeculativeAbstractionFindings(
      graphOf([iface2, testDouble], [edge(testDouble.id, iface2.id)]),
      PRESENCE(),
    );

    expect(asDouble[0]!.severity).toBeLessThan(production[0]!.severity);
    expect(asDouble[0]!.detail).toContain("test/doble");
  });

  it("severidad: si OTRO archivo (aparte del implementador) referencia el contrato, pesa MENOS (probable frontera pública)", () => {
    const iface1 = symbolNode("src/A.ts", ["A"]);
    const impl1 = symbolNode("src/B.ts", ["B"]);
    const isolated = buildSpeculativeAbstractionFindings(
      graphOf([iface1, impl1], [edge(impl1.id, iface1.id)]),
      PRESENCE(),
    );

    const iface2 = symbolNode("src/A.ts", ["A"]);
    const impl2 = symbolNode("src/B.ts", ["B"]);
    const consumerFn = symbolNode("src/Consumer.ts", ["useA"], { family: "function-like" });
    const withConsumer = buildSpeculativeAbstractionFindings(
      graphOf(
        [iface2, impl2, consumerFn],
        [edge(impl2.id, iface2.id), edge(consumerFn.id, iface2.id, { kind: "references" })],
      ),
      PRESENCE(),
    );

    expect(withConsumer[0]!.severity).toBeLessThan(isolated[0]!.severity);
    expect(withConsumer[0]!.evidence![0]!.value).toBe(1);
    expect(withConsumer[0]!.detail).toContain("frontera de módulo");
  });

  it("una arista `references` desde el MISMO archivo del implementador no cuenta como consumidor externo", () => {
    const iface = symbolNode("src/A.ts", ["A"]);
    const impl = symbolNode("src/B.ts", ["B"]);
    const helperInSameFile = symbolNode("src/B.ts", ["helper"], { family: "function-like" });
    const findings = buildSpeculativeAbstractionFindings(
      graphOf(
        [iface, impl, helperInSameFile],
        [edge(impl.id, iface.id), edge(helperInSameFile.id, iface.id, { kind: "references" })],
      ),
      PRESENCE(),
    );
    expect(findings[0]!.evidence![0]!.value).toBe(0);
  });

  it("borde del umbral: el `trigger` reporta exactamente el valor del threshold `presence` resuelto", () => {
    const threshold = PRESENCE();
    const iface = symbolNode("src/A.ts", ["A"]);
    const impl = symbolNode("src/B.ts", ["B"]);
    const findings = buildSpeculativeAbstractionFindings(graphOf([iface, impl], [edge(impl.id, iface.id)]), threshold);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold.value);
    expect(threshold.value).toBe(1);
  });

  it("hermano homónimo (`@n`) nunca cuenta como destino ni como origen", () => {
    const iface = symbolNode("src/A.ts", ["A"]);
    const dup = { ...symbolNode("src/A.ts", ["A"]), id: `${iface.id}@2` };
    const impl = symbolNode("src/B.ts", ["B"]);
    const findings = buildSpeculativeAbstractionFindings(
      graphOf([iface, dup, impl], [edge(impl.id, dup.id)]),
      PRESENCE(),
    );
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin unidad-tipo-clase: un grafo sin ningún nodo class-like (forzado a correr igual) no reporta nada", () => {
    // Simula un lenguaje sin capacidad "unidad-tipo-clase": ningún nodo
    // `family: 'class-like'` existe, así que ninguna arista extends/
    // implements/satisfies puede tener jamás un destino candidato — la
    // ausencia de la capacidad hace estructuralmente imposible el hallazgo,
    // no es un accidente de esta fixture. `detector.run` se llama
    // DIRECTAMENTE (bypass del gate de `needs`, igual que `runIntraFile`
    // hace para intra-*) sobre un `RepoUnit` con dos funciones que se
    // referencian entre sí y nada más.
    const fnA = symbolNode("a.rb", ["helperA"], { family: "function-like" });
    const fnB = symbolNode("b.rb", ["helperB"], { family: "function-like" });
    const graph = graphOf([fnA, fnB], [edge(fnA.id, fnB.id, { kind: "references" })]);
    const ctx = testContext(detector, "ruby");
    const findings = detector.run(repoWith(graph), ctx);
    expect(findings).toHaveLength(0);
  });

  it("defensivo: `repo.graph === null` no explota y devuelve 0 hallazgos (en producción `run.ts` ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const ctx = testContext(detector, "*");
    expect(detector.run(repoWith(null), ctx)).toHaveLength(0);
  });

  describe("un contrato no es una implementación de otro contrato (Ola S, ver docstring del módulo)", () => {
    it("`interface B extends A` entre DOS interfaces no emite: B no implementa A, la estrecha", () => {
      const a = symbolNode("src/a.ts", ["Base"], { nodeType: "interface_declaration" });
      const b = symbolNode("src/b.ts", ["Estrecha"], { nodeType: "interface_declaration" });
      const findings = buildSpeculativeAbstractionFindings(
        graphOf([a, b], [edge(b.id, a.id, { kind: "extends" })]),
        PRESENCE(),
      );
      expect(findings).toHaveLength(0);
    });

    it("Go: la forma vive en `shapeNodeType` (los dos nodeType son `type_spec`) y el criterio la lee igual", () => {
      const a = symbolNode("hugofs/fileinfo.go", ["Hasher"], { nodeType: "type_spec", shapeNodeType: "interface_type" });
      const b = symbolNode("common/hugio/writers.go", ["HashCloser"], {
        nodeType: "type_spec",
        shapeNodeType: "interface_type",
      });
      const findings = buildSpeculativeAbstractionFindings(
        graphOf([a, b], [edge(b.id, a.id, { kind: "implements" })]),
        PRESENCE(),
      );
      expect(findings).toHaveLength(0);
    });

    it("una IMPLEMENTACIÓN real sigue emitiendo: el criterio mira la forma del ORIGEN, no la del destino", () => {
      const iface = symbolNode("src/a.ts", ["Contrato"], { nodeType: "interface_declaration" });
      const impl = symbolNode("src/b.ts", ["Impl"], { nodeType: "class_declaration" });
      const findings = buildSpeculativeAbstractionFindings(
        graphOf([iface, impl], [edge(impl.id, iface.id, { kind: "implements" })]),
        PRESENCE(),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain("Impl");
    });

    it("una clase base ABSTRACTA con una única subclase concreta SIGUE emitiendo — es el caso de Fowler, no se toca", () => {
      const base = symbolNode("src/a.ts", ["Base"], { nodeType: "abstract_class_declaration" });
      const sub = symbolNode("src/b.ts", ["Sub"], { nodeType: "class_declaration" });
      const findings = buildSpeculativeAbstractionFindings(
        graphOf([base, sub], [edge(sub.id, base.id, { kind: "extends" })]),
        PRESENCE(),
      );
      expect(findings).toHaveLength(1);
    });

    it("ASIMETRÍA: la interfaz hija se sigue CONTANDO — un destino con una interfaz hija y una clase hija tiene DOS, no emite (sacarla del conteo fabricaría el hallazgo)", () => {
      const a = symbolNode("src/a.ts", ["Base"], { nodeType: "interface_declaration" });
      const hija = symbolNode("src/b.ts", ["Hija"], { nodeType: "interface_declaration" });
      const clase = symbolNode("src/c.ts", ["Impl"], { nodeType: "class_declaration" });
      const findings = buildSpeculativeAbstractionFindings(
        graphOf(
          [a, hija, clase],
          [edge(hija.id, a.id, { kind: "extends" }), edge(clase.id, a.id, { kind: "implements" })],
        ),
        PRESENCE(),
      );
      expect(findings).toHaveLength(0);
    });

    it("ausente ≠ interfaz: sin forma gramatical en el nodo (grafo de antes de esta ola) el detector se comporta igual que antes", () => {
      const a = symbolNode("src/a.ts", ["Base"]);
      const b = symbolNode("src/b.ts", ["Impl"]);
      const findings = buildSpeculativeAbstractionFindings(
        graphOf([a, b], [edge(b.id, a.id, { kind: "implements" })]),
        PRESENCE(),
      );
      expect(findings).toHaveLength(1);
    });
  });

  describe("árbol espejo (paquete ESPEJO-DUPLICACION)", () => {
    /** 5 fingerprints compartidos entre `a`/`b`: establece el par como gemelo para `detectMirrorTrees`. */
    function twinMirrorClones(a: string, b: string): CloneCandidate[] {
      const base = {
        nodes: 30,
        type: "class_declaration",
        functionName: null,
        className: null,
        superclassName: null,
        normalized: "same shape",
      };
      return [0, 1, 2, 3, 4].flatMap((i) => [
        { ...base, fingerprint: `shape${i}`, file: a, startLine: i * 10 + 1, endLine: i * 10 + 8 },
        { ...base, fingerprint: `shape${i}`, file: b, startLine: i * 10 + 1, endLine: i * 10 + 8 },
      ]);
    }

    it("el mismo hallazgo (mismo símbolo, mismo rol) repetido por un par gemelo de archivos se reporta UNA vez, no dos", () => {
      const a = "guava/src/com/google/common/collect/Maps.java";
      const b = "android/guava/src/com/google/common/collect/Maps.java";
      const ifaceA = symbolNode(a, ["Maps", "KeySet"]);
      const implA = symbolNode(a, ["Maps", "SortedKeySet"]);
      const ifaceB = symbolNode(b, ["Maps", "KeySet"]);
      const implB = symbolNode(b, ["Maps", "SortedKeySet"]);
      const graph = graphOf(
        [ifaceA, implA, ifaceB, implB],
        [edge(implA.id, ifaceA.id), edge(implB.id, ifaceB.id)],
      );
      // Fingerprints de a/b + de otro archivo cualquiera para que también
      // aparezcan como candidatos en `fingerprintsByFile` (no afecta al par).
      const clones = [...twinMirrorClones(a, b), ...twinMirrorClones(a + ".x", b + ".x")];

      const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE(), clones);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain("KeySet");
      expect(findings[0]!.title).toContain("SortedKeySet");
    });

    it("sin `clones` (parámetro por defecto []), el colapso es un no-op: el mismo caso reporta 2 (comportamiento previo, sin regresión)", () => {
      const a = "guava/src/com/google/common/collect/Maps.java";
      const b = "android/guava/src/com/google/common/collect/Maps.java";
      const ifaceA = symbolNode(a, ["Maps", "KeySet"]);
      const implA = symbolNode(a, ["Maps", "SortedKeySet"]);
      const ifaceB = symbolNode(b, ["Maps", "KeySet"]);
      const implB = symbolNode(b, ["Maps", "SortedKeySet"]);
      const graph = graphOf(
        [ifaceA, implA, ifaceB, implB],
        [edge(implA.id, ifaceA.id), edge(implB.id, ifaceB.id)],
      );
      const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE());
      expect(findings).toHaveLength(2);
    });

    it("dos hallazgos DISTINTOS (símbolos distintos) en un par gemelo NO se colapsan entre sí", () => {
      const a = "guava/src/com/google/common/collect/Maps.java";
      const b = "android/guava/src/com/google/common/collect/Maps.java";
      const ifaceA = symbolNode(a, ["Maps", "KeySet"]);
      const implA = symbolNode(a, ["Maps", "SortedKeySet"]);
      const otherIfaceA = symbolNode(a, ["Maps", "EntrySet"]);
      const otherImplA = symbolNode(a, ["Maps", "SortedEntrySet"]);
      const graph = graphOf(
        [ifaceA, implA, otherIfaceA, otherImplA],
        [edge(implA.id, ifaceA.id), edge(otherImplA.id, otherIfaceA.id)],
      );
      const clones = twinMirrorClones(a, b);
      const findings = buildSpeculativeAbstractionFindings(graph, PRESENCE(), clones);
      expect(findings).toHaveLength(2);
    });

    it("detector.run pasa `repo.clones` al colapso (integración con el RepoUnit real)", () => {
      const a = "guava/src/com/google/common/collect/Maps.java";
      const b = "android/guava/src/com/google/common/collect/Maps.java";
      const ifaceA = symbolNode(a, ["Maps", "KeySet"]);
      const implA = symbolNode(a, ["Maps", "SortedKeySet"]);
      const ifaceB = symbolNode(b, ["Maps", "KeySet"]);
      const implB = symbolNode(b, ["Maps", "SortedKeySet"]);
      const graph = graphOf(
        [ifaceA, implA, ifaceB, implB],
        [edge(implA.id, ifaceA.id), edge(implB.id, ifaceB.id)],
      );
      const repo: RepoUnit = { repoName: "test", files: [], functions: [], clones: twinMirrorClones(a, b), graph };
      const ctx = testContext(detector, "*");
      expect(detector.run(repo, ctx)).toHaveLength(1);
    });
  });
});
