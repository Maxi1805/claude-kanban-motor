# claude-kanban-motor-mcp

Servidor MCP (stdio) sobre el motor de análisis. Deja que cualquier agente
pregunte por problemas del código y navegue el grafo.

## Herramientas

| Herramienta | Qué responde |
|---|---|
| `analyze_repo` | Panorama: problemas por tipo con la peor instancia, archivos más cargados |
| `list_problems` | Problemas con su remedio, filtrables por archivo, tipo o capa (`refactorizacion` / `patron`) |
| `new_problems` | Sólo lo que introdujo el trabajo actual contra un ref de git (merge-base) |
| `problems_in_touched_files` | Todo lo que vive en los archivos modificados, marcando cuáles son nuevos |
| `new_dependencies` | Imports, llamadas y referencias que creó (o quitó) el trabajo actual |
| `impact` | Quién usa lo que cambiaste, hasta N saltos, y qué tests tocan eso |
| `find_symbol` | Clases, funciones y métodos por nombre |
| `symbol_neighbors` | Quién usa un símbolo y qué usa: llamadas, referencias, imports, herencia |
| `path` | El camino más corto entre dos símbolos o archivos, y por qué relaciones pasa |
| `implementations` | Quién extiende o implementa un tipo, transitivamente |
| `find_similar` | ¿Ya existe una función parecida? Por símbolo, borrador de código o palabras |
| `tests_for` | Tests que nombran o importan un símbolo, directo o por quienes lo usan |
| `unused` | Símbolos y variables sin uso, abstracciones especulativas |
| `risky_files` | Archivos con muchos problemas y mucha dependencia entrante |
| `change_summary` | Balance del cambio: ¿mejoró o empeoró el repo? |
| `file_overview` | Símbolos, imports, importadores y problemas de un archivo |

Las respuestas son texto compacto, una línea por dato. `detail: true` en las
herramientas de problemas agrega el título completo y el porqué del remedio.

El análisis se cachea en memoria por directorio y se invalida cuando cambia
el árbol. La primera llamada sobre un repo tarda (segundos a minutos).

## Instalar

```bash
cd mcp && npm install
claude mcp add claude-kanban-motor -- "$(pwd)/start.sh"
```

Apuntá `dir` a la raíz del código, no a un directorio que contenga repos
ajenos clonados (se analizarían enteros).
