/**
 * El catálogo de `kind`s, DERIVADO del registro — la contrapartida en runtime
 * de la apertura de `CodeFindingKind` (`shared/types.ts`).
 *
 * Abrir la unión resuelve el choque de compilación (un detector nuevo ya no
 * edita `shared/types.ts`) pero deja un agujero de producto: la UI necesita un
 * nombre humano para cada kind, y si ese nombre viviera en un diccionario del
 * frontend volveríamos a tener un archivo compartido que cada detector nuevo
 * tiene que editar — el mismo problema, mudado de carpeta.
 *
 * La salida es: **la etiqueta viaja con los datos**. Cada detector ya declara
 * un `title` humano (lo exige `DetectorBase`, lo usa el panel "Qué no estamos
 * viendo"); acá se lo empareja con su `kind` y el resultado se publica en
 * `CodeAnalysis.kinds`. Un detector nuevo aporta su etiqueta escribiendo su
 * propio archivo, y nada más.
 *
 * F4 — integración final: `analyzeRepo` (`code-analyzer.ts`) ahora sí corre
 * el registro completo (22 detectores, `runDetectors`/`bySeverityDescThenId`)
 * y publica `kinds: [...kindCatalog()]` en `CodeAnalysis` (ver
 * `code-analyzer.ts` cerca de `kinds:`). Este docstring documentaba antes el
 * hueco ("sin productor todavía"); quedó desactualizado cuando el paquete A
 * cableó el registro y se corrige acá. La UI sigue teniendo su camino por
 * defecto para un `kind` que no aparezca en el catálogo (kinds desconocidos),
 * disciplina que no cambia.
 */
import type { CodeFindingKindInfo } from "../../../shared/types.js";
import { DETECTORS } from "./registry.js";
import type { Detector } from "./types.js";

/**
 * `{ kind, label }` por cada kind que el conjunto de detectores puede emitir,
 * deduplicado y ordenado por `kind` (determinista: dos corridas producen el
 * mismo arreglo, así que serializarlo no genera diffs espurios).
 *
 * Cuando dos detectores comparten `kind` — legítimo: varias reglas pueden
 * describir el mismo problema — gana el `title` del primero en orden
 * alfabético de `id`, que es el orden en que el registro obliga a listarlos.
 * Es una elección arbitraria pero ESTABLE; la alternativa (concatenar títulos)
 * produce etiquetas que crecen sin control en pantalla.
 */
export function kindCatalog(detectors: readonly Detector[] = DETECTORS): readonly CodeFindingKindInfo[] {
  const byKind = new Map<string, string>();
  for (const detector of detectors) {
    if (!byKind.has(detector.kind)) byKind.set(detector.kind, detector.title);
  }
  return [...byKind.entries()]
    .map(([kind, label]) => ({ kind, label }))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}
