/**
 * OLA AT - AT5 - SONDA v2. Igual que la v1 pero con el filtro de ingesta REAL
 * (`excludedByPath`) y con los criterios apretados que la v1 mostro que hacian
 * falta: cadena de NAVEGACION pura (sin llamadas, sin literales compuestos),
 * >= 2 eslabones, y descartando las apariciones que son CALLEE de una llamada o
 * DESTINO de una asignacion (la v1 contaba `strings.Join` y `rootCmd.X = ...`).
 *
 * Uso: npx tsx scripts/at5-sonda2.mts <dirRepo> <nombre> <maxArchivos> <salida.json>
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const S0 = "../scratchpad-at5/src0";
const { resolveLiveFileUnit } = await import(`${S0}/server/services/code-analyzer.js`);
const { excludedByPath } = await import(`${S0}/server/services/ingest-exclusion.js`);

const [, , dir, nombre, maxStr, out] = process.argv;
if (!dir || !nombre || !maxStr || !out) { console.error("faltan args"); process.exit(1); }
const MAXF = Number(maxStr);

const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".py", ".rb", ".go", ".java", ".cs", ".mjs", ".cjs"]);
const SKIPDIR = /(^|\/)(node_modules|vendor|third_party|dist|build|\.git|target|obj|out|coverage)(\/|$)/;

function listar(root: string): string[] {
  const outp: string[] = [];
  const walkDir = (rel: string) => {
    if (outp.length >= MAXF) return;
    let ents: string[];
    try { ents = readdirSync(path.join(root, rel)); } catch { return; }
    for (const e of ents) {
      if (outp.length >= MAXF) return;
      const r = rel ? `${rel}/${e}` : e;
      if (SKIPDIR.test(`/${r}`)) continue;
      let st; try { st = statSync(path.join(root, r)); } catch { continue; }
      if (st.isDirectory()) walkDir(r);
      else if (EXT.has(path.extname(e).toLowerCase()) && st.size < 400_000 && !/\.min\./.test(e)) {
        if (excludedByPath(r)) continue;
        outp.push(r);
      }
    }
  };
  walkDir("");
  return outp;
}

/* -------- estructura -------- */
const LOGICAL = /^(&&|\|\||and|or)$/;
/** Cadena de navegacion PURA: identificador + eslabones `.x` o `[i]`. Sin llamadas, sin literales. */
const NAV = /^[A-Za-z_@$][A-Za-z0-9_$]*(\??\.[A-Za-z_$][A-Za-z0-9_$]*|\[[^\[\]()]{1,24}\])+$/;
const ASSIGN_TOKEN = /^(([-+*/%&|^]|<<|>>|>>>|\*\*|\/\/|\?\?|\|\||&&)?=|\+\+|--)$/;

function named(n: any): any[] { const o: any[] = []; for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c?.isNamed) o.push(c); } return o; }
function walkP(n: any, parent: any, v: (x: any, p: any) => void) { v(n, parent); for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) walkP(c, n, v); } }
function isLogical(n: any): boolean {
  if (!n.isNamed || !n.childForFieldName("left") || !n.childForFieldName("right")) return false;
  const op = n.childForFieldName("operator"); return op !== null && LOGICAL.test(op.type);
}
function eslabones(t: string): number { return (t.match(/\./g)?.length ?? 0) + (t.match(/\[/g)?.length ?? 0); }
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
function mismaPos(a: any, b: any) { return a && b && a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column && a.endPosition.row === b.endPosition.row && a.endPosition.column === b.endPosition.column; }

/** Es CALLEE de una llamada (el parent tiene esta misma pos al principio y el texto del parent sigue con `(`). */
function esCallee(n: any, p: any): boolean {
  if (!p) return false;
  const f = p.childForFieldName("function") ?? p.childForFieldName("method") ?? p.childForFieldName("constructor");
  if (f && mismaPos(f, n)) return true;
  // fallback estructural: el parent arranca en la MISMA posicion y su texto continua con `(`
  if (p.startPosition.row === n.startPosition.row && p.startPosition.column === n.startPosition.column) {
    const resto = (p.text as string).slice((n.text as string).length);
    if (/^\s*[(<]/.test(resto)) return true;
  }
  return false;
}
/** Es DESTINO de una asignacion. */
function esDestino(n: any, p: any): boolean {
  if (!p) return false;
  const l = p.childForFieldName("left") ?? p.childForFieldName("name");
  const r = p.childForFieldName("right") ?? p.childForFieldName("value");
  return !!(l && r && mismaPos(l, n));
}

interface FilaEV { file: string; fn: string; line: number; texto: string; veces: number; eslabones: number; largo: number; lang: string }
interface FilaRTQ { file: string; fn: string; line: number; temp: string; expr: string; otraFn: string; lang: string }
interface FilaDC { file: string; fn: string; line: number; ops: number; texto: string; lang: string }

const ev: FilaEV[] = []; const rtq: FilaRTQ[] = []; const dc: FilaDC[] = [];
let fnsAncla = 0, fnsTotal = 0, archivos = 0;
const variantes: Record<string, number> = {};
const bump = (k: string) => { variantes[k] = (variantes[k] ?? 0) + 1; };

for (const rel of listar(dir)) {
  let live: any = null;
  try { live = await resolveLiveFileUnit(dir, rel); } catch { continue; }
  if (!live) continue;
  archivos++;
  const u = live.unit;

  /* indice: expresiones de navegacion por funcion NOMBRADA, para RTQ entre metodos */
  const navPorFn = new Map<string, Set<string>>();
  for (const fn of u.functions) {
    if (!fn.name) continue;
    const s = new Set<string>();
    walkP(fn.node, null, (n: any, p: any) => {
      if (!n.isNamed) return;
      const t = norm(n.text);
      if (!NAV.test(t) || eslabones(t) < 2) return;
      if (esCallee(n, p) || esDestino(n, p)) return;
      s.add(t);
    });
    navPorFn.set(`${fn.name}#${fn.startLine}`, s);
  }

  for (const fn of u.functions) {
    fnsTotal++;
    const lineas = fn.endLine - fn.startLine + 1;
    if (!(fn.metrics.cognitive >= 15 || lineas >= 45)) continue;
    fnsAncla++;

    /* DC */
    const claimed = new Set<string>();
    walkP(fn.node, null, (n: any) => {
      if (!isLogical(n)) return;
      const k = `${n.startPosition.row}:${n.startPosition.column}`;
      if (claimed.has(k)) return;
      let ops = 1; const fams = new Set<string>();
      const rec = (x: any) => {
        claimed.add(`${x.startPosition.row}:${x.startPosition.column}`);
        const op = x.childForFieldName("operator");
        fams.add(op.type === "&&" || op.type === "and" ? "AND" : "OR");
        for (const f of ["left", "right"]) { const c = x.childForFieldName(f); if (c && isLogical(c)) { ops++; rec(c); } }
      };
      rec(n);
      if (ops <= 2 || fams.size < 2) return;
      dc.push({ file: rel, fn: fn.name ?? "?", line: n.startPosition.row + 1, ops, texto: norm(n.text).slice(0, 160), lang: u.language });
    });

    /* EV: navegacion repetida */
    const cuentas = new Map<string, { veces: number; line: number }>();
    const destinos = new Set<string>();
    walkP(fn.node, null, (n: any, p: any) => {
      if (!n.isNamed) return;
      const t = norm(n.text);
      if (esDestino(n, p)) { destinos.add(t); return; }
      if (!NAV.test(t) || eslabones(t) < 2) return;
      if (esCallee(n, p)) return;
      const c = cuentas.get(t); if (c) c.veces++; else cuentas.set(t, { veces: 1, line: n.startPosition.row + 1 });
    });
    // raiz reasignada => descartar
    const reasignada = (t: string) => {
      for (const d of destinos) if (d === t || t.startsWith(`${d}.`) || t.startsWith(`${d}[`)) return true;
      const raiz = t.split(/[.\[]/)[0]!;
      return destinos.has(raiz);
    };
    const rep = [...cuentas.entries()].filter(([t, c]) => c.veces >= 3 && !reasignada(t)).sort((a, b) => b[0].length - a[0].length);
    const quedan: [string, { veces: number; line: number }][] = [];
    for (const r of rep) if (!quedan.some((q) => q[0].includes(r[0]))) quedan.push(r);
    for (const [t, c] of quedan) {
      ev.push({ file: rel, fn: fn.name ?? "?", line: c.line, texto: t, veces: c.veces, eslabones: eslabones(t), largo: t.length, lang: u.language });
      bump(`ev>=3`); if (c.veces >= 4) bump("ev>=4"); if (eslabones(t) >= 3) bump("ev-esl>=3"); if (t.length >= 20) bump("ev-largo>=20");
    }

    /* RTQ: temp de una asignacion cuya expresion vive tambien en OTRA funcion nombrada del archivo */
    if (fn.name) {
      const miClave = `${fn.name}#${fn.startLine}`;
      walkP(fn.node, null, (n: any) => {
        const nm = n.childForFieldName("name") ?? n.childForFieldName("left");
        const vl = n.childForFieldName("value") ?? n.childForFieldName("right");
        if (!nm || !vl || isLogical(n)) return;
        if (!/^[A-Za-z_@$][A-Za-z0-9_$]*$/.test(norm(nm.text))) return;
        const t = norm(vl.text);
        if (!NAV.test(t) || eslabones(t) < 2) return;
        for (const [k, s] of navPorFn) {
          if (k === miClave) continue;
          if (s.has(t)) { rtq.push({ file: rel, fn: fn.name!, line: n.startPosition.row + 1, temp: norm(nm.text), expr: t, otraFn: k, lang: u.language }); return; }
        }
      });
    }
  }
  live.release?.();
}

writeFileSync(out, JSON.stringify({ repo: nombre, dir, archivos, fnsTotal, fnsAncla, variantes, dc, ev, rtq }, null, 1));
console.error(`${nombre}: ${archivos} arch, ${fnsAncla}/${fnsTotal} fns ancladas | DC=${dc.length} EV=${ev.length} RTQ=${rtq.length} | ${JSON.stringify(variantes)}`);
