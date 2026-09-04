/**
 * Hipótesis — Null Object (F6, migración de `findNullObjectOpportunities`,
 * `pattern-behavioral.ts:469`; reescrita en Ola 10, CONTRATO-F10.md, para las
 * TRES FORMAS del patrón + el excluder estructural).
 *
 * ── LAS TRES FORMAS (más la cuarta, `aplicado-eludido`) ────────────────────
 *
 *   - COMPLETA (`ya-aplicado`, NUNCA sugiere): existe un tipo N que
 *     `implements|satisfies` una interfaz I; `memberSignatures(N)` cubre
 *     TODOS los miembros de I por `(name, arity)`; CADA miembro de N tiene
 *     fan-out `calls` = 0 (cuerpo vacío o constante, confirmado por el
 *     grafo); y N tiene >=1 arista `instantiates` ENTRANTE (un sitio real que
 *     lo sustituye). Ver `findNullObjectStructuralCandidates` — es la TERNA
 *     de CONTRATO-F10.md §0.4 pero SIN el segundo eslabón que reenvía: acá N
 *     no llama a nadie (fan-out cero), no envuelve.
 *   - PARCIAL: existe N con fan-out `calls` = 0 en TODOS sus miembros y >=1
 *     `instantiates` entrante, pero SIN `implements|satisfies` hacia ninguna
 *     interfaz — un objeto vacío ad hoc, no intercambiable por tipo. Exacto
 *     el "candidato más cercano y no el ideal" que el autor original de este
 *     archivo declaró.
 *   - AUSENTE: el mismo concepto (una comparación contra ausente antes de
 *     invocar el mismo miembro) verificado en ≥3 unidades DISTINTAS no
 *     relacionadas — `NULL_OBJECT_MIN_OCCURRENCES`, vía `distributed-
 *     duplication`. Sin cambios de fondo respecto de la versión anterior.
 *   - `aplicado-eludido`: el mismo olor de guardas dispersas (AUSENTE, por
 *     AST) coexiste con un sustituto CONFIRMADO ESTRUCTURALMENTE (fan-out
 *     cero + instanciado) que comparte protocolo — la fachada existe y estos
 *     guards son evidencia de que algo la puentea.
 *
 * ── EL EXCLUDER DEJA DE MIRAR VOCABULARIO (requisito de la tarea) ──────────
 * Se retira `NULL_SIBLING_PREFIXES` (`/^(null|noop|no_op|empty|default|
 * guest|anonymous|blank)/i` sobre el NOMBRE del tipo candidato — vocabulario
 * puro). El reemplazo, exactamente el de CONTRATO-F10.md §3 (fila
 * `NULL_SIBLING_PREFIXES` / `EMPTINESS_WORD`): "fan-out `calls` = 0 en un
 * tipo que implementa I completa" para COMPLETA, y "fan-out `calls` = 0 +
 * `instantiates` entrante" para el sustituto AD HOC del excluder de
 * `aplicado-eludido`. El correlacionador entre "qué se guarda" y "qué
 * sustituto lo cubre" sigue siendo solapamiento de NOMBRE de miembro
 * (`protocolOverlap`) — eso NO es vocabulario de dominio (no hay ninguna
 * palabra en inglés/español escrita a mano): es `(name, arity)` vía
 * `memberSignatures`, la misma primitiva que el contrato autoriza
 * explícitamente para la terna de envoltura.
 *
 * ── OLA X (B6) — SEGUNDA ANCLA: `duplication` ──────────────────────────────
 * Medido (A2.md, 13 repos): la única ancla de este archivo, `distributed-
 * duplication`, entra con 10 candidatos y sale con 0 recomendaciones — 9 de
 * 10 mueren ANTES del `required` (build() cae a `null`, ver la ruta (2) más
 * abajo) y el décimo muere ahí. La causa NO es la falta de árboles vivos (el
 * mecanismo de reparse bajo demanda de R1/Ola D, ver abajo, sí trae el árbol):
 * es que `distributed-duplication` ubica CUALQUIER par de fragmentos
 * parecidos estructuralmente, sin importar SI el fragmento es un guard contra
 * ausencia — la filtro `dentroDeLaEvidencia` (ruta (2), más abajo) exige que
 * el guard-de-null encontrado por `scanFile` SOLAPE con el RANGO exacto que
 * el ancla reportó como duplicado, y la mayoría de la duplicación real de un
 * repo no es, de hecho, sobre guards de null — así que casi ningún candidato
 * de esta ancla tiene ADENTRO lo que esta hipótesis busca.
 *
 * `duplication` (`detect/inter-file/duplication.ts`) usa el MISMO índice de
 * huellas estructurales que `distributed-duplication` (`repo.clones`) — la
 * única diferencia entre las dos es si los archivos de la copia caen en la
 * MISMA componente conexa del grafo entre archivos o no (ver el docstring de
 * `distributed-duplication.ts`). Para ESTA hipótesis esa distinción no
 * importa nada: `build()` (abajo) es genérico sobre `problem: Finding` — no
 * inspecciona `problem.kind` en ningún punto — así que agregar `duplication`
 * como ancla no exige ninguna rama nueva, sólo AMPLÍA la población de
 * `Finding`s inter-file que pueden disparar la MISMA ruta (2), con la MISMA
 * exigencia de solapamiento. Ya lo comparten, con las MISMAS anclas o
 * parecidas, Command/Iterator/Proxy (`duplication` + `distributed-
 * duplication`) — compartir ancla es la norma de este proyecto
 * (`hypotheses/engine.ts#arbitrateRivalHypotheses` arbitra los rivales).
 *
 * ── OLA Y (Y1) — LO QUE LA OLA X COMPRÓ Y ESTA OLA DEVUELVE ────────────────
 * La segunda ancla dejó el patrón en **324 hipótesis / 282 recomendaciones y
 * 0 de 20 verdaderas** [0 %, 16 %] (integrador de la Ola X, muestra sorteada
 * con semilla 1805 abriendo los 20 archivos). Las dos causas que midió estaban
 * las dos escritas en ESTE archivo, y esta ola las cierra las dos:
 *
 *   1. **La ruta (1) filtraba por `relatedFiles`** —el vecindario a un salto—
 *      mientras la ruta (2) ya exigía SOLAPAMIENTO DE RANGO con la evidencia
 *      del ancla desde la Ola G. Era el mismo bug en la otra ruta, con el
 *      arreglo ya escrito: portado en `restrictToAnchorEvidence`.
 *   2. **`fan-out calls = 0` no es "cuerpo vacío"** — el hueco (c) de más
 *      abajo, declarado desde el principio. Ahora hay verificación POSITIVA
 *      del cuerpo por AST (`memberBodyVerdict`/`isNeutralBody`) más dos
 *      exclusiones estructurales (`isProtocolRootType`,
 *      `isDeclaredInterfaceType`) para la interfaz y la clase abstracta, cuyo
 *      fan-out cero es una TAUTOLOGÍA.
 *
 * ── DOS RUTAS DE EVIDENCIA, UNA SOLA `build()` ─────────────────────────────
 * `graph` (segundo parámetro de `build`, `ctx.repo.graph`) es REAL en el
 * cableado de producción de las dos anclas de hoy (`distributed-duplication`
 * y, OLA X, `duplication` — ambas `inter-file`), procesado dentro de
 * `attachHypotheses` en `crossAnalyze`,
 * DESPUÉS de que el grafo del repo se construyó — verificado leyendo
 * `code-analyzer.ts:1930`) — a diferencia de `ctx.file`/`ctx.fileAt`, que
 * siguen `null` siempre para este ancla (documentado en `hypotheses/run.ts`
 * y en `code-analyzer.ts:1927`: "LÍMITE QUE SIGUE ABIERTO para `null-object`
 * ... que necesitarían DOS archivos vivos a la vez"). Eso separa las dos
 * formas de evidencia de esta hipótesis en dos rutas independientes:
 *
 *   1. ESTRUCTURAL (nueva, esta ola) — `findNullObjectStructuralCandidates`
 *      sobre `graph`, SIN necesitar ningún árbol vivo. Es la que puede
 *      producir COMPLETA/PARCIAL en producción HOY, la primera vez que esta
 *      hipótesis deja de estar 100% inerte.
 *   2. AST-SCATTER (heredada) — `scanFile`/`groupIntoProblems` sobre
 *      `ctx.fileAt`, para AUSENTE/`aplicado-eludido` por concepto disperso.
 *      *** CORRECCIÓN, OLA G: esta ruta NO está inerte, y creerlo costó el
 *      bug 1. *** El texto de acá decía "sigue devolviendo `null` SIEMPRE en
 *      producción" porque necesita DOS archivos vivos a la vez. R1 (Ola D)
 *      cambió eso: `crossAnalyze` reparsea bajo demanda todo archivo que
 *      toque la evidencia de un `Finding` inter-file, y
 *      `distributed-duplication` —la única ancla de esta hipótesis hasta la
 *      Ola X (B6 agregó `duplication`, ver arriba, con el MISMO mecanismo)—
 *      ES inter-file. Medido: esta ruta es la que produce, hoy, TODAS las
 *      hipótesis vivas de Null Object del corpus. Ver la nota de la Ola G
 *      dentro de `build()` para el defecto que eso destapó y su arreglo.
 *
 * `build()` intenta (1) primero — repo-wide, no necesita concepto disperso
 * ni árbol vivo — y si no encuentra nada cae a (2). Si (2) SÍ tiene árboles
 * vivos (tests, o una ola futura que resuelva el límite), su propio
 * `appliedState` también usa el `graph` real para el excluder de
 * `aplicado-eludido` (ya no vocabulario).
 *
 * ── LO QUE (1) NO PUEDE CONFIRMAR, DECLARADO, NO ADIVINADO (requisito #3) ──
 * La definición de COMPLETA en la tarea agrega una cuarta cláusula: "los
 * clientes llaman `calls` a `sym:I.m` SIN rama de comparación contra nil
 * (`FunctionMetrics.chainHasNullCheck` falso en esos sitios)". Verificado
 * leyendo `code-analyzer.ts:1854` y su propio comentario: `repoUnit.functions`
 * va **VACÍO A PROPÓSITO** en el único cableado que llega a este ancla
 * ("ningún detector inter-file de hoy lee `repo.functions`... construirlo
 * de verdad pediría el nombre CRUDO de cada función, dato que `FileFacts` no
 * lleva") — así que `ctx.repo.functions` NUNCA tiene con qué resolver el
 * `chainHasNullCheck` de un llamador real en producción HOY. Por eso esa
 * cláusula queda como DISCRIMINADOR (sube confianza cuando se puede
 * verificar — tests, o una ola futura que llene `repo.functions`), nunca
 * como `required`: exigirla habría hecho que esta hipótesis NUNCA produzca
 * ni siquiera con la fixture propia (silencio, lo que la tarea prohíbe). El
 * techo de esta hipótesis se mantiene en `media` (nunca `alta`) precisamente
 * por esta y otras tres aproximaciones declaradas: (a) el riesgo A9 de
 * `satisfies` en C# (CONTRATO-F10.md §3, igual que `wrapping-chain.ts`); (b)
 * el alcance del rastreo estructural es TODO el grafo del repo, no sólo
 * el archivo/concepto de la duplicación que ancla esta hipótesis — un
 * Null Object completo en un rincón no relacionado del repo puede colgar de
 * un `distributed-duplication` sin relación semántica real con él (ahora a
 * propósito cuando ningún candidato relacionado califica, ver "REVISIÓN
 * POST-DIAGNÓSTICO DEL EMBUDO" más abajo — la alternativa medida era
 * silencio total); y (c) — VERIFICADO A MANO, no hipotético
 * (`scripts/measure-null-object-structural.mts` sobre una fixture propia con
 * `console.log`/`console.warn` reales): una llamada a una función NO
 * RESUELTA por el grafo (un builtin como `console.log`, una API externa)
 * nunca produce una arista `calls` — exactamente el mismo hueco que hace que
 * un candidato sin destino resuelto no llegue a arista en absoluto en el
 * resto del grafo — así que un miembro con cuerpo real pero SIN NINGUNA
 * llamada RESUELTA lee fan-out=0 igual que un cuerpo textualmente vacío.
 * Medido: en la fixture propia, `ConsoleLogger` (que sí imprime) calificó
 * como candidato COMPLETA exactamente igual que `NoOpLogger` — los dos se
 * "satisfacen" mutuamente porque ninguno tiene fan-out `calls` resuelto.
 * Fan-out cero es "sin llamadas que el grafo pudo resolver", NO "cuerpo
 * vacío" — declarado en `toConfirm`, no oculto. ESTRECHADO (no cerrado) por
 * `MAX_TRIVIAL_MEMBER_SPAN` más abajo, que exige además que el cuerpo quepa
 * en pocas líneas físicas: descarta el caso de VARIAS líneas de lógica real
 * detrás de llamadas no resueltas (medido en el corpus: `Folder`/`Lead` en
 * Rails, cinco clases más en TS), pero NO el de un único statement que
 * llama a un builtin (`ConsoleLogger` de la fixture sigue calificando —
 * mismo span que un cuerpo trivial de una línea, indistinguibles por
 * conteo). Declarado en el `why` de cada hipótesis producida por esta ruta,
 * no escondido.
 *
 * ── OLA AE (AE10) — TERCERA ANCLA: `repeated-absence-check`, LA ANCLA-FUERZA ─
 * Medido por AE10 sobre volcados propios del día, en las DOS poblaciones y por
 * separado: **Null Object construye 5 hipótesis en los 13 repos (las 5
 * `ausente`) y 38 en las 8 aplicaciones de `corpus-app/` (31 `ausente`, 7
 * `parcial`); `distributed-duplication` no construye NI UNA en ninguna de las
 * dos** (0 sobre 10 hallazgos crudos en biblioteca, 0 sobre 30 en aplicación).
 * Y en toda la historia del proyecto el patrón lleva **0 recomendaciones
 * juzgadas verdaderas** (Ola AD, integrador §1.2: 0/3 y 0/2).
 *
 * `ausente` NO es cero acá —ésta no es la patología de Facade/Decorator—, pero
 * la causa de fondo es de la misma familia: **las dos anclas de hoy preguntan
 * por CÓDIGO DUPLICADO y la fuerza de Null Object es que el CHEQUEO esté
 * REPETIDO.** Este mismo archivo lo dejó escrito en su §OLA X ("`distributed-
 * duplication` ubica CUALQUIER par de fragmentos parecidos estructuralmente,
 * sin importar SI el fragmento es un guard contra ausencia... casi ningún
 * candidato de esta ancla tiene ADENTRO lo que esta hipótesis busca") y la
 * ruta (2) tiene que exigir, desde la Ola G, que el guard SOLAPE EN RANGO con
 * la copia que el ancla reportó. O sea: hoy sólo se ven los chequeos que, por
 * casualidad, caen dentro de código clonado. Cinco clientes que preguntan lo
 * mismo y cada uno hace algo DISTINTO no son duplicación y son invisibles.
 *
 * `detect/inter-file/repeated-absence-check.ts` (AE10) es el ancla que sí
 * pregunta por la fuerza: el MISMO colaborador (identidad por receptor o por
 * tipo dueño, nunca por nombre desnudo) chequeado contra ausente en >= 4
 * funciones de >= 2 archivos, con >= 1 mensaje que el grafo resuelve a un
 * miembro de un tipo, y SIN que exista ya un objeto neutro instanciado que
 * cubra ese protocolo. Su camino de entrada acá es PROPIO y está detrás de
 * `if (problem.kind === "repeated-absence-check")`: no toca ni un `required`,
 * ni un discriminador, ni una rama de `appliedState` de las dos rutas viejas,
 * que siguen exactamente como estaban.
 *
 * ── FORMA EN LENGUAJES SIN CLASES ───────────────────────────────────────────
 * La ruta estructural (1) usa `family === "class-like"` del grafo — mismo
 * vocabulario para clases, structs (Go) e interfaces (ninguna distinción
 * entre "interfaz declarada" y "tipo concreto" existe en `SymbolFamily`, ver
 * `graph/edges/satisfies-derive.ts`), así que cubre Go sin caso especial. La
 * ruta AST-scatter (2) sigue el criterio previo: agrupa por función
 * contenedora, no por clase — cubre closures/funciones sueltas.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { CONSTRUCTOR_NAMES } from "../code-grammar.js";
import type { AstNode, CloneCandidate, FileUnit, Finding, RepoFunctionUnit, RoleLocation } from "../detect/types.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { ausenciasRepetidas, UMBRALES_AUSENCIA_REPETIDA, type AusenciaRepetida } from "../detect/inter-file/repeated-absence-check.js";
import { walkTree } from "../detect/tree-walk.js";
import {
  memberSignatures,
  symbolNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type MemberSignature,
} from "../graph/types.js";
import { build as engineBuild, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/** [provisional], heredado tal cual de la regla vieja (`pattern-behavioral.ts:466`) — no re-derivado contra el corpus externo todavía (K2). */
const NULL_OBJECT_MIN_OCCURRENCES = 3;

export interface NullGuardOccurrence {
  file: string;
  /** Función/método que contiene el guard — nunca "clase", ver docstring §forma sin clases. */
  memberName: string;
  guardedName: string;
  /** `false` cuando el guard es negación truthy (`!x`) — señal más débil. */
  strict: boolean;
  /**
   * P4 (precisión medida en corpus): `true` cuando el nombre guardado, ANTES
   * de `stripSelfPrefix`, era un acceso a ATRIBUTO — CUALQUIER ruta con punto
   * (`self.x`/`this.x`/`s.field`/`ctx.Value`, el receptor de Go/Java/C#/etc.,
   * que no se llama "self"/"this") o el ivar de Ruby (`@x`) — ver
   * `isMemberAccessName`. Nunca sólo un identificador suelto (parámetro/
   * variable local). Ver `atLeastOneMemberAccessGuard` más abajo.
   */
  isMemberAccess: boolean;
  startLine: number;
  endLine: number;
}

export interface CandidateSubstitute {
  unitName: string;
  file: string;
  memberNames: readonly string[];
}

export interface NullGuardScatterProblem {
  conceptName: string;
  /** Ya filtrado: >= NULL_OBJECT_MIN_OCCURRENCES unidades DISTINTAS (archivo#miembro). */
  occurrences: readonly NullGuardOccurrence[];
  /** Unidades-tipo visibles en el mismo alcance que las ocurrencias — para el excluder por concepto. */
  substitutesInScope: readonly CandidateSubstitute[];
}

/* ════════════════════════════════════════════════════════════════════════
 * §A — Índice estructural sobre el grafo, compartido por las dos rutas de
 * evidencia (excluder de `aplicado-eludido` de la ruta AST-scatter, y la
 * búsqueda repo-wide de la ruta estructural). Duplicado a propósito respecto
 * de índices análogos en `wrapping-chain.ts`/`chain-of-responsibility.ts`
 * (mismo criterio ya documentado ahí: cada hipótesis arma el suyo, sin
 * fábrica compartida).
 * ════════════════════════════════════════════════════════════════════════ */

export interface NullObjectGraphIndex {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly instantiatesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly callsTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /**
   * OLA Y (Y1) — aristas de SUBTIPADO que ENTRAN a un tipo (`extends`,
   * `implements`, `satisfies`, `mixes-in`): quién declara ser un subtipo/
   * implementador DE él. Es la lectura inversa de `interfacesOfImplementer`,
   * y existe para una sola pregunta: ¿este tipo es el PROTOCOLO (alguien lo
   * extiende/implementa) o la HOJA que lo cumple? Ver
   * `isProtocolRootType`.
   */
  readonly subtypedBy: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /**
   * OLA U (N3) — ADITIVO, opcional. Accessor a árbol vivo por ruta, cuando
   * quien arma el índice lo tiene a mano (`ctx.fileAt`) — usado SÓLO por
   * `isGuardOnlyMember` (ver más abajo) para refinar `callFanOut`: distinguir
   * "el cuerpo hace algo" de "el cuerpo sólo valida su propio argumento".
   * `null` (el default, y el único valor que tenían TODOS los llamadores
   * antes de esta ola) ⇒ ese refinamiento no corre, comportamiento IDÉNTICO
   * al de antes — nunca empeora nada, sólo mejora cuando hay árbol.
   */
  readonly fileAt: ((path: string) => FileUnit | null) | null;
}

export function buildNullObjectIndex(graph: CodeGraph, fileAt: ((path: string) => FileUnit | null) | null = null): NullObjectGraphIndex {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const instantiatesTo = new Map<string, CodeGraphEdge[]>();
  const callsTo = new Map<string, CodeGraphEdge[]>();
  const subtypedBy = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const from = edgesFrom.get(e.from);
    if (from) from.push(e);
    else edgesFrom.set(e.from, [e]);

    if (e.kind === "instantiates") {
      const list = instantiatesTo.get(e.to);
      if (list) list.push(e);
      else instantiatesTo.set(e.to, [e]);
    }
    if (e.kind === "calls") {
      const list = callsTo.get(e.to);
      if (list) list.push(e);
      else callsTo.set(e.to, [e]);
    }
    if (SUBTYPE_EDGE_KINDS.has(e.kind)) {
      const list = subtypedBy.get(e.to);
      if (list) list.push(e);
      else subtypedBy.set(e.to, [e]);
    }
  }
  return { nodeById, edgesFrom, instantiatesTo, callsTo, subtypedBy, fileAt };
}

/** Las cuatro aristas con las que la gramática (o la cascada) dice "X es un subtipo de Y" — ver `NullObjectGraphIndex.subtypedBy`. */
const SUBTYPE_EDGE_KINDS: ReadonlySet<string> = new Set(["extends", "implements", "satisfies", "mixes-in"]);

function asGraphIndexFacade(index: NullObjectGraphIndex): { nodeById: (id: string) => CodeGraphNode | null; edgesFrom: (id: string) => readonly CodeGraphEdge[] } {
  return { nodeById: (id) => index.nodeById.get(id) ?? null, edgesFrom: (id) => index.edgesFrom.get(id) ?? [] };
}

/** Id del nodo símbolo del miembro `(name, arity)` de `ownerId`, leído de la MISMA arista `contains` que `memberSignatures` recorre. */
function memberNodeId(index: NullObjectGraphIndex, ownerId: string, name: string, arity: number | null): string | null {
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (
      target?.kind === "symbol" &&
      target.family === "function-like" &&
      target.symbolPath[target.symbolPath.length - 1] === name &&
      (target.arity ?? null) === arity
    ) {
      return target.id;
    }
  }
  return null;
}

/** Cantidad de aristas `calls` SALIENTES de un miembro — 0 ⇒ cuerpo vacío/constante (estructural, no de texto). */
function callFanOut(index: NullObjectGraphIndex, memberId: string): number {
  return (index.edgesFrom.get(memberId) ?? []).filter((e) => e.kind === "calls").length;
}

/**
 * ¿`name` es el constructor de un tipo cuyo último segmento es `ownerName`?
 * Grafo/gramática, no vocabulario de dominio — mismos DOS mecanismos que
 * `builder.ts#isConstructorMember` (duplicado a propósito acá, ver §A del
 * docstring del módulo: "cada hipótesis arma su propio índice, sin fábrica
 * compartida" — `builder.ts` no exporta el suyo): (A) nombre mandado por la
 * gramática (`CONSTRUCTOR_NAMES`, `code-grammar.ts` — Ruby `initialize`,
 * Python `__init__`, JS/TS/Vue `constructor`, keyword-literal, no una
 * convención de estilo); (B) mismo nombre que el tipo contenedor (Java/C#,
 * donde `constructor_declaration` se registra con el nombre de la clase).
 * El constructor NUNCA es parte del "protocolo" que un cliente intercambia
 * polimórficamente (nadie llama `new N().constructor()` como parte del uso
 * normal) — por eso se excluye de "vacío" acá, no en `memberSignatures`
 * (que es genérica, la usan otras 5 hipótesis con un criterio propio).
 */
function isConstructorMemberName(name: string, ownerName: string | undefined): boolean {
  if (CONSTRUCTOR_NAMES.has(name.toLowerCase())) return true;
  return ownerName !== undefined && name === ownerName;
}

/**
 * [provisional], piso declarado (mismo estatus que `NULL_OBJECT_MIN_
 * OCCURRENCES` — no re-derivado contra el corpus externo todavía, K2).
 * `endLine - startLine` de CADA miembro no puede superar esto para que su
 * cuerpo cuente como "trivial/constante, confirmado por el grafo" — ESTRECHA
 * (no cierra del todo, ver más abajo) el hueco declarado (c) del docstring
 * del módulo ("fan-out calls=0 significa 'sin llamadas RESUELTAS', no
 * 'cuerpo vacío'"): un método real de VARIAS líneas que sólo llama builtins/
 * framework sin resolver (`errors.add`, `this.db.prepare(...).run(...)`,
 * `setInterval`) también lee fan-out=0, pero casi nunca cabe en 3 líneas
 * físicas. MEDIDO a mano en los dos corpus de este frente (ver informe): el
 * candidato estructural VERDADERO (`FakeRackSession`, Rails) tiene sus dos
 * miembros en spans 0 y 2; los TRES candidatos DESCARTADOS a mano en esos
 * mismos dos corpus (`Folder`/`Lead` en Rails, `CodeDecisionsRepository`/
 * `CodeGraphRepository`/`AgentActivityMonitor`/`UnionFind`/`EventsHub` en TS)
 * tienen SIEMPRE al menos un miembro con span >= 4 — deja margen, no un
 * corte al borde. NO CIERRA el caso de UN SOLO statement que llama a un
 * builtin sin resolver (`log(msg) { console.log(msg); }` — mismo span que
 * `enabled?() { return false; }`, indistinguibles por conteo de líneas):
 * ESE residuo del hueco (c) sigue abierto, declarado igual que antes, no
 * escondido — separarlo exigiría saber QUÉ es lo no resuelto, y eso sí
 * sería vocabulario. Ausente `startLine`/
 * `endLine` (grafo sintético de tests, o un grafo de antes de que F2
 * emitiera posición) NO descalifica — permisivo cuando no hay dato con qué
 * medir, mismo criterio que el resto de este módulo ante campos opcionales
 * ausentes (`arity`/`visibility`).
 */
const MAX_TRIVIAL_MEMBER_SPAN = 2;

function hasTrivialSpan(node: CodeGraphNode | null): boolean {
  if (!node || node.startLine === undefined || node.endLine === undefined) return true;
  return node.endLine - node.startLine <= MAX_TRIVIAL_MEMBER_SPAN;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA U (N3) — BUG VERIFICADO: "fan-out `calls` = 0" confunde "hace
 * validación defensiva" con "tiene comportamiento". Caso canónico,
 * autodocumentado como Null Object, hoy invisible por esto:
 * `guava/guava/src/com/google/common/io/CharStreams.java:292-349`,
 * `NullWriter.write(char[] cbuf) { checkNotNull(cbuf); }` — el javadoc de la
 * clase dice literalmente "simply discards written chars" y "singleton
 * writer", pero `checkNotNull(cbuf)` es una arista `calls` real (fan-out=1),
 * así que `isStructurallyEmpty` descalificaba al tipo ENTERO.
 *
 * INTENCIÓN QUE VERIFICAN LAS FUNCIONES DE ABAJO: dado un miembro con fan-out
 * `calls` > 0, ¿esa llamada es COMPORTAMIENTO (algo que un cliente podría
 * observar) o sólo una GUARDA que valida su propio argumento sin
 * transformarlo y descarta el resultado? Reconocible por estructura, sin
 * nombrar ninguna función de ningún framework (`checkNotNull`/
 * `requireNonNull` NUNCA se comparan por nombre acá): el cuerpo entero del
 * miembro tiene que ser, statement por statement, una llamada cuyo ÚNICO
 * argumento es (textualmente, sin transformar) uno de los parámetros PROPIOS
 * del miembro. Cualquier otra forma (asignación, `return` de un valor,
 * condicional, más de un argumento, un argumento que NO es exactamente un
 * parámetro propio) descalifica el CUERPO ENTERO — conservador a propósito:
 * esto sólo AGREGA candidatos que el fan-out crudo rechazaba, nunca oculta
 * comportamiento real.
 *
 * Requiere árbol vivo del archivo del miembro (`index.fileAt`, NUEVO este
 * ola) — si no hay árbol, esta refinación no corre y el comportamiento es
 * IDÉNTICO al de antes (fan-out > 0 sigue descalificando).
 * ──────────────────────────────────────────────────────────────────────── */

const EXPRESSION_STATEMENT_TYPE = /(^|_)expression_statement$/;
/** Nodo-llamada por tipo de gramática — duplicado a propósito respecto de `CALL_NODE_TYPE`/`CALL_NODE_TYPES` de `decorator.ts`/`proxy.ts`/`observer.ts`/`chain-of-responsibility.ts` (mismo criterio, ver §A del docstring del módulo), con `invocation_expression` (C#) agregado — verificado con una sonda directa contra los 5 wasm de este corpus (Java=`method_invocation`, C#=`invocation_expression`, Ruby/Python=`call`, Go/TS/JS=`call_expression`). */
const GUARD_CALL_NODE_TYPES = new Set(["call", "call_expression", "method_invocation", "invocation_expression"]);

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** Duplicado a propósito de `observer.ts#argumentsOf` (mismo criterio de independencia entre hipótesis, §A del docstring del módulo). */
function argumentsOf(call: AstNode): readonly AstNode[] {
  const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
  return args ? namedChildren(args) : [];
}

/** Duplicado a propósito de `decorator.ts#paramNameOf`/`functionParamNames` (misma razón), SIN el receptor Go: acá el argumento guardado es un parámetro declarado, nunca el receptor (ver el docstring de la sección). */
function paramNameOf(node: AstNode): string | null {
  if (node.type === "identifier") return node.text;
  const named =
    (node.childForFieldName("name") as AstNode | null) ??
    (node.childForFieldName("pattern") as AstNode | null) ??
    (node.childForFieldName("left") as AstNode | null);
  if (named) return named.text;
  for (const c of namedChildren(node)) if (c.type === "identifier") return c.text;
  return null;
}

function functionParamNames(fnNode: AstNode): ReadonlySet<string> {
  const names = new Set<string>();
  const paramList = (fnNode.childForFieldName("parameters") as AstNode | null) ?? (fnNode.childForFieldName("parameter_list") as AstNode | null);
  if (paramList) {
    for (const child of namedChildren(paramList)) {
      const name = paramNameOf(child);
      if (name) names.add(name);
    }
  }
  return names;
}

/** `true` si `node` ES una llamada cuyo único argumento es, textualmente, uno de `ownParams` sin transformar — la forma exacta de `checkNotNull(cbuf)`. */
function isGuardOnlyCall(node: AstNode, ownParams: ReadonlySet<string>): boolean {
  if (!GUARD_CALL_NODE_TYPES.has(node.type)) return false;
  const args = argumentsOf(node);
  if (args.length !== 1) return false;
  return ownParams.has(args[0]!.text.trim());
}

/**
 * `true` si TODOS los statements de nivel superior de `bodyNode` (sin bajar
 * a una función/closure anidada) son, cada uno, una llamada de guarda
 * (`isGuardOnlyCall`) — posiblemente envuelta en un `expression_statement`.
 * `false` (nunca "sin evidencia") si el cuerpo está vacío de statements
 * reales (un cuerpo TRUE-vacío ya cuenta con fan-out=0 por el camino normal,
 * no necesita esta ruta) o si CUALQUIER statement no matchea exactamente esa
 * forma — un `return`, una asignación, una condición, u otra llamada con más
 * de un argumento o cuyo argumento no es un parámetro propio sin transformar
 * descalifican el CUERPO ENTERO, no sólo esa línea.
 *
 * IMPRECISIÓN DECLARADA (mismo espíritu que `ConsoleLogger` en el docstring
 * del módulo, "LO QUE (1) NO PUEDE CONFIRMAR"): esta función NO compara el
 * NOMBRE del callee (`checkNotNull`/`requireNonNull` nunca se nombran acá,
 * sería léxico de dominio) — así que una llamada de UN SOLO argumento propio
 * sin transformar que SÍ hiciera algo observable con nombre distinto
 * (`log(cbuf)`, misma forma exacta que `checkNotNull(cbuf)`) es
 * estructuralmente INDISTINGUIBLE de una guarda y también calificaría. Es el
 * mismo trueque que el propio encargo acepta ("reconocible por estructura",
 * sin nombrar la función) — acotado, no eliminado, por exigir que el
 * argumento sea EXACTAMENTE un parámetro propio sin transformar: una
 * transformación (`cbuf.length`), un segundo argumento, o cualquier statement
 * que NO sea una llamada (una asignación, un `return`, una mutación) siguen
 * descalificando el cuerpo entero.
 */
function isGuardOnlyBody(bodyNode: AstNode, sets: DerivedNodeSets, ownParams: ReadonlySet<string>): boolean {
  if (ownParams.size === 0) return false;
  let sawAny = false;
  for (const stmt of namedChildren(bodyNode)) {
    if (sets.functionNodes.has(stmt.type)) return false;
    const target = EXPRESSION_STATEMENT_TYPE.test(stmt.type) ? (namedChildren(stmt)[0] ?? stmt) : stmt;
    if (!isGuardOnlyCall(target, ownParams)) return false;
    sawAny = true;
  }
  return sawAny;
}

/** El nodo función/método de `sets.functionNodes` cuya línea de inicio coincide EXACTAMENTE con `startLine` — mismo criterio que `state.ts#findSwitchAt` (nombre a nodo del ÁRBOL, no del grafo, acá). */
function findFunctionNodeAt(root: AstNode, functionNodes: ReadonlySet<string>, startLine: number): AstNode | null {
  let found: AstNode | null = null;
  walkTree(root, (node) => {
    if (found || !node.isNamed || !functionNodes.has(node.type)) return;
    const real = node as AstNode;
    if (real.startPosition.row + 1 === startLine) found = real;
  });
  return found;
}

/**
 * `true` si, con árbol vivo disponible (`index.fileAt`), el miembro `node`
 * resulta ser una guarda pura (ver `isGuardOnlyBody`) — el refinamiento que
 * hace que un fan-out `calls` > 0 NO descalifique por sí solo. `false` sin
 * árbol vivo, sin nodo función localizable, o sin cuerpo — nunca se afirma
 * "es una guarda" sin evidencia positiva, mismo criterio que el resto del
 * módulo.
 */
function isGuardOnlyMember(index: NullObjectGraphIndex, node: CodeGraphNode | null): boolean {
  if (!index.fileAt || !node || node.startLine === undefined) return false;
  const file = index.fileAt(node.file);
  if (!file) return false;
  const fnNode = findFunctionNodeAt(file.root, file.sets.functionNodes, node.startLine);
  if (!fnNode) return false;
  const bodyNode = fnNode.childForFieldName("body") as AstNode | null;
  if (!bodyNode) return false;
  const ownParams = functionParamNames(fnNode);
  return isGuardOnlyBody(bodyNode, file.sets, ownParams);
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA Y (Y1) — "FAN-OUT `calls` = 0" NO ES "CUERPO VACÍO", Y ES LA MITAD DE
 * LOS FALSOS MEDIDOS. El docstring del módulo ya lo declaraba en su hueco (c)
 * y el `toConfirm` #1 de la propia hipótesis lo repetía; con el ancla
 * `distributed-duplication` (10 candidatos en 13 repos) no se notaba, con
 * `duplication` (1.088) se volvió el caso dominante. El integrador de la Ola X
 * lo midió abriendo 20 archivos reales: `AtomicStaler` (hugo) hace
 * `atomic.AddUint32`, `AccessDeniedError` hace `fmt.Sprintf`, `KafkaContext`
 * (nest) son seis getters que indexan un arreglo, `OptionsPartition` hace
 * aritmética — NINGUNA de esas llamadas/expresiones resuelve a una arista
 * `calls`, así que las cuatro leían fan-out 0.
 *
 * INTENCIÓN QUE VERIFICAN LAS DOS FUNCIONES DE ABAJO: no "¿el grafo resolvió
 * alguna llamada?" (una pregunta sobre el GRAFO) sino "¿el cuerpo escrito no
 * hace nada observable?" (una pregunta sobre el CÓDIGO). Un cuerpo es NEUTRO
 * si cada statement de nivel superior es, por gramática:
 *   · nada (bloque sin statements — el `void log(msg) {}` del patrón);
 *   · un `return` sin valor, o de una CONSTANTE (un nodo hoja de la gramática
 *     que no es un identificador: `false`, `0`, `""`, `nil`, `null`, `None`,
 *     `pass`), incluida la forma sin `return` explícito de Ruby;
 *   · una guarda pura (`isGuardOnlyBody`, Ola U — `checkNotNull(param)`).
 * Cualquier otra cosa —una llamada con receptor, un índice, una aritmética,
 * una asignación, una lectura de campo— descalifica el CUERPO ENTERO. Se pide
 * evidencia POSITIVA: sin cuerpo (declaración abstracta o de interfaz) es
 * descalificación, no permiso.
 *
 * CUÁNDO CORRE: sólo con árbol vivo (`index.fileAt`). Si quien armó el índice
 * no trajo accesor —grafos sintéticos de test, y todo llamador anterior a la
 * Ola U— esta verificación NO corre y el comportamiento es IDÉNTICO al de
 * antes (mismo criterio que `isGuardOnlyMember` y que `hasTrivialSpan`:
 * permisivo cuando no hay con qué medir). En producción `ctx.fileAt` SIEMPRE
 * es una función, y desde esta ola el candidato tiene que solapar con la
 * evidencia del ancla (`restrictToAnchorEvidence`), o sea que su archivo está
 * entre los que `crossAnalyze` reparsea: el árbol está.
 * ──────────────────────────────────────────────────────────────────────── */

/** Un identificador desnudo NUNCA es una constante — devolver un parámetro o un campo es comportamiento, no neutralidad. Los cinco nombres son de GRAMÁTICA (`identifier`, `field_identifier`, `type_identifier`, `property_identifier`, `package_identifier`), no vocabulario de dominio. */
const IDENTIFIER_NODE_TYPE = /(^|_)identifier$/;
const RETURN_STATEMENT_TYPE = /(^|_)return_statement$/;
/** Envoltorios de UN solo hijo que la gramática interpone sin decidir nada: `expression_list` (el `return nil` de Go), `parenthesized_expression`, `argument`. */
const SINGLE_CHILD_WRAPPER_TYPE = /(^|_)(list|parenthesized_expression|expression)$/;

/** Desenvuelve los envoltorios de un solo hijo (ver `SINGLE_CHILD_WRAPPER_TYPE`) — nunca atraviesa una llamada. */
function unwrapSingle(node: AstNode): AstNode {
  let cur = node;
  for (let i = 0; i < 4; i++) {
    if (GUARD_CALL_NODE_TYPES.has(cur.type)) return cur;
    if (!SINGLE_CHILD_WRAPPER_TYPE.test(cur.type)) return cur;
    const kids = namedChildren(cur);
    if (kids.length !== 1) return cur;
    cur = kids[0]!;
  }
  return cur;
}

/**
 * `true` si `node` es una CONSTANTE de la gramática: una hoja con nombre (sin
 * ningún hijo con nombre) cuyo tipo no es un identificador. Cubre sin nombrar
 * ningún lenguaje `false`/`true`/`nil`/`null`/`null_literal`/`none`/
 * `pass_statement`/`decimal_integer_literal`/`string_literal` vacío. NO cubre
 * `this.x` (dos hijos), `a[0]` (dos hijos), `f()` (dos hijos), `a + b` (dos
 * hijos) ni `x` a secas (identificador) — que es exactamente lo que se quiere
 * descartar.
 */
function isConstantExpression(node: AstNode): boolean {
  const n = unwrapSingle(node);
  if (IDENTIFIER_NODE_TYPE.test(n.type)) return false;
  return namedChildren(n).length === 0;
}

/** `true` si el statement es un `return` sin valor o de una constante — incluida la forma implícita de Ruby (una constante suelta como último statement). */
function isNeutralStatement(stmt: AstNode, sets: DerivedNodeSets, ownParams: ReadonlySet<string>): boolean {
  if (sets.functionNodes.has(stmt.type)) return false;
  const target = EXPRESSION_STATEMENT_TYPE.test(stmt.type) ? (namedChildren(stmt)[0] ?? stmt) : stmt;
  if (isGuardOnlyCall(target, ownParams)) return true;
  if (RETURN_STATEMENT_TYPE.test(target.type)) {
    const kids = namedChildren(target);
    if (kids.length === 0) return true; // `return;` / `return`
    return kids.length === 1 && isConstantExpression(kids[0]!);
  }
  return isConstantExpression(target);
}

/** `true` si TODOS los statements de nivel superior son neutros (ver `isNeutralStatement`). Un cuerpo SIN statements es neutro — es el caso canónico del patrón. */
function isNeutralBody(bodyNode: AstNode, sets: DerivedNodeSets, ownParams: ReadonlySet<string>): boolean {
  for (const stmt of namedChildren(bodyNode)) {
    if (!isNeutralStatement(stmt, sets, ownParams)) return false;
  }
  return true;
}

/**
 * `true` si el miembro `node` tiene, con árbol vivo, un cuerpo NEUTRO
 * (`isNeutralBody`). `false` sin nodo función localizable — no se afirma
 * "vacío" sobre un miembro que no se pudo ubicar en el árbol.
 *
 * SIN CAMPO `body` ⇒ NEUTRO, y hay que decir por qué, porque es contraintuitivo
 * y es un residuo declarado: **una gramática no distingue "cuerpo vacío" de
 * "sin cuerpo" por este campo**. Verificado con una sonda directa contra los
 * wasm de este corpus: Ruby parsea `def greeting \n end` —un cuerpo vacío
 * REAL, el caso canónico del patrón— como un `method` SIN campo `body`,
 * exactamente igual que Java parsea `void f();` (declaración abstracta). Usar
 * la ausencia del campo como descalificación apagaría el caso verdadero en
 * Ruby para atrapar el falso en Java. El falso de Java lo atrapan, antes y por
 * estructura, `isProtocolRootType` e `isDeclaredInterfaceType`: un método
 * abstracto o de interfaz vive en un tipo que alguien extiende/implementa o
 * que la gramática declaró interfaz.
 *
 * PRECONDICIÓN: `index.fileAt` no nulo y el archivo resuelve (lo comprueba
 * `memberBodyVerdict`).
 */
function hasNeutralBody(file: FileUnit, node: CodeGraphNode): boolean {
  if (node.startLine === undefined) return false;
  const fnNode = findFunctionNodeAt(file.root, file.sets.functionNodes, node.startLine);
  if (!fnNode) return false;
  const bodyNode = fnNode.childForFieldName("body") as AstNode | null;
  if (!bodyNode) return true;
  return isNeutralBody(bodyNode, file.sets, functionParamNames(fnNode));
}

/**
 * Veredicto del cuerpo de un miembro: `"neutro"` / `"con-comportamiento"` /
 * `"sin-arbol"`. El tercero es el ÚNICO caso permisivo, y sólo existe para los
 * llamadores sin accesor a árbol (tests con grafos sintéticos): en producción
 * `fileAt` siempre es una función.
 */
function memberBodyVerdict(index: NullObjectGraphIndex, node: CodeGraphNode | null): "neutro" | "con-comportamiento" | "sin-arbol" {
  if (!index.fileAt) return "sin-arbol";
  if (!node) return "con-comportamiento";
  const file = index.fileAt(node.file);
  if (!file) return "con-comportamiento";
  return hasNeutralBody(file, node) ? "neutro" : "con-comportamiento";
}

/**
 * `true` si TODOS los miembros NO-CONSTRUCTOR de `ownerId` (>=1) tienen
 * fan-out `calls` = 0 —O, nuevo esta ola, son una guarda pura confirmada por
 * AST (`isGuardOnlyMember`: el fan-out existe, pero es sólo
 * `checkNotNull(param)`, no comportamiento)— Y un cuerpo de span trivial
 * (`hasTrivialSpan`) — el reemplazo estructural exacto de
 * `NULL_SIBLING_PREFIXES`/`EMPTINESS_WORD` (CONTRATO-F10.md §3), AHORA con el
 * segundo eslabón que el hueco declarado (c) pedía (ver
 * `MAX_TRIVIAL_MEMBER_SPAN`). Un tipo sin ningún miembro propio DISTINTO DE
 * SU CONSTRUCTOR (`memberSignatures` vacío tras filtrar el constructor) no
 * cuenta: "vacío" exige que haya algo que verificar como vacío — construir
 * el tipo no es "protocolo", y una clase que SÓLO construye (un `Error` con
 * un `constructor(message)` y nada más) no es un candidato de ninguna forma.
 */
function isStructurallyEmpty(index: NullObjectGraphIndex, ownerId: string): { empty: boolean; members: readonly MemberSignature[] } {
  const gi = asGraphIndexFacade(index);
  const owner = index.nodeById.get(ownerId);
  const ownerName = owner && owner.symbolPath.length > 0 ? owner.symbolPath[owner.symbolPath.length - 1] : undefined;
  const members = memberSignatures(gi, ownerId).filter((m) => !isConstructorMemberName(m.name, ownerName));
  if (members.length === 0) return { empty: false, members };
  for (const m of members) {
    const id = memberNodeId(index, ownerId, m.name, m.arity);
    if (!id) return { empty: false, members };
    const node = index.nodeById.get(id) ?? null;
    if (callFanOut(index, id) > 0 && !isGuardOnlyMember(index, node)) return { empty: false, members };
    if (!hasTrivialSpan(node)) return { empty: false, members };
    // OLA Y (Y1): el fan-out del grafo dice "ninguna llamada RESUELTA"; el
    // árbol dice si el cuerpo hace algo. Sin árbol (`"sin-arbol"`) no corre.
    if (memberBodyVerdict(index, node) === "con-comportamiento") return { empty: false, members };
  }
  return { empty: true, members };
}

function describeNode(index: NullObjectGraphIndex, id: string): string {
  const n = index.nodeById.get(id);
  if (!n) return id;
  return n.symbolPath.length > 0 ? `${n.file}#${n.symbolPath.join(".")}` : n.file;
}

/* ════════════════════════════════════════════════════════════════════════
 * §B — Ruta ESTRUCTURAL (nueva, esta ola): COMPLETA/PARCIAL repo-wide, sin
 * necesitar ningún árbol vivo — ver docstring del módulo, "DOS RUTAS".
 * ════════════════════════════════════════════════════════════════════════ */

const INTERFACE_EDGE_KINDS = new Set(["implements", "satisfies"]);

/**
 * OLA Y (Y1) — DOS EXCLUSIONES QUE SEPARAN "EL PROTOCOLO" DE "LA HOJA NEUTRA".
 * Medido por el integrador de la Ola X abriendo los archivos: entre los 20
 * falsos juzgados, `guava/Ticker` es una clase ABSTRACTA y
 * `guava/TestSetGenerator` es una INTERFAZ. Las dos califican hoy porque un
 * tipo sin cuerpos no tiene aristas `calls` salientes, así que su fan-out es
 * cero por construcción — la lectura es una tautología, no evidencia. Y las
 * dos son, conceptualmente, lo CONTRARIO del patrón: un Null Object es la
 * implementación HOJA que cumple un protocolo, nunca el protocolo.
 *
 *   (a) `isProtocolRootType` — alguien EXTIENDE/IMPLEMENTA/SATISFACE a N
 *       (`index.subtypedBy`). Estructural y sin lenguaje: si el repo declara
 *       subtipos de N, N es la raíz de la jerarquía.
 *   (b) `isDeclaredInterfaceType` — la GRAMÁTICA lo declaró como interfaz
 *       (`shapeNodeType ?? nodeType`, el hecho verbatim que `graph/types.ts`
 *       documenta como "el único lugar donde la gramática ya dijo cuál de las
 *       dos cosas es"; `SymbolFamily` colapsa clase/struct/interfaz en
 *       `class-like`). Cubre la interfaz que el repo declara pero nadie
 *       implementa DENTRO del repo, que (a) no ve. Es vocabulario de
 *       GRAMÁTICA (`interface_declaration` en Java/C#/TS, `interface_type` en
 *       Go), nunca de dominio.
 */
function isProtocolRootType(index: NullObjectGraphIndex, id: string): boolean {
  return (index.subtypedBy.get(id) ?? []).length > 0;
}

/** El tipo de nodo de la gramática con el que se declaró el tipo — `shapeNodeType ?? nodeType`, tal cual lo documenta `graph/types.ts`. */
const INTERFACE_NODE_TYPE = /(^|_)interface(_|$)/;

function isDeclaredInterfaceType(node: CodeGraphNode): boolean {
  const declared = node.shapeNodeType ?? node.nodeType;
  return declared !== undefined && INTERFACE_NODE_TYPE.test(declared);
}

export interface NullObjectStructuralCandidate {
  readonly form: "completa" | "parcial";
  readonly nullTypeId: string;
  /** `null` en forma PARCIAL — no hay interfaz común. */
  readonly interfaceId: string | null;
  readonly viaSatisfies: boolean;
  readonly coveredMembers: readonly MemberSignature[];
  readonly memberIds: readonly string[];
  /** Ids de los símbolos que `instantiates` hacia `nullTypeId` — >=1 por construcción. */
  readonly instantiationSites: readonly string[];
}

/**
 * Todos los candidatos estructurales COMPLETA/PARCIAL del grafo — ver
 * docstring del módulo para la definición exacta de cada forma. `[]` sobre
 * un grafo `null`/sin tipos, nunca lanza (mismo contrato que
 * `wrapping-chain.ts#findWrappingChains`).
 */
export function findNullObjectStructuralCandidates(
  graph: CodeGraph | null,
  fileAt: ((path: string) => FileUnit | null) | null = null,
): readonly NullObjectStructuralCandidate[] {
  if (!graph) return [];
  const index = buildNullObjectIndex(graph, fileAt);

  // implementerId -> interfaces que declara/satisface (para saber, recorriendo desde N, si tiene AL MENOS una).
  const interfacesOfImplementer = new Map<string, { interfaceId: string; viaSatisfies: boolean }[]>();
  for (const list of index.edgesFrom.values()) {
    for (const e of list) {
      if (!INTERFACE_EDGE_KINDS.has(e.kind)) continue;
      const b = interfacesOfImplementer.get(e.from) ?? [];
      b.push({ interfaceId: e.to, viaSatisfies: e.kind === "satisfies" });
      interfacesOfImplementer.set(e.from, b);
    }
  }

  const gi = asGraphIndexFacade(index);
  const out: NullObjectStructuralCandidate[] = [];

  for (const N of graph.nodes) {
    if (N.kind !== "symbol" || N.family !== "class-like") continue;
    // OLA Y (Y1): el protocolo nunca es el objeto neutro — ver las dos
    // exclusiones arriba. Van ANTES de `isStructurallyEmpty` porque son más
    // baratas y porque su fan-out cero es tautológico.
    if (isProtocolRootType(index, N.id)) continue;
    if (isDeclaredInterfaceType(N)) continue;

    const { empty, members } = isStructurallyEmpty(index, N.id);
    if (!empty) continue; // sin miembros, o algún miembro con fan-out calls > 0 — no es un candidato de ninguna de las dos formas.

    const instantiationSites = (index.instantiatesTo.get(N.id) ?? []).map((e) => e.from);
    if (instantiationSites.length === 0) continue; // ninguna de las dos formas se sostiene sin un sitio que sustituya al ausente.

    const memberIds = members.map((m) => memberNodeId(index, N.id, m.name, m.arity)).filter((id): id is string => id !== null);

    const ifaces = interfacesOfImplementer.get(N.id) ?? [];
    let completeMatch: { interfaceId: string; viaSatisfies: boolean } | null = null;
    for (const cand of ifaces) {
      const ifaceMembers = memberSignatures(gi, cand.interfaceId);
      if (ifaceMembers.length === 0) continue; // interfaz sin miembros propios — nada que "cubrir", no participa.
      const coversAll = ifaceMembers.every((im) => members.some((m) => m.name === im.name && m.arity === im.arity));
      if (coversAll) {
        completeMatch = cand;
        break;
      }
    }

    if (completeMatch) {
      out.push({
        form: "completa",
        nullTypeId: N.id,
        interfaceId: completeMatch.interfaceId,
        viaSatisfies: completeMatch.viaSatisfies,
        coveredMembers: members,
        memberIds,
        instantiationSites,
      });
    } else if (ifaces.length === 0) {
      // Ninguna arista implements|satisfies en absoluto ⇒ objeto vacío AD HOC, no intercambiable por tipo — PARCIAL.
      out.push({
        form: "parcial",
        nullTypeId: N.id,
        interfaceId: null,
        viaSatisfies: false,
        coveredMembers: members,
        memberIds,
        instantiationSites,
      });
    }
    // Si `ifaces.length > 0` pero ninguna cubre TODOS sus miembros: caso raro
    // (interfaz declarada mal cubierta / firma parcialmente resuelta) — se
    // declara sin clasificar, no se fuerza a ninguna de las dos formas.
  }

  // Orden determinista: COMPLETA primero (información positiva antes que
  // sugerencia — mismo criterio que el requisito #1 de la tarea), después
  // por id de tipo.
  return out.sort((a, b) => (a.form === b.form ? a.nullTypeId.localeCompare(b.nullTypeId) : a.form === "completa" ? -1 : 1));
}

/* ════════════════════════════════════════════════════════════════════════
 * Ola 11a (P5, registro de pendientes — "1 de 17 lee ctx.neighborhood") —
 * LOCALIDAD del ancla, el cierre del espurio que P2 reportó en
 * `hypothesis-state-gate.test.ts` ("2 'Null Object: ya-aplicado' espurios
 * colgando de archivos de template_method/ cuando se corre el árbol completo").
 * CAUSA RAÍZ, confirmada con un `analyzeRepo` real sobre `tests/fixtures/
 * patterns/` completo (ver informe de esa ola): §B buscaba candidatos
 * estructurales sobre TODO el grafo sin ninguna relación con `problem` — CUALQUIER
 * Finding `distributed-duplication` del repo, sin importar su archivo, se
 * llevaba el MISMO primer candidato encontrado. Medido: un hallazgo anclado
 * ÍNTEGRAMENTE en `template_method/{javascript.js,typescript.ts,vue.vue}`
 * terminaba con una hipótesis "Null Object: ya-aplicado" cuyo `places` vivía
 * en `null_object/javascript.js` — cero relación.
 *
 * `relatedFiles` usa `ctx.neighborhood.findingsInFile`/`findingsAtSymbol`
 * (por primera vez, esta hipótesis) para expandir la localidad del `problem`
 * un salto — archivos de OTROS hallazgos que comparten archivo o símbolo con
 * alguno de los suyos. Más generoso que "archivo exacto" (el tipo nulo y el
 * sitio que lo consume rara vez coinciden con el archivo donde el detector
 * ancló la duplicación), pero NUNCA "todo el repo".
 *
 * ── REVISIÓN POST-DIAGNÓSTICO DEL EMBUDO (este frente): DE EXCLUSIÓN A
 * PREFERENCIA ─────────────────────────────────────────────────────────────
 * Ola 11a convirtió la localidad en un GATE (candidato lejos de `problem` ⇒
 * descartado). Medido AHORA sobre un repo real (Rails, 466 archivos): el
 * `distributed-duplication` es tan raro que hay UNO SOLO en TODO el repo, y
 * vive en una migración (`db/migrate/...`) sin ninguna relación con los TRES
 * candidatos estructurales reales que sí existen (uno de ellos, `FakeRackSession`
 * en `rack_sessions_fix.rb`, un Null Object hecho a mano) — con el gate de
 * Ola 11a, CERO llegaban a hipótesis. El diagnóstico de embudo que motiva
 * esta tarea ya había establecido que el modelo canónico de esta pipeline
 * tiene sólo DOS compuertas duras (el ancla dispara, `required` pasa) — la
 * localidad de Ola 11a era una TERCERA compuerta que esta hipótesis se
 * inventó, y que resultó catastrófica en un repo real con un ancla rara.
 *
 * `orderByLocality` (abajo, HISTÓRICO — ver la revisión que sigue) conservaba
 * la INTENCIÓN de Ola 11a (preferir el candidato que sí se relaciona con
 * `problem`, cuando existe uno) sin el EFECTO (silencio total cuando ninguno
 * se relaciona): los candidatos relacionados se intentaban PRIMERO; si
 * ninguno pasaba `required`, se caía a los candidatos sin relación en vez de
 * devolver `null`. La precisión que antes dependía de la localidad pasaba a
 * sostenerla `isStructurallyEmpty` (fan-out `calls`=0 + span trivial +
 * exclusión de constructor, ver más arriba).
 *
 * ── REVISIÓN (frente "tres bugs de mecanismo", bug 1): DE PREFERENCIA A
 * REQUISITO, OTRA VEZ ───────────────────────────────────────────────────────
 * Medido con la preferencia YA en producción, corriendo `analyzeRepo` sobre
 * el Rails real (466 archivos, `scripts/probes/` de este frente): el ÚNICO
 * `distributed-duplication` del repo — dos migraciones idempotentes de
 * índice (`db/migrate/20260519000001_...rb:17`,
 * `db/migrate/20260526000001_...rb:16`), boilerplate de framework sin
 * relación alguna con ningún guard de ausencia — SÍ produce una hipótesis
 * "Null Object: parcial", y sus `places` apuntan a
 * `app/controllers/concerns/rack_sessions_fix.rb#RackSessionsFix.FakeRackSession`
 * (el candidato sin relación que "REVISIÓN POST-DIAGNÓSTICO" ya sabía que
 * iba a salir como fallback). El razonamiento completo — `why` de cada
 * check, `cost`, `toConfirm` — describe `FakeRackSession`; el único `where`
 * que el `Finding` ancla reporta son las dos migraciones. Verificado a mano
 * abriendo ambos archivos: CERO relación entre lo que se cita como evidencia
 * y lo que la hipótesis recomienda.
 *
 * Esto no es "recomendación equivocada" (ancla real, remedio real, distinto
 * al recomendado) — es "apunta a un lugar que no tiene nada que ver con la
 * evidencia mostrada", y el usuario no tiene forma de notarlo sin leer el
 * código de las dos partes y notar que no se relacionan. Es la peor clase de
 * error posible, y es exactamente el defecto que "REVISIÓN POST-DIAGNÓSTICO"
 * había aceptado a cambio de no devolver silencio total.
 *
 * La decisión, con el defecto medido, se invierte: la localidad vuelve a ser
 * un REQUISITO, no una preferencia. `restrictToRelated` (reemplaza a
 * `orderByLocality`) ya NO deja pasar candidatos sin relación con `problem` —
 * ni siquiera como fallback. Si ninguno de los candidatos estructurales
 * comparte archivo/vecindario con el `Finding` ancla, la ruta (1) no produce
 * nada para ESE `problem` (la ruta (2), abajo, sigue intentándose; si
 * tampoco ahí hay nada relacionado, `build()` devuelve `null`). Sobre el
 * caso medido (Rails), esto vuelve a bajar la única hipótesis viva de Null
 * Object a cero — es el resultado correcto: silencio es mejor que una
 * ubicación que no corresponde y no lo declara. La misma exigencia se aplica
 * en la ruta (2) AST-scatter (`groupIntoProblems`, ver más abajo) por el
 * mismo motivo. *** OLA G: la exigencia que se puso acá para la ruta (2) era
 * la del vecindario, y eso NO alcanzaba — la ruta no estaba inerte y el
 * defecto seguía produciéndose en C# y en Vue. Ver la nota de la Ola G en
 * `build()`: para la ruta (2) la relación se exige contra las LÍNEAS del
 * propio hallazgo ancla, no contra su vecindario. ***
 * ════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────
 * *** OLA Y (Y1) — EL MISMO BUG QUE LA OLA G CERRÓ EN LA RUTA (2), CERRADO
 * *** AHORA EN LA RUTA (1). El texto de arriba (revisión de bug 1) dejó la
 * ruta (1) filtrando por `relatedFiles` —el VECINDARIO a un salto— con el
 * argumento de que sus `places` (el tipo nulo y sus sitios de instanciación)
 * legítimamente viven en otro archivo que la duplicación. El argumento es
 * cierto y NO alcanza, y la Ola G ya lo había escrito para la otra ruta con
 * el número al lado: **en un repo real ese salto alcanza casi todo** (941
 * archivos en newtonsoft), así que "estar relacionado" deja de ser una
 * restricción. Con `distributed-duplication` (10 candidatos en 13 repos) no
 * se notaba; con `duplication` (1.088) se volvió el caso dominante.
 *
 * MEDIDO POR EL INTEGRADOR DE LA OLA X, abriendo los archivos: un ancla en
 * `hugolib/hugo_sites.go:380` recomienda formalizar
 * `cache/dynacache/dynacache.go#OptionsPartition` —otro paquete, cero
 * relación— y el MISMO `OptionsPartition` aparece como candidato desde tres
 * anclas distintas. Es la clase de error que la revisión de bug 1 llamó "la
 * peor posible": apunta a un lugar que no tiene nada que ver con la evidencia
 * mostrada, y el usuario no puede notarlo sin abrir las dos partes.
 *
 * EL ARREGLO ES EL DE LA OLA G, PORTADO, con la pregunta adaptada a lo que
 * ESTA ruta muestra. La ruta (2) exige que el guard esté DENTRO del rango que
 * el ancla reporta como duplicado. Acá lo que se recomienda formalizar es un
 * TIPO vacío sustituido en algún sitio, así que la pregunta equivalente es:
 * ¿lo que el ancla reporta como duplicado cae DENTRO de ese tipo, o dentro de
 * un sitio que lo sustituye? Si no cae en ninguno de los dos, lo duplicado es
 * otra cosa y Null Object no es el remedio de ESE hallazgo — silencio, que es
 * lo que la propia revisión de bug 1 ya había decidido preferir.
 *
 * Es SOLAPAMIENTO DE RANGO, no "mismo archivo": la Ola G midió que "mismo
 * archivo" a secas deja pasar la misma clase de error un escalón más chica
 * (mismo archivo, otra región).
 * ──────────────────────────────────────────────────────────────────────── */

/** `true` si el rango declarado de `node` solapa con alguno de los rangos que el hallazgo ancla reporta como evidencia. Sin posición declarada NO solapa — se exige evidencia positiva, igual que en la ruta (2). */
function overlapsAnchorEvidence(node: CodeGraphNode | undefined, anchorRanges: readonly { file: string; startLine: number; endLine: number }[]): boolean {
  if (!node || node.startLine === undefined) return false;
  const start = node.startLine;
  const end = node.endLine ?? node.startLine;
  return anchorRanges.some((l) => l.file === node.file && start <= l.endLine && end >= l.startLine);
}

/**
 * FILTRA `candidates`: sólo sobreviven aquellos cuyo tipo nulo —o alguno de
 * sus sitios de sustitución— SOLAPA EN RANGO con la evidencia del hallazgo
 * ancla. Reemplaza a `restrictToRelated` (vecindario a un salto), ver el
 * bloque de arriba. `build()` recorre el resultado y devuelve el PRIMERO que
 * pase `required`.
 */
function restrictToAnchorEvidence(
  candidates: readonly NullObjectStructuralCandidate[],
  index: NullObjectGraphIndex,
  anchorRanges: readonly { file: string; startLine: number; endLine: number }[],
): readonly NullObjectStructuralCandidate[] {
  return candidates.filter(
    (c) =>
      overlapsAnchorEvidence(index.nodeById.get(c.nullTypeId), anchorRanges) ||
      c.instantiationSites.some((siteId) => overlapsAnchorEvidence(index.nodeById.get(siteId), anchorRanges)),
  );
}

/** Ids de símbolo a los que un "cliente real" podría llamar: los miembros cubiertos de N y, si existen como nodo propio, los mismos miembros declarados en la interfaz. */
function calleeTargetIds(index: NullObjectGraphIndex, candidate: NullObjectStructuralCandidate): readonly string[] {
  const ids = new Set<string>(candidate.memberIds);
  if (candidate.interfaceId) {
    for (const m of candidate.coveredMembers) {
      const id = memberNodeId(index, candidate.interfaceId, m.name, m.arity);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

interface ClientCallEvidence {
  readonly total: number;
  readonly withoutNullCheck: number;
  readonly unresolved: number;
  readonly examples: readonly string[];
}

/**
 * Busca llamadores reales de los miembros cubiertos y, cuando el llamador se
 * puede resolver contra `functions` (`ctx.repo.functions` — VACÍO siempre en
 * el cableado de producción de hoy, ver docstring del módulo), lee
 * `FunctionMetrics.chainHasNullCheck`. `unresolved` cuenta los llamadores que
 * el grafo sí encontró pero que `functions` no pudo emparejar — la señal de
 * "no se pudo verificar", distinta de "se verificó y no había chequeo".
 */
function clientCallsEvidence(index: NullObjectGraphIndex, candidate: NullObjectStructuralCandidate, functions: readonly RepoFunctionUnit[]): ClientCallEvidence {
  const byKey = new Map<string, RepoFunctionUnit>();
  for (const fn of functions) byKey.set(`${fn.file}#${fn.symbolPath.join(".")}`, fn);

  let total = 0;
  let withoutNullCheck = 0;
  let unresolved = 0;
  const examples: string[] = [];
  const seen = new Set<string>();
  for (const targetId of calleeTargetIds(index, candidate)) {
    for (const e of index.callsTo.get(targetId) ?? []) {
      const key = `${e.from}->${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      const callerNode = index.nodeById.get(e.from);
      const fn = callerNode ? byKey.get(`${callerNode.file}#${callerNode.symbolPath.join(".")}`) : undefined;
      if (!fn) {
        unresolved++;
        continue;
      }
      if (!fn.metrics.chainHasNullCheck) {
        withoutNullCheck++;
        if (examples.length < 3) examples.push(`${fn.file}#${fn.symbolPath.join(".")}`);
      }
    }
  }
  return { total, withoutNullCheck, unresolved, examples };
}

interface NullObjectStructuralProblem {
  readonly candidate: NullObjectStructuralCandidate;
  readonly index: NullObjectGraphIndex;
  readonly functions: readonly RepoFunctionUnit[];
}

const structuralZeroFanout: Check<NullObjectStructuralProblem, void> = {
  id: "zero-call-fanout",
  describe:
    "CADA miembro de N (>=1) tiene fan-out `calls` = 0 y span trivial — confirmado por el grafo, que es lo que este check afirma. OLA Y (Y1): la verificación de que el CUERPO además no hace nada observable es una compuerta AGUAS ARRIBA (`isStructurallyEmpty`/`memberBodyVerdict`), no de acá: un candidato con cuerpo de comportamiento ya no llega a este spec. Acá se REPORTA cuántos miembros la pasaron con árbol vivo.",
  run(problem) {
    const { index, candidate } = problem;
    const neutros = candidate.memberIds.filter((id) => memberBodyVerdict(index, index.nodeById.get(id) ?? null) === "neutro").length;
    return {
      holds: true,
      evidence:
        index.fileAt === null
          ? `${candidate.memberIds.length} miembro(s) verificados por el grafo, todos con fan-out calls = 0 y span trivial. La verificación de cuerpo por AST corre sólo con accesor a árbol (ver \`memberBodyVerdict\`), y este índice se armó sin uno.`
          : `${candidate.memberIds.length} miembro(s) con fan-out calls = 0 y span trivial, ${neutros} de ellos con cuerpo NEUTRO confirmado por AST.`,
    };
  },
};

const structuralHasInstantiationSite: Check<NullObjectStructuralProblem, void> = {
  id: "has-instantiation-site",
  describe: "N tiene >=1 arista `instantiates` ENTRANTE — un sitio real que lo sustituye por el valor ausente.",
  run(problem) {
    const { instantiationSites } = problem.candidate;
    return {
      holds: instantiationSites.length > 0,
      evidence:
        instantiationSites.length > 0
          ? `${instantiationSites.length} sitio(s) instancian N: ${instantiationSites
              .slice(0, 3)
              .map((id) => describeNode(problem.index, id))
              .join(", ")}.`
          : "Ningún sitio instancia N en este grafo.",
    };
  },
};

const structuralMultipleInstantiationSites: Check<NullObjectStructuralProblem, void> = {
  id: "multiple-instantiation-sites",
  describe: "Más de un sitio distinto instancia N — usado como sustituto en más de un lugar, no un caso aislado.",
  run(problem) {
    const n = problem.candidate.instantiationSites.length;
    return { holds: n >= 2, evidence: `${n} sitio(s) de instanciación.` };
  },
};

const structuralClientsWithoutNullCheck: Check<NullObjectStructuralProblem, void> = {
  id: "clients-call-without-null-check",
  describe:
    "Clientes llaman al miembro cubierto sin una rama que compare el receptor contra ausente (`FunctionMetrics.chainHasNullCheck` falso) — evidencia de uso polimórfico real. DECLARADO (requisito #3): depende de resolver al llamador contra `ctx.repo.functions`, que `code-analyzer.ts` deja VACÍO a propósito en el único cableado que llega a este ancla hoy — en producción este check queda sin verificar, no confirmado ni refutado.",
  run(problem) {
    const ev = clientCallsEvidence(problem.index, problem.candidate, problem.functions);
    if (ev.total === 0) return { holds: false, evidence: "Ningún llamador encontrado en el grafo para los miembros cubiertos." };
    if (ev.withoutNullCheck === 0 && ev.unresolved === ev.total) {
      return {
        holds: false,
        evidence: `${ev.total} llamador(es) encontrados por el grafo, pero NINGUNO se pudo resolver contra \`repo.functions\` (vacío en este cableado — límite declarado de \`code-analyzer.ts\`, no de este archivo): no verificado, ni a favor ni en contra.`,
      };
    }
    return {
      holds: ev.withoutNullCheck > 0,
      evidence:
        ev.withoutNullCheck > 0
          ? `${ev.withoutNullCheck}/${ev.total} llamador(es) sin chequeo de ausente: ${ev.examples.join(", ")}.`
          : `${ev.total} llamador(es) resueltos, todos con chequeo de ausente en su cadena — no parece consumirse polimórficamente sin guardar.`,
    };
  },
};

function structuralAppliedState(problem: NullObjectStructuralProblem): AppliedStateResult {
  const { candidate, index } = problem;
  const completaWhy = candidate.interfaceId
    ? `${describeNode(index, candidate.nullTypeId)} implementa/satisface ${describeNode(index, candidate.interfaceId)} cubriendo ${candidate.coveredMembers.length} miembro(s) por (name,arity), TODOS con fan-out calls=0, con ${candidate.instantiationSites.length} sitio(s) de sustitución${candidate.viaSatisfies ? " (al menos un lado resuelto vía satisfies — riesgo A9 declarado, CONTRATO-F10.md §3)" : " (implements declarado)"}.`
    : "";
  const parcialWhy = `${describeNode(index, candidate.nullTypeId)} tiene ${candidate.coveredMembers.length} miembro(s) con fan-out calls=0 y ${candidate.instantiationSites.length} sitio(s) de sustitución, pero NINGUNA arista implements|satisfies hacia una interfaz — objeto vacío ad hoc, no intercambiable por tipo.`;

  const checks = [
    {
      label: "COMPLETA: N implementa/satisface una interfaz cubriendo TODOS sus miembros, con fan-out calls=0 en cada uno. Nunca se sugiere el patrón sobre esto — es información positiva.",
      passed: candidate.form === "completa",
      why: candidate.form === "completa" ? completaWhy : "Sin interfaz común confirmada por el grafo que N cubra por completo.",
    },
    {
      label: "PARCIAL: objeto vacío ad hoc (fan-out calls=0, instanciado como sustituto) SIN interfaz común — no intercambiable por tipo. Formalizarlo es la sugerencia.",
      passed: candidate.form === "parcial",
      why: candidate.form === "parcial" ? parcialWhy : "N tiene interfaz común (o no calificó como sustituto vacío) — no es el caso ad hoc.",
    },
  ];
  return { state: candidate.form === "completa" ? "ya-aplicado" : "parcial", checks };
}

export const NULL_OBJECT_STRUCTURAL_SPEC: HypothesisSpec<NullObjectStructuralProblem, void> = {
  pattern: "Null Object",
  // Igual que la ruta AST-scatter: `media`, nunca `alta` — tres aproximaciones
  // declaradas (riesgo A9 de `satisfies`, alcance repo-wide sin correlación
  // de concepto con el hallazgo ancla, y el discriminador de clientes sin
  // chequeo nulo que hoy no se puede verificar en producción — ver docstring
  // del módulo).
  ceiling: "media",
  needs: [],
  required: [structuralZeroFanout, structuralHasInstantiationSite],
  discriminators: [structuralMultipleInstantiationSites, structuralClientsWithoutNullCheck],
  appliedState: structuralAppliedState,
  toConfirm: [
    "¿El cuerpo vacío de cada miembro es REALMENTE vacío/constante, o sólo llama a funciones que el grafo no pudo resolver (builtins, APIs externas)? Fan-out `calls`=0 significa \"sin llamadas RESUELTAS\", no \"cuerpo vacío\" — VERIFICADO: `console.log`/`console.warn` reales califican igual que un cuerpo vacío (ver docstring del módulo).",
    "¿Todos los sitios de instanciación sustituyen genuinamente un valor ausente, o alguno construye N por otra razón (p.ej. un valor por defecto de configuración sin relación con 'ausencia')?",
    "Riesgo A9 (CONTRATO-F10.md §3): si `viaSatisfies` es cierto, al menos un lado de la relación se resolvió estructuralmente (sin `implements` declarado) — confirmar a mano en C#, donde ese umbral nunca se verificó contra el corpus.",
  ],
  source: "https://en.wikipedia.org/wiki/Null_object_pattern",
};

/* ════════════════════════════════════════════════════════════════════════
 * §B2 — OLA AE (AE10): LA RUTA DEL ANCLA-FUERZA, `repeated-absence-check`.
 *
 * ADITIVA Y AISLADA: nada de lo que sigue lo llama ninguna de las dos rutas
 * viejas, y esta ruta no llama nada de ellas. Su única puerta de entrada es
 * `if (problem.kind === "repeated-absence-check")` al principio de `build()`.
 *
 * QUÉ APORTA QUE LAS OTRAS DOS NO PUEDEN. La ruta (1) parte de un TIPO vacío
 * que ya existe (por eso sólo llega a `ya-aplicado`/`parcial`: para verlo, el
 * objeto neutro tiene que estar escrito). La ruta (2) parte de guards
 * dispersos, pero sólo los que caen DENTRO de una copia que el ancla de
 * duplicación reportó. Esta ruta parte de la FUERZA —el mismo colaborador
 * chequeado en muchos clientes— sin exigir que nada de eso esté ya escrito ni
 * clonado, que es la única forma de contestar "acá FALTA un Null Object".
 *
 * LO QUE ESTA RUTA NO PUEDE DECIR, Y NO SE ACREDITA POR ELLO: `ya-aplicado` y
 * `aplicado-eludido` son INALCANZABLES desde acá, por construcción, y hay que
 * decirlo con todas las letras (mismo criterio con el que AC3 y AD4 lo dijeron
 * de sus propias anclas). El detector se CALLA cuando existe un objeto neutro
 * instanciado que cubre el protocolo (su condición de RESOLUCIÓN VERIFICADA),
 * así que ningún candidato con el patrón ya puesto llega hasta acá. Que el
 * reparto de esta ruta dé 0 `ya-aplicado` NO es mérito suyo: es una
 * consecuencia aritmética de dónde está la compuerta. Lo que sí es mérito
 * medible, y de otra naturaleza, es que el detector se calle — y eso se mide
 * contando cuántos candidatos descarta esa condición, no acá.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Memoización por PASADA, misma disciplina y mismo motivo que `INDEX_CACHE`/
 * `CANDIDATES_CACHE` de más abajo (Ola X, integrador): `ausenciasRepetidas` es
 * pura respecto de `(clones, graph)` y recorre el repo entero, así que sin
 * caché se recalcularía una vez POR HALLAZGO ancla. Las claves son las dos
 * entradas por IDENTIDAD, y dentro de una pasada de `hypotheses/run.ts` las dos
 * son el mismo objeto.
 */
const AUSENCIAS_CACHE = new WeakMap<readonly CloneCandidate[], WeakMap<CodeGraph, readonly AusenciaRepetida[]>>();

function ausenciasCacheadas(clones: readonly CloneCandidate[], graph: CodeGraph): readonly AusenciaRepetida[] {
  let porGrafo = AUSENCIAS_CACHE.get(clones);
  if (!porGrafo) {
    porGrafo = new WeakMap<CodeGraph, readonly AusenciaRepetida[]>();
    AUSENCIAS_CACHE.set(clones, porGrafo);
  }
  const guardado = porGrafo.get(graph);
  if (guardado !== undefined) return guardado;
  const calculado = ausenciasRepetidas(clones, graph);
  porGrafo.set(graph, calculado);
  return calculado;
}

const absenceHasProtocol: Check<AusenciaRepetida, void> = {
  id: "colaborador-con-protocolo",
  describe:
    "Al colaborador se le MANDAN mensajes y al menos uno resuelve, en el grafo, a un miembro `function-like` de un tipo — hay un protocolo que un objeto neutro podría implementar. Sin esto, lo que falta es un valor por defecto, no un objeto: el remedio sería otro.",
  run(problem) {
    const n = problem.mensajesConProtocolo.length;
    return {
      holds: n > 0,
      evidence:
        n > 0
          ? `${n}/${problem.mensajes.length} mensaje(s) de "${problem.colaborador}" resuelven a un miembro de un tipo en el grafo: ${problem.mensajesConProtocolo.slice(0, 6).join(", ")}.`
          : `Ninguno de los ${problem.mensajes.length} mensaje(s) que los clientes le mandan a "${problem.colaborador}" resuelve a un miembro de un tipo en este grafo — no hay protocolo que un objeto neutro pueda cubrir.`,
    };
  },
};

const absenceRepeatedAcrossClients: Check<AusenciaRepetida, void> = {
  id: "chequeo-repetido-en-varios-clientes",
  describe: `El MISMO colaborador se chequea contra ausente en >= ${UMBRALES_AUSENCIA_REPETIDA.clientes} funciones distintas — bastante como para que un tipo neutro salga más barato que poner el default una vez en el accesor.`,
  run(problem) {
    const n = problem.clientes.length;
    return {
      holds: n >= UMBRALES_AUSENCIA_REPETIDA.clientes,
      evidence:
        n >= UMBRALES_AUSENCIA_REPETIDA.clientes
          ? `${n} función(es) distintas chequean la ausencia de "${problem.colaborador}": ${problem.clientes
              .slice(0, 4)
              .map((c) => `${c.file}#${c.fn}`)
              .join(", ")}.`
          : `Sólo ${n} función(es) chequean la ausencia de "${problem.colaborador}" — por debajo del piso de escala (${UMBRALES_AUSENCIA_REPETIDA.clientes}).`,
    };
  },
};

const absenceCrossesFile: Check<AusenciaRepetida, void> = {
  id: "el-chequeo-cruza-el-archivo",
  describe:
    "Los clientes que chequean viven en >= 2 archivos distintos — dentro de un solo archivo (o de un solo tipo) la mitigación más barata es una función/accesor privado con el default, no declarar un tipo nuevo.",
  run(problem) {
    const n = problem.archivos.length;
    return {
      holds: n >= UMBRALES_AUSENCIA_REPETIDA.archivosQueChequean,
      evidence:
        n >= UMBRALES_AUSENCIA_REPETIDA.archivosQueChequean
          ? `El chequeo está escrito en ${n} archivos: ${problem.archivos.slice(0, 4).join(", ")}.`
          : `Los ${problem.clientes.length} chequeos viven en un solo archivo (${problem.archivos[0] ?? "?"}) — una función privada de ese archivo los borra sin crear ningún tipo.`,
    };
  },
};

const absenceDivergentDefaults: Check<AusenciaRepetida, void> = {
  id: "defaults-divergentes",
  describe:
    "Los clientes NO coinciden en qué hacer cuando el colaborador falta: hay >= 2 continuaciones distintas. Si todos hicieran lo mismo, un default único (una constante, un accesor con valor por defecto) sería el remedio y el objeto neutro sobraría.",
  run(problem) {
    const n = problem.formasDefecto.length;
    return {
      holds: n >= 2,
      evidence: `${n} continuación(es) distintas después del chequeo: ${problem.formasDefecto.slice(0, 5).join(" | ")}. LEÍDA POR TEXTO (los dos primeros tokens que siguen al chequeo, ver el detector): sirve para mostrar la divergencia, no para decidirla.`,
    };
  },
};

const absenceNoHalfDoor: Check<AusenciaRepetida, void> = {
  id: "sin-sustituto-neutro-a-medias",
  describe:
    "No hay en el repo ningún tipo estructuralmente neutro que ya cubra parte de este protocolo. Cuando lo hay, la recomendación correcta probablemente sea COMPLETARLO, no declarar uno nuevo — y por eso el estado baja a `parcial`.",
  run(problem) {
    return {
      holds: problem.mediaPuerta === null,
      evidence:
        problem.mediaPuerta === null
          ? "Ningún tipo con todos sus miembros de fan-out `calls` = 0 y span trivial declara ninguno de estos mensajes."
          : `"${problem.mediaPuerta.descripcion}" es estructuralmente neutro y ya declara ${problem.mediaPuerta.cubre} de ${problem.mensajesConProtocolo.length} mensaje(s)${problem.mediaPuerta.instanciado ? ", y ya se instancia" : ", pero todavía no se instancia en ningún lado"}.`,
    };
  },
};

function absenceAppliedState(problem: AusenciaRepetida): AppliedStateResult {
  const media = problem.mediaPuerta;
  const checks = [
    {
      label:
        "PARCIAL: ya existe un tipo estructuralmente neutro que cubre PARTE del protocolo del colaborador — media puerta. Completarlo y sustituirlo es más barato que declarar uno nuevo.",
      passed: media !== null,
      why: media
        ? `${media.descripcion} tiene todos sus miembros con fan-out calls=0 y span trivial, y declara ${media.cubre} de ${problem.mensajesConProtocolo.length} mensaje(s) que los clientes le mandan a "${problem.colaborador}"${media.instanciado ? "; ya se instancia en al menos un sitio" : "; todavía no se instancia en ningún sitio"}.`
        : "Ningún tipo neutro del repo declara ninguno de los mensajes de este colaborador.",
    },
    {
      label:
        "AUSENTE: no hay ningún objeto neutro, ni completo ni a medias, para este colaborador — los N clientes preguntan y cada uno resuelve la ausencia por su cuenta.",
      passed: media === null,
      why:
        media === null
          ? `${problem.clientes.length} clientes en ${problem.archivos.length} archivos chequean "${problem.colaborador}" con ${problem.formasDefecto.length} continuaciones distintas, y el grafo no tiene ningún tipo neutro que cubra su protocolo (${problem.mensajesConProtocolo.join(", ")}).`
          : "Hay media puerta — ver el peldaño anterior.",
    },
  ];
  return { state: media === null ? "ausente" : "parcial", checks };
}

export const NULL_OBJECT_ABSENCE_SPEC: HypothesisSpec<AusenciaRepetida, void> = {
  pattern: "Null Object",
  // `media`, igual que las otras dos rutas de este archivo, y por tres
  // aproximaciones DECLARADAS y propias de esta ruta: (a) el chequeo se
  // reconoce sobre el texto de `repo.clones` con los espacios colapsados, no
  // sobre un árbol —un detector `inter-file` no tiene árboles—, así que la
  // negación truthy y el orden invertido no se ven; (b) la identidad del
  // colaborador es sintáctica (receptor + nombre, o tipo dueño + nombre): dos
  // receptores homónimos de tipos distintos en archivos distintos se cuentan
  // como el mismo colaborador, y eso viaja en el `toConfirm`; (c) "tipo
  // estructuralmente neutro" hereda el hueco (c) de este módulo (fan-out
  // `calls` = 0 significa "sin llamadas RESUELTAS", no "cuerpo vacío").
  ceiling: "media",
  needs: [],
  required: [absenceHasProtocol, absenceRepeatedAcrossClients, absenceCrossesFile],
  discriminators: [absenceDivergentDefaults, absenceNoHalfDoor],
  appliedState: absenceAppliedState,
  toConfirm: [
    "¿Los N clientes chequean de verdad el MISMO objeto? La identidad es SINTÁCTICA (el receptor escrito más el nombre, o el tipo dueño más el nombre): dos parámetros homónimos de tipos distintos, en archivos distintos, se leen como el mismo colaborador.",
    "¿La ausencia es un estado LEGÍTIMO del dominio, o una condición de error? Si es un error, el remedio correcto es fallar rápido y no un objeto neutro — el `cost` de esta hipótesis declara ese riesgo, y este archivo ya lo mide en su ruta AST (`consequenceFailsFast`), pero el detector de esta ruta NO puede ver la consecuencia con la fidelidad de un árbol.",
    "¿El objeto neutro puede contestar los mensajes que los clientes le mandan sin mentir? Un `HTMLURL()` que devuelve la cadena vacía puede ser peor que la pregunta explícita.",
  ],
  source: "https://en.wikipedia.org/wiki/Null_object_pattern",
};

function absencePlaces(problem: AusenciaRepetida): readonly RoleLocation[] {
  const places: RoleLocation[] = problem.clientes.slice(0, 8).map((c, i) => ({
    file: c.file,
    startLine: c.startLine,
    endLine: c.endLine,
    symbol: c.fn,
    role: `cliente #${i + 1} que chequea la ausencia de "${problem.colaborador}"${c.formaDefecto ? ` y sigue con "${c.formaDefecto}"` : ""}`,
  }));
  if (problem.mediaPuerta) {
    places.push({
      file: problem.mediaPuerta.file,
      startLine: problem.mediaPuerta.startLine,
      endLine: problem.mediaPuerta.endLine,
      role: `objeto neutro a medias: ya cubre ${problem.mediaPuerta.cubre} de ${problem.mensajesConProtocolo.length} mensaje(s)`,
    });
  }
  return places;
}

/* ════════════════════════════════════════════════════════════════════════
 * §C — Checks de la ruta AST-SCATTER (heredada) — el problema ya llega
 * FILTRADO a >= NULL_OBJECT_MIN_OCCURRENCES por quien lo construye
 * (`groupIntoProblems`), así que `required` es redundancia defensiva, no el
 * filtro principal — igual que Prototype/Facade del spike documentan.
 * ════════════════════════════════════════════════════════════════════════ */

const atLeastThreeUnits: Check<NullGuardScatterProblem, NullObjectGraphIndex | null> = {
  id: "at-least-three-distinct-units",
  describe: `El mismo concepto verificado contra ausente en ≥${NULL_OBJECT_MIN_OCCURRENCES} unidades distintas (Wikipedia, Null object pattern §Motivation).`,
  run(problem) {
    const distinct = new Set(problem.occurrences.map((o) => `${o.file}#${o.memberName}`));
    return {
      holds: distinct.size >= NULL_OBJECT_MIN_OCCURRENCES,
      evidence: `"${problem.conceptName}" verificado contra ausente en ${distinct.size} lugar(es): ${[...distinct].join(", ")}.`,
    };
  },
};

/**
 * P4 (precisión medida en corpus, 4/5 dudosos/falsos): sin esto, `required`
 * sólo exigía "el mismo NOMBRE en ≥3 unidades" — y un nombre corto y genérico
 * de PARÁMETRO (`value`, `cls`, `cmd`, `name`, `file`, `message`, `color`,
 * `stream`) coincide todo el tiempo entre funciones SIN ninguna relación de
 * dominio (verificado en `click`: 8/8 conceptos que pasaban antes eran,
 * los 8, un parámetro siendo asignado a su valor por defecto o devuelto
 * temprano). Exigir que AL MENOS UNA ocurrencia sea acceso a atributo
 * (`self.`/`this.`/`@`) mantiene el caso real y descarta la coincidencia de
 * nombre de parámetro puro, sin agregar vocabulario por lenguaje.
 */
const atLeastOneMemberAccessGuard: Check<NullGuardScatterProblem, NullObjectGraphIndex | null> = {
  id: "at-least-one-member-access-guard",
  describe:
    "Al menos una ocurrencia guarda un ATRIBUTO (`self.x`/`this.x`/`@x`), no sólo parámetros/variables locales — un nombre corto de parámetro coincide por casualidad entre funciones sin relación (medido en el corpus).",
  run(problem) {
    const memberAccess = problem.occurrences.filter((o) => o.isMemberAccess);
    return {
      holds: memberAccess.length > 0,
      evidence:
        memberAccess.length > 0
          ? `${memberAccess.length}/${problem.occurrences.length} ocurrencia(s) son acceso a atributo: ${memberAccess.map((o) => `${o.file}#${o.memberName}`).join(", ")}.`
          : `Las ${problem.occurrences.length} ocurrencias son todas parámetros/variables locales (ningún atributo de instancia) — más compatible con un nombre de parámetro genérico repetido por casualidad que con el mismo colaborador de dominio.`,
    };
  },
};

const anyStrictGuard: Check<NullGuardScatterProblem, NullObjectGraphIndex | null> = {
  id: "any-strict-guard",
  describe: "Al menos un guard es comparación ESTRICTA contra el valor ausente (no negación truthy) — reduce el riesgo de confundir con un chequeo de \"falsy\" genérico.",
  run(problem) {
    const strict = problem.occurrences.filter((o) => o.strict);
    return {
      holds: strict.length > 0,
      evidence:
        strict.length > 0
          ? `${strict.length}/${problem.occurrences.length} guard(s) son comparación estricta.`
          : "Todos los guards son negación truthy (`!x`) — más débil: puede ser un chequeo defensivo genérico, no necesariamente \"ausente\".",
    };
  },
};

const fourOrMoreOccurrences: Check<NullGuardScatterProblem, NullObjectGraphIndex | null> = {
  id: "four-or-more-occurrences",
  describe: `Dispersión por encima del mínimo: >${NULL_OBJECT_MIN_OCCURRENCES} unidades distintas.`,
  run(problem) {
    const distinct = new Set(problem.occurrences.map((o) => `${o.file}#${o.memberName}`)).size;
    return { holds: distinct > NULL_OBJECT_MIN_OCCURRENCES, evidence: `${distinct} unidades distintas.` };
  },
};

function protocolOverlap(membersAtGuardSites: ReadonlySet<string>, substitute: CandidateSubstitute): string[] {
  return substitute.memberNames.filter((m) => membersAtGuardSites.has(m.toLowerCase()));
}

/**
 * EL EXCLUDER DE 'YA APLICADO'/`aplicado-eludido`, AHORA ESTRUCTURAL — ver
 * docstring del módulo. Reemplaza `NULL_SIBLING_PREFIXES` (vocabulario sobre
 * el NOMBRE del sustituto) por `isStructurallyEmpty` + `instantiatesTo` sobre
 * el GRAFO (fan-out calls=0 en todos los miembros del candidato + >=1
 * sustitución real) — el correlacionador con el concepto guardado sigue
 * siendo solapamiento de NOMBRE de miembro (`protocolOverlap`, vía
 * `memberSignatures`), que el propio contrato autoriza como estructural.
 * `ausente` cuando no hay sustituto CONFIRMADO POR EL GRAFO con protocolo
 * compartido; `aplicado-eludido` cuando sí lo hay. Nunca `ya-aplicado`/
 * `parcial` desde esta ruta — ésas las produce §B (repo-wide, sin necesitar
 * el olor de guards disperso).
 */
function scatterAppliedState(problem: NullGuardScatterProblem, index: NullObjectGraphIndex | null): AppliedStateResult {
  const membersAtGuardSites = new Set(problem.occurrences.map((o) => o.memberName.toLowerCase()));

  let confirmed: { substitute: CandidateSubstitute; detail: string } | null = null;
  if (index) {
    for (const s of problem.substitutesInScope) {
      const overlap = protocolOverlap(membersAtGuardSites, s);
      if (overlap.length === 0) continue;
      const nodeId = symbolNodeId(s.file, [s.unitName]);
      const { empty } = isStructurallyEmpty(index, nodeId);
      if (!empty) continue;
      const hasSubstitution = (index.instantiatesTo.get(nodeId) ?? []).length > 0;
      if (!hasSubstitution) continue;
      confirmed = {
        substitute: s,
        detail: `Confirmado por el grafo: "${s.unitName}" (${s.file}) tiene fan-out calls=0 en todos sus miembros y >=1 sitio que lo instancia — comparte protocolo: ${overlap.join(", ")}.`,
      };
      break;
    }
  }

  const checks = [
    {
      label:
        "Existe un tipo, CONFIRMADO POR EL GRAFO (fan-out calls=0 en todos sus miembros + >=1 instantiates entrante), que comparte protocolo con las unidades guardadas — reemplaza el chequeo por vocabulario de nombre (null/noop/empty/...).",
      passed: confirmed !== null,
      why: confirmed
        ? confirmed.detail
        : index
          ? "Ningún candidato del alcance de este concepto está confirmado por el grafo como estructuralmente vacío + sustituido."
          : "Sin grafo en esta corrida — no se puede confirmar estructura (ver LÍMITE DE CABLEADO en el docstring del módulo).",
    },
  ];
  return { state: confirmed ? "aplicado-eludido" : "ausente", checks };
}

export const NULL_OBJECT_SPEC: HypothesisSpec<NullGuardScatterProblem, NullObjectGraphIndex | null> = {
  pattern: "Null Object",
  // Techo MEDIA: el correlacionador sigue siendo solapamiento de NOMBRE de
  // miembro (sin resolución de tipos completa) — una escalera perfecta no
  // compensa esa aproximación. [provisional] K2.
  ceiling: "media",
  needs: [],
  required: [atLeastThreeUnits, atLeastOneMemberAccessGuard],
  discriminators: [anyStrictGuard, fourOrMoreOccurrences],
  appliedState: scatterAppliedState,
  toConfirm: [
    "¿Todos los guards protegen el MISMO significado de \"ausente\"?",
    "¿El comportamiento en el caso ausente es igual en todos los sitios?",
    "¿Es de verdad un concepto de dominio disperso, o una validación de entrada legítima en la frontera (ahí el remedio correcto es fallar rápido, no un objeto neutro)?",
  ],
  source: "https://en.wikipedia.org/wiki/Null_object_pattern",
};

/* ════════════════════════════════════════════════════════════════════════
 * Extracción AST — portada de `pattern-behavioral.ts` (nullGuardFromConditionText,
 * guardReassignsToConstruction), generalizada a los 9 lenguajes vía
 * `AstNode`/`DerivedNodeSets` genéricos en vez del `Lang` cerrado de 6 de la
 * regla vieja. Sin cambios de fondo esta ola (ver §DOS RUTAS DE EVIDENCIA).
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * OLA AI, FRENTE AI7 — **DOS IDIOMAS DE AUSENCIA QUE ESTE RECONOCEDOR NO PODÍA
 * VER, Y NO POR UMBRAL SINO POR GRAMÁTICA.**
 *
 * Las cuatro formas de arriba son las que este archivo reconoce desde la Ola K,
 * y entre las cuatro cubren C/Java/Go/Ruby/Python-con-`is None`/JS. **Faltan
 * las dos formas con las que su propia gramática escribe LA MISMA INTENCIÓN en
 * Python y en C# moderno**, y por eso, para esos dos subconjuntos, la ruta de
 * guardas dispersas es **imposible por construcción**: un archivo Python que
 * escribe `if not conn:` y uno C# que escribe `if (x is null)` no producen NI
 * UNA occurrence, por más que el concepto esté chequeado en veinte lugares.
 *
 * - `not x` (Python) — es EXACTAMENTE la misma intención que `!x`, que ya está
 *   cubierta, escrita como Python la escribe. Va con `strict: false` por la
 *   misma razón que `!x`: es una negación por veracidad, no una comparación
 *   contra el valor ausente (un `0`, un `""` o una lista vacía también entran).
 * - `x is null` (C# 7+) — es EXACTAMENTE la misma intención que `x == null`,
 *   que ya está cubierta, y que `x is None` de Python, que también lo está. Va
 *   con `strict: true` porque nombra el valor ausente, igual que sus gemelas.
 *
 * **ES ADITIVO POR CONSTRUCCIÓN, y se lee en el código:** las dos ramas nuevas
 * corren DESPUÉS de las cuatro viejas y sólo se alcanzan cuando las cuatro ya
 * devolvieron `null`. Ni una entrada que antes producía un guard puede
 * producir otro distinto. Y los dos anclajes son los mismos que ya usan sus
 * gemelas: `not x` termina en fin de texto (igual que `!x`, así que `not a == b`
 * NO matchea, es una comparación y no una guarda de ausencia) y `x is null`
 * lleva `\b` (así que `x is not null` NO matchea: eso es la guarda CONTRARIA).
 *
 * Vocabulario de GRAMÁTICA, no de dominio: `not` y `is null` son palabras del
 * lenguaje, no nombres de concepto — el mismo estatus que `nil`/`None`/
 * `undefined`, que ya estaban.
 */
function conditionGuard(rawText: string): { name: string; strict: boolean } | null {
  const trimmed = rawText.trim().replace(/^\((.*)\)$/, "$1").trim();
  let m = /^([\w.@$]+)\s*(?:===?|==)\s*(?:nil|null|None|undefined)\b/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^([\w.@$]+)\.nil\?/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^([\w.@$]+)\s+is\s+None\b/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^!\s*([\w.@$]+)\s*$/.exec(trimmed);
  if (m) return { name: m[1]!, strict: false };
  // ── OLA AI (AI7), las dos ramas nuevas: sólo se alcanzan si las cuatro de
  // arriba ya devolvieron `null`. Ver el docstring.
  m = /^([\w.@$]+)\s+is\s+null\b/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^not\s+([\w.@$]+)\s*$/.exec(trimmed);
  if (m) return { name: m[1]!, strict: false };
  return null;
}

function constructsTypeOf(expr: string): boolean {
  return (
    /\bnew\s+[A-Za-z_]/.test(expr) ||
    // P4: `new(Type)` — la forma de Go, función builtin con paréntesis en vez
    // de `new Type` (C#/Java) — medido en `cobra`.
    /\bnew\(/.test(expr) ||
    /(^|\W)[A-Za-z_]\w*\.new\b/.test(expr) ||
    /&[A-Z]\w*\{/.test(expr) ||
    /^[A-Z]\w*\(/.test(expr.trim())
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA Y (Y1) — FALLAR RÁPIDO NO ES UN HUECO PARA UN OBJETO NEUTRO, y es el
 * tercer `toConfirm` de esta misma hipótesis convertido en compuerta: *"¿es de
 * verdad un concepto de dominio disperso, o una validación de entrada legítima
 * en la frontera (ahí el remedio correcto es fallar rápido, no un objeto
 * neutro)?"*.
 *
 * MEDIDO SOBRE LA POBLACIÓN QUE SOBREVIVE AL ARREGLO DE LOCALIDAD (7
 * recomendaciones en 13 repos, juzgadas una por una por este frente): TRES de
 * las siete son exactamente eso, y las tres tienen la misma forma exacta:
 *   · `nest/client-kafka.ts#unwrap`, `client-rmq.ts#unwrap`,
 *     `server-kafka.ts#unwrap`: `if (!this.client) throw new Error('Not
 *     initialized. Please call the "connect" method first.')`;
 *   · `nest/client-kafka.ts#consumer`/`#bindTopics`: idem sobre `_consumer`;
 *   · `newtonsoft/JsonSerializerInternalReader.cs`: cuatro
 *     `if (!contract.IsInstantiable) throw JsonSerializationException.Create(...)`.
 * Un objeto neutro acá es el remedio EQUIVOCADO por definición: el propósito
 * del guard es interrumpir, y sustituirlo por un no-op es precisamente el
 * riesgo que el `cost` de esta hipótesis declara ("un bug que debería lanzar
 * una excepción pasa desapercibido silenciosamente").
 *
 * RECONOCIDO POR GRAMÁTICA, no por nombre: el tipo de nodo de la consecuencia
 * (`throw_statement` en Java/C#/JS/TS, `raise_statement` en Python,
 * `throw_expression` en C#). RESIDUO DECLARADO: Ruby (`raise`) y Go (`panic`)
 * escriben la interrupción como una LLAMADA ordinaria, no como un nodo propio
 * de la gramática — ahí esta compuerta no ve nada, y distinguirla exigiría
 * nombrar la función, que es lo que este archivo no hace.
 * ──────────────────────────────────────────────────────────────────────── */
const RAISE_NODE_TYPE = /(^|_)(throw|raise)(_statement|_expression)?$/;

/** `true` si la consecuencia del guard interrumpe: ella misma es un `throw`/`raise`, o alguno de sus statements de nivel superior lo es. */
function consequenceFailsFast(consequenceNode: AstNode): boolean {
  if (RAISE_NODE_TYPE.test(consequenceNode.type)) return true;
  return namedChildren(consequenceNode).some((s) => RAISE_NODE_TYPE.test(s.type));
}

/** Mismo chequeo, mismo motivo, que `pattern-behavioral.ts#guardReassignsToConstruction`: descarta memoización/Proxy. */
function guardReassignsToConstruction(consequenceText: string, guardedName: string): boolean {
  const escaped = guardedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assign = new RegExp(`\\b${escaped}\\s*=\\s*([^=;\\n]+)`).exec(consequenceText);
  return assign !== null && constructsTypeOf(assign[1]!);
}

function stripSelfPrefix(name: string): string {
  return name.replace(/^(self\.|this\.|@)/, "");
}

/**
 * P4 — GENÉRICO a propósito: cualquier ruta con punto (`s.field`, `ctx.Value`,
 * `r.Name`) o el ivar de Ruby (`@x`) cuenta como acceso a ATRIBUTO. Un
 * identificador SUELTO sin punto es lo único que cuenta como "no es atributo".
 */
function isMemberAccessName(name: string): boolean {
  return name.startsWith("@") || name.includes(".");
}

export interface FileScanResult {
  guards: readonly Omit<NullGuardOccurrence, "file">[];
  /** Unidades-tipo del archivo con sus nombres de miembro (para el excluder por concepto). */
  units: ReadonlyMap<string, readonly string[]>;
}

/**
 * Recorre UN árbol ya parseado (real, no la sonda) buscando guards contra
 * ausente y las unidades-tipo del archivo. Manual (no `tree-walk.ts#walkTree`)
 * porque necesita pila de ámbito (clase/función) para etiquetar cada guard
 * con su `memberName`.
 */
export function scanFile(root: AstNode, sets: DerivedNodeSets): FileScanResult {
  const guards: Omit<NullGuardOccurrence, "file">[] = [];
  const units = new Map<string, string[]>();
  const classStack: string[] = [];
  const fnStack: (string | null)[] = [];

  function currentClass(): string | null {
    return classStack.length > 0 ? classStack[classStack.length - 1]! : null;
  }
  function currentMember(): string {
    if (fnStack.length === 0) return "(nivel-archivo)";
    return fnStack[fnStack.length - 1] ?? "(función anónima)";
  }

  function visit(n: AstNode): void {
    if (!n.isNamed) {
      for (let i = 0; i < n.childCount; i++) {
        const c = n.child(i) as AstNode | null;
        if (c) visit(c);
      }
      return;
    }

    let pushedClass = false;
    if (sets.classNodes.has(n.type)) {
      const name = (n.childForFieldName("name") as AstNode | null)?.text ?? null;
      if (name !== null) {
        classStack.push(name);
        pushedClass = true;
        if (!units.has(name)) units.set(name, []);
      }
    }

    let pushedFn = false;
    if (sets.functionNodes.has(n.type)) {
      const name = (n.childForFieldName("name") as AstNode | null)?.text ?? null;
      fnStack.push(name);
      pushedFn = true;
      const cls = currentClass();
      if (cls && name) units.get(cls)!.push(name);
    }

    const conditionNode = n.childForFieldName("condition") as AstNode | null;
    if (conditionNode) {
      const guard = conditionGuard(conditionNode.text);
      if (guard) {
        const consequenceNode = (n.childForFieldName("consequence") ?? n.childForFieldName("body")) as AstNode | null;
        const isLazyInit = consequenceNode ? guardReassignsToConstruction(consequenceNode.text, guard.name) : false;
        // OLA Y (Y1): el guard que INTERRUMPE es una validación de frontera,
        // no un hueco para un objeto neutro — ver `consequenceFailsFast`.
        const isFailFast = consequenceNode ? consequenceFailsFast(consequenceNode) : false;
        if (!isLazyInit && !isFailFast) {
          guards.push({
            memberName: currentMember(),
            guardedName: stripSelfPrefix(guard.name),
            strict: guard.strict,
            isMemberAccess: isMemberAccessName(guard.name),
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
          });
        }
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c) visit(c);
    }
    if (pushedFn) fnStack.pop();
    if (pushedClass) classStack.pop();
  }
  visit(root);

  return { guards, units };
}

/** Agrupa guards de VARIOS archivos por concepto (`guardedName` normalizado), filtra por el mínimo y arma los `NullGuardScatterProblem` candidatos — deliberadamente SIN agrupar por clase. */
export function groupIntoProblems(
  perFile: ReadonlyMap<string, FileScanResult>,
): NullGuardScatterProblem[] {
  const byConcept = new Map<string, NullGuardOccurrence[]>();
  const substitutesInScope: CandidateSubstitute[] = [];
  for (const [file, result] of perFile) {
    for (const g of result.guards) {
      const key = g.guardedName.toLowerCase();
      const list = byConcept.get(key) ?? [];
      list.push({ ...g, file });
      byConcept.set(key, list);
    }
    for (const [unitName, memberNames] of result.units) {
      substitutesInScope.push({ unitName, file, memberNames });
    }
  }

  const problems: NullGuardScatterProblem[] = [];
  for (const [conceptName, occurrences] of byConcept) {
    const distinct = new Set(occurrences.map((o) => `${o.file}#${o.memberName}`));
    if (distinct.size < NULL_OBJECT_MIN_OCCURRENCES) continue;
    problems.push({ conceptName, occurrences, substitutesInScope });
  }
  return problems;
}

function toRoleLocation(o: NullGuardOccurrence, index: number): RoleLocation {
  return { file: o.file, startLine: o.startLine, endLine: o.endLine, role: `guardia #${index + 1} en "${o.memberName}"` };
}

function structuralPlaces(problem: NullObjectStructuralProblem): readonly RoleLocation[] {
  const { candidate, index } = problem;
  const places: RoleLocation[] = [];
  const nType = index.nodeById.get(candidate.nullTypeId);
  if (nType) {
    places.push({
      file: nType.file,
      startLine: nType.startLine ?? 1,
      endLine: nType.endLine ?? nType.startLine ?? 1,
      symbol: nType.symbolPath.join("."),
      role: candidate.form === "completa" ? "tipo que ya implementa el patrón (Null Object aplicado)" : "objeto vacío ad hoc (candidato a formalizar)",
    });
  }
  candidate.instantiationSites.slice(0, 3).forEach((siteId, i) => {
    const site = index.nodeById.get(siteId);
    if (site) {
      places.push({
        file: site.file,
        startLine: site.startLine ?? 1,
        endLine: site.endLine ?? site.startLine ?? 1,
        symbol: site.symbolPath.join("."),
        role: `sitio de sustitución #${i + 1}`,
      });
    }
  });
  return places;
}

/**
 * `HypothesisBuilder` — dos rutas de evidencia (ver docstring del módulo):
 * (1) estructural repo-wide sobre `graph` (REAL en producción para este
 * ancla, a diferencia de `ctx.file`/`ctx.fileAt`), intentada primero; (2)
 * AST-scatter heredada, VIVA en producción desde R1 (Ola D) aunque el
 * docstring afirmara lo contrario — es la que produce hoy todas las
 * hipótesis vivas de Null Object del corpus. Las DOS rutas exigen relación
 * con `problem` antes de emitir (bug 1 de "tres bugs de mecanismo"), pero
 * con criterios DISTINTOS y por una razón medida: la ruta (1) muestra como
 * `places` el tipo nulo y sus sitios de instanciación, que legítimamente
 * viven en otro archivo, así que le alcanza el vecindario; la ruta (2)
 * muestra como `places` las ocurrencias del concepto, así que exige
 * solapamiento de LÍNEAS con la evidencia del ancla. Ver la nota de la Ola G
 * dentro de `build()`.
 */
/* ────────────────────────────────────────────────────────────────────────
 * MEMOIZACIÓN — OLA X, INTEGRADOR. El costo, no el resultado.
 *
 * QUÉ PASÓ, MEDIDO CON PERFIL: `build()` reconstruía, POR CADA HALLAZGO
 * CANDIDATO, tres cosas de repo entero — `buildNullObjectIndex` (dos veces:
 * una directa y otra adentro de `findNullObjectStructuralCandidates`) y, sobre
 * todo, un `scanFile` de TODOS los archivos del repo (`for (const f of
 * ctx.repo.files) filePaths.add(f.path)`). Con el ancla única
 * `distributed-duplication` eso costaba poco: 10 candidatos en los 13 repos.
 * La Ola X (B6) sumó `duplication` como segunda ancla —1.088 hallazgos en el
 * corpus— y el mismo código pasó a recorrer el AST del repo entero una vez
 * POR HALLAZGO. Perfil de `hugo` al cerrar la ola: 225 s totales, de los
 * cuales 105 s en `tree-sitter#setValue/unmarshalNode/marshalNode/getValue`
 * llamados desde `buildNullObjectIndex`/`visit` de este archivo, contra 74 s
 * de TODO el análisis al cerrar la Ola W. Es exactamente el antipatrón que
 * `CONTEXTO.md` §5 prohíbe ("si construís un índice, cacheálo: en la Ola V
 * tres índices se reconstruían por hipótesis candidata y costaban 170 s").
 *
 * POR QUÉ ESTA MEMOIZACIÓN NO PUEDE CAMBIAR NINGÚN RESULTADO. Las tres
 * funciones son puras respecto de sus entradas, y las claves de caché son
 * exactamente esas entradas por IDENTIDAD:
 *   · el índice y los candidatos estructurales dependen de `(graph, fileAt)`,
 *     y `fileAt` es un closure estable por PASADA de `hypotheses/run.ts`
 *     (`filesByPath.get`), así que la caché es de dos niveles y una pasada
 *     nunca lee el índice de otra;
 *   · `scanFile(file.root, file.sets)` depende del `FileUnit`, y dentro de una
 *     pasada `fileAt(path)` devuelve SIEMPRE el mismo objeto.
 * Misma disciplina que `confident-edges.ts#CACHE` (Ola V) y que el
 * `WeakMap<CodeGraph, GraphFacts>` que B5 le puso a `prototype.ts` en esta
 * misma ola, por el mismo motivo y con la misma forma.
 * ──────────────────────────────────────────────────────────────────────── */
type FileAt = ((path: string) => FileUnit | null) | null;
const SIN_FILE_AT = { sinFileAt: true };
const INDEX_CACHE = new WeakMap<CodeGraph, WeakMap<object, NullObjectGraphIndex>>();
const CANDIDATES_CACHE = new WeakMap<CodeGraph, WeakMap<object, readonly NullObjectStructuralCandidate[]>>();
const SCAN_CACHE = new WeakMap<FileUnit, FileScanResult>();

function porPasada<T>(cache: WeakMap<CodeGraph, WeakMap<object, T>>, graph: CodeGraph, fileAt: FileAt, calcular: () => T): T {
  let porGrafo = cache.get(graph);
  if (!porGrafo) {
    porGrafo = new WeakMap<object, T>();
    cache.set(graph, porGrafo);
  }
  const clave = (fileAt as unknown as object) ?? SIN_FILE_AT;
  const guardado = porGrafo.get(clave);
  if (guardado !== undefined) return guardado;
  const calculado = calcular();
  porGrafo.set(clave, calculado);
  return calculado;
}

const indiceCacheado = (graph: CodeGraph, fileAt: FileAt): NullObjectGraphIndex =>
  porPasada(INDEX_CACHE, graph, fileAt, () => buildNullObjectIndex(graph, fileAt));

const candidatosCacheados = (graph: CodeGraph, fileAt: FileAt): readonly NullObjectStructuralCandidate[] =>
  porPasada(CANDIDATES_CACHE, graph, fileAt, () => findNullObjectStructuralCandidates(graph, fileAt));

function scanCacheado(file: FileUnit): FileScanResult {
  const guardado = SCAN_CACHE.get(file);
  if (guardado) return guardado;
  const calculado = scanFile(file.root, file.sets);
  SCAN_CACHE.set(file, calculado);
  return calculado;
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — LA TRAZA DEL EMBUDO (auditoría de compuertas).
 * Mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace` y `strategy.ts#startStrategyTrace`
 * (Ola AH, AH1): `null` en producción ⇒ costo cero. Los `required` que se
 * re-corren acá son puros. No cambia ningún comportamiento — sólo registra,
 * en cada punto de salida, EN QUÉ ETAPA murió el candidato.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface NullObjectTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly withGraph: boolean;
  murioEn: string;
  /** Ruta (1): candidatos estructurales del repo y los que quedan tras el gate de solapamiento con la evidencia del ancla. */
  candidatosEstructurales: number;
  candidatosCercanos: number;
  /** Ruta (2): archivos con árbol vivo y grupos de guardas que solapan la evidencia. */
  archivosConArbol: number;
  candidatosScatter: number;
  checks: readonly { readonly id: string; readonly holds: boolean }[];
  appliedState: string | null;
}

let nullObjectTrace: NullObjectTraceEntry[] | null = null;

export function startNullObjectTrace(): void {
  nullObjectTrace = [];
}

export function takeNullObjectTrace(): readonly NullObjectTraceEntry[] {
  const t = nullObjectTrace ?? [];
  nullObjectTrace = null;
  return t;
}

function nuevaTrazaNullObject(problem: Finding, graph: CodeGraph | null): NullObjectTraceEntry | null {
  if (!nullObjectTrace) return null;
  const loc = problem.locations[0];
  return {
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    withGraph: graph !== null,
    murioEn: "",
    candidatosEstructurales: 0,
    candidatosCercanos: 0,
    archivosConArbol: 0,
    candidatosScatter: 0,
    checks: [],
    appliedState: null,
  };
}

function cerrarTrazaNullObject(t: NullObjectTraceEntry | null, murioEn: string): void {
  if (!t) return;
  t.murioEn = murioEn;
  nullObjectTrace?.push(t);
}

export const nullObject: HypothesisBuilder = {
  id: "null-object",
  pattern: "Null Object",
  layer: "patron",
  // OLA AE (AE10): SUMA la tercera ancla. Las dos viejas siguen exactamente
  // donde estaban, con sus números publicados y sin un cambio de comportamiento
  // — ver §OLA AE del docstring del módulo.
  anchors: ["distributed-duplication", "duplication", "repeated-absence-check"],
  build(problem: Finding, graph, ctx): PatternHypothesisDraft | null {
    const g = graph ?? ctx.repo.graph;
    const tz = nuevaTrazaNullObject(problem, g);

    // ── Ruta (3), OLA AE (AE10): el ancla-FUERZA. Camino PROPIO y aislado —
    // ver §B2. No comparte ni un `required`, ni un discriminador, ni una rama
    // de `appliedState` con las dos rutas de abajo, y sale antes de tocarlas.
    if (problem.kind === "repeated-absence-check") {
      if (!g) {
        cerrarTrazaNullObject(tz, "sin-grafo");
        return null;
      }
      const candidato = ausenciasCacheadas(ctx.repo.clones, g).find((c) => c.colaborador === problem.variant);
      // Sin candidato reconstruible (el `variant` no coincide con ningún
      // colaborador de esta corrida) NO se inventa uno: silencio.
      if (!candidato) {
        cerrarTrazaNullObject(tz, "variant-no-reconstruible");
        return null;
      }
      if (candidato.sustitutoCompleto) {
        cerrarTrazaNullObject(tz, "sustituto-ya-completo");
        return null;
      }
      const outcome = engineBuild(NULL_OBJECT_ABSENCE_SPEC, ctx.capabilities, candidato, undefined);
      if (tz) {
        tz.checks = NULL_OBJECT_ABSENCE_SPEC.required.map((ch) => ({ id: ch.id, holds: ch.run(candidato, undefined).holds }));
        tz.appliedState = NULL_OBJECT_ABSENCE_SPEC.appliedState(candidato, undefined).state;
      }
      if (!outcome) {
        cerrarTrazaNullObject(tz, tz?.checks.find((ch) => !ch.holds)?.id ?? "required");
        return null;
      }
      cerrarTrazaNullObject(tz, "emitido");
      return toPatternHypothesis(NULL_OBJECT_ABSENCE_SPEC, outcome, {
        anchorFindingId: problem.id,
        places: absencePlaces(candidato),
        cost:
          `Un tipo neutro que implemente los ${candidato.mensajesConProtocolo.length} mensaje(s) del colaborador (${candidato.mensajesConProtocolo.slice(0, 4).join(", ")}) y se sustituya en el sitio que hoy puede devolver ausente, para que los ${candidato.clientes.length} clientes dejen de preguntar. ` +
          "El riesgo es el de siempre en este patrón: un bug que debería lanzar una excepción pasa desapercibido silenciosamente.",
      });
    }

    // ── Ruta (1): estructural, repo-wide, sin árbol vivo — EXIGE SOLAPAMIENTO
    // DE RANGO con la evidencia del ancla (OLA Y, Y1: el arreglo de la Ola G
    // portado a esta ruta, ver el bloque sobre `restrictToAnchorEvidence`).
    // Antes exigía sólo vecindario a un salto, que en un repo real alcanza
    // casi todo.
    if (g) {
      const index = indiceCacheado(g, ctx.fileAt);
      const structuralCandidates = candidatosCacheados(g, ctx.fileAt);
      const nearCandidates = restrictToAnchorEvidence(structuralCandidates, index, problem.locations);
      if (tz) {
        tz.candidatosEstructurales = structuralCandidates.length;
        tz.candidatosCercanos = nearCandidates.length;
      }
      for (const candidate of nearCandidates) {
        const structProblem: NullObjectStructuralProblem = { candidate, index, functions: ctx.repo.functions };
        const outcome = engineBuild(NULL_OBJECT_STRUCTURAL_SPEC, ctx.capabilities, structProblem, undefined);
        if (tz && tz.checks.length === 0) {
          tz.checks = NULL_OBJECT_STRUCTURAL_SPEC.required.map((ch) => ({ id: `r1:${ch.id}`, holds: ch.run(structProblem, undefined).holds }));
        }
        if (!outcome) continue;
        cerrarTrazaNullObject(tz, "emitido");
        return toPatternHypothesis(NULL_OBJECT_STRUCTURAL_SPEC, outcome, {
          anchorFindingId: problem.id,
          places: structuralPlaces(structProblem),
          cost:
            candidate.form === "completa"
              ? "Ninguno — el patrón ya está aplicado; el riesgo es que un bug real (debería lanzar/registrar) pase desapercibido en silencio."
              : "Extraer una interfaz común y hacer que el tipo vacío la declare — costo bajo: es formalizar algo que ya existe de hecho.",
        });
      }
    }

    // ── Ruta (2): AST-scatter, sobre `ctx.fileAt`.
    //
    // *** OLA G, INTEGRADOR — LA PREMISA "ESTA RUTA ESTÁ INERTE" ERA FALSA, Y
    // *** EL BUG 1 SEGUÍA VIVO POR ACÁ EN 2 DE LAS 3 POBLACIONES DONDE HAY
    // *** DÓNDE MEDIRLO. El comentario anterior decía "devuelve `null` CASI
    // SIEMPRE en el cableado de producción de hoy" y por eso la revisión de
    // bug 1 se concentró en la ruta (1). Medido corriendo `analyzeRepo`:
    // R1 (Ola D) hizo que `crossAnalyze` reparse bajo demanda TODO archivo
    // tocado por la evidencia de un `Finding` inter-file — y las dos anclas
    // de hoy (`distributed-duplication`, y desde la Ola X (B6) también
    // `duplication` — ver el docstring del módulo) SON inter-file. Así que
    // `ctx.fileAt` resuelve, `perFile` se llena y esta
    // ruta es la que produce, HOY, todas las hipótesis vivas de Null Object:
    //   - `corpus/newtonsoft-json` (C#): 4 hipótesis, las 4 recomendando un
    //     Null Object para `JsonTypeReflector.FullyTrusted` —un booleano
    //     estático de permisos, guardado en `JsonObjectContract.cs#
    //     GetUninitializedObject`— sobre anclas cuyo `where` son bloques
    //     `Close()`/`Dispose()` duplicados en `BsonReader.cs`/
    //     `JsonTextReader.cs`/`JsonTextWriter.cs`. Verificado a mano
    //     abriendo los archivos: cero relación.
    //   - `Visability/Frontend` (Vue): 4 hipótesis, 3 de ellas idénticas,
    //     recomendando un Null Object para `formRendererRef.value`
    //     (`FormPublicPage.vue`) sobre un ancla cuyo `where` son
    //     `BookingCalendar.vue`/`CalendarView.vue`.
    //   - Rails: 0 — pero por CONTENIDO (un solo `distributed-duplication`
    //     en todo el repo, en dos migraciones), no porque el mecanismo lo
    //     impidiera. Ése es exactamente el sesgo que RAICES.md advierte:
    //     el bug se declaró cerrado midiendo en la única población donde no
    //     tenía dónde manifestarse.
    //
    // LA CAUSA: el filtro usaba `related` — el VECINDARIO a un salto
    // (`relatedFiles`: los archivos de cualquier OTRO hallazgo que comparta
    // archivo o símbolo con `problem`). En un repo real ese salto alcanza
    // casi todo (941 archivos en newtonsoft, 536 en el frontend), así que
    // "estar relacionado" deja de ser una restricción. Y para ESTA ruta el
    // vecindario es además la pregunta equivocada: las `places` que el
    // producto muestra SON las ocurrencias del concepto, así que si ninguna
    // cae en un archivo del propio `Finding` ancla, lo que se muestra como
    // recomendación no tiene nada que ver con lo que se muestra como
    // evidencia — el defecto que la revisión de bug 1 llamó "la peor clase
    // de error posible".
    //
    // EL ARREGLO: para esta ruta la relación se exige contra los archivos
    // PROPIOS del `Finding` ancla, no contra su vecindario. La ruta (1)
    // sigue con `related` (ahí las `places` son el tipo nulo y sus sitios de
    // instanciación, que legítimamente viven en otro archivo que la
    // duplicación — el argumento de "REVISIÓN POST-DIAGNÓSTICO" sigue en pie
    // para ESA ruta y sólo para ésa).
    // Y la exigencia no es "mismo archivo" sino SOLAPAMIENTO DE RANGO con la
    // evidencia mostrada. Medido: con "mismo archivo" a secas quedaban 2 de
    // las 4 hipótesis de `corpus/newtonsoft-json`, las dos apuntando a
    // `JsonObjectContract.cs` — el archivo SÍ coincidía, pero el `where` eran
    // los bloques duplicados de las líneas 80-87/176-184 y el guard del
    // concepto vive en `GetUninitializedObject`, línea ~194: mismo archivo,
    // otra región, la misma clase de error un escalón más chica. La pregunta
    // correcta es SEMÁNTICA, no de proximidad: si lo que esta hipótesis
    // recomienda extraer es la repetición de un guard contra ausencia,
    // entonces ese guard tiene que estar DENTRO de las copias que el ancla
    // reporta como duplicadas. Si no lo está, lo duplicado es otra cosa y
    // Null Object no es el remedio de ESE hallazgo.
    const anchorRanges = problem.locations;
    const dentroDeLaEvidencia = (o: NullGuardOccurrence): boolean =>
      anchorRanges.some((l) => l.file === o.file && o.startLine <= l.endLine && o.endLine >= l.startLine);

    const filePaths = new Set<string>(problem.locations.map((l) => l.file));
    for (const f of ctx.repo.files) filePaths.add(f.path);

    const perFile = new Map<string, FileScanResult>();
    for (const path of filePaths) {
      const file = ctx.fileAt(path);
      if (!file) continue; // árbol no vivo esta corrida — ver docstring del módulo.
      perFile.set(path, scanCacheado(file));
    }
    if (tz) tz.archivosConArbol = perFile.size;
    if (perFile.size === 0) {
      cerrarTrazaNullObject(tz, "sin-arbol-vivo");
      return null; // sin NINGÚN árbol vivo no hay evidencia que reconstruir.
    }

    const scatterIndex = g ? indiceCacheado(g, ctx.fileAt) : null;
    const candidates = groupIntoProblems(perFile).filter((p) => p.occurrences.some(dentroDeLaEvidencia));
    if (tz) tz.candidatosScatter = candidates.length;
    for (const candidate of candidates) {
      const outcome = engineBuild(NULL_OBJECT_SPEC, ctx.capabilities, candidate, scatterIndex);
      if (tz) {
        tz.checks = NULL_OBJECT_SPEC.required.map((ch) => ({ id: `r2:${ch.id}`, holds: ch.run(candidate, scatterIndex).holds }));
      }
      if (!outcome) continue;
      cerrarTrazaNullObject(tz, "emitido");
      return toPatternHypothesis(NULL_OBJECT_SPEC, outcome, {
        anchorFindingId: problem.id,
        places: candidate.occurrences.map(toRoleLocation),
        cost: "Una clase/valor neutro (`GuestUser`, `NoOpLogger`) que implemente el mismo protocolo que el objeto guardado — el riesgo es que un bug que debería lanzar una excepción pase desapercibido silenciosamente.",
      });
    }
    cerrarTrazaNullObject(
      tz,
      tz && tz.checks.length > 0 ? (tz.checks.find((ch) => !ch.holds)?.id ?? "required") : tz && tz.candidatosCercanos === 0 && tz.candidatosScatter === 0 ? "sin-candidato" : "sin-candidato",
    );
    return null;
  },
};
