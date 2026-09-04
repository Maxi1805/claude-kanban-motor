#!/usr/bin/env bash
# OLA AS - AS4, SEGUNDA PASADA. Los 14 repos que se midieron ANTES de que
# `src0/registry.ts` registrara las tres hipotesis (17:56): sus volcados no
# tenian ni una propuesta de este frente y estan en `vol-stale/`.
set -u
cd /home/maxi1805/claude-kanban
SALIDA=scratchpad-as4/vol
REPOS=(
  "corpus/cobra cobra" "corpus/click click" "corpus/preact preact"
  "corpus/vueuse vueuse" "corpus/jekyll jekyll" "corpus/lodash lodash"
  "corpus/newtonsoft-json newtonsoft-json" "corpus/nest nest"
  "corpus/rubocop rubocop" "corpus/hugo hugo" "corpus/eslint eslint"
  "corpus/sqlalchemy sqlalchemy" "corpus/guava guava" "corpus-app/gitea gitea"
)
for entry in "${REPOS[@]}"; do
  set -- $entry; dir="$1"; nombre="$2"
  [ -s "$SALIDA/$nombre.json" ] && { echo "== $nombre ya esta" >&2; continue; }
  echo "== $nombre" >&2
  CK_CUPOS="${CK_CUPOS:-2}" ./scripts/con-analisis.sh timeout 3000 npx tsx scripts/as4-dump.mts "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -2
done
echo "== FIN RESTO" >&2
