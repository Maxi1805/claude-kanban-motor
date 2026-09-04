#!/usr/bin/env bash
# Congela (o refresca) los 14 goldens del censo — CONTRATOS.md §3.5.
#
# UN PROCESO POR REPO, sin excepción: invoca `scripts/census.mts` una vez por
# slug (13 repos externos + fixtures-multi), nunca dos análisis en el mismo
# proceso node.
#
# Uso:
#   CK_CORPUS_DIR=/ruta/a/revision2 scripts/census-all.sh [dir_salida]
#
# CK_CORPUS_DIR debe apuntar al directorio que CONTIENE `corpus/`, es decir
# el mismo que aparece como `path: "corpus/<slug>"` en tests/golden/manifest.json
# (no directamente a .../corpus). Sin la variable, sólo se congela
# fixtures-multi (versionado dentro de este repo).
#
# dir_salida por defecto: tests/golden

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT_DIR="${1:-tests/golden}"
CORPUS_DIR="${CK_CORPUS_DIR:-}"

REPOS=(click cobra eslint guava hugo jekyll lodash nest newtonsoft-json preact rubocop sqlalchemy vueuse)

if [ -z "$CORPUS_DIR" ]; then
  echo "CK_CORPUS_DIR no está seteado — sólo se congela fixtures-multi." >&2
else
  for slug in "${REPOS[@]}"; do
    echo "== $slug ==" >&2
    node_modules/.bin/tsx scripts/census.mts "$CORPUS_DIR/corpus/$slug" "$slug" "$OUT_DIR/$slug.census.json"
  done
fi

echo "== fixtures-multi ==" >&2
node_modules/.bin/tsx scripts/census.mts tests/fixtures/patterns fixtures-multi "$OUT_DIR/fixtures-multi.census.json"
