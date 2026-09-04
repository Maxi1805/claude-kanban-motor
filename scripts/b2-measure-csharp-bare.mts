/**
 * B2 (Ola X) — medición AISLADA y BARATA del patrón BARE-FIELD nuevo en
 * `detect/intra-file/homonymous-delegation.ts`, sin pasar por
 * `analyzeRepoCached` (grafo + 30 detectores + 16 hipótesis): corre SÓLO
 * este detector, con el mismo `fileUnitFrom`/`deriveNodeSets` REALES que usa
 * `detect/testing.ts` (el arnés de test compartido, real tree-sitter, real
 * gramática .wasm) — no hace falta el semáforo pesado del árbol completo
 * porque no construye el grafo cross-file ni corre los otros detectores.
 *
 * Uso: npx tsx scripts/b2-measure-csharp-bare.mts <dir-con-.cs>
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { detector } from "../src/server/services/detect/intra-file/homonymous-delegation.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../src/server/services/detect/testing.js";

const CSHARP_PROBE = `
class Animal {
  void Speak() {
    System.Console.WriteLine("generic sound");
  }
}
class Dog : Animal {
  void Speak() {
    System.Console.WriteLine("woof");
  }
}
`;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (entry.endsWith(".cs")) out.push(p);
  }
}

const [, , dir] = process.argv;
if (!dir) {
  console.error("Uso: npx tsx scripts/b2-measure-csharp-bare.mts <dir-con-.cs>");
  process.exit(1);
}

const t0 = performance.now();
const files: string[] = [];
walk(dir, files);
console.error(`archivos .cs: ${files.length}`);

const sets = await nodeSetsFor("tree-sitter-c_sharp.wasm", CSHARP_PROBE);
const ctx = testContext(detector, "csharp");

let total = 0;
const rows: { file: string; line: number | undefined; symbol: string | undefined; role: string | undefined }[] = [];
for (const f of files) {
  const source = readFileSync(f, "utf8");
  const astRoot = await parseRoot("tree-sitter-c_sharp.wasm", source);
  const file = fileUnitFrom(astRoot, sets, "csharp", { file: f });
  const findings = detector.run(file, ctx);
  total += findings.length;
  for (const finding of findings) {
    rows.push({
      file: f,
      line: finding.locations[0]?.startLine,
      symbol: finding.locations[0]?.symbol,
      role: finding.locations[0]?.role,
    });
  }
}
const wallMs = Math.round(performance.now() - t0);
console.log(JSON.stringify({ dir, files: files.length, total, wallMs, rows }, null, 2));
console.error(`total: ${total} hallazgos, ${wallMs}ms`);
