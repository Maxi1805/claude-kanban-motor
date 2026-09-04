/**
 * C2 (Ola U) — ¿CUÁL es el único símbolo nuevo que el hueco #1 agrega en el
 * repo de C# del corpus, y por qué es uno solo?
 *
 * Recorre los `.cs` del repo con `analyzeFile` (camino de producción) y vuelca
 * los símbolos cuyo `nodeType` es un nodo de ASIGNACIÓN — la firma exacta de
 * un campo declarado en el constructor.
 *
 * Uso: npx tsx scripts/probes/u-c2-cs-campos.mts <dir-del-repo> <extension>
 */
import { analyzeFile, collectFiles } from "../../src/server/services/code-analyzer.js";

const dir = process.argv[2] ?? "/home/maxi1805/claude-kanban/corpus/newtonsoft-json";
const ext = process.argv[3] ?? ".cs";

const files = await collectFiles(dir);
let vistos = 0;
let campos = 0;
for (const f of files) {
  if (!f.path.endsWith(ext)) continue;
  vistos++;
  const facts = await analyzeFile({ dir, path: f.path });
  if (!facts) continue;
  for (const s of facts.symbols) {
    if (s.family !== "other" || !/(^|_)assignment(_expression|_statement)?$/.test(s.nodeType)) continue;
    campos++;
    console.log(`${f.path}:${s.startLine}  ${[...s.container, s.name].join(".")}  (${s.nodeType})`);
  }
}
console.log(`\n${vistos} archivo(s) ${ext} · ${campos} campo(s) de constructor`);
