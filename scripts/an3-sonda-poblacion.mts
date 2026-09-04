/**
 * AN3 — SONDA DE POBLACIÓN (no toca producción). Reproduce, contra la copia congelada
 * `scratchpad-an3/src0`, exactamente `FacadeGraphView.internalCollaboratorsOf` /
 * `externalReferencersOf` (misma proyección `file` + mismos `pagerank.edgeKinds`) y cruza:
 *   · archivos con fan-out interno >= 4 (el propio piso de Facade, FACADE_MIN_COLLABORATORS)
 *   · archivos con al menos un hallazgo de NIVEL 2 (`long-function`/`complexity`/`primitive-obsession`)
 *   · archivos que YA alcanza alguna de las tres anclas de Facade
 * Contesta cuánta población NUEVA habría, y en qué repos.
 */
import { writeFileSync } from "node:fs";
const { analyzeRepoCached } = await import("../scratchpad-an3/src0/server/services/analyze-cache.js");
const { projectGraph } = await import("../scratchpad-an3/src0/server/services/graph/metrics/projection.js");
const { pagerank } = await import("../scratchpad-an3/src0/server/services/graph/metrics/pagerank.js");
const { fileNodeId } = await import("../scratchpad-an3/src0/server/services/graph/types.js");

const [, , dir, out] = process.argv;
const { analysis: a, graph } = await analyzeRepoCached({ dir, repoName: "an3", limits: { maxFindings: "unlimited" } } as any) as any;
if (!graph) { console.log(`${dir}: SIN GRAFO`); process.exit(0); }

const pr = projectGraph(graph, "file", pagerank.edgeKinds) as any;
const { nodeIds, indexOf, out: adjOut } = pr;
const inbound: number[][] = nodeIds.map(() => []);
for (let i = 0; i < adjOut.length; i++) for (const j of adjOut[i]) inbound[j].push(i);
const pathOf = (id: string): string | null => (id.startsWith("file:") ? id.slice(5) : null);
const dedup = (idxs: readonly number[]): string[] => { const s = new Set<string>(); for (const i of idxs) { const p = pathOf(nodeIds[i]); if (p) s.add(p); } return [...s]; };
const fanOutOf = (f: string): number => { const i = indexOf.get(fileNodeId(f)); return i === undefined ? 0 : dedup(adjOut[i]).length; };
const fanInOf = (f: string): number => { const i = indexOf.get(fileNodeId(f)); return i === undefined ? 0 : dedup(inbound[i]).length; };

const N2 = new Set(["long-function", "complexity", "primitive-obsession"]);
const ANC = new Set(["fanout-without-cohesion", "god-component", "repeated-collaborator-set"]);
const n2Files = new Map<string, Set<string>>();   // archivo -> kinds de nivel 2
const anchoredFiles = new Set<string>();          // archivo tocado por alguna ancla de Facade
const facadeFiles = new Set<string>();            // archivo que YA recibe una hipótesis de Facade
for (const f of a.findings as any[]) {
  if (N2.has(f.kind)) for (const l of f.locations) { const s = n2Files.get(l.file) ?? new Set<string>(); s.add(f.kind); n2Files.set(l.file, s); }
  if (ANC.has(f.kind)) { for (const l of f.locations) anchoredFiles.add(l.file); if ((f.hypotheses ?? []).some((h: any) => h.pattern === "Facade")) for (const l of f.locations) facadeFiles.add(l.file); }
}

const repoFiles = new Set<string>();
for (const id of nodeIds) { const p = pathOf(id); if (p) repoFiles.add(p); }

let conFanout4 = 0, conFanout4YN2 = 0, nuevos = 0;
const filas: any[] = [];
for (const f of repoFiles) {
  const fo = fanOutOf(f);
  if (fo < 4) continue;
  conFanout4++;
  const kinds = n2Files.get(f);
  if (!kinds) continue;
  conFanout4YN2++;
  const fi = fanInOf(f);
  const yaAncla = anchoredFiles.has(f);
  if (!yaAncla) nuevos++;
  filas.push({ file: f, fanOut: fo, fanIn: fi, n2: [...kinds].sort(), yaAncla, yaFacade: facadeFiles.has(f) });
}
console.log(`${dir}: archivos=${repoFiles.size}  fanOut>=4: ${conFanout4}  y con nivel2: ${conFanout4YN2}  de ésos SIN ancla de Facade hoy: ${nuevos}`);
const conFanIn = filas.filter((r) => r.fanIn >= 1);
console.log(`   con fan-in externo >=1 (el 2º required): ${conFanIn.length}   sin ancla y con fan-in: ${conFanIn.filter((r: any) => !r.yaAncla).length}`);
if (out) writeFileSync(out, JSON.stringify({ dir, archivos: repoFiles.size, conFanout4, conFanout4YN2, nuevos, filas }, null, 1));
