#!/usr/bin/env bash
# OLA AX - AX3 - sonda de poblacion de `Refused Bequest` sobre los 21 repos.
#
# NO usa `con-analisis.sh` a proposito, y el motivo esta MEDIDO: esta sonda no
# llama a `analyzeRepo` — solo parsea con las gramaticas y camina el arbol. Pico
# de RSS sobre `cobra`: 159 MB, 1 segundo. El semaforo existe para corridas del
# ANALIZADOR (pico medido 1.696 MB en guava) y hoy esta saturado por otros
# frentes; meter 160 MB en esa cola estrangula la medicion sin proteger nada.
# Igual se corre de a UNA por vez y con piso de memoria, abajo.
set -u
cd /home/maxi1805/claude-kanban
mkdir -p scratchpad-ax3/rb
for d in corpus/*/ corpus-app/*/; do
  n=$(basename "$d")
  [ -s "scratchpad-ax3/rb/$n.json" ] && { echo "== $n ya esta"; continue; }
  libre=$(free -m | awk '/^Mem:/{print $7}')
  if [ "$libre" -lt 2000 ]; then echo "== $n SALTEADO: solo ${libre}MB libres"; continue; fi
  echo "== $n (${libre}MB libres)"
  timeout 2400 npx tsx scripts/ax3-rb-sonda.mts "${d%/}" "$n" "scratchpad-ax3/rb/$n.json" 2>&1 | tail -3
done
echo "== FIN"
