#!/usr/bin/env bash
# P4 (Ola P) — medicion ad-hoc, NO produccion.
#
# Vuelca el grafo de cada repo DOS veces seguidas, con el agrupamiento por tipo de
# `graph/symbols.ts` apagado y prendido, para que el antes y el despues se midan con la
# MISMA foto del resto del arbol. Doce frentes editan `src/server/services/` al mismo
# tiempo: medir el "antes" media hora antes del "despues" mezcla el cambio propio con el
# de los demas — verificado sobre cobra, 957 aristas a las 09:28 y 1.452 a las 09:55 con
# el agrupamiento APAGADO en las dos.
#
# El archivo de produccion NUNCA se edita en el lugar: se copia una de dos variantes ya
# escritas (`/tmp/p4/symbols-ON.ts` = arbol real, `/tmp/p4/symbols-OFF.ts` = la misma con
# el post-proceso de agrupamiento cortado en su primera linea). El `trap` deja siempre la
# variante ON, que es la del arbol.
set -uo pipefail
cd "$(dirname "$0")/../.."

S1=src/server/services/graph/symbols.ts
S2=src/server/services/graph/references.ts
for f in /tmp/p4/symbols-ON.ts /tmp/p4/symbols-OFF.ts /tmp/p4/references-ON.ts /tmp/p4/references-OFF.ts; do
  [ -f "$f" ] || { echo "falta $f" >&2; exit 64; }
done
S3=src/server/services/graph/edges/invocacion-indirecta.ts
poner() { cp "/tmp/p4/symbols-$1.ts" "$S1"; cp "/tmp/p4/references-$1.ts" "$S2"; cp "/tmp/p4/invoc-$1.ts" "$S3"; }
trap 'poner ON' EXIT

# Reintento: el arbol pasa por estados que no compilan mientras otros frentes editan
# (medido: una corrida murio con un ReferenceError dentro del modulo de OTRO frente, a
# medio escribir). Un fallo asi no es un resultado, es ruido de la ola.
dump() {
  local repo="$1" out="$2" intento
  for intento in 1 2 3 4 5 6 7 8; do
    if CK_CORPUS_DIR=/home/maxi1805/claude-kanban ./scripts/con-analisis.sh \
      npx tsx scripts/probes/n5-dump-graph.mts "corpus/$repo" "$out" >/tmp/p4/ultimo.log 2>&1; then
      tail -1 /tmp/p4/ultimo.log
      return 0
    fi
    echo "  (reintento $intento sobre $repo: el arbol no corria)" >&2
    sleep 30
  done
  echo "FALLO $repo" >&2
  return 1
}

for r in "$@"; do
  poner OFF
  echo "-- $r OFF"
  dump "$r" "/tmp/p4/base-$r.json"
  poner ON
  echo "-- $r ON"
  dump "$r" "/tmp/p4/desp-$r.json"
done
poner ON
echo "P4-PAREADO-FIN"
