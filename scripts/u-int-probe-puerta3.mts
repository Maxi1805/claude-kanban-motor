/**
 * OLA U · INTEGRADOR — sonda de la PUERTA 3 de `detect/inter-file/unused-symbol.ts`.
 *
 * Responde, por LENGUAJE, la pregunta exacta que hace esa puerta ("¿esta corrida acreditó
 * el uso de ALGÚN miembro en este lenguaje?") y, sobre todo, CUÁNTAS aristas la acreditan y
 * POR QUÉ ETAPA se resolvieron. La puerta es hoy un booleano de UNA muestra; esta sonda es
 * lo que permite decidir si eso alcanza.
 *
 * Reusa la MISMA condición del detector (`edgeHasRole`, `edgeIsAmbiguous`, el mismo
 * `resolvedBy !== "self-receiver"`), no una reescrita a mano.
 *
 * Uso: npx tsx scripts/u-int-probe-puerta3.mts <dir> <slug>
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { edgeHasRole, edgeIsAmbiguous } from "../src/server/services/graph/types.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("Uso: npx tsx scripts/u-int-probe-puerta3.mts <dir> <slug>");
  process.exit(1);
}

const { analysis, graph } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
if (!graph) {
  console.error("sin grafo");
  process.exit(1);
}

const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
const langOfFile = new Map<string, string>();
for (const u of analysis.files ?? []) if (u.language) langOfFile.set(u.path, u.language);

function langOf(nodeId: string): string {
  const n = nodeById.get(nodeId);
  if (!n) return "?";
  return langOfFile.get(n.file) ?? "?";
}

const acredita = new Map<string, number>();
let totalRM = 0;
let ambRM = 0;
for (const e of graph.edges) {
  if (!edgeHasRole(e, "receiver-member")) continue;
  totalRM++;
  if (edgeIsAmbiguous(e)) {
    ambRM++;
    continue;
  }
  const lang = langOf(e.to);
  const by = e.resolvedBy ?? "-";
  acredita.set(`${lang}|${by}`, (acredita.get(`${lang}|${by}`) ?? 0) + 1);
}

console.log(`${slug}: ${graph.nodes.length} nodos · ${graph.edges.length} aristas · receiver-member ${totalRM} (${ambRM} ambiguas)`);
const byLang = new Map<string, number>();
const byLangSinSelf = new Map<string, number>();
for (const [k, n] of [...acredita].sort()) {
  const [lang, by] = k.split("|");
  console.log(`  ${lang!.padEnd(12)} ${by!.padEnd(24)} ${n}`);
  byLang.set(lang!, (byLang.get(lang!) ?? 0) + n);
  if (by !== "self-receiver") byLangSinSelf.set(lang!, (byLangSinSelf.get(lang!) ?? 0) + n);
}
console.log("  --- por lenguaje: firme total / firme SIN self-receiver (= lo que hoy abre la PUERTA 3) ---");
for (const [lang, n] of [...byLang].sort()) {
  console.log(`  ${lang.padEnd(12)} ${String(n).padStart(6)} / ${String(byLangSinSelf.get(lang) ?? 0).padStart(6)}  ${(byLangSinSelf.get(lang) ?? 0) > 0 ? "PUERTA ABIERTA" : "puerta cerrada"}`);
}
