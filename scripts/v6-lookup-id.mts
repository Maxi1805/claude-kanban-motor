/**
 * OLA V · V6 — busca el `id` (stableFindingId) real de una fila del censo por
 * (patrón, repo, archivo, línea), para poder escribir veredictos/V6.json con ids reales.
 *
 * Uso: npx tsx scripts/v6-lookup-id.mts /tmp/v6/*.json <patrón>|<repo>|<archivo>|<línea> ...
 */
import { readFileSync } from "node:fs";

interface Row {
  id: string;
  repo: string;
  kind: string;
  pattern: string;
  state: string;
  lang: string;
  file: string;
  line: number;
}

const args = process.argv.slice(2);
const jsonFiles = args.filter((a) => a.endsWith(".json"));
const queries = args.filter((a) => !a.endsWith(".json"));

const allRows: Row[] = [];
for (const f of jsonFiles) {
  const data = JSON.parse(readFileSync(f, "utf8")) as { rows: Row[] };
  allRows.push(...data.rows);
}

for (const q of queries) {
  const [pattern, repo, file, lineStr] = q.split("|");
  const line = Number(lineStr);
  const matches = allRows.filter(
    (r) => r.pattern === pattern && r.repo === repo && r.file === file && r.line === line,
  );
  if (matches.length === 0) {
    console.log(`NO MATCH: ${q}`);
  } else {
    for (const m of matches) console.log(`${q} => ${m.id} [state=${m.state} kind=${m.kind}]`);
  }
}
