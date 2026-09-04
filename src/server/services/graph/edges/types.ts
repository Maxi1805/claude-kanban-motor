/**
 * El vocabulario compartido del registro de aristas — CONTRATO-F4.md §2.2.
 *
 * *** NOTA DE PROCESO, para quien reconcilie esta ola: *** este archivo está
 * marcado en el contrato como propiedad del "agente-sonda" (S0), que debía
 * correr en paralelo y ANTES que los seis extractores. La orquestación de
 * esta ola no llegó a lanzar esa tarea por separado — verificado por grep
 * antes de escribir esto: no existía `graph/edges/` en absoluto. Sin esta
 * forma, ningún extractor compila, así que este archivo se creó como
 * infraestructura mínima, fiel a la firma congelada de CONTRATO-F4.md §2.2,
 * para no bloquear la tarea de la arista `mixes-in`. Si otro agente hermano
 * también la creó por su cuenta, son independientes del mismo contrato
 * congelado y deberían converger; el integrador de la fase de arreglos
 * decide cuál queda.
 *
 * `EdgeFacts` es SERIALIZABLE y SIN RESOLVER a propósito (`toName` crudo +
 * `toQualifier`): viaja en `FileFacts.edges` y es `buildGraph` quien lo
 * traduce a `CodeGraphEdge`, reutilizando la cascada de 9 etapas de
 * `resolve.ts` — ningún extractor resuelve símbolos por su cuenta.
 */
import type { EdgeKind, Provenance } from "../types.js";
import type { Capability } from "../../detect/capabilities.js";
import type { FileUnit } from "../../detect/types.js";

/** Identificador de "slot" de sonda: qué relación estructural se busca. Cadena libre, propia de cada extractor. */
export type SlotId = string;

/**
 * NUEVO, Ola R (R1) — la FORMA SINTÁCTICA del sitio que declara un tipo.
 * `"parameter"` incluye el receptor de un método de Go (`func (s *Svc)`), que
 * la gramática escribe como una lista de parámetros de uno.
 */
export type DeclSiteForm = "field" | "parameter" | "local";

/**
 * NUEVO, Ola R (R1) — QUÉ SE ESCRIBIÓ en el campo `type` de la gramática.
 *
 *   - `"nominal"`: un nombre. Puede resolver a una clase del repo (⇒ arista
 *     `declares-type`) o no resolver a ninguna (⇒ SIN arista: el `no sé`
 *     explícito de una librería externa). El nodo NO distingue los dos casos
 *     a propósito: si resuelve es una pregunta de repo COMPLETO y vive en la
 *     arista, no en un campo per-archivo que se vencería.
 *   - `"primitive"`: un primitivo o un literal. Nunca hay arista — un entero
 *     no es una declaración del repo. **Es información, no una falla.**
 *   - `"composite"`: un tipo CONSTRUIDO sin base nominal (`Foo[]`, `[]Foo`,
 *     `map[string]Foo`, `chan Foo`, `{x: 1}`, `A & B`). Nunca hay arista, y
 *     tampoco es `no sé`: se sabe, y se sabe que no es una clase del repo.
 */
export type WrittenTypeForm = "nominal" | "primitive" | "composite";

/** NUEVO, Ola R (R1). Ver `EdgeFacts.decl`. */
export interface DeclaresTypeInfo {
  readonly siteForm: DeclSiteForm;
  readonly typeForm: WrittenTypeForm;
  /** `true` cuando el tipo escrito es una UNIÓN: este `EdgeFacts` es UNO de varios del mismo sitio, y `collapseByFrom` los junta en una sola arista `ambiguous`. */
  readonly union: boolean;
}

export interface EdgeFacts {
  readonly extractorId: string;
  readonly kind: EdgeKind;
  /** symbolPath del declarante DENTRO de este archivo. Vacío = nivel archivo (imports). */
  readonly fromPath: readonly string[];
  /** Texto crudo del destino, tal como lo escribió el programa. NO resuelto. */
  readonly toName: string;
  /** Calificadores a la izquierda: `a.b.C` ⇒ ["a","b"]. Vacío si desnudo. */
  readonly toQualifier: readonly string[];
  readonly provenance: Provenance;
  readonly startLine: number;
  readonly endLine: number;
  /** `CarrierPath.ownerType` + pasos, serializado. Auditoría: de qué campo salió. */
  readonly via: string;
  /**
   * NUEVO, Ola R (R1) — SÓLO en `kind === "declares-type"`, ausente en toda
   * otra arista (los otros 5 extractores no lo escriben y nada lo lee para
   * ellos). Aditivo: un `EdgeFacts` de antes de esta ola sigue siendo un
   * valor válido del tipo ensanchado.
   *
   * Existe porque un hecho `declares-type` lleva DOS cosas y `EdgeFacts` sólo
   * modelaba una: el destino (que puede no haber — primitivo/compuesto) y la
   * FORMA del sitio, que es lo que materializa su nodo `carrier`. Sin este
   * campo, un hecho sin destino no tendría cómo viajar.
   */
  readonly decl?: DeclaresTypeInfo;
}

export interface EdgeContext {
  readonly language: string;
  readonly capabilities: ReadonlySet<Capability>;
  /** Los portadores YA descubiertos para este lenguaje (vía sonda centinela). Única vía de saber qué campo lleva la relación. */
  carriers(slot: SlotId): readonly import("./sentinel.js").CarrierPath[];
  /** Caminos de campo que la sonda marcó como ruido sintáctico (clave de objeto, parámetro, propiedad). */
  readonly suppressedRolePaths: readonly import("./sentinel.js").CarrierPath[];
}

export interface EdgeExtractor<Kind extends EdgeKind = EdgeKind> {
  /** kebab-case, único, INMUTABLE. */
  readonly id: string;
  readonly kind: Kind;
  readonly title: string;
  /** Capacidades de `detect/capabilities.ts`. Faltante ⇒ "no-aplicable", nunca cero. */
  readonly needs: readonly Capability[];
  /** Slots de sonda que este extractor necesita recuperados. Mismo principio que `needs`. */
  readonly slots: readonly SlotId[];
  /** Fuente centinela POR LENGUAJE, propiedad de ESTE archivo. Lenguaje ausente ⇒ ver EdgeCoverage §2.4. */
  readonly sentinel: Readonly<Record<string, string>>;
  /** Qué par debe recuperar la sonda para dar el slot por derivado. */
  readonly expect: { readonly from: string; readonly to: string };
  /** Legítimamente ausente en algún lenguaje (Go no tiene herencia de clases, por ejemplo). */
  readonly optional: boolean;
  /** PURO y SÍNCRONO, sobre el AST VIVO. Corre dentro de `analyzeFile`. */
  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[];
}

export type EdgeCoverageStatus = "corrio" | "no-aplicable" | "presupuesto-agotado" | "error";

/** Misma forma que `DetectorCoverage` — CONTRATO-F4.md §2.4. */
export interface EdgeCoverage {
  readonly extractorId: string;
  readonly kind: EdgeKind;
  readonly language: string;
  readonly status: EdgeCoverageStatus;
  readonly missingCapabilities?: readonly Capability[];
  readonly unitsConsidered: number;
  readonly edges: number;
  readonly error?: string;
}
