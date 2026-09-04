/**
 * LA LISTA — el ÚNICO archivo compartido que una hipótesis nueva toca.
 * Calcado de `detect/registry.ts` hasta en el `as const satisfies`
 * (CONTRATO-F6.md §1.8): una hipótesis nueva = un archivo propio (`<patron>.ts`)
 * + un `<patron>.test.ts` propio + DOS líneas contiguas acá (un `import`, una
 * entrada del array), ambas ordenadas alfabéticamente por `pattern`. Dos
 * agentes que agregan hipótesis distintas chocan como máximo en dos líneas
 * contiguas; el merge es trivial.
 *
 * F6 arrancó con el registro VACÍO a propósito (S0: "NO migres ninguna
 * regla", el motor primero) y el abanico S1 lo llenó: **16 de las 17**
 * migradas (`registries.test.ts` compara este arreglo contra los archivos
 * en disco de `hypotheses/`, en las dos direcciones). Observer quedó
 * ausente varias olas, por decisión declarada — no existía detector-ancla
 * real, no se le inventó uno (ver CONTRATO-F6.md Contrato 3).
 *
 * CERRADO EN OLA 10: `detect/intra-file/manual-notification.ts` (nuevo,
 * mismo reparto de trabajo que `lazy-init-repetida.ts` para Proxy) ancla la
 * forma AUSENTE del encargo — notificación cableada a mano, repetida en
 * >=2 miembros de la misma clase — vía AST puro (`intra-file`, sin
 * necesidad de resolución cruzada). `hypotheses/observer.ts` distingue las
 * tres formas: implementa LOCALMENTE (vía AST, no vía
 * `graph/edges/invocacion-indirecta.ts`, que sigue cubriendo sólo su Forma
 * 3(a) — archivo compartido, fuera de este alcance) la Forma 4 ("recorrido
 * de colección + invocación del elemento") para reconocer cuándo la clase
 * YA tiene el par suscriptor/notificador (⇒ `ya-aplicado`), y usa el ancla
 * de grafo de CONTRATO-F9.md §3.5 (`carries`/`invokes-indirect`) para la
 * ruta PARCIAL "lista de callbacks ad hoc" — esa ruta de grafo, igual que
 * en `decorator.ts`/`strategy.ts`, queda inerte en la producción de hoy
 * porque el ancla es `intra-file` (`graph` siempre `null` dentro de
 * `analyzeFile`) — ver el docstring de `observer.ts` para el detalle y las
 * simplificaciones declaradas.
 *
 * El `satisfies` (en vez de `: readonly HypothesisBuilder[]`) NO es
 * cosmético: una anotación ensancharía `pattern`/`anchors` a `string` y
 * `RegisteredPattern`/`AnchoredKind` dejarían de funcionar en silencio —
 * mismo argumento que `detect/registry.ts` ya documenta para `Detector`.
 */
import { hypothesis as abstractFactory } from "./abstract-factory.js";
import { hypothesis as builder } from "./builder.js";
import { hypothesis as chainOfResponsibility } from "./chain-of-responsibility.js";
import { hypothesis as command } from "./command.js";
import { hypothesis as consolidateConditional } from "./consolidate-conditional.js";
import { hypothesis as decomposeConditional } from "./decompose-conditional.js";
import { hypothesis as decorator } from "./decorator.js";
import { hypothesis as extractClass } from "./extract-class.js";
import { hypothesis as extractClassFromTemporaryFields } from "./extract-class-from-temporary-fields.js";
import { hypothesis as extractDuplicatedMethod } from "./extract-duplicated-method.js";
import { hypothesis as extractMethod } from "./extract-method.js";
import { hypothesis as extractVariable } from "./extract-variable.js";
import { hypothesis as facade } from "./facade.js";
import { hypothesis as factoryMethod } from "./factory-method.js";
import { hypothesis as formTemplateMethod } from "./form-template-method.js";
import { hypothesis as guardClauses } from "./guard-clauses.js";
import { hypothesis as handleEmptyCatch } from "./handle-empty-catch.js";
import { hypothesis as lookupTable } from "./lookup-table.js";
import { hypothesis as parameterObject } from "./parameter-object.js";
import { hypothesis as prototype } from "./prototype.js";
import { hypothesis as proxy } from "./proxy.js";
import { hypothesis as removeDeadCode } from "./remove-dead-code.js";
import { hypothesis as removeFlagArgument } from "./remove-flag-argument.js";
import { hypothesis as splitPhase } from "./split-phase.js";
import { hypothesis as state } from "./state.js";
import { hypothesis as strategy } from "./strategy.js";
import { hypothesis as templateMethod } from "./template-method.js";
import { hypothesis as unifyAlternativeInterfaces } from "./unify-alternative-interfaces.js";
import { hypothesis as valueObject } from "./value-object.js";
import type { HypothesisBuilder } from "./types.js";

export const HYPOTHESES = [abstractFactory, builder, chainOfResponsibility, command, consolidateConditional, decomposeConditional, decorator, extractClass, extractClassFromTemporaryFields, extractDuplicatedMethod, extractMethod, extractVariable, facade, factoryMethod, formTemplateMethod, guardClauses, handleEmptyCatch, lookupTable, parameterObject, prototype, proxy, removeDeadCode, removeFlagArgument, splitPhase, state, strategy, templateMethod, unifyAlternativeInterfaces, valueObject] as const satisfies readonly HypothesisBuilder[];

/**
 * La unión de patrones registrados, DERIVADA del arreglo de arriba —
 * ensanchada sola a medida que se agregan hipótesis, sin tocar este archivo
 * salvo por sus dos líneas.
 */
export type RegisteredPattern = (typeof HYPOTHESES)[number]["pattern"];

/** La unión de `kind`s de `Finding` de los que CUALQUIER hipótesis registrada
 *  puede colgar. Mismo principio: derivada, nunca escrita a mano. */
export type AnchoredKind = (typeof HYPOTHESES)[number]["anchors"][number];
