/**
 * OLA V · V7 — convierte /tmp/v7/judgments.tsv (pattern\trepo\tfile\tline\tverdict\tnote) en el
 * JSON de veredictos {"<id>": {"verdict","note"}} que el integrador aplica, resolviendo el id
 * REAL (stableFindingId::pattern) contra el censo actual. Cuando una (pattern,repo,file,line)
 * tiene MÁS DE UN id vivo (dos anclas distintas sobre la misma línea), se escribe el veredicto
 * para TODOS los ids que matchean — mismo código, mismo juicio.
 *
 * Uso: npx tsx scripts/v7-build-veredictos.mts <censo-dir> <judgments.tsv> <salida.json>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const [, , censoDir, tsvPath, outPath] = process.argv;
if (!censoDir || !tsvPath || !outPath) {
  console.error("Uso: npx tsx scripts/v7-build-veredictos.mts <censo-dir> <judgments.tsv> <salida.json>");
  process.exit(1);
}

// key: pattern|repo|file|line -> ids[]
const idsByLoc = new Map<string, string[]>();
for (const f of readdirSync(censoDir).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(path.join(censoDir, f), "utf8")) as { slug: string; rows: { id: string; pattern: string; file: string; line: number }[] };
  for (const r of d.rows) {
    const key = `${r.pattern}|${d.slug}|${r.file}|${r.line}`;
    const bucket = idsByLoc.get(key);
    if (bucket) { if (!bucket.includes(r.id)) bucket.push(r.id); }
    else idsByLoc.set(key, [r.id]);
  }
}

const out: Record<string, { verdict: string; note: string }> = {};
let matched = 0;
let unmatched = 0;
const lines = readFileSync(tsvPath, "utf8").split("\n").filter((l) => l.trim());
for (const line of lines) {
  const [pattern, repo, file, lineStr, verdict, ...noteParts] = line.split("\t");
  const note = noteParts.join("\t");
  const lineNum = Number(lineStr);
  const key = `${pattern}|${repo}|${file}|${lineNum}`;
  const ids = idsByLoc.get(key);
  if (!ids || ids.length === 0) {
    console.error(`[v7-build-veredictos] SIN MATCH: ${key}`);
    unmatched++;
    continue;
  }
  for (const id of ids) {
    out[id] = { verdict, note };
    matched++;
  }
}

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`[v7-build-veredictos] ${matched} ids escritos (${Object.keys(out).length} únicos), ${unmatched} filas sin match, -> ${outPath}`);
