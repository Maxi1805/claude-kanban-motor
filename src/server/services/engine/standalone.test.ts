/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PRUEBA DE QUE EL CORTE ES REAL: EL MOTOR ARRANCA SIN EL TABLERO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Punto 4 del encargo de la Ola BC. Este archivo analiza un directorio de
 * verdad, con caché persistente de verdad, y NO INSTANCIA EL TABLERO:
 *
 *   · No hay `taskId` en ninguna parte.
 *   · No hay `Repositories`, ni `Task`, ni `TaskRepo`, ni `CodeInspectorService`.
 *   · No hay `initDb`: la base la abre este archivo con `better-sqlite3` y le
 *     aplica `ensureEngineSchema`, que es la función del MOTOR. Nunca se toca
 *     `config.dbPath` ni se crea una tabla del tablero — se verifica abajo que
 *     `tasks`/`projects` NO existen en esa base.
 *   · Lo único que se importa del árbol del proyecto es `./index.js`, la
 *     superficie del motor. Ni un import más.
 *
 * POR QUÉ ESTE TEST Y `no-board-imports.test.ts` SON UNO SOLO, y por qué hacen
 * falta LOS DOS. Este prueba que el motor FUNCIONA entrando sólo por su
 * superficie; el otro prueba que el cierre transitivo de imports de esa
 * superficie no contiene ni un archivo del tablero. Juntos dicen lo que hay que
 * decir: importar `engine/index.js` no puede cargar el tablero, y con eso
 * alcanza para analizar. Por separado, cualquiera de los dos deja el otro
 * agujero abierto.
 *
 * PROBADO EN ROJO (cicatriz 3 de la ola). Sin `ensureEngineSchema` —o sea, en
 * el mundo anterior a esta ola, donde las tablas del analizador sólo existían
 * si `initDb` del tablero corría— el caso de caché persistente falla con
 * `no such table: code_file_facts`. Ése es exactamente el obstáculo que esta
 * ola tenía que sacar, y el test lo cubre.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeDirectory, createAnalysisEngine, ensureEngineSchema } from "./index.js";

/**
 * Dos funciones estructuralmente idénticas: el detector de duplicación
 * normaliza identificadores, así que esto produce un hallazgo real. Mismo
 * material que usa `api/code.test.ts` — el objetivo es que el motor DEVUELVA
 * algo, no medir nada.
 */
const DUPLICATED_SOURCE = `
function calculatePriceA(amount) {
  let total = 0;
  if (amount > 100) {
    total = amount * 0.8;
  } else if (amount > 50) {
    total = amount * 0.9;
  } else {
    total = amount;
  }
  total = total + 1;
  total = total + 2;
  total = total + 3;
  return total;
}

function calculatePriceB(value) {
  let total = 0;
  if (value > 100) {
    total = value * 0.8;
  } else if (value > 50) {
    total = value * 0.9;
  } else {
    total = value;
  }
  total = total + 1;
  total = total + 2;
  total = total + 3;
  return total;
}
`;

let tmpDir: string;

function makeRepo(withGit: boolean): string {
  const dir = path.join(tmpDir, withGit ? "repo-git" : "repo-plano");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pricing.js"), DUPLICATED_SOURCE, "utf8");
  if (withGit) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "motor@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Motor"], { cwd: dir });
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  }
  return dir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ck-motor-solo-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Ola BC — el motor arranca sin el tablero", () => {
  it("analiza un directorio EN FRÍO: sin base de datos, sin taskId, sin nada", async () => {
    const dir = makeRepo(false);

    const analysis = await analyzeDirectory({ dir, repoName: "repo-suelto" });

    expect(analysis.repoName).toBe("repo-suelto");
    expect(analysis.analysedFiles).toBeGreaterThan(0);
    expect(analysis.findings.length).toBeGreaterThan(0);
    // El hallazgo trae lo que un consumidor necesita para mostrarlo.
    const first = analysis.findings[0]!;
    expect(typeof first.title).toBe("string");
    expect(typeof first.kind).toBe("string");
    expect(typeof first.metric.value).toBe("number");
  }, 120_000);

  it("analiza CON CACHÉ PERSISTENTE sobre una base que el motor mismo prepara", async () => {
    const dir = makeRepo(true);

    // Así arranca un consumidor nuevo. Tres líneas, ninguna del tablero.
    const db = new Database(":memory:");
    ensureEngineSchema(db);
    const engine = createAnalysisEngine(db);

    try {
      // `repoKey` es un string OPACO para el motor: acá es la ruta del repo,
      // no un `project_repos.id`. El motor no nota la diferencia.
      const request = { dir, repoName: "repo-cacheado", repoKey: dir };

      const first = await engine.analyze(request);
      expect(first.findings.length).toBeGreaterThan(0);
      // Los ids estables ya vienen puestos: son la clave de los descartes.
      expect(first.findings.every((f) => typeof f.id === "string" && f.id.length > 0)).toBe(true);

      // La instantánea de repo entero quedó escrita, y la segunda corrida la sirve.
      const snapshotRows = db
        .prepare("SELECT COUNT(*) AS n FROM code_file_facts WHERE file_path = ''")
        .get() as { n: number };
      expect(snapshotRows.n).toBe(1);

      const second = await engine.analyze(request);
      expect(second.findings.map((f) => f.id)).toEqual(first.findings.map((f) => f.id));

      // Descartes: entran por (repoKey, id de hallazgo). Ni un taskId.
      const targetId = first.findings[0]!.id!;
      engine.discard(dir, targetId, "no aplica en este repo");
      const decisions = engine.decisionsFor(dir);
      expect(decisions.get(targetId)?.reason).toBe("no aplica en este repo");

      engine.restore(dir, targetId);
      expect(engine.decisionsFor(dir).has(targetId)).toBe(false);
    } finally {
      db.close();
    }
  }, 180_000);

  it("la base del motor NO tiene ninguna tabla del tablero", () => {
    const db = new Database(":memory:");
    ensureEngineSchema(db);
    try {
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
          name: string;
        }[]
      ).map((r) => r.name);

      expect(tables).toEqual(["code_file_facts", "code_finding_decisions", "code_graphs"]);
      // Lo que importa de verdad: el motor no arrastra el modelo del tablero.
      expect(tables).not.toContain("tasks");
      expect(tables).not.toContain("projects");
      expect(tables).not.toContain("project_repos");
      expect(tables).not.toContain("task_repos");
    } finally {
      db.close();
    }
  });

  it("`ensureEngineSchema` es idempotente y deja las tres columnas aditivas", () => {
    const db = new Database(":memory:");
    try {
      ensureEngineSchema(db);
      ensureEngineSchema(db);
      ensureEngineSchema(db);
      const cols = (db.prepare("PRAGMA table_info(code_file_facts)").all() as { name: string }[]).map(
        (c) => c.name,
      );
      expect(cols).toContain("facts_json");
      expect(cols).toContain("facts_schema_version");
      expect(cols).toContain("facts_blob");
    } finally {
      db.close();
    }
  });
});
