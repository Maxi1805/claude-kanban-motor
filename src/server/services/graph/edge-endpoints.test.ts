/**
 * EL INVARIANTE MÁS BARATO DEL GRAFO, Y EL QUE NO EXISTÍA:
 * **toda arista nombra dos extremos que están entre los nodos.**
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
 *
 * `CodeGraph` es sólo datos (`types.ts`): `edges[i].from`/`.to` son STRINGS,
 * no punteros. Nada en el tipo impide que una arista apunte a un id que no
 * existe, y nada en el pipeline lo comprobaba. El costo de esa ausencia está
 * medido, no supuesto: en la Ola P se encontraron **423 + 524 + 22 aristas
 * colgadas** — tres veces, en tres módulos distintos, y las tres a mano,
 * mirando volcados de grafo uno por uno. Cualquiera de las tres la habría
 * atrapado este archivo en la primera corrida.
 *
 * Y el daño de una arista colgada es silencioso por construcción, porque cada
 * consumidor la absorbe a su manera:
 *
 *   - `metrics/projection.ts` la DESCARTA (`if (!fromNode || !toNode) continue`,
 *     comentado como "defensivo: no debería faltar"), así que toda métrica de
 *     grafo mide de menos sin decir nada.
 *   - `detect/inter-file/unused-symbol.ts` suma su peso a `fanIn` de un id que
 *     no existe: el fan-in del símbolo REAL queda en cero y el detector afirma
 *     "ningún archivo del repo lo referencia" sobre algo que sí se usa.
 *   - Un `Map` indexado por id simplemente no encuentra la clave, y el
 *     `?? null`/`?? 0` de turno la convierte en un dato plausible.
 *
 * O sea: el modo de falla no es una excepción, es un NÚMERO EQUIVOCADO. Por
 * eso el invariante se afirma acá y no se deja a la inspección.
 *
 * ── CÓMO SE COMPRUEBA, Y POR QUÉ ASÍ ───────────────────────────────────────
 *
 * Sobre el PIPELINE REAL (`analyzeRepo` + `onGraph`) corriendo sobre
 * `tests/fixtures/patterns` — el mismo árbol multi-lenguaje que
 * `census-golden.test.ts` congela como `fixtures-multi` y que
 * `hypothesis-state-gate.test.ts` ya analiza entero. Nunca sobre un grafo
 * armado a mano: un grafo a mano prueba lo que quien lo escribió imaginó, y
 * las tres tandas de aristas colgadas de la Ola P salieron todas de formas de
 * la gramática que nadie había imaginado (un `type Alias` declarado dentro de
 * un método, el receptor de una gramática que no anida, una pila de scope que
 * se desincronizó con la de al lado).
 *
 * Tres guardas de que el invariante NO sea vacío, porque un invariante que se
 * cumple por no tener nada que comprobar es peor que no tenerlo:
 *
 *   1. el grafo tiene nodos y aristas (pisos explícitos);
 *   2. aparecen VARIOS `EdgeKind` distintos, no sólo `contains`;
 *   3. el propio comprobador se prueba contra un grafo con una arista colgada
 *      inyectada a mano, y tiene que encontrarla. Misma disciplina que la
 *      compuerta de recall: un test que nunca se vio fallar no es evidencia.
 */
import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";

import { analyzeRepo } from "../code-analyzer.js";
import type { CodeGraph, CodeGraphEdge, EdgeKind } from "./types.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../../../../tests/fixtures/patterns");

interface AristaColgada {
  readonly edge: CodeGraphEdge;
  /** Cuál de los dos extremos falta — puede faltar cualquiera, o los dos. */
  readonly extremos: readonly ("from" | "to")[];
}

/**
 * EL COMPROBADOR. Devuelve las aristas cuyo `from` o `to` no está entre los
 * nodos. Deliberadamente NO mira `alternatives`: ese caso se comprueba aparte
 * abajo, con su propia razón.
 */
function aristasColgadas(graph: CodeGraph): readonly AristaColgada[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const malas: AristaColgada[] = [];
  for (const edge of graph.edges) {
    const extremos: ("from" | "to")[] = [];
    if (!ids.has(edge.from)) extremos.push("from");
    if (!ids.has(edge.to)) extremos.push("to");
    if (extremos.length > 0) malas.push({ edge, extremos });
  }
  return malas;
}

/** Mensaje de fallo con lo que hace falta para arreglarlo: kind, provenance y los dos ids. */
function describir(malas: readonly AristaColgada[], tope = 10): string {
  const porKind = new Map<string, number>();
  for (const m of malas) porKind.set(m.edge.kind, (porKind.get(m.edge.kind) ?? 0) + 1);
  const resumen = [...porKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(", ");
  const ejemplos = malas
    .slice(0, tope)
    .map((m) => `  · [${m.edge.kind}/${m.edge.provenance}] falta ${m.extremos.join("+")}: ${m.edge.from} -> ${m.edge.to}`)
    .join("\n");
  return `${malas.length} arista(s) colgada(s) (${resumen}):\n${ejemplos}`;
}

describe("invariante del grafo: toda arista tiene sus dos extremos entre los nodos", () => {
  let graph: CodeGraph;

  beforeAll(async () => {
    let capturado: CodeGraph | null = null;
    await analyzeRepo({
      dir: FIXTURES_DIR,
      repoName: "fixtures-multi",
      limits: { maxFindings: "unlimited" },
      onGraph: (r) => {
        capturado = r.graph;
      },
    });
    expect(capturado, "`analyzeRepo` no entregó ningún grafo: el invariante no se comprobó sobre nada").not.toBeNull();
    graph = capturado!;
  }, 180_000);

  /* ── las tres guardas de no-vacuidad ─────────────────────────────────── */

  it("no es vacío: el árbol produce nodos y aristas de verdad", () => {
    expect(graph.nodes.length).toBeGreaterThan(100);
    expect(graph.edges.length).toBeGreaterThan(100);
  });

  it("no es vacío: aparecen varios `EdgeKind` distintos, no sólo la contención estructural", () => {
    const kinds = new Set<EdgeKind>(graph.edges.map((e) => e.kind));
    expect([...kinds].join(", ")).toContain("references");
    expect(
      kinds.size,
      `sólo ${kinds.size} kind(s) de arista en todo el árbol de fixtures: el invariante estaría comprobando casi nada`,
    ).toBeGreaterThanOrEqual(4);
  });

  it("el comprobador ENCUENTRA una arista colgada inyectada a mano (falla cuando tiene que fallar)", () => {
    const real = graph.edges[0]!;
    const inyectado: CodeGraph = {
      ...graph,
      edges: [...graph.edges, { ...real, to: "sym:archivo-que-no-existe.ts#Fantasma" }],
    };
    const malas = aristasColgadas(inyectado);
    expect(malas).toHaveLength(1);
    expect(malas[0]!.extremos).toEqual(["to"]);
    expect(describir(malas)).toContain("Fantasma");
  });

  /* ── EL INVARIANTE ───────────────────────────────────────────────────── */

  it("CERO aristas colgadas en el grafo del pipeline real", () => {
    const malas = aristasColgadas(graph);
    expect(malas.length, malas.length === 0 ? "" : describir(malas)).toBe(0);
  });

  /**
   * La MISMA pregunta, un paso más adentro. `CodeGraphEdge.alternatives`
   * (CONTRATO-F9.md §4.1) lleva los OTROS destinos posibles de una arista
   * `ambiguous`, y son ids de nodo igual que `to`. Un consumidor los usa
   * exactamente como usa `to` — `unused-symbol.ts` mete cada alternativa en
   * `unattributedUse` para descalificar candidatos —, así que una alternativa
   * colgada descalifica a un símbolo que no existe y deja de descalificar al
   * que sí. Medido al escribir esto: cero.
   */
  it("CERO alternativas colgadas: los destinos posibles de una arista ambigua también son nodos", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const malas: string[] = [];
    for (const edge of graph.edges) {
      for (const alt of edge.alternatives ?? []) {
        if (!ids.has(alt)) malas.push(`[${edge.kind}] ${edge.from} -> alternativa ${alt}`);
      }
    }
    expect(malas.length, malas.slice(0, 10).join("\n")).toBe(0);
  });

  /**
   * El invariante hermano, y por la misma razón: todo consumidor indexa los
   * nodos por id (`new Map(graph.nodes.map((n) => [n.id, n]))` aparece tal
   * cual en `projection.ts`, en `unused-symbol.ts` y en media docena más). Dos
   * nodos con el mismo id no son un error visible: el segundo PISA al primero
   * y el primero deja de existir para todo el que pregunte por id, mientras
   * sigue contándose en cualquier recorrido sobre `graph.nodes`.
   */
  it("los ids de nodo son únicos: nadie se pisa en el índice por id", () => {
    const vistos = new Set<string>();
    const repetidos: string[] = [];
    for (const n of graph.nodes) {
      if (vistos.has(n.id)) repetidos.push(n.id);
      else vistos.add(n.id);
    }
    expect(repetidos.length, repetidos.slice(0, 10).join(", ")).toBe(0);
  });
});
