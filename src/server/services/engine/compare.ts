/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPARAR CONTRA UN REF DE GIT — OLA BC, FRENTE BC2.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * *"Que me muestre los problemas generados con respecto a mis últimos cambios
 * comparando con github"*, y después: *"sólo las relacionadas al nuevo
 * código"*.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SON DOS VISTAS Y NO SE MEZCLAN. LA REGLA MÁS IMPORTANTE DE ESTE ARCHIVO.
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  **(A) `introduced` — LO QUE INTRODUJISTE.** Hallazgos cuyo id NO existía en
 *  el ref base. Es la resta de conjuntos de ids. Contesta *"¿qué rompí?"*.
 *
 *  **(B) `inTouchedFiles` — LO QUE HAY EN LO QUE TOCASTE.** Hallazgos ubicados
 *  en un archivo que el diff contra el base reporta como cambiado, **existieran
 *  antes o no**. Contesta *"¿qué me conviene arreglar ya que estoy acá?"*.
 *
 * **LA DIFERENCIA NO ES COSMÉTICA.** Si el usuario edita una función que ya era
 * larga para agregarle una rama: el `long-function` YA EXISTÍA, así que (A) no
 * lo muestra —correcto, no lo introdujo— y (B) SÍ —correcto, está parado ahí—.
 * Publicar un hallazgo viejo bajo el rótulo "lo generaste vos" es exactamente
 * la clase de mentira que hace que se deje de confiar en una herramienta, así
 * que las dos listas salen SEPARADAS y cada fila de (B) dice si además es de
 * (A) (`alsoIntroduced`). **Concatenarlas es un bug, no una simplificación.**
 *
 * Y son distintas EN LOS DOS SENTIDOS, no sólo en uno: (A) también tiene
 * hallazgos que (B) no tiene — un `dependency-cycle` o un `duplication` que
 * aparece por un import nuevo puede quedar ubicado en un archivo que el usuario
 * NO tocó. Ésos existen porque él cambió algo, y (B) por construcción no los ve.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO VIVE EN EL MOTOR Y NO EN CADA CONSUMIDOR
 * ───────────────────────────────────────────────────────────────────────────
 *
 * El servidor MCP va a elegir el ref por prompt y el tablero por rama base del
 * proyecto: **son dos formas de ELEGIR el ref, no dos formas de COMPARAR.** La
 * comparación se escribe una vez, acá. Esta casa tiene el precedente exacto de
 * lo que pasa si no: `censo-patrones.py` comparaba contra una lista de nombres
 * escrita a mano mientras el volcado publicaba otra grafía, y **137 propuestas
 * quedaron invisibles** para el instrumento que existía justamente para que
 * ninguna se perdiera.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SE COMPARA POR CONJUNTO DE IDS, NUNCA POR CONTEO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * La Ola AW declaró "cero propuestas movidas" comparando totales cuando en
 * realidad **había perdido siete y ganado una**. El conteo no puede ver esa
 * diferencia POR CONSTRUCCIÓN. Acá cada hallazgo cae en EXACTAMENTE UNO de
 * cuatro conjuntos —`introduced`, `resolved`, `carriedOver`, `absorbed`— y los
 * conteos son consecuencia de esos conjuntos, nunca la fuente.
 *
 * El id es `code-finding-ids.ts#stableFindingId` (vía `conIdsEstables`, que
 * `analyzeRepo` ya estampa): hash de `(kind, archivo, símbolo)` **sin números
 * de línea y sin el valor de la métrica**, exactamente para que mover código no
 * acuñe un id nuevo. Medido: **cero** falsos nuevos ante un cambio que no agrega
 * problemas, sobre tres gramáticas y 352 archivos tocados.
 *
 * **PERO EL ID SOLO NO ALCANZA**, y eso también está medido: hay cambios
 * legítimos ante los cuales el id de un hallazgo VIEJO cambia. Por eso el
 * emparejamiento tiene CUATRO pases y no uno — ver "EL EMPAREJAMIENTO", más
 * abajo, que trae el caso de `preact` con los ids volcados. El informe de este
 * frente (`claude-kanban-docs/ola-bc/informes/BC2.md`) tiene la medición
 * completa.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OLA BD — EL AGRUPAMIENTO MIENTE EN LAS **DOS** DIRECCIONES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * La Ola BC cerró una dirección: un hallazgo VIEJO que el agrupamiento se comió
 * no puede publicarse como `resolved` ni como `introduced` (de ahí `absorbed` y
 * los pases 2 y 3). **Falta la simétrica, y es peor**, porque ésta calla algo
 * que el usuario SÍ hizo.
 *
 * EL CASO, medido sobre `preact` (verificación de la Ola BC §3.4, reproducido
 * en el informe BD1 §2): el usuario escribe una función nueva y compleja al
 * final de un archivo que ya tenía cuatro `complexity`. El agrupamiento de F5
 * mete la función nueva como QUINTA UBICACIÓN del grupo; el grupo se aparea por
 * contenido con el `complexity` viejo (pase 2); y entonces
 *
 *   · la vista (A) `introduced` **no trae** la complejidad recién escrita, y
 *   · la vista (B) marca esa fila `alsoIntroduced: false`.
 *
 * `alsoIntroduced: false` es una AFIRMACIÓN —*"esto ya estaba"*— y el dato no la
 * respalda: la ubicación `children.js#normalizarOpcionesDeHijos` no existía en
 * el base. Es un falso NEGATIVO, o sea el lado seguro (nunca acusa al usuario de
 * algo que no hizo), pero el usuario decide en base a eso.
 *
 * QUÉ SE HACE, Y QUÉ NO. **No** se mueve la fila a `introduced`: sería volver a
 * decirle al usuario que introdujo la complejidad 71 de
 * `constructNewChildrenArray`, que lleva años ahí — la mentira exacta que la
 * Ola BC arregló. Lo que se hace es **decir de qué parte del hallazgo se está
 * hablando**: cada fila apareada publica `newLocations`, las ubicaciones que el
 * base NO tenía con ese `kind`; las filas con alguna salen además en
 * `partiallyIntroduced` y sus ids entran en `unreliableAttribution.ids`. Un
 * consumidor honesto muestra "lo que introduje" como (A) `introduced` **más**
 * (A') `partiallyIntroduced` con las ubicaciones nuevas señaladas, y nunca
 * presenta `alsoIntroduced: false` como "ya estaba" sin mirar `newLocations`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LO QUE ESTO **NO** HACE, DECLARADO: LOS EMPEORADOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Existe una TERCERA vista que no está acá y que la resta **no puede ver**: el
 * hallazgo que ya estaba y quedó PEOR (la función era larga, ahora es más
 * larga; el ciclo tenía 3 nodos, ahora 7). Su id es el mismo —a propósito: el
 * id no lleva la métrica— así que no aparece en `introduced` ni en `resolved`.
 * Detectarlo pide comparar la MAGNITUD del mismo id entre las dos corridas
 * (`metric.value`, y para las agregadas también `locations.length` y
 * `memberCount`), decidir para cada `kind` si "más" es "peor" (lo es para
 * `long-function`, no lo es obviamente para todos) y elegir un umbral de ruido.
 * Nada de eso está construido. Lo que sí queda listo es el insumo:
 * `carriedOver` deja las dos filas —la del base y la de ahora— emparejadas, y
 * el pase 3 del emparejamiento existe justamente para que un hallazgo **cuya
 * métrica cambió** siga apareado en vez de aparecer como nuevo.
 */
import path from "node:path";

import { analyzeRepo } from "../code-analyzer.js";
import { contentKeyForFinding, stableFindingId } from "../code-finding-ids.js";
import {
  changedFilesSince,
  describeWorkingTree,
  isGitCheckout,
  resolveBaseCommit,
  withRefWorktree,
  type RefWorktreeBusyError,
} from "./git-ref.js";
import type { CodeAnalysis, CodeFinding } from "../../../shared/types.js";

/** Cómo se analiza un directorio. Inyectable a propósito — ver `CompareOptions.analyze`. */
export type AnalyzeFn = (req: { readonly dir: string; readonly repoName: string }) => Promise<CodeAnalysis>;

export interface CompareOptions {
  /**
   * EL ÁRBOL DEL USUARIO. Se lee, nunca se escribe: ni checkout, ni stash, ni
   * cambio de rama. Ver la garantía en `git-ref.ts`.
   */
  readonly dir: string;
  /**
   * Contra qué comparar. Cualquier cosa que `git rev-parse` entienda:
   * `origin/main`, `main`, un sha, `HEAD~3`, un tag.
   *
   * **EL MOTOR NO ELIGE EL REF.** "La rama por defecto", "el punto donde
   * ramifiqué" y "el último push" son tres cosas distintas que dan tres
   * resultados distintos, y cuál corresponde depende de quién pregunta. El
   * motor recibe uno; elegirlo es del consumidor.
   */
  readonly baseRef: string;
  readonly repoName: string;
  /**
   * `true` (default): el ref se resuelve a `merge-base(HEAD, ref)` — *"¿qué
   * cambié yo?"*. `false`: se compara contra la punta del ref — *"¿en qué se
   * diferencia mi árbol del suyo?"*. Ver `resolveBaseCommit`.
   */
  readonly mergeBase?: boolean;
  /**
   * Cómo analizar cada uno de los dos árboles. Default: `analyzeRepo` en frío,
   * que no necesita base de datos.
   *
   * **PASAR ACÁ `engine.analyze` ES LA DIFERENCIA ENTRE 60 s Y 2 s** en la
   * segunda comparación: el `RepoAnalysisEngine` cachea el `CodeAnalysis`
   * entero por firma de contenido, y el árbol de un commit tiene firma
   * INMUTABLE — o sea que el lado base de la segunda comparación contra el
   * mismo base es un hit exacto. Además comparte el caché de hechos POR
   * ARCHIVO entre los dos árboles, que difieren en un puñado de archivos.
   * Usá el MISMO `repoKey` para los dos lados: es lo que hace que compartan
   * ese caché (y que un descarte valga para los dos, que es lo correcto).
   */
  readonly analyze?: AnalyzeFn;
  /** Dónde materializar el worktree base. Default: `os.tmpdir()/ck-engine-compare`. */
  readonly scratchDir?: string;
  /** Se llama si el worktree efímero no se pudo sacar. El resultado sale igual. */
  readonly onCleanupFailure?: (err: RefWorktreeBusyError) => void;
}

/** Una fila de la vista (B), con el dato que impide confundirla con la vista (A). */
export interface TouchedFinding {
  readonly finding: CodeFinding;
  /**
   * `true` si además NO existía en el base (o sea: también está en
   * `introduced`). `false` = **el hallazgo se apareó con uno del base**, y
   * presentarlo entero como algo que el usuario generó sería mentir.
   *
   * **OLA BD — `false` NO ES "ya estaba" A SECAS.** Un hallazgo AGRUPADO puede
   * aparearse con su versión vieja y traer ADEMÁS una ubicación que el base no
   * tenía: la función que el usuario acaba de escribir, absorbida por el grupo.
   * Quien lea `alsoIntroduced: false` sin mirar {@link newLocations} va a
   * afirmar "esto ya estaba" sobre algo que el usuario sí introdujo. Ver el
   * bloque "EL AGRUPAMIENTO MIENTE EN LAS DOS DIRECCIONES" al tope del archivo.
   */
  readonly alsoIntroduced: boolean;
  /**
   * **OLA BD.** Las ubicaciones `archivo#símbolo` de este hallazgo que el base
   * NO tenía con este `kind`. Vacío en la enorme mayoría de las filas.
   *
   * `undefined` significa **"esta vista no midió el base"** y sólo lo devuelve
   * `findingsInFiles`/`findingsInTouchedFiles`, que no analizan el ref. No es
   * lo mismo que `[]`: `[]` es una medición que dio vacío.
   */
  readonly newLocations?: readonly string[];
  /** Los archivos cambiados en los que este hallazgo tiene alguna ubicación. */
  readonly touchedFiles: readonly string[];
}

/**
 * Una fila del análisis base que NO se arregló aunque su id ya no exista: su
 * ubicación sigue teniendo un hallazgo del mismo `kind`, típicamente porque el
 * agrupamiento de F5 se la comió. Ver "EL EMPAREJAMIENTO", más abajo.
 */
export interface AbsorbedFinding {
  readonly before: CodeFinding;
  /** El hallazgo del análisis actual que ocupa ese lugar. */
  readonly into: CodeFinding;
}

/**
 * **OLA BD — LA SIMÉTRICA DE `AbsorbedFinding`.** Un hallazgo del análisis
 * actual que SÍ se apareó con uno del base (o sea: NO está en `introduced`)
 * pero que cubre ubicaciones que el base no tenía. Ni "nuevo" ni "ya estaba":
 * el grupo es viejo y una parte de lo que representa es del usuario.
 *
 * `AbsorbedFinding` dice *"esto no se arregló aunque su id desapareció"*; esto
 * dice *"esto no es enteramente viejo aunque su id se apareó"*.
 */
export interface PartiallyIntroducedFinding {
  readonly finding: CodeFinding;
  /** Ubicaciones `archivo#símbolo` sin contraparte del mismo `kind` en el base. */
  readonly newLocations: readonly string[];
}

/** Un hallazgo que sobrevivió al cambio, con sus dos versiones emparejadas. */
export interface CarriedOverFinding {
  readonly id: string;
  readonly before: CodeFinding;
  readonly after: CodeFinding;
}

/**
 * DÓNDE LA COMPARACIÓN **NO PUEDE** GARANTIZAR QUÉ ES NUEVO — medido, no
 * supuesto. Ver el bloque "LA ATRIBUCIÓN NO CONFIABLE" al pie de este archivo.
 */
export interface AttributionGroup {
  readonly kind: string;
  readonly file: string;
  readonly symbol: string;
  readonly baseCount: number;
  readonly headCount: number;
}

export interface ComparisonCost {
  readonly worktreeMs: number;
  readonly baseAnalysisMs: number;
  readonly headAnalysisMs: number;
  readonly diffMs: number;
  readonly totalMs: number;
}

export interface ComparisonResult {
  readonly repoName: string;
  /** El ref tal como lo pidió el consumidor. */
  readonly baseRef: string;
  /** El commit REALMENTE analizado como base. */
  readonly baseCommit: string;
  readonly mergeBaseUsed: boolean;
  /** Presente sólo si se pidió merge-base y no se pudo — con el motivo. */
  readonly mergeBaseFallback?: string;
  readonly headCommit: string;
  /** `true` si el árbol tenía cambios sin commitear (que SÍ entran en la comparación). */
  readonly headDirty: boolean;

  /** Archivos que cambiaron entre el base y el árbol actual, relativos a `dir`. */
  readonly changedFiles: readonly string[];

  /** **(A)** Hallazgos que no existían en el base. Ranking del análisis actual, preservado. */
  readonly introduced: readonly CodeFinding[];
  /** **(B)** Hallazgos ubicados en un archivo cambiado — nuevos y viejos, marcados. */
  readonly inTouchedFiles: readonly TouchedFinding[];
  /**
   * Hallazgos que estaban en el base y **de verdad** ya no están. Lo que
   * desapareció sólo porque su id se re-acuñó o porque un grupo se lo comió NO
   * está acá — está en `carriedOver` o en `absorbed`. Ver "EL EMPAREJAMIENTO".
   */
  readonly resolved: readonly CodeFinding[];
  /** Lo que dejó de tener id propio sin haberse arreglado. Ni `resolved` ni nada. */
  readonly absorbed: readonly AbsorbedFinding[];
  /**
   * **(A') OLA BD** — hallazgos apareados con el base que cubren ubicaciones
   * que el base NO tenía. No están en `introduced` a propósito (el hallazgo
   * viejo no lo introdujo el usuario) y no son enteramente viejos tampoco.
   * Una vista de "qué introduje" que sólo publique `introduced` deja afuera
   * exactamente el problema que el agrupamiento se tragó.
   */
  readonly partiallyIntroduced: readonly PartiallyIntroducedFinding[];
  /** Hallazgos presentes en los dos, emparejados. El insumo de "los empeorados". */
  readonly carriedOver: readonly CarriedOverFinding[];

  /**
   * LO QUE ESTA COMPARACIÓN NO PUEDE AFIRMAR. Ver "LA ATRIBUCIÓN NO CONFIABLE"
   * al pie de `compare.ts`: en un grupo de hallazgos que comparten
   * `(kind, archivo, símbolo)` los ids se reparten por ORDEN DE LECTURA, así
   * que un miembro nuevo arriba les corre el id a todos los de abajo. El
   * CONTEO de introducidos sigue bien; **cuál** de ellos es el nuevo, no.
   *
   * Vacío en la enorme mayoría de las comparaciones. Cuando no lo está, un
   * consumidor honesto lo dice — no lo esconde.
   */
  readonly unreliableAttribution: {
    /** Los grupos afectados, con cuántos miembros tenían de cada lado. */
    readonly groups: readonly AttributionGroup[];
    /**
     * Ids de ESTA corrida cuya atribución nuevo/viejo no es confiable. Incluye
     * los dos motivos: la rotación de ordinales dentro de un grupo de hermanos
     * (arriba) **y, desde la Ola BD, los de `partiallyIntroduced`** — un
     * hallazgo apareado con el base que trae una ubicación que el base no
     * tenía. Un consumidor que sólo mire esta lista queda cubierto por las dos.
     */
    readonly ids: readonly string[];
    /** Cuántas filas de `introduced` caen en un grupo así. */
    readonly introduced: number;
    /**
     * **OLA BD** — cuántos hallazgos se presentan como preexistentes trayendo
     * ubicaciones que el base no tenía. `> 0` ⇒ hay algo que el usuario
     * introdujo y que la vista (A) sola no muestra.
     */
    readonly partiallyIntroduced: number;
  };

  readonly counts: {
    readonly base: number;
    readonly head: number;
    readonly introduced: number;
    readonly resolved: number;
    readonly carriedOver: number;
    /** De `carriedOver`, cuántos se aparearon por contenido/ubicación y no por id. */
    readonly rekeyed: number;
    readonly absorbed: number;
    /** **OLA BD** — filas de `partiallyIntroduced`. Ver ese campo. */
    readonly partiallyIntroduced: number;
    readonly inTouchedFiles: number;
    /** De (B), cuántos ya estaban. `inTouchedFiles - introducedInTouchedFiles`. */
    readonly preexistingInTouchedFiles: number;
    readonly introducedInTouchedFiles: number;
    readonly changedFiles: number;
    /** De `introduced`, cuántos caen en un grupo de atribución no confiable. */
    readonly unreliablyAttributed: number;
  };

  readonly cost: ComparisonCost;

  /** Los dos análisis completos, por si el consumidor quiere más que las vistas. */
  readonly baseAnalysis: CodeAnalysis;
  readonly headAnalysis: CodeAnalysis;
}

/**
 * `analyzeRepo` en frío. El default de `CompareOptions.analyze`: sin base de
 * datos, sin estado — el motor puede comparar sin que exista un sqlite.
 */
const coldAnalyze: AnalyzeFn = ({ dir, repoName }) => analyzeRepo({ dir, repoName });

/**
 * Normaliza una ruta de hallazgo a la misma forma que devuelve
 * `changedFilesSince`: relativa a `dir`, con `/`.
 *
 * No es paranoia de más: `CodeLocation.file` viene de `collectFiles`, que
 * concatena con `/` — pero un consumidor puede armar un `CodeFinding` a mano y
 * en Windows `path.join` mete `\`. Comparar dos convenciones distintas daría
 * intersección vacía **sin error visible**, que es el peor modo de fallar.
 */
function normalizeRel(p: string): string {
  return p.split(path.sep).join("/").replace(/^\.\//, "");
}

/** `(archivo, símbolo)` de una ubicación, en la clave interna. */
function claveDeSitio(file: string, symbol: string | undefined): string {
  return [normalizeRel(file), symbol ?? ""].join("\u0000");
}

/** `archivo#símbolo` — la forma en que una ubicación se PUBLICA. */
function etiquetaDeSitio(file: string, symbol: string | undefined): string {
  return `${normalizeRel(file)}#${symbol ?? ""}`;
}

/**
 * **OLA BD** — QUÉ SITIOS TENÍA CUBIERTOS EL BASE, POR `kind`.
 *
 * El índice se arma por `kind` y no global a propósito: la pregunta que hay que
 * poder contestar es *"¿el base tenía un `complexity` en `children.js#normalizar`?"*
 * y no *"¿el base sabía que ese símbolo existe?"*. Un símbolo que ya existía en
 * el código pero que no emitía este `kind` y ahora sí, es un problema nuevo
 * igual — lo que cambió es que ahora está.
 */
function sitiosPorKind(analysis: CodeAnalysis): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const f of analysis.findings) {
    let s = m.get(f.kind);
    if (!s) {
      s = new Set<string>();
      m.set(f.kind, s);
    }
    for (const l of f.locations) s.add(claveDeSitio(l.file, l.symbol));
  }
  return m;
}

/** Las ubicaciones de `f` que el base no cubría con este `kind`, ya publicables. */
function sitiosNuevos(f: CodeFinding, delBase: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const conocidos = delBase.get(f.kind);
  const out: string[] = [];
  for (const l of f.locations) {
    if (!conocidos?.has(claveDeSitio(l.file, l.symbol))) {
      const etiqueta = etiquetaDeSitio(l.file, l.symbol);
      if (!out.includes(etiqueta)) out.push(etiqueta);
    }
  }
  return out;
}

/**
 * LOS IDS DE UN ANÁLISIS. `analyzeRepo` ya estampa `id` (vía `conIdsEstables`),
 * así que el `??` es sólo la red para un `CodeAnalysis` cacheado de antes de
 * que ese campo existiera: una fila sin id no puede aparearse con nada, y
 * tratarla como "nueva" sería inventar. Se cuentan aparte.
 */
function indexById(analysis: CodeAnalysis): { byId: Map<string, CodeFinding>; withoutId: CodeFinding[] } {
  const byId = new Map<string, CodeFinding>();
  const withoutId: CodeFinding[] = [];
  for (const f of analysis.findings) {
    if (f.id) byId.set(f.id, f);
    else withoutId.push(f);
  }
  return { byId, withoutId };
}

/**
 * Compara el árbol de `dir` contra el ref `baseRef`.
 *
 * Cuesta DOS análisis, y eso no se puede evitar para la vista (A): saber si un
 * hallazgo existía antes exige haber analizado el "antes". La vista (B), en
 * cambio, es **barata** — sale de un `git diff --name-only` y la ubicación de
 * cada hallazgo del análisis que ya se tenía. Si un consumidor sólo quiere (B),
 * `findingsInFiles` de abajo se la da sin materializar ningún worktree.
 */
export async function compareAgainstRef(opts: CompareOptions): Promise<ComparisonResult> {
  const t0 = Date.now();
  const { dir, baseRef, repoName } = opts;
  const analyze = opts.analyze ?? coldAnalyze;

  if (!(await isGitCheckout(dir))) {
    throw new Error(`no es un checkout de git, no hay contra qué comparar: ${dir}`);
  }

  const base = await resolveBaseCommit(dir, baseRef, { mergeBase: opts.mergeBase });
  const head = await describeWorkingTree(dir);

  const tDiff = Date.now();
  const changedFiles = await changedFilesSince(dir, base.commit);
  const diffMs = Date.now() - tDiff;

  // El análisis del árbol ACTUAL primero: si el usuario cancela, o si el
  // worktree base falla, al menos se pagó lo que sirve para las dos vistas.
  const tHead = Date.now();
  const headAnalysis = await analyze({ dir, repoName });
  const headAnalysisMs = Date.now() - tHead;

  let worktreeMs = 0;
  let baseAnalysisMs = 0;
  const tWorktree = Date.now();
  const baseAnalysis = await withRefWorktree(
    dir,
    base.commit,
    async (worktreePath) => {
      worktreeMs = Date.now() - tWorktree;
      const tBase = Date.now();
      const out = await analyze({ dir: worktreePath, repoName });
      baseAnalysisMs = Date.now() - tBase;
      return out;
    },
    { scratchDir: opts.scratchDir, onCleanupFailure: opts.onCleanupFailure },
  );

  const result = diffAnalyses(baseAnalysis, headAnalysis, changedFiles);

  return {
    repoName,
    baseRef,
    baseCommit: base.commit,
    mergeBaseUsed: base.mergeBaseUsed,
    ...(base.mergeBaseFallback ? { mergeBaseFallback: base.mergeBaseFallback } : {}),
    headCommit: head.headCommit,
    headDirty: head.dirty,
    changedFiles,
    ...result,
    cost: {
      worktreeMs,
      baseAnalysisMs,
      headAnalysisMs,
      diffMs,
      totalMs: Date.now() - t0,
    },
    baseAnalysis,
    headAnalysis,
  };
}

/**
 * LA RESTA, SIN GIT NI DISCO — la parte pura, y por eso está exportada aparte:
 * es la que se puede testear sin materializar nada y la que un consumidor con
 * dos `CodeAnalysis` ya en la mano (dos snapshots cacheados, por ejemplo) puede
 * llamar directo.
 */
export function diffAnalyses(
  baseAnalysis: CodeAnalysis,
  headAnalysis: CodeAnalysis,
  changedFiles: readonly string[],
): Pick<
  ComparisonResult,
  | "introduced"
  | "inTouchedFiles"
  | "resolved"
  | "carriedOver"
  | "absorbed"
  | "partiallyIntroduced"
  | "counts"
  | "unreliableAttribution"
> {
  const emparejados = emparejar(baseAnalysis, headAnalysis);
  const { introduced, resolved, carriedOver, absorbed } = emparejados;

  const introducedIds = new Set(introduced.map((f) => f.id!));

  // OLA BD — LO QUE EL EMPAREJAMIENTO SE TRAGÓ EN LA DIRECCIÓN CONTRARIA.
  // Se recorre `headAnalysis.findings` y no `carriedOver` para que la lista
  // salga en el ORDEN DEL RANKING, igual que `introduced` (`carriedOver` sale
  // en orden de pase, que no es un criterio que el usuario haya pedido).
  const sitiosDelBase = sitiosPorKind(baseAnalysis);
  const nuevosPorHallazgo = new Map<CodeFinding, readonly string[]>();
  const apareados = new Set(carriedOver.map((c) => c.after));
  const partiallyIntroduced: PartiallyIntroducedFinding[] = [];
  for (const f of headAnalysis.findings) {
    const nuevos = sitiosNuevos(f, sitiosDelBase);
    nuevosPorHallazgo.set(f, nuevos);
    if (nuevos.length > 0 && apareados.has(f)) partiallyIntroduced.push({ finding: f, newLocations: nuevos });
  }

  const changed = new Set(changedFiles.map(normalizeRel));
  const inTouchedFiles: TouchedFinding[] = [];
  for (const f of headAnalysis.findings) {
    const touchedFiles = [...new Set(f.locations.map((l) => normalizeRel(l.file)))].filter((p) => changed.has(p));
    if (touchedFiles.length === 0) continue;
    inTouchedFiles.push({
      finding: f,
      alsoIntroduced: f.id ? introducedIds.has(f.id) : false,
      newLocations: nuevosPorHallazgo.get(f) ?? [],
      touchedFiles,
    });
  }

  const introducedInTouchedFiles = inTouchedFiles.filter((t) => t.alsoIntroduced).length;
  const unreliableAttribution = anchorsWithSiblings(baseAnalysis, headAnalysis, introduced, partiallyIntroduced);

  return {
    introduced,
    inTouchedFiles,
    resolved,
    carriedOver,
    absorbed,
    partiallyIntroduced,
    unreliableAttribution,
    counts: {
      base: baseAnalysis.findings.length,
      head: headAnalysis.findings.length,
      introduced: introduced.length,
      resolved: resolved.length,
      carriedOver: carriedOver.length,
      rekeyed: emparejados.rekeyed,
      absorbed: absorbed.length,
      partiallyIntroduced: partiallyIntroduced.length,
      inTouchedFiles: inTouchedFiles.length,
      preexistingInTouchedFiles: inTouchedFiles.length - introducedInTouchedFiles,
      introducedInTouchedFiles,
      changedFiles: changedFiles.length,
      unreliablyAttributed: unreliableAttribution.introduced,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EL EMPAREJAMIENTO — POR QUÉ EL ID SOLO NO ALCANZA, MEDIDO SOBRE UN REPO REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La resta por conjunto de ids es la operación correcta y sigue siendo el
 * primer pase. Pero el id **no es estable ante todo cambio**, y esto no es una
 * hipótesis: es un caso medido sobre `preact` (informe BC2 §3.4).
 *
 * SE AGREGÓ UNA FUNCIÓN NUEVA a `src/diff/children.js`. Eso empujó al
 * AGRUPAMIENTO de F5 a colapsar los CINCO `complexity` del archivo en UN solo
 * hallazgo agrupado (`memberCount: 5`) cuyas `locations` son la unión de las
 * cinco. Y `stableFindingId` hashea **todas** las ubicaciones — su propio
 * contrato: *"un detector que empieza a adjuntar una ubicación secundaria …
 * cambia el hash entero"*. Resultado de la resta cruda por id:
 *
 *   introduced: 3   ← una de las tres es el grupo, que YA EXISTÍA como fila
 *   resolved:   4   ← las otras cuatro NO se arreglaron: se las comió el grupo
 *
 * O sea: la herramienta le habría dicho al usuario *"introdujiste una
 * complejidad de 71 en `constructNewChildrenArray`"* (falso: ya estaba) y
 * *"arreglaste cuatro complejidades"* (falso: siguen ahí). **Cinco de siete
 * filas mentían.** Es exactamente la mentira que este módulo existe para no
 * decir, así que el emparejamiento no se queda en el id.
 *
 * CUATRO PASES, cada uno sobre lo que el anterior no pudo aparear:
 *
 *  1. **POR ID.** `stableFindingId`, la identidad de la que cuelgan los
 *     descartes. Es la que manda cuando resuelve.
 *  2. **POR CONTENIDO EXACTO** — `contentKeyForFinding`, o sea
 *     `(kind, archivo, símbolo, título)`. Esta función NO se inventa acá: existe
 *     en `code-finding-ids.ts` desde la Ola AI para exactamente esta pregunta
 *     ("qué fila vieja corresponde a qué hallazgo vivo") y su docstring
 *     documenta el caso `demeter-chain` de preact, que es el mismo defecto.
 *     Sólo se aplica cuando la clave es ÚNICA de los dos lados.
 *  3. **POR UBICACIÓN** — `(kind, archivo, símbolo)` de la ubicación
 *     principal, también sólo cuando es única de los dos lados. Es el pase que
 *     aparea un hallazgo **cuya métrica cambió** (el `title` lleva la métrica
 *     adentro: "ocupa 59 líneas"), y por eso es imprescindible para que "la
 *     función se hizo más larga" no se reporte como "introdujiste una función
 *     larga".
 *  4. **ABSORCIÓN.** Lo que quedó del lado del base y cuya ubicación
 *     `(archivo, símbolo)` SIGUE estando dentro de las ubicaciones de un
 *     hallazgo del mismo `kind` en el análisis actual **no se arregló**: se lo
 *     comió un grupo. Sale por `absorbed`, no por `resolved`.
 *
 * LO QUE NO SE HACE, a propósito: aparear a la fuerza donde la clave se repite
 * (varios `duplication` con `symbol` vacío en el mismo archivo). Ahí no hay
 * forma de saber cuál es cuál, y adivinar sería volver a mentir; esos casos los
 * declara `unreliableAttribution`.
 */
interface Emparejamiento {
  introduced: CodeFinding[];
  resolved: CodeFinding[];
  carriedOver: CarriedOverFinding[];
  absorbed: AbsorbedFinding[];
  /** Cuántos pares salieron de los pases 2 y 3, o sea con el id cambiado. */
  rekeyed: number;
}

/** Índice `clave -> fila`, dejando fuera las claves repetidas: aparear una clave ambigua sería adivinar. */
function indiceUnico<T>(items: readonly T[], clave: (t: T) => string): Map<string, T> {
  const cuenta = new Map<string, number>();
  for (const it of items) cuenta.set(clave(it), (cuenta.get(clave(it)) ?? 0) + 1);
  const m = new Map<string, T>();
  for (const it of items) if (cuenta.get(clave(it)) === 1) m.set(clave(it), it);
  return m;
}

/** `(kind, archivo, símbolo)` de la ubicación principal — la clave del pase 3. */
function claveDeUbicacion(f: CodeFinding): string {
  const l = f.locations[0];
  return [f.kind, normalizeRel(l?.file ?? ""), l?.symbol ?? ""].join("\u0000");
}

function emparejar(baseAnalysis: CodeAnalysis, headAnalysis: CodeAnalysis): Emparejamiento {
  const base = indexById(baseAnalysis);
  const carriedOver: CarriedOverFinding[] = [];
  let rekeyed = 0;

  // ── Pase 1: por id ─────────────────────────────────────────────────────
  // Se recorre `headAnalysis.findings`, NO el Map: así las vistas salen en el
  // ORDEN DEL RANKING que el analizador ya calculó (`score`), y no en orden de
  // inserción de un `Map`. Re-ordenar acá sería inventar un criterio nuevo.
  const headSinAparear: CodeFinding[] = [];
  const apareadasDelBase = new Set<CodeFinding>();
  for (const f of headAnalysis.findings) {
    if (!f.id) continue; // sin id no puede aparearse con nada; ver `indexById`
    const before = base.byId.get(f.id);
    if (before) {
      carriedOver.push({ id: f.id, before, after: f });
      apareadasDelBase.add(before);
    } else headSinAparear.push(f);
  }
  let baseSinAparear = baseAnalysis.findings.filter((f) => f.id && !apareadasDelBase.has(f));

  // ── Pases 2 y 3: por contenido y por ubicación, sólo donde no hay ambigüedad ──
  for (const clave of [contentKeyForFinding, claveDeUbicacion]) {
    if (headSinAparear.length === 0 || baseSinAparear.length === 0) break;
    const idxBase = indiceUnico(baseSinAparear, clave);
    const idxHead = indiceUnico(headSinAparear, clave);
    const usadasBase = new Set<CodeFinding>();
    const quedanHead: CodeFinding[] = [];
    for (const f of headSinAparear) {
      const k = clave(f);
      const before = idxHead.get(k) === f ? idxBase.get(k) : undefined;
      if (before) {
        carriedOver.push({ id: f.id!, before, after: f });
        usadasBase.add(before);
        rekeyed++;
      } else quedanHead.push(f);
    }
    headSinAparear.length = 0;
    headSinAparear.push(...quedanHead);
    baseSinAparear = baseSinAparear.filter((f) => !usadasBase.has(f));
  }

  // ── Pase 4: absorción por agrupamiento ─────────────────────────────────
  // ¿La ubicación de esta fila del base sigue teniendo un hallazgo del MISMO
  // kind en el análisis actual? Entonces no se arregló.
  const ubicacionesPorKind = new Map<string, CodeFinding>();
  for (const f of headAnalysis.findings) {
    for (const l of f.locations) {
      const k = [f.kind, normalizeRel(l.file), l.symbol ?? ""].join("\u0000");
      if (!ubicacionesPorKind.has(k)) ubicacionesPorKind.set(k, f);
    }
  }
  const absorbed: AbsorbedFinding[] = [];
  const resolved: CodeFinding[] = [];
  for (const f of baseSinAparear) {
    const into = ubicacionesPorKind.get(claveDeUbicacion(f));
    if (into) absorbed.push({ before: f, into });
    else resolved.push(f);
  }

  return { introduced: headSinAparear, resolved, carriedOver, absorbed, rekeyed };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LA ATRIBUCIÓN NO CONFIABLE — LO QUE ESTA COMPARACIÓN NO PUEDE AFIRMAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO, no razonado (fixture `ord/anon`, informe BC2 §3.3). Un archivo con
 * TRES funciones anónimas largas emite tres `long-function` y tres `complexity`
 * que comparten `(kind, archivo, símbolo="(anónima)")`. `code-finding-ids.ts`
 * los desempata por ORDEN DE LECTURA: el primero conserva el id del ancla y el
 * k-ésimo recibe `idPorOrdinalDeLectura(f, k)`. Su propio docstring declara la
 * debilidad: *"insertar un hallazgo del mismo kind POR ENCIMA de los
 * colisionados les corre el ordinal"*.
 *
 * Se agregó UNA función anónima ARRIBA de las tres. Resultado exacto:
 *
 *   introduced = 2   ← el CONTEO es correcto (la función nueva emite 2)
 *   resolved   = 0
 *   los 6 emparejamientos de `carriedOver`: LOS 6 MAL
 *     long-function 49 → 64,  complexity 45 → 60,  complexity 55 → 50, …
 *
 * O sea: la herramienta diría *"introdujiste la anónima de 59 líneas"* cuando
 * el usuario introdujo la de 64. **El número está bien y el dedo apunta a la
 * fila equivocada** — y eso, en una herramienta cuyo valor entero es "esto lo
 * hiciste vos", es peor que no contestar.
 *
 * POR QUÉ NO SE ARREGLA ACÁ. El id lo acuña `code-analyzer.ts` vía
 * `conIdsEstables`, y es el MISMO id del que cuelgan los descartes del panel y
 * las planillas de precisión. Cambiar cómo se reparte dentro de un grupo movería
 * `census-golden`/`ranking-acceptance` — y esta ola es un refactor donde el
 * comportamiento no puede cambiar. Reconciliar acá por contenido tampoco es
 * gratis: la clave que serviría (`contentKeyForFinding`) incluye `title`, y el
 * `title` de estos kinds LLEVA LA MÉTRICA ADENTRO ("ocupa 59 líneas"), así que
 * emparejar por ella rompería justamente la vista de "los empeorados", donde la
 * métrica es lo que cambia. Es una decisión de diseño con costo, no un olvido.
 *
 * LO QUE SÍ SE HACE: DECIRLO. `unreliableAttribution` marca los grupos y los
 * ids afectados para que el consumidor no presente como certeza lo que no lo
 * es. Callarlo sería exactamente la mentira que este archivo existe para no
 * decir.
 *
 * OLA BD — ESTA SEÑAL CUBRE **DOS** MOTIVOS, NO UNO. Al de arriba (la rotación
 * de ordinales: el conteo está bien y el dedo apunta a la fila equivocada) se le
 * suma el de `partiallyIntroduced` (el hallazgo se apareó con el base y trae una
 * ubicación que el base no tenía: la fila se presenta como vieja y una parte no
 * lo es). Los dos son "no puedo afirmar qué es nuevo acá", así que van a la
 * misma lista de ids — y cada uno además tiene su propio conteo, porque el
 * arreglo de cada uno es distinto.
 */
function anchorsWithSiblings(
  baseAnalysis: CodeAnalysis,
  headAnalysis: CodeAnalysis,
  introduced: readonly CodeFinding[],
  partiallyIntroduced: readonly PartiallyIntroducedFinding[],
): ComparisonResult["unreliableAttribution"] {
  // El ancla SIN desempatar: `stableFindingId` se recalcula de
  // `(kind, ubicaciones)`, así que devuelve el id ORIGINAL del grupo aunque
  // `conIdsEstables` ya le haya reescrito el `id` a la fila.
  const contar = (a: CodeAnalysis): Map<string, { n: number; f: CodeFinding }> => {
    const m = new Map<string, { n: number; f: CodeFinding }>();
    for (const f of a.findings) {
      const ancla = stableFindingId(f);
      const prev = m.get(ancla);
      if (prev) prev.n += 1;
      else m.set(ancla, { n: 1, f });
    }
    return m;
  };
  const enBase = contar(baseAnalysis);
  const enHead = contar(headAnalysis);

  const groups: AttributionGroup[] = [];
  const anclasAfectadas = new Set<string>();
  for (const [ancla, { n, f }] of enHead) {
    const nBase = enBase.get(ancla)?.n ?? 0;
    // Un ancla con UN solo miembro de los dos lados no pasó por el desempate
    // por ordinal: su id es el del ancla y punto. Sólo los grupos son frágiles.
    if (n < 2 && nBase < 2) continue;
    anclasAfectadas.add(ancla);
    groups.push({
      kind: f.kind,
      file: f.locations[0]?.file ?? "",
      symbol: f.locations[0]?.symbol ?? "",
      baseCount: nBase,
      headCount: n,
    });
  }
  for (const [ancla, { n, f }] of enBase) {
    if (n < 2 || anclasAfectadas.has(ancla)) continue;
    anclasAfectadas.add(ancla);
    groups.push({
      kind: f.kind,
      file: f.locations[0]?.file ?? "",
      symbol: f.locations[0]?.symbol ?? "",
      baseCount: n,
      headCount: enHead.get(ancla)?.n ?? 0,
    });
  }

  const parciales = new Set(partiallyIntroduced.map((p) => p.finding));
  const ids: string[] = [];
  for (const f of headAnalysis.findings) {
    if (f.id && (anclasAfectadas.has(stableFindingId(f)) || parciales.has(f))) ids.push(f.id);
  }
  const afectados = new Set(ids);
  return {
    groups,
    ids,
    introduced: introduced.filter((f) => f.id && afectados.has(f.id)).length,
    partiallyIntroduced: partiallyIntroduced.length,
  };
}

/**
 * SÓLO LA VISTA (B), SIN EL SEGUNDO ANÁLISIS.
 *
 * Es la mitad barata de la comparación y merece existir sola: un `git diff
 * --name-only` (milisegundos) sobre un `CodeAnalysis` que el consumidor ya
 * tiene. Un panel que ya muestra el análisis de la tarea puede agregar "sólo lo
 * de los archivos que toqué" sin pagar NADA de lo que cuesta la vista (A).
 *
 * Lo que NO puede decir, y por eso devuelve `alsoIntroduced: false` en todo:
 * **si un hallazgo es nuevo o no**. Eso exige el análisis del base. Devolver
 * `false` no es una suposición ("estaba antes"), es el valor que corresponde a
 * "esta vista no lo sabe" — y por eso el campo se llama `alsoIntroduced` y no
 * `preexisting`: afirmar lo que no se midió es justo lo que esta ola no hace.
 *
 * Por el mismo motivo, y desde la Ola BD, deja `newLocations` en `undefined` en
 * vez de en `[]`: `[]` diría "medí y no hay ninguna ubicación nueva", que es
 * una afirmación, y acá no se midió nada.
 */
export async function findingsInTouchedFiles(
  dir: string,
  baseRef: string,
  analysis: CodeAnalysis,
  opts?: { readonly mergeBase?: boolean },
): Promise<{ changedFiles: string[]; inTouchedFiles: TouchedFinding[]; baseCommit: string }> {
  const base = await resolveBaseCommit(dir, baseRef, { mergeBase: opts?.mergeBase });
  const changedFiles = await changedFilesSince(dir, base.commit);
  return { changedFiles, inTouchedFiles: findingsInFiles(analysis, changedFiles), baseCommit: base.commit };
}

/** La parte pura de la vista (B): intersecar ubicaciones con una lista de archivos. */
export function findingsInFiles(analysis: CodeAnalysis, files: readonly string[]): TouchedFinding[] {
  const changed = new Set(files.map(normalizeRel));
  const out: TouchedFinding[] = [];
  for (const f of analysis.findings) {
    const touchedFiles = [...new Set(f.locations.map((l) => normalizeRel(l.file)))].filter((p) => changed.has(p));
    if (touchedFiles.length > 0) out.push({ finding: f, alsoIntroduced: false, touchedFiles });
  }
  return out;
}
