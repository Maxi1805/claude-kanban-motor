/**
 * code-analyzer tests, over throwaway fixture trees under os.tmpdir().
 *
 * Deliberately NOT run against the user's real repos here (that happens once,
 * by hand, as part of verifying the fix) — a unit test needs inputs it fully
 * controls, so each detector gets a minimal fixture built to trip exactly one
 * threshold, plus one built to stay just under it.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeRepo, DEFAULT_ANALYZE_LIMITS } from "./code-analyzer.js";

/** Write `files` (relative path → contents) under a fresh tmpdir, return its root. */
async function makeFixture(files: Record<string, string>): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ck-code-test-")));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

/** Two functions, same shape, different identifiers — a structural clone. */
const DUPLICATED_PAIR = `
function processOrderAlpha(input) {
  let total = 0;
  if (input.valid) {
    total = input.amount * 2;
  } else {
    total = 0;
  }
  for (let i = 0; i < input.items.length; i++) {
    total += input.items[i].price;
  }
  return total;
}

function processOrderBeta(data) {
  let sum = 0;
  if (data.valid) {
    sum = data.amount * 2;
  } else {
    sum = 0;
  }
  for (let j = 0; j < data.items.length; j++) {
    sum += data.items[j].price;
  }
  return sum;
}
`;

/** Two tiny one-line functions — identical shape, but far below the size floor. */
const TRIVIAL_PAIR = `
function addOne(x) { return x + 1; }
function addTwo(y) { return y + 1; }
`;

/** A 6-way if/else-if ladder — a type switch in disguise. */
const CONDITIONAL_CHAIN = `
function classify(status) {
  if (status === "a") {
    return 1;
  } else if (status === "b") {
    return 2;
  } else if (status === "c") {
    return 3;
  } else if (status === "d") {
    return 4;
  } else if (status === "e") {
    return 5;
  } else {
    return 0;
  }
}
`;

/** A function padded past the long-function line threshold with plain statements. */
function longFunctionSource(): string {
  const body = Array.from({ length: 50 }, (_, i) => `  const v${i} = ${i} + step;`).join("\n");
  return `function doManyThings(step) {\n${body}\n  return v0;\n}\n`;
}

/**
 * `n` distinct long-function findings in ONE file — enough to saturate
 * `DEFAULT_ANALYZE_LIMITS.maxFindings`, and (F5) enough to exercise Nivel 2
 * (archivo+kind) de `detect/grouping.ts`: todas comparten archivo y kind, así
 * que a partir de `GROUP_MIN` colapsan a UN grupo — es exactamente lo que el
 * describe "F5 — Contrato 2" de más abajo ejercita a propósito. Para
 * fixtures que necesiten seguir saturando SIN que la agrupación colapse
 * nada (los tests de paginación/ranking), usar `manyLongFunctionsAcrossFiles`.
 */
function manyLongFunctions(n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const body = Array.from({ length: 50 }, (_, j) => `  const v${j} = ${j} + step;`).join("\n");
    return `function doManyThings${i}(step) {\n${body}\n  return v0;\n}\n`;
  }).join("\n");
}

/**
 * OLA AC — `n` funciones largas EN UN MISMO ARCHIVO y **divididas en pasos**
 * (bloques separados por líneas en blanco). La diferencia con
 * `manyLongFunctions` no es cosmética: el único `required` de Extract Method
 * (`extract-method.ts#variosPasosSeparados`) exige que el cuerpo tenga varios
 * bloques marcados por el propio autor, así que la fixture de un solo bloque
 * agrupa pero NO produce ni una hipótesis — inútil para ejercitar qué hace la
 * agrupación con las hipótesis de los miembros.
 */
function manyLongFunctionsEnPasos(n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const paso = (p: number): string =>
      Array.from({ length: 15 }, (_, j) => `  const v${String(p)}_${String(j)} = ${String(j)} + step;`).join("\n");
    return `function haceVariosPasos${String(i)}(step) {\n${paso(0)}\n\n${paso(1)}\n\n${paso(2)}\n\n${paso(3)}\n\n  return v0_0;\n}\n`;
  }).join("\n");
}

/**
 * F5 — `n` files, cada uno con exactamente UNA función larga: ningún
 * `(archivo, kind)` llega nunca a `GROUP_MIN`, así que cada `long-function`
 * sigue siendo su propio grupo — es la fixture para ejercitar paginación y
 * ranking (I1/I2) sin que la agrupación (que se ejercita aparte, con
 * `manyLongFunctions`) se interponga.
 */
function manyLongFunctionsAcrossFiles(n: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const body = Array.from({ length: 50 }, (_, j) => `  const v${j} = ${j} + step;`).join("\n");
    files[`src/many${i}.js`] = `function doManyThings${i}(step) {\n${body}\n  return v0;\n}\n`;
  }
  return files;
}

/**
 * F4 — DEFECTO A2: un par de funciones estructuralmente idénticas (mismo
 * patrón que `DUPLICATED_PAIR`, pero con suficientes líneas para forzar
 * `duplication`'s severidad — `Math.min(100, group.length * 12 + lines *
 * 1.5)` en `detect/inter-file/duplication.ts` — a exactamente 100 con un
 * grupo de 2 copias (>= 51 líneas de cuerpo alcanza; 110 deja margen).
 */
function bigDuplicatedPair(): string {
  const body = (prefix: string) =>
    Array.from({ length: 110 }, (_, i) => `  ${prefix}${i} = ${prefix}${i} + 1;`).join("\n");
  const fn = (name: string, prefix: string) =>
    `function ${name}(input) {\n  let total = 0;\n  if (input.valid) {\n${body(prefix)}\n  } else {\n    total = 0;\n  }\n  return total;\n}\n`;
  return fn("processAlpha", "a") + "\n" + fn("processBeta", "b");
}

/**
 * F4 — DEFECTO A2: una única función (sin par: no genera `duplication`) lo
 * bastante larga para forzar `long-function`'s severidad —
 * `Math.min(100, 20 + lines / 2)` en `detect/intra-function/long-function.ts`
 * — a exactamente 100 (>= 160 líneas alcanza; 320 deja margen).
 */
function bigLongFunctionSource(): string {
  const body = Array.from({ length: 320 }, (_, i) => `  const v${i} = ${i} + step;`).join("\n");
  return `function doManyThings(step) {\n${body}\n  return v0;\n}\n`;
}

/**
 * A single function nested `depth` levels deep in bare `if (x) { ... }`, with
 * no indentation. Indenting per level would make the source O(depth^2) bytes
 * and trip `MAX_FILE_BYTES` long before the AST is deep enough to matter —
 * flat text keeps the file O(depth) while the AST nesting (what actually
 * stresses the walk) is unchanged.
 */
function deeplyNestedSource(depth: number): string {
  let src = "function pathological(x) {\n";
  for (let i = 0; i < depth; i++) src += "if (x) {\n";
  src += "return x;\n";
  for (let i = 0; i < depth; i++) src += "}\n";
  src += "}\n";
  return src;
}

describe("analyzeRepo", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("detects structural duplication even with renamed identifiers", async () => {
    root = await makeFixture({ "src/orders.js": DUPLICATED_PAIR });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    const dup = result.findings.find((f) => f.kind === "duplication");
    expect(dup).toBeDefined();
    expect(dup?.locations).toHaveLength(2);
    // La sugerencia depende del contexto medido, así que lo que se afirma es
    // que llega una refactorización concreta, no un patrón fijo.
    expect(dup?.advice?.primary.kind).toBe("refactorizacion");
    expect(dup?.advice?.primary.name).toBeTruthy();
    expect(dup?.advice?.primary.source).toMatch(/^https?:\/\//);
  });

  it("does not flag fragments below the clone size floor", async () => {
    root = await makeFixture({ "src/tiny.js": TRIVIAL_PAIR });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    expect(result.findings.filter((f) => f.kind === "duplication")).toHaveLength(0);
  });

  it("flags a long if/else-if ladder as a conditional chain", async () => {
    root = await makeFixture({ "src/classify.js": CONDITIONAL_CHAIN });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.locations[0]?.symbol).toBe("classify");
    expect(chain?.metric.value).toBeGreaterThanOrEqual(5);
  });

  it("flags a function past the long-function line threshold", async () => {
    root = await makeFixture({ "src/long.js": longFunctionSource() });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    const long = result.findings.find((f) => f.kind === "long-function");
    expect(long).toBeDefined();
    expect(long?.locations[0]?.symbol).toBe("doManyThings");
  });

  it("excludes test directories and test-named files from analysis", async () => {
    root = await makeFixture({
      "spec/orders_spec.rb": DUPLICATED_PAIR, // parked under spec/: the DIRECTORY alone should skip it
      "src/orders.test.js": DUPLICATED_PAIR,
      "src/orders_real.js": "function keep() { return 1; }\n",
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    expect(result.findings.filter((f) => f.kind === "duplication")).toHaveLength(0);
    expect(result.analysedFiles).toBe(1);
    for (const finding of result.findings) {
      for (const location of finding.locations) {
        expect(location.file).not.toMatch(/spec\/|\.test\./);
      }
    }
  });

  it("survives a pathologically nested file without losing other files' findings", async () => {
    // Confirmed depth 5000 alone is enough to overflow a recursive walk on
    // the main thread (the process the server actually runs on); this uses
    // 20000 for margin, alongside a healthy file whose finding must survive.
    root = await makeFixture({
      "src/healthy.js": longFunctionSource(),
      "src/pathological.js": deeplyNestedSource(20000),
    });

    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    expect(result.analysedFiles).toBe(2);
    // F1 hygiene fix: the 4 mutually-exclusive `continue`s in `functionFindings`
    // are gone, so `pathological`'s 40000+ lines now ALSO earn it its own
    // "long-function" finding alongside "complexity" — correct, since both
    // metrics were always true of it; it no longer "steals" the healthy
    // function's finding kind via early exit. What this test actually
    // guards (the healthy file's finding is not lost/starved by the
    // pathological one) is asserted by symbol name, not by "the only match".
    const long = result.findings.find((f) => f.kind === "long-function" && f.locations[0]?.symbol === "doManyThings");
    expect(long?.locations[0]?.symbol).toBe("doManyThings");
    // TIMEOUT EXPLÍCITO, no aflojar una aserción. Lo que este caso afirma es
    // que un archivo de 20.000 niveles no tumba el proceso ni se lleva puesto
    // el hallazgo del archivo sano — nunca fue una medición de velocidad. Pero
    // analizar 40.000+ líneas patológicas cuesta ~2,2 s aislado, contra el
    // default de 5 s de vitest: 2,2x de margen. Con el caché de análisis
    // caliente la suite entera pasó de ~10 min a 38 s, y esos 38 s son 182
    // archivos de test corriendo casi todos a la vez: la contención de CPU se
    // come el margen y este caso empezó a fallar por TIMEOUT (5.079 ms) en la
    // corrida caliente, verde en la fría y verde corriendo el archivo solo
    // (2.231 ms). Es decir: hacer la compuerta rápida destapó el flake. 30 s da
    // margen de sobra sin volver el caso inútil — si alguna vez tarda 30 s, eso
    // SÍ es una regresión de verdad y tiene que fallar.
  }, 30_000);

  it("is deterministic: same input yields the same findings in the same order", async () => {
    root = await makeFixture({
      "src/orders.js": DUPLICATED_PAIR,
      "src/classify.js": CONDITIONAL_CHAIN,
      "src/long.js": longFunctionSource(),
    });

    const first = await analyzeRepo({ dir: root, repoName: "fixture" });
    const second = await analyzeRepo({ dir: root, repoName: "fixture" });

    expect(second).toEqual(first);
  });
});

/**
 * F2 — `nesting`'s two asymmetries (see `walkFile`'s docstring in
 * code-analyzer.ts): (1) entering a function used to reset it to 0 with
 * nothing restoring the enclosing scope's value on exit, so cognitive
 * complexity depended on the TEXTUAL ORDER of otherwise-identical code; (2)
 * the entry-side increment was gated on `branchNodes ∩ nestingNodes` while
 * the exit-side decrement fired for all of `nestingNodes` — a strict
 * superset (a `switch` container nests but isn't itself a branch) — so a
 * switch container decremented depth it had never added.
 *
 * These fixtures pin BOTH down as regressions: same shape, different
 * textual order (closure before vs. after a nested `if` chain) must yield
 * the same `cognitive` score; and a version with one MORE branch (a switch)
 * must never score LOWER than one without it.
 */
async function readCognitive(root: string): Promise<Record<string, Record<string, number>>> {
  let captured: readonly { path: string; functions: readonly { name: string; cognitive: number }[] }[] = [];
  await analyzeRepo({
    dir: root,
    repoName: "fixture",
    onFacts: (facts) => {
      captured = facts as unknown as typeof captured;
    },
  });
  const byFile: Record<string, Record<string, number>> = {};
  for (const file of captured) {
    byFile[file.path] = {};
    for (const fn of file.functions) byFile[file.path]![fn.name] = fn.cognitive;
  }
  return byFile;
}

describe("F2 — el anidamiento es una propiedad del recorrido, no un contador global mutable", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("una closure ANTES o DESPUÉS del mismo bloque anidado da la MISMA complejidad cognitiva (independiente del orden textual)", async () => {
    root = await makeFixture({
      "src/closureFirst.js": `
function closureFirst(xs) {
  let n = 0;
  if (xs.length > 0) {
    const g = function (y) {
      if (y > 0) {
        return 1;
      }
      return 0;
    };
    n += g(1);
    if (n > 0) {
      if (n > 1) {
        n++;
      }
    }
  }
  return n;
}
`,
      "src/closureLast.js": `
function closureLast(xs) {
  let n = 0;
  if (xs.length > 0) {
    if (n > 0) {
      if (n > 1) {
        n++;
      }
    }
    const g = function (y) {
      if (y > 0) {
        return 1;
      }
      return 0;
    };
    n += g(1);
  }
  return n;
}
`,
    });

    const byFile = await readCognitive(root);
    const first = byFile["src/closureFirst.js"]!["closureFirst"];
    const last = byFile["src/closureLast.js"]!["closureLast"];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(first).toBe(last);
  });

  it("un switch que agrega una rama MÁS nunca da complejidad cognitiva MENOR que la misma función sin switch", async () => {
    root = await makeFixture({
      "src/noSwitch.js": `
function noSwitch(x) {
  let n = 0;
  if (x > 0) {
    if (n > 0) {
      if (n > 1) {
        n++;
      }
    }
  }
  return n;
}
`,
      "src/switchDrift.js": `
function switchDrift(x) {
  let n = 0;
  if (x > 0) {
    switch (x) {
      case 1:
        n = 1;
        break;
    }
    if (n > 0) {
      if (n > 1) {
        n++;
      }
    }
  }
  return n;
}
`,
    });

    const byFile = await readCognitive(root);
    const withoutSwitch = byFile["src/noSwitch.js"]!["noSwitch"];
    const withSwitch = byFile["src/switchDrift.js"]!["switchDrift"];
    expect(withoutSwitch).toBeDefined();
    expect(withSwitch).toBeDefined();
    // Antes del fix esto podía dar IGUAL o hasta MENOR (switchContainers
    // decrementaba `nesting` sin haberlo incrementado nunca): una rama de
    // más nunca puede costar menos.
    expect(withSwitch!).toBeGreaterThan(withoutSwitch!);
  });
});

describe("AnalyzeOptions.limits", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("por defecto (sin `limits`) el comportamiento es idéntico al de antes de esta opción: exactamente los defaults declarados", async () => {
    expect(DEFAULT_ANALYZE_LIMITS).toEqual({ maxFindings: 200 });
  });

  // F5 — CONTRATO-F5.md Contrato 2 §2.7: el test de prefijo EXACTO de
  // arriba (`code-analyzer.test.ts:225` en la Ola 4) comparaba la salida
  // "capped" por defecto contra un prefijo de la "unlimited" — pero ahora
  // `findings` son GRUPOS, no hallazgos crudos, y `manyLongFunctions` (una
  // fixture de N funciones EN UN SOLO ARCHIVO) colapsa a un puñado de
  // grupos por diseño (Nivel 2 — ver el describe de abajo), así que ya no
  // sirve para ejercitar la paginación: colapsaría a los mismos pocos
  // grupos sin importar cuántas funciones haya. `manyLongFunctionsAcrossFiles`
  // reemplaza esa fixture para ESTE propósito: un archivo por función, así
  // que ningún `(archivo, kind)` llega nunca a `GROUP_MIN` y cada
  // `long-function` sigue siendo su propio grupo — permite seguir
  // saturando el default (200) sin que la agrupación se interponga.
  it(
    "I1 — la página es un prefijo del ranking completo, para TODO k ∈ {1, 10, 100, groupsTotal} (reemplaza el prefijo-exacto-de-severidad de la Ola 4)",
    async () => {
      root = await makeFixture(manyLongFunctionsAcrossFiles(DEFAULT_ANALYZE_LIMITS.maxFindings + 10));

      const uncapped = await analyzeRepo({
        dir: root,
        repoName: "fixture",
        limits: { maxFindings: "unlimited" },
      });

      // La fixture realmente satura (si no, el test sería vacuo).
      expect(uncapped.findings.length).toBeGreaterThan(DEFAULT_ANALYZE_LIMITS.maxFindings);
      expect(uncapped.groupsTotal).toBe(uncapped.findings.length);

      for (const k of [1, 10, 100, uncapped.groupsTotal!]) {
        const page = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: k } });
        expect(page.findings, `k=${k}`).toEqual(uncapped.findings.slice(0, k));
        expect(page.page, `k=${k}`).toEqual({
          offset: 0,
          limit: k,
          hasMore: uncapped.groupsTotal! > k,
        });
      }
    },
    // F3: una corrida de `analyzeRepo` sobre 210 archivos ya andaba cerca del
    // timeout default de 5000ms antes de esta ola; este test hace CINCO
    // corridas completas (una "unlimited" + cuatro páginas) sobre la MISMA
    // fixture — se le da mucho más margen, como ya hace `resolve-gate.test.ts`
    // para su propia corrida real y lenta.
    60_000,
  );

  it(
    "I2 — paginación contigua (offset, limit) reconstruye el ranking completo sin huecos ni repetidos",
    async () => {
      root = await makeFixture(manyLongFunctionsAcrossFiles(23));

      const uncapped = await analyzeRepo({
        dir: root,
        repoName: "fixture",
        limits: { maxFindings: "unlimited" },
      });
      const total = uncapped.groupsTotal!;
      expect(total).toBeGreaterThan(0);

      const pageSize = 7;
      const reconstructed: unknown[] = [];
      for (let offset = 0; offset < total; offset += pageSize) {
        const page = await analyzeRepo({
          dir: root,
          repoName: "fixture",
          limits: { maxFindings: pageSize, offset },
        });
        reconstructed.push(...page.findings);
      }

      expect(reconstructed).toEqual(uncapped.findings);
    },
    30_000,
  );

  it("I3 — la agrupación no pierde nada: Σ memberCount === findingsTotal, y Σ totalByKind === findingsTotal", async () => {
    root = await makeFixture({
      "src/many.js": manyLongFunctions(25), // colapsa (Nivel 2 + guardia degenerada) — ver el describe de Contrato 2
      "src/orders.js": DUPLICATED_PAIR, // no colapsa: por debajo de GROUP_MIN en su archivo
      "src/classify.js": CONDITIONAL_CHAIN,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    const summedMemberCount = result.findings.reduce((acc, f) => acc + (f.memberCount ?? 1), 0);
    expect(summedMemberCount).toBe(result.findingsTotal);

    const summedByKind = Object.values(result.totalByKind ?? {}).reduce((acc, n) => acc + n, 0);
    expect(summedByKind).toBe(result.findingsTotal);
  });

  it("`0` es un límite válido: significa 'ninguno'", async () => {
    root = await makeFixture({ "src/long.js": longFunctionSource() });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: 0 } });
    expect(result.findings).toHaveLength(0);
  });

  it("un valor no entero, negativo o NaN revienta ruidosamente en vez de medir mal en silencio", async () => {
    root = await makeFixture({ "src/long.js": longFunctionSource() });
    await expect(analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: -1 } })).rejects.toThrow(
      TypeError,
    );
    await expect(analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: 1.5 } })).rejects.toThrow(
      TypeError,
    );
    await expect(analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: NaN } })).rejects.toThrow(
      TypeError,
    );
  });
});

describe("F5 — Contrato 2: agrupación por causa raíz y guardia de grupo degenerado", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("por debajo de GROUP_MIN (4 en el mismo archivo) NO colapsa: 4 hallazgos siguen siendo 4 filas", async () => {
    root = await makeFixture({ "src/many.js": manyLongFunctions(4) });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    const longFunctionRows = result.findings.filter((f) => f.kind === "long-function");
    expect(longFunctionRows).toHaveLength(4);
    for (const row of longFunctionRows) {
      expect(row.memberCount ?? 1).toBe(1);
      expect(row.degenerateGroup).toBeUndefined();
    }
  });

  it("Nivel 2 (archivo, kind) colapsa desde GROUP_MIN: 10 long-function en un archivo son UNA fila con memberCount 10, no degenerada", async () => {
    root = await makeFixture({ "src/many.js": manyLongFunctions(10) });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    const longFunctionRows = result.findings.filter((f) => f.kind === "long-function");
    expect(longFunctionRows).toHaveLength(1);
    expect(longFunctionRows[0]!.memberCount).toBe(10);
    expect(longFunctionRows[0]!.degenerateGroup).toBeUndefined();
    // La severidad/título siguen siendo los del REPRESENTANTE, sin fabricar un agregado.
    expect(longFunctionRows[0]!.severity).toBeGreaterThan(0);
  });

  it("OLA Q, F2 — el `detail` de un grupo NO degenerado habla de TODOS sus miembros, no sólo del representante", async () => {
    // Cinco funciones con bandera booleana en el mismo archivo:
    // `boolean-flag-param` nombra la función en su `detail`, así que los cinco
    // miembros del grupo de Nivel 2 traen textos distintos — que es
    // exactamente lo que la tarjeta tiraba (pedido de P10, caso medido en
    // preact: la tarjeta "5 fragmentos…" se comía un `verdadero` juzgado).
    const fn = (nombre: string, param: string) =>
      `function ${nombre}(${param}, bandera) {\n  if (bandera) {\n    ${param} = ${param} + 1;\n  }\n  console.log(${param});\n  return ${param};\n}\n`;
    root = await makeFixture({
      "src/flags.js": [fn("uno", "a"), fn("dos", "b"), fn("tres", "c"), fn("cuatro", "d"), fn("cinco", "e")].join("\n"),
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    const fila = result.findings.find((f) => f.kind === "boolean-flag-param" && (f.memberCount ?? 1) > 1);
    expect(fila).toBeDefined();
    expect(fila!.degenerateGroup).toBeUndefined();
    expect(fila!.detail).toContain(`Este grupo reúne ${String(fila!.memberCount)} hallazgos`);
    // El texto del representante NO se pierde: sigue al principio.
    expect(fila!.detail.startsWith("Este grupo")).toBe(false);
    // Y el tramo agregado tiene presupuesto: la celda no crece sin límite.
    expect(fila!.detail.length).toBeLessThan(4000);
  });

  it("OLA Q, F2 — cuando el `detail` de los miembros es el MISMO texto fijo, se nombra a cada uno pero el párrafo NO se repite", async () => {
    root = await makeFixture({ "src/many.js": manyLongFunctions(10) });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    const row = result.findings.filter((f) => f.kind === "long-function")[0]!;
    expect(row.memberCount).toBe(10);
    expect(row.detail).toContain("Este grupo reúne 10 hallazgos");
    // `long-function` tiene `detail` fijo: lo que distingue a un miembro de
    // otro es su `title`. Repetir el párrafo 10 veces no sería evidencia.
    expect(row.detail.split("Una función larga suele estar haciendo")).toHaveLength(2);
  });

  it("OLA AC, AC1 — las `hypotheses` de un grupo son las de TODOS sus miembros, no las del representante", async () => {
    // 10 funciones largas EN PASOS en un archivo: Nivel 2 las colapsa en UNA
    // fila y cada una trae su propia hipótesis de Extract Method, apuntando a
    // SU función. Hasta esta ola la fila publicaba UNA sola —la del
    // representante— y las otras nueve se calculaban y se tiraban.
    // (`manyLongFunctions` no sirve acá: sus cuerpos son un solo bloque sin
    // líneas en blanco, y el `required` de Extract Method exige que el propio
    // autor haya marcado los cortes — ver `extract-method.ts`.)
    root = await makeFixture({ "src/many.js": manyLongFunctionsEnPasos(10) });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    const row = result.findings.filter((f) => f.kind === "long-function")[0]!;
    expect(row.memberCount).toBe(10);
    const hipotesis = row.hypotheses ?? [];
    expect(hipotesis.length).toBeGreaterThan(1);

    // Y no son la misma repetida: cada una manda a leer OTRO código. Ésa es
    // la propiedad que separa "producto perdido" de "ruido duplicado", y es
    // exactamente la intención que verifica `hypothesisIdentityKey`.
    const identidades = new Set(
      hipotesis.map((h) =>
        JSON.stringify([
          h.pattern,
          h.state,
          h.places.map((p) => `${p.file}:${String(p.startLine)}-${String(p.endLine)}:${p.symbol ?? ""}:${p.role}`).sort(),
        ]),
      ),
    );
    expect(identidades.size).toBe(hipotesis.length);
  });

  it("OLA AC, AC1 — ninguna fila publica dos veces la MISMA hipótesis sobre el MISMO código", async () => {
    // La otra mitad del contrato: sumar las de los miembros no puede
    // introducir repeticiones. Se comprueba sobre TODA la salida —no sólo
    // sobre el grupo que interesa— porque una llave de deduplicación mal
    // elegida se nota justo en las filas que nadie estaba mirando.
    root = await makeFixture({
      "src/many.js": manyLongFunctionsEnPasos(10),
      "src/orders.js": DUPLICATED_PAIR,
      "src/classify.js": CONDITIONAL_CHAIN,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    for (const f of result.findings) {
      const claves = (f.hypotheses ?? []).map((h) =>
        JSON.stringify([
          h.pattern,
          h.state,
          h.places.map((p) => `${p.file}:${String(p.startLine)}-${String(p.endLine)}:${p.symbol ?? ""}:${p.role}`).sort(),
        ]),
      );
      expect(new Set(claves).size).toBe(claves.length);
    }
  });

  it("findingsTotal/groupsTotal/totalByKind describen la población real, no la página", async () => {
    root = await makeFixture({ "src/many.js": manyLongFunctions(25) });
    const result = await analyzeRepo({ dir: root, repoName: "fixture", limits: { maxFindings: "unlimited" } });

    expect(result.findingsTotal).toBeGreaterThan(result.groupsTotal!);
    expect(result.totalByKind?.["long-function"]).toBe(25);
    expect(result.page).toEqual({ offset: 0, limit: result.findings.length, hasMore: false });
    expect(result.truncated).toBe(false);
  });
});

describe("F3 — FileFacts.symbols/.references y AnalyzeOptions.onFacts", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("analyzeFile (vía onFacts) agrega symbols/references por archivo, para el grafo de código", async () => {
    root = await makeFixture({
      "src/shape.js": `
class Shape {
  area(x) {
    return helper(x);
  }
}
function helper(x) {
  return x * 2;
}
`,
    });

    let captured: unknown[] | null = null;
    await analyzeRepo({
      dir: root,
      repoName: "fixture",
      onFacts: (facts) => {
        captured = facts as unknown[];
      },
    });

    expect(captured).not.toBeNull();
    const facts = captured as unknown as {
      path: string;
      symbols: { name: string }[];
      references: { name: string }[];
    }[];
    expect(facts).toHaveLength(1);
    expect(facts[0]!.path).toBe("src/shape.js");
    // Al menos las dos unidades declaradas del archivo.
    expect(facts[0]!.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(["Shape", "area", "helper"]));
    // Al menos un candidato a referencia real (la llamada a `helper` dentro de `area`).
    expect(facts[0]!.references.map((r) => r.name)).toEqual(expect.arrayContaining(["helper"]));
  });

  it("onFacts ausente no cambia el comportamiento: analyzeRepo funciona igual sin él", async () => {
    root = await makeFixture({ "src/shape.js": "function helper(x) { return x; }\n" });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    expect(result.repoName).toBe("fixture");
    expect(result.analysedFiles).toBe(1);
  });

  it("onFacts recibe la lista completa en el mismo orden que collectFiles (path.localeCompare)", async () => {
    root = await makeFixture({
      "src/z.js": "function z() {}",
      "src/a.js": "function a() {}",
    });

    let paths: string[] = [];
    await analyzeRepo({
      dir: root,
      repoName: "fixture",
      onFacts: (facts) => {
        paths = facts.map((f) => f.path);
      },
    });

    expect(paths).toEqual(["src/a.js", "src/z.js"]);
  });
});

describe("F4 — DEFECTO A1: el grafo real llega a los detectores inter-file `needsGraph`", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("dependency-cycle/orphan-file/unused-symbol dejan de reportar `sin-grafo` y `orphan-file` encuentra el archivo aislado", async () => {
    // `src/lib.js`/`src/main.js` se referencian entre sí (cruzan archivo);
    // `src/isolated.js` no referencia a nadie y nadie lo referencia a él —
    // exactamente el caso que `orphan-file` (`needsGraph: true`) debería
    // reportar UNA VEZ que `repo.graph` deje de ser `null`.
    root = await makeFixture({
      "src/lib.js": "function helper(x) {\n  return x + 1;\n}\nmodule.exports = { helper };\n",
      "src/main.js": "const { helper } = require('./lib');\nfunction run(x) {\n  return helper(x);\n}\nmodule.exports = { run };\n",
      "src/isolated.js": "function isolatedFn() {\n  return 42;\n}\n",
    });

    const result = await analyzeRepo({ dir: root, repoName: "fixture" });

    const graphDetectorIds = ["dependency-cycle", "orphan-file", "unused-symbol"];
    const graphCoverage = (result.coverage ?? []).filter((c) => graphDetectorIds.includes(c.detectorId));
    expect(graphCoverage).toHaveLength(3);
    for (const row of graphCoverage) {
      expect(row.status).not.toBe("sin-grafo");
    }

    const orphan = result.findings.find((f) => f.kind === "orphan-file");
    expect(orphan).toBeDefined();
    expect(orphan?.locations[0]?.file).toBe("src/isolated.js");
  });

  it("onGraph (mismo patrón que onFacts) entrega el CodeGraph recién construido, sin que el caller lo reconstruya", async () => {
    root = await makeFixture({
      "src/lib.js": "function helper(x) {\n  return x + 1;\n}\nmodule.exports = { helper };\n",
      "src/main.js": "const { helper } = require('./lib');\nfunction run(x) {\n  return helper(x);\n}\nmodule.exports = { run };\n",
    });

    let captured: { graph: { nodes: readonly unknown[]; edges: readonly unknown[] }; buildMs: number } | null = null;
    await analyzeRepo({
      dir: root,
      repoName: "fixture",
      onGraph: (result) => {
        captured = result;
      },
    });

    expect(captured).not.toBeNull();
    expect(captured!.graph.nodes.length).toBeGreaterThan(0);
    expect(captured!.graph.edges.length).toBeGreaterThan(0);
    expect(captured!.buildMs).toBeGreaterThanOrEqual(0);
  });

  it("onGraph ausente no cambia el comportamiento: analyzeRepo sigue construyendo el grafo internamente (build frío por defecto)", async () => {
    root = await makeFixture({ "src/isolated.js": "function isolatedFn() { return 1; }\n" });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const orphanCoverage = (result.coverage ?? []).find((c) => c.detectorId === "orphan-file");
    expect(orphanCoverage?.status).not.toBe("sin-grafo");
  });
});

describe("F4 — DEFECTO A2 / F5: desempate determinístico en la agregación final", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it(
    "un `duplication` (inter-file) empatado en SEVERIDAD con un `long-function` (intra-file) NO se ordena por orden de llegada: el orden final sigue `score`, no `severity`",
    async () => {
      // Antes de F4: `allFindings = [...perFileFindings, ...interFile.findings]`
      // sin desempate, y `Array.prototype.sort` es estable — así que un
      // empate de SEVERIDAD se resolvía SIEMPRE a favor de quien llegó
      // primero (`perFileFindings`, siempre antes que `interFile.findings`),
      // nunca al revés. F4 arregló ESE bug con un desempate por `Finding.id`.
      //
      // F5 (CONTRATO-F5.md §1.6) va más allá: el criterio de orden ya no es
      // `severity` sino `score` (§1.1-1.6 — comparar severidad CRUDA entre
      // `duplication` y `long-function` es exactamente el sesgo medido que
      // esa tarea corrige: dos escalas de detectores distintos no son
      // comparables aunque coincidan en número). Acá `src/dup.js` produce un
      // `duplication` a severidad 100 (`bigDuplicatedPair`) y, por separado,
      // `src/long.js` produce un `long-function` TAMBIÉN a severidad 100
      // (`bigLongFunctionSource`) — el empate de `severity` que F4 probaba
      // sigue existiendo, pero ya no es lo que decide el orden.
      root = await makeFixture({
        "src/dup.js": bigDuplicatedPair(),
        "src/long.js": bigLongFunctionSource(),
      });

      const result = await analyzeRepo({
        dir: root,
        repoName: "fixture",
        limits: { maxFindings: "unlimited" },
      });

      const dup = result.findings.find((f) => f.kind === "duplication");
      const long = result.findings.find((f) => f.kind === "long-function");
      expect(dup?.severity).toBe(100);
      expect(long?.severity).toBe(100);
      // El empate de SEVERITY ya no implica empate de SCORE: `impact`/`reach`
      // (y, si aplica, cuántas otras instancias del mismo detector compiten
      // por el rango `R_sev` — acá hay varias `long-function` en el repo,
      // así que la de `src/long.js` es la PEOR de las suyas y `R_sev = 1.0`,
      // mientras que la `duplication` de `src/dup.js` es la ÚNICA de la
      // suya y `R_sev = 0.5` — ver `detect/ranking.ts`) los distinguen.
      expect(dup?.score).toBeDefined();
      expect(long?.score).toBeDefined();
      expect(dup?.score).not.toBe(long?.score);

      // LA PROPIEDAD QUE IMPORTA (lo que F4 arregló y F5 conserva): el orden
      // FINAL es exactamente el que predice `score` — nunca el orden de
      // llegada (`perFileFindings` antes que `interFile.findings`) ni la
      // severidad cruda. Se verifica de forma genérica, sin asumir cuál de
      // los dos "gana" (eso lo decide la fórmula, no este test): el que
      // tiene mayor `score` aparece antes en `result.findings`.
      const [higher, lower] = (dup!.score! > long!.score! ? [dup!, long!] : [long!, dup!]);
      expect(result.findings.indexOf(higher)).toBeLessThan(result.findings.indexOf(lower));

      // Invariante repo entero — ACTUALIZADA en Ola 7 (integración F1/F2/F3):
      // `detect/grouping.ts#byGroupRankDescThenId` ya NO ordena por `score`
      // global puro. Intercala por `detectorRank` (ronda: el mejor grupo de
      // CADA detector antes que el segundo mejor de cualquiera) para cerrar
      // el sesgo M2 — CONTRATO-F5.md §1.7, "el precio, explícito": un grupo
      // de score genuinamente menor puede preceder a uno de score mayor de
      // OTRO detector sólo por estar en una ronda más temprana. Esa reordena
      // es intencional y medida (ranking-acceptance.test.ts), así que la
      // vieja aserción "nadie con score menor precede a nadie con score
      // mayor, sin importar el detector" ya no es cierta por diseño y NO se
      // reafirma acá.
      //
      // Lo que sigue siendo cierto, y es lo que este test puede verificar sin
      // reimplementar `finalizeGroups`: DENTRO de un mismo `detectorId` el
      // orden de aparición en `result.findings` sigue siendo estrictamente
      // por `score` descendente (cada detector recorre sus propias rondas en
      // orden — ronda 0 antes que ronda 1 antes que ronda 2 — así que sus
      // propios hallazgos nunca se ven "adelantados" entre sí).
      const scoresByDetector = new Map<string, number[]>();
      for (const f of result.findings) {
        const detectorId = f.id ? f.id.split(":")[0]! : f.kind;
        const list = scoresByDetector.get(detectorId);
        if (list) list.push(f.score ?? 0);
        else scoresByDetector.set(detectorId, [f.score ?? 0]);
      }
      for (const [detectorId, scores] of scoresByDetector) {
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i - 1]!, `detector ${detectorId}, posición ${i - 1}→${i}`).toBeGreaterThanOrEqual(scores[i]!);
        }
      }
    },
    20_000,
  );
});

/**
 * `ladderLength`/`ladderInstantiatesTypes` (frente `conditional-chain`,
 * bug medido en el corpus de 8 lenguajes) — antes de este arreglo:
 *   1. Ruby: un `if/elsif/elsif/else` (4 peldaños reales) medía `chain=3` —
 *      la vía "arms directos" (pensada para `switch`) confundía el ÚNICO
 *      `elsif` que SÍ es hijo directo del `if` exterior con un `switch` de
 *      un solo brazo y cortaba ahí, un peldaño de menos, silenciosamente
 *      (nunca daba 0, así que nadie lo notó).
 *   2. Python: el mismo `if/elif/elif/else` (4 peldaños reales) medía
 *      `chain=2` SIEMPRE, sin importar cuántos `elif` hubiera — su gramática
 *      expone `elif_clause`/`elif_clause`/`else_clause` como HERMANOS
 *      directos del `if_statement` (campo `alternative` repetido), no
 *      anidados unos dentro de otros, y el viejo código sólo sabía seguir
 *      `childForFieldName` (siempre el PRIMERO) un salto.
 *   3. `chainInstantiates` (la variante que ancla Factory Method) daba
 *      `false` SIEMPRE que la escalera usara el envoltorio `else_clause`
 *      (TS/JS) — nunca alcanzaba `arms.length >= 2` porque nunca desenvolvía
 *      el envoltorio para contar los brazos reales. Medido en el corpus: 6
 *      hallazgos reales de `conditional-chain`, los 6 variante `ladder`,
 *      ninguno `instantiates` — exactamente la firma de este bug.
 */
describe("conditional-chain: largo real de la escalera y clasificación instantiates/ladder", () => {
  let root: string;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("javascript/typescript: una escalera envuelta en else_clause construye 5 tipos distintos ⇒ chainInstantiates (piso chainLength=5)", async () => {
    root = await makeFixture({
      "src/pick.ts": `
function pick(kind) {
  if (kind === "circle") {
    return new Circle();
  } else if (kind === "square") {
    return new Square();
  } else if (kind === "triangle") {
    return new Triangle();
  } else if (kind === "hexagon") {
    return new Hexagon();
  } else {
    return new Unknown();
  }
}
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.metric.value).toBe(5);
    expect(chain?.title).toMatch(/elige qué clase instanciar/);
    expect(chain?.hypotheses?.some((h) => h.pattern === "Factory Method")).toBe(true);
  });

  it("ruby: if/elsif/elsif/elsif/else anidado mide 5 peldaños reales, no 4 (el bug del brazo-directo confundido con switch)", async () => {
    root = await makeFixture({
      "src/pick.rb": `
def pick(kind)
  if kind == "circle"
    Circle.new
  elsif kind == "square"
    Square.new
  elsif kind == "triangle"
    Triangle.new
  elsif kind == "hexagon"
    Hexagon.new
  else
    Unknown.new
  end
end
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.metric.value).toBe(5);
    expect(chain?.title).toMatch(/elige qué clase instanciar/);
  });

  it("python: if/elif/elif/else FLAT (elif_clause/else_clause son hermanos, no anidados) mide 4 peldaños, no 2 fijo", async () => {
    root = await makeFixture({
      "src/pick.py": `
def pick(kind):
    if kind == "circle":
        return one()
    elif kind == "square":
        return two()
    elif kind == "triangle":
        return three()
    elif kind == "hexagon":
        return four()
    else:
        return five()
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    // 5 peldaños reales (if + 3 elif + else) — antes de este arreglo el
    // contador quedaba fijo en 2 sin importar cuántos `elif` hubiera.
    expect(chain?.metric.value).toBe(5);
  });

  it("javascript: switch/case cuenta los brazos directamente (no pasa por la caminata de `alternative`)", async () => {
    root = await makeFixture({
      "src/classify.js": `
function classify(status) {
  switch (status) {
    case "a": return 1;
    case "b": return 2;
    case "c": return 3;
    case "d": return 4;
    case "e": return 5;
    default: return 0;
  }
}
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.metric.value).toBeGreaterThanOrEqual(5);
  });

  /**
   * Java/C#/Python interponen un ÚNICO nodo envoltorio entre el contenedor
   * del switch/match y sus brazos reales (`switch_block`/`switch_body`/el
   * `body` del `match_statement` — confirmado por sonda directa) — a
   * diferencia de Go/Ruby, cuyos brazos son hijos DIRECTOS del contenedor.
   * Antes de este arreglo, un `switch` de 5+ brazos en CUALQUIERA de estos
   * tres lenguajes medía `chain=1` siempre (el envoltorio nunca se
   * desenvolvía), así que `conditional-chain` quedaba mudo sobre un
   * `switch`/`match` real en Java, C# y Python sin importar cuántos brazos
   * tuviera.
   */
  it("java: switch envuelto en switch_block cuenta los brazos reales, no queda en 1", async () => {
    root = await makeFixture({
      "src/Classify.java": `
class Classify {
  int classify(String status) {
    switch (status) {
      case "a": return 1;
      case "b": return 2;
      case "c": return 3;
      case "d": return 4;
      case "e": return 5;
      default: return 0;
    }
  }
}
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.metric.value).toBeGreaterThanOrEqual(5);
  });

  it("c#: switch envuelto en switch_body cuenta los brazos reales, no queda en 1", async () => {
    root = await makeFixture({
      "src/Classify.cs": `
class Classify {
  int Classify(string status) {
    switch (status) {
      case "a": return 1;
      case "b": return 2;
      case "c": return 3;
      case "d": return 4;
      case "e": return 5;
      default: return 0;
    }
  }
}
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.metric.value).toBeGreaterThanOrEqual(5);
  });

  it("python: match envuelto en su propio bloque `body` cuenta los brazos reales, no queda en 1", async () => {
    root = await makeFixture({
      "src/classify.py": `
def classify(status):
    match status:
        case "a":
            return 1
        case "b":
            return 2
        case "c":
            return 3
        case "d":
            return 4
        case "e":
            return 5
        case _:
            return 0
`,
    });
    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const chain = result.findings.find((f) => f.kind === "conditional-chain");
    expect(chain).toBeDefined();
    expect(chain?.metric.value).toBeGreaterThanOrEqual(5);
  });
});
