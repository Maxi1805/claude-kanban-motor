/**
 * Prueba central de esta tarea: el caché de `analyzeRepo` por SHA + huella del
 * analizador NUNCA sirve un resultado de otra versión del analizador, y no cambia
 * ningún resultado entre frío y caliente. Ver `analyze-cache.ts` para la explicación
 * completa de la clave.
 *
 * `analyzeRepoCachedWithFingerprint` (no `analyzeRepoCached`) es el sujeto de casi
 * todos los casos: es la MISMA orquestación que usa producción, parametrizada por la
 * huella en vez de calcularla con los roots reales — así se puede simular "el
 * analizador cambió" con un string de prueba, sin tocar ni un archivo de
 * `src/server/services/` (que además rompería la regla de este proyecto de no dejar
 * el árbol del analizador en un estado intermedio).
 *
 * Los repos analizados son git REALES (temp dir + `git init`): `gitContentSignature`
 * (la mitad de la clave que sí mira el repo) exige un checkout git — mismo patrón que
 * `code.test.ts`'s "F2: caché persistente por hash de contenido".
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as codeAnalyzer from "./code-analyzer.js";
import {
  analyzeRepoCached,
  analyzeRepoCachedWithFingerprint,
  analyzerFingerprint,
  computeCodeFingerprint,
} from "./analyze-cache.js";

function initGitRepo(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
}

const TRIVIAL_SOURCE: Record<string, string> = {
  "index.js": "function saluda(nombre) {\n  return `hola ${nombre}`;\n}\nmodule.exports = { saluda };\n",
};

let tmpRoot: string;
let repoDir: string;
let cacheDir: string;
let prevCacheDir: string | undefined;
let prevCacheFlag: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ck-analyze-cache-"));
  repoDir = path.join(tmpRoot, "repo");
  cacheDir = path.join(tmpRoot, "cache");
  fs.mkdirSync(repoDir, { recursive: true });
  initGitRepo(repoDir, TRIVIAL_SOURCE);

  prevCacheDir = process.env.CK_ANALYSIS_CACHE_DIR;
  prevCacheFlag = process.env.CK_ANALYSIS_CACHE;
  process.env.CK_ANALYSIS_CACHE_DIR = cacheDir;
  delete process.env.CK_ANALYSIS_CACHE;
});

afterEach(() => {
  if (prevCacheDir === undefined) delete process.env.CK_ANALYSIS_CACHE_DIR;
  else process.env.CK_ANALYSIS_CACHE_DIR = prevCacheDir;
  if (prevCacheFlag === undefined) delete process.env.CK_ANALYSIS_CACHE;
  else process.env.CK_ANALYSIS_CACHE = prevCacheFlag;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("computeCodeFingerprint — sensibilidad a cambios de contenido", () => {
  it("mismo contenido ⇒ misma huella, en corridas distintas", async () => {
    const dir = path.join(tmpRoot, "analizador-falso");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "detector-a.ts"), "export const PISO = 4;\n");

    const fp1 = await computeCodeFingerprint({ dirs: [dir], files: [] });
    const fp2 = await computeCodeFingerprint({ dirs: [dir], files: [] });
    expect(fp1).toBe(fp2);
  });

  it("cambiar UNA línea que afecta el análisis (un piso/umbral) ⇒ huella distinta", async () => {
    const dir = path.join(tmpRoot, "analizador-falso");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "detector-a.ts");
    fs.writeFileSync(file, "export const PISO = 4;\n");
    const antes = await computeCodeFingerprint({ dirs: [dir], files: [] });

    fs.writeFileSync(file, "export const PISO = 5;\n"); // el tipo de cambio real que R3 discute
    const despues = await computeCodeFingerprint({ dirs: [dir], files: [] });

    expect(despues).not.toBe(antes);
  });

  it("agregar un archivo nuevo al árbol del analizador ⇒ huella distinta", async () => {
    const dir = path.join(tmpRoot, "analizador-falso");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "detector-a.ts"), "export const PISO = 4;\n");
    const antes = await computeCodeFingerprint({ dirs: [dir], files: [] });

    fs.writeFileSync(path.join(dir, "detector-b.ts"), "export const OTRO_PISO = 1;\n");
    const despues = await computeCodeFingerprint({ dirs: [dir], files: [] });

    expect(despues).not.toBe(antes);
  });

  it("huella de PRODUCCIÓN (roots reales): determinística y no vacía", async () => {
    const fp1 = await analyzerFingerprint();
    const fp2 = await analyzerFingerprint(); // memoizada — mismo valor, sin recalcular
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("analyzeRepoCachedWithFingerprint — REQUISITO 1: correcto por construcción", () => {
  it("primera llamada: MISS, analyzeRepo corre de verdad", async () => {
    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const result = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.cache.hit).toBe(false);
    expect(result.cache.enabled).toBe(true);
    expect(result.analysis.repoName).toBe("x");
  });

  it("segunda llamada, MISMA huella de analizador y mismo repo: HIT, analyzeRepo NO se vuelve a llamar, y el resultado es idéntico al de la corrida fría", async () => {
    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const frio = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");
    const caliente = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");

    expect(spy).toHaveBeenCalledTimes(1); // NO se volvió a llamar
    expect(caliente.cache.hit).toBe(true);
    expect(caliente.cache.analyzeMs).toBe(0);
    // REQUISITO 4 — frío y caliente dan IDÉNTICO.
    expect(caliente.analysis).toEqual(frio.analysis);
    expect(caliente.preCapFindings).toEqual(frio.preCapFindings);
    expect(caliente.graph).toEqual(frio.graph);
  });

  it("*** LA PRUEBA CENTRAL *** — cambia la huella del analizador (simula una ola tocando un detector) sobre el MISMO repo ⇒ el caché se invalida, analyzeRepo corre de nuevo, nunca se sirve el resultado viejo", async () => {
    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const antesDeLaOla = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(antesDeLaOla.cache.hit).toBe(false);

    // "la ola" cambió algo del analizador — la huella que `analyzerFingerprint()`
    // calcularía en producción ahora es otra. El repo NO cambió (mismo SHA).
    const despuesDeLaOla = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-B");

    expect(spy).toHaveBeenCalledTimes(2); // se RECALCULÓ — nunca sirvió la entrada de huella-A
    expect(despuesDeLaOla.cache.hit).toBe(false);
    expect(despuesDeLaOla.cache.key).not.toBe(antesDeLaOla.cache.key); // clave distinta ⇒ archivo de caché distinto

    // Y una tercera llamada con la huella VIEJA (huella-A) sigue sirviendo SU propia
    // entrada, sin contaminarse con la de huella-B: la entrada de huella-A nunca se
    // sobrescribió ni se borró.
    const otraVezConLaHuellaVieja = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");
    expect(spy).toHaveBeenCalledTimes(2); // hit — no un tercer cálculo
    expect(otraVezConLaHuellaVieja.cache.hit).toBe(true);
  });
});

describe("analyzeRepoCachedWithFingerprint — escape hatch", () => {
  it("CK_ANALYSIS_CACHE=0 desactiva lectura Y escritura: dos llamadas idénticas, analyzeRepo corre las DOS veces", async () => {
    process.env.CK_ANALYSIS_CACHE = "0";
    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const uno = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");
    const dos = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "x" }, "huella-A");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(uno.cache.enabled).toBe(false);
    expect(dos.cache.enabled).toBe(false);
    // Nada quedó escrito en disco tampoco.
    expect(fs.existsSync(cacheDir) && fs.readdirSync(cacheDir).length > 0).toBe(false);
  });
});

describe("analyzeRepoCachedWithFingerprint — repoName no forma parte de la clave", () => {
  it("mismo repo+huella+límites, repoName DISTINTO: sigue siendo HIT, y el repoName servido es el del caller (no el de la entrada original)", async () => {
    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const alpha = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "alpha" }, "huella-A");
    const beta = await analyzeRepoCachedWithFingerprint({ dir: repoDir, repoName: "beta" }, "huella-A");

    expect(spy).toHaveBeenCalledTimes(1); // compartieron la entrada de caché
    expect(beta.cache.hit).toBe(true);
    expect(beta.analysis.repoName).toBe("beta"); // no "alpha" — parchado sobre el hit
    expect({ ...beta.analysis, repoName: "" }).toEqual({ ...alpha.analysis, repoName: "" });
  });
});

describe("analyzeRepoCachedWithFingerprint — repo que no es un checkout git", () => {
  it("degrada a 'sin caché', nunca falla: analyzeRepo corre igual, cache.hit siempre false", async () => {
    const plainDir = path.join(tmpRoot, "no-es-git");
    fs.mkdirSync(plainDir, { recursive: true });
    fs.writeFileSync(path.join(plainDir, "index.js"), TRIVIAL_SOURCE["index.js"]);

    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const uno = await analyzeRepoCachedWithFingerprint({ dir: plainDir, repoName: "x" }, "huella-A");
    const dos = await analyzeRepoCachedWithFingerprint({ dir: plainDir, repoName: "x" }, "huella-A");

    expect(spy).toHaveBeenCalledTimes(2); // sin firma de contenido, nunca hay hit
    expect(uno.cache.hit).toBe(false);
    expect(dos.cache.hit).toBe(false);
    expect(uno.cache.enabled).toBe(true); // el caché SÍ está prendido — este repo puntual no califica
  });
});

describe("analyzeRepoCached — el punto de entrada real (huella de PRODUCCIÓN)", () => {
  it("funciona de punta a punta con los roots reales: MISS y después HIT sobre el mismo repo", async () => {
    const spy = vi.spyOn(codeAnalyzer, "analyzeRepo");
    const uno = await analyzeRepoCached({ dir: repoDir, repoName: "x" });
    const dos = await analyzeRepoCached({ dir: repoDir, repoName: "x" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(uno.cache.hit).toBe(false);
    expect(dos.cache.hit).toBe(true);
    expect(dos.analysis).toEqual(uno.analysis);
  });
});
