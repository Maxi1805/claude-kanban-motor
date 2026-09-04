/**
 * EL INSTRUMENTO DE RECALL, mitad 1 de 2 (la que CRUZA) — toma un volcado
 * completo de `scripts/dump-hallazgos.mts` y deja escrito, fila por fila, cuál
 * de los hallazgos juzgados `verdadero` de ese slug sigue vivo.
 *
 * Simétrico de `sample-findings-for-judgment.mts` ↔ `precision-report.mts`: la
 * mitad cara (correr el analizador) se paga acá y una sola vez; la mitad
 * barata (`recall-report.mts`, `recall-gate.test.ts`) sólo lee archivos.
 *
 * NO CORRE EL ANALIZADOR ÉL MISMO, a propósito. Recibe el JSON que
 * `dump-hallazgos.mts` ya sabe producir (con caché por SHA + huella del
 * analizador, semáforo de memoria, y `maxFindings: "unlimited"` que es lo que
 * hace que el pool sea el POOL y no una muestra). Duplicar esa invocación acá
 * sería duplicar tres decisiones difíciles que ya están tomadas y probadas en
 * otro archivo.
 *
 * Uso:
 *   CK_CORPUS_DIR=/home/maxi1805/claude-kanban ./scripts/con-analisis.sh \
 *     npx tsx scripts/dump-hallazgos.mts corpus/cobra /tmp/cobra.json
 *   npx tsx scripts/recall-snapshot.mts cobra /tmp/cobra.json
 *
 *   # varios de una:
 *   npx tsx scripts/recall-snapshot.mts --lote /tmp/base-{slug}.json cobra hugo click
 *
 * Opciones:
 *   --dir <ruta>        directorio de snapshots (default `tests/golden/precision/recall/`)
 *   --sin-huella        no calcular la huella del analizador (más rápido; el
 *                       snapshot queda sin poder marcarse vigente ni viejo)
 *   --huella <hash>     usar ESA huella en vez de la del árbol de trabajo. Existe
 *                       por un caso real y no por generalidad: la LÍNEA BASE de la
 *                       compuerta se midió con el árbol congelado del cierre de la
 *                       ola anterior (extraído de un respaldo), mientras el árbol de
 *                       trabajo ya tenía doce frentes editándolo. Poner la huella de
 *                       HOY en un snapshot medido con el analizador de AYER lo haría
 *                       pasar por vigente sin serlo, que es exactamente la mentira
 *                       que el campo existe para impedir.
 *   --nota <texto>      se guarda en `source`, para dejar rastro de con qué
 *                       árbol se midió (p.ej. "línea base post-Ola-O")
 *
 * LA TRAMPA QUE ESTE SCRIPT NO PISA: la columna `stillPresent` de la planilla
 * NO responde esta pregunta — la escribe `mergeRows` contra la MUESTRA de la
 * corrida, no contra el pool completo, así que un hallazgo vivo que no salió
 * sorteado figura ausente. Ver el docstring de `dump-hallazgos.mts`. Acá el
 * pool es el volcado entero y `stillPresent` no se lee ni una vez.
 */
import fs from "node:fs";
import path from "node:path";

import { analyzerFingerprint } from "../src/server/services/analyze-cache.js";
import {
  buildLivePool,
  classifyRow,
  type DumpedFinding,
  type RecallSnapshot,
  type RecallStatus,
} from "../src/server/services/detect/precision/recall-logic.js";
import { RECALL_DIR, recallSnapshotPath, writeRecallSnapshot } from "../src/server/services/detect/precision/recall-snapshot-io.js";
import { readPrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const PRECISION_DIR = path.join(REPO_ROOT, "tests", "golden", "precision");
const MANIFEST = path.join(REPO_ROOT, "tests", "golden", "manifest.json");

function shaOf(slug: string): string {
  if (!fs.existsSync(MANIFEST)) return "";
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { corpus?: Record<string, { sha?: string }> };
  return m.corpus?.[slug]?.sha ?? "";
}

function flagValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function buildSnapshot(slug: string, dumpPath: string, fingerprint: string, nota: string): RecallSnapshot {
  const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8")) as { findings?: DumpedFinding[] };
  const findings = dump.findings ?? [];
  if (findings.length === 0) throw new Error(`${dumpPath}: 0 hallazgos — ¿volcado vacío o de otro formato?`);
  const pool = buildLivePool(findings);

  const csv = path.join(PRECISION_DIR, `${slug}.verdicts.csv`);
  const rows = readPrecisionCsv(csv).filter((r) => r.verdict === "verdadero");
  if (rows.length === 0) {
    console.error(`AVISO ${slug}: la planilla no tiene ninguna fila juzgada "verdadero" — snapshot vacío.`);
  }

  const status: Record<string, RecallStatus> = {};
  for (const r of rows) {
    const s = classifyRow(r, pool);
    // Una fila duplicada por id (documentado en `mergeRows`) puede caer dos
    // veces acá; el cruce es determinista sobre el mismo id, así que reescribir
    // el mismo valor es inocuo.
    status[r.id] = s;
  }

  return {
    slug,
    sha: shaOf(slug),
    measuredAt: new Date().toISOString(),
    analyzerFingerprint: fingerprint,
    poolFindings: findings.length,
    source: nota === "" ? dumpPath : `${dumpPath} — ${nota}`,
    status,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dir = flagValue(argv, "--dir") ?? RECALL_DIR;
  const nota = flagValue(argv, "--nota") ?? "";
  const sinHuella = argv.includes("--sin-huella");
  const huellaFijada = flagValue(argv, "--huella");
  const lote = flagValue(argv, "--lote");

  const flagsConValor = new Set(["--dir", "--nota", "--lote", "--huella"]);
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (flagsConValor.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    positional.push(a);
  }

  const trabajos: { slug: string; dump: string }[] = [];
  if (lote !== undefined) {
    if (!lote.includes("{slug}")) {
      console.error('--lote necesita un patrón con "{slug}", p.ej. /tmp/base-{slug}.json');
      process.exit(1);
    }
    for (const slug of positional) trabajos.push({ slug, dump: lote.replace("{slug}", slug) });
  } else {
    const [slug, dump] = positional;
    if (!slug || !dump) {
      console.error("Uso: npx tsx scripts/recall-snapshot.mts <slug> <volcado.json> [--dir X] [--nota T] [--sin-huella]");
      console.error("     npx tsx scripts/recall-snapshot.mts --lote /tmp/base-{slug}.json <slug>...");
      process.exit(1);
      return;
    }
    trabajos.push({ slug, dump });
  }

  if (trabajos.length === 0) {
    console.error("Nada que hacer: no se pasó ningún slug.");
    process.exit(1);
  }

  const fingerprint = sinHuella ? "" : (huellaFijada ?? (await analyzerFingerprint()));

  for (const { slug, dump } of trabajos) {
    const snap = buildSnapshot(slug, dump, fingerprint, nota);
    const out = recallSnapshotPath(slug, dir);
    writeRecallSnapshot(out, snap);
    const total = Object.keys(snap.status).length;
    const perdidos = Object.values(snap.status).filter((s) => s === "perdido").length;
    const porContenido = Object.values(snap.status).filter((s) => s === "contenido").length;
    console.log(
      `${slug.padEnd(18)} ${total - perdidos}/${total} vivos` +
        `${porContenido > 0 ? ` (${porContenido} sólo por contenido)` : ""}` +
        ` · ${perdidos} perdido(s) · pool ${snap.poolFindings} · ${out}`,
    );
  }
}

await main();
