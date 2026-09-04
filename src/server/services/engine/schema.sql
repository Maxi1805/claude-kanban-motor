-- OLA BC, FRENTE BC1 — EL ESQUEMA DEL MOTOR, SU ÚNICA FUENTE.
--
-- Estas tres tablas eran las últimas 73 líneas de `db/schema.sql`. Se movieron
-- ACÁ enteras (texto idéntico, ni una coma cambiada) porque son del MOTOR, no
-- del tablero: ninguna tiene clave foránea a `tasks`/`projects`, y `repo_key`
-- es un TEXT opaco — para el motor, "la identidad estable de este repo", nada
-- más. Que `project_repos.id` sea lo que el tablero le pasa hoy es una
-- CONVENCIÓN del llamador, no una restricción del esquema.
--
-- `db/index.ts` ya no las declara: llama a `ensureEngineSchema` (ver
-- `schema.ts`), que aplica ESTE archivo. Una sola copia del DDL, así que no
-- puede haber deriva entre "lo que crea el tablero" y "lo que crea un
-- consumidor que abre su propia base" — que es exactamente el escenario que
-- esta ola tiene que dejar posible.

-- F2 (PLAN.md): cache de hechos de análisis por archivo, direccionada por
-- HASH DE CONTENIDO — nunca por mtime ni por ruta de worktree, para que un
-- worktree nuevo ramificado de main (mismos bytes, mtimes nuevos) reuse el
-- 100% de lo que ya se analizó. `repo_key` es `project_repos.id`: la
-- identidad estable de "este repo", independiente de en qué worktree/tarea
-- se lo analizó. `file_path = ''` es la fila especial "instantánea de todo
-- el repo" que usa `code-inspector.ts` para servir sin volver a llamar al
-- analizador cuando NADA cambió — ver el docstring de `code-facts-repository.ts`.
-- `content_hash` entra en la PK (no sólo se compara): así una reversión a un
-- contenido visto antes vuelve a pegar en caché en vez de pisar la fila.
-- `analyzer_version` también entra en la PK: una fila de otra versión del
-- analizador NUNCA hace match en una lectura (los detectores pudieron
-- cambiar) y el GC la recolecta — ver `gc()`.
CREATE TABLE IF NOT EXISTS code_file_facts (
  repo_key            TEXT NOT NULL,
  file_path           TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  analyzer_version    TEXT NOT NULL,
  language            TEXT,
  lines               INTEGER NOT NULL DEFAULT 0,
  findings_json       TEXT NOT NULL,
  opportunities_json  TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  last_used_at         TEXT NOT NULL,
  PRIMARY KEY (repo_key, file_path, content_hash, analyzer_version)
);
CREATE INDEX IF NOT EXISTS idx_code_file_facts_lru  ON code_file_facts(last_used_at);
CREATE INDEX IF NOT EXISTS idx_code_file_facts_repo ON code_file_facts(repo_key, analyzer_version);

-- F2: descartes de hallazgos/oportunidades, por repositorio (`repo_key` =
-- `project_repos.id`) y por el id ESTABLE de hallazgo (`detect/ids.ts#findingId`
-- — sin números de línea, así que editar el archivo no acuña un descarte
-- nuevo). A propósito NO se filtra por `analyzer_version` en las lecturas
-- (ver `code-decisions-repository.ts`): un descarte es intención del
-- usuario sobre un problema con identidad estable, no un dato derivado del
-- detector que deba caducar cuando la lógica de detección cambia — "los
-- descartes empiezan a valer para todas las tareas futuras del mismo
-- repositorio" (PLAN.md §F2). La columna se guarda igual, sólo a título
-- informativo/auditoría.
CREATE TABLE IF NOT EXISTS code_finding_decisions (
  repo_key          TEXT NOT NULL,
  finding_id        TEXT NOT NULL,
  reason            TEXT NOT NULL,
  analyzer_version  TEXT NOT NULL,
  decided_at        TEXT NOT NULL,
  PRIMARY KEY (repo_key, finding_id)
);
CREATE INDEX IF NOT EXISTS idx_code_finding_decisions_repo ON code_finding_decisions(repo_key);

-- F3: el grafo de código (carpeta/archivo/símbolo + aristas contains/
-- references — CONTRATO-F3.md §3), persistido por firma de contenido de TODO
-- el árbol, una fila por (repo, commit) — mismo patrón centinela que la fila
-- `file_path = ''` de `code_file_facts`, pero en tabla propia: el grafo
-- serializado es potencialmente mucho más grande (decenas de miles de
-- aristas en un repo real, medido en guava) y es una unidad de repo entero,
-- nunca por archivo, así que no comparte el esquema fila-por-archivo/LRU-
-- por-archivo de `code_file_facts`. `content_hash` + `analyzer_version` en
-- la PK por la misma razón que ahí: una reversión pega en caché en vez de
-- pisar, y una fila de otra versión del analizador nunca hace match en una
-- lectura.
CREATE TABLE IF NOT EXISTS code_graphs (
  repo_key          TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  analyzer_version  TEXT NOT NULL,
  graph_json        TEXT NOT NULL,
  node_count        INTEGER NOT NULL DEFAULT 0,
  edge_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  last_used_at      TEXT NOT NULL,
  PRIMARY KEY (repo_key, content_hash, analyzer_version)
);
CREATE INDEX IF NOT EXISTS idx_code_graphs_lru ON code_graphs(last_used_at);
