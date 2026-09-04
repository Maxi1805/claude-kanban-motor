/**
 * P5 (ola P) — sonda de COMPOSICIÓN de `feature-envy-intra`.
 *
 * Para cada hallazgo que el detector emite, dice de dónde sale el proveedor
 * dominante que el título nombra:
 *   - `parametro`   — es un parámetro del propio método (la única forma que el
 *                     detector podía emitir hasta la ola O);
 *   - `colaborador` — es un miembro de la clase (campo, propiedad, accesor,
 *                     variable de instancia) por el que pasa el acceso.
 *
 * Y, para el caso `parametro`, cuántos OTROS métodos de la misma clase
 * declaran un parámetro con EL MISMO NOMBRE — la señal de "este tipo es el
 * sujeto que la clase procesa", no un destino de `Move Method`.
 *
 * Sólo lee: no cambia el detector ni sus umbrales.
 *
 * Uso: npx tsx scripts/p5-probe-proveedor.mts <salida.json> <dir> [<dir>…]
 */
import { writeFileSync } from "node:fs";

import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector } from "../src/server/services/detect/intra-file/feature-envy-intra.js";
import { resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { AstNode, RunContext } from "../src/server/services/detect/types.js";

const [, , out, ...dirs] = process.argv;
if (!out || dirs.length === 0) {
  console.error("Uso: npx tsx scripts/p5-probe-proveedor.mts <salida.json> <dir> [<dir>…]");
  process.exit(1);
}

type K = keyof (typeof detector)["thresholds"];
function ctxFor(language: string): RunContext<K> {
  return {
    language,
    capabilities: new Set(),
    threshold: (name: K) => resolveThreshold(detector.thresholds[name], { language, sampleSize: () => 0, corpusP95: () => null }),
  };
}

const PARAM_FIELDS = ["parameters", "parameter_list"];
const IDENT = /(^|_)identifier$/;
const TYPE_IDENT = /^type_identifier$/;
function isIdent(n: AstNode): boolean {
  return n.isNamed && IDENT.test(n.type) && !TYPE_IDENT.test(n.type);
}
function fieldOf(n: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = n.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}
function paramNames(node: AstNode): string[] {
  const params = fieldOf(node, PARAM_FIELDS);
  if (!params) return [];
  if (isIdent(params)) return [params.text];
  const names: string[] = [];
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    if (isIdent(child)) {
      names.push(child.text);
      continue;
    }
    const byName = fieldOf(child, ["name", "pattern"]);
    if (byName && isIdent(byName)) names.push(byName.text);
  }
  return names;
}

interface Row {
  repo: string;
  file: string;
  language: string;
  line: number;
  symbol: string;
  provider: string;
  className: string;
  origen: "parametro" | "colaborador";
  /** métodos de la MISMA clase (incluido éste) que declaran un parámetro con el nombre del proveedor. */
  hermanosConEseParametro: number;
  metodosDeLaClase: number;
  atfd: number;
  laa: number;
  own: number;
}

const rows: Row[] = [];
for (const dir of dirs) {
  const repo = dir.replace(/\/+$/, "").split("/").pop() ?? dir;
  const antes = rows.length;
  for (const f of await collectFiles(dir)) {
    const live = await resolveLiveFileUnit(dir, f.path);
    if (!live) continue;
    try {
      const unit = live.unit;
      const params = new Map<string, readonly string[]>();
      for (const fn of unit.functions) params.set(`${fn.startLine}:${fn.endLine}`, paramNames(fn.node));
      for (const finding of detector.run(unit, ctxFor(unit.language))) {
        const m = /^"(.*)" usa más datos de "(.*)" que de "(.*)"$/.exec(finding.title);
        if (!m) continue;
        const [, sym, provider, className] = m as unknown as [string, string, string, string];
        const loc = finding.locations[0];
        const own = unit.functions.find((fn) => fn.startLine === loc.startLine && fn.endLine === loc.endLine);
        const mine = own ? (params.get(`${own.startLine}:${own.endLine}`) ?? []) : [];
        const siblings = unit.functions.filter((fn) => fn.metrics.className === className);
        rows.push({
          repo,
          file: loc.file,
          language: unit.language,
          line: loc.startLine,
          symbol: sym,
          provider,
          className,
          origen: mine.includes(provider) ? "parametro" : "colaborador",
          hermanosConEseParametro: siblings.filter((fn) => (params.get(`${fn.startLine}:${fn.endLine}`) ?? []).includes(provider)).length,
          metodosDeLaClase: siblings.length,
          atfd: finding.trigger[0].value,
          laa: finding.trigger[1]?.value ?? -1,
          own: finding.evidence?.find((e) => e.label.startsWith("miembros propios distintos"))?.value ?? -1,
        });
      }
    } finally {
      live.release();
    }
  }
  console.error(`${repo}: ${rows.length - antes}`);
}

const porOrigen: Record<string, number> = {};
for (const r of rows) porOrigen[`${r.language}/${r.origen}`] = (porOrigen[`${r.language}/${r.origen}`] ?? 0) + 1;
writeFileSync(out, JSON.stringify({ total: rows.length, porOrigen, rows }, null, 2));
console.error(`TOTAL ${rows.length}`, porOrigen);
