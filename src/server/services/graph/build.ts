/**
 * El grafo armado — CONTRATO-F3.md §3.1's `buildGraph`, y el pegamento entre
 * `graph/symbols.ts`/`graph/references.ts` (qué hay) y `graph/resolve.ts`
 * (qué significa). Este módulo NO parsea nada: recibe símbolos/referencias
 * YA extraídos por archivo y arma (a) el árbol `contains` (carpeta → archivo
 * → símbolo → símbolo anidado, siempre `declared`) y (b) los
 * `ResolutionCandidate`/`ResolutionContext` que alimentan la cascada de
 * `resolve.ts` para las aristas `references`.
 *
 * *** BRECHA DECLARADA, no escondida: `GraphFileFacts` en vez de `FileFacts`. ***
 * CONTRATO-F3.md §3.3 firma `buildGraph(facts: readonly FileFacts[]):
 * CodeGraph`. El `FileFacts` REAL (`facts/types.ts`, re-exportado desde
 * `code-analyzer.ts`, dueño distinto esta ola) todavía no carga `symbols`/
 * `references` — el propio reporte de esa tarea lo dice explícitamente:
 * "sin symbols/references (eso es CONTRATO 1 para el grafo, explícitamente
 * fuera de mi tarea)". `GraphFileFacts` es exactamente los 4 campos que
 * `buildGraph` necesita, con los MISMOS nombres que tendría un `FileFacts`
 * ensanchado (`path`, `language`, `symbols`, `references`) — el día que
 * `FileFacts` los gane, un caller pasa `facts` directo, sin adaptador,
 * porque la forma ya es estructuralmente compatible. Hasta entonces, quien
 * quiera correr `buildGraph` sobre un repo real tiene que parsear y llamar
 * `extractSymbols`/`extractReferences` él mismo (ver el script de medición
 * de esta tarea, fuera de `src/`) — cablear ESO dentro de `analyzeRepo`/
 * `crossAnalyze` es trabajo de quien es dueño de `code-analyzer.ts`, fuera
 * de esta ola (regla 6: no tocar un archivo compartido ajeno).
 */
import { EDGE_EXTRACTORS } from "./edges/registry.js";
import type { EdgeFacts } from "./edges/types.js";
import { deriveSatisfiesEdges } from "./edges/satisfies-derive.js";
import { deriveCarriesEdges } from "./edges/carries-derive.js";
import { markAmbiguousStores } from "./edges/cadena-identidad.js";
import { deriveInvokesIndirectEdges, type ReceiverFact } from "./edges/invocacion-indirecta.js";
import { materializeCarrierFacts, type CarrierFact } from "./edges/portador.js";
import { materializeTypeDeclNodes, resolveDeclaresTypeEdges } from "./edges/declara-tipo.js";
import { classifyImportSpecifiers, resolveImportEdges as resolveImportEdgesRaw } from "./imports-target.js";
import type { ReferenceFacts } from "./references.js";
import { ALL_STAGES, PROVENANCE_STRENGTH, resolveReferences } from "./resolve.js";
import {
  UNRESOLVED_REPORT_MAX_FILES,
  type ReferenceSite,
  type ResolutionCandidate,
  type ResolutionContext,
  type ResolutionStageId,
  type ResolutionStats,
  type ResolveOptions,
  type SymbolRef,
} from "./stages.js";
import type { SymbolFacts } from "./symbols.js";
import {
  fileNodeId,
  folderNodeId,
  symbolNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type EdgeKind,
} from "./types.js";

/** Ver el docstring de este archivo — el sustituto declarado de `FileFacts` hasta que ese tipo gane `symbols`/`references`. */
export interface GraphFileFacts {
  readonly path: string;
  readonly language: string;
  readonly symbols: readonly SymbolFacts[];
  readonly references: readonly ReferenceFacts[];
  /**
   * P4 — salida de los 6 `EDGE_EXTRACTORS` (`graph/edges/registry.ts`) para
   * ESTE archivo, si quien arma `GraphFileFacts` ya los corrió sobre el árbol
   * vivo (`extract()` exige un `FileUnit` real — este módulo nunca parsea
   * nada, así que NO puede invocar los extractores por su cuenta). OPCIONAL
   * y ausente hoy en el único caller de producción (`code-analyzer.ts`'s
   * `crossAnalyze`, que arma `GraphFileFacts` con sólo estos 4 campos — grep
   * verificado antes de este cambio): `FileFacts` (`facts/types.ts`, dueño
   * distinto esta ola) todavía no carga `edges`, así que hasta que ese campo
   * se agregue ahí y `analyzeFile` llame a los extractores antes de
   * `tree.delete()` (el mismo lugar donde ya corren `runDetectors`/
   * `buildFileUnit`), este campo llega SIEMPRE `undefined` en producción y
   * toda la traducción de abajo queda inerte — reportado, no escondido. Ver
   * `resolveTypedEdgesForFiles`/`resolveImportEdges` para el consumidor.
   */
  readonly edges?: readonly EdgeFacts[];
  /**
   * CONTRATO-F9.md §3.3 forma 2, `graph/edges/portador.ts`. Mismo motivo
   * OPCIONAL que `edges` arriba: `extractCarrierFacts` corre sobre el árbol
   * VIVO, en el mismo momento que `extractSymbols`/`extractReferences`, y
   * quien arma `GraphFileFacts` hoy (`code-analyzer.ts#crossAnalyze`) no lo
   * llama todavía — ausente ⇒ cero literales function-like modelados para
   * ese archivo, nunca un error.
   */
  readonly carrierFacts?: readonly CarrierFact[];
  /**
   * `invokes-indirect`, generalización del receptor (Go) —
   * `graph/edges/invocacion-indirecta.ts`, ver "GENERALIZACIÓN DEL
   * RECEPTOR" en su docstring. Mismo motivo OPCIONAL que `carrierFacts`:
   * `extractReceiverFacts` corre sobre el árbol VIVO, en el mismo momento
   * que `extractCarrierFacts`/`extractSymbols`/`extractReferences` — ausente
   * ⇒ cero receptores explícitos modelados para ese archivo (cualquier
   * lenguaje sin campo `receiver` en su gramática), nunca un error.
   */
  readonly receivers?: readonly ReceiverFact[];
}

/** `EDGE_EXTRACTORS` — "LA LISTA", id -> kind — la única superficie de ese registro que un módulo SIN AST (este) puede consultar: valida que un `EdgeFacts` diga la verdad sobre su propio `kind` antes de traducirlo, en vez de asumirlo. */
const EXTRACTOR_KIND_BY_ID: ReadonlyMap<string, EdgeKind> = new Map(EDGE_EXTRACTORS.map((e) => [e.id, e.kind] as const));

function isTrustworthyEdgeFact(ef: EdgeFacts): boolean {
  return EXTRACTOR_KIND_BY_ID.get(ef.extractorId) === ef.kind;
}

function symbolPathOf(s: SymbolFacts): readonly string[] {
  return [...s.container, s.name];
}

/**
 * Índice repo-completo: nombre → declaraciones, y `(file, symbolPath)` →
 * `SymbolFacts` completo. Dos símbolos HERMANOS HOMÓNIMOS (mismo `file` +
 * mismo `symbolPath` completo — ver `types.ts`'s docstring de identidad de
 * nodo) colapsan a UNA sola entrada de índice: `SymbolRef` no carga
 * `ordinal`, así que la cascada de resolución no puede apuntar a un hermano
 * específico — se queda con el PRIMERO en orden de aparición, la misma
 * limitación declarada que `Anchor.ordinal` ya tiene cuando el nombre solo
 * no alcanza para desambiguar.
 */
function buildIndex(files: readonly GraphFileFacts[]): {
  readonly byName: ReadonlyMap<string, readonly SymbolRef[]>;
  readonly factsByKey: ReadonlyMap<string, SymbolFacts>;
  /** Ver `twinFilesForScope` (GRAFO#1) — qué archivos declaran, cada uno, un `symbolPath` dado (join con "."). */
  readonly filesBySymbolPath: ReadonlyMap<string, ReadonlySet<string>>;
} {
  const byName = new Map<string, SymbolRef[]>();
  const factsByKey = new Map<string, SymbolFacts>();
  const filesBySymbolPath = new Map<string, Set<string>>();
  const seenKeys = new Set<string>();

  for (const f of files) indexOneFile(f, byName, factsByKey, filesBySymbolPath, seenKeys);

  return { byName, factsByKey, filesBySymbolPath };
}

/**
 * B1 (eslabón 2) — plumbing MÍNIMO y aislado dentro de esta única función:
 * los tres métodos nuevos de `ResolutionContext` (`importsModule`/
 * `reachesModule`/`hasResolvedImports`, ver sus docstrings en `stages.ts`)
 * necesitan el grafo de imports YA RESUELTO, en rutas crudas. Reusa
 * `resolveImportEdges` (función local de ESTE archivo, la MISMA que arma las
 * aristas `imports` reales del grafo — cero mecanismo nuevo, cero
 * vocabulario nuevo) y sólo destapa el prefijo `file:` de sus ids
 * (`pathByFileNodeId`, vía `fileNodeId` — nunca asumiendo el formato del
 * prefijo a mano) para comparar contra `SymbolRef.file`/`ReferenceSite.file`
 * sin traducción. Ningún otro punto de `build.ts` cambia: `buildGraph`/
 * `assembleGraph` siguen llamando a `resolveImportEdges(files)` por su
 * cuenta para las aristas `imports` que van al grafo — este cálculo es
 * independiente y redundante a propósito (evita reordenar el resto de
 * `buildGraph`, que calcula `importEdges` DESPUÉS de `ctx` — ver ese
 * docstring), barato sobre el tamaño de estos dos corpus (cientos de
 * archivos, no millones).
 */
/**
 * Los tres métodos que la etapa de resolución que N9 diseñó (y que vive en
 * `graph/resolve.ts`, archivo de otro frente) necesita para cerrar la mitad
 * que queda de la colisión de nombres — ver `imports-target.ts#
 * classifyImportSpecifiers` para la evidencia medida y el discriminador.
 *
 * POR QUÉ ES UNA INTERFAZ APARTE Y NO CAMPOS DE `ResolutionContext`:
 * `ResolutionContext` se declara en `graph/stages.ts`, que en esta ola tiene
 * OTRO dueño. El objeto que `buildResolutionContext` devuelve YA lleva los
 * tres métodos en tiempo de ejecución; el día que `ResolutionContext` los
 * declare (dos líneas en `stages.ts`), una etapa los lee sin que este archivo
 * cambie una coma, y hasta entonces cualquier consumidor los pide con este
 * tipo. No es un contrato paralelo: es el MISMO objeto, tipado en dos partes
 * porque los archivos tienen dos dueños.
 */
export interface ImportSpecifierFacts {
  /** `true` si `file` tiene AL MENOS un import cuyo especificador NO resolvió a un archivo del repo. */
  importsUnresolvedSpecifier(file: string): boolean;
  /** Los especificadores crudos de `file`, ya clasificados. Archivo sin imports ⇒ los dos vacíos. */
  importSpecifiers(file: string): { readonly resolved: readonly string[]; readonly unresolved: readonly string[] };
  /**
   * `true` si ese MISMO especificador resolvió a un archivo del repo desde
   * algún otro archivo — el discriminador que separa `typing` (nunca resuelve
   * en ningún lado: afuera) de `@nestjs/common` (alias de monorepo que sí
   * resuelve desde otros archivos: adentro). Ver `classifyImportSpecifiers`.
   */
  specifierResolvesSomewhere(spec: string): boolean;
}

const NO_IMPORT_SPECIFIERS: { readonly resolved: readonly string[]; readonly unresolved: readonly string[] } = {
  resolved: [],
  unresolved: [],
};

export function buildResolutionContext(
  files: readonly GraphFileFacts[],
  index?: ReturnType<typeof buildIndex>,
): ResolutionContext & ImportSpecifierFacts {
  const { byName, factsByKey } = index ?? buildIndex(files);
  const languageByFile = new Map(files.map((f) => [f.path, f.language]));

  const specifiers = classifyImportSpecifiers(trustedImportFacts(files));
  const pathByFileNodeId = new Map(files.map((f) => [fileNodeId(f.path), f.path]));
  const directImports = new Map<string, Set<string>>();
  for (const e of resolveImportEdges(files)) {
    const from = pathByFileNodeId.get(e.from);
    const to = pathByFileNodeId.get(e.to);
    if (from === undefined || to === undefined) continue;
    let set = directImports.get(from);
    if (!set) {
      set = new Set();
      directImports.set(from, set);
    }
    set.add(to);
  }
  // Cierre transitivo, memoizado por `fromFile` — cada `reachesModule` sólo
  // paga el BFS una vez por archivo de origen dentro de esta misma corrida.
  const reachableCache = new Map<string, ReadonlySet<string>>();
  const reachableFrom = (from: string): ReadonlySet<string> => {
    const cached = reachableCache.get(from);
    if (cached) return cached;
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const next of directImports.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    reachableCache.set(from, seen);
    return seen;
  };

  return {
    declarationsByName: (name) => byName.get(name) ?? [],
    symbol: (ref) => factsByKey.get(`${ref.file}#${ref.symbolPath.join(".")}`) ?? null,
    // Ver el docstring de `ResolutionContext.factsOf` en `stages.ts`: `FileFacts` no carga symbols/references todavía.
    factsOf: () => null,
    languageOf: (file) => languageByFile.get(file) ?? "unknown",
    importsModule: (fromFile, toFile) => directImports.get(fromFile)?.has(toFile) ?? false,
    reachesModule: (fromFile, toFile) => reachableFrom(fromFile).has(toFile),
    hasResolvedImports: (file) => (directImports.get(file)?.size ?? 0) > 0,
    // Ola P (P2) — ver `ImportSpecifierFacts` arriba. Misma clasificación que
    // `resolveImportEdges` hace para emitir las aristas, pero conservando la
    // mitad que ésa tira.
    importsUnresolvedSpecifier: (file) => (specifiers.byFile.get(file)?.unresolved.length ?? 0) > 0,
    importSpecifiers: (file) => specifiers.byFile.get(file) ?? NO_IMPORT_SPECIFIERS,
    specifierResolvesSomewhere: (spec) => specifiers.resolvedSomewhere.has(spec),
  };
}

function candidateId(file: string, ref: ReferenceFacts): string {
  const qualifierPart = ref.qualifier != null ? `~${ref.qualifier}` : "";
  return `${file}::${ref.scope.join(".")}#${ref.name}@${ref.role}${qualifierPart}:${ref.line}:${ref.column}`;
}

/**
 * Un `ResolutionCandidate` por sitio de referencia que tiene AL MENOS una
 * declaración candidata en todo el repo (excluyendo su propia declaración,
 * si el sitio de uso ES el nombre de su propia declaración — ver más abajo).
 * Un sitio cuyo nombre no está declarado en NINGÚN archivo no entra a la
 * cascada — no hay nada que resolver, y contarlo infla `candidates`/
 * `unresolved` con nombres externos (stdlib, gemas, npm) sin aportar señal.
 * Mismo criterio que `probe-cascade.ts`/`collect.mjs`: sólo `(archivo,
 * símbolo)` con al menos un dueño potencial se vuelve una fila.
 *
 * AUTO-REFERENCIA: un `ReferenceFacts` en el sitio EXACTO de su propia
 * declaración (mismo archivo, mismo `symbolPath` = `scope` + `name`, Y la
 * MISMA posición que el token de nombre de esa declaración) se excluye de sus
 * propios `targets` — si no, toda declaración global-única se "resolvería"
 * trivialmente a sí misma.
 *
 * *** LA POSICIÓN ES EL CRITERIO, Y ANTES NO SE MIRABA. *** (Ola P, P2 —
 * pedido abierto desde la Ola N, A4a, y repetido por N1 en la Ola O.) La
 * versión anterior excluía TODO candidato del mismo archivo con el mismo
 * `symbolPath`, sin comprobar que el sitio de uso fuera el de la declaración:
 * o sea, un símbolo usado en su PROPIO archivo, en el mismo scope léxico que
 * su declaración, no producía arista NUNCA — el grafo decía "nadie lo usa" y
 * el detector le creía. Repro medido, nombrado por N1 y verificado acá contra
 * el corpus: `class Sentinel` en `click/src/click/_utils.py:7`, usado quince
 * líneas más abajo en el mismo archivo (`t.Literal[Sentinel.UNSET]`, líneas
 * 22/25/32/35) y reportado como símbolo sin uso. `SymbolFacts` ya traía
 * `nameLine`/`nameColumn` y `ReferenceFacts` ya traía `line`/`column`, las
 * dos leídas del `startPosition` del MISMO nodo de la gramática y con la
 * misma convención (`row + 1`, `column` cruda): comparar las dos responde
 * exactamente "¿este sitio de uso ES el token de nombre de la declaración?",
 * que es la pregunta que la exclusión siempre quiso hacer.
 *
 * Por qué por posición y no por `role === "decl-name"`: el propio docstring
 * del gemelo de árbol paralelo, más abajo, mide que el nombre de una clase en
 * el token de su propio encabezado NO siempre llega con `role: "decl-name"`
 * (`public enum CaseFormat {` llega `bare`). La posición no depende de cómo
 * `classifyRole` haya clasificado ese token, así que cubre las dos formas con
 * un solo criterio en vez de dejar una afuera.
 *
 * GEMELO DE ÁRBOL PARALELO (dependiente del lenguaje) — GENERALIZADO A
 * CUALQUIER ROL, no sólo `decl-name`: un candidato en OTRO archivo con el
 * mismo `symbolPath` completo que `ownPath` (`scope` + `name` del sitio de
 * referencia) es legítimo SÓLO en un lenguaje que permite reabrir una
 * declaración a través de archivos (Ruby: `class Foo` repetido añade
 * métodos a la MISMA clase — `REOPENING_LANGUAGES` abajo). En un lenguaje
 * SIN esa semántica (Java, Go, C#, TypeScript) dos declaraciones con el
 * mismo `symbolPath` completo en archivos distintos no son "la misma cosa
 * reabierta": la única forma observada de que ocurra es duplicación real de
 * árbol de código (guava: `android/`, `guava/` (jre) y `guava-gwt/` casi
 * triplican cada clase/campo/método, byte-a-byte — `SetContainsBenchmark.
 * java` es idéntico bajo `android/` y sin ese prefijo, `diff` vacío,
 * verificado).
 *
 * *** LA VERSIÓN ANTERIOR DE ESTA EXCLUSIÓN SÓLO DISPARABA PARA
 * `role === "decl-name"` Y ESO DEJABA PASAR EL 89% DEL BUG (medido: 508 de
 * 1412 aristas `global-uniqueness` en guava cruzaban `android/`↔`guava/`
 * (jre); 451 de esas 508 eran justo este patrón con OTRO rol). *** El caso
 * que se escapaba: el nombre de una clase/enum en el TOKEN DE SU PROPIO
 * ENCABEZADO (`public enum CaseFormat {`) no siempre llega acá como
 * `decl-name` — `references.ts` lo clasifica `bare` para tipo-clase (fuera
 * de esta ola tocar por qué; ver su propio módulo). Estructuralmente es EL
 * MISMO caso: `ownPath` coincide EXACTO con un `symbolPath` que este MISMO
 * archivo declara — la referencia ES la forma de una auto-declaración, sin
 * importar qué `role` le haya tocado río arriba. Por eso el criterio real no
 * es el `role`, es `ownSymbolPaths.has(ownPath)`: ¿este archivo declara ÉL
 * MISMO ese `symbolPath` exacto? Si sí, cualquier candidato en OTRO archivo
 * con el mismo `symbolPath` es el gemelo de árbol paralelo, no un uso — se
 * excluye sin importar el `role`. Si NO (el archivo que emite la referencia
 * no declara ese `symbolPath` — un USO real de un TERCERO, ver el test
 * "un USO real... sigue siendo candidato"), sigue siendo candidato: SÍ
 * podría ser un uso genuino a un nombre que por coincidencia comparte
 * `symbolPath` con la duplicación de árbol de OTRO archivo — no hay
 * evidencia de auto-referencia para excluirlo.
 *
 * Sin esta exclusión, `global-uniqueness` (etapa 8, no heurística,
 * provenance `resolved`) acepta trivialmente ese gemelo como si la
 * declaración "usara" algo — midió 10,0% de precisión en guava con el
 * dataset etiquetado original (30 aceptadas muestreadas, 27 exactamente
 * este patrón; gate-java/RESULTADO.md), peor que la ÚNICA etapa heurística
 * (`path-proximity`, 90,0%). El criterio se resuelve ACÁ, en la generación
 * de candidatos, no en la etapa 8: si el candidato nunca se genera, no
 * infla `candidates` ni las estadísticas por etapa con una fila que nunca
 * tuvo un dueño real que resolver.
 */
/** Lenguajes cuya gramática permite reabrir la MISMA declaración (mismo `symbolPath`) a través de archivos distintos — hoy sólo Ruby (`class Foo` repetido agrega métodos a la clase ya declarada). Cualquier otro lenguaje trata dos declaraciones con `symbolPath` completo idéntico en archivos distintos como duplicación de árbol, no como reapertura — ver el docstring de `buildCandidatesForFile` de arriba. */
const REOPENING_LANGUAGES = new Set(["ruby"]);

function allowsDeclarationReopening(language: string): boolean {
  return REOPENING_LANGUAGES.has(language);
}

/**
 * Clave de posición dentro de UN archivo — ver "AUTO-REFERENCIA" en el
 * docstring de `buildCandidatesForFile`. `SymbolFacts.nameLine`/`nameColumn`
 * y `ReferenceFacts.line`/`column` salen las dos del `startPosition` del nodo
 * de la gramática con la MISMA convención (línea 1-based, columna 0-based),
 * así que la comparación es exacta y no necesita tolerancia.
 */
function declSitePosKey(line: number, column: number): string {
  return `${line}:${column}`;
}

/**
 * El cuerpo de `buildCandidates` para UN solo archivo — extraído sin cambiar
 * una línea de lógica (P2: `buildGraphIncremental` más abajo necesita poder
 * pedir "los candidatos de ESTE archivo" sin pagar por los demás; `buildGraph`/
 * `buildCandidates` de arriba siguen siendo el mismo bucle `for` de siempre,
 * ahora factorizado en esta función, aplicado a cada archivo por turno — el
 * resultado agregado es byte-idéntico al de antes de este refactor).
 */
/**
 * GRAFO#1 — MIEMBRO HEREDADO DEL GEMELO DE ÁRBOL PARALELO (residual de la
 * exclusión de arriba). La exclusión `sameSymbolPath && selfDeclaresThisPath`
 * sólo dispara cuando el sitio de referencia nombra EXACTAMENTE el mismo
 * `symbolPath` que este archivo ya declara — el caso de una AUTO-referencia
 * (una clase que se nombra a sí misma, un método que se llama a sí mismo por
 * nombre desnudo). Para un MIEMBRO HEREDADO falla: repro real medido en el
 * corpus de guava — `android/.../ImmutableList.java`'s `Builder.build()`
 * referencia `size` (bare, sin calificador — un campo heredado, no propio):
 * la jerarquía diverge entre árboles (android: `Builder extends
 * ImmutableCollection.ArrayBasedBuilder`, que declara `size` en OTRO
 * archivo, `ImmutableCollection.java`; jre: `Builder extends
 * ImmutableCollection.Builder` pero declara `private int size` DIRECTO
 * dentro de `ImmutableList.java`'s propio `Builder`), así que `ownSymbolPaths`
 * (que sólo mira símbolos QUE ESTE ARCHIVO declara) nunca contiene
 * "ImmutableList.Builder.size" — android no lo declara, lo hereda — y la
 * exclusión de arriba nunca dispara. Sin ninguna otra guarda, `qualified-name`
 * (N1-b, resolve.ts) trata "ImmutableList.Builder" como el MISMO namespace
 * léxico en ambos archivos (coincide por NOMBRE, no por archivo — no hay
 * noción de herencia real acá) y ACEPTA el gemelo del árbol `jre` como si
 * fuera el campo propio de `android` — verificado byte a byte contra el
 * corpus: la arista `sym:android/.../ImmutableList.java#Builder.build ->
 * sym:guava/.../ImmutableList.java#Builder.size` existe hoy, `resolvedBy:
 * "global-uniqueness"`, `provenance: "resolved"` (repro en
 * `build.test.ts`, describe "GRAFO#1").
 *
 * LA GENERALIZACIÓN: en vez de exigir que `ownPath` completo (scope + name
 * de LA referencia) coincida con un symbolPath propio, se busca el
 * CONTENEDOR ANCESTRO más próximo de `ref.scope` que ESTE archivo declare
 * (p.ej. "ImmutableList.Builder", el propio `Builder` donde vive el sitio de
 * uso) y se pregunta: ¿algún OTRO archivo declara ese MISMO contenedor,
 * símbolo por símbolo idéntico? Si sí, ES el gemelo de árbol paralelo de
 * ESE contenedor — cualquier candidato que ese archivo aporte para esta
 * referencia se excluye, sin importar si el nombre puntual (`size`) es un
 * miembro propio o heredado del contenedor. Recorre TODOS los prefijos de
 * `ref.scope` (no sólo el más próximo) porque más de un nivel puede tener
 * gemelo (la clase Y el método declarante, por ejemplo) — cualquiera basta
 * para marcar el archivo como gemelo.
 */
/**
 * GUARDIÁN OLA P (grupo grafo) — arreglado el PIDO #1 de `P1.md`, el más caro
 * que encontró: un NAMESPACE/paquete NO es un "gemelo de árbol paralelo" por
 * el solo hecho de que dos archivos lo compartan — es una agrupación léxica
 * que decenas o cientos de archivos declaran legítimamente a la vez, sin
 * duplicar nada. El gemelo de verdad (el caso que este mecanismo existe para
 * cazar, ver el docstring de arriba) es la misma JERARQUÍA DE TIPO repetida
 * byte a byte en otro árbol (`guava/` vs `android/guava/`); eso es
 * `family === "class-like"`, nunca `"namespace-like"`.
 *
 * Sin este filtro, en C#/Java — donde `symbolPath[0]` es el namespace/paquete
 * declarado por el archivo, no la clase — CUALQUIER referencia con receptor
 * (`o.Metodo()`) hacía que "los gemelos" fueran TODOS los archivos del mismo
 * namespace, y `buildCandidatesForFile` los excluía a todos: cero candidatos,
 * nunca una arista, ni firme ni ambigua. Repro medido por P1, verificado acá
 * con un repo mínimo de 2 archivos (`o.ReadTokenFrom(...)` en `JObject.cs`,
 * declarado en `JContainer.cs`, mismo namespace `Newtonsoft.Json.Linq`): ANTES
 * de este filtro, cero aristas `references`; DESPUÉS, la arista existe.
 *
 * El filtro es sobre la declaración QUE ESTE ARCHIVO tiene de `containerPath`
 * (`factsByKey`, ya indexado por `(file, symbolPath)`): si es `"namespace-like"`
 * el prefijo NO cuenta como contenedor gemelo-able y se sigue probando el
 * prefijo más corto — el mecanismo de clase real, más abajo en la pila de
 * `scope`, sigue intacto.
 */
function twinFilesForScope(
  file: string,
  scope: readonly string[],
  ownSymbolPaths: ReadonlySet<string>,
  filesBySymbolPath: ReadonlyMap<string, ReadonlySet<string>>,
  factsByKey: ReadonlyMap<string, SymbolFacts>,
): ReadonlySet<string> | null {
  let twins: Set<string> | null = null;
  for (let len = scope.length; len >= 1; len--) {
    const containerPath = scope.slice(0, len).join(".");
    if (!ownSymbolPaths.has(containerPath)) continue; // no es un contenedor que ESTE archivo declare — no aplica
    const ownDecl = factsByKey.get(`${file}#${containerPath}`);
    if (ownDecl?.family === "namespace-like") continue; // agrupación léxica, no jerarquía duplicable — ver docstring
    const owners = filesBySymbolPath.get(containerPath);
    if (!owners) continue;
    for (const owner of owners) {
      if (owner === file) continue;
      twins ??= new Set();
      twins.add(owner);
    }
  }
  return twins;
}

function buildCandidatesForFile(
  f: GraphFileFacts,
  byName: ReadonlyMap<string, readonly SymbolRef[]>,
  filesBySymbolPath: ReadonlyMap<string, ReadonlySet<string>>,
  factsByKey: ReadonlyMap<string, SymbolFacts>,
): ResolutionCandidate[] {
  const candidates: ResolutionCandidate[] = [];
  const reopeningAllowed = allowsDeclarationReopening(f.language);
  // Todo `symbolPath` que ESTE archivo declara — el criterio del gemelo de
  // árbol paralelo (ver el docstring de arriba), generalizado a cualquier
  // `role`: "¿este archivo declara ÉL MISMO ese symbolPath exacto?", no
  // "¿es esta referencia un decl-name?". Barato: una pasada de `f.symbols`.
  const ownSymbolPaths = new Set(f.symbols.map((s) => symbolPathOf(s).join(".")));
  // Ola P (P2) — DÓNDE está escrito el nombre de cada declaración de este
  // archivo, no sólo QUÉ declara. Ver `declSitePosKey` y el bloque
  // "AUTO-REFERENCIA" del docstring de arriba: sin la posición, "la
  // referencia ES la declaración" y "la referencia USA la declaración" son
  // indistinguibles, y el archivo entero se quedaba sin ninguna de las dos.
  const declSitesByPath = new Map<string, Set<string>>();
  for (const s of f.symbols) {
    const key = symbolPathOf(s).join(".");
    let set = declSitesByPath.get(key);
    if (!set) {
      set = new Set();
      declSitesByPath.set(key, set);
    }
    set.add(declSitePosKey(s.nameLine, s.nameColumn));
  }
  for (const ref of f.references) {
    const ownPath = [...ref.scope, ref.name].join(".");
    const all = byName.get(ref.name) ?? [];
    const selfDeclaresThisPath = ownSymbolPaths.has(ownPath);
    // ¿Este sitio de referencia ES el token de nombre de esa declaración?
    const atOwnDeclSite = declSitesByPath.get(ownPath)?.has(declSitePosKey(ref.line, ref.column)) ?? false;
    // GRAFO#1 (ver docstring de `twinFilesForScope`): archivos gemelo del
    // CONTENEDOR de este sitio de referencia — cubre miembros heredados,
    // no sólo auto-referencias del symbolPath completo. `null` en lenguajes
    // de reapertura (mismo criterio que la exclusión de abajo).
    const scopeTwinFiles = reopeningAllowed ? null : twinFilesForScope(f.path, ref.scope, ownSymbolPaths, filesBySymbolPath, factsByKey);
    const targets = all.filter((t) => {
      const sameSymbolPath = t.symbolPath.join(".") === ownPath;
      // AUTO-REFERENCIA, mismo archivo: se excluye SÓLO el sitio que ES la
      // declaración (su token de nombre, comparado por posición) — ver el
      // bloque "AUTO-REFERENCIA" del docstring de esta función. Un USO del
      // mismo símbolo en el mismo archivo, en el mismo scope, SÍ es candidato.
      if (t.file === f.path) return !(sameSymbolPath && atOwnDeclSite);
      // Gemelo de árbol paralelo: mismo symbolPath completo en OTRO archivo,
      // Y el archivo que emite la referencia declara ÉL MISMO ese symbolPath
      // exacto (auto-referencia, sin importar qué `role` le haya tocado) —
      // sólo excluible en un lenguaje que no permite reapertura. Ver el
      // docstring de esta función más arriba para por qué ya no se mira
      // `ref.role === "decl-name"`.
      if (sameSymbolPath && selfDeclaresThisPath && !reopeningAllowed) return false;
      // GRAFO#1: el archivo candidato es gemelo del CONTENEDOR de este sitio
      // de referencia (aunque `t.symbolPath` no coincida con `ownPath`) —
      // ver `twinFilesForScope`.
      if (scopeTwinFiles?.has(t.file)) return false;
      return true;
    });
    if (targets.length === 0) continue;
    candidates.push({ id: candidateId(f.path, ref), from: { file: f.path, ref }, targets });
  }
  return candidates;
}

export function buildCandidates(
  files: readonly GraphFileFacts[],
  index?: ReturnType<typeof buildIndex>,
): readonly ResolutionCandidate[] {
  const { byName, filesBySymbolPath, factsByKey } = index ?? buildIndex(files);
  const candidates: ResolutionCandidate[] = [];
  for (const f of files) candidates.push(...buildCandidatesForFile(f, byName, filesBySymbolPath, factsByKey));
  return candidates;
}

/**
 * CONTRATO-F8G.md §3.1 — la arista `calls` sale de la MISMA cascada que
 * `references`, partiendo los candidatos en dos listas DISJUNTAS (callee /
 * no-callee) UNA sola vez, antes de que ninguna corra `resolveReferences` —
 * el precedente exacto que este archivo ya usa para las 5 aristas tipadas
 * (`relabelKind`). Leyendo `ref.isCallee ?? false`: hoy `isCallee` es
 * siempre `undefined` (F1, `graph/references.ts`, no llegó todavía en este
 * commit), así que `callee` sale SIEMPRE vacío y `nonCallee` es EXACTAMENTE
 * el mismo conjunto que antes de esta ola — cero aristas `calls` nuevas,
 * cero cambio en `references`, hasta que F1 empiece a producir `isCallee`.
 */
function partitionCandidatesByCallee(candidates: readonly ResolutionCandidate[]): {
  readonly callee: ResolutionCandidate[];
  readonly nonCallee: ResolutionCandidate[];
} {
  const callee: ResolutionCandidate[] = [];
  const nonCallee: ResolutionCandidate[] = [];
  for (const c of candidates) {
    if (c.from.ref.isCallee ?? false) callee.push(c);
    else nonCallee.push(c);
  }
  return { callee, nonCallee };
}

/* ════════════════════════════════════════════════════════════════════════
 * LA ARIDAD POR SITIO DE LLAMADA — Ola P (P2), pedido de N6 abierto desde la
 * Ola O. Ver `CodeGraphEdge.callArities` (`graph/types.ts`) para QUÉ es y
 * `ReferenceFacts.argCounts` (`graph/references.ts`) para de dónde sale.
 *
 * SE PEGA DESPUÉS, SOBRE EL GRAFO YA RESUELTO, no dentro de la cascada — y
 * eso no es una comodidad, es lo único correcto: la arista que sale de
 * `resolveReferences` ya colapsó todos los sitios de un mismo contenedor
 * hacia un mismo destino (`weight`), así que el dato pertenece a la arista
 * final, no a un candidato individual. Mismo patrón que `deriveSatisfiesEdges`
 * /`deriveCarriesEdges`, que también son post-grafo.
 *
 * EL EMPALME ES EXACTO, no aproximado. Una arista `references`/`calls` nace
 * de un candidato cuyo `targets` salió de `byName.get(ref.name)`: el ÚLTIMO
 * segmento del `symbolPath` del destino es, por construcción, el `ref.name`
 * del sitio de uso. Y el `from` de la arista es `symbolNodeId(file,
 * ref.scope)`. Así que `(from, último segmento de to)` identifica el mismo
 * conjunto de sitios que la arista colapsó, sin heurística: se agrupan los
 * `argCounts` de las `ReferenceFacts` crudas por esa misma clave y se unen.
 *
 * LÍMITE DECLARADO: dos referencias del MISMO contenedor al MISMO nombre que
 * resuelven a destinos DISTINTOS (dos archivos con un homónimo) comparten la
 * clave y por lo tanto comparten el conjunto de aridades — es una unión de
 * más, nunca de menos. Es el precio de que la arista no recuerde de qué sitio
 * exacto nació; se declara acá en vez de fingir precisión.
 * ════════════════════════════════════════════════════════════════════════ */

/** Última componente del `symbolPath` de un nodo — el `ref.name` que lo eligió como destino. Ver el bloque de arriba. */
function callSiteArityKey(fromId: string, name: string): string {
  return `${fromId}\0${name}`;
}

function collectCallSiteArities(files: readonly GraphFileFacts[]): ReadonlyMap<string, readonly number[]> {
  const byKey = new Map<string, number[]>();
  for (const f of files) {
    for (const ref of f.references) {
      if (!ref.argCounts || ref.argCounts.length === 0) continue;
      const key = callSiteArityKey(symbolNodeId(f.path, ref.scope), ref.name);
      let acc = byKey.get(key);
      if (!acc) {
        acc = [];
        byKey.set(key, acc);
      }
      for (const n of ref.argCounts) if (!acc.includes(n)) acc.push(n);
    }
  }
  for (const acc of byKey.values()) acc.sort((a, b) => a - b);
  return byKey;
}

/**
 * Devuelve las aristas con `callArities` puesto donde hay evidencia. NO toca
 * ninguna otra arista ni ningún otro campo: una arista sin sitio de llamada
 * conocido sale IDÉNTICA (misma referencia de objeto), así que un grafo sin
 * `argCounts` en sus `ReferenceFacts` (facts armados a mano en un test, o
 * cualquier caller de antes de esta ola) es byte-idéntico al de antes.
 */
function withCallSiteArities(
  edges: readonly CodeGraphEdge[],
  nodes: readonly CodeGraphNode[],
  arities: ReadonlyMap<string, readonly number[]>,
): readonly CodeGraphEdge[] {
  if (arities.size === 0) return edges;
  const nameByNodeId = new Map<string, string>();
  for (const n of nodes) {
    const last = n.symbolPath[n.symbolPath.length - 1];
    if (last !== undefined) nameByNodeId.set(n.id, last);
  }
  return edges.map((e) => {
    if (e.kind !== "references" && e.kind !== "calls") return e;
    const name = nameByNodeId.get(e.to);
    if (name === undefined) return e;
    const found = arities.get(callSiteArityKey(e.from, name));
    return found ? { ...e, callArities: found } : e;
  });
}

/** Cada segmento de directorio de `filePath`, acumulado ("a", "a/b", "a/b/c" para "a/b/c/file.rb"). */
function folderChain(filePath: string): readonly string[] {
  const segments = filePath.split("/");
  segments.pop(); // el nombre de archivo, no es carpeta
  const chain: string[] = [];
  let cur = "";
  for (const seg of segments) {
    cur = cur ? `${cur}/${seg}` : seg;
    chain.push(cur);
  }
  return chain;
}

/**
 * `contains` para UN solo archivo (su cadena de carpetas, su nodo de archivo,
 * sus símbolos anidados) — extraído sin cambiar la lógica, por la misma
 * razón que `buildCandidatesForFile`. Es una función PURA de `f` sola: nada
 * de lo que emite depende de qué otros archivos existen, así que el
 * resultado para un archivo que no cambió es válido para siempre, sin
 * importar qué más cambió en el resto del repo — la propiedad exacta que
 * `buildGraphIncremental` necesita para poder reusarlo.
 *
 * OJO — no deduplica entre archivos (ni falta que hace): dos archivos bajo
 * la misma carpeta cada uno agrega SU PROPIA arista `contains` carpeta→
 * subcarpeta cuando recorre su propia cadena — exactamente lo que el
 * `buildNodesAndContains` de abajo (y por lo tanto `buildGraph`) ya hacía
 * ANTES de este refactor (`addContains` nunca comprobó duplicados, sólo
 * `addNode` lo hace, vía `seenFolderIds`/`seenNodeIds`, y ese chequeo era
 * puramente sobre el NODO, nunca sobre la arista). Medido en el corpus de
 * guava/611 archivos: 19 590 aristas `contains` totales contra 17 697 pares
 * `(from,to)` únicos — la brecha es esta duplicación PRE-EXISTENTE, no algo
 * que este refactor introduce. `buildGraphIncremental` reproduce el mismo
 * conteo a propósito (ver `assembleGraph`) para que su salida sea IDÉNTICA a
 * la de `buildGraph`, no una versión "corregida" — corregir esa duplicación
 * sería un cambio de comportamiento, fuera del alcance de esta tarea
 * (P2 es de RENDIMIENTO, no de comportamiento).
 */
function buildNodesAndContainsForFile(f: GraphFileFacts): {
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
} {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const seenNodeIds = new Set<string>();

  const addNode = (n: CodeGraphNode): void => {
    if (seenNodeIds.has(n.id)) return;
    seenNodeIds.add(n.id);
    nodes.push(n);
  };
  const addContains = (from: string, to: string): void => {
    edges.push({ from, to, kind: "contains", provenance: "declared", weight: 1 });
  };

  let prevFolder: string | null = null;
  for (const folder of folderChain(f.path)) {
    const id = folderNodeId(folder);
    addNode({ id, kind: "folder", file: folder, symbolPath: [] });
    if (prevFolder) addContains(folderNodeId(prevFolder), id);
    prevFolder = folder;
  }

  const fileId = fileNodeId(f.path);
  addNode({ id: fileId, kind: "file", file: f.path, symbolPath: [] });
  if (prevFolder) addContains(folderNodeId(prevFolder), fileId);

  // Hermanos homónimos: la PRIMERA aparición de un `symbolPath` completo
  // se queda con el id canónico (sin sufijo — es el que toda arista
  // `references` apunta, ver `types.ts`); la 2ª+ recibe `@2`, `@3`, ... por
  // orden de aparición, igual que `Anchor.ordinal` desempata hermanos. Ya
  // era per-archivo ANTES de este refactor (`occurrenceCount` se declaraba
  // dentro del bucle `for (const f of files)`, nunca a nivel de repo), así
  // que aislar esta función a un solo archivo no cambia el desempate.
  const occurrenceCount = new Map<string, number>();
  for (const s of f.symbols) {
    const symbolPath = symbolPathOf(s);
    const joined = symbolPath.join(".");
    const n = (occurrenceCount.get(joined) ?? 0) + 1;
    occurrenceCount.set(joined, n);
    const canonicalId = symbolNodeId(f.path, symbolPath);
    const id = n === 1 ? canonicalId : `${canonicalId}@${n}`;
    addNode({
      id,
      kind: "symbol",
      file: f.path,
      symbolPath,
      family: s.family,
      startLine: s.startLine,
      endLine: s.endLine,
      // CONTRATO-F8G.md §2.1 — copiado verbatim desde `SymbolFacts`.
      // `undefined` hoy (F2 no llegó todavía en este commit): comportamiento
      // idéntico al de antes de esta ola bajo `toEqual` (que ignora
      // propiedades `undefined`).
      arity: s.arity,
      // Ola U (C2), HUECO DE GRAFO #2 — cuarto hecho de `SymbolFacts` que se
      // quedaba del lado de la extracción sin llegar nunca al nodo. Copiado
      // VERBATIM, igual que `arity`/`visibility`: este módulo no lo normaliza
      // ni lo interpreta (ver su docstring en `graph/types.ts`).
      returnType: s.returnType,
      visibility: s.visibility,
      // Ola P (P2) — los dos hechos que `SymbolFacts` ya calculaba y que se
      // quedaban del lado de la extracción sin llegar nunca al nodo. Copiado
      // VERBATIM, igual que `arity`/`visibility` de arriba: este módulo no
      // reinterpreta ninguno de los dos (ver sus docstrings en
      // `graph/types.ts` y `graph/symbols.ts`).
      memberOfClassLike: s.memberOfClassLike,
      exported: s.exported,
      // Ola S (S1) — tercer hecho de `SymbolFacts` que se quedaba del lado de
      // la extracción. Copiado VERBATIM, igual que los dos de arriba: este
      // módulo no lo normaliza ni lo interpreta (ver su docstring en
      // `graph/types.ts`).
      nodeType: s.nodeType,
      shapeNodeType: s.shapeNodeType,
    });
    const parentId = s.container.length === 0 ? fileId : symbolNodeId(f.path, s.container);
    addContains(parentId, id);
  }

  // Ola R (R1) — `declares-type`: los nodos `carrier` de cada SITIO DE
  // DECLARACIÓN con tipo escrito. Puramente intra-archivo (`declaredTypeForm`
  // depende sólo de lo que ESTE archivo escribió; si el nombre resuelve o no
  // es una pregunta de repo completo y vive en la ARISTA), así que entra en
  // la misma función per-archivo que `buildGraphIncremental` ya cachea, sin
  // ampliar la regla de invalidación.
  //
  // ANTES que el bloque de `portador.ts` de abajo A PROPÓSITO: los dos
  // materializan nodos `carrier` con el MISMO id para un campo/local
  // nombrado (`portadorCarrierId`, ordinal 0 — la convergencia es el punto:
  // `invokes-indirect` lleva del método al portador y `declares-type` lleva
  // del portador a la clase), y `addNode` se queda con el PRIMERO. El de acá
  // trae `declaredTypeForm` además de `carrierForm`, así que tiene que ganar;
  // `carrierForm` coincide en los dos para los casos que se solapan
  // (`field`/`local`), y las tres formas POSICIONALES de `portador.ts`
  // (`map-value`/`collection-element`/`argument`) tienen ids que este módulo
  // nunca produce.
  if (f.edges && f.edges.length > 0) {
    for (const n of materializeTypeDeclNodes(f.path, f.edges)) addNode(n);
  }

  // CONTRATO-F9.md §3.3 forma 2 (`graph/edges/portador.ts`) — puramente
  // intra-archivo (un literal function-like nace y se usa en el mismo
  // archivo), así que encaja en la MISMA función per-archivo que ya cachea
  // `buildGraphIncremental`, sin ampliar la regla de invalidación.
  if (f.carrierFacts && f.carrierFacts.length > 0) {
    const materialized = materializeCarrierFacts(f.path, f.carrierFacts);
    for (const n of materialized.nodes) addNode(n);
    edges.push(...materialized.edges);
  }

  return { nodes, edges };
}

function buildNodesAndContains(files: readonly GraphFileFacts[]): {
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
} {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const seenNodeIds = new Set<string>();

  for (const f of files) {
    const perFile = buildNodesAndContainsForFile(f);
    for (const n of perFile.nodes) {
      if (seenNodeIds.has(n.id)) continue;
      seenNodeIds.add(n.id);
      nodes.push(n);
    }
    edges.push(...perFile.edges);
  }

  return { nodes, edges };
}

/* ════════════════════════════════════════════════════════════════════════
 * P4 — EDGE_EXTRACTORS, del lado consumidor: `EdgeFacts` (crudo, `toName` +
 * `toQualifier` SIN resolver) → `CodeGraphEdge` tipado (`extends`/
 * `implements`/`instantiates`/`mixes-in`/`satisfies`/`imports`).
 *
 * DOS mecanismos de resolución distintos, porque apuntan a DOS cosas
 * distintas (CONTRATO-F4.md §2.5, "nadie escribe un segundo resolutor"):
 *
 *   A. Las 5 aristas que apuntan a un SÍMBOLO (`extends`/`implements`/
 *      `instantiates`/`mixes-in`/`satisfies`): se resuelven REUSANDO,
 *      literalmente, la misma `resolveReferences`/`ALL_STAGES` de
 *      `resolve.ts` que ya resuelve `references` — sin tocar ese archivo
 *      (fuera de esta tarea). El truco: se arma un `ResolutionCandidate`
 *      sintético cuyo `ReferenceSite.ref` es una `ReferenceFacts` fabricada
 *      con `role: "bare"` y `scope: fromPath` — la MISMA forma que produciría
 *      una referencia real escrita en la posición del símbolo declarante, así
 *      que la cascada entera (rol, sombra, miembro-de-clase, namespace,
 *      unicidad global, proximidad de path) aplica sin cambios. `resolve.ts`
 *      graba `kind: "references"` en TODA arista que acepta (línea fija, no
 *      parametrizable sin tocar ese archivo) — por eso cada `EdgeKind` se
 *      resuelve en su PROPIA llamada a `resolveReferences` (nunca mezclado
 *      con otro kind ni con `references`) y el resultado completo de esa
 *      llamada se re-etiqueta con el `kind` real después: 100% de lo que
 *      devuelve una llamada pertenece a un solo kind, así que el remapeo es
 *      seguro. `toQualifier` (si no está vacío) viaja como `role: "qualified"`
 *      + `qualifier: toQualifier.join(".")` — la MISMA forma que produciría
 *      una referencia calificada real (`splitQualifierText` en `resolve.ts`
 *      separa por `::`/`.` indistintamente, así que el join con `"."` hace un
 *      roundtrip limpio) — para que la etapa `qualified-name` (visibilidad
 *      por namespace léxico, la MISMA que ya usan las referencias reales) sea
 *      quien decida, en vez de un segundo filtro de calificador escrito acá
 *      con sus propias reglas de visibilidad — que podrían no coincidir con
 *      las de `resolve.ts` (un filtro local ingenuo por "el contenedor del
 *      candidato termina con el calificador" rechaza, por ejemplo, un
 *      calificador que nombra sólo el segmento INTERNO de un namespace más
 *      profundo, caso que `isVisibleFrom` sí contempla vía `isSuffix`/
 *      `isPrefix`). "Nadie escribe un segundo resolutor" (CONTRATO-F4.md
 *      §2.5) aplica también acá, no sólo a la cascada completa.
 *
 *   B. `imports` apunta a un ARCHIVO, no a un símbolo — `toName` es la ruta
 *      cruda del especificador tal como se escribió (`imports.ts`'s propio
 *      docstring: "Resolver ese texto a un archivo del repo... es trabajo de
 *      integración de build.ts"). La cascada de nombre-de-símbolo no aplica
 *      acá; se resuelve por separado, sólo especificadores RELATIVOS
 *      (`./`/`../`) contra el conjunto de rutas conocidas de esta corrida —
 *      un paquete/módulo externo (`"lodash"`, `java.util.List`) no tiene
 *      archivo en el repo que resolver y NO se intenta adivinar uno. NUNCA
 *      cacheado por archivo en `buildGraphIncremental` (a diferencia de A):
 *      depende del CONJUNTO de archivos, no de qué declara cada uno, así que
 *      cachearlo por archivo pediría una regla de invalidación nueva
 *      (archivo agregado/borrado en CUALQUIER parte del repo ensucia TODO
 *      import relativo) que habría tocado el troceo ya probado de la
 *      resolución de `references`; se recalcula entero, siempre, en
 *      `assembleGraph` — barato: el volumen de `imports` es chico comparado
 *      con `references` (una arista por statement de import, no por uso).
 * ════════════════════════════════════════════════════════════════════════ */

/** Une el `EdgeKind` real de vuelta después de una llamada a `resolveReferences` (que graba `"references"` fijo) — ver el docstring de este bloque, punto A. */
function relabelKind(edges: readonly CodeGraphEdge[], kind: EdgeKind): CodeGraphEdge[] {
  return edges.map((e) => ({ ...e, kind }));
}

/**
 * Los `ResolutionCandidate` que UN archivo aporta para las 5 aristas
 * tipadas de símbolo, agrupados por `EdgeKind` — ver punto A arriba. `imports`
 * se descarta acá (se resuelve aparte, punto B) y todo `EdgeFacts` que no
 * coincide con lo que `EDGE_EXTRACTORS` declara para su propio
 * `extractorId` se descarta sin intentar traducirlo (`isTrustworthyEdgeFact`).
 */
function buildTypedEdgeCandidatesForFile(
  f: GraphFileFacts,
  byName: ReadonlyMap<string, readonly SymbolRef[]>,
): Map<EdgeKind, ResolutionCandidate[]> {
  const byKind = new Map<EdgeKind, ResolutionCandidate[]>();
  let idx = 0;
  for (const ef of f.edges ?? []) {
    if (ef.kind === "imports") continue;
    // Ola R (R1) — `declares-type` NO pasa por acá: su `from` es un nodo
    // `carrier` (no `symbolNodeId(file, fromPath)`), sus hechos sin destino
    // (primitivo/compuesto) no tienen nombre que resolver, y su colapso
    // multivaluado es propio. Lo resuelve `resolveDeclaresTypeEdges`.
    if (ef.kind === "declares-type") continue;
    if (!isTrustworthyEdgeFact(ef)) continue;
    idx++;
    // GUARDIÁN OLA P (grupo grafo) — PIDO #1 de P3.md: `buildCandidatesForFile`
    // excluye el candidato cuyo `(file, symbolPath)` ES el propio declarante
    // del sitio de uso (auto-referencia); esta función gemela, para las 5
    // aristas TIPADAS de símbolo (instantiates/extends/implements/satisfies/
    // carries), no lo hacía. Repro medido por P3: `click/_textwrap.py`
    // declara `class TextWrapper(textwrap.TextWrapper)` — el calificador
    // `textwrap` es ajeno al repo, la ÚNICA declaración del NOMBRE
    // `TextWrapper` dentro del repo es la propia clase, y sin este filtro la
    // cascada resolvía el candidato CONTRA SÍ MISMA: una arista `extends` de
    // un nodo a sí mismo (`"TextWrapper" tiene un único implementador:
    // "TextWrapper"`). Filtro por NODO, no por posición como el de
    // `buildCandidatesForFile`: acá no hay un "sitio de declaración" que
    // comparar — la relación es sobre el TIPO entero, no sobre un token — así
    // que el criterio correcto es "¿el candidato es el mismo nodo que quien
    // pregunta?", igual que las guardas de auto-bucle que P3 ya puso a mano
    // en sus dos consumidores (`edge.from === edge.to`), ahora en la raíz
    // para que el resto del catálogo que lee estas 5 aristas
    // (`parallel-hierarchies`, `inheritance-family`, `refused-bequest`…) las
    // reciba ya limpias.
    const fromNodeId = symbolNodeId(f.path, ef.fromPath);
    const targets = (byName.get(ef.toName) ?? []).filter((t) => symbolNodeId(t.file, t.symbolPath) !== fromNodeId);
    if (targets.length === 0) continue; // ver `buildCandidatesForFile`: sin dueño potencial, no entra a la cascada.
    const hasQualifier = ef.toQualifier.length > 0;
    const ref: ReferenceFacts = {
      name: ef.toName,
      role: hasQualifier ? "qualified" : "bare",
      scope: ef.fromPath,
      qualifier: hasQualifier ? ef.toQualifier.join(".") : null,
      qualifierIsBareConstant: false,
      shadowedLocally: false,
      line: ef.startLine,
      column: 0,
      occurrences: 1,
    };
    const site: ReferenceSite = { file: f.path, ref };
    const candidate: ResolutionCandidate = { id: `${f.path}::edge:${ef.kind}:${idx}:${ef.startLine}:${ef.endLine}`, from: site, targets };
    const list = byKind.get(ef.kind);
    if (list) list.push(candidate);
    else byKind.set(ef.kind, [candidate]);
  }
  return byKind;
}

/** Corre `resolveReferences` una vez POR `EdgeKind` (nunca mezclado — ver punto A) y re-etiqueta el resultado con el kind real. */
function resolveTypedEdgeCandidates(
  byKind: ReadonlyMap<EdgeKind, readonly ResolutionCandidate[]>,
  ctx: ResolutionContext,
  options: ResolveOptions | undefined,
): { readonly edges: readonly CodeGraphEdge[]; readonly stats: ResolutionStats } {
  const edgeLists: CodeGraphEdge[][] = [];
  const statsParts: ResolutionStats[] = [];
  for (const [kind, candidates] of byKind) {
    const { edges, stats } = resolveReferences(ALL_STAGES, candidates, ctx, options);
    edgeLists.push(relabelKind(edges, kind));
    statsParts.push(stats);
  }
  return { edges: edgeLists.flat(), stats: mergeResolutionStats(statsParts) };
}

/**
 * Ver punto B del bloque de arriba. Las cuatro funciones que hacían este
 * trabajo (`normalizeRelativeImport`/`matchKnownPath`/`resolveImportTarget`/
 * el cuerpo de resolución) viven ahora en `./imports-target.js`
 * (CONTRATO-F8G.md §7, F4) — extraídas VERBATIM, sin cambiar una línea de
 * su lógica. Lo único que se movió a ESTE archivo es el filtro de confianza
 * (`isTrustworthyEdgeFact`, que depende de `EDGE_EXTRACTORS` y ya vive acá
 * para las 5 aristas tipadas) — se aplica ANTES de llamar, así
 * `imports-target.ts` no necesita conocer el registro de extractores ni
 * duplicar ese chequeo. Todas las aristas `imports` resueltas del repo
 * COMPLETO — nunca cacheado por archivo, ver punto B.
 */
function trustedImportFacts(files: readonly GraphFileFacts[]): { readonly path: string; readonly edges: readonly EdgeFacts[] }[] {
  return files.map((f) => ({
    path: f.path,
    edges: (f.edges ?? []).filter((ef) => ef.kind === "imports" && isTrustworthyEdgeFact(ef)),
  }));
}

function resolveImportEdges(files: readonly GraphFileFacts[]): CodeGraphEdge[] {
  return resolveImportEdgesRaw(trustedImportFacts(files));
}

/**
 * Arma el grafo completo: `contains` (declared, siempre) + `references`
 * (resuelto por la cascada de `resolve.ts`) + las aristas tipadas de
 * `EDGE_EXTRACTORS` (P4 — ver el bloque de arriba; `undefined`/ausente en
 * `f.edges` de CUALQUIER archivo se comporta exactamente como antes de este
 * cambio, cero aristas nuevas) + `calls` (CONTRATO-F8G.md §3.1, partición
 * callee/no-callee de los MISMOS candidatos de `references` — cero aristas
 * nuevas hasta que F1 produzca `isCallee`) + `satisfies` derivado
 * (CONTRATO-F8G.md §3.2, `[]` hasta que F4 lo llene). `options` se propaga
 * tal cual a `resolveReferences` — el arnés del gate lo usa para pedir
 * `trace`; producción no lo pasa y no paga nada por eso.
 *
 * *** PUNTOS DE ENGANCHE, CONTRATO-F9.md §6 fila 11 (sin cuerpo, F0 sólo
 * deja la marca) — el mismo patrón que `satisfiesEdges` de abajo ya usa: ***
 *   - F3 (`carries`): una línea más en el array de `edges` de abajo,
 *     `deriveCarriesEdges(nodes, referenceEdges)` — mismo mecanismo que
 *     `deriveSatisfiesEdges`, sobre el grafo YA armado, sin AST (forma 1 del
 *     contrato). La forma 2 (`portador.ts`, literal function-like como
 *     valor) es un `EdgeExtractor` normal, se suma a `typedByKind` como
 *     cualquier arista tipada de arriba.
 *   - F4 (`invokes-indirect`): depende de F3 — mismo patrón, después.
 *   - F5 (`ambiguous`): la emisión vive DENTRO de `resolveReferences`
 *     (`graph/resolve.ts`, no este archivo — no está en la lista de
 *     archivos compartidos de esta ola), en la rama que hoy sólo incrementa
 *     `droppedAmbiguous` sin emitir arista. `mergeResolutionStats` de este
 *     archivo SÍ va a necesitar sumar los 2 campos nuevos de
 *     `ResolutionStats` (`ambiguousEdges`/`ambiguousOverflow`) cuando F5
 *     los empiece a poblar — hoy son opcionales y ausentes, así que
 *     `mergeResolutionStats` no necesita tocarse todavía (ver
 *     `graph/stages.ts`).
 * `assembleGraph` (más abajo, la mitad incremental) reproduce esta misma
 * lista de kinds a propósito — un enganche nuevo acá se replica ahí.
 */
export function buildGraph(files: readonly GraphFileFacts[], options?: ResolveOptions): CodeGraph {
  const { nodes, edges: containsEdges } = buildNodesAndContains(files);
  const index = buildIndex(files);
  const ctx = buildResolutionContext(files, index);
  const candidates = buildCandidates(files, index);
  const { callee, nonCallee } = partitionCandidatesByCallee(candidates);
  const { edges: referenceEdgesRaw, stats: referenceStats } = resolveReferences(ALL_STAGES, nonCallee, ctx, options);
  const { edges: callEdgesRaw, stats: callStats } = resolveReferences(ALL_STAGES, callee, ctx, options);
  // Ola P (P2) — ver el bloque "LA ARIDAD POR SITIO DE LLAMADA" más arriba.
  const callSiteArities = collectCallSiteArities(files);
  const referenceEdges = withCallSiteArities(referenceEdgesRaw, nodes, callSiteArities);
  const callEdges = withCallSiteArities(relabelKind(callEdgesRaw, "calls"), nodes, callSiteArities);

  const typedByKind = new Map<EdgeKind, ResolutionCandidate[]>();
  for (const f of files) {
    for (const [kind, list] of buildTypedEdgeCandidatesForFile(f, index.byName)) {
      const acc = typedByKind.get(kind);
      if (acc) acc.push(...list);
      else typedByKind.set(kind, list);
    }
  }
  const { edges: typedEdgesResueltas, stats: typedStats } = resolveTypedEdgeCandidates(typedByKind, ctx, options);
  // Ola R (R3) — LA REGLA MULTIVALUADA de `stores`, post-resolución: un binding
  // inicializado con dos orígenes distintos colapsa a UNA arista `ambiguous` con
  // los destinos en `alternatives`, nunca a un tipo. Va acá y no en el extractor
  // porque `EdgeFacts` no lleva destino resuelto y esta función descarta su
  // `provenance` a propósito (ver el punto A del bloque de arriba). No toca
  // ningún otro `kind`: sin `stores` multivaluado devuelve la lista tal cual.
  const typedEdges = markAmbiguousStores(typedEdgesResueltas);
  const importEdges = mergeEdges([resolveImportEdges(files)]);
  const satisfiesDerivacion = deriveSatisfiesEdges(nodes, containsEdges);
  const satisfiesEdges = satisfiesDerivacion.edges;
  // CONTRATO-F9.md §3 — `carries` forma 1/5 (post-grafo, sobre `referenceEdges` ya resueltas) y `invokes-indirect` forma 3(a)
  // (post-grafo, sobre `nodes`+`containsEdges`+las `ReferenceFacts` crudas de `files`) — mismo patrón que `satisfiesEdges` arriba.
  const carriesEdges = deriveCarriesEdges(nodes, referenceEdges);
  const invokesIndirect = deriveInvokesIndirectEdges(nodes, containsEdges, files, typedEdges);
  // Ola R (R1) — `declares-type`. Repo COMPLETO (la cascada necesita el
  // índice global de nombres), nunca cacheado por archivo; los NODOS sí son
  // per-archivo y ya los puso `buildNodesAndContainsForFile`.
  const declaresType = resolveDeclaresTypeEdges(files, ctx, options);

  return {
    nodes: [...nodes, ...invokesIndirect.nodes],
    edges: [...containsEdges, ...referenceEdges, ...typedEdges, ...importEdges, ...callEdges, ...satisfiesEdges, ...carriesEdges, ...invokesIndirect.edges, ...declaresType.edges],
    resolution: mergeResolutionStats([referenceStats, typedStats, callStats, ...(declaresType.stats ? [declaresType.stats] : [])]),
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * P2 — `buildGraphIncremental`: entrada parcial + no bloqueante.
 *
 * `buildGraph` de arriba queda con la MISMA firma y sigue 100% síncrona
 * (`graph/build.test.ts`/`resolve-gate.test.ts`, de otro paquete, la llaman
 * así y tienen que seguir en verde tal cual) — P4 le agregó aristas tipadas
 * cuando `GraphFileFacts.edges` viene poblado, pero para cualquier `files`
 * SIN ese campo (todo caller de hoy) la salida es byte-idéntica a antes.
 * Esto de acá es un camino NUEVO, en paralelo, para quien pueda ofrecer dos
 * cosas que `buildGraph` no pide pero que si están disponibles ahorran casi
 * todo el trabajo:
 *
 *   1. Un `GraphBuildCache` de la corrida ANTERIOR sobre (casi) el mismo
 *      árbol — lo que `graph/build.ts` mismo produjo la última vez.
 *   2. El conjunto de rutas cuyo CONTENIDO cambió desde esa corrida
 *      (`changed`) — en `code-inspector.ts` esto es exactamente `fresh`, la
 *      lista de archivos que `analyzeIncremental` re-parseó porque su hash
 *      de contenido no coincidía con lo cacheado; nunca hace falta
 *      recalcularlo acá, HASHEAR NADA acá sería la trampa que ya perdió
 *      tiempo en esta ola (ver la nota "CÓMO MEDIR" de la tarea).
 *
 * Sin (1) o sin (2) — `previous === null` o `changed === null` — este
 * módulo no tiene manera honesta de saber qué reusar, así que trata TODO
 * como recién llegado (mismo resultado que `buildGraph`, pagado en su
 * totalidad, pero TROCEADO — ver más abajo — nunca bloqueando de un tirón).
 *
 * ── LA REGLA DE INVALIDACIÓN, ESCRITA UNA SOLA VEZ ──────────────────────
 *
 * Un archivo que no cambió puede de todos modos necesitar que sus
 * candidatos/resolución se recalculen: si en OTRO archivo se agregó,
 * borró o modificó una declaración de un nombre X, entonces todo sitio de
 * referencia a X en TODO el repo (haya cambiado su archivo o no) necesita
 * ser re-evaluado, porque el conjunto de `targets` que ve la cascada para
 * ese nombre cambió. La garantía que este módulo ofrece, exacta:
 *
 *   Se recalculan los candidatos/resolución de un archivo F si Y SÓLO SI
 *   (a) F está en `changed` (o es nuevo — no estaba en `previous`), o
 *   (b) F tiene al menos una referencia a un nombre X tal que el conjunto
 *       de declaraciones de X — comparado como MULTICONJUNTO de firmas
 *       `(archivo, symbolPath, family, memberOfClassLike,
 *       namespaceContainerOnly, container)`, no sólo presencia/ausencia —
 *       difiere entre la corrida anterior y ésta.
 *
 * (b) sólo puede dispararse por un nombre declarado en un archivo agregado,
 * cambiado o ELIMINADO (un archivo que no cambió declara exactamente lo
 * mismo que declaraba antes) — así que `computeDirtyNames` sólo necesita
 * mirar los nombres que esos archivos declaraban ANTES o declaran AHORA,
 * nunca el vocabulario completo del repo. Esto cubre tanto "se agregó/borró
 * una declaración" como "una declaración existente cambió de forma" (un
 * método que pasó a ser una clase con el mismo nombre, por ejemplo): la
 * firma incluye las CUATRO propiedades que alguna etapa de la cascada mira
 * vía `ctx.symbol(t)` (`class-member`, `bare-constant-receiver`,
 * `namespace-container`, `qualified-name` — ver `resolve.ts`); `startLine`/
 * `endLine` quedan afuera a propósito porque ninguna etapa los consulta.
 *
 * Si mañana una etapa nueva empieza a mirar otro campo de `SymbolFacts` para
 * decidir, esa firma tiene que crecer con ese campo — de lo contrario esta
 * garantía deja de sostenerse silenciosamente. Documentado acá para que ese
 * día alguien lo encuentre buscando "declSignature".
 *
 * Si se prefiere otra estrategia, ésta es la que se implementó y ésta es la
 * garantía exacta que ofrece; no hay una anotación de "aproximado" porque no
 * lo es — es una invalidación exacta bajo el modelo de qué campos importan
 * para la resolución, no una heurística de "probablemente no cambió nada".
 *
 * ── NO BLOQUEANTE ────────────────────────────────────────────────────────
 *
 * Mismo espíritu que `code-analyzer.ts#yieldToEventLoop`/
 * `MAX_WALK_SLICE_MS` (no importado — ese archivo es de otro paquete esta
 * ola): un `Slicer` de tiempo de reloj cede el control (`setImmediate`)
 * cada `INCREMENTAL_YIELD_BUDGET_MS` de trabajo síncrono acumulado, y se
 * consulta entre cada archivo procesado Y, dentro de un archivo con muchos
 * candidatos, entre cada lote de `CANDIDATE_BATCH_SIZE` — para que ni un
 * repo enorme en frío ni un solo archivo-hub con fan-out extremo puedan
 * monopolizar el event loop de punta a punta.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Umbral de troceo, en milisegundos de reloj — NO calibrado contra ningún
 * repo de usuario (regla dura de esta ola), sólo elegido para que ceder sea
 * frecuente sin que el overhead de `setImmediate` domine. Igual que
 * `SFC_FANOUT_CAP` en `resolve.ts`, queda fuera del alcance mecánico de
 * `lexicon-inventory.json` (ese inventario sólo escanea 7 archivos fijos,
 * ninguno bajo `graph/`) — reportado al integrador, no escondido.
 */
const INCREMENTAL_YIELD_BUDGET_MS = 8;

/**
 * Tope de candidatos por lote dentro de UN archivo antes de ceder — defensa
 * adicional contra el caso, NO patológico sino real (medido en guava: un
 * archivo como `Synchronized.java` trae 1511 candidatos y sin este corte
 * bloquea ~78 ms de un solo tirón, casi 10x el presupuesto de
 * `INCREMENTAL_YIELD_BUDGET_MS`), de un solo archivo-hub con muchos sitios
 * de referencia — el chequeo de reloj entre archivos no alcanza a cortarlo
 * porque la llamada a `resolveReferences` para ESE archivo es, en sí misma,
 * un solo tramo síncrono. Elegido para que un lote típico (medido: ~0,05 ms
 * por candidato en ese mismo archivo hub) quede bien por debajo del
 * presupuesto de cesión. Mismo comentario que `INCREMENTAL_YIELD_BUDGET_MS`:
 * umbral nuevo, no calibrado contra ningún repo de usuario, reportado.
 */
const CANDIDATE_BATCH_SIZE = 250;

/** Ver el docstring de `yieldToEventLoop` en `code-analyzer.ts` (no importado, otro paquete) — misma idea, misma implementación. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Reloj de troceo: cede sólo cuando pasó `budgetMs` desde la última cesión (o desde que se creó). */
function createSlicer(budgetMs: number): () => Promise<void> {
  let sliceStart = performance.now();
  return async () => {
    if (performance.now() - sliceStart < budgetMs) return;
    await yieldToEventLoop();
    sliceStart = performance.now();
  };
}

/** Recorre `items` cediendo (vía `yieldCheck`, que sólo cede de verdad si tocó el presupuesto) después de cada uno. */
async function forEachChunked<T>(
  items: readonly T[],
  yieldCheck: () => Promise<void>,
  fn: (item: T) => void | Promise<void>,
): Promise<void> {
  for (const item of items) {
    await fn(item);
    await yieldCheck();
  }
}

/**
 * El estado que una corrida de `buildGraphIncremental` deja para la
 * siguiente — SÓLO EN MEMORIA (no viaja a sqlite: `code-inspector.ts` lo
 * guarda una vez por proceso, keyed por `repoKey`; un reinicio del proceso
 * simplemente cae al camino frío, troceado igual, nunca a un resultado
 * incorrecto). Nada de esto es opaco desde afuera de este módulo: sólo
 * `graph/build.ts` construye y lee un `GraphBuildCache`.
 */
export interface GraphBuildCache {
  /** El `GraphFileFacts` completo de cada archivo de la corrida anterior — hace falta para saber qué declaraba un archivo ANTES de cambiar/desaparecer. */
  readonly filesByPath: ReadonlyMap<string, GraphFileFacts>;
  /** El índice global (nombre → declaraciones) de la corrida anterior. */
  readonly index: {
    readonly byName: ReadonlyMap<string, readonly SymbolRef[]>;
    readonly factsByKey: ReadonlyMap<string, SymbolFacts>;
    readonly filesBySymbolPath: ReadonlyMap<string, ReadonlySet<string>>;
  };
  /** `contains` de cada archivo — depende SÓLO de ese archivo (ver el docstring de `buildNodesAndContainsForFile`), así que es válido reusar mientras el archivo no haya cambiado. */
  readonly nodesByFile: ReadonlyMap<string, { readonly nodes: readonly CodeGraphNode[]; readonly edges: readonly CodeGraphEdge[] }>;
  /** Candidatos + aristas `references` + estadísticas QUE ESTE ARCHIVO APORTÓ — reusable mientras ni el archivo ni ningún nombre que referencia haya cambiado. */
  readonly resolutionByFile: ReadonlyMap<string, FileResolution>;
}

/** La contribución de UN archivo a la cascada de resolución — ver `GraphBuildCache.resolutionByFile`. */
export interface FileResolution {
  readonly candidates: readonly ResolutionCandidate[];
  readonly edges: readonly CodeGraphEdge[];
  readonly stats: ResolutionStats;
  /**
   * P4 — aristas TIPADAS (`extends`/`implements`/`instantiates`/`mixes-in`/
   * `satisfies`) que ESTE archivo aporta como declarante (`EdgeFacts.fromPath`).
   * Comparte EXACTAMENTE la misma regla de invalidación que `edges`/`stats`
   * de arriba (depende de `byName` repo-completo, no sólo de este archivo) —
   * `dirtyForResolution` en `buildGraphIncremental` ya lo considera. `imports`
   * NUNCA vive acá: se resuelve aparte, sin cachear, en `assembleGraph` (ver
   * el bloque P4 antes de `buildGraph`).
   */
  readonly typedEdges: readonly CodeGraphEdge[];
  readonly typedStats: ResolutionStats;
  /**
   * NUEVO — CONTRATO-F8G.md §3.1. Aristas `calls` que ESTE archivo aporta
   * como llamante — misma partición callee/no-callee de `candidates` de
   * arriba, misma regla de invalidación (depende de `byName` repo-completo).
   * Vacío hasta que F1 produzca `ReferenceFacts.isCallee`.
   */
  readonly callEdges: readonly CodeGraphEdge[];
  readonly callStats: ResolutionStats;
}

/**
 * Un archivo dentro de `buildIndex`/`buildIndexAsync` — extraído a una
 * función de verdad (con un `for` de verdad adentro) a propósito: el
 * `continue` original salta al SIGUIENTE SÍMBOLO del mismo archivo cuando
 * dos símbolos comparten `(file, symbolPath)` — hermanos homónimos, muy
 * comunes en Java por sobrecarga de métodos, `checkNotNull(T)` y
 * `checkNotNull(T, String)` comparten `symbolPath` porque éste no carga
 * aridad/firma. Meter este cuerpo directo dentro del callback de
 * `forEachChunked` (que envuelve cada archivo en una función async) cambia
 * la semántica de `continue` a `return` — que ya NO salta al siguiente
 * símbolo, salta al siguiente ARCHIVO, perdiendo silenciosamente el resto de
 * los símbolos de ese archivo. Verificado con guava/611 archivos: sin esta
 * función aparte, `candidates` caía de 73 667 a 54 187 — un bug real, no
 * hipotético, que `build-incremental.test.ts` no alcanzaba a agarrar porque
 * los probes Ruby sintéticos no tienen sobrecarga de método. Ver también el
 * mismo cuidado en `indexOneFile` vs. el bucle externo que la llama.
 */
function indexOneFile(
  f: GraphFileFacts,
  byName: Map<string, SymbolRef[]>,
  factsByKey: Map<string, SymbolFacts>,
  filesBySymbolPath: Map<string, Set<string>>,
  seenKeys: Set<string>,
): void {
  for (const s of f.symbols) {
    const symbolPath = symbolPathOf(s);
    const joined = symbolPath.join(".");
    const key = `${f.path}#${joined}`;
    if (!factsByKey.has(key)) factsByKey.set(key, s);
    // GRAFO#1: independiente de `seenKeys` (que dedupe hermanos homónimos
    // DENTRO de este archivo, p.ej. sobrecarga de método) — acá sólo importa
    // "¿este archivo declara este symbolPath, sí o no?", así que agregar de
    // más (Set, idempotente) es inofensivo.
    const owners = filesBySymbolPath.get(joined);
    if (owners) owners.add(f.path);
    else filesBySymbolPath.set(joined, new Set([f.path]));
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const list = byName.get(s.name);
    const ref: SymbolRef = { file: f.path, symbolPath };
    if (list) list.push(ref);
    else byName.set(s.name, [ref]);
  }
}

/** `buildIndex`, trocado — misma salida, cede cada `INCREMENTAL_YIELD_BUDGET_MS` entre archivos. */
async function buildIndexAsync(
  files: readonly GraphFileFacts[],
  yieldCheck: () => Promise<void>,
): Promise<ReturnType<typeof buildIndex>> {
  const byName = new Map<string, SymbolRef[]>();
  const factsByKey = new Map<string, SymbolFacts>();
  const filesBySymbolPath = new Map<string, Set<string>>();
  const seenKeys = new Set<string>();

  await forEachChunked(files, yieldCheck, (f) => {
    indexOneFile(f, byName, factsByKey, filesBySymbolPath, seenKeys);
  });

  return { byName, factsByKey, filesBySymbolPath };
}

/**
 * Suma estadísticas de la cascada de VARIAS corridas parciales (una por
 * archivo, o una por lote dentro de un archivo grande) en una sola — válido
 * porque cada etapa decide por candidato, sin leer ni mutar estado
 * compartido entre candidatos (ver el docstring de `resolveReferences` en
 * `resolve.ts`), así que trocear el conjunto de candidatos en lotes
 * arbitrarios y sumar sus conteos da EXACTAMENTE el mismo total que una sola
 * corrida sobre la unión — probado, no supuesto, en
 * `build-incremental.test.ts`.
 *
 * CONTRATO-F9.md §6 fila 11, la mitad que le toca a F5: `ambiguousEdges`/
 * `ambiguousOverflow` son sumas simples (`?? 0`, ausente = "esa parte no
 * midió esto" — nunca puede pasar hoy, `resolve.ts` los puebla siempre, pero
 * el `?? 0` deja este merge correcto igual si algún día una parte viene de
 * un `ResolutionStats` más viejo). `unresolvedByFile` se funde SUMANDO `n`
 * por archivo entre partes (dos lotes del mismo archivo grande pueden
 * reportar el mismo archivo) y re-recortando a `UNRESOLVED_REPORT_MAX_FILES`
 * — el mismo "los peores primero" que `resolve.ts` ya aplica por parte.
 */
function mergeResolutionStats(parts: readonly ResolutionStats[]): ResolutionStats {
  const byStageAcc = new Map<
    ResolutionStageId,
    {
      stage: ResolutionStageId;
      order: number;
      considered: number;
      accepted: number;
      rejected: number;
      narrowed: number;
      passed: number;
      // GUARDIÁN OLA P (grupo grafo) — PIDO #3 de P1.md: sin este campo el
      // merge perdía `ResolutionStageStat.ambiguous` (stages.ts) y ningún
      // panel podía mostrar cuántos candidatos cerró `typeless-receiver` en
      // una corrida real. Ausente en la fuente = 0, nunca "no medido": las
      // partes ya vienen todas de `resolve.ts`, que puebla el campo siempre.
      ambiguous: number;
    }
  >();
  for (const s of ALL_STAGES) {
    byStageAcc.set(s.id, { stage: s.id, order: s.order, considered: 0, accepted: 0, rejected: 0, narrowed: 0, passed: 0, ambiguous: 0 });
  }
  let candidates = 0;
  let resolved = 0;
  let droppedAmbiguous = 0;
  let unresolved = 0;
  let ambiguousEdges = 0;
  let ambiguousOverflow = 0;
  const unresolvedByFileAcc = new Map<string, { stage: ResolutionStageId; n: number }>();
  for (const part of parts) {
    candidates += part.candidates;
    resolved += part.resolved;
    droppedAmbiguous += part.droppedAmbiguous;
    unresolved += part.unresolved;
    ambiguousEdges += part.ambiguousEdges ?? 0;
    ambiguousOverflow += part.ambiguousOverflow ?? 0;
    for (const entry of part.unresolvedByFile ?? []) {
      const acc = unresolvedByFileAcc.get(entry.file);
      if (acc) acc.n += entry.n;
      else unresolvedByFileAcc.set(entry.file, { stage: entry.stage, n: entry.n });
    }
    for (const stat of part.byStage) {
      const acc = byStageAcc.get(stat.stage);
      if (!acc) continue; // defensivo: una etapa desconocida no debería llegar nunca, pero sumar silenciosamente sería peor que ignorarla.
      acc.considered += stat.considered;
      acc.accepted += stat.accepted;
      acc.rejected += stat.rejected;
      acc.narrowed += stat.narrowed;
      acc.passed += stat.passed;
      acc.ambiguous += stat.ambiguous ?? 0;
    }
  }
  const unresolvedByFile = [...unresolvedByFileAcc.entries()]
    .map(([file, v]) => ({ file, stage: v.stage, n: v.n }))
    .sort((a, b) => (b.n !== a.n ? b.n - a.n : a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .slice(0, UNRESOLVED_REPORT_MAX_FILES);
  return {
    candidates,
    resolved,
    droppedAmbiguous,
    unresolved,
    byStage: ALL_STAGES.map((s) => byStageAcc.get(s.id)!),
    ambiguousEdges,
    ambiguousOverflow,
    unresolvedByFile,
  };
}

/**
 * Concatena listas de aristas `references` de varias corridas parciales,
 * re-aplicando el mismo colapso de paralelas que `resolveReferences` ya hace
 * puertas adentro (sumar `weight` cuando `from|to|kind` coincide). Hace
 * falta acá porque, si un archivo grande se procesó en VARIOS lotes
 * (`CANDIDATE_BATCH_SIZE`), dos lotes distintos del MISMO archivo pueden
 * aceptar candidatos hacia el mismo destino — exactamente el caso que el
 * colapso interno ya cubre dentro de un solo lote, ahora across lotes. Entre
 * archivos DISTINTOS nunca hace falta fusionar nada (`from` codifica el
 * archivo de origen, ver `symbolNodeId`), así que aplicar esto también a
 * nivel repo-completo en `assembleGraph` es seguro pero, en la práctica, un
 * simple concat.
 */
/**
 * CONTRATO-F8G.md §1.3: fusiona `roles` con OR de bits cuando alguna de las
 * dos aristas colapsadas lo trae — `undefined` cuando NINGUNA de las dos lo
 * trae, nunca `0` por defecto. La fórmula literal del contrato
 * (`(existing.roles ?? 0) | (e.roles ?? 0)`) sin esta guarda escribiría
 * `roles: 0` en TODA arista colapsada, incluidas `contains`/`imports`/
 * `satisfies`/las 5 tipadas (que nunca deben cargar el campo — ver
 * `CodeGraphEdge.roles`'s docstring) y rompería el invariante de "byte-
 * idéntico antes/después" del propio §1.3 apenas dos aristas paralelas se
 * fusionan, aun sin que ningún frente haya empezado a poblar `roles`
 * todavía. Reportado como la única desviación de la fórmula literal.
 */
function mergedRoles(existing?: number, incoming?: number): number | undefined {
  if (existing === undefined && incoming === undefined) return undefined;
  return (existing ?? 0) | (incoming ?? 0);
}

/**
 * GUARDIÁN OLA P (grupo grafo) — arreglado el PIDO #2 de `P1.md`: éste era el
 * MISMO bug de colapso que P1 corrigió dentro de `resolveReferences`
 * (`resolve.ts`, el colapso interno de UN lote), pero acá en el colapso
 * ACROSS lotes/listas (un archivo grande trocea sus candidatos en
 * `CANDIDATE_BATCH_SIZE`; cada lote pasa por el colapso ya corregido de
 * `resolve.ts`, y los lotes se funden acá). Antes: `{...existing}` se quedaba
 * con la `provenance` del PRIMER lote en llegar y hacía OR de `roles` / suma
 * de `weight` entre ocurrencias de provenance DISTINTA — una arista FIRME
 * (`declared`/`resolved`) que en otro lote tuvo una ocurrencia `ambiguous`
 * del mismo par terminaba con el bit de rol de la ambigua prestado, o al
 * revés perdía su firmeza. Medido por P1, caso exacto:
 * `guava/.../Chars.java#CharArrayAsList.equals`, que usa `start` de las dos
 * formas (`array[start + i]` desnudo y resuelto, `that.start` por receptor y
 * ambiguo) — las dos caen en lotes distintos por superar
 * `CANDIDATE_BATCH_SIZE`. Con el bit prestado a mano en esas 2 aristas, guava
 * pasaba de 6 a 49 hallazgos de `unused-symbol` (una única `PROVENANCE
 * STRENGTH` decide todo el catálogo, no sólo ese detector).
 *
 * Misma regla que `resolve.ts`, misma constante (`PROVENANCE_STRENGTH`,
 * exportada de ahí para no duplicarla): el par vale lo que vale su ocurrencia
 * MÁS FUERTE (`declared` > `resolved` > `inferred` > `ambiguous`); la más
 * débil se descarta ENTERA — no aporta `weight`, ni `roles`, ni
 * `alternatives` (CONTRATO-F9.md §4.2: sólo presente en aristas ambiguas, así
 * que una ocurrencia firme nunca puede prestarla ni recibirla). Entre
 * ocurrencias de la MISMA fuerza, el comportamiento es el de siempre: `weight`
 * suma y `roles` hace OR.
 */
function mergeEdges(edgeLists: readonly (readonly CodeGraphEdge[])[]): CodeGraphEdge[] {
  const merged = new Map<string, CodeGraphEdge>();
  for (const list of edgeLists) {
    for (const e of list) {
      const key = `${e.from}|${e.to}|${e.kind}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, e);
        continue;
      }
      const cmp = PROVENANCE_STRENGTH[e.provenance] - PROVENANCE_STRENGTH[existing.provenance];
      if (cmp < 0) continue; // la nueva ocurrencia es más débil: se descarta entera
      if (cmp > 0) {
        merged.set(key, e); // la nueva es más fuerte: reemplaza entera a la existente
        continue;
      }
      const roles = mergedRoles(existing.roles, e.roles);
      const alternatives =
        existing.alternatives || e.alternatives
          ? [...new Set([...(existing.alternatives ?? []), ...(e.alternatives ?? [])])].sort()
          : undefined;
      merged.set(key, {
        ...existing,
        weight: existing.weight + e.weight,
        ...(roles !== undefined ? { roles } : {}),
        ...(alternatives !== undefined ? { alternatives } : {}),
      });
    }
  }
  return [...merged.values()];
}

/** Corre la cascada sobre los candidatos de UN archivo, troceando en lotes de `CANDIDATE_BATCH_SIZE` si hace falta. */
async function resolveFileCandidates(
  candidates: readonly ResolutionCandidate[],
  ctx: ResolutionContext,
  options: ResolveOptions | undefined,
  yieldCheck: () => Promise<void>,
): Promise<{ readonly edges: readonly CodeGraphEdge[]; readonly stats: ResolutionStats }> {
  if (candidates.length <= CANDIDATE_BATCH_SIZE) {
    return resolveReferences(ALL_STAGES, candidates, ctx, options);
  }
  const parts: { edges: readonly CodeGraphEdge[]; stats: ResolutionStats }[] = [];
  for (let i = 0; i < candidates.length; i += CANDIDATE_BATCH_SIZE) {
    parts.push(resolveReferences(ALL_STAGES, candidates.slice(i, i + CANDIDATE_BATCH_SIZE), ctx, options));
    await yieldCheck();
  }
  return { edges: mergeEdges(parts.map((p) => p.edges)), stats: mergeResolutionStats(parts.map((p) => p.stats)) };
}

/** Firma estructural de UN símbolo — sólo los campos que alguna etapa de la cascada mira vía `ctx.symbol()`. Ver el docstring de este bloque para por qué `startLine`/`endLine` quedan afuera. */
function symbolDeclSignature(sym: SymbolFacts | null): string {
  if (!sym) return "?";
  return `${sym.family}~${sym.memberOfClassLike ? 1 : 0}~${sym.namespaceContainerOnly ? 1 : 0}~${sym.container.join(".")}`;
}

/** Firma del CONJUNTO de declaraciones de un nombre — orden-independiente (ordenada antes de unir) porque el orden de `byName.get(name)` no es información, sólo el conjunto lo es. */
function declSetSignature(refs: readonly SymbolRef[], factsByKey: ReadonlyMap<string, SymbolFacts>): string {
  return refs
    .map((r) => {
      const key = `${r.file}#${r.symbolPath.join(".")}`;
      return `${key}::${symbolDeclSignature(factsByKey.get(key) ?? null)}`;
    })
    .sort()
    .join("|");
}

/**
 * Los nombres cuyo conjunto de declaraciones cambió — ver la "REGLA DE
 * INVALIDACIÓN" en el docstring de este bloque. Sólo mira los nombres que
 * los archivos agregados/cambiados/eliminados declaraban ANTES o declaran
 * AHORA: proporcional al tamaño de la EDICIÓN, nunca al tamaño del repo.
 */
function computeDirtyNames(
  currentFilesByPath: ReadonlyMap<string, GraphFileFacts>,
  previous: GraphBuildCache,
  newIndex: { readonly byName: ReadonlyMap<string, readonly SymbolRef[]>; readonly factsByKey: ReadonlyMap<string, SymbolFacts> },
  addedOrChanged: ReadonlySet<string>,
  removedPaths: readonly string[],
): ReadonlySet<string> {
  const touchedNames = new Set<string>();
  for (const path of addedOrChanged) {
    const oldFile = previous.filesByPath.get(path);
    if (oldFile) for (const s of oldFile.symbols) touchedNames.add(s.name);
    const newFile = currentFilesByPath.get(path);
    if (newFile) for (const s of newFile.symbols) touchedNames.add(s.name);
  }
  for (const path of removedPaths) {
    const oldFile = previous.filesByPath.get(path);
    if (oldFile) for (const s of oldFile.symbols) touchedNames.add(s.name);
  }

  const dirty = new Set<string>();
  for (const name of touchedNames) {
    const oldSig = declSetSignature(previous.index.byName.get(name) ?? [], previous.index.factsByKey);
    const newSig = declSetSignature(newIndex.byName.get(name) ?? [], newIndex.factsByKey);
    if (oldSig !== newSig) dirty.add(name);
  }
  return dirty;
}

/**
 * Junta lo que cada archivo aportó (`nodesByFile`/`resolutionByFile`,
 * frescos o reusados, no importa cuál) en el `CodeGraph` final — recorre
 * `files` en su mismo orden, así que si TODO fue reusado, la salida es
 * byte-idéntica (mismo orden incluido) a la que `buildGraph` habría
 * producido sobre el mismo `files`. `containsEdges` se concatena SIN
 * deduplicar entre archivos, a propósito — ver el docstring de
 * `buildNodesAndContainsForFile` para la duplicación pre-existente que esto
 * reproduce fielmente en vez de "corregir". `referenceEdges` sí se funde
 * (`mergeEdges`) porque `buildGraph`/`resolveReferences` también lo hacen.
 */
function assembleGraph(
  files: readonly GraphFileFacts[],
  nodesByFile: ReadonlyMap<string, { readonly nodes: readonly CodeGraphNode[]; readonly edges: readonly CodeGraphEdge[] }>,
  resolutionByFile: ReadonlyMap<string, FileResolution>,
  /** Ola R (R1) — el MISMO contexto que `buildGraphIncremental` ya armó; `declares-type` se resuelve del `files` completo, igual que `imports`/`satisfies`. */
  ctx: ResolutionContext,
): CodeGraph {
  const nodes: CodeGraphNode[] = [];
  const seenNodeIds = new Set<string>();
  const containsEdges: CodeGraphEdge[] = [];
  const referenceEdgeLists: (readonly CodeGraphEdge[])[] = [];
  const typedEdgeLists: (readonly CodeGraphEdge[])[] = [];
  const callEdgeLists: (readonly CodeGraphEdge[])[] = [];
  const statsParts: ResolutionStats[] = [];

  for (const f of files) {
    const nc = nodesByFile.get(f.path);
    if (nc) {
      for (const n of nc.nodes) {
        if (seenNodeIds.has(n.id)) continue;
        seenNodeIds.add(n.id);
        nodes.push(n);
      }
      containsEdges.push(...nc.edges);
    }
    const res = resolutionByFile.get(f.path);
    if (res) {
      referenceEdgeLists.push(res.edges);
      statsParts.push(res.stats);
      typedEdgeLists.push(res.typedEdges);
      statsParts.push(res.typedStats);
      callEdgeLists.push(res.callEdges);
      statsParts.push(res.callStats);
    }
  }

  // `imports` (P4, punto B de su bloque en `buildGraph`): nunca cacheado por
  // archivo, se recalcula del `files` COMPLETO en cada corrida — barato, y
  // evita inventarle una regla de invalidación nueva al troceo ya probado de
  // arriba (depende del CONJUNTO de rutas, no de qué declara cada archivo).
  const importEdges = mergeEdges([resolveImportEdges(files)]);
  // `satisfies` derivado (CONTRATO-F8G.md §3.2): igual que `imports`, depende
  // del grafo COMPLETO (nodos + `contains`), nunca cacheado por archivo.
  const satisfiesDerivacion = deriveSatisfiesEdges(nodes, containsEdges);
  const satisfiesEdges = satisfiesDerivacion.edges;
  // Ola P (P2) — mismo enganche que en `buildGraph`, ver el bloque "LA ARIDAD
  // POR SITIO DE LLAMADA". Se aplica DESPUÉS del `mergeEdges` (que colapsa
  // las aristas paralelas de archivos distintos) y se recalcula del `files`
  // COMPLETO en cada corrida, igual que `imports`/`satisfies`: depende del
  // conjunto de sitios de uso, no de qué declara cada archivo, así que
  // cachearlo por archivo pediría una regla de invalidación nueva.
  const callSiteArities = collectCallSiteArities(files);
  const mergedReferenceEdges = withCallSiteArities(mergeEdges(referenceEdgeLists), nodes, callSiteArities);
  // Ola R (R3) — `markAmbiguousStores`: mismo enganche que en `buildGraph`,
  // reproducido acá porque `assembleGraph` es el otro camino que produce un
  // `CodeGraph` completo. Va DESPUÉS del `mergeEdges` (que colapsa las aristas
  // paralelas), igual que `withCallSiteArities` de la línea de arriba.
  const mergedTypedEdges = markAmbiguousStores(mergeEdges(typedEdgeLists));
  // CONTRATO-F9.md §3 — mismo enganche que en `buildGraph` (ver ese docstring), reproducido acá porque `assembleGraph` es el otro
  // camino que produce un `CodeGraph` completo (P2, mitad incremental).
  const carriesEdges = deriveCarriesEdges(nodes, mergedReferenceEdges);
  const invokesIndirect = deriveInvokesIndirectEdges(nodes, containsEdges, files, mergedTypedEdges);
  // Ola R (R1) — mismo enganche que en `buildGraph`, reproducido acá porque
  // `assembleGraph` es el otro camino que produce un `CodeGraph` completo.
  const declaresType = resolveDeclaresTypeEdges(files, ctx);

  return {
    nodes: [...nodes, ...invokesIndirect.nodes],
    edges: [
      ...containsEdges,
      ...mergedReferenceEdges,
      ...mergedTypedEdges,
      ...importEdges,
      ...withCallSiteArities(mergeEdges(callEdgeLists), nodes, callSiteArities),
      ...satisfiesEdges,
      ...carriesEdges,
      ...invokesIndirect.edges,
      ...declaresType.edges,
    ],
    resolution: mergeResolutionStats([...statsParts, ...(declaresType.stats ? [declaresType.stats] : [])]),
  };
}

/**
 * `buildGraph`, pero con entrada parcial y sin tramo síncrono largo — ver el
 * bloque de comentarios arriba de este grupo de funciones para la garantía
 * exacta de invalidación y el patrón de troceo. `previous`/`changed` en
 * `null` ⇒ no hay info confiable para reusar nada: se recalcula TODO (mismo
 * resultado que `buildGraph`), pero troceado — nunca un bloqueo largo de un
 * solo tirón.
 *
 * Devuelve, junto con el grafo, el `GraphBuildCache` de ESTA corrida — el
 * `previous` de la PRÓXIMA llamada.
 */
export async function buildGraphIncremental(
  files: readonly GraphFileFacts[],
  previous: GraphBuildCache | null,
  changed: ReadonlySet<string> | null,
  options?: ResolveOptions,
): Promise<{ readonly graph: CodeGraph; readonly cache: GraphBuildCache }> {
  const yieldCheck = createSlicer(INCREMENTAL_YIELD_BUDGET_MS);
  const filesByPath = new Map(files.map((f) => [f.path, f] as const));
  const cold = previous === null || changed === null;

  const addedOrChanged = new Set<string>();
  for (const f of files) {
    if (cold || !previous.filesByPath.has(f.path) || changed.has(f.path)) addedOrChanged.add(f.path);
  }
  const removedPaths: string[] = previous
    ? [...previous.filesByPath.keys()].filter((p) => !filesByPath.has(p))
    : [];

  const newIndex = await buildIndexAsync(files, yieldCheck);
  const ctx = buildResolutionContext(files, newIndex);

  let dirtyForResolution: Set<string>;
  if (cold) {
    dirtyForResolution = new Set(files.map((f) => f.path));
  } else {
    dirtyForResolution = new Set(addedOrChanged);
    const dirtyNames = computeDirtyNames(filesByPath, previous, newIndex, addedOrChanged, removedPaths);
    if (dirtyNames.size > 0) {
      await forEachChunked(files, yieldCheck, (f) => {
        if (dirtyForResolution.has(f.path)) return;
        if (f.references.some((r) => dirtyNames.has(r.name))) {
          dirtyForResolution.add(f.path);
          return;
        }
        // P4 — mismo criterio que la línea de arriba, aplicado a las 5
        // aristas tipadas de símbolo (`imports` no depende de `dirtyNames`,
        // nunca entra acá — ver `FileResolution.typedEdges`'s docstring).
        if ((f.edges ?? []).some((e) => e.kind !== "imports" && dirtyNames.has(e.toName))) dirtyForResolution.add(f.path);
      });
    }
  }

  const nodesByFile = new Map<string, { readonly nodes: readonly CodeGraphNode[]; readonly edges: readonly CodeGraphEdge[] }>();
  await forEachChunked(files, yieldCheck, (f) => {
    const cached = !cold && !addedOrChanged.has(f.path) ? previous.nodesByFile.get(f.path) : undefined;
    nodesByFile.set(f.path, cached ?? buildNodesAndContainsForFile(f));
  });

  const resolutionByFile = new Map<string, FileResolution>();
  await forEachChunked(files, yieldCheck, async (f) => {
    const cached = !cold && !dirtyForResolution.has(f.path) ? previous.resolutionByFile.get(f.path) : undefined;
    if (cached) {
      resolutionByFile.set(f.path, cached);
      return;
    }
    const candidates = buildCandidatesForFile(f, newIndex.byName, newIndex.filesBySymbolPath, newIndex.factsByKey);
    // CONTRATO-F8G.md §3.1 — misma partición callee/no-callee que `buildGraph`,
    // sobre los candidatos DE ESTE ARCHIVO; comparte troceo por lotes
    // (`resolveFileCandidates`) y `yieldCheck` con la resolución de `references`.
    const { callee, nonCallee } = partitionCandidatesByCallee(candidates);
    const { edges, stats } = await resolveFileCandidates(nonCallee, ctx, options, yieldCheck);
    const { edges: callEdgesRaw, stats: callStats } = await resolveFileCandidates(callee, ctx, options, yieldCheck);
    const callEdges = relabelKind(callEdgesRaw, "calls");
    // P4 — mismo archivo, mismo `dirtyForResolution`, misma `ctx`: las 5
    // aristas tipadas de símbolo comparten la invalidación de arriba. Sin
    // troceo por lotes (a diferencia de `resolveFileCandidates`): el volumen
    // de aristas tipadas de un solo archivo (un `extends`, un puñado de
    // `implements`) no se acerca al fan-out de referencias que motivó
    // `CANDIDATE_BATCH_SIZE` (ver su docstring, el caso medido de 1511
    // candidatos en un solo archivo).
    const typedByKind = buildTypedEdgeCandidatesForFile(f, newIndex.byName);
    const { edges: typedEdges, stats: typedStats } = resolveTypedEdgeCandidates(typedByKind, ctx, options);
    resolutionByFile.set(f.path, { candidates, edges, stats, typedEdges, typedStats, callEdges, callStats });
  });

  const graph = assembleGraph(files, nodesByFile, resolutionByFile, ctx);
  const cache: GraphBuildCache = { filesByPath, index: newIndex, nodesByFile, resolutionByFile };
  return { graph, cache };
}
