#!/usr/bin/env bash
# OLA X — FRENTE A2. Corre la sonda de embudos sobre varios repos DENTRO DE UN
# SOLO CUPO del semáforo: nueve frentes más están midiendo sobre el mismo árbol
# y volver a hacer cola por cada repo cuesta más que la corrida misma. Un cupo
# tomado de punta a punta = el mismo costo de memoria que un dump de guava, que
# es lo que el semáforo está dimensionado para tolerar.
#
# Reanudable: saltea lo que ya está medido.
#
# Uso: ./scripts/con-analisis.sh bash scripts/x-a2-correr.sh [repo...]
cd /home/maxi1805/claude-kanban || exit 1
mkdir -p /tmp/x-a2
REPOS=("$@")
[ ${#REPOS[@]} -eq 0 ] && REPOS=(click newtonsoft-json cobra rubocop nest eslint guava)
for r in "${REPOS[@]}"; do
  if [ -s "/tmp/x-a2/$r.json" ]; then echo "SKIP $r"; continue; fi
  echo "=== $r arranca $(date +%T)"
  npx tsx scripts/x-a2-embudo.mts "corpus/$r" "/tmp/x-a2/$r.json" 2>&1 | tail -32
  echo "=== $r listo $(date +%T)"
done
echo "A2-TODO-LISTO"
