/**
 * OLA W · INTEGRADOR — el censo del NIVEL 2 (hipótesis por patrón, estado, lenguaje y ancla),
 * calculado a partir de VOLCADOS ya hechos en vez de re-corriendo el analizador.
 *
 * POR QUÉ NO ES `u-int-censo.mts` OTRA VEZ. Aquél corre `analyzeRepo` él mismo, un proceso por
 * repo, y por eso sólo puede censar el árbol de HOY. El cierre de una ola necesita las dos
 * columnas —antes y después— calculadas con el MISMO código, y el "antes" sale de volcados
 * reconstruidos desde la caché de análisis (`w-int-dump-desde-cache.mts`). Un instrumento que
 * lee volcados sirve para las dos columnas; uno que corre el analizador sólo sirve para una, y
 * eso es exactamente la deuda que cada ola viene declarando ("la columna «antes» no la re-medí
 * yo, el árbol de entonces ya no existe").
 *
 * COMPATIBILIDAD DELIBERADA: la salida por slug tiene el MISMO esquema que `u-int-censo.mts`
 * (`{slug, rows: [{id, repo, kind, pattern, state, lang, file, line, confidence}], kindLangRows}`),
 * para que `v-int-precision-nivel2.mts` —el instrumento de precisión de la Ola V, sin tocar—
 * consuma los dos lados sin cambios. El lenguaje se resuelve igual que allá: extensión de la
 * PRIMERA ubicación contra `LANGUAGE_DECLS`, la tabla del propio analizador, para que las
 * tablas de las dos olas se comparen dígito a dígito.
 *
 * LIMITACIÓN DECLARADA: `confidence` no viaja en el volcado de `dump-hallazgos.mts` (que sólo
 * guarda `{pattern, state}` por hipótesis), así que sale siempre `null`. Ningún consumidor
 * actual lo usa; queda escrito para que nadie lo lea como un dato.
 *
 * OLA AJ · FRENTE AJ2 — `dir`, LA DIRECCIÓN DE LA PROPUESTA DENTRO DE SU FILA. Hasta hoy la
 * fila del censo llevaba `file`/`line` de la PRIMERA ubicación del HALLAZGO, no de la
 * hipótesis: dos propuestas del mismo patrón en la misma fila salían del censo como dos filas
 * IDÉNTICAS, y `v-int-precision-nivel2.mts` las mete en un `Map` con clave `<id>::<patrón>`,
 * donde la segunda pisa a la primera. `dir` sale del campo `at` que `dump-hallazgos.mts`
 * escribe (`detect/precision/direccion-hipotesis.ts`) y es lo que vuelve direccionable la
 * clave `<id>@<dir>::<Patrón>`. **ES ADITIVO**: `id`, `file` y `line` no se tocan, así que la
 * clave vieja resuelve exactamente igual que antes. Un volcado ANTERIOR a este cambio no trae
 * `at`; ahí `dir` cae a `<file>:<line>` de la fila y el censo se comporta como el de siempre
 * (todas las hipótesis de la fila comparten dirección), sin romperse.
 *
 * Uso:
 *   npx tsx scripts/w-int-censo-nivel2.mts <dir-volcados> <dir-salida> [--tabla]
 */
import fs from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";

const EXT_TO_LANG = new Map<string, string>();
for (const decl of LANGUAGE_DECLS) for (const ext of decl.extensions) EXT_TO_LANG.set(ext, decl.id);

const languageOfFile = (file: string): string => EXT_TO_LANG.get(path.extname(file).toLowerCase()) ?? "?";

const REAL = new Set(["ausente", "parcial"]);

interface DumpedFinding {
  id: string;
  kind: string;
  where: readonly string[];
  /** `at` sólo lo traen los volcados posteriores al frente AJ2 — ver el docstring del módulo. */
  hypotheses: readonly { pattern: string; state: string; at?: string }[];
}
interface Row {
  id: string; repo: string; kind: string; pattern: string; state: string;
  lang: string; file: string; line: number; confidence: string | null;
  /** La dirección de ESTA propuesta dentro de su fila (`<archivo>:<línea>`, con desempate `#k`). */
  dir: string;
}

const [, , dumpsDir, outDir] = process.argv;
if (!dumpsDir || !outDir) {
  console.error("uso: w-int-censo-nivel2.mts <dir-volcados> <dir-salida> [--tabla]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const todas: Row[] = [];
for (const file of fs.readdirSync(dumpsDir).filter((f) => f.endsWith(".json")).sort()) {
  const slug = file.slice(0, -".json".length);
  const dump = JSON.parse(fs.readFileSync(path.join(dumpsDir, file), "utf8")) as { findings: DumpedFinding[] };
  const rows: Row[] = [];
  const kindLang = new Map<string, number>();
  for (const f of dump.findings) {
    const where = f.where[0] ?? "?:0";
    const sep = where.lastIndexOf(":");
    const fileName = sep > 0 ? where.slice(0, sep) : where;
    const line = sep > 0 ? Number(where.slice(sep + 1)) || 0 : 0;
    const lang = languageOfFile(fileName);
    kindLang.set(`${f.kind}|${lang}`, (kindLang.get(`${f.kind}|${lang}`) ?? 0) + 1);
    for (const h of f.hypotheses) {
      rows.push({ id: f.id, repo: slug, kind: f.kind, pattern: h.pattern, state: h.state, lang, file: fileName, line, confidence: null, dir: h.at ?? `${fileName}:${String(line)}` });
    }
  }
  const kindLangRows = [...kindLang].map(([k, n]) => {
    const [kind, lang] = k.split("|");
    return { kind: kind!, lang: lang!, n };
  });
  fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({ slug, rows, kindLangRows }, null, 1));
  todas.push(...rows);
}

console.log(`${todas.length} hipótesis en ${fs.readdirSync(outDir).length} repos -> ${outDir}`);

if (process.argv.includes("--tabla")) {
  const pats = [...new Set(todas.map((r) => r.pattern))].sort();
  console.log("\n| Patrón | total | reales | ausente | parcial | ya-aplicado | aplicado-eludido |");
  console.log("|---|---:|---:|---:|---:|---:|---:|");
  let T = 0, R = 0;
  for (const p of pats) {
    const rs = todas.filter((r) => r.pattern === p);
    const c = (s: string): number => rs.filter((r) => r.state === s).length;
    const reales = rs.filter((r) => REAL.has(r.state)).length;
    T += rs.length; R += reales;
    console.log(`| ${p} | ${rs.length} | ${reales} | ${c("ausente")} | ${c("parcial")} | ${c("ya-aplicado")} | ${c("aplicado-eludido")} |`);
  }
  console.log(`| **TOTAL** | **${T}** | **${R}** | | | | |`);

  console.log("\n=== POR LENGUAJE (total | recomendaciones reales) ===");
  for (const p of pats) {
    const rs = todas.filter((r) => r.pattern === p);
    const langs = [...new Set(rs.map((r) => r.lang))].sort();
    const tot = langs.map((l) => `${l} ${rs.filter((r) => r.lang === l).length}`).join(", ");
    const rec = langs
      .map((l) => [l, rs.filter((r) => r.lang === l && REAL.has(r.state)).length] as const)
      .filter(([, n]) => n > 0)
      .map(([l, n]) => `${l} ${n}`)
      .join(", ");
    console.log(`| ${p} | ${tot} | ${rec || "—"} |`);
  }

  console.log("\n=== POR ANCLA (kind del hallazgo que la disparó) ===");
  for (const p of pats) {
    const rs = todas.filter((r) => r.pattern === p);
    const kinds = [...new Set(rs.map((r) => r.kind))]
      .map((k) => [k, rs.filter((r) => r.kind === k).length] as const)
      .sort((a, b) => b[1] - a[1]);
    console.log(`| ${p} | ${kinds.map(([k, n]) => `${k} ${n}`).join(", ")} |`);
  }
}
