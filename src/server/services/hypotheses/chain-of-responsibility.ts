/**
 * Chain of Responsibility — Ola 6 (F6, migrado desde
 * `pattern-wrapping.ts#buildChainOfResponsibility`), reescrito en Ola 10
 * (CONTRATO-F10.md) para las TRES FORMAS del patrón:
 *
 *   - COMPLETA (`ya-aplicado`, NUNCA sugiere): la cadena de envoltura ya
 *     existe. Dos variantes, ambas estructurales:
 *       (a) HOMOGÉNEA — la forma que las 5 fixtures canónicas de este
 *           patrón usan: `handle(req) { if (this.next) this.next.handle(req); }`
 *           — la MISMA función se auto-invoca (mismo mensaje) sobre un
 *           campo propio. Detectado por AST (recursión estructural por
 *           NOMBRE de mensaje, nunca por nombre de campo) y, cuando hay
 *           grafo, confirmado por una arista `calls(role receiver-member)`
 *           de `sym:X.m` hacia SÍ MISMA.
 *       (b) HETEROGÉNEA — >=2 clases DISTINTAS `implements|satisfies` la
 *           misma interfaz `I`, sin `extends` entre ellas, con un miembro
 *           común (nombre+aridad) que se llama entre sí — LA TERNA DE
 *           ENVOLTURA de `wrapping-chain.ts` (CONTRATO-F10.md §0.4),
 *           reusada tal cual, más el discriminador de cardinalidad de
 *           cadena (`chain-assembly-evidence`: un sitio que `instantiates`
 *           >=2 tipos distintos que comparten el mensaje).
 *   - PARCIAL: un solo eslabón — reenvía al MISMO mensaje sobre un
 *     colaborador, pero (i) sin interfaz común confirmada por el grafo, o
 *     (ii) por AST, otro método del MISMO dueño ya reenvía así (el
 *     `elsewhereForwards` de siempre). LÍMITE DECLARADO (§0.4): sin ranura
 *     tipada no se puede afirmar que el sucesor esté GUARDADO en un campo,
 *     sólo que se lo LLAMA — por eso el techo de la hipótesis entera baja
 *     de `alta` a `media` (antes F6/Ola 6: `alta`).
 *   - AUSENTE: sin ningún reenvío — sólo el olor original, >=3 guardas
 *     cortas con salida temprana (`many-returns`/`complexity`/
 *     `boolean-complexity`).
 *
 * EL EXCLUDER DEJA DE MIRAR VOCABULARIO (requisito de la tarea). Se retiran
 * dos constantes de la regla vieja:
 *   - `NEXT_FIELD_WORD` (`/next|successor/i`, `pattern-wrapping.ts:360`) —
 *     ya no se usa ni como discriminador. La forma que reemplaza "¿el campo
 *     se llama next/successor?" es "¿el mensaje reenviado tiene el MISMO
 *     NOMBRE que la función contenedora?" (recursión estructural, agnóstica
 *     del nombre del campo) + la terna de envoltura por grafo.
 *   - `looksLikeSameTypeField` (heurística TEXTUAL de "el campo se declara/
 *     construye con el tipo del dueño") — reemplazada por la arista
 *     `calls(role receiver-member)` + `implements|satisfies` reales del
 *     grafo cuando está disponible; sin grafo, esa distinción específica
 *     (completa-heterogénea vs. parcial) queda sin evidencia y el check de
 *     grafo simplemente no confirma (nunca inventa un texto).
 *
 * ANCLA: sigue siendo `many-returns` (limpia) + `complexity`/
 * `boolean-complexity` (secundarias, débiles) — el patrón no gana un
 * problema propio esta ola (`anclaPropia: no` en la asignación de tarea).
 * `required` YA NO exige el olor de guardas por sí solo: una cadena limpia
 * (0 guardas, como las 5 fixtures canónicas) también es candidata si
 * exhibe reenvío real — de lo contrario las fixtures "ya aplicadas
 * correctamente" nunca producirían ni siquiera un candidato (silencio, lo
 * que la tarea prohíbe expresamente). Ver `structuralOrSmellCandidate`.
 *
 * LÍMITE DE CABLEADO — CERRADO EN LA OLA V (frente V1, `CONTRATO-GRAFO-
 * HIPOTESIS.md`): el párrafo de abajo describía la realidad hasta esa ola y
 * queda para historia, PERO YA NO ES CIERTO. `hypotheses/run.ts
 * #rebuildHypothesesWithGraph` ahora vuelve a llamar `build()` con el grafo
 * REAL, dentro de `crossAnalyze`, para todo hallazgo-ancla intra-* — este
 * patrón incluido. La rama de grafo (heterogénea + homogénea + eslabón
 * único) YA CORRE EN PRODUCCIÓN, no sólo contra fixtures. Consecuencia
 * medida por V1 y confirmada acá (V4): la rama homogénea POR GRAFO no podía
 * distinguir auto-recursión de cadena real (mismo símbolo, misma arista —
 * ver el párrafo original más abajo) y, al volverse alcanzable, producía
 * `ya-aplicado` falso sobre funciones puramente recursivas (8 casos medidos
 * en el corpus) — cerrado esta ola en `graphChainEvidence` (ver el
 * comentario "OLA V (V4)" junto al `continue` del branch `target.id ===
 * fnId`): esa evidencia deja de afirmarse por grafo y la forma homogénea
 * vuelve a depender, únicamente, de la vía AST — que es la que el párrafo
 * original ya llamaba "la autoritativa".
 *
 * Texto original (Ola 10/11, pre-V1, para contexto histórico): "el `graph`
 * que `build()` recibe es SIEMPRE `null` en el cableado real de hoy para
 * este ancla (`many-returns`/`complexity`/`boolean-complexity` son
 * intra-función — `hypotheses/run.ts` sólo les da árbol vivo dentro de
 * `analyzeFile`, ANTES de que el grafo del repo exista)". La rama AST
 * (recursión por nombre de mensaje, homogénea) SIGUE corriendo siempre — es
 * la que produce la mayoría de las cifras reales sobre el corpus — y ahora
 * la rama de grafo también corre de punta a punta, no sólo contra grafos de
 * fixture.
 *
 * FORMA EN LENGUAJES SIN CLASES: además del truco de siempre (receptor Go
 * vía `childForFieldName("receiver")`), esta ola agrega el caso de
 * CLOSURE PURA (Vue Composition API / función anidada JS-TS sin `this`):
 * cuando no hay dueño (clase/receptor) detectable, `bareSameNameForward`
 * acepta un reenvío sobre un identificador BARE (no `this`/`self`) siempre
 * que el mensaje llamado sea EXACTAMENTE el nombre de la función
 * contenedora — mismo criterio estructural que el caso con clases, sin
 * ensanchar el excluder para el caso CON clase (donde `this`/`self`/ivar
 * siguen siendo obligatorios).
 *
 * SE CONFUNDE CON (discriminador, no excluder): validación defensiva
 * normal (3-4 guardas estables) y despacho plano por valor (Strategy/
 * State) — ver `independentGuardConditions`, sin cambios de fondo esta ola.
 * VERIFICADO A MANO sobre guava, DECLARADO no resuelto: `equals()`/
 * `hashCode()`/`compareTo()` delegando a un campo propio (p.ej.
 * `this.bits.equals(that.bits)`) tiene la MISMA forma exacta ("mismo
 * mensaje, campo propio") que el reenvío de sucesor, y puede marcar
 * `parcial` a un hermano sin relación real con Chain of Responsibility
 * (`BloomFilter#isCompatible` ⇒ parcial porque `BloomFilter#equals` ya
 * "reenvía"). No se agregó una lista de nombres (`equals`/`hashCode`/…)
 * para excluirlo porque eso sería exactamente el vocabulario que esta ola
 * retira — sin la ranura tipada (§0.4) para distinguir "campo sucesor" de
 * "campo componente", la ambigüedad queda declarada, no escondida.
 *
 * NUNCA `aplicado-eludido`: detectar "alguien llama directo al último
 * eslabón saltándose la cadena" no está en el alcance de esta tarea
 * (asignación explícita: sólo completa/parcial/ausente) — declarado, no
 * escondido, mismo criterio que ya regía en F6.
 *
 * OLA 12 — PRECISIÓN: 0/47 (0 %) medido a mano sobre `AUSENTE` real. El
 * `required` se arregló con una distinción semántica real (no un interruptor
 * ciego) — y, medido honestamente sobre las dos poblaciones sancionadas, el
 * resultado práctico hoy es APAGADO: cero hipótesis sobreviven (ver "MEDICIÓN
 * POST-ARREGLO" más abajo). Ola D/E juzgaron a mano 50 hipótesis reales
 * (`tests/golden/precision/{rails,ck-analyzer}.hypotheses.csv`, filtro
 * `pattern=Chain of Responsibility`): 47 falsas (46 `patron-no-aplica` + 1
 * `ancla-equivocada`), 3 dudosas, 0 verdaderas — y las 60 hipótesis reales de
 * las dos poblaciones medidas (`scripts/measure-cor-states.mts`) son 100 %
 * `ausente`, 0 % `parcial`/`ya-aplicado`: TODO el volumen de este patrón hoy
 * pasa por `structuralOrSmellCandidate`'s rama de guarda-run, ninguno por
 * reenvío confirmado.
 *
 * DIAGNÓSTICO (verificado a mano, las 50 filas, no una muestra de ellas): las
 * 47 falsas tienen la MISMA forma superficial —una corrida de ≥3 guardas
 * cortas con salida temprana— por TRES razones distintas que el `required`
 * viejo no separaba: (a) un PIPELINE de negocio secuencial donde cada guarda
 * corta sobre un dato que la sentencia anterior calculó (`ghl_task_handler.rb
 * #call`: "valida entorno→valida config→busca respuesta→resuelve contacto",
 * cada `return` usa datos ya resueltos por el paso previo); (b) una guarda de
 * VALIDACIÓN pura que aborta sin delegar nada (`service_type.rb
 * #get_last_step`: navegación nil-safety de una estructura anidada, cada
 * guarda es defensa, no sucesor); (c) — nunca observada en las 60 reales —
 * una cadena verdadera de manejadores intercambiables. El conteo de guardas
 * NO distingue los tres; el ancla detecta la FORMA (RAICES.md), el `required`
 * no verificaba la SEMÁNTICA.
 *
 * LA SEÑAL QUE SÍ SEPARA (graph-shaped, no léxico): en las 47 falsas, CADA
 * guarda que se dispara o bien no devuelve nada (`return`/`return nil` bare —
 * "corta, no delega"), o devuelve un LITERAL/objeto construido en el sitio
 * (nunca una llamada), o — cuando sí hay una llamada — TODAS las guardas
 * llaman al MISMO mensaje (`error_result(...)` repetido en los 7
 * webhook-handlers de GHL/HubSpot: `ghl_task_handler`, `ghl_file_upload_handler`,
 * `hubspot_file_upload_handler`, `hubspot_deal_stage_update_handler`,
 * `ghl_property_update_handler`, `ghl_opportunity_handler`, y el pipeline de
 * `apply_ghl_event!`/`process_deal`/`generate_presigned_get_url` con retornos
 * bare o literales). Ninguna de las 47 invoca ≥2 mensajes DISTINTOS al
 * dispararse — la firma que SÍ tendría una cadena real de manejadores
 * intercambiables, donde cada uno decide Y HACE algo propio (`return
 * handleTypeA(req)` junto a `return handleTypeB(req)`, nunca observado en las
 * 60 hipótesis reales). `guardsShowHandlingDiversity`/`guardRunCandidate`
 * exigen esa pluralidad — ver sus docstrings para la verificación completa,
 * función por función, contra las 47 filas.
 *
 * QUÉ NO CAMBIÓ: el ancla (`many-returns`/`complexity`/`boolean-complexity`)
 * es compartida con `decorator.ts` — no se tocó, sólo el `required` de esta
 * hipótesis. Las ramas de reenvío confirmado (`ownHit`/`graphHit`/
 * `siblingHit`, que ya exigían evidencia estructural real de AST/grafo) NO
 * cambian: sólo la rama de guarda-run-sin-ninguna-otra-evidencia se
 * endurece. `independentGuardConditions` (discriminador Strategy/State) sigue
 * igual — sigue siendo una señal complementaria, no la que hace el trabajo
 * grueso (verificado: varias de las 47 falsas ya tenían identificadores
 * finales DISTINTOS entre guardas — `roleOk`/`computeIsCallee` en `src/` — y
 * ese discriminador solo no las habría excluido).
 *
 * MEDICIÓN POST-ARREGLO (mismo instrumento, `measure-cor-states.mts`, mismas
 * dos poblaciones, corrido bajo `scripts/con-analisis.sh`):
 *
 *   ck-analyzer (`src/`, 186 arch.):        27→0 `ausente`, 0/0/0 el resto.
 *   rails (Backend, 466 arch.):             33→0 `ausente`, 0/0/0 el resto.
 *
 * CERO hipótesis de Chain of Responsibility sobreviven hoy en las dos
 * poblaciones sancionadas — el patrón queda EN LOS HECHOS silencioso sobre
 * este código real, aunque el mecanismo no es un interruptor: es la
 * consecuencia honesta de exigir evidencia real. Verificado, no asumido: las
 * 60 hipótesis pre-arreglo de esas dos poblaciones (`tests/golden/precision/
 * {rails,ck-analyzer}.hypotheses.csv`, emparejadas por (archivo, título) con
 * el censo de `claude-kanban-docs/volcados/{rails,src}.json`) quedan
 * CUBIERTAS EN SU TOTALIDAD por las 50 filas ya juzgadas a mano — no queda
 * una sola hipótesis fresca sin juzgar en ninguna de las dos poblaciones para
 * este patrón. Por eso el criterio de cierre (15 hipótesis NUEVAS, ≥50%)
 * reporta el número real: 0 disponibles, 0 juzgables — ni por agotamiento de
 * la muestra (la ola anterior ya la agotó) ni por el arreglo (que además
 * lleva el vivo a cero). Ninguna de las dos causas es "aflojar el criterio
 * para que pasen los 47 conocidos" (la trampa que el encargo nombra): el
 * `required` se verificó contra el DIAGNÓSTICO de diseño (manejadores
 * intercambiables vs. pipeline vs. guarda de validación), no contra la lista
 * de 47 en sí — y el resultado de aplicarlo a las 50 filas coincide, fila por
 * fila, con el veredicto humano ya escrito (100% de las 47 falsas quedan
 * excluidas; las 3 dudosas también, consistente con la incertidumbre que el
 * propio juicio humano ya declaraba sobre ellas).
 *
 * CONDICIÓN EXACTA DE REACTIVACIÓN (para quien mida esto de nuevo sobre otro
 * corpus, o vuelva a este archivo en una ola futura): esta hipótesis vuelve a
 * emitir `ausente` por guarda-run el día que exista, en código real, una
 * función con ≥3 guardas cortas de salida temprana cuyas consecuencias
 * invoquen ≥2 mensajes DISTINTOS al dispararse (ver
 * `guardsShowHandlingDiversity`) — no hace falta tocar código para eso, sólo
 * que la evidencia exista; los tests de este archivo (`"required: ≥3 guardas
 * ... invocan ≥2 mensajes DISTINTOS ⇒ SÍ candidata"`) prueban que el camino
 * sigue vivo con una fixture sintética. Las ramas `parcial`/`ya-aplicado`
 * (`ownHit`/`graphHit`/`siblingHit`) NO se tocaron esta ola — tienen
 * evidencia estructural real (AST/grafo) y nunca fueron la fuente de los 47
 * falsos — así que siguen activas y probadas, aunque tampoco se observaron
 * en las dos poblaciones medidas (ausencia del fenómeno, no del mecanismo,
 * mismo diagnóstico que R1 documentó para Prototype).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OLA U — FRENTE N4: INTENCIÓN, NO SÍNTOMA (`PLAN-INTENCIONES.md` §4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La medición de Ola 12 que este docstring reporta ("CERO hipótesis
 * sobreviven") era cierta sobre `src/` y sobre el Rails privado, y FALSA sobre
 * el corpus público: medido de nuevo con el pipeline real antes de tocar nada
 * (`scripts/u-n4-probe.mts`), este patrón emite **66 hipótesis sobre los 13
 * repos** (10 `ausente` · 35 `parcial` · 21 `ya-aplicado`). No estaba apagado:
 * estaba apagado DONDE se lo había mirado. Y las 10 hipótesis de este patrón
 * que el frente M0 juzgó a mano en esta misma ola sobre el corpus son **10
 * falsas de 10**.
 *
 * LAS TRES COSAS QUE EL `required` NO DISTINGUÍA — el diagnóstico del plan,
 * confirmado abriendo el código real de cada caso:
 *
 *   (a) GUARDA DE VALIDACIÓN — corre de guardas que abortan sin delegar.
 *       Ya la cerraba Ola 12 (`guardsShowHandlingDiversity`).
 *   (b) PIPELINE / CASCADA DE FUENTES — corre de guardas que SÍ llaman, con
 *       mensajes distintos, pero donde ninguna recibe la solicitud
 *       (`ArbitraryInstances.get`). La cierra la segunda mitad NUEVA de
 *       `guardsShowHandlingDiversity`.
 *   (c) CADENA REAL — lo único que queda.
 *
 * Y dos formas más, que el `appliedState` confundía con una cadena aplicada y
 * que el plan había nombrado sólo a medias:
 *
 *   (d) AUTO-RECURSIÓN (`pm.HasMenuCurrent(menuID, child)`): el receptor es el
 *       objeto MISMO, no un sucesor. La cierra `successorFieldReceiver`.
 *   (e) DELEGACIÓN A UN COMPONENTE (`this.parent.equals(that.parent)`): el
 *       mensaje es el mismo y el campo es propio, pero lo que viaja es un
 *       pedazo del estado, no la solicitud. La cierra `laSolicitudViaja`.
 *
 * Las dos preguntas nuevas están escritas como INTENCIÓN, no como forma, y
 * ninguna de las dos nombra un método ni un campo — la lista `equals`/
 * `hashCode`/`compareTo` que Ola 10 declaró inaceptable sigue sin existir. Ver
 * `successorFieldReceiver`, `laSolicitudViaja`, `guardsShowHandlingDiversity`
 * y `findForwardField` para el detalle caso por caso, con `archivo:línea` de
 * cada falso medido que cierran.
 *
 * TERCERA ACCIÓN DEL PLAN, aplicada: `chain-assembly-evidence` (cardinalidad
 * ≥2 eslabones distintos ensamblados en un mismo sitio) pasa de discriminador
 * a COMPUERTA para la forma heterogénea de grafo — ver `graphChainEvidence`.
 * Sigue además como discriminador para las otras formas: una señal puede
 * cerrar una puerta y graduar una confianza sin contradicción.
 *
 * LO QUE ESTA OLA (Ola U) NO TOCÓ, Y QUE LA OLA V (V1+V4) SÍ CERRÓ: la forma
 * homogénea POR GRAFO (`sym:X.m --calls(receiver-member)--> sí misma`)
 * seguía como estaba, y la ola U ya diagnosticaba correctamente que "no
 * puede distinguir por sí sola la auto-recursión de la cadena homogénea: la
 * arista es la misma" — pero el diagnóstico estaba a salvo sólo porque el
 * grafo llegaba `null` en producción (INERTE). Al cablearse (V1), ese mismo
 * branch pasó de "diagnóstico correcto sin consecuencias" a "afirma
 * `ya-aplicado` falso" — cerrado en V4, ver `graphChainEvidence` (el
 * `continue` sobre `target.id === fnId`, con su propia nota "OLA V (V4)").
 * La vía AST (`findForwardField`, que sí ve receptor y argumentos) sigue
 * siendo la autoritativa para esta forma — ahora también en el código, no
 * sólo en este párrafo.
 */
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { ladderFactsFor, type LadderOutcome } from "../detect/intra-file/exclusive-dispatch-ladder.js";
import { buildGraphIndex } from "../detect/primitivas/u1-grafo-en-contexto.js";
import { edgeHasRole, memberSignatures, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../graph/types.js";
import { build as runEngine, refreshDiscriminators, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisCheck, PatternHypothesisDraft, PatternState } from "./types.js";
import { findWrappingChains } from "./wrapping-chain.js";

/* ────────────────────────────────────────────────────────────────────────
 * Vocabulario y primitivas de forma AST — duplicadas a propósito respecto
 * de `pattern-wrapping.ts` (mismo criterio que `many-returns.ts` documenta
 * para `RETURN_WORD`).
 * ──────────────────────────────────────────────────────────────────────── */

/** Mismo umbral que `pattern-wrapping.ts:481` — provisional (K2). */
const MIN_GUARD_RUN = 3;
const MAX_GUARD_BODY_NODES = 10;
const EARLY_EXIT_TYPE = /^(return|throw|break|continue|next)(_statement)?$/;
const RAISE_CALL_TEXT = /^raise\b/;
const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
/**
 * OLA AJ (FRENTE AJ4) — TRADUCCIÓN, NO DECISIÓN: `expression` es el campo con
 * el que la gramática de C# nombra el RECEPTOR de un acceso a miembro
 * (`a.b` ⇒ `member_access_expression(expression: a, name: b)`), exactamente el
 * mismo rol que `object` en Java/Python/JS-TS y `operand` en Go. Va TERCERO a
 * propósito: donde una gramática ya expone `object`/`operand` no cambia nada —
 * sólo se resuelve el caso que hoy no tiene ninguno de los dos.
 *
 * VERIFICADO POR SONDA sobre los DOS repos C# del corpus antes de escribir
 * esta línea (`scratchpad-aj4/sonda-gramatica.mts`):
 * `member_access_expression.expression` ×217 en
 * `newtonsoft-json/Src/Newtonsoft.Json/JsonTextReader.cs` y ×175 en
 * `ShareX/ShareX.HelpersLib/Helpers/Helpers.cs`.
 */
const OBJECT_FIELDS = ["object", "operand", "expression"];
/**
 * OLA AJ (FRENTE AJ4) — LA COMPUERTA IMPOSIBLE POR CONSTRUCCIÓN QUE ESTA OLA
 * BUSCA, EN SU FORMA MÁS LITERAL: `invocation_expression` es como C# escribe
 * LA LLAMADA (sonda: ×502/502 en `JsonTextReader.cs`, ×223/223 en
 * `Helpers.cs` — ni un solo `call`/`call_expression`/`method_invocation`).
 * Sin ese tipo de nodo, ninguna de las cuatro puertas de este archivo veía
 * NUNCA una llamada en C#: `handlingCalleeOf` no encontraba manejo,
 * `guardsShowHandlingDiversity` era siempre `false`, `guardRunCandidate`
 * devolvía `[]`, y `findForwardField`/`bareSameNameForward` no podían dar
 * `ownHit`/`siblingHit`. **Para el lenguaje entero, escribiera el autor la
 * cadena que escribiera.** Medido antes del arreglo, sobre los 21 repos:
 * 694 candidatos C# (296 LIB + 398 APP), 33 con corrida de guardas, y
 * **0 sobrevivientes al escalón siguiente, 33 de 33, por construcción.**
 *
 * Es traducción de la capa por lenguaje —el mismo tipo de arreglo que la Ola
 * AE hizo en `observer.ts` y la Ola AI en `null-object.ts` (`not x`,
 * `x is null`)—: ninguna intención cambia, ningún umbral se toca, ninguna
 * condición se afloja. Sólo se ve la llamada que el archivo ya tenía escrita.
 */
const CALL_NODE_TYPES = new Set(["call", "call_expression", "method_invocation", "invocation_expression"]);

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}

function collectDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode[] {
  const out: AstNode[] = [];
  const visit = (n: AstNode, depth: number): void => {
    if (pred(n)) out.push(n);
    if (depth <= 0) return;
    for (const c of namedChildren(n)) visit(c, depth - 1);
  };
  visit(node, maxDepth);
  return out;
}

function countDescendants(node: AstNode, maxDepth = 8): number {
  let n = 1;
  if (maxDepth <= 0) return n;
  for (const c of namedChildren(node)) n += countDescendants(c, maxDepth - 1);
  return n;
}

function isEarlyExit(node: AstNode): boolean {
  if (EARLY_EXIT_TYPE.test(node.type)) return true;
  return node.type === "call" && RAISE_CALL_TEXT.test(node.text);
}

function containsEarlyExit(node: AstNode): boolean {
  return findDescendant(node, isEarlyExit, 6) !== null;
}

function isGuardLike(node: AstNode): boolean {
  return hasField(node, "condition") && !hasField(node, "alternative");
}

function guardConsequenceOf(node: AstNode): AstNode | null {
  return (node.childForFieldName("consequence") as AstNode | null) ?? (node.childForFieldName("body") as AstNode | null);
}

function isShortGuardWithEarlyExit(node: AstNode): boolean {
  if (!isGuardLike(node)) return false;
  const body = guardConsequenceOf(node);
  if (!body) return false;
  return countDescendants(body, 5) <= MAX_GUARD_BODY_NODES && containsEarlyExit(body);
}

/**
 * Ola 12 — LA SEMÁNTICA QUE FALTABA (diagnóstico RAICES.md: "el ancla
 * detecta una FORMA y el `required` no verifica la SEMÁNTICA"). ≥3 guardas
 * cortas con salida temprana tienen la MISMA forma superficial sea la causa
 * (a) un PIPELINE secuencial de negocio (cada guarda corta sobre un dato
 * que la sentencia anterior calculó), (b) una guarda de VALIDACIÓN pura que
 * aborta sin delegar nada, o (c) una CADENA real de manejadores
 * intercambiables. El conteo de guardas no distingue los tres — el `required`
 * viejo disparaba por igual en los tres casos. `argument_list` (Ruby) y
 * `expression_list` (Go) envuelven el valor de retorno; JS/TS lo cuelgan
 * directo del nodo — verificado por inspección real del árbol (ver
 * `chain-of-responsibility.test.ts`).
 */
const RETURN_NODE_TYPE = /^return(_statement)?$/;
const RETURN_VALUE_WRAPPER_TYPES = new Set(["argument_list", "expression_list"]);

/** El valor devuelto por un nodo de retorno — perfora el wrapper de Ruby/Go
 *  cuando existe. `null` en un `return` BARE (sin valor) — la forma
 *  estructural de "aborto sin resultado que ofrecer". */
function returnedValueOf(exitNode: AstNode): AstNode | null {
  const wrapper = namedChildren(exitNode).find((c) => RETURN_VALUE_WRAPPER_TYPES.has(c.type));
  const container = wrapper ?? exitNode;
  return namedChildren(container)[0] ?? null;
}

/**
 * Bug 3 de "tres bugs de mecanismo" (`RAICES.md`) — CONDICIÓN de la guarda
 * (campo `condition`, texto sin paréntesis exteriores). Sólo se usa para el
 * camino NUEVO de `handlingCalleeOf` (abajo): "¿esta guarda pregunta, por el
 * MISMO identificador que devuelve, si está presente?" — nunca para el
 * camino viejo (`return <llamada>` directo), que no necesita mirar la
 * condición en absoluto.
 */
function guardConditionOf(node: AstNode): AstNode | null {
  return node.childForFieldName("condition") as AstNode | null;
}

/**
 * `true` si `conditionText` es una prueba de PRESENCIA sobre EXACTAMENTE el
 * identificador `identifier` — el idioma "encontrado, listo" (`return x if
 * x`, `if x … end`, `return x if x.present?`). Vocabulario de GRAMÁTICA/
 * idioma, no de dominio (mismo estatus que `EARLY_EXIT_TYPE`/`CALL_NODE_TYPES`
 * de este mismo archivo): un identificador desnudo, su negación como prueba
 * de AUSENCIA (excluida a propósito: `unless x`/`!x` significa "cuando FALTA",
 * lo opuesto de lo que esta guarda necesita para devolver `x`), o UN solo
 * mensaje de presencia (`.present?`) sobre ese mismo identificador. Nunca una
 * expresión compuesta, comparación o prueba de TIPO (`typeof`/`instanceof`/
 * `Array.isArray`/`.is_a?`) — ésas son la firma de un DESPACHO POR TIPO
 * (`renderValue`, ver docstring de `handlingCalleeOf`), no de una cascada de
 * fallback.
 */
function conditionIsPresenceTestOf(conditionText: string, identifier: string): boolean {
  const bare = conditionText.replace(/^\((.*)\)$/, "$1").trim();
  if (bare === identifier) return true;
  const escaped = escapeRegex(identifier);
  return new RegExp(`^${escaped}\\.present\\?$`).test(bare);
}

/**
 * LA MITAD QUE FALTABA (bug 3 de "tres bugs de mecanismo", `RAICES.md`):
 * "la diversidad de llamadas es necesaria y no suficiente". `renderValue`
 * (`MeetingParticipantAnswers.vue:10`) pasa la diversidad CON HOLGURA —
 * `v.join(", ")`/`JSON.stringify(v)` son dos mensajes distintos, ambos
 * `return <llamada>` DIRECTO, el camino que ya existía antes de este bug —
 * porque un formateador por tipo invoca por definición un mensaje distinto
 * por rama. Eso NO distingue un formateador de una cadena real de
 * manejadores: hace falta la otra mitad, y es la CONDICIÓN de la guarda, no
 * la llamada.
 *
 * Vocabulario de PALABRA CLAVE/built-in de LENGUAJE (mismo estatus que
 * `EARLY_EXIT_TYPE`/`RAISE_CALL_TEXT` de este archivo — nunca de dominio):
 * `typeof`/`instanceof` (JS/TS/Java/C#), `Array.isArray`/`isinstance`/
 * `type(...)` (JS/Python), `.is_a?`/`.kind_of?`/`.instance_of?` (Ruby). Una
 * guarda cuya condición pregunta "¿de qué TIPO es esto?" está haciendo
 * DESPACHO POR TIPO — la forma exacta de un formateador/visitor — no
 * "¿puedo manejar esto?", la pregunta de un eslabón real de la cadena
 * (`completed_linked`/`pending_linked`, presencia — nunca tipo — en los dos
 * falsos negativos que este mismo bug recupera, ver `handlingCalleeOf`).
 * Aplicado UNA sola vez, al principio de `handlingCalleeOf` — cubre las TRES
 * rutas (directa, rastreada, anidada) sin repetir el chequeo en cada una.
 */
const TYPE_TEST_CONDITION = /\b(typeof|instanceof)\b|\bArray\.isArray\s*\(|\bisinstance\s*\(|\btype\s*\(|\.(is_a\?|kind_of\?|instance_of\?)\s*\(/;
function conditionIsTypeTest(conditionText: string): boolean {
  return TYPE_TEST_CONDITION.test(conditionText);
}

/** Receptor de una llamada, a través de las DOS formas ya usadas en este
 *  archivo (`goReceiverOf`/`objectOf`): campo `receiver` directo (Ruby/Go,
 *  `x.method!`), o — si la llamada no lo tiene — el `object`/`operand` de su
 *  propio callee (`function`/`method`, la forma de JS/TS/Python: `call
 *  (function: member_expression(object: x, property: method))`). */
function callReceiverNode(call: AstNode): AstNode | null {
  const receiver = (call.childForFieldName("receiver") as AstNode | null) ?? objectOf(call);
  if (receiver) return receiver;
  const fn = (call.childForFieldName("function") as AstNode | null) ?? (call.childForFieldName("method") as AstNode | null);
  return fn ? objectOf(fn) : null;
}

function callReceiverText(call: AstNode): string | null {
  const receiver = callReceiverNode(call);
  return receiver ? receiver.text.trim() : null;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA U (frente N4) — LAS DOS PREGUNTAS DE INTENCIÓN QUE FALTABAN.
 *
 * El plan de intenciones (`PLAN-INTENCIONES.md` §4) define Chain of
 * Responsibility así: *"≥2 manejadores que implementan el MISMO protocolo,
 * cada uno invoca el MISMO mensaje sobre un sucesor GUARDADO EN UN CAMPO
 * PROPIO, y la decisión de seguir/parar depende de una condición sobre LOS
 * DATOS DE LA SOLICITUD (no de 'si hay más manejadores')"*. Hasta esta ola el
 * archivo verificaba la mitad sintáctica de esa frase ("mismo nombre de
 * mensaje", "receptor propio") y ninguna de las dos semánticas. Medido sobre
 * el corpus antes de tocar nada (`scripts/u-n4-probe.mts`, guava + hugo):
 *
 *   - `guava` — 12 de 16 hipótesis (6 `ya-aplicado` + 6 `parcial`) salen de
 *     `equals` reenviando a `this.<campo>.equals(that.<campo>)`
 *     (`ImmutableDoubleArray$AsList:537`, `ImmutableIntArray$AsList:532`,
 *     `ImmutableLongArray$AsList:534`, `LexicographicalOrdering:55`,
 *     `BaseEncoding$StandardBaseEncoding`). Es el falso que el plan ya había
 *     nombrado sobre `BloomFilter.equals`, vivo y multiplicado.
 *   - `hugo` — 8 `ya-aplicado` salen de AUTO-RECURSIÓN pura
 *     (`pagemenus.go:118 pm.HasMenuCurrent(menuID, child)`,
 *     `templatetransform.go:240`): el receptor es el objeto MISMO, no un
 *     sucesor guardado en un campo.
 *
 * LAS DOS PREGUNTAS, cada una cerrando exactamente uno de esos dos modos:
 *
 *   1. `receptorEsUnSucesorGuardado` — ¿el receptor del reenvío es un
 *      COLABORADOR guardado en un campo propio, o es el propio objeto? Un
 *      manejador delega en OTRO manejador; una función recursiva se llama a
 *      sí misma. Las dos escriben `<algo>.m(...)` dentro de una guarda.
 *   2. `laSolicitudViaja` — ¿lo que se le pasa al sucesor es LA SOLICITUD que
 *      este manejador recibió, o un pedazo del estado propio? `handle(req)`
 *      ⇒ `this.next.handle(req)`: la solicitud sigue viaje. `equals(o)` ⇒
 *      `this.bits.equals(that.bits)`: lo que viaja es un COMPONENTE, y la
 *      pregunta que se está respondiendo es "¿somos iguales?", no "¿podés
 *      manejar esto?".
 *
 * Ninguna de las dos mira nombres de método ni de campo — la lista
 * `equals`/`hashCode`/`compareTo` que el docstring de Ola 10 declaró como
 * inaceptable (sería vocabulario) sigue sin existir: lo que las separa es la
 * FORMA de la relación, no cómo se llaman.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Los nombres de los parámetros PROPIOS de `fn` — LA SOLICITUD. El receptor
 * de Go queda deliberadamente AFUERA (`goReceiverOf` se usa aparte, para
 * `selfNames`): el receptor es el manejador, no la solicitud.
 */
function ownParameterNames(fn: FunctionUnit): ReadonlySet<string> {
  const names = new Set<string>();
  const list = fn.node.childForFieldName("parameters") as AstNode | null;
  if (!list) return names;
  for (const param of namedChildren(list)) {
    if (param.type === "identifier") {
      names.add(param.text);
      continue;
    }
    const named =
      (param.childForFieldName("name") as AstNode | null) ??
      (param.childForFieldName("pattern") as AstNode | null) ??
      (param.childForFieldName("left") as AstNode | null);
    if (named) {
      names.add(named.text);
      continue;
    }
    const ident = namedChildren(param).find((c) => c.type === "identifier");
    if (ident) names.add(ident.text);
  }
  return names;
}

function callArguments(call: AstNode): readonly AstNode[] {
  const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
  return args ? namedChildren(args) : [];
}

/**
 * INTENCIÓN 2 — *"la solicitud sigue viaje"*. `true` si alguno de los
 * argumentos de `call` es EXACTAMENTE uno de los parámetros propios del
 * manejador, sin transformar (identificador desnudo). Un eslabón de cadena
 * le pasa al sucesor la MISMA solicitud que recibió; una delegación de
 * composición (`equals`, `compare`, un getter que reenvía) le pasa un pedazo
 * del estado propio o del argumento ya desarmado, y por eso NO es una cadena
 * aunque comparta la forma "mismo mensaje, campo propio".
 *
 * Un manejador SIN parámetros no puede tener solicitud que pasar — la
 * condición de "seguir o parar según los datos de la solicitud" es
 * inexpresable ahí —, así que `params` vacío responde `false` siempre.
 */
function laSolicitudViaja(call: AstNode, params: ReadonlySet<string>): boolean {
  if (params.size === 0) return false;
  return callArguments(call).some((a) => params.has(a.text.trim()));
}

/**
 * INTENCIÓN 1 — *"el sucesor está GUARDADO en un campo propio"*. Devuelve el
 * nodo del receptor cuando ese receptor es un COLABORADOR alcanzado a través
 * del objeto propio (`this.next` / `self.next` / `@next` / `h.next` con el
 * receptor Go), y `null` cuando el receptor es el objeto MISMO (`this` /
 * `self` / `pm`) — que es auto-recursión, no delegación a un sucesor.
 *
 * La distinción es de FORMA pura y de un solo nivel: `<propio>.<campo>` tiene
 * un acceso a miembro entre el objeto y el mensaje; `<propio>` no lo tiene.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OLA AJ (AJ4) — LA SEGUNDA TRADUCCIÓN: EL CALIFICADOR IMPLÍCITO.
 * ═══════════════════════════════════════════════════════════════════════════
 * Las cuatro formas de arriba (`this.` / `self.` / `@` / receptor Go) son las
 * cuatro que Ruby, Python, JS-TS y Go **OBLIGAN** a escribir: en esas cuatro
 * gramáticas no hay otra manera de nombrar un campo propio. **Java y C# sí la
 * tienen: el calificador es OPCIONAL**, y en C# escribir el campo desnudo
 * (`_next.Handle(request)`) es LA forma idiomática. Para ese subconjunto —
 * identificable y entero— la pregunta "¿el receptor es un campo propio?" era
 * **insatisfacible por construcción**, escribiera el autor la cadena que
 * escribiera. Es el mismo defecto que `CALL_NODE_TYPES` (arriba) un peldaño
 * más adentro: la compuerta pide una forma que la gramática del caso escribe
 * distinto.
 *
 * `ownFields` trae los campos que ESE manejador declara y que el identificador
 * desnudo puede estar nombrando. **La INTENCIÓN no cambia ni un milímetro**:
 * sigue siendo *"el sucesor está guardado en un campo de ESTE manejador"*, y
 * las tres exclusiones que la sostienen se conservan enteras —
 * ver `computeOwnFieldNames`: campo COMPARTIDO (`static`) fuera, parámetro que
 * lo tapa fuera, local que lo tapa fuera. Con `ownFields` vacío (el default, y
 * lo que devuelven las siete gramáticas restantes) esta función se comporta
 * **byte a byte** como antes.
 */
function successorFieldReceiver(call: AstNode, selfNames: ReadonlySet<string>, ownFields: ReadonlySet<string> = EMPTY_NAMES): AstNode | null {
  const receiver = callReceiverNode(call);
  if (!receiver) return null;
  if (receiver.type === RUBY_IVAR_TYPE) return receiver;
  if (selfNames.has(receiver.text.trim())) return null; // el receptor es el objeto mismo: recursión, no sucesor.
  const owner = objectOf(receiver);
  if (owner && selfNames.has(owner.text.trim())) return receiver;
  // OLA AJ (AJ4) — el calificador implícito de Java/C#: el receptor es un
  // identificador desnudo que ESTE manejador declara como campo propio.
  return receiver.type === "identifier" && ownFields.has(receiver.text.trim()) ? receiver : null;
}

const EMPTY_NAMES: ReadonlySet<string> = new Set<string>();

/**
 * OLA AJ (AJ4) — LAS GRAMÁTICAS QUE DAN AL CAMPO UN NODO DE DECLARACIÓN PROPIO.
 * Vocabulario de GRAMÁTICA, mismo estatus que `RUBY_IVAR_TYPE`/`CALL_NODE_TYPES`
 * de este mismo archivo: `field_declaration` es el nodo con el que **Java y C#**
 * declaran un campo (verificado por sonda: ×15 en
 * `guava/.../TreeMultiset.java`, ×13 en `newtonsoft-json/.../JsonTextReader.cs`,
 * ×10 en `ShareX/.../Helpers.cs`), y `property_declaration` es la otra mitad de
 * la misma cosa en C# (×7 y ×1 en las mismas sondas). Ruby (`@x`), Python
 * (`self.x`), JS/TS (`this.x` — su nodo es `public_field_definition`/
 * `field_definition`, que NO está acá a propósito) y Go (receptor nombrado)
 * obligan al calificador, así que ninguna de esas cuatro entra por acá: sus
 * campos ya los ve la forma `<propio>.<campo>` de siempre.
 */
const OWN_FIELD_DECLARATION_TYPES = new Set(["field_declaration", "property_declaration"]);

/**
 * `true` si el miembro se declara COMPARTIDO por el tipo (`static`) en vez de
 * por la instancia. **Esto NO es un recorte mío: es la intención que la Ola V
 * ya dejó escrita** en el docstring de `guardsShowHandlingDiversity`, palabra
 * por palabra — *"`DEFAULTS` es un campo ESTÁTICO, no `this.DEFAULTS`:
 * `successorFieldReceiver` lo rechaza igual, correcto — un campo estático
 * compartido no es 'un sucesor guardado en ESTE manejador'"*. Sin esta línea,
 * la traducción de arriba reabriría exactamente el caso que la Ola V midió,
 * silenció a propósito, y que un juez humano etiquetó `problema-si-patrón-no`
 * (`guava-testlib/.../ArbitraryInstances.java:359`) — el único sobreviviente
 * Java del escalón anterior en los 21 repos. **El número se publica en las dos
 * lecturas; lo que se aterriza es la que respeta la intención declarada.**
 *
 * `static` es una palabra del LENGUAJE, no de dominio (mismo estatus que
 * `not`/`is null`/`nil`/`None`, que ya viajan en este proyecto).
 */
const SHARED_MEMBER_MODIFIER = /\bstatic\b/;
function declaresSharedMember(member: AstNode): boolean {
  // Java junta los modificadores en UN nodo `modifiers` ("private static final");
  // C# emite un nodo `modifier` por palabra. Los dos casos con el mismo test.
  return namedChildren(member).some((c) => /^modifiers?$/.test(c.type) && SHARED_MEMBER_MODIFIER.test(c.text));
}

/** Los nombres que `node` DECLARA — por el campo `name`/`left` del propio nodo
 *  (C# `property_declaration`/`for_each_statement`, Java `enhanced_for_statement`)
 *  y por cada `variable_declarator` que cuelgue de él (Java lo nombra con el
 *  campo `name`; C# lo deja como primer hijo `identifier` — verificado por
 *  sonda sobre los tres archivos reales, `scratchpad-aj4/sonda-campos.mts`). */
function declaredNamesIn(node: AstNode): string[] {
  const out: string[] = [];
  for (const campo of ["name", "left"]) {
    const n = node.childForFieldName(campo) as AstNode | null;
    if (n && n.type === "identifier") out.push(n.text.trim());
  }
  for (const d of collectDescendants(node, (n) => n.type === "variable_declarator", 4)) {
    const n = (d.childForFieldName("name") as AstNode | null) ?? namedChildren(d).find((c) => c.type === "identifier") ?? null;
    if (n) out.push(n.text.trim());
  }
  return out;
}

/** `outer` contiene a `inner` por POSICIÓN — `AstNode` no expone el padre, así
 *  que el dueño se ubica bajando desde `file.root`. Misma comparación por
 *  posición que `sameAstNode` de este archivo ya documenta. */
function nodeContains(outer: AstNode, inner: AstNode): boolean {
  const noAntes = (p: { row: number; column: number }, q: { row: number; column: number }): boolean => p.row > q.row || (p.row === q.row && p.column >= q.column);
  return noAntes(inner.startPosition, outer.startPosition) && noAntes(outer.endPosition, inner.endPosition);
}

/** El nodo de CLASE más interno que contiene a `fn`, bajando por el único
 *  camino de nodos que lo contienen. Se corta al llegar a la propia función
 *  (una clase declarada ADENTRO de ella no es su dueña). */
function enclosingClassNode(file: FileUnit, fn: FunctionUnit): AstNode | null {
  let mejor: AstNode | null = null;
  const bajar = (n: AstNode): void => {
    for (const c of namedChildren(n)) {
      if (!nodeContains(c, fn.node)) continue;
      if (sameAstNode(c, fn.node)) return;
      if (file.sets.classNodes.has(c.type)) mejor = c;
      bajar(c);
      return;
    }
  };
  bajar(file.root);
  return mejor;
}

const OWN_FIELDS_CACHE = new WeakMap<FunctionUnit, ReadonlySet<string>>();

/**
 * Los campos propios que un identificador DESNUDO puede estar nombrando dentro
 * de `fn`. `ownFields` vacío ⇒ `successorFieldReceiver` se comporta exactamente
 * como antes de esta ola, que es lo que pasa en las siete gramáticas que
 * obligan al calificador.
 *
 * *Intención del caché:* el conjunto es una propiedad DE LA FUNCIÓN, no del
 * hallazgo que pregunta — mismo idiom que `GINDEX_CACHE`/`RAW_INDEX_CACHE` de
 * este mismo archivo. Hace falta porque `findForwardField` se llama una vez por
 * hermano del archivo (`appliedState`/`repeatsInSameFile`), y cada llamada
 * bajaría de nuevo desde `file.root`.
 */
function ownFieldNames(file: FileUnit | null, fn: FunctionUnit): ReadonlySet<string> {
  if (!file) return EMPTY_NAMES;
  const cached = OWN_FIELDS_CACHE.get(fn);
  if (cached) return cached;
  const calculado = computeOwnFieldNames(file, fn);
  OWN_FIELDS_CACHE.set(fn, calculado);
  return calculado;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA MITAD QUE **NO** SE ATERRIZA, CON EL NÚMERO QUE LO DECIDE (AJ4)
 * ═══════════════════════════════════════════════════════════════════════════
 * `ownFields` sólo lo consume `guardRunCandidate` (el `required`). **NO se le
 * pasa a `findForwardField`**, que es la otra puerta que usa
 * `successorFieldReceiver`, y la razón está MEDIDA, no supuesta.
 *
 * Con el calificador implícito también ahí, sobre los 21 repos, la corrida real
 * (`scratchpad-aj4/embudo1`) produce **23 claves de nivel 2 NUEVAS**:
 * `guava` 13 (`ConcurrentHashMultiset`, `AtomicLongMap`), `ShareX` 6
 * (`RegionCaptureForm`, `SFTP`), `jenkins` 4 (`SecurityRealm`,
 * `ArgumentListBuilder`, `KeyedDataStorage`). **Las abrí las 23 en el archivo
 * real y las 23 son la MISMA figura: el "sucesor" es un campo COMPONENTE** —
 * `countMap`/`map` (un `ConcurrentMap` de almacenamiento), `client` (un cliente
 * SFTP), `ShapeManager`, `captchaSupport`, `args` (una lista), `core` (un
 * mapa). Ninguno es un manejador siguiente; **0 de 23 verdaderas**
 * (Wilson 95 % [0 %, 14,3 %]).
 *
 * Y NO ES UN DEFECTO NUEVO: es exactamente la ambigüedad que el docstring de
 * este módulo declara sin resolver desde la Ola 10 — *"`equals()`/`hashCode()`
 * delegando a un campo propio tiene la MISMA forma exacta que el reenvío de
 * sucesor… sin la ranura tipada (§0.4) para distinguir 'campo sucesor' de
 * 'campo componente', la ambigüedad queda declarada, no escondida"*. Escribir
 * el campo SIN calificador es la forma normal en Java/C#, así que quitar el
 * requisito del calificador no destraba cadenas: **multiplica por veintitrés
 * una ambigüedad que el módulo ya sabía que no puede resolver.** La condición 1
 * de la receta (FUERZA: la situación que el patrón resuelve, no un síntoma
 * correlacionado) no se cumple ahí, así que ahí no se aterriza.
 *
 * En el `required`, en cambio, el calificador implícito viaja acompañado de las
 * otras tres preguntas que ninguna de esas 23 pasa (≥2 mensajes de manejo
 * DISTINTOS y sin repetir, y la solicitud viaja en la llamada). Medido sobre
 * los 21 repos: el escalón D pasa de 0 a **0** — no destraba ningún caso HOY y
 * **no agrega ni un falso**; lo que cierra es la IMPOSIBILIDAD, para el día que
 * exista en código real una corrida de guardas C#/Java con manejo diverso sobre
 * un campo de instancia propio. Mismo criterio con el que la Ola 12 dejó escrita
 * su "CONDICIÓN EXACTA DE REACTIVACIÓN" en el docstring del módulo.
 */
function computeOwnFieldNames(file: FileUnit, fn: FunctionUnit): ReadonlySet<string> {
  const cls = enclosingClassNode(file, fn);
  if (!cls) return EMPTY_NAMES; // sin dueño: no hay campo propio que nombrar (Go, función libre, closure).
  const body = (cls.childForFieldName("body") as AstNode | null) ?? cls;
  const campos = new Set<string>();
  for (const m of namedChildren(body)) {
    if (!OWN_FIELD_DECLARATION_TYPES.has(m.type)) continue;
    if (declaresSharedMember(m)) continue; // COMPARTIDO por el tipo: no es un sucesor de ESTE manejador (Ola V).
    for (const n of declaredNamesIn(m)) campos.add(n);
  }
  if (campos.size === 0) return EMPTY_NAMES;
  // SOMBRA: si un parámetro o un local de `fn` lleva el mismo nombre, el
  // identificador desnudo ya NO nombra al campo — lo tapa. Las dos formas de
  // tapar salen fuera, nunca se adivina cuál gana.
  for (const p of ownParameterNames(fn)) campos.delete(p);
  const cuerpo = fnBody(fn);
  if (cuerpo) {
    for (const d of collectDescendants(cuerpo, (n) => n.type === "variable_declarator" || /^(for_each|enhanced_for)_statement$/.test(n.type), 12)) {
      for (const n of declaredNamesIn(d)) campos.delete(n);
    }
  }
  return campos;
}

/** Vocabulario de nodo de asignación — mismo `BINDING_DECLARATOR_TYPES` que
 *  `graph/references.ts` ya reconoce (Ruby/Python `assignment`, JS/TS
 *  `variable_declarator`), duplicado a propósito (ver docstring del módulo:
 *  cada hipótesis arma su propio índice, sin fábrica compartida). Go/Java/C#
 *  quedan fuera (declaraciones tipadas/`:=` de forma distinta) — LÍMITE
 *  DECLARADO: ningún caso medido de las dos poblaciones oficiales necesita
 *  ese camino para este check. */
const ASSIGNMENT_NODE_TYPES = new Set(["assignment", "variable_declarator"]);
function assignmentTarget(node: AstNode): { name: string; value: AstNode } | null {
  if (!ASSIGNMENT_NODE_TYPES.has(node.type)) return null;
  const left = (node.childForFieldName("left") as AstNode | null) ?? (node.childForFieldName("name") as AstNode | null);
  const right = (node.childForFieldName("right") as AstNode | null) ?? (node.childForFieldName("value") as AstNode | null);
  if (!left || !right) return null;
  return { name: left.text.trim(), value: right };
}

/** Busca una asignación `identifier = <expr>` DIRECTA en `stmt`, o UN nivel
 *  adentro (la envoltura `lexical_declaration`/`variable_declaration` de
 *  JS/TS alrededor de su propio `variable_declarator` — nunca más de un
 *  nivel: alcanza para las formas medidas, no adivina scope real). */
function assignmentIn(stmt: AstNode): { name: string; value: AstNode } | null {
  const direct = assignmentTarget(stmt);
  if (direct) return direct;
  for (const c of namedChildren(stmt)) {
    const nested = assignmentTarget(c);
    if (nested) return nested;
  }
  return null;
}

/** Mismo vocabulario que `boolean-complexity.ts#isLogicalBinary` (campos
 *  genéricos `left`/`operator`/`right`, comparados contra el TOKEN del
 *  operador, no contra el tipo del nodo contenedor) — acotado acá a `&&`/
 *  `and`, el idioma "chequeo && valor real" (`hit && (…).to_s.presence`,
 *  `ghl_resolvable.rb#answer_value_for_property`): el lado IZQUIERDO es una
 *  guarda de nil-safety sobre `hit`, el lado DERECHO es el cómputo real que
 *  se asigna cuando `hit` existe. Nunca `||`: ese operador significa "el de
 *  la izquierda O ESTE otro", ninguno de los dos lados es un chequeo
 *  descartable. */
const LOGICAL_AND_TOKEN = /^(&&|and)$/;
function rightOfLogicalAnd(node: AstNode): AstNode | null {
  if (!node.childForFieldName("left") || !node.childForFieldName("right")) return null;
  const operator = node.childForFieldName("operator");
  if (!operator || !LOGICAL_AND_TOKEN.test(operator.type)) return null;
  return node.childForFieldName("right") as AstNode | null;
}

/** La llamada REAL dentro de `expr`: `expr` mismo si ya es una llamada, o —
 *  recursivamente — el lado derecho de un `&&`/`and` de nivel superior
 *  (`hit && real_call()`). Nunca perfora nada más (ni paréntesis de
 *  agrupación como nodo propio — ya vienen "vistos a través" porque
 *  `childForFieldName` los sigue solo, ni el lado izquierdo de un `&&`, que
 *  es la guarda descartable, no el resultado) — DECLARADO: una asignación
 *  compuesta de otra forma (`||`, ternario, concatenación) no se resuelve;
 *  se prefiere no afirmar nada a adivinar cuál mitad es "la real". */
function primaryCallWithin(expr: AstNode): AstNode | null {
  if (CALL_NODE_TYPES.has(expr.type)) return expr;
  const right = rightOfLogicalAnd(expr);
  return right ? primaryCallWithin(right) : null;
}

/**
 * Comparación de nodos por POSICIÓN, no por referencia — mismo motivo que
 * `graph/references.ts#sameNode` ya documenta: dos llamadas separadas a
 * `child()`/`namedChildren()` sobre el MISMO árbol pueden devolver wrappers
 * DISTINTOS para la MISMA posición (`===` no reconoce "es el mismo nodo"
 * entre dos recorridos independientes — acá hace falta porque `guard` llega
 * de un recorrido (`topLevelGuardRun`) y `precedingSiblings`/`body` de otro).
 */
function sameAstNode(a: AstNode | null, b: AstNode): boolean {
  return a !== null && a.type === b.type && a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column;
}

function indexOfNode(list: readonly AstNode[], node: AstNode): number {
  return list.findIndex((n) => sameAstNode(n, node));
}

/**
 * ¿A qué mensaje llama la guarda, si a alguno, CUANDO SE DISPARA?
 *
 * GATE PRIMERO, sobre las TRES rutas por igual (bug 3 de "tres bugs de
 * mecanismo", `RAICES.md`, la mitad que faltaba): si la CONDICIÓN de la
 * guarda es una prueba de TIPO (`conditionIsTypeTest`), esta guarda no
 * cuenta NUNCA como manejo, sin importar qué devuelva — un despacho por
 * tipo (`renderValue`) invoca por definición un mensaje distinto por rama,
 * así que la diversidad de llamadas sola lo deja pasar; la condición es la
 * señal que falta, y se verifica ANTES de mirar la llamada, no después.
 *
 * Con el gate superado, dos rutas para encontrar la llamada:
 *
 * 1. DIRECTA (heredada) — `return <llamada>`. `null` si el valor devuelto no
 *    es una llamada (literal/objeto construido en el sitio) o si la salida
 *    es un `raise`/`throw` — un rechazo nunca es "acá está el resultado de
 *    manejarlo".
 *
 * 2. RASTREADA (bug 3, la otra mitad) — el valor devuelto es un
 *    identificador BARE `x` (no una llamada), pero la guarda es la CASCADA
 *    DE FALLBACK real que el diagnóstico midió a mano y la ruta 1 no veía:
 *    `x = buscar(); return x if x` (`deal_form_responses.rb
 *    #reusable_review_response_for`, `ghl_resolvable.rb
 *    #answer_value_for_property`, dos falsos negativos confirmados). SEGUNDO
 *    gate de suficiencia (`conditionIsPresenceTestOf`) antes de rastrear
 *    nada: la condición de ESTA guarda tiene que preguntar, por el MISMO
 *    `x`, "¿está presente?" — sin este gate, "seguir la variable" reabriría
 *    el ruido que Ola 12 cerró (un PIPELINE donde cada guarda corta sobre un
 *    dato ya calculado por el paso anterior también "sigue una variable",
 *    pero su condición no es una prueba de presencia del identificador
 *    devuelto — es la condición de negocio del paso). Con los dos gates
 *    confirmados, dos formas de recuperar la llamada real:
 *      (a) DENTRO del propio cuerpo de la guarda, un statement ANTERIOR al
 *          `return` que es una llamada sobre `x` como receptor
 *          (`x.reopen_for_resubmit!; return x` — `completed_linked`/
 *          `legacy_completed` en `deal_form_responses.rb`);
 *      (b) una asignación `x = <expr>` en un statement HERMANO anterior a
 *          esta guarda dentro de la MISMA función (`pending_linked = …; return
 *          pending_linked if pending_linked`) — el más cercano hacia atrás
 *          gana; si esa asignación no resuelve una llamada real por
 *          `primaryCallWithin` (p.ej. una expresión booleana compuesta sin
 *          forma reconocida), no se afirma nada — DECLARADO, no adivinado.
 *
 * VERIFICADO: `renderValue` (`MeetingParticipantAnswers.vue:10`) tiene
 * condiciones `v === null || …`, `Array.isArray(v)`, `typeof v === "object"`
 * — las tres son pruebas de TIPO/igualdad, ninguna pasa el gate de arriba,
 * así que sus llamadas DIRECTAS (`v.join(", ")`/`JSON.stringify(v)`, que
 * antes de este bug SÍ contaban) ya no aportan diversidad: 0 mensajes, no 2.
 */
/**
 * OLA V (V4) — antes esta función devolvía sólo el TEXTO del mensaje
 * invocado; ahora devuelve también el propio nodo `call`, para que
 * `guardsShowHandlingDiversity` pueda preguntarle a `successorFieldReceiver`
 * (ya definida arriba, la MISMA que usa `findForwardField` para las formas
 * completa/parcial) si ALGUNA de las llamadas de manejo llega a través de un
 * campo propio — ver el docstring de `guardsShowHandlingDiversity` para el
 * porqué. Ningún camino de decisión cambia acá: sigue siendo exactamente el
 * mismo mensaje, exactamente la misma llamada: sólo se conserva el nodo.
 */
interface HandlingHit {
  readonly callee: string;
  readonly call: AstNode;
}

function handlingCalleeOf(guard: AstNode, precedingSiblings: readonly AstNode[], params: ReadonlySet<string>): HandlingHit | null {
  const body = guardConsequenceOf(guard);
  if (!body) return null;
  const condition = guardConditionOf(guard);
  if (condition && conditionIsTypeTest(condition.text)) return null;

  const exit = findDescendant(body, (n) => RETURN_NODE_TYPE.test(n.type), 6);
  if (!exit) return null;
  const value = returnedValueOf(exit);
  if (!value) return null;
  // OLA U (N4) — INTENCIÓN 2 aplicada también acá: una rama sólo cuenta como
  // "manejo" si le entrega LA SOLICITUD a quien maneja. Ver
  // `guardsShowHandlingDiversity` para las tres rutas y el porqué.
  if (CALL_NODE_TYPES.has(value.type)) return laSolicitudViaja(value, params) ? { callee: calleeTextOf(value), call: value } : null;
  if (value.type !== "identifier") return null;

  const identifier = value.text.trim();
  if (!condition || !conditionIsPresenceTestOf(condition.text, identifier)) return null;

  // (a) llamada sobre `identifier` DENTRO del cuerpo de la guarda, antes del `return`.
  for (const stmt of namedChildren(body)) {
    if (sameAstNode(stmt, exit)) break;
    const call = CALL_NODE_TYPES.has(stmt.type) ? stmt : findDescendant(stmt, (n) => CALL_NODE_TYPES.has(n.type), 4);
    if (call && callReceiverText(call) === identifier) return laSolicitudViaja(call, params) ? { callee: calleeTextOf(call), call } : null;
  }

  // (b) asignación de `identifier` en un statement hermano ANTERIOR a esta guarda.
  const guardIndex = indexOfNode(precedingSiblings, guard);
  for (let i = guardIndex - 1; i >= 0; i--) {
    const assign = assignmentIn(precedingSiblings[i]!);
    if (assign && assign.name === identifier) {
      const call = primaryCallWithin(assign.value);
      return call && laSolicitudViaja(call, params) ? { callee: calleeTextOf(call), call } : null;
    }
  }
  return null;
}

/**
 * Bug 3 de "tres bugs de mecanismo" (`RAICES.md`), segunda mitad —
 * `ghl_resolvable.rb#answer_value_for_property` escribe la MISMA cascada de
 * fallback en DOS pisos: un intento envuelto en su propio chequeo de
 * ELEGIBILIDAD (`if input_data['answers'].is_a?(Array) … val = hit && (…);
 * return val if val end`, demasiado grande para calificar como guarda corta
 * POR SÍ SOLA — `MAX_GUARD_BODY_NODES` la descarta, correctamente, del
 * conteo de guardas) seguida de un segundo intento SÍ top-level (`answer =
 * …; val = …; return val if val`). Sin esto, sólo el segundo piso rastrea
 * (1 mensaje) — insuficiente para la pluralidad que exige
 * `guardsShowHandlingDiversity`. Este helper NO agrega guardas al conteo de
 * `guardRunCandidate` (`guards.length >= MIN_GUARD_RUN` sigue viendo
 * exactamente los top-level de siempre — el ancla no cambia) — SÓLO aporta
 * el mensaje de manejo del intento envuelto, si lo tiene, al mismo conjunto
 * de diversidad. Recorre cada hermano top-level que sea guarda-like
 * (`condition`, sin `alternative`) mostrar PERO demasiado grande para
 * contar por sí solo, y si su ÚLTIMO statement es él mismo una guarda corta
 * con salida temprana (la forma exacta que este archivo ya reconoce),
 * rastrea ESA con el mismo mecanismo de `handlingCalleeOf` — nunca inventa
 * una forma nueva, reusa la existente sobre un statement anidado en vez de
 * uno top-level.
 */
function nestedEligibilityCallees(bodyChildren: readonly AstNode[], params: ReadonlySet<string>): readonly HandlingHit[] {
  const out: HandlingHit[] = [];
  for (const wrapper of bodyChildren) {
    if (isShortGuardWithEarlyExit(wrapper) || !isGuardLike(wrapper)) continue; // ya evaluado como guarda top-level, o no es siquiera guarda-like.
    const inner = guardConsequenceOf(wrapper);
    if (!inner) continue;
    const innerSiblings = namedChildren(inner);
    const last = innerSiblings.at(-1);
    if (!last || !isShortGuardWithEarlyExit(last)) continue;
    const hit = handlingCalleeOf(last, innerSiblings, params);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Verificado a mano contra los 47 falsos `patron-no-aplica`/`ancla-equivocada`
 * de la muestra juzgada (`tests/golden/precision/{rails,ck-analyzer}.hypotheses.csv`,
 * filtro `pattern=Chain of Responsibility`): en los 47, cada guarda que se
 * dispara o bien no devuelve nada (`return`/`return nil` bare), o devuelve un
 * LITERAL/objeto construido en el sitio (nunca una llamada, ni siquiera
 * rastreada — sus identificadores devueltos, cuando los hay, no pasan el gate
 * de presencia de `handlingCalleeOf`), o — cuando sí hay una llamada — las
 * guardas llaman SIEMPRE al mismo mensaje (`error_result(...)` repetido en
 * los webhook-handlers de GHL/HubSpot). Ninguna de las 47 invoca ≥2 mensajes
 * DISTINTOS al dispararse — la firma que SÍ tendría una cadena real de
 * manejadores intercambiables (cada uno decide Y HACE algo propio: `return
 * handleTypeA(req)` junto a `return handleTypeB(req)`). Exigir esa
 * pluralidad es lo que separa "guarda-run" (forma) de "cadena candidata"
 * (semántica) sin tocar el ancla compartida.
 *
 * SIN REPETICIÓN, no sólo `>=2` (regresión encontrada y cerrada al medir
 * esta misma tarea sobre Rails real, `HubspotDealStageUpdateHandler#call`):
 * la ruta 2 (rastreada) recupera `stage_error = validate_source_stage(…);
 * return stage_error if stage_error` como un mensaje NUEVO
 * (`validate_source_stage`) — pero esa misma función sigue teniendo DOS
 * guardas que abortan con el MISMO mensaje literal (`error_result(...)`,
 * dos veces) — exactamente la firma de PIPELINE de validación secuencial
 * que Ola 12 ya había nombrado como causa (a), sólo que ahora con UN mensaje
 * de más. Un mensaje repetido en ≥2 guardas del MISMO guarda-run es
 * evidencia de "aborto compartido", no de manejadores intercambiables (cada
 * eslabón real decide Y HACE algo DISTINTO — nunca el mismo). Por eso la
 * pluralidad exige TODOS los mensajes contados distintos entre sí, no sólo
 * `>= 2` del total: un guarda-run con 3 mensajes de los cuales 2 se repiten
 * sigue sin calificar.
 */
/**
 * OLA U (N4) — LA MITAD DE INTENCIÓN QUE ESTE CHECK NO TENÍA. La pluralidad
 * (≥2 mensajes distintos, sin repetir) separaba "manejo diverso" de "aborto
 * compartido", pero NO separaba *manejadores intercambiables* de *fuentes
 * consultadas en cascada*. El caso medido en el corpus con el criterio viejo:
 * `guava-testlib/.../ArbitraryInstances.java:359 get(Class<T> type)` — sus
 * ramas invocan `get(implementation)` y `type.cast(Stream.empty())`, dos
 * mensajes distintos, pluralidad confirmada — pero NINGUNA de las dos recibe
 * `type`, la solicitud que `get` recibió: la primera consulta una fuente
 * derivada y la segunda fabrica un valor. El juicio humano de esta misma ola
 * lo etiquetó `problema-si-patron-no` ("intenta 2+ fuentes en secuencia, pero
 * CoR es más pesado de lo necesario") — exactamente la lectura que esta
 * segunda mitad convierte en criterio.
 *
 * INTENCIÓN VERIFICADA: *cada rama que maneja le entrega LA SOLICITUD a su
 * manejador*. Si ninguna rama pasa lo que la función recibió, lo que hay es
 * una cascada de fuentes o un pipeline de cómputo — no ≥2 manejadores
 * intercambiables esperando la misma solicitud, que es lo único que Chain of
 * Responsibility reemplaza.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA V (V4) — LA MITAD QUE TODAVÍA FALTABA: "GUARDADO EN UN CAMPO PROPIO".
 * ═══════════════════════════════════════════════════════════════════════
 * Diversidad + solicitud-viaja separan manejo real de pipeline/validación,
 * pero NINGUNA de las dos preguntas verifica la cláusula que el plan de
 * intenciones (`PLAN-INTENCIONES.md` §4) pone como lo que distingue CoR de
 * una escalera con buena forma: *"cada uno invoca el MISMO mensaje sobre un
 * sucesor GUARDADO EN UN CAMPO PROPIO"*. Una TABLA de despacho (funciones
 * libres, o llamadas sobre el PARÁMETRO recibido) también puede mostrar
 * diversidad y pasar la solicitud sin ser una cadena — es exactamente el
 * "guarda-escalera que pide tabla, no cadena" que V5 (`ola-v/informes/V5.md`
 * §4.4) dejó como PIDO para este archivo.
 *
 * INTENCIÓN VERIFICADA: al menos UNA de las llamadas de manejo tiene que
 * llegar a través de un COLABORADOR alcanzado por un campo propio del
 * manejador (`successorFieldReceiver`, la MISMA función que ya usa
 * `findForwardField` para las formas completa/parcial — no una regla nueva,
 * la MISMA evidencia aplicada un peldaño antes, a la candidatura). Una
 * llamada a una función libre o sobre un parámetro no pasa este check
 * (`successorFieldReceiver` devuelve `null` para las dos formas: sin
 * receptor, o receptor que no cuelga de `self`/`this`/`@`/receptor-Go).
 *
 * MEDIDO, no estimado — los DOS `problema-si-patrón-no` de CoR en la muestra
 * de la Ola U son EXACTAMENTE esta forma, verificados a mano:
 *   - `hugo/common/hreflect/convert.go:97 ConvertIfPossible` — 4 guardas
 *     (`IsInt`/`IsFloat`/`IsUint`/`IsString`), cada una `return
 *     convertToXIfPossible(val, typ)` (función LIBRE, sin receptor) o
 *     `val.Convert(typ)` (receptor = el PARÁMETRO `val`, no un campo propio).
 *     Ninguna de las 4 pasa `successorFieldReceiver`: despacho por
 *     `reflect.Kind`, una tabla, no una cadena.
 *   - `guava/guava-testlib/.../ArbitraryInstances.java:359 get(Class<T>
 *     type)` — `DEFAULTS.getInstance(type)` (`DEFAULTS` es un campo
 *     ESTÁTICO, no `this.DEFAULTS`: `successorFieldReceiver` lo rechaza
 *     igual, correcto — un campo estático compartido no es "un sucesor
 *     guardado en ESTE manejador") y `type.cast(...)` (receptor = el
 *     parámetro). Cero receptores propios.
 * Las DOS eran, además, las dos únicas ubicaciones `ausente` de CoR con
 * forma de guarda-run en todo el corpus de 13 repos (medido,
 * `scripts/v4-probe.mts`) — este gate las silencia sin tocar ninguna de las
 * formas completa/parcial/heterogénea, que ya tenían su propia evidencia
 * estructural y no dependen de `guards`.
 */
function guardsShowHandlingDiversity(
  guards: readonly AstNode[],
  bodyChildren: readonly AstNode[],
  params: ReadonlySet<string>,
  selfNames: ReadonlySet<string>,
  ownFields: ReadonlySet<string> = EMPTY_NAMES,
): boolean {
  const hits: HandlingHit[] = [];
  for (const guard of guards) {
    const hit = handlingCalleeOf(guard, bodyChildren, params);
    if (hit) hits.push(hit);
  }
  hits.push(...nestedEligibilityCallees(bodyChildren, params));
  const callees = hits.map((h) => h.callee);
  const distinct = new Set(callees);
  const diverse = distinct.size >= 2 && distinct.size === callees.length;
  if (!diverse) return false;
  return hits.some((h) => successorFieldReceiver(h.call, selfNames, ownFields) !== null);
}

/**
 * Único punto de "¿esta corrida de guardas es candidata?" — reusado por
 * `structuralOrSmellCandidate` (required), `repeatsInSameFile`
 * (discriminador) y `computePlaces` (para no listar como "sitio candidato
 * adicional" algo que el `required` de arriba de todos modos rechazaría).
 * `[]` (falsy en los `.length > 0` que lo consumen) si no hay guarda-run, si
 * la hay pero sin manejo diverso (pipeline/validación), o si el manejo es
 * diverso pero ninguna rama llega a través de un campo propio (tabla de
 * despacho — ver "OLA V (V4)" en el docstring de `guardsShowHandlingDiversity`).
 *
 * OLA AJ (AJ4) — `file` entra SÓLO para poder preguntar por los campos que la
 * clase dueña declara, y sólo lo usan las gramáticas con calificador opcional
 * (Java/C#). `null` ⇒ `ownFields` vacío ⇒ comportamiento byte a byte el de
 * antes: ningún llamador pierde nada por no tenerlo.
 */
function guardRunCandidate(fn: FunctionUnit, file: FileUnit | null = null): readonly AstNode[] {
  const guards = topLevelGuardRun(fn);
  if (guards.length < MIN_GUARD_RUN) return [];
  const body = fnBody(fn);
  const bodyChildren = body ? namedChildren(body) : guards;
  return guardsShowHandlingDiversity(guards, bodyChildren, ownParameterNames(fn), selfNamesOf(fn), ownFieldNames(file, fn)) ? guards : [];
}

function objectOf(node: AstNode): AstNode | null {
  for (const f of OBJECT_FIELDS) {
    const c = node.childForFieldName(f);
    if (c) return c as AstNode;
  }
  return null;
}

function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && c !== obj) return c.text;
  }
  return null;
}

function fieldKeyOf(node: AstNode): string {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  return memberNameOf(node) ?? node.text;
}

function trailingConditionIdentifier(node: AstNode): string {
  const matches = node.text.match(/[A-Za-z_$][\w$]*/g);
  return matches && matches.length > 0 ? matches[matches.length - 1]! : node.text;
}

function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

function ownerOf(fn: FunctionUnit): { key: string; name: string } | null {
  const receiver = goReceiverOf(fn.node);
  if (receiver) return { key: `receiver:${receiver.typeName}`, name: receiver.typeName };
  if (fn.metrics.className) return { key: `class:${fn.metrics.className}`, name: fn.metrics.className };
  return null;
}

function selfNamesOf(fn: FunctionUnit): ReadonlySet<string> {
  const names = new Set(SELF_WORDS);
  const receiver = goReceiverOf(fn.node);
  if (receiver) names.add(receiver.paramName);
  return names;
}

function fnBody(fn: FunctionUnit): AstNode | null {
  return (fn.node.childForFieldName("body") as AstNode | null) ?? (fn.node.childForFieldName("consequence") as AstNode | null);
}

/** Guardas cortas secuenciales de nivel superior con salida temprana — la
 *  forma estructural exacta que Chain of Responsibility reemplaza (AUSENTE). */
function topLevelGuardRun(fn: FunctionUnit): AstNode[] {
  const body = fnBody(fn);
  if (!body) return [];
  return namedChildren(body).filter(isShortGuardWithEarlyExit);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * El texto de LLAMADA de `call` SIN sus argumentos — recorta el sufijo que
 * el nodo de argumentos aporta (`arguments` en JS/TS/Go, `argument_list` en
 * Ruby/Python), nunca busca una subcadena arbitraria en `call.text`
 * completo. Sin esto, un STRING LITERAL dentro de un argumento que
 * casualmente contuviera el nombre del mensaje ("LiveReload disabled...",
 * caso real encontrado en la verificación manual sobre jekyll) se contaba
 * como reenvío — el bug exacto que este helper cierra: la evidencia de
 * reenvío se busca SÓLO en la posición del CALLEE, nunca en los argumentos.
 */
function calleeTextOf(call: AstNode): string {
  const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
  if (args && call.text.endsWith(args.text)) return call.text.slice(0, call.text.length - args.text.length);
  return call.text;
}

/** `true` si `name` aparece como TARGET de una asignación bare (`name = …`,
 *  nunca `algo.name = …`) en algún lugar de `fileText` — la forma
 *  estructural de "ranura mutable" (successor slot) que distingue una
 *  closure capturada (Vue: `let next = null; … next = handler;`) de un
 *  identificador estable de módulo/import (preact: `options`, nunca
 *  reasignado como bare — ver docstring de `bareSameNameForward` para el
 *  falso positivo real que esto cierra). Heurística textual DECLARADA, no
 *  resolución de scope real — mismo nivel de rigor que `template-method.ts
 *  #DELEGATION_PATTERN` ya usa en este proyecto para lo mismo. */
function isReassignedBareIdentifier(fileText: string, name: string): boolean {
  const assign = new RegExp(`(?<![.\\w])${escapeRegex(name)}\\s*=(?!=)`);
  return assign.test(fileText);
}

/**
 * Reenvío del MISMO mensaje sobre un identificador BARE (no `this`/`self`)
 * — la única forma disponible para closures sin clase (Vue Composition
 * API, función anidada JS/TS). Ver "FORMA EN LENGUAJES SIN CLASES".
 *
 * VERIFICADO A MANO Y CORREGIDO (verificación manual sobre preact): la
 * primera versión aceptaba CUALQUIER receptor bare con un miembro homónimo
 * — daba falso positivo con `unmount(vnode, …)` (preact, `src/diff/
 * index.js`): la función libre `unmount` llama `options.unmount(vnode)` (un
 * hook de ciclo de vida que casualmente comparte nombre con la función
 * contenedora), y eso se contaba como "reenvío al sucesor". Acotado ahora a
 * que el receptor esté REASIGNADO como bare en algún otro punto del archivo
 * (`isReassignedBareIdentifier`) — `options` (import estable, nunca
 * reasignado) queda afuera; `next` (`let next = null; … next = handler;`,
 * la fixture canónica de Vue) sigue adentro.
 */
function bareSameNameForward(fn: FunctionUnit, fileText: string, params: ReadonlySet<string>): string | null {
  if (!fn.name) return null;
  const body = fnBody(fn);
  if (!body) return null;
  const pattern = new RegExp(`([A-Za-z_$][\\w$]*)\\.${escapeRegex(fn.name)}$`);
  for (const call of collectDescendants(body, (n) => CALL_NODE_TYPES.has(n.type), 6)) {
    const m = pattern.exec(calleeTextOf(call));
    const receiver = m?.[1];
    // OLA U (N4) — la ranura de closure también tiene que RECIBIR la solicitud:
    // sin eso, `algo.mismoNombre()` sobre una variable reasignada del módulo es
    // una re-entrada, no un eslabón que delega la solicitud al siguiente.
    if (receiver && !SELF_WORDS.has(receiver) && receiver !== "super" && receiver !== "base" && isReassignedBareIdentifier(fileText, receiver) && laSolicitudViaja(call, params)) {
      return receiver;
    }
  }
  return null;
}

interface ForwardHit {
  /** Nombre del campo/colaborador (para evidencia), nunca usado para juzgar — sólo se REPORTA. */
  readonly fieldLabel: string;
}

/**
 * El EXCLUDER DE FORMA (AST). Busca, dentro del cuerpo de `fn`, una guarda
 * (sin `else`) cuya consecuencia invoca EXACTAMENTE el mismo mensaje que `fn`
 * (recursión estructural por NOMBRE, nunca por nombre de campo —
 * `NEXT_FIELD_WORD` se retira, ver docstring del módulo) sobre un SUCESOR
 * GUARDADO EN UN CAMPO PROPIO, pasándole LA SOLICITUD que `fn` recibió.
 *
 * *** OLA U (N4) — QUÉ INTENCIÓN VERIFICA ESTE CHEQUEO ***
 * "Este manejador le pasa la responsabilidad al SIGUIENTE": tres condiciones,
 * cada una cerrando un modo de falso MEDIDO sobre el corpus, ninguna mirando
 * nombres de método ni de campo.
 *
 *  1. mismo mensaje (heredado) — cierra "el colaborador hace otra cosa"
 *     (`this.logger.flush()` dentro de `reset()`, control negativo de las 5
 *     fixtures canónicas);
 *  2. `successorFieldReceiver` (NUEVO) — el receptor es un colaborador
 *     alcanzado por un campo propio, no el objeto mismo. Cierra la
 *     AUTO-RECURSIÓN, que tenía la forma exacta del reenvío y era el 100 % de
 *     los `ya-aplicado` de Go medidos (`hugo/navigation/pagemenus.go:118
 *     pm.HasMenuCurrent(menuID, child)`, `hugo/tpl/tplimpl/
 *     templatetransform.go:240`);
 *  3. `laSolicitudViaja` (NUEVO) — al sucesor se le entrega la MISMA
 *     solicitud, sin desarmar. Cierra la DELEGACIÓN A UN COMPONENTE, que era
 *     el 100 % de los `ya-aplicado` de Java medidos (`guava .../primitives/
 *     ImmutableDoubleArray.java:537 equals(Object object) ⇒
 *     this.parent.equals(that.parent)` y sus dos hermanos `ImmutableIntArray`/
 *     `ImmutableLongArray`, más `LexicographicalOrdering:55` y
 *     `BaseEncoding$StandardBaseEncoding`) — el falso que el plan de
 *     intenciones ya había nombrado sobre `BloomFilter.equals` y que seguía
 *     vivo, multiplicado por seis.
 *
 * La comparación de mensaje corre sobre `calleeTextOf(call)` (nunca
 * `call.text` completo) — ver su docstring para el bug real que esto cierra.
 *
 * OLA AJ (AJ4) — **ESTA FUNCIÓN NO RECIBE EL CALIFICADOR IMPLÍCITO, Y ES UNA
 * DECISIÓN MEDIDA, NO UN OLVIDO.** Ver §"la mitad que NO se aterriza" en el
 * docstring de `computeOwnFieldNames`: extender acá la lectura del campo
 * desnudo produce 23 hipótesis nuevas en el corpus (13 `guava`, 6 `ShareX`,
 * 4 `jenkins`) y **las 23 son DELEGACIÓN A UN COMPONENTE**, no reenvío a un
 * sucesor — abiertas y leídas una por una en el archivo real por AJ4. Es la
 * ambigüedad que el docstring de este módulo declara sin resolver desde la
 * Ola 10 ("sin la ranura tipada no se puede distinguir campo SUCESOR de campo
 * COMPONENTE"): quitar el calificador la multiplica sin aportar evidencia.
 */
function findForwardField(fn: FunctionUnit, allowBare: boolean, fileText: string): ForwardHit | null {
  const body = fnBody(fn);
  if (!body || !fn.name) return null;
  const selfNames = selfNamesOf(fn);
  const params = ownParameterNames(fn);
  for (const guard of collectDescendants(body, isGuardLike, 6)) {
    const cons = guardConsequenceOf(guard);
    if (!cons) continue;
    for (const call of collectDescendants(cons, (n) => CALL_NODE_TYPES.has(n.type), 4)) {
      const callee = calleeTextOf(call);
      const sameName = callee.endsWith(`.${fn.name}`) || callee.endsWith(` ${fn.name}`);
      if (!sameName) continue;
      const successor = successorFieldReceiver(call, selfNames);
      if (!successor) continue;
      if (!laSolicitudViaja(call, params)) continue;
      return { fieldLabel: fieldKeyOf(successor) };
    }
  }
  if (allowBare) {
    const bareName = bareSameNameForward(fn, fileText, params);
    if (bareName) return { fieldLabel: bareName };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Estructura vía GRAFO — la terna de envoltura (§0.4) + el eslabón único sin
 * interfaz común (el caso homogéneo por auto-recursión SE RETIRÓ esta ola,
 * Ola V/V4 — ver el `continue` de `graphChainEvidence` y el docstring del
 * módulo). Todo esto es ADITIVO sobre la rama AST de arriba: cuando `graph`
 * es `null` (posible — falla el build del grafo, o los dos interruptores de
 * `CONTRATO-GRAFO-HIPOTESIS.md` §6 — pero YA NO es el caso de todos los días
 * desde que V1 cableó la pasada 2, ver el docstring del módulo) simplemente
 * no aporta evidencia — nunca inventa una.
 * ──────────────────────────────────────────────────────────────────────── */
interface GIndex {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

/** OLA V (integrador) — cacheado por identidad de `CodeGraph`, el mismo idiom
 *  que `builder.ts#GRAPH_INDEX_CACHE` y `facade.ts#VIEW_CACHE`.
 *  *Intención del caché:* el índice es una propiedad **DEL GRAFO**, no del
 *  hallazgo que pregunta — el mismo grafo da siempre el mismo índice, así que
 *  rehacerlo es trabajo repetido y nunca información nueva.
 *  *Por qué hizo falta:* desde que V1 cableó el grafo a las hipótesis
 *  (Ola V), `graphChainEvidence` corre una vez por hipótesis candidata y este
 *  barrido O(nodos+aristas) sobre el repo ENTERO se rehacía en cada una.
 *  Medido con `node --cpu-prof` sobre `corpus/hugo` (`scripts/v-int-perfil.mts`,
 *  corrida de 101 s): **7,5 s en `buildGIndex`**, el tercer costo del árbol. */
const GINDEX_CACHE = new WeakMap<CodeGraph, GIndex>();

function buildGIndex(graph: CodeGraph): GIndex {
  const cached = GINDEX_CACHE.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
  }
  const index: GIndex = { nodeById, edgesFrom };
  GINDEX_CACHE.set(graph, index);
  return index;
}

function asGraphIndex(index: GIndex): { nodeById: (id: string) => CodeGraphNode | null; edgesFrom: (id: string) => readonly CodeGraphEdge[] } {
  return { nodeById: (id) => index.nodeById.get(id) ?? null, edgesFrom: (id) => index.edgesFrom.get(id) ?? [] };
}

function extendsEdge(index: GIndex, fromId: string, toId: string): boolean {
  return (index.edgesFrom.get(fromId) ?? []).some((e) => e.kind === "extends" && e.to === toId);
}

interface GraphEvidence {
  readonly form: "completa" | "parcial";
  readonly detail: string;
  readonly viaSatisfies: boolean;
}

/**
 * COMPLETA-heterogénea (terna §0.4, reusando `findWrappingChains`) o PARCIAL
 * (mismo mensaje, mismo dueño distinto, sin interfaz común, sin `extends`
 * entre ambos — `super.m()` queda excluido). `null` si el grafo no muestra
 * ninguna de las dos.
 *
 * OLA V (V4): YA NO hay una forma "COMPLETA-homogénea por grafo". Existía
 * (`sym:X.m --calls(receiver-member)--> sí misma` ⇒ completa) hasta que se
 * cableó el grafo de verdad (V1) y esa arista resultó ser LA MISMA que deja
 * un reenvío real a un sucesor del MISMO tipo — el grafo resuelve por
 * símbolo/declaración, no por instancia, así que no puede distinguir
 * "se llama a sí misma" de "llama a un sucesor de su propia clase" (ver el
 * `continue` sobre `target.id === fnId`, más abajo, y la nota "OLA V (V4)"
 * del docstring del módulo). Esa distinción queda, como siempre, en manos de
 * la vía AST (`findForwardField`/`successorFieldReceiver`, que sí ve el
 * TEXTO del receptor).
 */
function graphChainEvidence(graph: CodeGraph, file: FileUnit, fn: FunctionUnit): GraphEvidence | null {
  const fnId = symbolNodeId(file.path, fn.symbolPath);
  const name = fn.symbolPath[fn.symbolPath.length - 1] ?? fn.name ?? "";
  if (!name) return null;

  const hetero = findWrappingChains(graph).find((m) => m.memberName === name && (m.wrapperMemberId === fnId || m.wrappedMemberId === fnId));
  if (hetero) {
    // OLA U (N4) — `chain-assembly-evidence` SUBE de discriminador a compuerta
    // para la forma heterogénea, tal como lo pide `PLAN-INTENCIONES.md` §4
    // ("la acción concreta es subir esta señal … a required … aceptando que
    // baja el recall a cambio de subir la precisión"). INTENCIÓN VERIFICADA:
    // *"hay una CADENA, no una envoltura suelta"* — una terna de envoltura
    // sola prueba que un tipo llama al mismo mensaje sobre otro del mismo
    // protocolo, que es también la forma exacta de Decorator y de Proxy. Lo
    // que la vuelve una CADENA es que alguien enlace ≥2 eslabones DISTINTOS
    // del mismo protocolo en un mismo sitio: sin ese sitio de ensamblado, la
    // cardinalidad de la cadena es uno, y una cadena de un eslabón no es una
    // cadena.
    const assembled = chainAssemblySites(graph, name, fn.metrics.parameters);
    if (assembled >= 2) {
      return {
        form: "completa",
        viaSatisfies: hetero.viaSatisfies,
        detail:
          `Terna de envoltura confirmada por el grafo: sym:${hetero.wrapperId}.${hetero.memberName} --calls(receiver-member)--> sym:${hetero.wrappedId}.${hetero.memberName}, ` +
          `ambos --implements|satisfies--> ${hetero.interfaceId}; y un sitio ensambla ${assembled} eslabones distintos del mismo protocolo (cardinalidad de cadena confirmada)` +
          (hetero.viaSatisfies ? " (riesgo A9 declarado: al menos un lado resuelto vía satisfies, no implements — CONTRATO-F10.md §3)." : "."),
      };
    }
  }

  const index = buildGIndex(graph);
  const arity = fn.metrics.parameters;
  for (const e of index.edgesFrom.get(fnId) ?? []) {
    if (e.kind !== "calls" || !edgeHasRole(e, "receiver-member")) continue;
    const target = index.nodeById.get(e.to);
    if (!target || target.kind !== "symbol" || target.family !== "function-like") continue;
    if (target.symbolPath[target.symbolPath.length - 1] !== name) continue;
    if ((target.arity ?? null) !== arity) continue;

    // OLA V (V4) — PIDO de V1 (CONTRATO-GRAFO-HIPOTESIS.md §"el grafo confunde
    // recursión con cadena"), cerrado: ANTES este branch devolvía `completa`
    // (⇒ `ya-aplicado`) apenas encontraba una arista `calls(receiver-member)`
    // de `fnId` hacia SÍ MISMA — pero esa arista es LITERALMENTE la misma que
    // deja un reenvío real a un sucesor DEL MISMO TIPO (`this.next.handle()`
    // con `next: MismaClase`): el grafo resuelve por DECLARACIÓN, no por
    // instancia, así que `this.handle()` (auto-recursión) y `this.next.handle()`
    // (delegación real) apuntan al MISMO nodo símbolo cuando el sucesor
    // comparte clase con el emisor — el propio docstring del módulo ya lo
    // declaraba ("la arista es la misma") pero el código igual afirmaba
    // `ya-aplicado`, contradiciendo su propia evidencia en el texto. INTENCIÓN
    // QUE VERIFICA ESTE `continue`: sin poder distinguir "el receptor es el
    // objeto mismo" de "el receptor es un sucesor guardado en un campo" —que
    // es precisamente lo que separa CoR de la recursión pura— el grafo NO
    // aporta evidencia por esta vía; se sigue buscando otra arista candidata,
    // y la forma homogénea queda en manos de la vía AST (`findForwardField` /
    // `successorFieldReceiver`, que SÍ ve el texto del receptor), tal como el
    // propio módulo ya decía que era "la autoritativa". MEDIDO: este branch
    // producía 8 `ya-aplicado` falsos sobre 8 funciones puramente recursivas
    // en el corpus (eslint `Traverser._traverse`, nest `stringifyMessage`,
    // sqlalchemy `visit_cte`/`visit_typeclause`/`_splice_nested_inner_join`/
    // `_cache_key_getter_closure_variable`/`_do_get` ×2) — verificado a mano
    // que las 3 primeras son recursión pura, cero relación con CoR (informe
    // V1 §4). Con el `continue`, CoR vuelve exactamente a los 2 `ya-aplicado`
    // que la vía AST ya sostenía antes de esta ola (hugo `livereload.js:3263`,
    // sqlalchemy `type_api.py:2079`), medido de nuevo después del arreglo.
    if (target.id === fnId) continue;
    const ownerId = fn.symbolPath.length > 1 ? symbolNodeId(file.path, fn.symbolPath.slice(0, -1)) : null;
    const targetOwnerId = target.symbolPath.length > 1 ? symbolNodeId(file.path, target.symbolPath.slice(0, -1)) : null;
    if (ownerId && targetOwnerId && (extendsEdge(index, ownerId, targetOwnerId) || extendsEdge(index, targetOwnerId, ownerId))) continue; // super.m(): misma forma, no envoltura.

    return {
      form: "parcial",
      viaSatisfies: false,
      detail: `Reenvío homónimo confirmado por el grafo hacia sym:${target.id} — SIN interfaz común (implements/satisfies): un solo eslabón, no la terna completa (techo declarado en media, §0.4).`,
    };
  }
  return null;
}

/**
 * Discriminador de cadena real (§ tarea): un nodo S con `instantiates` hacia
 * >=2 tipos DISTINTOS que comparten el mensaje `(name, arity)` — evidencia
 * de que se está ensamblando una cadena heterogénea de verdad (p.ej.
 * `setNext(new ConcreteHandlerB())` junto a otro `new ConcreteHandlerA()`),
 * no un caso aislado.
 */
function chainAssemblySites(graph: CodeGraph, name: string, arity: number | null): number {
  const index = buildGIndex(graph);
  const gi = asGraphIndex(index);
  const bySource = new Map<string, Set<string>>();
  for (const list of index.edgesFrom.values()) {
    for (const e of list) {
      if (e.kind !== "instantiates") continue;
      const target = index.nodeById.get(e.to);
      if (!target || target.kind !== "symbol" || target.family !== "class-like") continue;
      if (!memberSignatures(gi, target.id).some((m) => m.name === name && m.arity === arity)) continue;
      const set = bySource.get(e.from) ?? new Set<string>();
      set.add(target.id);
      bySource.set(e.from, set);
    }
  }
  let max = 0;
  for (const set of bySource.values()) max = Math.max(max, set.size);
  return max;
}

/* ────────────────────────────────────────────────────────────────────────
 * El problema que esta hipótesis evalúa.
 * ──────────────────────────────────────────────────────────────────────── */
interface CorProblem {
  finding: Finding;
  file: FileUnit | null;
  fn: FunctionUnit | null;
  graph: CodeGraph | null;
  /**
   * Ola 11 — nombre+aridad del mensaje que ancla esta cadena (`fn.symbolPath`
   * final + `fn.metrics.parameters`), derivado del árbol vivo cuando `fn`
   * existe. Existe SÓLO para que `chainAssemblyEvidence` (grafo: `instantiates`)
   * pueda re-evaluarse en `refresh()`, donde `fn` vuelve a ser `null` (sin
   * árbol) pero el nombre/aridad ya no hace falta re-derivarlo — mismo idiom
   * que `strategy.ts#StrategyRefreshState.ownDiscriminant`, cacheado en
   * `build()` mientras el árbol está vivo.
   */
  nameArity: { readonly name: string | null; readonly arity: number | null };
}

const liveTreeAvailable: Check<CorProblem, void> = {
  id: "live-tree-available",
  describe: "El archivo del hallazgo tiene un árbol vivo esta corrida y la función se pudo localizar en él.",
  run(problem) {
    const holds = problem.fn !== null;
    return {
      holds,
      evidence: holds
        ? `Función "${problem.fn!.name ?? "(anónima)"}" localizada en el árbol vivo.`
        : "Sin árbol vivo para este archivo en esta corrida (límite de cableado documentado en hypotheses/run.ts) — no se puede confirmar la forma.",
    };
  },
};

/**
 * Reemplaza al viejo `guardRunConfirmed` como ÚNICO gate de candidatura: una
 * cadena ya limpia (0 guardas, como las 5 fixtures canónicas del patrón) es
 * TAMBIÉN un candidato real — de lo contrario nunca produciría ni siquiera
 * una hipótesis (silencio, prohibido por la tarea). Candidato ⟺ el olor de
 * guardas está presente, O ya hay alguna forma de reenvío (propio, de
 * hermano, o confirmado por grafo).
 */
const structuralOrSmellCandidate: Check<CorProblem, void> = {
  id: "structural-or-smell-candidate",
  describe: `≥${MIN_GUARD_RUN} guardas cortas con salida temprana que, al dispararse, invocan ≥2 mensajes DISTINTOS entre sí (evidencia de manejo diverso — no un pipeline dependiente ni una guarda de validación que sólo aborta) O ya existe alguna forma de reenvío de cadena (propio, de un hermano, o confirmado por el grafo) — sin ninguno de los dos no hay nada de Chain of Responsibility que evaluar.`,
  run(problem) {
    if (!problem.fn || !problem.file) return { holds: false, evidence: "(sin función localizada — ver live-tree-available)" };
    const fn = problem.fn;
    const file = problem.file;
    const owner = ownerOf(fn);
    const fileText = file.root.text;
    const guards = guardRunCandidate(fn, file).length > 0;
    const ownHit = findForwardField(fn, owner === null, fileText) !== null;
    const graphHit = problem.graph ? graphChainEvidence(problem.graph, file, fn) !== null : false;
    let siblingHit = false;
    if (owner && !ownHit) {
      siblingHit = file.functions.some((other) => other !== fn && ownerOf(other)?.key === owner.key && findForwardField(other, false, fileText) !== null);
    }
    const holds = guards || ownHit || graphHit || siblingHit;
    return {
      holds,
      evidence: holds
        ? "Candidato real: guarda-run con manejo diverso confirmado y/o alguna forma de reenvío de cadena detectada."
        : `Ni una corrida de guardas con manejo DIVERSO (≥${MIN_GUARD_RUN} guardas que invoquen ≥2 mensajes distintos al dispararse) ni ninguna forma de reenvío de cadena (propio, de hermano, o confirmado por grafo).`,
    };
  },
};

const independentGuardConditions: Check<CorProblem, void> = {
  id: "independent-guard-conditions",
  describe: "Las condiciones de las guardas no repiten todas el mismo identificador final — no son ramas de un único discriminante (Strategy/State), sino validaciones independientes.",
  run(problem) {
    const guards = topLevelGuardRun(problem.fn!);
    if (guards.length === 0) return { holds: false, evidence: "Sin guardas cortas con salida temprana que comparar." };
    const idents = guards.map((g) => trailingConditionIdentifier(g.childForFieldName("condition") as AstNode));
    const distinct = new Set(idents);
    const holds = distinct.size >= Math.min(3, guards.length);
    return {
      holds,
      evidence: holds
        ? `${distinct.size} identificador(es) final(es) distinto(s) entre ${guards.length} guarda(s): ${[...distinct].join(", ")}.`
        : `Las guardas comparten el mismo identificador final (${[...distinct].join(", ")}) — puede ser una cadena de un único discriminante, no validaciones independientes.`,
    };
  },
};

const repeatsInSameFile: Check<CorProblem, void> = {
  id: "repeats-in-same-file",
  describe: "La misma forma (≥3 guardas cortas con salida temprana Y manejo diverso) se repite en OTRA función del mismo archivo — evidencia de duplicación real, no un sitio aislado. LÍMITE DECLARADO: no mira el repo entero.",
  run(problem) {
    const file = problem.file!;
    const fn = problem.fn!;
    const others = file.functions.filter((f) => f !== fn && guardRunCandidate(f, file).length > 0);
    return {
      holds: others.length > 0,
      evidence:
        others.length > 0
          ? `Se repite en ${others.length} función(es) más de este archivo: ${others.map((o) => o.name ?? "(anónima)").join(", ")}.`
          : "No se repite en ninguna otra función de este archivo (esta hipótesis sólo mide dentro del mismo archivo hoy).",
    };
  },
};

const chainAssemblyEvidence: Check<CorProblem, void> = {
  id: "chain-assembly-evidence",
  describe: "El grafo muestra un sitio que instancia >=2 tipos DISTINTOS que comparten el mismo mensaje (nombre+aridad) de este candidato — evidencia de una cadena heterogénea real siendo ensamblada, no un caso aislado.",
  run(problem) {
    if (!problem.graph) return { holds: false, evidence: "Sin grafo en esta corrida — no se puede buscar sitios de ensamblado (instantiates hacia >=2 tipos)." };
    const { name, arity } = problem.nameArity;
    if (!name) return { holds: false, evidence: "Sin nombre de mensaje disponible (ni árbol vivo en build(), ni caché de refresh()) — no se puede buscar sitios de ensamblado." };
    const distinct = chainAssemblySites(problem.graph, name, arity);
    return {
      holds: distinct >= 2,
      evidence: distinct >= 2 ? `Un sitio instancia ${distinct} tipos distintos que comparten el mensaje "${name}".` : "Ningún sitio instancia >=2 tipos distintos que compartan este mensaje.",
    };
  },
};

const COR_NEIGHBORHOOD_ANCHORS = new Set(["many-returns", "complexity", "boolean-complexity"]);

/**
 * Ola 11 — el vecindario, la vía real para que este discriminador funcione:
 * `build()` (llamada dentro de `analyzeFile`) siempre ve `EMPTY_NEIGHBORHOOD`
 * (`findingsInFile` da `[]`, `holds: false` conservador — ver el docstring
 * del módulo, misma clase de límite que las anclas intra-* ya declaran);
 * `refresh()` (Ola 10, `crossAnalyze`, DESPUÉS de `buildNeighborhoodIndex`)
 * ve el índice real. A diferencia de `repeatsInSameFile` (arriba, AST,
 * necesita `ctx.file` vivo — inútil en `refresh()`), esto sólo necesita
 * `Finding`s (nunca árbol), así que corre de verdad en las dos pasadas.
 */
function chainCandidatesInNeighborhood(ctx: HypothesisContext): Check<CorProblem, void> {
  return {
    id: "varios-candidatos-en-el-vecindario",
    describe: "El vecindario (ctx.neighborhood.findingsInFile) muestra OTRO hallazgo de la misma familia (many-returns/complexity/boolean-complexity) en este archivo — varios manejadores potenciales, no un único método largo aislado.",
    run(problem) {
      const file = problem.finding.locations[0]?.file;
      if (!file) return { holds: false, evidence: "El hallazgo ancla no trae archivo." };
      const others = ctx.neighborhood.findingsInFile(file).filter((f) => COR_NEIGHBORHOOD_ANCHORS.has(f.kind) && f.id !== problem.finding.id);
      return {
        holds: others.length > 0,
        evidence:
          others.length > 0
            ? `${others.length} hallazgo(s) más de la misma familia en "${file}" (vecindario): varios manejadores potenciales, más compatible con una cadena real.`
            : `Ningún otro hallazgo de la misma familia en "${file}" según el vecindario (o el vecindario está vacío en esta corrida — ver hypotheses/run.ts).`,
      };
    },
  };
}

function appliedState(problem: CorProblem): AppliedStateResult {
  const fn = problem.fn!;
  const file = problem.file!;
  const owner = ownerOf(fn);
  const graph = problem.graph;

  const fileText = file.root.text;
  const graphEvidence = graph ? graphChainEvidence(graph, file, fn) : null;
  const ownHit = findForwardField(fn, owner === null, fileText);

  let sibling: { fn: FunctionUnit; hit: ForwardHit } | null = null;
  if (owner && !ownHit && !graphEvidence) {
    for (const other of file.functions) {
      if (other === fn) continue;
      const otherOwner = ownerOf(other);
      if (!otherOwner || otherOwner.key !== owner.key) continue;
      const hit = findForwardField(other, false, fileText);
      if (hit) {
        sibling = { fn: other, hit };
        break;
      }
    }
  }

  const completaGraph = graphEvidence?.form === "completa";
  const parcialGraph = graphEvidence?.form === "parcial";
  const completaAst = ownHit !== null;
  const elsewhereForwards = sibling !== null;

  const checks = [
    {
      label: "Esta MISMA función ya reenvía el MISMO mensaje a un sucesor — cadena de envoltura completa (homogénea u heterogénea). Nunca se sugiere el patrón sobre esto.",
      passed: completaAst || completaGraph,
      why: completaGraph
        ? graphEvidence!.detail
        : completaAst
          ? // OLA V (V4) — bug de texto que PIDO de V1 nombró (§6.2): esto decía
            // SIEMPRE "(sin grafo en esta corrida)" con sólo mirar si el grafo
            // CONFIRMÓ la forma completa, no si el grafo EXISTÍA — con la pasada
            // de V1 corriendo, `graph` puede estar presente y simplemente no
            // aportar esta evidencia particular (p.ej. auto-recursión, ver el
            // `continue` de `graphChainEvidence` arriba). Distinguir ambos casos
            // es la columna "qué NO se confirmó y por qué" que el producto
            // muestra — afirmar "sin grafo" cuando SÍ lo hay es información falsa.
            `Reenvía "${fn.name}(...)" a través de \`${ownHit!.fieldLabel}\` — mismo nombre de mensaje, recursión estructural confirmada por AST${graph ? " (el grafo no aporta evidencia adicional de esta forma en este sitio)" : " (sin grafo en esta corrida)"}.`
          : "Esta función no reenvía el mismo mensaje a un sucesor.",
    },
    {
      label: "Un solo eslabón: reenvía al MISMO mensaje sobre un colaborador distinto, sin interfaz común confirmada por el grafo — techo declarado en `media` (§0.4: sin ranura tipada no se puede afirmar que el sucesor esté GUARDADO, sólo que se lo llama).",
      passed: parcialGraph,
      why: parcialGraph
        ? graphEvidence!.detail
        : graph
          ? "El grafo no encontró un reenvío homónimo hacia un dueño distinto sin interfaz común."
          : "Sin grafo en esta corrida — no se puede evaluar el eslabón único por estructura (ver LÍMITE DE CABLEADO en el docstring del módulo).",
    },
    {
      label: owner
        ? `Otro método de "${owner.name}" ya implementa el reenvío condicional al siguiente eslabón (mismo archivo).`
        : "Sin clase/receptor dueño detectable (forma funcional/closure): este excluder sólo evalúa esta misma función — ver brecha declarada en el docstring del módulo.",
      passed: elsewhereForwards,
      why: elsewhereForwards
        ? `"${sibling!.fn.name ?? "(anónima)"}" ya reenvía a través de \`${sibling!.hit.fieldLabel}\`.`
        : owner
          ? `Ningún otro método de "${owner.name}" reenvía el mismo mensaje a un sucesor.`
          : "Sin dueño (clase/receptor) detectable para buscar hermanos.",
    },
  ];

  const state: PatternState = completaAst || completaGraph ? "ya-aplicado" : parcialGraph || elsewhereForwards ? "parcial" : "ausente";
  return { state, checks };
}

const SOURCE_COR =
  "refactoring.guru/design-patterns/chain-of-responsibility — \"Aplicabilidad\": " +
  "\"cuando tu programa debe manejar diferentes tipos de solicitudes de diversas formas, " +
  "pero los tipos exactos de solicitudes y sus secuencias son desconocidos de antemano\".";

/**
 * Ola 11 — `frozen`, presente SÓLO en `refresh()`: los dos discriminadores
 * de FORMA (AST, necesitan árbol vivo) no se recalculan — se REUSAN tal
 * cual `build()` los dejó (`existing.discriminators`), envueltos en un
 * `Check` que ignora `problem` y devuelve el resultado cacheado. Sin esto,
 * `refreshDiscriminators` (que re-corre TODOS los discriminadores del spec)
 * los volvería a evaluar con `fn`/`file` en `null` (sin árbol en
 * `refresh()`) y los degradaría a `false` — perdiendo evidencia real que sí
 * se pudo confirmar en `build()`. Sólo `chainAssemblyEvidence` (grafo, vía
 * `nameArity` cacheado) y `chainCandidatesInNeighborhood` (vecindario, no
 * necesita árbol) se recalculan de verdad en las dos pasadas.
 */
function frozenCheck(source: Check<CorProblem, void>, cached: PatternHypothesisCheck): Check<CorProblem, void> {
  return { id: source.id, describe: source.describe, run: () => ({ holds: cached.passed, evidence: cached.why }) };
}

function buildSpec(
  ctx: HypothesisContext,
  frozen?: { readonly guardConditions: PatternHypothesisCheck; readonly repeatsInFile: PatternHypothesisCheck },
): HypothesisSpec<CorProblem, void> {
  return {
    pattern: "Chain of Responsibility",
    // Ola 10 (§0.4/CONTRATO-F10.md): baja de `alta` (F6/Ola 6) a `media` —
    // declarado, no adivinado: la forma PARCIAL no puede confirmar que el
    // sucesor esté GUARDADO (sin ranura tipada), sólo que se lo LLAMA, y el
    // motor sólo admite un único techo por hipótesis (`ausente` hereda el
    // mismo, no es una regresión nueva de esa forma en particular).
    ceiling: "media",
    needs: [],
    required: [liveTreeAvailable, structuralOrSmellCandidate],
    discriminators: [
      frozen ? frozenCheck(independentGuardConditions, frozen.guardConditions) : independentGuardConditions,
      frozen ? frozenCheck(repeatsInSameFile, frozen.repeatsInFile) : repeatsInSameFile,
      chainAssemblyEvidence,
      chainCandidatesInNeighborhood(ctx),
    ],
    appliedState,
    toConfirm: [
      "Confirmar que las guardas son verdaderamente INDEPENDIENTES (no ramas de un mismo tipo/estado) y que se espera que la lista de comprobaciones siga creciendo — 3-4 validaciones estables puede ser sobre-diseño, no una señal de Chain of Responsibility.",
      "Si las condiciones comparten un único discriminante, la forma correcta puede ser Strategy/State, no Chain of Responsibility.",
      "PARCIAL: sin ranura tipada en el grafo, no se puede confirmar que el colaborador esté GUARDADO en un campo propio del sucesor — sólo que se lo llama con el mismo mensaje. Confirmar a mano antes de recomendar formalizar la cadena.",
    ],
    source: SOURCE_COR,
  };
}

function locateFunction(file: FileUnit, loc: RoleLocation): FunctionUnit | null {
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= loc.startLine && fn.endLine >= loc.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

function computePlaces(problem: CorProblem, state: PatternState): readonly RoleLocation[] {
  const loc = problem.finding.locations[0];
  const primaryRole = state === "ya-aplicado" ? "función que ya reenvía el mismo mensaje al siguiente eslabón (patrón ya aplicado)" : "sitio con secuencia de guardas o reenvío parcial";
  const primary: RoleLocation = { file: loc.file, startLine: loc.startLine, endLine: loc.endLine, symbol: loc.symbol, role: primaryRole };

  if (!problem.fn || !problem.file || state === "ya-aplicado") return [primary];

  const others = problem.file.functions.filter((f) => f !== problem.fn && guardRunCandidate(f, problem.file).length > 0);
  const extra: RoleLocation[] = others.map((o, i) => ({
    file: problem.file!.path,
    startLine: o.startLine,
    endLine: o.endLine,
    symbol: o.name ?? undefined,
    role: `sitio candidato adicional ${i + 1} de ${others.length} (mismo archivo)`,
  }));
  return [primary, ...extra];
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AE — FRENTE AE5. EL CAMINO DEL ANCLA-FUERZA (`exclusive-dispatch-ladder`).
 *
 * TODO LO DE ESTE BLOQUE ES ADITIVO: no toca ni un `required`, ni un
 * discriminador, ni una rama de `appliedState`, ni un umbral, ni una constante
 * del camino viejo. El único cambio al camino viejo es que el array `anchors`
 * SUMA un elemento. La entrada está detrás de
 * `if (problem.kind === "exclusive-dispatch-ladder")` en `build()`.
 *
 * POR QUÉ EXISTE, con el número medido antes de escribirlo: las TRES anclas
 * viejas de este patrón producen **27 hipótesis con `ausente` = 0** en las dos
 * poblaciones (13 bibliotecas + 8 aplicaciones, volcados del 16/08). La causa
 * es estructural y está en `guardsShowHandlingDiversity` (`:898`): el ÚNICO
 * camino que puede terminar en `ausente` exige que alguna rama llame a través
 * de un sucesor guardado en un campo propio — o sea, para decir "acá FALTA una
 * cadena" hay que encontrar antes media cadena escrita. Misma patología que el
 * proyecto midió en `Facade` (0 de 288) y en `Decorator ·
 * homonymous-delegation` (0 de 111), y se arregla igual: SUMANDO el camino que
 * falta.
 *
 * LA FUERZA que este camino evalúa (GoF: *"avoid coupling the sender of a
 * request to its receiver by giving more than one object a chance to handle
 * it"*): *hay VARIOS destinos posibles para UNA MISMA solicitud, y quién la
 * atiende lo decide UN SITIO con una escalera de condiciones que los conoce a
 * TODOS — así que agregar un destino obliga a tocar ese sitio*.
 *
 * `ya-aplicado` ES INALCANZABLE DESDE ESTE CAMINO Y LO DIGO CON TODAS LAS
 * LETRAS, con el mismo criterio con el que AC3 y AD4 lo dijeron de las suyas:
 * el ancla exige que NINGÚN destino llame a otro destino (condición 5a) y que
 * NADIE MÁS los enumere (5b) — o sea, se calla justamente donde la cadena ya
 * está. Que no produzca `ya-aplicado` NO es mérito suyo; el mérito medible es
 * el silencio de 5a/5b, y tiene tests que lo exigen.
 * `aplicado-eludido` sigue fuera de alcance para todo este patrón desde F6
 * (declarado en el docstring del módulo), y este camino no lo cambia.
 * ══════════════════════════════════════════════════════════════════════════ */

interface LadderProblem {
  readonly finding: Finding;
  readonly outcome: LadderOutcome | null;
}

/** `true` si la parte que se contesta con el ÁRBOL (condiciones 1-3) se
 *  sostiene: el motor corta antes de mirar el grafo, así que estas tres
 *  rechazos son los únicos que significan "la escalera no está". */
const AST_REJECTIONS = new Set<string>(["sin-escalera", "sin-solicitud-comun", "pocas-ramas"]);

const escaleraConLaMismaSolicitud: Check<LadderProblem, void> = {
  id: "escalera-con-la-misma-solicitud",
  describe:
    "Releído el ÁRBOL VIVO: el emisor tiene ≥4 ramas mutuamente excluyentes (guarda con salida temprana o brazo de una cadena if/else-if) y cada una entrega el MISMO parámetro, sin transformar, a una llamada distinta.",
  run(problem) {
    const outcome = problem.outcome;
    if (!outcome) {
      return { holds: false, evidence: "Sin árbol vivo o sin grafo para este archivo en esta corrida — no se puede releer la escalera (nunca se aprueba por no poder mirar)." };
    }
    const holds = outcome.rejection === null || !AST_REJECTIONS.has(outcome.rejection);
    return {
      holds,
      evidence: holds
        ? `${outcome.facts ? outcome.facts.branches.length : "≥4"} ramas excluyentes entregan la misma solicitud a un destino cada una (de ${outcome.rawBranches} ramas excluyentes en total).`
        : `La escalera no se sostiene al releer el árbol: ${outcome.rejection} (${outcome.rawBranches} ramas excluyentes encontradas).`,
    };
  },
};

const condicionesIndependientes: Check<LadderProblem, void> = {
  id: "condiciones-independientes",
  describe:
    "Ningún identificador distinto de la solicitud aparece en TODAS las condiciones de la escalera — cada rama decide por su cuenta si le toca, en vez de ser una rama más sobre un único discriminante (que sería Strategy/State, no una cadena).",
  run(problem) {
    const outcome = problem.outcome;
    if (!outcome) return { holds: false, evidence: "Sin árbol vivo o sin grafo — no se pueden comparar las condiciones." };
    if (outcome.rejection === "condiciones-de-un-solo-discriminante") {
      return { holds: false, evidence: "Todas las condiciones nombran el mismo identificador: es un despacho por un único discriminante, no manejadores que deciden cada uno por su cuenta." };
    }
    const holds = outcome.rejection === null || !AST_REJECTIONS.has(outcome.rejection);
    return { holds, evidence: holds ? "Las condiciones no comparten ningún identificador fuera de la solicitud." : "(sin escalera que comparar — ver escalera-con-la-misma-solicitud)" };
  },
};

const destinosQueSoloEsteSitioEnumera: Check<LadderProblem, void> = {
  id: "destinos-que-solo-este-sitio-enumera",
  describe:
    "El grafo confirma las dos mitades de la resolución: ningún destino llama a otro destino (la cadena NO está ya armada) y ningún otro símbolo del repo llama a ≥2 de ellos (nadie más los enumera, así que agregar un destino obliga a tocar ESTE sitio).",
  run(problem) {
    const outcome = problem.outcome;
    if (!outcome) return { holds: false, evidence: "Sin grafo o sin árbol vivo en esta corrida — no se puede verificar quién más conoce los destinos (nunca se aprueba por no poder mirar)." };
    if (outcome.facts) {
      return {
        holds: true,
        evidence: `${outcome.facts.resolved.length} destinos resueltos (${outcome.facts.resolved.map((r) => r.message).join(", ")}); ninguno llama a otro y ningún otro símbolo del repo llama a dos o más.`,
      };
    }
    const why: Record<string, string> = {
      "sin-grafo": "Sin grafo (o sin consulta de aristas entrantes) en esta corrida — no se puede afirmar exclusividad.",
      "pocos-destinos-resueltos": "El grafo resuelve menos de 4 destinos distintos: no se afirma nada sobre los que no se pueden mirar.",
      "la-cadena-ya-esta-armada": "Un destino llama a otro destino: el pase de la responsabilidad YA está escrito, así que lo que falta no es la cadena.",
      "otro-sitio-ya-los-enumera": "Otro símbolo del repo llama a ≥2 de los destinos: la enumeración no es exclusiva de este sitio (o ya está factorizada en otro lado).",
    };
    return { holds: false, evidence: why[outcome.rejection ?? ""] ?? "(sin escalera que verificar — ver escalera-con-la-misma-solicitud)" };
  },
};

const masDestinosQueElPiso: Check<LadderProblem, void> = {
  id: "mas-destinos-que-el-piso",
  describe: "Más de 4 destinos distintos: cuantos más manejadores enumera el sitio, más trabajo ahorra sacar la elección de ahí.",
  run(problem) {
    const n = problem.outcome?.facts?.resolved.length ?? 0;
    return { holds: n > 4, evidence: n > 0 ? `${n} destinos distintos resueltos.` : "Sin destinos resueltos." };
  },
};

const laFamiliaCruzaElArchivo: Check<LadderProblem, void> = {
  id: "la-familia-cruza-el-archivo",
  describe: "Al menos un destino vive en OTRO archivo — el acoplamiento que este sitio concentra cruza la frontera del archivo, no es una escalera doméstica.",
  run(problem) {
    const n = problem.outcome?.facts?.acrossFiles ?? 0;
    return { holds: n > 0, evidence: n > 0 ? `${n} destino(s) resueltos viven en otro archivo.` : "Todos los destinos viven en el archivo del emisor." };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO — dos peldaños, los dos son
 * RECOMENDACIÓN, y ninguno puede dar `ya-aplicado` (ver el encabezado del
 * bloque). Lo que los separa es un hecho del grafo, no una heurística: si los
 * DUEÑOS de dos o más destinos ya apuntan a un mismo supertipo escrito
 * (`extends`/`implements`/`satisfies`/`mixes-in`), la familia de manejadores
 * intercambiables YA EXISTE y lo único que falta es que este sitio deje de
 * enumerarlos ⇒ `parcial`. Sin ningún protocolo común, no hay nada del patrón
 * puesto ⇒ `ausente`.
 */
function ladderAppliedState(problem: LadderProblem): AppliedStateResult {
  const facts = problem.outcome?.facts ?? null;
  const shared = facts?.sharedProtocols ?? [];
  const checks = [
    {
      label: "Los destinos YA comparten un protocolo escrito (sus dueños apuntan al mismo supertipo): la familia de manejadores intercambiables existe, falta que este sitio deje de enumerarlos.",
      passed: shared.length > 0,
      why:
        shared.length > 0
          ? `Dos o más destinos tienen dueños que comparten: ${shared.join(", ")}.`
          : "Ningún par de destinos tiene dueños que compartan un supertipo escrito — no hay familia todavía.",
    },
    {
      label: "La cadena ya está armada (algún destino llama al siguiente) o ya hay otro sitio que los enumera — el ancla se calla en los dos casos, así que acá siempre es falso.",
      passed: false,
      why: "El ancla `exclusive-dispatch-ladder` exige lo contrario para emitir (condiciones 5a y 5b): si la cadena existiera, no habría hipótesis. `ya-aplicado` es inalcanzable desde este camino, y es por construcción, no por mérito.",
    },
  ];
  return { state: shared.length > 0 ? "parcial" : "ausente", checks };
}

const LADDER_TO_CONFIRM: readonly string[] = [
  "BRECHA DECLARADA — EL ORDEN: el patrón prueba los manejadores EN UN ORDEN y este mecanismo verifica que hay N destinos alternativos para la MISMA solicitud, no que el orden importe. Las aristas `calls` del grafo no llevan posición (medido en las Olas AC y AD). Confirmar a mano si el orden de las ramas es semántico o accidental.",
  "Confirmar que los destinos son de verdad INTERCAMBIABLES (que cualquiera podría atender la solicitud y decidir pasarla) y no pasos de un cómputo que casualmente reciben el mismo dato. Si cada rama hace algo de naturaleza distinta, la mitigación puede ser una tabla de despacho y no una cadena.",
  "Los destinos se resuelven por las aristas `calls` CRUDAS que salen del emisor, incluidas las `ambiguous`: la existencia de la llamada es un hecho del código y sólo su destino puede estar mal fijado. Verificar que los destinos nombrados son los del propio repo y no un homónimo.",
];

function buildLadderSpec(): HypothesisSpec<LadderProblem, void> {
  return {
    pattern: "Chain of Responsibility",
    ceiling: "media", // mismo techo que el camino viejo — §0.4/CONTRATO-F10.md, no lo mueve este frente.
    needs: [], // agnóstico de lenguaje: nada de esto necesita clases (la escalera y la llamada existen en las seis gramáticas).
    required: [escaleraConLaMismaSolicitud, condicionesIndependientes, destinosQueSoloEsteSitioEnumera],
    discriminators: [masDestinosQueElPiso, laFamiliaCruzaElArchivo],
    appliedState: (problem) => ladderAppliedState(problem),
    toConfirm: LADDER_TO_CONFIRM,
    source: SOURCE_COR,
  };
}

/**
 * Índice CRUDO del grafo para el camino nuevo — `buildGIndex` (arriba) filtra
 * por `confidentEdges` y este camino vive también sobre las `ambiguous`, por el
 * mismo motivo medido que `outgoingCallCount` de este módulo (Ola V) y que AD4:
 * la existencia de la llamada es un hecho del CÓDIGO y sólo su destino es lo que
 * el resolutor no supo fijar. Cacheado por identidad del `CodeGraph`, mismo
 * idiom que `GINDEX_CACHE`.
 */
const RAW_INDEX_CACHE = new WeakMap<CodeGraph, GraphIndex>();
function rawIndexOf(graph: CodeGraph): GraphIndex {
  const cached = RAW_INDEX_CACHE.get(graph);
  if (cached) return cached;
  const index = buildGraphIndex(graph);
  RAW_INDEX_CACHE.set(graph, index);
  return index;
}

/** Los dos pisos del ancla, repetidos acá a propósito: la hipótesis RE-VERIFICA
 *  con el árbol vivo lo que el detector afirmó, y tiene que preguntar lo mismo.
 *  Si divergieran, el `required` aprobaría o rechazaría por un motivo distinto
 *  del que emitió el hallazgo. */
const LADDER_MIN_RAMAS = 4;
const LADDER_MIN_DESTINOS = 4;

function buildLadder(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const file = ctx.file;
  const fn = file ? locateFunction(file, problem.locations[0]) : null;
  const usable = graph ?? ctx.repo.graph;
  const outcome = file && fn && usable ? ladderFactsFor(file, fn, rawIndexOf(usable), LADDER_MIN_RAMAS, LADDER_MIN_DESTINOS) : null;

  const internal: LadderProblem = { finding: problem, outcome };
  const spec = buildLadderSpec();
  const engineOutcome = runEngine(spec, ctx.capabilities, internal, undefined);
  if (corTrace) recordCorTrace(spec, internal, problem, ctx, "escalera", null, engineOutcome !== null);
  if (!engineOutcome) return null;

  return toPatternHypothesis(spec, engineOutcome, {
    anchorFindingId: problem.id,
    // Los `places` son los del propio ancla: ya vienen con el rol exacto de
    // cada sitio (el emisor y cada rama, con su condición y su destino).
    places: problem.locations,
    cost:
      "Un objeto por manejador más el cableado de la cadena (setNext/lista) — más indirección que un `if` para leer un caso simple; conviene sólo si la lista de comprobaciones crece o se reutiliza en más de un sitio.",
  });
}

/** Forma real (privada) de `PatternHypothesis.refreshState` para esta hipótesis — ver `refresh()` abajo. */
interface CorRefreshState {
  readonly nameArity: { readonly name: string | null; readonly arity: number | null };
}

function nameArityOf(fn: FunctionUnit | null): CorRefreshState["nameArity"] {
  if (!fn) return { name: null, arity: null };
  return { name: fn.symbolPath[fn.symbolPath.length - 1] ?? fn.name ?? null, arity: fn.metrics.parameters };
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — LA TRAZA DEL EMBUDO (auditoría de compuertas).
 *
 * Mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace` y `strategy.ts#startStrategyTrace`
 * (Ola AH, AH1): ningún `process.env` en el camino de análisis, se prende
 * llamando `startCorTrace()` desde un script de medición y se apaga sola al
 * leerla. `null` (el default de producción) ⇒ costo cero: ni una rama de más
 * por hallazgo, ni un check de más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE. Para saber CUÁNTOS candidatos entran
 * a cada `required` y cuántos mueren en él —la pregunta de esta ola— hace
 * falta el resultado de CADA compuerta también en los hallazgos que no
 * emiten, y además el desglose interno de `structuralOrSmellCandidate`, que
 * fusiona cuatro señales en un solo booleano.
 *
 * NO CAMBIA NINGÚN COMPORTAMIENTO: los `required` y los helpers que se
 * re-corren acá son puros (leen `problem`/`graph`, no escriben nada), y todo
 * el bloque está detrás de `corTrace !== null`.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface CorTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly language: string | null;
  /** `"guarda"` (camino viejo: many-returns/complexity/boolean-complexity) o `"escalera"` (`exclusive-dispatch-ladder`). */
  readonly ruta: string;
  readonly withGraph: boolean;
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  /** El primero de `required` que NO se sostiene, o `null` si todos se sostienen. */
  readonly diesAt: string | null;
  /** Desglose interno de `structural-or-smell-candidate` — las cuatro señales que fusiona. */
  readonly sub: {
    readonly guardasTop: number;
    readonly guardasConManejo: number;
    readonly calleesDistintos: number;
    readonly algunReceptorPropio: boolean;
    readonly ownHit: boolean;
    readonly graphHit: boolean;
    readonly siblingHit: boolean;
  } | null;
  readonly emitted: boolean;
}

let corTrace: CorTraceEntry[] | null = null;

export function startCorTrace(): void {
  corTrace = [];
}

export function takeCorTrace(): readonly CorTraceEntry[] {
  const t = corTrace ?? [];
  corTrace = null;
  return t;
}

/** El desglose de las cuatro señales que `structuralOrSmellCandidate` fusiona — mismas funciones, mismo orden, sin decidir nada. */
function corSubTrace(problem: CorProblem): CorTraceEntry["sub"] {
  const fn = problem.fn;
  const file = problem.file;
  if (!fn || !file) return null;
  const owner = ownerOf(fn);
  const fileText = file.root.text;
  const guards = topLevelGuardRun(fn);
  const body = fnBody(fn);
  const bodyChildren = body ? namedChildren(body) : guards;
  const params = ownParameterNames(fn);
  const selfNames = selfNamesOf(fn);
  const hits = guards.map((g) => handlingCalleeOf(g, bodyChildren, params)).filter((h): h is HandlingHit => h !== null);
  hits.push(...nestedEligibilityCallees(bodyChildren, params));
  const ownHit = findForwardField(fn, owner === null, fileText) !== null;
  const graphHit = problem.graph ? graphChainEvidence(problem.graph, file, fn) !== null : false;
  const siblingHit =
    owner !== null && !ownHit
      ? file.functions.some((other) => other !== fn && ownerOf(other)?.key === owner.key && findForwardField(other, false, fileText) !== null)
      : false;
  return {
    guardasTop: guards.length,
    guardasConManejo: hits.length,
    calleesDistintos: new Set(hits.map((h) => h.callee)).size,
    algunReceptorPropio: hits.some((h) => successorFieldReceiver(h.call, selfNames, ownFieldNames(file, fn)) !== null),
    ownHit,
    graphHit,
    siblingHit,
  };
}

function recordCorTrace<P>(
  spec: HypothesisSpec<P, void>,
  internal: P,
  problem: Finding,
  ctx: HypothesisContext,
  ruta: string,
  sub: CorTraceEntry["sub"],
  emitted: boolean,
): void {
  const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(internal, undefined).holds }));
  const loc = problem.locations[0];
  corTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    language: ctx.file?.language ?? null,
    ruta,
    withGraph: ctx.repo.graph !== null,
    withFile: ctx.file !== null,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    sub,
    emitted,
  });
}

function build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  // OLA AE (AE5) — el ancla-fuerza tiene su propio camino de entrada: su
  // evidencia (la escalera, la solicitud común, los destinos exclusivos) no
  // tiene nada que ver con la del camino viejo, así que no puede compartir ni
  // su `required` ni su `appliedState`. Todo lo de abajo queda intacto.
  if (problem.kind === "exclusive-dispatch-ladder") return buildLadder(problem, graph, ctx);

  const loc = problem.locations[0];
  const file = ctx.file;
  const fn = file ? locateFunction(file, loc) : null;
  const nameArity = nameArityOf(fn);
  const internal: CorProblem = { finding: problem, file, fn, graph: graph ?? ctx.repo.graph, nameArity };

  const spec = buildSpec(ctx);
  const outcome = runEngine(spec, ctx.capabilities, internal, undefined);
  if (corTrace) recordCorTrace(spec, internal, problem, ctx, "guarda", corSubTrace(internal), outcome !== null);
  if (!outcome) return null;

  const hyp = toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: computePlaces(internal, outcome.state),
    cost:
      "Un objeto por manejador más el cableado de la cadena (setNext/lista) — más indirección que un `if` para leer un caso simple; conviene sólo si la lista de comprobaciones crece o se reutiliza en más de un sitio.",
  });
  const refreshState: CorRefreshState = { nameArity };
  return { ...hyp, refreshState };
}

/**
 * Ola 11 — cierra, para esta hipótesis, el límite que el docstring del
 * módulo declaraba ("NO implementa `refresh()`: hacerlo violaría el
 * contrato duro sin ganar nada"): eso seguía siendo cierto para promover
 * `state` (prohibido, sigue prohibido), pero `chainAssemblyEvidence`
 * (`instantiates`, grafo real) y `chainCandidatesInNeighborhood`
 * (`ctx.neighborhood.findingsInFile`, Ola 9) sí pueden aportar CONFIANZA
 * nueva sin tocar `state` — exactamente lo que `refresh()` tiene permitido.
 * `independentGuardConditions`/`repeatsInSameFile` (AST, necesitan árbol) se
 * REUSAN congelados desde `existing.discriminators` — ver `frozenCheck`.
 */
function refresh(existing: PatternHypothesisDraft, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  if (existing.state !== "ausente" && existing.state !== "parcial") return null; // ya-aplicado/aplicado-eludido no compiten por confianza — mismo criterio que engine.ts#refreshDiscriminators.
  const guardCheck = existing.discriminators.find((d) => d.label === independentGuardConditions.describe);
  const siblingCheck = existing.discriminators.find((d) => d.label === repeatsInSameFile.describe);
  if (!guardCheck || !siblingCheck) return null; // caché de una versión anterior a esta ola, sin los dos discriminadores esperados — nada seguro que congelar.

  const stored = existing.refreshState as CorRefreshState | undefined;
  const internal: CorProblem = {
    finding: problem,
    file: null,
    fn: null,
    graph: graph ?? ctx.repo.graph,
    nameArity: stored?.nameArity ?? { name: null, arity: null },
  };
  const spec = buildSpec(ctx, { guardConditions: guardCheck, repeatsInFile: siblingCheck });
  return refreshDiscriminators(spec, existing, internal, undefined);
}

export const hypothesis: HypothesisBuilder = {
  id: "chain-of-responsibility",
  pattern: "Chain of Responsibility",
  layer: "patron",
  // OLA AE (AE5): el array SUMA el ancla-fuerza y CONSERVA las tres viejas —
  // aunque las tres midan `ausente` = 0 sobre 27 hipótesis en las dos
  // poblaciones. El número se publica; las anclas no se tocan.
  //
  // OLA AY (AY2) — SALEN `complexity` y `boolean-complexity`. LAS DOS TIENEN
  // **V = 0**: el recorte es de COSTO CERO SOBRE VERDADERAS POR DEFINICIÓN, que
  // es la única condición bajo la que esta ola autoriza podar. Los números, con
  // el instrumento que AY1 arregló, sobre el censo de los 21 repos:
  //
  //   · `complexity`          → V=0 F=10 n=10 psp=3, población 13. Wilson
  //     [0 %, 28 %]. La hipótesis se formó sobre los 4 juicios que ya había
  //     (V=0 F=4) y se validó sobre **6 sujetos FRESCOS** —los 6 que quedaban
  //     sin juzgar— abriendo el archivo real: 6 de 6 `falso`. Ninguna es una
  //     cadena de manejadores; son funciones largas cuyo remedio real es
  //     Decompose Conditional / Guard Clauses / Lookup Table, que YA anclan
  //     acá. Repos: cobra (4), sqlalchemy (2), gitea (2), netbox (3, `psp`).
  //   · `boolean-complexity`  → V=0 F=2 n=2, población 2. **n=2 NO llega al
  //     piso de 5 juicios**: esta baja NO se apoya en un porcentaje —no lo
  //     tiene—, se apoya en V=0, que es la condición de costo cero. Los 2
  //     sujetos son la MISMA condición booleana compuesta de un bundle
  //     vendorizado (Ghost · simplemde.js:9632): un guard compuesto, no una
  //     cadena.
  //
  // QUÉ NO SE TOCA, y es deliberado:
  //   · `many-returns` CONSERVA el ancla aunque mida V=1 F=10 n=11: tiene una
  //     verdadera y el límite de costo cero de esta ola PROHÍBE el recorte.
  //     El número se publica y el ancla se queda.
  //   · `COR_NEIGHBORHOOD_ANCHORS` (más arriba) NO cambia. Esa lista lee
  //     HALLAZGOS del vecindario como EVIDENCIA, no rutea propuestas: un
  //     `many-returns` sigue pudiendo apoyarse en un `complexity` vecino. Sacar
  //     un kind de `anchors` deja de PROPONER sobre él; no lo deja de MIRAR.
  //   · `build()` sigue construyendo para los cuatro kinds. Sólo cambia el
  //     ruteo (`run.ts` filtra por `b.anchors.includes(finding.kind)`), así que
  //     volver a encenderlas es ESTA línea y ninguna otra.
  //
  // DELTA DE NIVEL 1: **CERO por construcción.** Los dos kinds siguen anclados
  // por otras hipótesis (`complexity` → consolidate-conditional, guard-clauses,
  // split-phase, lookup-table, extract-variable, extract-method;
  // `boolean-complexity` → decompose-conditional), así que `run.ts:194` no
  // pierde ni un kind y ningún detector deja de correr.
  //
  // EFECTO MEDIDO sobre el patrón: población 29 → 14 · V=3 sin tocar ·
  // n 25 → 13 · precisión 12,0 % [4 %, 29 %] → **23,1 % [8 %, 50 %]**.
  // Con la barra de ±8-12 puntos, 23,1 % es INDISTINGUIBLE de la meta del 25 %
  // y también de 12 %: la base sigue siendo chica y así hay que leerla.
  anchors: ["many-returns", "exclusive-dispatch-ladder"],
  build,
  refresh: refresh,
};
