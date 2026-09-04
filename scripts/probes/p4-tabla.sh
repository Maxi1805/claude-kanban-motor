#!/usr/bin/env bash
# P4 (Ola P) — medicion ad-hoc, NO produccion.
#
# La tabla 2x2 del frente: (grafo viejo|nuevo) x (detector viejo|nuevo), sobre los
# volcados ya en disco. No re-analiza nada — el detector se corre sobre el grafo volcado,
# asi que las cuatro celdas son segundos.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=src/server/services/detect/inter-file/coupling-without-abstraction.ts
trap 'cp /tmp/p4/cwa-ON.ts "$D"' EXIT

REPOS="${*:-cobra hugo jekyll click nest sqlalchemy guava}"

for det in OFF ON; do
  cp "/tmp/p4/cwa-$det.ts" "$D"
  for grafo in base desp; do
    echo "=== detector=$det grafo=$grafo"
    for r in $REPOS; do
      [ -f "/tmp/p4/$grafo-$r.json" ] || continue
      npx tsx scripts/probes/p4-medir.mts "/tmp/p4/$grafo-$r.json" | head -6
    done
  done
done
cp /tmp/p4/cwa-ON.ts "$D"
