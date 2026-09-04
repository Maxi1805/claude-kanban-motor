#!/usr/bin/env bash
# Semáforo compartido para corridas pesadas del analizador.
#
# POR QUÉ EXISTE. La regla del proyecto era "un análisis pesado por vez, mirá `free -m`
# antes". Pero cada agente la evalúa por su cuenta: tres agentes miran la memoria al mismo
# tiempo, los tres ven espacio libre, y los tres arrancan. La regla es por agente y la
# restricción es global. Un paralelo así llevó la memoria a 14,5 GB de 15,7 y systemd mató
# el servicio del usuario, y con él las sesiones de Claude abiertas.
#
# QUÉ HACE. Serializa de verdad: toma un lock exclusivo antes de correr, y espera si otro
# lo tiene. Además exige un piso de memoria disponible ANTES de arrancar, ya medido con el
# lock en la mano — así el número que se mira no puede quedar viejo entre la medición y el
# arranque.
#
# USO:
#   ./scripts/con-analisis.sh npx tsx scripts/dump-hallazgos.mts /ruta/al/repo salida.json
#   ./scripts/con-analisis.sh npx vitest run
#
# Variables:
#   CK_MIN_MB    piso de memoria disponible para arrancar (default 4000)
#   CK_ESPERA_S  cuánto esperar por el lock antes de rendirse (default 1800 = 30 min)

set -euo pipefail

MIN_MB="${CK_MIN_MB:-4000}"
ESPERA="${CK_ESPERA_S:-1800}"

# CUÁNTOS ANÁLISIS EN PARALELO. Antes era uno solo, y eso estranguló una ola entera: cinco
# agentes midiendo sobre 13 repos se hicieron cola detrás de un único permiso, y el frente
# más grande cerró SIN medir después de esperar 15 minutos. Un solo permiso protege la
# memoria y mata el rendimiento.
#
# Ahora los permisos escalan con la memoria libre: se reserva el piso y se reparte el resto.
#
# EL DIVISOR ESTÁ MEDIDO, NO ESTIMADO — y por eso bajó de 2500 a 1200 (Ola O). El 2500 salió
# de una estimación a ojo de "~1,5 GB por análisis" redondeada para arriba, y estranguló al
# integrador de la Ola O: con 8,4 GB disponibles daba `(8384-4000)/2500 = 1`, o sea UN cupo,
# y el integrador se hizo cola consigo mismo (la suite corriendo y el muestreo esperando
# 7 minutos). Misma falla que la Ola M, más suave.
#
# El número real: el pico de RSS medido por U1m/el integrador de la Ola N sobre `guava`
# —1.971 archivos, el peor repo del corpus— es **1.696 MB**, y ése es el PEOR caso; una
# corrida típica está bastante por debajo. 1200 reparte según el caso típico y deja que la
# segunda compuerta (el chequeo de memoria disponible ANTES de arrancar, más abajo) frene al
# que sobra cuando el caso real resulta ser el peor. Ésa es la red que de verdad protege la
# memoria: el conteo de cupos sólo reparte.
#
# Tope 4. Con 8,4 GB disponibles entran 3; con 5,2 GB entra 1, que es el comportamiento viejo
# justo cuando hace falta.
CUPOS="${CK_CUPOS:-}"
if [ -z "$CUPOS" ]; then
  disponible_ahora=$(free -m | awk '/^Mem:/{print $7}')
  CUPOS=$(( (disponible_ahora - MIN_MB) / 1200 ))
  [ "$CUPOS" -lt 1 ] && CUPOS=1
  [ "$CUPOS" -gt 4 ] && CUPOS=4
fi

LOCKDIR="${TMPDIR:-/tmp}/claude-kanban-analisis.d"
mkdir -p "$LOCKDIR"

if [ $# -eq 0 ]; then
  echo "uso: $0 <comando...>" >&2
  exit 64
fi

# Semáforo de N cupos: se intenta tomar cualquiera de los N locks. Si todos están ocupados
# se espera y se reintenta, en vez de hacer cola detrás de uno solo.
tomado=""
inicio=$(date +%s)
while :; do
  for i in $(seq 1 "$CUPOS"); do
    exec 9>"$LOCKDIR/cupo-$i"
    if flock -n 9; then tomado="$i"; break; fi
  done
  [ -n "$tomado" ] && break
  ahora=$(date +%s)
  if [ $((ahora - inicio)) -ge "$ESPERA" ]; then
    echo "con-analisis: los $CUPOS cupos llevan ${ESPERA}s ocupados. No arranco." >&2
    exit 75 # EX_TEMPFAIL
  fi
  sleep 5
done

# Con el lock tomado, esperar a que haya memoria. Se mide acá adentro a propósito: medir
# antes del lock deja el número viejo justo en la ventana que importa.
esperado=0
while :; do
  disponible=$(free -m | awk '/^Mem:/{print $7}')
  [ "$disponible" -ge "$MIN_MB" ] && break
  if [ "$esperado" -ge "$ESPERA" ]; then
    echo "con-analisis: ${disponible}MB disponibles tras ${esperado}s de espera, piso ${MIN_MB}MB. No arranco." >&2
    exit 75
  fi
  echo "con-analisis: ${disponible}MB disponibles (piso ${MIN_MB}MB), esperando…" >&2
  sleep 15
  esperado=$((esperado + 15))
done

echo "con-analisis: arranco (cupo $tomado/$CUPOS, ${disponible}MB libres) — $*" >&2
"$@"
