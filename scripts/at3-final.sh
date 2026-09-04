#!/usr/bin/env bash
# OLA AT - AT3, PASADA FINAL. Vuelve a volcar TODO con el codigo definitivo, a `vol2/`.
#
# POR QUE EXISTE. `vol/` se lleno mientras las hipotesis todavia cambiaban: Node congela
# el grafo de modulos al arrancar, asi que cada volcado de `vol/` lleva la version del
# codigo que existia cuando ARRANCO ese proceso, y esa version no es la misma para todos.
# Mezclarlos en una tabla seria publicar un promedio de codigos distintos.
#
# `vol/` NO se borra: es la evidencia PRE-compuertas (el 0/2 de newtonsoft-json que enseño
# la compuerta de la vista no generica, y el 14-de-20 de nest que destapo el defecto del
# conteo ciego). `vol2/` es la medicion. Las dos se publican.
#
# Mismo esquema acotado que `at3-acotado.sh` y por las mismas razones (ver su docstring):
# lock de cupos intacto, techo DURO de heap, piso mas bajo SOLO porque el consumo esta
# acotado por construccion. Los repos grandes van en la segunda lista, con techo mas alto.
set -u
cd /home/maxi1805/claude-kanban
SALIDA=scratchpad-at3/vol2
mkdir -p "$SALIDA"

corre() { # $1 dir  $2 nombre  $3 techo-heap-MB  $4 piso-MB
  if [ -s "$SALIDA/$2.json" ]; then echo "== $2 ya esta" >&2; return; fi
  echo "== $2  (techo ${3}MB, piso ${4}MB, libre antes: $(free -m | awk '/^Mem:/{print $7}') MB)" >&2
  CK_MIN_MB="$4" CK_CUPOS=3 CK_ESPERA_S=9000 \
    ./scripts/con-analisis.sh env "NODE_OPTIONS=--max-old-space-size=$3" \
    timeout 2400 npx tsx scripts/at3-dump.mts "$1" "$2" "$SALIDA/$2.json" 2>&1 | tail -2
  echo "   libre despues: $(free -m | awk '/^Mem:/{print $7}') MB" >&2
}

# CHICOS — techo 1536. El pico medido del peor repo del corpus (guava, 1.971 archivos) es
# 1.696 MB; ninguno de estos se le acerca.
for e in "corpus/cobra cobra" "corpus/click click" "corpus/preact preact" "corpus/vueuse vueuse" \
         "corpus/jekyll jekyll" "corpus/lodash lodash" "corpus/newtonsoft-json newtonsoft-json" \
         "corpus/nest nest" "corpus/rubocop rubocop" "corpus-app/redmine redmine" \
         "corpus-app/excalidraw excalidraw" "corpus/eslint eslint" "corpus-app/ShareX ShareX" \
         "corpus/hugo hugo"; do
  set -- $e; corre "$1" "$2" 1536 2800
done

# GRANDES — techo 2816 (el pico medido de guava mas margen) y piso 3600, que deja mas de
# 780 MB en el peor caso posible. Van al final a proposito: si no alcanza el tiempo, lo que
# falta son los repos que MAS poblacion tienen, y eso se dice en el informe.
for e in "corpus-app/Ghost Ghost" "corpus/guava guava" "corpus/sqlalchemy sqlalchemy" \
         "corpus-app/netbox netbox" "corpus-app/jenkins jenkins" "corpus-app/chatwoot chatwoot" \
         "corpus-app/gitea gitea"; do
  set -- $e; corre "$1" "$2" 2816 3600
done
echo "== FIN FINAL" >&2
