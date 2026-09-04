/**
 * `score` — CONTRATO-F5.md §1.6, el ranking final que reemplaza comparar
 * `severity` cruda entre detectores (§1.1: la causa medida de que en guava
 * `feature-envy-intra` ocupara 84/200 filas del panel mientras
 * `unused-variable` (1 514 instancias) y `demeter-chain` (766) no aparecían
 * ninguna vez).
 *
 * ```
 * score(f) = ( 0.40·R_sev(f) + 0.35·impact(f) + 0.25·reach(f) ) · conf(f)
 * ```
 *
 * Los cuatro factores, y de dónde sale cada uno:
 *   - `R_sev` — rango normalizado (`rank.ts`) de `f.severity` DENTRO de los
 *     hallazgos con el MISMO `detectorId` EN ESTA CORRIDA. Nunca se compara
 *     `severity` entre detectores distintos — ver `impact.ts`/§1.3.
 *   - `impact` — constante por detector, `impact.ts`. NO calibrada contra
 *     volumen: es la respuesta a "cuánto importa este PROBLEMA", no a
 *     "cuánto aparece".
 *   - `reach` — por el archivo primario del hallazgo (`locations[0].file`),
 *     `reach.ts`, sobre el grafo YA construido (nunca se recomputa acá).
 *   - `conf` — el ÚNICO factor multiplicativo, acotado en [0.5, 1.0]: una
 *     degradación, nunca puede dominar ni anular. Default 1.0. Este módulo
 *     sólo declara el TIPO (`ConfidenceOf`) y el default; quien de verdad
 *     produce un `conf < 1` es `detect/grouping.ts#buildConfidenceOf` — Ola 6:
 *     las DOS degradaciones (0.5 grupo degenerado, Contrato 2; 0.7 evidencia
 *     mayoritariamente `inferred`, Contrato 4 §4.4) están cableadas ahí,
 *     combinadas por MÍNIMO (nunca producto — ver el docstring de esa
 *     función para por qué). Lo que SIGUE sin productor es el DATO de
 *     Contrato 4: el único call site (`code-analyzer.ts:1737`) llama
 *     `buildConfidenceOf(buckets)` con un solo argumento, así que hoy en
 *     producción el 0.7 nunca se dispara — el mecanismo está listo y
 *     probado, la señal real todavía no.
 *
 * `severity` NO se toca: sigue viajando intacta en `Finding`/`CodeFinding`.
 * `score` es un campo AGREGADO, nunca un reemplazo.
 */
import { impactOf } from "./impact.js";
import { normalizedRanks } from "./rank.js";
import type { ReachIndex } from "./reach.js";
import type { Finding } from "./types.js";

/**
 * Punto de partida de CONTRATO-F5.md §1.6 — MEDIDO con la cascada completa
 * (impact.ts exhaustivo sobre los 39 `DETECTORS`, `conf` vivo vía
 * `buildConfidenceOf`). Corrida real, `detect/ranking-acceptance.test.ts`
 * sobre los 8 repos del corpus (`CK_CORPUS_DIR`), en este punto (0.40/0.35/0.25),
 * ANTES del reparto por kind de Ola 7 (ver más abajo):
 *
 *   M1 (kinds importantes cubiertos, top-200, exige ≥70% en ≥7/8 repos):
 *     6/8 pasan (fallaba en guava y newtonsoft-json).
 *   M2 (dominio máximo de un detector en el top-200, exige ≤25% en 8/8):
 *     guava 43.5% (argument-mutation), jekyll 35.0% (unused-symbol),
 *     newtonsoft-json 34.0% (duplication), preact 37.0% (unused-symbol) →
 *     **fallaba en 4/8**. (Esta medición ya era POSTERIOR al arreglo del
 *     techo de `MAX_STORED_FINDINGS`/§2.6 y al del árbol espejo de
 *     `duplication` de una ola anterior — el dominante había mutado de
 *     `duplication`/52.5% a `argument-mutation`/43.5% en guava, confirmando
 *     lo que ya estaba diagnosticado: ninguno de los dos arregla M2 por sí
 *     solo, porque **el ranking por sí solo no reparte**.)
 *
 * Antes de tocar los pesos, `ranking-acceptance.test.ts`'s historial confirmó
 * la hipótesis que CONTRATO-F5.md §1.7 exige descartar primero: la rejilla
 * ±0.10 sobre los 3 pesos (27 puntos, M5) no invertía el veredicto de M2 en
 * NINGÚN punto — 0 de 27 pasaban M1 y M2 a la vez. `SCORE_WEIGHTS` no es el
 * problema: subir `impact` o `severity` sólo cambia CUÁL detector domina,
 * nunca SI alguno domina.
 *
 * CONTRATO-F5.md §1.7, última cláusula, aplica literalmente: "si M1 o M2
 * fallan en todos los puntos de la rejilla, la conclusión NO es subir el
 * peso de `impact` hasta que pasen: es que el ranking por sí solo no alcanza
 * y hay que **repartir por kind**". Ola 7 lo implementa del lado del
 * ORDEN, no de los pesos: `detect/grouping.ts#finalizeGroups`/
 * `byGroupRankDescThenId` ahora intercalan por `detectorId` (round-robin
 * sobre el ranking global — ver el docstring de `FindingGroup.detectorRank`
 * para el mecanismo, la alternativa descartada —`selectPageByKindQuota`, acá
 * abajo, que sigue viva y probada pero NUNCA cableada — y el precio
 * explícito de cada una). Con eso, MEDIDO en una corrida real de
 * `ranking-acceptance.test.ts` sobre los 8 repos, DESPUÉS del intercalado:
 *
 *   M1: **8/8 pasan**, los 8 con 100% de kinds importantes cubiertos.
 *   M2: **8/8 pasan** — click 8.0%, cobra 15.8%, guava 4.5%
 *   (`argument-mutation`), jekyll 12.5% (`unused-symbol`), lodash 14.7%,
 *   newtonsoft-json 5.5% (`argument-mutation`), preact 8.5%
 *   (`argument-mutation`), vueuse 6.0% — el peor caso queda a menos de la
 *   mitad del 25% exigido.
 *
 * `SCORE_WEIGHTS`/`DETECTOR_IMPACT` quedan EXACTAMENTE como estaban — moverlos
 * para que el número de arriba cambie habría sido lo que el contrato prohíbe
 * (impact.ts, regla dura: "un tier no se mueve para que un número de §1.7
 * pase"), y como el arreglo real fue del lado del ORDEN (grouping.ts), no de
 * los pesos, la rejilla M5 no aplica de nuevo: no hay pesos nuevos que barrer.
 * Verificado por separado (`census-golden.test.ts`, un repo chico): el censo
 * lee `rankedGroupFindings` vía `onPreCapFindings` ANTES de este reordenamiento
 * importe — `censusOf` suma por clave sobre un `Record`, así que es invariante
 * al ORDEN de los grupos; sólo cambia si cambia la membresía o el score, y
 * ninguno de los dos cambió acá. El censo no se movió.
 */
export const SCORE_WEIGHTS = { severity: 0.4, impact: 0.35, reach: 0.25 } as const;

export interface ScoreBreakdown {
  readonly rSev: number;
  readonly impact: number;
  readonly reach: number;
  readonly conf: number;
}

export interface Scored<F extends Finding = Finding> {
  readonly finding: F;
  readonly score: number;
  readonly breakdown: ScoreBreakdown;
}

/** `f` -> `conf`, acotado en [0.5, 1.0]. Ausente ⇒ 1.0 para todos — el
 *  default de ESTE módulo cuando `scoreFindings` se llama sin un tercer
 *  argumento (p.ej. en tests). En producción, `crossAnalyze` siempre pasa
 *  `detect/grouping.ts#buildConfidenceOf(buckets)`, que sí produce `< 1.0`
 *  para grupos degenerados (Contrato 2, ya cableado) — ver el docstring del
 *  módulo para el estado de la otra mitad (Contrato 4, §4.4). */
export type ConfidenceOf<F extends Finding> = (f: F) => number;

function defaultConfidence(): number {
  return 1.0;
}

/**
 * Puntúa TODOS los `findings` de una corrida. `R_sev` se computa agrupando
 * por `detectorId` sobre el CONJUNTO COMPLETO recibido — el llamador (
 * `crossAnalyze`) debe pasar `perFileFindings` + `interFile.findings` juntos,
 * antes de cualquier corte/paginación: el rango dentro del detector sólo es
 * honesto calculado sobre TODOS los hallazgos de ese detector en la corrida,
 * nunca sobre una página ya recortada.
 */
export function scoreFindings<F extends Finding>(
  findings: readonly F[],
  reach: ReachIndex,
  confidenceOf: ConfidenceOf<F> = defaultConfidence,
): Scored<F>[] {
  const indicesByDetector = new Map<string, number[]>();
  findings.forEach((f, i) => {
    let idxs = indicesByDetector.get(f.detectorId);
    if (!idxs) {
      idxs = [];
      indicesByDetector.set(f.detectorId, idxs);
    }
    idxs.push(i);
  });

  const rSevByIndex = new Array<number>(findings.length);
  for (const idxs of indicesByDetector.values()) {
    const severities = idxs.map((i) => findings[i]!.severity);
    const ranks = normalizedRanks(severities);
    idxs.forEach((i, k) => {
      rSevByIndex[i] = ranks[k]!;
    });
  }

  return findings.map((f, i) => {
    const rSev = rSevByIndex[i]!;
    const impact = impactOf(f.detectorId);
    const reachValue = reach.reachFor(f.locations[0].file);
    const conf = confidenceOf(f);
    const score = (SCORE_WEIGHTS.severity * rSev + SCORE_WEIGHTS.impact * impact + SCORE_WEIGHTS.reach * reachValue) * conf;
    return { finding: f, score, breakdown: { rSev, impact, reach: reachValue, conf } };
  });
}

function byIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Reparto/cupo por `kind` — CONTRATO-F5.md §1.7, última cláusula ("si M1 o M2
 * fallan en todos los puntos de la rejilla… hay que repartir por kind: top-k
 * garantizado por kind con presupuesto proporcional a impact"). Ola 6, F5:
 * ANTES de este archivo no existía ningún mecanismo así — verificado, `grep -rn
 * "cupo\|quota\|reparto" src/server/services/detect/grouping.ts
 * src/server/services/code-analyzer.ts` da cero; `grouping.ts` sólo tiene el
 * cableado de `conf` (`buildConfidenceOf`), nada que toque la SELECCIÓN de la
 * página. Sin esto, un solo `kind` de alto volumen (`duplication` en guava)
 * puede llenar el top-200 por puro score global y dejar afuera `kind`s reales
 * con menos instancias — el mismo síntoma de f4-volumen que motivó Contrato 1,
 * ahora un nivel más arriba (por `kind`, no por `detectorId`/severidad cruda).
 *
 * QUÉ ES: puro, sin I/O ni `RunContext`. Opera sobre la población YA puntuada
 * y YA ordenada de mejor a peor (el llamador la ordena, típicamente con
 * `byScoreDescThenId`) — NUNCA sobre el almacenamiento (`MAX_STORED_FINDINGS`,
 * `code-analyzer.ts`) ni sobre el censo (`totalByKind`/`findingsTotal` se
 * computan sobre `rawFindings`, antes y aparte de esto, en el propio
 * `code-analyzer.ts` — este módulo no los toca ni los ve). Es la función que
 * reemplazaría el corte plano `stored.slice(offset, offset + pageLimit)`.
 *
 * ALGORITMO — dos pasadas sobre `rankedItems`, sin resortear nunca (el orden
 * de salida es SIEMPRE un subconjunto del orden de entrada, filtrado):
 *
 *   1. `kind` "importante" = >= `IMPORTANT_KIND_SHARE` del volumen total de la
 *      corrida — EL MISMO umbral que usa el gate M1 (`ranking-acceptance.test.ts
 *      #m1Coverage`), a propósito: el cupo garantiza presencia exactamente
 *      para los `kind`s que M1 exige que aparezcan, ni más (no cupo para
 *      ruido) ni menos.
 *   2. Cada `kind` importante recibe un presupuesto = `KIND_QUOTA_FLOOR` (hoy
 *      1 — el mínimo que alcanza para que M1 lo cuente como "cubierto") MÁS
 *      una porción proporcional a su `impact` (`detect/impact.ts#impactOf`,
 *      vía `KindQuotaItem.impact`) del remanente `pageSize - importantKinds.length`.
 *      Un `kind` con `impact` 1.0 (`correccion`) se lleva más presupuesto
 *      extra que uno con 0.25 (`higiene`) — el presupuesto discrimina por
 *      cuánto IMPORTA el problema, nunca por cuánto aparece (mismo principio
 *      que `impact.ts` ya declara para `DETECTOR_IMPACT`).
 *   3. Pasada 1: recorriendo `rankedItems` en orden (mejor primero), a cada
 *      `kind` importante se le reservan sus primeros `budget(kind)` miembros
 *      — que son, por construcción (la entrada ya viene ordenada), sus
 *      MEJORES `budget(kind)` miembros. Ningún resorteo ni desempate propio:
 *      el orden de entrada YA resolvió eso.
 *   4. Pasada 2: recorriendo `rankedItems` en orden otra vez, se llena lo que
 *      falta de `pageSize` con lo próximo no reservado todavía, sin importar
 *      el `kind` — así el remanente de cualquier presupuesto no usado (un
 *      `kind` con menos miembros que su cupo) y el sobrante de redondear hacia
 *      abajo el reparto proporcional NUNCA se pierden: los absorbe el mejor
 *      score global disponible, que es exactamente lo que el ranking ya hacía
 *      antes de este mecanismo.
 *
 * RESULTADO: el orden relativo de todo lo seleccionado se preserva (es un
 * filtro sobre `rankedItems`, nunca una re-mezcla), así que la página sigue
 * "mejor primero" incluso con el cupo aplicado.
 *
 * QUÉ NO ARREGLA (coordinación con el paquete ESPEJO-DUPLICACIÓN, M2): este
 * mecanismo gatea PRESENCIA por `kind` (M1), no DOMINANCIA por `detectorId`
 * (M2, `ranking-acceptance.test.ts#m2Dominance`). Si tras aplicar el cupo M2
 * mejora, puede ser: (a) porque el cupo desplaza algunas filas de
 * `duplication` para dar lugar a `kind`s importantes — un efecto lateral real
 * pero incidental — o (b) porque el paquete ESPEJO-DUPLICACIÓN colapsó los
 * duplicados falsos del árbol espejo de guava (Problema 4). Este módulo NO
 * decide cuál de las dos explica una mejora observada — quien mida el efecto
 * conjunto debe separar ambas causas antes de atribuir la mejora de M2 a
 * "el cupo lo arregló".
 *
 * DECISIÓN FINAL (Ola 7): este mecanismo NO se cableó — sigue existiendo,
 * sigue probado (`ranking.test.ts`), pero es la alternativa DESCARTADA. Dos
 * razones, no una:
 *
 *   1. Necesita un call site nuevo en `code-analyzer.ts` (el `stored.slice(
 *      offset, offset + pageLimit)`), y ese archivo está fuera de rango para
 *      esta tarea (regla dura de propiedad de archivos) — no se puede
 *      cablear sin pedirle una línea a otro frente.
 *   2. Aunque estuviera cableado, depende de `pageSize`: dos tamaños de
 *      página pueden seleccionar conjuntos que NO son prefijo uno del otro,
 *      arriesgando la invariante I1 (CONTRATO-F5.md §2.7, "la página es un
 *      prefijo del ranking para TODO k").
 *
 * La alternativa elegida — intercalado por `detectorId` sobre el ranking
 * GLOBAL, en `detect/grouping.ts#finalizeGroups`/`byGroupRankDescThenId` (ver
 * el docstring de `FindingGroup.detectorRank`) — no tiene ninguno de los dos
 * problemas: reordena la población completa UNA vez, antes de que exista
 * noción de página, así que no necesita ningún call site nuevo (`crossAnalyze`
 * ya llama a `byGroupRankDescThenId` sin cambios) y preserva I1 EXACTO para
 * todo k. El precio que paga en cambio — documentado en el docstring de
 * `byGroupRankDescThenId` — es que un grupo de rank PEOR puede preceder a uno
 * MEJOR simplemente por estar en una ronda más temprana de su propio
 * detector; el cupo de acá paga un precio análogo pero por EXCLUSIÓN en vez
 * de por REORDEN ("puede empujar afuera un hallazgo genuinamente peor que
 * uno que entra" — ver más arriba, "QUÉ NO ARREGLA"). MEDIDO, corrida real:
 * con el intercalado cableado y ESTE módulo sin tocar (`selectPageByKindQuota`
 * nunca se invoca), `ranking-acceptance.test.ts` pasa M1 8/8 y M2 8/8 — ver
 * el docstring de más arriba para los números por repo.
 */
export const IMPORTANT_KIND_SHARE = 0.01;

/** Mínimo garantizado por `kind` importante, antes de la porción proporcional a `impact` — ver el docstring de arriba. */
export const KIND_QUOTA_FLOOR = 1;

export interface KindQuotaItem {
  readonly kind: string;
  readonly impact: number;
}

/**
 * `rankedItems` DEBE venir ya ordenado mejor-primero (p.ej. `Scored<F>[]`
 * pasado por `.sort(byScoreDescThenId)`) — esta función nunca reordena, sólo
 * selecciona un subconjunto de tamaño <= `pageSize` preservando ese orden.
 * `pageSize >= rankedItems.length` es un no-op explícito (nada que repartir:
 * todo entra).
 */
export function selectPageByKindQuota<T extends KindQuotaItem>(rankedItems: readonly T[], pageSize: number): T[] {
  if (pageSize <= 0) return [];
  if (rankedItems.length <= pageSize) return [...rankedItems];

  const countByKind = new Map<string, number>();
  for (const item of rankedItems) countByKind.set(item.kind, (countByKind.get(item.kind) ?? 0) + 1);

  const impactByKind = new Map<string, number>();
  for (const item of rankedItems) {
    const current = impactByKind.get(item.kind);
    if (current === undefined || item.impact > current) impactByKind.set(item.kind, item.impact);
  }

  const importantKinds = [...countByKind.entries()]
    .filter(([, count]) => count / rankedItems.length >= IMPORTANT_KIND_SHARE)
    .map(([kind]) => kind);

  // Presupuesto: `KIND_QUOTA_FLOOR` fijo + porción del remanente proporcional
  // a `impact` (§ el docstring de arriba, paso 2). `extraPool` nunca negativo
  // — si hay más kinds importantes que `pageSize` (degenerado), no hay
  // remanente que repartir y cada kind se queda sólo con el piso.
  const extraPool = Math.max(0, pageSize - importantKinds.length * KIND_QUOTA_FLOOR);
  const impactSum = importantKinds.reduce((sum, kind) => sum + (impactByKind.get(kind) ?? 0), 0);
  const budgetByKind = new Map<string, number>();
  for (const kind of importantKinds) {
    const share = impactSum > 0 ? ((impactByKind.get(kind) ?? 0) / impactSum) * extraPool : 0;
    budgetByKind.set(kind, KIND_QUOTA_FLOOR + Math.floor(share));
  }

  const selected = new Set<number>();
  const takenByKind = new Map<string, number>();
  // Pasada 1: reserva, por kind importante, sus primeros (=mejores, porque la
  // entrada ya viene ordenada) `budget(kind)` miembros. `selected.size <
  // pageSize` es una guarda de desborde para el caso degenerado
  // `importantKinds.length * KIND_QUOTA_FLOOR > pageSize` (más kinds
  // importantes que lugares en la página): sin ella, la suma de los pisos por
  // sí sola podría superar `pageSize` y la función devolvería MÁS filas de
  // las pedidas — un contrato roto ("subconjunto de tamaño <= pageSize") que
  // no depende de que el resto del pipeline pase siempre `pageSize` grande;
  // en ese caso, los primeros kinds importantes en el orden de `rankedItems`
  // ganan la reserva y el resto queda para la Pasada 2 en pie de igualdad.
  rankedItems.forEach((item, i) => {
    if (selected.size >= pageSize) return;
    const budget = budgetByKind.get(item.kind);
    if (budget === undefined) return;
    const taken = takenByKind.get(item.kind) ?? 0;
    if (taken >= budget) return;
    selected.add(i);
    takenByKind.set(item.kind, taken + 1);
  });
  // Pasada 2: llena lo que falte de `pageSize` con el mejor score global no
  // reservado todavía, sin importar el kind — absorbe tanto el remanente de
  // cupos no usados como el sobrante de redondear el reparto hacia abajo.
  for (let i = 0; i < rankedItems.length && selected.size < pageSize; i++) {
    if (!selected.has(i)) selected.add(i);
  }

  return rankedItems.filter((_, i) => selected.has(i));
}

/**
 * Reemplaza a `bySeverityDescThenId` (`detect/run.ts`) como criterio de
 * orden FINAL de un análisis — mismo desempate (`Finding.id` ascendente),
 * CONTRATO-F5.md §1.6. `bySeverityDescThenId` sigue existiendo y en uso
 * DENTRO de cada detector (`capDetectorFindings`, el propio presupuesto de
 * un detector) — ese uso es intencionalmente por severidad cruda: ahí SÍ se
 * compara dentro del MISMO detector, que es exactamente el caso en que la
 * severidad cruda es comparable (§1.3).
 */
export function byScoreDescThenId<F extends Finding>(a: Scored<F>, b: Scored<F>): number {
  return b.score - a.score || byIdAsc(a.finding.id, b.finding.id);
}
