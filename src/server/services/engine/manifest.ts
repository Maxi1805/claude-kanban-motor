/**
 * OLA BC, FRENTE BC1 — DÓNDE ESTÁ LA LÍNEA, ESCRITO COMO DATO.
 *
 * No es documentación: `no-board-imports.test.ts` lee ESTAS listas y falla si
 * un archivo del motor importa algo que no está permitido. Mover la línea
 * significa editar este archivo, a mano, a propósito — que es exactamente lo
 * que se quiere que cueste.
 *
 * EL CRITERIO, en una frase: **es del motor todo lo que puede responder
 * "analizá este directorio" sin que exista una tarea.** Es del tablero todo lo
 * que entra por `taskId`.
 *
 * VERIFICADO POR MEDICIÓN, no por lectura: antes de esta ola los 393 archivos
 * de esta lista importaban, fuera de `src/server/services/`, exactamente UNA
 * cosa: `src/shared/types.ts`. Cero imports de `src/server/db/`, cero de
 * `src/shared/interfaces.ts`, cero de `src/server/config.ts`, cero de
 * `src/server/api/`. La línea no se inventó en esta ola: ya estaba, sin nadie
 * que la sostuviera.
 */

/** Directorios (recursivos) que son enteramente del motor, relativos a la raíz del repo. */
export const ENGINE_DIRS = [
  "src/server/services/detect",
  "src/server/services/hypotheses",
  "src/server/services/graph",
  "src/server/services/facts",
  "src/server/services/engine",
] as const;

/**
 * Archivos sueltos del motor. Están bajo `src/server/services/` (junto a
 * archivos del tablero) porque MOVERLOS SERÍA UN ERROR MEDIBLE, no por inercia:
 * `analyze-cache.ts` define la huella del analizador como "sha256 de TODO
 * archivo bajo `src/server/services/`". Sacar el motor de ese árbol dejaría la
 * huella sin cubrir el código que sí cambia, y el caché de corpus serviría
 * mediciones de una versión vieja del analizador en silencio — exactamente la
 * clase de corrupción que ese archivo existe para prevenir. La separación de
 * esta ola es LÓGICA; el día que se separe en paquetes, la huella se redefine
 * ANTES de mover un archivo.
 */
export const ENGINE_FILES = [
  "src/server/services/code-analyzer.ts",
  "src/server/services/code-grammar.ts",
  "src/server/services/ingest-exclusion.ts",
  "src/server/services/code-content-signature.ts",
  "src/server/services/code-finding-ids.ts",
  "src/server/services/code-suggest.ts",
  "src/server/services/analyze-cache.ts",
  "src/server/services/census.ts",
  // El almacenamiento del motor. Vive en `db/` por historia, no por
  // pertenencia: las tres tablas que maneja no tienen ni una clave foránea a
  // `tasks`/`projects` y su `repo_key` es TEXT opaco (ver `engine/schema.sql`).
  // Desde esta ola tipan su conexión como `EngineDb`, no como el `DB` del
  // tablero.
  "src/server/db/code-facts-repository.ts",
  "src/server/db/code-decisions-repository.ts",
  "src/server/db/code-graph-repository.ts",
] as const;

/**
 * Lo ÚNICO fuera del motor que el código de producción del motor puede
 * importar. Una sola entrada, y tiene que quedar así: `shared/types.ts` son los
 * tipos de la RESPUESTA (`CodeAnalysis`, `CodeFinding`, …) más algunas
 * constantes, compartidos entre motor y tablero porque el motor es quien los
 * produce.
 *
 * NO está `src/shared/interfaces.ts`: ahí viven `Repositories`,
 * `CodeInspectorService`, `CodePageRequest` — el contrato del tablero. El motor
 * no lo importa y no debe.
 */
export const ALLOWED_EXTERNAL_MODULES = ["src/shared/types.ts"] as const;

/**
 * Concesión acotada para los TESTS del motor (y sólo para ellos): armar una
 * base de datos de juguete con `initDb` del tablero. No viaja en el cierre de
 * imports de producción, así que no acopla nada en runtime — pero se lista acá
 * para que sea una excepción NOMBRADA y no un agujero.
 */
export const ALLOWED_EXTERNAL_MODULES_IN_TESTS = ["src/server/db/index.ts"] as const;

/**
 * El lado del TABLERO, para el informe y para que la lista exista escrita en
 * algún lado. No lo usa el test (el test es una lista blanca, no negra: lo que
 * no está permitido está prohibido, incluido lo que se agregue mañana).
 */
export const BOARD_MODULES = [
  "src/server/services/code-inspector.ts", // el traductor taskId → (dir, repoName, repoKey)
  "src/server/api/code.ts", // el router HTTP
  "src/server/db/index.ts", // initDb + el esquema del tablero
  "src/server/db/repositories.ts", // tareas, proyectos, repos de proyecto
  "src/server/config.ts", // rutas y puertos del tablero
  "src/shared/interfaces.ts", // Repositories, CodeInspectorService, CodePageRequest
] as const;
