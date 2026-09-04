/**
 * El gate de cobertura por lenguaje — CONTRATO-F6.md Contrato 2 §2.3.
 *
 * "Ningún detector puede quedar mudo en un lenguaje sin una razón declarada."
 *
 * CUATRO bloques, a propósito (los dos últimos son de la Ola 11b — ver
 * abajo por qué hicieron falta):
 *
 *  1. `computeLanguageCoverage` puro, con detectores/muestras FALSOS — corre
 *     siempre, sin corpus, y prueba la LÓGICA de la compuerta (los casos
 *     habilitados + el catch-all) en aislamiento.
 *  1b. AUDITORÍA DEL REGISTRO REAL — sin corpus y sin `analyzeRepo`: que las
 *     declaraciones de silencio (`silentIn`, `needsEdges`) existan, sean
 *     legibles y no se puedan quitar sin que nada se ponga rojo.
 *  2. El corpus real de 8 repos — CONDICIONAL, mismo patrón EXACTO que
 *     `census-golden.test.ts`: sin `CK_CORPUS_DIR`, o si el repo no está en
 *     disco, o el SHA no coincide con `tests/golden/manifest.json`, el caso
 *     se `it.skip`-ea con el motivo en el nombre — `npx vitest run` tiene
 *     que quedar verde SIN el corpus en la máquina.
 *  3. `fixtures-multi` INCONDICIONAL — ancla el CONTENIDO de las celdas que
 *     esta ola convirtió de mudas en declaradas, contra la fixture que sí
 *     vive versionada en el repo.
 *
 * Los bloques 2 y 3 corren `scripts/language-coverage.mts` COMO SUBPROCESO,
 * una vez por repo (nunca `analyzeRepo` dos veces en este mismo proceso —
 * `web-tree-sitter` corrompe su caché de `require`, ver `census.ts`).
 *
 * ESTADO EN LA OLA 11b (frente B1, ítem D1 de PENDIENTES.md), medido en una
 * máquina SIN corpus, que es donde se trabaja:
 *
 *   - `silentIn` PASÓ A EXISTIR como campo declarado de `DetectorBase`.
 *     Durante cuatro olas fue una promesa que este archivo leía por
 *     duck-typing esperando a "otro agente"; nadie lo declaró nunca.
 *   - NINGÚN detector lo usa todavía, y eso es deliberado, no un olvido: hay
 *     tres mecanismos MEJORES y verificables por máquina (`needs`,
 *     `needsEdges`, `needsMetrics`) y esta ola cerró celdas con el segundo,
 *     no con texto libre. Ver el docstring de `DetectorBase.silentIn`.
 *   - El bloque 2 se saltea entero sin corpus, así que era el ÚNICO que medía
 *     algo y en la práctica no medía nada. De ahí los bloques 1b y 3.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  computeLanguageCoverage,
  LANGUAGES_MEASURED,
  renderAuditSummary,
  renderHeaderTable,
  verdictFor,
  type DetectorWithSilence,
  type RepoCoverageSample,
} from "./language-coverage.js";
import { DETECTORS } from "./registry.js";
import type { Detector } from "./types.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const WORKER_SCRIPT = path.join(ROOT, "scripts", "language-coverage.mts");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");

/* ────────────────────────────────────────────────────────────────────────
 * Bloque 1 — lógica pura, sin corpus. Detectores/muestras de juguete.
 * ──────────────────────────────────────────────────────────────────────── */

function fakeDetector(id: string, scope: Detector["scope"] = "intra-file"): Detector {
  return {
    id,
    kind: `${id}-kind`,
    title: id,
    scope,
    needs: [],
    thresholds: {},
    run: () => [],
  } as unknown as Detector;
}

describe("computeLanguageCoverage — lógica pura (CONTRATO-F6.md §2.3)", () => {
  it("caso 1: corrió con hallazgos ⇒ ok", () => {
    const d = fakeDetector("con-hallazgos");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { ruby: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "ruby", status: "corrio", unitsConsidered: 200, findings: 5 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["ruby"]);
    expect(report.violations).toEqual([]);
    expect(report.cells[0].findings).toBe(5);
  });

  it("caso 4 (EL HUECO): corrió sin hallazgos y SIN razón ⇒ mudo-sin-razon, rompe la compuerta", () => {
    const d = fakeDetector("mudo-sin-razon");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { ruby: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "ruby", status: "corrio", unitsConsidered: 200, findings: 0 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["ruby"]);
    expect(report.violations).toHaveLength(1);
    expect(verdictFor(report.violations[0])).toBe("mudo-sin-razon");
  });

  /* OLA 11b: `silentIn` es un campo DECLARADO de `DetectorBase` — este literal
   * ya no necesita `as` para compilar, que es la prueba de que el campo dejó
   * de leerse por duck-typing. */
  it("caso 4 con razón declarada (`silentIn`) ⇒ ok, aunque findings sea 0", () => {
    const d: DetectorWithSilence = { ...fakeDetector("mudo-con-razon"), silentIn: { ruby: "Ruby no tiene esta construcción — fixture: X" } };
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { ruby: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "ruby", status: "corrio", unitsConsidered: 200, findings: 0 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["ruby"]);
    expect(report.violations).toEqual([]);
    expect(report.cells[0].silenceReason).toMatch(/Ruby/);
  });

  it("caso 2: no-aplicable con missingCapabilities ⇒ ok", () => {
    const d = fakeDetector("no-aplicable");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { go: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "go", status: "no-aplicable", missingCapabilities: ["herencia"], unitsConsidered: 0, findings: 0 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["go"]);
    expect(report.violations).toEqual([]);
  });

  it("caso 5: lenguaje bajo el piso de medición ⇒ ok siempre, aunque mudo sin razón", () => {
    const d = fakeDetector("bajo-el-piso");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { tsx: { filesAnalysed: 19, lines: 1_500 } }, // bajo MEASUREMENT_FLOOR_FILES
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "tsx", status: "corrio", unitsConsidered: 19, findings: 0 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["tsx"]);
    expect(report.violations).toEqual([]);
    expect(report.cells[0].sampleInsufficient).toBe(true);
  });

  it("catch-all: `error` no es uno de los casos habilitados ⇒ rompe la compuerta", () => {
    const d = fakeDetector("con-error");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { java: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "java", status: "error", unitsConsidered: 0, findings: 0, error: "boom" }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java"]);
    expect(report.violations).toHaveLength(1);
  });

  /*
   * OLA 11b (frente B1, ítem D1) — las 6 celdas `presupuesto-agotado` del
   * registro. Ver el comentario largo de `verdictFor`: el estado se parte en
   * dos mitades que NO son la misma cosa, y la mitad que se acepta queda
   * contada aparte (`detectorsTruncado`) para que aceptarla no la esconda.
   */
  it("presupuesto-agotado CON hallazgos ⇒ ok — es la celda menos muda que existe, no una violación", () => {
    const d = fakeDetector("truncado");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { java: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "java", status: "presupuesto-agotado", unitsConsidered: 200, findings: 41 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java"]);
    expect(report.violations).toEqual([]);
    expect(verdictFor(report.cells[0])).toBe("ok");
  });

  it("presupuesto-agotado SIN hallazgos ⇒ SIGUE rompiendo: el truncamiento por severidad pudo cortar el lenguaje entero", () => {
    const d = fakeDetector("truncado-y-mudo");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { java: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "java", status: "presupuesto-agotado", unitsConsidered: 200, findings: 0 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java"]);
    expect(report.violations).toHaveLength(1);
    expect(verdictFor(report.violations[0])).toBe("estado-no-contemplado");
  });

  it("aceptar el truncamiento NO lo esconde: queda contado en `detectorsTruncado` de la cabecera y en la tabla", () => {
    const d = fakeDetector("truncado");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { java: { filesAnalysed: 200, lines: 20_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "java", status: "presupuesto-agotado", unitsConsidered: 200, findings: 41 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java"]);
    expect(report.headers[0].detectorsTruncado).toBe(1);
    expect(report.headers[0].detectorsOtroIncumplimiento).toBe(0);
    expect(renderHeaderTable(report.headers)).toContain("truncado");
  });

  it("inter-file: atribuye por lenguaje vía `interFileFindingsByLanguage`, y combina el peor status entre repos", () => {
    const d = fakeDetector("layer-skip-fake", "inter-file");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { java: { filesAnalysed: 300, lines: 30_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "inter-file", kind: d.kind, status: "corrio", unitsConsidered: 10, findings: 3 }],
        interFileFindingsByLanguage: { [d.id]: { java: 3 } },
      },
      {
        slug: "repo-b",
        languageFacts: { java: { filesAnalysed: 300, lines: 30_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "inter-file", kind: d.kind, status: "sin-grafo", unitsConsidered: 0, findings: 0 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java"]);
    expect(report.cells[0].findings).toBe(3);
    expect(report.cells[0].status).toBe("sin-grafo"); // peor status entre los dos repos (rank 3 < rank 6 de "corrio")
    expect(report.violations).toEqual([]); // sin-grafo siempre pasa (caso 3)
  });

  it("un lenguaje ausente en TODAS las muestras no genera celda (no se sintetiza 'no aplicable' de la nada)", () => {
    const d = fakeDetector("solo-java");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: { java: { filesAnalysed: 300, lines: 30_000 } },
        coverage: [{ detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "java", status: "corrio", unitsConsidered: 300, findings: 4 }],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java", "go"]);
    expect(report.cells.some((c) => c.language === "go")).toBe(false);
  });

  /*
   * P5 (esta ola), CONTRATO-F6.md §2.5: "auditado" vs "muestra insuficiente"
   * tiene que ser EXPLÍCITO y verificable por test, no sólo una columna de
   * tabla que hay que leer a mano. Con el corpus real (8 repos) sólo
   * java/csharp/typescript cruzan el piso — 3/9, no 9/9 — y `renderAuditSummary`
   * tiene que decirlo de forma literal, nunca imprimir sólo "9 lenguajes".
   */
  it("report.audit: partición explícita auditado / muestra insuficiente, por lenguaje", () => {
    const d = fakeDetector("mixto");
    const samples: RepoCoverageSample[] = [
      {
        slug: "repo-a",
        languageFacts: {
          java: { filesAnalysed: 300, lines: 30_000 }, // por encima del piso (150 archivos / 15 KLOC)
          tsx: { filesAnalysed: 3, lines: 270 }, // por debajo de ambos
        },
        coverage: [
          { detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "java", status: "corrio", unitsConsidered: 300, findings: 4 },
          { detectorId: d.id, title: d.title, scope: "intra-file", kind: d.kind, language: "tsx", status: "corrio", unitsConsidered: 3, findings: 0 },
        ],
        interFileFindingsByLanguage: {},
      },
    ];
    const report = computeLanguageCoverage(samples, [d], ["java", "tsx"]);
    expect(report.audit).toEqual({ measured: 2, audited: ["java"], insufficientSample: ["tsx"] });
  });

  it("renderAuditSummary: nunca imprime el denominador solo — cuando falta auditar, lo dice literal", () => {
    const summary = renderAuditSummary({ measured: 9, audited: ["java", "csharp", "typescript"], insufficientSample: ["ruby", "tsx", "javascript", "vue", "python", "go"] });
    expect(summary).toContain("3/9 lenguajes — java, csharp, typescript");
    expect(summary).toContain("6/9 lenguajes — ruby, tsx, javascript, vue, python, go");
    // La frase que impide la lectura errónea "cobertura de 9 lenguajes":
    expect(summary).toMatch(/NO es cobertura de 9 lenguajes: sólo 3\/9/);
  });

  it("renderAuditSummary: sin faltantes, no agrega la advertencia (todo lo medido quedó auditado)", () => {
    const summary = renderAuditSummary({ measured: 1, audited: ["java"], insufficientSample: [] });
    expect(summary).toContain("1/1 lenguajes — java");
    expect(summary).not.toMatch(/NO es cobertura/);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Bloque 1b — AUDITORÍA DEL REGISTRO REAL, sin corpus y sin `analyzeRepo`.
 *
 * OLA 11b (frente B1, ítem D1). El bloque 2 (corpus) es el único que medía
 * las celdas mudas y se saltea entero sin `CK_CORPUS_DIR`, así que TODA la
 * disciplina de "una celda muda se declara" era invisible en una máquina sin
 * corpus — que es en la que se trabaja. Esto la vuelve visible: audita las
 * DECLARACIONES (`silentIn`, `needsEdges`) sobre el registro real, que no
 * necesita analizar nada para leerse.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Los detectores que declaran `needsEdges` (CONJUNCIÓN — hacen falta TODOS
 * los kinds listados), congelado: sacar la línea de uno de ellos tiene que
 * verse acá. Hasta la Ola A3 sólo 5 lo declaraban (2 de los 7 que un brief
 * previo daba por declarados — `coupling-without-abstraction`/
 * `god-component` — en realidad sólo lo MENCIONABAN en un docstring vencido,
 * nunca en el objeto `detector`: verificado leyendo el registro, no el
 * docstring). Esta ola revisó los ~20 detectores `inter-file` uno por uno
 * (`needs-edges-audit.test.ts` es la compuerta MECÁNICA que evita que esto
 * vuelva a desincronizarse; esta lista es sólo el ancla de regresión, no la
 * fuente de verdad).
 *
 * OLA A, INTEGRACIÓN — `orphan-file` SALE de esta lista, y ésta es la
 * anotación que el propio test exige para que salir no sea silencioso. La
 * Ola A3 le había declarado `needsEdges: ["references"]`; la señal de ese
 * detector es la AUSENCIA de aristas cross-file, así que exigir la presencia
 * de la misma arista como precondición lo apaga justo en el caso de señal
 * máxima (un repo sin una sola arista cross-file es un repo donde TODOS los
 * archivos son huérfanos). Medido: con la línea puesta, la fixture de un solo
 * archivo de `api/code.test.ts` ("P3: paginación") perdía su `orphan-file` y
 * el test se ponía rojo; sobre los dos corpus reales no cambiaba nada
 * (`references` presente en ambos). Justificación completa en el comentario
 * del propio `orphan-file.ts`.
 *
 * OLA 11b (frente B0), LA REGRESIÓN QUE MOVIÓ CUATRO ENTRADAS DE ACÁ A
 * `NEEDS_ANY_EDGE_DECLARADOS` (abajo). `concrete-over-abstraction`,
 * `parallel-hierarchies`, `speculative-abstraction` y `unstable-dependency`
 * habían declarado acá un vocabulario que su propio `run()` combina por
 * UNIÓN (cualquiera de los kinds alcanza), no por intersección — `needsEdges`
 * es conjunción estricta, así que el runner los apagaba enteros cada vez que
 * al repo le faltaba UN SOLO kind de la lista, aunque otro alcanzara y
 * sobrara. Medido neutralizando el gate: 5 hallazgos verdaderos volvían (4 de
 * `speculative-abstraction` en Rails + 1 en `src/`, 1 de
 * `unstable-dependency` en `src/`). `concrete-over-abstraction` es mixto: su
 * `references` (rol "uso") sigue acá porque es genuinamente mandatorio;
 * `implements`/`satisfies` (rol "abstracción disponible") se mudan a
 * alternativa. Ver `types.ts#InterFileDetector.needsAnyEdge`, "CÓMO NO VOLVER
 * A CONFUNDIRLO", y el comentario `OLA 11b` en cada uno de los 4 detectores
 * para el razonamiento completo por archivo.
 */
const NEEDS_EDGES_DECLARADOS: Readonly<Record<string, readonly string[]>> = {
  "concrete-over-abstraction": ["references"],
  "dependency-cycle": ["references"],
  "distributed-duplication": ["references"],
  "fanout-without-cohesion": ["references"],
  "god-component": ["references"],
  // OLA AE (frente AE8): conjunción REAL, las dos. Sin `instantiates` no hay
  // forma de saber QUÉ construye cada hermano (condición 3 del detector) y sin
  // `calls` no hay forma de saber si hay un procedimiento duplicado que subir
  // (condición 4). Faltando cualquiera de las dos el detector no puede
  // encontrar nada — no "encuentra cero". Las cuatro aristas de familia van en
  // `NEEDS_ANY_EDGE_DECLARADOS` (alternativa) y `contains` en
  // `DELIBERATELY_EXCLUDED` de `needs-edges-audit.test.ts`.
  "homonymous-divergent-construction": ["instantiates", "calls"],
  "import-depth-demeter": ["imports"],
  // OLA AE (frente AE6): el tratamiento invariante y la operación soldada SON
  // llamadas — sin `calls` este detector no tiene insumo. Las otras clases de
  // arista que lee (`contains`, `implements`, `satisfies`, `extends`,
  // `mixes-in`, `carries`, `invokes-indirect`) sólo RETIRAN candidatos o anotan
  // un discriminador, así que van en `DELIBERATELY_EXCLUDED` de
  // `needs-edges-audit.test.ts`, no acá.
  "invariant-scaffold-varying-call": ["calls"],
  "layer-skip": ["references"],
  // OLA AE (frente AE4): la evidencia de este detector ES la lista de
  // argumentos de cada sitio de construccion, y ese hecho (`callArities`)
  // viaja SOLO en aristas `references`/`calls`; el detector lee la mitad
  // CALLEE, que es `calls`. Sin `calls` no tiene insumo y no puede encontrar
  // nada — no "encuentra cero". `instantiates` y `contains` solo retiran
  // candidatos o resuelven el dueno de un miembro, asi que van en
  // `DELIBERATELY_EXCLUDED` de `needs-edges-audit.test.ts`, no aca.
  "optional-construction-combinations": ["calls"],
  // OLA AD (frente AD4): la coordinación que este detector busca ES un
  // conjunto de llamadas — sin `calls` no tiene insumo. `references` se lee
  // también pero sólo amplía el testimonio de cohesión, así que va en
  // `DELIBERATELY_EXCLUDED` de `needs-edges-audit.test.ts`, no acá.
  "repeated-collaborator-set": ["calls"],
  // OLA AE (frente AE3): sin `extends` no hay huecos de producto (un tipo base
  // con variantes) y sin `instantiates` no hay puntos de creacion — son los dos
  // insumos sin los cuales el detector no tiene nada que mirar. El resto de las
  // aristas que lee va en `DELIBERATELY_EXCLUDED` de `needs-edges-audit.test.ts`.
  "hardwired-subtype-combination": ["extends", "instantiates"],
  "scattered-instantiation": ["instantiates"],
};

/**
 * Los detectores que declaran `needsAnyEdge` (ALTERNATIVA — alcanza con UNO
 * SOLO de los kinds listados), congelado, mismo espíritu que
 * `NEEDS_EDGES_DECLARADOS`. Nace en la Ola 11b (frente B0) — ver el
 * comentario largo de arriba para la regresión que motivó separar este campo
 * de `needsEdges`. `unused-symbol` sumó `"carries"` en esta ola (frente
 * A4a) — ver "QUÉ CUENTA COMO USO" punto (d) en el docstring de
 * `unused-symbol.ts`: la única arista que puede apuntar a un literal
 * función/arrow anónimo (`<anon@N>`, `graph/edges/portador.ts`) usado como
 * valor de un campo/callback.
 */
const NEEDS_ANY_EDGE_DECLARADOS: Readonly<Record<string, readonly string[]>> = {
  "concrete-over-abstraction": ["implements", "satisfies"],
  // OLA AE (frente AE8): alcanza con UNA de las cuatro para que exista
  // "familia". Ruby no tiene `implements`/`satisfies`, Go no tiene
  // `extends`/`mixes-in`: declararlas en conjunción apagaría el detector entero
  // en cada uno de esos lenguajes — la regresión exacta que
  // `types.ts#needsAnyEdge` documenta.
  "homonymous-divergent-construction": ["extends", "implements", "mixes-in", "satisfies"],
  // OLA AW (frente AW4): `isConfidentCallEdge` pasó de `needsEdges: ["references"]`
  // a esto — las dos mitades (no-callee y callee) de la MISMA cascada de
  // resolución testimonian el MISMO rol ("A llama a M"), literalmente el
  // criterio de `types.ts#needsAnyEdge`. El caso que lo motivó fue
  // `middle-man.ts` (ver `ola-aw/informes/AW4.md` §1-bis); `middle-man` se
  // desregistró en la Ola AX (0/36 = 0 %, `registries.test.ts
  // #DELIBERATELY_UNREGISTERED`) y su línea salió de acá con él —el archivo
  // y el razonamiento quedan, la entrada no, porque `declarados` (arriba)
  // se deriva de `DETECTORS` y ya no lo incluye. Lo mismo vale para
  // `parallel-hierarchies` (Ola AX, AX8: 0 hallazgos en 16 repos, baja por
  // inútil), cuya entrada también salió con la baja.
  "unstable-dependency": ["imports", "extends", "implements"],
  // OLA O (frente N1): `unused-symbol` sumó las CUATRO aristas de TIPO. Ver la
  // PUERTA 5 del docstring de `unused-symbol.ts`: heredar/implementar/
  // satisfacer/mezclar un tipo ES usarlo, y el hallazgo afirmaba textualmente
  // "ningún archivo del repo lo referencia" — con una subclase en el repo eso
  // era sencillamente falso.
  "unused-symbol": [
    "references",
    "calls",
    "instantiates",
    "invokes-indirect",
    "carries",
    "extends",
    "implements",
    "satisfies",
    "mixes-in",
  ],
};

describe("auditoría del registro real — declaraciones de silencio (Ola 11b, ítem D1)", () => {
  it("`silentIn`: toda clave es un lenguaje de LANGUAGES_MEASURED y toda razón es sustantiva", () => {
    const problemas: string[] = [];
    for (const detector of DETECTORS) {
      for (const [language, reason] of Object.entries(detector.silentIn ?? {})) {
        if (!(LANGUAGES_MEASURED as readonly string[]).includes(language)) {
          problemas.push(`${detector.id}: "${language}" no es uno de los ${LANGUAGES_MEASURED.length} lenguajes medidos`);
        }
        // Una razón corta es un relleno: la disciplina es que se pueda
        // auditar, y para eso tiene que decir qué forma falta y dónde se
        // verificó. El piso es deliberadamente bajo — atrapa "n/a", "no
        // aplica", "TODO", no juzga la prosa.
        if (reason.trim().length < 40) problemas.push(`${detector.id}/${language}: razón de ${reason.trim().length} caracteres, es un relleno`);
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  it("`needsEdges`: los detectores que lo declaran, congelados — quitarlo reabre una celda muda en silencio", () => {
    const declarados: Record<string, readonly string[]> = {};
    for (const detector of DETECTORS) {
      if (detector.scope !== "inter-file") continue;
      const kinds = detector.needsEdges;
      if (kinds && kinds.length > 0) declarados[detector.id] = [...kinds];
    }
    // `toEqual` literal a propósito (mismo criterio que el resto del archivo):
    // el mensaje de fallo trae la lista completa, no un booleano.
    expect(declarados).toEqual(NEEDS_EDGES_DECLARADOS);
  });

  it("`needsAnyEdge`: los detectores que lo declaran, congelados — quitarlo reabre una celda muda en silencio (Ola 11b)", () => {
    const declarados: Record<string, readonly string[]> = {};
    for (const detector of DETECTORS) {
      if (detector.scope !== "inter-file") continue;
      const kinds = (detector as { needsAnyEdge?: readonly string[] }).needsAnyEdge;
      if (kinds && kinds.length > 0) declarados[detector.id] = [...kinds];
    }
    expect(declarados).toEqual(NEEDS_ANY_EDGE_DECLARADOS);
  });

  it("`needsEdges`/`needsAnyEdge` y `silentIn` no se pisan: un detector no declara las dos cosas para el mismo silencio", () => {
    // `needsEdges`/`needsAnyEdge` son verificables por máquina (el runner
    // mira el grafo); `silentIn` es texto libre. Declarar cualquiera de los
    // dos primeros junto con `silentIn` en el mismo detector significa que
    // el texto libre está tapando algo que la máquina ya sabe comprobar —
    // ver el docstring de `DetectorBase.silentIn`, "ÚLTIMO RECURSO, NO EL
    // PRIMERO".
    const ambos = DETECTORS.filter(
      (d) =>
        d.scope === "inter-file" &&
        ((d.needsEdges?.length ?? 0) > 0 || ((d as { needsAnyEdge?: readonly string[] }).needsAnyEdge?.length ?? 0) > 0) &&
        Object.keys(d.silentIn ?? {}).length > 0,
    ).map((d) => d.id);
    expect(ambos).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Bloque 2 — el corpus real (8 repos), CONDICIONAL — mismo patrón que
 * `census-golden.test.ts`.
 * ──────────────────────────────────────────────────────────────────────── */

interface Manifest {
  corpus: Record<string, { sha: string; path: string }>;
}

function readManifest(): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function gitSha(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const execFileAsync = promisify(execFile);

/** Un proceso, async — ver `census-golden.test.ts#runCensus` para por qué async (guava tarda >1 min). */
async function runWorker(dir: string, slug: string): Promise<RepoCoverageSample> {
  const { stdout, stderr } = await execFileAsync(TSX_BIN, [WORKER_SCRIPT, dir, slug], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  // Reenvía el log `[analyzer-cache]` de `language-coverage.mts` — mismo motivo que
  // `census-golden.test.ts#runCensus`: sin esto el hit/miss existe pero nadie lo ve.
  if (stderr.trim()) console.error(stderr.trim());
  return JSON.parse(stdout) as RepoCoverageSample;
}

const manifest = readManifest();
const corpusRoot = process.env.CK_CORPUS_DIR;

describe("cobertura por lenguaje — corpus real (CONTRATO-F6.md Contrato 2)", () => {
  if (!manifest) {
    it.skip("manifest.json ausente en tests/golden — correr scripts/census-all.sh primero", () => {});
    return;
  }

  const availableSlugs: { slug: string; dir: string }[] = [];
  for (const [slug, entry] of Object.entries(manifest.corpus)) {
    const dir = corpusRoot ? path.join(corpusRoot, entry.path) : null;
    const skipReason = !corpusRoot
      ? "CK_CORPUS_DIR no está seteado"
      : !dir || !fs.existsSync(dir)
        ? `no existe ${dir}`
        : gitSha(dir) !== entry.sha
          ? "sha desincronizado — re-congelar"
          : null;
    if (skipReason) {
      it.skip(`${slug} — SKIP: ${skipReason}`, () => {});
    } else {
      availableSlugs.push({ slug, dir: dir as string });
    }
  }

  if (availableSlugs.length === 0) return;

  it(
    "ningún detector queda mudo en un lenguaje sin razón declarada, en TODO el corpus disponible",
    async () => {
      // Secuencial, un repo a la vez — igual que `census-golden.test.ts`,
      // `edge-coverage.test.ts` y `ranking-acceptance.test.ts` (regla de
      // memoria: "guava corre sola"). `Promise.all` lanzaba los 8 subprocesos
      // EN PARALELO, guava incluida — la misma forma que causó el incidente
      // de memoria que reinició el servicio systemd.
      const samples: RepoCoverageSample[] = [];
      for (const { dir, slug } of availableSlugs) {
        samples.push(await runWorker(dir, slug));
      }
      const report = computeLanguageCoverage(samples, DETECTORS, [...LANGUAGES_MEASURED]);

      console.log(`\n[cobertura-por-lenguaje] ${availableSlugs.length}/${Object.keys(manifest.corpus).length} repos del corpus disponibles.\n`);
      console.log(renderHeaderTable(report.headers));
      console.log(`\n${renderAuditSummary(report.audit)}`);
      console.log(
        `\n[cobertura-por-lenguaje] dependencia de java: ${(report.javaDependency.javaFileShare * 100).toFixed(1)}% de los archivos del corpus, ` +
          `${(report.javaDependency.javaFindingsShare * 100).toFixed(1)}% de los hallazgos totales. ` +
          `${report.javaDependency.detectorsFiringOnlyInJava.length}/${report.javaDependency.totalDetectorsWithAnyFinding} detectores con hallazgos SÓLO dispararon en java: ` +
          `${report.javaDependency.detectorsFiringOnlyInJava.join(", ") || "(ninguno)"}.`,
      );
      if (report.violations.length > 0) {
        console.log(`\n[cobertura-por-lenguaje] ${report.violations.length} celda(s) mudas SIN razón declarada:`);
        for (const v of report.violations) {
          console.log(`  (${v.language}, ${v.detectorId}) — status=${v.status} findings=${v.findings} veredicto=${verdictFor(v)}`);
        }
      }

      // La aserción real de la compuerta — CONTRATO-F6.md §2.3. Hoy falla
      // (ver el docstring del módulo): es la medición pedida, no un bug de
      // este test. `toEqual([])` es literal a propósito, para que la lista
      // completa de violaciones quede en el mensaje de fallo.
      expect(report.violations, `${report.violations.length} celda(s) sin razón declarada`).toEqual([]);
    },
    600_000,
  );
});

/* ────────────────────────────────────────────────────────────────────────
 * Bloque 3 — `fixtures-multi`, INCONDICIONAL (mismo criterio que
 * `census-golden.test.ts`: la fixture vive versionada dentro del repo).
 *
 * OLA 11b (frente B1, ítem D1). POR QUÉ EXISTE: el bloque 2 es el único que
 * corría la compuerta de verdad y se saltea entero sin `CK_CORPUS_DIR`, así
 * que las celdas que esta ola convirtió de MUDAS en DECLARADAS se pueden
 * reabrir borrando una línea sin que nada se ponga rojo hasta la próxima
 * corrida con corpus. Esto las ancla contra la fixture que sí está en disco.
 *
 * NO reemplaza al bloque 2 y no pretende hacerlo: sobre `fixtures-multi` los
 * 6 lenguajes están MUY por debajo del piso de medición (101 archivos / 2,6
 * KLOC contra 150 / 15), así que `report.violations` es vacío por
 * `sampleInsufficient` y no dice nada. Lo que se afirma acá es el CONTENIDO
 * de las celdas declaradas, que no depende del piso.
 * ──────────────────────────────────────────────────────────────────────── */
const FIXTURES_MULTI_DIR = path.join(ROOT, "tests", "fixtures", "patterns");

describe("celdas declaradas sobre fixtures-multi (incondicional, sin corpus)", () => {
  it(
    "las declaraciones de la Ola 11b siguen en pie sobre la fixture versionada",
    async () => {
      const sample = await runWorker(FIXTURES_MULTI_DIR, "fixtures-multi");
      const languages = Object.keys(sample.languageFacts).sort();
      const report = computeLanguageCoverage([sample], DETECTORS, languages);

      // 1. `import-depth-demeter` declara `needsEdges: ["imports"]`. Medido
      //    al cerrar esta ola: el grafo de esta fixture no trae NI UNA arista
      //    `imports`, así que antes de la declaración estas 6 celdas eran
      //    `corrio` + 0 hallazgos — mudas y sin razón. Ahora nombran la
      //    arista que falta.
      const idd = report.cells.filter((c) => c.detectorId === "import-depth-demeter");
      expect(idd.map((c) => c.language).sort()).toEqual(languages);
      for (const cell of idd) {
        expect(cell.status, `(import-depth-demeter, ${cell.language})`).toBe("sin-aristas");
        expect(cell.missingEdgeKinds, `(import-depth-demeter, ${cell.language})`).toEqual(["imports"]);
        expect(verdictFor({ ...cell, sampleInsufficient: false })).toBe("ok");
      }

      // 2. ACTUALIZADO EN LA OLA O (frente N1). Hasta esta ola las 6 celdas
      //    `presupuesto-agotado` del registro eran UN solo evento de
      //    truncamiento de `unused-symbol` (detector `inter-file`, status
      //    repo-wide) repartido por lenguaje: el detector producía 335
      //    candidatos sobre esta fixture y su `presupuesto(200)` cortaba 135
      //    por severidad.
      //    Ese truncamiento era el síntoma del problema que la Ola O arregló
      //    (ver el docstring de `unused-symbol.ts`: 98,5 % de los candidatos
      //    eran MIEMBROS, cuyo uso la cascada no puede ver en 8 de las 9
      //    gramáticas), no una propiedad de la fixture. Ya no ocurre: sobre
      //    esta misma fixture el detector pasó de 335 candidatos a 56, y cabe
      //    holgado en su presupuesto.
      //
      //    Lo que se sigue afirmando — y es lo que importa de la compuerta —
      //    es que un `presupuesto-agotado` con CERO hallazgos rompe: esa
      //    lógica vive en `verdictFor` y la cubre el bloque 1 con muestras
      //    sintéticas, sin depender de que algún detector real trunque hoy.
      const truncadas = report.cells.filter((c) => c.status === "presupuesto-agotado");
      for (const cell of truncadas) {
        expect(cell.findings, `(${cell.detectorId}, ${cell.language}) truncada Y en cero: es la mitad que sí rompe`).toBeGreaterThan(0);
        expect(verdictFor({ ...cell, sampleInsufficient: false })).toBe("ok");
      }

      // 3. El truncamiento, ocurra o no, sigue CONTADO en la cabecera: si esta
      //    columna dejara de contarlo, aceptar el estado pasaría a ser
      //    esconderlo. Se afirma la consistencia entre celdas y cabecera, no
      //    un número congelado que un detector arreglado vuelva obsoleto.
      for (const header of report.headers) {
        const truncadasDelLenguaje = report.cells.filter((c) => c.language === header.language && c.status === "presupuesto-agotado");
        expect(header.detectorsTruncado, `cabecera de ${header.language}`).toBe(truncadasDelLenguaje.length);
      }

      // 4. Ningún detector explota sobre la fixture. `error` es el único
      //    estado que sigue rompiendo la compuerta sin excepción posible.
      const rotos = report.cells.filter((c) => c.status === "error");
      expect(rotos.map((c) => `${c.language}/${c.detectorId}`)).toEqual([]);
    },
    300_000,
  );
});
