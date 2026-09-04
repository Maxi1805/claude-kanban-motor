/**
 * LA LISTA — el ÚNICO archivo compartido que una arista nueva toca.
 * Réplica exacta del patrón de `detect/registry.ts` (CONTRATO-F4.md §2.1):
 * arista nueva = 1 archivo bajo `graph/edges/` con su `<id>.test.ts`, y acá
 * UNA línea de `import` y UNA línea en el array, ambas ordenadas
 * alfabéticamente por `id`. Dos agentes que agregan aristas distintas
 * chocan como máximo en dos líneas contiguas y el merge es trivial — no
 * reordenar ni reformatear lo ajeno.
 *
 * `interfaz-estructural` (arista `satisfies`) RETIRADO acá, CONTRATO-F8G.md
 * §3.2: nunca estuvo cableado en `warmup.ts` (segundo bootstrap de
 * `web-tree-sitter`, ver el historial de ese archivo) y la arista se deriva
 * ahora del grafo ya armado, sin AST — `graph/edges/satisfies-derive.ts`,
 * enganchado directo desde `graph/build.ts` (no pasa por este registro:
 * no es un `EdgeExtractor` que corra sobre un archivo, es una derivación
 * sobre nodos+`contains`). El archivo del extractor AST se borró junto con
 * esta línea, no quedó huérfano en disco.
 */
import { extractor as cadenaIdentidad } from "./cadena-identidad.js";
import { extractor as declaraTipo } from "./declara-tipo.js";
import { extractor as herencia } from "./herencia.js";
import { importsExtractor } from "./imports.js";
import { extractor as instanciacion } from "./instanciacion.js";
import { extractor as interfazDeclarada } from "./interfaz-declarada.js";
import { mixinExtractor } from "./mixin.js";
import { extractor as propagaTipo } from "./propaga-tipo.js";
import type { EdgeExtractor } from "./types.js";

export const EDGE_EXTRACTORS = [
  cadenaIdentidad,
  declaraTipo,
  herencia,
  importsExtractor,
  instanciacion,
  interfazDeclarada,
  mixinExtractor,
  propagaTipo,
] as const satisfies readonly EdgeExtractor[];
