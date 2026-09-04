#!/usr/bin/env bash
# OLA AT - AT3, SEGUNDA PASADA CON ORDEN DE PRIORIDAD.
# El orden del primer script (por tamaño de repo) gastaba el tiempo en repos SIN
# poblacion de mis anclas. Este ataca primero los que SI la tienen, chicos antes que
# grandes. Salta los que ya estan (`-s`), asi que es seguro relanzarlo.
set -u
cd /home/maxi1805/claude-kanban
SALIDA="${1:-scratchpad-at3/vol}"
mkdir -p "$SALIDA"

REPOS=(
  "corpus/newtonsoft-json newtonsoft-json"
  "corpus/nest nest"
  "corpus/rubocop rubocop"
  "corpus-app/ShareX ShareX"
  "corpus-app/Ghost Ghost"
  "corpus-app/netbox netbox"
  "corpus/guava guava"
  "corpus/sqlalchemy sqlalchemy"
  "corpus-app/jenkins jenkins"
  "corpus-app/redmine redmine"
  "corpus-app/excalidraw excalidraw"
  "corpus/jekyll jekyll"
  "corpus/vueuse vueuse"
  "corpus/lodash lodash"
  "corpus/eslint eslint"
  "corpus/hugo hugo"
  "corpus-app/chatwoot chatwoot"
  "corpus-app/gitea gitea"
)

for entry in "${REPOS[@]}"; do
  set -- $entry
  dir="$1"; nombre="$2"
  if [ -s "$SALIDA/$nombre.json" ]; then echo "== $nombre ya esta" >&2; continue; fi
  echo "== $nombre" >&2
  CK_CUPOS="${CK_CUPOS:-3}" ./scripts/con-analisis.sh timeout 3000 npx tsx scripts/at3-dump.mts "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -3
done
echo "== FIN" >&2
