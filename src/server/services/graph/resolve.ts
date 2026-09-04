/**
 * La cascada de resolución completa — CONTRATO-F3.md §3.3/§3.5.
 *
 * `resolveReferences` es el MOTOR: recorre cada candidato por la lista de
 * `ResolutionStage`s EN EL ORDEN que ellas declaran (`stage.order`), threading
 * el `ResolutionCandidate` narrowed de una etapa a la siguiente, hasta que
 * alguna etapa emite un veredicto TERMINAL (`accept`/`reject`) o se acaban
 * las etapas. Invariante de medibilidad (CONTRATO-F3.md §3.3, con test en
 * `resolve.test.ts`): todo candidato cae en EXACTAMENTE un evento terminal
 * atribuido a EXACTAMENTE una etapa (`accept`/`reject`) o, si ninguna etapa
 * decidió nunca, en `droppedAmbiguous` (>1 target sobrevivió) o `unresolved`
 * (0 targets sobrevivieron) — nunca ambas, nunca ninguna.
 *
 * ── POR QUÉ EL ORDEN DE `ALL_STAGES` NO ES EL ORDEN DE APARICIÓN DE
 *    `ResolutionStageId` EN `stages.ts` ────────────────────────────────────
 *
 * El spike (`spikes/cascada-refs/RESULTADO.md`) corrió rol → miembro-de-clase
 * → namespace-léxico, EN ESE ORDEN, con la unicidad global como PRECONDICIÓN
 * (calculada antes que nada, no como paso final) — así es como mató la
 * colisión de `File`: el chequeo de alcance léxico (namespace léxico, hoy la
 * etapa `qualified-name`) corre DESPUÉS del filtro de rol/miembro pero es lo
 * que decide, no la unicidad. CONTRATO-F3.md's `ResolutionStageId` lista
 * `global-uniqueness` ANTES que `qualified-name`, pero interpretar eso como
 * "unicidad acepta primero, y sólo lo que unicidad no pudo decidir llega a
 * `qualified-name`" REABRE la colisión de `File`: hay EXACTAMENTE una
 * declaración de `File` en todo el repo (la clase propia), así que "unicidad
 * global" sola aceptaría las ~35 referencias al `File` de la stdlib ANTES de
 * que `qualified-name` tuviera oportunidad de rechazarlas por alcance léxico
 * incompatible. Medido, no supuesto: ver el bloque "verificación de diseño"
 * más abajo, que reproduce este caso exacto como test.
 *
 * La resolución: el contrato dice explícitamente que `order` es un campo que
 * CADA etapa declara ("Único, ascendente, sin huecos"), no que la posición
 * de listado del `type ResolutionStageId` en `stages.ts` sea la secuencia de
 * ejecución. Este archivo ordena así (comentado etapa por etapa abajo):
 *
 *   1 syntactic-role · 2 local-shadow · 3 class-member · 4 type-slot ·
 *   5 bare-constant-receiver · 6 self-receiver · 7 namespace-container ·
 *   8 qualified-name · 9 single-file-component · 10 module-reachability ·
 *   11 typeless-receiver · 12 global-uniqueness · 13 path-proximity
 *
 * `type-slot` (AA6, Ola AA) es la SEGUNDA narrowing puramente estructural
 * sobre la FORMA DECLARADA del destino, y por eso queda pegada a
 * `class-member`: las dos contestan "¿esta declaración PUEDE ser lo que este
 * sitio nombra?" mirando la forma del símbolo, sin alcance léxico ni receptor.
 * Corre temprano por el mismo argumento que ya sostiene la posición de
 * `qualified-name` y la de `module-reachability`: si corriera después,
 * `global-uniqueness` ya habría aceptado como `resolved` el caso exacto que la
 * motiva —un nombre escrito en la ranura de tipo cuyo único homónimo del repo
 * es una función— sin que la etapa llegara a mirarlo. Ver su docstring.
 *
 * `self-receiver` (C1, Ola U) es la SEGUNDA etapa que resuelve un receptor
 * escrito por su forma, hermana de `bare-constant-receiver`, y por eso queda
 * pegada a ella: las dos contestan "¿el receptor escrito nombra una unidad
 * concreta?" y las dos son terminales sobre subconjuntos DISJUNTOS
 * (constante desnuda / palabra reservada del objeto actual). Corre ANTES de
 * las etapas de narrowing —al revés que `typeless-receiver`, que corre
 * después— porque su criterio es una IDENTIDAD, no una preferencia entre
 * sobrevivientes: no gana nada con un conjunto más chico y sí puede perder
 * su único destino correcto si una narrowing pensada para nombres desnudos
 * se lo saca (el caso concreto es `single-file-component`). Ver su docstring.
 *
 * `typeless-receiver` (P1, Ola P) queda JUSTO ANTES de `global-uniqueness`
 * por el mismo argumento que ya sostiene la posición de `qualified-name` y la
 * de `module-reachability`, aplicado a un caso nuevo: un `x.miembro(...)` con
 * un solo homónimo en todo el repo NO es "dueño global único" — es "el único
 * candidato que este repo declara, que puede perfectamente no ser el
 * destino real, porque el receptor podría ser de un tipo de afuera". Si
 * corriera DESPUÉS, `global-uniqueness` ya lo habría aceptado como
 * `provenance: "resolved"` (una afirmación estructural cierta) y
 * `path-proximity` habría desempatado los de >1 destino como `"inferred"`.
 * Corre DESPUÉS de todas las etapas de narrowing (`namespace-container`,
 * `qualified-name`, `single-file-component`, `module-reachability`) porque
 * cuanto más chico sea el conjunto de destinos posibles, más información
 * lleva la arista ambigua que emite.
 *
 * `qualified-name` (alcance léxico, N1-b) corre ANTES de `global-uniqueness`
 * para que el caso `File` se resuelva donde el contrato dice que se resuelve
 * ("mata la colisión de 'File'"). `global-uniqueness` termina siendo, en la
 * práctica, "exactamente un target sobrevivió toda la narrowing anterior" —
 * el mismo resultado que el spike mide, sólo que expresado como su propia
 * etapa medible en vez de como precondición implícita de construcción de
 * candidatos. `path-proximity` queda ÚLTIMA, como desempate de lo que
 * `global-uniqueness` no pudo decidir solo (>1 target sobrevivió incluso
 * narrowed por alcance léxico) — la única etapa cuyo `provenance` de
 * aceptación es `"inferred"`, no `"resolved"`, porque es una heurística de
 * distancia de path, no una regla estructural cierta.
 *
 * `module-reachability` (B1, eslabón 2 — ORDEN-DE-ATAQUE.md #2) queda ANTES
 * de `global-uniqueness` A PROPÓSITO, no después: si corriera después,
 * `global-uniqueness` ya habría aceptado (`provenance: "resolved"`) todo
 * candidato con un solo dueño global sin que la etapa nueva llegara siquiera
 * a mirarlo — exactamente el mismo argumento que ya sostiene la posición de
 * `qualified-name`, aplicado acá: `global-uniqueness` sólo debe ver lo que
 * sobrevivió CADA narrowing estructural anterior, imports incluido. Corre
 * DESPUÉS de `qualified-name`/`single-file-component` porque ninguna de esas
 * dos necesita el grafo de imports para decidir lo que ya puede decidir
 * sola — `module-reachability` es un filtro ADICIONAL sobre lo que ellas
 * dejaron pasar, no un reemplazo.
 */
import { type CodeGraphEdge, type EdgeRole, edgeRoleBit, symbolNodeId } from "./types.js";
import {
  AMBIGUOUS_MAX_TARGETS,
  UNRESOLVED_REPORT_MAX_FILES,
  type ReferenceSite,
  type ResolutionCandidate,
  type ResolutionContext,
  type ResolutionStage,
  type ResolutionStageId,
  type ResolutionStageStat,
  type ResolutionStats,
  type ResolveOptions,
  type StageVerdict,
  type SymbolRef,
} from "./stages.js";
import type { ReferenceRole } from "./references.js";

function sameSymbolPath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * `declContainer` es un PREFIJO EXACTO de `useScope` (incluye igualdad): el
 * sitio de uso está textualmente adentro del cuerpo de la clase/módulo que
 * declara el símbolo (o de un cuerpo anidado más profundo dentro de ella).
 * A diferencia de `isVisibleFrom` (namespace léxico de CONSTANTES, abajo,
 * con sus 4 condiciones simétricas), esta es de UN SOLO SENTIDO a propósito:
 * un MÉTODO no se vuelve alcanzable por nombre desnudo sólo por estar
 * declarado en un namespace que ENGLOBA al sitio de uso (eso exigiría que la
 * clase contenedora del método sea ancestro de la clase del sitio de uso vía
 * herencia, dato que `ResolutionContext` no expone hoy) — únicamente sirve
 * para el caso contrario, donde el CUERPO que declara el método efectivamente
 * incluye, por anidamiento léxico, al sitio de uso. `classMemberStage` la usa
 * para el despacho implícito a `self` en Ruby (ver su docstring, "A3").
 */
function containerEnclosesScope(declContainer: readonly string[], useScope: readonly string[]): boolean {
  return declContainer.length <= useScope.length && declContainer.every((v, i) => v === useScope[i]);
}

/**
 * CONTRATO-F9.md §4.2 — "`to` = el primer candidato por orden total
 * determinista (`file`, después `symbolPath.join(".")`)". Usado para elegir
 * `to`/`alternatives` de una arista `ambiguous`: dos corridas sobre el mismo
 * repo tienen que emitir el mismo `to`, nunca "el primero que apareció" (que
 * depende del orden de `declarationsByName`, no garantizado estable entre
 * corridas de un `Map`).
 */
function bySymbolRefLex(a: SymbolRef, b: SymbolRef): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  const ap = a.symbolPath.join(".");
  const bp = b.symbolPath.join(".");
  return ap < bp ? -1 : ap > bp ? 1 : 0;
}

/**
 * CONTRATO-F8G.md §1 — el rol sintáctico que `references.ts#classifyRole`
 * calculó para el sitio de uso, llevado a la arista. `ReferenceRole` tiene 6
 * valores; `EdgeRole` sólo 3 (`bare`/`receiver-member`/`qualified`) porque los
 * otros tres (`decl-name`/`parameter`/`key`) son sitios de declaración/ruido
 * sintáctico, no usos — `syntacticRoleStage` los rechaza salvo el subconjunto
 * de `receiver-member` con receptor constante (que SÍ llega acá con ese
 * mismo rol, `bareConstantReceiverStage` lo acepta). Un candidato que de
 * todos modos llegara a `accept` con uno de los tres roles sin arista (no
 * debería, pero esta función no asume la garantía de otro módulo) simplemente
 * no aporta bit — `roles` queda ausente para ese caso, nunca `0` a fuerza.
 */
const EDGE_ROLE_BY_REFERENCE_ROLE: Partial<Record<ReferenceRole, EdgeRole>> = {
  bare: "bare",
  "receiver-member": "receiver-member",
  qualified: "qualified",
};

function roleMaskFor(role: ReferenceRole): number | undefined {
  const edgeRole = EDGE_ROLE_BY_REFERENCE_ROLE[role];
  return edgeRole === undefined ? undefined : edgeRoleBit(edgeRole);
}

/**
 * CONTRATO-F8G.md §1.3 — misma guarda que `build.ts#mergedRoles` (no se
 * importa de ahí: `build.ts` importa este módulo, importar en la otra
 * dirección sería un ciclo), duplicada a propósito en el único otro punto de
 * colapso que el contrato nombra (`resolve.ts:469`). `undefined` cuando
 * NINGÚN lado trae `roles` — nunca `0` por defecto, que ensuciaría aristas
 * `contains`/`imports`/`satisfies`/las 5 tipadas si alguna vez pasaran por
 * este merge (hoy no lo hacen: este merge sólo ve `kind: "references"`).
 */
function mergeRoles(existing: number | undefined, incoming: number | undefined): number | undefined {
  if (existing === undefined && incoming === undefined) return undefined;
  return (existing ?? 0) | (incoming ?? 0);
}

/**
 * Orden de CERTEZA de `Provenance` — P1 (Ola P). Sólo lo usa el colapso de
 * aristas paralelas del final de `resolveReferences` (ver el comentario largo
 * ahí), para que "el par ya está establecido con certeza" gane sobre "de este
 * par sólo vi una ocurrencia que no supe atribuir", sin importar cuál llegó
 * primero. El orden es el que los propios docstrings de `Provenance`
 * (`graph/types.ts`) describen: la sintaxis lo dice > lo dedujo la cascada >
 * heurística > no sé cuál de éstos.
 *
 * EXPORTADA — GUARDIÁN OLA P (grupo grafo), PIDO #2 de P1.md: `graph/build.ts
 * #mergeEdges` tenía el MISMO bug de colapso (se quedaba con la `provenance`
 * del primer candidato y hacía OR de `roles`/suma de `weight` entre
 * ocurrencias de provenance distinta) en el camino que funde LOTES de un
 * mismo archivo grande (`CANDIDATE_BATCH_SIZE`). Medido por P1: 2 aristas de
 * `guava/.../Chars.java` con el bit `receiver-member` prestado a una
 * ocurrencia firme producían 43 hallazgos falsos de `unused-symbol` en TODO
 * java. `mergeEdges` reusa esta misma constante en vez de duplicarla para
 * que las dos reglas no puedan divergir.
 */
export const PROVENANCE_STRENGTH: Readonly<Record<CodeGraphEdge["provenance"], number>> = {
  declared: 3,
  resolved: 2,
  inferred: 1,
  ambiguous: 0,
};

function narrowedOrReject(
  targets: readonly SymbolRef[],
  keep: (t: SymbolRef) => boolean,
  whyEmpty: string,
): StageVerdict {
  const survivors = targets.filter(keep);
  if (survivors.length === targets.length) return { outcome: "pass" };
  if (survivors.length === 0) return { outcome: "reject", why: whyEmpty };
  return { outcome: "narrow", targets: survivors };
}

/* ─────────────────────────── 1. syntactic-role ─────────────────────────── */
/**
 * Rechazo estructural, sin cruzar candidatos: `key` (clave de hash/dict),
 * `parameter` (declaración de parámetro) y `decl-name` (el nombre de la
 * propia declaración) nunca son una referencia real — ninguna de las tres
 * "usa" un símbolo, las tres SON la sintaxis de otra cosa.
 * `receiver-member` (`X.metodo`, receptor explícito) ya NO se rechaza acá —
 * ver el bloque P1 más abajo. Pasa entero: el subconjunto con receptor
 * constante desnuda (`qualifierIsBareConstant`) lo decide
 * `bare-constant-receiver` (etapa 4, la única con la información de unicidad
 * de dueño por clase); el resto lo cierra `typeless-receiver` (etapa 10) como
 * `ambiguous`. `bare`/`qualified` siguen de largo: ninguno de los dos tiene
 * evidencia estructural en el ROL solo que los descarte.
 *
 * ── N9 (Ola O): `decl-name` PASA A RECHAZO — LA COLISIÓN DE NOMBRES ───────
 *
 * Hasta esta ola `decl-name` caía al `pass` final. No era una decisión: era
 * una DERIVA respecto del contrato, ya detectada y fijada en un test que la
 * describía como contradicción sin poder corregirla (`resolve.test.ts`,
 * describe "types.ts `EdgeRole` — el docstring dice algo que el código no
 * hace"). Las dos fuentes que definen el rol dicen lo contrario del código:
 *   - `types.ts`/CONTRATO-F8G.md §1.1: los otros tres roles (`decl-name`,
 *     `parameter`, `key`) "nunca llegan a una arista (la etapa
 *     `syntactic-role` los rechaza antes)".
 *   - `references.ts`, clasificación 3: `decl-name` es "the function/class's
 *     own declared name, **not a use of anything**"; clasificación 5/6: un
 *     binding plano (`const x = …`, `x = …`, Go `x := …`, `var_spec`).
 * O sea: el rol EXISTE para marcar sitios de declaración, y la cascada los
 * estaba resolviendo como si fueran usos.
 *
 * QUÉ PRODUCÍA, medido sobre el corpus (7 repos, `scratchpad/n9/`): las
 * aristas `references` nacidas de un `decl-name` eran 30,9 % de rubocop,
 * 31,4 % de eslint, 12,1 % de vueuse, 10,4 % de hugo, 9,6 % de
 * newtonsoft-json, 6,4 % de sqlalchemy y 5,3 % de nest — y CONCENTRADAS en
 * hubs falsos, porque una declaración homónima repetida en N archivos emite
 * N aristas hacia el ÚNICO homónimo que sobrevive la narrowing anterior:
 *   - nest: `constructor`, 387 llamadores en 358 archivos (361 de ellos
 *     `decl-name`), todos apuntando a
 *     `packages/common/utils/merge-with-values.util.ts#constructor` — el
 *     `constructor` de una CLASE ANÓNIMA (`class extends Metatype { … }`),
 *     el único de los 366 del repo cuyo `container` está vacío y por eso el
 *     único que `class-member` no descarta. Los 365 constructores reales
 *     mueren en `class-member` y el degenerado queda como "dueño global
 *     único". Ésta es la evidencia con la que se abrió este frente.
 *   - rubocop: `Style` 328/302 homónimos, `Lint` 165/160, `Layout` 108/102 —
 *     la REAPERTURA de módulo de Ruby (`module RuboCop::Cop::Style` escrito
 *     en 302 archivos) leída como 301 referencias al primero.
 *   - hugo/eslint/vueuse: `i`, `r`, `p`, `c`, `t`, `result`, `stop`, `get`,
 *     `set` — variables locales (`i := 0`, `const stop = …`) que no son
 *     símbolos de su propio archivo y por eso resuelven al único homónimo
 *     global del repo, en un archivo sin ninguna relación.
 * Ninguno de esos casos es un uso. El rechazo no es una heurística de
 * volumen: es la definición del rol, aplicada donde el contrato dice.
 *
 * ── P1 (Ola P): `receiver-member` DEJA DE RECHAZARSE ACÁ ──────────────────
 *
 * Esta etapa rechazaba `receiver-member` con receptor no constante con el
 * motivo *"receptor explícito no-constante — sin tipos, la arista no se
 * emite"*. Los dos primeros tercios de esa frase son verdad; el último es un
 * NO SEQUITUR, y es el que costaba caro: de "no sé de qué tipo es el
 * receptor" no se sigue "no hay arista", se sigue "no sé CUÁL de estas
 * aristas". Son dos afirmaciones distintas y el grafo tiene vocabulario para
 * las dos desde CONTRATO-F9.md §4.1 (`provenance: "ambiguous"` +
 * `alternatives`); esta etapa usaba el de la primera para decir la segunda.
 *
 * QUÉ PRODUCÍA, medido: `qualifierIsBareConstant` sólo puede ser `true` en
 * UNA de las nueve gramáticas (`references.ts` lo verificó por parse directo
 * de las nueve: es `receiver.type === "constant"`, un tipo de nodo que sólo
 * el lexer de Ruby ofrece). O sea que **en 8 de los 9 lenguajes NINGUNA
 * llamada a un miembro producía arista**. Consecuencias medidas en la Ola O:
 *   - `unused-symbol` emitía ~28.000 candidatos crudos con "fan-in 0", de los
 *     cuales el **98,5 %** eran miembros (guava: 21.273 de 21.587). Ese cero
 *     no medía "nadie lo usa", medía "el grafo no puede verlo".
 *   - El dataset etiquetado a mano lo confirma desde el otro lado: en el
 *     estrato `role` de jekyll (candidatos que ESTA etapa rechaza; población
 *     461) **21 de 40 filas están etiquetadas `correcta`**, y en el estrato
 *     `rejected-role` de guava (población 62.403) **9 de 30**. O sea que
 *     entre un tercio y la mitad de lo que esta etapa tiraba eran aristas
 *     REALES — y el resto no eran "no hay relación" sino "el destino es otro
 *     homónimo, o vive fuera del repo".
 *
 * Aceptarlas a ciegas sería peor que tirarlas: 52 % (jekyll) / 30 % (guava)
 * de precisión sobre `resolved` hundiría la cláusula 1 de
 * `resolve-gate.test.ts` (piso 0,90) y ensuciaría a todo consumidor. Por eso
 * la decisión NO se toma acá: el candidato PASA, atraviesa todas las etapas
 * de narrowing, y `typeless-receiver` (etapa 10) lo cierra como `ambiguous` —
 * que es lo único que se sabe de verdad.
 */
const syntacticRoleStage: ResolutionStage = {
  id: "syntactic-role",
  order: 1,
  title: "Filtro de rol sintáctico",
  decide(candidate) {
    const { role } = candidate.from.ref;
    if (role === "key") return { outcome: "reject", why: "es la clave de un literal de par/hash, no una referencia" };
    if (role === "parameter") return { outcome: "reject", why: "es la declaración de un parámetro, no una referencia" };
    if (role === "decl-name") {
      return { outcome: "reject", why: "es el nombre de la propia declaración (o de un binding plano), no un uso de otro símbolo" };
    }
    // `receiver-member`: pasa. Con receptor constante desnuda decide
    // `bare-constant-receiver` (etapa 4); si el receptor es la palabra del
    // objeto actual, `self-receiver` (etapa 5); sin ninguno de los dos,
    // `typeless-receiver` (etapa 10). Ver el bloque P1 del docstring de arriba.
    return { outcome: "pass" };
  },
};

/* ─────────────────────────── 2. local-shadow ───────────────────────────── */
/**
 * P1 (Ola P) — `receiver-member` queda FUERA de esta etapa, y no es una
 * excepción de conveniencia: es que el dato no aplica. `shadowedLocally`
 * (`references.ts`) se calcula por NOMBRE contra los bindings locales
 * visibles, sin mirar el rol. Para un nombre desnudo eso es exactamente la
 * pregunta correcta. Para el `foo` de `x.foo(...)` no lo es: ese nombre no se
 * busca en el ámbito léxico, se busca en el receptor — una variable local
 * llamada `foo` no sombrea nada ahí. Hasta esta ola la distinción no se
 * notaba porque `syntactic-role` mataba todo `receiver-member` antes de
 * llegar acá (salvo el subconjunto de constante desnuda de Ruby, que sí
 * pasaba y sí podía morir por este falso motivo).
 */
const localShadowStage: ResolutionStage = {
  id: "local-shadow",
  order: 2,
  title: "Sombra léxica local",
  decide(candidate) {
    if (candidate.from.ref.role === "receiver-member") return { outcome: "pass" };
    if (candidate.from.ref.shadowedLocally) {
      return { outcome: "reject", why: "un parámetro o variable local visible en el sitio de uso sombrea el nombre" };
    }
    return { outcome: "pass" };
  },
};

/* ─────────────────────────── 3. class-member ───────────────────────────── */
/**
 * REFINAMIENTO MEDIDO (A3, Ola 9): un MÉTODO (`family === "function-like"`,
 * `memberOfClassLike`) NO se resuelve por nombre desnudo — mata los hubs
 * falsos de `each` (spike: `memberOk = declType !== "method"`, la misma
 * regla, mismo target) — SALVO el único caso donde "nombre desnudo" no es
 * ambiguo en absoluto: RUBY (`ctx.languageOf`, dato de primera clase de la
 * unidad, mismo patrón de excepción sancionado por la plantilla del proyecto
 * que usa `edges/mixin.ts`), `role === "bare"`, y el CONTENEDOR declarante
 * del método es un PREFIJO EXACTO del scope léxico del sitio de uso
 * (`containerEnclosesScope` abajo) — la llamada ocurre TEXTUALMENTE dentro
 * del cuerpo de la MISMA clase/módulo (o de uno que la contiene) que declara
 * el método. Eso es despacho implícito a `self` garantizado por la sintaxis
 * de Ruby, no inferencia de tipos: no hace falta resolver la cadena de
 * ancestros (`extends`/mixins, que `ResolutionContext` no expone hoy — ver
 * PENDIENTES A3) para saber que una llamada escrita adentro del propio
 * cuerpo de la clase alcanza un método de ESE MISMO cuerpo. Medido sobre
 * jekyll/lib (`resolve-gate.test.ts`, `graph/gate/precision-recall.test.ts`):
 * de 1.329 candidatos `bare` que la cascada real rechaza hoy en esta etapa,
 * 682 tienen exactamente un target sobreviviente bajo esta narrowing — sin
 * mover ninguna fila de las 200 etiquetadas (ninguna de las 5 `member`
 * correctas perdidas de la muestra es un caso de MISMO contenedor: las 5
 * requieren herencia (`Clean`/`Serve`/`Build` < `Command`) o un mixin
 * cruzado — fuera de alcance de este refinamiento, documentado, no
 * escondido) ni tocar precisión (92/92 sigue igual: la propia gate de
 * `resolve-gate.test.ts` es la verificación, no una afirmación sin correr).
 * NO filtra clases/módulos anidados ni bindings (`class-like`/`namespace-like`/
 * `other` con `memberOfClassLike`): una clase anidada referenciada sin
 * calificar DESDE DENTRO de su propio contenedor es legítima (el caso
 * `errors.rb` medido: `FatalException` anidada en `Jekyll::Errors`,
 * referenciada como `Errors::FatalException` desde dentro de `Jekyll`) — esa
 * pregunta es de ALCANCE LÉXICO, que decide `qualified-name`, no ésta. Para
 * `role === "receiver-member"` (sólo llega acá el subconjunto de receptor
 * constante que `syntactic-role` dejó pasar) los métodos-miembro NO se
 * filtran: son exactamente el target que `bare-constant-receiver` necesita
 * evaluar a continuación.
 *
 * ── A8 (Ola 11b): POSICIÓN DE CALLEE — la causa raíz MEDIDA de `calls` = 0
 *    en C# (y en Java) ──────────────────────────────────────────────────────
 *
 * Medido, no leído (`tests/fixtures/edge-emision/csharp`, dos archivos con la
 * forma real de una biblioteca C#): de 3 candidatos con `isCallee`,
 * `syntactic-role` rechaza 1 (`_service.Load(id)`, receptor explícito
 * no-constante — la brecha de `receiver-member` ya documentada) y **esta
 * etapa rechazaba los otros 2** (`Compute(order)` y `Normalize(id)`, llamadas
 * desnudas a un método hermano de la MISMA clase). Resultado: cero aristas
 * `calls`. La premisa con la que llegó el encargo — "el extractor existe y en
 * C# no llega" — es FALSA: el extractor SÍ llega (`references.ts#
 * computeIsCallee` marca los 3 sitios correctamente, verificado por sonda).
 * Lo que no llegaba era la RESOLUCIÓN, acá.
 *
 * Y no es un problema de C#: la excepción de arriba está atada a
 * `=== "ruby"`, así que en los otros 8 lenguajes un `calls` sólo podía nacer
 * de una función que NO fuera miembro de una clase. En Java y C# eso no
 * existe — toda función es miembro — de ahí el cero EXACTO, no un número
 * bajo. Es la misma familia de bug que este proyecto ya diagnosticó cuatro
 * veces, en su versión espejada: una regla escrita para la forma de UN
 * lenguaje, esta vez como excepción en lugar de como caso general.
 *
 * EL ENSANCHE, acotado a la evidencia que lo justifica: la excepción vale
 * también cuando `role === "bare" && isCallee`, en cualquier lenguaje. Las
 * tres condiciones se piden JUNTAS y cada una descarta un modo de falso
 * positivo distinto:
 *   - `bare` — sin receptor escrito; con receptor la decisión es de
 *     `syntactic-role`/`bare-constant-receiver`, no de acá.
 *   - `isCallee` — el nombre está siendo INVOCADO (campo de callee + campo de
 *     argumentos, ambos resueltos por la gramática — `references.ts`). Un
 *     nombre desnudo leído como VALOR se sigue rechazando exactamente como
 *     antes. Consecuencia: este ensanche NO puede mover ni una arista
 *     `references`, porque `build.ts#partitionCandidatesByCallee` manda todo
 *     `isCallee` a la partición `calls` y nunca a la de `references`.
 *   - `containerEnclosesScope` — el método está declarado en un contenedor
 *     que ENGLOBA léxicamente al sitio de la llamada: la llamada está escrita
 *     TEXTUALMENTE dentro del cuerpo de la clase que declara el método. Es el
 *     mismo predicado, y el mismo argumento, que la excepción de Ruby: no
 *     hace falta resolver la cadena de ancestros para saber que una llamada
 *     escrita adentro del propio cuerpo alcanza un método de ESE cuerpo.
 *
 * POR QUÉ NO SE ACOTA A UNA LISTA DE LENGUAJES (Ruby/Java/C#, los tres con
 * despacho implícito a `self`): porque NO EXISTE un discriminador de FORMA
 * que los separe del resto, y el proyecto prohíbe calibrar por nombre de
 * lenguaje. El contraejemplo que mata a todos los candidatos estructurales:
 * JS/TS declaran sus métodos con la MISMA forma que Java/C# (cuerpo de clase,
 * sin parámetro receptor explícito — a diferencia del `self` de Python o del
 * campo `receiver` de Go) y tienen la semántica CONTRARIA (`foo()` desnudo NO
 * alcanza `this.foo`). Elegir por `decl.id` sería exactamente lo que este
 * proyecto ya decidió no hacer (`detect/capabilities.ts`: "Nunca se decide
 * por `decl.id`").
 *
 * FALSO POSITIVO POSIBLE, nombrado y no escondido: en Python/JS/TS/Go, donde
 * la llamada desnuda NO alcanza al miembro, se emite una arista de más si y
 * sólo si (a) el nombre invocado desnudo coincide EXACTAMENTE con un método
 * de una clase que contiene léxicamente al sitio de llamada Y (b) NO existe
 * en todo el repo ninguna otra declaración con ese nombre — porque si existe,
 * `narrowedOrReject` conserva la no-miembro y descarta la miembro, que es el
 * resultado correcto. O sea: el caso malo es una llamada a la biblioteca
 * estándar o a una dependencia externa cuyo nombre choca con un método de la
 * clase que la escribe. **Precisión NO medida sobre corpus real** — no hay
 * corpus en disco en esta ola. Lo que SÍ está medido es el volumen sobre
 * `tests/fixtures/patterns` (`scripts/edge-coverage.mts`, 101 archivos, seis
 * lenguajes: go, javascript, python, ruby, typescript, vue): `calls` da
 * **8 antes y 8 después** (python 5, ruby 1, go 2), y `references` no se
 * mueve en ninguno de los seis — cero falsos positivos introducidos ahí,
 * porque en esos lenguajes la llamada a un miembro simplemente NO se escribe
 * desnuda (se escribe `self.x()` / `this.x()`, que es `receiver-member`). La
 * ganancia se midió donde estaba el cero, con fixtures propias
 * (`tests/fixtures/edge-emision/`): csharp 0 → 2 y java 0 → 1.
 * Quien tenga corpus: re-correr `graph/gate/precision-recall.test.ts` y
 * `resolve-gate.test.ts` es la verificación pendiente de este cambio.
 */
const classMemberStage: ResolutionStage = {
  id: "class-member",
  order: 3,
  title: "Miembro de una unidad tipo-clase (N1-a)",
  decide(candidate, ctx) {
    if (candidate.from.ref.role === "receiver-member") return { outcome: "pass" };
    // A3 (Ola 9): despacho implícito a `self` en Ruby, sólo `bare`.
    // A8 (Ola 11b): la MISMA excepción, en cualquier lenguaje, cuando el
    // nombre desnudo está además en POSICIÓN DE CALLEE — ver el docstring de
    // arriba. Fuera de estos dos casos, un método-miembro sigue matando el
    // candidato sin excepción (comportamiento sin cambios).
    const implicitSelfDispatch =
      candidate.from.ref.role === "bare" &&
      (ctx.languageOf(candidate.from.file) === "ruby" || (candidate.from.ref.isCallee ?? false));
    return narrowedOrReject(
      candidate.targets,
      (t) => {
        const sym = ctx.symbol(t);
        if (!(sym && sym.family === "function-like" && sym.memberOfClassLike)) return true;
        // `sym.container.length > 0` explícito, aunque `memberOfClassLike`
        // ya lo implica en datos reales (`symbols.ts`): un contenedor VACÍO
        // nunca dispara la excepción, ni siquiera si `containerEnclosesScope`
        // lo trataría como prefijo trivial de cualquier scope — eso reabriría
        // el hub de `each` para métodos top-level homónimos entre archivos
        // sin relación, exactamente el riesgo que N1-a existe para cerrar.
        return (
          implicitSelfDispatch && sym.container.length > 0 && containerEnclosesScope(sym.container, candidate.from.ref.scope)
        );
      },
      "todos los candidatos son métodos declarados dentro de una clase/módulo — exigen receptor",
    );
  },
};

/* ───────────────────────────── 4. type-slot ─────────────────────────────── */
/**
 * *** AA6 (Ola AA) — LO QUE SE ESCRIBE EN LA RANURA DE TIPO NO ES UNA FUNCIÓN. ***
 *
 * QUÉ INTENCIÓN VERIFICA (no qué nodos mira): **que el nombre esté siendo
 * usado para NOMBRAR UN TIPO**. `ReferenceFacts.inTypeSlot`
 * (`graph/references.ts`, AA6) dice que la gramática escribió este
 * identificador dentro del campo `type`/`return_type`/`result` de una
 * declaración — o sea en la ranura donde va un tipo, no un valor. Un nombre
 * ahí puede denotar una clase, una interfaz, un struct, un alias o un
 * parámetro de tipo; **lo único que con certeza NO denota es una FUNCIÓN**.
 * Esta etapa descarta exactamente eso, y nada más.
 *
 * ── DE DÓNDE SALE, MEDIDO, Y POR QUÉ NO ES UN FILTRO DE VOLUMEN ────────────
 *
 * Z5 (Ola Z) juzgó a mano 30 candidatos de `middle-man` y encontró 29 falsos,
 * atribuyéndolos a una sola causa raíz en este archivo. Re-medido por AA6
 * sobre el árbol de hoy, esa causa se parte en dos y hay que separarlas:
 *   · **20 de los 29 desaparecen sin tocar una línea de este archivo**, sólo
 *     aplicando la regla que CONTRATO-F9.md §4.5 ya fija (`confidentEdges`,
 *     excluir `ambiguous`) — son los accesos a propiedad, que
 *     `typeless-receiver` (etapa 11) ya marca como "hay relación, no sé cuál".
 *   · **de los 9 que sobreviven, 6 son ANOTACIONES DE TIPO**: `target: Any`,
 *     `o: Any`, `-> Any`, `-> InstanceState[_O]`, `-> _InternalEntityType[_T]`
 *     — el `Any` de `typing` (de afuera del repo) resuelto contra la FUNCIÓN
 *     real `def Any(...)` de `sqlalchemy/dialects/postgresql/array.py`, un
 *     sinónimo de operador SQL sin ninguna relación. Ésos son los que cierra
 *     esta etapa.
 *
 * Población medida sobre los 13 repos, con `scratchpad-aa6/aa6-impacto-ranura.mts`
 * (parte los candidatos REALES de `build.ts#buildCandidates` y los resuelve con
 * esta MISMA cascada): **47.195 aristas nacen de un sitio en ranura de tipo, y
 * 3.568 de ellas apuntan a una `function-like`** — python 3.322, go 146,
 * typescript 100, y **java 0 de 15.575** (sus 65.280 sitios en ranura resuelven
 * todos a tipos, que es lo correcto). No es un umbral: es una IDENTIDAD de
 * forma, y por eso el número de java es la mejor prueba de que la etapa no
 * está recortando por volumen.
 *
 * ── POR QUÉ RECHAZA Y NO SE ABSTIENE ──────────────────────────────────────
 *
 * `narrowedOrReject`, la misma disciplina que `class-member` (etapa 3): si
 * ALGÚN destino no es función, se narrowea a ésos; si NINGUNO lo es, se
 * rechaza. Y el rechazo es la respuesta HONESTA, no una pérdida: si las
 * únicas declaraciones del repo con ese nombre son funciones, entonces el tipo
 * escrito es de afuera del repo (`typing.Any`, la stdlib, una dependencia) o
 * es un PARÁMETRO DE TIPO del propio sitio (`<T>`, `[_O]`) — que tampoco está
 * en la tabla de símbolos. En los dos casos la afirmación "esta referencia
 * llega a esa función" es falsa.
 *
 * ── QUÉ **NO** HACE, A PROPÓSITO, Y CON EL NÚMERO QUE LO SOSTIENE ─────────
 *
 * **No exige que el destino sea `class-like`.** La regla fuerte ("en una
 * ranura de tipo sólo sobrevive un tipo declarado") está MEDIDA y es
 * INCORRECTA: se llevaría 8.436 aristas con destino `family: "other"` que son
 * legítimas — en click son las 115 de `V`/`F`, que son `V = t.TypeVar("V")`,
 * o sea variables de tipo escritas como un binding de módulo; en Go son
 * `const`/`var` de paquete. Un alias de tipo es un binding para la tabla de
 * símbolos y un tipo para quien lo escribe, y el grafo no tiene hoy con qué
 * distinguirlo — así que la etapa se queda con la única mitad que sí es
 * cierta sin excepción.
 *
 * ── BRECHAS DECLARADAS, MEDIDAS ───────────────────────────────────────────
 *
 *   · **ruby y javascript quedan en cero por diseño de la gramática**, no por
 *     un defecto de la etapa: ninguna de las dos tiene dónde escribir un tipo
 *     (`inTypeSlot` es `false` en el 100 % de sus sitios — jekyll 0 de 5.011
 *     candidatos, rubocop 0 de 58.220, lodash 0 de 2.733, medidos). La brecha
 *     la declara `graph/references.ts`, esta etapa sólo la hereda.
 *   · **TypeScript puede nombrar un valor en una ranura de tipo** con una
 *     consulta de tipo (`const x: typeof foo = foo`). Ese `foo` llega acá con
 *     `inTypeSlot: true` y, si su único homónimo es una función, se rechaza —
 *     un falso negativo declarado, el único conocido, y el precio de no
 *     agregar una excepción por nombre de nodo de UNA gramática.
 *   · **`inTypeSlot` ausente ⇒ la etapa PASA.** Una fila de hechos armada a
 *     mano en un test, o cacheada de antes de AA6, se comporta exactamente
 *     como antes de esta etapa (por eso `FACTS_SCHEMA_VERSION` sube a 9).
 *
 * ── POR QUÉ CORRE ACÁ (order 4) ───────────────────────────────────────────
 *
 * Es una narrowing puramente estructural sobre la FORMA DECLARADA del
 * destino, hermana de `class-member` (etapa 3, "un método no se alcanza por
 * nombre desnudo"), y como ella no gana nada corriendo tarde: cuanto antes
 * achique el conjunto, mejor decide todo lo que sigue —
 * `bare-constant-receiver`, `self-receiver`, `typeless-receiver` (que emite
 * `alternatives`) y, sobre todo, `global-uniqueness`, que acepta como
 * `resolved` en cuanto queda UN destino vivo. Correr después de
 * `global-uniqueness` la volvería inerte para el caso que la motiva.
 */
const typeSlotStage: ResolutionStage = {
  id: "type-slot",
  order: 4,
  title: "Ranura de tipo — lo escrito donde va un tipo no denota una función",
  decide(candidate, ctx) {
    if (candidate.from.ref.inTypeSlot !== true) return { outcome: "pass" };
    return narrowedOrReject(
      candidate.targets,
      (t) => ctx.symbol(t)?.family !== "function-like",
      "el nombre está escrito en la ranura de TIPO de la gramática y todas las declaraciones homónimas del repo son funciones: " +
        "el tipo viene de fuera del repo, o es un parámetro de tipo del propio sitio",
    );
  },
};

/* ───────────────────── 5. bare-constant-receiver ───────────────────────── */
/**
 * *** EL REFINAMIENTO MEDIDO. *** Sólo actúa sobre `role === "receiver-member"`
 * con `qualifierIsBareConstant` (lo único que `syntactic-role` dejó pasar sin
 * decidir). Entre los targets que sobrevivieron `class-member` (métodos
 * incluidos, a propósito), busca el que sea miembro de una clase/módulo cuyo
 * NOMBRE INMEDIATO (el último elemento de `container`) coincida EXACTAMENTE
 * con el texto del calificador. Si hay exactamente uno, se emite la arista
 * igual — resolución ESTRUCTURAL (constante = nombre de clase), no
 * inferencia de tipos, tal como pide CONTRATO-F3.md: separa
 * `PathManager.join` (el `PathManager` del calificador coincide con el
 * contenedor inmediato de `join`) de `File.join`/`array.join` (calificador no
 * es una constante desnuda en absoluto).
 *
 * P1 (Ola P) — LA GUARDA AHORA ES EXPLÍCITA. Hasta esta ola la condición de
 * entrada era `role === "receiver-member" && qualifier != null`, y alcanzaba
 * SÓLO porque `syntactic-role` ya había rechazado todo `receiver-member` que
 * no fuera constante desnuda: esta etapa nunca veía un `array.join`. Ahora
 * los ve a todos, y para un receptor que NO es una constante el texto del
 * calificador es el nombre de una VARIABLE (`array`, `self`, `this`, `p`),
 * no el de una clase — compararlo contra `container` daría "no coincide con
 * ninguna clase declarante" y esta etapa los rechazaría a todos, reabriendo
 * exactamente el agujero que P1 vino a cerrar. Se pide
 * `qualifierIsBareConstant` explícitamente.
 */
const bareConstantReceiverStage: ResolutionStage = {
  id: "bare-constant-receiver",
  order: 5,
  title: "Receptor = constante desnuda (el refinamiento medido)",
  decide(candidate, ctx) {
    const { role, qualifier, qualifierIsBareConstant } = candidate.from.ref;
    if (role !== "receiver-member" || qualifier == null || !qualifierIsBareConstant) return { outcome: "pass" };
    const matches = candidate.targets.filter((t) => {
      const sym = ctx.symbol(t);
      if (!sym || sym.family !== "function-like" || !sym.memberOfClassLike) return false;
      return sym.container.length > 0 && sym.container[sym.container.length - 1] === qualifier;
    });
    if (matches.length === 1) return { outcome: "accept", target: matches[0]!, provenance: "resolved" };
    if (matches.length === 0) {
      return {
        outcome: "reject",
        why: `la constante "${qualifier}" no coincide con el contenedor inmediato de ninguna clase/módulo declarante`,
      };
    }
    return { outcome: "reject", why: `la constante "${qualifier}" coincide con más de una clase/módulo declarante — ambiguo` };
  },
};

/* ────────────────────────── 6. self-receiver ───────────────────────────── */
/**
 * *** C1 (Ola U) — EL RECEPTOR CUYO TIPO ESCRIBE LA GRAMÁTICA. ***
 *
 * QUÉ INTENCIÓN VERIFICA (no qué nodos mira): **que el objeto se esté
 * hablando A SÍ MISMO**. No "hay un punto antes del nombre" — eso es la forma,
 * y la comparte con `x.foo()`, `Foo.bar()` y `this.campo.foo()`, que son tres
 * intenciones distintas. Acá la pregunta es: ¿el sitio de uso está escrito
 * DENTRO del cuerpo de la unidad tipo-clase que declara el miembro, y el
 * receptor es la palabra con la que el propio LENGUAJE nombra a esa misma
 * unidad? Si las dos cosas valen, el tipo del receptor no es una inferencia:
 * lo dice la gramática, igual que `bare-constant-receiver` (etapa 4) sabe que
 * una constante desnuda nombra una clase.
 *
 * ── POR QUÉ ES UNA ETAPA NUEVA Y NO UN AJUSTE DE `typeless-receiver` ──────
 *
 * `typeless-receiver` (etapa 10) existe porque de `x.foo()` no se sabe el
 * tipo de `x`, y por eso emite `ambiguous`: "hay relación, no sé cuál". Esa
 * afirmación es CIERTA para un receptor cualquiera y FALSA para `this`/`self`:
 * ahí sí se sabe cuál. Meterlos en el mismo veredicto es el mismo error que
 * P1 vino a arreglar, sólo que espejado — antes se decía "no hay" cuando lo
 * cierto era "no sé"; acá se dice "no sé" cuando lo cierto es "es ÉSTE".
 * Y la diferencia no es cosmética: `provenance: "ambiguous"` queda FUERA de
 * toda consulta por defecto (CONTRATO-F9.md §4.5, `confidentEdges`), así que
 * un uso que sí sabemos atribuir era invisible para todo consumidor.
 *
 * ── LAS TRES CONDICIONES, Y QUÉ MODO DE FALSO CIERRA CADA UNA ─────────────
 *
 *   (a) `role === "receiver-member"` y el texto del receptor es una palabra
 *       RESERVADA del lenguaje para "el objeto actual" (`SELF_RECEIVER_WORDS`
 *       abajo — vocabulario de LENGUAJE, no de dominio, misma categoría y el
 *       mismo par de palabras que `edges/portador.ts#SELF_KEYWORDS`,
 *       `edges/invocacion-indirecta.ts` y `edges/propaga-tipo.ts` ya usan;
 *       `invocacion-indirecta.ts:745` hace exactamente esta misma lectura
 *       sobre `ReferenceFacts.qualifier`). Cierra el falso de confundir un
 *       receptor cualquiera con el propio objeto.
 *   (b) existe una unidad tipo-clase que ENCIERRA léxicamente al sitio, y se
 *       toma la MÁS PROFUNDA (`deepestSelfTypeScope`). Cierra el falso de una
 *       clase anidada: `this.h()` escrito dentro de `C.Inner` se resuelve
 *       contra `C.Inner`, nunca contra un homónimo de `C` — `this` nombra a
 *       la unidad más interna, no a cualquier ancestro léxico. Medido, es un
 *       caso real y no una hipótesis: guava tiene 218 sitios donde MÁS DE UN
 *       contenedor englobante declara el mismo nombre, y sin esta condición
 *       la etapa tendría que abstenerse en los 218 o elegir mal.
 *   (c) EXACTAMENTE UN destino sobreviviente está declarado en ESE contenedor
 *       y en EL MISMO ARCHIVO que el sitio de uso. El mismo-archivo no es
 *       adorno: sin él, una clase reabierta (Ruby) o parcial (C#) con el mismo
 *       `symbolPath` en dos archivos volvería a meter la ambigüedad que esta
 *       etapa dice no tener. Con él, esos casos simplemente no disparan y
 *       siguen su curso hasta `typeless-receiver`, o sea salen `ambiguous`
 *       como hoy — la etapa nunca EMPEORA un caso, sólo mejora los que puede
 *       afirmar.
 *
 * NUNCA RECHAZA (misma disciplina que `module-reachability`): si alguna de
 * las tres no vale, PASA. Un `this.foo()` cuyo `foo` es heredado de un
 * ancestro (o de un tipo de afuera del repo) no está declarado en el
 * contenedor y por lo tanto no dispara — lo cierra `typeless-receiver` como
 * `ambiguous`, exactamente como hoy. Medido: en click son 75 de 901, en nest
 * 514 de 1.436, en guava 47 de 3.314.
 *
 * ── POR QUÉ CORRE ACÁ (order 5) Y NO DESPUÉS DE LAS NARROWING ─────────────
 *
 * Al revés que `typeless-receiver`, esta etapa NO se beneficia de que el
 * conjunto de destinos sea más chico: su criterio es una IDENTIDAD
 * (archivo + contenedor exacto), no una preferencia entre sobrevivientes. Y
 * correr después la expondría a que una etapa de narrowing pensada para
 * nombres desnudos le saque de encima el único destino correcto: el caso
 * concreto y medible es `single-file-component`, que descarta los targets
 * `.vue` en cuanto hay UNO solo que no lo es — un `this.foo()` escrito
 * DENTRO de un `.vue` perdería su propio destino por una regla de ruido de
 * ecosistema que no tiene nada que ver con él. Corre inmediatamente después
 * de `bare-constant-receiver` porque son la misma familia de pregunta
 * (¿el receptor escrito nombra una unidad concreta?) y las dos son terminales
 * para su propio subconjunto, que además es disjunto: acá se exige
 * explícitamente NO ser constante desnuda.
 *
 * ── BRECHAS DECLARADAS, MEDIDAS, NO ESCONDIDAS ────────────────────────────
 *
 *   · **Go queda en cero por diseño del lenguaje**, no por un defecto de esta
 *     etapa: el receptor de un método Go es un parámetro con NOMBRE ELEGIDO
 *     por quien lo escribe (`func (c *Command) foo()` ⇒ el receptor se llama
 *     `c`), así que no hay palabra reservada que leer. Reconocerlo exigiría
 *     ligar el nombre del receptor de CADA método a su tipo, que es el hueco
 *     #4 del plan (`graph/build.ts`/`graph/symbols.ts`), de otro frente.
 *   · **C# y Ruby quedan casi en cero por CONVENCIÓN de escritura**, medido:
 *     `this.` explícito aparece 1 vez en newtonsoft-json (3.628 candidatos
 *     `receiver-member`) y `self.` 21 en jekyll / 18 en rubocop. En Ruby el
 *     despacho al propio objeto se escribe SIN receptor, y ese caso ya lo
 *     cubre `class-member` (etapa 3, la excepción A3/A8) — no es una pérdida,
 *     es que la evidencia entra por otra puerta.
 *   · **`super.m()` NO se resuelve acá** (guava: 836 sitios). El receptor
 *     nombra al ANCESTRO, y `ResolutionContext` no expone la cadena
 *     `extends`/mixins — el mismo dato que la excepción de Ruby de
 *     `class-member` ya declara faltante (PENDIENTES A3). Se deja pasar.
 *   · **`this` recapturado**: en JS/TS una `function` anidada (no una flecha)
 *     puede recibir un `this` distinto en tiempo de ejecución. La etapa
 *     resuelve igual contra la clase que encierra el TEXTO. Es una afirmación
 *     estructural sobre lo escrito, no sobre el enlace dinámico — declarada,
 *     y el modo de falso que produce es el mismo que ya acepta la excepción
 *     A8 de `class-member` para el nombre desnudo en posición de callee.
 */

/**
 * Palabras RESERVADAS del lenguaje con las que se nombra al objeto actual.
 * Copia deliberada de `edges/portador.ts#SELF_KEYWORDS` (archivo de otro
 * dueño — no se importa un símbolo privado; la misma copia deliberada que
 * `edges/propaga-tipo.ts` ya hace y documenta con este mismo párrafo).
 * Vocabulario de GRAMÁTICA, nunca de dominio: misma categoría que
 * `CONSTRUCTOR_NAMES` en `code-grammar.ts`.
 */
const SELF_RECEIVER_WORDS: ReadonlySet<string> = new Set(["self", "this"]);

const SELF_TYPE_FAMILIES: ReadonlySet<string> = new Set(["class-like", "namespace-like"]);

/**
 * La unidad tipo-clase MÁS PROFUNDA que encierra léxicamente al sitio de uso,
 * buscada en el propio archivo del sitio: el prefijo más largo de `scope` que
 * es una declaración `class-like`/`namespace-like` DE ESE ARCHIVO. `null`
 * cuando ninguno lo es (una función suelta, un archivo de script) — ahí
 * `this`/`self` no nombra ninguna unidad declarada acá y la etapa se abstiene.
 */
function deepestSelfTypeScope(ctx: ResolutionContext, file: string, scope: readonly string[]): readonly string[] | null {
  for (let n = scope.length; n >= 1; n--) {
    const prefix = scope.slice(0, n);
    const sym = ctx.symbol({ file, symbolPath: prefix });
    if (sym && SELF_TYPE_FAMILIES.has(sym.family)) return prefix;
  }
  return null;
}

const selfReceiverStage: ResolutionStage = {
  id: "self-receiver",
  order: 6,
  title: "Receptor = el propio objeto (`this`/`self`) — el tipo lo escribe la gramática",
  decide(candidate, ctx) {
    const { role, qualifier, qualifierIsBareConstant } = candidate.from.ref;
    if (role !== "receiver-member" || qualifier == null || qualifierIsBareConstant) return { outcome: "pass" };
    if (!SELF_RECEIVER_WORDS.has(qualifier)) return { outcome: "pass" };
    const ownerPath = deepestSelfTypeScope(ctx, candidate.from.file, candidate.from.ref.scope);
    if (ownerPath === null) return { outcome: "pass" };
    const own = candidate.targets.filter((t) => {
      if (t.file !== candidate.from.file) return false;
      const sym = ctx.symbol(t);
      return !!sym && sym.memberOfClassLike && sameSymbolPath(sym.container, ownerPath);
    });
    if (own.length !== 1) return { outcome: "pass" };
    return { outcome: "accept", target: own[0]!, provenance: "resolved" };
  },
};

/* ─────────────────────── 7. namespace-container ────────────────────────── */
const namespaceContainerStage: ResolutionStage = {
  id: "namespace-container",
  order: 7,
  title: "Contenedor de namespace (cuerpo son sólo declaraciones)",
  decide(candidate, ctx) {
    return narrowedOrReject(
      candidate.targets,
      (t) => {
        const sym = ctx.symbol(t);
        return !(sym && sym.namespaceContainerOnly);
      },
      "el único destino es un contenedor de namespace (cuerpo son sólo declaraciones), no un símbolo referenciable",
    );
  },
};

/* ───────────────────────── 8. qualified-name (N1-b) ─────────────────────── */
/**
 * Visibilidad por NAMESPACE LÉXICO — la que mata la colisión de `File`. Un
 * nombre anidado sólo es referenciable sin calificar DESDE DENTRO de su
 * contenedor; con calificador explícito, el calificador tiene que coincidir
 * con el namespace declarante. Estructural, sobre arreglos `container`/
 * `scope` — cuatro condiciones, portadas 1:1 desde el `scopeOk` del spike
 * (`probe-cascade.ts`/`collect.mjs`), sólo que sobre ARRAYS en vez de texto
 * unido con "::" (agnóstico de separador de lenguaje):
 *
 *   (a) el scope de uso es EXACTAMENTE el container de la declaración
 *   (b) el container de la declaración es SUFIJO del scope de uso
 *       (la referencia ocurre dentro de un contenedor que termina igual)
 *   (c) el scope de uso es SUFIJO del container de la declaración
 *       (la referencia ocurre "por encima", visible desde ahí — el caso
 *       `errors.rb`: uso en `["Jekyll"]`, declaración en `["Jekyll","Errors"]`)
 *   (d) el container de la declaración es PREFIJO del scope de uso
 *
 * Un contenedor VACÍO (`container.length === 0`, declaración a nivel de
 * archivo/paquete) siempre es visible sin calificar — no hay namespace que
 * cruzar.
 *
 * Para `role === "qualified"` (`Foo::Bar`, receptor de tipo/namespace, no de
 * valor) el "scope de uso" efectivo NO es `ref.scope` (dónde ocurre la
 * referencia) sino el TEXTO del calificador escrito, partido por los dos
 * separadores medidos en los 9 grammars (`::` Ruby, `.` TypeScript) — exactamente
 * lo que el spike hace (`effNs = scope.text`) para que "el calificador tiene
 * que coincidir" sea una comparación estructural, no una lectura del scope
 * léxico de dónde está escrito el código.
 */
function splitQualifierText(text: string): readonly string[] {
  return text.split(/::|\./).filter((s) => s.length > 0);
}

function isVisibleFrom(useScope: readonly string[], declContainer: readonly string[]): boolean {
  if (declContainer.length === 0) return true;
  if (sameSymbolPath(useScope, declContainer)) return true;
  const isSuffix = (whole: readonly string[], part: readonly string[]): boolean =>
    whole.length > part.length && sameSymbolPath(whole.slice(whole.length - part.length), part);
  const isPrefix = (whole: readonly string[], part: readonly string[]): boolean =>
    whole.length > part.length && sameSymbolPath(whole.slice(0, part.length), part);
  return isSuffix(useScope, declContainer) || isSuffix(declContainer, useScope) || isPrefix(useScope, declContainer);
}

const qualifiedNameStage: ResolutionStage = {
  id: "qualified-name",
  order: 8,
  title: "Nombre calificado / visibilidad por namespace léxico (N1-b)",
  decide(candidate, ctx) {
    const { role, scope, qualifier } = candidate.from.ref;
    // P1 (Ola P) — un `receiver-member` que llega hasta acá es, por
    // construcción, uno con receptor NO constante (`bare-constant-receiver`,
    // etapa 4, es terminal para los de constante desnuda). Esta etapa mide
    // VISIBILIDAD POR NAMESPACE LÉXICO, y esa pregunta no aplica a un miembro
    // alcanzado a través de un receptor: `x.foo()` no busca `foo` en el
    // ámbito léxico del sitio de uso, lo busca en el tipo de `x` — que es
    // justamente lo que no se sabe. Aplicarle las cuatro condiciones de
    // `isVisibleFrom` rechazaría casi todos (el `container` del método es su
    // clase, que no tiene por qué ser prefijo/sufijo del scope de quien
    // llama) y volvería a convertir "no sé" en "no hay".
    if (role === "receiver-member") return { outcome: "pass" };
    const effectiveScope = role === "qualified" && qualifier != null ? splitQualifierText(qualifier) : scope;
    return narrowedOrReject(
      candidate.targets,
      (t) => {
        const sym = ctx.symbol(t);
        return isVisibleFrom(effectiveScope, sym ? sym.container : t.symbolPath.slice(0, -1));
      },
      "ningún destino es visible desde el namespace léxico del sitio de uso (o del calificador escrito)",
    );
  },
};

/* ───────────────────────── 9. single-file-component ────────────────────── */
/**
 * Tope de ruido de Single-File-Component. INTERPRETACIÓN DECLARADA, no una
 * cifra medida contra un dataset etiquetado de Vue (el dataset etiquetado de
 * esta ola es jekyll/Ruby únicamente — CONTRATO-F3.md §3.5's propio
 * requisito de honestidad): los ecosistemas basados en `.vue` (medido por el
 * agente de `graph/symbols.ts`: vueuse 94% de símbolos SIN contenedor,
 * preact 84%) tienen una alta tasa de exports top-level con nombres de
 * composable/convención repetidos entre archivos SFC — el mismo modo de
 * falla que el hub de `each`, pero por convención de ecosistema en vez de
 * por vocabulario de lenguaje. Regla, estructural sobre extensión de archivo
 * y conteo, sin lista de palabras:
 *   1. si ALGÚN target NO es `.vue`, se prefiere: se descartan los `.vue`
 *      (ruido de boilerplate) y sobreviven sólo los no-`.vue`.
 *   2. si TODOS los targets son `.vue` y son más de `SFC_FANOUT_CAP`, se
 *      rechaza entero — demasiados archivos SFC declaran el mismo nombre
 *      para que sea seguro elegir uno.
 *   3. si TODOS son `.vue` pero `<= SFC_FANOUT_CAP`, se deja pasar — que
 *      `global-uniqueness`/`path-proximity` decidan con las reglas generales.
 * `SFC_FANOUT_CAP` no está en `lexicon-inventory.json`: ese inventario
 * escanea una lista FIJA de 7 archivos por nombre (`no-unlisted-lexicon.
 * test.ts`), ninguno bajo `graph/`, así que este umbral queda fuera de su
 * alcance mecánico — reportado, no escondido.
 */
const SFC_FANOUT_CAP = 3;
const isVueFile = (file: string): boolean => file.endsWith(".vue");

const singleFileComponentStage: ResolutionStage = {
  id: "single-file-component",
  order: 9,
  title: "Tope de ruido de Single-File-Component",
  decide(candidate) {
    const { targets } = candidate;
    const nonVue = targets.filter((t) => !isVueFile(t.file));
    if (nonVue.length > 0 && nonVue.length < targets.length) return { outcome: "narrow", targets: nonVue };
    if (nonVue.length === 0 && targets.length > SFC_FANOUT_CAP) {
      return { outcome: "reject", why: `más de ${SFC_FANOUT_CAP} componentes .vue declaran este nombre — ruido de convención de ecosistema` };
    }
    return { outcome: "pass" };
  },
};

/* ────────────────────── 10. module-reachability ─────────────────────────── */
/**
 * B1 — ORDEN-DE-ATAQUE.md #2 ("Resolución de nombres cross-file sin
 * consultar el módulo", eslabón 2). Recicla el grafo de `imports` — 0
 * aristas en `src/` antes del eslabón 1a, 640 después — que hasta ahora
 * `global-uniqueness`/`path-proximity` nunca consultaban: un candidato de
 * OTRO archivo se aceptaba por unicidad global o se desempataba por
 * DISTANCIA DE DIRECTORIO sin preguntar una sola vez si el archivo de origen
 * siquiera importa ese archivo. Medido: 423 aristas `ambiguous` en `src/` (151
 * en el Rails), 630 resueltas por `path-proximity` (247 en el Rails), 65% de
 * las ambiguas con TODOS sus candidatos en el mismo directorio del origen —
 * el desempate por distancia empata por construcción, no por casualidad.
 *
 * Es lo que hacen el binder de TypeScript y stack-graphs de GitHub: un
 * símbolo de otro módulo sólo es alcanzable si el módulo que lo usa lo
 * importa (directa o transitivamente) y el símbolo es público. Acá, en dos
 * condiciones — la SEGUNDA sólo entra en juego si la primera no alcanza:
 *
 *   (a) `ctx.importsModule(fromFile, t.file)` — arista `imports` directa
 *       (un salto) del archivo de origen al archivo candidato. Evidencia
 *       estructural fuerte por sí sola: no exige `exported` — un `require`/
 *       `import` real ya demuestra la relación, y varias gramáticas
 *       soportadas (Ruby, Python) no tienen concepto de "exportado" en
 *       absoluto, así que exigirlo acá apagaría (a) para ellas sin motivo.
 *   (b) `symbol.exported && ctx.reachesModule(fromFile, t.file)` — sin
 *       import directo, el candidato sobrevive igual si es EXPLÍCITAMENTE
 *       exportado (`SymbolFacts.exported`) Y alcanzable por el cierre
 *       transitivo del grafo de imports (cadena de reexportación: el origen
 *       importa un índice que a su vez importa el archivo real). La barra es
 *       más alta acá porque el vínculo es más débil (ningún salto directo).
 *
 * GATE ESTRUCTURAL, no por nombre de lenguaje: `ctx.hasResolvedImports
 * (fromFile)` — si el archivo de origen no tiene NINGUNA arista `imports`
 * resuelta como origen, la etapa entera PASA (no opina, cero narrowing) en
 * vez de rechazar. Sin este gate, el Rails (autoloading, `imports` = 4 en
 * todo el corpus — un verdadero negativo, no un defecto del extractor,
 * misma familia que `extends = 0` en TypeScript) perdería resolución
 * cross-file genuina en masa: la AUSENCIA de imports ahí no es evidencia de
 * que un candidato no sea alcanzable, es evidencia de que este archivo/
 * lenguaje no usa la convención en absoluto. El gate es por ARCHIVO
 * (¿este `fromFile` concreto tiene imports resueltos propios?), no por
 * lenguaje del archivo — un archivo TypeScript de sólo tipos sin un solo
 * `import` tampoco dispara la etapa, por la misma razón estructural.
 *
 * Candidatos del MISMO archivo (`t.file === fromFile`) nunca se filtran acá
 * — esta etapa es puramente inter-archivo, `qualified-name`/`class-member`
 * ya decidieron la visibilidad intra-archivo antes de llegar.
 *
 * *** NUNCA RECHAZA A CERO — REGRESIÓN MEDIDA Y CORREGIDA (Rails, primera
 * versión de esta etapa). *** `narrowedOrReject` (el helper que usa el resto
 * de la cascada) convierte "ningún target sobrevive" en `reject`. Acá NO: si
 * ALGÚN target es alcanzable, se narrowea a esos (evidencia positiva, se
 * usa); si NINGUNO lo es, la etapa PASA (dev vuelve `candidate.targets`
 * intacto), nunca `reject`. Medido, con `dump-graph-census.mts` antes/después
 * sobre el Rails real (`<repo privado del usuario>/Backend`): la primera
 * versión (con `narrowedOrReject`, rechazo a cero incluido) bajaba
 * `references` de 2.546 a 2.534 — 12 aristas genuinamente correctas
 * perdidas, TODAS del mismo patrón: un script Ruby con exactamente UN
 * `require_relative` propio (que abre el gate de `hasResolvedImports`) hacia
 * un archivo A, referenciando variables top-level legítimas de un archivo B
 * *no relacionado* con ESE import — antes resolvían por `global-uniqueness`
 * (dueño global único, sin necesitar import alguno) o por `path-proximity`
 * (incluso archivos en el MISMO directorio, `scripts/extract_filter.rb` ↔
 * `scripts/test_scraper.rb`, ninguno de los dos se `require`a al otro). El
 * gate por archivo (`hasResolvedImports`) es necesariamente GROSERO — un
 * único `require_relative` no prueba que TODAS las dependencias cross-file
 * de ese archivo pasen por el grafo de imports, sólo que ÉSA lo hizo — así
 * que la ausencia de una ruta hacia UN candidato puntual no es evidencia de
 * que ese candidato esté mal, es la misma clase de "no sé" que el resto de
 * esta cascada respeta. Con la corrección (nunca rechazar a cero):
 * `references` en el Rails queda en 2.534 → **2.546, delta 0** — exactamente
 * el mismo total que antes de que esta etapa existiera, con `ambiguous`
 * intacto en 151/151 — la etapa deja de tocar un solo caso real del Rails,
 * que es lo correcto dado que el corpus casi no tiene grafo de imports
 * (`hasResolvedImports` rara vez es `true`) y punto de partida son
 * lenguajes SIN concepto de `export` en absoluto. Sobre `src/`, donde el
 * gate SÍ abre ampliamente (640 aristas `imports` reales), el efecto es
 * idéntico en los casos que importan: la ganancia (424 → 67 `ambiguous`,
 * `resolved` 6.392 → 7.014, nunca abajo) viene de NARROWEAR candidatos con
 * >1 target donde AL MENOS UNO es alcanzable — nunca de rechazar un
 * candidato ya único que simplemente no tenía import. Ver
 * `resolve.test.ts`'s casos "conserva"/"NUNCA rechaza a cero" para la
 * cobertura exacta de cuándo cada rama dispara.
 */
const moduleReachabilityStage: ResolutionStage = {
  id: "module-reachability",
  order: 10,
  title: "Alcanzabilidad por módulo — imports directo o exportado+transitivo (eslabón 2)",
  decide(candidate, ctx) {
    const fromFile = candidate.from.file;
    if (!ctx.hasResolvedImports(fromFile)) return { outcome: "pass" };
    const isReachable = (t: SymbolRef): boolean => {
      if (t.file === fromFile) return true;
      if (ctx.importsModule(fromFile, t.file)) return true;
      const sym = ctx.symbol(t);
      return (sym?.exported ?? true) && ctx.reachesModule(fromFile, t.file);
    };
    const reachable = candidate.targets.filter(isReachable);
    if (reachable.length === candidate.targets.length) return { outcome: "pass" }; // nada que narrowear
    if (reachable.length === 0) return { outcome: "pass" }; // sin evidencia positiva para NINGÚN target — se abstiene, nunca rechaza a cero
    return { outcome: "narrow", targets: reachable };
  },
};

/* ────────────────────────── 11. typeless-receiver ──────────────────────── */
/**
 * P1 (Ola P) — EL PEDIDO MÁS GRANDE DEL TABLERO, cerrado acá. Es la etapa que
 * decide el caso que `syntactic-role` rechazaba: `x.miembro(...)` con un
 * receptor que no es una constante desnuda, o sea **toda llamada a un miembro
 * en 8 de las 9 gramáticas soportadas**.
 *
 * LO QUE SE SABE del sitio, y es mucho más que nada: la gramática dice que
 * hay un acceso a un miembro llamado `N`, y el índice del repo dice que hay
 * K declaraciones de `N` (K ≥ 1, o el candidato no existiría —
 * `build.ts#buildCandidatesForFile`). LO QUE NO SE SABE: de qué tipo es el
 * receptor, y por lo tanto cuál de las K es el destino — o si el destino es
 * un tipo de afuera del repo y ninguna de las K lo es. Eso es EXACTAMENTE
 * `provenance: "ambiguous"` (CONTRATO-F9.md §4.1): "hay relación, no sé
 * cuál", con los destinos posibles enumerados en `alternatives` y con la
 * regla de seguridad §4.5 (fuera de toda consulta por defecto) protegiendo a
 * los consumidores que necesitan certeza.
 *
 * POR QUÉ NO SE ACEPTA COMO `resolved` NI SIQUIERA CON UN SOLO DESTINO VIVO.
 * Un único homónimo en todo el repo NO es "dueño global único": el receptor
 * podría ser de un tipo de la biblioteca estándar o de una dependencia, y
 * entonces la única declaración del repo con ese nombre es una coincidencia,
 * no el destino. Ésa es la diferencia entre esta etapa y `global-uniqueness`,
 * y es la razón por la que corre ANTES: si corriera después, un `x.foo()`
 * con un solo `foo` en el repo saldría con `provenance: "resolved"`, una
 * afirmación estructural cierta que acá no se puede hacer. Medido: sobre el
 * dataset etiquetado a mano, el estrato de estos candidatos da **21/40
 * `correcta` en jekyll (Ruby) y 9/30 en guava (Java)** — 52 % y 30 %, muy
 * por debajo del piso 0,90 de la cláusula 1 de `resolve-gate.test.ts`.
 * Emitirlas como `resolved` habría hundido esa compuerta; emitirlas como
 * `ambiguous` no la toca (sólo mide `final === "resolved"`) y aun así lleva
 * la información al grafo.
 *
 * LA NARROWING PROPIA DE LA ETAPA, con la misma disciplina de
 * `module-reachability` (evidencia positiva sí, rechazo a cero nunca): si
 * ALGUNO de los destinos vivos es un MIEMBRO (`SymbolFacts.memberOfClassLike`)
 * se prefieren ésos y se descartan los que no lo son — un sitio escrito con
 * receptor explícito está accediendo a un miembro, así que una función suelta
 * homónima es peor candidata. Si NINGUNO es miembro, la etapa NO se abstiene
 * de emitir: conserva el conjunto entero. Esa segunda rama importa y es
 * deliberada — `memberOfClassLike` es un hecho que cada gramática puebla a su
 * manera (Go lo deriva del campo `receiver`, no de un ancestro; un método de
 * literal de objeto en JS queda aplanado), y una etapa que exigiera
 * `memberOfClassLike` para emitir se apagaría entera en la gramática donde
 * ese hecho todavía no llegue — el modo de falla "un lenguaje en cero
 * mientras los otros sobreviven" que este proyecto ya pagó caro una vez.
 */
const typelessReceiverStage: ResolutionStage = {
  id: "typeless-receiver",
  order: 11,
  title: "Receptor sin tipo — se emite como `ambiguous`, no se descarta",
  decide(candidate, ctx) {
    const { role, qualifierIsBareConstant } = candidate.from.ref;
    if (role !== "receiver-member" || qualifierIsBareConstant) return { outcome: "pass" };
    if (candidate.targets.length === 0) {
      // Defensivo: ninguna etapa anterior deja un candidato vivo con cero
      // destinos (todas rechazan a cero, salvo `module-reachability`, que se
      // abstiene). Si llegara, no hay nada que enumerar y "no sé cuál" sería
      // una arista sin destinos posibles, o sea ruido puro.
      return { outcome: "reject", why: "acceso a miembro con receptor sin tipo y ningún destino sobreviviente que enumerar" };
    }
    const members = candidate.targets.filter((t) => ctx.symbol(t)?.memberOfClassLike === true);
    return {
      outcome: "ambiguous",
      targets: members.length > 0 ? members : candidate.targets,
      why:
        "acceso a un miembro a través de un receptor cuyo tipo no se conoce: el uso es real, pero el destino es " +
        "cualquiera de las declaraciones homónimas enumeradas — o un tipo de fuera del repo",
    };
  },
};

/* ────────────────────────── 12. global-uniqueness ─────────────────────── */
const globalUniquenessStage: ResolutionStage = {
  id: "global-uniqueness",
  order: 12,
  title: "Dueño global único",
  decide(candidate) {
    if (candidate.targets.length === 1) return { outcome: "accept", target: candidate.targets[0]!, provenance: "resolved" };
    return { outcome: "pass" }; // 0 → queda unresolved; >1 → path-proximity intenta desempatar
  },
};

/* ─────────────────────────── 13. path-proximity ────────────────────────── */
/**
 * Último desempate, sólo para candidatos que llegan con >1 target vivo (todo
 * lo anterior narrowed pero no pudo decidir solo). Heurística de distancia
 * de directorio entre el archivo de uso y cada archivo candidato (segmentos
 * de path NO compartidos desde la raíz) — el ÚNICO caso de esta cascada cuyo
 * `provenance` de aceptación es `"inferred"`, no `"resolved"`: no hay
 * garantía estructural de que "el archivo más cercano" sea el correcto, sólo
 * una probabilidad razonable en monorepos donde código relacionado vive
 * cerca. Si hay empate en la distancia mínima, no decide (queda
 * `droppedAmbiguous`) — inventar un ganador de un empate sería la clase de
 * heurística sin fundamento que el resto de esta cascada evita a propósito.
 */
function pathDistance(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  let shared = 0;
  while (shared < as.length - 1 && shared < bs.length - 1 && as[shared] === bs[shared]) shared++;
  return as.length - 1 - shared + (bs.length - 1 - shared);
}

const pathProximityStage: ResolutionStage = {
  id: "path-proximity",
  order: 13,
  title: "Proximidad de path (desempate final, heurístico)",
  decide(candidate) {
    const { targets } = candidate;
    if (targets.length <= 1) return { outcome: "pass" };
    const fromFile = candidate.from.file;
    let best: SymbolRef | null = null;
    let bestDist = Infinity;
    let tie = false;
    for (const t of targets) {
      const d = pathDistance(fromFile, t.file);
      if (d < bestDist) {
        bestDist = d;
        best = t;
        tie = false;
      } else if (d === bestDist) {
        tie = true;
      }
    }
    if (best && !tie) return { outcome: "accept", target: best, provenance: "inferred" };
    return { outcome: "pass" };
  },
};

/** El orden real de ejecución — ver el docstring de este archivo para por qué difiere del orden de listado de `ResolutionStageId`. */
export const ALL_STAGES: readonly ResolutionStage[] = [
  syntacticRoleStage,
  localShadowStage,
  classMemberStage,
  typeSlotStage,
  bareConstantReceiverStage,
  selfReceiverStage,
  namespaceContainerStage,
  qualifiedNameStage,
  singleFileComponentStage,
  moduleReachabilityStage,
  typelessReceiverStage,
  globalUniquenessStage,
  pathProximityStage,
];

interface MutableStageStat {
  stage: ResolutionStageId;
  order: number;
  considered: number;
  accepted: number;
  rejected: number;
  narrowed: number;
  passed: number;
  /** P1 (Ola P) — candidatos que ESTA etapa cerró con el veredicto terminal `ambiguous`. */
  ambiguous: number;
}

function emptyStat(stage: ResolutionStage): MutableStageStat {
  return { stage: stage.id, order: stage.order, considered: 0, accepted: 0, rejected: 0, narrowed: 0, passed: 0, ambiguous: 0 };
}

/**
 * El motor de la cascada. Puro respecto de I/O: toda la información sobre
 * declaraciones/símbolos llega por `ctx`, nunca se re-parsea nada acá.
 */
export function resolveReferences(
  stages: readonly ResolutionStage[],
  candidates: Iterable<ResolutionCandidate>,
  ctx: ResolutionContext,
  options?: ResolveOptions,
): { readonly edges: readonly CodeGraphEdge[]; readonly stats: ResolutionStats } {
  const statsByStage = new Map(stages.map((s) => [s.id, emptyStat(s)]));
  const edges: CodeGraphEdge[] = [];
  let candidateCount = 0;
  let resolved = 0;
  let droppedAmbiguous = 0;
  let unresolved = 0;
  let ambiguousEdges = 0;
  let ambiguousOverflow = 0;
  const unresolvedByFile = new Map<string, { stage: ResolutionStageId; n: number }>();
  // CONTRATO-F9.md §4.3: "con la etapa que los mató". Un candidato
  // `ambiguous`/`unresolved` NUNCA pasa por un veredicto terminal (por
  // definición: si alguna etapa hubiera decidido, sería `resolved`/
  // `rejected`) — no hay "la etapa que lo mató" en sentido literal. Se usa la
  // ÚLTIMA etapa de la cascada que le aplicó un `narrow` real (achicó el
  // conjunto de targets) como "hasta dónde llegamos"; si NINGUNA etapa lo
  // tocó (targets sale idéntico de las 9 etapas, el caso típico de
  // `unresolved` — ver `resolve.test.ts`, "nunca se construye así en
  // producción"), cae a la ÚLTIMA etapa de la cascada (`stages.at(-1)`,
  // `path-proximity` en `ALL_STAGES`): "llegó hasta el final sin que nada lo
  // cambiara" es la lectura honesta de ese caso.
  const terminalStageId: ResolutionStageId | undefined = stages.length > 0 ? stages[stages.length - 1]!.id : undefined;

  /**
   * LA ÚNICA forma de emitir una arista `ambiguous` — CONTRATO-F9.md §4.2.
   * La usan los DOS caminos que llegan a "hay relación, no sé cuál": el
   * descarte del final de la cascada (>1 destino vivo, nadie decidió) y, desde
   * P1 (Ola P), el veredicto terminal `ambiguous` de una etapa
   * (`typeless-receiver`). Estaba escrita en línea dentro del primero;
   * duplicarla para el segundo habría dejado dos ordenamientos, dos topes y
   * dos formas de armar `alternatives` que hay que mantener sincronizadas a
   * mano. `resolvedBy` lo elige el llamador: la etapa que decidió, o la última
   * que narrowed, según el camino.
   */
  function emitAmbiguousEdge(
    from: ReferenceSite,
    targets: readonly SymbolRef[],
    resolvedBy: ResolutionStageId | undefined,
  ): void {
    droppedAmbiguous++;
    const sorted = [...targets].sort(bySymbolRefLex);
    if (sorted.length > AMBIGUOUS_MAX_TARGETS) {
      // §4.2: "un candidato con 40 declaraciones homónimas no es información,
      // es la ausencia de información" — se cuenta y no se emite arista.
      ambiguousOverflow++;
      return;
    }
    ambiguousEdges++;
    const to = sorted[0]!;
    const roles = roleMaskFor(from.ref.role);
    edges.push({
      from: symbolNodeId(from.file, from.ref.scope),
      to: symbolNodeId(to.file, to.symbolPath),
      kind: "references",
      provenance: "ambiguous",
      weight: from.ref.occurrences,
      ...(resolvedBy !== undefined ? { resolvedBy } : {}),
      ...(roles !== undefined ? { roles } : {}),
      ...(sorted.length > 1 ? { alternatives: sorted.slice(1).map((t) => symbolNodeId(t.file, t.symbolPath)) } : {}),
    });
  }

  for (const initial of candidates) {
    candidateCount++;
    let candidate = initial;
    const perStage: { stage: ResolutionStageId; verdict: StageVerdict }[] = [];
    let finalOutcome: "resolved" | "rejected" | "ambiguous" | "unresolved" | null = null;
    let finalStage: ResolutionStageId | null = null;
    let lastNarrowStage: ResolutionStageId | undefined;

    for (const stage of stages) {
      const stat = statsByStage.get(stage.id)!;
      stat.considered++;
      const verdict = stage.decide(candidate, ctx);
      perStage.push({ stage: stage.id, verdict });

      if (verdict.outcome === "accept") {
        stat.accepted++;
        finalOutcome = "resolved";
        finalStage = stage.id;
        resolved++;
        {
          const roles = roleMaskFor(candidate.from.ref.role);
          edges.push({
            from: symbolNodeId(candidate.from.file, candidate.from.ref.scope),
            to: symbolNodeId(verdict.target.file, verdict.target.symbolPath),
            kind: "references",
            provenance: verdict.provenance,
            weight: candidate.from.ref.occurrences,
            resolvedBy: stage.id,
            ...(roles !== undefined ? { roles } : {}),
          });
        }
        break;
      }
      if (verdict.outcome === "reject") {
        stat.rejected++;
        finalOutcome = "rejected";
        finalStage = stage.id;
        break;
      }
      if (verdict.outcome === "ambiguous") {
        // P1 (Ola P) — el cuarto terminal. A diferencia del `ambiguous` por
        // descarte (abajo), acá SÍ hay "la etapa que lo decidió": queda en
        // `finalStage` y en `resolvedBy` de la arista, así que el evento
        // sigue atribuido a exactamente una etapa, como pide la invariante de
        // medibilidad de CONTRATO-F3.md §3.3.
        stat.ambiguous++;
        finalOutcome = "ambiguous";
        finalStage = stage.id;
        emitAmbiguousEdge(candidate.from, verdict.targets, stage.id);
        break;
      }
      if (verdict.outcome === "narrow") {
        stat.narrowed++;
        lastNarrowStage = stage.id;
        candidate = { ...candidate, targets: verdict.targets };
        continue;
      }
      stat.passed++;
    }

    if (finalOutcome === null) {
      const resolvedByFallback = lastNarrowStage ?? terminalStageId;
      if (candidate.targets.length > 1) {
        finalOutcome = "ambiguous";
        // CONTRATO-F9.md §4 — Contrato 4: se conserva como arista `ambiguous`
        // en vez de descartarse en silencio, salvo overflow. La emisión (y el
        // conteo de `droppedAmbiguous`/`ambiguousEdges`/`ambiguousOverflow`)
        // vive en `emitAmbiguousEdge`, compartida con el veredicto terminal
        // `ambiguous` de una etapa — ver su docstring.
        emitAmbiguousEdge(candidate.from, candidate.targets, resolvedByFallback);
      } else {
        finalOutcome = "unresolved";
        unresolved++;
        // "Las que ninguna etapa emparejó se descartan con conteo por
        // archivo y etapa" (CONTRATO-F9.md §4.3) — nunca arista, sólo cuenta.
        if (resolvedByFallback !== undefined) {
          const file = candidate.from.file;
          const acc = unresolvedByFile.get(file);
          if (acc) acc.n++;
          else unresolvedByFile.set(file, { stage: resolvedByFallback, n: 1 });
        }
      }
    }

    options?.trace?.({
      candidateId: initial.id,
      perStage,
      final: finalOutcome,
      // `finalStage` sólo se setea en los TRES terminales atribuibles a una
      // etapa (`accept`/`reject`/`ambiguous`); queda `null` para el
      // `ambiguous` por descarte y para `unresolved`, que por definición no
      // tienen etapa que los haya decidido.
      finalStage,
    });
  }

  // Post-procesado: colapsar aristas paralelas (mismo from/to/kind) sumando
  // peso — CONTRATO-F3.md §3.1, "weight: Ocurrencias colapsadas. >= 1." Puede
  // pasar cuando dos ReferenceFacts DISTINTAS del mismo contenedor (distinto
  // `role`/`qualifier`, mismo `name`) resuelven al mismo símbolo.
  const merged = new Map<string, CodeGraphEdge>();
  for (const e of edges) {
    const key = `${e.from}|${e.to}|${e.kind}`;
    const existing = merged.get(key);
    if (existing) {
      // *** UNA OCURRENCIA MÁS DÉBIL NO APORTA NADA A UNA MÁS FUERTE —
      // REGRESIÓN MEDIDA Y CORREGIDA EN LA MISMA OLA QUE LA INTRODUJO
      // (P1, Ola P). ***
      //
      // Este colapso hacía dos cosas que, mientras `receiver-member` nunca
      // producía arista, no se podían notar: se quedaba con la provenance del
      // PRIMER candidato que llegara a la clave, y hacía OR de `roles` y suma
      // de `weight` entre ocurrencias de provenance DISTINTA. Con
      // `typeless-receiver` emitiendo, un mismo par `(from,to,kind)` recibe
      // ahora dos ocurrencias de naturaleza distinta — una FIRME (`foo()`
      // desnudo que la cascada resolvió) y una AMBIGUA (`x.foo()` del mismo
      // contenedor al mismo destino) — y las dos fusiones producían una
      // afirmación falsa:
      //   · si la ambigua llegaba primero, la arista quedaba `ambiguous` y la
      //     resolución firme desaparecía del fan-in;
      //   · si llegaba segunda, la arista quedaba firme pero **con el bit de
      //     rol `receiver-member` prendido**, o sea declarando que la cascada
      //     ATRIBUYÓ un uso por receptor cuando lo único que hizo fue verlo.
      // Ese segundo caso está medido y es el que importaba: `unused-symbol`
      // lee justamente ese bit para decidir si en un lenguaje puede medir el
      // uso de un miembro (su PUERTA 3), así que 37 aristas de click con el
      // bit prestado abrían la puerta para TODO python y el detector pasaba de
      // 48 a 74 ubicaciones, las 26 nuevas falsas. Mismo mecanismo en csharp
      // (46 → 188 de volumen) y javascript (21 → 34).
      //
      // La regla correcta: **el par vale lo que vale su ocurrencia más
      // fuerte** (`declared` > `resolved` > `inferred` > `ambiguous`). Las
      // ocurrencias más débiles se descartan enteras — no aportan `weight`
      // (una ocurrencia que no se supo atribuir no es evidencia contable de
      // ESTE par), no aportan `roles` (misma razón, y es el bit que se
      // prestaba) y no aportan `alternatives` (CONTRATO-F9.md §4.2 lo declara
      // presente SÓLO en aristas ambiguas). Entre ocurrencias de la MISMA
      // fuerza se conserva el comportamiento de siempre: `weight` suma,
      // `roles` hace OR y `alternatives` se une.
      const cmp = PROVENANCE_STRENGTH[e.provenance] - PROVENANCE_STRENGTH[existing.provenance];
      if (cmp < 0) continue; // la nueva es más débil: se descarta entera
      if (cmp > 0) {
        merged.set(key, e); // la nueva es más fuerte: reemplaza entera
        continue;
      }
      const roles = mergeRoles(existing.roles, e.roles);
      // Dos candidatos `ambiguous` distintos pueden colapsar a la misma clave
      // `from|to|kind` (mismo primer candidato lexicográfico) con conjuntos
      // de `alternatives` distintos — unión, no "se queda con el primero",
      // para no perder destinos posibles que el segundo candidato sí traía.
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
    } else {
      merged.set(key, e);
    }
  }

  const byStage: ResolutionStageStat[] = stages.map((s) => statsByStage.get(s.id)!);

  return {
    edges: [...merged.values()],
    stats: {
      candidates: candidateCount,
      resolved,
      droppedAmbiguous,
      unresolved,
      byStage,
      ambiguousEdges,
      ambiguousOverflow,
      unresolvedByFile: sortAndCapUnresolvedByFile(unresolvedByFile),
    },
  };
}

/** `n` desc, empate por `file` asc (determinismo) — tope `UNRESOLVED_REPORT_MAX_FILES`, "los peores primero, nunca la lista completa" (CONTRATO-F9.md §4.3). */
function sortAndCapUnresolvedByFile(
  byFile: ReadonlyMap<string, { readonly stage: ResolutionStageId; readonly n: number }>,
): readonly { readonly file: string; readonly stage: ResolutionStageId; readonly n: number }[] {
  return [...byFile.entries()]
    .map(([file, v]) => ({ file, stage: v.stage, n: v.n }))
    .sort((a, b) => (b.n !== a.n ? b.n - a.n : a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .slice(0, UNRESOLVED_REPORT_MAX_FILES);
}
