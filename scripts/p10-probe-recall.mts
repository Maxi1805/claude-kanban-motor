/**
 * OLA P, FRENTE P10 — ¿la nueva agrupación de `duplication` deja de emitir
 * algún hallazgo que un humano ya juzgó `verdadero`?
 *
 * Mismo A/B en un solo proceso que `p10-probe-duplication.mts` (ver su
 * docstring para por qué): se corre `analyzeRepo` dos veces sobre el MISMO
 * árbol, la primera con el `groupKey` de Nivel 1 apagado y la segunda con él
 * puesto, y se cruzan las dos poblaciones con las MISMAS dos claves que usó la
 * medición de recall de la Ola O:
 *
 *   - `stableFindingId` (`code-finding-ids.ts`) — el id del contrato F2.
 *   - la identidad de CONTENIDO `(kind, archivo, símbolo, título)`
 *     (`contentKeyForFinding`), que existe justamente porque un detector que
 *     agrega o saca una ubicación secundaria cambia el id sin cambiar nada de
 *     lo que un humano LEE.
 *
 * Un hallazgo cuenta como perdido sólo si NINGUNA de las dos lo encuentra —
 * exactamente la regla de `ola-p/CONTEXTO.md` §2. Y además se cruza contra las
 * filas ya juzgadas de `tests/golden/precision/<slug>.verdicts.csv`, que es lo
 * único que responde la pregunta que importa: no "cuántos ids cambiaron" sino
 * "cuántos hallazgos que alguien confirmó a mano dejaron de estar".
 *
 * Uso: CK_ANALYSIS_CACHE=0 npx tsx scripts/p10-probe-recall.mts <dir> <slug>
 */
import { readFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { contentFindingKey, contentKeyForFinding, stableFindingId } from "../src/server/services/code-finding-ids.js";
import { DETECTORS } from "../src/server/services/detect/registry.js";
import type { CodeFinding } from "../src/shared/types.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("Uso: npx tsx scripts/p10-probe-recall.mts <dir> <slug>");
  process.exit(1);
}

const KIND = "duplication";
type Mutable = { groupKey?: unknown };
const target = DETECTORS.find((d) => d.id === KIND) as unknown as Mutable;
const groupKeyReal = target.groupKey;

async function corrida(): Promise<{ findings: readonly CodeFinding[]; volPorLang: Record<string, number>; volumen: number; cards: number; members: number }> {
  const { analysis } = await analyzeRepoCached({ dir, repoName: "p10", limits: { maxFindings: "unlimited" } });
  const findings = analysis.findings.filter((f) => f.kind === KIND);
  // La MISMA cuenta que `census.ts#censusOf`: `memberCount` una vez por cada
  // archivo distinto entre las `locations`, atribuido al lenguaje de ese
  // archivo. Va acá para no pagar un tercer par de análisis sobre el corpus.
  const langOf = new Map<string, string>();
  for (const f of analysis.files) langOf.set(f.path, f.language);
  const volPorLang: Record<string, number> = {};
  let volumen = 0;
  let members = 0;
  for (const f of findings) {
    const mc = f.memberCount ?? 1;
    const archivos = new Set(f.locations.map((l) => l.file));
    volumen += mc * archivos.size;
    members += mc;
    for (const archivo of archivos) {
      const lang = langOf.get(archivo) ?? "?";
      volPorLang[lang] = (volPorLang[lang] ?? 0) + mc;
    }
  }
  return { findings, volPorLang, volumen, cards: findings.length, members };
}

function claves(findings: readonly CodeFinding[]) {
  const ids = new Set<string>();
  const contenidos = new Set<string>();
  for (const f of findings) {
    const conId = f.id ? f : { ...f, id: stableFindingId(f) };
    ids.add(conId.id!);
    contenidos.add(contentKeyForFinding(conId));
  }
  return { ids, contenidos };
}

/** Las filas de este repo que un humano ya juzgó, con su veredicto. */
function veredictos(): { id: string; verdict: string; title: string; file: string }[] {
  const ruta = `tests/golden/precision/${slug}.verdicts.csv`;
  const texto = readFileSync(ruta, "utf8");
  const lineas = texto.split("\n");
  const cab = lineas[0]!.split(",");
  const iId = cab.indexOf("id");
  const iKind = cab.indexOf("kind");
  const iVer = cab.indexOf("verdict");
  const iTit = cab.indexOf("title");
  const iFile = cab.indexOf("file");
  // Parser de CSV con comillas, mínimo pero correcto para estas planillas.
  const campos = (linea: string): string[] => {
    const out: string[] = [];
    let actual = "";
    let enComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]!;
      if (enComillas) {
        if (c === '"' && linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else if (c === '"') enComillas = false;
        else actual += c;
      } else if (c === '"') enComillas = true;
      else if (c === ",") {
        out.push(actual);
        actual = "";
      } else actual += c;
    }
    out.push(actual);
    return out;
  };
  const filas: { id: string; verdict: string; title: string; file: string }[] = [];
  let acumulado = "";
  for (const linea of lineas.slice(1)) {
    acumulado = acumulado ? `${acumulado}\n${linea}` : linea;
    const comillas = (acumulado.match(/"/g) ?? []).length;
    if (comillas % 2 !== 0) continue; // fila multilínea, sigue
    const c = campos(acumulado);
    acumulado = "";
    if (c[iKind] !== KIND) continue;
    if (!c[iVer]) continue;
    filas.push({ id: c[iId] ?? "", verdict: c[iVer] ?? "", title: c[iTit] ?? "", file: c[iFile] ?? "" });
  }
  return filas;
}

target.groupKey = undefined;
const antes = await corrida();
target.groupKey = groupKeyReal;
const despues = await corrida();

const kAntes = claves(antes.findings);
const kDespues = claves(despues.findings);

const idsPerdidos = [...kAntes.ids].filter((id) => !kDespues.ids.has(id));
const contenidosPerdidos = [...kAntes.contenidos].filter((c) => !kDespues.contenidos.has(c));

const juzgados = veredictos();
const vivo = (fila: { id: string; title: string; file: string }): boolean => {
  if (kDespues.ids.has(fila.id)) return true;
  return kDespues.contenidos.has(contentFindingKey({ kind: KIND, file: fila.file, symbol: "", title: fila.title }));
};
const vivoAntes = (fila: { id: string; title: string; file: string }): boolean => {
  if (kAntes.ids.has(fila.id)) return true;
  return kAntes.contenidos.has(contentFindingKey({ kind: KIND, file: fila.file, symbol: "", title: fila.title }));
};

const perdidosJuzgados = juzgados.filter((f) => vivoAntes(f) && !vivo(f));

console.log(
  JSON.stringify(
    {
      slug,
      volumen: { antes: antes.volumen, despues: despues.volumen },
      volPorLang: { antes: antes.volPorLang, despues: despues.volPorLang },
      cards: { antes: antes.cards, despues: despues.cards },
      members: { antes: antes.members, despues: despues.members },
      idsPerdidos: idsPerdidos.length,
      contenidosPerdidos: contenidosPerdidos.length,
      juzgadosTotal: juzgados.length,
      juzgadosVivosAntes: juzgados.filter(vivoAntes).length,
      juzgadosVivosDespues: juzgados.filter(vivo).length,
      verdaderosVivosAntes: juzgados.filter((f) => f.verdict === "verdadero" && vivoAntes(f)).length,
      verdaderosVivosDespues: juzgados.filter((f) => f.verdict === "verdadero" && vivo(f)).length,
      perdidos: perdidosJuzgados.map((f) => ({ verdict: f.verdict, file: f.file, title: f.title })),
    },
    null,
    1,
  ),
);
