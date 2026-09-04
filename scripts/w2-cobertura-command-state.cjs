/**
 * w2-cobertura-command-state.cjs — Ola W, frente W2.
 *
 * Cruza los `verdadero` de `tests/golden/precision/<repo>.verdicts.csv` (kind
 * en {duplication, distributed-duplication} para Command; {repeated-switch,
 * conditional-chain} para State) contra `hypotheses[]` de un volcado de
 * `scripts/dump-hallazgos.mts` (mismo `id` = mismo `stableFindingId`) — la
 * COBERTURA del encargo: de los problemas reales del nivel 1 de estos kinds,
 * ¿cuántos reciben una hipótesis en CUALQUIER estado, y cuántos en estado
 * `ausente`/`parcial` (recomendación real)? También agrega la población de
 * hipótesis Command/State por estado (con lenguaje `null` para Command,
 * ancla `inter-file` — ver docstring de `hypotheses/command.ts`).
 *
 * Uso: node w2-coverage.cjs <repo1> <repo2> ... — lee
 * `/tmp/w2-out/<repo>.json` (volcados ya generados con
 * `scripts/dump-hallazgos.mts`) y `tests/golden/precision/<repo>.verdicts.csv`.
 */
const fs = require("fs");

function parseCSV(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let idx = 0; idx < text.length; idx++) {
    const c = text[idx];
    if (inQuotes) {
      if (c === '"') {
        if (text[idx + 1] === '"') { field += '"'; idx++; } else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const repos = process.argv.slice(2);
const COMMAND_KINDS = new Set(["duplication", "distributed-duplication"]);
const STATE_KINDS = new Set(["repeated-switch", "conditional-chain"]);

const byKind = {};
const patternStates = {}; // pattern -> state -> lang -> count
const patternPop = {}; // pattern -> total hypotheses

for (const repo of repos) {
  const dump = JSON.parse(fs.readFileSync(`/tmp/w2-out/${repo}.json`, "utf8"));
  const findingsById = new Map(dump.findings.map((f) => [f.id, f]));

  // hipótesis por estado/lenguaje — recorremos TODOS los findings del repo (no sólo los "verdadero")
  for (const f of dump.findings) {
    for (const h of f.hypotheses || []) {
      if (h.pattern !== "Command" && h.pattern !== "State") continue;
      patternPop[h.pattern] = (patternPop[h.pattern] || 0) + 1;
      patternStates[h.pattern] = patternStates[h.pattern] || {};
      patternStates[h.pattern][h.state] = patternStates[h.pattern][h.state] || {};
      const lang = f.language || "null";
      patternStates[h.pattern][h.state][lang] = (patternStates[h.pattern][h.state][lang] || 0) + 1;
    }
  }

  const verdictsPath = `tests/golden/precision/${repo}.verdicts.csv`;
  if (!fs.existsSync(verdictsPath)) { console.error("no verdicts for", repo); continue; }
  const verdicts = parseCSV(fs.readFileSync(verdictsPath, "utf8"));
  for (const v of verdicts) {
    if (v.verdict !== "verdadero") continue;
    const kind = v.kind;
    if (!COMMAND_KINDS.has(kind) && !STATE_KINDS.has(kind)) continue;
    byKind[kind] = byKind[kind] || { total: 0, withHyp: 0, withRec: 0, misses: [] };
    byKind[kind].total++;
    const f = findingsById.get(v.id);
    if (f) {
      const hyps = (f.hypotheses || []).filter((h) => h.pattern === "Command" || h.pattern === "State");
      if (hyps.length > 0) byKind[kind].withHyp++;
      const rec = hyps.some((h) => h.state === "ausente" || h.state === "parcial");
      if (rec) byKind[kind].withRec++;
      else byKind[kind].misses.push({ repo, id: v.id, file: v.file, line: v.startLine, symbol: v.symbol, hyps: hyps.map((h) => `${h.pattern}:${h.state}`) });
    } else {
      byKind[kind].misses.push({ repo, id: v.id, file: v.file, line: v.startLine, note: "NOT FOUND IN DUMP (id mismatch or repo not re-dumped)" });
    }
  }
}

console.log("=== COBERTURA (verdadero del nivel 1, por kind) ===");
console.log(JSON.stringify(byKind, null, 2));
console.log("\n=== HIPÓTESIS por estado y lenguaje ===");
console.log(JSON.stringify(patternStates, null, 2));
console.log("\n=== poblacion total ===", JSON.stringify(patternPop));
