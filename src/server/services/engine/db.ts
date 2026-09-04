/**
 * OLA BC, FRENTE BC1 — EL TIPO DE CONEXIÓN DEL MOTOR.
 *
 * El motor NO abre su base de datos: la RECIBE. Este archivo existe para que
 * ese "recibe" no arrastre al tablero: hasta esta ola los tres repositorios
 * `db/code-*-repository.ts` tipaban su conexión como `DB` importado de
 * `db/index.ts`, y ese archivo importa `../config.js` (la ruta del `.db` del
 * tablero, el puerto del servidor, el directorio de worktrees). Type-only, sí
 * —se borra al compilar—, pero es una FLECHA en el grafo de dependencias: un
 * consumidor nuevo que lea el motor para saber qué necesita termina leyendo la
 * configuración del tablero.
 *
 * `EngineDb` es exactamente lo mismo que `DB` (`Database.Database` de
 * better-sqlite3, el mismo objeto en runtime) sin pasar por `db/index.ts`.
 * Verificado: `export type DB = Database.Database` — son el MISMO tipo, así
 * que este cambio no puede alterar ni una llamada.
 *
 * EL DÍA QUE EL MOTOR QUIERA SU PROPIA BASE (fuera del alcance de esta ola):
 * el consumidor abre su propio `new Database(rutaPropia)`, llama a
 * `ensureEngineSchema` (ver `schema.ts`) y se la pasa a `createAnalysisEngine`.
 * Nada más — ni una tabla del motor tiene clave foránea a `tasks`/`projects`
 * (verificado en `db/schema.sql`: `repo_key` es TEXT opaco).
 */
import type Database from "better-sqlite3";

/** La conexión sqlite que el motor recibe. Idéntica a `db/index.ts#DB`, sin importarlo. */
export type EngineDb = Database.Database;
