/**
 * OLA AO · FRENTE AO1 — EL EMBUDO DE LA FUERZA DE `Chain of Responsibility`,
 * medido con la FUNCIÓN DE PRODUCCIÓN, no con una reimplementación.
 *
 * `detect/intra-file/exclusive-dispatch-ladder.ts` exporta `ladderFactsFor`, y
 * su `LadderRejection` existe —lo dice su propio docstring— "para que el embudo
 * se pueda MEDIR sin re-implementar la regla en un script aparte, que es como
 * se miden dos cosas distintas sin saberlo". Esta sonda la llama con
 * `index = null`, así que devuelve el resultado de las condiciones (1)-(4) —las
 * que se contestan con el ÁRBOL— y `sin-grafo` en cuanto llega a la (5).
 *
 * NO TOCA PRODUCCIÓN. Uso:
 *   npx tsx scripts/ao1-sonda-cor.mts <dirRepo> <volcado.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.env.AO1_SRC ?? "../scratchpad-ao1/src0";
const { resolveLiveFileUnit } = await import(`${SRC}/server/services/code-analyzer.js`);
const { ladderFactsFor, ladderCandidatesOf } = await import(`${SRC}/server/services/detect/intra-file/exclusive-dispatch-ladder.js`);

const [, , dir, dumpPath, outPath] = process.argv;
if (!dir || !dumpPath || !outPath) {
  console.error("uso: npx tsx scripts/ao1-sonda-cor.mts <dirRepo> <volcado.json> <salida.json>");
  process.exit(1);
}

const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as { findings: { kind: string; where: string[] }[] };
const archivos = new Set<string>();
for (const f of dump.findings) for (const w of f.where) archivos.add(w.slice(0, w.lastIndexOf(":")));

const RAMAS = 4;
const DESTINOS = 4;
const conteo: Record<string, number> = {};
const RAMAS_BAJAS = 2; // sonda paralela con el piso BAJADO, sólo para contar población
const casos: { file: string; symbol: string; line: number; rejection: string | null; ramas: number; sinParametros: boolean }[] = [];
const pocasRamas: { file: string; symbol: string; line: number; ramas: number; conLlamada: number; topArg: string; topArgN: number }[] = [];
let vivos = 0;
let muertos = 0;
let funciones = 0;

for (const path of archivos) {
  let live: any = null;
  try {
    live = await resolveLiveFileUnit(dir, path);
  } catch {
    live = null;
  }
  if (!live) { muertos++; continue; }
  vivos++;
  for (const fn of live.unit.functions) {
    funciones++;
    const out = ladderFactsFor(live.unit, fn, null, RAMAS, DESTINOS);
    const outBajo = ladderFactsFor(live.unit, fn, null, RAMAS_BAJAS, DESTINOS);
    conteo[`BAJO:${outBajo.rejection ?? "(pasa-el-arbol)"}`] = (conteo[`BAJO:${outBajo.rejection ?? "(pasa-el-arbol)"}`] ?? 0) + 1;
    const key = out.rejection ?? "(pasa-el-arbol)";
    conteo[key] = (conteo[key] ?? 0) + 1;
    // HISTOGRAMA de ramas excluyentes: contesta si el piso `ramas = 4` es lo que
    // ata, o si sencillamente no hay escaleras excluyentes en el corpus.
    const b = Math.min(out.rawBranches, 8);
    conteo[`ramas>=${b}`] = (conteo[`ramas>=${b}`] ?? 0) + 1;
    // sólo interesa el detalle de lo que SOBREVIVE al árbol
    if (out.rejection === "pocas-ramas") {
      // ¿POR QUÉ muere en (3)? Las ramas de la escalera más larga: cuántas
      // contienen UNA LLAMADA, y cuántas comparten el MISMO primer argumento
      // (sea o no un parámetro). Separa "no delegan" de "delegan, pero la
      // solicitud no viaja como parámetro DESNUDO".
      const cands = ladderCandidatesOf(fn) as any[];
      const best = cands[0] ?? [];
      let conLlamada = 0;
      const primerArg = new Map<string, number>();
      for (const b of best) {
        const txt = b.consequence.text as string;
        if (/[A-Za-z_$][\w$]*\s*\(/.test(txt)) conLlamada++;
        const m = /[A-Za-z_$][\w$.]*\s*\(\s*([^,)]{1,40})/.exec(txt);
        if (m) primerArg.set(m[1]!.trim(), (primerArg.get(m[1]!.trim()) ?? 0) + 1);
      }
      const topArg = [...primerArg.entries()].sort((a, b2) => b2[1] - a[1])[0] ?? ["", 0];
      pocasRamas.push({ file: path, symbol: fn.name ?? "", line: fn.startLine, ramas: best.length, conLlamada, topArg: topArg[0], topArgN: topArg[1] });
    }
    if (out.rejection === "sin-grafo" || out.rejection === null) {
      const params = fn.node.childForFieldName("parameters");
      casos.push({ file: path, symbol: fn.name ?? "", line: fn.startLine, rejection: out.rejection, ramas: out.rawBranches, sinParametros: !params });
    }
  }
  live.release();
}

writeFileSync(outPath, JSON.stringify({ dir, archivosVivos: vivos, archivosMuertos: muertos, funciones, conteo, casos, pocasRamas }, null, 1));
console.log(`${dir}: funciones ${funciones} · ${JSON.stringify(conteo)}`);
