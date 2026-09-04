#!/usr/bin/env bash
# OLA AT - AT3. Un repo por invocacion de `con-analisis.sh`: el cupo se toma y
# se SUELTA entre repo y repo, para no estrangular a los otros seis frentes.
set -u
cd /home/maxi1805/claude-kanban
SALIDA="${1:-scratchpad-at3/vol}"
mkdir -p "$SALIDA"
SCRIPT="${2:-scripts/at3-dump.mts}"

REPOS=(
  "corpus/cobra cobra"
  "corpus/click click"
  "corpus/preact preact"
  "corpus/vueuse vueuse"
  "corpus/jekyll jekyll"
  "corpus/lodash lodash"
  "corpus/newtonsoft-json newtonsoft-json"
  "corpus/nest nest"
  "corpus/rubocop rubocop"
  "corpus/hugo hugo"
  "corpus/eslint eslint"
  "corpus-app/redmine redmine"
  "corpus-app/excalidraw excalidraw"
  "corpus-app/ShareX ShareX"
  "corpus-app/Ghost Ghost"
  "corpus/sqlalchemy sqlalchemy"
  "corpus-app/netbox netbox"
  "corpus-app/chatwoot chatwoot"
  "corpus/guava guava"
  "corpus-app/jenkins jenkins"
  "corpus-app/gitea gitea"
)

for entry in "${REPOS[@]}"; do
  set -- $entry
  dir="$1"; nombre="$2"
  if [ -s "$SALIDA/$nombre.json" ]; then
    echo "== $nombre ya esta" >&2
    continue
  fi
  echo "== $nombre" >&2
  CK_CUPOS="${CK_CUPOS:-3}" ./scripts/con-analisis.sh timeout 3000 npx tsx "$SCRIPT" "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -3
done
echo "== FIN" >&2
