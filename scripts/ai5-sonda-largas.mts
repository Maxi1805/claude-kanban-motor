/**
 * AI5 — SONDA SOBRE LAS FUNCIONES LARGAS QUE MUEREN EN EL `required` DE PÁRRAFOS.
 *
 * NO reimplementa el analizador: lee las ubicaciones que el propio embudo
 * (`scripts/ai5-embudo.mts`, corrido con el analizador REAL sobre la copia
 * congelada `scratchpad-ai5/srcA`) ya registró para cada hallazgo
 * `long-function`, y vuelve a parsear SÓLO esos archivos con
 * `resolveLiveFileUnit` — el mismo parseo bajo demanda que usa `ctx.fileAt` en
 * producción.
 *
 * Para cada función anclada mide, sobre el MISMO cuerpo:
 *   - `parrafos`      — la agrupación por LÍNEAS EN BLANCO (el `required` de hoy).
 *   - `comentarios`   — la agrupación por COMENTARIO de nivel de sentencia.
 *   - `bloquesTop`    — hijos directos del cuerpo que son estructuras de control,
 *                       con sus líneas y sus decisiones propias.
 *   - `maxNesting`    — para saber si el camino de `complexity` (AH3) lo alcanza.
 *
 * Uso: npx tsx scripts/ai5-sonda-largas.mts <repo> <dirCorpus> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../scratchpad-ai5/srcA/server/services/code-analyzer.js";

const [, , repo, dir, out] = process.argv;
if (!repo || !dir || !out) {
  console.error("Uso: npx tsx scripts/ai5-sonda-largas.mts <repo> <dirCorpus> <salida.json>");
  process.exit(1);
}

const emb = JSON.parse(readFileSync(`scratchpad-ai5/emb/${repo}.json`, "utf8"));

interface Objetivo {
  findingId: string;
  file: string;
  startLine: number;
  endLine: number;
  parrafosOk: boolean;
}

const objetivos = new Map<string, Objetivo>();
for (const r of emb.rows as any[]) {
  if (r.builder !== "extract-method" || r.kind !== "long-function" || !r.required) continue;
  const m = /^(.*):(\d+)-(\d+)$/.exec(r.loc ?? "");
  if (!m) continue;
  objetivos.set(r.findingId, {
    findingId: r.findingId,
    file: m[1]!,
    startLine: Number(m[2]),
    endLine: Number(m[3]),
    parrafosOk: r.required[0].ok,
  });
}

const COMMENT_NODE = /comment/i;

function hijosNombrados(node: any): any[] {
  const outn: any[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.isNamed) outn.push(c);
  }
  return outn;
}

/** Agrupación por líneas en blanco — copia literal de `extract-method.ts`. */
function porBlancos(hijos: any[]): any[][] {
  if (hijos.length === 0) return [];
  const g: any[][] = [[hijos[0]]];
  for (let i = 1; i < hijos.length; i++) {
    if (hijos[i].startPosition.row - hijos[i - 1].endPosition.row >= 2) g.push([hijos[i]]);
    else g[g.length - 1]!.push(hijos[i]);
  }
  return g;
}

/** Agrupación por COMENTARIO de nivel de sentencia: un comentario abre bloque. */
function porComentarios(hijos: any[]): any[][] {
  const g: any[][] = [];
  let abierto: any[] | null = null;
  let previoEraComentario = false;
  for (const h of hijos) {
    const esCom = COMMENT_NODE.test(h.type);
    if (esCom && !previoEraComentario) {
      abierto = [h];
      g.push(abierto);
    } else if (abierto) {
      abierto.push(h);
    } else {
      abierto = [h];
      g.push(abierto);
    }
    previoEraComentario = esCom;
  }
  return g;
}

/**
 * Agrupación por FRONTERA DE BLOQUE: una estructura de control que abre y
 * cierra en filas distintas es un grupo por sí sola; las sentencias simples
 * consecutivas se acumulan en un grupo. Los comentarios se pegan al grupo que
 * SIGUE (mismo criterio de "el comentario introduce el paso").
 */
function porFronteraDeBloque(hijos: any[], nesting: Set<string>): { grupos: any[][]; estructuras: number; estructurasNoSwitch: number; sw: Set<string> } {
  const grupos: any[][] = [];
  let corrida: any[] | null = null;
  let pendientes: any[] = [];
  let estructuras = 0;
  let estructurasNoSwitch = 0;
  for (const h of hijos) {
    if (COMMENT_NODE.test(h.type)) {
      pendientes.push(h);
      continue;
    }
    const multi = h.endPosition.row > h.startPosition.row;
    if (nesting.has(h.type) && multi) {
      corrida = null;
      grupos.push([...pendientes, h]);
      pendientes = [];
      estructuras++;
    } else {
      if (!corrida) {
        corrida = [...pendientes, h];
        grupos.push(corrida);
      } else {
        corrida.push(...pendientes, h);
      }
      pendientes = [];
    }
  }
  return { grupos, estructuras, estructurasNoSwitch, sw: new Set() };
}

function conCodigo(g: any[][]): number {
  return g.filter((b) => b.some((n) => !COMMENT_NODE.test(n.type))).length;
}

function nestingSet(fn: any): Set<string> {
  return fn.sets.nestingNodes;
}

function decisionesDe(node: any, nesting: Set<string>): number {
  let n = nesting.has(node.type) ? 1 : 0;
  for (const h of hijosNombrados(node)) n += decisionesDe(h, nesting);
  return n;
}

const porArchivo = new Map<string, Objetivo[]>();
for (const o of objetivos.values()) (porArchivo.get(o.file) ?? porArchivo.set(o.file, []).get(o.file)!).push(o);

const filas: any[] = [];
for (const [file, objs] of porArchivo) {
  const live = await resolveLiveFileUnit(dir, file);
  if (!live) {
    for (const o of objs) filas.push({ ...o, error: "sin-archivo-vivo" });
    continue;
  }
  const unit: any = (live as any).unit ?? live;
  for (const o of objs) {
    const fn = unit.functions.find((f: any) => f.startLine === o.startLine && f.endLine === o.endLine);
    if (!fn) {
      filas.push({ ...o, error: "sin-funcion" });
      continue;
    }
    const body = fn.node.childForFieldName("body") ?? fn.node;
    const hijos = hijosNombrados(body);
    const blancos = conCodigo(porBlancos(hijos));
    const coment = conCodigo(porComentarios(hijos));
    const nesting: Set<string> = fn.sets.nestingNodes;
    const sw: Set<string> = fn.sets.switchContainerNodes;
    const fb = porFronteraDeBloque(hijos, nesting);
    const fbEstructurasNoSwitch = hijos.filter((h) => nesting.has(h.type) && !sw.has(h.type) && h.endPosition.row > h.startPosition.row).length;
    // "cuerpo efectivo": mientras el cuerpo tenga UN solo hijo de código y ese
    // hijo sea una estructura de control, se baja a SU cuerpo. Es donde el
    // autor separó de verdad los pasos.
    let efectivo: any = body;
    let saltos = 0;
    const tipos: string[] = [];
    const dominancia: number[] = [];
    for (;;) {
      const hs = hijosNombrados(efectivo).filter((h: any) => !COMMENT_NODE.test(h.type));
      if (hs.length !== 1) break;
      const u = hs[0];
      if (!nestingSet(fn).has(u.type)) break;
      tipos.push(u.type);
      const cuerpoU = u.childForFieldName("body") ?? u.childForFieldName("consequence") ?? u;
      if (cuerpoU === u) {
        // sin campo de cuerpo: bajar al bloque hijo mas grande
        const bloques = hijosNombrados(u).filter((h: any) => h.childCount > 0);
        if (bloques.length === 0) break;
        bloques.sort((a: any, b: any) => (b.endPosition.row - b.startPosition.row) - (a.endPosition.row - a.startPosition.row));
        efectivo = bloques[0];
      } else {
        efectivo = cuerpoU;
      }
      dominancia.push((u.endPosition.row - u.startPosition.row + 1) / Math.max(1, o.endLine - o.startLine + 1));
      saltos++;
      if (saltos > 6) break;
    }
    const blancosEfectivo = efectivo === body ? blancos : conCodigo(porBlancos(hijosNombrados(efectivo)));

    const bloquesTop = hijos
      .filter((h) => nesting.has(h.type) && !fn.sets.switchContainerNodes.has(h.type))
      .map((h) => ({
        tipo: h.type,
        startLine: h.startPosition.row + 1,
        lineas: h.endPosition.row - h.startPosition.row + 1,
        decisiones: decisionesDe(h, nesting),
      }));
    filas.push({
      ...o,
      nombre: fn.name ?? "(anónima)",
      lineas: o.endLine - o.startLine + 1,
      hijos: hijos.length,
      blancos,
      coment,
      maxNesting: fn.metrics?.maxNesting ?? null,
      saltos,
      tipos,
      dominancia: dominancia[0] ?? null,
      blancosEfectivo,
      fbGrupos: conCodigo(fb.grupos),
      fbEstructuras: fb.estructuras,
      fbEstructurasNoSwitch,
      bloquesTop,
    });
  }
  (live as any).release?.();
}

writeFileSync(out, JSON.stringify({ repo, dir, filas }, null, 0));
console.log(`${out}: ${filas.length} funciones largas medidas`);
