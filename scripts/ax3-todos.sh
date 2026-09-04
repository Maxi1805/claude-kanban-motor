#!/usr/bin/env bash
set -u
cd /home/maxi1805/claude-kanban
SALIDA="${1:-scratchpad-ax3/vol}"
mkdir -p "$SALIDA"
SCRIPT="${2:-scripts/ax3-censo.mts}"
REPOS=(
  "corpus/cobra cobra" "corpus/click click" "corpus/preact preact" "corpus/vueuse vueuse"
  "corpus/jekyll jekyll" "corpus/lodash lodash" "corpus/newtonsoft-json newtonsoft-json"
  "corpus/nest nest" "corpus/rubocop rubocop" "corpus/hugo hugo" "corpus/eslint eslint"
  "corpus/sqlalchemy sqlalchemy" "corpus/guava guava"
  "corpus-app/redmine redmine" "corpus-app/excalidraw excalidraw" "corpus-app/ShareX ShareX"
  "corpus-app/Ghost Ghost" "corpus-app/netbox netbox"
  "corpus-app/chatwoot chatwoot" "corpus-app/jenkins jenkins" "corpus-app/gitea gitea"
)
for entry in "${REPOS[@]}"; do
  set -- $entry
  dir="$1"; nombre="$2"
  if [ -s "$SALIDA/$nombre.json" ]; then echo "== $nombre ya esta" >&2; continue; fi
  echo "== $nombre" >&2
  CK_CUPOS="${CK_CUPOS:-2}" ./scripts/con-analisis.sh timeout 3000 npx tsx "$SCRIPT" "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -3
done
echo "== FIN" >&2
