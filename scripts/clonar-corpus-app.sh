#!/usr/bin/env bash
# Clona el CORPUS DE APLICACIÓN a SHA congelados — la población del NIVEL 2.
#
# POR QUÉ EXISTE, y por qué está separado de `clonar-corpus.sh`.
#
# Los 13 repos de `corpus/` son librerías, frameworks y herramientas: guava,
# hugo, eslint, preact, lodash, nest, sqlalchemy. Código escrito por equipos
# expertos que YA APLICAN patrones. Medido: el 23,6 % de las hipótesis del
# nivel 2 dice "ya está aplicado", y Prototype da 44 de 44 `ya-aplicado`.
#
# El objetivo del proyecto es **encontrar dónde FALTA un patrón**, y eso pasa
# en aplicaciones con años de crecimiento orgánico y muchos colaboradores, no
# en una librería madura. `PLAN-INTENCIONES.md` lo dejó anotado para Proxy:
# "por si una ola futura mide sobre una población de aplicación (no de
# librería) real".
#
# LA SEPARACIÓN, decidida el 13 de agosto de 2026:
#
#   NIVEL 1 (¿el detector identifica bien un smell?) → `corpus/`, los 13 de
#     siempre. Ahí viven los 779 veredictos juzgados a mano, los 40 kinds con
#     base, los 319 verdaderos de la compuerta de recall y el censo congelado
#     contra el que cada ola compara su "antes". NO se tocan: borrarlos
#     borraría seis olas de medición.
#
#   NIVEL 2 (¿dónde falta un patrón?) → `corpus-app/`, éstos. Se miden en cada
#     ola de patrones. El nivel 1 sólo se re-mide cuando una ola toca
#     `detect/` o `graph/`, así que una ola que sólo toca `hypotheses/` puede
#     correr únicamente sobre esta población y ahorrarse el grueso del costo.
#
# LOS TRES, y por qué cada uno: se eligieron para que la comparación sea del
# MISMO LENGUAJE contra una librería que ya está en `corpus/` — si no, la
# diferencia podría ser del lenguaje y no de librería-contra-aplicación.
#
#   jenkins  (java)  contra guava           — desde 2004, deuda de diseño conocida,
#                                             y java es el 91 % del volumen del corpus
#   redmine  (ruby)  contra rubocop/jekyll  — Rails desde 2006. Ruby es donde peor
#                                             andamos: Extract Method dio UNA
#                                             recomendación en 1.051 archivos
#   gitea    (go)    contra hugo/cobra      — aplicación de verdad, crecimiento
#                                             orgánico, tamaño manejable
#
# ---------------------------------------------------------------------------
# AMPLIACIÓN DEL FRENTE AE1 (16 de agosto de 2026) — CINCO aplicaciones más.
#
# POR QUÉ: de las 39 recomendaciones verdaderas que produjo AD4 (Ola AD), 26
# salieron del MISMO PAR DE ARCHIVOS de gitea. Con jenkins+redmine+gitea no se
# puede saber si el 89,7 % de precisión en aplicación (Facade·repeated-
# collaborator-set, INTEGRADOR de la Ola AD §1.2) es un hecho de la POBLACIÓN
# o un accidente de gitea. Y de los ocho lenguajes que el analizador mide
# (`LANGUAGES_MEASURED`, `detect/language-coverage.ts`), python, c# y vue
# tenían CERO población de aplicación, y typescript/javascript sólo la
# modesta que trae gitea (259 .ts) y jenkins/redmine (~130 .js cada uno) —
# verificado contando extensiones en disco antes de elegir, no supuesto.
#
# CRITERIOS, los mismos tres que ya regían para los tres originales:
#   (a) aplicación de verdad, no librería/framework — el punto entero de este
#       corpus es que las librerías maduras dan la conclusión equivocada
#       (INTEGRADOR de la Ola AD §1.1: intervalos DISJUNTOS entre las dos
#       poblaciones en `Facade · repeated-collaborator-set`).
#   (b) cubre un lenguaje que hoy tiene UNA aplicación o ninguna.
#   (c) tamaño manejable (referencia: guava, ~330-360s en frío) y licencia
#       abierta — verificado abriendo el archivo LICENSE de cada uno, no
#       asumido por el nombre del repo.
#
#   netbox     (python)          — Apache-2.0. Aplicación real de gestión de
#                                   infraestructura/IPAM (Django), en uso
#                                   productivo por operadores de red. 1.219
#                                   archivos .py. Contra sqlalchemy (librería).
#   excalidraw (typescript)      — MIT. Aplicación real de pizarra/dibujo
#                                   colaborativo (React+TS), no una librería
#                                   de componentes. 335 .ts + 303 .tsx. Suma
#                                   profundidad TS más allá de gitea.
#   ShareX     (csharp)          — GPL-3.0. Aplicación de escritorio real
#                                   (captura y anotación de pantalla), no un
#                                   framework. 1.213 archivos .cs. Contra
#                                   newtonsoft-json (librería).
#   chatwoot   (vue + ruby)      — MIT, con un directorio `enterprise/` bajo
#                                   licencia propia (declarado; el resto MIT).
#                                   Aplicación real de atención al cliente
#                                   (Rails + Vue), no vueuse (que es una
#                                   librería de composables). 1.152 .vue +
#                                   2.493 .rb: además profundiza ruby.
#   Ghost      (javascript)      — MIT. Plataforma real de publicación/blog
#                                   (Node.js), no un framework de UI. 2.917
#                                   .js: profundiza javascript puro más allá
#                                   de los ~130 archivos de jenkins/redmine.
#
# SHA fijados al HEAD del default branch el 16 de agosto de 2026
# (`git ls-remote <url> HEAD`), siguiendo la misma forma que los tres de
# arriba: la reproducibilidad importa más que estar al día.
#
# Uso: ./scripts/clonar-corpus-app.sh [destino]   (default: ./corpus-app)
# Después: CK_CORPUS_DIR sigue apuntando al PADRE de `corpus/`; para esta
# población se pasa la ruta directa al repo.

set -uo pipefail

DEST="${1:-/home/maxi1805/claude-kanban/corpus-app}"
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
    echo "   (fetch por SHA rechazado, bajando historia completa)"
    git -C "$dir" fetch -q origin || { echo "   FALLÓ $slug"; return 1; }
    git -C "$dir" checkout -q "$sha" || { echo "   FALLÓ checkout $slug"; return 1; }
  fi
  echo "   ok $(git -C "$dir" rev-parse --short HEAD) — $(find "$dir" -type f -not -path '*/.git/*' | wc -l) archivos"
}

repo jenkins    https://github.com/jenkinsci/jenkins.git       2e228ff40b14dbc8b14ffbc6edf0e4383cf744fc
repo redmine    https://github.com/redmine/redmine.git         2563fa6a55b11c7066216fd122ee18c3e29b3580
repo gitea      https://github.com/go-gitea/gitea.git          d2be79a942fb73b55b9be5e6f02965a8ca7681a3
repo netbox     https://github.com/netbox-community/netbox.git 93f16a536d00227a404bb1d785fe355639bb5172
repo excalidraw https://github.com/excalidraw/excalidraw.git   e160ff7ba0641fba729c528482de5277ffb19c58
repo ShareX     https://github.com/ShareX/ShareX.git           63f7ad267fc6a67c01f11b8932653f54c1324316
repo chatwoot   https://github.com/chatwoot/chatwoot.git       9a73c1473ffa0ae6a9c7725046b8ca17922dcc83
repo Ghost      https://github.com/TryGhost/Ghost.git          b45ecaaec43937a29a24fa64d052e945a203455e

echo
echo "Corpus de aplicación en $DEST"
du -sh "$DEST"/* 2>/dev/null
