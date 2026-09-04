/**
 * OLA AT - FRENTE AT5 - SONDA DE ALCANCE (antes de construir nada).
 *
 * No corre el analizador entero: parsea archivos con `resolveLiveFileUnit` (el
 * mismo reparseo bajo demanda que usa `ctx.fileAt` en produccion) sobre la copia
 * congelada `scratchpad-at5/src0`, y cuenta las formas candidatas de las cuatro
 * familias SOLO dentro de funciones que pasarian el ancla
 * (`cognitive >= 15` = piso de `complexity`, o `lineas >= 45` = piso de `long-function`).
 *
 * Uso: npx tsx scripts/at5-sonda.mts <dirRepo> <nombre> <maxArchivos> <salida.json>
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const { resolveLiveFileUnit } = await import("../scratchpad-at5/src0/server/services/code-analyzer.js");

const [, , dir, nombre, maxStr, out] = process.argv;
if (!dir || !nombre || !maxStr || !out) { console.error("faltan args"); process.exit(1); }
const MAXF = Number(maxStr);

const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".py", ".rb", ".go", ".java", ".cs", ".mjs", ".cjs"]);
const SKIP = /(^|\/)(node_modules|vendor|third_party|dist|build|\.git|testdata|fixtures|__tests__|spec|test|tests)(\/|$)/;

function listar(root: string): string[] {
  const outp: string[] = [];
  const walk = (rel: string) => {
    if (outp.length >= MAXF) return;
    let ents: string[];
    try { ents = readdirSync(path.join(root, rel)); } catch { return; }
    for (const e of ents) {
      if (outp.length >= MAXF) return;
      const r = rel ? `${rel}/${e}` : e;
      if (SKIP.test(`/${r}`)) continue;
      let st;
      try { st = statSync(path.join(root, r)); } catch { continue; }
      if (st.isDirectory()) walk(r);
      else if (EXT.has(path.extname(e).toLowerCase()) && st.size < 400_000 && !/\.min\./.test(e)) outp.push(r);
    }
  };
  walk("");
  return outp;
}

/* ---------- helpers estructurales, sin vocabulario por lenguaje ---------- */
const LOGICAL = /^(&&|\|\||and|or)$/;
const COMMENT = /(^|_)comment(_|$)/;

function named(n: any): any[] {
  const o: any[] = [];
  for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c?.isNamed) o.push(c); }
  return o;
}
function walk(n: any, v: (x: any) => void) { v(n); for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) walk(c, v); } }
function isLogical(n: any): boolean {
  if (!n.isNamed || !n.childForFieldName("left") || !n.childForFieldName("right")) return false;
  const op = n.childForFieldName("operator");
  return op !== null && LOGICAL.test(op.type);
}
function fam(t: string) { return t === "&&" || t === "and" ? "AND" : "OR"; }
function chainShape(n: any, claimed: Set<string>): { count: number; fams: Set<string> } {
  claimed.add(key(n));
  let count = 1; const f = new Set<string>([fam(n.childForFieldName("operator").type)]);
  for (const fld of ["left", "right"]) {
    const c = n.childForFieldName(fld);
    if (c && isLogical(c)) { const s = chainShape(c, claimed); count += s.count; for (const x of s.fams) f.add(x); }
  }
  return { count, fams: f };
}
const key = (n: any) => `${n.startPosition.row}:${n.startPosition.column}:${n.endPosition.row}:${n.endPosition.column}`;

/* candidato de Extract Variable: expresion compuesta de NAVEGACION, sin llamada, sin asignacion */
function esNavegacion(n: any): boolean {
  if (!n.isNamed) return false;
  const t = n.text as string;
  if (t.length < 12 || t.length > 120) return false;
  if (t.includes("\n")) return false;
  if (t.includes("(") || t.includes(")")) return false;
  if (/[^=!<>]=[^=]/.test(t) || t.includes("++") || t.includes("--")) return false;
  if (!/[.\[]|->|::/.test(t)) return false;
  return named(n).length >= 1;
}

/* declaracion de variable con inicializador: forma de campos generica */
function declInit(n: any): { nombre: string; valor: any } | null {
  if (!n.isNamed) return null;
  const nm = n.childForFieldName("name") ?? n.childForFieldName("left");
  const vl = n.childForFieldName("value") ?? n.childForFieldName("right");
  if (!nm || !vl) return null;
  if (isLogical(n)) return null;
  const t = nm.text as string;
  if (!/^[A-Za-z_@$][A-Za-z0-9_$]*$/.test(t)) return null;
  return { nombre: t, valor: vl };
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

interface FilaDC { file: string; fn: string; line: number; ops: number; texto: string; efectos: boolean; lineas: number }
interface FilaEV { file: string; fn: string; line: number; texto: string; veces: number; largo: number }
interface FilaRTQ { file: string; fn: string; line: number; temp: string; expr: string; otraFn: string }

const dc: FilaDC[] = [];
const ev: FilaEV[] = [];
const rtq: FilaRTQ[] = [];
let fnsAncla = 0, fnsTotal = 0, archivos = 0;
let iaDerefSinCheck = 0;

const archivosLista = listar(dir);
for (const rel of archivosLista) {
  let live: any = null;
  try { live = await resolveLiveFileUnit(dir, rel); } catch { continue; }
  if (!live) continue;
  archivos++;
  const u = live.unit;
  // indice de expresiones por funcion, para RTQ entre metodos del MISMO archivo
  const exprPorFn = new Map<string, Set<string>>();
  for (const fn of u.functions) {
    const s = new Set<string>();
    walk(fn.node, (n: any) => { if (esNavegacion(n)) s.add(norm(n.text)); });
    exprPorFn.set(`${fn.name ?? "?"}:${fn.startLine}`, s);
  }
  for (const fn of u.functions) {
    fnsTotal++;
    const lineas = fn.endLine - fn.startLine + 1;
    const ancla = fn.metrics.cognitive >= 15 || lineas >= 45;
    if (!ancla) continue;
    fnsAncla++;

    /* --- DC --- */
    const claimed = new Set<string>();
    walk(fn.node, (n: any) => {
      if (!isLogical(n) || claimed.has(key(n))) return;
      const { count, fams } = chainShape(n, claimed);
      if (count <= 2 || fams.size < 2) return;
      const t = n.text as string;
      dc.push({
        file: rel, fn: fn.name ?? "?", line: n.startPosition.row + 1, ops: count,
        texto: norm(t).slice(0, 180),
        efectos: /(^|[^=!<>+\-*/%&|^])=[^=]|\+\+|--/.test(t),
        lineas: n.endPosition.row - n.startPosition.row + 1,
      });
    });

    /* --- EV: subexpresion de navegacion repetida >=3 veces --- */
    const cuentas = new Map<string, { veces: number; line: number }>();
    walk(fn.node, (n: any) => {
      if (!esNavegacion(n)) return;
      const t = norm(n.text);
      const c = cuentas.get(t);
      if (c) c.veces++;
      else cuentas.set(t, { veces: 1, line: n.startPosition.row + 1 });
    });
    const repetidas = [...cuentas.entries()].filter(([, c]) => c.veces >= 3).sort((a, b) => b[0].length - a[0].length);
    const quedan: [string, { veces: number; line: number }][] = [];
    for (const r of repetidas) if (!quedan.some((q) => q[0].includes(r[0]))) quedan.push(r);
    for (const [t, c] of quedan) ev.push({ file: rel, fn: fn.name ?? "?", line: c.line, texto: t, veces: c.veces, largo: t.length });

    /* --- RTQ: temp asignado una vez cuya expresion vive tambien en OTRA funcion del archivo --- */
    const miClave = `${fn.name ?? "?"}:${fn.startLine}`;
    walk(fn.node, (n: any) => {
      const d = declInit(n);
      if (!d) return;
      if (!esNavegacion(d.valor)) return;
      const t = norm(d.valor.text);
      for (const [k, s] of exprPorFn) {
        if (k === miClave) continue;
        if (s.has(t)) { rtq.push({ file: rel, fn: fn.name ?? "?", line: n.startPosition.row + 1, temp: d.nombre, expr: t, otraFn: k }); return; }
      }
    });

    /* --- IA (firehose check): parametros usados sin ningun chequeo previo --- */
    const params = fn.node.childForFieldName("parameters");
    if (params) {
      const nombres = named(params).map((p: any) => (p.childForFieldName("name") ?? p).text).filter((x: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x));
      const cuerpo = fn.node.text as string;
      for (const p of nombres) {
        const usaNav = new RegExp(`\\b${p}\\s*[.\\[]`).test(cuerpo);
        const chequea = new RegExp(`(if|unless|assert|raise|throw|return)[^\\n]*\\b${p}\\b`).test(cuerpo);
        if (usaNav && !chequea) iaDerefSinCheck++;
      }
    }
  }
  live.release?.();
}

writeFileSync(out, JSON.stringify({ repo: nombre, dir, archivos, fnsTotal, fnsAncla, iaDerefSinCheck, dc, ev, rtq }, null, 1));
console.error(`${nombre}: ${archivos} archivos, ${fnsAncla}/${fnsTotal} fns ancladas | DC=${dc.length} EV=${ev.length} RTQ=${rtq.length} IA=${iaDerefSinCheck}`);
