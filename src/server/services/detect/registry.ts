/**
 * LA LISTA — el ÚNICO archivo compartido que un detector nuevo toca.
 *
 * Detector nuevo = 1 archivo bajo `intra-function/`, `intra-file/` o
 * `inter-file/`, con su `<id>.test.ts` y sus fixtures, y acá UNA línea de
 * `import` y UNA línea en el array, ambas ordenadas alfabéticamente por `id`.
 * Dos agentes que agregan detectores distintos chocan como máximo en dos
 * líneas contiguas y el merge es trivial.
 *
 * EL SEGUNDO PUNTO DE CHOQUE, YA RESUELTO. Hasta la Ola 1, `DetectorBase.kind`
 * tipaba contra `CodeFindingKind` (`src/shared/types.ts`), una unión CERRADA
 * de 8 valores: un detector cuyo problema era genuinamente nuevo — la norma,
 * con un catálogo de ~39 problemas — tenía que agregar su variante a
 * `shared/types.ts`, el contrato compartido servidor↔frontend, y con muchos
 * agentes en paralelo ESE archivo era la superficie de choque real. Se
 * invirtió la dirección:
 *
 *   1. `CodeFindingKind` es ahora una unión ABIERTA (`Known… | (string & {})`);
 *      nadie da de alta un kind ahí.
 *   2. Cada detector declara su propio literal como parámetro de tipo
 *      (`IntraFileDetector<"memberCount", "large-class">`).
 *   3. Este arreglo se escribe con `as const satisfies`, así que los literales
 *      SOBREVIVEN y la unión de kinds registrados se DERIVA de acá
 *      (`RegisteredFindingKind`, abajo) — el registro es la fuente de verdad
 *      del catálogo, no `shared/types.ts`.
 *   4. El catálogo con etiqueta humana para la UI sale de `kinds.ts`, también
 *      derivado de este arreglo.
 *
 * El `satisfies` (en vez de una anotación `: readonly Detector[]`) es
 * deliberado y NO es cosmético: una anotación ensancharía `kind` a `string` y
 * el paso 3 dejaría de funcionar en silencio. Sigue chequeando, igual que la
 * anotación, que cada entrada es un `Detector` válido.
 *
 * F1: los primeros tres detectores reales — `empty-catch`, `large-class`,
 * `repeated-switch` — entraron acá para validar el contrato antes de que la
 * migración de los 5 detectores existentes construyera encima.
 *
 * P9: los 5 detectores que hasta entonces vivían dentro de
 * `code-analyzer.ts` (`complexity`, `conditional-chain`, `duplication`,
 * `long-function`, `long-parameter-list`) se suman acá. `code-analyzer.ts`
 * NO corre el registro (`runDetectors`) todavía — sigue sin existir la
 * canalización real de `FileUnit[]`/`RepoUnit` con árboles vivos que ese
 * runner necesita (ver el docstring de `run.ts`) — pero SÍ importa y llama
 * las mismas funciones puras de construcción de hallazgo que cada uno de
 * estos módulos exporta (`buildComplexityFinding`, etc.), así que la salida
 * de producción es literalmente el mismo código que corre acá, no una copia.
 *
 * OLA AW — PRIMERA VEZ QUE ESTE ARREGLO PIERDE ENTRADAS, NO SÓLO GANA.
 * `coupling-without-abstraction`, `demeter-chain`, `divergent-change`,
 * `feature-envy-inter`, `inappropriate-intimacy`, `shotgun-surgery`,
 * `speculative-abstraction` y `unused-variable` se DESREGISTRARON (0-20 %
 * de precisión, ninguna hipótesis los ancla — verificado ancla por ancla, no
 * por memoria). Los ocho archivos y sus tests QUEDAN EN DISCO, con su razón
 * completa en `registries.test.ts#DELIBERATELY_UNREGISTERED` — mismo
 * precedente que `enumerated-field-dispatch` (Ola AC) y `data-class`
 * (Ola AU). Ver `ola-aw/informes/guardian.md`.
 *
 * OLA AX — TRES BAJAS MÁS, dos por precisión y una por mudez estructural,
 * ninguna arriesga a las 32 hipótesis registradas (medido, no leído — ver
 * `ola-ax/informes/guardian.md`). `feature-envy-intra` (AX8: re-medido
 * abriendo el archivo, 1/81 = 1,2 % — las dos compuertas que el encargo
 * pedía, "el método escribe al proveedor" y "el proveedor es un campo",
 * quedaron REFUTADAS sobre sujetos frescos) y `middle-man` (AX6: el cable de
 * `code-analyzer.ts` que lo dejaba en 0 hallazgos en 21 repos de historia SE
 * ARREGLÓ en esta misma ola —`buildRepoFunctionUnits`, más abajo— y con el
 * cable puesto mide 0/36 = 0 % en los seis lenguajes: no era un detector
 * mudo, era uno que erraba siempre) se DESREGISTRAN por PRECISIÓN.
 * `parallel-hierarchies` (AX8: 0 hallazgos en 16 repos re-verificados; es
 * ancla de `template-method` —CONGELADO— y de `form-template-method`, pero
 * al no emitir no les aporta ni les puede haber aportado una sola
 * propuesta) se DESREGISTRA por INÚTIL, no por malo. Los tres archivos y
 * sus tests QUEDAN EN DISCO, con su razón completa en
 * `registries.test.ts#DELIBERATELY_UNREGISTERED`.
 */
import { detector as argumentMutation } from "./intra-function/argument-mutation.js";
import { detector as booleanComplexity } from "./intra-function/boolean-complexity.js";
import { detector as booleanFlagParam } from "./intra-function/boolean-flag-param.js";
import { detector as commentedOutCode } from "./intra-file/commented-out-code.js";
import { detector as complexity } from "./intra-function/complexity.js";
import { detector as concreteOverAbstraction } from "./inter-file/concrete-over-abstraction.js";
import { detector as conditionalChain } from "./intra-function/conditional-chain.js";
import { detector as dataClump } from "./intra-file/data-clump.js";
import { detector as dependencyCycle } from "./inter-file/dependency-cycle.js";
import { detector as distributedDuplication } from "./inter-file/distributed-duplication.js";
import { detector as duplication } from "./inter-file/duplication.js";
import { detector as emptyCatch } from "./intra-function/empty-catch.js";
import { detector as exclusiveDispatchLadder } from "./intra-file/exclusive-dispatch-ladder.js";
import { detector as exposedContainerTraversal } from "./intra-file/exposed-container-traversal.js";
import { detector as fanoutWithoutCohesion } from "./inter-file/fanout-without-cohesion.js";
import { detector as flagAccumulator } from "./intra-function/flag-accumulator.js";
import { detector as godComponent } from "./inter-file/god-component.js";
import { detector as hardWiredNotification } from "./intra-file/hard-wired-notification.js";
import { detector as hardwiredSubtypeCombination } from "./inter-file/hardwired-subtype-combination.js";
import { detector as homonymousDelegation } from "./intra-file/homonymous-delegation.js";
import { detector as homonymousDivergentConstruction } from "./inter-file/homonymous-divergent-construction.js";
import { detector as homonymousDivergentSequence } from "./intra-file/homonymous-divergent-sequence.js";
import { detector as importDepthDemeter } from "./inter-file/import-depth-demeter.js";
import { detector as inheritanceFamily } from "./intra-file/inheritance-family.js";
import { detector as invariantScaffoldVaryingCall } from "./inter-file/invariant-scaffold-varying-call.js";
import { detector as largeClass } from "./intra-file/large-class.js";
import { detector as layerSkip } from "./inter-file/layer-skip.js";
import { detector as lazyInitRepetida } from "./intra-file/lazy-init-repetida.js";
import { detector as longFunction } from "./intra-function/long-function.js";
import { detector as longParameterList } from "./intra-function/long-parameter-list.js";
import { detector as manualNotification } from "./intra-file/manual-notification.js";
import { detector as manyReturns } from "./intra-function/many-returns.js";
import { detector as optionalBehaviorFlags } from "./intra-file/optional-behavior-flags.js";
import { detector as optionalConstructionCombinations } from "./inter-file/optional-construction-combinations.js";
import { detector as orphanFile } from "./inter-file/orphan-file.js";
import { detector as primitiveObsession } from "./intra-file/primitive-obsession.js";
import { detector as recursiveCollectionDescent } from "./intra-file/recursive-collection-descent.js";
import { detector as refusedBequest } from "./intra-file/refused-bequest.js";
import { detector as repeatedAbsenceCheck } from "./inter-file/repeated-absence-check.js";
import { detector as repeatedAccessControl } from "./intra-file/repeated-access-control.js";
import { detector as repeatedCollaboratorSet } from "./inter-file/repeated-collaborator-set.js";
import { detector as repeatedConfiguredAssembly } from "./intra-file/repeated-configured-assembly.js";
import { detector as repeatedSwitch } from "./intra-file/repeated-switch.js";
import { detector as scatteredInstantiation } from "./inter-file/scattered-instantiation.js";
import { detector as selfReferentialMember } from "./intra-file/self-referential-member.js";
import { detector as temporaryField } from "./intra-file/temporary-field.js";
import { detector as typeSwitch } from "./intra-function/type-switch.js";
import { detector as unreachableCode } from "./intra-function/unreachable-code.js";
import { detector as unstableDependency } from "./inter-file/unstable-dependency.js";
import { detector as unusedSymbol } from "./inter-file/unused-symbol.js";
import type { Detector } from "./types.js";

export const DETECTORS = [
  argumentMutation,
  booleanComplexity,
  booleanFlagParam,
  commentedOutCode,
  complexity,
  concreteOverAbstraction,
  conditionalChain,
  dataClump,
  dependencyCycle,
  distributedDuplication,
  duplication,
  emptyCatch,
  exclusiveDispatchLadder,
  exposedContainerTraversal,
  fanoutWithoutCohesion,
  flagAccumulator,
  godComponent,
  hardWiredNotification,
  hardwiredSubtypeCombination,
  homonymousDelegation,
  homonymousDivergentConstruction,
  homonymousDivergentSequence,
  importDepthDemeter,
  inheritanceFamily,
  invariantScaffoldVaryingCall,
  largeClass,
  layerSkip,
  lazyInitRepetida,
  longFunction,
  longParameterList,
  manualNotification,
  manyReturns,
  optionalBehaviorFlags,
  optionalConstructionCombinations,
  orphanFile,
  primitiveObsession,
  recursiveCollectionDescent,
  refusedBequest,
  repeatedAbsenceCheck,
  repeatedAccessControl,
  repeatedCollaboratorSet,
  repeatedConfiguredAssembly,
  repeatedSwitch,
  scatteredInstantiation,
  selfReferentialMember,
  temporaryField,
  typeSwitch,
  unreachableCode,
  unstableDependency,
  unusedSymbol,
] as const satisfies readonly Detector[];

/**
 * La unión de `kind`s que el registro puede emitir, DERIVADA del arreglo de
 * arriba. Agregar un detector la extiende sola; nadie la escribe a mano y no
 * hay un segundo lugar que mantener sincronizado.
 */
export type RegisteredFindingKind = (typeof DETECTORS)[number]["kind"];
