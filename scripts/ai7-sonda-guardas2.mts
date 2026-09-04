/**
 * AI7 — CONTRAFÁCTICO EXACTO DE `conditionGuard`, SIN EL ANALIZADOR.
 *
 * Corre la ruta de dispersión de `null-object.ts` con sus funciones REALES
 * exportadas (`scanFile` + `groupIntoProblems`) sobre los archivos de un repo,
 * y después la vuelve a correr QUITANDO las guardas que sólo las dos ramas
 * nuevas pueden reconocer (`x is null`, `not x`). La diferencia es el efecto
 * EXACTO del cambio sobre los dos `required` de la ruta, con las dos
 * exclusiones (`guardReassignsToConstruction`, `consequenceFailsFast`)
 * aplicadas en las dos corridas, porque las aplica `scanFile`.
 *
 * NO toca producción ni pide el semáforo de análisis: sólo parsea archivos.
 * Uso: npx tsx scripts/ai7-sonda-guardas2.mts <dir> <ext,ext> [maxArchivos]
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";
import { groupIntoProblems, scanFile, type FileScanResult } from "../src/server/services/hypotheses/null-object.js";

const [, , dir, exts, maxStr] = process.argv;
const EXT = (exts ?? ".py,.cs").split(",");
const MAX = maxStr ? Number(maxStr) : Infinity;
const SALTAR = new Set(["node_modules", ".git", "dist", "build", "vendor", "target", "bin", "obj"]);

function listar(raiz: string): string[] {
  const out: string[] = [];
  const pila = [raiz];
  while (pila.length > 0 && out.length < MAX) {
    const d = pila.pop()!;
    let entradas: string[];
    try {
      entradas = readdirSync(d);
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (SALTAR.has(e)) continue;
      const p = join(d, e);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) pila.push(p);
      else if (EXT.some((x) => e.endsWith(x))) out.push(relative(raiz, p));
    }
  }
  return out;
}

/** Las CUATRO ramas viejas, copiadas verbatim del archivo de producción. */
function viejo(raw: string): boolean {
  const t = raw.trim().replace(/^\((.*)\)$/, "$1").trim();
  return (
    /^([\w.@$]+)\s*(?:===?|==)\s*(?:nil|null|None|undefined)\b/.test(t) ||
    /^([\w.@$]+)\.nil\?/.test(t) ||
    /^([\w.@$]+)\s+is\s+None\b/.test(t) ||
    /^!\s*([\w.@$]+)\s*$/.test(t)
  );
}

function condicionesPorRango(root: AstNode): Map<string, string> {
  const m = new Map<string, string>();
  const pila: AstNode[] = [root];
  while (pila.length > 0) {
    const n = pila.pop()!;
    const c = n.childForFieldName("condition") as AstNode | null;
    if (c) m.set(`${n.startPosition.row + 1}:${n.endPosition.row + 1}`, c.text);
    for (let i = 0; i < n.childCount; i++) {
      const h = n.child(i) as AstNode | null;
      if (h) pila.push(h);
    }
  }
  return m;
}

const archivos = listar(dir!);
const nuevoPerFile = new Map<string, FileScanResult>();
const viejoPerFile = new Map<string, FileScanResult>();
let leidos = 0;
let guardasNuevas = 0;
let guardasViejas = 0;
for (const rel of archivos) {
  let live;
  try {
    live = await resolveLiveFileUnit(dir!, rel);
  } catch {
    live = null;
  }
  if (!live) continue;
  leidos++;
  const r = scanFile(live.unit.root, live.unit.sets);
  const cond = condicionesPorRango(live.unit.root);
  const soloNuevas = r.guards.filter((g) => {
    const t = cond.get(`${g.startLine}:${g.endLine}`);
    return t !== undefined && !viejo(t);
  });
  guardasNuevas += soloNuevas.length;
  guardasViejas += r.guards.length - soloNuevas.length;
  nuevoPerFile.set(rel, r);
  viejoPerFile.set(rel, { guards: r.guards.filter((g) => !soloNuevas.includes(g)), units: r.units });
}

function pasan(perFile: Map<string, FileScanResult>): { problemas: number; conRequired: number; conceptos: Set<string> } {
  const ps = groupIntoProblems(perFile);
  let ok = 0;
  const conceptos = new Set<string>();
  for (const p of ps) {
    const unidades = new Set(p.occurrences.map((o) => `${o.file}#${o.memberName}`)).size;
    const memberAccess = p.occurrences.some((o) => o.isMemberAccess);
    if (unidades >= 3 && memberAccess) {
      ok++;
      conceptos.add(p.conceptName);
    }
  }
  return { problemas: ps.length, conRequired: ok, conceptos };
}

const v = pasan(viejoPerFile);
const n = pasan(nuevoPerFile);
const perdidos = [...v.conceptos].filter((c) => !n.conceptos.has(c));
console.log(
  JSON.stringify(
    {
      dir,
      archivos: archivos.length,
      leidos,
      guardas: { viejas: guardasViejas, nuevas: guardasNuevas },
      conceptos: { antes: v.problemas, despues: n.problemas },
      conLosDosRequired: { antes: v.conRequired, despues: n.conRequired },
      CONCEPTOS_PERDIDOS: perdidos,
    },
    null,
    1,
  ),
);
