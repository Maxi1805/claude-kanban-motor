/**
 * AP5 (Ola AP) — sonda de SOLO LECTURA de Observer, corrida por AP5.
 * Una sola pasada por archivo. Corre:
 *   (a) el detector REAL `hard-wired-notification` (produccion),
 *   (b) el detector REAL `manual-notification` (produccion),
 *   (c) `scratchpad-ap5/hwn2.ts` — copia instrumentada del (a) con las variantes de escala,
 *   (d) `scratchpad-ap5/mn2.ts#probeMN` — el EMBUDO del (b), con el regex de produccion
 *       (`/call/i`) Y con el de la Ola AE (`/call|invocation/i`), para separar
 *       "la forma no existe" de "el detector no la reconoce".
 * Uso: npx tsx scripts/ap5-obs2.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector as hardWired } from "../src/server/services/detect/intra-file/hard-wired-notification.js";
import { detector as manualNotification } from "../src/server/services/detect/intra-file/manual-notification.js";
import { pisoDeclarado, presencia, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { RawFinding, RunContext } from "../src/server/services/detect/types.js";
import { probe } from "../scratchpad-ap5/hwn2.js";
import { probeMN, setConInvocation, type MNEmbudo } from "../scratchpad-ap5/mn2.js";

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

const VACIO = (): MNEmbudo => ({ funciones: 0, conCuerpo: 0, conDueno: 0, mutan: 0, conLlamadaDeCampo: 0, grupo2campos: 0, grupoConArgs: 0, grupoMismoArg: 0, clasesCon2Notificadores: 0, muestra2campos: [], muestraFinal: [], porClase: [] });
function acum(a: MNEmbudo, b: MNEmbudo): void {
  a.funciones += b.funciones; a.conCuerpo += b.conCuerpo; a.conDueno += b.conDueno; a.mutan += b.mutan;
  a.conLlamadaDeCampo += b.conLlamadaDeCampo; a.grupo2campos += b.grupo2campos; a.grupoConArgs += b.grupoConArgs;
  a.grupoMismoArg += b.grupoMismoArg; a.clasesCon2Notificadores += b.clasesCon2Notificadores;
  a.muestra2campos.push(...b.muestra2campos); a.muestraFinal.push(...b.muestraFinal);
  a.porClase.push(...b.porClase.filter((c) => c.miembros.length >= 2));
}

const files = await collectFiles(dir);
let analizados = 0;
const porLang: Record<string, number> = {};
const hw: { file: string; line: number; symbol: string; lugares: number; interesados: number }[] = [];
const mn: { file: string; line: number; symbol: string; title: string }[] = [];
const grupos: Record<string, { file: string; owner: string; targets: string[]; members: { name: string; line: number; endLine: number }[]; metodos: number }[]> = {};
let miembros = 0, mutan = 0, ownersSil = 0, candsConAviso = 0;
const clases: Record<string, number> = { self: 0, declared: 0, otro: 0 };
const histAll: Record<number, number> = {}; const histReal: Record<number, number> = {};
const mnProd = VACIO(); const mnAE = VACIO();
const mnProdPorLang: Record<string, MNEmbudo> = {}; const mnAEPorLang: Record<string, MNEmbudo> = {};

for (const sf of files) {
  const live = await resolveLiveFileUnit(dir, sf.path);
  if (!live) continue;
  analizados++;
  const lang = live.unit.language ?? "";
  porLang[lang] = (porLang[lang] ?? 0) + 1;
  try {
    let rs: readonly RawFinding[] = [];
    try { rs = hardWired.run(live.unit, ctxHW(lang)); } catch { rs = []; }
    for (const r of rs) {
      const t = (l: string) => r.trigger.find((x) => x.label === l)?.value ?? 0;
      hw.push({ file: sf.path, line: r.locations[0].startLine, symbol: r.locations[0].symbol ?? "", lugares: t("puntos de cambio que repiten el mismo listado"), interesados: t("interesados nombrados uno por uno") });
    }
    let ms: readonly RawFinding[] = [];
    try { ms = manualNotification.run(live.unit, ctxMN(lang) as never); } catch { ms = []; }
    for (const r of ms) mn.push({ file: sf.path, line: r.locations[0].startLine, symbol: r.locations[0].symbol ?? "", title: r.title });

    let p; try { p = probe(live.unit); } catch { p = null; }
    if (p) {
      miembros += p.miembros; mutan += p.miembrosQueMutan; ownersSil += p.ownersSilenciadosPor5a; candsConAviso += p.cands.length;
      for (const c of p.cands) {
        for (const n of c.notices) clases[n.clase] = (clases[n.clase] ?? 0) + 1;
        histAll[c.targetsAll.length] = (histAll[c.targetsAll.length] ?? 0) + 1;
        histReal[c.targetsReal.length] = (histReal[c.targetsReal.length] ?? 0) + 1;
      }
      for (const g of p.grupos) (grupos[g.variante] ??= []).push({ file: sf.path, owner: g.owner, targets: [...g.targets], members: g.members.map((m) => ({ ...m })), metodos: g.metodosDistintos });
    }

    for (const [con, acc, accL] of [[false, mnProd, mnProdPorLang], [true, mnAE, mnAEPorLang]] as const) {
      setConInvocation(con);
      let e: MNEmbudo | null = null;
      try { e = probeMN(live.unit); } catch { e = null; }
      if (e) { acum(acc, e); accL[lang] ??= VACIO(); acum(accL[lang]!, e); }
    }
    setConInvocation(false);
  } finally { live.release(); }
}

const conteoGrupos: Record<string, number> = {};
for (const k of Object.keys(grupos)) conteoGrupos[k] = grupos[k].length;
const compacto = (e: MNEmbudo) => ({ funciones: e.funciones, conCuerpo: e.conCuerpo, conDueno: e.conDueno, mutan: e.mutan, conLlamadaDeCampo: e.conLlamadaDeCampo, grupo2campos: e.grupo2campos, grupoConArgs: e.grupoConArgs, grupoMismoArg: e.grupoMismoArg, clasesCon2Notificadores: e.clasesCon2Notificadores });
writeFileSync(out, JSON.stringify({
  dir, archivos: files.length, analizados, porLang,
  hwReal: hw.length, mnReal: mn.length, miembros, mutan, ownersSil, candsConAviso, clases, histAll, histReal, conteoGrupos,
  mnProd: compacto(mnProd), mnAE: compacto(mnAE),
  mnProdPorLang: Object.fromEntries(Object.entries(mnProdPorLang).map(([k, v]) => [k, compacto(v)])),
  mnAEPorLang: Object.fromEntries(Object.entries(mnAEPorLang).map(([k, v]) => [k, compacto(v)])),
  mnAEFinal: mnAE.muestraFinal, mnAEClases: mnAE.porClase, mnProdFinal: mnProd.muestraFinal,
  hw, mn, grupos,
}, null, 1));
console.log(`${dir}: hwReal=${hw.length} mnReal=${mn.length} mnProd(final=${mnProd.grupoMismoArg},clases2=${mnProd.clasesCon2Notificadores}) mnAE(final=${mnAE.grupoMismoArg},clases2=${mnAE.clasesCon2Notificadores}) ${JSON.stringify(conteoGrupos)}`);
