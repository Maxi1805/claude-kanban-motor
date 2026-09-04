/**
 * A7/A8 (Ola 11b, frente A1) — LA COMPUERTA DE LOS HUECOS DE ARISTAS.
 *
 * Por qué existe: `graph/edge-coverage.test.ts` es la compuerta buena, pero
 * se saltea entera sin corpus en disco (`CK_CORPUS_DIR`), que es la situación
 * de esta ola y de cualquiera que no clone 8 repos. Los dos huecos que este
 * frente cerró (`imports` en cero en Ruby, `calls` en cero en C#/Java) se
 * pueden volver a abrir con un cambio de una línea en la cascada o en el
 * extractor, y nadie se enteraría hasta la próxima corrida con corpus.
 *
 * Qué mide: `analyzeRepo` REAL — el mismo camino de producción, sin mocks,
 * sin construir el grafo a mano — sobre una fixture MÍNIMA POR LENGUAJE
 * (`tests/fixtures/edge-emision/`) escrita con la forma real del lenguaje
 * (layout Maven en Java, `$LOAD_PATH` + `require_relative` en Ruby, CommonJS
 * puro en JS, namespace de bloque en C#), no con un caso de juguete. Cada
 * `expect` de abajo dio CERO antes del trabajo de esta ola — el número previo
 * está anotado en cada uno.
 *
 * Un repo por `analyzeRepo`, secuencial: son cuatro árboles de 2-4 archivos,
 * el costo real es cargar los wasm (cacheados por `code-analyzer.ts` dentro
 * del proceso), no analizar.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeRepo } from "../code-analyzer.js";
import type { CodeGraph } from "./types.js";

const FIXTURES = path.resolve(__dirname, "../../../../tests/fixtures/edge-emision");

async function edgeCountsByKind(dir: string): Promise<Record<string, number>> {
  let graph: CodeGraph | null = null;
  await analyzeRepo({
    dir: path.join(FIXTURES, dir),
    repoName: `edge-emision-${dir}`,
    limits: { maxFindings: "unlimited" },
    onGraph: (result) => {
      graph = result.graph;
    },
  });
  const out: Record<string, number> = {};
  for (const e of (graph as CodeGraph | null)?.edges ?? []) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}

describe("huecos de aristas — A7 (`imports`) y A8 (`calls`)", () => {
  it("ruby: `require` / `require_relative` emiten `imports` (antes de la Ola 11b: 0 — el extractor estaba gateado por la capacidad `imports`, que Ruby no tiene porque no tiene NODO de import)", async () => {
    const counts = await edgeCountsByKind("ruby");
    expect(counts.imports ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it("java: `import com.foo.Bar;` emite `imports` y una llamada desnuda a un método hermano emite `calls` (antes de la Ola 11b: imports ya andaba desde la Ola 9; `calls` estaba en 0)", async () => {
    const counts = await edgeCountsByKind("java");
    expect(counts.imports ?? 0).toBeGreaterThan(0);
    expect(counts.calls ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it("csharp: `using` de TIPO emite `imports` y las llamadas desnudas a métodos hermanos emiten `calls` (antes de la Ola 11b: los dos en 0)", async () => {
    const counts = await edgeCountsByKind("csharp");
    expect(counts.calls ?? 0).toBeGreaterThan(0);
    // El `using` de NAMESPACE pelado sigue sin resolver por diseño (relación
    // 1-a-N, ver el docstring de `dottedSuffixTarget` en `imports-target.ts`)
    // — ya NO hay waiver en `tests/golden/edge-coverage-waivers.json` para
    // `(imports, csharp)`: se borró esta ola porque la celda ya emite
    // `imports > 0` (newtonsoft-json real: los `using`/`using static`/`using
    // Alias =` que nombran un TIPO resuelven). Lo que se fija acá es que las
    // formas 1-a-1 (`using static X.Y.Tipo;`, `using Alias = X.Y.Tipo;`) sí.
    expect(counts.imports ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it("javascript CommonJS: `require(...)` emite `imports` sin un solo `import` ES en el árbol", async () => {
    const counts = await edgeCountsByKind("js-commonjs");
    expect(counts.imports ?? 0).toBeGreaterThan(0);
  }, 120_000);
});
