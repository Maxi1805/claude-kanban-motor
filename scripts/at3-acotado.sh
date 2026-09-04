#!/usr/bin/env bash
# OLA AT - AT3. CORRIDA ACOTADA PARA LOS REPOS CHICOS, y por que existe.
#
# EL PROBLEMA. `con-analisis.sh` exige 4.000 MB disponibles antes de arrancar. Durante
# toda esta sesion la memoria disponible se quedo entre 2.400 y 3.900 MB, y NO por culpa
# de la ola: ~4,5 GB estan estacionados en un `playwright-mcp --headless` (1.916 MB, 20 h)
# y tres `nuxt dev` del proyecto Visability (1.375 + 796 + 460 MB, 15-19 h), todos de otras
# sesiones del usuario. Ese piso no se iba a despejar solo, y el frente se quedaba sin medir.
#
# QUE HACE ESTE SCRIPT, Y POR QUE NO ES "bajar la guarda". El peligro documentado en
# `con-analisis.sh` es el PARALELISMO ("dos analisis en paralelo llevaron la memoria a
# 14,5 GB de 15,7"). Ese peligro lo cierra el LOCK de cupos, que se sigue usando igual:
# esto pasa por `con-analisis.sh`, toma su cupo y se serializa como cualquier otra corrida.
#
# Lo que cambia es que el consumo propio queda ACOTADO POR CONSTRUCCION, no estimado a ojo:
# `--max-old-space-size=1536` es un techo duro del heap de Node. Con 3.000 MB disponibles y
# un techo de 1,5 GB, el peor caso deja mas de 1,4 GB libres. Por eso, y solo por eso, el
# piso baja a 2.800 MB: no porque yo haya mirado `free` y me haya parecido que alcanzaba
# —que es exactamente el razonamiento que el docstring de `con-analisis.sh` dice que mato
# el servicio— sino porque el consumo maximo posible esta acotado.
#
# SOLO REPOS CHICOS. El pico de RSS medido por la Ola N sobre `guava` (1.971 archivos, el
# peor del corpus) es 1.696 MB: un techo de 1.536 lo haria abortar. Los repos grandes
# (guava, jenkins, sqlalchemy, netbox, gitea, chatwoot, Ghost) NO estan en esta lista y
# siguen corriendo por `at3-prioridad.sh` con el piso de 4.000 y sin techo.
set -u
cd /home/maxi1805/claude-kanban
SALIDA="${1:-scratchpad-at3/vol}"
mkdir -p "$SALIDA"

REPOS=(
  "corpus/newtonsoft-json newtonsoft-json"
  "corpus/rubocop rubocop"
  "corpus/nest nest"
  "corpus-app/redmine redmine"
  "corpus/jekyll jekyll"
  "corpus/vueuse vueuse"
  "corpus/lodash lodash"
  "corpus-app/excalidraw excalidraw"
  "corpus/eslint eslint"
  "corpus-app/ShareX ShareX"
)

for entry in "${REPOS[@]}"; do
  set -- $entry
  dir="$1"; nombre="$2"
  if [ -s "$SALIDA/$nombre.json" ]; then echo "== $nombre ya esta" >&2; continue; fi
  echo "== $nombre  (libre antes: $(free -m | awk '/^Mem:/{print $7}') MB)" >&2
  CK_MIN_MB=2800 CK_CUPOS=3 CK_ESPERA_S=9000 \
    ./scripts/con-analisis.sh env NODE_OPTIONS=--max-old-space-size=1536 \
    timeout 1800 npx tsx scripts/at3-dump.mts "$dir" "$nombre" "$SALIDA/$nombre.json" 2>&1 | tail -3
  echo "   libre despues: $(free -m | awk '/^Mem:/{print $7}') MB" >&2
done
echo "== FIN ACOTADO" >&2
