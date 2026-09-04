/**
 * AP5 — sonda de SOLO LECTURA de Observer. No toca produccion.
 * Corre (a) el detector REAL `hard-wired-notification`, (b) el REAL
 * `manual-notification`, y (c) la copia instrumentada `scratchpad-ap5/hwn2.ts`
 * con los destinatarios CLASIFICADOS y las variantes de escala.
 * Uso: npx tsx scripts/ap5-obs.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector as hardWired } from "../src/server/services/detect/intra-file/hard-wired-notification.js";
import { detector as manualNotification } from "../src/server/services/detect/intra-file/manual-notification.js";
import { pisoDeclarado, presencia, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { RawFinding, RunContext } from "../src/server/services/detect/types.js";
import { probe } from "../scratchpad-ap5/hwn2.js";

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("uso: <dir> <out.json>"); process.exit(1); }

const mkPiso = (v: number, language: string) => resolveThreshold(pisoDeclarado(v, { rationale: "sonda AP5" }), { language, sampleSize: () => 0, corpusP95: () => null });
const mkPres = (language: string) => resolveThreshold(presencia({ rationale: "sonda AP5" }), { language, sampleSize: () => 0, corpusP95: () => null });

function ctxHW(language: string): RunContext<"interesados" | "lugares"> {
  return { language, capabilities: new Set(), threshold: (n) => (n === "interesados" ? mkPiso(3, language) : mkPres(language)) } as RunContext<"interesados" | "lugares">;
}
function ctxMN(language: string): RunContext<"distinctNotifiers"> {
  return { language, capabilities: new Set(), threshold: () => mkPres(language) } as RunContext<"distinctNotifiers">;
}

const files = await collectFiles(dir);
let analizados = 0;
const hw: { file: string; line: number; symbol: string; title: string; targets: string; lugares: number; interesados: number }[] = [];
const mn: { file: string; line: number; symbol: string; title: string }[] = [];
const grupos: Record<string, { file: string; owner: string; targets: string[]; members: { name: string; line: number; endLine: number }[]; metodos: number }[]> = {};
const clases: Record<string, number> = { self: 0, declared: 0, otro: 0 };
let miembros = 0, mutan = 0, ownersSil = 0, candsConAviso = 0;
const histAll: Record<number, number> = {};
const histReal: Record<number, number> = {};

for (const sf of files) {
  const live = await resolveLiveFileUnit(dir, sf.path);
  if (!live) continue;
  analizados++;
  const lang = live.unit.language ?? "";
  try {
    let rs: readonly RawFinding[] = [];
    try { rs = hardWired.run(live.unit, ctxHW(lang)); } catch { rs = []; }
    for (const r of rs) {
      const t = (l: string) => r.trigger.find((x) => x.label === l)?.value ?? 0;
      hw.push({ file: sf.path, line: r.locations[0].startLine, symbol: r.locations[0].symbol ?? "", title: r.title, targets: r.detail.slice(0, 0), lugares: t("puntos de cambio que repiten el mismo listado"), interesados: t("interesados nombrados uno por uno") });
    }
    let ms: readonly RawFinding[] = [];
    try { ms = manualNotification.run(live.unit, ctxMN(lang) as never); } catch { ms = []; }
    for (const r of ms) mn.push({ file: sf.path, line: r.locations[0].startLine, symbol: r.locations[0].symbol ?? "", title: r.title });

    let p;
    try { p = probe(live.unit); } catch { p = null; }
    if (p) {
      miembros += p.miembros; mutan += p.miembrosQueMutan; ownersSil += p.ownersSilenciadosPor5a; candsConAviso += p.cands.length;
      for (const c of p.cands) {
        for (const n of c.notices) clases[n.clase] = (clases[n.clase] ?? 0) + 1;
        histAll[c.targetsAll.length] = (histAll[c.targetsAll.length] ?? 0) + 1;
        histReal[c.targetsReal.length] = (histReal[c.targetsReal.length] ?? 0) + 1;
      }
      for (const g of p.grupos) {
        (grupos[g.variante] ??= []).push({ file: sf.path, owner: g.owner, targets: [...g.targets], members: g.members.map((m) => ({ ...m })), metodos: g.metodosDistintos });
      }
    }
  } finally { live.release(); }
}

const conteoGrupos: Record<string, number> = {};
for (const k of Object.keys(grupos)) conteoGrupos[k] = grupos[k].length;
writeFileSync(out, JSON.stringify({ dir, archivos: files.length, analizados, hwReal: hw.length, mnReal: mn.length, miembros, mutan, ownersSil, candsConAviso, clases, histAll, histReal, conteoGrupos, hw, mn, grupos }, null, 1));
console.log(`${dir}: hwReal=${hw.length} mnReal=${mn.length} ${JSON.stringify(conteoGrupos)}`);
