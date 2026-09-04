/**
 * F4 — `graph/thresholds.ts`: el `Benchmarks` real cargado de
 * `benchmarks.json` (CONTRATO-F4.md, tarea "benchmarks").
 */
import path from "node:path";
import { promises as fsp } from "node:fs";
import { describe, expect, it } from "vitest";

import { derivado, resolveThreshold } from "../detect/thresholds.js";
import {
  getCorpusBenchmarks,
  loadBenchmarksFile,
  resetCorpusBenchmarksCacheForTests,
  type BenchmarksFile,
} from "./thresholds.js";

const REAL_BENCHMARKS_PATH = path.join(import.meta.dirname, "benchmarks.json");

function fakeFile(overrides: Partial<BenchmarksFile> = {}): BenchmarksFile {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01",
    corpusSha: "deadbeef",
    corpusRepos: [],
    metrics: {
      wmc: { java: { n: 100, p50: 5, p90: 20, p95: 30, p99: 50 } },
    },
    diagnostics: { perRepo: [] },
    ...overrides,
  };
}

describe("loadBenchmarksFile — puro, sin tocar disco", () => {
  it("p95 de una (métrica, lenguaje) presente devuelve el número del archivo", () => {
    const b = loadBenchmarksFile(fakeFile());
    expect(b.p95("wmc", "java")).toBe(30);
  });

  it("lenguaje ausente para una métrica presente ⇒ null, nunca 0", () => {
    const b = loadBenchmarksFile(fakeFile());
    expect(b.p95("wmc", "ruby")).toBeNull();
  });

  it("métrica que no existe en el archivo ⇒ null", () => {
    const b = loadBenchmarksFile(fakeFile());
    expect(b.p95("no-existe", "java")).toBeNull();
  });
});

describe("resolveThreshold + Benchmarks real: la pieza que faltaba para que 'derivado' deje de ser siempre el floor", () => {
  it("corpus por encima del floor ⇒ gana el corpus, scope 'corpus'", () => {
    const b = loadBenchmarksFile(fakeFile({ metrics: { wmc: { java: { n: 100, p50: 5, p90: 20, p95: 60, p99: 80 } } } }));
    const spec = derivado({ floor: 47, stat: "p95", of: "wmc", floorSource: { rationale: "piso de prueba" } });
    const t = resolveThreshold(spec, { language: "java", sampleSize: () => 0, corpusP95: (m, l) => b.p95(m, l) });
    expect(t.value).toBe(60);
    expect(t.detail).toMatchObject({ kind: "derivado", scope: "corpus" });
  });

  it("corpus por debajo del floor ⇒ el floor sigue mandando, scope 'repo-analizado'", () => {
    const b = loadBenchmarksFile(fakeFile({ metrics: { wmc: { java: { n: 100, p50: 5, p90: 20, p95: 30, p99: 50 } } } }));
    const spec = derivado({ floor: 47, stat: "p95", of: "wmc", floorSource: { rationale: "piso de prueba" } });
    const t = resolveThreshold(spec, { language: "java", sampleSize: () => 0, corpusP95: (m, l) => b.p95(m, l) });
    expect(t.value).toBe(47);
    expect(t.detail).toMatchObject({ kind: "derivado", scope: "repo-analizado" });
  });

  it("sin benchmark para ese lenguaje ⇒ igual que hoy: el floor, sin romper", () => {
    const b = loadBenchmarksFile(fakeFile());
    const spec = derivado({ floor: 6, stat: "p95", of: "parameters", floorSource: { rationale: "piso de prueba" } });
    const t = resolveThreshold(spec, { language: "cobol", sampleSize: () => 0, corpusP95: (m, l) => b.p95(m, l) });
    expect(t.value).toBe(6);
  });
});

describe("getCorpusBenchmarks — carga real de disco, cacheada por proceso", () => {
  it("ruta inexistente ⇒ null, nunca lanza", () => {
    resetCorpusBenchmarksCacheForTests();
    expect(getCorpusBenchmarks("/no/existe/benchmarks.json")).toBeNull();
  });

  it("cachea: dos llamadas a la MISMA ruta devuelven el mismo objeto", () => {
    resetCorpusBenchmarksCacheForTests();
    const a = getCorpusBenchmarks(REAL_BENCHMARKS_PATH);
    const b = getCorpusBenchmarks(REAL_BENCHMARKS_PATH);
    expect(a).toBe(b);
  });

  it("el benchmarks.json versionado del repo carga y resuelve 'wmc'/'java'", () => {
    resetCorpusBenchmarksCacheForTests();
    const b = getCorpusBenchmarks(REAL_BENCHMARKS_PATH);
    expect(b).not.toBeNull();
    expect(b!.p95("wmc", "java")).not.toBeNull();
    expect(b!.p95("metrica-que-no-existe", "java")).toBeNull();
  });
});

/**
 * Invariantes estructurales de `benchmarks.json` — deliberadamente SIN
 * hardcodear ningún percentil (esos números cambian cada vez que se
 * regenera): lo que este bloque fija es la FORMA, no el valor. Un número
 * puntual (p.ej. "wmc/java p95 es 30") no es un gate — regenerar el archivo
 * con un corpus más grande no debería romper un test.
 */
describe("benchmarks.json versionado — invariantes de forma", () => {
  const CORPUS_SLUGS = ["click", "cobra", "guava", "jekyll", "lodash", "newtonsoft-json", "preact", "vueuse"];

  async function loadReal(): Promise<BenchmarksFile> {
    const raw = await fsp.readFile(REAL_BENCHMARKS_PATH, "utf8");
    return JSON.parse(raw) as BenchmarksFile;
  }

  it("los 8 repos del corpus están presentes, `generatedAt` es una fecha fija (no Date.now())", async () => {
    const file = await loadReal();
    expect(file.corpusRepos.map((r) => r.slug).sort()).toEqual([...CORPUS_SLUGS].sort());
    expect(file.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(file.corpusSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cada percentil es monótono: p50 <= p90 <= p95 <= p99, y n > 0", async () => {
    const file = await loadReal();
    for (const [metric, byLanguage] of Object.entries(file.metrics)) {
      for (const [language, p] of Object.entries(byLanguage)) {
        expect(p.n, `${metric}/${language}: n`).toBeGreaterThan(0);
        expect(p.p50, `${metric}/${language}: p50<=p90`).toBeLessThanOrEqual(p.p90);
        expect(p.p90, `${metric}/${language}: p90<=p95`).toBeLessThanOrEqual(p.p95);
        expect(p.p95, `${metric}/${language}: p95<=p99`).toBeLessThanOrEqual(p.p99);
      }
    }
  });

  it("wmc está declarado para 'java' — es la única métrica que un detector real consulta hoy (large-class.ts)", async () => {
    const file = await loadReal();
    expect(file.metrics.wmc?.java).toBeDefined();
  });

  it("diagnostics.perRepo: cuando hay más de un repo para esa (métrica, lenguaje), el ratio no es null; cuando ese repo es el único, sí", async () => {
    const file = await loadReal();
    const byMetricLanguage = new Map<string, Set<string>>();
    for (const row of file.diagnostics.perRepo) {
      const key = `${row.metric}|${row.language}`;
      (byMetricLanguage.get(key) ?? byMetricLanguage.set(key, new Set()).get(key)!).add(row.slug);
    }
    for (const row of file.diagnostics.perRepo) {
      const key = `${row.metric}|${row.language}`;
      const contributingRepos = byMetricLanguage.get(key)!.size;
      if (contributingRepos === 1) {
        expect(row.repoToRestOfCorpusRatio, `${row.slug} ${key}: único contribuyente ⇒ sin resto`).toBeNull();
      } else {
        expect(row.repoToRestOfCorpusRatio, `${row.slug} ${key}: hay resto ⇒ ratio numérico`).not.toBeNull();
      }
    }
  });
});
