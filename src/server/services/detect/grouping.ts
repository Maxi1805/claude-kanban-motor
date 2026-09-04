/**
 * Agrupación por causa raíz — CONTRATO-F5.md Contrato 2 §2.2-§2.4.
 *
 * `crossAnalyze` (`code-analyzer.ts`) reunía `perFileFindings`/`interFile.findings`,
 * los ordenaba y cortaba en `DEFAULT_ANALYZE_LIMITS.maxFindings` (200): un
 * archivo con 261 o 416 hallazgos era ilegible de a uno, y subir el cap sólo
 * agrandaba una muestra ya sesgada (f4-volumen). Este módulo agrupa ANTES de
 * cortar, así que lo que se pagina son problemas, no instancias.
 *
 * DOS FASES, porque el Contrato 1 (`detect/ranking.ts#scoreFindings`) necesita
 * saber, ANTES de puntuar, qué hallazgos viven en un grupo degenerado (para
 * bajarles `conf` a 0.5) - y un grupo degenerado se decide por volumen y por
 * una señal de confianza que NO es el `score` (sería circular: el score
 * depende de `conf`, `conf` no puede depender del score):
 *
 *   Fase 1 - `bucketFindings`: arma los grupos SOLO por pertenencia (Nivel 1
 *   declarado por el detector, Nivel 2 = archivo+kind) y decide qué grupos
 *   son degenerados (2.4) con una señal de confianza previa al ranking
 *   (`defaultEvidenceQuality`, ver su docstring). `buildConfidenceOf` deriva
 *   de eso el `confidenceOf` que `crossAnalyze` le pasa a `scoreFindings`.
 *
 *   Fase 2 - `finalizeGroups`: una vez que `scoreFindings` ya calculó
 *   `score` para todos, ordena a cada grupo por `score` y decide el
 *   representante (mejor score) y el `rank` del grupo (2.3: máximo, o
 *   mediana si es degenerado).
 *
 * DOS NIVELES DE PERTENENCIA, en este orden de precedencia:
 *
 *   Nivel 1 - causa raíz semántica, la declara el detector vía
 *   `DetectorBase.groupKey` (`types.ts`). Dos hallazgos del MISMO detector
 *   con la misma clave son el MISMO problema.
 *
 *   OLA P, FRENTE P10 — EL NIVEL 1 DEJÓ DE SER TEÓRICO. Durante cinco olas
 *   ningún detector lo implementó y este docstring decía "en producción, hoy,
 *   sólo el Nivel 2 agrupa algo". Ya no: `duplication`
 *   (`inter-file/duplication.ts#duplicationGroupKey`) declara como causa raíz
 *   el CONJUNTO DE ARCHIVOS que toca la clase de clon. Lo que eso arregla, y
 *   por qué importa para todo el que venga después a declarar el suyo:
 *
 *     · El Nivel 2 agrupa por `(locations[0].file, kind)`, o sea por dónde
 *       cae la PRIMERA ubicación. Para un detector cuyos hallazgos cruzan
 *       archivos, eso junta en una tarjeta cosas sin relación entre sí, y la
 *       tarjeta hereda como `locations` la UNIÓN de todos sus miembros.
 *     · `census.ts#censusOf` cobra `memberCount` una vez por archivo distinto
 *       de esa unión. Con Nivel 2 la unión es más grande que lo que toca
 *       cualquier miembro, así que el volumen se infla sin que exista un solo
 *       hallazgo de más — el propio `census.ts` lo declara como cota superior.
 *       Con un Nivel 1 cuya clave ES el conjunto de archivos, todos los
 *       miembros tocan exactamente los mismos, la unión es ese conjunto, y la
 *       cota superior se vuelve cuenta exacta.
 *
 *   LA LECCIÓN TRANSFERIBLE, para el próximo detector que declare `groupKey`:
 *   una clave de Nivel 1 que no determine el conjunto de archivos del grupo
 *   deja abierto el mismo sobre-conteo.
 *
 *   Nivel 2 - localidad genérica (archivo, kind), sin cooperación del
 *   detector, aplicada SÓLO cuando la cuenta llega a `GROUP_MIN`. Por debajo
 *   del piso, cada hallazgo queda como su propio grupo de tamaño 1 - agrupar
 *   2-4 hallazgos relacionados no reduce ruido y sí puede esconder
 *   distinciones reales; el problema medido (52 archivos de guava con >= 40
 *   hallazgos, 156 con >= 20) es de CONCENTRACIÓN, no de a pares.
 *
 * El archivo de un hallazgo es SIEMPRE `locations[0].file` - el archivo
 * primario, mismo criterio que Contrato 1 usa para `reach`.
 *
 * CON QUÉ SE CONFUNDE: esto NO es lo mismo que la deduplicación interna de
 * `duplication` (un fingerprint que aparece en dos archivos distintos sigue
 * siendo UN hallazgo con locations en ambos - eso ya lo resuelve el propio
 * detector, puertas adentro, antes de llegar acá). Lo que este módulo agrupa
 * son hallazgos que HOY llegan como filas separadas del registro.
 *
 * LOCATIONS DEL GRUPO (decisión de `code-analyzer.ts`, no de este módulo):
 * se lleva la unión de las locations de TODOS los miembros, no sólo "los 3
 * mejores" que sugiere la prosa del contrato - precisamente porque
 * `census.ts#censusOf` cuenta un hallazgo "una vez por archivo distinto
 * entre sus locations", y recortar a 3 miembros arbitrarios podría hacer
 * desaparecer del censo un archivo que sólo tocaba un miembro no-exemplar:
 * un delta NEGATIVO silencioso (regla dura: rompe sin waiver). Llevar la
 * unión completa es estructuralmente imposible de sub-contar, y es el MISMO
 * patrón que `CodeFinding.locations` ya documenta para `duplication`
 * ("lists all its copies") - desviación reportada, no un vacío.
 *
 * OLA 7 — CONTRATO-F5.md §1.7, última cláusula (M2, dominio máximo por
 * detector en el top-200): agrupar por (archivo,kind) ya ayuda, pero medido
 * contra el corpus no alcanzaba - el ranking puro por `score` seguía dejando
 * que un detector muy prolífico (`argument-mutation` en guava,
 * `unused-symbol` en jekyll/preact, `duplication` en newtonsoft-json) llenara
 * la página. `finalizeGroups`/`byGroupRankDescThenId`, más abajo, ahora
 * intercalan por `detectorId` (ver el docstring de `FindingGroup.detectorRank`
 * y de `byGroupRankDescThenId` para el mecanismo, la alternativa descartada
 * y el precio explícito). El agrupamiento en sí, arriba, no cambia.
 */
import type { Finding } from "./types.js";
import { DETECTORS } from "./registry.js";

/** Nivel 2 no colapsa nada por debajo de esto - ver el docstring del módulo. */
export const GROUP_MIN = 5;

/**
 * Guardia de grupo degenerado (2.4): un grupo con al menos esta cantidad de
 * miembros Y confianza mediana por debajo de `DEGENERATE_CONFIDENCE_FLOOR`
 * se emite como UN hallazgo, con el rango (`score(grupo)`) de la MEDIANA -
 * no el máximo - de sus miembros. 20, no 5: el piso de Nivel 2 sólo decide
 * cuándo colapsar la tarjeta; éste decide cuándo, además, el volumen es tan
 * alto y tan parejo que ya no vale la pena distinguir "el peor miembro" -
 * son los extremos medidos en f4-volumen (archivos con 40, 261 y 416
 * hallazgos).
 */
export const DEGENERATE_MIN = 20;

/** Ver `defaultEvidenceQuality` para por qué 0.7 hoy sólo depende del volumen. */
export const DEGENERATE_CONFIDENCE_FLOOR = 0.7;

/**
 * SIMPLIFICACIÓN DECLARADA: hoy ningún `Finding` lleva una señal de
 * confianza propia - Contrato 4 (`provenanceMix`, aristas `inferred`)
 * todavía no aterrizó (verificado: `grep` de "provenanceMix"/"trustedEdge"
 * en `detect/types.ts` no encuentra nada). Se usa la misma lectura neutra
 * que Contrato 1 ya fija para `reach` ausente (`detect/reach.ts`): 0.5 para
 * todo hallazgo, ninguno afirma alta confianza y ninguno afirma cero. Como
 * `DEGENERATE_CONFIDENCE_FLOOR` es 0.7, esto hace que la guardia degenerada
 * dependa HOY sólo del volumen (`memberCount >= DEGENERATE_MIN`) - que es
 * exactamente el caso medido (261 y 416 hallazgos por archivo) y lo que la
 * guardia existe para atrapar. El día que Contrato 4 publique
 * `provenanceMix` por hallazgo, el call site (`code-analyzer.ts#crossAnalyze`)
 * pasa su propia `evidenceQualityOf` a `bucketFindings` - queda como
 * parámetro explícito, nunca hardcodeado adentro, así que ese cambio es de
 * una sola línea.
 *
 * NO confundir con `conf` de `detect/ranking.ts`: éste es el insumo que
 * decide si un GRUPO es degenerado (fase 1, antes de que el score exista);
 * `conf` es la salida que ese veredicto produce (0.5 para los miembros de un
 * grupo degenerado, ver `buildConfidenceOf`) - son dos números distintos a
 * propósito, para no volver circular la definición.
 *
 * F5 — Ola 6: el otro medio de Contrato 4 (§4.4, el 0.7 por evidencia
 * mayoritariamente `inferred`) SÍ está cableado ahora, en `buildConfidenceOf`
 * más abajo, con el mismo patrón que este módulo ya usaba para el 0.5: un
 * parámetro explícito (`inferredShareOf`), nunca hardcodeado, que hoy nadie
 * llama con una señal real porque el ÚNICO call site en producción
 * (`code-analyzer.ts:1737`, `buildConfidenceOf(buckets)`) sigue pasando un
 * solo argumento — ese archivo es compartido y grande, y no es de este
 * paquete (reportado, no tocado). Verificado: ese default ausente hace que
 * `conf` siga siendo exactamente 1.0/0.5 como antes para toda corrida real
 * de hoy; el mecanismo está listo, probado y documentado para el día que
 * `crossAnalyze` (o un detector) le pase la mezcla real de provenance.
 */
export function defaultEvidenceQuality(_f: Finding): number {
  return 0.5;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function byIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Resolutor de Nivel 1 por defecto: consulta el `groupKey` que el propio
 * detector (`DETECTORS`, `registry.ts`) declaró para este hallazgo,
 * namespaced por `detectorId` para que dos detectores nunca puedan
 * colisionar aunque devuelvan la misma cadena cruda. Devuelve `undefined`
 * cuando el detector no declara `groupKey`, o cuando `groupKey(f)` mismo
 * devuelve `undefined` para ESTE hallazgo puntual (un detector puede agrupar
 * unos casos y no otros).
 */
const DETECTOR_BY_ID = new Map(DETECTORS.map((d) => [d.id, d] as const));

export function declaredGroupKey(f: Finding): string | undefined {
  const detector = DETECTOR_BY_ID.get(f.detectorId);
  const raw = detector?.groupKey?.(f);
  if (raw === undefined) return undefined;
  return JSON.stringify(["L1", f.detectorId, raw]);
}

function level2KeyOf(file: string, kind: string): string {
  return JSON.stringify(["L2", file, kind]);
}

function singletonKeyOf(id: string): string {
  return JSON.stringify(["S", id]);
}

/** Fase 1 - pertenencia y degeneración, SIN `score` (ver el docstring del módulo). */
export interface FindingBucket {
  /** Clave interna, sólo para depurar - nunca viaja al panel. */
  readonly key: string;
  /** Todos los miembros del grupo, en el orden en que llegaron (sin ordenar todavía por score). */
  readonly members: readonly Finding[];
  /** `members.length >= DEGENERATE_MIN` y confianza mediana < `DEGENERATE_CONFIDENCE_FLOOR`. */
  readonly degenerate: boolean;
}

export interface BucketFindingsOptions {
  /** Confianza de evidencia de UN miembro, 0-1. Default: `defaultEvidenceQuality`. */
  evidenceQualityOf?: (f: Finding) => number;
  /** Clave de Nivel 1. Default: `declaredGroupKey` (consulta el registro real). */
  groupKeyOf?: (f: Finding) => string | undefined;
}

/**
 * OLA P, FRENTE P10 — LA GUARDIA DEGENERADA ES DE NIVEL 2, NO DE NIVEL 1.
 *
 * `declared` = el grupo lo formó una clave de causa raíz que el DETECTOR
 * declaró (Nivel 1), no la co-localización genérica `(archivo, kind)`.
 *
 * La guardia (2.4) dice, con el texto que el contrato exige literalmente:
 * *"N instancias con evidencia débil: es más probable que sea un idioma de
 * este archivo que N problemas distintos"*. Ésa es una hipótesis sobre un
 * grupo formado por MERA VECINDAD — que es exactamente lo que el Nivel 2
 * forma, y el caso que la guardia se midió para atrapar (archivos de guava
 * con 40, 261 y 416 hallazgos del mismo kind, f4-volumen). Cuando el detector
 * declara que esos N hallazgos son EL MISMO problema, "N problemas distintos"
 * ya no es la hipótesis alternativa: no hay N problemas, hay uno con N
 * instancias, y contarlo como evidencia débil contradice la declaración.
 *
 * Y hay un costo medido, no sólo semántico: `code-analyzer.ts
 * #toGroupedCodeFinding` REEMPLAZA el `detail` del representante por ese
 * texto cuando el grupo es degenerado. Para `duplication` —el primer detector
 * con Nivel 1, Ola P— el `detail` es donde vive la lista de copias con su
 * archivo, su rango y el símbolo que las contiene, que es justo la evidencia
 * que faltaba para poder juzgar el hallazgo. Un grupo de >= 20 miembros
 * perdería esa lista entera y quedaría con menos evidencia que antes del
 * cambio. La guardia es correcta para lo que fue medida y sólo para eso.
 *
 * LO QUE ESTO NO DICE, para no venderlo de más: no dice que un grupo de Nivel
 * 1 sea incuestionable. Dice que el ÚNICO criterio que la guardia sabe aplicar
 * HOY es el volumen —`defaultEvidenceQuality` devuelve 0.5 fijo para todo
 * hallazgo, por debajo del piso 0.7, así que `degenerate` es literalmente
 * `members.length >= DEGENERATE_MIN`— y que ese criterio no es válido sobre un
 * grupo cuya causa raíz declaró el detector. El día que un llamador pase una
 * `evidenceQualityOf` real por hallazgo, **este `!declared` es la línea a
 * revisar**: ahí sí habría una señal propia del hallazgo, y no un proxy de
 * volumen, con la que degradar también un grupo declarado.
 */
function makeBucket(
  key: string,
  members: readonly Finding[],
  evidenceQualityOf: (f: Finding) => number,
  declared: boolean,
): FindingBucket {
  const degenerate =
    !declared &&
    members.length >= DEGENERATE_MIN &&
    median(members.map(evidenceQualityOf)) < DEGENERATE_CONFIDENCE_FLOOR;
  return { key, members, degenerate };
}

/**
 * Agrupa `findings` por causa raíz (Nivel 1) y, para el resto, por localidad
 * de archivo y kind (Nivel 2, gateada por `GROUP_MIN`) - ver el docstring
 * del módulo. Puro: no toca `RunContext`, ni el grafo, ni disco, ni `score`
 * (todavía no existe en esta fase) - sólo la forma de `Finding[]` que
 * `crossAnalyze` ya tiene en memoria, lo que la hace testeable sin montar un
 * repo.
 */
export function bucketFindings(findings: readonly Finding[], opts: BucketFindingsOptions = {}): FindingBucket[] {
  const evidenceQualityOf = opts.evidenceQualityOf ?? defaultEvidenceQuality;
  const groupKeyOf = opts.groupKeyOf ?? declaredGroupKey;

  const level1 = new Map<string, Finding[]>();
  const remaining: Finding[] = [];
  for (const f of findings) {
    const declared = groupKeyOf(f);
    if (declared === undefined) {
      remaining.push(f);
      continue;
    }
    const bucket = level1.get(declared);
    if (bucket) bucket.push(f);
    else level1.set(declared, [f]);
  }

  const level2Candidates = new Map<string, Finding[]>();
  for (const f of remaining) {
    const key = level2KeyOf(f.locations[0].file, f.kind);
    const bucket = level2Candidates.get(key);
    if (bucket) bucket.push(f);
    else level2Candidates.set(key, [f]);
  }

  const buckets: FindingBucket[] = [];
  for (const [key, members] of level1) buckets.push(makeBucket(key, members, evidenceQualityOf, true));
  for (const [key, members] of level2Candidates) {
    if (members.length >= GROUP_MIN) {
      buckets.push(makeBucket(key, members, evidenceQualityOf, false));
    } else {
      for (const m of members) buckets.push(makeBucket(singletonKeyOf(m.id), [m], evidenceQualityOf, false));
    }
  }
  return buckets;
}

/**
 * CONTRATO-F5.md §4.4: `conf = 0.70` para "el hallazgo depende de aristas
 * `inferred`", disparado cuando la fracción de evidencia con esa provenance
 * supera la mitad (§4.4: "si `provenanceMix(lang).inferred / total > 0.5`").
 * `PROVENANCE_MAJORITY_THRESHOLD` es ese piso; `> `, no `>=`, así que exactamente
 * la mitad-mitad todavía no degrada (mismo criterio de desempate estricto que
 * ya usa el resto del módulo, p.ej. `GROUP_MIN`).
 */
export const PROVENANCE_MAJORITY_THRESHOLD = 0.5;

/** §1.6/§4.4: el valor de `conf` cuando la mayoría de la evidencia es `inferred`. */
export const PROVENANCE_INFERRED_CONFIDENCE = 0.7;

/**
 * `f` -> fracción de evidencia (`inferred` / total) que sostiene ESTE
 * hallazgo, `0..1`, o `undefined` cuando no hay señal (hoy: siempre, ver el
 * docstring del módulo — Contrato 4 no tiene productor todavía). `undefined`
 * es DISTINTO de `0`: `0` afirmaría "toda la evidencia es confiable", algo
 * que nadie mide todavía; `undefined` es la lectura honesta de "no sé", y
 * `buildConfidenceOf` la trata como "no degradar" (`conf = 1.0`), nunca como
 * "degradar por las dudas" — mismo principio que `reach.ts` ya aplica para
 * "sin grafo" (ahí el neutro es 0.5 porque `reach` es un FACTOR de la suma;
 * acá el neutro es 1.0 porque así lo fija la propia fórmula: "evidencia
 * declared/resolved" es el caso por default, §1.6).
 */
export type InferredShareOf = (f: Finding) => number | undefined;

function defaultInferredShare(): number | undefined {
  return undefined;
}

/**
 * El punto de enganche que `detect/ranking.ts#scoreFindings` documenta en su
 * propio módulo ("este módulo sólo declara el punto de enganche
 * (`confidenceOf`) para que ninguno de los dos [Contrato 2 y 4] tenga que
 * tocar la fórmula el día que aterricen"). Combina las DOS degradaciones que
 * `conf` declara en CONTRATO-F5.md §1.6:
 *
 *   - `0.5` — el hallazgo es miembro de un grupo degenerado (§2.4, `buckets`).
 *   - `0.7` — la evidencia del hallazgo depende MAYORITARIAMENTE de aristas
 *     `provenance: "inferred"` (§4.4, `inferredShareOf`).
 *
 * CÓMO SE COMBINAN CUANDO APLICAN LAS DOS — decisión de esta ola,
 * documentada acá porque CONTRATO-F5.md no la resuelve por escrito: **MÍNIMO,
 * nunca producto**. Multiplicar (`0.7 * 0.5 = 0.35`) violaría el rango
 * [0.5, 1.0] que la fórmula declara para `conf` ("una degradación, nunca
 * puede dominar ni anular" — `ranking.ts`); el mínimo respeta ese piso por
 * construcción (el menor de dos números en [0.5, 1.0] sigue en [0.5, 1.0]) y
 * además coincide EXACTAMENTE con la lectura en niveles que la propia
 * fórmula enuncia ("0.50 … 0.70 … 1.00", como si cada regla que aplica
 * "ganara" sobre la siguiente): tomar el mínimo de `{1.0, 0.7, 0.5}` con
 * cualquier subconjunto de las dos degradaciones activas da siempre el
 * mismo resultado que leer la fórmula de arriba hacia abajo y quedarse con
 * la primera fila que aplica.
 *
 * `inferredShareOf` es OPCIONAL y por default no aporta señal
 * (`defaultInferredShare`, siempre `undefined`) — hoy nadie en producción
 * llama a esto con un segundo argumento real (ver el docstring del módulo:
 * el único call site, `code-analyzer.ts:1737`, pasa un solo argumento), así
 * que el comportamiento de HOY es idéntico al de antes de esta ola: `0.5`
 * para grupo degenerado, `1.0` para todo lo demás. El día que un llamador
 * pase una función real, el 0.7 empieza a aplicar sin tocar ni la fórmula
 * (`ranking.ts#scoreFindings`) ni este mismo `return`.
 */
export function buildConfidenceOf(
  buckets: readonly FindingBucket[],
  inferredShareOf: InferredShareOf = defaultInferredShare,
): (f: Finding) => number {
  const degenerateIds = new Set<string>();
  for (const bucket of buckets) {
    if (!bucket.degenerate) continue;
    for (const m of bucket.members) degenerateIds.add(m.id);
  }
  return (f: Finding) => {
    const degenerateConf = degenerateIds.has(f.id) ? 0.5 : 1.0;
    const share = inferredShareOf(f);
    const provenanceConf = share !== undefined && share > PROVENANCE_MAJORITY_THRESHOLD ? PROVENANCE_INFERRED_CONFIDENCE : 1.0;
    return Math.min(degenerateConf, provenanceConf);
  };
}

/** Fase 2 - un problema, visto desde 1-a-N hallazgos crudos, YA puntuado. */
export interface FindingGroup {
  /** Clave interna, sólo para depurar - nunca viaja al panel. */
  readonly key: string;
  /** Todos los miembros, ordenados score desc luego id asc. */
  readonly members: readonly Finding[];
  /** El de mejor score - de acá salen `title`/`detail`/`metric`/`severity`/`advice` en la salida pública. */
  readonly representative: Finding;
  readonly degenerate: boolean;
  /**
   * Con qué se ordenan los grupos entre sí (2.3): `max(score)` normalmente
   * (por construcción, `scoreOf(representative)`, ya que `members[0]` es el
   * de mayor score tras el ordenamiento), `median(score)` si `degenerate`
   * (2.4: la guardia degenerada usa la mediana, no el máximo, a propósito -
   * un solo miembro extremo no debe poder comprar el rango del grupo
   * entero).
   */
  readonly rank: number;
  /**
   * REPARTO POR KIND (Ola 7, CONTRATO-F5.md §1.7 última cláusula) — posición
   * de ESTE grupo dentro de la cola de SU PROPIO `representative.detectorId`,
   * una vez esa cola ordenada por `rank` desc (0 = el mejor grupo de ese
   * detector, 1 = el segundo mejor, …). `undefined` sólo para un `FindingGroup`
   * armado a mano fuera de `finalizeGroups` (p.ej. un test viejo) — ver
   * `byGroupRankDescThenId`, que lo trata como 0 en ese caso, así que el
   * comportamiento pre-Ola-7 no cambia para quien no pase por acá.
   *
   * MEDIDO (ver DIAGNOSTICO-5B.md, tarea de esta ola): el intento previo de
   * cerrar M2 era un CUPO por página (`ranking.ts#selectPageByKindQuota`,
   * sigue existiendo, sigue probado, NUNCA cableado en producción) - depende
   * de `pageSize`, así que dos páginas de tamaño distinto pueden seleccionar
   * conjuntos que no son prefijo una de la otra (rompe I1), y su único call
   * site real está en `code-analyzer.ts#crossAnalyze`, fuera de rango para
   * esta tarea (regla dura de propiedad de archivos). El intercalado de acá
   * es la alternativa que el propio contrato exige evaluar: en vez de
   * seleccionar una página, redefine EL ORDEN GLOBAL una sola vez (acá, con
   * el conjunto COMPLETO de grupos, nunca con `pageSize`), así que I1 se
   * cumple EXACTO para todo `k` sin necesitar reemplazo: cualquier prefijo
   * de `rank(todo)` sigue siendo, por construcción, el resultado de tomar
   * los primeros `k` elementos de UN solo orden fijo.
   */
  readonly detectorRank?: number;
}

/**
 * Convierte cada `FindingBucket` (fase 1) en un `FindingGroup` (fase 2) una
 * vez que `score` ya existe para todos los hallazgos - `scoreOf` es
 * cualquier lectura de ese `score` por `Finding.id` (`crossAnalyze` la arma
 * desde el resultado de `scoreFindings`).
 *
 * Ola 7 — además calcula `detectorRank` (ver su docstring en `FindingGroup`):
 * bucketea los grupos YA armados por `representative.detectorId`, ordena
 * cada cola por `rank` desc (mismo criterio de desempate que
 * `byGroupRankDescThenId`) y numera la posición 0-based dentro de su propia
 * cola. Es la única función con visión del conjunto COMPLETO de grupos de la
 * corrida (`buckets` los trae a todos), así que es el único lugar honesto
 * para calcularlo — `byGroupRankDescThenId`, que sólo ve pares, no podría.
 */
export function finalizeGroups(buckets: readonly FindingBucket[], scoreOf: (f: Finding) => number): FindingGroup[] {
  const groups = buckets.map((bucket) => {
    const members = [...bucket.members].sort((a, b) => scoreOf(b) - scoreOf(a) || byIdAsc(a.id, b.id));
    const representative = members[0]!;
    const rank = bucket.degenerate ? median(members.map(scoreOf)) : scoreOf(representative);
    return { key: bucket.key, members, representative, degenerate: bucket.degenerate, rank };
  });

  const indicesByDetector = new Map<string, number[]>();
  groups.forEach((g, i) => {
    const detectorId = g.representative.detectorId;
    const idxs = indicesByDetector.get(detectorId);
    if (idxs) idxs.push(i);
    else indicesByDetector.set(detectorId, [i]);
  });

  const detectorRankByIndex = new Array<number>(groups.length);
  for (const idxs of indicesByDetector.values()) {
    const sorted = [...idxs].sort(
      (i, j) => groups[j]!.rank - groups[i]!.rank || byIdAsc(groups[i]!.representative.id, groups[j]!.representative.id),
    );
    sorted.forEach((idx, position) => {
      detectorRankByIndex[idx] = position;
    });
  }

  return groups.map((g, i) => ({ ...g, detectorRank: detectorRankByIndex[i] }));
}

/**
 * Orden final entre grupos — Ola 7, CONTRATO-F5.md §1.7 última cláusula
 * ("repartir por kind: … o intercalado por kind sobre el ranking global").
 *
 * MECANISMO ELEGIDO: intercalado (round-robin) por `detectorId`, NO cupo por
 * página. Primero `detectorRank` asc (la "ronda": todos los grupos en ronda 0
 * - el mejor de cada detector - preceden a TODOS los de ronda 1, sin
 * excepción), y sólo DENTRO de la misma ronda se desempata por `rank` desc y
 * después por el id del representante. Por qué éste y no el cupo:
 *
 *   - El cupo (`ranking.ts#selectPageByKindQuota`) recibe `pageSize` y decide
 *     un SUBCONJUNTO en función de ese número - dos tamaños de página pueden
 *     no ser prefijo uno del otro, así que I1 ("la página es un prefijo del
 *     ranking para TODO k") queda en riesgo de romperse según cómo se llame.
 *     El intercalado de acá no recibe ningún tamaño: reordena la población
 *     COMPLETA una sola vez (en `finalizeGroups`, antes de que exista
 *     ninguna noción de página), así que I1 se preserva EXACTO — cualquier
 *     `rankedGroupFindings.slice(0, k)`, para cualquier `k`, sigue siendo la
 *     definición de "los primeros k de UN orden fijo". No hace falta
 *     reemplazar I1 por otra invariante.
 *   - Consecuencia práctica de la propiedad de archivos de esta ola: el cupo
 *     necesita un call site nuevo en `code-analyzer.ts` (dueño: otro frente),
 *     el intercalado no - `byGroupRankDescThenId` YA es el comparador que
 *     `crossAnalyze` usa (`.sort(byGroupRankDescThenId)`, sin cambios en ese
 *     archivo). Es la única de las dos formas que cierra M2 sin pedirle una
 *     línea a nadie más.
 *
 * EL PRECIO, dicho explícito y no escondido: un grupo de rank genuinamente
 * PEOR, pero en una ronda más temprana (su detector tiene menos grupos
 * totales, o es su primer/segundo mejor caso), entra ANTES que un grupo de
 * rank genuinamente MEJOR de un detector muy prolífico cuya ronda todavía no
 * llegó. Es EXACTAMENTE el mismo precio que el cupo declara para sí mismo
 * ("puede empujar afuera un hallazgo genuinamente peor que uno que entra") -
 * acá el costo es un REORDENAMIENTO en vez de una EXCLUSIÓN, pero la
 * dirección del sacrificio es la misma: presencia repartida por sobre
 * ranking puro por score. Sin este mecanismo (`detectorRank` ausente,
 * tratado como `0` para todos) el orden es IDÉNTICO al de antes de esta ola
 * - `rank` desc, id asc - así que ningún test viejo que arme un `FindingGroup`
 * a mano (sin pasar por `finalizeGroups`) cambia de resultado.
 */
export function byGroupRankDescThenId(a: FindingGroup, b: FindingGroup): number {
  const roundA = a.detectorRank ?? 0;
  const roundB = b.detectorRank ?? 0;
  return roundA - roundB || b.rank - a.rank || byIdAsc(a.representative.id, b.representative.id);
}
