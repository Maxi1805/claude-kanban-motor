#!/usr/bin/env bash
# OLA AS - AS4. Un repo por invocacion de `con-analisis.sh`: el cupo se toma y
# se SUELTA entre repo y repo, para no estrangular a los otros cinco frentes.
set -u
cd /home/maxi1805/claude-kanban
mkdir -p scratchpad-as4/vol
SALIDA="${1:-scratchpad-as4/vol}"
SCRIPT="${2:-scripts/as4-dump.mts}"

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
  "corpus/sqlalchemy sqlalchemy"
  "corpus/hugo hugo"
  "corpus/eslint eslint"
  "corpus/guava guava"
  "corpus-app/gitea gitea"
  "corpus-app/redmine redmine"
  "corpus-app/excalidraw excalidraw"
  "corpus-app/ShareX ShareX"
  "corpus-app/netbox netbox"
  "corpus-app/chatwoot chatwoot"
  "corpus-app/Ghost Ghost"
  "corpus-app/jenkins jenkins"
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
