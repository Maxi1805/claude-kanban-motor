#!/usr/bin/env bash
# Regenera src/server/services/graph/benchmarks.json desde el corpus — CONTRATO-F4.md,
# tarea "benchmarks".
#
# UN PROCESO POR REPO, misma razón que scripts/census-all.sh: invoca
# `generate-benchmarks.mts scan` una vez por slug (subproceso), y recién al
# final un `merge` que sólo agrega JSON ya escrito.
#
# Uso:
#   CK_CORPUS_DIR=/ruta/a/revision2 scripts/generate-benchmarks-all.sh [salida.json] [YYYY-MM-DD]
#
# CK_CORPUS_DIR debe apuntar al directorio que CONTIENE `corpus/` (mismo
# convenio que scripts/census-all.sh). salida.json por defecto:
# src/server/services/graph/benchmarks.json. La fecha por defecto es `date +%F`
# de HOY, pasada como ARGUMENTO al script — nunca `Date.now()` adentro del
# generador (así una corrida repetida con los mismos scans es reproducible).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT_FILE="${1:-src/server/services/graph/benchmarks.json}"
DATE="${2:-$(date +%F)}"
CORPUS_DIR="${CK_CORPUS_DIR:-}"

if [ -z "$CORPUS_DIR" ]; then
  echo "CK_CORPUS_DIR no está seteado — no hay corpus contra el que generar benchmarks.json." >&2
  exit 1
fi

REPOS=(click cobra guava jekyll lodash newtonsoft-json preact vueuse)

SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

SCAN_FILES=()
for slug in "${REPOS[@]}"; do
  echo "== scan $slug ==" >&2
  scan_file="$SCRATCH_DIR/$slug.scan.json"
  node_modules/.bin/tsx scripts/generate-benchmarks.mts scan "$CORPUS_DIR/corpus/$slug" "$slug" "$scan_file"
  SCAN_FILES+=("$scan_file")
done

echo "== merge ==" >&2
node_modules/.bin/tsx scripts/generate-benchmarks.mts merge "$DATE" "$OUT_FILE" "${SCAN_FILES[@]}"
