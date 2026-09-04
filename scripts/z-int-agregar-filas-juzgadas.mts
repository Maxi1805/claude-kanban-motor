/**
 * OLA Z · INTEGRADOR — INSERTA en `tests/golden/precision/<slug>.verdicts.csv` filas de
 * hallazgos que NUNCA fueron sorteados, con su veredicto humano ya decidido.
 *
 * POR QUÉ EXISTE, y por qué no alcanzaba `apply-precision-verdicts.mts`. Ese script, por
 * contrato explícito de su docstring, *"sólo actualiza filas cuyo `id` ya existe en el CSV;
 * ids desconocidos se reportan y se ignoran (nunca crean una fila nueva — eso es trabajo de
 * `sample-findings-for-judgment.mts`)"*. Y `sample-findings-for-judgment.mts` no sirve
 * tampoco: sortea `--n` por celda `(kind, lenguaje)` con semilla fija, así que no hay forma
 * de pedirle UN hallazgo concreto sin cambiar la semilla y con ella toda la muestra
 * histórica.
 *
 * El caso real que lo hizo falta (Ola Z, frente Z8): el frente cruzó "recomendación de
 * nivel 2 ya juzgada `verdadero`" contra "hallazgo de nivel 1 SIN veredicto", juzgó a mano
 * los 26 casos abriendo el archivo real, y 20 de esos 26 **nunca habían salido sorteados**,
 * o sea que no tenían fila donde escribir el veredicto. Tirar 20 juicios humanos porque el
 * muestreador no los eligió es perder trabajo ya pago.
 *
 * QUÉ NO HACE, a propósito:
 *  · No inventa la fila: la construye con `toPrecisionRow`, EL MISMO constructor que usa
 *    `sample-findings-for-judgment.mts`, sobre el `CodeFinding` real de la corrida de hoy.
 *    Una fila insertada acá es indistinguible de una sorteada, campo por campo.
 *  · No pisa un veredicto ya cargado: si el `id` ya está en el CSV, delega en el mismo
 *    comportamiento de actualización por `id` y lo dice.
 *  · No RE-CALCULA `stillPresent` de las filas viejas, y esto es deliberado y costó una
 *    corrida descartada: `mergeRows` sí lo recalcula contra el pool vivo, y al hacerlo dio
 *    vuelta filas heredadas que nadie de esta ola había tocado — un cambio real de la base
 *    de medición escondido dentro de "agregué 20 filas". Acá las filas viejas se conservan
 *    tal cual y las NUEVAS entran con `stillPresent: true`, que es un hecho verificado (el
 *    hallazgo salió del análisis de esta misma corrida), no una suposición.
 *  · No juzga nada. El veredicto viene escrito en el JSON de entrada.
 *
 * Uso:
 *   npx tsx scripts/z-int-agregar-filas-juzgadas.mts <dir> <slug> <juicios.json> [--out=ruta.csv]
 *
 * `juicios.json`: `{ [idDelHallazgo]: { verdict, patternFit?, note? } }` — el mismo formato
 * que consume `apply-precision-verdicts.mts`. Los ids que no correspondan a un hallazgo VIVO
 * de este slug se reportan y se ignoran (nunca se fabrica una fila sin hallazgo detrás).
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { toPrecisionRow } from "../src/server/services/detect/precision/sample.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";
import type { CodeFinding } from "../src/shared/types.js";

const MAX_EVIDENCE_CHARS = 180;

interface Juicio {
  verdict?: string;
  patternFit?: string;
  note?: string;
}

function evidenceLine(rootDir: string, file: string, startLine: number): string {
  if (!file) return "";
  try {
    const text = fs.readFileSync(path.join(rootDir, file), "utf8");
    const raw = text.split(/\r?\n/)[startLine - 1] ?? "";
    const trimmed = raw.trim();
    return trimmed.length > MAX_EVIDENCE_CHARS ? trimmed.slice(0, MAX_EVIDENCE_CHARS - 3) + "..." : trimmed;
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const outFlag = argv.find((a) => a.startsWith("--out="));
  const [dirArg, slug, jsonPath] = positional;
  if (!dirArg || !slug || !jsonPath) {
    console.error(
      "Uso: npx tsx scripts/z-int-agregar-filas-juzgadas.mts <dir> <slug> <juicios.json> [--out=ruta.csv]",
    );
    process.exit(1);
  }
  const dir = path.resolve(dirArg);
  const out = outFlag ? outFlag.slice("--out=".length) : path.resolve("tests/golden/precision", `${slug}.verdicts.csv`);

  const juicios = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<string, Juicio>;

  const { analysis, cache } = await analyzeRepoCached({
    dir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  console.error(`[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);

  const fileLanguage = new Map(analysis.files.map((f) => [f.path, f.language]));
  const languageOf = (f: CodeFinding): string => fileLanguage.get(f.locations[0]?.file ?? "") ?? "";

  // `CodeFinding.id` viene sin poblar en la salida de `analyzeRepo`: el id ESTABLE con el
  // que la planilla referencia cada fila lo deriva `stableFindingId`, y es el mismo que usa
  // `dump-hallazgos.mts` (`f.id ?? stableFindingId(f)`).
  const porId = new Map<string, CodeFinding>();
  for (const f of analysis.findings) {
    const id = f.id ?? stableFindingId(f);
    if (!porId.has(id)) porId.set(id, f);
  }

  const filas = readPrecisionCsv(out);
  const yaEstaban = new Map(filas.map((r) => [r.id, r]));

  let nuevas = 0;
  let actualizadas = 0;
  let ignorados = 0;
  for (const [id, j] of Object.entries(juicios)) {
    const yaEsta = yaEstaban.get(id);
    if (yaEsta) {
      if (j.verdict !== undefined) yaEsta.verdict = j.verdict as typeof yaEsta.verdict;
      if (j.patternFit !== undefined) yaEsta.patternFit = j.patternFit as typeof yaEsta.patternFit;
      if (j.note !== undefined) yaEsta.note = j.note;
      actualizadas++;
      continue;
    }
    const finding = porId.get(id);
    if (!finding) {
      ignorados++;
      continue; // no es de este slug, o ya no está vivo
    }
    const row = toPrecisionRow(
      finding,
      slug,
      evidenceLine(dir, finding.locations[0]?.file ?? "", finding.locations[0]?.startLine ?? 0),
      languageOf(finding),
    );
    row.id = id;
    row.stillPresent = true; // hecho verificado: sale del análisis de esta misma corrida
    if (j.verdict !== undefined) row.verdict = j.verdict as typeof row.verdict;
    if (j.patternFit !== undefined) row.patternFit = j.patternFit as typeof row.patternFit;
    if (j.note !== undefined) row.note = j.note;
    filas.push(row);
    nuevas++;
  }
  writePrecisionCsv(out, filas);

  console.error(
    `[z-int] ${slug}: ${nuevas} fila(s) NUEVA(s), ${actualizadas} ya existente(s) actualizada(s), ` +
      `${ignorados} id(s) fuera de este slug o no vivo(s) → ${filas.length} filas en ${out}`,
  );
}

await main();
