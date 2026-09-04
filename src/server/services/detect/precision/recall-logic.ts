/**
 * LÓGICA PURA DE LA COMPUERTA DE RECALL — la mitad simétrica de
 * `gate-logic.ts`, y la razón por la que existe está dicha en una frase: hasta
 * la ola que agregó este archivo, el árbol tenía una compuerta de PRECISIÓN
 * (piso 50 %, `gate-logic.ts`) y NINGUNA de recall. Esa asimetría premia
 * borrar. Cada ola se medía por los falsos que sacaba y jamás por los
 * verdaderos que perdía, y tres olas seguidas optimizaron contra ese
 * incentivo — el usuario lo notó sin instrumento: *"es verdad que estamos
 * bajando el ruido, pero parece que también bajamos los positivos en gran
 * medida"*. Un kind en 0 % de precisión sube a 50 % achicándolo hasta que sólo
 * emita lo obvio; sin esto, nadie se entera.
 *
 * ═══ EL MÉTODO, y por qué son DOS criterios y no uno ═══
 *
 * Un hallazgo juzgado `verdadero` en `tests/golden/precision/*.verdicts.csv`
 * se busca contra el pool COMPLETO de hallazgos de una corrida
 * (`scripts/dump-hallazgos.mts`, que pide `maxFindings: "unlimited"`) por DOS
 * llaves independientes:
 *
 *   1. `id` — el `stableFindingId` (`code-finding-ids.ts`), la misma llave con
 *      la que la planilla referencia la fila.
 *   2. `contentFindingKey` — `(kind, archivo, símbolo, título)` de la PRIMERA
 *      ubicación.
 *
 * Cuenta PERDIDO sólo si NINGUNO de los dos lo encuentra. Los dos hacen falta:
 * `stableFindingId` hashea TODAS las ubicaciones del hallazgo, así que un
 * detector que agrega o saca una ubicación secundaria mueve el hash aunque el
 * hallazgo siga vivo y sea, para el humano que lo juzgó, exactamente el mismo
 * (el caso medido está en el docstring de `contentFindingKey`: dos cadenas
 * `demeter-chain` de `preact` con mismo kind/file/symbol/title/detail/evidence
 * y distinto id). Medir con `id` solo sobreestima la pérdida; medir con
 * contenido solo la subestima cuando dos hallazgos distintos comparten
 * `(kind, file, símbolo)` — por eso el contenido lleva `title`, que es el campo
 * que los separa.
 *
 * ═══ LA TRAMPA QUE ESTO NO PISA: `stillPresent` NO SIRVE ═══
 *
 * La columna `stillPresent` de la planilla parece responder exactamente esta
 * pregunta y NO la responde. La escribe `mergeRows` comparando contra el pool
 * de la corrida del MUESTREADOR, que históricamente fue la MUESTRA (hasta `n`
 * por kind) y no el pool completo — un hallazgo vivo que simplemente no salió
 * sorteado figura ausente. Está documentado en `dump-hallazgos.mts` y en
 * `verdicts-io.ts#mergeRows` ("la causa de que precisión después del arreglo
 * no se pudiera medir durante seis olas"). Una medición de recall construida
 * sobre esa columna heredaría el mismo defecto y sería peor que no medir,
 * porque parecería una medición. Por eso este módulo NUNCA lee `stillPresent`.
 *
 * ═══ QUÉ DECLARA CADA PIEZA ═══
 *
 * `classifyRow` cruza UNA fila contra UN pool — es todo el método, y es puro.
 * `RecallSnapshot` es el RESULTADO de haber cruzado un slug entero, guardado a
 * disco (`recall-snapshot-io.ts`). `evaluateRecallGate` no cruza nada: agrega
 * los snapshots ya medidos contra las planillas y decide qué es una pérdida
 * silenciosa. Esa separación es la que hace que la compuerta cueste
 * milisegundos y no trece análisis de repo — ver el docstring de
 * `recall-gate.test.ts`.
 *
 * ═══ EL NÚMERO NO SE PUEDE COMPRAR CON PROSA ═══
 *
 * `lossReason` (la vía de escape, `types.ts`) cambia el VEREDICTO de la
 * compuerta, nunca la CIFRA: un verdadero muerto cuenta como perdido para el
 * recall lo haya justificado alguien o no. Si declarar subiera el recall, la
 * columna sería un botón para apagar la medición. Lo único que compra escribir
 * el motivo es que la pérdida quede asentada y auditable en `git diff` de la
 * planilla en vez de evaporarse entre dos censos.
 */
import { contentFindingKey, type FindingContentIdentity } from "../../code-finding-ids.js";
import { wilsonInterval, type WilsonInterval } from "../../graph/gate/wilson.js";
import { MIN_JUDGED_FOR_SIGNAL } from "./report.js";
import type { PrecisionRow } from "./types.js";

/** Por qué llave se encontró vivo el hallazgo — se guarda a propósito: si un slug pasa de encontrar todo por `id` a encontrar la mitad por `contenido`, alguien cambió la forma de los hallazgos de ese detector, y eso se quiere ver aunque el recall no se mueva. */
export type RecallMatchCriterion = "id" | "contenido";
export type RecallStatus = RecallMatchCriterion | "perdido";

/** Prefijo convenido para la DEUDA PREVIA — las pérdidas que ya existían el día que se construyó la compuerta y que no se pueden atribuir a ningún frente. Se cuentan aparte de las pérdidas declaradas por quien las causó: mezclarlas dejaría que una pérdida nueva se escondiera detrás del volumen de la deuda vieja. */
export const HERITAGE_PREFIX = "heredada:";

/**
 * El pool COMPLETO de hallazgos de una corrida, reducido a las dos llaves que
 * el cruce necesita. Se construye con `buildLivePool`; nunca se guarda a disco
 * (para `guava` son miles de entradas y el snapshot quedaría ilegible) — lo
 * que se guarda es el RESULTADO del cruce, fila por fila.
 */
export interface LiveFindingPool {
  ids: ReadonlySet<string>;
  contentKeys: ReadonlySet<string>;
}

/** Lo mínimo que hace falta de un hallazgo volcado para cruzarlo — así `scripts/recall-snapshot.mts` puede alimentar esto desde el JSON de `dump-hallazgos.mts` sin reconstruir un `CodeFinding` entero. */
export interface DumpedFinding {
  id: string;
  kind: string;
  title: string;
  /** `["archivo:línea", ...]`, tal cual lo escribe `dump-hallazgos.mts`. */
  where: readonly string[];
  symbols: readonly string[];
}

/** `"src/a.ts:120"` → `"src/a.ts"`. Sólo el ÚLTIMO `:número` — una ruta puede tener dos puntos adentro. */
export function fileOfWhere(where: string): string {
  return where.replace(/:\d+$/, "");
}

export function buildLivePool(findings: readonly DumpedFinding[]): LiveFindingPool {
  const ids = new Set<string>();
  const contentKeys = new Set<string>();
  for (const f of findings) {
    ids.add(f.id);
    contentKeys.add(
      contentFindingKey({
        kind: f.kind,
        file: f.where[0] === undefined ? "" : fileOfWhere(f.where[0]),
        symbol: f.symbols[0] ?? "",
        title: f.title,
      }),
    );
  }
  return { ids, contentKeys };
}

/** El cruce, para UNA fila. `id` primero: es la llave exacta, y saber que hizo falta caer al contenido es información (ver `RecallMatchCriterion`). */
export function classifyRow(row: FindingContentIdentity & { id: string }, pool: LiveFindingPool): RecallStatus {
  if (pool.ids.has(row.id)) return "id";
  if (pool.contentKeys.has(contentFindingKey(row))) return "contenido";
  return "perdido";
}

/**
 * La medición de UN slug, ya cruzada y guardada — el artefacto que hace barata
 * a la compuerta. `status` va fila por fila (y no un contador agregado) a
 * propósito: un total no se puede auditar, una fila sí, y `git diff` sobre este
 * archivo muestra EXACTAMENTE qué verdadero se murió entre dos olas.
 */
export interface RecallSnapshot {
  slug: string;
  /** SHA del repo del corpus con el que se midió (`tests/golden/manifest.json`). "" si no se pudo resolver. Es lo que hace comparable un snapshot con otro: dos mediciones sobre SHA distintos no miden lo mismo. */
  sha: string;
  measuredAt: string;
  /** `analyze-cache.ts#analyzerFingerprint` — la huella del ANALIZADOR con el que se midió. Es lo que permite decir "este snapshot es viejo" sin volver a correr nada. */
  analyzerFingerprint: string;
  /** Cuántos hallazgos tenía el pool completo — el contexto de volumen del cruce; un pool que se derrumbó explica un recall que se derrumbó. */
  poolFindings: number;
  /** De dónde salió el pool (ruta del volcado). Rastro, no lógica. */
  source: string;
  /** `id` de la fila juzgada `verdadero` → cómo salió el cruce. Las filas que no son `verdadero` NO entran: el recall se mide sobre verdaderos, y meter el resto sería inflar el archivo con datos que nadie consulta. */
  status: Readonly<Record<string, RecallStatus>>;
}

/** Poblaciones cuyo CÓDIGO no está clavado a un SHA congelado y que por eso NO se pueden usar para medir recall. Ver `ola-p/informes/AVISO-recall-ck-analyzer.md`: `ck-analyzer` es el repo del propio analizador, lo reescribimos nosotros, y ahí un verdadero desaparece porque el archivo que lo contenía ya no existe — aporta 33 pérdidas sobre 33 verdaderos juzgados, el 100 %, en kinds intocados y al 100 % de precisión (`long-function`, `complexity`, `primitive-obsession`). Una compuerta que lo incluya falla en toda ola que toque el analizador, o sea siempre, y una compuerta que siempre falla se termina desactivando — que es peor que no tenerla. */
export const POBLACIONES_SIN_SHA_CONGELADO: readonly string[] = ["ck-analyzer"];

export interface RecallRowOutcome {
  slug: string;
  id: string;
  kind: string;
  language: string;
  file: string;
  symbol: string;
  title: string;
  status: RecallStatus;
  lossReason: string;
}

/** Un slug con verdaderos juzgados y sin snapshot, o con snapshot que no cubre esa fila — NO es una pérdida (no se sabe) ni un verde (tampoco se sabe). Se cuenta y se imprime aparte, siempre. */
export interface RecallUnmeasured {
  slug: string;
  judgedTrue: number;
  reason: "sin-snapshot" | "fuera-del-snapshot" | "poblacion-sin-sha-congelado";
}

export interface RecallCell {
  key: string;
  measured: number;
  alive: number;
  lostDeclared: number;
  lostSilent: number;
  /** `alive / measured` — `null` si `measured === 0`. Declarar una pérdida NO la mueve (ver el docstring del módulo). */
  recall: number | null;
  wilson: WilsonInterval | null;
  sufficientBasis: boolean;
}

export interface StaleSnapshot {
  slug: string;
  measuredAt: string;
  snapshotFingerprint: string;
}

export interface RecallGateResult {
  /** Filas `verdadero` de poblaciones medibles y cubiertas por un snapshot. */
  measured: number;
  alive: number;
  aliveById: number;
  aliveByContent: number;
  /** Pérdidas con `lossReason` escrito por quien la causó — declaradas, auditables, NO rompen la compuerta. */
  declaredLoss: readonly RecallRowOutcome[];
  /** Subconjunto de las declaradas con el prefijo `heredada:` — la deuda previa a la compuerta, contada aparte para que no tape una pérdida nueva. */
  inheritedLoss: readonly RecallRowOutcome[];
  /** Pérdidas SIN motivo escrito. Ésta es la lista que rompe la compuerta. */
  silentLoss: readonly RecallRowOutcome[];
  unmeasured: readonly RecallUnmeasured[];
  byKind: readonly RecallCell[];
  byLanguage: readonly RecallCell[];
  /** Por `(kind, lenguaje)` — la dimensión obligatoria del proyecto: la lección más cara fue un detector que murió en cuatro lenguajes mientras uno sobrevivía al 99 %, y el promedio por kind no lo mostró. */
  byKindLanguage: readonly (RecallCell & { kind: string; language: string })[];
  bySlug: readonly RecallCell[];
  /** Snapshots medidos con OTRA versión del analizador que la que hay hoy en el árbol. No rompen la compuerta (todo frente cambia el analizador; si esto fallara, la compuerta estaría roja siempre y se desactivaría) pero se imprimen SIEMPRE: un verde sobre snapshots viejos no dice nada. */
  stale: readonly StaleSnapshot[];
}

function cell(key: string, outcomes: readonly RecallRowOutcome[]): RecallCell {
  const alive = outcomes.filter((o) => o.status !== "perdido").length;
  const lost = outcomes.filter((o) => o.status === "perdido");
  const lostDeclared = lost.filter((o) => o.lossReason !== "").length;
  return {
    key,
    measured: outcomes.length,
    alive,
    lostDeclared,
    lostSilent: lost.length - lostDeclared,
    recall: outcomes.length > 0 ? alive / outcomes.length : null,
    wilson: outcomes.length > 0 ? wilsonInterval(alive, outcomes.length) : null,
    sufficientBasis: outcomes.length >= MIN_JUDGED_FOR_SIGNAL,
  };
}

function groupCells(outcomes: readonly RecallRowOutcome[], keyOf: (o: RecallRowOutcome) => string): RecallCell[] {
  const byKey = new Map<string, RecallRowOutcome[]>();
  for (const o of outcomes) {
    const k = keyOf(o);
    const bucket = byKey.get(k);
    if (bucket) bucket.push(o);
    else byKey.set(k, [o]);
  }
  return [...byKey.entries()]
    .map(([k, v]) => cell(k, v))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * `rows` — TODAS las filas de TODAS las planillas; filtrar por veredicto y por
 * población medible es responsabilidad de ESTA función, nunca del llamador.
 * Misma disciplina que `evaluateGate` y por el mismo antecedente: un
 * `live`/`historical` ya separado por quien llama es un lugar donde se puede
 * perder una fila sin que se note.
 *
 * `currentFingerprint` — la huella del analizador de HOY, para marcar
 * snapshots viejos. "" ⇒ no se chequea vigencia (el llamador no la tiene o no
 * la quiere pagar).
 *
 * DEDUPLICACIÓN por `(slug, id)`: las planillas del corpus tienen filas
 * duplicadas por id documentadas y medidas (50 grupos, 107 filas — ver
 * `mergeRows`). Sin deduplicar, un verdadero duplicado contaría dos veces en
 * el denominador y una pérdida contaría doble. Se conserva la primera fila que
 * traiga `lossReason` escrito, y si ninguna lo trae, la primera vista: así un
 * motivo cargado en cualquiera de las copias vale para el grupo.
 */
export function evaluateRecallGate(
  rows: readonly PrecisionRow[],
  snapshots: readonly RecallSnapshot[],
  currentFingerprint = "",
): RecallGateResult {
  const snapshotBySlug = new Map(snapshots.map((s) => [s.slug, s]));
  const excluded = new Set(POBLACIONES_SIN_SHA_CONGELADO);

  const byKey = new Map<string, PrecisionRow>();
  for (const r of rows) {
    if (r.verdict !== "verdadero") continue;
    const key = `${r.slug}\u0000${r.id}`;
    const prev = byKey.get(key);
    if (!prev || (prev.lossReason === "" && r.lossReason !== "")) byKey.set(key, r);
  }
  const trueRows = [...byKey.values()];

  const outcomes: RecallRowOutcome[] = [];
  const unmeasuredCount = new Map<string, { slug: string; reason: RecallUnmeasured["reason"]; n: number }>();
  const bumpUnmeasured = (slug: string, reason: RecallUnmeasured["reason"]): void => {
    const k = `${slug}\u0000${reason}`;
    const e = unmeasuredCount.get(k);
    if (e) e.n++;
    else unmeasuredCount.set(k, { slug, reason, n: 1 });
  };

  for (const r of trueRows) {
    if (excluded.has(r.slug)) {
      bumpUnmeasured(r.slug, "poblacion-sin-sha-congelado");
      continue;
    }
    const snap = snapshotBySlug.get(r.slug);
    if (!snap) {
      bumpUnmeasured(r.slug, "sin-snapshot");
      continue;
    }
    const status = snap.status[r.id];
    if (status === undefined) {
      // Veredicto cargado DESPUÉS de la última medición — no se sabe si vive.
      // No es una pérdida ni un verde: se dice.
      bumpUnmeasured(r.slug, "fuera-del-snapshot");
      continue;
    }
    outcomes.push({
      slug: r.slug,
      id: r.id,
      kind: r.kind,
      language: r.language,
      file: r.file,
      symbol: r.symbol,
      title: r.title,
      status,
      lossReason: r.lossReason,
    });
  }

  const lost = outcomes.filter((o) => o.status === "perdido");
  const declaredLoss = lost.filter((o) => o.lossReason !== "");
  const silentLoss = lost.filter((o) => o.lossReason === "");
  const inheritedLoss = declaredLoss.filter((o) => o.lossReason.startsWith(HERITAGE_PREFIX));

  const stale: StaleSnapshot[] = [];
  if (currentFingerprint !== "") {
    for (const s of snapshots) {
      if (excluded.has(s.slug)) continue;
      if (s.analyzerFingerprint !== currentFingerprint) {
        stale.push({ slug: s.slug, measuredAt: s.measuredAt, snapshotFingerprint: s.analyzerFingerprint });
      }
    }
    stale.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  }

  const byKindLanguage = groupCells(outcomes, (o) => `${o.kind}\u0000${o.language}`).map((c) => {
    const [kind = "", language = ""] = c.key.split("\u0000");
    return { ...c, kind, language, key: `${kind} · ${language === "" ? "(sin lenguaje)" : language}` };
  });

  return {
    measured: outcomes.length,
    alive: outcomes.filter((o) => o.status !== "perdido").length,
    aliveById: outcomes.filter((o) => o.status === "id").length,
    aliveByContent: outcomes.filter((o) => o.status === "contenido").length,
    declaredLoss,
    inheritedLoss,
    silentLoss,
    unmeasured: [...unmeasuredCount.values()]
      .map((e) => ({ slug: e.slug, judgedTrue: e.n, reason: e.reason }))
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)),
    byKind: groupCells(outcomes, (o) => o.kind),
    byLanguage: groupCells(outcomes, (o) => (o.language === "" ? "(sin lenguaje)" : o.language)),
    byKindLanguage,
    bySlug: groupCells(outcomes, (o) => o.slug),
    stale,
  };
}

function pct(x: number | null): string {
  return x === null ? "—" : `${(x * 100).toFixed(0)}%`;
}

export function formatRecallCells(cells: readonly RecallCell[], indent = "  "): string {
  return cells
    .map((c) => {
      const w = c.wilson ? ` (Wilson95 [${pct(c.wilson.lower)}, ${pct(c.wilson.upper)}])` : "";
      const basis = c.measured > 0 && !c.sufficientBasis ? ` · BASE INSUFICIENTE (n=${c.measured}<${MIN_JUDGED_FOR_SIGNAL})` : "";
      const perdidas =
        c.lostDeclared + c.lostSilent > 0
          ? ` · perdidos ${c.lostDeclared + c.lostSilent} (${c.lostDeclared} declarada(s), ${c.lostSilent} SIN DECLARAR)`
          : "";
      return `${indent}${c.key.padEnd(38)} ${c.alive}/${c.measured} vivos ⇒ recall ${pct(c.recall)}${w}${basis}${perdidas}`;
    })
    .join("\n");
}

/** El mensaje de una pérdida silenciosa — el texto que rompe la compuerta, escrito para que quien lo lea sepa exactamente qué hacer. */
export function formatSilentLoss(o: RecallRowOutcome): string {
  return (
    `${o.kind} [${o.slug}${o.language === "" ? "" : "/" + o.language}] ${o.file}${o.symbol === "" ? "" : ` (${o.symbol})`}` +
    ` — "${o.title}" · id=${o.id}\n` +
    `      Este hallazgo estaba juzgado VERDADERO por un humano y el analizador ya no lo emite (ni por id ni por contenido).\n` +
    `      Si lo mataste a propósito, escribí POR QUÉ en la columna \`lossReason\` de tests/golden/precision/${o.slug}.verdicts.csv.\n` +
    `      Si no era a propósito, es una regresión de recall: arreglala. La compuerta NO se afloja bajando un piso.`
  );
}
