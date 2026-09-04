/**
 * EL LADO PRODUCTOR de `EDGE_EXTRACTORS` (P5-ARISTAS: cablear las 6 aristas
 * tipadas del grafo dentro de `analyzeFile`). Hasta esta tarea nadie invocaba
 * `EDGE_EXTRACTORS` en producción: la Ola 4 escribió los 6 extractores +
 * tests + registro, la Ola 5 cableó el CONSUMIDOR (`graph/build.ts`'s
 * `GraphFileFacts.edges`, ya listo para recibir esto), y nadie llamó
 * `extract()` sobre un archivo real — así que las 6 aristas emitían SIEMPRE 0
 * en los 8 repos del corpus y 5 detectores (`concrete-over-abstraction`,
 * `scattered-instantiation`, `import-depth-demeter`, `parallel-hierarchies`,
 * `speculative-abstraction`) reportaban cero SIEMPRE.
 *
 * Archivo NUEVO, propiedad de esta tarea — no toca ninguno de los 6
 * extractores ni `graph/resolve.ts`. Se limita a:
 *
 *   1. Un WARM-UP síncrono, memoizado por lenguaje (una vez por proceso,
 *      igual disciplina que `code-analyzer.ts#resolveLanguage`): parsea la
 *      fuente centinela de CADA extractor que la declara para ESE lenguaje,
 *      usando el `parser` que YA cargó `resolveLanguage` — nunca un segundo
 *      bootstrap de `web-tree-sitter` (ver "INTERFAZ-ESTRUCTURAL, DELIBERADAMENTE
 *      NO CABLEADA" más abajo para el porqué exacto de esa restricción).
 *   2. Un `EdgeContext` por lenguaje, cuyo `carriers(slot)` lee del caché que
 *      el warm-up llenó.
 *   3. `extractEdgeFacts`: el despachador que corre CADA extractor cableado
 *      sobre UN archivo ya parseado, con el mismo gate de `needs` que
 *      `detect/run.ts` ya aplica a los detectores (ausencia de capacidad ⇒
 *      se saltea esa arista para ese archivo, nunca "corrió y no encontró
 *      nada"), y aísla cada extractor en su propio try/catch — un extractor
 *      que explota pierde SUS aristas de este archivo, nunca las de los
 *      otros cuatro.
 *
 * *** INTERFAZ-ESTRUCTURAL, DELIBERADAMENTE NO CABLEADA (arista `satisfies`) ***
 * `interfaz-estructural.ts#ensureStructuralProfiles` hace su PROPIO bootstrap
 * de `web-tree-sitter` vía `detect/testing.ts#parseRoot` — un MÓDULO CERRADO
 * ("se usa, no se edita") con su propio `Parser.init()` independiente del de
 * `code-analyzer.ts#loadRuntime`. Medido con un repro mínimo
 * (`scratch-probe/probe-doubleinit.mjs`, dos `createRequire` distintos sobre
 * el mismo proceso): una SEGUNDA llamada a `require("web-tree-sitter")` +
 * `Parser.init()` en el mismo proceso, después de que la primera ya resolvió,
 * devuelve el glue Emscripten de bajo nivel (`HEAP8`, `_malloc`, ...) en vez
 * de `{Parser, Language}`, y esa segunda `Parser.init` deja de ser función —
 * confirmado también en modo CONCURRENTE (ambos `require()` antes de que
 * cualquiera resuelva: igual falla uno de los dos). `analyzeFile` YA resolvió
 * su propio runtime antes de llegar acá (`resolveLanguage` corre primero),
 * así que invocar `ensureStructuralProfiles()` en el mismo proceso SIEMPRE
 * dispara esta corrupción — no es una carrera, es determinístico dado el
 * orden real de `analyzeFile`. Es EXACTAMENTE el riesgo que el propio
 * docstring de `interfaz-estructural.ts` ya marca como "real, no hipotético,
 * le toca al integrador de `build.ts` resolver con un solo bootstrap
 * compartido" — arreglarlo de raíz exige tocar `detect/testing.ts` (cerrado)
 * o el propio extractor (fuera de mis archivos: "NO toques los 6
 * extractores"). Consecuencia acotada: `concrete-over-abstraction` y
 * `speculative-abstraction` (los dos únicos detectores que leen `satisfies`)
 * siguen viendo `extends`/`implements`; sólo pierden la señal estructural sin
 * `implements` explícito (Go, y TS/Vue cuando se omite `implements` a
 * propósito). Los otros 5 extractores están COMPLETOS.
 */
import type { Capability } from "../../detect/capabilities.js";
import type { AstNode, FileUnit } from "../../detect/types.js";
import { extractor as cadenaIdentidadExtractor, warmUp as cadenaIdentidadWarmUp } from "./cadena-identidad.js";
import { extractor as declaraTipoExtractor } from "./declara-tipo.js";
import { extractor as herenciaExtractor, warmUp as herenciaWarmUp } from "./herencia.js";
import { importsExtractor } from "./imports.js";
import { extractor as instanciacionExtractor } from "./instanciacion.js";
import { extractor as interfazDeclaradaExtractor, warmUp as interfazDeclaradaWarmUp } from "./interfaz-declarada.js";
import { mixinExtractor } from "./mixin.js";
import { extractor as propagaTipoExtractor } from "./propaga-tipo.js";
import { edgeProfile, registerSentinelProbe } from "./sentinel.js";
import type { CarrierPath } from "./sentinel.js";
import type { EdgeContext, EdgeExtractor, EdgeFacts } from "./types.js";

/**
 * Los 5 extractores que SÍ se despachan sobre archivos reales — ver el
 * docstring del módulo para por qué `interfaz-estructural` queda afuera.
 * Orden sin significado (no es "LA LISTA" de `registry.ts`: esa sigue siendo
 * la única fuente de verdad de qué aristas EXISTEN; esta es sólo cuáles se
 * invocan hoy desde `analyzeFile`).
 */
const WIRED_EXTRACTORS: readonly EdgeExtractor[] = [
  // Ola R (R3) — `stores`, la cadena `construye → guarda`. SÍ lee
  // `ctx.carriers()`: su forma (declarador de binding, profundidad, nodo de
  // construcción y campo del tipo) sale entera de la sonda — ver el bloque de
  // `warmUpLanguage` más abajo.
  cadenaIdentidadExtractor,
  // Ola R (R1) — `declares-type`. NO lee `ctx.carriers()` (el campo `type` es
  // el mismo en las cinco gramáticas que lo escriben), así que no necesita
  // nada de `warmUpLanguage`: mismo caso que `imports`/`mixes-in`.
  declaraTipoExtractor,
  herenciaExtractor,
  importsExtractor,
  instanciacionExtractor,
  interfazDeclaradaExtractor,
  mixinExtractor,
  // Ola R (R2) — `declares-type`, VÍA 2: la PROPAGACIÓN DESDE EL ORIGEN
  // (`x = Foo()`, `self.conn = Conn()`, `@cache = {}`). SÍ lee
  // `ctx.carriers()`, pero **el MISMO slot que `instanciacion`** (lo lee de
  // ese propio extractor, `instanciacionExtractor.slots[0]`, en vez de
  // re-escribir la cadena), porque las dos preguntas se contestan sobre el
  // mismo sitio sintáctico y comparten `constructedTypeAt`. Como el bloque de
  // `instanciacion` en `warmUpLanguage` ya deja ese slot calentado para todos
  // los lenguajes con sonda, este extractor NO agrega ninguna línea allá.
  propagaTipoExtractor,
];

/** Lo mínimo que `analyzeFile` necesita prestar: el `parser` que `resolveLanguage`
 *  YA cargó y cacheó para este lenguaje — nunca un segundo bootstrap. */
export interface MinimalParser {
  parse(source: string): { rootNode: unknown };
}

function cacheKey(language: string, slot: string): string {
  return `${language}::${slot}`;
}

const warmedLanguages = new Set<string>();
const carriersBySlot = new Map<string, readonly CarrierPath[]>();

/**
 * Corre UNA vez por lenguaje por proceso (memoizado, mismo criterio que
 * `resolveLanguage`): parsea la fuente centinela de cada extractor cableado
 * que la declara para `language`, con el `parser` YA resuelto, y resuelve sus
 * `CarrierPath` — síncrono de punta a punta porque `parser.parse()` sobre una
 * fuente de ~1-10 líneas es barato y `parser` ya está cargado (nunca paga el
 * costo de `Parser.init()`/carga de gramática una segunda vez).
 */
function warmUpLanguage(language: string, parser: MinimalParser, classNodes: ReadonlySet<string>): void {
  if (warmedLanguages.has(language)) return;
  warmedLanguages.add(language);

  const herenciaSrc = herenciaExtractor.sentinel[language];
  if (herenciaSrc) {
    const root = parser.parse(herenciaSrc).rootNode as unknown as AstNode;
    const { carriers } = herenciaWarmUp(language, root);
    for (const slot of herenciaExtractor.slots) carriersBySlot.set(cacheKey(language, slot), carriers);
  }

  // `instanciacion` no expone su propio `warmUp` (no tiene ambigüedad
  // especial que resolver, a diferencia de `herencia`/C#): usa el mecanismo
  // GENÉRICO compartido de `sentinel.ts`, el mismo que ejercita
  // `instanciacion.test.ts#ctxFor`.
  const instSrc = instanciacionExtractor.sentinel[language];
  if (instSrc) {
    const root = parser.parse(instSrc).rootNode as unknown as AstNode;
    registerSentinelProbe(language, instanciacionExtractor.id, root);
    const { carriers } = edgeProfile(language, instanciacionExtractor);
    for (const slot of instanciacionExtractor.slots) carriersBySlot.set(cacheKey(language, slot), carriers);
  }

  // `cadena-identidad` expone su propio `warmUp` por el mismo motivo que
  // `herencia`: necesita DOS anclas de sonda (el binding y la declaración que
  // lo envuelve) y el mecanismo genérico de `sentinel.ts` sólo admite un par
  // `expect.from`/`expect.to`. Devuelve UN `CarrierPath` sintético
  // declarador→campo-del-tipo; ver el docstring de ese módulo.
  const cadenaSrc = cadenaIdentidadExtractor.sentinel[language];
  if (cadenaSrc) {
    const root = parser.parse(cadenaSrc).rootNode as unknown as AstNode;
    registerSentinelProbe(language, cadenaIdentidadExtractor.id, root);
    const { carriers } = cadenaIdentidadWarmUp(language, root);
    for (const slot of cadenaIdentidadExtractor.slots) carriersBySlot.set(cacheKey(language, slot), carriers);
  }

  // `interfaz-declarada` es AUTOCONTENIDO (ver su propio docstring: escrito
  // antes de que `graph/edges/{types,sentinel}.ts` existieran) — su
  // `warmUp` no pasa por `sentinel.ts` en absoluto y devuelve `carriers`
  // directamente; `Parameters<...>[1]` toma el tipo `ProbedNode` SIN
  // exportarlo (no es parte de la superficie pública del módulo).
  const ifaceSrc = interfazDeclaradaExtractor.sentinel[language];
  if (ifaceSrc) {
    const root = parser.parse(ifaceSrc).rootNode as unknown as Parameters<typeof interfazDeclaradaWarmUp>[1];
    const { carriers } = interfazDeclaradaWarmUp(language, root, classNodes);
    for (const slot of interfazDeclaradaExtractor.slots) carriersBySlot.set(cacheKey(language, slot), carriers);
  }

  // `imports`/`mixes-in`: ninguno de los dos lee `ctx.carriers()` (ver sus
  // propios `extract()` — deciden por `file.language`/forma directa sobre
  // `file.root`), así que no hay nada que precomputar acá.
}

function buildEdgeContext(language: string, capabilities: ReadonlySet<Capability>): EdgeContext {
  return {
    language,
    capabilities,
    carriers: (slot) => carriersBySlot.get(cacheKey(language, slot)) ?? [],
    // Ningún extractor cableado hoy lee `suppressedRolePaths` (verificado por
    // grep antes de escribir esto) — mismo `[]` que usan los tres arneses de
    // test (`herencia.test.ts`, `instanciacion.test.ts`, `interfaz-declarada.test.ts`).
    suppressedRolePaths: [],
  };
}

/**
 * Corre los 5 extractores cableados sobre UN archivo ya parseado y devuelve
 * sus `EdgeFacts` concatenados. Llamado desde `analyzeFile`, sobre el MISMO
 * `FileUnit`/`parser` que ya construyó `findings`/`coverage` — nunca re-parsea
 * ni re-lee disco.
 */
export function extractEdgeFacts(
  file: FileUnit,
  parser: MinimalParser,
  classNodes: ReadonlySet<string>,
  capabilities: ReadonlySet<Capability>,
): readonly EdgeFacts[] {
  warmUpLanguage(file.language, parser, classNodes);
  const ctx = buildEdgeContext(file.language, capabilities);

  const out: EdgeFacts[] = [];
  for (const extractor of WIRED_EXTRACTORS) {
    // Mismo gate que `detect/run.ts` aplica a cada detector: ausencia de
    // capacidad ⇒ esta arista se saltea para este archivo, nunca "corrió y
    // no encontró nada" (`mixin.ts`/`imports.ts` documentan explícitamente
    // que el gate de `needs` es responsabilidad de quien orqueste, no del
    // propio extractor).
    const missing = extractor.needs.filter((c) => !capabilities.has(c));
    if (missing.length > 0) continue;
    try {
      out.push(...extractor.extract(file, ctx));
    } catch {
      /* este extractor no aporta aristas de este archivo; los otros cuatro siguen en pie. */
    }
  }
  return out;
}
