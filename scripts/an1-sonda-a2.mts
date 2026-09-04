/**
 * SONDA AN1-a2 (Ola AN) — LA POBLACIÓN DE LA DIRECCIÓN (a), CON LA FUERZA Y LA
 * ESCALA PUESTAS ANTES DE MEDIR (`scratchpad-an1/CRITERIO.md`).
 *
 * La sonda anterior (`an1-sonda-a.mts`) contó "el mismo SUJETO decidido por >= 2
 * escaleras que suman >= 5 peldaños" y devolvió 462 casos en gitea, 447 de ellos
 * con sujeto `err`: `if err != nil` repetido, que es una GUARDA, no un despacho.
 * Esta sonda agrega la condición que separa una cosa de la otra y que es la
 * definición literal de la fuerza que Strategy resuelve:
 *
 *   FUERZA — la MISMA expresión se decide contra un ALFABETO de valores
 *            DISTINTOS. `err != nil` compara siempre contra el mismo valor:
 *            no hay alfabeto, no hay variantes que intercambiar.
 *   ESCALA — >= STRATEGY_MIN_BRANCHES (5) valores DISTINTOS, el número que
 *            `hypotheses/strategy.ts` ya usa, sin moverlo, y >= 2 escaleras
 *            SEPARADAS (si fuera una sola, `conditional-chain` ya la vería).
 *
 * NO TOCA PRODUCCIÓN. Uso:
 *   npx tsx scripts/an1-sonda-a2.mts <dirRepo> <dump.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode, FileUnit, FunctionUnit } from "../src/server/services/detect/types.js";

const [, , dir, dumpPath, outPath] = process.argv;
if (!dir || !dumpPath || !outPath) {
  console.error("uso: npx tsx scripts/an1-sonda-a2.mts <dirRepo> <dump.json> <salida.json>");
  process.exit(1);
}

const STRATEGY_MIN_BRANCHES = 5;
const N2 = new Set(["long-function", "complexity", "primitive-obsession"]);
const ANCLAS = new Set(["conditional-chain", "repeated-switch", "type-switch"]);
const COMPARISON_OPERATOR = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.*)$/s;

interface DumpFinding { id: string; kind: string; title: string; where: string[]; symbols: string[] }
const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as { findings: DumpFinding[] };

const conAncla = new Set<string>();
const n2Sitios = new Map<string, { file: string; symbol: string; kinds: Set<string> }>();
for (const f of dump.findings) {
  for (let i = 0; i < f.where.length; i++) {
    const w = f.where[i]!;
    const file = w.slice(0, w.lastIndexOf(":"));
    const symbol = f.symbols[i] ?? "";
    const k = `${file}|${symbol}`;
    if (ANCLAS.has(f.kind)) conAncla.add(k);
    if (N2.has(f.kind) && symbol) {
      const e = n2Sitios.get(k) ?? { file, symbol, kinds: new Set<string>() };
      e.kinds.add(f.kind);
      n2Sitios.set(k, e);
    }
  }
}
const porArchivo = new Map<string, { symbol: string; kinds: string[] }[]>();
let sitiosSinAncla = 0;
for (const [k, v] of n2Sitios) {
  if (conAncla.has(k)) continue;
  sitiosSinAncla++;
  const l = porArchivo.get(v.file) ?? [];
  l.push({ symbol: v.symbol, kinds: [...v.kinds].sort() });
  porArchivo.set(v.file, l);
}

function unwrap(node: AstNode): AstNode {
  if (node.childForFieldName("condition")) return node;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child?.isNamed && child.childForFieldName("condition")) return child;
  }
  return node;
}
const norm = (s: string): string => s.replace(/[()]/g, "").trim().toLowerCase();

/** Peldaños de una escalera de `if`: (sujeto, valor comparado) por peldaño. Sólo cuenta los que tienen operador de comparación — sin operador no hay alfabeto que leer. */
function ifLadderRungs(root: AstNode): { subject: string; value: string; line: number }[] {
  const out: { subject: string; value: string; line: number }[] = [];
  let current: AstNode | null = root;
  while (current && current.childForFieldName("condition")) {
    const cond = current.childForFieldName("condition") as AstNode;
    const m = COMPARISON_OPERATOR.exec(cond.text.replace(/[()]/g, "").trim());
    if (m) out.push({ subject: norm(m[1] ?? ""), value: norm(m[3] ?? ""), line: current.startPosition.row + 1 });
    const alt = current.childForFieldName("alternative") as AstNode | null;
    const siguiente = alt ? unwrap(alt) : null;
    current = siguiente && siguiente.childForFieldName("condition") ? siguiente : null;
  }
  return out;
}

interface Escalera { linea: number; rungs: { subject: string; value: string; line: number }[] }

const resultados: {
  file: string; symbol: string; kinds: string[]; startLine: number; endLine: number;
  sujetos: { sujeto: string; escaleras: number; valores: string[]; lineas: number[] }[];
}[] = [];

let archivosVivos = 0, archivosMuertos = 0, funcionesHalladas = 0, funcionesNoHalladas = 0;

for (const [file, sitios] of porArchivo) {
  let live: { unit: FileUnit; release(): void } | null = null;
  try { live = await resolveLiveFileUnit(dir, file); } catch { live = null; }
  if (!live) { archivosMuertos++; continue; }
  archivosVivos++;
  const unit = live.unit;
  for (const s of sitios) {
    const fn: FunctionUnit | undefined = unit.functions.find((f) => (f.name ?? "") === s.symbol);
    if (!fn) { funcionesNoHalladas++; continue; }
    funcionesHalladas++;
    const sets = fn.sets;
    const escaleras: Escalera[] = [];
    const visto = new Set<number>();
    const visit = (node: AstNode): void => {
      if (node.isNamed && sets.chainNodes.has(node.type) && node.childForFieldName("condition")) {
        const linea = node.startPosition.row + 1;
        // Un elsif anidado vuelve a aparecer como raíz parcial: sólo se toma la
        // PRIMERA raíz de cada cadena (las líneas de sus peldaños quedan marcadas).
        if (!visto.has(linea)) {
          const rungs = ifLadderRungs(node);
          for (const r of rungs) visto.add(r.line);
          if (rungs.length > 0) escaleras.push({ linea, rungs });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i) as AstNode | null;
        if (c) visit(c);
      }
    };
    visit(fn.node);
    const porSujeto = new Map<string, { valores: Set<string>; lineas: Set<number> }>();
    for (const e of escaleras) {
      for (const r of e.rungs) {
        if (!r.subject) continue;
        const acc = porSujeto.get(r.subject) ?? { valores: new Set<string>(), lineas: new Set<number>() };
        acc.valores.add(r.value);
        acc.lineas.add(e.linea);
        porSujeto.set(r.subject, acc);
      }
    }
    const sujetos = [...porSujeto.entries()]
      .filter(([, v]) => v.lineas.size >= 2 && v.valores.size >= STRATEGY_MIN_BRANCHES)
      .map(([sujeto, v]) => ({ sujeto, escaleras: v.lineas.size, valores: [...v.valores].sort(), lineas: [...v.lineas].sort((a, b) => a - b) }));
    if (sujetos.length > 0) resultados.push({ file, symbol: s.symbol, kinds: s.kinds, startLine: fn.startLine, endLine: fn.endLine, sujetos });
  }
  live.release();
}

writeFileSync(outPath, JSON.stringify({ dir, sitiosN2SinAncla: sitiosSinAncla, archivosVivos, archivosMuertos, funcionesHalladas, funcionesNoHalladas, casos: resultados.length, resultados }, null, 1));
console.log(`${dir}: sitios n2 SIN ancla ${sitiosSinAncla} · funciones ${funcionesHalladas} · CASOS (mismo sujeto, >=2 escaleras, >=${STRATEGY_MIN_BRANCHES} valores distintos): ${resultados.length}`);
