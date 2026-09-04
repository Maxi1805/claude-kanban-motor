#!/usr/bin/env bash
# Clona los 8 repos del corpus a los SHA congelados en tests/golden/manifest.json.
#
# El manifiesto fija SHA y ruta pero no la URL, así que las URLs canónicas van acá.
# Se baja SÓLO el commit fijado (fetch --depth 1 de ese SHA), no la historia.
#
# Uso: ./scripts/clonar-corpus.sh [destino]     (default: ./corpus)
# Después: export CK_CORPUS_DIR=<destino>

set -uo pipefail

DEST="${1:-/home/maxi1805/claude-kanban/corpus}"
mkdir -p "$DEST"

repo() {
  local slug="$1" url="$2" sha="$3"
  local dir="$DEST/$slug"
  if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$sha" ]; then
    echo "== $slug ya está en $sha"
    return 0
  fi
  echo "== $slug -> $sha"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$url"
  if git -C "$dir" fetch -q --depth 1 origin "$sha" 2>/dev/null; then
    git -C "$dir" checkout -q FETCH_HEAD
  else
    # Algunos servidores no permiten pedir un SHA suelto: historia completa y checkout.
    echo "   (fetch por SHA rechazado, bajando historia completa)"
    git -C "$dir" fetch -q origin || { echo "   FALLÓ $slug"; return 1; }
    git -C "$dir" checkout -q "$sha" || { echo "   FALLÓ checkout $slug"; return 1; }
  fi
  echo "   ok $(git -C "$dir" rev-parse --short HEAD) — $(find "$dir" -type f -not -path '*/.git/*' | wc -l) archivos"
}

repo click           https://github.com/pallets/click.git        00e592cea702e0b2caa0dee42489fdb1c22cd845
repo cobra           https://github.com/spf13/cobra.git          adbc8813901bba65827259daa8e22ff94ec1f30e
repo jekyll          https://github.com/jekyll/jekyll.git        7697d249793d6c48c66a7293310a718aec01f660
repo lodash          https://github.com/lodash/lodash.git        a666ba591064c8011988275790ad7d625279f09c
repo preact          https://github.com/preactjs/preact.git      6254ee1fe56f553705573500d97a825d4ac5abab
repo vueuse          https://github.com/vueuse/vueuse.git        c04c44a46630f78a880cdf8696dda49394d7d201
repo newtonsoft-json https://github.com/JamesNK/Newtonsoft.Json.git 4f73e74372445108d2c1bda37b36e6f5e43402e0
repo guava           https://github.com/google/guava.git         e87d019e47a29bf263a82fe81caede34e9728e15

echo
echo "=== resumen"
for d in "$DEST"/*/; do
  [ -d "$d/.git" ] || continue
  printf '%-18s %s  %6s archivos\n' "$(basename "$d")" \
    "$(git -C "$d" rev-parse --short HEAD)" \
    "$(find "$d" -type f -not -path '*/.git/*' | wc -l)"
done
echo
echo "Para usarlo:  export CK_CORPUS_DIR=$DEST"
