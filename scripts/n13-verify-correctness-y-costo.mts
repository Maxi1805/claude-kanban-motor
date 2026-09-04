/**
 * N13 — sobre un repo más chico que guava (rápido, sin pelear tanto por el
 * semáforo): dos preguntas.
 *
 * (A) CORRECCIÓN: `analyzeRepo` SIN ninguno de mis caches nuevos (la vía que
 *     `census.ts`/`dump-hallazgos.mts` ya usan hoy, sin tocar) vs
 *     `CodeInspectorServiceImpl` CON `safeStringify`/`intraGraphCache`
 *     activos — `totalByKind` tiene que ser IDÉNTICO. Los caches nunca
 *     deben cambiar QUÉ se detecta, sólo cuánto tarda en volver a servirse.
 *
 * (B) COSTO: el mismo escenario de `n13-medir-pasada2.mts` (un archivo
 *     tocado, poll real) pero ahora CON el arreglo — para ver el ahorro.
 *
 * Uso: npx tsx n13-verify-correctness-y-costo.mts <ruta-al-repo-git>
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepo } from "./src/server/services/code-analyzer.js";
import { CodeInspectorServiceImpl } from "./src/server/services/code-inspector.js";
import { initDb, type DB } from "./src/server/db/index.js";
import type { Repositories } from "./src/shared/interfaces.js";
import type { Task, TaskCodeResponse, TaskRepo } from "./src/shared/types.js";

const [, , repoDirArg] = process.argv;
if (!repoDirArg) {
  console.error("Uso: npx tsx n13-verify-correctness-y-costo.mts <ruta-al-repo-git>");
  process.exit(1);
}
const repoDir = path.resolve(repoDirArg);

function fakeRepos(taskRepos: TaskRepo[], tmpDir: string): Repositories {
  const task: Task = {
    id: "task-1",
    projectId: "proj-1",
    title: "verificar N13",
    description: null,
    status: "running",
    slug: "verificar-n13",
    sessionRoot: tmpDir,
    ptyPid: null,
    claudeSessionId: null,
    cavemanEnabled: false,
    cavemanLevel: null,
    cavemanSession: null,
    port: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    repos: taskRepos,
  };
  return {
    tasks: { getById: (id: string) => (id === "task-1" ? task : null) },
    projects: {},
    projectRepos: {},
    taskRepos: {},
  } as unknown as Repositories;
}

const taskRepo = (id: string, name: string, worktreePath: string): TaskRepo => ({
  id,
  taskId: "task-1",
  projectRepoId: `pr-${id}`,
  repoName: name,
  branchName: "main",
  worktreePath,
  remotePushed: false,
});

async function waitDirect(inspector: CodeInspectorServiceImpl): Promise<TaskCodeResponse> {
  const deadline = Date.now() + 600_000;
  for (;;) {
    const res = await inspector.forTask("task-1");
    if (res.repos.every((r) => r.analyzing !== true)) return res;
    if (Date.now() > deadline) throw new Error("el análisis no terminó a tiempo");
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms.toFixed(0)} ms`);
  return { ms, result };
}

function pickTsFile(dir: string): string {
  // Cualquier .ts razonablemente chico bajo src, no test, no .d.ts.
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") && !e.name.includes(".spec.") && !e.name.includes(".test.")) {
        const size = fs.statSync(full).size;
        if (size > 200 && size < 20_000) return full;
      }
    }
  }
  throw new Error("no encontré ningún .ts candidato bajo " + dir);
}

function totalByKindSummary(t: Record<string, number>): string {
  return Object.entries(t)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, n]) => `${k}=${n}`)
    .join(", ");
}

async function main() {
  // (A) CORRECCIÓN — analyzeRepo SIN ninguno de mis caches, la vía que
  // census.ts/dump-hallazgos.mts ya usan, sin tocar por esta tarea.
  const baseline = await timed("(A) analyzeRepo sin caches (línea base, vía de siempre)", () =>
    analyzeRepo({ dir: repoDir, repoName: "baseline", limits: { maxFindings: "unlimited" } }),
  );
  console.log(`   totalByKind: ${totalByKindSummary(baseline.result.totalByKind ?? {})}`);

  const db: DB = initDb(":memory:");
  const repos = fakeRepos([taskRepo("tr-1", "repo", repoDir)], repoDir);
  const inspector = new CodeInspectorServiceImpl(repos, db);
  const viaInspector = await timed("(A) CodeInspectorServiceImpl CON safeStringify+intraGraphCache (frío)", () =>
    waitDirect(inspector),
  );
  const analysisA = viaInspector.result.repos[0].analysis;
  console.log(`   error=${viaInspector.result.repos[0].error ?? "-"} hallazgos=${analysisA?.findings.length}`);

  if (viaInspector.result.repos[0].error) {
    console.error("FALLA: code-inspector.ts todavía revienta — el arreglo no alcanza.");
    process.exit(1);
  }

  // `findingsTotal`/`totalByKind` son la línea base honesta (antes de la
  // página) en AMBOS lados — comparables sin importar MAX_STORED_FINDINGS.
  const baselineTotal = baseline.result.findingsTotal;
  const inspectorTotal = analysisA?.findingsTotal;
  console.log(`\n(A) findingsTotal: base=${baselineTotal} vs inspector=${inspectorTotal} — ${baselineTotal === inspectorTotal ? "IGUAL" : "*** DISTINTO ***"}`);
  const baseKind = JSON.stringify(baseline.result.totalByKind, Object.keys(baseline.result.totalByKind ?? {}).sort());
  const inspKind = JSON.stringify(analysisA?.totalByKind ?? {}, Object.keys(analysisA?.totalByKind ?? {}).sort());
  console.log(`(A) totalByKind: ${baseKind === inspKind ? "IDÉNTICO" : "*** DISTINTO ***"}`);
  if (baseKind !== inspKind) {
    console.error("   base:", baseKind);
    console.error("   insp:", inspKind);
  }

  // (B) COSTO — un archivo tocado, dos veces (segunda vez debería pegarle al
  // intraGraphCache para todo archivo cuyo contenido Y el grafo no cambiaron).
  const targetFile = pickTsFile(repoDir);
  const original = fs.readFileSync(targetFile, "utf8");
  console.log(`\n(B) archivo tocado: ${targetFile}`);
  try {
    const noTouch = await timed("(B) poll sin tocar nada (control, debe ser ~0)", () => waitDirect(inspector));
    console.log(`   hallazgos=${noTouch.result.repos[0].analysis?.findings.length}`);

    fs.writeFileSync(targetFile, original + "\n// n13-medicion-a\n");
    const touchedOnce = await timed("(B) 1er poll tras tocar UN archivo (con el arreglo)", () => waitDirect(inspector));
    console.log(`   error=${touchedOnce.result.repos[0].error ?? "-"} hallazgos=${touchedOnce.result.repos[0].analysis?.findings.length}`);

    // Un SEGUNDO poll, SIN tocar nada más: si el intraGraphCache funciona,
    // este debería volver a ser instantáneo (misma huella del grafo que el
    // poll anterior, y ningún archivo cambió) — el mismo camino "sin tocar
    // nada" de arriba, ahora DESPUÉS de que el grafo se movió una vez.
    const noTouchAgain = await timed("(B) 2do poll sin tocar nada (post-touch, control)", () => waitDirect(inspector));
    console.log(`   hallazgos=${noTouchAgain.result.repos[0].analysis?.findings.length}`);
  } finally {
    fs.writeFileSync(targetFile, original);
    console.log(`\narchivo restaurado: ${targetFile}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
