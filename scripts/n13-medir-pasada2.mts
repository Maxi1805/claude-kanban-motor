/**
 * N13 — mide el costo REAL de la pasada 2 dentro de `code-inspector.ts`
 * (el consumidor de producción), no dentro de `analyzeRepo` en aislado.
 *
 * Escenario: repo grande (guava, Java), caché tibia (facts + grafo ya
 * persistidos), y se toca UN solo archivo — exactamente lo que pasa en un
 * poll normal del panel en vivo con una tarea abierta.
 *
 * Uso: npx tsx n13-medir-pasada2.mts <ruta-al-repo-git>
 */
import fs from "node:fs";
import path from "node:path";

import { CodeInspectorServiceImpl } from "./src/server/services/code-inspector.js";
import { initDb, type DB } from "./src/server/db/index.js";
import type { Repositories } from "./src/shared/interfaces.js";
import type { Task, TaskCodeResponse, TaskRepo } from "./src/shared/types.js";

const [, , repoDirArg] = process.argv;
if (!repoDirArg) {
  console.error("Uso: npx tsx n13-medir-pasada2.mts <ruta-al-repo-git>");
  process.exit(1);
}
const repoDir = path.resolve(repoDirArg);

function fakeRepos(taskRepos: TaskRepo[], tmpDir: string): Repositories {
  const task: Task = {
    id: "task-1",
    projectId: "proj-1",
    title: "medir pasada 2",
    description: null,
    status: "running",
    slug: "medir-pasada-2",
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

// Un .java arbitrario, no-trivial, que participa en la pasada 2 (Java trae
// implements/extends de sobra para `unused-variable`/`argument-mutation`).
function pickJavaFile(dir: string): string {
  const candidates = [
    "guava/src/com/google/common/collect/HashBiMap.java",
    "guava/src/com/google/common/collect/ImmutableBiMap.java",
    "guava/src/com/google/common/base/Preconditions.java",
  ];
  for (const rel of candidates) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error("no encontré ningún .java candidato conocido bajo " + dir);
}

async function main() {
  const db: DB = initDb(":memory:");
  const repos = fakeRepos([taskRepo("tr-1", "guava", repoDir)], repoDir);
  const targetFile = pickJavaFile(repoDir);
  const original = fs.readFileSync(targetFile, "utf8");
  console.log(`archivo tocado: ${targetFile}`);

  try {
    // 1) Corrida FRÍA — puebla facts (L2, sqlite) + graphBuildCache (P2, RAM) + snapshot (L2).
    const inspector1 = new CodeInspectorServiceImpl(repos, db);
    const cold = await timed("1) frío (dos pasadas ON)", () => waitDirect(inspector1));
    console.log(
      `   hallazgos=${cold.result.repos[0].analysis?.findings.length} error=${cold.result.repos[0].error ?? "-"}`,
    );

    // 2) Poll sin tocar nada — control: debe ser ~0 (cache L1 en RAM, mismo
    //    proceso, misma firma mtime).
    const noTouch = await timed("2) poll sin tocar nada (control)", () => waitDirect(inspector1));
    console.log(`   hallazgos=${noTouch.result.repos[0].analysis?.findings.length}`);

    // 3) Tocar UN solo archivo (comentario trivial) y pedir de nuevo, CON
    //    dos pasadas — esto es el escenario real: un poll del panel en vivo
    //    justo después de que el usuario edita un archivo.
    fs.writeFileSync(targetFile, original + "\n// n13-medicion-a\n");
    const touchedOn = await timed(
      "3) UN archivo tocado, dos pasadas ON (escenario real de poll)",
      () => waitDirect(inspector1),
    );
    console.log(`   hallazgos=${touchedOn.result.repos[0].analysis?.findings.length}`);

    // 4) Mismo escenario pero con el interruptor de vuelta atrás apagado —
    //    aísla lo que cuesta la pasada 2 sola. Cambio DISTINTO al de (3)
    //    para no pegarle a un snapshot ya cacheado bajo esa firma. MISMO
    //    `inspector1` (no uno nuevo): así el `graphBuildCache` (P2, RAM,
    //    incremental) sigue TIBIO igual que en el paso 3 — si usara una
    //    instancia nueva, el delta (3)-(4) mezclaría "costo de la pasada 2"
    //    con "costo de un build de grafo FRÍO", que es un efecto distinto.
    process.env.CK_ANALISIS_DOS_PASADAS = "0";
    fs.writeFileSync(targetFile, original + "\n// n13-medicion-b\n");
    const touchedOff = await timed(
      "4) UN archivo tocado, dos pasadas OFF (mismo cambio, aísla el costo)",
      () => waitDirect(inspector1),
    );
    console.log(`   hallazgos=${touchedOff.result.repos[0].analysis?.findings.length}`);
    delete process.env.CK_ANALISIS_DOS_PASADAS;

    console.log("\n--- resumen ---");
    console.log(`frío:                          ${cold.ms.toFixed(0)} ms`);
    console.log(`poll sin cambios (control):    ${noTouch.ms.toFixed(0)} ms`);
    console.log(`1 archivo, dos pasadas ON:     ${touchedOn.ms.toFixed(0)} ms`);
    console.log(`1 archivo, dos pasadas OFF:    ${touchedOff.ms.toFixed(0)} ms`);
    console.log(`costo atribuible a la pasada 2 en ESTE poll: ${(touchedOn.ms - touchedOff.ms).toFixed(0)} ms`);
  } finally {
    fs.writeFileSync(targetFile, original);
    console.log(`\narchivo restaurado a su contenido original: ${targetFile}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
