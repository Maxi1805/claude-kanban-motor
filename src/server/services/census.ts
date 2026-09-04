/**
 * El censo golden — CONTRATOS.md §3.
 *
 * Convierte un `CodeAnalysis` en un mapa `clave -> conteo` que sobrevive a un
 * reformateo (no guarda números de línea) y a una mejora de redacción (no
 * guarda severidad, título ni texto de consejo): es una red de seguridad de
 * *recall*, no un snapshot de salida. `scripts/census.mts` es el CLI que usa
 * esto "un proceso por repo" para congelar o refrescar una línea base;
 * `census-golden.test.ts` es el gate que compara contra lo congelado en
 * `tests/golden/`.
 */
import { analyzeRepoCached } from "./analyze-cache.js";
import type { CodeAnalysis } from "../../shared/types.js";

/**
 * Estampado en cada censo. Un humano lo sube a mano SÓLO cuando cambian las
 * REGLAS DE CONTEO de este archivo (una familia `tipo:` nueva o retirada, qué
 * cuenta como "mismo archivo", …) — nunca automáticamente, y deliberadamente
 * NO atado a la versión de `package.json`: esa cambia por razones que no
 * tienen nada que ver con el censo (release del producto), y acoplarlas
 * produciría mismatches falsos. Un mismatch acá ⇒ "golden de otra versión":
 * el diff se rehúsa en vez de intentarse (§3.4).
 *
 * F-RETIRO-VÍA-VIEJA: 1 → 2. Se retira ENTERA la familia `patron:` (contaba
 * `analysis.opportunities`, que `analyzeRepo` ya no produce — la vía vieja de
 * detección por vocabulario/forma se retiró completa, decisión del usuario).
 * Mismo motivo que justifica el bump de `FACTS_SCHEMA_VERSION` en
 * `code-analyzer.ts`: este número es TAMBIÉN la clave de invalidación del
 * caché sqlite (`code-inspector.ts` construye `CodeFactsRepository`/
 * `CodeGraphRepository`/`CodeDecisionsRepository` con este mismo valor), así
 * que subirlo fuerza a que un snapshot cacheado de antes de este retiro (que
 * todavía traería `opportunities` pobladas) se trate como miss, nunca como un
 * hit servido con datos de una vía que ya no corre. Efecto sobre el censo:
 * las 8 líneas base de corpus (`tests/golden/{click,cobra,guava,jekyll,
 * lodash,newtonsoft-json,preact,vueuse}.census.json`) quedan con un
 * `analyzerVersion` desincronizado — `diffCensus` lo señala como
 * `metaMismatch`, nunca como regresión silenciosa — y van a necesitar
 * re-congelarse contra el corpus real (fuera del alcance de esta tarea: el
 * corpus no está en disco acá). `fixtures-multi.census.json` SÍ se
 * re-congeló en esta misma tarea.
 */
export const ANALYZER_VERSION = "2";

/** `"${file}|${tipo}" -> conteo`. Ver §3.2 — dos familias de `tipo` desde F-RETIRO-VÍA-VIEJA (`hallazgo:`/`archivo:`; `patron:` se retiró entera con `analysis.opportunities`). */
export type CensusKeys = Record<string, number>;

export interface CensusMeta {
  slug: string;
  analyzerVersion: string;
  scannedFiles: number;
  analysedFiles: number;
  totalLines: number;
  languages: readonly string[];
  /** Informativo: el comparador NUNCA lo compara (§3.3). */
  elapsedMs: number;
}

export interface Census {
  meta: CensusMeta;
  keys: CensusKeys;
}

function bump(keys: CensusKeys, key: string, times = 1): void {
  keys[key] = (keys[key] ?? 0) + times;
}

/**
 * Puro: del resultado del analizador al censo. No toca disco — es lo que
 * hace que el censo funcione HOY, contra el `analyzeRepo` actual, antes de
 * que exista el registro de detectores (§3.1).
 */
export function censusOf(analysis: CodeAnalysis, slug: string, elapsedMs: number): Census {
  const keys: CensusKeys = {};

  // Un hallazgo cuenta UNA VEZ POR ARCHIVO distinto entre sus locations, no
  // una vez por ubicación — un grupo de duplicación con 4 copias en 2
  // archivos suma 1 en cada uno de los 2 (§3.2).
  //
  // F5 — CONTRATO-F5.md Contrato 2: `finding.memberCount` (ausente/`1` para
  // un hallazgo sin agrupar — comportamiento IDÉNTICO a antes de esta ola)
  // reemplaza el `1` fijo. Sin esto, agrupar 9 causas raíz del mismo (archivo,
  // kind) en UNA tarjeta (`detect/grouping.ts`) haría bajar el censo de 9 a 1
  // — un DELTA NEGATIVO falso: la agrupación no perdió recall (§2.2:
  // `Σ memberCount === findingsTotal`), sólo cambió cuántas FILAS de
  // `analysis.findings` lo representan. Sumar `memberCount` en vez de contar
  // filas es una COTA SUPERIOR segura, no un recuento exacto por archivo: un
  // grupo cuyos miembros tocan archivos distintos (p.ej. `duplication`
  // cruzando archivos) suma su `memberCount` COMPLETO a cada archivo
  // distinto que toca, así que un archivo tocado por sólo ALGUNOS de sus
  // miembros puede quedar sobre-contado — nunca sub-contado (cada archivo
  // real sigue tocado por al menos 1 miembro real, y ese miembro pertenece a
  // EXACTAMENTE un grupo, así que la suma sobre los grupos que lo tocan es
  // siempre >= la cuenta verdadera de miembros que lo tocan). El censo sólo
  // rompe con un delta NEGATIVO (CONTRATOS.md §3.4): una cota superior nunca
  // puede producir uno, así que esto no cambia la garantía que el gate
  // ofrece, sólo la hace compatible con agrupación.
  for (const finding of analysis.findings) {
    const files = new Set(finding.locations.map((location) => location.file));
    for (const file of files) bump(keys, `${file}|hallazgo:${finding.kind}`, finding.memberCount ?? 1);
  }

  const languageCounts = new Map<string, number>();
  for (const file of analysis.files) {
    keys[`${file.path}|archivo:${file.language}`] = 1;
    languageCounts.set(file.language, (languageCounts.get(file.language) ?? 0) + 1);
  }

  // Meta a nivel repo, con la parte de ruta vacía.
  keys["|meta:scannedFiles"] = analysis.scannedFiles;
  keys["|meta:analysedFiles"] = analysis.analysedFiles;
  keys["|meta:totalLines"] = analysis.totalLines;
  for (const [language, count] of languageCounts) {
    keys[`|meta:language:${language}`] = count;
  }

  // "Una clave con 0 no se escribe" (§3.3): "no está" y "está en 0" tienen
  // que ser el mismo estado. Filtrado ACÁ (no sólo al serializar) para que
  // el `Census` en memoria y el serializado sean siempre el mismo objeto.
  for (const key of Object.keys(keys)) {
    if (keys[key] <= 0) delete keys[key];
  }

  return {
    meta: {
      slug,
      analyzerVersion: ANALYZER_VERSION,
      scannedFiles: analysis.scannedFiles,
      analysedFiles: analysis.analysedFiles,
      totalLines: analysis.totalLines,
      languages: [...analysis.languages].sort(),
      elapsedMs,
    },
    keys,
  };
}

/**
 * Conveniencia: corre `analyzeRepo` con los topes quitados (§3.5 — SIEMPRE
 * "unlimited": sin eso el censo mide el corte, no la detección) y devuelve
 * el censo.
 *
 * INTEGRACIÓN Ola 6 — CONFLICTO #2 declarado, cerrado acá: `limits.maxFindings:
 * "unlimited"` YA NO basta por sí solo. `MAX_STORED_FINDINGS` (`code-analyzer.ts`
 * §2.6) es un techo de ALMACENAMIENTO separado que se aplica SIEMPRE, incluso
 * bajo "unlimited" — necesario para `code-inspector.ts` (memoria real de
 * producción), pero falso para el censo: medido contra guava (corpus de esta
 * ola), `groupsTotal` da 5143, ya por encima del techo de 5000, así que
 * `analysis.findings` llegaba truncado (5000 de 5143) y el censo redistribuía
 * claves `duplication` entre corridas sin ninguna pérdida real de detección.
 * `onPreCapFindings` (mismo patrón que `onFacts`/`onGraph`) entrega la lista
 * COMPLETA, ANTES de ese corte — se la sustituye a `analysis.findings` sólo
 * para `censusOf` (nunca se expone el resto de `CodeAnalysis` recortado:
 * `files`/meta no pasan por este techo en absoluto).
 *
 * UN PROCESO POR REPO. Este helper no lo impone por sí mismo — lo impone
 * `scripts/census.mts`, que es el único llamador previsto: invocarlo dos
 * veces (con dos `dir` distintos) DENTRO del mismo proceso node corrompe el
 * caché de `require` de `web-tree-sitter` (ver `loadRuntime`,
 * `code-analyzer.ts`). `census-golden.test.ts` respeta esto lanzando
 * `scripts/census.mts` como subproceso, una vez por slug — nunca llama a
 * esta función directamente para los repos del corpus.
 *
 * CACHÉ POR SHA + HUELLA DEL ANALIZADOR — ver `analyze-cache.ts`. `analyzeRepoCached`
 * reemplaza la llamada directa a `analyzeRepo`: en un HIT, `analyzeRepo` no corre en
 * absoluto (nunca dos veces en este proceso, así que la regla del párrafo de arriba
 * sigue intacta con o sin caché). El hit/miss se loguea a STDERR — nunca a STDOUT,
 * que sigue siendo SÓLO el censo serializado (`scripts/census.mts` lo parsea) —
 * para que cualquiera que corra la compuerta pueda decir si el número que ve lo
 * MIDIÓ o lo LEYÓ (requisito de verificabilidad de la tarea que agregó el caché).
 */
export async function censusRepo(repoDir: string, slug: string): Promise<Census> {
  const startedAt = Date.now();
  const { analysis, preCapFindings, cache } = await analyzeRepoCached({
    dir: repoDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  console.error(
    `[analyzer-cache] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} key=${cache.key || "-"}`,
  );
  const censusAnalysis: CodeAnalysis = preCapFindings ? { ...analysis, findings: [...preCapFindings] } : analysis;
  return censusOf(censusAnalysis, slug, Date.now() - startedAt);
}

/**
 * JSON indentado con 2 espacios, LF, newline final, claves de `keys`
 * ordenadas lexicográficamente por `Array.prototype.sort()` crudo (§3.3) —
 * el archivo se revisa en un `git diff`, así que el orden es parte del
 * contrato, no un detalle de implementación. El orden de `meta` (listado
 * explícito, no derivado) es el mismo que el del ejemplo de CONTRATOS.md.
 */
export function serializeCensus(census: Census): string {
  const meta: CensusMeta = {
    slug: census.meta.slug,
    analyzerVersion: census.meta.analyzerVersion,
    scannedFiles: census.meta.scannedFiles,
    analysedFiles: census.meta.analysedFiles,
    totalLines: census.meta.totalLines,
    languages: census.meta.languages,
    elapsedMs: census.meta.elapsedMs,
  };

  const keys: CensusKeys = {};
  for (const key of Object.keys(census.keys).sort()) {
    const value = census.keys[key];
    if (value > 0) keys[key] = value; // defensivo: ver censusOf, misma regla.
  }

  return `${JSON.stringify({ meta, keys }, null, 2)}\n`;
}

export function parseCensus(text: string): Census {
  const parsed = JSON.parse(text) as Partial<Census> | null;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.meta ||
    typeof parsed.meta !== "object" ||
    !parsed.keys ||
    typeof parsed.keys !== "object"
  ) {
    throw new Error("censo inválido: falta `meta` o `keys`");
  }
  return parsed as Census;
}

/** Una excepción documentada a "toda clave del base tiene que seguir" (§3.4). */
export interface CensusWaiver {
  /** Repo al que aplica, o `"*"` para todos. */
  slug: string;
  /** Clave exacta, o glob con UN solo `*` en la parte de ruta. */
  key: string;
  expected: "baja" | "desaparece";
  /** Sólo con `expected: "baja"`: el valor más bajo que se acepta. */
  min?: number;
  reason: string;
  /** Sección del plan que lo autoriza, p.ej. "PLAN.md §5". */
  spec: string;
  /** Fase en la que se agregó, p.ej. "F1". */
  addedIn: string;
}

export interface CensusDelta {
  slug: string;
  key: string;
  base: number;
  head: number;
}

export interface CensusMetaMismatch {
  field: string;
  base: number | string;
  head: number | string;
}

export interface CensusDiff {
  /** Rompe el build. */
  regressions: CensusDelta[];
  /** Bajadas cubiertas por un waiver. */
  waived: CensusDelta[];
  /** Waivers que no cubrieron ninguna regresión real en esta corrida — rompe el build igual que una regresión. */
  staleWaivers: CensusWaiver[];
  /** Informativo, nunca rompe. */
  increases: CensusDelta[];
  /** Rompe el build. */
  metaMismatch: CensusMetaMismatch[];
  unchanged: number;
}

/**
 * Glob de UN solo `*`, sobre la CLAVE COMPLETA (`"${file}|${tipo}"`), no sólo
 * la parte de archivo — así es como lo declara `CensusWaiver.key` (§3.1/§3.4).
 * Tira si hay más de un `*`: eso es un waiver mal escrito, no una condición
 * silenciosa.
 */
function globMatches(pattern: string, value: string): boolean {
  const starCount = pattern.length - pattern.replaceAll("*", "").length;
  if (starCount === 0) return pattern === value;
  if (starCount > 1) {
    throw new Error(`waiver key "${pattern}" tiene más de un '*' — sólo se admite uno (CONTRATOS.md §3.1)`);
  }
  const star = pattern.indexOf("*");
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return value.length >= prefix.length + suffix.length && value.startsWith(prefix) && value.endsWith(suffix);
}

function waiverTargets(waiver: CensusWaiver, slug: string, key: string): boolean {
  if (waiver.slug !== "*" && waiver.slug !== slug) return false;
  return globMatches(waiver.key, key);
}

/** ¿Este waiver cubre ESTA regresión puntual? Regla exacta de §3.4. */
function waiverCovers(
  waiver: CensusWaiver,
  slug: string,
  key: string,
  headPresent: boolean,
  headValue: number,
): boolean {
  if (!waiverTargets(waiver, slug, key)) return false;
  if (waiver.expected === "desaparece") return !headPresent;
  return headPresent && headValue >= (waiver.min ?? 0);
}

const META_NUMERIC_FIELDS = ["scannedFiles", "analysedFiles", "totalLines"] as const;

/**
 * Compara `base` (línea congelada) contra `head` (corrida fresca). Puro: no
 * agrega nada por sí mismo a través de varios repos — cuando `waivers`
 * incluye entradas `slug: "*"` que abarcan MÁS de un repo, la decisión de
 * "¿está rancio GLOBALMENTE?" es responsabilidad de quien llama esto una vez
 * por repo (`census-golden.test.ts`), agregando los `staleWaivers` de cada
 * llamada — ver el comentario ahí para por qué evaluarlo por-repo aislado
 * daría falsos "rancio" en cada repo al que el waiver no aplica.
 */
export function diffCensus(base: Census, head: Census, waivers: readonly CensusWaiver[]): CensusDiff {
  if (base.meta.analyzerVersion !== head.meta.analyzerVersion) {
    // "El diff no se hace" (§3.4): formatos de conteo de versiones distintas
    // no son comparables clave a clave.
    return {
      regressions: [],
      waived: [],
      staleWaivers: [],
      increases: [],
      metaMismatch: [
        { field: "analyzerVersion", base: base.meta.analyzerVersion, head: head.meta.analyzerVersion },
      ],
      unchanged: 0,
    };
  }

  const metaMismatch: CensusMetaMismatch[] = [];
  for (const field of META_NUMERIC_FIELDS) {
    if (base.meta[field] !== head.meta[field]) {
      metaMismatch.push({ field, base: base.meta[field], head: head.meta[field] });
    }
  }
  const baseLanguages = [...base.meta.languages].sort().join(",");
  const headLanguages = [...head.meta.languages].sort().join(",");
  if (baseLanguages !== headLanguages) {
    metaMismatch.push({ field: "languages", base: baseLanguages, head: headLanguages });
  }

  const slug = head.meta.slug;
  const regressions: CensusDelta[] = [];
  const waived: CensusDelta[] = [];
  const increases: CensusDelta[] = [];
  const usedWaivers = new Set<CensusWaiver>();
  let unchanged = 0;

  // Sólo claves presentes en el BASE se examinan — una clave nueva en head
  // es informativa y no entra en ninguna de estas listas (§3.4).
  for (const key of Object.keys(base.keys)) {
    const baseValue = base.keys[key];
    const headPresent = Object.hasOwn(head.keys, key);
    const headValue = headPresent ? head.keys[key] : 0;

    if (headValue < baseValue) {
      const delta: CensusDelta = { slug, key, base: baseValue, head: headValue };
      const covering = waivers.find((waiver) => waiverCovers(waiver, slug, key, headPresent, headValue));
      if (covering) {
        waived.push(delta);
        usedWaivers.add(covering);
      } else {
        regressions.push(delta);
      }
    } else if (headValue > baseValue) {
      increases.push({ slug, key, base: baseValue, head: headValue });
    } else {
      unchanged++;
    }
  }

  const staleWaivers = waivers.filter((waiver) => !usedWaivers.has(waiver));

  return { regressions, waived, staleWaivers, increases, metaMismatch, unchanged };
}
