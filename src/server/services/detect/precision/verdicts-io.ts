/**
 * Persistencia de la planilla de precisión — un CSV por población
 * (`tests/golden/precision/<slug>.verdicts.csv`), versionado en git a
 * propósito: la fuente de verdad de "qué dijo un humano sobre este
 * hallazgo" tiene que sobrevivir a que se borre `node_modules`, a otra
 * máquina, y a la corrida siguiente del instrumento — igual disciplina que
 * `graph/gate/labeled-dataset.ts` (JSON, ahí) para el mismo problema del
 * lado de las aristas del grafo. CSV en vez de JSON acá porque esto es
 * literalmente lo que el encargo pide ("una planilla para juzgar a mano"):
 * un humano lo abre, llena la columna `verdict`, guarda — sin herramienta
 * extra. No hay ninguna dependencia de CSV en `package.json`; `csv.ts`
 * implementa el mínimo RFC4180 que este archivo necesita.
 */
import fs from "node:fs";
import path from "node:path";

import { contentFindingKey } from "../../code-finding-ids.js";
import { encodeCsv, parseCsv } from "./csv.js";
import { CSV_COLUMNS, type PrecisionRow, type PrecisionVerdictOrPending } from "./types.js";

const VERDICT_VALUES: ReadonlySet<string> = new Set(["verdadero", "falso", "dudoso", ""]);

function asVerdict(filePath: string, columnName: string, id: string, raw: string): PrecisionVerdictOrPending {
  if (!VERDICT_VALUES.has(raw)) {
    throw new Error(
      `${filePath}: "${columnName}" inválido ("${raw}") en la fila id=${id} — sólo se acepta verdadero / falso / dudoso / (vacío)`,
    );
  }
  return raw as PrecisionVerdictOrPending;
}

/** Sin archivo ⇒ `[]` (primera corrida para este slug). */
export function readPrecisionCsv(filePath: string): PrecisionRow[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const { header, records } = parseCsv(text);
  if (header.length === 0) return [];

  const idx = new Map(header.map((h, i) => [h, i]));
  const col = (name: string): number => {
    const i = idx.get(name);
    if (i === undefined) throw new Error(`${filePath}: falta la columna "${name}" — ¿planilla de otra versión del instrumento?`);
    return i;
  };
  const at = (record: readonly string[], name: string): string => record[col(name)] ?? "";
  /**
   * Para columnas agregadas DESPUÉS de que ya existieran planillas sin ellas
   * (`language` y `lossReason`, ver `types.ts#CSV_COLUMNS`) — ausente en el
   * encabezado ⇒ `fallback`, nunca el error de "planilla de otra versión"
   * que sí dispara `col()` para las columnas del contrato original. Una
   * planilla vieja sigue siendo válida; sólo le falta un dato que se
   * backfillea en la próxima corrida del muestreador.
   */
  const atOptional = (record: readonly string[], name: string, fallback: string): string => {
    const i = idx.get(name);
    return i === undefined ? fallback : (record[i] ?? fallback);
  };

  return records.map((r) => {
    const id = at(r, "id");
    return {
      id,
      slug: at(r, "slug"),
      kind: at(r, "kind"),
      language: atOptional(r, "language", ""),
      pattern: at(r, "pattern"),
      file: at(r, "file"),
      startLine: Number(at(r, "startLine")) || 0,
      endLine: Number(at(r, "endLine")) || 0,
      symbol: at(r, "symbol"),
      title: at(r, "title"),
      detail: at(r, "detail"),
      metricLabel: at(r, "metricLabel"),
      metricValue: at(r, "metricValue"),
      evidence: at(r, "evidence"),
      verdict: asVerdict(filePath, "verdict", id, at(r, "verdict")),
      patternFit: asVerdict(filePath, "patternFit", id, at(r, "patternFit")),
      note: at(r, "note"),
      stillPresent: at(r, "stillPresent") !== "false",
      lossReason: atOptional(r, "lossReason", ""),
    };
  });
}

function rowToFields(r: PrecisionRow): string[] {
  return [
    r.id,
    r.slug,
    r.kind,
    r.language,
    r.pattern,
    r.file,
    String(r.startLine),
    String(r.endLine),
    r.symbol,
    r.title,
    r.detail,
    r.metricLabel,
    r.metricValue,
    r.evidence,
    r.verdict,
    r.patternFit,
    r.note,
    String(r.stillPresent),
    r.lossReason,
  ];
}

/** Orden estable — por `kind` y dentro de cada `kind` por `id` — para que `git diff` sobre la planilla muestre sólo lo que realmente cambió entre dos corridas. */
export function writePrecisionCsv(filePath: string, rows: readonly PrecisionRow[]): void {
  const sorted = rows
    .slice()
    .sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.kind < b.kind ? -1 : 1));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodeCsv(CSV_COLUMNS, sorted.map(rowToFields)), "utf8");
}

/**
 * UPSERT por `id` — el mecanismo que hace que "cómo se registra el
 * veredicto para que no haya que rehacerlo" (el encargo, literal) sea
 * cierto: un `verdict`/`patternFit`/`note` ya cargado en `existing` NUNCA se
 * pisa con la fila nueva homónima de `fresh` (se descarta la de `fresh`
 * entera para ese `id`). Filas de `existing` cuyo `id` ya no está VIVO se
 * CONSERVAN — nunca se borra un veredicto ya hecho — pero se marcan
 * `stillPresent: false` para que quien audite sepa que ese hallazgo ya no
 * se emite.
 *
 * *** `livePool` — CORREGIDO EN LA INTEGRACIÓN DE LA OLA H, ERA LA CAUSA DE
 * QUE "PRECISIÓN DESPUÉS DEL ARREGLO" NO SE PUDIERA MEDIR. *** Hasta acá la
 * liveness se decidía contra `fresh`, y `fresh` NO es el pool vivo: es la
 * MUESTRA de la corrida (hasta `--n` por kind — ver
 * `scripts/sample-findings-for-judgment.mts`). O sea que un hallazgo que el
 * detector SIGUE emitiendo, pero que esa corrida no sorteó entre sus 15,
 * quedaba marcado `stillPresent: false` igual que uno realmente
 * desaparecido. Con las dos causas mezcladas en una sola columna, no había
 * forma de separar "el arreglo eliminó este falso positivo" de "el sorteo
 * no lo eligió esta vez" — que es exactamente la pregunta del eje 1 de la
 * Ola H (`precisión antes y después`). `livePool` son los ids de TODOS los
 * hallazgos de la corrida, no sólo los muestreados; sin él se cae al
 * comportamiento viejo (`fresh`) para no romper a un llamador que todavía
 * no lo pase.
 *
 * DEDUPLICACIÓN DE `fresh` — segunda corrección de la misma integración: el
 * id es estable por `(kind, archivo, símbolo)` y NO incluye la línea (ver
 * `code-finding-ids.ts`), así que dos hallazgos del mismo kind en la misma
 * función comparten id. El bucle de abajo comparaba cada fila de `fresh`
 * sólo contra `existing`, nunca contra las filas de `fresh` ya empujadas, y
 * escribía las dos: 66 filas duplicadas medidas en las 9 planillas del
 * corpus, 18 de ellas juzgadas, inflando el denominador de precisión de
 * `demeter-chain`, `duplication`, `homonymous-delegation` y
 * `long-parameter-list`.
 *
 * RECONCILIACIÓN POR CONTENIDO (`liveContentKeyById`) — el defecto hermano de
 * los dos de arriba, y el más caro: el id (`stableFindingId`) cambia cuando
 * cambia el DETECTOR (agrega o saca una ubicación secundaria del hallazgo),
 * no sólo cuando cambia el código analizado. Medido: dos cadenas
 * `demeter-chain` de `preact` con MISMO kind/file/symbol/title/detail/
 * evidence en dos corridas, pero id distinto — el único juicio "verdadero"
 * quedaba huérfano bajo el id viejo para siempre, y `stillPresent` (que sólo
 * mira `id`) no tiene forma de saber que el hallazgo, para quien lo juzgó,
 * sigue siendo exactamente el mismo.
 *
 * Antes de resignarse a `stillPresent: false`, una fila de `existing` cuyo
 * `id` ya no está en `live` se busca por `contentFindingKey` (`code-finding-
 * ids.ts` — `kind`+`file`+`symbol`+`title` de la PRIMERA ubicación, nunca el
 * hash del id) contra `liveContentKeyById`. Si hay un id vivo con la misma
 * clave y todavía sin reclamar, la fila MIGRA: conserva `verdict`/
 * `patternFit`/`note` (el juicio humano, intacto) y adopta el id nuevo,
 * `stillPresent: true` — nunca se pisa un veredicto, sólo se le actualiza la
 * referencia. Ambigüedad (dos ids vivos con la misma clave, p.ej. el mismo
 * hallazgo emitido dos veces por un bug del detector) se resuelve tomando el
 * primero libre, determinista por el orden de iteración de
 * `liveContentKeyById`.
 *
 * *** CORREGIDO EN ESTA OLA — LA RECONCILIACIÓN DE ARRIBA ERA CORRECTA EN
 * AISLAMIENTO Y NO SE APLICABA NUNCA EN LA PRÁCTICA. *** La primera versión
 * exigía `!existingIds.has(id)` para el id vivo candidato — pensada para
 * evitar reclamar un id que otra fila de `existing` fuera a emitir por su
 * cuenta más abajo en el mismo recorrido. Pero en el corpus real, el id vivo
 * candidato YA tiene su propia fila en `existing` en el caso normal, no en el
 * excepcional: `sample-findings-for-judgment.mts` hace top-up en cada
 * corrida, así que para cuando una fila queda huérfana (el detector cambió y
 * dejó de emitir el id viejo) su gemela con el id nuevo casi siempre ya fue
 * agregada como fila SIN JUZGAR por esa misma corrida o una anterior — antes
 * de que existiera esta reconciliación. Con esa condición, NINGÚN huérfano
 * preexistente podía migrar jamás: `existingIds` incluye TODOS los ids de la
 * planilla, así que el candidato siempre estaba "ya ocupado".
 *
 * Verificado contra el corpus real, no sólo con datos sintéticos: las dos
 * cadenas `demeter-chain` de `preact` citadas arriba como caso testigo
 * (`compat/src/suspense.js:detachedClone`, `hooks/src/index.js:useReducer`)
 * seguían con su `verdict: verdadero` huérfano bajo el id viejo
 * (`demeter-chain:G5IrRfh_DJhjv65U` / `demeter-chain:eINHPYyXCrO-B57M`) EN LA
 * PROPIA PLANILLA de esta ola, mientras el id nuevo
 * (`demeter-chain:cx4t4c8pdzMPQ6P0` / `demeter-chain:lk_RyIjJPjVeHcRU`)
 * convivía al lado, sin juzgar — la reconciliación nunca se disparó pese a
 * estar implementada, porque el id nuevo ya era parte de `existingIds` desde
 * antes de este arreglo. Medido sobre las 8 poblaciones externas del corpus
 * (sin `ck-analyzer`, que se edita en paralelo por otros frentes de esta
 * misma ola y no sirve de línea base estable): 137 filas huérfanas juzgadas,
 * de las cuales 8 tenían una gemela viva bajo otro id — las 8 quedaban
 * atascadas para siempre con la condición vieja.
 *
 * La corrección: la fila viva ya presente en `existing` (si existe) es la
 * BASE del resultado — conserva sus propios campos (pueden ser más nuevos
 * que los de la huérfana: `language` backfilleado, `detail`/`metricValue`
 * actualizados) — y sólo recibe `verdict`/`patternFit`/`note` migrados desde
 * la huérfana. Único caso en que NO migra: si esa fila viva YA tiene su
 * propio `verdict` cargado — dos juicios humanos independientes sobre lo que
 * el contenido dice que es el mismo hallazgo es un conflicto real, no algo
 * que este instrumento pueda resolver solo, así que ninguno de los dos se
 * pisa y la huérfana queda archivada (`stillPresent: false`) como antes.
 *
 * Ausente (llamador viejo, o corrida sin pool completo) ⇒ sin reconciliación,
 * comportamiento idéntico a antes de esta corrección.
 *
 * DEDUPLICACIÓN DE `existing` (defecto hermano del de arriba, encontrado
 * auditando el corpus real para verificar la corrección anterior) — la
 * deduplicación de `fresh` de la Ola H (ver más arriba, "DEDUPLICACIÓN DE
 * `fresh`") sólo evita escribir un duplicado NUEVO; nunca limpia uno que ya
 * estuviera en la planilla desde ANTES de que esa corrección existiera.
 * Medido en las 8 poblaciones externas del corpus: 50 grupos de id
 * duplicado, 107 filas involucradas, 46 de esos grupos con contenido
 * (`title`/`startLine`/`detail`) IDÉNTICO entre sus filas (una escritura
 * repetida del mismo hallazgo) y ninguno de los 50 con veredicto o
 * `patternFit` en desacuerdo entre sus filas — colapsar es seguro: no hay
 * dos juicios independientes que reconciliar, sólo copias de más. `existing`
 * se deduplica por `id` ANTES de todo lo demás (`dedupeById`), así que
 * `existingById` de acá en más ya es 1 fila por id — y el propio `mergeRows`
 * se vuelve auto-sanador: cualquier duplicado que sobreviva en la planilla
 * hoy desaparece la próxima vez que `sample-findings-for-judgment.mts` corra
 * para ese slug, sin necesitar una limpieza manual aparte.
 */
function dedupeById(rows: readonly PrecisionRow[]): PrecisionRow[] {
  const byId = new Map<string, PrecisionRow>();
  for (const r of rows) {
    const prev = byId.get(r.id);
    // Preferir la fila JUZGADA del grupo — si ninguna lo está, o si la que ya
    // estaba también lo está, se conserva la primera vista (determinista por
    // orden de `existing`). Verificado en el corpus: cuando ambas están
    // juzgadas, siempre coinciden en `verdict`/`patternFit`, así que no hay
    // conflicto que esta regla pueda ocultar.
    if (!prev || (prev.verdict === "" && r.verdict !== "")) byId.set(r.id, r);
  }
  return [...byId.values()];
}

export function mergeRows(
  existingRaw: readonly PrecisionRow[],
  fresh: readonly PrecisionRow[],
  livePool?: ReadonlySet<string>,
  liveContentKeyById?: ReadonlyMap<string, string>,
): PrecisionRow[] {
  const existing = dedupeById(existingRaw);
  const live = livePool ?? new Set(fresh.map((r) => r.id));
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const freshById = new Map(fresh.map((r) => [r.id, r]));

  // Índice inverso clave-de-contenido → ids vivos con esa clave, sólo si el
  // llamador pasó el pool completo (no sólo la muestra) con sus claves.
  let liveIdsByContentKey: Map<string, string[]> | null = null;
  if (liveContentKeyById) {
    liveIdsByContentKey = new Map();
    for (const [id, key] of liveContentKeyById) {
      const bucket = liveIdsByContentKey.get(key);
      if (bucket) bucket.push(id);
      else liveIdsByContentKey.set(key, [id]);
    }
  }

  // Huérfanas → id vivo que reclaman, resuelto ANTES del recorrido principal
  // — así el recorrido puede sustituir la fila vigente (venga de `existing` o
  // de `fresh`) por la fusionada una sola vez, sin importar en qué orden
  // aparezcan la huérfana y su gemela viva dentro de `existing`.
  const donorByTargetId = new Map<string, PrecisionRow>();
  const claimedLiveIds = new Set<string>();
  const consumedOrphanIds = new Set<string>();

  if (liveIdsByContentKey) {
    for (const r of existing) {
      if (live.has(r.id)) continue; // no es huérfana
      const key = contentFindingKey(r);
      const candidates = liveIdsByContentKey.get(key) ?? [];
      // No alcanza con "no reclamado todavía": si el id vivo ya tiene su
      // propia fila CON veredicto propio, es el conflicto de dos juicios
      // independientes — ese candidato se descarta y se prueba el siguiente
      // (si lo hay), nunca se pisa un veredicto ya cargado.
      const availableId = candidates.find(
        (id) => !claimedLiveIds.has(id) && (existingById.get(id)?.verdict ?? "") === "",
      );
      if (availableId === undefined) continue;
      claimedLiveIds.add(availableId);
      consumedOrphanIds.add(r.id);
      donorByTargetId.set(availableId, r);
    }
  }

  /** Fila base para el id vivo `id` que un donante reclamó — preferí lo que
   * YA hay en `existing` (más fresco que la huérfana: puede traer `language`
   * backfilleado o un `detail`/`metricValue` actualizado), después lo que
   * trae `fresh` (dato de ESTA corrida), y sólo como último recurso los
   * propios campos de la huérfana con el id nuevo — cuando el id vivo no está
   * materializado como fila en ningún lado (vive en `analysis.findings` pero
   * ni `existing` ni el tope `--n` de esta muestra lo trajeron). */
  function baseRowFor(id: string, donor: PrecisionRow): PrecisionRow {
    return existingById.get(id) ?? freshById.get(id) ?? { ...donor, id };
  }

  /** `lossReason` viaja con el juicio, no con el id: es la anotación humana sobre ESE hallazgo (ver `types.ts`), y una fila que migra a un id nuevo se lleva todo su rastro humano o ninguno. Es inocuo que quede escrita en una fila viva — `recall-logic.ts` sólo la mira cuando la medición dice `perdido` — y perderla sería borrar una declaración de pérdida que alguien escribió a mano. */
  function applyDonor(row: PrecisionRow, donor: PrecisionRow): PrecisionRow {
    return {
      ...row,
      verdict: donor.verdict,
      patternFit: donor.patternFit,
      note: donor.note,
      lossReason: donor.lossReason,
      stillPresent: true,
    };
  }

  const merged: PrecisionRow[] = [];
  const emitted = new Set<string>();

  for (const r of existing) {
    if (consumedOrphanIds.has(r.id)) continue; // absorbida por la fila viva de abajo, no se emite aparte

    const donor = donorByTargetId.get(r.id);
    if (donor) {
      merged.push(applyDonor(baseRowFor(r.id, donor), donor));
      emitted.add(r.id);
      continue;
    }
    if (live.has(r.id)) {
      merged.push(r);
      emitted.add(r.id);
      continue;
    }
    merged.push({ ...r, stillPresent: false });
    emitted.add(r.id);
  }

  for (const r of fresh) {
    if (emitted.has(r.id)) continue;
    const donor = donorByTargetId.get(r.id);
    merged.push(donor ? applyDonor(r, donor) : r);
    emitted.add(r.id);
  }

  // Donantes cuyo id vivo no apareció en NINGUNO de los dos recorridos de
  // arriba (vive en el pool completo, pero ni `existing` ni el `--n` de esta
  // muestra lo trajeron como fila) — se materializan acá con el fallback de
  // `baseRowFor` (los propios campos de la huérfana, id nuevo).
  for (const [id, donor] of donorByTargetId) {
    if (emitted.has(id)) continue;
    merged.push(applyDonor(baseRowFor(id, donor), donor));
    emitted.add(id);
  }

  return merged;
}
