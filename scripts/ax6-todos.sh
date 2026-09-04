#!/usr/bin/env bash
# OLA AX - FRENTE AX6. Barrido de los 21 repos con `ax6-dump.mts`.
# Uso: ./scripts/ax6-todos.sh <dir-salida> <AX6_SRC>
#   ./scripts/ax6-todos.sh scratchpad-ax6/base ../scratchpad-ax6/src0
#   ./scripts/ax6-todos.sh scratchpad-ax6/post ../src
set -u
cd /home/maxi1805/claude-kanban
SALIDA="${1:-scratchpad-ax6/base}"
export AX6_SRC="${2:-../scratchpad-ax6/src0}"
mkdir -p "$SALIDA"
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
  CK_CUPOS="${CK_CUPOS:-2}" ./scripts/con-analisis.sh timeout 3000 npx tsx scripts/ax6-dump.mts "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -3
done
echo "== FIN $SALIDA" >&2
