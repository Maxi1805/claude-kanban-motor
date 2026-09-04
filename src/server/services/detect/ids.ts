/**
 * ID estable sin números de línea — CONTRATOS.md §1.4.
 *
 * Ni la línea, ni el valor de la métrica, ni la severidad entran acá: editar
 * el archivo, o que un conteo suba de 48 a 51 miembros, NO acuña un descarte
 * nuevo. `detectorId` sí entra, así que un `id` de detector nunca se renombra
 * (el nombre visible se cambia en `title`); renombrar o mover un archivo SÍ
 * acuña un id nuevo — aceptado, sin seguimiento de renombres (que exigiría
 * git, prohibido como señal principal por la regla 4).
 */
import crypto from "node:crypto";

import type { Anchor, RoleLocation } from "./types.js";

/**
 * CONTRATO-F9.md §2.3 — el ÚNICO cambio permitido en este archivo en toda la
 * Ola 9: pasar esta función de privada a pública, sin tocar su cuerpo. La
 * necesita `graph/neighborhood.ts` para indexar hallazgos por ancla exacta
 * (`Neighborhood.findingsAtSymbol`) con la MISMA serialización que
 * `findingId` ya usa — sin esto, cada consumidor nuevo reinventaría el
 * formato `f#a.b@n` por su cuenta y una futura divergencia rompería el censo
 * en silencio. Cubierta por un test que congela sus tres formas
 * (`f#`, `f#a.b`, `f#a.b@2`) — si esta salida cambia, cambian TODOS los
 * `Finding.id` y caen las 8 líneas base del censo.
 */
export function serializeAnchor(a: Anchor): string {
  return `${a.file}#${a.symbolPath.join(".")}${a.ordinal != null ? `@${a.ordinal}` : ""}`;
}

/**
 * Paso 4 del algoritmo: si `locations[i].anchor` falta, se deriva de `file` +
 * `symbol`. Exportada porque el runner (`run.ts`) necesita el mismo cálculo
 * para construir el `Finding.id` a partir de un `RawFinding.locations`.
 */
export function deriveAnchor(loc: RoleLocation): Anchor {
  return loc.anchor ?? { file: loc.file, symbolPath: loc.symbol ? [loc.symbol] : [] };
}

/**
 * 1. Cada ancla se serializa como `file#a.b@n`.
 * 2. Se ordenan LEXICOGRÁFICAMENTE (el orden de las copias de un clon no
 *    cambia el id).
 * 3. `sha1(detectorId + " " + (variant ?? "") + " " + serializadas.join(""))`,
 *    base64url, 16 chars. Resultado: `${detectorId}:${hash}`.
 */
export function findingId(detectorId: string, variant: string | undefined, anchors: readonly Anchor[]): string {
  const serialized = anchors.map(serializeAnchor).sort();
  const payload = `${detectorId} ${variant ?? ""} ${serialized.join("")}`;
  const hash = crypto.createHash("sha1").update(payload, "utf8").digest().toString("base64url").slice(0, 16);
  return `${detectorId}:${hash}`;
}
