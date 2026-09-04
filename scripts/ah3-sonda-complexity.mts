/**
 * SONDA AH3 (Ola AH) — verifica los HECHOS que decide el camino nuevo de
 * `Extract Method` sobre el ancla `complexity`, ANTES de escribir producción:
 *
 *   (i)  el archivo del hallazgo se puede revivir y `file.functions` contiene
 *        la función anclada en la MISMA terna que `complexity.ts` escribe en
 *        `locations`;
 *   (ii) `FunctionUnit.metrics.maxNesting` está poblado;
 *   (iii) prototipa la regla de ESCALA (bloque anidado con >= 2 decisiones
 *        propias, excluyendo contenedores de switch) sobre archivos REALES.
 *
 * No toca producción. Uso:
 *   npx tsx scripts/ah3-sonda-complexity.mts <dirRepo> <dump.json> [maxCasos]
 */
import { readFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode, FileUnit, FunctionUnit } from "../src/server/services/detect/types.js";

const [, , dir, dumpPath, maxArg] = process.argv;
if (!dir || !dumpPath) {
  console.error("uso: npx tsx scripts/ah3-sonda-complexity.mts <dirRepo> <dump.json> [maxCasos]");
  process.exit(1);
}
const max = maxArg ? Number(maxArg) : 10_000;

interface DumpFinding { id: string; kind: string; title: string; where: string[] }
const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as { findings: DumpFinding[] };

const complexity = dump.findings.filter((f) => f.kind === "complexity");
// CORRECCIÓN medida contra producción: `long-function` sale AGRUPADO por
// archivo (un `Finding` con TODAS las funciones largas del archivo en
// `locations`), mientras que el vecindario que ve la hipótesis se construye
// sobre `rawFindings`, ANTES de agrupar — o sea, un `Finding` por función.
// Tomar sólo `where[0]` subestimaba los gemelos y la sonda contaba de más:
// medido en `click` (4 -> 2) y `cobra` (3 -> 2) contra el volcado real.
const longFn = new Set(dump.findings.filter((f) => f.kind === "long-function").flatMap((f) => f.where));

function hijos(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** Cuenta nodos de anidamiento (if/loop/excepción/switch) en el subárbol, incluido `node`. */
function decisionesEn(node: AstNode, sets: FunctionUnit["sets"]): number {
  let n = sets.nestingNodes.has(node.type) ? 1 : 0;
  for (const c of hijos(node)) n += decisionesEn(c, sets);
  return n;
}

interface Bloque { tipo: string; linea: number; lineas: number; decisiones: number; prof: number }

/** Todos los candidatos: nodo de anidamiento que NO es contenedor de switch,
 *  con >= 1 antecesor de anidamiento dentro de la función, y >= 2 decisiones
 *  en su subárbol (él incluido). */
/** El agrupador del camino viejo, calcado de `extract-method.ts#agruparPorLineasEnBlanco`. */
function agruparPorLineasEnBlanco(hs: readonly AstNode[]): AstNode[][] {
  if (hs.length === 0) return [];
  const grupos: AstNode[][] = [[hs[0]!]];
  for (let i = 1; i < hs.length; i++) {
    const hayBlanco = hs[i]!.startPosition.row - hs[i - 1]!.endPosition.row >= 2;
    if (hayBlanco) grupos.push([hs[i]!]);
    else grupos[grupos.length - 1]!.push(hs[i]!);
  }
  return grupos;
}

function candidatos(body: AstNode, sets: FunctionUnit["sets"]): Bloque[] {
  const out: Bloque[] = [];
  const walk = (node: AstNode, prof: number): void => {
    const esAnidamiento = sets.nestingNodes.has(node.type);
    if (esAnidamiento && prof >= 1 && !sets.switchContainerNodes.has(node.type)) {
      const d = decisionesEn(node, sets);
      const lineas = node.endPosition.row - node.startPosition.row + 1;
      if (d >= 2 && lineas >= 2) {
        out.push({
          tipo: node.type,
          linea: node.startPosition.row + 1,
          lineas: node.endPosition.row - node.startPosition.row + 1,
          decisiones: d,
          prof,
        });
      }
    }
    for (const c of hijos(node)) walk(c, esAnidamiento ? prof + 1 : prof);
  };
  for (const c of hijos(body)) walk(c, 0);
  return out;
}

let vistos = 0;
let conArbol = 0;
let conFuncion = 0;
let conNesting3 = 0;
let conCandidato = 0;
let conGemeloLF = 0;
let pasaTodo = 0;

for (const f of complexity.slice(0, max)) {
  const [where] = f.where;
  if (!where) continue;
  const idx = where.lastIndexOf(":");
  const file = where.slice(0, idx);
  const startLine = Number(where.slice(idx + 1));
  vistos++;
  const live = await resolveLiveFileUnit(dir, file);
  if (!live) {
    console.log(`SIN-ARBOL   ${f.id}  ${where}`);
    continue;
  }
  conArbol++;
  try {
    const unit: FileUnit = live.unit;
    const fn = unit.functions.find((x) => x.startLine === startLine) ?? null;
    if (!fn) {
      console.log(`SIN-FUNCION ${f.id}  ${where}`);
      continue;
    }
    conFuncion++;
    const body = (fn.node.childForFieldName("body") as AstNode | null) ?? fn.node;
    const cand = candidatos(body, fn.sets);
    const parrafos = agruparPorLineasEnBlanco(hijos(body)).filter((g) => g.some((n) => !/comment/i.test(n.type))).length;
    const nesting = fn.metrics.maxNesting;
    const gemelo = longFn.has(where);
    if (nesting >= 3) conNesting3++;
    if (cand.length > 0) conCandidato++;
    if (gemelo) conGemeloLF++;
    const caminoViejoDispara = gemelo && parrafos >= 3;
    const ok = nesting >= 3 && cand.length > 0 && !caminoViejoDispara;
    if (ok) pasaTodo++;
    const mejor = cand.slice().sort((a, b) => b.decisiones - a.decisiones || b.lineas - a.lineas)[0];
    console.log(
      `${ok ? "PASA " : "no   "} ${f.id.padEnd(40)} ${where.padEnd(58)} cog=${String(fn.metrics.cognitive).padStart(4)} nest=${String(nesting).padStart(2)} ` +
        `cand=${String(cand.length).padStart(3)} ${mejor ? `mejor=${mejor.tipo}@${mejor.linea} lineas=${mejor.lineas} dec=${mejor.decisiones} prof=${mejor.prof}` : ""} parr=${parrafos} ${gemelo ? (parrafos >= 3 ? "GEMELO-LF-YA-DISPARA" : "GEMELO-LF-mudo") : ""}`,
    );
  } finally {
    live.release();
  }
}

console.log(
  `\nRESUMEN ${dir}: complexity=${vistos} conArbol=${conArbol} conFuncion=${conFuncion} ` +
    `maxNesting>=3=${conNesting3} conCandidato=${conCandidato} PASA=${pasaTodo} gemeloLF=${conGemeloLF}`,
);
