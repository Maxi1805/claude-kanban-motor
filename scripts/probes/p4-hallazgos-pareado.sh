#!/usr/bin/env bash
# P4 (Ola P) — medicion ad-hoc, NO produccion.
#
# Igual que `p4-antes-despues.sh` pero volcando HALLAZGOS (`dump-hallazgos.mts`) en vez
# del grafo: es lo que hace falta para la tabla de volumen por (kind, lenguaje) y para la
# compuerta de recall (cruzar contra `tests/golden/precision/*.verdicts.csv` por
# `stableFindingId`).
set -uo pipefail
cd "$(dirname "$0")/../.."

S1=src/server/services/graph/symbols.ts
S2=src/server/services/graph/references.ts
S3=src/server/services/graph/edges/invocacion-indirecta.ts
poner() { cp "/tmp/p4/symbols-$1.ts" "$S1"; cp "/tmp/p4/references-$1.ts" "$S2"; cp "/tmp/p4/invoc-$1.ts" "$S3"; }
trap 'poner ON' EXIT

dump() {
  local repo="$1" out="$2" intento
  for intento in 1 2 3 4 5 6 7 8; do
    if CK_CORPUS_DIR=/home/maxi1805/claude-kanban ./scripts/con-analisis.sh \
      npx tsx scripts/dump-hallazgos.mts "corpus/$repo" "$out" >/tmp/p4/ultimo-h.log 2>&1; then
      tail -1 /tmp/p4/ultimo-h.log
      return 0
    fi
    echo "  (reintento $intento sobre $repo)" >&2
    sleep 30
  done
  echo "FALLO $repo" >&2
  return 1
}

for r in "$@"; do
  poner OFF
  echo "-- $r OFF"
  dump "$r" "/tmp/p4/h-base-$r.json"
  poner ON
  echo "-- $r ON"
  dump "$r" "/tmp/p4/h-desp-$r.json"
done
poner ON
echo "P4-HALLAZGOS-FIN"
