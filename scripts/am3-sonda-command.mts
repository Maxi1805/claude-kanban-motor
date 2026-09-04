/**
 * OLA AM · FRENTE AM3 — SONDA de `Command · invariant-scaffold-varying-call` (no toca producción).
 * Para cada hallazgo del ancla: publica, por ubicación, el `symbolPath` del nodo del grafo y
 * la `family` de su DUEÑO INMEDIATO (el prefijo del `symbolPath` menos el último segmento).
 * El hecho que decide el candidato K3: "¿el lugar que repite el tratamiento es una función
 * ANIDADA dentro de otra función, en vez de un miembro de un tipo o una función de nivel superior?"
 *
 * Uso: npx tsx scripts/am3-sonda-command.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import type { CodeGraph, CodeGraphNode } from "../src/server/services/graph/types.js";

const [, , dir, out] = process.argv;
let graph: CodeGraph | null = null;
const { analysis: a } = await analyzeRepoCached({ dir: dir!, repoName: "am3", limits: { maxFindings: "unlimited" }, onGraph: (g: CodeGraph) => { graph = g; } } as never);
if (!graph) { console.error("SIN GRAFO"); process.exit(2); }
const g: CodeGraph = graph;
const porFileSym = new Map<string, CodeGraphNode>();
for (const n of g.nodes) if (n.kind === "symbol") porFileSym.set(`${n.file}#${n.symbolPath.join(".")}`, n);

const salida: unknown[] = [];
for (const f of a.findings) {
  if (f.kind !== "invariant-scaffold-varying-call") continue;
  const locs = f.locations.map((l) => {
    const n = porFileSym.get(`${l.file}#${l.symbol ?? ""}`);
    const path = (l.symbol ?? "").split(".");
    const padre = path.length > 1 ? porFileSym.get(`${l.file}#${path.slice(0, -1).join(".")}`) : undefined;
    return { file: l.file, line: l.startLine, symbol: l.symbol ?? "",
             family: n?.family ?? null, profundidad: path.length,
             familiaDelDueno: padre?.family ?? (path.length > 1 ? "(dueño no está en el grafo)" : "(nivel superior)") };
  });
  salida.push({ id: f.id, title: f.title, n: f.locations.length, locs });
}
writeFileSync(out!, JSON.stringify(salida, null, 1));
console.error(`${out}: ${salida.length} hallazgos`);
