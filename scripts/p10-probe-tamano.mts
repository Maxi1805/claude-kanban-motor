/**
 * OLA P, FRENTE P10 — la CURVA precisión/tamaño de clon, del lado del COSTO.
 *
 * N2 (Ola N) midió la precisión por tramo de tamaño sobre los veredictos
 * humanos; lo que nunca se midió es la otra mitad del canje: cuánto VOLUMEN y
 * cuántos HALLAZGOS vive en cada tramo. Sin ese número, "subir el piso a 11
 * líneas" es una recomendación sin precio.
 *
 * Reparte el volumen del censo (`Σ memberCount` por archivo distinto del
 * hallazgo, `census.ts#censusOf`) en los mismos cuatro tramos que usó N2
 * (<=7, 8-10, 11-15, >=16 líneas), cruzado por lenguaje. El tamaño sale del
 * rango de líneas de la PRIMERA ubicación, que es el mismo número que el
 * título del hallazgo reporta y con el que se juzgaron las filas.
 *
 * Uso: npx tsx scripts/p10-probe-tamano.mts <dir> [<dir> ...]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("Uso: npx tsx scripts/p10-probe-tamano.mts <dir> [<dir> ...]");
  process.exit(1);
}

const KIND = "duplication";

function tramo(lineas: number): string {
  if (lineas <= 7) return "a <=7";
  if (lineas <= 10) return "b 8-10";
  if (lineas <= 15) return "c 11-15";
  return "d >=16";
}

for (const dir of dirs) {
  const { analysis: a } = await analyzeRepoCached({ dir, repoName: "p10", limits: { maxFindings: "unlimited" } });
  const langOf = new Map<string, string>();
  for (const f of a.files) langOf.set(f.path, f.language);

  const volPorTramo: Record<string, number> = {};
  const cardsPorTramo: Record<string, number> = {};
  const volPorTramoLang: Record<string, number> = {};
  let volTotal = 0;

  for (const f of a.findings) {
    if (f.kind !== KIND) continue;
    const loc = f.locations[0];
    if (!loc) continue;
    const lineas = loc.endLine - loc.startLine + 1;
    const t = tramo(lineas);
    const mc = f.memberCount ?? 1;
    const archivos = new Set(f.locations.map((l) => l.file));
    const vol = mc * archivos.size;
    volTotal += vol;
    volPorTramo[t] = (volPorTramo[t] ?? 0) + vol;
    cardsPorTramo[t] = (cardsPorTramo[t] ?? 0) + 1;
    const lang = langOf.get(loc.file) ?? "?";
    volPorTramoLang[`${lang}|${t}`] = (volPorTramoLang[`${lang}|${t}`] ?? 0) + vol;
  }

  console.log(JSON.stringify({ dir, volTotal, volPorTramo, cardsPorTramo, volPorTramoLang }, null, 1));
}
