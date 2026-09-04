#!/usr/bin/env bash
# Amplía el corpus para los lenguajes sub-representados.
#
# POR QUÉ. El corpus de 8 repos está desbalanceado: Java (1.971 archivos) y C# (941) son el
# 77 % del código analizado, mientras Go tiene 19, JS 20 y Python 30. Con esas muestras
# ninguna afirmación por lenguaje se sostiene, y "genérico" se mide flojo.
#
# NO se fijan SHA de antemano: se clona la rama por defecto, se anota el SHA que salga, y ése
# queda congelado a partir de acá. Lo importante es que sea reproducible desde el momento en
# que entra, no que coincida con una fecha.
#
# Estos repos NO entran solos al manifiesto: agregarlos cambia la línea base del censo y eso
# es trabajo aparte, con su re-congelada.
#
# Uso: ./scripts/clonar-corpus-extra.sh [destino]     (default: ./corpus)

set -uo pipefail

DEST="${1:-/home/maxi1805/claude-kanban/corpus}"
mkdir -p "$DEST"

repo() {
  local slug="$1" url="$2" lang="$3"
  local dir="$DEST/$slug"
  if [ -d "$dir/.git" ]; then
    echo "== $slug ya está ($(git -C "$dir" rev-parse --short HEAD))"
    return 0
  fi
  echo "== $slug ($lang)"
  if git clone -q --depth 1 "$url" "$dir" 2>/dev/null; then
    echo "   ok $(git -C "$dir" rev-parse HEAD) — $(find "$dir" -type f -not -path '*/.git/*' | wc -l) archivos"
  else
    echo "   FALLÓ $slug"
    rm -rf "$dir"
    return 1
  fi
}

repo hugo       https://github.com/gohugoio/hugo.git            Go
repo eslint     https://github.com/eslint/eslint.git            JavaScript
repo sqlalchemy https://github.com/sqlalchemy/sqlalchemy.git    Python
repo rubocop    https://github.com/rubocop/rubocop.git          Ruby
repo nest       https://github.com/nestjs/nest.git              TypeScript

echo
echo "=== corpus completo"
for d in "$DEST"/*/; do
  [ -d "$d/.git" ] || continue
  printf '%-18s %s  %6s archivos\n' "$(basename "$d")" \
    "$(git -C "$d" rev-parse --short HEAD)" \
    "$(find "$d" -type f -not -path '*/.git/*' | wc -l)"
done
echo
echo "SHA para congelar en el manifiesto:"
for d in "$DEST"/*/; do
  [ -d "$d/.git" ] || continue
  printf '  "%s": { "sha": "%s", "path": "corpus/%s" },\n' \
    "$(basename "$d")" "$(git -C "$d" rev-parse HEAD)" "$(basename "$d")"
done
