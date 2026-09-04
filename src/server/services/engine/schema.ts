/**
 * OLA BC, FRENTE BC1 — EL MOTOR CREA SU PROPIO ALMACENAMIENTO.
 *
 * Antes de esta ola las tres tablas del analizador (`code_file_facts`,
 * `code_finding_decisions`, `code_graphs`) sólo existían porque `initDb`
 * —función del TABLERO, que lee `config.dbPath`— ejecutaba `db/schema.sql`
 * entero. Un consumidor del motor que no fuera el tablero (el MCP que motiva
 * esta ola) no tenía forma de conseguir esas tablas sin arrastrar la
 * configuración del tablero con ellas.
 *
 * `ensureEngineSchema(db)` es esa forma. Idempotente por construcción
 * (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, y los
 * `ALTER TABLE ADD COLUMN` guardados por `PRAGMA table_info`), así que correrlo
 * sobre una base que ya las tiene —la del usuario, con 263 snapshots vivos— es
 * un no-op verificable, nunca una migración destructiva.
 *
 * LAS TRES COLUMNAS ADITIVAS. `facts_json`, `facts_schema_version` y
 * `facts_blob` se agregaron a `code_file_facts` DESPUÉS de que la tabla
 * shippeara, así que el `CREATE TABLE IF NOT EXISTS` no las pone en una base
 * vieja. Estaban en `migrate()` de `db/index.ts`; se mudaron acá con la tabla,
 * porque son parte de la MISMA verdad: quien crea la tabla tiene que dejarla
 * completa. `db/index.ts#migrate` ya no las menciona.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { EngineDb } from "./db.js";

const ENGINE_SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");

/** Las tablas que el motor posee. Nada fuera de esta lista es suyo. */
export const ENGINE_TABLES = ["code_file_facts", "code_finding_decisions", "code_graphs"] as const;

/**
 * Aplica el DDL del motor sobre `db`. Seguro de correr en cada arranque y
 * sobre una base que ya lo tiene aplicado.
 */
export function ensureEngineSchema(db: EngineDb): void {
  db.exec(fs.readFileSync(ENGINE_SCHEMA_PATH, "utf8"));

  // F3: el blob crudo de `FileFacts` por archivo (funciones/clones/behavioral
  // ANTES de cualquier join entre archivos). Una fila anterior a esta columna
  // la lee como `NULL`, que es un MISS, nunca un error —
  // `facts_schema_version` se compara al lado, así que una fila escrita bajo
  // otra forma de `FileFacts` también es miss, no una lectura a medio migrar.
  addColumnIfMissing(db, "code_file_facts", "facts_json", "TEXT");
  addColumnIfMissing(db, "code_file_facts", "facts_schema_version", "INTEGER");
  // P3: `facts_json` comprimido con gzip (ver `FACTS_GZIP_LEVEL`/
  // `decodeFactsPayload` en `code-facts-repository.ts`). Mismo razonamiento
  // aditivo: una fila anterior lee `NULL` acá y cae de vuelta a la columna
  // `facts_json` heredada.
  addColumnIfMissing(db, "code_file_facts", "facts_blob", "BLOB");
}

function addColumnIfMissing(db: EngineDb, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
