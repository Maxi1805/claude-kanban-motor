/**
 * `graph/edges/satisfies-derive.ts` — CONTRATO-F8G.md §3.2, implementado
 * por F4. El día-0 (stub, `[]` siempre) queda cubierto acá como un CASO del
 * algoritmo real (dos tipos sin miembros), no como comportamiento especial.
 */
import { describe, expect, it } from "vitest";

import { deriveSatisfiesEdges, SATISFIES_WORK_BUDGET } from "./satisfies-derive.js";
import type { CodeGraphEdge, CodeGraphNode } from "../types.js";

function classNode(id: string, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id, kind: "symbol", file: "a.ts", symbolPath: [id], family: "class-like", ...overrides };
}

/** `id` con forma `sym:file#Owner.member` — `symbolPath` termina en el nombre PELADO del miembro (`memberSignatures` toma su último segmento), nunca el `id` completo. */
function memberNode(id: string, arity: number | null | undefined): CodeGraphNode {
  const name = id.split(".").pop()!;
  return { id, kind: "symbol", file: "a.ts", symbolPath: [name], family: "function-like", arity };
}

function contains(from: string, to: string): CodeGraphEdge {
  return { from, to, kind: "contains", provenance: "declared", weight: 1 };
}

describe("deriveSatisfiesEdges", () => {
  it("sin nodos, o sin miembros en ningún tipo (incluido el día-0: `arity` todavía `undefined`), devuelve `[]`", () => {
    const nodes: CodeGraphNode[] = [classNode("sym:a#Iface"), classNode("sym:a#Impl")];
    expect(deriveSatisfiesEdges(nodes, []).edges).toEqual([]);
    expect(deriveSatisfiesEdges([], []).edges).toEqual([]);
  });

  it("Impl tiene, con la MISMA aridad, todo lo que Iface exige ⇒ Impl satisface a Iface", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Iface"),
      memberNode("sym:a#Iface.alpha", 1),
      memberNode("sym:a#Iface.beta", 0),
      classNode("sym:a#Impl"),
      memberNode("sym:a#Impl.alpha", 1),
      memberNode("sym:a#Impl.beta", 0),
      memberNode("sym:a#Impl.extra", 2), // de más no rompe nada
    ];
    const containsEdges = [
      contains("sym:a#Iface", "sym:a#Iface.alpha"),
      contains("sym:a#Iface", "sym:a#Iface.beta"),
      contains("sym:a#Impl", "sym:a#Impl.alpha"),
      contains("sym:a#Impl", "sym:a#Impl.beta"),
      contains("sym:a#Impl", "sym:a#Impl.extra"),
    ];
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([
      { from: "sym:a#Impl", to: "sym:a#Iface", kind: "satisfies", provenance: "inferred", weight: 1 },
    ]);
  });

  it("aridad distinta en un miembro con el mismo nombre ⇒ NO satisface (nunca adivina)", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Iface"),
      memberNode("sym:a#Iface.alpha", 1),
      memberNode("sym:a#Iface.beta", 0), // segundo miembro requerido: aísla el mismatch de aridad del umbral de tamaño
      classNode("sym:a#Impl"),
      memberNode("sym:a#Impl.alpha", 2), // mismo nombre, aridad distinta
      memberNode("sym:a#Impl.beta", 0),
    ];
    const containsEdges = [
      contains("sym:a#Iface", "sym:a#Iface.alpha"),
      contains("sym:a#Iface", "sym:a#Iface.beta"),
      contains("sym:a#Impl", "sym:a#Impl.alpha"),
      contains("sym:a#Impl", "sym:a#Impl.beta"),
    ];
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([]);
  });

  it("miembro requerido con aridad DESCONOCIDA (`null`, `undefined`) nunca cuenta como satisfecho — evita colisionar todo lo desconocido entre sí", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Iface"),
      memberNode("sym:a#Iface.alpha", null),
      classNode("sym:a#Impl"),
      memberNode("sym:a#Impl.alpha", null),
    ];
    const containsEdges = [contains("sym:a#Iface", "sym:a#Iface.alpha"), contains("sym:a#Impl", "sym:a#Impl.alpha")];
    // Iface no tiene NINGUNA firma verificable (su único miembro es aridad
    // desconocida) ⇒ nada que satisfacer, aunque Impl tenga un miembro de
    // igual nombre y también aridad desconocida.
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([]);
  });

  it("un tipo nunca se satisface a sí mismo", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Solo"),
      memberNode("sym:a#Solo.alpha", 0),
      memberNode("sym:a#Solo.beta", 1),
    ];
    const containsEdges = [contains("sym:a#Solo", "sym:a#Solo.alpha"), contains("sym:a#Solo", "sym:a#Solo.beta")];
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([]);
  });

  it("dos candidatos distintos satisfacen el mismo objetivo (firma requerida de tamaño 2) ⇒ dos aristas (cada uno con un miembro EXTRA distinto, así ninguno se satisface entre sí)", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Iface"),
      memberNode("sym:a#Iface.alpha", 0),
      memberNode("sym:a#Iface.beta", 0),
      classNode("sym:a#ImplA"),
      memberNode("sym:a#ImplA.alpha", 0),
      memberNode("sym:a#ImplA.beta", 0),
      memberNode("sym:a#ImplA.extraA", 1),
      classNode("sym:a#ImplB"),
      memberNode("sym:a#ImplB.alpha", 0),
      memberNode("sym:a#ImplB.beta", 0),
      memberNode("sym:a#ImplB.extraB", 2),
    ];
    const containsEdges = [
      contains("sym:a#Iface", "sym:a#Iface.alpha"),
      contains("sym:a#Iface", "sym:a#Iface.beta"),
      contains("sym:a#ImplA", "sym:a#ImplA.alpha"),
      contains("sym:a#ImplA", "sym:a#ImplA.beta"),
      contains("sym:a#ImplA", "sym:a#ImplA.extraA"),
      contains("sym:a#ImplB", "sym:a#ImplB.alpha"),
      contains("sym:a#ImplB", "sym:a#ImplB.beta"),
      contains("sym:a#ImplB", "sym:a#ImplB.extraB"),
    ];
    const edges = deriveSatisfiesEdges(nodes, containsEdges).edges;
    // Sólo ImplA/ImplB satisfacen a Iface (superconjunto estricto). Iface NO
    // satisface a ninguno de los dos (le falta `extraA`/`extraB`), y ImplA/
    // ImplB no se satisfacen entre sí (cada uno le falta el `extra` del otro).
    expect(edges).toEqual([
      { from: "sym:a#ImplA", to: "sym:a#Iface", kind: "satisfies", provenance: "inferred", weight: 1 },
      { from: "sym:a#ImplB", to: "sym:a#Iface", kind: "satisfies", provenance: "inferred", weight: 1 },
    ]);
  });

  it("ARISTAS#1: firma requerida de UN solo miembro (p.ej. un dunder genérico) ⇒ nunca satisface, aunque el candidato lo tenga con la misma aridad", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Sentinel"),
      memberNode("sym:a#Sentinel.__repr__", 1),
      classNode("sym:a#OtroTipo"),
      memberNode("sym:a#OtroTipo.__repr__", 1), // mismo nombre+aridad, tipo por lo demás no relacionado
    ];
    const containsEdges = [
      contains("sym:a#Sentinel", "sym:a#Sentinel.__repr__"),
      contains("sym:a#OtroTipo", "sym:a#OtroTipo.__repr__"),
    ];
    // Antes del fix: OtroTipo "satisfacía" a Sentinel (firma de tamaño 1
    // coincidente). Ahora: firma requerida < 2 ⇒ Sentinel nunca es objetivo.
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([]);
  });

  it("un miembro `function-like` que NO cuelga de `contains` (otro tipo, o un símbolo que no es miembro) no infla la firma", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Iface"),
      memberNode("sym:a#Iface.alpha", 1),
      memberNode("sym:a#Iface.beta", 0),
      classNode("sym:a#Impl"), // Impl no tiene NINGÚN `contains` hacia un miembro propio
      memberNode("sym:b#suelto.alpha", 1), // mismo nombre/aridad, pero de OTRO tipo
    ];
    const containsEdges = [
      contains("sym:a#Iface", "sym:a#Iface.alpha"),
      contains("sym:a#Iface", "sym:a#Iface.beta"),
      contains("sym:b#suelto", "sym:b#suelto.alpha"),
    ];
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([]);
  });

  /**
   * Regresión del defecto de esta ola: el techo tenía que ser una función del
   * TAMAÑO de la entrada, no del reloj de pared — de lo contrario es
   * imposible escribir un test determinista para él (con `performance.now()`
   * ninguna aserción sobre "se corta acá" es confiable en CI). Con
   * `SATISFIES_WORK_BUDGET` en unidades de trabajo, SÍ se puede: un mazo de
   * `contains` decorativas (todas `from` un tipo que NO es `class-like`, así
   * que fase 1 las descarta en O(1) sin tocar `Map`/`Set` de verdad — no hace
   * falta ni crear los nodos) puestas ANTES del par real Impl/Iface agota el
   * presupuesto compartido antes de que la fase 1 llegue a esas dos aristas;
   * el mismo mazo, más corto, deja margen y el par real se sigue encontrando
   * — sin cronómetro de por medio, sólo tamaños de arreglo.
   */
  it("SATISFIES_WORK_BUDGET es un tope de TRABAJO, no de reloj: agotarlo con `contains` decorativas antes del par real hace perder ese par; con margen, se lo sigue encontrando — determinista, no depende de la velocidad de la corrida", () => {
    const realNodes: CodeGraphNode[] = [
      classNode("sym:a#Iface"),
      memberNode("sym:a#Iface.alpha", 1),
      memberNode("sym:a#Iface.beta", 0),
      classNode("sym:a#Impl"),
      memberNode("sym:a#Impl.alpha", 1),
      memberNode("sym:a#Impl.beta", 0),
      memberNode("sym:a#Impl.extra", 2), // de más, para que Iface NO satisfaga a Impl de vuelta (mismo rol que en el test algorítmico de arriba).
    ];
    const realContainsEdges = [
      contains("sym:a#Iface", "sym:a#Iface.alpha"),
      contains("sym:a#Iface", "sym:a#Iface.beta"),
      contains("sym:a#Impl", "sym:a#Impl.alpha"),
      contains("sym:a#Impl", "sym:a#Impl.beta"),
      contains("sym:a#Impl", "sym:a#Impl.extra"),
    ];
    const expected = [{ from: "sym:a#Impl", to: "sym:a#Iface", kind: "satisfies", provenance: "inferred", weight: 1 }];

    /* ─────────────────────────────────────────────────────────────────────
     * ESTE TEST AFIRMABA LO CONTRARIO, Y ESA AFIRMACIÓN ERA EL BUG.
     *
     * La versión anterior usaba `contains` decorativas cuyo `from` NO es
     * `class-like` —que la fase 1 descarta en O(1)— y exigía que IGUAL
     * consumieran presupuesto, dejando "el par real nunca se visita". O sea:
     * consagraba que población ajena a esta derivación pudiera apagarla.
     *
     * Costó una regresión medida. Al aterrizar `declares-type`/`stores`
     * (Ola R), los nodos `carrier` nuevos llevaron el conteo de
     * `corpus/sqlalchemy` de 20.316 a 37.051 (+82 %) y los pasos de esta
     * función de 40.756 a 57.491 —por encima del techo— y las aristas
     * `satisfies` del repo pasaron de **1.339 a CERO**, en silencio, moviendo
     * seis kinds. Ninguno de esos nodos participa jamás de esta derivación.
     *
     * El invariante correcto, y el que se fija abajo: **el presupuesto acota
     * el TRABAJO DE ESTA DERIVACIÓN, no el TAMAÑO DEL GRAFO.**
     * ───────────────────────────────────────────────────────────────────── */

    // (1) POBLACIÓN AJENA: `from` no es `class-like`, así que la fase 1 la
    // descarta al toque. Aunque haya DIEZ VECES el presupuesto, no cuesta nada
    // y el par real se encuentra igual. Éste es el caso de los nodos
    // `carrier`, y el que antes fallaba.
    const ajena = (i: number): CodeGraphEdge => contains("sym:decoy#Owner", `sym:decoy#member${i}`);
    const muchisimaAjena = Array.from({ length: SATISFIES_WORK_BUDGET * 10 }, (_, i) => ajena(i));
    const conAjena = deriveSatisfiesEdges(realNodes, [...muchisimaAjena, ...realContainsEdges]);
    expect(conAjena.edges).toEqual(expected);
    expect(conAjena.cobertura).toBe("completa");

    // (2) TRABAJO REAL: `from` SÍ es `class-like`, así que cada arista aporta
    // un miembro y cuesta. El techo sigue acotando, que es para lo que existe.
    const owners: CodeGraphNode[] = Array.from({ length: SATISFIES_WORK_BUDGET }, (_, i) =>
      classNode(`sym:real#Owner${i}`),
    );
    const trabajoReal = Array.from({ length: SATISFIES_WORK_BUDGET }, (_, i) =>
      contains(`sym:real#Owner${i}`, `sym:real#Owner${i}.m`),
    );
    const cortado = deriveSatisfiesEdges([...owners, ...realNodes], [...trabajoReal, ...realContainsEdges]);
    expect(cortado.edges).toEqual([]);

    // (3) Y CUANDO CORTA, LO DICE. Agotarse y devolver menos aristas era
    // indistinguible de "este repo no tiene ninguna" — la misma confusión que
    // el proyecto ya combatió con `sin-aristas`/`sin-grafo`/`sin-metricas`.
    expect(cortado.cobertura).toBe("parcial");
    expect(cortado.pasos).toBeGreaterThanOrEqual(SATISFIES_WORK_BUDGET);
  });

  /**
   * Ola Q (F1) — LA PROCEDENCIA. Ver "LA PROCEDENCIA DE LA ARISTA" en el
   * docstring del módulo: dos tipos con el MISMO conjunto de firmas producen
   * las DOS aristas, y ninguna de las dos midió la dirección. Medido: 302 de
   * 648 aristas en hugo, 578 de 1.150 en nest.
   */
  it("conjuntos de firma IGUALES ⇒ las DOS direcciones, las dos `ambiguous` (la derivación no midió cuál es el contrato)", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Uno"),
      memberNode("sym:a#Uno.alpha", 1),
      memberNode("sym:a#Uno.beta", 0),
      classNode("sym:a#Otro"),
      memberNode("sym:a#Otro.alpha", 1),
      memberNode("sym:a#Otro.beta", 0),
    ];
    const containsEdges = [
      contains("sym:a#Uno", "sym:a#Uno.alpha"),
      contains("sym:a#Uno", "sym:a#Uno.beta"),
      contains("sym:a#Otro", "sym:a#Otro.alpha"),
      contains("sym:a#Otro", "sym:a#Otro.beta"),
    ];
    const edges = deriveSatisfiesEdges(nodes, containsEdges).edges;
    expect(edges).toEqual([
      { from: "sym:a#Otro", to: "sym:a#Uno", kind: "satisfies", provenance: "ambiguous", weight: 1 },
      { from: "sym:a#Uno", to: "sym:a#Otro", kind: "satisfies", provenance: "ambiguous", weight: 1 },
    ]);
    // La incertidumbre es de DIRECCIÓN, no de destino: `alternatives` enumera
    // otros `to` posibles y acá el par está determinado — rellenarlo mentiría.
    for (const e of edges) expect(e).not.toHaveProperty("alternatives");
  });

  it("contención ESTRICTA (el candidato tiene una firma de más) sigue siendo `inferred`: la evidencia SÍ fija la dirección", () => {
    const nodes: CodeGraphNode[] = [
      classNode("sym:a#Contrato"),
      memberNode("sym:a#Contrato.alpha", 1),
      memberNode("sym:a#Contrato.beta", 0),
      classNode("sym:a#Impl"),
      memberNode("sym:a#Impl.alpha", 1),
      memberNode("sym:a#Impl.beta", 0),
      memberNode("sym:a#Impl.propia", 3),
    ];
    const containsEdges = [
      contains("sym:a#Contrato", "sym:a#Contrato.alpha"),
      contains("sym:a#Contrato", "sym:a#Contrato.beta"),
      contains("sym:a#Impl", "sym:a#Impl.alpha"),
      contains("sym:a#Impl", "sym:a#Impl.beta"),
      contains("sym:a#Impl", "sym:a#Impl.propia"),
    ];
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([
      { from: "sym:a#Impl", to: "sym:a#Contrato", kind: "satisfies", provenance: "inferred", weight: 1 },
    ]);
  });

  it("familias que no son `class-like` (namespace-like, function-like) nunca son objetivo ni candidato", () => {
    const nodes: CodeGraphNode[] = [
      { id: "sym:a#Ns", kind: "symbol", file: "a.ts", symbolPath: ["Ns"], family: "namespace-like" },
      memberNode("sym:a#Ns.alpha", 0),
      classNode("sym:a#Impl"),
      memberNode("sym:a#Impl.alpha", 0),
    ];
    const containsEdges = [contains("sym:a#Ns", "sym:a#Ns.alpha"), contains("sym:a#Impl", "sym:a#Impl.alpha")];
    expect(deriveSatisfiesEdges(nodes, containsEdges).edges).toEqual([]);
  });
});
