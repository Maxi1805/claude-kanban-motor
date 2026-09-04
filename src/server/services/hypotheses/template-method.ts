/**
 * Template Method — F6, migración de
 * `pattern-behavioral.ts#findTemplateMethodOpportunities` (línea 628) al
 * motor de hipótesis (CONTRATO-F6.md Contrato 1/3). Ola 10 (CONTRATO-F10.md):
 * el excluder deja de leer vocabulario y pasa a leer estructura del grafo —
 * ver "LAS TRES FORMAS" abajo. Único archivo compartido tocado: `registry.ts`
 * (dos líneas, ya existentes desde F6 — no se toca esta ola).
 *
 * ─── EL ANCLA, SIN CAMBIOS ESTA OLA ─────────────────────────────────────────
 * `distributed-duplication` (primaria) / `parallel-hierarchies` (secundaria).
 * `ctx.file`/`ctx.fileAt` son SIEMPRE `null` en el cableado de producción de
 * hoy (`run.ts`, verificado), así que esta hipótesis NO usa AST vivo para
 * encontrar el grupo candidato — lee `ctx.repo.clones` (`CloneCandidate`)
 * para el ancla primaria y `ctx.repo.graph`/`graph` (símbolos
 * `function-like`/`class-like`) para la secundaria. Esto es IGUAL que antes.
 *
 * ─── LO QUE CAMBIA: LAS TRES FORMAS, COMO HECHOS DE GRAFO (CONTRATO-F10.md §2) ─
 *
 * Las tres formas NO cambian el `required` (grupo ganador por nombre de
 * método + similitud textual — sigue igual, es la parte AUSENTE) — cambia
 * SÓLO el excluder (`appliedState`), que decidía antes con
 * `CloneCandidate.superclassName` (un campo de texto) + `DELEGATION_PATTERN`
 * (una regex de vocabulario: `/\bsuper\b|\bbase\s*\./i`). Los dos se retiran.
 * En su lugar, tres hechos de grafo, ninguno nuevo, los tres con emisión ya
 * confirmada (`extends`, `graph/types.ts#memberSignatures`, `calls`):
 *
 *   COMPLETA (⇒ `ya-aplicado`, nunca una sugerencia):
 *     B con >= 2 nodos que la `extends` (subtipos) ∧
 *     `memberSignatures(B)` declara `m` (el esqueleto) que NINGÚN subtipo
 *       redeclara con la misma `(name, arity)` ∧
 *     `memberSignatures(B)` declara >= 1 `g` (gancho) que TODOS los subtipos
 *       SÍ redeclaran con la misma `(name, arity)` ∧
 *     `sym:B.m --calls--> sym:B.g` para al menos ese `g`.
 *     Sale ENTERA de `extends` + `memberSignatures` + `calls` — sin ninguna
 *     arista nueva y sin la ranura tipada (CONTRATO-F10.md, nota de la tarea).
 *
 *   PARCIAL (⇒ sugerencia: "subir el esqueleto"):
 *     Los subtipos comparten B (`extends` presente, confirmado) pero el
 *     esqueleto NO vive en B: `memberSignatures(B)` no tiene `m`, y cada
 *     subtipo lo repite por su cuenta (eso ya lo confirma el `required`
 *     textual/de similitud, sin cambios).
 *     **OLA AF (AF5) — ESTE CASO SE PARTIÓ EN DOS**, ver abajo: sigue siendo
 *     `parcial` sólo cuando B YA hospeda una plantilla para OTRO miembro, o
 *     cuando no se pudo leer ni un miembro de B.
 *
 *   AUSENTE (⇒ sugerencia: "extraer un Template Method"):
 *     (a) Lo de siempre: >= 2 unidades con el mismo nombre de método y SIN
 *     ancestro común confirmado vía `extends` NI vía `mixes-in` (R5: ninguno
 *     de los dos existe — ni el dato, ni el nodo, ni la arista).
 *     (b) **OLA AF (AF5), NUEVO — el único caso que un input real alcanza en
 *     las cuatro celdas de este patrón**: ancestro B confirmado, `m` NO vive
 *     en B, las declaraciones de B se pudieron LEER (>= 1 miembro visible) y
 *     B **no hospeda ninguna plantilla**: ningún gancho redeclarado por TODOS
 *     los hermanos e invocado desde otro miembro del propio B. O sea: no hay
 *     NADA del patrón puesto arriba, y "acá falta un Template Method" es
 *     literal. Ver el bloque `OLA AF, FRENTE AF5` dentro de `stateFromFacts`
 *     para las cuatro compuertas que hacían esto imposible, los números que
 *     las midieron y la prueba de aditividad.
 *
 *   APLICADO-ELUDIDO (⇒ alerta de fuga, no sugerencia — el cuarto estado que
 *   CONTRATO-F10.md ya modela como "COMPLETA + puenteo"):
 *     Ancestro confirmado + `m` vive en B, PERO al menos un subtipo
 *     REDECLARA `m` con la misma `(name, arity)` — reimplementa el esqueleto
 *     entero en vez de heredarlo. Reemplaza a `DELEGATION_PATTERN`
 *     (`super`/`base.` en el texto): antes se buscaba la palabra que
 *     confirma la delegación; ahora se confirma la AUSENCIA de redeclaración
 *     (`memberSignatures` del subtipo no trae `m`) — más fuerte, porque no
 *     depende de qué palabra clave use cada lenguaje para invocar al padre
 *     (y varios ni la necesitan: un método no overrideado ya delega por
 *     construcción, sin ninguna palabra).
 *
 * ─── REQUISITO 3 DEL CONTRATO — **REVERTIDO CON MEDICIÓN EN LA OLA U** ─────
 * ATENCIÓN, LEER ANTES DEL PÁRRAFO SIGUIENTE: lo que describe ("cuando `B` ya
 * declara `m` y NINGÚN subtipo lo redeclara, el estado es `ya-aplicado` de
 * todas formas") YA NO ES LO QUE EL CÓDIGO HACE. Se conserva textual porque
 * documenta la decisión que la Ola U midió y revirtió — ver el bloque "OLA U
 * — LAS TRES INTENCIONES" más abajo, INTENCIÓN 3, y el docstring de
 * `stateFromFacts#hookCheck`. Resumen: la medición que este mismo párrafo
 * pedía se hizo, y dio 160 de 162 `ya-aplicado` con el gancho SIN confirmar;
 * la premisa "esa evidencia sola ya es suficiente para no recomendar el
 * patrón" resultó falsa, porque esa evidencia no distingue una plantilla de
 * cualquier método heredado.
 *
 * ─── (texto original del REQUISITO 3, histórico) ───────────────────────────
 * El gancho (`g` + `calls`) es la parte MÁS FINA de la forma COMPLETA: puede
 * fallar por dos motivos bien distintos — (a) genuinamente no hay ningún
 * paso variable compartido (B sólo tiene un método homónimo por coincidencia,
 * no un esqueleto de pasos), o (b) el gancho existe pero la arista `calls`
 * de `B.m` a `B.g` no aterrizó (mismo riesgo que documenta
 * `wrapping-chain.ts`: `calls` con role `receiver-member` no siempre llega a
 * la arista final). Esta hipótesis NO arriesga una adivinanza entre las dos:
 * cuando `B` ya declara `m` y NINGÚN subtipo lo redeclara, el estado es
 * `ya-aplicado` de todas formas (esa evidencia sola ya es suficiente para no
 * recomendar el patrón — recomendarlo sería el falso positivo que el usuario
 * rechazó dos veces), pero el check `gancho-redeclarado-por-todos-e-invocado-
 * desde-el-esqueleto` queda en el resultado con `passed: false` y el motivo
 * exacto declarado en su `why` — nunca se oculta que la confirmación más
 * fuerte no se alcanzó. Es la MEDICIÓN que este frente tiene que hacer
 * (CONTRATO-F10.md, nota de la tarea): cuántas veces la forma COMPLETA se
 * confirma ENTERA (con gancho + calls) contra cuántas veces sólo la mitad
 * (ancestro + esqueleto sin redeclarar, sin gancho confirmado).
 *
 * ─── HIGIENE HEREDADA (preservada a propósito) ──────────────────────────
 * Funciones ANÓNIMAS se descartan antes de agrupar (mismo criterio que
 * antes). Unidades DISTINTAS se cuentan por `Set<unitName>`.
 *
 * ─── discriminators (cada uno confirmado sube un peldaño, sólo aplica a
 *      ausente/parcial — `ya-aplicado`/`aplicado-eludido` no compiten por
 *      confianza, ver `engine.ts`) ────────────────────────────────────────
 * `rule-of-three-units`, `high-average-similarity`, `anchor-is-distributed-
 * duplication` — sin cambios respecto de antes.
 *
 * `ceiling: "alta"`. PROVISIONAL (K2): no re-derivado contra el corpus externo.
 *
 * BRECHA DECLARADA (Go): sin `family: "class-like"`/`extends` (Go usa
 * composición por embedding, sin herencia de implementación), los tres
 * lenguajes con `extends` real (Java/C#/TS/JS/Python/Ruby) son los únicos
 * donde COMPLETA/APLICADO-ELUDIDO pueden confirmarse — en Go, el excluder cae
 * siempre a AUSENTE (no hay ancestro que buscar), igual que antes.
 *
 * RIESGO A9 (ACTUALIZADO en R5, parcialmente resuelto): esta hipótesis usaba
 * sólo `extends` para el ancestro común; desde R5 usa `extends` Y `mixes-in`
 * (`FAMILY_EDGE_KINDS` — ver la sección "R5" más abajo). Sigue sin usar
 * `satisfies`/`implements` A PROPÓSITO, no por descuido: son de satisfacción
 * de INTERFAZ, nunca de herencia de IMPLEMENTACIÓN — el target de esas dos
 * aristas nunca tiene un cuerpo de método que ejecutar, así que incluirlas
 * fabricaría un `skeletonDeclaredInAncestor: true` en cuanto el nombre
 * coincidiera con una firma de interfaz (un falso "ya-aplicado" de la MISMA
 * familia que esta tarea vino a cerrar, no a abrir uno nuevo) — el riesgo de
 * `satisfies` en C# (CONTRATO-F10.md §3, nota 2) sigue sin aplicar a este
 * archivo, ahora por una razón declarada explícitamente, no por omisión.
 *
 * ─── FORMA EN LENGUAJES SIN CLASES ─────────────────────────────────────────
 * El `required`/discriminadores NO exigen clase (sin cambios). El excluder
 * SÍ los necesita (no hay `extends` sin clases) — sin nodo de clase
 * resoluble para alguna unidad, el ancestro común quedasin confirmar y el
 * excluder cae al mismo lugar que "sin ancestro" (ver abajo). El COSTO
 * (`cost`) sigue variando según la capacidad `herencia`.
 *
 * ─── CON QUÉ SE CONFUNDE ────────────────────────────────────────────────────
 * Sin cambios respecto de antes — ver `toConfirm`.
 *
 * ─── ANCLAS ESTRUCTURALES NUEVAS, `large-class`/`refused-bequest` (esta
 * tarea, registro de pendientes §Problema 2) ────────────────────────────────
 * Las dos anclas de arriba son `inter-file` — corren en `crossAnalyze`, con
 * `ctx.file` SIEMPRE `null` y el grafo real disponible (verificado leyendo
 * `code-analyzer.ts`). `large-class`/`refused-bequest` son `intra-file`: la
 * MISMA llamada que corre `intra-function` con árbol vivo (`analyzeFile`,
 * `scopes: ["intra-function", "intra-file"]`) también las corre a ELLAS con
 * árbol vivo — pero ahí `repo.graph` viaja `null` (a propósito, ver
 * `code-analyzer.ts`), así que la terna `extends`+`memberSignatures`+`calls`
 * (basada en grafo, sin cambios arriba) no tiene de dónde leer. Para estas
 * dos anclas nuevas, la familia de subtipos se deriva de AST, RESTRINGIDA AL
 * MISMO ARCHIVO (`findAstFamily`/`astStructuralAncestorFacts`, más abajo) —
 * la misma limitación "la base tiene que estar en este archivo" que
 * `refused-bequest.ts` ya declara para su propia comparación. Sin `calls` a
 * mano, esta vía NUNCA confirma el gancho (`hooks: []`,
 * `skeletonCallsHook: false`, con el mismo texto de "no confirmado" que ya
 * usa `hookCheck`) — declarado, no adivinado; no cambia el `state` (ver el
 * docstring de `appliedState` original: el gancho nunca gatea `ya-aplicado`).
 * Sin esto, una clase LIMPIA con ≥2 hermanas que ya comparten el esqueleto en
 * la base (sin ninguna duplicación textual que dispare `distributed-
 * duplication`, y sin grafo para `parallel-hierarchies`) nunca llegaba a
 * ningún estado — 0 hipótesis, igual que Decorator sobre `ColorDecorator`.
 *
 * ─── EL HUECO MEDIDO (esta tarea): `findAstFamily` SÓLO EN ESTE ARCHIVO ────
 * 4 hallazgos `large-class` reales (2 en `src/`, 2 en el Rails) rechazados
 * por `required` — los 4 son clases HOJA cuya base vive en OTRO archivo (en
 * Ruby/Java/C#, una clase por archivo: la familia NUNCA está en el mismo
 * archivo). `findAstFamily` no encuentra nada ⇒ `entries: []` ⇒
 * `hasNamedSkeletonEntries` (`required`) falla ⇒ `engine.ts#build` devuelve
 * `null` — ni siquiera candidata, sin dejar rastro para una segunda pasada.
 *
 * EL ARREGLO: cuando `findAstFamily` no encuentra familia EN ESTE ARCHIVO
 * pero la clase del ancla SÍ declara una superclase por AST (por texto,
 * `extractSuperclassNameTM` — sin exigir que esa clase esté definida acá),
 * `buildFromStructuralAnchor` emite un placeholder DIFERIDO
 * (`deferredStructuralHypothesis`): `state: "parcial"`, `confidence: null`
 * (nunca un literal a mano — `no-declared-confidence.test.ts`), con la
 * PROMESA de resolver la familia real más tarde. `refresh()` (`crossAnalyze`,
 * grafo real, árbol ya liberado) cumple esa promesa
 * (`resolveDeferredViaGraph`): resuelve el nodo del ancla en el grafo,
 * busca TODAS sus familias reales sin restricción de archivo
 * (`findGraphFamilyCandidates`/`classLikeNodesRelatedTo`, R5 — el reverso de
 * `commonAncestorIds`: no "¿qué extiende/incorpora esta unidad?" sino
 * "¿quién más extiende o incorpora a este mismo ancestro, en cualquier
 * archivo?"), elige el candidato a esqueleto igual que `resolveAstFamily`
 * pero sobre `memberSignatures` del grafo (`resolveGraphFamily`, una por
 * familia candidata), se queda con la de mejor confirmación (R5,
 * `ResolutionTier`), y corre el MISMO `engine.ts#build` que el camino AST ya
 * usa. Sin ninguna familia real ni siquiera vía el grafo (ancestro no
 * resoluble, pocos hermanos, o ningún nombre de método compartido en
 * NINGUNA candidata) ⇒ `refresh()` devuelve `null`: el placeholder queda
 * `parcial`/`confidence: null`, la promesa sigue abierta, nunca se inventa
 * una confirmación.
 *
 * EXCEPCIÓN DECLARADA a `hypotheses/types.ts` ("`refresh` NUNCA debe cambiar
 * `state` ni los checks"): ese contrato existe para no revertir una
 * exclusión que `build()` YA confirmó con el MEJOR contexto que tuvo (árbol
 * vivo) usando un `ctx` DEGRADADO (árbol liberado) — ver `strategy.ts`. Acá
 * es la situación inversa: el placeholder DIFERIDO nunca confirmó nada (no
 * hay exclusión previa que revertir, sólo una promesa declarada), y
 * `resolveDeferredViaGraph` corre con un dato MEJOR (el grafo real, que
 * `build()` nunca tuvo) que el de la construcción original. Alcance
 * ESTRECHO a propósito: sólo se activa cuando `existing.refreshState` trae
 * la marca `{ deferred: true }` — cualquier otro `TemplateMethodProblem`
 * cacheado (familia YA resuelta por AST en `build()`) sigue el camino
 * `refreshDiscriminators` de siempre, sin tocar `state`/`checks`.
 *
 * ─── R5 (esta tarea): LA FAMILIA TAMBIÉN SE ARMA POR MIXIN, NO SÓLO POR
 *      HERENCIA — registro de pendientes, "el mixin existe y nadie lo mira" ──
 *
 * EL DEFECTO MEDIDO: `findAstFamily`/`findGraphFamily` (ambos preexistentes,
 * arriba) construían la familia de un tipo ÚNICAMENTE por `extends`. La
 * arista `mixes-in` (`graph/edges/mixin.ts`, Ruby `include`/`extend`/
 * `prepend` — 78 aristas medidas en el Rails) existía en el grafo y nunca se
 * consultaba: por construcción, en cualquier repo con mixins, todo esqueleto
 * que viviera en una unidad incorporada por esa vía se reportaba `ausente`
 * (o, peor, `parcial` con confianza alta — ver el caso testigo abajo).
 *
 * EL CASO TESTIGO, VERIFICADO A MANO: Template Method sobre
 * `app/models/deal.rb:67` (ancla `large-class`, "Deal" concentra 62 métodos)
 * salía en estado "parcial" con confianza "alta", con la evidencia
 * "'ApplicationRecord' no declara ningún miembro llamado 'init_parser' —
 * subirlo al ancestro común es la mitigación exacta". Factualmente falso: el
 * esqueleto YA existe en `app/models/concerns/proto_module.rb:27` (`init_parser`,
 * declarado vacío, comentario "Must be implemented" — el GANCHO) y `init`,
 * dos líneas abajo, es el método plantilla (llama a `init_parser`, hace lo
 * demás). Las 4 unidades (`Deal`/`Hook`/`Hookable`/`LeadAttribution`)
 * incorporan `ProtoModule` vía `include` — `mixes-in`, no `extends` — y las
 * 4 TAMBIÉN extienden `ApplicationRecord` (la superclase de framework, común
 * a prácticamente cualquier modelo del repo, sin relación real con
 * "init_parser": el único motivo por el que "init_parser" ganaba como
 * candidato entre CIENTOS de hermanos de ApplicationRecord era coincidir en
 * exactamente 4 de ellos, no porque ApplicationRecord lo declarara). El
 * código sólo miraba `ApplicationRecord` (única arista de tipo `extends`) y
 * nunca `ProtoModule` (la arista real, de tipo `mixes-in`).
 *
 * EL ARREGLO: `FAMILY_EDGE_KINDS = {"extends", "mixes-in"}` reemplaza el
 * filtro `edge.kind === "extends"` en las CUATRO funciones que construían
 * "family" a partir del grafo (`commonAncestorIds` — antes `commonAncestorId`,
 * singular — y `classLikeNodesRelatedTo`/`findGraphFamilyCandidates` — antes
 * `classLikeNodesExtending`/`findGraphFamily`). Dos consecuencias, no una:
 *   1. Un tipo casi siempre tiene MÁS DE UN ancestro-como-fuente-de-
 *      comportamiento a la vez (el de `extends` Y uno o más de `mixes-in`) —
 *      `commonAncestorIds` devuelve TODOS (antes devolvía uno, por
 *      desempate alfabético arbitrario) y `pickDeclaringAncestor` elige el
 *      que REALMENTE declara el método consultado — nunca el primero por
 *      default. Del mismo modo, `findGraphFamilyCandidates` devuelve TODAS
 *      las familias viables (antes, `findGraphFamily`, la PRIMERA por orden
 *      arbitrario de arista) y `resolveDeferredViaGraph` las resuelve TODAS,
 *      quedándose con la de mejor `ResolutionTier` — así es como
 *      `ProtoModule` (tier 1: `init` sin redeclarar en absoluto) gana sobre
 *      `ApplicationRecord` (tier 3: candidato por conteo entre cientos de
 *      hermanos sin relación real) sin importar en qué orden aparecieran las
 *      aristas.
 *   2. `implements`/`satisfies` se EVALUARON y se descartaron a propósito
 *      (ver RIESGO A9 arriba): son de interfaz, nunca de implementación —
 *      agregarlas fabricaría el mismo tipo de falso "ya-aplicado" que esta
 *      tarea cierra.
 *
 * BRECHA DECLARADA, NO CERRADA (mixin SAME-FILE): `findAstFamily`
 * (restringida a un solo archivo, para `large-class`/`refused-bequest`/
 * `inheritance-family` cuando la familia SÍ está en este archivo) sigue
 * mirando sólo `extends` — no se le agregó detección de `include`/`extend`/
 * `prepend` por AST. Con la convención de una-clase-por-archivo que Ruby usa
 * en este mismo repo (declarada más arriba, "en Ruby/Java/C#, una clase por
 * archivo: la familia NUNCA está en el mismo archivo"), un módulo mixin y la
 * clase que lo incorpora casi nunca conviven en un solo archivo — el camino
 * DIFERIDO (`deferredStructuralHypothesis` → `resolveDeferredViaGraph`, ya
 * arreglado arriba) es el que de verdad importa para mixins, y ya considera
 * `mixes-in`. Lo que SÍ queda sin cerrar: si `extractSuperclassNameTM` no
 * encuentra ninguna superclase (p.ej. una clase que SÓLO incorpora módulos,
 * sin `extends`), `buildFromStructuralAnchor` devuelve `null` — ni siquiera
 * el placeholder diferido — así que esa clase nunca llega al grafo real.
 * Ningún caso medido de esta tarea cae en este hueco (`deal.rb` sí declara
 * `< ApplicationRecord`), así que queda declarado, no adivinado ni cerrado.
 *
 * ─── ARIDAD COMPATIBLE (esta tarea, registro de pendientes "Template Method
 *      empareja por nombre y no mira la aridad") ──────────────────────────
 *
 * EL DEFECTO MEDIDO, verificado a mano por el integrador anterior sobre
 * `corpus/newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs`:
 * `BsonObject.Add(string name, BsonToken token)` (aridad 2) y
 * `BsonArray.Add(BsonToken token)` (aridad 1) son dos métodos con propósito
 * y cuerpo distintos que sólo coinciden en el NOMBRE — `bestGroup`
 * emparejaba candidatos a "esqueleto" únicamente por
 * `SkeletonEntry.methodName`, sin mirar la firma, así que los trataba como
 * "la misma copia" y recomendaba subir "Add" al ancestro común
 * (`BsonToken`) — una mitigación sin sentido para dos operaciones
 * distintas. Ver el análisis completo, con el argumento de la regla
 * elegida, en el bloque "ARIDAD COMPATIBLE — LA SEÑAL ESTRUCTURAL" más
 * abajo (antes de `bestGroup`).
 *
 * EL ARREGLO, EN UNA LÍNEA: cada `SkeletonEntry` ahora carga un
 * `arityRange: {min, max} | null` (mínimo = parámetros sin valor por
 * defecto, máximo = todos los declarados, `Infinity` con un rest/variádico,
 * `null` sin dato) y `bestGroup` reduce cada bolsa de mismo-nombre al
 * subconjunto cuyos rangos se solapan (`arityCompatibleCluster`) ANTES de
 * contar unidades distintas — `Add(string,BsonToken)` `[2,2]` y
 * `Add(BsonToken)` `[1,1]` no se solapan, así que "Add" deja de tener 2
 * unidades distintas y queda fuera de competencia. La señal es
 * ESTRUCTURAL, no "por lenguaje": no pregunta "¿este lenguaje tiene
 * sobrecarga?" (Java/C# sí, Ruby/Python/JS no) — pregunta, por cada
 * declaración, "¿qué parámetros de ESTA firma son opcionales?" (mismo
 * vocabulario genérico que ya usa `boolean-flag-param.ts`), así que la
 * MISMA regla sostiene a la vez el caso donde la aridad debe ser exacta
 * (Java/C# sin parámetros opcionales, como `Add`) y el caso donde puede
 * variar legítimamente (`process(item)` vs `process(item, ctx = nil)`).
 *
 * DÓNDE VIVE, Y DÓNDE A PROPÓSITO NO: sólo en `bestGroup` — la parte
 * AUSENTE/PARCIAL. Los chequeos de REDECLARACIÓN del excluder
 * (`subtypeRedeclares` en sus tres variantes, el conteo de
 * `resolveAstFamily`/`resolveGraphFamily`) siguen exigiendo `(name, arity)`
 * EXACTA a propósito — responden una pregunta más estrecha ("¿ESTA firma
 * puntual, ya elegida como esqueleto, está redeclarada palabra por
 * palabra?"), no "¿son candidatas plausibles al mismo esqueleto?". Ningún
 * caso medido de esta tarea pide aflojar esos cuatro chequeos — declarado,
 * no cerrado, no adivinado.
 */
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { CONSTRUCTOR_NAMES, type DerivedNodeSets } from "../code-grammar.js";
import type { AstNode, CloneCandidate, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { memberSignatures, returnTypesConflict, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex, type MemberSignature } from "../graph/types.js";
import { build as engineBuild, refreshDiscriminators, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisCheck, PatternHypothesisDraft } from "./types.js";

/** [provisional] mismos tres umbrales que `pattern-behavioral.ts:624-626`
 *  (`TEMPLATE_METHOD_MIN_SEQUENCE_LEN`/`_MIN_SIMILARITY`/`_MIN_DISTINCT_UNITS`),
 *  pendientes de re-derivar contra el corpus externo (K2). */
const MIN_SEQUENCE_LEN = 3;
const MIN_SIMILARITY = 0.4;
const MIN_DISTINCT_UNITS = 2;
/** Mismo umbral (0.6) que la regla vieja usa para su bono de confianza "alta". */
const HIGH_SIMILARITY = 0.6;

/** Llamada genérica `nombre(` — igual espíritu que `collectCallSequence` de
 *  `pattern-behavioral.ts`, pero sobre TEXTO normalizado (`CloneCandidate.
 *  normalized`), no AST: `ctx.file`/`ctx.fileAt` no están vivos en producción
 *  (ver docstring del módulo). Aproximado, declarado: puede confundir una
 *  palabra de control con una llamada si el lenguaje no la lista abajo. Esto
 *  es INDEPENDIENTE del excluder de vocabulario que esta ola retira — sirve
 *  para el lado AUSENTE/PARCIAL (agrupar candidatos por similitud de cuerpo),
 *  no para decidir `ya-aplicado`. */
const CALL_LIKE = /\b([A-Za-z_]\w*)\s*\(/g;
const CONTROL_KEYWORDS = new Set([
  "if", "else", "elsif", "elif", "unless", "while", "until", "for", "foreach",
  "switch", "case", "when", "catch", "rescue", "function", "def", "fn", "func",
  "class", "module", "struct", "interface", "return", "yield", "new", "super",
  "base", "this", "self", "typeof", "instanceof",
]);

/* ════════════════════════════════════════════════════════════════════════
 * OLA U — LAS TRES INTENCIONES QUE ESTE ARCHIVO PASÓ A VERIFICAR
 *
 * Hasta la Ola U este archivo contestaba una pregunta de SÍNTOMA — "¿hay un
 * miembro homónimo en el ancestro?" — y no la de INTENCIÓN que define al
 * patrón. Medido sobre el corpus ANTES de esta ola (7 repos que cubren los 6
 * lenguajes con herencia: guava, newtonsoft-json, sqlalchemy, nest, rubocop,
 * jekyll, eslint): 222 hipótesis, 162 `ya-aplicado` — y de esas 162, **160
 * tenían el check de gancho en `passed: false`**. Es decir: el 70 % de lo que
 * este patrón emitía afirmaba "Template Method ya está aplicado" con la sola
 * evidencia de que la base declara un miembro que nadie sobreescribe. Los
 * nombres de esos "esqueletos", leídos del volcado, lo dicen solos:
 * `__init__`, `__new__`, `__hash__`, `__eq__`, `to_s`, `documentation_url`,
 * `ByteSource`, `HashCode` — constructores, protocolos del runtime y
 * accessors. Ninguno es el esqueleto de un algoritmo.
 *
 * Las tres intenciones, cada una con su chequeo:
 *
 *  1. UN CONSTRUCTOR NO ES UN ESQUELETO (`isConstructorMemberName`). El
 *     esqueleto de Template Method es un algoritmo que los subtipos HEREDAN y
 *     NO redeclaran; un constructor es exactamente lo contrario — cada clase
 *     declara el suyo, por obligación de la gramática, y ninguna lo hereda.
 *     Medido: 30 hipótesis (26 en guava, 4 en newtonsoft-json) tenían como
 *     "esqueleto" un miembro cuyo nombre es el nombre de la propia clase
 *     ancestro — el constructor de Java/C#. Las 4 de newtonsoft-json son el
 *     caso exacto que PLAN-INTENCIONES.md §2 bug 1 documenta.
 *
 *  2. DOS FIRMAS QUE DEVUELVEN TIPOS DISTINTOS NO SON EL MISMO PASO
 *     (`returnTypesConflict`, `graph/types.ts`, hueco de grafo #2 aterrizado
 *     por el frente C2 de esta misma ola). "Subir `m` al ancestro" sólo es
 *     una mitigación si las declaraciones que se unifican pueden ser el mismo
 *     contrato. Caso del plan (§2 bug 2), re-verificado en disco:
 *     `BsonObject.GetEnumerator(): IEnumerator<BsonProperty>` contra
 *     `BsonArray.GetEnumerator(): IEnumerator<BsonToken>`.
 *
 *  3. UN ESQUELETO ORQUESTA PASOS VARIABLES (`completeTemplateCandidate`).
 *     La pregunta estructural del plan, textual: *"¿existe una base `B` con
 *     >= 2 subtipos, un miembro `m` que sólo `B` declara (el esqueleto, nunca
 *     redeclarado) y un miembro `g` que TODOS los subtipos redeclaran (el
 *     gancho), donde `B.m` llama a `B.g`?"*. Las tres condiciones son UNA
 *     sola pregunta: sin gancho invocado no hay plantilla, hay un método
 *     heredado. Desde esta ola, `ya-aplicado`/`aplicado-eludido` exigen la
 *     terna COMPLETA — y la ELECCIÓN del candidato a esqueleto (antes: "el
 *     primer miembro de la base que nadie redeclara", que en cualquier
 *     jerarquía real acierta siempre y por eso producía las 155) pasa a
 *     buscar primero la terna, y sólo si no existe, el PROBLEMA (un
 *     algoritmo duplicado entre hermanos que ningún ancestro posee).
 *
 * Esto REVIERTE, con medición, el "REQUISITO 3" que documentaba más arriba
 * ("cuando `B` ya declara `m` y NINGÚN subtipo lo redeclara, el estado es
 * `ya-aplicado` de todas formas"). Aquella decisión se tomó para no
 * recomendar el patrón sobre algo que ya lo tenía; lo que la medición mostró
 * es que su premisa —"esa evidencia sola ya es suficiente"— es falsa en 155
 * de 162 casos: la evidencia no distingue una plantilla de cualquier método
 * heredado. La salida nueva no es "recomendar igual": cuando no hay ni terna
 * ni algoritmo duplicado, la hipótesis NO SE EMITE (silencio), que es la
 * respuesta honesta a "¿conviene un Template Method acá?" cuando no hay ni
 * plantilla ni oportunidad.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Protocolos NATIVOS de constructor por lenguaje/runtime, además del nombre
 * de la propia clase (Java/C#) — MISMO criterio y MISMO conjunto que
 * `singleton.ts#isConstructorName`/`prototype.ts` ya usan sin objeción. NO es
 * vocabulario de DOMINIO (una convención de proyecto sobre qué método "hace
 * de" algo) sino de GRAMÁTICA/runtime: cómo cada lenguaje soportado nombra su
 * constructor. `__new__` se suma al conjunto de `singleton.ts` porque es el
 * otro constructor de Python y aparece medido como "esqueleto" falso en
 * sqlalchemy.
 */
const CONSTRUCTOR_PROTOCOL_NAMES: ReadonlySet<string> = new Set([...CONSTRUCTOR_NAMES, "new", "New", "__new__"]);

/**
 * QUÉ INTENCIÓN VERIFICA: "¿este miembro puede ser el ESQUELETO de un
 * algoritmo compartido, o es el ritual de construcción propio de cada clase?"
 *
 * El esqueleto de Template Method se define por lo que los subtipos hacen con
 * él: lo HEREDAN sin redeclararlo. Un constructor no admite esa relación en
 * ninguno de los lenguajes con herencia del corpus — cada clase declara el
 * suyo y ninguna lo hereda como paso de un algoritmo. Por eso un constructor
 * nunca es un esqueleto NI un gancho, y tratarlo como tal produce el falso
 * "ya-aplicado" que PLAN-INTENCIONES.md §2 bug 1 documenta y que esta ola
 * midió 30 veces.
 *
 * Dos mecanismos, los mismos dos que ya usan `singleton.ts`/`prototype.ts`:
 * (A) el nombre del miembro es el nombre de su clase dueña (Java/C#), (B) el
 * nombre es uno de los protocolos nativos. Cuando hay árbol vivo hay un
 * tercer mecanismo, más fuerte y por TIPO DE NODO (`sets.constructorNodes`),
 * que `methodsOfClassAst` aplica además de éste.
 *
 * BRECHA DECLARADA (heredada verbatim de `singleton.ts`): un método
 * NO-constructor que se llamara igual que su clase se leería como
 * constructor. No observado en los 9 lenguajes del corpus.
 */
function isConstructorMemberName(name: string, ownerName: string): boolean {
  return name === ownerName || CONSTRUCTOR_PROTOCOL_NAMES.has(name);
}

function textualCallSequence(text: string): string[] {
  const seq: string[] = [];
  CALL_LIKE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL_LIKE.exec(text))) {
    const name = m[1]!;
    if (!CONTROL_KEYWORDS.has(name.toLowerCase())) seq.push(name);
  }
  return seq;
}

/** Jaccard sobre nombres normalizados a minúscula — misma fórmula que
 *  `sequenceSimilarity` de `pattern-behavioral.ts:303`, reescrita acá (no
 *  exportada ahí, sin `primitives.ts` compartido todavía). */
function sequenceSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a.map((n) => n.toLowerCase()));
  const sb = new Set(b.map((n) => n.toLowerCase()));
  const shared = [...sa].filter((n) => sb.has(n)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : shared / union;
}

function findCloneFor(repo: RepoUnit, location: RoleLocation): CloneCandidate | null {
  return repo.clones.find((c) => c.file === location.file && c.startLine === location.startLine && c.endLine === location.endLine) ?? null;
}

/* ════════════════════════════════════════════════════════════════════════
 * OLA AO · FRENTE AO4 — **EL CUERPO DE UN MIEMBRO QUE VIVE EN OTRO ARCHIVO**
 *
 * QUÉ DATO NECESITA ESTE PATRÓN PARA DECIDIR, dicho como una frase sobre el
 * código y no como el nombre del patrón: *"≥2 unidades emparentadas escriben,
 * cada una por su cuenta, la MISMA secuencia de pasos, con algunos pasos
 * distintos"*. Son DOS hechos, no uno: **FAMILIA** (hay un arriba donde el
 * esqueleto podría vivir) y **ESQUELETO COMPARTIDO** (el cuerpo se repite).
 *
 * QUÉ MIDE REALMENTE EL CAMINO DE GRAFO — leído en su propio código, no
 * supuesto: `resolveGraphFamily` construye TODA entrada con
 * `calledNamesSequence: []` LITERAL, en sus dos ramas, porque el grupo se arma
 * con `memberSignatures` = **nombre + aridad y NADA MÁS**. El grafo aporta la
 * FAMILIA; el ESQUELETO **no sale del grafo**. AM1 ya lo había medido por su
 * consecuencia y sin nombrar la causa: `highAverageSimilarity` contesta *"Sin
 * datos de secuencia de llamadas"* en **39 de 39** propuestas de `large-class`,
 * y `bodilessGroupNeedsThreeUnits` existe justamente para tapar ese vacío
 * subiendo el piso de unidades de 2 a 3.
 *
 * EL HECHO QUE LO DECIDE, Y SE VERIFICÓ QUE EXISTE ANTES DE ESCRIBIR ESTO:
 * `RepoUnit.clones` — que YA llega vivo a esta hipótesis (el camino
 * `distributed-duplication` lo usa desde F6) — trae, para TODO el repo y sin
 * importar el archivo, `file`/`startLine`/`endLine`/`className`/`functionName`
 * y **`normalized`**: el cuerpo. Es la única superficie de este analizador que
 * transporta cuerpos ENTRE archivos (`RepoUnit.functions` llega `[]` siempre,
 * y un detector no re-parsea ni re-lee disco).
 *
 * SU LÍMITE, DECLARADO Y NO ESCONDIDO: un `CloneCandidate` sólo existe para
 * subárboles de `>= MIN_CLONE_NODES` (28) nodos y `>= MIN_CLONE_LINES` (6)
 * líneas (`code-analyzer.ts`), así que un miembro corto **no tiene cuerpo
 * recuperable por esta vía**. Eso es un "no sé", no un "no hay cuerpo", y por
 * eso el dato viaja en un campo OPCIONAL y sólo puede hacer PASAR una
 * compuerta, nunca fallarla.
 * ════════════════════════════════════════════════════════════════════════ */

/** El último segmento de un `symbolPath` serializado con puntos, para comparar
 *  contra `CloneCandidate.className`, que la gramática escribe SIN calificar. */
function bareUnitName(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? name : name.slice(i + 1);
}

/**
 * QUÉ INTENCIÓN VERIFICA: *"¿qué llama, en orden, el cuerpo de ESTA
 * declaración?"* — para un miembro cuyo archivo esta pasada NO tiene vivo.
 *
 * Se busca el `CloneCandidate` del MISMO archivo cuyo `functionName` es el del
 * miembro, cuyo `className` es el de la unidad (o `null`: la gramática no
 * siempre lo escribe, y ausente es "no sé", nunca "otra clase"), y cuyo span
 * SOLAPA el del nodo de miembro del grafo. De los que califican se elige el
 * MÁS GRANDE (`nodes`): el subárbol más externo es el cuerpo del método, los
 * más chicos son bloques de adentro.
 *
 * EL SOLAPE, y por qué no la igualdad exacta: `findCloneFor` (arriba) exige
 * `startLine`/`endLine` idénticos porque ahí la `location` VIENE de un clon.
 * Acá la ubicación viene del GRAFO, cuyo span de un miembro es el de la
 * declaración entera (firma incluida) y el del clon es el del subárbol
 * `cloneNodes` — dos lecturas distintas de la misma región. Exigir igualdad
 * sería exigir que dos instrumentos escriban el mismo número.
 */
function bodySequenceFromClones(repo: RepoUnit, unitName: string, methodName: string, memberNode: CodeGraphNode | null): readonly string[] {
  if (!memberNode) return [];
  const bare = bareUnitName(unitName);
  const from = memberNode.startLine ?? null;
  const to = memberNode.endLine ?? from;
  let best: CloneCandidate | null = null;
  for (const c of repo.clones) {
    if (c.file !== memberNode.file) continue;
    if (c.functionName !== methodName) continue;
    if (c.className !== null && c.className !== bare) continue;
    if (from !== null && to !== null && (c.endLine < from || c.startLine > to)) continue;
    if (!best || c.nodes > best.nodes) best = c;
  }
  return best ? textualCallSequence(best.normalized) : [];
}

/** Similitud promedio de los CUERPOS recuperados (`bodySequence`) de un grupo
 *  — `null` cuando menos de dos entradas tienen cuerpo, que es el "no sé" que
 *  `highAverageSimilarity` ya sabe leer. MISMA fórmula (`sequenceSimilarity`)
 *  y MISMO umbral (`HIGH_SIMILARITY`) que el camino de AST: ningún número
 *  nuevo. */
function avgBodySimilarity(group: readonly SkeletonEntry[]): number | null {
  const withBody = group.filter((e) => (e.bodySequence?.length ?? 0) > 0);
  if (withBody.length < 2) return null;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < withBody.length; i++) {
    for (let j = i + 1; j < withBody.length; j++) {
      total += sequenceSimilarity(withBody[i]!.bodySequence!, withBody[j]!.bodySequence!);
      pairs++;
    }
  }
  return pairs > 0 ? total / pairs : null;
}

/* ────────────────────────────────────────────────────────────────────────
 * ARIDAD COMPATIBLE — LA SEÑAL ESTRUCTURAL (esta tarea, registro de
 * pendientes "Template Method empareja por nombre y no mira la aridad").
 *
 * EL DEFECTO MEDIDO: `bestGroup` (más abajo) agrupaba candidatos a
 * "esqueleto" ÚNICAMENTE por `SkeletonEntry.methodName` — sin mirar la
 * firma. Caso testigo, verificado a mano sobre
 * `corpus/newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs`:
 * `BsonObject.Add(string name, BsonToken token)` (aridad 2) y
 * `BsonArray.Add(BsonToken token)` (aridad 1) son DOS métodos con
 * PROPÓSITOS Y CUERPOS distintos que sólo coinciden en el nombre — el
 * emparejamiento los trataba como "la misma copia del mismo esqueleto" y
 * recomendaba subir "Add" a `BsonToken` (el ancestro común), una mitigación
 * que no tiene sentido para dos operaciones distintas.
 *
 * LA REGLA, DECIDIDA CON EL CÓDIGO DELANTE: ni "misma aridad exacta"
 * (rompería la variación legítima por parámetros opcionales — un método
 * `process(item)` y otro `process(item, ctx = nil)` en dos unidades
 * hermanas SON candidatos legítimos a un mismo esqueleto, la segunda
 * declaración simplemente puede invocarse también con 1 argumento) ni
 * "cualquier aridad vale" (es exactamente el bug de BsonToken.cs). La regla
 * que sí sostiene ambos casos a la vez: cada declaración tiene un RANGO de
 * cantidades de argumento con las que puede invocarse —
 * `[mínimo, máximo]` = `[parámetros SIN valor por defecto, TODOS los
 * parámetros declarados]` (`Infinity` de máximo si hay un parámetro
 * rest/variádico) — y dos declaraciones son la MISMA firma candidata si sus
 * rangos se SOLAPAN en al menos un punto. `Add(BsonToken)` es `[1,1]` y
 * `Add(string, BsonToken)` es `[2,2]`: no se solapan, aridad incompatible,
 * nunca la misma firma. `process(item)` es `[1,1]` y
 * `process(item, ctx=nil)` es `[1,2]`: SÍ se solapan en 1, compatibles.
 *
 * POR QUÉ NO ES "por lenguaje": la señal no pregunta "¿este lenguaje tiene
 * sobrecarga de métodos?" (Java/C# sí, Ruby/Python/JS no) — pregunta, POR
 * CADA DECLARACIÓN, "¿qué parámetros de ESTA firma son opcionales?", vía el
 * mismo vocabulario estructural genérico que ya usa
 * `boolean-flag-param.ts#PARAM_VALUE_FIELDS` (`childForFieldName("value"
 * )`/`("right")`) más los nombres de nodo confirmados por sonda directa
 * abajo. Un método Java/C# sin ningún parámetro opcional en ninguna de sus
 * dos declaraciones (el caso real de `Add`) sale con rango `[n,n]` —
 * EXACTO por construcción, sin necesitar saber que "Java tiene sobrecarga"
 * como hecho aparte — y un método Ruby/Python/JS con un parámetro opcional
 * sale con rango ensanchado, también sin necesitar saber "este lenguaje no
 * tiene sobrecarga". La MISMA regla, aplicada a la MISMA forma
 * (`parameters`), da el resultado correcto en los dos grupos porque lee la
 * firma real en vez de nombrar al lenguaje.
 *
 * SIN DATO DE ARIDAD (grafo puro, sin AST vivo — `MemberSignature.arity` es
 * un conteo crudo, sin distinguir parámetros opcionales): el rango cae a
 * `[arity, arity]`, el caso MÁS ESTRICTO — nunca el más permisivo. Es
 * deliberado: sin evidencia estructural de que un parámetro sea opcional,
 * no se asume que lo es (mismo criterio "declarado, no adivinado" que el
 * resto del archivo). Cuando NINGUNA de las dos entradas tiene dato de
 * aridad en absoluto (`arityRange: null` — p.ej. `distributed-duplication`
 * sin grafo en la corrida), no se excluye por falta de evidencia: dos
 * entradas sin dato SIEMPRE se consideran compatibles entre sí, igual que
 * antes de esta tarea (comportamiento observable sin cambios en las
 * poblaciones sin grafo, verificado por los tests existentes que no pasan
 * grafo).
 *
 * ALCANCE DECLARADO: esta señal sólo toca `bestGroup` — la parte AUSENTE/
 * PARCIAL, "¿qué par de declaraciones cuentan como candidatas al mismo
 * esqueleto?". Los cuatro chequeos de REDECLARACIÓN del excluder
 * (`subtypeRedeclares` en sus tres variantes + el conteo de
 * `resolveAstFamily`/`resolveGraphFamily`) siguen exigiendo `(name, arity)`
 * EXACTA a propósito: esos chequeos no preguntan "¿son candidatas
 * plausibles al mismo esqueleto?" sino "¿ESTA firma puntual, ya elegida como
 * el esqueleto, está redeclarada palabra por palabra?" — una pregunta más
 * estrecha que sí debe ser exacta (aflojarla sin un caso medido que lo pida
 * sería agrandar el alcance sin evidencia). Ningún caso de esta tarea cae en
 * ese hueco — declarado, no cerrado.
 */

/** Cantidad máxima de puntos de aridad que un rango vota en
 *  `arityCompatibleCluster` — ningún parámetro rest/variádico real necesita
 *  más que esto para que el punto ganador ya esté decidido; evita iterar
 *  hasta `Infinity` cuando el rango viene de un parámetro rest. */
const MAX_ARITY_SPAN = 32;

/** Nombre de nodo de un parámetro CON valor por defecto — confirmado por
 *  sonda directa (`web-tree-sitter`, los mismos 9 wasm que usa el resto del
 *  analizador): Python (`default_parameter`), Ruby (`optional_parameter`),
 *  JS/JSX (`assignment_pattern`). TypeScript/TSX/Vue y C# NO tienen un tipo
 *  de nodo propio para esto (su parámetro con default sigue llamándose
 *  `required_parameter`/`parameter`, sin distinción de tipo) — se detectan
 *  aparte, por campo (`PARAM_VALUE_FIELDS`, TS) o por hijo posicional
 *  (`DEFAULT_VALUE_CHILD_NAME`, C#), nunca por este vocabulario. */
const DEFAULT_PARAM_NODE_NAME = /^(default_parameter|optional_parameter|assignment_pattern)$/;
/** Nombre de nodo de un parámetro REST/variádico (acepta 0..N argumentos) —
 *  confirmado por sonda directa: Python (`list_splat_pattern`/
 *  `dictionary_splat_pattern`), Ruby (`splat_parameter`/`hash_splat_parameter`),
 *  JS/TS (`rest_pattern`), Java (`spread_parameter`), Go
 *  (`variadic_parameter_declaration`). */
const REST_PARAM_NODE_NAME = /^(list_splat_pattern|dictionary_splat_pattern|splat_parameter|hash_splat_parameter|rest_pattern|spread_parameter|variadic_parameter_declaration)$/;
/** Campos GENÉRICOS donde un valor por defecto puede resolver sin que el
 *  nodo cambie de TIPO — mismo vocabulario que
 *  `boolean-flag-param.ts#PARAM_VALUE_FIELDS`, confirmado de nuevo acá por
 *  sonda directa sobre TypeScript (`required_parameter` con default: campo
 *  `value` SÍ resuelve, aunque el nodo se siga llamando "required"). */
const PARAM_VALUE_FIELDS = ["value", "right"];
/** Nombre de nodo hijo POSICIONAL (sin campo con nombre) que envuelve un
 *  valor por defecto — confirmado por sonda directa sobre C#: su nodo
 *  `parameter` con default (`int b = 1`) no resuelve NINGÚN campo con
 *  nombre para el valor; el `= 1` cuelga como hijo posicional
 *  `equals_value_clause`. Mismo criterio que `HERITAGE_WORD` de
 *  `detect/capabilities.ts`: vocabulario genérico de TIPO de nodo, aplicado
 *  igual a los 9 lenguajes, no un caso especial de "si es C#". */
const DEFAULT_VALUE_CHILD_NAME = /^equals_value_clause$/;

/** `true` si `node` (un hijo directo de una lista de parámetros) declara un
 *  valor por defecto — por tipo de nodo, por campo genérico, o por hijo
 *  posicional (ver las tres constantes de arriba). Tipado con `AstNode`
 *  (`detect/types.js`, ya importado) — misma forma que `ProbeNode`, la
 *  superficie mínima que `code-grammar.ts`/`detect/capabilities.ts` ya usan
 *  para este tipo de chequeo estructural. */
function paramHasDefault(node: AstNode): boolean {
  if (DEFAULT_PARAM_NODE_NAME.test(node.type)) return true;
  if (PARAM_VALUE_FIELDS.some((f) => node.childForFieldName(f) !== null)) return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child?.isNamed && DEFAULT_VALUE_CHILD_NAME.test(child.type)) return true;
  }
  return false;
}

/** `true` si `node` ES (por tipo) o CONTIENE (por campo `pattern`, TS: el
 *  nodo sigue llamándose `required_parameter` pero su campo `pattern`
 *  resuelve a un `rest_pattern`) un parámetro rest/variádico. */
function paramIsRest(node: AstNode): boolean {
  if (REST_PARAM_NODE_NAME.test(node.type)) return true;
  const patternField = node.childForFieldName("pattern") as AstNode | null;
  return patternField !== null && REST_PARAM_NODE_NAME.test(patternField.type);
}

/** Rango `[mínimo, máximo]` de cantidad de argumentos con que `paramList`
 *  puede invocarse — ver "ARIDAD COMPATIBLE" arriba. `min` cuenta los
 *  parámetros SIN default y SIN ser rest; `max` es la cantidad total de
 *  parámetros declarados, o `Infinity` si alguno es rest/variádico. */
function arityRangeFromParamList(paramList: AstNode): { min: number; max: number } {
  let min = 0;
  let max = 0;
  let hasRest = false;
  for (let i = 0; i < paramList.childCount; i++) {
    const child = paramList.child(i) as AstNode | null;
    if (!child?.isNamed) continue;
    max++;
    if (paramIsRest(child)) hasRest = true;
    else if (!paramHasDefault(child)) min++;
  }
  return { min, max: hasRest ? Number.POSITIVE_INFINITY : max };
}

/** `true` si los rangos de aridad de `a` y `b` comparten al menos un punto
 *  — ver "ARIDAD COMPATIBLE" arriba. `null` en cualquiera de los dos (sin
 *  dato) ⇒ compatible por default: sin evidencia de incompatibilidad, no se
 *  excluye. */
function arityRangesCompatible(a: { min: number; max: number } | null, b: { min: number; max: number } | null): boolean {
  if (!a || !b) return true;
  return Math.max(a.min, b.min) <= Math.min(a.max, b.max);
}

/**
 * De un grupo de `SkeletonEntry` que YA comparten `methodName`, el
 * subconjunto cuyos rangos de aridad se solapan en un punto en común — el
 * clúster de firmas compatibles más grande (barrido de intervalos: cada
 * entrada con rango conocido vota cada punto entero que cubre —acotado por
 * `MAX_ARITY_SPAN` para no iterar hasta `Infinity` con un rest— y el punto
 * con más votos gana; empate ⇒ el punto MENOR, determinista). Las entradas
 * SIN dato de aridad se cuentan en CUALQUIER clúster (ver
 * `arityRangesCompatible`). Si NINGUNA entrada trae dato, no hay nada que
 * particionar y se devuelven todas — mismo comportamiento que antes de esta
 * tarea.
 */
function arityCompatibleCluster(entries: readonly SkeletonEntry[]): SkeletonEntry[] {
  const withRange = entries.filter((e): e is SkeletonEntry & { arityRange: { min: number; max: number } } => e.arityRange !== null);
  if (withRange.length === 0) return [...entries];

  const votes = new Map<number, number>();
  for (const e of withRange) {
    const { min, max } = e.arityRange;
    const cappedMax = Math.min(max, min + MAX_ARITY_SPAN);
    for (let n = min; n <= cappedMax; n++) votes.set(n, (votes.get(n) ?? 0) + 1);
  }
  let bestPoint = 0;
  let bestVotes = -1;
  for (const point of [...votes.keys()].sort((x, y) => x - y)) {
    const count = votes.get(point)!;
    if (count > bestVotes) {
      bestVotes = count;
      bestPoint = point;
    }
  }
  const winningPoint = { min: bestPoint, max: bestPoint };
  return entries.filter((e) => arityRangesCompatible(e.arityRange, winningPoint));
}

/* ────────────────────────────────────────────────────────────────────────
 * ÍNDICE MÍNIMO SOBRE EL GRAFO — mismo patrón que `wrapping-chain.ts`
 * (Ola 10, no exportado ahí, así que se repite acá: cada hipótesis es
 * autocontenida). `nodeById`/`edgesFrom` sobre `confidentEdges(graph)` —
 * las aristas `ambiguous` quedan fuera por defecto (CONTRATO-F9.md §4.5).
 * ──────────────────────────────────────────────────────────────────────── */
interface Index {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

/**
 * Memoizado por identidad del `CodeGraph` (Ola Y, Y5 — costo), misma disciplina
 * que `confident-edges.ts#CACHE` (Ola V), `command.ts#indexCache` y
 * `chain-of-responsibility.ts#GINDEX_CACHE`: `build()` llama a `buildIndex`
 * UNA vez por hallazgo ancla —y `run.ts` corre `build()` DOS veces por hallazgo
 * (`attachHypotheses` + `rebuildHypothesesWithGraph`)—, así que el índice de
 * repo entero se reconstruía ~430 veces por corrida sobre las 192 anclas de
 * `inheritance-family` + `parallel-hierarchies` + `distributed-duplication`.
 * El índice es una función pura del grafo y nadie lo muta (los dos mapas viajan
 * como `ReadonlyMap`), así que compartirlo entre hallazgos no puede mover un
 * resultado. `WeakMap` ⇒ la entrada muere con el grafo.
 */
const INDEX_CACHE = new WeakMap<CodeGraph, Index>();

function buildIndex(graph: CodeGraph): Index {
  const hit = INDEX_CACHE.get(graph);
  if (hit) return hit;

  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
  }
  const index: Index = { nodeById, edgesFrom };
  INDEX_CACHE.set(graph, index);
  return index;
}

function asGraphIndex(index: Index): GraphIndex {
  return {
    nodeById: (id) => index.nodeById.get(id) ?? null,
    edgesFrom: (id) => index.edgesFrom.get(id) ?? [],
  };
}

/** Id de nodo del miembro `name` de `ownerId`, leído de la MISMA arista
 *  `contains` que `memberSignatures` ya recorrió — nunca reconstruido a mano
 *  (mismo criterio que `wrapping-chain.ts#memberNodeId`). */
function memberNodeId(index: Index, ownerId: string, name: string): string | null {
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) {
      return target.id;
    }
  }
  return null;
}

/** El nodo `class-like` cuyo `file`+`symbolPath` último segmento coincide con `className`. */
function classNodeByName(graph: CodeGraph, file: string, className: string): CodeGraphNode | null {
  return graph.nodes.find((n) => n.kind === "symbol" && n.family === "class-like" && n.file === file && n.symbolPath[n.symbolPath.length - 1] === className) ?? null;
}

/** El nodo `class-like` cuyo `file`+`startLine` (y, si viene, el
 *  `RoleLocation.symbol`) coincide con esta ubicación — para el ancla
 *  `parallel-hierarchies`, cuya `location` es la raíz de la familia. */
function classNodeAt(graph: CodeGraph, location: RoleLocation): CodeGraphNode | null {
  return (
    graph.nodes.find(
      (n) =>
        n.kind === "symbol" &&
        n.family === "class-like" &&
        n.file === location.file &&
        n.startLine === location.startLine &&
        (location.symbol === undefined || n.symbolPath[n.symbolPath.length - 1] === location.symbol),
    ) ?? null
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * ANCLAS ESTRUCTURALES (large-class/refused-bequest/inheritance-family) —
 * ver el docstring del módulo. Familia de subtipos derivada de AST,
 * restringida al MISMO ARCHIVO (ctx.file vivo, sin grafo — ver la nota de
 * arquitectura de arriba).
 *
 * `inheritance-family` — Ola 11a (P2, registro de pendientes "Problema 2",
 * los 6 rojos de Template Method en `hypothesis-state-gate.test.ts`):
 * `large-class`/`refused-bequest` no disparan sobre una jerarquía LIMPIA
 * (`DataMiner`/`CsvDataMiner`/`LogDataMiner`, la fixture canónica —
 * verificado corriendo `analyzeRepo` real, `scripts/measure-p2-wrapping-
 * diagnosis.mts`: 0 `Finding` en las 6 variantes de lenguaje). El detector
 * nuevo (`detect/intra-file/inheritance-family.ts`) confirma exactamente la
 * MISMA forma que `findAstFamily` (abajo) ya busca — base + >= 2 subclases
 * resolubles en este archivo — así que se procesa por la MISMA vía
 * (`buildFromStructuralAnchor`), sin necesitar un camino de entrada nuevo:
 * el ancla en la base (`locations[0].symbol`) es exactamente el
 * `anchorSymbol` que `findAstFamily` ya sabe leer.
 */
const STRUCTURAL_ANCHOR_KINDS: ReadonlySet<string> = new Set(["large-class", "refused-bequest", "inheritance-family"]);
/** Ola AK (AK6) — la única de las tres anclas estructurales cuyo hecho de
 *  entrada (*"la clase tiene muchos miembros"*) no dice nada sobre familias ni
 *  sobre secuencias repetidas. Ver la rama de "una promesa no es una
 *  propuesta" en `buildFromStructuralAnchor`. */
const LARGE_CLASS_ANCHOR_KIND = "large-class";

function namedChildrenTM(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/**
 * Nombre de la clase base que `classNode` declara heredar — MISMA técnica
 * que `refused-bequest.ts#extractSuperclassName`, duplicada acá a propósito
 * (mismo criterio que ya documentan `capabilities.ts`/`decorator.ts`: evitar
 * una dependencia de esta hipótesis hacia el interior no-exportado de otro
 * detector por un detalle que sólo a los dos les importa).
 */
function extractSuperclassNameTM(classNode: AstNode): string | null {
  const direct = (classNode.childForFieldName("superclass") as AstNode | null)?.text;
  if (direct) {
    const cleaned = direct
      .replace(/^[<:]\s*/, "")
      .replace(/^extends\s+/, "")
      .trim();
    return cleaned || null;
  }

  const plural = (classNode.childForFieldName("superclasses") as AstNode | null)?.text;
  if (plural) {
    const inner = /\(([^)]+)\)/.exec(plural)?.[1] ?? plural;
    const first = inner.split(",")[0]?.trim();
    return first || null;
  }

  const bases = (classNode.childForFieldName("bases") as AstNode | null)?.text;
  if (bases) {
    const first = bases
      .replace(/^:\s*/, "")
      .split(",")[0]
      ?.trim();
    return first || null;
  }

  for (let i = 0; i < classNode.childCount; i++) {
    const child = classNode.child(i) as AstNode | null;
    if (child && /heritage/i.test(child.type)) {
      const m = /extends\s+([A-Za-z_$][\w$.]*)/.exec(child.text);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA U — EL TIPO DE RETORNO Y LAS LLAMADAS, LEÍDOS DEL ÁRBOL
 *
 * El camino de GRAFO ya tiene las dos cosas desde esta ola: `MemberSignature.
 * returnType` (hueco #2, frente C2) y las aristas `calls`. El camino de AST
 * same-file (`large-class`/`refused-bequest`/`inheritance-family`, que es por
 * donde entra el 96 % del volumen medido de este patrón) no tenía ninguna de
 * las dos — y por eso `astStructuralAncestorFacts` devolvía `hooks: []` /
 * `skeletonCallsHook: false` SIEMPRE, o sea que por AST la terna del patrón
 * era inconfirmable por construcción. Las dos salen del MISMO árbol que la
 * hipótesis ya recorre, con vocabulario de GRAMÁTICA (nombres de campo y de
 * tipo de nodo), no de dominio, confirmado por sonda directa sobre los 6
 * lenguajes con herencia del corpus.
 * ──────────────────────────────────────────────────────────────────────── */

/** Campos donde una gramática escribe el TIPO DE RETORNO de una declaración —
 *  confirmado por sonda directa (`web-tree-sitter`, los mismos wasm del
 *  analizador): C# y Java lo cuelgan del campo `type`
 *  (`method_declaration`), TypeScript/TSX/Vue y Python del campo
 *  `return_type`. Ruby y JavaScript NO tienen dónde escribirlo — ahí el dato
 *  queda AUSENTE, que es un "no sé" y nunca un "no devuelve nada" (misma
 *  regla de lectura que `graph/types.ts#returnTypesConflict` documenta). */
const RETURN_TYPE_FIELDS = ["type", "return_type"];

/** Tipo de retorno ESCRITO de una declaración, o `undefined` si esta gramática
 *  no lo expone o el autor no lo escribió. Se normaliza el `: ` inicial que
 *  TypeScript incluye en el texto del campo, para que `IEnumerator<X>` y
 *  `: IEnumerator<X>` no se lean como dos tipos distintos. Igualdad TEXTUAL,
 *  igual que `returnTypesConflict` (ver su docstring para el trueque). */
function astReturnType(member: AstNode): string | undefined {
  for (const field of RETURN_TYPE_FIELDS) {
    const node = member.childForFieldName(field) as AstNode | null;
    if (!node) continue;
    const text = node.text.replace(/^:\s*/, "").trim();
    if (text) return text;
  }
  return undefined;
}

/** Tipo de nodo de una INVOCACIÓN — confirmado por sonda directa:
 *  `invocation_expression` (C#), `method_invocation` (Java), `call_expression`
 *  (TS/TSX/Vue/JS), `call` (Python/Ruby). Vocabulario de gramática, aplicado
 *  igual a los 9 lenguajes — mismo criterio que `HERITAGE_WORD` de
 *  `detect/capabilities.ts`. */
const CALL_NODE_WORD = /(^|_)(call|invocation)(_|$)/;
/** Campos donde una gramática cuelga el CALLEE de una invocación —
 *  confirmado por sonda: `function` (C#/TS/JS/Python), `name` (Java),
 *  `method` (Ruby). */
const CALLEE_FIELDS = ["function", "name", "method"];

/** El nombre INVOCADO por un nodo de llamada — el último segmento del callee
 *  (`this.step()`/`self.step()`/`base.step()` ⇒ `step`), sin resolver a qué
 *  declaración apunta: acá sólo hace falta el NOMBRE, porque quien pregunta
 *  ya sabe qué nombres son ganchos candidatos del mismo ancestro. */
function astCalleeName(callNode: AstNode): string | null {
  for (const field of CALLEE_FIELDS) {
    const callee = callNode.childForFieldName(field) as AstNode | null;
    if (!callee) continue;
    const segments = callee.text.split(/[.:>-]+/);
    const last = segments[segments.length - 1]?.trim();
    const cleaned = last ? /[A-Za-z_$][\w$]*/.exec(last)?.[0] : null;
    if (cleaned) return cleaned;
  }
  return null;
}

/** Todos los nombres invocados desde el cuerpo de `member`, en orden de
 *  aparición y sin deduplicar (es una SECUENCIA — `sequenceSimilarity` la
 *  consume igual que la del texto del clon).
 *
 *  ESTRICTO a propósito: sólo nodos de LLAMADA. Es lo que alimenta la
 *  similitud de secuencia (`bestGroup`), donde meter identificadores sueltos
 *  confundiría una lectura de variable con una invocación e inflaría el
 *  Jaccard. Para la pregunta MÁS ESTRECHA "¿el esqueleto menciona a ESTE
 *  gancho, que ya sabemos que es un miembro del ancestro?" hay un segundo
 *  mecanismo, más permisivo y acotado: `astReferencedNames`. */
function astCallNames(member: AstNode): string[] {
  const body = (member.childForFieldName("body") as AstNode | null) ?? member;
  const out: string[] = [];
  const visit = (node: AstNode): void => {
    if (CALL_NODE_WORD.test(node.type)) {
      const name = astCalleeName(node);
      if (name) out.push(name);
    }
    for (const child of namedChildrenTM(node)) visit(child);
  };
  visit(body);
  return out;
}

/** Tipo de nodo de un IDENTIFICADOR desnudo — vocabulario de gramática,
 *  común a los 9 lenguajes (`identifier`, `property_identifier`,
 *  `type_identifier`, `constant`…). */
const IDENTIFIER_NODE_WORD = /(^|_)identifier$/;

/**
 * Los nombres que el cuerpo de `member` MENCIONA: los invocados
 * (`astCallNames`) MÁS los identificadores desnudos.
 *
 * POR QUÉ EXISTE EL SEGUNDO MECANISMO, y por qué es seguro acá: en Ruby una
 * invocación sin paréntesis NI receptor (`extract_data`, `init_parser`)
 * parsea como `identifier` suelto y NO como nodo de llamada — es la forma
 * idiomática del gancho en ese lenguaje, y la fixture canónica del patrón
 * (`tests/fixtures/patterns/template_method/ruby.rb`) la usa. Leer un
 * identificador desnudo como "posible invocación" sería demasiado permisivo
 * en general, pero acá la pregunta ya está acotada por los dos lados: quien
 * consulta (`FamilyShape.ancestorCalls`) sólo pregunta por nombres que YA se
 * confirmaron como miembros declarados del ancestro Y redeclarados por TODOS
 * los subtipos. Un identificador que cumple las dos cosas y aparece en el
 * cuerpo del esqueleto no es una variable local que casualmente se llama
 * igual: es el gancho.
 *
 * BRECHA DECLARADA: si un parámetro o variable local se llamara igual que un
 * gancho candidato, se leería como invocación. No observado en las fixturas
 * canónicas ni en los casos medidos del corpus.
 */
function astReferencedNames(member: AstNode): Set<string> {
  const body = (member.childForFieldName("body") as AstNode | null) ?? member;
  const out = new Set<string>(astCallNames(member));
  const visit = (node: AstNode): void => {
    if (IDENTIFIER_NODE_WORD.test(node.type)) out.add(node.text);
    for (const child of namedChildrenTM(node)) visit(child);
  };
  visit(body);
  return out;
}

interface AstMethod {
  name: string;
  arity: number;
  /** NUEVO (frente aridad) — rango `[mínimo, máximo]` de aridad con que esta
   *  declaración puede invocarse, ver "ARIDAD COMPATIBLE" arriba. Nunca
   *  `null` acá: viene de AST vivo, siempre hay lista de parámetros que
   *  recorrer (o ninguna, `arity: 0`, rango `[0,0]`). */
  arityRange: { min: number; max: number };
  /** NUEVO (Ola U, INTENCIÓN 2) — tipo de retorno ESCRITO, `undefined` = "no
   *  sé" (la gramática no lo expone, o el autor no lo escribió). */
  returnType?: string;
  /** NUEVO (Ola U, INTENCIÓN 3) — nombres invocados desde el cuerpo (nodos de
   *  llamada, estricto: es lo que alimenta la similitud de secuencia). */
  calls: readonly string[];
  /** NUEVO (Ola U, INTENCIÓN 3) — nombres MENCIONADOS por el cuerpo
   *  (invocaciones + identificadores desnudos); ver `astReferencedNames` para
   *  por qué el mecanismo permisivo es seguro en la pregunta acotada del
   *  gancho, y sólo ahí. */
  referenced: ReadonlySet<string>;
  node: AstNode;
}

/** Campos de lista de parámetros — mismo par que `code-grammar.ts#isFunctionLike`
 *  usa para decidir "esto es una función". */
const PARAM_LIST_FIELDS = ["parameters", "parameter_list"];

/**
 * Miembros de una clase que declaran una FIRMA, por AST.
 *
 * DOS CAMBIOS DE LA OLA U, los dos medidos contra una fixture canónica:
 *
 * (a) EXCLUYE CONSTRUCTORES por los tres mecanismos disponibles con árbol
 *     vivo: por TIPO DE NODO (`sets.constructorNodes` — la ranura propia que
 *     C#/Java le dan al constructor, `constructor_declaration`), por nombre
 *     igual al de la clase dueña (Java/C# de nuevo, cuando el nodo no está
 *     tipado como tal) y por protocolo nativo (`isConstructorMemberName`).
 *     Ver INTENCIÓN 1. Antes sólo se aplicaba el tercero, así que los
 *     constructores de C#/Java entraban enteros — 30 falsos medidos.
 *
 * (b) INCLUYE LAS DECLARACIONES SIN CUERPO (un método `abstract`, la firma de
 *     una interfaz). `sets.functionNodes` sólo contiene tipos de nodo que la
 *     sonda vio CON cuerpo (`code-grammar.ts#isFunctionLike` exige el campo
 *     `body`), y TypeScript le da a un método abstracto un tipo de nodo
 *     propio (`abstract_method_signature`) que por eso queda afuera. En un
 *     Template Method DE MANUAL el gancho es justamente eso: un método
 *     abstracto, declarado y sin cuerpo, que los subtipos implementan —
 *     `tests/fixtures/patterns/template_method/typescript.ts` es exactamente
 *     esa forma (`abstract extractData(): void;`), y sin este ensanche el
 *     gancho de la fixture canónica del patrón era INVISIBLE. Se acepta
 *     cualquier hijo del cuerpo de la clase con campo `name` Y campo de lista
 *     de parámetros: la MISMA forma que `isFunctionLike` pide, menos el
 *     cuerpo. Sin cuerpo, `calls`/`referenced` quedan vacíos — un miembro sin
 *     cuerpo no invoca nada, que es un hecho, no una ausencia de dato.
 */
function methodsOfClassAst(classNode: AstNode, sets: DerivedNodeSets): AstMethod[] {
  const body = classNode.childForFieldName("body") as AstNode | null;
  if (!body) return [];
  const className = (classNode.childForFieldName("name") as AstNode | null)?.text ?? "";
  const out: AstMethod[] = [];
  for (const member of namedChildrenTM(body)) {
    const paramList = (PARAM_LIST_FIELDS.map((f) => member.childForFieldName(f) as AstNode | null).find((n) => n !== null) ?? null) as AstNode | null;
    const declaresSignature = sets.functionNodes.has(member.type) || (paramList !== null && member.childForFieldName("name") !== null);
    if (!declaresSignature) continue;
    if (sets.constructorNodes.has(member.type)) continue;
    const name = (member.childForFieldName("name") as AstNode | null)?.text;
    if (!name || isConstructorMemberName(name, className)) continue;
    const arity = paramList ? namedChildrenTM(paramList).length : 0;
    const arityRange = paramList ? arityRangeFromParamList(paramList) : { min: 0, max: 0 };
    const returnType = astReturnType(member);
    const hasBody = member.childForFieldName("body") !== null;
    out.push({
      name,
      arity,
      arityRange,
      ...(returnType !== undefined ? { returnType } : {}),
      calls: hasBody ? astCallNames(member) : [],
      referenced: hasBody ? astReferencedNames(member) : new Set<string>(),
      node: member,
    });
  }
  return out;
}

/** Clases del archivo, por nombre — un solo recorrido. */
function classNodesByNameTM(root: AstNode, sets: DerivedNodeSets): Map<string, AstNode> {
  const out = new Map<string, AstNode>();
  const visit = (node: AstNode): void => {
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text;
      if (name) out.set(name, node);
    }
    for (const c of namedChildrenTM(node)) visit(c);
  };
  visit(root);
  return out;
}

interface AstFamily {
  readonly baseName: string;
  readonly baseNode: AstNode;
  /** Nombre de subclase -> su nodo. */
  readonly subclasses: ReadonlyMap<string, AstNode>;
}

/**
 * La familia (base + >= `MIN_DISTINCT_UNITS` subtipos) del MISMO ARCHIVO que
 * contiene `anchorSymbol` — ya sea como base o como uno de los subtipos.
 * `null` si no hay ninguna familia de al menos `MIN_DISTINCT_UNITS` hermanos
 * con una base RESOLUBLE EN ESTE ARCHIVO (misma limitación cross-file
 * declarada en `refused-bequest.ts`: si la base vive en otro archivo, esta
 * vía —sin grafo— no tiene forma de confirmarlo).
 */
function findAstFamily(root: AstNode, sets: DerivedNodeSets, anchorSymbol: string | undefined): AstFamily | null {
  if (!anchorSymbol) return null;
  const byName = classNodesByNameTM(root, sets);
  const groups = new Map<string, Map<string, AstNode>>();
  for (const [name, node] of byName) {
    const superclassName = extractSuperclassNameTM(node);
    if (!superclassName || !byName.has(superclassName) || superclassName === name) continue;
    const group = groups.get(superclassName) ?? new Map<string, AstNode>();
    group.set(name, node);
    groups.set(superclassName, group);
  }

  for (const [baseName, subclasses] of groups) {
    if (subclasses.size < MIN_DISTINCT_UNITS) continue;
    if (baseName === anchorSymbol || subclasses.has(anchorSymbol)) {
      return { baseName, baseNode: byName.get(baseName)!, subclasses };
    }
  }
  return null;
}

/**
 * Candidatos al lado PARCIAL por el camino AST: los métodos de los HERMANOS,
 * ya sin constructores (`methodsOfClassAst`) y sin los que el ancestro ya
 * declara (`ownedByAncestor`) — sobre esos últimos la mitigación de este
 * patrón ("subir el esqueleto al ancestro común") no existe, porque ya está
 * ahí.
 *
 * OLA U: `calledNamesSequence` deja de ser `[]`. Antes, este camino no traía
 * los nombres invocados, así que el gate de similitud de `bestGroup`
 * (`avgSimilarity >= MIN_SIMILARITY`) quedaba apagado por acá detrás de un
 * cero encubierto: dos métodos homónimos con algoritmos COMPLETAMENTE
 * distintos agrupaban igual. Ahora la secuencia real viaja y el gate mide.
 *
 * NO SE FILTRA por "cuántos pasos invoca" — se probó y se retiró en la misma
 * tarea: en Ruby una llamada sin paréntesis parsea como identificador suelto
 * (ver `astReferencedNames`), así que un umbral de llamadas apagaba el patrón
 * entero en ese lenguaje, empezando por su propia fixture canónica. Declarado,
 * no adivinado: la selección de candidatos ya la hacen la terna del patrón
 * (`completeTemplateCandidate`), `ownedByAncestor` y el gate de similitud.
 */
function entriesFromAstFamily(family: AstFamily, sets: DerivedNodeSets, file: string, ownedByAncestor: ReadonlySet<string>): SkeletonEntry[] {
  const out: SkeletonEntry[] = [];
  for (const [unitName, node] of family.subclasses) {
    for (const m of methodsOfClassAst(node, sets)) {
      if (ownedByAncestor.has(m.name)) continue;
      out.push({
        location: {
          file,
          startLine: m.node.startPosition.row + 1,
          endLine: m.node.endPosition.row + 1,
          symbol: m.name,
          role: "método candidato (ancla estructural: large-class/refused-bequest)",
        },
        unitName,
        methodName: m.name,
        calledNamesSequence: m.calls,
        clone: null,
        unitSymbolId: null,
        arityRange: m.arityRange,
        ...(m.returnType !== undefined ? { returnType: m.returnType } : {}),
      });
    }
  }
  return out;
}

/**
 * Los hechos del camino AST same-file, en la forma que
 * `completeTemplateCandidate` consume. Ola U: las dos piezas que faltaban —
 * los ganchos (miembros del ancestro que TODOS los hermanos redeclaran) y la
 * invocación del gancho desde el esqueleto — salen del MISMO árbol
 * (`astCallNames`), así que este camino ya puede confirmar o refutar la terna
 * del patrón en vez de declararla inconfirmable por construcción.
 */
function astFamilyShape(family: AstFamily, sets: DerivedNodeSets): FamilyShape {
  const ancestorMembers = methodsOfClassAst(family.baseNode, sets);
  const siblingMembers = [...family.subclasses.values()].map((node) => methodsOfClassAst(node, sets));
  // `referenced` (no `calls`): ver `astReferencedNames` — la pregunta acá ya
  // está acotada a nombres confirmados como miembros del ancestro redeclarados
  // por TODOS los subtipos, y el gancho idiomático de Ruby se invoca sin
  // paréntesis.
  const referencedByMember = new Map(ancestorMembers.map((m) => [m.name, m.referenced] as const));
  return {
    ancestorMembers,
    siblingCount: siblingMembers.length,
    redeclaringCount: (sig) => siblingMembers.filter((members) => signatureRedeclares(members, sig)).length,
    ancestorCalls: (skeletonName, hookName) => referencedByMember.get(skeletonName)?.has(hookName) ?? false,
  };
}

/**
 * Ver "LAS TRES FORMAS" / "ANCLAS ESTRUCTURALES NUEVAS" en el docstring del
 * módulo — misma decisión que `structuralAncestorFacts` (basada en grafo),
 * derivada acá de AST dentro del MISMO ARCHIVO.
 *
 * OLA U: `hooks`/`skeletonCallsHook` YA NO son `[]`/`false` fijos. La nota
 * vieja ("sin `calls`, no hay cómo confirmar el gancho por AST sin arriesgar
 * vocabulario") daba por perdido un dato que el árbol SÍ tiene: los nombres
 * invocados desde el cuerpo del esqueleto salen de los nodos de llamada de la
 * propia gramática (`astCallNames`, vocabulario de gramática, no de dominio).
 * Sin esto, este camino —por donde entra el 96 % del volumen medido del
 * patrón— no podía confirmar NI refutar la terna, y `stateFromFacts` no tenía
 * más remedio que declarar `ya-aplicado` con media evidencia.
 */
function astStructuralAncestorFacts(family: AstFamily, sets: DerivedNodeSets, methodName: string): StructuralAncestorFacts {
  const shape = astFamilyShape(family, sets);
  const skeletonSig = shape.ancestorMembers.find((m) => m.name === methodName) ?? null;
  const skeletonDeclaredInAncestor = skeletonSig !== null;

  let anySubtypeRedeclaresSkeleton = false;
  const hooks: { name: string; arity: number | null }[] = [];
  let skeletonCallsHook = false;
  let skeletonCalledByAncestorMembers: readonly string[] = [];
  // OLA AF (AF5) — ver `StructuralAncestorFacts.ancestorHostsTemplate`.
  let ancestorHostsTemplate = false;
  if (skeletonSig) {
    anySubtypeRedeclaresSkeleton = shape.redeclaringCount(skeletonSig) > 0;
    for (const cand of shape.ancestorMembers) {
      if (cand.name === methodName) continue;
      if (shape.redeclaringCount(cand) === shape.siblingCount) hooks.push({ name: cand.name, arity: cand.arity });
    }
    skeletonCallsHook = hooks.some((h) => shape.ancestorCalls(methodName, h.name));
    skeletonCalledByAncestorMembers = ancestorMembersCallingSkeleton(shape, methodName);
  } else {
    ancestorHostsTemplate = ancestorHostsTemplateFor(shape, methodName);
  }

  return {
    ancestorId: family.baseName,
    ancestorName: family.baseName,
    skeletonName: methodName,
    skeletonDeclaredInAncestor,
    skeletonArity: skeletonSig?.arity ?? null,
    anySubtypeRedeclaresSkeleton,
    hooks,
    skeletonCallsHook,
    skeletonCalledByAncestorMembers,
    // Camino AST same-file: la única relación que `findAstFamily` reconoce es
    // `extends` (superclase por texto, `extractSuperclassNameTM`) — sin
    // alcance a `mixes-in` en este archivo (ver "BRECHA DECLARADA — MIXIN
    // SAME-FILE" en el docstring del módulo). Siempre `["extends"]`.
    ancestorRelation: ["extends"],
    ancestorDeclaredMemberCount: shape.ancestorMembers.length,
    ancestorHostsTemplate,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * LA PREGUNTA DEL PATRÓN, UNA SOLA VEZ PARA LOS DOS CAMINOS (Ola U,
 * INTENCIÓN 3). El camino AST same-file y el camino de grafo leen hechos
 * distintos (árbol vs. `memberSignatures`+`calls`) pero contestan la MISMA
 * pregunta, así que la pregunta se escribe UNA vez y cada camino sólo
 * provee los hechos. Antes de esta ola cada uno tenía su propia escalera de
 * prioridades copiada, y las dos elegían al candidato por "el primer miembro
 * de la base que nadie redeclara" — un criterio que acierta en CUALQUIER
 * jerarquía real (siempre hay algún método no sobreescrito) y por eso
 * clasificaba como `ya-aplicado` a 160 de 162 familias medidas sin que
 * ninguna tuviera una plantilla.
 * ──────────────────────────────────────────────────────────────────────── */

/** La firma de un miembro, en la forma mínima que la pregunta necesita —
 *  compatible con `MemberSignature` (grafo) y con `AstMethod` (árbol). */
interface CandidateSignature {
  readonly name: string;
  readonly arity: number | null;
  readonly returnType?: string;
}

/** Los hechos que un camino (AST o grafo) tiene que poder contestar para que
 *  la pregunta del patrón se pueda evaluar sobre su familia. */
interface FamilyShape {
  /** Miembros del ancestro, YA sin constructores (ver INTENCIÓN 1). */
  readonly ancestorMembers: readonly CandidateSignature[];
  readonly siblingCount: number;
  /** Cuántos hermanos redeclaran ESTA firma — misma `(name, arity)` y sin
   *  desacuerdo escrito de tipo de retorno (un retorno distinto no es un
   *  override: es otra declaración que casualmente comparte el nombre). */
  redeclaringCount(sig: CandidateSignature): number;
  /** ¿El miembro `skeletonName` del ancestro INVOCA a `hookName` del mismo
   *  ancestro? (`calls` en el grafo; nombres invocados desde el cuerpo en el
   *  árbol). */
  ancestorCalls(skeletonName: string, hookName: string): boolean;
}

interface CompleteTemplate {
  readonly skeleton: CandidateSignature;
  /** Los ganchos CONFIRMADOS: redeclarados por TODOS los hermanos e invocados desde el esqueleto. */
  readonly hooks: readonly CandidateSignature[];
  /** Al menos un hermano redeclara el esqueleto — la plantilla existe, pero se la saltean. */
  readonly leaked: boolean;
}

/**
 * QUÉ INTENCIÓN VERIFICA (Ola U, INTENCIÓN 3): "¿esta familia YA tiene fijado
 * el ESQUELETO de un algoritmo en la base, con los pasos variables delegados
 * a los subtipos?" — la pregunta estructural de PLAN-INTENCIONES.md §2,
 * textual: *una base `B`, un miembro `m` que sólo `B` declara (el esqueleto,
 * nunca redeclarado) y un miembro `g` que TODOS los subtipos redeclaran (el
 * gancho), donde `B.m` llama a `B.g`*.
 *
 * Las tres condiciones son UNA sola pregunta y no se pueden puntuar por
 * separado: un miembro heredado sin ningún paso variable NO es una plantilla
 * (es reuso por herencia, que es otra cosa), y un miembro redeclarado por
 * todos los subtipos no es un esqueleto sino, justamente, un gancho. Por eso
 * acá el esqueleto se busca EMPAREJADO con su gancho, no primero uno y
 * después el otro.
 *
 * Devuelve `null` cuando ninguna terna existe — y ese `null` NO es "no se
 * pudo confirmar": es "esta familia no tiene una plantilla", que es una
 * respuesta, y la que manda a quien llama a buscar el PROBLEMA (un algoritmo
 * duplicado entre hermanos que ningún ancestro posee) en vez de declarar
 * `ya-aplicado`.
 *
 * Prioridad: una terna SIN fuga (nadie redeclara el esqueleto) gana sobre una
 * CON fuga — la evidencia más fuerte primero, mismo criterio que ya usaba la
 * escalera vieja.
 */
function completeTemplateCandidate(shape: FamilyShape): CompleteTemplate | null {
  if (shape.siblingCount < MIN_DISTINCT_UNITS) return null;
  let leakedCandidate: CompleteTemplate | null = null;

  for (const skeleton of shape.ancestorMembers) {
    const redeclaringSkeleton = shape.redeclaringCount(skeleton);
    // Un miembro que TODOS redeclaran es un gancho, nunca el esqueleto: el
    // esqueleto es lo que NO varía.
    if (redeclaringSkeleton >= shape.siblingCount) continue;

    const hooks = shape.ancestorMembers.filter(
      (hook) => hook.name !== skeleton.name && shape.redeclaringCount(hook) === shape.siblingCount && shape.ancestorCalls(skeleton.name, hook.name),
    );
    if (hooks.length === 0) continue;

    const candidate: CompleteTemplate = { skeleton, hooks, leaked: redeclaringSkeleton > 0 };
    if (!candidate.leaked) return candidate;
    leakedCandidate ??= candidate;
  }
  return leakedCandidate;
}

/** `redeclaringCount` compartido: misma `(name, arity)` EXACTA y sin
 *  desacuerdo escrito de tipo de retorno. La aridad se exige exacta a
 *  propósito (mismo criterio declarado en "ALCANCE DECLARADO" de ARIDAD
 *  COMPATIBLE: acá la pregunta es "¿ESTA firma puntual está redeclarada?",
 *  no "¿son candidatas plausibles al mismo esqueleto?"); el tipo de retorno
 *  se suma esta ola porque un retorno escrito distinto significa que NO es un
 *  override — es otra declaración homónima. */
function signatureRedeclares(declared: readonly CandidateSignature[], sig: CandidateSignature): boolean {
  return declared.some((d) => d.name === sig.name && d.arity === sig.arity && !returnTypesConflict(d as MemberSignature, sig as MemberSignature));
}

/**
 * OLA AD (AD2) — LA PREGUNTA INVERSA DE `completeTemplateCandidate`, escrita
 * UNA sola vez para los dos caminos (AST same-file y grafo), por la misma
 * razón por la que la pregunta directa se escribe una vez: los dos leen
 * hechos distintos y contestan lo mismo.
 *
 * QUÉ INTENCIÓN VERIFICA: *"¿otra declaración del ancestro —una que se queda
 * FIJA arriba— ya INVOCA a este miembro?"*. Si la contesta que sí, el orden
 * del algoritmo ya vive en el ancestro y este miembro es el PASO VARIABLE que
 * ese orden delega: la mitigación que el patrón propone —subir el esqueleto
 * al ancestro común— **ya está hecha**, y lo que los hermanos escriben es,
 * por contrato, la implementación del gancho.
 *
 * `completeTemplateCandidate` sólo sabe preguntar la mitad directa (`B.m`
 * llama a un gancho que todos redeclaran ⇒ `m` es el esqueleto). Cuando el
 * miembro que el ancla nombra ES el gancho, la mitad directa contesta que no
 * hay plantilla —y es cierto para `m`, pero falso para la familia—. Ver
 * `StructuralAncestorFacts.skeletonCalledByAncestorMembers` para los dos
 * guardas (nombre distinto, `t` no redeclarado por todos) y para el caso
 * medido de sobrecarga que el primero corta.
 */
function ancestorMembersCallingSkeleton(shape: FamilyShape, methodName: string): readonly string[] {
  const out: string[] = [];
  for (const cand of shape.ancestorMembers) {
    if (cand.name === methodName) continue;
    if (shape.redeclaringCount(cand) >= shape.siblingCount) continue;
    if (shape.ancestorCalls(cand.name, methodName)) out.push(cand.name);
  }
  return out;
}

interface AstFamilyResolution {
  entries: SkeletonEntry[];
  winningGroup: readonly SkeletonEntry[] | null;
  structuralFacts: StructuralAncestorFacts | null;
}

/**
 * Decide, para una familia YA confirmada (ancestro común en el mismo
 * archivo), cuál es el candidato a "esqueleto" y con qué evidencia. A
 * diferencia del camino con grafo por `distributed-duplication` (donde el
 * nombre candidato lo aporta el ANCLA, vía `CloneCandidate.functionName`),
 * acá no hay ninguna señal externa de "qué nombre mirar" — así que la
 * elección misma es donde vive la intención del patrón.
 *
 * OLA U — LAS DOS PREGUNTAS, EN ESTE ORDEN (antes eran tres prioridades que
 * empezaban por "el primer miembro de la base que nadie redeclara"):
 *
 *   1. **¿YA HAY UNA PLANTILLA?** — `completeTemplateCandidate`: un miembro
 *      del ancestro que nadie redeclara *y que invoca a un gancho que TODOS
 *      los hermanos redeclaran*. Sólo esta terna sostiene `ya-aplicado` /
 *      `aplicado-eludido`. La prioridad vieja (1: nadie redeclara; 2: algunos
 *      redeclaran) acertaba en cualquier jerarquía real, porque en toda base
 *      con hermanos hay algún método no sobreescrito — por eso 160 de 162
 *      `ya-aplicado` medidos salían con el check de gancho en `false`.
 *
 *   2. **¿FALTA UNA PLANTILLA?** — un algoritmo (>= `MIN_SEQUENCE_LEN` pasos
 *      invocados) duplicado en >= `MIN_DISTINCT_UNITS` hermanos, con firmas
 *      compatibles (aridad y tipo de retorno) y que **el ancestro NO
 *      declara**: la mitigación "subir el esqueleto al ancestro común" es
 *      exactamente eso, y sólo tiene sentido si todavía no está ahí.
 *
 * Ninguna de las dos ⇒ `winningGroup: null`, el `required` no se cumple y
 * `engine.ts#build` devuelve `null`: **silencio**. Es la respuesta honesta a
 * "¿conviene un Template Method acá?" cuando la familia ni tiene plantilla ni
 * tiene un algoritmo duplicado — antes ese caso salía `ya-aplicado`, que el
 * usuario no quiere y que además era falso.
 */
function resolveAstFamily(family: AstFamily, sets: DerivedNodeSets, file: string): AstFamilyResolution {
  const shape = astFamilyShape(family, sets);
  const subclassList = [...family.subclasses.entries()];

  const complete = completeTemplateCandidate(shape);
  if (complete) {
    const skeletonNode = methodsOfClassAst(family.baseNode, sets).find((m) => m.name === complete.skeleton.name)!;
    const entries: SkeletonEntry[] = subclassList.map(([unitName]) => ({
      location: {
        file,
        startLine: skeletonNode.node.startPosition.row + 1,
        endLine: skeletonNode.node.endPosition.row + 1,
        symbol: complete.skeleton.name,
        role: `hereda (o debería heredar, sin bypasear) el esqueleto "${complete.skeleton.name}" de "${family.baseName}"`,
      },
      unitName,
      methodName: complete.skeleton.name,
      calledNamesSequence: skeletonNode.calls,
      clone: null,
      unitSymbolId: null,
      arityRange: skeletonNode.arityRange,
      ...(skeletonNode.returnType !== undefined ? { returnType: skeletonNode.returnType } : {}),
    }));
    return { entries, winningGroup: entries, structuralFacts: astStructuralAncestorFacts(family, sets, complete.skeleton.name) };
  }

  // 2. El PROBLEMA: un algoritmo duplicado entre hermanos que el ancestro no posee.
  const ownedByAncestor = new Set(shape.ancestorMembers.map((m) => m.name));
  const entries = entriesFromAstFamily(family, sets, file, ownedByAncestor);
  const winning = bestGroup(entries);
  if (!winning) return { entries, winningGroup: null, structuralFacts: null };
  return { entries, winningGroup: winning.group, structuralFacts: astStructuralAncestorFacts(family, sets, winning.group[0]!.methodName) };
}

/* ────────────────────────────────────────────────────────────────────────
 * El problema tipado que ve el motor — precomputado UNA vez en `build()`,
 * nunca recalculado dentro de cada `Check` (mismo estilo que `command.ts`/
 * `iterator.ts`).
 * ──────────────────────────────────────────────────────────────────────── */
interface SkeletonEntry {
  location: RoleLocation;
  unitName: string;
  methodName: string; // nunca null acá — ver higiene en el docstring
  calledNamesSequence: readonly string[]; // [] cuando no hay datos de cuerpo (ancla parallel-hierarchies)
  clone: CloneCandidate | null; // sólo presente para el ancla distributed-duplication
  /** NUEVO, Ola 10: id del nodo `class-like` de esta unidad en el grafo —
   *  `null` cuando no se pudo resolver (sin grafo, lenguaje sin clases, o el
   *  nodo no aparece). El excluder estructural (`extends`+`memberSignatures`)
   *  depende enteramente de esto — reemplaza a `CloneCandidate.superclassName`. */
  unitSymbolId: string | null;
  /** NUEVO (frente aridad) — ver "ARIDAD COMPATIBLE" arriba. Rango
   *  `[mínimo, máximo]` de aridad de ESTA declaración de `methodName` en
   *  ESTA unidad. `null` = sin dato de aridad en absoluto (nunca se asume
   *  compatible NI incompatible por eso — `arityRangesCompatible` trata
   *  `null` como compatible con cualquier cosa, la opción conservadora dado
   *  que no hay evidencia para excluir). Cuando sólo se conoce la aridad
   *  TOTAL cruda (grafo, sin AST vivo para ver parámetros opcionales),
   *  `min === max` — el caso más estricto, nunca el más permisivo. */
  arityRange: { min: number; max: number } | null;
  /** NUEVO (Ola U, INTENCIÓN 2) — tipo de retorno ESCRITO de ESTA
   *  declaración. `undefined` = "no sé" (gramática sin ranura, autor que no
   *  lo escribió, o corrida sin el dato): NUNCA se lee como acuerdo ni como
   *  desacuerdo — ver `graph/types.ts#returnTypesConflict`. */
  returnType?: string;
  /**
   * NUEVO — **OLA AO, FRENTE AO4: EL CUERPO DE UN MIEMBRO QUE VIVE EN OTRO
   * ARCHIVO.** La secuencia de llamadas del cuerpo de ESTA declaración,
   * recuperada de `RepoUnit.clones` (`bodySequenceFromClones`) cuando la
   * entrada la construyó el camino de GRAFO — donde `calledNamesSequence` es
   * `[]` POR CONSTRUCCIÓN, porque `memberSignatures` es nombre + aridad y
   * nada más. `undefined`/vacío = no se pudo recuperar el cuerpo (miembro más
   * chico que el piso de clon, o sin nodo de miembro en el grafo): "no sé",
   * nunca "no hay cuerpo".
   *
   * POR QUÉ NO SE ESCRIBE EN `calledNamesSequence`, y es una decisión de
   * ADITIVIDAD escrita ANTES de medir: `bestGroup` DESCARTA un grupo cuando
   * `avgSimilarity < MIN_SIMILARITY`, y ese gate **sólo se evalúa cuando hay
   * secuencia**. Escribir el cuerpo en `calledNamesSequence` podría hacer
   * PERDER un grupo que hoy gana — prohibido. Acá el dato viaja aparte y se
   * consulta SÓLO en los dos lugares donde el módulo YA había escrito el
   * número que lo necesitaba: `bodilessGroupNeedsThreeUnits` (que dice, con
   * todas las letras, *"con datos de cuerpo alcanzan MIN_DISTINCT_UNITS=2"*)
   * y el discriminador `highAverageSimilarity` (que contestaba *"Sin datos de
   * secuencia de llamadas"* en 39 de 39, medido por AM1).
   */
  bodySequence?: readonly string[];
}

/** Los hechos estructurales de la excluder — CONTRATO-F10.md §2, calculados
 *  UNA vez por `build()` sobre el grupo ganador, nunca recalculados dentro de
 *  un `Check`. `null` ⇒ no se pudo confirmar un ancestro común vía `extends`
 *  (sin grafo, unidad sin nodo resoluble, o ningún target de `extends`
 *  compartido por TODAS las unidades del grupo). */
interface StructuralAncestorFacts {
  readonly ancestorId: string;
  readonly ancestorName: string;
  readonly skeletonName: string;
  readonly skeletonDeclaredInAncestor: boolean;
  readonly skeletonArity: number | null;
  readonly anySubtypeRedeclaresSkeleton: boolean;
  /** Miembros de `B` (≠ `m`) que TODOS los subtipos redeclaran con la misma `(name, arity)` — los ganchos candidatos. */
  readonly hooks: readonly { name: string; arity: number | null }[];
  /** `sym:B.m --calls--> sym:B.g` para al menos uno de `hooks`. */
  readonly skeletonCallsHook: boolean;
  /**
   * OLA AD (AD2) — **LA TERCERA CONDICIÓN, "RESOLUCIÓN VERIFICADA", CON LOS
   * ROLES INVERTIDOS.** Miembros `t` del ancestro tales que
   * `sym:B.t --calls--> sym:B.m`, con `t` de nombre DISTINTO a `m` y NO
   * redeclarado por todos los subtipos.
   *
   * QUÉ HECHO ES, en vocabulario de gramática: *"otra declaración del
   * ancestro, que se queda fija arriba, INVOCA a ésta"*. Es exactamente el
   * mismo trío que `completeTemplateCandidate` busca —`B.t` llama a `B.m` y
   * los subtipos escriben `m`— leído desde el otro extremo: acá el miembro
   * que el ancla nombra es el **GANCHO**, no el esqueleto. `hooks` /
   * `skeletonCallsHook` sólo saben preguntar *"¿`m` llama a un gancho?"*, y
   * por eso contestan `parcial` cuando `m` ES el gancho.
   *
   * LOS DOS GUARDAS, y cada uno corta un falso distinto:
   *   · **nombre distinto** — una llamada al MISMO nombre es delegación hacia
   *     arriba (`super.m()` llega al barrido como `m`), recursión, o —medido
   *     en `guava-testlib`— una SOBRECARGA que el grafo no puede separar:
   *     `TestStringListGenerator` declara `create(Object...)` y
   *     `create(String[])`, el grafo les da dos nodos pero resuelve la
   *     llamada al PRIMERO (`create --calls--> create`, un lazo). Contar ese
   *     lazo sería leer un artefacto de resolución, no un hecho de gramática.
   *   · **no redeclarado por todos** — mismo criterio que
   *     `completeTemplateCandidate` ya usa ("un miembro que TODOS redeclaran
   *     es un gancho, nunca el esqueleto"): si `t` también lo reescribe cada
   *     subtipo, arriba no quedó fijo ningún orden.
   */
  readonly skeletonCalledByAncestorMembers: readonly string[];
  /**
   * R5 (esta tarea) — por qué relación (`FAMILY_EDGE_KINDS`) el grupo llega
   * a `ancestorId`: `["extends"]` (herencia de clase, único caso posible en
   * el camino AST same-file — `astStructuralAncestorFacts` — y el único que
   * existía antes de esta tarea), `["mixes-in"]` (Ruby `include`/`extend`/
   * `prepend` — el camino nuevo) o ambos si el grupo comparte el mismo
   * ancestro por las dos vías a la vez. Sólo para el texto de `why` — nunca
   * cambia qué se decide, sólo cómo se lo nombra.
   */
  readonly ancestorRelation: readonly ("extends" | "mixes-in")[];
  /**
   * OLA AF (frente AF5) — **EL HECHO QUE HABILITA `ausente`, PRIMERA MITAD.**
   * Cuántos miembros `function-like` declara el ancestro y este proceso PUDO
   * LEER (`memberSignatures` por el camino de grafo, `methodsOfClassAst` por
   * el camino AST same-file, los dos ya sin constructores).
   *
   * QUÉ INTENCIÓN VERIFICA: *"¿puedo afirmar qué declara el ancestro, o sólo
   * puedo afirmar que no lo vi?"*. `skeletonDeclaredInAncestor === false`
   * sobre un ancestro del que se leyeron CERO miembros no es el hecho "el
   * esqueleto no está arriba": es "no pude mirar arriba", y son dos cosas
   * distintas que hasta esta ola salían idénticas.
   *
   * VERIFICADO ANTES DE ESCRIBIR NADA (la cuarta condición de la Ola AE), con
   * sonda propia sobre el grafo de la caché — `scratchpad-af5/
   * af5-probe-ancestro.mts`, contando TODO nodo destino de `extends`/
   * `mixes-in`: **1.364 de 1.577 ancestros (86,5 %) en biblioteca** y **215 de
   * 347 (62,0 %) en aplicación** exponen >= 1 miembro. O sea: el hecho
   * EXISTE, y el 13,5 %/38,0 % restante es exactamente la ambigüedad que este
   * campo hace visible (interfaces TS sin cuerpo, `Base` declarativo de
   * sqlalchemy, módulos-marcador de Ruby). En aplicación el "no" se concentra
   * en Ghost (113 de 152): dicho con el desglose, como la ola obliga.
   */
  readonly ancestorDeclaredMemberCount: number;
  /**
   * OLA AF (frente AF5) — **EL HECHO QUE HABILITA `ausente`, SEGUNDA MITAD.**
   * `true` ⇔ el ancestro YA hospeda una plantilla para OTRO miembro: declara
   * >= 1 gancho (miembro que TODOS los hermanos redeclaran con la misma
   * `(name, arity)`) y otro miembro del PROPIO ancestro lo invoca.
   *
   * QUÉ INTENCIÓN VERIFICA: *"de lo que este patrón propone, ¿hay algo ya
   * puesto arriba?"*. Es la pregunta que separa las dos situaciones que hasta
   * hoy compartían el mismo `parcial`:
   *   · el ancestro no tiene NADA del patrón — ni el esqueleto que el ancla
   *     nombra ni ninguna otra plantilla: **`ausente`**, y la recomendación
   *     "crear un Template Method acá" es literal;
   *   · el ancestro YA fija un orden y delega un paso para otro miembro —
   *     **`parcial`**: la familia ya sabe de plantillas y este miembro
   *     simplemente quedó afuera, que es una afirmación mucho más débil.
   *
   * SE CALCULA SÓLO en la rama `!skeletonDeclaredInAncestor` (única rama que
   * lo consulta); en las demás es `false` y NADIE lo mira — ningún estado
   * viejo depende de él.
   *
   * VERIFICADO ANTES DE ESCRIBIRLO: el hecho es la arista `calls` entre dos
   * símbolos `function-like` contenidos por el MISMO nodo class-like. Sonda
   * propia (`scratchpad-af5/af5-probe-plantilla.mts`) sobre ancestros con >= 2
   * subtipos: **439 de 845 con miembros visibles (52,0 %) en biblioteca** y
   * **187 de 397 (47,1 %) en aplicación** tienen >= 1; en total **3.677 y
   * 1.090 aristas** de esa forma exacta. Es el contraste con el caso Builder
   * de la Ola AE (0 de 3.261 aristas `instantiates` con aridad): acá el dato
   * está, y por eso esto se aterriza.
   */
  readonly ancestorHostsTemplate: boolean;
}

/** Texto legible de `StructuralAncestorFacts.ancestorRelation` para un `why`. */
function ancestorRelationLabel(relation: readonly ("extends" | "mixes-in")[]): string {
  if (relation.length === 0) return "extends"; // no debería pasar (siempre >= 1 kind confirmado) — default conservador, mismo texto que antes de esta tarea.
  if (relation.length === 1) return relation[0]!;
  return relation.slice().sort().join("/");
}

interface TemplateMethodProblem {
  finding: Finding;
  totalLocations: number;
  entries: readonly SkeletonEntry[];
  winningGroup: readonly SkeletonEntry[] | null;
  winningAvgSimilarity: number | null;
  anchorKind: string; // "distributed-duplication" | "parallel-hierarchies"
  /** NUEVO, Ola 10 — `null` cuando no hay grupo ganador o no se pudo confirmar un ancestro. */
  structuralFacts: StructuralAncestorFacts | null;
  /** NUEVO, Ola 10 — `ctx.capabilities.has("herencia")`. Distingue, cuando NO
   *  hay grafo en esta corrida, "este lenguaje no tiene herencia de
   *  implementación" (estructuralmente `ausente` — nunca va a existir un
   *  `extends` que buscar) de "sí la tiene, pero no se puede confirmar en
   *  esta corrida" (`parcial`, declarado). Sin esto, un lenguaje sin clases
   *  (Go) caería siempre a `parcial` por falta de grafo, perdiendo la
   *  distinción que antes daba `CloneCandidate.superclassName: null`. */
  hasInheritanceCapability: boolean;
}

type TemplateMethodGraph = CodeGraph | null;

/**
 * R5 (esta tarea) — EL HUECO MEDIDO: hasta acá, "familia" == sólo `extends`.
 * `graph/edges/mixin.ts` emite `mixes-in` (Ruby `include`/`extend`/`prepend`
 * — 78 aristas medidas en el Rails) y esta hipótesis nunca lo consultaba:
 * una unidad que recibe su esqueleto vía un módulo incluido caía siempre a
 * "el ancestro [de `extends`] no lo declara" — falso, cuando el esqueleto
 * SÍ vive en el módulo mixin. Verificado a mano sobre
 * `app/models/deal.rb:67` (`large-class` → Template Method): las 4 unidades
 * (`Deal`/`Hook`/`Hookable`/`LeadAttribution`) comparten DOS ancestros-como-
 * fuente-de-comportamiento a la vez — `ApplicationRecord` vía `extends`
 * (compartido por casi cualquier modelo del repo, sin relación real con
 * "init_parser") y `ProtoModule` vía `mixes-in` (el dueño real de `init`, el
 * esqueleto, y de `init_parser`, el gancho) — y el código sólo miraba el
 * primero.
 *
 * `implements`/`satisfies` quedan AFUERA a propósito, ampliando el RIESGO A9
 * ya declarado: son satisfacción de INTERFAZ — el target nunca tiene un
 * cuerpo de método que ejecutar (una firma sin cuerpo no es "el esqueleto ya
 * vive acá"), así que incluirlas fabricaría un `skeletonDeclaredInAncestor:
 * true` falso apenas el nombre de método coincidiera con una firma de
 * interfaz — el mismo tipo de falso convincente que esta tarea vino a
 * cerrar, no a abrir uno nuevo.
 */
const FAMILY_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["extends", "mixes-in"]);

/** Los ancestros COMUNES (vía `extends` O `mixes-in` — `FAMILY_EDGE_KINDS`,
 *  UN salto) de TODAS las unidades de `group` — `null` si alguna unidad no
 *  tiene nodo resoluble, o si ningún target es compartido por todas. Puede
 *  devolver MÁS DE UNO (ver el docstring de `FAMILY_EDGE_KINDS`: una unidad
 *  casi siempre tiene un `extends` Y uno o más `mixes-in` a la vez) — quien
 *  llama (`pickDeclaringAncestor`) decide cuál es el relevante. Reemplaza la
 *  lectura de `CloneCandidate.superclassName` (CONTRATO-F10.md §2). */
function commonAncestorIds(index: Index, group: readonly SkeletonEntry[]): string[] | null {
  let candidates: Set<string> | null = null;
  for (const e of group) {
    if (!e.unitSymbolId) return null;
    const targets = new Set((index.edgesFrom.get(e.unitSymbolId) ?? []).filter((edge) => FAMILY_EDGE_KINDS.has(edge.kind)).map((edge) => edge.to));
    if (targets.size === 0) return null;
    if (candidates === null) {
      candidates = targets;
    } else {
      const prev = candidates;
      const intersected = new Set<string>();
      for (const t of prev) if (targets.has(t)) intersected.add(t);
      candidates = intersected;
    }
    if (candidates.size === 0) return null;
  }
  if (candidates === null || (candidates as Set<string>).size === 0) return null;
  return [...candidates].sort(); // orden determinista — ver pickDeclaringAncestor para el criterio de selección.
}

/**
 * De varios ancestros comunes candidatos (`commonAncestorIds`), el que
 * DECLARA `methodName` en `memberSignatures` — la evidencia más fuerte de
 * que ES el dueño real del esqueleto, sin importar si el grupo llega a él
 * vía `extends` o vía `mixes-in`. Si ninguno lo declara (el caso PARCIAL:
 * el esqueleto no vive en ningún ancestro común todavía), cae al primero en
 * orden determinista — mismo comportamiento observable que antes de esta
 * tarea para ESE caso (la mitigación — "subir el esqueleto a un ancestro
 * común" — es la misma sin importar cuál de los ancestros compartidos se
 * nombre en el mensaje).
 */
function pickDeclaringAncestor(index: Index, ancestorIds: readonly string[], methodName: string): string {
  const gi = asGraphIndex(index);
  for (const id of ancestorIds) {
    if (memberSignatures(gi, id).some((m) => m.name === methodName)) return id;
  }
  return ancestorIds[0]!;
}

/**
 * Miembros PROPIOS de un nodo del grafo, ya sin constructores — ver la
 * INTENCIÓN 1 del bloque "OLA U". Sin árbol vivo acá, el único mecanismo
 * disponible es el de NOMBRE (`isConstructorMemberName`: nombre igual al de
 * la clase dueña, o protocolo nativo), exactamente el mismo que
 * `singleton.ts#scanMembers` usa sobre el grafo por la misma razón.
 */
function ownMembers(index: Index, ownerId: string): MemberSignature[] {
  const owner = index.nodeById.get(ownerId);
  const ownerName = owner ? (owner.symbolPath[owner.symbolPath.length - 1] ?? "") : "";
  return memberSignatures(asGraphIndex(index), ownerId).filter((m) => !isConstructorMemberName(m.name, ownerName));
}

/** Los hechos del camino de GRAFO, en la forma que `completeTemplateCandidate`
 *  consume — el gemelo de `astFamilyShape`, leyendo `memberSignatures` y las
 *  aristas `calls` en vez del árbol. */
function graphFamilyShape(index: Index, ancestorId: string, siblingIds: readonly string[]): FamilyShape {
  const ancestorMembers = ownMembers(index, ancestorId);
  const siblingMembers = siblingIds.map((id) => ownMembers(index, id));
  return {
    ancestorMembers,
    siblingCount: siblingMembers.length,
    redeclaringCount: (sig) => siblingMembers.filter((members) => signatureRedeclares(members, sig)).length,
    ancestorCalls: (skeletonName, hookName) => {
      const mNodeId = memberNodeId(index, ancestorId, skeletonName);
      const gNodeId = memberNodeId(index, ancestorId, hookName);
      if (!mNodeId || !gNodeId) return false;
      return (index.edgesFrom.get(mNodeId) ?? []).some((e) => e.kind === "calls" && e.to === gNodeId);
    },
  };
}

/**
 * OLA AF (frente AF5) — *"¿el ancestro YA hospeda una plantilla, para
 * cualquier miembro que no sea `skipName`?"*. UNA sola implementación para
 * los dos caminos (grafo y AST same-file), igual que `completeTemplateCandidate`:
 * cada camino provee los hechos (`FamilyShape`), la pregunta se escribe una vez.
 *
 * La terna es la MISMA que `completeTemplateCandidate` ya busca —un gancho que
 * TODOS los hermanos redeclaran e invocado desde otro miembro del ancestro—,
 * leída sin exigir que el miembro que el ancla nombra esté arriba (en la rama
 * que llama a esto, justamente, NO está).
 *
 * LOS DOS GUARDAS, los mismos que `skeletonCalledByAncestorMembers` ya declara
 * y por las mismas razones medidas: se saltea `skipName` (el miembro del ancla,
 * que acá ni siquiera vive en el ancestro) y se exige `t.name !== h.name` — una
 * arista `calls` de un nombre a sí mismo es `super`, recursión o una sobrecarga
 * que el grafo no separa, nunca un orden fijado arriba.
 */
function ancestorHostsTemplateFor(shape: FamilyShape, skipName: string): boolean {
  if (shape.siblingCount === 0) return false;
  const hooks = shape.ancestorMembers.filter((c) => c.name !== skipName && shape.redeclaringCount(c) === shape.siblingCount);
  if (hooks.length === 0) return false;
  for (const t of shape.ancestorMembers) {
    if (t.name === skipName) continue;
    if (hooks.some((h) => h.name !== t.name && shape.ancestorCalls(t.name, h.name))) return true;
  }
  return false;
}

/** Ver "LAS TRES FORMAS" en el docstring del módulo. */
function structuralAncestorFacts(index: Index, group: readonly SkeletonEntry[], methodName: string): StructuralAncestorFacts | null {
  const ancestorIds = commonAncestorIds(index, group);
  if (!ancestorIds) return null;
  const ancestorId = pickDeclaringAncestor(index, ancestorIds, methodName);

  const ancestorNode = index.nodeById.get(ancestorId);
  const ancestorName = ancestorNode ? (ancestorNode.symbolPath[ancestorNode.symbolPath.length - 1] ?? ancestorId) : ancestorId;
  const shape = graphFamilyShape(
    index,
    ancestorId,
    group.map((e) => e.unitSymbolId!),
  );
  const skeletonSig = shape.ancestorMembers.find((m) => m.name === methodName) ?? null;
  const skeletonDeclaredInAncestor = skeletonSig !== null;

  let anySubtypeRedeclaresSkeleton = false;
  const hooks: { name: string; arity: number | null }[] = [];
  let skeletonCallsHook = false;
  let skeletonCalledByAncestorMembers: readonly string[] = [];
  // OLA AF (AF5) — ver `StructuralAncestorFacts.ancestorHostsTemplate`: se
  // calcula SÓLO en la rama que lo consulta, así ningún estado viejo cambia.
  let ancestorHostsTemplate = false;

  if (skeletonSig) {
    anySubtypeRedeclaresSkeleton = shape.redeclaringCount(skeletonSig) > 0;
    for (const cand of shape.ancestorMembers) {
      if (cand.name === methodName) continue;
      if (shape.redeclaringCount(cand) === shape.siblingCount) hooks.push({ name: cand.name, arity: cand.arity });
    }
    skeletonCallsHook = hooks.some((h) => shape.ancestorCalls(methodName, h.name));
    skeletonCalledByAncestorMembers = ancestorMembersCallingSkeleton(shape, methodName);
  } else {
    ancestorHostsTemplate = ancestorHostsTemplateFor(shape, methodName);
  }

  const relationKinds = new Set<"extends" | "mixes-in">();
  for (const e of group) {
    if (!e.unitSymbolId) continue;
    for (const edge of index.edgesFrom.get(e.unitSymbolId) ?? []) {
      if (edge.to === ancestorId && (edge.kind === "extends" || edge.kind === "mixes-in")) relationKinds.add(edge.kind);
    }
  }

  return {
    ancestorId,
    ancestorName,
    skeletonName: methodName,
    skeletonDeclaredInAncestor,
    skeletonArity: skeletonSig?.arity ?? null,
    anySubtypeRedeclaresSkeleton,
    hooks,
    skeletonCallsHook,
    skeletonCalledByAncestorMembers,
    ancestorRelation: [...relationKinds].sort(),
    ancestorDeclaredMemberCount: shape.ancestorMembers.length,
    ancestorHostsTemplate,
  };
}

/**
 * QUÉ INTENCIÓN VERIFICA (Ola U, INTENCIÓN 2 — PLAN-INTENCIONES.md §2 bug 2):
 * "estas declaraciones homónimas, ¿pueden ser el MISMO paso del MISMO
 * algoritmo?" La única mitigación que este patrón ofrece para el estado
 * `parcial` es *subir `m` al ancestro común*; esa mitigación sólo existe si
 * las declaraciones que se unificarían pueden compartir un contrato. Cuando
 * dos de ellas ESCRIBIERON tipos de retorno distintos, unificarlas no
 * compila — no son el mismo paso, por mucho que sus cuerpos den Jaccard 1.0.
 *
 * Se pregunta por el NOMBRE dentro de la FAMILIA, no por un par suelto: basta
 * UN desacuerdo escrito entre dos entradas cualesquiera del grupo para que el
 * nombre entero deje de ser candidato a esqueleto compartido, porque la
 * mitigación es una sola y las alcanzaría a todas. Se evalúa DESPUÉS del
 * clúster de aridad, así que dos sobrecargas legítimas de distinta aridad ya
 * fueron separadas antes de llegar acá y no se contaminan entre sí.
 *
 * Caso medido, re-verificado en disco esta ola
 * (`corpus/newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs`):
 * `BsonObject.GetEnumerator(): IEnumerator<BsonProperty>` (:52-54) y
 * `BsonArray.GetEnumerator(): IEnumerator<BsonToken>` (:75-77), aridad 0
 * las dos, cuerpo idéntico `return _children.GetEnumerator();` — el reporte
 * decía "subir `GetEnumerator` a `BsonToken`", un cambio que no compila.
 *
 * AUSENTE NO ES DESACUERDO: `returnTypesConflict` (`graph/types.ts`, frente
 * C2) devuelve `false` en cuanto falta uno de los dos, así que Ruby y
 * JavaScript —sin ranura de tipo de retorno en su gramática— quedan
 * exactamente como estaban.
 */
function groupHasReturnTypeConflict(entries: readonly SkeletonEntry[]): boolean {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (returnTypesConflict(asSignature(entries[i]!), asSignature(entries[j]!))) return true;
    }
  }
  return false;
}

/** Proyección mínima de un `SkeletonEntry` a la forma que
 *  `returnTypesConflict` consume — nunca se compara el campo a mano (ver su
 *  docstring: es lo que impide convertir un "no sé" en un "no"). */
function asSignature(entry: SkeletonEntry): MemberSignature {
  return { name: entry.methodName, arity: entry.arityRange ? entry.arityRange.min : null, ...(entry.returnType !== undefined ? { returnType: entry.returnType } : {}) };
}

/** Mejor grupo por nombre de método CON firma compatible (ver "ARIDAD
 *  COMPATIBLE" arriba — `arityCompatibleCluster` reduce cada bolsa de
 *  mismo-nombre al subconjunto cuyos rangos de aridad se solapan ANTES de
 *  contar unidades, así que `BsonObject.Add(string,BsonToken)` y
 *  `BsonArray.Add(BsonToken)` — mismo nombre, aridad `[2,2]` vs `[1,1]`, sin
 *  solape — nunca llegan a competir como si fueran la misma copia): unidades
 *  DISTINTAS >= `MIN_DISTINCT_UNITS` y, cuando hay datos de cuerpo,
 *  similitud promedio >= `MIN_SIMILARITY`. Sin datos de cuerpo (ancla
 *  `parallel-hierarchies`, `calledNamesSequence: []`) el gate de similitud
 *  no se aplica — no hay nada que medir, y exigirlo igual apagaría esa
 *  ancla entera detrás de un cero encubierto. */
function bestGroup(entries: readonly SkeletonEntry[]): { group: readonly SkeletonEntry[]; avgSimilarity: number | null } | null {
  // CASE-SENSITIVE a propósito (ver verificación manual guava:
  // `HashCode` constructor vs. `hashCode` override — falso positivo real bajo `.toLowerCase()`).
  const byName = new Map<string, SkeletonEntry[]>();
  for (const e of entries) {
    const key = e.methodName;
    const list = byName.get(key) ?? [];
    list.push(e);
    byName.set(key, list);
  }

  let best: { group: readonly SkeletonEntry[]; avgSimilarity: number | null } | null = null;
  let bestDistinctUnits = 0;
  for (const rawList of byName.values()) {
    const list = arityCompatibleCluster(rawList);
    if (groupHasReturnTypeConflict(list)) continue;
    const distinctUnits = new Set(list.map((e) => e.unitName));
    if (distinctUnits.size < MIN_DISTINCT_UNITS) continue;

    const withSeq = list.filter((e) => e.calledNamesSequence.length > 0);
    let avgSimilarity: number | null = null;
    if (withSeq.length >= 2) {
      let total = 0;
      let count = 0;
      for (let i = 0; i < withSeq.length; i++) {
        for (let j = i + 1; j < withSeq.length; j++) {
          total += sequenceSimilarity(withSeq[i]!.calledNamesSequence, withSeq[j]!.calledNamesSequence);
          count++;
        }
      }
      avgSimilarity = count > 0 ? total / count : null;
    }
    if (avgSimilarity !== null && avgSimilarity < MIN_SIMILARITY) continue;

    if (distinctUnits.size > bestDistinctUnits) {
      bestDistinctUnits = distinctUnits.size;
      best = { group: list, avgSimilarity };
    }
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────
 * FAMILIA POR GRAFO (esta tarea, ensanchada en R5) — el equivalente de
 * `findAstFamily`/`resolveAstFamily`, SIN la restricción "mismo archivo":
 * pregunta al grafo por las aristas `FAMILY_EDGE_KINDS` (`extends` Y
 * `mixes-in`, R5) del tipo en vez del árbol del archivo. Sólo se usa desde
 * `resolveDeferredViaGraph` (más abajo), en `refresh()`, donde el grafo real
 * SÍ existe (a diferencia de `build()` — ver "EL HUECO MEDIDO" en el
 * docstring del módulo).
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Todos los nodos `class-like` del grafo (de CUALQUIER archivo) con una
 * arista `extends` O `mixes-in` confiada (`confidentEdges`, mismo criterio
 * que `buildIndex`; `FAMILY_EDGE_KINDS`) hacia `ancestorId` — el REVERSO de
 * lo que ya hace `commonAncestorIds` (que va de un grupo YA conocido hacia
 * sus ancestros comunes): acá se parte de UN ancestro y se buscan TODAS las
 * unidades que lo extienden O lo incorporan (mixin), sin importar en qué
 * archivo vivan. R5: antes sólo miraba `extends` — una unidad que INCORPORA
 * `ancestorId` (un módulo) es tan "hermana" de familia como una que lo
 * extiende (una subclase).
 */
function classLikeNodesRelatedTo(graph: CodeGraph, index: Index, ancestorId: string): CodeGraphNode[] {
  const out: CodeGraphNode[] = [];
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "class-like" || n.id === ancestorId) continue;
    const related = (index.edgesFrom.get(n.id) ?? []).some((e) => FAMILY_EDGE_KINDS.has(e.kind) && e.to === ancestorId);
    if (related) out.push(n);
  }
  return out;
}

interface GraphFamily {
  readonly ancestorId: string;
  readonly ancestorNode: CodeGraphNode;
  /** Todas las unidades con `extends|mixes-in -> ancestorId` confirmado en el
   *  grafo — incluye al ancla si el ancla es una de ellas (nunca al ancestro
   *  mismo). */
  readonly siblings: readonly CodeGraphNode[];
}

/**
 * TODAS las familias viables (ancestro + >= `MIN_DISTINCT_UNITS` unidades
 * relacionadas vía `extends` o `mixes-in`) alcanzables desde `anchorId` en
 * TODO EL GRAFO — el equivalente de `findAstFamily` sin la restricción de
 * archivo, PLURAL desde R5.
 *
 * ANTES de esta tarea, esta función (entonces `findGraphFamily`, singular)
 * devolvía la PRIMERA familia que encontraba, en el orden arbitrario de
 * iteración de las propias aristas del ancla — con sólo `extends` en el
 * pool, un ancla casi siempre tenía UN candidato, así que "el primero" y "el
 * único" coincidían. Con `mixes-in` sumado, un ancla casi siempre tiene MÁS
 * de un ancestro candidato a la vez (p.ej., en Rails: la superclase de
 * framework casi universal vía `extends`, y uno o más módulos mixin
 * específicos vía `mixes-in`) — quedarse con el primero podía aterrizar en
 * la familia GENÉRICA (cientos de hermanos sin relación real entre sí, más
 * allá de compartir el framework) en vez de la ESPECÍFICA (el mixin real que
 * aporta el esqueleto). ESE fue EL HUECO MEDIDO de esta tarea sobre
 * `app/models/deal.rb:67`: la familia vía `ApplicationRecord` (`extends`,
 * decenas/cientos de modelos) ganaba SIEMPRE sobre la familia vía
 * `ProtoModule` (`mixes-in`, 4 unidades) simplemente por venir primero.
 *
 * Por eso ahora se devuelven TODAS las familias viables — cada dirección
 * (el ancla como BASE, vía arista inversa; el ancla como UNO de los
 * hermanos, vía sus propios targets) y cada ancestro candidato — y quien
 * llama (`resolveDeferredViaGraph`) resuelve TODAS con `resolveGraphFamily`
 * y se queda con la de MEJOR confirmación (`ResolutionTier`), nunca con la
 * primera por default.
 */
function findGraphFamilyCandidates(graph: CodeGraph, index: Index, anchorId: string): GraphFamily[] {
  const out: GraphFamily[] = [];
  const seenAncestors = new Set<string>([anchorId]);

  const asBase = classLikeNodesRelatedTo(graph, index, anchorId);
  if (asBase.length >= MIN_DISTINCT_UNITS) {
    const ancestorNode = index.nodeById.get(anchorId);
    if (ancestorNode) out.push({ ancestorId: anchorId, ancestorNode, siblings: asBase });
  }

  const ancestorTargets = new Set((index.edgesFrom.get(anchorId) ?? []).filter((e) => FAMILY_EDGE_KINDS.has(e.kind)).map((e) => e.to));
  for (const targetId of ancestorTargets) {
    if (seenAncestors.has(targetId)) continue;
    seenAncestors.add(targetId);
    const ancestorNode = index.nodeById.get(targetId);
    if (!ancestorNode) continue;
    const siblings = classLikeNodesRelatedTo(graph, index, targetId);
    if (siblings.length >= MIN_DISTINCT_UNITS) out.push({ ancestorId: targetId, ancestorNode, siblings });
  }
  return out;
}

/**
 * Nivel de confirmación alcanzado al resolver UNA `GraphFamily` candidata —
 * usado SÓLO para elegir entre VARIAS (`findGraphFamilyCandidates`), NUNCA
 * para decidir el `PatternState` final (eso lo sigue haciendo `appliedState`/
 * `stateFromFacts` sobre la familia YA elegida, sin cambios). Menor es más
 * fuerte:
 *   1 = el ancestro de ESTA familia tiene la terna COMPLETA del patrón
 *       (esqueleto + gancho redeclarado por todos + `calls`) SIN fuga — la
 *       plantilla ya vive, entera, en ESE ancestro. (Ola U: antes bastaba
 *       "un miembro que nadie redeclara", que acierta en cualquier jerarquía.)
 *   2 = la terna COMPLETA existe pero con fuga: algún hermano redeclara el
 *       esqueleto en vez de heredarlo.
 *   3 = el ancestro no aporta ninguna terna — el nombre ganador salió de
 *       buscar coincidencias entre los hermanos (`bestGroup`), sin apoyo del
 *       ancestro. La confirmación más débil — la que producía el falso
 *       positivo de `deal.rb:67` (familia "ApplicationRecord", cientos de
 *       hermanos sin relación real entre sí, "init_parser" ganador por
 *       conteo de coincidencias, no porque ApplicationRecord lo declare).
 */
type ResolutionTier = 1 | 2 | 3;

/**
 * Elige el candidato a "esqueleto" sobre una `GraphFamily` ya confirmada —
 * MISMAS DOS PREGUNTAS, en el mismo orden, que `resolveAstFamily` (ver su
 * docstring para la intención de cada una), leídas de `memberSignatures` +
 * aristas `calls` en vez del árbol:
 *   1. ¿YA HAY UNA PLANTILLA? (`completeTemplateCandidate` sobre
 *      `graphFamilyShape`) — tier 1 sin fuga, tier 2 con fuga.
 *   2. ¿FALTA UNA PLANTILLA? — un nombre que se repite en >=
 *      `MIN_DISTINCT_UNITS` hermanos con firma compatible y que el ancestro
 *      NO declara (tier 3).
 * `null` si ninguna de las dos encuentra nada — sin oportunidad real, ni
 * siquiera con el grafo. El `tier` devuelto es el nivel de confirmación (ver
 * `ResolutionTier`) — R5, para que `resolveDeferredViaGraph` pueda comparar
 * esta `GraphFamily` contra las OTRAS candidatas de
 * `findGraphFamilyCandidates` y quedarse con la mejor.
 */
function resolveGraphFamily(index: Index, family: GraphFamily, repo: RepoUnit | null): { group: SkeletonEntry[]; structuralFacts: StructuralAncestorFacts; tier: ResolutionTier } | null {
  const gi = asGraphIndex(index);
  const siblingIds = family.siblings.map((s) => s.id);
  const shape = graphFamilyShape(index, family.ancestorId, siblingIds);
  const complete = completeTemplateCandidate(shape);

  const ancestorName = family.ancestorNode.symbolPath[family.ancestorNode.symbolPath.length - 1] ?? family.ancestorId;
  // Rango PUNTUAL (`min === max`) a partir de la aridad cruda del grafo — ver
  // "ARIDAD COMPATIBLE": sin AST vivo acá (grafo real, árbol liberado) no hay
  // forma de saber si algún parámetro es opcional, así que el caso más
  // ESTRICTO (match exacto) es el único honesto, nunca el más permisivo.
  const pointRange = (arity: number | null): { min: number; max: number } | null => (arity === null ? null : { min: arity, max: arity });
  // OLA AO (AO4) — el cuerpo de cada declaración, de `repo.clones`. Ver
  // "EL CUERPO DE UN MIEMBRO QUE VIVE EN OTRO ARCHIVO" más arriba. Sin `repo`
  // (llamada de test con contexto degradado) el campo queda ausente y todo se
  // comporta exactamente como antes.
  const bodyFor = (unitId: string, unitName: string, methodName: string): readonly string[] => {
    if (!repo) return [];
    const memberId = memberNodeId(index, unitId, methodName);
    return bodySequenceFromClones(repo, unitName, methodName, memberId ? (index.nodeById.get(memberId) ?? null) : null);
  };
  const entriesFor = (methodName: string, arityRange: { min: number; max: number } | null, returnType: string | undefined): SkeletonEntry[] =>
    family.siblings.map((s) => ({
      location: {
        file: s.file,
        startLine: s.startLine ?? 1,
        endLine: s.endLine ?? s.startLine ?? 1,
        // R5 (integración de la Ola D) — el `symbol` nombra lo que ESTE span
        // realmente es. `family.siblings` son nodos `class-like` del grafo,
        // así que `startLine`/`endLine` son el span de la UNIDAD (p.ej.
        // `deal.rb:23-1098`, la clase entera), nunca el del método: poner
        // acá `methodName` mandaba al usuario a mil líneas de clase rotuladas
        // con un método que en esa unidad NO está declarado (el caso
        // `ya-aplicado` es precisamente ése — el método vive en el ancestro).
        // El nombre del método sigue estando, y bien ubicado, en el `role`.
        symbol: s.symbolPath[s.symbolPath.length - 1] ?? s.symbolPath.join("."),
        role: `hereda (o debería heredar, sin bypasear) el esqueleto "${methodName}" de "${ancestorName}" (familia confirmada vía el grafo, \`extends\`/\`mixes-in\`)`,
      },
      unitName: s.symbolPath.join("."),
      methodName,
      calledNamesSequence: [],
      clone: null,
      unitSymbolId: s.id,
      arityRange,
      ...(returnType !== undefined ? { returnType } : {}),
      bodySequence: bodyFor(s.id, s.symbolPath.join("."), methodName),
    }));

  if (complete) {
    const group = entriesFor(complete.skeleton.name, pointRange(complete.skeleton.arity), complete.skeleton.returnType);
    const facts = structuralAncestorFacts(index, group, complete.skeleton.name);
    return facts ? { group, structuralFacts: facts, tier: complete.leaked ? 2 : 1 } : null;
  }

  // El ancestro no tiene ninguna plantilla — buscar el PROBLEMA: un nombre que
  // se repita entre los hermanos sin vivir en la base (mismo caso PARCIAL que
  // `entriesFromAstFamily`/`bestGroup` ya resuelve para el camino AST, con el
  // mismo filtro `ownedByAncestor`: sobre un nombre que el ancestro YA declara
  // la mitigación "subilo al ancestro" no existe).
  const ownedByAncestor = new Set(shape.ancestorMembers.map((m) => m.name));
  const allEntries: SkeletonEntry[] = [];
  for (const s of family.siblings) {
    for (const m of ownMembers(index, s.id)) {
      if (ownedByAncestor.has(m.name)) continue;
      allEntries.push({
        location: {
          file: s.file,
          startLine: s.startLine ?? 1,
          endLine: s.endLine ?? s.startLine ?? 1,
          // Mismo criterio que `entriesFor` (ver su nota): el span es el de la
          // UNIDAD, así que el `symbol` la nombra a ella y el `role` dice qué
          // método de ella es el candidato. Acá la unidad SÍ declara ese
          // método (sale de `memberSignatures(gi, s.id)`, sus propios
          // miembros) — a diferencia del caso `ya-aplicado` de `entriesFor`.
          symbol: s.symbolPath[s.symbolPath.length - 1] ?? s.symbolPath.join("."),
          role: `declara "${m.name}", método candidato a esqueleto (familia confirmada vía el grafo, \`extends\`/\`mixes-in\`; ancestro "${ancestorName}")`,
        },
        unitName: s.symbolPath.join("."),
        methodName: m.name,
        calledNamesSequence: [],
        clone: null,
        unitSymbolId: s.id,
        arityRange: pointRange(m.arity),
        ...(m.returnType !== undefined ? { returnType: m.returnType } : {}),
        bodySequence: bodyFor(s.id, s.symbolPath.join("."), m.name),
      });
    }
  }
  const winning = bestGroup(allEntries);
  if (!winning) return null;
  const facts = structuralAncestorFacts(index, winning.group, winning.group[0]!.methodName);
  return facts ? { group: [...winning.group], structuralFacts: facts, tier: 3 } : null;
}

const hasNamedSkeletonEntries: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "has-named-skeleton-entries",
  describe: `Al menos una copia resuelve a un método NOMBRADO (nunca anónimo) con datos suficientes (secuencia >= ${MIN_SEQUENCE_LEN} llamadas, o un símbolo de método en el grafo para el ancla parallel-hierarchies).`,
  run(problem) {
    if (problem.entries.length > 0) {
      const detail = problem.entries.map((e) => `${e.unitName}.${e.methodName}`).join(", ");
      return { holds: true, evidence: `${problem.entries.length}/${problem.totalLocations} copias resueltas: ${detail}.` };
    }
    return {
      holds: false,
      evidence:
        problem.anchorKind === "distributed-duplication"
          ? `Ninguna de las ${problem.totalLocations} copias resolvió a un CloneCandidate con nombre de método real, o todas quedaron bajo ${MIN_SEQUENCE_LEN} llamadas.`
          : "Ancla parallel-hierarchies: sin grafo en esta corrida, o ninguna raíz de familia expone un símbolo de método en él.",
    };
  },
};

const sameNameDistinctUnitsGroup: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "same-name-distinct-units-similar-sequence",
  describe: `Mismo nombre de método en >= ${MIN_DISTINCT_UNITS} unidades DISTINTAS, con secuencia de llamadas similar (Jaccard >= ${MIN_SIMILARITY} cuando hay datos de cuerpo).`,
  run(problem) {
    if (!problem.winningGroup) {
      return { holds: false, evidence: "Ningún nombre de método se repite en >= 2 unidades distintas con suficiente similitud." };
    }
    const units = [...new Set(problem.winningGroup.map((e) => e.unitName))];
    return {
      holds: true,
      evidence: `"${problem.winningGroup[0]!.methodName}" definido en ${units.length} unidades distintas: ${units.join(", ")}.`,
    };
  },
};

const ruleOfThreeUnits: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "rule-of-three-units",
  describe: "El grupo ganador tiene >= 3 unidades distintas (regla de tres: dos ya podrían ser coincidencia).",
  run(problem) {
    const n = problem.winningGroup ? new Set(problem.winningGroup.map((e) => e.unitName)).size : 0;
    return { holds: n >= 3, evidence: `${n} unidades distintas.` };
  },
};

const highAverageSimilarity: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "high-average-similarity",
  describe: `Similitud promedio de secuencia de llamadas >= ${HIGH_SIMILARITY} entre las copias del grupo ganador (cuando hay datos de cuerpo).`,
  run(problem) {
    if (problem.winningAvgSimilarity === null) {
      return { holds: false, evidence: "Sin datos de secuencia de llamadas para medir similitud (típico del ancla parallel-hierarchies)." };
    }
    return { holds: problem.winningAvgSimilarity >= HIGH_SIMILARITY, evidence: `Similitud promedio: ${problem.winningAvgSimilarity.toFixed(2)}.` };
  },
};

const anchorIsDistributedDuplication: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "anchor-is-distributed-duplication",
  describe: "El ancla es distributed-duplication (código realmente duplicado, sin conexión entre archivos) en vez de parallel-hierarchies (forma inferida, sin duplicación de código confirmada).",
  run(problem) {
    return { holds: problem.anchorKind === "distributed-duplication", evidence: `Ancla: ${problem.anchorKind}.` };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * OLA AM · FRENTE AM1 — LAS DOS CONDICIONES DEL ANCLA `large-class`
 *
 * EL HECHO DE PARTIDA, MEDIDO SOBRE EL VOLCADO DE LOS 21 REPOS (25-08-2026):
 * **las 28 recomendaciones de `large-class` de las 13 bibliotecas y las 11 de
 * las 8 aplicaciones salen TODAS del camino de GRAFO** (`resolveGraphFamily`,
 * vía `buildFromGraphRootFamily`/`resolveDeferredViaGraph`), donde el grupo se
 * arma con `memberSignatures` — **nombre + aridad, sin una sola llamada de
 * cuerpo** (`calledNamesSequence: []`, escrito ahí mismo). Por eso, en esas 39
 * propuestas, `winningAvgSimilarity` es `null` por construcción y el
 * discriminador `highAverageSimilarity` contesta *"Sin datos de secuencia de
 * llamadas"* en **39 de 39**: es una prueba que ese camino **no puede pasar**.
 * Precisión medida de la celda: **0/27 en bibliotecas** contra un techo de
 * nivel 1 de **24/24 = 100 %** — el ancla acierta siempre y la celda nunca.
 *
 * LAS DOS CONDICIONES DE ABAJO NO PREGUNTAN POR LA INTENCIÓN DEL PATRÓN (lo
 * que la Ola AK midió que mata verdaderas): preguntan por la FORMA — la
 * identidad de la unidad señalada contra las unidades del grupo, y cuántas
 * copias hay cuando no hay NINGÚN dato de cuerpo. Las dos están acotadas a
 * `large-class` por la MISMA razón que AK6 ya escribió en este archivo:
 * en `inheritance-family`/`refused-bequest` el ancla YA confirmó una familia
 * de herencia, y en `large-class` el único hecho verificado es que la clase
 * tiene muchos miembros.
 *
 * MEDIDO CONTRA EL BANCO ENTERO, y por eso están acotadas: la versión SIN
 * acotar de la segunda (todas las anclas) silencia 5 falsas y 14 propuestas
 * sin juzgar más en bibliotecas — **las 14 las juzgué yo abriendo el archivo
 * real y DOS son VERDADERAS** (`sqlalchemy orm/bulk_persistence.py:1460 ·
 * create_for_statement` y `:665 · orm_pre_session_exec`, dos esqueletos
 * repetidos verbatim entre hermanos). Por la regla ① de la ola se publica el
 * número y se descarta la versión sin acotar. Ver `ola-am/informes/AM1.md`.
 * ──────────────────────────────────────────────────────────────────────── */

/** El último segmento de un `symbolPath` serializado con puntos ("a.b.C" →
 *  "C"). `SkeletonEntry.unitName` guarda el camino COMPLETO en el camino de
 *  grafo (`s.symbolPath.join(".")`) y el nombre pelado en el camino AST,
 *  mientras que `Finding.locations[0].symbol` siempre trae el último segmento:
 *  comparar sin normalizar haría fallar la comparación por la gramática, no
 *  por el hecho. */
function lastSymbolSegment(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? name : name.slice(i + 1);
}

/** Las unidades DISTINTAS de un grupo ganador, por su último segmento. */
function distinctUnitSegments(group: readonly SkeletonEntry[]): string[] {
  return [...new Set(group.map((e) => lastSymbolSegment(e.unitName)))];
}

/**
 * `true` cuando esta hipótesis afirma **la mitigación** —*"retirá el esqueleto
 * de las copias y subilo al ancestro"*— y no un hecho ya consumado.
 *
 * ES EL MISMO HECHO QUE DECIDE EL ESTADO, no uno nuevo:
 * `stateFromFacts` bifurca en `!facts.skeletonDeclaredInAncestor` y ésa es
 * exactamente la rama que produce `ausente`/`parcial` (las dos
 * RECOMENDACIONES); la otra produce `ya-aplicado`/`aplicado-eludido`, donde no
 * hay nada que subir y por lo tanto ninguna unidad gana ni pierde miembros.
 * Las dos condiciones de esta ola describen la MITIGACIÓN, así que fuera de
 * esa rama no tienen nada que decir y se declaran cumplidas.
 *
 * Sin `structuralFacts` no hay ancestro confirmado y tampoco hay mitigación
 * que describir: se declara cumplida, que es la opción MONÓTONA (no puede
 * hacer desaparecer nada que hoy exista por este camino).
 */
function esLaMitigacionDeSubirElEsqueleto(problem: TemplateMethodProblem): boolean {
  return problem.structuralFacts !== null && !problem.structuralFacts.skeletonDeclaredInAncestor;
}

/**
 * QUÉ INTENCIÓN VERIFICA: **la propuesta tiene que tocar la unidad que el
 * ancla señala.**
 *
 * `large-class` señala UNA unidad y dice de ella una sola cosa: *"concentra N
 * miembros"*. La mitigación de Template Method es **retirar** el esqueleto de
 * las copias y **subirlo** al ancestro común. Eso alivia a la unidad señalada
 * si y sólo si esa unidad es **una de las copias**.
 *
 * QUÉ NO RECONOCE, y es el caso que esta condición existe para callar: si la
 * unidad señalada es el **ANCESTRO**, la mitigación le **agrega** un miembro —
 * la propuesta no resuelve el problema anclado, lo empeora. Si no es ni el
 * ancestro ni una de las copias, no la toca en absoluto.
 *
 * Para toda otra ancla la condición se declara cumplida y se dice por qué: las
 * demás no hablan del TAMAÑO de una unidad, así que "subir al ancestro" no
 * contradice nada de lo que afirman.
 */
const anchoredUnitIsOneOfTheCopies: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "la-unidad-del-ancla-es-una-de-las-copias",
  describe: `Cuando el ancla es \`${LARGE_CLASS_ANCHOR_KIND}\` —la única que señala UNA unidad por su TAMAÑO— esa unidad tiene que ser una de las copias de las que el esqueleto se retira: subirlo al ancestro no le quita ningún miembro a una unidad que no lo declara, y si la unidad señalada ES el ancestro, se lo agrega.`,
  run(problem) {
    if (problem.anchorKind !== LARGE_CLASS_ANCHOR_KIND) {
      return {
        holds: true,
        evidence: `El ancla es "${problem.anchorKind}", que no afirma nada sobre el TAMAÑO de una unidad: subir el esqueleto al ancestro no contradice lo que ese ancla dice, así que esta condición no la restringe.`,
      };
    }
    if (!esLaMitigacionDeSubirElEsqueleto(problem)) {
      return {
        holds: true,
        evidence: `El ancestro YA declara "${problem.structuralFacts?.skeletonName ?? "el esqueleto"}": esta hipótesis no propone subir nada, así que no le agrega ni le quita miembros a ninguna unidad.`,
      };
    }
    const anchored = problem.finding.locations[0]?.symbol;
    const group = problem.winningGroup ?? [];
    if (!anchored || group.length === 0) {
      return {
        holds: false,
        evidence: !anchored
          ? "El hallazgo-ancla no nombra ninguna unidad en su primera ubicación, así que no hay forma de decir si la propuesta la toca."
          : "No hay grupo ganador contra el que comparar la unidad del ancla.",
      };
    }
    const units = distinctUnitSegments(group);
    const method = group[0]!.methodName;
    if (units.includes(lastSymbolSegment(anchored))) {
      return {
        holds: true,
        evidence: `"${anchored}" es una de las ${units.length} unidades que declaran "${method}": retirar ese miembro es exactamente lo que el ancla pide.`,
      };
    }
    return {
      holds: false,
      evidence: `"${anchored}" no está entre las unidades que declaran "${method}" (${units.join(", ")}): subir el esqueleto al ancestro no le quita ningún miembro — y si "${anchored}" es ese ancestro, se lo agrega.`,
    };
  },
};

/** Ola AM (AM1) — el umbral de ESCALA cuando el grupo ganador no trae UNA SOLA
 *  llamada de cuerpo. **No es un número nuevo**: es el mismo 3 que
 *  `ruleOfThreeUnits` ya declara en este archivo (*"dos ya podrían ser
 *  coincidencia"*), aplicado como condición de entrada en el único caso donde
 *  no hay absolutamente nada más que lo compense. `MIN_DISTINCT_UNITS` no se
 *  toca. */
const MIN_DISTINCT_UNITS_SIN_CUERPO = 3;

/**
 * QUÉ INTENCIÓN VERIFICA: **sin ningún dato de cuerpo, dos copias no
 * distinguen una plantilla de una casualidad.**
 *
 * Cuando ninguna entrada del grupo ganador trae su secuencia de llamadas
 * (`calledNamesSequence` vacía en todas — el caso del camino de grafo, que
 * arma el grupo con `memberSignatures`), la única evidencia que sostiene la
 * propuesta es *"≥2 unidades declaran un miembro con el mismo nombre y aridad
 * compatible"*: `bestGroup` no puede medir similitud (su `avgSimilarity` sale
 * `null`) y `highAverageSimilarity` no puede confirmarse. El propio módulo ya
 * había escrito el umbral para eso —`ruleOfThreeUnits`— pero como
 * DISCRIMINADOR, que no bloquea nada.
 *
 * QUÉ NO RECONOCE: cualquier grupo con al menos una secuencia de cuerpo — ahí
 * `MIN_DISTINCT_UNITS = 2` sigue intacto, porque la similitud de secuencias es
 * la que paga.
 *
 * ACOTADA A `large-class` — y el número que lo decidió está arriba: sin acotar
 * cuesta DOS propuestas VERDADERAS de `inheritance-family` en bibliotecas.
 */
const bodilessGroupNeedsThreeUnits: Check<TemplateMethodProblem, TemplateMethodGraph> = {
  id: "grupo-sin-cuerpo-exige-tres-unidades",
  describe: `Cuando el ancla es \`${LARGE_CLASS_ANCHOR_KIND}\` y NINGUNA copia del grupo ganador trae la secuencia de llamadas de su cuerpo, el nombre tiene que repetirse en >= ${MIN_DISTINCT_UNITS_SIN_CUERPO} unidades distintas (el mismo umbral que \`rule-of-three-units\` declara); con datos de cuerpo alcanzan ${MIN_DISTINCT_UNITS}, porque ahí la similitud de secuencias es la que paga.`,
  run(problem) {
    if (problem.anchorKind !== LARGE_CLASS_ANCHOR_KIND) {
      return {
        holds: true,
        evidence: `El ancla es "${problem.anchorKind}": ella misma aporta un hecho verificado sobre la familia, así que la escala del grupo no es la única evidencia y esta condición no la restringe.`,
      };
    }
    if (!esLaMitigacionDeSubirElEsqueleto(problem)) {
      return {
        holds: true,
        evidence: `El ancestro YA declara "${problem.structuralFacts?.skeletonName ?? "el esqueleto"}": la afirmación no es "faltan copias que justifiquen subirlo", así que esta condición de escala no la restringe.`,
      };
    }
    const group = problem.winningGroup ?? [];
    if (group.length === 0) return { holds: false, evidence: "No hay grupo ganador cuya escala medir." };
    // OLA AO (AO4): `bodySequence` cuenta como dato de cuerpo igual que
    // `calledNamesSequence` — es la MISMA secuencia de llamadas, leída de
    // `repo.clones` en vez del árbol, para las copias que viven en otro
    // archivo. La condición que este check escribe —*"con datos de cuerpo
    // alcanzan MIN_DISTINCT_UNITS"*— no dice de dónde tiene que salir el dato.
    const conCuerpo = group.filter((e) => e.calledNamesSequence.length > 0 || (e.bodySequence?.length ?? 0) > 0).length;
    if (conCuerpo > 0) {
      return {
        holds: true,
        evidence: `${conCuerpo}/${group.length} copias traen la secuencia de llamadas de su cuerpo: la similitud es medible y ${MIN_DISTINCT_UNITS} unidades alcanzan.`,
      };
    }
    const units = distinctUnitSegments(group);
    const method = group[0]!.methodName;
    if (units.length >= MIN_DISTINCT_UNITS_SIN_CUERPO) {
      return {
        holds: true,
        evidence: `Ninguna copia trae cuerpo, pero "${method}" se repite en ${units.length} unidades distintas (>= ${MIN_DISTINCT_UNITS_SIN_CUERPO}): ${units.join(", ")}.`,
      };
    }
    return {
      holds: false,
      evidence: `Ninguna de las ${group.length} copias trae la secuencia de llamadas de su cuerpo y "${method}" sólo aparece en ${units.length} unidad(es) distinta(s) (${units.join(", ")}): dos declaraciones homónimas y cero evidencia de cuerpo describen igual de bien una plantilla que una coincidencia de nombre.`,
    };
  },
};

// R5 (esta tarea): renombrado desde "...-via-extends" — la relación puede ser
// `extends` O `mixes-in` ahora (`StructuralAncestorFacts.ancestorRelation`,
// `ancestorRelationLabel`); ningún test depende del string exacto (verificado
// por grep antes de este cambio).
const ANCESTOR_LABEL = "subtipos-comparten-un-ancestro-comun";

/**
 * Dado un `StructuralAncestorFacts` YA no-nulo (ancestro confirmado, venga
 * de grafo — `distributed-duplication` — o de AST same-file — `large-class`/
 * `refused-bequest`), decide el resto de la escalera: esqueleto en la base,
 * redeclaración, gancho. Extraído de `appliedState` para que ambos caminos
 * de entrada compartan EXACTAMENTE la misma lógica de aquí en más — sólo
 * cambia CÓMO se llega a `facts`, nunca qué se hace con él.
 */
function stateFromFacts(group: readonly SkeletonEntry[], facts: StructuralAncestorFacts): AppliedStateResult {
  const ancestorCheck = {
    label: ANCESTOR_LABEL,
    passed: true,
    why: `Las ${new Set(group.map((e) => e.unitName)).size} unidades están emparentadas ("${ancestorRelationLabel(facts.ancestorRelation)}") con "${facts.ancestorName}".`,
    role: "applied" as const,
  };

  if (!facts.skeletonDeclaredInAncestor) {
    /**
     * ══ OLA AF, FRENTE AF5 — **EL CAMINO QUE FALTABA: `ausente`.** ══════════
     *
     * QUÉ ERA IMPOSIBLE, MEDIDO ANTES DE TOCAR NADA. Las cuatro celdas de
     * Template Method (`homonymous-divergent-sequence`, `large-class`,
     * `inheritance-family`, `refused-bequest`) tenían `ausente = 0` sobre 284
     * hipótesis vivas (165 en los 13 repos + 119 en `corpus-app/`), y no por
     * falta de población: por CONSTRUCCIÓN. Las cuatro fuentes de `ausente`
     * del patrón estaban las cuatro muertas para ellas —
     *   · `engine.ts:159` (`needs`) y `:165` (`needsEdges`): este spec declara
     *     `needs: []` y no declara `needsEdges`;
     *   · `appliedState` con `!winningGroup`: el `required`
     *     `same-name-distinct-units-similar-sequence` (`:2002`) falla primero
     *     y `engine.build` devuelve `null` — la hipótesis ni nace;
     *   · `appliedState` con `!structuralFacts` en la rama ESTRUCTURAL
     *     (`:2281` del árbol de apertura): `resolveAstFamily` devuelve
     *     `structuralFacts` NO nulo siempre que devuelve `winningGroup` no
     *     nulo, así que esa rama es código muerto;
     *   · y la rama del ancla-fuerza contesta `parcial` por diseño.
     * — de modo que `stateFromFacts` era la ÚNICA fuente de estado, y
     * `stateFromFacts` no tenía ni una salida `ausente`. **ESTA ES ESA
     * SALIDA**, y es la primera del patrón que un input real puede recorrer.
     *
     * QUÉ INTENCIÓN VERIFICA EL CHEQUEO NUEVO, y por qué NO es un renombre de
     * `parcial`. Hasta hoy, "el ancestro está confirmado y el esqueleto no
     * vive arriba" caía ENTERO en `parcial` (135 de las 226 recomendaciones
     * de estas celdas: 76 en biblioteca, 59 en aplicación). Adentro de ese
     * bucket conviven dos situaciones que el patrón trata distinto:
     *   · el ancestro **no hospeda NADA del patrón** — ni el esqueleto que el
     *     ancla nombra ni ninguna otra plantilla: no hay nada aplicado, la
     *     recomendación *"acá falta un Template Method"* es literal ⇒
     *     **`ausente`**;
     *   · el ancestro **ya fija un orden y delega un paso** para otro miembro
     *     (gancho redeclarado por TODOS los hermanos e invocado desde el
     *     propio ancestro): la familia ya sabe de plantillas y este miembro
     *     quedó afuera ⇒ **`parcial`**, que es lo que `parcial` significa.
     *
     * LA COMPUERTA DE LEGIBILIDAD, CON SU RAZÓN ESCRITA **ANTES** DE MEDIR.
     * `ausente` afirma *"miré qué declara el ancestro y no está"*. Esa
     * afirmación sólo es un hecho si la lista de declaraciones del ancestro se
     * pudo leer: sobre un ancestro del que se leyeron CERO miembros, "no
     * declara `m`" es indistinguible de "no pude mirar". Ese caso existe y no
     * es raro — lo medí antes de escribir esta rama: **213 de 1.577 ancestros
     * (13,5 %) en biblioteca y 132 de 347 (38,0 %) en aplicación** no exponen
     * ni un miembro (interfaces de TS sin cuerpo, el `Base` declarativo de
     * sqlalchemy, módulos-marcador de Ruby; en aplicación se concentra en
     * Ghost, 113 de 152). Ahí **se conserva el `parcial` de hoy, letra por
     * letra**: se prefiere perder un `ausente` legítimo (un marcador vacío de
     * verdad) antes que afirmar una ausencia que nadie miró.
     *
     * POR QUÉ ES ADITIVO, Y LA PRUEBA ES DE FORMA, NO DE MUESTREO: las dos
     * salidas de esta rama —`ausente` y `parcial`— son **las dos
     * RECOMENDACIÓN** (`ausente`+`parcial`, la definición que usan
     * `w-cobertura-nivel2.mts` y `v-int-precision-nivel2.mts`). Ninguna
     * hipótesis desaparece, ninguna deja de ser recomendación, y ninguna puede
     * caer en `ya-aplicado`/`aplicado-eludido` por este cambio: el conjunto de
     * recomendaciones queda IDÉNTICO id por id. Lo único que cambia es la
     * ETIQUETA de 135 de ellas, y sólo hacia el estado que el hecho sostiene.
     *
     * LOS DOS CHEQUES VIEJOS DE ESTA RAMA NO SE TOCAN: mismo `label`, mismo
     * `passed`, mismo `why`, mismo orden. Los dos nuevos se AGREGAN detrás.
     */
    const ancestorReadableCheck = {
      label: "las-declaraciones-del-ancestro-son-legibles",
      passed: facts.ancestorDeclaredMemberCount > 0,
      why:
        facts.ancestorDeclaredMemberCount > 0
          ? `Se leyeron ${facts.ancestorDeclaredMemberCount} miembro(s) declarado(s) por "${facts.ancestorName}": afirmar que "${facts.skeletonName}" NO está entre ellos es un hecho, no una falta de datos.`
          : `No se pudo leer ni un miembro declarado por "${facts.ancestorName}" (marcador vacío, o un nodo que esta corrida no pobló): "no declara ${facts.skeletonName}" es indistinguible de "no se pudo mirar", así que el estado se queda en \`parcial\` — declarado, no adivinado.`,
      role: "applied" as const,
    };
    const hostsTemplateCheck = {
      label: "el-ancestro-ya-hospeda-una-plantilla-para-otro-miembro",
      passed: facts.ancestorHostsTemplate,
      why: facts.ancestorHostsTemplate
        ? `"${facts.ancestorName}" ya declara al menos un gancho (un miembro que TODOS los hermanos redeclaran) invocado desde otro miembro del propio ancestro: la familia YA tiene una plantilla puesta arriba, y "${facts.skeletonName}" simplemente quedó afuera de ella.`
        : `"${facts.ancestorName}" no declara ningún gancho redeclarado por todos los hermanos e invocado desde el propio ancestro: no hay NADA del patrón puesto arriba, ni para "${facts.skeletonName}" ni para ningún otro miembro.`,
      role: "applied" as const,
    };
    const nadaDelPatronArriba = ancestorReadableCheck.passed && !hostsTemplateCheck.passed;
    return {
      state: nadaDelPatronArriba ? "ausente" : "parcial",
      checks: [
        ancestorCheck,
        {
          label: "el-esqueleto-vive-en-el-ancestro",
          passed: false,
          why: `"${facts.ancestorName}" no declara ningún miembro llamado "${facts.skeletonName}" — cada subtipo lo repite por su cuenta: subirlo al ancestro común es la mitigación exacta.`,
          role: "applied",
        },
        ancestorReadableCheck,
        hostsTemplateCheck,
      ],
    };
  }

  const skeletonCheck = {
    label: "el-esqueleto-vive-en-el-ancestro",
    passed: true,
    why: `"${facts.ancestorName}" ya declara un miembro "${facts.skeletonName}" (aridad ${facts.skeletonArity ?? "?"}) — el esqueleto vive en el ancestro común.`,
    role: "applied" as const,
  };

  const noOverrideCheck = facts.anySubtypeRedeclaresSkeleton
    ? {
        label: "ningun-subtipo-redeclara-el-esqueleto",
        passed: false,
        why: `Al menos un subtipo redeclara "${facts.skeletonName}" con la misma firma en vez de heredarlo de "${facts.ancestorName}" — reimplementa el esqueleto entero, bypaseando al ancestro.`,
        role: "applied" as const,
      }
    : {
        label: "ningun-subtipo-redeclara-el-esqueleto",
        passed: true,
        why: `Ningún subtipo redeclara "${facts.skeletonName}" — todos lo heredan de "${facts.ancestorName}" sin overridearlo.`,
        role: "applied" as const,
      };

  /**
   * QUÉ INTENCIÓN VERIFICA (Ola U, INTENCIÓN 3 — el check que decide, ya no
   * el que sólo informa): "¿lo que vive en el ancestro es un ESQUELETO —un
   * algoritmo que fija el orden y delega un paso variable— o simplemente un
   * método que los subtipos heredan?". Template Method NO es "hay herencia y
   * un método compartido": es "el orden lo fija la base y el paso lo pone el
   * subtipo". Sin un gancho que TODOS los subtipos redeclaren e invocado
   * desde el esqueleto, lo que hay es reuso por herencia, que es otro diseño.
   *
   * ANTES DE ESTA OLA este check existía pero NO decidía nada: el estado ya
   * era `ya-aplicado` con la evidencia de arriba sola ("REQUISITO 3" del
   * docstring viejo). Medido sobre 7 repos: 160 de 162 `ya-aplicado` lo
   * tenían en `passed: false` — es decir, la afirmación "el patrón ya está
   * aplicado" se sostenía casi siempre en la mitad de la evidencia.
   */
  const hookCheck = {
    label: "gancho-redeclarado-por-todos-e-invocado-desde-el-esqueleto",
    passed: facts.hooks.length > 0 && facts.skeletonCallsHook,
    why:
      facts.hooks.length === 0
        ? `"${facts.ancestorName}" no declara ningún otro miembro que TODOS los subtipos redeclaren con la misma firma — no hay ningún PASO VARIABLE que "${facts.skeletonName}" delegue, así que lo que los subtipos comparten es un método heredado, no un esqueleto de algoritmo.`
        : facts.skeletonCallsHook
          ? `"${facts.skeletonName}" invoca ("calls") a al menos uno de los ganchos redeclarados por todos los subtipos: ${facts.hooks.map((h) => h.name).join(", ")}.`
          : `Hay ${facts.hooks.length} candidato(s) a gancho (${facts.hooks.map((h) => h.name).join(", ")}) redeclarados por todos los subtipos, pero "${facts.skeletonName}" no invoca a ninguno dentro de "${facts.ancestorName}" — el orden del algoritmo no está fijado en la base: no es un esqueleto.`,
    role: "applied" as const,
  };

  /**
   * QUÉ INTENCIÓN VERIFICA (OLA AD, FRENTE AD2 — LA TERCERA CONDICIÓN,
   * "RESOLUCIÓN VERIFICADA"): *"lo que este miembro necesita, ¿ya está
   * puesto?"*. Los tres hechos que lo contestan, y los tres juntos:
   *
   *   1. el ancestro DECLARA el miembro (`skeletonCheck`, arriba);
   *   2. otra declaración del ancestro, que se queda FIJA arriba, lo INVOCA
   *      (`skeletonCalledByAncestorMembers`) — el ORDEN del algoritmo ya vive
   *      en el ancestro;
   *   3. algún subtipo lo REDECLARA (`anySubtypeRedeclaresSkeleton`) — los
   *      subtipos ya están poniendo el paso variable.
   *
   * Los tres juntos SON el Template Method: plantilla arriba, gancho
   * declarado arriba, implementación abajo. Contestar `parcial` acá es decir
   * *"subí el esqueleto al ancestro"* sobre un esqueleto que ya está subido:
   * es una RECOMENDACIÓN FALSA donde correspondía una CLASIFICACIÓN.
   *
   * POR QUÉ HACÍA FALTA, MEDIDO (Ola AC, INTEGRADOR §2.4 / AC3 §4.5, y
   * re-medido por AD2 sobre volcados propios): `hooks`/`skeletonCallsHook`
   * sólo saben preguntar *"¿`m` llama a un gancho?"*, así que cuando `m` ES
   * el gancho contestan que no y la escalera cae a `parcial`. **28 de las 60
   * hipótesis del ancla `homonymous-divergent-sequence` caían en esta rama**
   * (25 en los 13 repos, 3 en `corpus-app/`), y AC3 la nombró como el defecto
   * concreto: *"`stateFromFacts` no puede distinguir 'el ancestro declara un
   * gancho abstracto (patrón aplicado)' de 'el ancestro declara un método
   * concreto que todos pisan (patrón ausente)'"*.
   *
   * ESTO NO QUITA PRODUCTO, LO ARREGLA — y la condición es dura: ninguna
   * recomendación juzgada VERDADERA puede cambiar de estado por este check.
   * Verificado por AD2 hipótesis por hipótesis sobre las dos poblaciones
   * (informe `ola-ad/informes/AD2.md`): las 2 verdaderas que estaban en esta
   * rama —`guava ImmutableSet.SetBuilderImpl.build` y
   * `jenkins VirtualFile.isDescendant`— **no tienen ningún miembro del
   * ancestro que las invoque**, así que el check no las toca y siguen siendo
   * recomendaciones.
   *
   * NO ES ANCLAR EN ESTRUCTURA: el ancla sigue detectando la FUERZA sin mirar
   * nada de esto. Lo estructural se lee acá, en la escalera de ESTADO, que es
   * justamente donde el proyecto decide si la resolución está puesta o falta.
   */
  const resolutionAlreadyInAncestorCheck = {
    label: "el-miembro-ya-es-el-paso-variable-de-un-orden-fijado-en-el-ancestro",
    passed: facts.skeletonCalledByAncestorMembers.length > 0 && facts.anySubtypeRedeclaresSkeleton,
    why:
      facts.skeletonCalledByAncestorMembers.length === 0
        ? `Ningún otro miembro de "${facts.ancestorName}" invoca a "${facts.skeletonName}" desde dentro del propio ancestro: el ancestro lo declara, pero no fija ningún orden que lo delegue.`
        : facts.anySubtypeRedeclaresSkeleton
          ? `"${facts.ancestorName}" ya fija el orden y delega este paso: ${facts.skeletonCalledByAncestorMembers.map((n) => `"${n}"`).join(", ")} invoca(n) a "${facts.skeletonName}" desde el propio ancestro, y los subtipos lo redeclaran. Subir el esqueleto al ancestro común YA ESTÁ HECHO: lo que cada subtipo escribe es la implementación del paso variable.`
          : `${facts.skeletonCalledByAncestorMembers.map((n) => `"${n}"`).join(", ")} invoca(n) a "${facts.skeletonName}" dentro de "${facts.ancestorName}", pero ningún subtipo lo redeclara: no hay paso variable puesto abajo.`,
    role: "applied" as const,
  };

  if (!hookCheck.passed && resolutionAlreadyInAncestorCheck.passed) {
    // El miembro que el ancla nombra es el GANCHO de una plantilla que ya
    // existe. Es una CONFIRMACIÓN, no una oportunidad: `ya-aplicado` y nunca
    // `aplicado-eludido`, porque acá que los subtipos redeclaren el miembro no
    // es una fuga —es exactamente lo que el patrón les pide—. La fuga sigue
    // siendo lo que decide `noOverrideCheck` cuando el miembro es el ESQUELETO
    // (rama de abajo), no cuando es el gancho.
    return { state: "ya-aplicado", checks: [ancestorCheck, skeletonCheck, noOverrideCheck, hookCheck, resolutionAlreadyInAncestorCheck] };
  }

  if (!hookCheck.passed) {
    // El ancestro declara el método, pero no hay plantilla: sin paso variable
    // delegado, lo que comparten los subtipos es un método heredado. Se
    // contesta `parcial` —una forma A MEDIAS: la familia y el método común ya
    // están, falta el paso variable— y NUNCA `ya-aplicado`/`aplicado-eludido`,
    // que afirmarían un patrón que la evidencia no muestra. Por el camino de
    // las anclas ESTRUCTURALES este caso ni siquiera llega acá:
    // `resolveAstFamily`/`resolveGraphFamily` sólo eligen un miembro del
    // ancestro como esqueleto cuando la terna está confirmada, así que un
    // método heredado sin gancho no produce hipótesis (silencio). Queda
    // alcanzable por `distributed-duplication`, donde el nombre lo impone el
    // ancla y la duplicación ya está probada por los clones — ahí SÍ hay algo
    // que recomendar aunque el ancestro no tenga plantilla.
    //
    // OLA AD (AD2): el check inverso viaja TAMBIÉN acá, con su `passed: false`
    // y su razón. Publicar la evidencia NEGATIVA es lo que hace medible desde
    // afuera cuántas veces la pregunta se hizo y contestó que no — sin esto,
    // "no hay plantilla arriba" y "nadie la buscó" salen iguales en el volcado.
    return { state: "parcial", checks: [ancestorCheck, skeletonCheck, noOverrideCheck, hookCheck, resolutionAlreadyInAncestorCheck] };
  }

  // Terna COMPLETA confirmada. Con fuga (algún subtipo reimplementa el
  // esqueleto) es `aplicado-eludido`; sin fuga, `ya-aplicado`.
  const state = facts.anySubtypeRedeclaresSkeleton ? "aplicado-eludido" : "ya-aplicado";
  return { state, checks: [ancestorCheck, skeletonCheck, noOverrideCheck, hookCheck] };
}

/** EL EXCLUDER — ver "LAS TRES FORMAS" en el docstring del módulo. Reemplaza
 *  enteramente a `CloneCandidate.superclassName` + `DELEGATION_PATTERN` por
 *  `extends` + `memberSignatures` + `calls` (CONTRATO-F10.md §2/§3), o —
 *  para las dos anclas ESTRUCTURALES nuevas— por su equivalente de AST
 *  same-file (`astStructuralAncestorFacts`). */
function appliedState(problem: TemplateMethodProblem, graph: TemplateMethodGraph): AppliedStateResult {
  if (!problem.winningGroup) {
    return {
      state: "ausente",
      checks: [{ label: ANCESTOR_LABEL, passed: false, why: "Sin grupo ganador que evaluar.", role: "applied" }],
    };
  }

  if (problem.anchorKind === "parallel-hierarchies") {
    // Por construcción del propio detector, las familias NO comparten
    // ningún ancestro — es literalmente el criterio que las hace
    // "paralelas". El excluder de ancestro común es estructuralmente
    // inaplicable, no "no confirmado".
    return {
      state: "ausente",
      checks: [
        {
          label: ANCESTOR_LABEL,
          passed: false,
          why: "Ancla parallel-hierarchies: por construcción del propio detector, estas familias NO comparten ningún ancestro — el excluder de ancestro común vía `extends`/`mixes-in` es estructuralmente inaplicable acá.",
          role: "applied",
        },
      ],
    };
  }

  if (problem.anchorKind === SEQUENCE_ANCHOR_KIND) {
    // OLA AC (AC3) — el ancla-fuerza. La escalera que decide si la RESOLUCIÓN
    // está ausente es EXACTAMENTE la misma (`stateFromFacts`, sin cambios):
    // el ancla confirmó la fuerza, no el estado del patrón. Sin ancestro
    // resoluble (pasada 1, sin grafo todavía) se contesta `parcial` y se
    // declara por qué — nunca `ausente`, que afirmaría haber mirado el
    // ancestro y no haberlo encontrado.
    if (!problem.structuralFacts) {
      return {
        state: "parcial",
        checks: [
          {
            label: ANCESTOR_LABEL,
            passed: false,
            why: `Las ${new Set(problem.winningGroup.map((e) => e.unitName)).size} unidades declaran el mismo ancestro (el ancla lo confirmó por \`extends\`/\`mixes-in\` o por la superclase escrita), pero en esta pasada no hay grafo para resolver ese ancestro a un nodo y preguntarle qué declara: la secuencia repetida está confirmada, dónde debería vivir el esqueleto no. Declarado, no adivinado.`,
            role: "applied",
          },
        ],
      };
    }
    return stateFromFacts(problem.winningGroup, problem.structuralFacts);
  }

  if (STRUCTURAL_ANCHOR_KINDS.has(problem.anchorKind)) {
    // large-class/refused-bequest: `problem.structuralFacts` ya se calculó
    // por AST same-file en `buildFromStructuralAnchor` (nunca por grafo —
    // `repo.graph` es `null` en esta llamada de producción, ver el
    // docstring del módulo). Sin familia de hermanos con base resoluble en
    // este archivo, no hay ancestro que confirmar.
    if (!problem.structuralFacts) {
      return {
        state: "ausente",
        checks: [
          {
            label: ANCESTOR_LABEL,
            passed: false,
            why: `Las ${new Set(problem.winningGroup.map((e) => e.unitName)).size} unidades no tienen un ancestro común confirmado por AST en este mismo archivo (la base no está definida en este archivo, o ninguna coincide — misma limitación cross-file que declara refused-bequest.ts).`,
            role: "applied",
          },
        ],
      };
    }
    return stateFromFacts(problem.winningGroup, problem.structuralFacts);
  }

  // anchorKind === "distributed-duplication" — comportamiento SIN CAMBIOS.
  if (!graph) {
    if (!problem.hasInheritanceCapability) {
      // El lenguaje del problema no tiene herencia de implementación (p.ej.
      // Go): NUNCA va a existir una arista `extends` que buscar, con o sin
      // grafo — la ausencia es estructural, no una limitación de esta
      // corrida (a diferencia de la rama de abajo).
      return {
        state: "ausente",
        checks: [
          {
            label: ANCESTOR_LABEL,
            passed: false,
            why: "El lenguaje de este problema no declara la capacidad 'herencia': no hay `extends` de implementación que un ancestro común pueda usar en ningún caso.",
            role: "applied",
          },
        ],
      };
    }
    return {
      state: "parcial",
      checks: [
        {
          label: ANCESTOR_LABEL,
          passed: false,
          why: "Sin grafo en esta corrida: no se puede confirmar estructuralmente (vía `extends`/`mixes-in`) si las unidades comparten un ancestro común. Declarado, no adivinado.",
          role: "applied",
        },
      ],
    };
  }

  const group = problem.winningGroup;
  const facts = problem.structuralFacts;
  if (!facts) {
    return {
      state: "ausente",
      checks: [
        {
          label: ANCESTOR_LABEL,
          passed: false,
          why: `Las ${new Set(group.map((e) => e.unitName)).size} unidades no tienen un ancestro común confirmado vía \`extends\`/\`mixes-in\` (falta el nodo de clase de alguna en el grafo, o ninguno de sus destinos coincide entre todas).`,
          role: "applied",
        },
      ],
    };
  }

  return stateFromFacts(group, facts);
}

/**
 * Ola 11a (P2) — CONSUMO de `ctx.neighborhood` (registro de pendientes, "El
 * vecindario: cableado y verificado en producción, leído por 1 de 17
 * hipótesis" — antes de esta ola, `template-method.ts` no lo leía NUNCA).
 * `distributed-duplication`/`parallel-hierarchies` son `inter-file`: su
 * ÚNICA llamada de producción (`code-analyzer.ts:1930`, dentro de
 * `crossAnalyze`) ya pasa el `neighborhoodIndex` REAL a `attachHypotheses`
 * — así que para esas dos anclas, `ctx.neighborhood` YA es real DENTRO de
 * `build()`, sin necesitar `refresh()` (a diferencia de `strategy.ts`/
 * `decorator.ts`, cuyas anclas son intra-function/intra-file). Las tres
 * anclas ESTRUCTURALES (`large-class`/`refused-bequest`/
 * `inheritance-family`) SÍ son intra-file (`ctx.neighborhood` es
 * `EMPTY_NEIGHBORHOOD` en su única llamada de `build()`,
 * `code-analyzer.ts:1611`) — para ellas, `refresh()` (más abajo,
 * `hypotheses/run.ts#refreshHypotheses` desde `crossAnalyze`) recalcula
 * este mismo discriminador con el vecindario real.
 */
const RECURRENCE_ANCHOR_KINDS: readonly string[] = ["distributed-duplication", "parallel-hierarchies", "large-class", "refused-bequest", "inheritance-family", "homonymous-divergent-sequence"];

function crossFileFamilyRecurrenceDiscriminator(ctx: HypothesisContext): Check<TemplateMethodProblem, TemplateMethodGraph> {
  return {
    id: "familia-similar-en-otro-archivo",
    describe:
      "Otro archivo del repo (vía ctx.neighborhood.findingsOfKind) también ancla un candidato a Template Method — evidencia de que la forma se repite en el repo, no un caso aislado",
    run(problem) {
      const ownFile = problem.finding.locations[0]?.file;
      if (!ownFile) {
        return { holds: false, evidence: "sin archivo propio (finding.locations[0]) que excluir de la búsqueda en el vecindario." };
      }
      for (const kind of RECURRENCE_ANCHOR_KINDS) {
        const other = ctx.neighborhood.findingsOfKind(kind).find((f) => f.locations.some((l) => l.file !== ownFile));
        if (other) {
          return {
            holds: true,
            evidence: `el vecindario confirma otro candidato a Template Method (kind: "${kind}") en "${other.locations[0]!.file}" — la forma se repite en el repo, no es un caso aislado.`,
          };
        }
      }
      return {
        holds: false,
        evidence: "ningún otro archivo visible por ctx.neighborhood.findingsOfKind ancla un candidato similar (o el vecindario está vacío en esta pasada).",
      };
    },
  };
}

function buildSpec(ctx: HypothesisContext): HypothesisSpec<TemplateMethodProblem, TemplateMethodGraph> {
  return {
    pattern: "Template Method",
    ceiling: "alta", // mismo techo que la regla vieja (línea 679); PROVISIONAL (K2)
    needs: [], // agnóstico de lenguaje — ver "FORMA EN LENGUAJES SIN CLASES"
    // Ola AM (AM1) — las dos condiciones nuevas van al FINAL y las dos son
    // vacuas fuera de `large-class` (ver sus docstrings): ninguna hipótesis de
    // las otras cinco anclas puede cambiar por esto.
    required: [hasNamedSkeletonEntries, sameNameDistinctUnitsGroup, anchoredUnitIsOneOfTheCopies, bodilessGroupNeedsThreeUnits],
    discriminators: [ruleOfThreeUnits, highAverageSimilarity, anchorIsDistributedDuplication, crossFileFamilyRecurrenceDiscriminator(ctx)],
    appliedState,
    toConfirm: [
      "¿El algoritmo es genuinamente el mismo (mismo propósito) y sólo varía un paso, o son algoritmos distintos que casualmente comparten un nombre de método genérico (initialize/process/run) y, por casualidad, nombres de llamada igual de genéricos?",
      "¿La mitigación real acá es una superclase con método abstracto, o alcanza con extraer el paso variable a un bloque/callback/función inyectada (la forma idiomática en Ruby/Python/JS/Go)?",
      "Si el estado es `ya-aplicado` sin el check de gancho confirmado (ver `why`): ¿el método compartido en el ancestro realmente orquesta pasos variables, o es sólo una coincidencia de nombre sin forma de plantilla?",
      "Si el ancla es parallel-hierarchies: esta migración NO tiene datos de cuerpo de método para esa ancla (sólo nombres, vía el grafo) — confirmar a mano que las implementaciones se parecen de verdad, no sólo el nombre.",
    ],
    source: "https://refactoring.guru/es/design-patterns/template-method",
  };
}

/** Ver "EXCLUDER..."/"FORMA EN LENGUAJES SIN CLASES": el costo depende de si
 *  el lenguaje del problema tiene herencia de implementación — nunca un
 *  texto fijo. */
function costFor(ctx: HypothesisContext): string {
  return ctx.capabilities.has("herencia")
    ? "Una superclase con el esqueleto y métodos abstractos/overridable por paso variable — se justifica si el esqueleto va a seguir compartiéndose entre unidades relacionadas; si sólo hay 2 copias y no va a crecer, Extract Method sin la jerarquía puede alcanzar."
    : "Sin herencia de implementación en este lenguaje: la mitigación idiomática es extraer el paso variable a una función/bloque de orden superior (closure en Ruby/JS, un parámetro invocable en Go) y dejar el esqueleto en una única función, no una jerarquía de clases.";
}

/** `CloneCandidate` no trae aridad (es texto normalizado del CUERPO, nunca
 *  la firma) — cuando hay grafo Y `unitSymbolId` resuelve, la aridad cruda
 *  sale de `memberSignatures` (mismo mecanismo que el resto del archivo,
 *  nunca releída del texto del clon); rango PUNTUAL (`min === max`), mismo
 *  criterio "más estricto, nunca más permisivo" que `resolveGraphFamily`
 *  documenta arriba — ver "ARIDAD COMPATIBLE". Sin grafo o sin
 *  `unitSymbolId`, `null` (sin dato) — `arityCompatibleCluster` no excluye
 *  por eso. */
function signatureFromClone(index: Index | null, unitSymbolId: string | null, methodName: string): { arityRange: { min: number; max: number } | null; returnType: string | undefined } {
  if (!index || !unitSymbolId) return { arityRange: null, returnType: undefined };
  const sig = memberSignatures(asGraphIndex(index), unitSymbolId).find((m) => m.name === methodName);
  return {
    arityRange: sig && sig.arity !== null ? { min: sig.arity, max: sig.arity } : null,
    // Ola U (INTENCIÓN 2): el tipo de retorno viaja junto con la aridad, de la
    // MISMA firma del grafo — nunca releído del texto del clon.
    returnType: sig?.returnType,
  };
}

function entriesFromDistributedDuplication(problem: Finding, repo: RepoUnit, graph: CodeGraph | null, index: Index | null): SkeletonEntry[] {
  const out: SkeletonEntry[] = [];
  for (const location of problem.locations) {
    const clone = findCloneFor(repo, location);
    if (!clone || !clone.functionName) continue; // higiene: sin CloneCandidate o función anónima, no participa
    const seq = textualCallSequence(clone.normalized);
    if (seq.length < MIN_SEQUENCE_LEN) continue;
    const unitName = clone.className ?? `(nivel superior):${clone.file}:${clone.startLine}`;
    // Ola U (INTENCIÓN 1): un constructor no es un esqueleto — ni siquiera
    // cuando el ancla lo agrupó por similitud textual de cuerpo. Es el falso
    // que PLAN-INTENCIONES.md §2 bug 1 documenta con
    // `XObjectWrapper`/`JsonSerializerInternalBase`: dos constructores de dos
    // clases SIN relación, cada uno con `_campo = parámetro;`.
    if (isConstructorMemberName(clone.functionName, clone.className ?? "")) continue;
    const unitSymbolId = graph && clone.className ? (classNodeByName(graph, clone.file, clone.className)?.id ?? null) : null;
    const { arityRange, returnType } = signatureFromClone(index, unitSymbolId, clone.functionName);
    out.push({ location, unitName, methodName: clone.functionName, calledNamesSequence: seq, clone, unitSymbolId, arityRange, ...(returnType !== undefined ? { returnType } : {}) });
  }
  return out;
}

function entriesFromParallelHierarchies(problem: Finding, graph: CodeGraph | null, index: Index): SkeletonEntry[] {
  if (!graph) return [];
  const out: SkeletonEntry[] = [];
  for (const location of problem.locations) {
    const classNode = classNodeAt(graph, location);
    if (!classNode) continue;
    const unitName = classNode.symbolPath.join(".");
    // Ola U (INTENCIÓN 1): `ownMembers` en vez de `memberSignatures` — sin
    // constructores. Sin esto, dos jerarquías paralelas de Java/C# empataban
    // por el nombre de su propia clase apenas se llamaran igual.
    for (const m of ownMembers(index, classNode.id)) {
      // Rango PUNTUAL — misma limitación declarada que `resolveGraphFamily`:
      // grafo puro, sin AST vivo para ver parámetros opcionales.
      const arityRange = m.arity === null ? null : { min: m.arity, max: m.arity };
      out.push({
        location,
        unitName,
        methodName: m.name,
        calledNamesSequence: [],
        clone: null,
        unitSymbolId: classNode.id,
        arityRange,
        ...(m.returnType !== undefined ? { returnType: m.returnType } : {}),
      });
    }
  }
  return out;
}

/**
 * Ver "EL HUECO MEDIDO"/"EXCEPCIÓN DECLARADA" en el docstring del módulo.
 * Cachea sólo lo mínimo que `build()` (árbol vivo, sin grafo) SÍ pudo
 * confirmar por AST — el nombre de la clase del ancla y el nombre TEXTUAL de
 * su superclase — para que `refresh()` (grafo real, sin árbol) pueda
 * resolver el MISMO nodo en el grafo sin releer nada.
 */
interface DeferredFamilyRefreshState {
  readonly deferred: true;
  readonly file: string;
  readonly anchorClassName: string;
  readonly superclassName: string;
}

type TemplateMethodRefreshState = TemplateMethodProblem | DeferredFamilyRefreshState;

/**
 * Placeholder DIFERIDO — ver "EL HUECO MEDIDO" en el docstring del módulo.
 * Se emite cuando `findAstFamily` no encontró familia EN ESTE ARCHIVO, pero
 * la clase del ancla SÍ declara una superclase por AST (`extractSuperclassNameTM`
 * — sin exigir que esa clase esté definida acá). Bypasea `engine.ts#build`:
 * sus dos checks `required` dependen de `problem.entries`/`winningGroup`,
 * que acá quedarían vacíos a propósito — no hay entradas reales todavía,
 * sólo la PROMESA de ir a buscarlas en el grafo (`resolveDeferredViaGraph`).
 * `state: "parcial"` + `confidence: null` (NUNCA un literal a mano —
 * `no-declared-confidence.test.ts` lo prohíbe): ninguna escalera de
 * discriminadores corrió todavía, nada que gradúe.
 */
function deferredStructuralHypothesis(problem: Finding, ctx: HypothesisContext, file: string, anchorClassName: string, superclassName: string): PatternHypothesisDraft {
  const spec = buildSpec(ctx);
  const check: PatternHypothesisCheck = {
    label: "familia-declarada-fuera-de-este-archivo-pendiente-de-grafo",
    passed: false,
    why: `"${anchorClassName}" declara extender ("extends"/"<"/heritage) a "${superclassName}", pero esa clase no está definida en este mismo archivo — sin el grafo del repo (recién se arma después de que TODOS los archivos pasen por esta primera pasada) no se puede confirmar todavía la familia real de hermanos. Se reevalúa con el grafo real en la siguiente pasada (crossAnalyze).`,
    role: "applied",
  };
  const deferredState: DeferredFamilyRefreshState = { deferred: true, file, anchorClassName, superclassName };
  return {
    pattern: spec.pattern,
    state: "parcial",
    confidence: null,
    ceiling: spec.ceiling,
    provisional: true,
    checks: [check],
    discriminators: [],
    places: [problem.locations[0]!],
    toConfirm: spec.toConfirm,
    cost: costFor(ctx),
    source: spec.source,
    missingCapabilities: [],
    anchorFindingId: problem.id,
    refreshState: deferredState,
  };
}

/**
 * Completa la PROMESA de `deferredStructuralHypothesis` — ver "EL HUECO
 * MEDIDO"/"EXCEPCIÓN DECLARADA" en el docstring del módulo. Con el grafo
 * real (`crossAnalyze`, `refresh()`) ya construido: resuelve el nodo del
 * ancla por `file`+nombre (`classNodeByName`, ya usado por el camino
 * `distributed-duplication`), busca TODAS sus familias reales vía
 * `extends`/`mixes-in` sin restricción de archivo (`findGraphFamilyCandidates`,
 * R5 — antes `findGraphFamily`, singular), resuelve CADA UNA
 * (`resolveGraphFamily`) y se queda con la de MEJOR confirmación
 * (`ResolutionTier` más bajo — ver el docstring de `findGraphFamilyCandidates`
 * para por qué "la primera que aparece" dejó de alcanzar en cuanto `mixes-in`
 * entró al pool de aristas). Con la ganadora, corre el MISMO motor
 * (`engine.ts#build`) que el camino AST ya usa, con
 * `entries`/`winningGroup`/`structuralFacts` derivados del grafo en vez del
 * árbol. `null` en cualquier corte (sin grafo todavía, ancla no resoluble,
 * sin ninguna familia candidata, ninguna con candidato de esqueleto): el
 * placeholder DIFERIDO queda como estaba — `parcial`/`confidence: null`, la
 * promesa sigue abierta, nunca se inventa una confirmación.
 */
function resolveDeferredViaGraph(
  problem: Finding,
  stored: DeferredFamilyRefreshState,
  graph: CodeGraph | null,
  ctx: HypothesisContext,
  /**
   * OLA AK (AK6) — **EL ESQUELETO TIENE QUE SER EL DE LA FAMILIA, NO EL DE
   * TRES HERMANOS.** Cuando es `true`, el nombre ganador tiene que aparecer en
   * la MAYORÍA de los hermanos de la familia elegida. **No es un número
   * nuevo:** es la MISMA condición, con la MISMA aritmética, que
   * `buildFromGraphRootFamily` ya tiene en producción desde la Ola AI
   * (`unidadesDelGrupo * 2 < siblings.length`), escrita por AI5b para la
   * dirección RAÍZ de la arista y nunca aplicada a la dirección SUBTIPO, que
   * es igual de ancha: `findGraphFamilyCandidates` barre TODO el grafo
   * buscando quién extiende al ancestro, así que una base de framework trae
   * cientos de hermanos sin relación entre sí. Su razón, verbatim de AI5b:
   * *"el remedio del patrón es subir el esqueleto al ancestro: si un nombre
   * aparece en 3 de 400 subtipos, subirlo es incorrecto para los otros 397 —
   * eso no es un esqueleto, es una coincidencia entre tres hermanos"*. Y el
   * propio `ResolutionTier` de este módulo nombra al tier 3 como el productor
   * del falso positivo de `deal.rb:67` (*"familia ApplicationRecord, cientos
   * de hermanos sin relación real entre sí, un ganador por conteo de
   * coincidencias"*).
   *
   * **Por defecto `false`**: el camino de `refresh()` — el único que llama a
   * esta función para `inheritance-family`/`refused-bequest`, las dos anclas
   * estructurales con propuestas juzgadas VERDADERAS — queda byte a byte como
   * estaba. Sólo la rama nueva de `large-class` en `buildFromStructuralAnchor`
   * lo pide.
   */
  exigirMayoriaDeLaFamilia = false,
): PatternHypothesisDraft | null {
  if (!graph) return null;
  const anchorNode = classNodeByName(graph, stored.file, stored.anchorClassName);
  if (!anchorNode) return null;

  const index = buildIndex(graph);
  const candidates = findGraphFamilyCandidates(graph, index, anchorNode.id);
  if (candidates.length === 0) return null;

  let best: { group: SkeletonEntry[]; structuralFacts: StructuralAncestorFacts; tier: ResolutionTier } | null = null;
  let bestSiblings = 0;
  for (const family of candidates) {
    const resolved = resolveGraphFamily(index, family, ctx.repo);
    if (!resolved) continue;
    if (!best || resolved.tier < best.tier) {
      best = resolved;
      bestSiblings = family.siblings.length;
    }
  }
  if (!best) return null;
  if (exigirMayoriaDeLaFamilia) {
    const unidadesDelGrupo = new Set(best.group.map((e) => e.unitSymbolId ?? e.unitName)).size;
    if (unidadesDelGrupo * 2 < bestSiblings) return null;
  }

  const templateMethodProblem: TemplateMethodProblem = {
    finding: problem,
    totalLocations: problem.locations.length,
    entries: best.group,
    winningGroup: best.group,
    // OLA AO (AO4) — antes `null` SIEMPRE, y por eso `highAverageSimilarity`
    // contestaba "Sin datos de secuencia de llamadas" en 39 de 39 (AM1). Ahora
    // sale de los cuerpos que `repo.clones` sí tiene; sigue siendo `null`
    // cuando menos de dos copias tienen cuerpo recuperable, que es el mismo
    // "no sé" de siempre. Es un DISCRIMINADOR: no gatea nada, sólo puede subir
    // la confianza y hacer JUZGABLE la evidencia.
    winningAvgSimilarity: avgBodySimilarity(best.group),
    anchorKind: problem.kind,
    structuralFacts: best.structuralFacts,
    hasInheritanceCapability: ctx.capabilities.has("herencia"),
  };

  const spec = buildSpec(ctx);
  const outcome = engineBuild(spec, ctx.capabilities, templateMethodProblem, graph);
  if (!outcome) return null;

  // R5 (integración de la Ola D) — acá NO se reescribe el `role`, a
  // diferencia de los otros dos caminos de `places` de este archivo. Esos dos
  // parten de entradas donde cada unidad SÍ declara el método (un
  // `CloneCandidate` real, o un nodo de clase leído del AST del archivo), así
  // que ahí `"X" define "m" (copia)` es cierto. En ESTE camino las entradas
  // salen de `resolveGraphFamily`, que ya escribió el `role` correcto para
  // cada uno de sus dos casos ("hereda (o debería heredar, sin bypasear) el
  // esqueleto de <ancestro>" en tier 1/2, "método candidato" en tier 3) — y
  // en el estado `ya-aplicado`, que es justamente el que R5 vino a producir,
  // la frase vieja afirmaba lo CONTRARIO de lo que el propio check
  // `ningun-subtipo-redeclara-el-esqueleto` acababa de confirmar en el mismo
  // informe. Medido sobre `app/models/deal.rb:67`: las 7 unidades salían como
  // «"Deal" define "encode_proto"», «"Hook" define "encode_proto" (copia)»…,
  // y NINGUNA de las 7 declara `encode_proto` — sólo `ProtoModule` lo hace
  // (verificado a mano: `def encode_proto` tiene un único resultado en todo
  // el repo, en el módulo). El `role` que `resolveGraphFamily` ya traía es el
  // verdadero; pisarlo convertía un `ya-aplicado` correcto en un texto
  // factualmente falso — exactamente el modo de falla que R5 vino a cerrar.
  const places: readonly RoleLocation[] = best.group.map((e) => e.location);

  const hyp = toPatternHypothesis(spec, outcome, { anchorFindingId: problem.id, places, cost: costFor(ctx) });
  return { ...hyp, refreshState: templateMethodProblem };
}

/**
 * ══ OLA AI, FRENTE AI5b — **EL ANCLA ES LA RAÍZ DE SU FAMILIA.** ══════════
 *
 * QUÉ ERA IMPOSIBLE POR CONSTRUCCIÓN, Y PARA QUÉ SUBCONJUNTO. En
 * `buildFromStructuralAnchor`, cuando no hay familia en ESTE archivo, la
 * única salida que no era `null` exigía que la clase del ancla **declarara
 * una superclase** (`if (!superclassName) return null;`, con el comentario
 * *"sin superclase en absoluto — ni siquiera diferible"*). Una clase que es
 * la **RAÍZ** de su familia **no declara ninguna superclase — ésa es la
 * definición de raíz** — así que ese `required` de entrada es
 * INSATISFACIBLE para el subconjunto "raíces de familia", escriba el repo
 * las subclases que escriba y diga el grafo lo que diga. No es difícil: es
 * imposible.
 *
 * Y LA MÁQUINA PARA RESOLVERLO YA ESTABA ESCRITA, PARA ESTA DIRECCIÓN
 * EXACTA. `findGraphFamilyCandidates` empieza por
 * `const asBase = classLikeNodesRelatedTo(graph, index, anchorId)` —la
 * arista INVERSA, "quién extiende al ancla"— y su docstring nombra las dos
 * direcciones. Pero a esa función sólo se llega desde
 * `resolveDeferredViaGraph`, y ahí sólo se llega desde el placeholder
 * DIFERIDO, que sólo se emite cuando `superclassName !== null`. Resultado:
 * la rama `asBase` sólo era alcanzable para clases del MEDIO de una
 * jerarquía (que declaran superclase *y* tienen subtipos). **Para una raíz
 * pura era código muerto.**
 *
 * LAS CUATRO CONDICIONES (`scratchpad-ai5b/CRITERIO.md`, escrito ANTES de
 * medir y ANTES de tocar una línea):
 *
 *  1. FUERZA — la misma que el camino AST same-file: *"la misma secuencia de
 *     pasos escrita en cada hermano, con algunos pasos distintos, en vez de
 *     una sola vez arriba"*. Cuando el ancla es la raíz, el ancestro común
 *     **es el ancla misma**; los subtipos repiten un nombre que la raíz no
 *     declara ⇒ el esqueleto falta ARRIBA. **Cambia la dirección de la
 *     arista, no la pregunta.**
 *  2. ESCALA — `>= MIN_DISTINCT_UNITS` subtipos (**el MISMO número** que ya
 *     usan `findAstFamily` y `findGraphFamilyCandidates`; no es un número
 *     nuevo) **y el nombre ganador repetido en la MAYORÍA de los subtipos de
 *     la familia**. La razón de la segunda mitad, escrita antes de medir: la
 *     dirección RAÍZ es estrictamente más ancha que la dirección SUBTIPO
 *     —`classLikeNodesRelatedTo` barre TODO el grafo buscando quién apunta
 *     al ancla, mientras que la dirección subtipo está acotada por las 1-3
 *     aristas propias del ancla— y ese ensanchamiento es exactamente el modo
 *     de falla que el docstring de `ResolutionTier` ya nombra con nombre
 *     propio (`deal.rb:67`: *"cientos de hermanos sin relación real entre sí,
 *     un ganador por conteo de coincidencias"*). El remedio del patrón es
 *     **subir el esqueleto al ancestro**: si un nombre aparece en 3 de 400
 *     subtipos, subirlo es incorrecto para los otros 397 — eso no es un
 *     esqueleto, es una coincidencia entre tres hermanos. Si aparece en la
 *     mayoría, ES el esqueleto compartido. La escala se mide en la moneda de
 *     este ancla (UNIDADES de la familia) y exige que el patrón pague para
 *     la familia entera, no para una minoría de ella.
 *  3. RESOLUCIÓN VERIFICADA — **no se agrega ni un chequeo**: lo decide la
 *     MISMA `appliedState`/`stateFromFacts` de siempre sobre los MISMOS
 *     `structuralFacts` que `resolveGraphFamily` ya produce. Si la raíz ya
 *     declara el esqueleto y ningún subtipo lo redeclara, sale
 *     `ya-aplicado`; el entregable es `ausente`/`parcial`.
 *  4. EL HECHO DEL GRAFO QUE LA DECIDE, verificado ANTES de escribir —
 *     `rebuildHypothesesWithGraph` (`run.ts`) vuelve a llamar `build()` con
 *     **el grafo REAL y `ctx.file` vivo a la vez** (su tabla de
 *     precondiciones), y hasta esta ola `buildFromStructuralAnchor` **tiraba
 *     el grafo: ni lo recibía**. Sobre ese grafo, `classNodeByName` resuelve
 *     el nodo del ancla y `classLikeNodesRelatedTo` devuelve sus subtipos.
 *     Sin grafo (pasada 1, `repo.graph === null`) esta función devuelve
 *     `null` y el comportamiento es EXACTAMENTE el de antes.
 *
 * POR QUÉ ES ADITIVO, Y LA PRUEBA ES DE FORMA, NO DE MUESTREO: el único
 * llamador es la línea que hasta hoy decía `return null`. Toda entrada que
 * hoy produce una hipótesis sigue por el mismo camino, byte a byte; toda
 * entrada que hoy produce `null` sigue produciendo `null` salvo que el grafo
 * confirme una familia. **Ninguna hipótesis existente puede cambiar ni
 * desaparecer por este camino.**
 */
function buildFromGraphRootFamily(
  problem: Finding,
  graph: CodeGraph | null,
  ctx: HypothesisContext,
  file: string,
  anchorSymbol: string,
): PatternHypothesisDraft | null {
  if (!graph) return null; // pasada 1 (`analyzeFile`): sin grafo, misma respuesta que antes.
  const anchorNode = classNodeByName(graph, file, anchorSymbol);
  if (!anchorNode) return null; // el ancla no es una unidad `class-like` resoluble en el grafo.

  const index = buildIndex(graph);
  const siblings = classLikeNodesRelatedTo(graph, index, anchorNode.id);
  if (siblings.length < MIN_DISTINCT_UNITS) return null; // no es raíz de ninguna familia: silencio correcto.

  const resolved = resolveGraphFamily(index, { ancestorId: anchorNode.id, ancestorNode: anchorNode, siblings }, ctx.repo);
  if (!resolved) return null; // familia real, pero ningún candidato a esqueleto: sin oportunidad, ni con el grafo.

  // ESCALA (condición 2) — el nombre ganador tiene que estar en la MAYORÍA de
  // los subtipos de la familia. Ver el docstring: es una condición de ENTRADA
  // de este camino (mismo idioma que los cortes de `resolveDeferredViaGraph`),
  // nunca un `required` del spec — los `required` los comparten los otros dos
  // caminos de entrada y agregarles una condición sería QUITARLES población.
  const unidadesDelGrupo = new Set(resolved.group.map((e) => e.unitSymbolId ?? e.unitName)).size;
  if (unidadesDelGrupo * 2 < siblings.length) return null;

  // LA CONDICIÓN QUE MEDÍ, CONSTRUÍ Y **RETIRÉ** — y la dejo escrita porque el
  // número es el resultado, no el código.
  //
  // Al mirar las recomendaciones que este camino produce aparecieron dos donde
  // el nombre compartido está declarado en el ABUELO del ancla y no en el
  // ancestro inmediato (`guava · CharMatcher.FastMatcher`, con `matches`
  // abstracto en `CharMatcher`; `click · UsageError`, con `format_message` en
  // `ClickException`). Escribí el recorrido de la cadena de ancestros para
  // callarlas y lo medí sobre `guava`: **de 7 recomendaciones nuevas quedaban
  // 3, y de las 4 que silenciaba DOS eran las únicas que yo había juzgado
  // VERDADERAS** (`AbstractContiguousSetGenerator`, cuyos cinco hermanos sí
  // repiten un esqueleto real; que el abuelo declare `create` ABSTRACTO es el
  // gancho, no la plantilla, y el grafo no distingue una cosa de la otra
  // porque `memberSignatures` no trae cuerpos).
  //
  // **Lo retiré.** Subía la precisión de la celda y bajaba el numerador, que es
  // exactamente el intercambio que la regla 2 de la Ola AI prohíbe: *"recortar
  // para que un porcentaje suba está prohibido; si medís que algo rinde mal,
  // publicás el número y no lo tocás"*. El discriminador que de verdad haría
  // falta no es "¿algún ancestro declara el nombre?" sino "¿los hermanos
  // comparten un ESQUELETO?", y eso necesita cuerpos que este camino no tiene.
  // Queda medido y escrito para quien pueda traerlos.

  const templateMethodProblem: TemplateMethodProblem = {
    finding: problem,
    totalLocations: problem.locations.length,
    entries: resolved.group,
    winningGroup: resolved.group,
    // OLA AO (AO4) — ídem `resolveDeferredViaGraph`: los cuerpos salen de
    // `repo.clones`, no del grafo. Es exactamente el dato que el párrafo de
    // arriba (AI5b) declara faltante: *"lo que de verdad haría falta … es
    // ¿los hermanos comparten un ESQUELETO?, y eso necesita cuerpos que este
    // camino no tiene"*.
    winningAvgSimilarity: avgBodySimilarity(resolved.group),
    anchorKind: problem.kind,
    structuralFacts: resolved.structuralFacts,
    hasInheritanceCapability: ctx.capabilities.has("herencia"),
  };

  const spec = buildSpec(ctx);
  const outcome = engineBuild(spec, ctx.capabilities, templateMethodProblem, graph);
  if (!outcome) return null;

  // Mismo criterio que `resolveDeferredViaGraph` (ver su nota larga): el
  // `role` que `resolveGraphFamily` ya escribió para cada entrada es el
  // verdadero; pisarlo convertiría un `ya-aplicado` correcto en un texto
  // factualmente falso.
  const places: readonly RoleLocation[] = resolved.group.map((e) => e.location);
  const hyp = toPatternHypothesis(spec, outcome, { anchorFindingId: problem.id, places, cost: costFor(ctx) });
  // ESTE CAMINO PUBLICA SÓLO OPORTUNIDADES, Y LA RAZÓN NO ES DE GUSTO: ES LA
  // ÚNICA FORMA DE QUE NO PUEDA HACER DESAPARECER NADA. `arbitrateRivalHypo-
  // theses` (engine.ts) descarta la OPORTUNIDAD de un patrón cuando OTRO
  // patrón CONFIRMÓ sobre el mismo sujeto. Un `ya-aplicado`/`aplicado-eludido`
  // salido de acá caería sobre hallazgos que hoy no tienen NINGUNA hipótesis de
  // este patrón, así que podría silenciar la oportunidad de un patrón rival que
  // hoy sí se publica — y eso sería PERDER una propuesta, que es justo lo que
  // esta ola prohíbe. Callándose ahí, el camino queda MONÓTONO por
  // construcción: sólo puede AGREGAR `ausente`/`parcial`, nunca quitar nada de
  // nadie. Y `ya-aplicado` no es el entregable de todos modos: hoy, en esos
  // mismos hallazgos, este patrón no dice nada, así que no se pierde
  // información que estuviera publicada.
  if (hyp.state !== "ausente" && hyp.state !== "parcial") return null;
  return { ...hyp, refreshState: templateMethodProblem };
}

/**
 * Camino de entrada para las anclas ESTRUCTURALES (`large-class`/
 * `refused-bequest`/`inheritance-family`) — ver el docstring del módulo. Sin
 * grafo (`repo.graph` es `null` en la llamada de producción de estas tres
 * anclas), la familia de hermanos se busca PRIMERO por AST, restringida al
 * mismo archivo (`ctx.file`, vivo acá). Sin `ctx.file` (límite documentado,
 * mismo criterio que `decorator.ts`), no hay candidata. Si esa búsqueda no
 * encuentra nada, ver "EL HUECO MEDIDO": antes de rendirse (como con
 * `Standalone`, sin ninguna superclase), se comprueba si la clase del ancla
 * SÍ declara una — si la declara, se difiere la confirmación al grafo real
 * (`deferredStructuralHypothesis`/`resolveDeferredViaGraph`) en vez de
 * descartar de una.
 */
function buildFromStructuralAnchor(problem: Finding, ctx: HypothesisContext, graph: CodeGraph | null): PatternHypothesisDraft | null {
  const file = problem.locations[0]?.file;
  const anchorSymbol = problem.locations[0]?.symbol;
  const sets = ctx.file ? ctx.setsFor(ctx.file.language) : null;
  const family = ctx.file && sets ? findAstFamily(ctx.file.root, sets, anchorSymbol) : null;

  if (!family) {
    if (!ctx.file || !sets || !file || !anchorSymbol) return null;
    const anchorClassNode = classNodesByNameTM(ctx.file.root, sets).get(anchorSymbol) ?? null;
    const superclassName = anchorClassNode ? extractSuperclassNameTM(anchorClassNode) : null;
    // Ola AI (frente AI5b) — "sin superclase" NO es "sin familia": es la
    // definición de RAÍZ. Antes de rendirse (como con `Standalone`, que de
    // verdad está sola) se le pregunta al grafo por la arista INVERSA. Ver el
    // docstring de `buildFromGraphRootFamily`: es la ÚNICA línea nueva de este
    // camino de entrada, y se alcanza SÓLO donde antes había un `return null`.
    if (!superclassName) return buildFromGraphRootFamily(problem, graph ?? ctx.repo.graph, ctx, file, anchorSymbol);
    /* ══ OLA AK, FRENTE AK6 — **UNA PROMESA NO ES UNA PROPUESTA.** ═════════
     *
     * QUÉ SITUACIÓN RECONOCE Y CUÁL NO. `deferredStructuralHypothesis` publica
     * `state: "parcial"` con `confidence: null`, `provisional: true` y **un
     * solo check, con `passed: false`** — bypasea `engine.ts#build` a
     * propósito, así que no confirmó ninguno de los dos `required` del patrón.
     * Es una PROMESA: *"esta clase declara extender algo que no está en este
     * archivo; ya lo verifico con el grafo"*. Cuando la promesa se cumple, el
     * resultado es una hipótesis con checks reales y no cambia nada.
     * **Cuando el grafo la desmiente, hoy se publica igual la promesa vacía.**
     *
     * ESTA RAMA SÓLO CAMBIA ESE CASO, y sólo para el ancla `large-class`:
     * cuando ya hay un grafo real a mano, se resuelve acá con la MISMA
     * `resolveDeferredViaGraph` que `refresh()` iba a correr un momento
     * después (mismo objeto, mismos argumentos, mismo motor) y, si el grafo no
     * confirma ninguna familia, se calla en vez de publicar la promesa. Sin
     * grafo (pasada 1, `analyzeFile`) el comportamiento es EXACTAMENTE el de
     * antes: se emite el placeholder y `refresh()` lo resuelve como siempre.
     *
     * POR QUÉ SÓLO `large-class`, y no las otras dos anclas estructurales: en
     * `inheritance-family` y `refused-bequest` el ANCLA MISMA ya confirmó que
     * la unidad está en una familia de herencia, así que la promesa descansa
     * sobre un hecho verificado. En `large-class` el único hecho verificado es
     * que la clase tiene muchos miembros — el tamaño de una clase no dice
     * NADA sobre secuencias repetidas, y lo dice el propio docstring de esta
     * hipótesis. Ahí la promesa vacía es TODA la propuesta. (Y las otras dos
     * anclas tienen propuestas juzgadas VERDADERAS que esta ola no puede
     * perder: quedan intactas, byte a byte.)
     *
     * NO PUEDE HACER DESAPARECER LA PROPUESTA DE OTRO PATRÓN:
     * `arbitrateRivalHypotheses` sólo descarta OPORTUNIDADES cuando otro
     * patrón CONFIRMÓ; el placeholder es `parcial` (una oportunidad), así que
     * podía ser descartado y nunca descartar. Quitarlo no cambia el destino de
     * ninguna hipótesis ajena.
     */
    const graphParaLaPromesa = graph ?? ctx.repo.graph;
    if (problem.kind === LARGE_CLASS_ANCHOR_KIND && graphParaLaPromesa) {
      return resolveDeferredViaGraph(problem, { deferred: true, file, anchorClassName: anchorSymbol, superclassName }, graphParaLaPromesa, ctx, true);
    }
    return deferredStructuralHypothesis(problem, ctx, file, anchorSymbol, superclassName);
  }

  const resolution: AstFamilyResolution = sets && file ? resolveAstFamily(family, sets, file) : { entries: [], winningGroup: null, structuralFacts: null };

  const templateMethodProblem: TemplateMethodProblem = {
    finding: problem,
    totalLocations: problem.locations.length,
    entries: resolution.entries,
    winningGroup: resolution.winningGroup,
    winningAvgSimilarity: null,
    anchorKind: problem.kind,
    structuralFacts: resolution.structuralFacts,
    hasInheritanceCapability: ctx.capabilities.has("herencia"),
  };

  const spec = buildSpec(ctx);
  const outcome = engineBuild(spec, ctx.capabilities, templateMethodProblem, null);
  // Ola AI (frente AI5b), SEGUNDA MITAD DEL MISMO DEFECTO: `findAstFamily` ve
  // SÓLO los hermanos de ESTE archivo (su docstring lo declara: *"si la base
  // vive en otro archivo, esta vía —sin grafo— no tiene forma de
  // confirmarlo"*). Cuando esa familia RECORTADA no alcanza para pasar los dos
  // `required`, el resultado hasta hoy era `null` — aunque el grafo conociera
  // el resto de la familia. Es la MISMA imposibilidad que
  // `buildFromGraphRootFamily` resuelve, mirada desde el otro lado: allá el
  // ancla no podía ni diferirse por no declarar superclase; acá se difiere a
  // una familia que el ARCHIVO recorta. Se le pregunta al grafo con las MISMAS
  // condiciones de escala y el MISMO motor, y sólo donde antes había `return
  // null`: ninguna hipótesis existente puede cambiar ni desaparecer.
  // MEDIDO ANTES DE ESCRIBIRLO (`scratchpad-ai5b/analiza-sonda.py` sobre las 13
  // bibliotecas): de los 132 hallazgos con familia AST que hoy salen MUDOS, el
  // grafo confirma familia y escala en 29 — 19 darían `ausente`, 6 `parcial` y
  // 4 `ya-aplicado`.
  if (!outcome) return file && anchorSymbol ? buildFromGraphRootFamily(problem, graph ?? ctx.repo.graph, ctx, file, anchorSymbol) : null;

  const group = templateMethodProblem.winningGroup ?? [];
  const places: readonly RoleLocation[] =
    group.length > 0
      ? group.map((e, i) => ({ ...e.location, role: `"${e.unitName}" define "${e.methodName}"${i === 0 ? "" : " (copia)"}` }))
      : [problem.locations[0]];

  const hyp = toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places,
    cost: costFor(ctx),
  });
  // Ola 11a (P2) — cachea el `TemplateMethodProblem` ENTERO (AST vivo ya
  // consumido, sin nada más que releer) para que `refresh()` (sin árbol,
  // `ctx.file` null en `crossAnalyze`) pueda re-correr la escalera de
  // discriminadores (incluido `crossFileFamilyRecurrenceDiscriminator`, que
  // SÍ necesita `ctx.neighborhood` real) sin recalcular la familia — mismo
  // criterio que `strategy.ts#refreshState`.
  const refreshState: TemplateMethodProblem = templateMethodProblem;
  return { ...hyp, refreshState };
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA AC (frente AC3) — EL ANCLA-FUERZA: `homonymous-divergent-sequence`
 *
 * QUÉ CAMBIA RESPECTO DE LAS OTRAS CUATRO ANCLAS. Las dos estructurales
 * (`large-class`, `inheritance-family`) miran SÍNTOMAS que no dicen nada
 * sobre secuencias repetidas —el tamaño de una clase, la existencia de una
 * familia— y esta ola las mide en 0/23 y 1/14. El ancla nueva nombra la
 * FUERZA que el patrón resuelve: *la misma secuencia de pasos escrita en
 * cada hermano, con algunos pasos distintos, en vez de una sola vez arriba*
 * (ver el docstring de `detect/intra-file/homonymous-divergent-sequence.ts`
 * para las cinco condiciones y la intención de cada una).
 *
 * EL REPARTO DE TRABAJO NO CAMBIA, y es lo que evita la trampa de anclar en
 * la ESTRUCTURA: **el ancla detecta la fuerza; que la RESOLUCIÓN esté
 * AUSENTE lo sigue decidiendo `appliedState`/`stateFromFacts`, sin un solo
 * cambio.** Este camino de entrada no filtra por "el ancestro ya declara el
 * método": si lo declara, la escalera de siempre contesta
 * `ya-aplicado`/`aplicado-eludido`/`parcial` — y ese reparto es el resultado
 * que la ola mide, no una propiedad que el ancla se autoconceda.
 *
 * POR QUÉ NECESITA `ctx.file`: el `Finding` trae, en cada `location`, la
 * unidad y el miembro exactos (`symbol` = `Unidad.miembro`), pero no la
 * secuencia de llamadas — un `Finding` no transporta cuerpos. Se relee del
 * árbol vivo con la MISMA función que el camino AST ya usa
 * (`methodsOfClassAst`), nunca de disco ni con un segundo parseo. `ctx.file`
 * está vivo en las DOS llamadas de producción de un ancla `intra-file`
 * (`attachHypotheses` en `analyzeFile` y `rebuildHypothesesWithGraph` en
 * `crossAnalyze`), así que esto no es una promesa: es el contrato que
 * `hypotheses/run.ts` ya declara. Sin árbol (contexto degradado de un test de
 * compuerta) devuelve `null`, que es la respuesta honesta.
 * ──────────────────────────────────────────────────────────────────────── */
const SEQUENCE_ANCHOR_KIND = "homonymous-divergent-sequence";

/** `"Unidad.miembro"` ⇒ `["Unidad", "miembro"]` — el `symbol` que el detector
 *  escribe en cada `location`. Se parte por el ÚLTIMO punto: el nombre de la
 *  unidad es el que la gramática escribió en su campo `name` (sin puntos), el
 *  del miembro también. */
function splitUnitMember(symbol: string | undefined): { unitName: string; methodName: string } | null {
  if (!symbol) return null;
  const i = symbol.lastIndexOf(".");
  if (i <= 0 || i === symbol.length - 1) return null;
  return { unitName: symbol.slice(0, i), methodName: symbol.slice(i + 1) };
}

function buildFromSequenceAnchor(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const sets = ctx.file ? ctx.setsFor(ctx.file.language) : null;
  if (!ctx.file || !sets) return null;
  const classesByName = classNodesByNameTM(ctx.file.root, sets);
  const effectiveGraph = graph ?? ctx.repo.graph;
  const index = effectiveGraph ? buildIndex(effectiveGraph) : null;

  const entries: SkeletonEntry[] = [];
  let methodName: string | null = null;
  for (const location of problem.locations) {
    const split = splitUnitMember(location.symbol);
    if (!split) continue;
    const classNode = classesByName.get(split.unitName);
    if (!classNode) continue;
    // La declaración exacta que el ancla marcó, identificada por su línea de
    // inicio — nunca "la primera con ese nombre": una unidad puede declarar
    // dos veces el mismo nombre (sobrecarga) y el ancla ya eligió una.
    const method = methodsOfClassAst(classNode, sets).find((m) => m.name === split.methodName && m.node.startPosition.row + 1 === location.startLine);
    if (!method) continue;
    methodName = split.methodName;
    const unitSymbolId = effectiveGraph ? (classNodeByName(effectiveGraph, location.file, split.unitName)?.id ?? null) : null;
    entries.push({
      location,
      unitName: split.unitName,
      methodName: split.methodName,
      calledNamesSequence: method.calls,
      clone: null,
      unitSymbolId,
      arityRange: method.arityRange,
      ...(method.returnType !== undefined ? { returnType: method.returnType } : {}),
    });
  }
  if (!methodName || new Set(entries.map((e) => e.unitName)).size < MIN_DISTINCT_UNITS) return null;

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      total += sequenceSimilarity(entries[i]!.calledNamesSequence, entries[j]!.calledNamesSequence);
      pairs++;
    }
  }

  const templateMethodProblem: TemplateMethodProblem = {
    finding: problem,
    totalLocations: problem.locations.length,
    entries,
    winningGroup: entries,
    winningAvgSimilarity: pairs > 0 ? total / pairs : null,
    anchorKind: problem.kind,
    structuralFacts: index ? structuralAncestorFacts(index, entries, methodName) : null,
    hasInheritanceCapability: ctx.capabilities.has("herencia"),
  };

  const spec = buildSpec(ctx);
  const outcome = engineBuild(spec, ctx.capabilities, templateMethodProblem, effectiveGraph);
  if (!outcome) return null;

  // El `role` que el ancla escribió (qué pasos comunes repite cada hermano y
  // cuáles agrega) ya dice más que cualquier reescritura de acá, y es lo que
  // hace juzgable la recomendación: se conserva, igual que en el camino de
  // `resolveGraphFamily`.
  const places: readonly RoleLocation[] = entries.map((e) => e.location);
  const hyp = toPatternHypothesis(spec, outcome, { anchorFindingId: problem.id, places, cost: costFor(ctx) });
  return { ...hyp, refreshState: templateMethodProblem };
}

export const hypothesis: HypothesisBuilder = {
  id: "template-method",
  pattern: "Template Method",
  layer: "patron",
  /**
   * OLA AC (frente AC3) — **R1 APLICADA: `large-class` e `inheritance-family`
   * DEJAN DE EMITIR**, y el número que las apaga lo reprodujo este frente con
   * el instrumento oficial (`w-int-censo-nivel2.mts` +
   * `scripts/v-int-precision-nivel2.mts`/`ac1-por-celda.py`) sobre su propio
   * censo de los 13 repos, no lo tomó de un informe:
   *
   *   - `Template Method · large-class` — **0 / 23 = 0,0 % [0,0 %, 14,3 %]**,
   *     61 recomendaciones en los 13 repos + 20 en `corpus-app/`. El tamaño de
   *     una clase no dice NADA sobre secuencias repetidas: es el síntoma que
   *     esta ola vino a reemplazar por la FUERZA.
   *   - `Template Method · inheritance-family` — **1 / 14 = 7,1 %
   *     [1,3 %, 31,5 %]**, 27 recomendaciones + 7 en `corpus-app/`. Pertenecer
   *     a una familia de herencia tampoco dice nada sobre secuencias
   *     repetidas: es la mitad estructural del patrón, presente en toda
   *     jerarquía.
   *
   * Las dos tienen n ≥ 12 y su Wilson entero por debajo del 20 % (la de
   * `inheritance-family` lo cruza por arriba, 31,5 %, y aun así el punto está
   * en 7,1 %: se apaga por la regla, que mira la precisión, no el borde del
   * intervalo). La excepción de R1 —"defecto concreto ARREGLADO Y MEDIDO en
   * esta misma ola"— NO aplica: el ancla nueva no es una corrección de
   * ninguna de las dos, es un reemplazo, y se mide aparte.
   *
   * PRECIO, MEDIDO Y PUBLICADO: 88 recomendaciones en los 13 repos (61 + 27)
   * y 27 en `corpus-app/` (20 + 7); **1 unidad de cobertura útil**, la única
   * verdadera de `inheritance-family`. `large-class` no cuesta ninguna: sus
   * 23 juicios son 23 falsos.
   *
   * REVERTIDO EN LA MISMA OLA: `large-class` e `inheritance-family` VUELVEN.
   * El proyecto mejora de forma ADITIVA —primero se suman verdaderas, la poda
   * de falsos viene después y con un criterio de costo/beneficio acordado—, y
   * el umbral del 20 % que las condenó no estaba validado contra el valor de
   * lo que se pierde. Sus números medidos quedan escritos arriba y son el
   * insumo de esa poda futura, no su justificación ahora.
   *
   * Anclas vivas: `large-class`, `inheritance-family`, `distributed-duplication`
   * (2 recs, 0/2 — NO MEDIDA por R3), `parallel-hierarchies` (0 recs),
   * `refused-bequest` (0 recs, NO MEDIDA) y
   * **`homonymous-divergent-sequence`, el ancla-FUERZA de esta ola** (44 recs
   * en los 13 repos, 14 en `corpus-app/`; 13/57 = 22,8 % [13,8 %, 35,2 %]
   * sobre las dos poblaciones, juzgadas ENTERAS por AC3).
   */
  anchors: ["distributed-duplication", "parallel-hierarchies", "refused-bequest", "homonymous-divergent-sequence", "large-class", "inheritance-family"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (problem.kind === SEQUENCE_ANCHOR_KIND) return buildFromSequenceAnchor(problem, graph, ctx);
    if (STRUCTURAL_ANCHOR_KINDS.has(problem.kind)) return buildFromStructuralAnchor(problem, ctx, graph);

    const effectiveGraph = graph ?? ctx.repo.graph;
    const index = effectiveGraph ? buildIndex(effectiveGraph) : null;
    const entries =
      problem.kind === "distributed-duplication"
        ? entriesFromDistributedDuplication(problem, ctx.repo, effectiveGraph, index)
        : entriesFromParallelHierarchies(problem, effectiveGraph, index ?? { nodeById: new Map(), edgesFrom: new Map() });

    const winning = bestGroup(entries);
    const structuralFacts = winning && index ? structuralAncestorFacts(index, winning.group, winning.group[0]!.methodName) : null;

    const templateMethodProblem: TemplateMethodProblem = {
      finding: problem,
      totalLocations: problem.locations.length,
      entries,
      winningGroup: winning?.group ?? null,
      winningAvgSimilarity: winning?.avgSimilarity ?? null,
      anchorKind: problem.kind,
      structuralFacts,
      hasInheritanceCapability: ctx.capabilities.has("herencia"),
    };

    const spec = buildSpec(ctx);
    const outcome = engineBuild(spec, ctx.capabilities, templateMethodProblem, effectiveGraph);
    if (!outcome) return null;

    const group = templateMethodProblem.winningGroup ?? [];
    const places: readonly RoleLocation[] =
      group.length > 0
        ? group.map((e, i) => ({ ...e.location, role: `"${e.unitName}" define "${e.methodName}"${i === 0 ? "" : " (copia)"}` }))
        : [problem.locations[0]];

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: costFor(ctx),
    });
  },
  /**
   * Ola 11a (P2) — segunda pasada (`hypotheses/run.ts#refreshHypotheses`,
   * desde `crossAnalyze`, DESPUÉS de construir el `NeighborhoodIndex` real):
   * SÓLO se llama sobre `perFileFindings` (`code-analyzer.ts:1942`) — es
   * decir, sólo sobre las anclas ESTRUCTURALES de esta hipótesis
   * (`large-class`/`refused-bequest`/`inheritance-family`, todas
   * `intra-file`); `distributed-duplication`/`parallel-hierarchies` son
   * `inter-file` y nunca llegan acá (su `build()` ya vio el vecindario real
   * — ver el docstring de `crossFileFamilyRecurrenceDiscriminator`).
   * Reusa el `TemplateMethodProblem` cacheado en `refreshState` por
   * `buildFromStructuralAnchor` (sin árbol vivo para recalcular la familia
   * de cero) y vuelve a correr SÓLO discriminadores/confianza — nunca
   * `state` ni los checks `required`/`applied` (contrato duro de
   * `engine.ts#refreshDiscriminators`) — EXCEPTO para el placeholder
   * DIFERIDO (`{ deferred: true }`, esta tarea): ver "EXCEPCIÓN DECLARADA"
   * en el docstring del módulo — ese placeholder nunca confirmó nada, así
   * que `resolveDeferredViaGraph` SÍ puede reemplazar `state`/checks
   * enteros, con el grafo real que `build()` nunca tuvo.
   */
  refresh(existing, problem, graph, ctx) {
    if (existing.state !== "ausente" && existing.state !== "parcial") return null;
    if (!STRUCTURAL_ANCHOR_KINDS.has(problem.kind)) return null; // nunca debería llegar acá — ver el docstring de arriba.
    const stored = existing.refreshState as TemplateMethodRefreshState | undefined;
    if (!stored) return null; // sin problema cacheado (hipótesis de una caché anterior a esta ola) — nada que reusar.
    if ("deferred" in stored) return resolveDeferredViaGraph(problem, stored, graph, ctx);
    const spec = buildSpec(ctx);
    return refreshDiscriminators(spec, existing, stored, graph);
  },
};
