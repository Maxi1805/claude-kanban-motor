/**
 * AJ5 — SONDA: ¿EXISTE EL HECHO DE GRAFO que haría falta para cerrar la SEGUNDA
 * compuerta imposible de `state.ts` (el miembro HEREDADO o de otra parte
 * `partial`)?
 *
 * `declaresMemberNamed` sólo mira el cuerpo de la clase que CONTIENE al switch,
 * en ESTE archivo. El caso canónico del patrón —`JsonReader.cs:118 internal
 * State _currentState;` + `public partial class JsonTextReader` en
 * `JsonTextReader.Async.cs`— muere por eso. La vía para abrirlo sería:
 * owner del hallazgo -> aristas `extends`/`implements` -> nodo del ancestro ->
 * su `file` -> `ctx.fileAt(file)` -> escanear el cuerpo del ancestro.
 *
 * Esta sonda verifica la ÚNICA pieza que no está probada: **¿el grafo trae la
 * arista `extends` entre esas dos clases, y el nodo del ancestro trae su
 * archivo?** Si NO existe, la conclusión es negativa y no se aterriza nada.
 *
 * Uso: npx tsx scripts/aj5-sonda-herencia.mts <dir-repo> <clase-derivada> <clase-base>
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, derivada, base] = process.argv;
if (!dir || !derivada) {
  console.error("Uso: npx tsx scripts/aj5-sonda-herencia.mts <dir-repo> <clase-derivada> [clase-base]");
  process.exit(1);
}

let graph: CodeGraph | null = null;
await analyzeRepo({
  dir,
  repoName: "aj5-sonda",
  limits: { maxFindings: "unlimited" },
  onGraph: (r: { graph: CodeGraph }) => {
    graph = r.graph;
  },
} as any);

if (!graph) {
  console.log("SIN GRAFO — conclusión negativa.");
  process.exit(0);
}
const g: CodeGraph = graph;
const last = (n: { symbolPath: readonly string[] }) => n.symbolPath[n.symbolPath.length - 1];

const nodosDerivada = g.nodes.filter((n) => n.kind === "symbol" && last(n) === derivada);
console.log(`nodos llamados "${derivada}": ${nodosDerivada.length}`);
for (const n of nodosDerivada) console.log(`   ${n.id}  family=${n.family}  file=${n.file}`);

if (base) {
  const nodosBase = g.nodes.filter((n) => n.kind === "symbol" && last(n) === base);
  console.log(`nodos llamados "${base}": ${nodosBase.length}`);
  for (const n of nodosBase) console.log(`   ${n.id}  family=${n.family}  file=${n.file}`);
}

const ids = new Set(nodosDerivada.map((n) => n.id));
const salientes = g.edges.filter((e) => ids.has(e.from) && (e.kind === "extends" || e.kind === "implements"));
console.log(`aristas extends/implements SALIENTES de "${derivada}": ${salientes.length}`);
for (const e of salientes) {
  const t = g.nodes.find((n) => n.id === e.to);
  console.log(`   ${e.kind} -> ${e.to}  (${t ? `${last(t)} @ ${t.file} family=${t.family}` : "NODO NO RESUELTO"})  provenance=${e.provenance}`);
}

const totalExtends = g.edges.filter((e) => e.kind === "extends").length;
const totalImpl = g.edges.filter((e) => e.kind === "implements").length;
console.log(`\nTOTAL en el repo: extends ${totalExtends} · implements ${totalImpl} · nodos ${g.nodes.length} · aristas ${g.edges.length}`);
