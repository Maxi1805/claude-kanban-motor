/**
 * SONDA AN1 (Ola AN) — LA POBLACIÓN DE LA DIRECCIÓN (a): ¿existe código donde
 * el hecho de NIVEL 2 (`long-function`/`complexity`/`primitive-obsession`) es
 * el ÚNICO hallazgo, y sin embargo hay una decisión repetida sobre un mismo
 * discriminante que suma al menos `STRATEGY_MIN_BRANCHES` peldaños?
 *
 * POR QUÉ ESA ES LA PREGUNTA. Las tres anclas de Strategy tapan por
 * construcción casi todo el despacho visible: `conditional-chain` dispara con
 * la escalera MÁS LARGA >= 5 (`detect/intra-function/conditional-chain.ts`,
 * `chainLength floor 5`), `repeated-switch` con el MISMO sujeto en >= 2
 * `switch` del archivo (y NUNCA sobre una escalera de `if` — su docstring lo
 * dice), y `type-switch` con pruebas de tipo. Queda un hueco identificable:
 * **el mismo sujeto decidido por DOS O MÁS escaleras de `if`, ninguna de las
 * cuales llega sola a 5 peldaños.** Ese código sólo tiene hallazgos de nivel 2.
 *
 * NO TOCA PRODUCCIÓN. Uso:
 *   npx tsx scripts/an1-sonda-a.mts <dirRepo> <dump.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode, FileUnit, FunctionUnit } from "../src/server/services/detect/types.js";

const [, , dir, dumpPath, outPath] = process.argv;
if (!dir || !dumpPath || !outPath) {
  console.error("uso: npx tsx scripts/an1-sonda-a.mts <dirRepo> <dump.json> <salida.json>");
  process.exit(1);
}

const STRATEGY_MIN_BRANCHES = 5; // el MISMO número de `hypotheses/strategy.ts`, sin mover
const N2 = new Set(["long-function", "complexity", "primitive-obsession"]);
const ANCLAS = new Set(["conditional-chain", "repeated-switch", "type-switch"]);
const COMPARISON_OPERATOR = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*/;
const DISCRIMINANT_FIELDS = ["value", "subject", "condition"];

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

const candidatos = [...n2Sitios.entries()].filter(([k]) => !conAncla.has(k));
const porArchivo = new Map<string, { symbol: string; kinds: string[] }[]>();
for (const [, v] of candidatos) {
  const l = porArchivo.get(v.file) ?? [];
  l.push({ symbol: v.symbol, kinds: [...v.kinds].sort() });
  porArchivo.set(v.file, l);
}

function discriminantText(node: AstNode): string | null {
  for (const field of DISCRIMINANT_FIELDS) {
    const child = node.childForFieldName(field) as AstNode | null;
    if (child) return child.text.replace(/[()]/g, "").trim();
  }
  return null;
}
function subjectOf(text: string): string {
  return (COMPARISON_OPERATOR.exec(text)?.[1] ?? text).trim().toLowerCase();
}
/** Peldaños de una escalera de `if` — mismo recorrido que `strategy.ts#ifLadderBranchActions`, contando peldaños, no acciones. */
function rungCount(root: AstNode): number {
  let n = 0;
  let current: AstNode | null = root;
  while (current && current.childForFieldName("condition")) {
    n++;
    let alt = current.childForFieldName("alternative") as AstNode | null;

    current = alt && alt.childForFieldName("condition") ? alt : null;
  }
  return n;
}
function armCount(container: AstNode): number {
  let n = 0;
  const visit = (node: AstNode): void => {
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i) as AstNode | null;
      if (!c?.isNamed) continue;
      if (/(^|_)(case|when|section|clause|group)(_|$)/.test(c.type) && !/(^|_)(default|else)(_|$)/.test(c.type)) { n++; continue; }
      visit(c);
    }
  };
  visit(container);
  return n;
}

interface Escalera { tipo: "if" | "switch"; linea: number; peldanos: number; sujeto: string }
const resultados: {
  file: string; symbol: string; kinds: string[]; startLine: number;
  sujetos: { sujeto: string; escaleras: number; peldanos: number; soloIf: boolean; lineas: number[] }[];
}[] = [];

let archivosVivos = 0;
let archivosMuertos = 0;
let funcionesHalladas = 0;
let funcionesNoHalladas = 0;

for (const [file, sitios] of porArchivo) {
  let live: { unit: FileUnit; release(): void } | null = null;
  try {
    live = await resolveLiveFileUnit(dir, file);
  } catch {
    live = null;
  }
  if (!live) { archivosMuertos++; continue; }
  archivosVivos++;
  const unit = live.unit;
  for (const s of sitios) {
    const fn: FunctionUnit | undefined = unit.functions.find((f) => (f.name ?? "") === s.symbol);
    if (!fn) { funcionesNoHalladas++; continue; }
    funcionesHalladas++;
    const sets = fn.sets;
    const escaleras: Escalera[] = [];
    const visit = (node: AstNode): void => {
      if (node.isNamed) {
        if (sets.switchContainerNodes.has(node.type)) {
          const t = discriminantText(node);
          if (t) escaleras.push({ tipo: "switch", linea: node.startPosition.row + 1, peldanos: armCount(node), sujeto: subjectOf(t) });
        } else if (sets.chainNodes.has(node.type) && node.childForFieldName("condition")) {
          const t = discriminantText(node);
          if (t) escaleras.push({ tipo: "if", linea: node.startPosition.row + 1, peldanos: rungCount(node), sujeto: subjectOf(t) });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i) as AstNode | null;
        if (c) visit(c);
      }
    };
    visit(fn.node);
    // Sufijos: una escalera anidada dentro de otra vuelve a aparecer. Se queda
    // la MÁS LARGA por (sujeto, línea de inicio) y se descartan las que
    // empiezan dentro del rango de otra del MISMO sujeto con más peldaños.
    const porSujeto = new Map<string, Escalera[]>();
    for (const e of escaleras) {
      if (!e.sujeto) continue;
      const l = porSujeto.get(e.sujeto) ?? [];
      l.push(e);
      porSujeto.set(e.sujeto, l);
    }
    const sujetos: { sujeto: string; escaleras: number; peldanos: number; soloIf: boolean; lineas: number[] }[] = [];
    for (const [sujeto, l] of porSujeto) {
      const orden = [...l].sort((a, b) => a.linea - b.linea || b.peldanos - a.peldanos);
      const vivas: Escalera[] = [];
      for (const e of orden) {
        const prev = vivas[vivas.length - 1];
        if (prev && e.linea <= prev.linea + prev.peldanos * 3 && e.peldanos < prev.peldanos) continue; // sufijo de la anterior
        vivas.push(e);
      }
      if (vivas.length < 2) continue;
      const peldanos = vivas.reduce((a, e) => a + e.peldanos, 0);
      if (peldanos < STRATEGY_MIN_BRANCHES) continue;
      sujetos.push({ sujeto, escaleras: vivas.length, peldanos, soloIf: vivas.every((e) => e.tipo === "if"), lineas: vivas.map((e) => e.linea) });
    }
    if (sujetos.length > 0) resultados.push({ file, symbol: s.symbol, kinds: s.kinds, startLine: fn.startLine, sujetos });
  }
  live.release();
}

const soloIf = resultados.filter((r) => r.sujetos.some((s) => s.soloIf));
writeFileSync(outPath, JSON.stringify({ dir, sitiosN2SinAncla: candidatos.length, archivosVivos, archivosMuertos, funcionesHalladas, funcionesNoHalladas, conRepeticion: resultados.length, conRepeticionSoloIf: soloIf.length, resultados }, null, 1));
console.log(`${dir}: sitios n2 SIN ancla ${candidatos.length} · funciones halladas ${funcionesHalladas} (no halladas ${funcionesNoHalladas}, archivos muertos ${archivosMuertos}) · con repetición de sujeto >= ${STRATEGY_MIN_BRANCHES} peldaños: ${resultados.length} (sólo-if: ${soloIf.length})`);
