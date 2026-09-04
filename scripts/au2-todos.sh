#!/usr/bin/env bash
# OLA AU - AU2. Un repo por invocacion de `con-analisis.sh`: el cupo se toma y se
# SUELTA entre repo y repo, para no estrangular a los otros seis frentes.
# Orden: de chico a grande, para tener cobertura amplia temprano.
set -u
cd /home/maxi1805/claude-kanban
mkdir -p scratchpad-au2/vol
SALIDA="${1:-scratchpad-au2/vol}"

REPOS=(
  "corpus/lodash lodash"
  "corpus/preact preact"
  "corpus/cobra cobra"
  "corpus/click click"
  "corpus/jekyll jekyll"
  "corpus/rubocop rubocop"
  "corpus/vueuse vueuse"
  "corpus/newtonsoft-json newtonsoft-json"
  "corpus/nest nest"
  "corpus/excalidraw excalidraw"
  "corpus-app/redmine redmine"
  "corpus/eslint eslint"
  "corpus/hugo hugo"
  "corpus/sqlalchemy sqlalchemy"
  "corpus-app/netbox netbox"
  "corpus/ShareX ShareX"
  "corpus-app/ShareX ShareX"
  "corpus-app/chatwoot chatwoot"
  "corpus-app/excalidraw excalidraw"
  "corpus/guava guava"
  "corpus-app/jenkins jenkins"
  "corpus-app/Ghost Ghost"
  "corpus-app/gitea gitea"
)

for entry in "${REPOS[@]}"; do
  set -- $entry
  dir="$1"; nombre="$2"
  [ -d "$dir" ] || continue
  if [ -s "$SALIDA/$nombre.json" ]; then
    echo "== $nombre ya esta" >&2
    continue
  fi
  echo "== $nombre" >&2
  CK_CUPOS="${CK_CUPOS:-2}" ./scripts/con-analisis.sh timeout 3000 npx tsx scripts/au2-dump.mts "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -2
done
echo "== FIN" >&2
