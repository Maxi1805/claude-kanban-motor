/**
 * El vocabulario de la cascada de resolución — CONTRATO-F3.md §3.3, con la
 * salvedad de dónde viven `ResolutionStageStat`/`ResolutionStats`/
 * `CandidateTrace`/`ResolveOptions`: el contrato los muestra bajo un
 * encabezado de comentario `// graph/resolve.ts`, pero `graph/types.ts`
 * necesita `ResolutionStats` para su campo `CodeGraph.resolution`, y
 * `graph/resolve.ts` necesita `CodeGraphEdge` de `graph/types.ts` — ponerlos
 * en el archivo que ejecuta la cascada habría creado un ciclo de imports
 * entre `types.ts` y `resolve.ts`. Quedan acá, junto al resto del
 * vocabulario de la cascada, que es exactamente lo que son.
 *
 * Trece `ResolutionStageId`, no nueve: el contrato original declara 9
 * (incluye `bare-constant-receiver`, EL REFINAMIENTO MEDIDO); B1
 * (ORDEN-DE-ATAQUE.md #2, eslabón 2) agrega la décima, `module-reachability`;
 * P1 (Ola P) la undécima, `typeless-receiver`; C1 (Ola U) la duodécima,
 * `self-receiver`; AA6 (Ola AA) la decimotercera, `type-slot`
 * — ver `resolve.ts`'s docstring de esa etapa para la justificación completa
 * y por qué corre ANTES de `global-uniqueness`. El ORDEN de ejecución real vive en
 * `resolve.ts#ALL_STAGES` vía el campo `order` de cada `ResolutionStage` —
 * el `order` en que aparecen listados acá abajo es sólo el vocabulario, no
 * un compromiso de secuencia (el propio contrato lo dice: "`order`: Posición
 * en la cascada. Único, ascendente, sin huecos" es un campo que CADA etapa
 * declara, no algo que este `type` unión imponga por su orden de listado).
 * Ver `resolve.ts` para la justificación de POR QUÉ el orden real difiere
 * del orden de aparición acá (la razón corta: `qualified-name`, la etapa que
 * "mata la colisión de File", tiene que correr ANTES de que
 * `global-uniqueness` acepte un candidato con un solo dueño global, o el
 * caso File nunca llega a esa etapa).
 */
import type { Provenance } from "./types.js";
import type { SymbolFacts } from "./symbols.js";
import type { ReferenceFacts } from "./references.js";
import type { FileFacts } from "../facts/types.js";

export type ResolutionStageId =
  | "syntactic-role" // rol sintáctico
  | "local-shadow" // sombra léxica local
  | "class-member" // miembro de una unidad tipo-clase: no por nombre desnudo (N1-a)
  | "type-slot" // AA6 (Ola AA): lo escrito en la ranura de TIPO de la gramática no denota una función
  | "bare-constant-receiver" // EL REFINAMIENTO MEDIDO: receptor = constante desnuda ⇒ se emite igual
  | "self-receiver" // C1 (Ola U): el receptor es el PROPIO objeto — su tipo lo escribe la gramática, no se infiere
  | "namespace-container" // un módulo cuyo cuerpo son sólo declaraciones no es un símbolo
  | "single-file-component" // tope de SFC
  | "module-reachability" // B1 (eslabón 2): candidato de OTRO archivo exige import (directo o transitivo+exportado)
  | "typeless-receiver" // P1 (Ola P): `x.miembro(...)` sin tipos ⇒ `ambiguous`, NUNCA descartada
  | "global-uniqueness" // dueño global único
  | "qualified-name" // el calificador tiene que coincidir (N1-b, namespace léxico)
  | "path-proximity";

export interface SymbolRef {
  readonly file: string;
  readonly symbolPath: readonly string[];
}

export interface ReferenceSite {
  readonly file: string;
  readonly ref: ReferenceFacts;
}

export interface ResolutionCandidate {
  /** Estable dentro de una corrida; es la clave con la que el arnés cruza el dataset etiquetado. */
  readonly id: string;
  readonly from: ReferenceSite;
  /** Declaraciones que comparten el nombre, antes de que ninguna etapa opine. */
  readonly targets: readonly SymbolRef[];
}

export type StageVerdict =
  | { readonly outcome: "accept"; readonly target: SymbolRef; readonly provenance: Provenance }
  | { readonly outcome: "reject"; readonly why: string }
  | {
      /**
       * NUEVO, P1 (Ola P) — el cuarto veredicto TERMINAL, y el que le faltaba
       * a este vocabulario: "vi el uso, no sé cuál de estos destinos es".
       *
       * Hasta esta ola una etapa sólo podía decir tres cosas sobre un
       * candidato: es ÉSTE (`accept`), no es NINGUNO (`reject`) o no opino
       * (`pass`/`narrow`). La arista `ambiguous` (CONTRATO-F9.md §4.1)
       * existía pero SÓLO la podía emitir el motor, y sólo por descarte: un
       * candidato que llegaba al final de la cascada sin que nadie decidiera
       * y con >1 destino vivo. Una etapa que SABE que el uso es real pero no
       * puede atribuirlo — el caso de `x.miembro(...)` sin inferencia de
       * tipos — no tenía cómo decirlo, y su única salida era `reject`, o sea
       * afirmar "no es ninguno de éstos", que es exactamente lo que NO sabe.
       *
       * Ese `reject` es la raíz medida del 98,5 % del volumen crudo de
       * `unused-symbol` (ver `resolve.ts#typelessReceiverStage`): "no sé" y
       * "no hay" se volvían indistinguibles río abajo. Con este veredicto la
       * etapa emite la arista con `provenance: "ambiguous"` y la lista de
       * destinos posibles en `alternatives`, que es el vocabulario que el
       * grafo ya tiene para exactamente esto.
       *
       * `targets` es el conjunto de destinos posibles YA narrowed por las
       * etapas anteriores; el motor elige `to` y `alternatives` con el mismo
       * orden determinista y el mismo tope `AMBIGUOUS_MAX_TARGETS` que ya
       * usa para las ambiguas por descarte — una sola forma de emitir una
       * arista ambigua, no dos.
       */
      readonly outcome: "ambiguous";
      readonly targets: readonly SymbolRef[];
      readonly why: string;
    }
  | { readonly outcome: "narrow"; readonly targets: readonly SymbolRef[] }
  | { readonly outcome: "pass" }; // esta etapa no opina sobre este candidato

export interface ResolutionContext {
  /** nombre -> declaraciones, ya indexado. */
  declarationsByName(name: string): readonly SymbolRef[];
  symbol(ref: SymbolRef): SymbolFacts | null;
  /**
   * `null` siempre, hoy: `FileFacts` (`facts/types.ts`, dueño distinto esta
   * ola) todavía NO carga `symbols`/`references` — reportado, no arreglado
   * acá (regla 6: no tocar un archivo ajeno). Ninguna etapa de `resolve.ts`
   * llama a `factsOf`; existe sólo para satisfacer la forma del contrato y
   * quedar lista para cuando `FileFacts` los gane.
   */
  factsOf(file: string): FileFacts | null;
  languageOf(file: string): string;
  /**
   * B1 (eslabón 2) — `true` cuando existe una arista `imports` YA RESUELTA
   * (`imports-target.ts#resolveImportEdges`, la MISMA función que produce las
   * aristas `imports` reales del grafo — nunca una heurística nueva) desde
   * `fromFile` hacia `toFile`, DIRECTA (un salto). Usada por
   * `resolve.ts`'s `module-reachability` como la condición "el origen lo
   * importa", sin exigir `SymbolFacts.exported`: una arista `imports` real
   * ya es evidencia estructural fuerte por sí sola.
   */
  importsModule(fromFile: string, toFile: string): boolean;
  /**
   * B1 (eslabón 2) — `true` cuando `toFile` es alcanzable desde `fromFile`
   * siguiendo CERO O MÁS aristas `imports` resueltas (cierre transitivo del
   * mismo grafo que `importsModule` consulta) — cubre la reexportación en
   * cadena (`fromFile` importa un índice que a su vez importa el archivo
   * real). Incluye el caso directo como subconjunto (`fromFile === toFile`
   * ⇒ `true` trivialmente, cero saltos). Usada SIEMPRE junto con
   * `SymbolFacts.exported`, nunca sola — ver el docstring de la etapa en
   * `resolve.ts`.
   */
  reachesModule(fromFile: string, toFile: string): boolean;
  /**
   * B1 (eslabón 2) — `true` cuando `file` mismo aparece como ORIGEN de al
   * menos una arista `imports` resuelta. El gate estructural de
   * `module-reachability`: evita que la etapa nueva opine sobre un archivo
   * cuyo grafo de imports está genuinamente vacío (medido: Rails, 4 aristas
   * `imports` en 466 archivos — autoloading por convención, sin
   * `require`/`require_relative` explícito entre archivos de la app, un
   * verdadero negativo del mismo tipo que `extends = 0` en TypeScript, no un
   * defecto del extractor) en vez de tratar esa ausencia como evidencia de
   * que ningún candidato de otro archivo es alcanzable — lo que apagaría la
   * resolución cross-file entera en un repo así, exactamente el
   * "rechazo silencioso" que esta etapa existe para evitar.
   */
  hasResolvedImports(file: string): boolean;
  /**
   * GUARDIÁN OLA P (grupo grafo) — PIDO (c) de P2.md: el objeto que
   * `graph/build.ts#buildResolutionContext` devuelve YA lleva estos tres
   * métodos en tiempo de ejecución (`ImportSpecifierFacts`, ese archivo,
   * `resolveDosPunto` el pedido DOS de esa ola); esto sólo los declara acá
   * para que una etapa los pueda leer con el tipo, sin que `build.ts`
   * cambie una coma. El dato es real: `file` declara al menos un
   * especificador de import crudo que `resolveImportTarget` NO pudo resolver
   * a un archivo del repo (medido: nest 1.979, vueuse 991, preact 137…).
   *
   * ⚠ LEER `P2.md` §6.2 ANTES DE ESCRIBIR UNA ETAPA CON ESTO. El criterio que
   * N9 propuso — "un nombre bindeado por un especificador no resuelto NO
   * puede ser un símbolo del repo, salvo que ESE MISMO especificador
   * resuelva en algún otro archivo" (`specifierResolvesSomewhere`, abajo) —
   * está MEDIDO Y REFUTADO sobre el corpus: en nest, el especificador #1 por
   * ocurrencias es `@nestjs/common` (609 apariciones) y NUNCA resuelve desde
   * ningún archivo (alias de monorepo que `resolveImportTarget` no cubre),
   * así que ese criterio lo trataría igual que `typing` y borraría las
   * aristas que N9 quería proteger. El discriminador que SÍ separa los casos
   * en los números medidos es estructural: el especificador tiene un prefijo
   * que corresponde a un directorio de paquete del propio repo. Repetir el
   * criterio original sin releer la medición reintroduce el bug que este
   * pedido dejó documentado.
   */
  importsUnresolvedSpecifier(file: string): boolean;
  /** Ver `importsUnresolvedSpecifier` — los especificadores crudos y distintos que `file` importa, separados por si `resolveImportTarget` los resolvió o no. */
  importSpecifiers(file: string): { readonly resolved: readonly string[]; readonly unresolved: readonly string[] };
  /** Ver `importsUnresolvedSpecifier` — `true` si ESTE especificador (texto crudo) resuelve a un archivo del repo desde ALGÚN OTRO archivo del repo-completo. Medido en P2.md §6.2: NO alcanza sola como discriminador, ver la advertencia de arriba. */
  specifierResolvesSomewhere(spec: string): boolean;
}

export interface ResolutionStage {
  readonly id: ResolutionStageId;
  /** Posición en la cascada. Único, ascendente, sin huecos. */
  readonly order: number;
  readonly title: string;
  decide(candidate: ResolutionCandidate, ctx: ResolutionContext): StageVerdict;
}

export interface ResolutionStageStat {
  readonly stage: ResolutionStageId;
  readonly order: number;
  readonly considered: number; // llegaron vivos a esta etapa
  readonly accepted: number;
  readonly rejected: number;
  readonly narrowed: number;
  readonly passed: number;
  /**
   * NUEVO, P1 (Ola P). Cuántos candidatos ESTA etapa cerró con el veredicto
   * terminal `ambiguous` (⊆ `ResolutionStats.droppedAmbiguous`). OPCIONAL por
   * el mismo motivo que `ambiguousEdges`/`ambiguousOverflow` de más abajo:
   * `graph/build.ts#mergeResolutionStats` construye sus acumuladores por
   * etapa con un literal de campos fijos y no es un archivo de este frente,
   * así que un campo REQUERIDO acá lo rompería. Ausente = "esta corrida (o
   * este merge) no midió esto", nunca cero. Ver "PIDO A OTRO FRENTE" en
   * `ola-p/informes/P1.md`.
   */
  readonly ambiguous?: number;
}

export interface ResolutionStats {
  readonly candidates: number;
  readonly resolved: number;
  /** Sobrevivió la cascada con más de un destino posible. VA A PANTALLA. */
  readonly droppedAmbiguous: number;
  /** Sobrevivió sin ningún destino. */
  readonly unresolved: number;
  readonly byStage: readonly ResolutionStageStat[];
  /**
   * NUEVO, CONTRATO-F9.md §4.3. Cuántas de `droppedAmbiguous` se emitieron
   * como arista `provenance: "ambiguous"` (⊆ `droppedAmbiguous`).
   * OPCIONAL, a diferencia del contrato literal (que las declara
   * obligatorias): esta ola sólo aterriza la FORMA (`resolve.ts`/`build.ts`
   * siguen sin poblarla — ese es el trabajo de F5, CONTRATO-F9.md §4). Un
   * campo requerido habría obligado a tocar la construcción de
   * `ResolutionStats` en `resolve.ts`/`build.ts`, ninguno de los dos
   * archivos compartidos de esta ola. Ausente = "esta corrida no midió
   * esto todavía", no cero.
   */
  readonly ambiguousEdges?: number;
  /** NUEVO, CONTRATO-F9.md §4.3. Cuántas se descartaron por pasar `AMBIGUOUS_MAX_TARGETS`. Mismo motivo opcional que `ambiguousEdges`. */
  readonly ambiguousOverflow?: number;
  /**
   * NUEVO, CONTRATO-F9.md §4.3. Los `UNRESOLVED_REPORT_MAX_FILES` archivos
   * con más candidatos sin emparejar, con la etapa que los mató. Ordenado
   * por `n` desc. Mismo motivo opcional que `ambiguousEdges`.
   */
  readonly unresolvedByFile?: readonly { readonly file: string; readonly stage: ResolutionStageId; readonly n: number }[];
}

/**
 * NUEVO, CONTRATO-F9.md §4.2. `[provisional]` — a medir sobre el corpus
 * antes de fijarlo (M, la medición de esta ola): un candidato que sobrevive
 * la cascada con MÁS destinos que este tope no se emite como arista
 * `ambiguous` en absoluto — se cuenta en `ambiguousOverflow` y se descarta,
 * misma disciplina que "más de 8 declaraciones homónimas no es información,
 * es la ausencia de información". Si el volumen ambiguo de guava supera el
 * 20% de las aristas resueltas, este número baja de 8 a 4 (CONTRATO-F9.md
 * §4.4) — quien lo baje re-mide, no cambia el valor a ciegas.
 */
export const AMBIGUOUS_MAX_TARGETS = 8;

/** NUEVO, CONTRATO-F9.md §4.3. Tope de `ResolutionStats.unresolvedByFile` — lo mismo que `UNRESOLVED_REPORT_MAX_FILES` en el resto del panel: los peores primero, nunca la lista completa. */
export const UNRESOLVED_REPORT_MAX_FILES = 200;

export interface CandidateTrace {
  readonly candidateId: string;
  readonly perStage: readonly { readonly stage: ResolutionStageId; readonly verdict: StageVerdict }[];
  readonly final: "resolved" | "rejected" | "ambiguous" | "unresolved";
  readonly finalStage: ResolutionStageId | null;
}

export interface ResolveOptions {
  /** El arnés del gate lo usa para etiquetar; producción lo omite y no paga nada. */
  readonly trace?: (t: CandidateTrace) => void;
}
